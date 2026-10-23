'use client';

import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Sun,
  Sunset,
  Moon,
  Clock,
  Library,
  Plus,
  Minus,
  Check,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Edit3,
  Upload,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { Book, Bible } from '@/types';
import { getBooks, importBookFromFile } from '@/lib/bookService';
import { getBibles, cleanLegacyAlmeidaBibles } from '@/lib/bibleService';
import {
  BIBLE_BOOKS_CATALOG,
  getBibleBookAndChapter,
  formatChapterRange,
  getGlobalChapterFromBook,
  getChaptersForDate,
  getDateLockDetails,
} from '@/lib/bibleData';

interface BibleViewProps {
  onOpenReader: (params: {
    contentType: 'book' | 'bible';
    contentId: string;
    title: string;
    subtitle?: string;
    bookData?: Book;
    bookName?: string;
    chapterNumber?: number;
    targetBookName?: string;
    targetChapterNumber?: number;
    targetChapterQuery?: string;
    bibleBooks?: any[];
    period?: 'morning' | 'afternoon' | 'night' | string;
    isReadAlready?: boolean;
    initialChapterOrDay?: number;
  }) => void;
  selectedDateStr?: string;
  onDateChange?: (date: string) => void;
}

interface BiblePlanConfig {
  morningCount: number;
  afternoonCount: number;
  nightCount: number;
}

interface PeriodStatus {
  morning: boolean;
  afternoon: boolean;
  night: boolean;
}

export const BibleView: React.FC<BibleViewProps> = ({
  onOpenReader,
  selectedDateStr,
  onDateChange,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const activeDate = selectedDateStr || todayStr;

  const [libraryBooks, setLibraryBooks] = useState<Book[]>([]);
  const [officialBibles, setOfficialBibles] = useState<Bible[]>([]);
  const [selectedBibleBook, setSelectedBibleBook] = useState<Book | null>(null);
  const [useOfficialAlmeida, setUseOfficialAlmeida] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const [planConfig, setPlanConfig] = useState<BiblePlanConfig>({
    morningCount: 1,
    afternoonCount: 1,
    nightCount: 1,
  });

  const [planStartDate, setPlanStartDate] = useState<string>(todayStr);
  const [planStartChapter, setPlanStartChapter] = useState<number>(1);
  const [periodStatus, setPeriodStatus] = useState<PeriodStatus>({
    morning: false,
    afternoon: false,
    night: false,
  });

  const [showBiblePickerModal, setShowBiblePickerModal] = useState<boolean>(false);
  const [isImportingBible, setIsImportingBible] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [showJumpModal, setShowJumpModal] = useState<boolean>(false);
  const [jumpBookId, setJumpBookId] = useState<string>('GEN');
  const [jumpChapter, setJumpChapter] = useState<number>(1);

  const [morningNote, setMorningNote] = useState<string>('');
  const [afternoonNote, setAfternoonNote] = useState<string>('');
  const [nightNote, setNightNote] = useState<string>('');
  const [showNotes, setShowNotes] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  useEffect(() => {
    let isCancelled = false;
    async function loadData() {
      try {
        await cleanLegacyAlmeidaBibles();
        const books = await getBooks();
        if (isCancelled) return;
        setLibraryBooks(books);

        const bibles = await getBibles();
        if (isCancelled) return;
        setOfficialBibles(bibles);

        const savedConfig = localStorage.getItem('altto_bible_plan_config');
        if (savedConfig) {
          try {
            if (!isCancelled) setPlanConfig(JSON.parse(savedConfig));
          } catch {
            if (!isCancelled) setPlanConfig({ morningCount: 1, afternoonCount: 1, nightCount: 1 });
          }
        }

        const savedStartDate = localStorage.getItem('altto_bible_plan_start_date');
        if (savedStartDate) {
          if (!isCancelled) setPlanStartDate(savedStartDate);
        } else {
          localStorage.setItem('altto_bible_plan_start_date', todayStr);
          if (!isCancelled) setPlanStartDate(todayStr);
        }

        const savedStartChapter = localStorage.getItem('altto_bible_plan_start_chapter');
        if (savedStartChapter) {
          const ch = parseInt(savedStartChapter, 10);
          if (!isNaN(ch) && ch >= 1 && ch <= 1189) {
            if (!isCancelled) setPlanStartChapter(ch);
          }
        } else {
          const oldChapter = localStorage.getItem('altto_bible_current_chapter');
          const ch = oldChapter ? parseInt(oldChapter, 10) : 1;
          const validCh = !isNaN(ch) && ch >= 1 && ch <= 1189 ? ch : 1;
          localStorage.setItem('altto_bible_plan_start_chapter', validCh.toString());
          if (!isCancelled) setPlanStartChapter(validCh);
        }

        const savedBibleBookId = localStorage.getItem('altto_selected_bible_book_id');

        if (isCancelled) return;
        if (savedBibleBookId) {
          const found = books.find((b) => b.id === savedBibleBookId);
          if (found) {
            setSelectedBibleBook(found);
            setUseOfficialAlmeida(false);
          } else {
            setSelectedBibleBook(null);
            setUseOfficialAlmeida(true);
          }
        } else {
          setSelectedBibleBook(null);
          setUseOfficialAlmeida(true);
        }

        const savedStatus = localStorage.getItem(`altto_bible_status_${activeDate}`);
        if (savedStatus) {
          try {
            if (!isCancelled) setPeriodStatus(JSON.parse(savedStatus));
          } catch {
            if (!isCancelled) setPeriodStatus({ morning: false, afternoon: false, night: false });
          }
        } else {
          if (!isCancelled) setPeriodStatus({ morning: false, afternoon: false, night: false });
        }

        const savedNotes = localStorage.getItem(`altto_bible_notes_${activeDate}`);
        if (savedNotes) {
          try {
            const parsed = JSON.parse(savedNotes);
            if (!isCancelled) {
              setMorningNote(parsed.morning || '');
              setAfternoonNote(parsed.afternoon || '');
              setNightNote(parsed.night || '');
            }
          } catch {}
        }
      } catch (err) {
        console.warn('Erro ao carregar dados da Bíblia:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      isCancelled = true;
    };
  }, [activeDate, refreshTrigger, todayStr]);

  const updatePeriodCount = (period: 'morning' | 'afternoon' | 'night', delta: number) => {
    setPlanConfig((prev) => {
      const current = prev[`${period}Count`];
      const nextVal = Math.max(1, Math.min(20, current + delta));
      const updated = { ...prev, [`${period}Count`]: nextVal };
      localStorage.setItem('altto_bible_plan_config', JSON.stringify(updated));
      return updated;
    });
    setToastMessage(`✓ Quantidade de capítulos da ${period === 'morning' ? 'Manhã' : period === 'afternoon' ? 'Tarde' : 'Noite'} atualizada!`);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const lockDetails = getDateLockDetails(activeDate, todayStr, planStartDate);
  const isDateLocked = lockDetails.isLocked;
  const isMorningLocked = isDateLocked;
  const isAfternoonLocked = isDateLocked || !periodStatus.morning;
  const isNightLocked = isDateLocked || !periodStatus.afternoon;

  const getLockBlockedMessage = () => {
    if (lockDetails.blockingDate) {
      const periodName =
        lockDetails.blockingPeriod === 'morning'
          ? 'Manhã'
          : lockDetails.blockingPeriod === 'afternoon'
          ? 'Tarde'
          : 'Noite';
      return `🔒 Bloqueado: Conclua os capítulos pendentes (${periodName}) do dia ${lockDetails.blockingDate} primeiro.`;
    }
    return `🔒 Bloqueado: Conclua os capítulos de dias anteriores primeiro.`;
  };

  useEffect(() => {
    const handleStatusSync = () => {
      const savedStatus = localStorage.getItem(`altto_bible_status_${activeDate}`);
      if (savedStatus) {
        try {
          setPeriodStatus(JSON.parse(savedStatus));
        } catch {}
      }
    };
    window.addEventListener('altto_bible_status_updated', handleStatusSync);
    return () => window.removeEventListener('altto_bible_status_updated', handleStatusSync);
  }, [activeDate]);

  const handleTogglePeriod = (period: 'morning' | 'afternoon' | 'night') => {
    if (isDateLocked) {
      setToastMessage(getLockBlockedMessage());
      setTimeout(() => setToastMessage(''), 4000);
      return;
    }
    if (period === 'afternoon' && !periodStatus.morning) {
      setToastMessage('🔒 Bloqueado: Conclua a leitura da Manhã primeiro para liberar a Tarde.');
      setTimeout(() => setToastMessage(''), 3500);
      return;
    }
    if (period === 'night' && !periodStatus.afternoon) {
      setToastMessage('🔒 Bloqueado: Conclua a leitura da Tarde primeiro para liberar a Noite.');
      setTimeout(() => setToastMessage(''), 3500);
      return;
    }

    setPeriodStatus((prev) => {
      const willBeDone = !prev[period];
      const updated = { ...prev, [period]: willBeDone };
      if (period === 'morning' && !willBeDone) {
        updated.afternoon = false;
        updated.night = false;
      } else if (period === 'afternoon' && !willBeDone) {
        updated.night = false;
      }
      localStorage.setItem(`altto_bible_status_${activeDate}`, JSON.stringify(updated));
      window.dispatchEvent(new Event('altto_bible_status_updated'));

      if (willBeDone) {
        if (period === 'morning') {
          setToastMessage('✨ Manhã concluída! Turno da Tarde liberado para leitura.');
        } else if (period === 'afternoon') {
          setToastMessage('✨ Tarde concluída! Turno da Noite liberado para leitura.');
        } else if (period === 'night') {
          setToastMessage('Glória a Deus! Você concluiu todas as leituras de hoje! Amanhã desbloqueado.');
        }
        setTimeout(() => setToastMessage(''), 4000);
      }
      return updated;
    });
  };

  const handleSelectLibraryBible = (book: Book) => {
    setSelectedBibleBook(book);
    setUseOfficialAlmeida(false);
    localStorage.setItem('altto_selected_bible_book_id', book.id);
    localStorage.setItem('altto_use_official_almeida', 'false');
    setShowBiblePickerModal(false);
    setToastMessage(`✓ "${book.title}" definida como sua Bíblia da Biblioteca!`);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleSelectCanonicalBible = () => {
    setUseOfficialAlmeida(true);
    setSelectedBibleBook(null);
    localStorage.removeItem('altto_selected_bible_book_id');
    localStorage.setItem('altto_use_canonical_bible', 'true');
    setShowBiblePickerModal(false);
    setToastMessage('✓ Plano Bíblico Canônico (66 Livros) selecionado!');
    setTimeout(() => setToastMessage(''), 3500);
  };

  const chaptersPlan = getChaptersForDate({
    activeDate,
    planStartDate,
    planStartChapter,
    morningCount: planConfig.morningCount,
    afternoonCount: planConfig.afternoonCount,
    nightCount: planConfig.nightCount,
  });

  const {
    morningStart,
    morningEnd,
    afternoonStart,
    afternoonEnd,
    nightStart,
    nightEnd,
    totalDaily,
  } = chaptersPlan;

  const handleNavigateDate = (offsetDays: number) => {
    const [y, m, d] = activeDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + offsetDays);
    const ny = dateObj.getFullYear();
    const nm = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const nd = dateObj.getDate().toString().padStart(2, '0');
    const newDateStr = `${ny}-${nm}-${nd}`;
    if (onDateChange) {
      onDateChange(newDateStr);
    }
  };

  const handleGoToToday = () => {
    if (onDateChange) {
      onDateChange(todayStr);
    }
  };

  const handleOpenPeriodReader = (
    startGlobal: number,
    count: number,
    period: 'morning' | 'afternoon' | 'night',
    periodLabel: string
  ) => {
    if (isDateLocked) {
      setToastMessage(getLockBlockedMessage());
      setTimeout(() => setToastMessage(''), 4500);
      return;
    }
    if (period === 'afternoon' && !periodStatus.morning) {
      setToastMessage('🔒 Bloqueado: Conclua a leitura da Manhã primeiro para liberar a Tarde.');
      setTimeout(() => setToastMessage(''), 4000);
      return;
    }
    if (period === 'night' && !periodStatus.afternoon) {
      setToastMessage('🔒 Bloqueado: Conclua a leitura da Tarde primeiro para liberar a Noite.');
      setTimeout(() => setToastMessage(''), 4000);
      return;
    }

    const chapterInfo = getBibleBookAndChapter(startGlobal);

    if (useOfficialAlmeida || !selectedBibleBook) {
      const bibleToUse = officialBibles[0];
      onOpenReader({
        contentType: 'bible',
        contentId: bibleToUse ? bibleToUse.id : 'official-almeida',
        title: `Bíblia Sagrada — ${periodLabel}`,
        subtitle: formatChapterRange(startGlobal, count),
        bookName: chapterInfo.bookName,
        chapterNumber: chapterInfo.chapter,
        targetBookName: chapterInfo.bookName,
        targetChapterNumber: chapterInfo.chapter,
        targetChapterQuery: `${chapterInfo.bookName} ${chapterInfo.chapter}`,
        bibleBooks: bibleToUse?.books,
        period,
      });
    } else {
      onOpenReader({
        contentType: 'book',
        contentId: selectedBibleBook.id,
        title: `${selectedBibleBook.title} — ${periodLabel}`,
        subtitle: formatChapterRange(startGlobal, count),
        bookData: selectedBibleBook,
        bookName: chapterInfo.bookName,
        chapterNumber: chapterInfo.chapter,
        targetBookName: chapterInfo.bookName,
        targetChapterNumber: chapterInfo.chapter,
        targetChapterQuery: `${chapterInfo.bookName} ${chapterInfo.chapter}`,
        period,
      });
    }
  };

  const handleAdvanceNextDay = () => {
    handleNavigateDate(1);
    setToastMessage(`✓ Avançado para o dia seguinte!`);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleConfirmJump = () => {
    const targetGlobal = getGlobalChapterFromBook(jumpBookId, jumpChapter);
    setPlanStartChapter(targetGlobal);
    setPlanStartDate(activeDate);
    localStorage.setItem('altto_bible_plan_start_chapter', targetGlobal.toString());
    localStorage.setItem('altto_bible_plan_start_date', activeDate);
    setShowJumpModal(false);
    const info = getBibleBookAndChapter(targetGlobal);
    setToastMessage(`✓ Plano iniciado em ${info.bookName} ${info.chapter} a partir de ${activeDate}!`);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleDirectImportBible = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsImportingBible(true);
      const newBook = await importBookFromFile(file);
      setRefreshTrigger((n) => n + 1);
      handleSelectLibraryBible(newBook);
      setShowBiblePickerModal(false);
      setToastMessage(`Bíblia "${newBook.title}" importada e definida como sua Bíblia!`);
      setTimeout(() => setToastMessage(''), 3500);
    } catch (err) {
      console.error(err);
      setToastMessage('Erro ao importar arquivo da Bíblia');
      setTimeout(() => setToastMessage(''), 3500);
    } finally {
      setIsImportingBible(false);
    }
  };

  const handleSaveNotes = () => {
    const notes = { morning: morningNote, afternoon: afternoonNote, night: nightNote };
    localStorage.setItem(`altto_bible_notes_${activeDate}`, JSON.stringify(notes));
    setToastMessage('✓ Anotações da Bíblia salvas com sucesso!');
    setTimeout(() => setToastMessage(''), 3000);
  };

  const completedCount =
    (periodStatus.morning ? 1 : 0) +
    (periodStatus.afternoon ? 1 : 0) +
    (periodStatus.night ? 1 : 0);

  const isAllCompletedToday = completedCount === 3;
  const currentGlobalChapter = morningStart;
  const totalToday = totalDaily;
  const currentInfo = getBibleBookAndChapter(currentGlobalChapter);
  const bibleProgressPercent = Math.min(100, Math.round((currentGlobalChapter / 1189) * 100));

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center text-slate-500 gap-3">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium">Carregando plano bíblico diário...</span>
      </div>
    );
  }

  return (
    <div id="bible-view-container" className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6 text-[#29243A]">
      <div className="flex items-center justify-between border-b border-[#EAE5F4] pb-4 flex-wrap gap-3">
        <div>
          <span className="text-xs font-bold text-[#A58ADB] uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-[#A58ADB]" />
            Plano Bíblico Diário (Manhã — Tarde — Noite)
          </span>
          <h1 className="text-2xl font-bold font-serif text-[#29243A] tracking-tight">
            Leitura da Bíblia
          </h1>
          <p className="text-xs text-[#827A96] mt-0.5">
            Leia sua Bíblia adicionada da biblioteca dividida em 3 momentos sagrados do seu dia com continuidade cronológica.
          </p>
        </div>
        <button
          onClick={() => setShowBiblePickerModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-[#FAF9FD] text-[#29243A] border border-[#EAE5F4] shadow-xs transition-colors cursor-pointer"
        >
          <Library className="w-4 h-4 text-[#A58ADB]" />
          <span>Trocar Bíblia da Biblioteca</span>
        </button>
      </div>

      {/* Date Navigation */}
      <div className="bg-white border border-[#EAE5F4] rounded-2xl p-3 sm:p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
          <button
            onClick={() => handleNavigateDate(-1)}
            className="p-2 rounded-xl bg-[#FAF9FD] border border-[#EAE5F4] hover:bg-[#F0EAFE] text-[#29243A] transition-colors cursor-pointer"
            title="Dia anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#A58ADB] shrink-0" />
            <input
              type="date"
              value={activeDate}
              onChange={(e) => onDateChange && onDateChange(e.target.value)}
              className="bg-[#FAF9FD] border border-[#EAE5F4] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#29243A] focus:bg-white focus:outline-none focus:border-[#A58ADB] cursor-pointer"
            />
          </div>
          <button
            onClick={() => handleNavigateDate(1)}
            className="p-2 rounded-xl bg-[#FAF9FD] border border-[#EAE5F4] hover:bg-[#F0EAFE] text-[#29243A] transition-colors cursor-pointer"
            title="Próximo dia"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {activeDate === todayStr ? (
            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Hoje ({activeDate})
            </span>
          ) : activeDate > todayStr ? (
            <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
              isDateLocked
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-emerald-100 text-emerald-900 border-emerald-200'
            }`}>
              {isDateLocked ? <Lock className="w-3.5 h-3.5 text-amber-700" /> : <Check className="w-3.5 h-3.5 text-emerald-600" />}
              {isDateLocked ? 'Dia Futuro (Bloqueado)' : 'Dia Futuro (Desbloqueado)'}
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200">
              Dia Passado ({activeDate})
            </span>
          )}

          {activeDate !== todayStr && (
            <button
              onClick={handleGoToToday}
              className="px-3 py-1 rounded-xl text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
            >
              Voltar para Hoje
            </button>
          )}
        </div>
      </div>

      {isDateLocked && (
        <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-950 text-xs shadow-2xs">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm block text-amber-950">Leituras deste dia bloqueadas</span>
              <span className="text-amber-800 text-xs">
                {lockDetails.blockingDate ? (
                  <>
                    A leitura do dia <strong>{activeDate}</strong> está bloqueada porque existem capítulos pendentes{' '}
                    {lockDetails.blockingDate === todayStr ? (
                      <strong>de hoje ({todayStr})</strong>
                    ) : (
                      <>
                        do dia <strong>{lockDetails.blockingDate}</strong>
                      </>
                    )}
                    . Conclua os capítulos pendentes primeiro para liberar os dias seguintes.
                  </>
                ) : (
                  <>
                    Você pode visualizar os capítulos programados abaixo, mas a leitura e conclusão estão bloqueadas até que você conclua os capítulos dos dias anteriores.
                  </>
                )}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              if (lockDetails.blockingDate && onDateChange) {
                onDateChange(lockDetails.blockingDate);
              } else {
                handleGoToToday();
              }
            }}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            <span>
              {lockDetails.blockingDate && lockDetails.blockingDate !== activeDate
                ? `Ir para Dia Pendente (${lockDetails.blockingDate})`
                : 'Ir para Hoje'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Selected Bible Card */}
      <div className="bg-white border border-[#EAE5F4] rounded-3xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(165,138,219,0.06)] space-y-4">
        <div className="flex items-center justify-between text-xs font-bold text-[#29243A] border-b border-[#EAE5F4] pb-3">
          <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-[#A58ADB]">
            <BookOpen className="w-4 h-4 text-[#A58ADB]" />
            Bíblia Selecionada para Leitura
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[#F0EAFE] text-[#A58ADB] font-mono text-[10px] border border-[#EAE5F4]">
            {selectedBibleBook ? selectedBibleBook.format.toUpperCase() : 'PLANO CANÔNICO'}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <div
            onClick={() => handleOpenPeriodReader(morningStart, planConfig.morningCount, 'morning', 'Manhã')}
            className="w-20 sm:w-24 aspect-[3/4] rounded-xl overflow-hidden bg-[#FAF9FD] border border-[#EAE5F4] shadow-xs shrink-0 cursor-pointer group hover:scale-[1.02] transition-transform"
          >
            {selectedBibleBook?.coverUrl ? (
              <img
                src={selectedBibleBook.coverUrl}
                alt={selectedBibleBook.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-[#F0EAFE] text-[#A58ADB]">
                <BookOpen className="w-6 h-6 mb-1 text-[#A58ADB]" />
                <span className="text-[9px] font-serif font-bold text-[#29243A] line-clamp-2">
                  {selectedBibleBook ? selectedBibleBook.title : 'Plano Bíblico Canônico'}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2 text-center sm:text-left min-w-0">
            <div>
              <h2 className="text-base sm:text-lg font-bold font-serif text-[#29243A] leading-snug">
                {selectedBibleBook
                  ? selectedBibleBook.title
                  : 'Plano Bíblico Canônico (66 Livros)'}
              </h2>
              <p className="text-xs text-[#827A96] font-medium">
                {selectedBibleBook
                  ? selectedBibleBook.author || 'Bíblia importada da biblioteca'
                  : 'Catálogo canônico dos 66 livros do Antigo e Novo Testamento'}
              </p>
            </div>

            <div className="space-y-1 max-w-md">
              <div className="flex justify-between text-[11px] font-semibold text-[#827A96]">
                <span>Posição Atual: <strong>{currentInfo.bookName} {currentInfo.chapter}</strong></span>
                <span className="text-[#A58ADB] font-bold">{currentGlobalChapter} de 1.189 caps ({bibleProgressPercent}%)</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#F0EAFE] overflow-hidden">
                <div
                  className="h-full bg-[#A58ADB] rounded-full transition-all duration-300"
                  style={{ width: `${bibleProgressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 items-center justify-center sm:justify-start pt-1">
              <button
                onClick={() => setShowBiblePickerModal(true)}
                className="text-[11px] font-semibold text-[#A58ADB] hover:text-[#8C6ECD] underline cursor-pointer"
              >
                Escolher outra Bíblia da Biblioteca
              </button>
              <span className="text-[#EAE5F4]">·</span>
              <button
                onClick={() => {
                  const info = getBibleBookAndChapter(currentGlobalChapter);
                  setJumpBookId(info.bookId);
                  setJumpChapter(info.chapter);
                  setShowJumpModal(true);
                }}
                className="text-[11px] font-semibold text-[#A58ADB] hover:text-[#8C6ECD] underline cursor-pointer flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3 text-[#A58ADB]" />
                <span>Alterar Livro / Capítulo Inicial</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chapters per period control */}
      <div className="bg-white border border-[#EAE5F4] rounded-3xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-[#EAE5F4] pb-2.5 flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-sm font-serif text-[#29243A]">
              Meta Diária de Capítulos
            </h3>
            <p className="text-[11px] text-[#827A96]">
              Padrão de <strong>3 capítulos por dia</strong> (1 Manhã + 1 Tarde + 1 Noite). Ajuste livremente:
            </p>
          </div>
          <div className="px-3 py-1 rounded-full bg-[#F0EAFE] text-[#A58ADB] font-bold text-xs border border-[#EAE5F4]">
            Total hoje: {totalToday} {totalToday === 1 ? 'capítulo' : 'capítulos'}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Manhã */}
          <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <Sun className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block leading-tight">Manhã</span>
                <span className="text-[10px] text-slate-500">Capítulos</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updatePeriodCount('morning', -1)}
                disabled={planConfig.morningCount <= 1}
                className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 cursor-pointer shadow-2xs"
                title="Diminuir capítulos"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center font-bold text-sm font-mono text-slate-900">
                {planConfig.morningCount}
              </span>
              <button
                onClick={() => updatePeriodCount('morning', 1)}
                className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs"
                title="Aumentar capítulos da manhã"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tarde */}
          <div className="p-3 rounded-xl bg-orange-50/50 border border-orange-200/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
                <Sunset className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block leading-tight">Tarde</span>
                <span className="text-[10px] text-slate-500">Capítulos</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updatePeriodCount('afternoon', -1)}
                disabled={planConfig.afternoonCount <= 1}
                className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 cursor-pointer shadow-2xs"
                title="Diminuir capítulos"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center font-bold text-sm font-mono text-slate-900">
                {planConfig.afternoonCount}
              </span>
              <button
                onClick={() => updatePeriodCount('afternoon', 1)}
                className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs"
                title="Aumentar capítulos da tarde"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Noite */}
          <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-200/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Moon className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block leading-tight">Noite</span>
                <span className="text-[10px] text-slate-500">Capítulos</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updatePeriodCount('night', -1)}
                disabled={planConfig.nightCount <= 1}
                className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 cursor-pointer shadow-2xs"
                title="Diminuir capítulos"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center font-bold text-sm font-mono text-slate-900">
                {planConfig.nightCount}
              </span>
              <button
                onClick={() => updatePeriodCount('night', 1)}
                className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs"
                title="Aumentar capítulos da noite"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Periods List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm font-serif text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>{activeDate === todayStr ? 'Suas Leituras de Hoje' : `Leituras Programadas (${activeDate})`}</span>
            </h3>
            {isDateLocked && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px] border border-amber-300 flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-700" />
                Bloqueado
              </span>
            )}
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {completedCount} de 3 períodos lidos ({Math.round((completedCount / 3) * 100)}%)
          </span>
        </div>

        {/* 1. MANHÃ */}
        <div className={`p-4 rounded-2xl border transition-all ${
          periodStatus.morning
            ? 'bg-[#B9DCCB]/20 border-[#B9DCCB] shadow-2xs'
            : isMorningLocked
            ? 'bg-[#FAF9FD] border-[#EAE5F4] opacity-75'
            : 'bg-white border-[#EAE5F4] hover:border-[#C4B1F0] shadow-xs'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isMorningLocked ? 'bg-[#FAF9FD] text-[#827A96]' : 'bg-[#F0EAFE] text-[#A58ADB]'
              }`}>
                {isMorningLocked ? <Lock className="w-5 h-5" /> : <Sun className="w-5 h-5 text-[#E5A038]" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#29243A] uppercase tracking-wider">
                    Leitura da Manhã
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FAF9FD] text-[#827A96] font-semibold border border-[#EAE5F4]">
                    {planConfig.morningCount} {planConfig.morningCount === 1 ? 'capítulo' : 'capítulos'}
                  </span>
                  {isMorningLocked && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 font-bold border border-amber-200">
                      🔒 Bloqueado
                    </span>
                  )}
                </div>
                <h4 className="text-base font-bold font-serif text-[#29243A] mt-0.5">
                  {formatChapterRange(morningStart, planConfig.morningCount)}
                </h4>
                <p className="text-[11px] text-[#827A96]">
                  Capítulos {morningStart} a {morningEnd} da Bíblia
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                id="btn-read-morning"
                onClick={() => handleOpenPeriodReader(morningStart, planConfig.morningCount, 'morning', 'Manhã')}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer ${
                  isMorningLocked
                    ? 'bg-[#FAF9FD] text-[#827A96] border border-[#EAE5F4]'
                    : 'btn-lilas'
                }`}
              >
                {isMorningLocked ? <Lock className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
                <span>{isMorningLocked ? 'Bloqueado' : 'Ler na Bíblia'}</span>
              </button>
              <button
                id="btn-check-morning"
                onClick={() => handleTogglePeriod('morning')}
                className={`p-2 rounded-xl border transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                  periodStatus.morning
                    ? 'bg-[#B9DCCB] text-emerald-950 border-[#B9DCCB]'
                    : isMorningLocked
                    ? 'bg-[#FAF9FD] text-[#827A96] border-[#EAE5F4]'
                    : 'bg-white hover:bg-[#FAF9FD] text-[#29243A] border-[#EAE5F4]'
                }`}
              >
                {isMorningLocked ? <Lock className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                <span className="hidden sm:inline">
                  {periodStatus.morning ? 'Lido' : isMorningLocked ? 'Bloqueado' : 'Concluir'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. TARDE */}
        <div className={`p-4 rounded-2xl border transition-all ${
          periodStatus.afternoon
            ? 'bg-[#B9DCCB]/20 border-[#B9DCCB] shadow-2xs'
            : isAfternoonLocked
            ? 'bg-[#FAF9FD] border-[#EAE5F4] opacity-75'
            : 'bg-white border-[#EAE5F4] hover:border-[#C4B1F0] shadow-xs'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isAfternoonLocked ? 'bg-[#FAF9FD] text-[#827A96]' : 'bg-[#FFEAF0] text-[#E06D8A]'
              }`}>
                {isAfternoonLocked ? <Lock className="w-5 h-5" /> : <Sunset className="w-5 h-5 text-[#E06D8A]" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#29243A] uppercase tracking-wider">
                    Leitura da Tarde
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FAF9FD] text-[#827A96] font-semibold border border-[#EAE5F4]">
                    {planConfig.afternoonCount} {planConfig.afternoonCount === 1 ? 'capítulo' : 'capítulos'}
                  </span>
                  {isAfternoonLocked && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 font-bold border border-amber-200">
                      {isDateLocked ? '🔒 Bloqueado' : '⏳ Conclua a Manhã'}
                    </span>
                  )}
                </div>
                <h4 className="text-base font-bold font-serif text-[#29243A] mt-0.5">
                  {formatChapterRange(afternoonStart, planConfig.afternoonCount)}
                </h4>
                <p className="text-[11px] text-[#827A96]">
                  Capítulos {afternoonStart} a {afternoonEnd} da Bíblia
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                id="btn-read-afternoon"
                onClick={() => handleOpenPeriodReader(afternoonStart, planConfig.afternoonCount, 'afternoon', 'Tarde')}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer ${
                  isAfternoonLocked
                    ? 'bg-[#FAF9FD] text-[#827A96] border border-[#EAE5F4]'
                    : 'btn-lilas'
                }`}
              >
                {isAfternoonLocked ? <Lock className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
                <span>{isAfternoonLocked ? 'Bloqueado' : 'Ler na Bíblia'}</span>
              </button>
              <button
                id="btn-check-afternoon"
                onClick={() => handleTogglePeriod('afternoon')}
                className={`p-2 rounded-xl border transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                  periodStatus.afternoon
                    ? 'bg-[#B9DCCB] text-emerald-950 border-[#B9DCCB]'
                    : isAfternoonLocked
                    ? 'bg-[#FAF9FD] text-[#827A96] border-[#EAE5F4]'
                    : 'bg-white hover:bg-[#FAF9FD] text-[#29243A] border-[#EAE5F4]'
                }`}
              >
                {isAfternoonLocked ? <Lock className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                <span className="hidden sm:inline">
                  {periodStatus.afternoon ? 'Lido' : isAfternoonLocked ? 'Bloqueado' : 'Concluir'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. NOITE */}
        <div className={`p-4 rounded-2xl border transition-all ${
          periodStatus.night
            ? 'bg-[#B9DCCB]/20 border-[#B9DCCB] shadow-2xs'
            : isNightLocked
            ? 'bg-[#FAF9FD] border-[#EAE5F4] opacity-75'
            : 'bg-white border-[#EAE5F4] hover:border-[#C4B1F0] shadow-xs'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isNightLocked ? 'bg-[#FAF9FD] text-[#827A96]' : 'bg-[#EAF3FE] text-[#5B92E5]'
              }`}>
                {isNightLocked ? <Lock className="w-5 h-5" /> : <Moon className="w-5 h-5 text-[#5B92E5]" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#29243A] uppercase tracking-wider">
                    Leitura da Noite
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FAF9FD] text-[#827A96] font-semibold border border-[#EAE5F4]">
                    {planConfig.nightCount} {planConfig.nightCount === 1 ? 'capítulo' : 'capítulos'}
                  </span>
                  {isNightLocked && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 font-bold border border-amber-200">
                      {isDateLocked ? '🔒 Bloqueado' : '⏳ Conclua a Tarde'}
                    </span>
                  )}
                </div>
                <h4 className="text-base font-bold font-serif text-[#29243A] mt-0.5">
                  {formatChapterRange(nightStart, planConfig.nightCount)}
                </h4>
                <p className="text-[11px] text-[#827A96]">
                  Capítulos {nightStart} a {nightEnd} da Bíblia
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                id="btn-read-night"
                onClick={() => handleOpenPeriodReader(nightStart, planConfig.nightCount, 'night', 'Noite')}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer ${
                  isNightLocked
                    ? 'bg-[#FAF9FD] text-[#827A96] border border-[#EAE5F4]'
                    : 'btn-lilas'
                }`}
              >
                {isNightLocked ? <Lock className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
                <span>{isNightLocked ? 'Bloqueado' : 'Ler na Bíblia'}</span>
              </button>
              <button
                id="btn-check-night"
                onClick={() => handleTogglePeriod('night')}
                className={`p-2 rounded-xl border transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                  periodStatus.night
                    ? 'bg-[#B9DCCB] text-emerald-950 border-[#B9DCCB]'
                    : isNightLocked
                    ? 'bg-[#FAF9FD] text-[#827A96] border-[#EAE5F4]'
                    : 'bg-white hover:bg-[#FAF9FD] text-[#29243A] border-[#EAE5F4]'
                }`}
              >
                {isNightLocked ? <Lock className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                <span className="hidden sm:inline">
                  {periodStatus.night ? 'Lido' : isNightLocked ? 'Bloqueado' : 'Concluir'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Advance to next day */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div>
          <span className="text-xs font-bold text-slate-800">
            {isAllCompletedToday
              ? '🎉 Parabéns! Você concluiu todos os capítulos de hoje!'
              : `${completedCount} de 3 períodos lidos hoje`}
          </span>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Ao avançar, os capítulos de Manhã, Tarde e Noite passarão automaticamente para os próximos {totalToday} capítulos da Bíblia.
          </p>
        </div>
        <button
          onClick={handleAdvanceNextDay}
          className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs transition-colors shadow-2xs shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <span>Avançar para Próximos Capítulos</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Notes Section */}
      <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="font-bold text-xs text-slate-800 hover:text-amber-800 flex items-center gap-1.5 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-600" />
            <span>{showNotes ? 'Ocultar Anotações Bíblicas' : 'Escrever Anotações das Leituras de Hoje'}</span>
          </button>
          {showNotes && (
            <button
              onClick={handleSaveNotes}
              className="text-xs font-bold text-amber-700 hover:underline cursor-pointer"
            >
              Salvar Anotações
            </button>
          )}
        </div>

        {showNotes && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Anotação da Manhã:
              </label>
              <textarea
                rows={2}
                value={morningNote}
                onChange={(e) => setMorningNote(e.target.value)}
                placeholder="Versículo ou pensamento da manhã..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Anotação da Tarde:
              </label>
              <textarea
                rows={2}
                value={afternoonNote}
                onChange={(e) => setAfternoonNote(e.target.value)}
                placeholder="Versículo ou pensamento da tarde..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Anotação da Noite:
              </label>
              <textarea
                rows={2}
                value={nightNote}
                onChange={(e) => setNightNote(e.target.value)}
                placeholder="Versículo ou pensamento da noite..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bible Picker Modal */}
      {showBiblePickerModal && (
        <div
          id="modal-pick-bible-book"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xl text-slate-900 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Library className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base font-serif text-slate-900">
                    Bíblia da Sua Biblioteca
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Escolha a Bíblia que você importou ou a tradução oficial
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBiblePickerModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <span className="text-xs font-bold text-amber-950 block">Tem um PDF ou EPUB da Bíblia?</span>
                <span className="text-[11px] text-amber-800">Importe seu arquivo para ler no plano diário</span>
              </div>
              <label className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>{isImportingBible ? 'Importando...' : '+ Importar Bíblia'}</span>
                <input
                  type="file"
                  accept=".pdf,.epub,.txt,.cbz,.mobi"
                  disabled={isImportingBible}
                  className="hidden"
                  onChange={handleDirectImportBible}
                />
              </label>
            </div>

            <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
              <div
                onClick={handleSelectCanonicalBible}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                  useOfficialAlmeida
                    ? 'border-[#A58ADB] bg-[#F0EAFE] shadow-2xs'
                    : 'border-slate-200 hover:border-[#C4B1F0] hover:bg-[#FAF9FD]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-14 rounded-md bg-gradient-to-br from-[#A58ADB] to-[#8C6ECD] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <BookOpen className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-[#29243A] font-serif">
                      Plano Bíblico Canônico (66 Livros)
                    </h4>
                    <p className="text-[11px] text-[#827A96]">
                      Catálogo completo do Antigo e Novo Testamento com controle diário de leitura.
                    </p>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#FAF9FD] text-[#A58ADB] border border-[#EAE5F4] mt-1 inline-block">
                      PADRÃO INTEGRADO
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                    useOfficialAlmeida
                      ? 'btn-lilas'
                      : 'bg-[#FAF9FD] text-[#827A96] border border-[#EAE5F4]'
                  }`}
                >
                  {useOfficialAlmeida ? 'Selecionado' : 'Escolher'}
                </button>
              </div>

              {libraryBooks.map((b, bIdx) => {
                const isCurrent = !useOfficialAlmeida && selectedBibleBook?.id === b.id;
                return (
                  <div
                    key={`bib-book-${b.id}-${bIdx}`}
                    onClick={() => handleSelectLibraryBible(b)}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      isCurrent
                        ? 'border-amber-500 bg-amber-50/50 shadow-2xs'
                        : 'border-slate-200 hover:border-amber-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-14 rounded-md overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                        {b.coverUrl ? (
                          <img src={b.coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 font-bold">
                            {b.format.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 truncate font-serif">
                          {b.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 truncate">
                          {b.author || 'Importado pelo usuário'}
                        </p>
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 mt-1 inline-block">
                          {b.format.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                        isCurrent
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isCurrent ? 'Selecionada' : 'Escolher'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setShowBiblePickerModal(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Jump Modal */}
      {showJumpModal && (
        <div
          id="modal-jump-bible-chapter"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-5 shadow-2xl text-slate-900 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base font-serif text-slate-900">
                    Alterar Posição Inicial
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Defina onde você deseja iniciar sua leitura diária
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowJumpModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Livro da Bíblia:
                </label>
                <select
                  value={jumpBookId}
                  onChange={(e) => {
                    setJumpBookId(e.target.value);
                    setJumpChapter(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <optgroup label="Antigo Testamento">
                    {BIBLE_BOOKS_CATALOG.filter((b) => b.testament === 'old').map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.chaptersCount} caps)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Novo Testamento">
                    {BIBLE_BOOKS_CATALOG.filter((b) => b.testament === 'new').map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.chaptersCount} caps)
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                {(() => {
                  const selectedBookInfo =
                    BIBLE_BOOKS_CATALOG.find((b) => b.id === jumpBookId) || BIBLE_BOOKS_CATALOG[0];
                  return (
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Capítulo (1 a {selectedBookInfo.chaptersCount}):
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={selectedBookInfo.chaptersCount}
                        value={jumpChapter}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setJumpChapter(Math.max(1, Math.min(selectedBookInfo.chaptersCount, val)));
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  );
                })()}
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                <p className="font-semibold">
                  A partir desta alteração:
                </p>
                <p className="text-[11px] text-amber-800">
                  Os períodos de Manhã, Tarde e Noite começarão a partir do capítulo escolhido e avançarão conforme você concluir as leituras.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowJumpModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmJump}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-2xs transition-colors cursor-pointer"
              >
                Definir Posição Inicial
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-16 sm:bottom-6 right-4 sm:right-6 z-50 px-4 py-3 bg-slate-900 text-white text-xs font-semibold rounded-2xl shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 backdrop-blur-md">
          <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
