/**
 * ReadingEngine.ts
 * Central controller coordinating PDF document state, virtualization, scale/zoom,
 * physical interaction, focal point preservation, and persistence.
 */
import { PdfDocumentModel, PdfMetadata } from './PdfDocument';
import { PdfVirtualizer, FitMode } from './PdfVirtualizer';
import { PdfZoomController, FocalPoint } from './PdfZoomController';
import { PdfScrollController } from './PdfScrollController';
import { PdfSearchEngine } from './PdfSearchEngine';
import { saveReadingProgress, getReadingProgress } from '@/lib/readerService';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface VisiblePageLayout {
  pageNumber: number;
  top: number;
  height: number;
  width: number;
}

export interface ReadingEngineState {
  status: EngineStatus;
  errorMessage?: string;
  metadata: PdfMetadata | null;
  currentPage: number;
  totalPages: number;
  scale: number;
  fitMode: FitMode;
  progressPercent: number;
  visiblePageLayouts: VisiblePageLayout[];
  totalVirtualHeight: number;
  effectivePageWidth: number;
  stageWidth: number;
  docModel: PdfDocumentModel | null;
}

export class ReadingEngine {
  private bookId: string;
  public docModel: PdfDocumentModel;
  public virtualizer: PdfVirtualizer | null = null;
  public zoomController: PdfZoomController;
  public scrollController: PdfScrollController;
  public searchEngine: PdfSearchEngine;

  private containerElement: HTMLElement | null = null;
  private containerWidth: number = 600;
  private containerHeight: number = 800;
  private currentPage: number = 1;
  private fitMode: FitMode = 'fit-snug';
  private status: EngineStatus = 'idle';
  private errorMessage?: string;
  private listeners: Set<(state: ReadingEngineState) => void> = new Set();
  private saveDebounceTimer?: NodeJS.Timeout;

  constructor(bookId: string) {
    this.bookId = bookId;
    this.docModel = new PdfDocumentModel();
    this.zoomController = new PdfZoomController(1.0, (newScale, focalPoint) => {
      this.applyScale(newScale, focalPoint);
    });
    this.scrollController = new PdfScrollController();
    this.searchEngine = new PdfSearchEngine(this.docModel);
  }

  public setContainerElement(el: HTMLElement | null): void {
    this.containerElement = el;
    if (el) {
      this.containerWidth = Math.max(280, el.clientWidth);
      this.containerHeight = Math.max(200, el.clientHeight);
      this.zoomController.setViewport(this.containerWidth, this.containerHeight);
      this.zoomController.setScroll(el.scrollTop, el.scrollLeft);
    }
  }

  public subscribe(listener: (state: ReadingEngineState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const s = this.getState();
    for (const l of this.listeners) {
      l(s);
    }
  }

  public getState(): ReadingEngineState {
    const currentScrollTop = this.containerElement ? this.containerElement.scrollTop : 0;
    const currentViewportHeight = this.containerHeight > 0 ? this.containerHeight : 800;
    const pageInfo = this.virtualizer
      ? this.virtualizer.getVisiblePages(currentScrollTop, currentViewportHeight)
      : { visiblePages: [1], primaryPage: 1 };

    const visiblePageLayouts: VisiblePageLayout[] = this.virtualizer
      ? pageInfo.visiblePages.map((page) => {
          const layout = this.virtualizer!.getPageLayout(page);
          return {
            pageNumber: page,
            top: layout.top,
            height: layout.height,
            width: layout.width,
          };
        })
      : [];

    return {
      status: this.status,
      errorMessage: this.errorMessage,
      metadata: this.docModel.metadata,
      currentPage: this.currentPage,
      totalPages: this.docModel.totalPages,
      scale: this.zoomController.getScale(),
      fitMode: this.fitMode,
      progressPercent:
        this.docModel.totalPages > 0
          ? Math.round((this.currentPage / this.docModel.totalPages) * 100)
          : 0,
      visiblePageLayouts,
      totalVirtualHeight: this.virtualizer ? this.virtualizer.getTotalHeight() : 0,
      effectivePageWidth: this.virtualizer ? this.virtualizer.getPageWidth() : 600,
      stageWidth: this.virtualizer ? this.virtualizer.getStageWidth() : 600,
      docModel: this.docModel.isLoaded ? this.docModel : null,
    };
  }

  public setFitMode(mode: FitMode): void {
    if (this.fitMode === mode) return;
    this.fitMode = mode;
    if (this.virtualizer) {
      this.virtualizer.setFitMode(mode);
      if (this.containerElement && this.virtualizer.getPageWidth() <= this.containerWidth) {
        this.containerElement.scrollLeft = 0;
      }
      this.notify();
    }
  }

  public toggleFitMode(): FitMode {
    let nextMode: FitMode;
    if (this.fitMode === 'fit-snug') {
      nextMode = 'fit-width';
    } else if (this.fitMode === 'fit-width') {
      nextMode = 'fit-comfortable';
    } else {
      nextMode = 'fit-snug';
    }
    this.setFitMode(nextMode);
    return nextMode;
  }

  public getFitMode(): FitMode {
    return this.fitMode;
  }

  async loadDocument(
    data: ArrayBuffer,
    initialWidth: number = 600,
    initialHeight: number = 800
  ): Promise<void> {
    this.status = 'loading';
    this.errorMessage = undefined;
    this.containerWidth = Math.max(260, initialWidth);
    this.containerHeight = Math.max(200, initialHeight);
    this.zoomController.setViewport(this.containerWidth, this.containerHeight);
    this.notify();

    try {
      const meta = await this.docModel.load(data.slice(0));
      this.virtualizer = new PdfVirtualizer({
        totalPages: meta.totalPages,
        containerWidth: this.containerWidth,
        scale: this.zoomController.getScale(),
        fitMode: this.fitMode,
        pageGap: 0,
        getPageDimension: (page) => this.docModel.getPageDimension(page),
      });

      this.status = 'ready';

      try {
        const savedProgress = await getReadingProgress(this.bookId);
        if (savedProgress && savedProgress.currentPage) {
          this.currentPage = Math.min(meta.totalPages, Math.max(1, savedProgress.currentPage));
          if (this.currentPage > 1) {
            setTimeout(() => {
              this.jumpToPage(this.currentPage, 'auto');
            }, 60);
          }
        }
      } catch (err) {
        console.warn('Could not restore saved progress:', err);
      }

      this.notify();
    } catch (err: any) {
      this.status = 'error';
      if (err.message === 'PDF_PASSWORD_REQUIRED') {
        this.errorMessage = 'Este documento PDF é protegido por senha.';
      } else if (err.message === 'PDF_CORRUPTED') {
        this.errorMessage = 'O arquivo PDF está corrompido ou em formato inválido.';
      } else if (err.message === 'PDF_BUFFER_DETACHED' || err.message === 'PDF_DATA_EMPTY') {
        this.errorMessage =
          'Os dados do arquivo PDF estão incompletos ou foram liberados da memória. Por favor, importe o arquivo novamente na Biblioteca.';
      } else {
        this.errorMessage = err?.message || 'Falha ao processar o arquivo PDF.';
      }
      this.notify();
      throw err;
    }
  }

  public applyScale(newScale: number, focalPoint?: FocalPoint): void {
    if (!this.virtualizer || this.status !== 'ready') return;

    const clampedScale = Math.min(
      this.zoomController.getMaxScale(),
      Math.max(this.zoomController.getMinScale(), newScale)
    );

    const fp: FocalPoint = focalPoint || {
      x: this.containerWidth / 2,
      y: this.containerHeight / 2,
    };

    const currentScrollTop = this.containerElement ? this.containerElement.scrollTop : 0;
    const currentScrollLeft = this.containerElement ? this.containerElement.scrollLeft : 0;

    const { newScrollTop, newScrollLeft } = this.virtualizer.calculateScrollForScaleChange(
      clampedScale,
      fp,
      currentScrollTop,
      currentScrollLeft,
      this.containerWidth,
      this.containerHeight
    );

    this.virtualizer.updateConfig(this.containerWidth, clampedScale);
    this.zoomController.setInternalScale(clampedScale);

    if (this.containerElement) {
      this.containerElement.scrollTop = newScrollTop;
      this.containerElement.scrollLeft = newScrollLeft;
    }
    this.zoomController.setScroll(newScrollTop, newScrollLeft);
    this.notify();
  }

  handleResize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    if (width === this.containerWidth && height === this.containerHeight) return;

    const currentScrollTop = this.containerElement ? this.containerElement.scrollTop : 0;
    let ratioInsidePage = 0;
    if (this.virtualizer) {
      const pageLayout = this.virtualizer.getPageLayout(this.currentPage);
      if (pageLayout && pageLayout.height > 0) {
        ratioInsidePage = Math.max(
          0,
          Math.min(1, (currentScrollTop - pageLayout.top) / pageLayout.height)
        );
      }
    }

    this.containerWidth = Math.max(260, width);
    this.containerHeight = Math.max(200, height);
    this.zoomController.setViewport(this.containerWidth, this.containerHeight);

    if (this.virtualizer) {
      this.virtualizer.updateConfig(this.containerWidth, this.zoomController.getScale(), this.fitMode);
      const newPageLayout = this.virtualizer.getPageLayout(this.currentPage);
      const targetScrollTop = Math.max(0, newPageLayout.top + ratioInsidePage * newPageLayout.height);

      if (this.containerElement) {
        this.containerElement.scrollTop = targetScrollTop;
        if (this.virtualizer.getPageWidth() <= this.containerWidth) {
          this.containerElement.scrollLeft = 0;
        }
      }
      this.notify();
    }
  }

  handleScroll(
    scrollTop: number,
    scrollLeft: number,
    _scrollHeight: number,
    _scrollWidth: number,
    clientHeight: number,
    _clientWidth: number
  ): void {
    if (!this.virtualizer || this.status !== 'ready') return;

    this.zoomController.setScroll(scrollTop, scrollLeft);
    const { primaryPage } = this.virtualizer.getVisiblePages(scrollTop, clientHeight);

    if (primaryPage !== this.currentPage) {
      this.currentPage = primaryPage;
      this.zoomController.setCurrentPage(primaryPage);
      this.notify();

      if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = setTimeout(() => {
        this.persistProgress();
      }, 500);
    } else {
      this.notify();
    }
  }

  async persistProgress(): Promise<void> {
    if (this.docModel.totalPages <= 0) return;
    try {
      const percentage = Math.round((this.currentPage / this.docModel.totalPages) * 100);
      const scrollOffset = this.virtualizer
        ? this.virtualizer.getScrollTopForPage(this.currentPage)
        : 0;

      await saveReadingProgress(
        this.bookId,
        'book',
        this.currentPage,
        percentage,
        scrollOffset,
        this.zoomController.getScale(),
        this.currentPage
      );
    } catch (err) {
      console.warn('Error saving progress:', err);
    }
  }

  jumpToPage(pageNumber: number, behavior: ScrollBehavior = 'smooth'): void {
    if (!this.virtualizer) return;
    const targetScroll = this.virtualizer.getScrollTopForPage(pageNumber);
    if (this.containerElement) {
      this.containerElement.scrollTo({
        top: targetScroll,
        left: 0,
        behavior,
      });
    }
    this.currentPage = pageNumber;
    this.zoomController.setCurrentPage(pageNumber);
    this.notify();
  }

  destroy(): void {
    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
    this.searchEngine.cancelSearch();
    this.docModel.cleanup();
    this.listeners.clear();
    this.containerElement = null;
  }
}
