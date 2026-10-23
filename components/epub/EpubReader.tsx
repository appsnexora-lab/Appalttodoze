'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Search,
  Sliders,
  Maximize,
  Minimize,
  X,
  ChevronDown,
  ChevronUp,
  BookOpen,
  List,
  RotateCcw,
  Loader2,
  AlertCircle,
  Check,
  AlignJustify,
  AlignLeft,
  Type,
} from 'lucide-react';
import { EpubBook } from '@/lib/epub/EpubBook';
import { EpubSpine } from '@/lib/epub/EpubSpine';
import { EpubRenderer } from '@/lib/epub/EpubRenderer';
import { EpubNavigation } from '@/lib/epub/EpubNavigation';
import { EpubSearch } from '@/lib/epub/EpubSearch';
import { EpubPositionManager } from '@/lib/epub/EpubPositionManager';
import { LoadedChapter } from '@/lib/epub/EpubChapter';
import {
  DEFAULT_EPUB_STYLES,
  EPUB_THEMES,
  generateEpubScopedCss,
} from '@/lib/epub/EpubStyles';
import {
  EpubStyleOptions,
  EpubTocItem,
  EpubSearchResult,
  EpubTheme,
  EpubFontFamily,
  EpubContentWidth,
} from '@/lib/epub/EpubTypes';

interface EpubReaderProps {
  bookId: string;
  title: string;
  author?: string;
  epubData: ArrayBuffer;
  targetChapterQuery?: string;
  targetBookName?: string;
  targetChapterNumber?: number;
  onClose: () => void;
  onMarkAsCompleted?: () => void;
}

export const EpubReader: React.FC<EpubReaderProps> = ({
  bookId,
  title,
  author,
  epubData,
  targetChapterQuery,
  targetBookName,
  targetChapterNumber,
  onClose,
  onMarkAsCompleted,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const rendererRef = useRef<EpubRenderer | null>(null);
  const navigationRef = useRef<EpubNavigation | null>(null);
  const searchRef = useRef<EpubSearch | null>(null);
  const positionManagerRef = useRef<EpubPositionManager | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingMessage, setLoadingMessage] = useState<string>('Interpretando arquivo EPUB real...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [bookTitle, setBookTitle] = useState<string>(title);
  const [bookAuthor, setBookAuthor] = useState<string>(author || '');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [tocItems, setTocItems] = useState<EpubTocItem[]>([]);
  const [totalChapters, setTotalChapters] = useState<number>(0);

  const [renderedChapters, setRenderedChapters] = useState<LoadedChapter[]>([]);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const [styles, setStyles] = useState<EpubStyleOptions>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('altto_epub_styles');
        if (saved) return { ...DEFAULT_EPUB_STYLES, ...JSON.parse(saved) };
      } catch (e) {
        console.warn('Erro ao carregar estilos salvos:', e);
      }
    }
    return DEFAULT_EPUB_STYLES;
  });

  const [showToc, setShowToc] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentProgress, setCurrentProgress] = useState<number>(0);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<EpubSearchResult[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const [returnAnchorStack, setReturnAnchorStack] = useState<{ scrollTop: number; noteText?: string } | null>(null);

  const updateStyles = (updater: (prev: EpubStyleOptions) => EpubStyleOptions) => {
    setStyles((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem('altto_epub_styles', JSON.stringify(next));
      } catch (e) {
        console.warn('Erro ao salvar estilos no localStorage:', e);
      }
      return next;
    });
  };

  useEffect(() => {
    let isCancelled = false;

    async function initEpub() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        setLoadingMessage('Descompactando container e lendo metadados...');
        const book = await EpubBook.open(epubData.slice(0));
        if (isCancelled) {
          book.cleanup();
          return;
        }

        bookRef.current = book;
        const spine = new EpubSpine(book.spineItems);
        const renderer = new EpubRenderer(book, spine);
        const nav = new EpubNavigation(book.tocItems, book.spineItems);
        const search = new EpubSearch(book, spine);
        const posManager = new EpubPositionManager(bookId, spine.length, (pos) => {
          setCurrentProgress(pos.totalProgress);
          setActiveChapterIndex(pos.chapterIndex);
        });

        rendererRef.current = renderer;
        navigationRef.current = nav;
        searchRef.current = search;
        positionManagerRef.current = posManager;

        setBookTitle(book.metadata.title || title);
        setBookAuthor(book.metadata.creator || author || 'Autor Desconhecido');
        setCoverUrl(book.metadata.coverDataUrl || null);
        setTocItems(book.tocItems);
        setTotalChapters(spine.length);

        setLoadingMessage('Restaurando posição de leitura...');
        const savedPos = await posManager.restore();
        let initialChapter = savedPos ? savedPos.chapterIndex : 0;
        let targetAnchor: string | undefined = undefined;

        const targetQuery =
          targetChapterQuery ||
          (targetBookName && targetChapterNumber ? `${targetBookName} ${targetChapterNumber}` : null);

        if (targetQuery) {
          const normTarget = targetQuery
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

          const flattenToc = (items: EpubTocItem[]): EpubTocItem[] => {
            let res: EpubTocItem[] = [];
            for (const item of items) {
              res.push(item);
              if (item.subitems && item.subitems.length > 0) {
                res = res.concat(flattenToc(item.subitems));
              }
            }
            return res;
          };

          const flatToc = flattenToc(book.tocItems);
          const matchedItem = flatToc.find((item) => {
            const normLabel = (item.label || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .replace(/\s+/g, ' ')
              .trim();
            return (
              normLabel === normTarget ||
              normLabel.includes(normTarget) ||
              normTarget.includes(normLabel)
            );
          });

          let matchedChapterIndex = matchedItem?.chapterIndex;
          let matchedAnchor = matchedItem?.anchor;

          if (typeof matchedChapterIndex !== 'number') {
            const targetSpineId = normTarget.replace(/\s+/g, '');
            for (let i = 0; i < spine.length; i++) {
              const sp = spine.getItem(i);
              if (sp) {
                const spHrefNorm = sp.href.toLowerCase().replace(/[\u0300-\u036f]/g, '');
                if (
                  spHrefNorm.includes(targetSpineId) ||
                  spHrefNorm.includes(normTarget.replace(/\s+/g, '_')) ||
                  spHrefNorm.includes(normTarget.replace(/\s+/g, '-'))
                ) {
                  matchedChapterIndex = i;
                  break;
                }
              }
            }
          }

          if (typeof matchedChapterIndex === 'number') {
            initialChapter = matchedChapterIndex;
            targetAnchor = matchedAnchor;
          }
        }

        setActiveChapterIndex(initialChapter);

        setLoadingMessage('Formatando capítulos com refluxo...');
        const firstBatch: LoadedChapter[] = [];
        const targetChap = await renderer.loadChapter(initialChapter);
        firstBatch.push(targetChap);

        if (initialChapter + 1 < spine.length) {
          const nextChap = await renderer.loadChapter(initialChapter + 1);
          firstBatch.push(nextChap);
        }

        if (!isCancelled) {
          setRenderedChapters(firstBatch);
          setIsLoading(false);

          if (targetAnchor && containerRef.current) {
            setTimeout(() => {
              const el = document.getElementById(targetAnchor!);
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 180);
          } else if (savedPos && savedPos.scrollTop > 0 && !targetQuery) {
            setTimeout(() => {
              if (containerRef.current) {
                containerRef.current.scrollTop = savedPos.scrollTop;
              }
            }, 100);
          }
        }
      } catch (err: any) {
        console.error('Erro crítico ao carregar EPUB:', err);
        if (!isCancelled) {
          setErrorMessage(
            err.message || 'Falha ao interpretar o arquivo EPUB. Verifique se o arquivo não está protegido por DRM.'
          );
          setIsLoading(false);
        }
      }
    }

    initEpub();

    return () => {
      isCancelled = true;
      searchRef.current?.cancelSearch();
      positionManagerRef.current?.destroy();
      rendererRef.current?.clearCache();
      bookRef.current?.cleanup();
    };
  }, [bookId, epubData, title, author, targetBookName, targetChapterNumber, targetChapterQuery]);

  useEffect(() => {
    const handleFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFs);
    return () => document.removeEventListener('fullscreenchange', handleFs);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const loadNextChapter = useCallback(async () => {
    if (isLoadingMore || !rendererRef.current) return;
    const lastRendered = renderedChapters[renderedChapters.length - 1];
    if (!lastRendered || lastRendered.index >= totalChapters - 1) return;

    const nextIndex = lastRendered.index + 1;
    setIsLoadingMore(true);
    try {
      const nextChap = await rendererRef.current.loadChapter(nextIndex);
      setRenderedChapters((prev) => [...prev, nextChap]);
      rendererRef.current.preloadAdjacent(nextIndex, 2);
    } catch (err) {
      console.warn(`Erro ao carregar próximo capítulo ${nextIndex}:`, err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, renderedChapters, totalChapters]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container || !positionManagerRef.current || renderedChapters.length === 0) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const chapterElements = container.querySelectorAll<HTMLElement>('[data-chapter-index]');
    let currentVisibleChapter = renderedChapters[0].index;
    let activeChapterHeight = clientHeight;

    for (const el of Array.from(chapterElements)) {
      const top = el.offsetTop - container.offsetTop;
      const height = el.offsetHeight;
      if (scrollTop >= top - 120 && scrollTop < top + height) {
        const idx = parseInt(el.getAttribute('data-chapter-index') || '0', 10);
        currentVisibleChapter = idx;
        activeChapterHeight = height;
        break;
      }
    }

    if (currentVisibleChapter !== activeChapterIndex) {
      setActiveChapterIndex(currentVisibleChapter);
    }

    const currentChapData = renderedChapters.find((c) => c.index === currentVisibleChapter);
    positionManagerRef.current.update(
      currentVisibleChapter,
      scrollTop,
      activeChapterHeight,
      clientHeight,
      currentChapData?.title
    );

    if (scrollTop + clientHeight >= scrollHeight - 600) {
      loadNextChapter();
    }
  };

  const jumpToChapter = async (targetIndex: number, anchorId?: string) => {
    if (!rendererRef.current || targetIndex < 0 || targetIndex >= totalChapters) return;

    setShowToc(false);
    setShowSearch(false);

    const alreadyRendered = renderedChapters.some((c) => c.index === targetIndex);
    if (!alreadyRendered) {
      setIsLoading(true);
      setLoadingMessage(`Carregando capítulo ${targetIndex + 1}...`);
      try {
        const targetChap = await rendererRef.current.loadChapter(targetIndex);
        const batch: LoadedChapter[] = [targetChap];
        if (targetIndex + 1 < totalChapters) {
          const nextChap = await rendererRef.current.loadChapter(targetIndex + 1);
          batch.push(nextChap);
        }
        setRenderedChapters(batch);
      } catch (err) {
        console.error('Erro ao pular para capítulo:', err);
      } finally {
        setIsLoading(false);
      }
    }

    setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      if (anchorId) {
        const anchorEl = container.querySelector(`#${anchorId}`) || container.querySelector(`[name="${anchorId}"]`);
        if (anchorEl) {
          anchorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }

      const chapterEl = container.querySelector(`[data-chapter-index="${targetIndex}"]`);
      if (chapterEl) {
        chapterEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
  };

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    if (!link) return;

    const chapterIdxStr = link.getAttribute('data-chapter-index');
    const anchor = link.getAttribute('data-epub-anchor');

    if (chapterIdxStr !== null) {
      e.preventDefault();
      const chapIdx = parseInt(chapterIdxStr, 10);
      if (containerRef.current) {
        setReturnAnchorStack({
          scrollTop: containerRef.current.scrollTop,
          noteText: link.textContent || undefined,
        });
      }
      jumpToChapter(chapIdx, anchor || undefined);
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchRef.current || !searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResults([]);
    try {
      const results = await searchRef.current.search(searchQuery);
      setSearchResults(results);
      setCurrentMatchIndex(0);
      if (results.length > 0) {
        jumpToChapter(results[0].chapterIndex);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleNextSearchMatch = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % searchResults.length;
    setCurrentMatchIndex(nextIdx);
    jumpToChapter(searchResults[nextIdx].chapterIndex);
  };

  const handlePrevSearchMatch = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentMatchIndex(prevIdx);
    jumpToChapter(searchResults[prevIdx].chapterIndex);
  };

  const currentTheme = EPUB_THEMES[styles.theme];

  function renderTocItem(item: EpubTocItem, depth: number) {
    const isCurrent = item.chapterIndex === activeChapterIndex;
    return (
      <div key={item.id} className="space-y-1">
        <button
          onClick={() => jumpToChapter(item.chapterIndex || 0, item.anchor)}
          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer ${
            isCurrent
              ? 'bg-amber-500/20 text-amber-500 font-bold'
              : 'opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
          }`}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
        >
          <span className="truncate">{item.label}</span>
          {typeof item.chapterIndex === 'number' && (
            <span className="text-[10px] font-mono opacity-50 shrink-0">
              p. {item.chapterIndex + 1}
            </span>
          )}
        </button>
        {item.subitems && item.subitems.length > 0 && (
          <div className="space-y-0.5">
            {item.subitems.map((sub) => renderTocItem(sub, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      id="altto-epub-reader-root"
      className="fixed inset-0 z-50 flex flex-col select-text overflow-hidden transition-colors duration-200"
      style={{
        backgroundColor: currentTheme.bg,
        color: currentTheme.text,
      }}
    >
      <style>{generateEpubScopedCss(styles)}</style>

      {/* Top Header */}
      <header
        className="h-14 px-3 sm:px-4 flex items-center justify-between z-30 shrink-0 border-b backdrop-blur-md transition-colors"
        style={{
          backgroundColor: `${currentTheme.cardBg}E6`,
          borderColor: currentTheme.border,
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            id="epub-btn-close"
            onClick={onClose}
            className="p-2 rounded-xl transition-colors hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            title="Sair do leitor"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-semibold font-serif truncate max-w-[150px] sm:max-w-md">
                {bookTitle}
              </h1>
              {targetChapterQuery && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/40 font-bold text-[10px]">
                  <BookOpen className="w-2.5 h-2.5" />
                  <span>{targetChapterQuery}</span>
                </span>
              )}
            </div>
            <p className="text-[10px] opacity-70 truncate">
              {bookAuthor || 'Documento EPUB'}
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs font-mono opacity-80">
          <span className="truncate max-w-xs">
            {renderedChapters.find((c) => c.index === activeChapterIndex)?.title || `Capítulo ${activeChapterIndex + 1}`}
          </span>
          <span>·</span>
          <span className="font-bold text-amber-500">{currentProgress}%</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            id="epub-btn-toc"
            onClick={() => setShowToc(!showToc)}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              showToc
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'hover:bg-black/10 dark:hover:bg-white/10 opacity-80 hover:opacity-100'
            }`}
            title="Sumário do livro"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            id="epub-btn-search"
            onClick={() => setShowSearch(!showSearch)}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              showSearch
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'hover:bg-black/10 dark:hover:bg-white/10 opacity-80 hover:opacity-100'
            }`}
            title="Buscar no livro"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            id="epub-btn-settings"
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              showSettings
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'hover:bg-black/10 dark:hover:bg-white/10 opacity-80 hover:opacity-100'
            }`}
            title="Ajustes de texto e refluxo"
          >
            <Sliders className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 opacity-80 hover:opacity-100 transition-colors hidden sm:block cursor-pointer"
            title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
          {onMarkAsCompleted && (
            <button
              onClick={onMarkAsCompleted}
              className="ml-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
              title="Concluir leitura"
            >
              Concluir
            </button>
          )}
        </div>
      </header>

      {/* Floating Return Pill */}
      {returnAnchorStack && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <button
            onClick={() => {
              if (containerRef.current && returnAnchorStack) {
                containerRef.current.scrollTo({
                  top: returnAnchorStack.scrollTop,
                  behavior: 'smooth',
                });
                setReturnAnchorStack(null);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-full shadow-2xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition-all border border-amber-300 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retornar ao ponto de leitura</span>
          </button>
        </div>
      )}

      {/* Floating Search Bar */}
      {showSearch && (
        <div
          className="border-b px-4 py-2.5 flex items-center justify-between gap-2 z-30 animate-in slide-in-from-top duration-200"
          style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.border }}
        >
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 max-w-lg">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Pesquisar palavra ou trecho no livro..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full border rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                style={{
                  backgroundColor: currentTheme.bg,
                  borderColor: currentTheme.border,
                  color: currentTheme.text,
                }}
              />
              {isSearching && (
                <Loader2 className="w-4 h-4 animate-spin text-amber-500 absolute right-3 top-2" />
              )}
            </div>
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="px-3 py-1.5 bg-amber-500 text-slate-950 font-semibold rounded-xl text-xs hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Buscar
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[11px] font-mono text-amber-500 font-bold">
                {currentMatchIndex + 1} de {searchResults.length}
              </span>
              <button
                onClick={handlePrevSearchMatch}
                className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                title="Resultado anterior"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextSearchMatch}
                className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                title="Próximo resultado"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={() => setShowSearch(false)}
            className="p-1.5 opacity-70 hover:opacity-100 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table of Contents Drawer */}
      {showToc && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setShowToc(false)}
          />
          <aside
            className="relative w-full max-w-sm h-full flex flex-col shadow-2xl z-10 border-r animate-in slide-in-from-left duration-200"
            style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.border }}
          >
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: currentTheme.border }}>
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-bold font-serif">Sumário do Livro</h2>
              </div>
              <button onClick={() => setShowToc(false)} className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {tocItems.map((item) => renderTocItem(item, 0))}
            </div>
            <div className="p-3 border-t text-[11px] opacity-60 text-center" style={{ borderColor: currentTheme.border }}>
              Total de {totalChapters} capítulos no documento
            </div>
          </aside>
        </div>
      )}

      {/* Settings Drawer */}
      {showSettings && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setShowSettings(false)} />
          <aside
            className="relative w-full max-w-sm h-full flex flex-col shadow-2xl z-10 border-l animate-in slide-in-from-right duration-200 p-5 overflow-y-auto space-y-6"
            style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.border }}
          >
            <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: currentTheme.border }}>
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-bold font-serif">Ajustes de Refluxo</h2>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Themes */}
            <div className="space-y-2">
              <label className="text-xs font-semibold opacity-70 uppercase tracking-wider">Tema de Leitura</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(EPUB_THEMES) as EpubTheme[]).map((thm) => {
                  const t = EPUB_THEMES[thm];
                  const isSelected = styles.theme === thm;
                  return (
                    <button
                      key={thm}
                      onClick={() => updateStyles((s) => ({ ...s, theme: thm }))}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                        isSelected ? 'ring-2 ring-amber-500 font-bold' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: t.bg,
                        color: t.text,
                        borderColor: isSelected ? '#F59E0B' : t.border,
                      }}
                    >
                      <span>{t.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-amber-500" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Font Family */}
            <div className="space-y-2">
              <label className="text-xs font-semibold opacity-70 uppercase tracking-wider">Fonte do Texto</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'serif', label: 'Serifada' },
                  { id: 'sans', label: 'Moderna' },
                  { id: 'mono', label: 'Mono' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => updateStyles((s) => ({ ...s, fontFamily: f.id as EpubFontFamily }))}
                    className={`py-2 px-1 rounded-xl border text-xs text-center transition-all cursor-pointer ${
                      styles.fontFamily === f.id
                        ? 'border-amber-500 bg-amber-500/10 text-amber-500 font-bold'
                        : 'border-black/10 dark:border-white/10 hover:border-amber-500/50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold opacity-70 uppercase tracking-wider">Tamanho da Fonte</label>
                <span className="font-mono text-amber-500 font-bold">{styles.fontSize}px</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => updateStyles((s) => ({ ...s, fontSize: Math.max(13, s.fontSize - 1) }))}
                  className="p-2 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  A-
                </button>
                <input
                  type="range"
                  min={13}
                  max={28}
                  value={styles.fontSize}
                  onChange={(e) => updateStyles((s) => ({ ...s, fontSize: parseInt(e.target.value, 10) }))}
                  className="flex-1 accent-amber-500 cursor-pointer"
                />
                <button
                  onClick={() => updateStyles((s) => ({ ...s, fontSize: Math.min(32, s.fontSize + 1) }))}
                  className="p-2 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  A+
                </button>
              </div>
            </div>

            {/* Line Height */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold opacity-70 uppercase tracking-wider">Espaçamento de Linha</label>
                <span className="font-mono text-amber-500">{styles.lineHeight}x</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[1.4, 1.65, 1.9, 2.2].map((lh) => (
                  <button
                    key={lh}
                    onClick={() => updateStyles((s) => ({ ...s, lineHeight: lh }))}
                    className={`py-1.5 rounded-lg border text-xs cursor-pointer ${
                      styles.lineHeight === lh
                        ? 'border-amber-500 bg-amber-500/10 text-amber-500 font-bold'
                        : 'border-black/10 dark:border-white/10'
                    }`}
                  >
                    {lh}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Width */}
            <div className="space-y-2">
              <label className="text-xs font-semibold opacity-70 uppercase tracking-wider">Largura do Texto</label>
              <div className="grid grid-cols-4 gap-2 text-xs">
                {[
                  { id: 'compact', label: 'Compacta' },
                  { id: 'normal', label: 'Normal' },
                  { id: 'wide', label: 'Ampla' },
                  { id: 'full', label: 'Total' },
                ].map((w) => (
                  <button
                    key={w.id}
                    onClick={() => updateStyles((s) => ({ ...s, contentWidth: w.id as EpubContentWidth }))}
                    className={`py-1.5 rounded-lg border text-center cursor-pointer ${
                      styles.contentWidth === w.id
                        ? 'border-amber-500 bg-amber-500/10 text-amber-500 font-bold'
                        : 'border-black/10 dark:border-white/10'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Alignment */}
            <div className="space-y-2">
              <label className="text-xs font-semibold opacity-70 uppercase tracking-wider">Alinhamento</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => updateStyles((s) => ({ ...s, textAlign: 'justify' }))}
                  className={`flex items-center justify-center gap-2 py-2 rounded-xl border text-xs cursor-pointer ${
                    styles.textAlign === 'justify'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-500 font-bold'
                      : 'border-black/10 dark:border-white/10'
                  }`}
                >
                  <AlignJustify className="w-4 h-4" />
                  <span>Justificado</span>
                </button>
                <button
                  onClick={() => updateStyles((s) => ({ ...s, textAlign: 'left' }))}
                  className={`flex items-center justify-center gap-2 py-2 rounded-xl border text-xs cursor-pointer ${
                    styles.textAlign === 'left'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-500 font-bold'
                      : 'border-black/10 dark:border-white/10'
                  }`}
                >
                  <AlignLeft className="w-4 h-4" />
                  <span>À Esquerda</span>
                </button>
              </div>
            </div>

            <div className="pt-2 border-t" style={{ borderColor: currentTheme.border }}>
              <button
                onClick={() => updateStyles(() => DEFAULT_EPUB_STYLES)}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs opacity-75 hover:opacity-100 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar padrões de leitura</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Continuous Reflow Scroll Viewport */}
      <main
        id="epub-scroll-container"
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 focus:outline-none"
        style={{
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm font-medium opacity-80">{loadingMessage}</p>
          </div>
        )}

        {errorMessage && (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center max-w-md mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold mb-1">Não foi possível exibir o EPUB</h2>
            <p className="text-xs opacity-75 mb-4">{errorMessage}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 cursor-pointer"
            >
              Voltar à Biblioteca
            </button>
          </div>
        )}

        {!isLoading && !errorMessage && renderedChapters.length > 0 && (
          <div className="epub-content-wrapper space-y-12">
            {renderedChapters[0]?.index === 0 && (
              <div className="text-center pb-8 border-b mb-10" style={{ borderColor: currentTheme.border }}>
                {coverUrl && (
                  <div className="max-w-[220px] mx-auto mb-6 shadow-2xl rounded-xl overflow-hidden border border-black/10">
                    <img src={coverUrl} alt={bookTitle} className="w-full h-auto object-cover block" />
                  </div>
                )}
                <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight mb-2">
                  {bookTitle}
                </h1>
                <p className="text-sm opacity-80 font-medium">{bookAuthor}</p>
              </div>
            )}

            {renderedChapters.map((chapter) => (
              <article
                key={`chapter-${chapter.index}`}
                id={`epub-chapter-${chapter.index}`}
                data-chapter-index={chapter.index}
                className="space-y-6 pt-6"
              >
                {chapter.title && (
                  <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: `${currentTheme.border}80` }}>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold uppercase">
                      Cap. {chapter.index + 1}
                    </span>
                    <h2 className="text-base sm:text-lg font-serif font-bold text-amber-500">
                      {chapter.title}
                    </h2>
                  </div>
                )}
                <div
                  className="epub-chapter-body"
                  dangerouslySetInnerHTML={{ __html: chapter.html }}
                  onClick={handleContentClick}
                />
                <div className="flex items-center justify-center my-10 opacity-30">
                  <span className="h-px w-16 bg-current" />
                  <span className="mx-3 text-xs">✤</span>
                  <span className="h-px w-16 bg-current" />
                </div>
              </article>
            ))}

            {isLoadingMore && (
              <div className="flex items-center justify-center py-6 gap-2 text-xs opacity-70">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                <span>Carregando próximo capítulo...</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Scrubber */}
      {totalChapters > 0 && (
        <footer
          className="h-12 px-4 flex items-center justify-between gap-4 z-30 shrink-0 border-t backdrop-blur-md transition-colors"
          style={{
            backgroundColor: `${currentTheme.cardBg}E6`,
            borderColor: currentTheme.border,
          }}
        >
          <div className="flex items-center gap-2 text-xs font-mono opacity-80 shrink-0">
            <BookOpen className="w-4 h-4 text-amber-500" />
            <span>
              Capítulo <strong style={{ color: currentTheme.text }}>{activeChapterIndex + 1}</strong> de {totalChapters}
            </span>
          </div>

          <div className="flex-1 max-w-md flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={totalChapters - 1}
              value={activeChapterIndex}
              onChange={(e) => {
                const targetIdx = parseInt(e.target.value, 10);
                jumpToChapter(targetIdx);
              }}
              className="w-full accent-amber-500 h-1.5 rounded-lg cursor-pointer"
            />
          </div>

          <div className="text-xs font-bold text-amber-500 shrink-0">
            {currentProgress}%
          </div>
        </footer>
      )}
    </div>
  );
};
