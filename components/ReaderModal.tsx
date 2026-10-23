'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  Bookmark as BookmarkIcon,
  Sliders,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  MessageSquare,
  Volume2,
  Headphones,
  Play,
  Pause,
  Square,
} from 'lucide-react';
import {
  ContentType,
  ReaderTheme,
  BibleBook,
  DevotionalDay,
  Book,
  Bookmark,
  Highlight,
  HighlightColor,
  HighlightCategory,
} from '@/types';
import { speechService } from '@/lib/speechService';
import {
  THEME_STYLES,
  saveReadingProgress,
  getReadingProgress,
  addBookmark,
  addHighlight,
  addAnnotation,
  getBookmarks,
  getHighlights,
} from '@/lib/readerService';
import { getChapterVerses } from '@/lib/bibleData';
import { getBlob, saveBlob } from '@/lib/indexedDB';
import { PdfReader } from './pdf/PdfReader';
import { EpubReader } from './epub/EpubReader';

interface ReaderProps {
  contentType: ContentType;
  contentId: string;
  title: string;
  subtitle?: string;
  initialChapterOrDay?: number;
  initialBookName?: string;
  targetChapterQuery?: string;
  targetBookName?: string;
  targetChapterNumber?: number;
  bibleBooks?: BibleBook[];
  devotionalDays?: DevotionalDay[];
  bookData?: Book;
  period?: 'morning' | 'afternoon' | 'night' | string;
  onClose: () => void;
  onMarkAsRead?: (itemDetails: {
    bookName?: string;
    chapterNumber?: number;
    dayNumber?: number;
  }) => void;
  isReadAlready?: boolean;
}

export const ReaderModal: React.FC<ReaderProps> = ({
  contentType,
  contentId,
  title,
  subtitle,
  initialChapterOrDay = 1,
  initialBookName = 'Gênesis',
  targetChapterQuery,
  targetBookName,
  targetChapterNumber,
  devotionalDays = [],
  bookData,
  period,
  onClose,
  onMarkAsRead,
  isReadAlready = false,
}) => {
  const [currentChapter, setCurrentChapter] = useState<number>(initialChapterOrDay);
  const [currentBookName, setCurrentBookName] = useState<string>(initialBookName);
  const [currentDayNumber, setCurrentDayNumber] = useState<number>(initialChapterOrDay);
  const [theme, setTheme] = useState<ReaderTheme>('light');
  const [fontSize, setFontSize] = useState<number>(18);
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans' | 'mono'>('serif');
  const [lineHeight, setLineHeight] = useState<number>(1.6);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isImmersive, setIsImmersive] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedText, setSelectedText] = useState<string>('');
  const [showHighlightMenu, setShowHighlightMenu] = useState<boolean>(false);
  const [annotationNote, setAnnotationNote] = useState<string>('');
  const [showAnnotationModal, setShowAnnotationModal] = useState<boolean>(false);
  const [, setBookmarks] = useState<Bookmark[]>([]);
  const [, setHighlights] = useState<Highlight[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');

  const [ttsState, setTtsState] = useState(speechService.getState());
  const [showTtsPlayer, setShowTtsPlayer] = useState<boolean>(false);

  useEffect(() => {
    const unsub = speechService.subscribe(() => {
      const st = speechService.getState();
      setTtsState(st);
      if (st.isPlaying || st.isPaused) {
        setShowTtsPlayer(true);
      }
    });
    return () => {
      unsub();
      speechService.stop();
    };
  }, []);

  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [epubData, setEpubData] = useState<ArrayBuffer | null>(null);
  const [epubLoading, setEpubLoading] = useState<boolean>(false);
  const [epubError, setEpubError] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeTheme = THEME_STYLES[theme];

  // Load EPUB Blob
  useEffect(() => {
    if (contentType === 'book' && bookData?.format === 'epub') {
      let isCancelled = false;
      const timer = setTimeout(() => {
        setEpubLoading(true);
        setEpubError(null);
      }, 0);

      getBlob(bookData.fileBlobKey || bookData.id)
        .then(async (blobItem) => {
          if (isCancelled) return;
          if (blobItem && blobItem.data instanceof Blob) {
            if (blobItem.data.size === 0) {
              setEpubError('O arquivo EPUB está vazio ou corrompido no armazenamento. Por favor, reimporte o arquivo.');
            } else {
              try {
                const buf = await blobItem.data.arrayBuffer();
                if (!isCancelled) setEpubData(buf);
              } catch {
                if (!isCancelled) setEpubError('Falha ao processar arquivo EPUB.');
              }
            }
          } else if (blobItem && blobItem.data instanceof ArrayBuffer) {
            if (blobItem.data.byteLength === 0) {
              setEpubError('O arquivo EPUB está vazio ou corrompido no armazenamento. Por favor, reimporte o arquivo.');
            } else {
              setEpubData(blobItem.data.slice(0));
            }
          } else if (blobItem && typeof blobItem.data === 'string') {
            const binary = atob(blobItem.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            setEpubData(bytes.buffer);
          } else if (bookData.storagePath && bookData.storagePath.startsWith('http')) {
            // Auto-download from Firebase Cloud Storage and cache locally
            try {
              const resp = await fetch(bookData.storagePath);
              if (!resp.ok) throw new Error('Falha ao baixar da nuvem');
              const buf = await resp.arrayBuffer();
              saveBlob(
                bookData.fileBlobKey || bookData.id,
                new Blob([buf]),
                'application/epub+zip',
                `${bookData.title}.epub`
              ).catch(() => {});
              if (!isCancelled) setEpubData(buf);
            } catch {
              if (!isCancelled) setEpubError('Falha ao carregar o arquivo EPUB da nuvem.');
            }
          } else {
            setEpubError('Arquivo do EPUB não encontrado no armazenamento.');
          }
          setEpubLoading(false);
        })
        .catch((err) => {
          if (!isCancelled) {
            console.error('Failed to load EPUB blob:', err);
            setEpubError('Falha ao carregar o arquivo EPUB do armazenamento.');
            setEpubLoading(false);
          }
        });

      return () => {
        clearTimeout(timer);
        isCancelled = true;
      };
    }
  }, [contentType, bookData]);

  // Load PDF Blob
  useEffect(() => {
    if (contentType === 'book' && bookData?.format === 'pdf') {
      let isCancelled = false;
      const timer = setTimeout(() => {
        setPdfLoading(true);
        setPdfError(null);
      }, 0);

      getBlob(bookData.fileBlobKey || bookData.id)
        .then(async (blobItem) => {
          if (isCancelled) return;
          if (blobItem && blobItem.data instanceof Blob) {
            if (blobItem.data.size === 0) {
              setPdfError('O arquivo PDF está vazio ou corrompido no armazenamento. Por favor, reimporte o arquivo.');
            } else {
              try {
                const buf = await blobItem.data.arrayBuffer();
                if (!isCancelled) setPdfData(buf);
              } catch {
                if (!isCancelled) setPdfError('Falha ao processar arquivo PDF.');
              }
            }
          } else if (blobItem && blobItem.data instanceof ArrayBuffer) {
            if (blobItem.data.byteLength === 0) {
              setPdfError('O arquivo PDF está vazio ou corrompido no armazenamento. Por favor, reimporte o arquivo.');
            } else {
              setPdfData(blobItem.data.slice(0));
            }
          } else if (blobItem && typeof blobItem.data === 'string') {
            const binary = atob(blobItem.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            setPdfData(bytes.buffer);
          } else if (bookData.storagePath && bookData.storagePath.startsWith('http')) {
            // Auto-download from Firebase Cloud Storage and cache locally
            try {
              const resp = await fetch(bookData.storagePath);
              if (!resp.ok) throw new Error('Falha ao baixar da nuvem');
              const buf = await resp.arrayBuffer();
              saveBlob(
                bookData.fileBlobKey || bookData.id,
                new Blob([buf]),
                'application/pdf',
                `${bookData.title}.pdf`
              ).catch(() => {});
              if (!isCancelled) setPdfData(buf);
            } catch {
              if (!isCancelled) setPdfError('Falha ao carregar o arquivo PDF da nuvem.');
            }
          } else {
            setPdfError('Arquivo do PDF não encontrado no armazenamento.');
          }
          setPdfLoading(false);
        })
        .catch((err) => {
          if (!isCancelled) {
            console.error('Failed to load PDF blob:', err);
            setPdfError('Falha ao carregar o arquivo PDF do armazenamento.');
            setPdfLoading(false);
          }
        });

      return () => {
        clearTimeout(timer);
        isCancelled = true;
      };
    }
  }, [contentType, bookData]);

  // Load progress and bookmarks
  useEffect(() => {
    async function loadSavedState() {
      const prog = await getReadingProgress(contentId);
      if (prog) {
        if (prog.zoomLevel) setZoomLevel(prog.zoomLevel);
        if (typeof prog.currentChapter === 'number') {
          if (contentType === 'bible') setCurrentChapter(prog.currentChapter);
          if (contentType === 'devotional') setCurrentDayNumber(prog.currentChapter);
        }
        if (prog.scrollOffset && scrollContainerRef.current) {
          setTimeout(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = prog.scrollOffset || 0;
            }
          }, 150);
        }
      }
      const bms = await getBookmarks(contentId);
      setBookmarks(bms);
      const hls = await getHighlights(contentId);
      setHighlights(hls);
    }
    loadSavedState();
  }, [contentId, contentType]);

  useEffect(() => {
    if (isImmersive) {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 4000);
    } else {
      const timer = setTimeout(() => {
        setShowControls(true);
      }, 0);
      return () => clearTimeout(timer);
    }
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, [isImmersive]);

  const handleContainerTap = () => {
    if (isImmersive) {
      setShowControls((prev) => !prev);
      if (!showControls) {
        if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
        hideControlsTimerRef.current = setTimeout(() => {
          setShowControls(false);
        }, 4000);
      }
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const percentage = Math.round((scrollTop / (scrollHeight - clientHeight || 1)) * 100);
    saveReadingProgress(
      contentId,
      contentType,
      contentType === 'bible' ? currentChapter : currentDayNumber,
      percentage,
      scrollTop,
      zoomLevel,
      contentType === 'bible' ? currentChapter : currentDayNumber
    );
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(2.5, +(prev + 0.15).toFixed(2)));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(0.75, +(prev - 0.15).toFixed(2)));
  const handleZoomReset = () => setZoomLevel(1);

  const handleAddBookmark = async () => {
    const loc =
      contentType === 'bible'
        ? `${currentBookName} ${currentChapter}`
        : contentType === 'devotional'
        ? `Dia ${currentDayNumber}`
        : `Posição ${Math.round(zoomLevel * 100)}%`;
    const bm = await addBookmark(contentId, contentType, title, loc, scrollContainerRef.current?.scrollTop);
    setBookmarks((prev) => [bm, ...prev]);
    showToast('Marcador adicionado!');
  };

  const handleMouseUpText = () => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      setSelectedText(sel.toString().trim());
      setShowHighlightMenu(true);
    }
  };

  const handleApplyHighlight = async (color: HighlightColor, category?: HighlightCategory) => {
    if (!selectedText) return;
    const loc =
      contentType === 'bible'
        ? `${currentBookName} ${currentChapter}`
        : contentType === 'devotional'
        ? `Dia ${currentDayNumber}`
        : title;
    const hl = await addHighlight(contentId, contentType, selectedText, color, loc, annotationNote, category);
    setHighlights((prev) => [hl, ...prev]);
    setShowHighlightMenu(false);
    setSelectedText('');
    setAnnotationNote('');
    showToast('Trecho destacado com sucesso!');
  };

  const handleToggleTts = () => {
    if (ttsState.isPlaying) {
      speechService.togglePlayPause();
      return;
    }

    let textToRead = '';
    if (selectedText.trim()) {
      textToRead = selectedText;
    } else if (contentType === 'bible') {
      const vList = getChapterVerses(currentBookName, currentChapter);
      textToRead = `${currentBookName}, capítulo ${currentChapter}. ` + vList.map((v) => `${v.number}. ${v.text}`).join(' ');
    } else if (contentType === 'devotional') {
      const cur = devotionalDays.find((d) => d.dayNumber === currentDayNumber) || devotionalDays[0];
      if (cur) {
        textToRead = `Devocional Dia ${cur.dayNumber}. ${cur.title}. ${cur.content || ''}. ${cur.reflectionPrompt ? 'Momento de reflexão: ' + cur.reflectionPrompt : ''}`;
      }
    } else if (bookData) {
      textToRead = `${bookData.title}. ${bookData.description || ''}. ${bookData.textContent || ''}`;
    }

    if (!textToRead.trim()) {
      showToast('Nenhum texto disponível para leitura em voz alta.');
      return;
    }

    speechService.speak(textToRead, {
      rate: ttsState.rate,
      onStart: () => {
        setShowTtsPlayer(true);
        showToast('Iniciando leitura em voz alta...');
      },
      onEnd: () => showToast('Leitura em voz alta concluída!'),
    });
  };

  const handleCycleTtsRate = () => {
    const rates = [0.8, 1.0, 1.25, 1.5, 2.0];
    const curIdx = rates.indexOf(ttsState.rate);
    const nextRate = rates[(curIdx + 1) % rates.length] || 1.0;
    speechService.setRate(nextRate);
    showToast(`Velocidade de áudio: ${nextRate}x`);
  };

  const handleStopTts = () => {
    speechService.stop();
    setShowTtsPlayer(false);
  };

  const handleSpeakSelectedText = () => {
    if (!selectedText.trim()) return;
    speechService.speak(selectedText, {
      rate: ttsState.rate,
      onStart: () => {
        setShowTtsPlayer(true);
        setShowHighlightMenu(false);
      },
    });
  };

  const handleSaveAnnotation = async () => {
    if (!annotationNote.trim()) return;
    const loc =
      contentType === 'bible'
        ? `${currentBookName} ${currentChapter}`
        : contentType === 'devotional'
        ? `Dia ${currentDayNumber}`
        : title;
    await addAnnotation(contentId, contentType, annotationNote, loc, selectedText || title);
    setShowAnnotationModal(false);
    setAnnotationNote('');
    showToast('Anotação espiritual salva!');
  };

  const showToast = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(''), 3000);
  };

  const verses = contentType === 'bible' ? getChapterVerses(currentBookName, currentChapter) : [];
  const currentDevotionalDay =
    contentType === 'devotional'
      ? devotionalDays.find((d) => d.dayNumber === currentDayNumber) || devotionalDays[0]
      : null;

  if (contentType === 'book' && bookData?.format === 'pdf') {
    if (pdfLoading) {
      return (
        <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col items-center justify-center text-slate-900 gap-3 select-none">
          <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold">Carregando leitor de PDF...</p>
          <span className="text-xs text-slate-500">{bookData.title}</span>
        </div>
      );
    }

    if (pdfError || !pdfData) {
      return (
        <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col items-center justify-center text-slate-900 p-6 text-center select-none">
          <div className="p-5 rounded-2xl bg-white border border-rose-200 text-slate-800 max-w-md space-y-3 shadow-md">
            <h2 className="text-base font-bold text-rose-600">Erro ao abrir PDF</h2>
            <p className="text-xs text-slate-600">{pdfError || 'Documento PDF não encontrado no armazenamento local.'}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              Voltar à Biblioteca
            </button>
          </div>
        </div>
      );
    }

    return (
      <PdfReader
        bookId={bookData.id}
        title={bookData.title}
        author={bookData.author}
        pdfData={pdfData}
        targetChapterQuery={targetChapterQuery}
        targetBookName={targetBookName}
        targetChapterNumber={targetChapterNumber}
        onClose={onClose}
        onMarkAsCompleted={() =>
          onMarkAsRead &&
          onMarkAsRead({
            bookName: targetBookName,
            chapterNumber: targetChapterNumber,
          })
        }
      />
    );
  }

  if (contentType === 'book' && bookData?.format === 'epub') {
    if (epubLoading) {
      return (
        <div className="fixed inset-0 z-50 bg-[#0B1120] flex flex-col items-center justify-center text-white gap-3 select-none">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold">Carregando leitor de EPUB real...</p>
          <span className="text-xs text-slate-400">{bookData.title}</span>
        </div>
      );
    }

    if (epubError || !epubData) {
      return (
        <div className="fixed inset-0 z-50 bg-[#0B1120] flex flex-col items-center justify-center text-white p-6 text-center select-none">
          <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 max-w-md space-y-3">
            <h2 className="text-base font-bold">Erro ao abrir EPUB</h2>
            <p className="text-xs text-slate-300">{epubError || 'Arquivo EPUB não encontrado no armazenamento local.'}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Voltar à Biblioteca
            </button>
          </div>
        </div>
      );
    }

    return (
      <EpubReader
        bookId={bookData.id}
        title={bookData.title}
        author={bookData.author}
        epubData={epubData}
        targetChapterQuery={targetChapterQuery}
        targetBookName={targetBookName}
        targetChapterNumber={targetChapterNumber}
        onClose={onClose}
        onMarkAsCompleted={() =>
          onMarkAsRead &&
          onMarkAsRead({
            bookName: targetBookName,
            chapterNumber: targetChapterNumber,
          })
        }
      />
    );
  }

  return (
    <div
      id="reader-modal-overlay"
      className={`fixed inset-0 z-50 flex flex-col ${activeTheme.bg} ${activeTheme.text} transition-colors duration-200 select-text`}
    >
      {isImmersive && !showControls && (
        <button
          id="btn-exit-immersive-floating"
          onClick={() => {
            setIsImmersive(false);
            setShowControls(true);
          }}
          className="fixed top-4 right-4 z-50 bg-slate-900/90 text-slate-200 text-xs px-3 py-1.5 rounded-full border border-slate-700 shadow-lg flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span>Sair do Modo Imersivo</span>
        </button>
      )}

      {showControls && (
        <header
          id="reader-header-bar"
          className={`flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b ${activeTheme.border} ${activeTheme.cardBg} backdrop-blur-md z-40`}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <button
              id="reader-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="Fechar Leitor"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="truncate">
              <h2 className="text-sm font-semibold truncate font-serif">
                {contentType === 'bible'
                  ? `${currentBookName} ${currentChapter}`
                  : contentType === 'devotional'
                  ? `Dia ${currentDayNumber} — ${currentDevotionalDay?.title || title}`
                  : title}
              </h2>
              {subtitle && <p className="text-[11px] opacity-75 truncate">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              id="reader-tts-btn"
              onClick={handleToggleTts}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                ttsState.isPlaying
                  ? 'bg-[#A58ADB] text-white shadow-xs animate-pulse'
                  : 'hover:bg-black/10 dark:hover:bg-white/10'
              }`}
              title={ttsState.isPlaying ? 'Pausar leitura em voz alta' : 'Ouvir em Voz Alta (Audiobook)'}
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <button
              id="reader-search-btn"
              onClick={() => setShowSearch(!showSearch)}
              className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              title="Pesquisar no texto"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              id="reader-bookmark-btn"
              onClick={handleAddBookmark}
              className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              title="Adicionar Marcador"
            >
              <BookmarkIcon className="w-4 h-4" />
            </button>
            <button
              id="reader-note-btn"
              onClick={() => setShowAnnotationModal(true)}
              className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              title="Fazer Anotação"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <button
              id="reader-settings-btn"
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              title="Ajustes de Leitura"
            >
              <Sliders className="w-4 h-4" />
            </button>
            <button
              id="reader-immersive-toggle-btn"
              onClick={() => setIsImmersive(!isImmersive)}
              className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-[#A58ADB] cursor-pointer"
              title={isImmersive ? 'Sair do Modo Imersivo' : 'Modo Imersivo'}
            >
              {isImmersive ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </header>
      )}

      {showSettings && (
        <div
          id="reader-settings-drawer"
          className={`absolute top-12 right-4 z-50 w-80 p-4 rounded-xl shadow-2xl border ${activeTheme.border} ${activeTheme.cardBg} text-sm space-y-4 animate-in fade-in duration-150`}
        >
          <div className="flex justify-between items-center pb-2 border-b border-black/10 dark:border-white/10">
            <span className="font-semibold">Ajustes de Leitura</span>
            <button onClick={() => setShowSettings(false)} className="cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="text-xs opacity-75 font-medium mb-1.5 block">Tema Visual</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['light', 'cream', 'sepia', 'gray', 'dark', 'oled'] as ReaderTheme[]).map((thKey) => (
                <button
                  key={thKey}
                  onClick={() => setTheme(thKey)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                    theme === thKey
                      ? 'ring-2 ring-[#A58ADB] font-bold'
                      : 'border-black/10 dark:border-white/10'
                  } ${THEME_STYLES[thKey].bg} ${THEME_STYLES[thKey].text}`}
                >
                  {THEME_STYLES[thKey].name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs opacity-75 mb-1">
              <span>Tamanho do Texto</span>
              <span>{fontSize}px</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFontSize((s) => Math.max(14, s - 2))}
                className="px-2 py-1 bg-black/10 dark:bg-white/10 rounded font-semibold text-xs cursor-pointer"
              >
                A-
              </button>
              <input
                type="range"
                min="14"
                max="32"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <button
                onClick={() => setFontSize((s) => Math.min(32, s + 2))}
                className="px-2 py-1 bg-black/10 dark:bg-white/10 rounded font-semibold text-sm cursor-pointer"
              >
                A+
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs opacity-75 font-medium mb-1.5 block">Tipografia</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => setFontFamily('serif')}
                className={`py-1 rounded text-xs font-serif cursor-pointer ${
                  fontFamily === 'serif' ? 'bg-amber-500/20 font-bold' : 'bg-black/5 dark:bg-white/5'
                }`}
              >
                Serifada
              </button>
              <button
                onClick={() => setFontFamily('sans')}
                className={`py-1 rounded text-xs font-sans cursor-pointer ${
                  fontFamily === 'sans' ? 'bg-amber-500/20 font-bold' : 'bg-black/5 dark:bg-white/5'
                }`}
              >
                Sem Serifa
              </button>
              <button
                onClick={() => setFontFamily('mono')}
                className={`py-1 rounded text-xs font-mono cursor-pointer ${
                  fontFamily === 'mono' ? 'bg-amber-500/20 font-bold' : 'bg-black/5 dark:bg-white/5'
                }`}
              >
                Monospace
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs opacity-75 font-medium mb-1.5 block">Espaçamento Entre Linhas</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[1.4, 1.7, 2.0].map((val) => (
                <button
                  key={val}
                  onClick={() => setLineHeight(val)}
                  className={`py-1 rounded text-xs cursor-pointer ${
                    lineHeight === val ? 'bg-amber-500/20 font-bold' : 'bg-black/5 dark:bg-white/5'
                  }`}
                >
                  {val === 1.4 ? 'Normal' : val === 1.7 ? 'Confortável' : 'Amplo'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSearch && (
        <div
          id="reader-search-bar"
          className={`flex items-center gap-2 px-4 py-2 border-b ${activeTheme.border} ${activeTheme.cardBg}`}
        >
          <Search className="w-4 h-4 opacity-50" />
          <input
            type="text"
            placeholder="Pesquisar palavra ou versículo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-xs opacity-75 cursor-pointer">
              Limpar
            </button>
          )}
          <button onClick={() => setShowSearch(false)} className="text-xs text-[#A58ADB] font-medium cursor-pointer">
            Fechar
          </button>
        </div>
      )}

      {feedbackMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#A58ADB] text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg transition-all animate-bounce">
          {feedbackMessage}
        </div>
      )}

      {/* Main Continuous Scroll */}
      <main
        id="reader-scroll-canvas"
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onClick={handleContainerTap}
        onMouseUp={handleMouseUpText}
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 w-full max-w-4xl mx-auto focus:outline-none scroll-smooth"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight,
          fontFamily:
            fontFamily === 'serif'
              ? 'Georgia, Cambria, "Times New Roman", Times, serif'
              : fontFamily === 'mono'
              ? 'Consolas, Monaco, "Courier New", monospace'
              : 'system-ui, -apple-system, sans-serif',
          transform: `scale(${zoomLevel})`,
          transformOrigin: 'top center',
          transition: 'transform 0.15s ease-out',
        }}
      >
        {contentType === 'bible' && (
          <div id="bible-content-wrapper" className="space-y-6 pb-20">
            <div className="text-center border-b border-black/10 dark:border-white/10 pb-6 mb-6">
              <span className="text-xs tracking-wider uppercase font-semibold opacity-60">
                {currentBookName}
              </span>
              <h1 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight mt-1">
                Capítulo {currentChapter}
              </h1>
            </div>

            <div className="space-y-3.5">
              {verses.map((v) => {
                const isMatch =
                  searchQuery.trim().length > 1 &&
                  v.text.toLowerCase().includes(searchQuery.toLowerCase());
                return (
                  <p key={v.number} className="leading-relaxed group relative">
                    <sup className="font-bold text-[0.75em] text-amber-500/80 mr-1.5 select-none">
                      {v.number}
                    </sup>
                    <span
                      className={`${
                        isMatch
                          ? 'bg-amber-300 dark:bg-amber-500/40 text-slate-950 dark:text-amber-200 px-1 rounded'
                          : ''
                      }`}
                    >
                      {v.text}
                    </span>
                  </p>
                );
              })}
            </div>
          </div>
        )}

        {contentType === 'devotional' && currentDevotionalDay && (
          <div id="devotional-content-wrapper" className="space-y-6 pb-20 max-w-2xl mx-auto">
            <div className="text-center border-b border-black/10 dark:border-white/10 pb-6 mb-6">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 mb-2">
                Dia {currentDevotionalDay.dayNumber}
              </span>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight">
                {currentDevotionalDay.title}
              </h1>
              {currentDevotionalDay.dateStr && (
                <p className="text-xs opacity-75 mt-1 font-medium">{currentDevotionalDay.dateStr}</p>
              )}
            </div>

            {currentDevotionalDay.scriptureRef && (
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 my-4 italic text-sm sm:text-base border-l-4 border-l-amber-500">
                &ldquo;{currentDevotionalDay.scriptureRef}&rdquo;
              </div>
            )}

            <div className="space-y-4 text-justify whitespace-pre-line leading-relaxed">
              {currentDevotionalDay.content}
            </div>

            {currentDevotionalDay.reflectionPrompt && (
              <div className="p-5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 mt-8">
                <h3 className="text-xs uppercase tracking-wider font-bold text-amber-400 mb-2">
                  Momento de Reflexão
                </h3>
                <p className="text-sm font-medium">{currentDevotionalDay.reflectionPrompt}</p>
              </div>
            )}
          </div>
        )}

        {contentType === 'book' && bookData && (
          <div id="book-content-wrapper" className="space-y-6 pb-20">
            {bookData.format === 'cbz' && bookData.images && bookData.images.length > 0 && (
              <div className="space-y-4 flex flex-col items-center">
                {bookData.images.map((imgSrc, idx) => (
                  <div key={idx} className="w-full max-w-2xl bg-black/20 rounded shadow-md overflow-hidden">
                    <img
                      src={imgSrc}
                      alt={`Página ${idx + 1}`}
                      className="w-full h-auto object-contain block mx-auto"
                      loading="lazy"
                    />
                    <div className="text-center py-1 text-[11px] opacity-60">
                      Página {idx + 1} de {bookData.totalPages || bookData.images?.length}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(bookData.format === 'txt' || bookData.format === 'mobi') && (
              <div className="space-y-4 max-w-2xl mx-auto leading-relaxed">
                <div className="text-center border-b border-black/10 dark:border-white/10 pb-4 mb-6">
                  <h1 className="text-2xl font-serif font-bold">{bookData.title}</h1>
                  <p className="text-xs opacity-75">{bookData.author}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 uppercase font-semibold">
                    {bookData.format.toUpperCase()}
                  </span>
                </div>
                {bookData.description && (
                  <div className="p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm opacity-90">
                    {bookData.description}
                  </div>
                )}
                <div className="text-justify whitespace-pre-line">
                  {bookData.textContent ||
                    'Conteúdo pronto para leitura contínua com ajuste automático de largura e restauração de posição.'}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Highlight Quick Menu */}
      {showHighlightMenu && (
        <div
          id="reader-highlight-popup"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#29243A]/95 text-white p-2.5 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-2 animate-in zoom-in-95 backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5 pl-1 pr-2 border-r border-white/15">
            <button
              onClick={() => handleApplyHighlight('purple', 'meditation')}
              className="w-6 h-6 rounded-full bg-[#A58ADB] hover:scale-125 transition-transform shadow cursor-pointer ring-1 ring-white/30"
              title="Lilás (Meditação)"
            />
            <button
              onClick={() => handleApplyHighlight('gold', 'promise')}
              className="w-6 h-6 rounded-full bg-amber-400 hover:scale-125 transition-transform shadow cursor-pointer ring-1 ring-white/30"
              title="Dourado (Promessa)"
            />
            <button
              onClick={() => handleApplyHighlight('emerald', 'action')}
              className="w-6 h-6 rounded-full bg-emerald-500 hover:scale-125 transition-transform shadow cursor-pointer ring-1 ring-white/30"
              title="Verde (Prática/Ação)"
            />
            <button
              onClick={() => handleApplyHighlight('sky', 'doctrine')}
              className="w-6 h-6 rounded-full bg-sky-400 hover:scale-125 transition-transform shadow cursor-pointer ring-1 ring-white/30"
              title="Azul (Doutrina/Conhecimento)"
            />
            <button
              onClick={() => handleApplyHighlight('rose', 'prayer')}
              className="w-6 h-6 rounded-full bg-rose-400 hover:scale-125 transition-transform shadow cursor-pointer ring-1 ring-white/30"
              title="Rosa (Oração/Gratidão)"
            />
          </div>

          <button
            onClick={handleSpeakSelectedText}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            title="Ouvir este trecho em voz alta"
          >
            <Volume2 className="w-3.5 h-3.5 text-[#C4B1F0]" />
            <span className="hidden sm:inline">Ouvir</span>
          </button>

          <button
            onClick={() => {
              setShowHighlightMenu(false);
              setShowAnnotationModal(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            title="Fazer anotação no trecho"
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden sm:inline">Anotar</span>
          </button>

          <button
            onClick={() => setShowHighlightMenu(false)}
            className="p-1.5 text-white/50 hover:text-white rounded-lg cursor-pointer"
            title="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Floating Text-to-Speech Player Bar */}
      {showTtsPlayer && (
        <div
          id="reader-tts-floating-player"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-md bg-white/95 dark:bg-[#1E1B2E]/95 backdrop-blur-md border border-[#A58ADB]/40 text-[#29243A] dark:text-white rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-200"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#F0EAFE] dark:bg-white/10 text-[#A58ADB] flex items-center justify-center shrink-0">
              <Headphones className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold truncate block">
                {ttsState.isPaused ? 'Áudio Pausado' : 'Reproduzindo em Voz Alta'}
              </span>
              <span className="text-[10px] text-[#827A96] block truncate">
                Parte {ttsState.currentChunk} de {ttsState.totalChunks} · {ttsState.rate}x
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleCycleTtsRate}
              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-[#FAF9FD] dark:bg-white/10 border border-[#EAE5F4] dark:border-white/10 text-[#A58ADB] hover:bg-[#F0EAFE] cursor-pointer"
              title="Alterar velocidade de áudio"
            >
              {ttsState.rate}x
            </button>

            <button
              onClick={() => speechService.togglePlayPause()}
              className="w-8 h-8 rounded-xl bg-[#A58ADB] text-white flex items-center justify-center cursor-pointer shadow-xs hover:bg-[#8C6ECD] transition-transform active:scale-95"
              title={ttsState.isPaused ? 'Continuar' : 'Pausar'}
            >
              {ttsState.isPaused ? (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              ) : (
                <Pause className="w-4 h-4 fill-current" />
              )}
            </button>

            <button
              onClick={handleStopTts}
              className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
              title="Parar e fechar áudio"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          </div>
        </div>
      )}

      {/* Annotation Modal */}
      {showAnnotationModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-base font-serif">Minha Anotação Espiritual</h3>
              <button onClick={() => setShowAnnotationModal(false)} className="cursor-pointer">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            {selectedText && (
              <div className="p-3 bg-slate-800/80 rounded-xl text-xs italic border-l-2 border-amber-400 text-slate-300">
                &ldquo;{selectedText}&rdquo;
              </div>
            )}
            <textarea
              rows={4}
              placeholder="Escreva sua reflexão, oração ou aprendizado espiritual..."
              value={annotationNote}
              onChange={(e) => setAnnotationNote(e.target.value)}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-amber-500"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAnnotationModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveAnnotation}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer"
              >
                Salvar Anotação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sticky Control Bar */}
      {showControls && (
        <footer
          id="reader-bottom-controls"
          className={`flex-shrink-0 flex items-center justify-between px-4 py-3 border-t ${activeTheme.border} ${activeTheme.cardBg} z-40`}
        >
          <div className="flex items-center gap-2">
            {contentType === 'bible' && (
              <>
                <button
                  id="reader-prev-chapter"
                  disabled={currentChapter <= 1}
                  onClick={() => {
                    setCurrentChapter((c) => Math.max(1, c - 1));
                    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
                  }}
                  className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 disabled:opacity-30 cursor-pointer"
                  title="Capítulo Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium">Cap. {currentChapter}</span>
                <button
                  id="reader-next-chapter"
                  disabled={currentChapter >= 150}
                  onClick={() => {
                    setCurrentChapter((c) => c + 1);
                    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
                  }}
                  className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 disabled:opacity-30 cursor-pointer"
                  title="Próximo Capítulo"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {contentType === 'devotional' && (
              <>
                <button
                  id="reader-prev-day"
                  disabled={currentDayNumber <= 1}
                  onClick={() => {
                    setCurrentDayNumber((d) => Math.max(1, d - 1));
                    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
                  }}
                  className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 disabled:opacity-30 cursor-pointer"
                  title="Dia Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium">Dia {currentDayNumber}</span>
                <button
                  id="reader-next-day"
                  disabled={currentDayNumber >= devotionalDays.length}
                  onClick={() => {
                    setCurrentDayNumber((d) => Math.min(devotionalDays.length, d + 1));
                    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
                  }}
                  className="p-1.5 rounded-lg border border-black/10 dark:border-white/10 disabled:opacity-30 cursor-pointer"
                  title="Próximo Dia"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            <div className="hidden sm:flex items-center gap-1 border-l border-black/10 dark:border-white/10 pl-3 ml-2">
              <button
                id="reader-zoom-out"
                onClick={handleZoomOut}
                className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                title="Diminuir Zoom"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono w-9 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                id="reader-zoom-in"
                onClick={handleZoomIn}
                className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                title="Aumentar Zoom"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                id="reader-zoom-reset"
                onClick={handleZoomReset}
                className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[10px] cursor-pointer"
                title="Redefinir Zoom"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {onMarkAsRead && (
            <button
              id="reader-mark-completed-btn"
              onClick={() => {
                onMarkAsRead({
                  bookName: currentBookName,
                  chapterNumber: currentChapter,
                  dayNumber: currentDayNumber,
                });
                showToast('Leitura concluída e registrada com sucesso!');
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer ${
                isReadAlready
                  ? 'bg-[#B9DCCB] text-emerald-950 font-bold'
                  : 'bg-[#A58ADB] text-white hover:bg-[#9376CD]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isReadAlready ? '✓ Concluído' : 'MARCAR COMO LIDO'}</span>
            </button>
          )}
        </footer>
      )}
    </div>
  );
};
