'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ReadingEngine,
  ReadingEngineState,
} from '@/lib/pdf/ReadingEngine';
import { PdfPage } from './PdfPage';
import { SearchResult } from '@/lib/pdf/PdfSearchEngine';
import {
  ArrowLeft,
  Search,
  Maximize,
  Maximize2,
  Minimize,
  X,
  ChevronDown,
  ChevronUp,
  BookOpen,
  AlertCircle,
  Loader2,
  Clock,
} from 'lucide-react';

interface PdfReaderProps {
  bookId: string;
  title: string;
  author?: string;
  pdfData: ArrayBuffer;
  targetChapterQuery?: string;
  targetBookName?: string;
  targetChapterNumber?: number;
  onClose: () => void;
  onMarkAsCompleted?: () => void;
}

export const PdfReader: React.FC<PdfReaderProps> = ({
  bookId,
  title,
  author,
  pdfData,
  targetChapterQuery,
  targetBookName,
  targetChapterNumber,
  onClose,
  onMarkAsCompleted,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ReadingEngine | null>(null);

  const [engineState, setEngineState] = useState<ReadingEngineState>({
    status: 'loading',
    metadata: null,
    currentPage: 1,
    totalPages: 0,
    scale: 1.0,
    fitMode: 'fit-snug',
    progressPercent: 0,
    visiblePageLayouts: [],
    totalVirtualHeight: 0,
    effectivePageWidth: 600,
    stageWidth: 600,
    docModel: null,
  });

  const [readingSeconds, setReadingSeconds] = useState<number>(0);
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [bookmarkedPages, setBookmarkedPages] = useState<number[]>([]);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [fitToast, setFitToast] = useState<string>('');
  const [isNavigatingChapter, setIsNavigatingChapter] = useState<boolean>(false);
  const [jumpPageInput, setJumpPageInput] = useState<string>('1');

  useEffect(() => {
    const timer = setInterval(() => {
      setReadingSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const engine = new ReadingEngine(bookId);
    engineRef.current = engine;

    const unsubscribe = engine.subscribe((state) => {
      setEngineState(state);
      setJumpPageInput(state.currentPage.toString());
    });

    const initContainer = containerRef.current;
    const initialWidth = initContainer?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 600);
    const initialHeight = initContainer?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 800);

    engine.loadDocument(pdfData.slice(0), initialWidth, initialHeight).catch((err) => {
      console.error('Failed to load real PDF document:', err);
    });

    return () => {
      unsubscribe();
      engine.destroy();
      engineRef.current = null;
    };
  }, [bookId, pdfData]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let resizeTimer: NodeJS.Timeout | null = null;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && engineRef.current) {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            engineRef.current?.handleResize(width, height);
          }, 20);
        }
      }
    });

    observer.observe(container);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleOrientationOrResize = () => {
      if (!containerRef.current || !engineRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        engineRef.current.handleResize(rect.width, rect.height);
      }
      setTimeout(() => {
        if (!containerRef.current || !engineRef.current) return;
        const delayedRect = containerRef.current.getBoundingClientRect();
        if (delayedRect.width > 0 && delayedRect.height > 0) {
          engineRef.current.handleResize(delayedRect.width, delayedRect.height);
        }
      }, 120);
    };

    window.addEventListener('resize', handleOrientationOrResize);
    window.addEventListener('orientationchange', handleOrientationOrResize);
    if (typeof screen !== 'undefined' && screen.orientation) {
      screen.orientation.addEventListener('change', handleOrientationOrResize);
    }

    return () => {
      window.removeEventListener('resize', handleOrientationOrResize);
      window.removeEventListener('orientationchange', handleOrientationOrResize);
      if (typeof screen !== 'undefined' && screen.orientation) {
        screen.orientation.removeEventListener('change', handleOrientationOrResize);
      }
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const engine = engineRef.current;
    if (!container || !engine) return;

    engine.setContainerElement(container);
    const detachScroll = engine.scrollController.attach(
      container,
      (scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth) => {
        engine.handleScroll(scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth);
      }
    );

    return () => {
      detachScroll();
    };
  }, [engineState.status]);

  const hasEnteredNativeFs = useRef(false);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    hasEnteredNativeFs.current = false;
    try {
      if (
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      ) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
    } catch (e) {
      console.warn('exitFullscreen error:', e);
    }
  }, []);

  const enterFullscreen = useCallback(() => {
    setIsFullscreen(true);
    try {
      const elem = rootRef.current || document.documentElement;
      if (elem && elem.requestFullscreen) {
        elem
          .requestFullscreen()
          .then(() => {
            hasEnteredNativeFs.current = true;
          })
          .catch(() => {
            hasEnteredNativeFs.current = false;
          });
      } else if (elem && (elem as any).webkitRequestFullscreen) {
        try {
          (elem as any).webkitRequestFullscreen();
          hasEnteredNativeFs.current = true;
        } catch {
          hasEnteredNativeFs.current = false;
        }
      }
    } catch (e) {
      console.warn('Native requestFullscreen not supported, using CSS fallback:', e);
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      const isNativeFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );
      if (isNativeFs) {
        hasEnteredNativeFs.current = true;
        setIsFullscreen(true);
      } else if (hasEnteredNativeFs.current) {
        hasEnteredNativeFs.current = false;
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        exitFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, exitFullscreen]);

  const handleToggleFitScreen = () => {
    if (!engineRef.current) return;
    const nextMode = engineRef.current.toggleFitMode();
    const msg =
      nextMode === 'fit-snug'
        ? '🔍 PDF mais ajustado à tela (texto ampliado)'
        : nextMode === 'fit-width'
        ? '📐 PDF ajustado à largura (100%)'
        : '📖 Ajustado com margem confortável';
    setFitToast(msg);
    setTimeout(() => setFitToast(''), 2500);
  };

  const handlePerformSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || !engineRef.current) return;

    setIsSearching(true);
    try {
      const results = await engineRef.current.searchEngine.search(searchQuery);
      setSearchResults(results);
      setCurrentMatchIndex(0);
      if (results.length > 0) {
        engineRef.current.jumpToPage(results[0].pageNumber);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleNextMatch = () => {
    if (searchResults.length === 0 || !engineRef.current) return;
    const nextIdx = (currentMatchIndex + 1) % searchResults.length;
    setCurrentMatchIndex(nextIdx);
    engineRef.current.jumpToPage(searchResults[nextIdx].pageNumber);
  };

  const handlePrevMatch = () => {
    if (searchResults.length === 0 || !engineRef.current) return;
    const prevIdx = (currentMatchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentMatchIndex(prevIdx);
    engineRef.current.jumpToPage(searchResults[prevIdx].pageNumber);
  };

  const handleToggleBookmark = (pageNumber: number) => {
    setBookmarkedPages((prev) =>
      prev.includes(pageNumber) ? prev.filter((p) => p !== pageNumber) : [...prev, pageNumber]
    );
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPageInput, 10);
    if (!isNaN(p) && engineRef.current) {
      engineRef.current.jumpToPage(p);
    }
  };

  const readingMinutes = Math.floor(readingSeconds / 60);
  const remainingPages = Math.max(0, engineState.totalPages - engineState.currentPage);
  const remainingMinutes =
    remainingPages === 0
      ? 0
      : Math.max(1, Math.round(remainingPages * 1.5));

  const navigateToChapter = useCallback(async (forcedQuery?: string) => {
    if (!engineRef.current || engineState.status !== 'ready') return;
    const query =
      forcedQuery ||
      targetChapterQuery ||
      (targetBookName && targetChapterNumber ? `${targetBookName} ${targetChapterNumber}` : null);
    if (!query) return;

    const bookName = targetBookName || '';
    const chapNum = targetChapterNumber || 1;
    const cacheKey = `altto_pdf_chap_${bookId}_${bookName}_${chapNum}`;
    const cachedPageStr = localStorage.getItem(cacheKey);

    if (cachedPageStr) {
      const cachedPage = parseInt(cachedPageStr, 10);
      if (!isNaN(cachedPage) && cachedPage >= 1 && cachedPage <= (engineState.totalPages || 99999)) {
        engineRef.current.jumpToPage(cachedPage);
        return;
      }
    }

    setIsNavigatingChapter(true);
    const bookNorm = bookName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const queriesToTry = Array.from(
      new Set(
        [
          query,
          query.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
          `${bookName} ${chapNum}`,
          `${bookNorm} ${chapNum}`,
          `${bookName} Capítulo ${chapNum}`,
          `${bookNorm} Capitulo ${chapNum}`,
          `${bookName} Cap. ${chapNum}`,
          `${bookNorm} Cap. ${chapNum}`,
          `${bookName} Cap ${chapNum}`,
          `${bookNorm} Cap ${chapNum}`,
          `Capítulo ${chapNum}`,
          `Capitulo ${chapNum}`,
          `Cap. ${chapNum}`,
          `Cap ${chapNum}`,
        ].filter(Boolean)
      )
    );

    try {
      for (const q of queriesToTry) {
        if (!engineRef.current) break;
        const match = await engineRef.current.searchEngine.findFirst(q);
        if (match && match.pageNumber >= 1) {
          localStorage.setItem(cacheKey, match.pageNumber.toString());
          engineRef.current.jumpToPage(match.pageNumber);
          return;
        }
      }
    } catch (err) {
      console.warn('Erro ao localizar capítulo:', err);
    } finally {
      setIsNavigatingChapter(false);
    }
  }, [engineState.status, engineState.totalPages, targetChapterQuery, targetBookName, targetChapterNumber, bookId]);

  useEffect(() => {
    if (engineState.status === 'ready' && (targetChapterQuery || (targetBookName && targetChapterNumber))) {
      const timer = setTimeout(() => {
        navigateToChapter();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [engineState.status, targetChapterQuery, targetBookName, targetChapterNumber, navigateToChapter]);

  const activeTargetLabel =
    targetChapterQuery || (targetBookName && targetChapterNumber ? `${targetBookName} ${targetChapterNumber}` : null);

  return (
    <div
      id="altto-pdf-reader-root"
      ref={rootRef}
      className={`fixed inset-0 ${
        isFullscreen ? 'z-[999999]' : 'z-50'
      } bg-[#FFFFFF] text-[#29243A] flex flex-col select-none overflow-hidden`}
    >
      {!isFullscreen && (
        <header className="h-14 bg-white border-b border-[#EAE5F4] px-3 sm:px-4 flex items-center justify-between z-30 shrink-0 text-[#29243A] shadow-xs">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              id="pdf-btn-close"
              onClick={onClose}
              className="p-2 rounded-xl text-[#29243A] hover:bg-[#FAF9FD] hover:text-[#A58ADB] transition-colors cursor-pointer"
              title="Sair do leitor"
            >
              <ArrowLeft className="w-5 h-5 text-black" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xs sm:text-sm font-semibold font-serif text-slate-900 truncate max-w-[140px] sm:max-w-md">
                  {title}
                </h1>
                {activeTargetLabel && (
                  <button
                    onClick={() => navigateToChapter()}
                    disabled={isNavigatingChapter}
                    className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px] hover:bg-amber-200 transition-colors cursor-pointer"
                    title="Clique para ir para este capítulo na Bíblia"
                  >
                    <BookOpen className="w-2.5 h-2.5 text-amber-700" />
                    <span>{activeTargetLabel}</span>
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-500 truncate">
                {author || engineState.metadata?.author || 'Documento PDF'}
              </p>
            </div>
          </div>

          {engineState.totalPages > 0 && (
            <form
              onSubmit={handleJumpSubmit}
              className="hidden md:flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200 text-xs"
            >
              <span className="text-slate-600 font-medium">Pág.</span>
              <input
                type="text"
                inputMode="numeric"
                value={jumpPageInput}
                onChange={(e) => setJumpPageInput(e.target.value)}
                className="w-10 bg-white text-center font-bold text-black border border-slate-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
              <span className="text-slate-600 font-medium">/ {engineState.totalPages}</span>
            </form>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              id="pdf-btn-fit-screen"
              onClick={handleToggleFitScreen}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                engineState.fitMode === 'fit-snug'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : engineState.fitMode === 'fit-width'
                  ? 'bg-slate-100 text-slate-900 border-slate-300 shadow-xs'
                  : 'bg-white text-black border-slate-200 hover:bg-slate-100'
              }`}
              title="Ajustar PDF à tela"
            >
              <Maximize2
                className={`w-3.5 h-3.5 ${
                  engineState.fitMode === 'fit-snug' ? 'text-white' : 'text-black'
                }`}
              />
              <span className="text-[11px] sm:text-xs">
                {engineState.fitMode === 'fit-snug'
                  ? 'Mais ajustado'
                  : engineState.fitMode === 'fit-width'
                  ? 'Ajustado 100%'
                  : 'Com margem'}
              </span>
            </button>

            <button
              id="pdf-btn-search"
              onClick={() => setShowSearch(!showSearch)}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                showSearch
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-black border-slate-200 hover:bg-slate-100'
              }`}
              title="Buscar no documento"
            >
              <Search className={`w-4 h-4 ${showSearch ? 'text-white' : 'text-black'}`} />
            </button>

            <button
              id="pdf-btn-fullscreen"
              onClick={enterFullscreen}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-black border border-slate-200 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              title="Ativar modo tela cheia"
            >
              <Maximize className="w-3.5 h-3.5 text-black" />
              <span className="hidden sm:inline text-[11px] sm:text-xs">Tela cheia</span>
            </button>

            {onMarkAsCompleted && (
              <button
                onClick={onMarkAsCompleted}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                title="Concluir leitura"
              >
                Concluir
              </button>
            )}
          </div>
        </header>
      )}

      {showSearch && !isFullscreen && (
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-2 z-20 shadow-sm animate-in slide-in-from-top duration-200 text-slate-900">
          <form onSubmit={handlePerformSearch} className="flex-1 flex items-center gap-2 max-w-lg">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Pesquisar palavra ou frase no PDF..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
              />
              {isSearching && (
                <Loader2 className="w-4 h-4 animate-spin text-black absolute right-3 top-2" />
              )}
            </div>
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="px-3 py-1.5 bg-slate-900 text-white font-semibold rounded-xl text-xs hover:bg-black disabled:opacity-50 transition-colors cursor-pointer"
            >
              Buscar
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-800">
              <span className="text-[11px] text-slate-900 font-mono font-bold">
                {currentMatchIndex + 1} de {searchResults.length}
              </span>
              <button
                onClick={handlePrevMatch}
                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-black border border-slate-200 cursor-pointer"
                title="Resultado anterior"
              >
                <ChevronUp className="w-3.5 h-3.5 text-black" />
              </button>
              <button
                onClick={handleNextMatch}
                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-black border border-slate-200 cursor-pointer"
                title="Próximo resultado"
              >
                <ChevronDown className="w-3.5 h-3.5 text-black" />
              </button>
            </div>
          )}

          <button
            onClick={() => setShowSearch(false)}
            className="p-1.5 text-slate-600 hover:text-black rounded-lg hover:bg-slate-100 cursor-pointer"
            title="Fechar busca"
          >
            <X className="w-4 h-4 text-black" />
          </button>
        </div>
      )}

      <main
        id="pdf-scroll-container"
        ref={containerRef}
        className="flex-1 relative overflow-x-hidden overflow-y-auto bg-[#FFFFFF] focus:outline-none"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
        }}
      >
        {engineState.status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm z-20">
            <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
            <p className="text-sm text-slate-700 font-medium">Carregando documento real...</p>
          </div>
        )}

        {engineState.status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center z-20">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="max-w-md">
              <h2 className="text-base font-semibold text-slate-900 mb-1">Não foi possível exibir o PDF</h2>
              <p className="text-xs text-slate-500">{engineState.errorMessage}</p>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Voltar à Biblioteca
            </button>
          </div>
        )}

        {engineState.status === 'ready' && engineState.docModel && (
          <div
            id="pdf-virtual-stage"
            className="relative left-1/2 -translate-x-1/2"
            style={{
              width: `${engineState.stageWidth}px`,
              height: `${engineState.totalVirtualHeight}px`,
            }}
          >
            {engineState.visiblePageLayouts.map((layout) => (
              <PdfPage
                key={layout.pageNumber}
                pageNumber={layout.pageNumber}
                docModel={engineState.docModel!}
                scale={engineState.scale}
                targetWidth={layout.width}
                topOffset={layout.top}
                height={layout.height}
                isBookmarked={bookmarkedPages.includes(layout.pageNumber)}
                onToggleBookmark={handleToggleBookmark}
              />
            ))}
          </div>
        )}
      </main>

      {engineState.totalPages > 0 && (
        <div
          id="pdf-floating-progress-widget"
          className="fixed z-[1000000] h-6 sm:h-7 px-2.5 rounded-full bg-white/95 text-slate-900 border border-slate-300 shadow-md flex items-center gap-1.5 text-[10px] sm:text-[11px] font-medium select-none pointer-events-auto backdrop-blur-sm"
          title={`Página ${engineState.currentPage} de ${engineState.totalPages}`}
          style={{
            bottom: 'max(8px, env(safe-area-inset-bottom, 8px))',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <Clock className="w-3 h-3 text-black shrink-0 stroke-[2.2]" />
          <span className="font-extrabold text-black">{engineState.progressPercent}%</span>
          <span className="text-slate-300 text-[10px]">·</span>
          <span className="text-slate-600">{readingMinutes < 1 ? '<1m' : `${readingMinutes}m`}</span>
          <span className="text-slate-300 text-[10px]">·</span>
          <span className="text-slate-900 font-semibold">
            {remainingPages === 0 ? 'Fim' : `restam ${remainingMinutes}m`}
          </span>
        </div>
      )}

      {isFullscreen && (
        <button
          id="pdf-btn-exit-fullscreen"
          onClick={(e) => {
            e.stopPropagation();
            exitFullscreen();
          }}
          aria-label="Sair da tela cheia"
          title="Sair da tela cheia"
          className="fixed z-[1000000] h-7 px-2.5 rounded-full bg-white/95 text-black border border-slate-300 shadow-md hover:bg-slate-50 active:scale-95 flex items-center gap-1.5 cursor-pointer font-semibold text-[11px] select-none pointer-events-auto transition-transform"
          style={{
            top: 'max(10px, env(safe-area-inset-top, 10px))',
            right: 'max(10px, env(safe-area-inset-right, 10px))',
          }}
        >
          <Minimize className="w-3 h-3 text-black shrink-0 stroke-[2.5]" />
          <span className="text-black text-[11px] font-semibold leading-none">Sair</span>
        </button>
      )}

      {fitToast && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-white border border-slate-200 text-slate-900 text-xs font-medium rounded-full shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          {fitToast}
        </div>
      )}
    </div>
  );
};
