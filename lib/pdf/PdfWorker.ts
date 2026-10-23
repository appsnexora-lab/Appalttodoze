/**
 * PdfWorker.ts
 * Manages the PDF.js library instance and sets up the Web Worker for background processing.
 */
import * as pdfjsLib from 'pdfjs-dist';

let isWorkerInitialized = false;

export function initPdfWorker(): typeof pdfjsLib {
  if (typeof window === 'undefined') {
    return pdfjsLib;
  }
  if (!isWorkerInitialized) {
    try {
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        // Fast local worker bundled with Vite:
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      }
      isWorkerInitialized = true;
    } catch {
      try {
        const version = pdfjsLib.version || '4.10.38';
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
        isWorkerInitialized = true;
      } catch (e) {
        console.warn('PDF Worker initialization notice:', e);
      }
    }
  }
  return pdfjsLib;
}

export { pdfjsLib };
