/**
 * PdfScrollController.ts
 * Manages scroll listeners, debounced progress tracking, 2D coordinates (top & left),
 * and jump-to-page navigation with zero flicker.
 */
export class PdfScrollController {
  private container: HTMLElement | null = null;
  private onScrollCallback?: (
    scrollTop: number,
    scrollLeft: number,
    scrollHeight: number,
    scrollWidth: number,
    clientHeight: number,
    clientWidth: number
  ) => void;
  private isProgrammaticScroll: boolean = false;

  attach(
    container: HTMLElement,
    onScroll: (
      scrollTop: number,
      scrollLeft: number,
      scrollHeight: number,
      scrollWidth: number,
      clientHeight: number,
      clientWidth: number
    ) => void
  ): () => void {
    this.container = container;
    this.onScrollCallback = onScroll;

    const handleScroll = () => {
      if (!this.container || !this.onScrollCallback) return;
      const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } =
        this.container;
      this.onScrollCallback(scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      this.container = null;
    };
  }

  getContainer(): HTMLElement | null {
    return this.container;
  }

  getScroll(): { top: number; left: number } {
    return {
      top: this.container ? this.container.scrollTop : 0,
      left: this.container ? this.container.scrollLeft : 0,
    };
  }

  scrollToCoordinates(top: number, left: number, behavior: ScrollBehavior = 'auto'): void {
    if (!this.container) return;
    this.isProgrammaticScroll = true;
    this.container.scrollTo({ top, left, behavior });
    setTimeout(() => {
      this.isProgrammaticScroll = false;
    }, 100);
  }

  scrollToPosition(top: number, behavior: ScrollBehavior = 'auto'): void {
    if (!this.container) return;
    this.isProgrammaticScroll = true;
    this.container.scrollTo({ top, behavior });
    setTimeout(() => {
      this.isProgrammaticScroll = false;
    }, 100);
  }

  scrollToRatio(ratio: number): void {
    if (!this.container) return;
    const maxScroll = this.container.scrollHeight - this.container.clientHeight;
    if (maxScroll > 0) {
      this.scrollToPosition(maxScroll * Math.min(1, Math.max(0, ratio)));
    }
  }

  getScrollRatio(): number {
    if (!this.container) return 0;
    const maxScroll = this.container.scrollHeight - this.container.clientHeight;
    return maxScroll > 0 ? this.container.scrollTop / maxScroll : 0;
  }

  isProgrammatic(): boolean {
    return this.isProgrammaticScroll;
  }
}
