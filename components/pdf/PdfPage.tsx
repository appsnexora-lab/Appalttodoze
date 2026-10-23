'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import { PdfDocumentModel } from '@/lib/pdf/PdfDocument';
import { PdfPageRenderer } from '@/lib/pdf/PdfPageRenderer';
import { PdfTextLayer } from './PdfTextLayer';
import { PdfAnnotationLayer } from './PdfAnnotationLayer';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface PdfPageProps {
  pageNumber: number;
  docModel: PdfDocumentModel;
  scale: number;
  targetWidth: number;
  topOffset: number;
  height: number;
  isBookmarked?: boolean;
  onToggleBookmark?: (pageNumber: number) => void;
}

export const PdfPage: React.FC<PdfPageProps> = React.memo(({
  pageNumber,
  docModel,
  scale,
  targetWidth,
  topOffset,
  height,
  isBookmarked,
  onToggleBookmark,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<PdfPageRenderer | null>(null);
  const [pageProxy, setPageProxy] = useState<PDFPageProxy | null>(null);
  const [isRendered, setIsRendered] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const renderer = new PdfPageRenderer();
    rendererRef.current = renderer;

    async function loadAndRender() {
      try {
        setRenderError(null);
        const page = await docModel.getPage(pageNumber);
        if (isCancelled) return;
        setPageProxy(page);

        if (canvasRef.current) {
          await renderer.renderPage(page, {
            canvas: canvasRef.current,
            scale,
            targetWidth,
          });
          if (!isCancelled) {
            setIsRendered(true);
          }
        }
      } catch (err: any) {
        if (!isCancelled && err?.name !== 'RenderingCancelledException') {
          console.error(`Error rendering PDF page ${pageNumber}:`, err);
          setRenderError('Erro ao renderizar esta página.');
        }
      }
    }

    loadAndRender();

    return () => {
      isCancelled = true;
      renderer.cancel();
    };
  }, [docModel, pageNumber, scale, targetWidth]);

  return (
    <div
      id={`pdf-page-${pageNumber}`}
      className="group absolute left-1/2 -translate-x-1/2 flex flex-col items-center select-none"
      style={{
        top: `${topOffset}px`,
        width: `${targetWidth}px`,
        height: `${height}px`,
      }}
    >
      <div
        className="relative bg-white overflow-hidden flex items-center justify-center"
        style={{
          width: `${targetWidth}px`,
          height: `${height}px`,
        }}
      >
        {!isRendered && !renderError && (
          <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-slate-400 gap-2 z-0">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
            <span className="text-xs font-mono">Página {pageNumber}</span>
          </div>
        )}
        {renderError && (
          <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-rose-400 gap-2 p-4 text-center">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
            <p className="text-xs font-medium">{renderError}</p>
            <span className="text-[10px] text-slate-500">Página {pageNumber}</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%' }}
          className={`block w-full h-full object-contain ${
            isRendered ? 'opacity-100' : 'opacity-0'
          } transition-opacity duration-150`}
        />
        {isRendered && (
          <PdfTextLayer
            page={pageProxy}
            scale={scale}
            width={targetWidth}
            height={height}
          />
        )}
        <PdfAnnotationLayer
          pageNumber={pageNumber}
          isBookmarked={isBookmarked}
          onToggleBookmark={onToggleBookmark}
        />
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] font-mono text-white/80 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {pageNumber}
        </div>
      </div>
    </div>
  );
});

PdfPage.displayName = 'PdfPage';
