/**
 * PdfVirtualizer.ts
 * High-performance virtualization engine for large PDF documents.
 * Pre-calculates exact cumulative offsets to guarantee zero layout shifts (CLS) and smooth 60fps scrolling.
 * Provides mathematical focal-point translation for zoom without loss of reading position.
 */
import { PageDimension } from './PdfDocument';

export interface VirtualPageLayout {
  pageNumber: number;
  top: number;
  height: number;
  width: number;
  isRendered: boolean;
}

export type FitMode = 'fit-snug' | 'fit-width' | 'fit-comfortable';

export interface VirtualizerOptions {
  totalPages: number;
  containerWidth: number;
  scale?: number;
  fitMode?: FitMode;
  pageGap?: number;
  getPageDimension: (pageNumber: number) => PageDimension;
  bufferPages?: number;
}

export class PdfVirtualizer {
  private totalPages: number = 0;
  private containerWidth: number = 600;
  private scale: number = 1.0;
  private fitMode: FitMode = 'fit-snug';
  private pageGap: number = 0; // Default 0: Continuous seamless scroll without page dividers
  private bufferPages: number = 2; // Buffer above and below viewport
  private getPageDimension: (pageNumber: number) => PageDimension;

  // Cached positions
  private pageOffsets: number[] = [];
  private pageHeights: number[] = [];
  private totalHeight: number = 0;
  private effectivePageWidth: number = 600;

  constructor(options: VirtualizerOptions) {
    this.totalPages = options.totalPages;
    this.containerWidth = Math.max(260, options.containerWidth || 600);
    this.scale = options.scale || 1.0;
    this.fitMode = options.fitMode || 'fit-snug';
    this.pageGap = options.pageGap ?? 0;
    this.bufferPages = options.bufferPages ?? 2;
    this.getPageDimension = options.getPageDimension;
    this.recomputeOffsets();
  }

  public updateConfig(containerWidth: number, scale: number, fitMode?: FitMode): void {
    const validWidth = Math.max(260, containerWidth);
    const newFitMode = fitMode || this.fitMode;
    if (
      this.containerWidth === validWidth &&
      Math.abs(this.scale - scale) < 0.001 &&
      this.fitMode === newFitMode
    ) {
      return;
    }
    this.containerWidth = validWidth;
    this.scale = scale;
    this.fitMode = newFitMode;
    this.recomputeOffsets();
  }

  public setFitMode(mode: FitMode): void {
    if (this.fitMode === mode) return;
    this.fitMode = mode;
    this.recomputeOffsets();
  }

  public getFitMode(): FitMode {
    return this.fitMode;
  }

  public setTotalPages(pages: number): void {
    if (this.totalPages === pages) return;
    this.totalPages = pages;
    this.recomputeOffsets();
  }

  private recomputeOffsets(): void {
    if (this.totalPages <= 0) {
      this.pageOffsets = [];
      this.pageHeights = [];
      this.totalHeight = 0;
      return;
    }

    let baseWidth = this.containerWidth;
    if (this.fitMode === 'fit-snug') {
      baseWidth = Math.round(this.containerWidth * 1.18);
    } else if (this.fitMode === 'fit-comfortable') {
      const margin = Math.min(32, Math.max(8, Math.round(this.containerWidth * 0.05)));
      baseWidth = Math.max(260, this.containerWidth - margin * 2);
    } else {
      baseWidth = this.containerWidth;
    }

    this.effectivePageWidth = Math.round(baseWidth * this.scale);
    this.pageOffsets = new Array(this.totalPages + 2).fill(0);
    this.pageHeights = new Array(this.totalPages + 2).fill(0);

    let currentTop = 0;
    for (let page = 1; page <= this.totalPages; page++) {
      const dim = this.getPageDimension(page);
      const ratio = dim.aspectRatio || 0.707;
      const h = Math.round(this.effectivePageWidth / ratio);
      this.pageOffsets[page] = currentTop;
      this.pageHeights[page] = h;
      currentTop += h + this.pageGap;
    }
    this.totalHeight = currentTop;
  }

  public getTotalHeight(): number {
    return this.totalHeight;
  }

  public getPageWidth(): number {
    return this.effectivePageWidth;
  }

  public getStageWidth(): number {
    return Math.max(this.containerWidth, this.effectivePageWidth);
  }

  public getPageLayout(pageNumber: number): { top: number; height: number; width: number } {
    return {
      top: this.pageOffsets[pageNumber] || 0,
      height: this.pageHeights[pageNumber] || 800,
      width: this.effectivePageWidth,
    };
  }

  public getPageAndRatioAtOffset(offsetY: number): { page: number; ratioInsidePage: number } {
    if (this.totalPages <= 0) {
      return { page: 1, ratioInsidePage: 0 };
    }
    if (offsetY <= this.pageOffsets[1]) {
      return { page: 1, ratioInsidePage: 0 };
    }
    const lastPageTop = this.pageOffsets[this.totalPages];
    const lastPageHeight = this.pageHeights[this.totalPages];
    if (offsetY >= lastPageTop + lastPageHeight) {
      return { page: this.totalPages, ratioInsidePage: 1 };
    }

    let low = 1;
    let high = this.totalPages;
    let foundPage = 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const top = this.pageOffsets[mid];
      const bottom = top + this.pageHeights[mid] + this.pageGap;
      if (offsetY >= top && offsetY <= bottom) {
        foundPage = mid;
        break;
      } else if (offsetY < top) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const pageTop = this.pageOffsets[foundPage];
    const pageHeight = Math.max(1, this.pageHeights[foundPage]);
    const ratioInsidePage = Math.max(0, Math.min(1, (offsetY - pageTop) / pageHeight));
    return { page: foundPage, ratioInsidePage };
  }

  public calculateScrollForScaleChange(
    newScale: number,
    focalPoint: { x: number; y: number },
    currentScrollTop: number,
    currentScrollLeft: number,
    containerWidth: number,
    _containerHeight: number
  ): { newScrollTop: number; newScrollLeft: number } {
    if (this.totalPages <= 0) {
      return { newScrollTop: 0, newScrollLeft: 0 };
    }

    const currentDocY = currentScrollTop + focalPoint.y;
    const { page, ratioInsidePage } = this.getPageAndRatioAtOffset(currentDocY);

    const oldPageWidth = this.effectivePageWidth;
    let oldPageLeft: number;
    if (oldPageWidth <= containerWidth) {
      oldPageLeft = (containerWidth - oldPageWidth) / 2;
    } else {
      oldPageLeft = 16;
    }

    const currentDocX = currentScrollLeft + focalPoint.x;
    const xInsidePage = currentDocX - oldPageLeft;
    const ratioX = oldPageWidth > 0 ? Math.max(0, Math.min(1, xInsidePage / oldPageWidth)) : 0.5;

    const maxWidth = Math.max(280, containerWidth - 32);
    const newPageWidth = Math.round(maxWidth * newScale);
    const newStageWidth = Math.max(containerWidth, newPageWidth + 32);

    let newTop = 16;
    for (let p = 1; p < page; p++) {
      const dim = this.getPageDimension(p);
      const ratio = dim.aspectRatio || 0.707;
      const h = Math.round(newPageWidth / ratio);
      newTop += h + this.pageGap;
    }

    const anchorDim = this.getPageDimension(page);
    const anchorRatio = anchorDim.aspectRatio || 0.707;
    const newPageHeight = Math.round(newPageWidth / anchorRatio);

    const newDocY = newTop + ratioInsidePage * newPageHeight;
    const targetScrollTop = Math.max(0, newDocY - focalPoint.y);

    let targetScrollLeft = 0;
    if (newPageWidth > containerWidth) {
      const newPageLeft = 16;
      const targetDocX = newPageLeft + ratioX * newPageWidth;
      const wantedScrollLeft = targetDocX - focalPoint.x;
      const maxScrollLeft = Math.max(0, newStageWidth - containerWidth);
      targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, wantedScrollLeft));
    }

    return {
      newScrollTop: targetScrollTop,
      newScrollLeft: targetScrollLeft,
    };
  }

  public getVisiblePages(scrollTop: number, viewportHeight: number): {
    visiblePages: number[];
    primaryPage: number;
  } {
    if (this.totalPages <= 0) {
      return { visiblePages: [], primaryPage: 1 };
    }

    const scrollBottom = scrollTop + viewportHeight;
    let low = 1;
    let high = this.totalPages;
    let firstVisible = 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const top = this.pageOffsets[mid];
      const bottom = top + this.pageHeights[mid];
      if (bottom >= scrollTop) {
        firstVisible = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const activePages: number[] = [];
    let primaryPage = firstVisible;
    let maxIntersection = 0;

    for (let page = firstVisible; page <= this.totalPages; page++) {
      const top = this.pageOffsets[page];
      const bottom = top + this.pageHeights[page];
      if (top > scrollBottom) {
        break;
      }
      activePages.push(page);
      const visibleTop = Math.max(top, scrollTop);
      const visibleBottom = Math.min(bottom, scrollBottom);
      const intersection = Math.max(0, visibleBottom - visibleTop);
      if (intersection > maxIntersection) {
        maxIntersection = intersection;
        primaryPage = page;
      }
    }

    if (activePages.length === 0) {
      activePages.push(Math.min(firstVisible, this.totalPages));
    }

    const startWithBuffer = Math.max(1, activePages[0] - this.bufferPages);
    const endWithBuffer = Math.min(
      this.totalPages,
      activePages[activePages.length - 1] + this.bufferPages
    );

    const bufferedPages: number[] = [];
    for (let p = startWithBuffer; p <= endWithBuffer; p++) {
      bufferedPages.push(p);
    }

    return {
      visiblePages: bufferedPages,
      primaryPage,
    };
  }

  public getScrollTopForPage(pageNumber: number): number {
    const page = Math.max(1, Math.min(this.totalPages, pageNumber));
    return Math.max(0, (this.pageOffsets[page] || 0) - 16);
  }
}
