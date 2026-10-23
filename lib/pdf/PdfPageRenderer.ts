/**
 * PdfPageRenderer.ts
 * Renders real PDF pages onto HTML5 Canvas with High-DPI sharpness and cancellation support.
 */
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';

export interface RenderOptions {
  scale: number;
  canvas: HTMLCanvasElement;
  targetWidth?: number;
}

export class PdfPageRenderer {
  private activeRenderTask: RenderTask | null = null;
  private isCancelled: boolean = false;

  /**
   * Cancel currently running render task if any.
   */
  cancel(): void {
    this.isCancelled = true;
    if (this.activeRenderTask) {
      try {
        this.activeRenderTask.cancel();
      } catch {
        // Ignored
      }
      this.activeRenderTask = null;
    }
  }

  /**
   * Render real PDF page onto target canvas.
   */
  async renderPage(page: PDFPageProxy, options: RenderOptions): Promise<{ width: number; height: number }> {
    this.cancel();
    this.isCancelled = false;

    const { canvas, scale, targetWidth } = options;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }

    // Determine scale: fitted to target width if provided, otherwise explicit scale
    const unscaledViewport = page.getViewport({ scale: 1 });
    let finalScale = scale;
    if (targetWidth && targetWidth > 0) {
      finalScale = targetWidth / unscaledViewport.width;
    }

    // High-DPI resolution adjustment
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
    const viewport = page.getViewport({ scale: finalScale });

    // Logical dimensions for CSS
    const displayWidth = Math.floor(viewport.width);
    const displayHeight = Math.floor(viewport.height);

    // Bitmap buffer dimensions (scaled by DPR for crisp sharpness)
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    // Clear and prepare context
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Transform context for High-DPI
    const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;

    const renderContext: any = {
      canvasContext: ctx,
      viewport,
      transform,
    };

    try {
      this.activeRenderTask = page.render(renderContext);
      await this.activeRenderTask.promise;
      this.activeRenderTask = null;
      return { width: displayWidth, height: displayHeight };
    } catch (err: any) {
      this.activeRenderTask = null;
      if (err?.name === 'RenderingCancelledException' || this.isCancelled) {
        return { width: displayWidth, height: displayHeight };
      }
      throw err;
    }
  }
}
