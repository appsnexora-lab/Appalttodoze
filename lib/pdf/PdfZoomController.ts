/**
 * PdfZoomController.ts
 * Independent Zoom Controller for professional PDF interaction.
 */
export interface FocalPoint {
  x: number;
  y: number;
}

export interface PinchTransform {
  scaleFactor: number;
  originX: number;
  originY: number;
  deltaX: number;
  deltaY: number;
}

export interface ZoomState {
  scale: number;
  minScale: number;
  maxScale: number;
  isPinching: boolean;
  viewportWidth: number;
  viewportHeight: number;
  scrollLeft: number;
  scrollTop: number;
  currentPage: number;
}

export type ZoomChangeHandler = (newScale: number, focalPoint?: FocalPoint) => void;
export type PinchTransformHandler = (transform: PinchTransform | null) => void;

export class PdfZoomController {
  private scale: number = 1.0;
  private minScale: number = 0.6;
  private maxScale: number = 3.5;
  private viewportWidth: number = 600;
  private viewportHeight: number = 800;
  private scrollLeft: number = 0;
  private scrollTop: number = 0;
  private currentPage: number = 1;

  private onZoomChange?: ZoomChangeHandler;
  private onPinchTransform?: PinchTransformHandler;
  private isPinching: boolean = false;
  private initialTouchDistance: number = 0;
  private initialScaleOnTouch: number = 1.0;
  private initialFocalPoint: FocalPoint = { x: 300, y: 400 };
  private currentFocalPoint: FocalPoint = { x: 300, y: 400 };
  private lastComputedScale: number = 1.0;
  private lastTapTime: number = 0;
  private lastTapPos: { x: number; y: number } = { x: 0, y: 0 };

  constructor(
    initialScale: number = 1.0,
    onZoomChange?: ZoomChangeHandler,
    onPinchTransform?: PinchTransformHandler
  ) {
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, initialScale));
    this.onZoomChange = onZoomChange;
    this.onPinchTransform = onPinchTransform;
  }

  public getScale(): number {
    return this.scale;
  }

  public getMinScale(): number {
    return this.minScale;
  }

  public getMaxScale(): number {
    return this.maxScale;
  }

  public getIsPinching(): boolean {
    return this.isPinching;
  }

  public getState(): ZoomState {
    return {
      scale: this.scale,
      minScale: this.minScale,
      maxScale: this.maxScale,
      isPinching: this.isPinching,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      scrollLeft: this.scrollLeft,
      scrollTop: this.scrollTop,
      currentPage: this.currentPage,
    };
  }

  public setViewport(width: number, height: number): void {
    if (width > 0) this.viewportWidth = width;
    if (height > 0) this.viewportHeight = height;
  }

  public setScroll(top: number, left: number): void {
    this.scrollTop = top;
    this.scrollLeft = left;
  }

  public setCurrentPage(page: number): void {
    this.currentPage = page;
  }

  public setOnZoomChange(handler: ZoomChangeHandler): void {
    this.onZoomChange = handler;
  }

  public setOnPinchTransform(handler: PinchTransformHandler): void {
    this.onPinchTransform = handler;
  }

  public setInternalScale(newScale: number): void {
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, newScale));
  }

  public setScale(newScale: number, focalPoint?: FocalPoint): void {
    const clamped = Math.min(this.maxScale, Math.max(this.minScale, newScale));
    if (Math.abs(this.scale - clamped) > 0.005) {
      const fp = focalPoint || {
        x: this.viewportWidth / 2,
        y: this.viewportHeight / 2,
      };
      if (this.onZoomChange) {
        this.onZoomChange(clamped, fp);
      } else {
        this.scale = clamped;
      }
    }
  }

  public zoomIn(focalPoint?: FocalPoint): void {
    const next = Math.min(this.maxScale, Math.round((this.scale + 0.25) * 100) / 100);
    this.setScale(next, focalPoint);
  }

  public zoomOut(focalPoint?: FocalPoint): void {
    const next = Math.max(this.minScale, Math.round((this.scale - 0.25) * 100) / 100);
    this.setScale(next, focalPoint);
  }

  public resetZoom(focalPoint?: FocalPoint): void {
    this.setScale(1.0, focalPoint);
  }

  public handleTap(
    x: number,
    y: number,
    isTextSelected: boolean = false
  ): boolean {
    if (isTextSelected) return false;
    const now = Date.now();
    const dt = now - this.lastTapTime;
    const dist = Math.hypot(x - this.lastTapPos.x, y - this.lastTapPos.y);

    if (dt > 40 && dt < 320 && dist < 30) {
      this.lastTapTime = 0;
      const focalPoint: FocalPoint = { x, y };
      if (this.scale < 1.35) {
        this.setScale(1.85, focalPoint);
      } else {
        this.setScale(1.0, focalPoint);
      }
      return true;
    }
    this.lastTapTime = now;
    this.lastTapPos = { x, y };
    return false;
  }

  public handleTouchStart(
    touches: TouchList | React.TouchList | Touch[],
    containerRect: DOMRect
  ): boolean {
    if (touches.length === 2) {
      const t1 = touches[0];
      const t2 = touches[1];
      this.isPinching = true;
      this.initialTouchDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      this.initialScaleOnTouch = this.scale;
      this.lastComputedScale = this.scale;

      const midX = (t1.clientX + t2.clientX) / 2 - containerRect.left;
      const midY = (t1.clientY + t2.clientY) / 2 - containerRect.top;
      this.initialFocalPoint = {
        x: Math.max(0, Math.min(containerRect.width, midX)),
        y: Math.max(0, Math.min(containerRect.height, midY)),
      };
      this.currentFocalPoint = { ...this.initialFocalPoint };
      return true;
    } else if (touches.length === 1) {
      const t = touches[0];
      const x = t.clientX - containerRect.left;
      const y = t.clientY - containerRect.top;
      this.handleTap(x, y);
    }
    return false;
  }

  public handleTouchMove(
    touches: TouchList | React.TouchList | Touch[],
    containerRect: DOMRect
  ): boolean {
    if (this.isPinching && touches.length === 2 && this.initialTouchDistance > 5) {
      const t1 = touches[0];
      const t2 = touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = currentDist / this.initialTouchDistance;
      const targetScale = Math.min(
        this.maxScale,
        Math.max(this.minScale, this.initialScaleOnTouch * ratio)
      );
      this.lastComputedScale = targetScale;

      const midX = (t1.clientX + t2.clientX) / 2 - containerRect.left;
      const midY = (t1.clientY + t2.clientY) / 2 - containerRect.top;
      this.currentFocalPoint = { x: midX, y: midY };

      const scaleFactor = targetScale / this.initialScaleOnTouch;
      const deltaX = midX - this.initialFocalPoint.x;
      const deltaY = midY - this.initialFocalPoint.y;

      if (this.onPinchTransform) {
        this.onPinchTransform({
          scaleFactor,
          originX: this.initialFocalPoint.x,
          originY: this.initialFocalPoint.y,
          deltaX,
          deltaY,
        });
      }
      return true;
    }
    return false;
  }

  public handleTouchEnd(): boolean {
    if (this.isPinching) {
      this.isPinching = false;
      this.initialTouchDistance = 0;
      if (this.onPinchTransform) {
        this.onPinchTransform(null);
      }
      const finalScale = this.lastComputedScale;
      if (Math.abs(finalScale - this.scale) > 0.01) {
        this.setScale(finalScale, this.initialFocalPoint);
      }
      return true;
    }
    return false;
  }

  public handleWheel(
    e: WheelEvent | React.WheelEvent,
    containerRect: DOMRect
  ): boolean {
    if (e.ctrlKey) {
      const delta = -e.deltaY * 0.008;
      const targetScale = Math.min(
        this.maxScale,
        Math.max(this.minScale, this.scale + delta)
      );
      const focalPoint: FocalPoint = {
        x: Math.max(0, Math.min(containerRect.width, e.clientX - containerRect.left)),
        y: Math.max(0, Math.min(containerRect.height, e.clientY - containerRect.top)),
      };
      this.setScale(targetScale, focalPoint);
      return true;
    }
    return false;
  }
}
