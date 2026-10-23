'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Sun,
  Sunset,
  Moon,
  BookOpen,
  BookMarked,
  FileText,
  Star,
  ChevronRight,
  ArrowRight,
  Lock,
  Check,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  Clock,
  CalendarCheck,
  Calendar,
  CheckCheck,
  Flame,
  Heart,
} from 'lucide-react';

const DevotionalCrossIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 2v20M7 8h10" />
  </svg>
);
import { Book, Bible, ReadingProgress } from '@/types';
import { getBooks, updateBook } from '@/lib/bookService';
import { getReadingProgress } from '@/lib/readerService';
import { dbGetAll } from '@/lib/indexedDB';
import { generateTypographicCover, isCoverValid, isCoverImageBlank } from '@/lib/bookMetadataHelper';
import { getDailyVerse } from '@/lib/dailyVerses';
import {
  getBibleBookAndChapter,
  formatChapterRange,
  getChaptersForDate,
  getDateLockDetails,
} from '@/lib/bibleData';
import { getBibles } from '@/lib/bibleService';
import { getUserProfile, DEFAULT_USER_PROFILE, UserProfile, calculateReadingStreak } from '@/lib/userService';
import { ActiveTab } from './Navbar';

interface HomeViewProps {
  onNavigateTab: (tab: ActiveTab, filterParam?: string) => void;
  onOpenReader: (params: any) => void;
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

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigateTab,
  onOpenReader,
}) => {
  // Always use the real-time local date for the initial menu daily reading timeline
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  const activeDate = todayStr;
  const [userProfile, setUserProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [inProgressBooks, setInProgressBooks] = useState<Book[]>([]);
  const [currentReadingBook, setCurrentReadingBook] = useState<Book | null>(null);
  const [otherInProgressBooks, setOtherInProgressBooks] = useState<Book[]>([]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const [devotionalBook, setDevotionalBook] = useState<Book | null>(null);
  const [bibleBook, setBibleBook] = useState<Book | null>(null);
  const [officialBible, setOfficialBible] = useState<Bible | null>(null);
  const [useOfficialAlmeida, setUseOfficialAlmeida] = useState<boolean>(false);

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
  const [isDevotionalCompletedToday, setIsDevotionalCompletedToday] = useState<boolean>(false);

  useEffect(() => {
    const handleProfileSync = () => {
      const p = getUserProfile();
      setUserProfile(p);
    };

    const handleStatusSync = () => {
      const savedStatus = localStorage.getItem(`altto_bible_status_${activeDate}`);
      if (savedStatus) {
        try {
          setPeriodStatus(JSON.parse(savedStatus));
        } catch {}
      }

      const savedDevCompleted = localStorage.getItem('altto_devotional_completed_dates');
      if (savedDevCompleted) {
        try {
          const parsed = JSON.parse(savedDevCompleted);
          if (Array.isArray(parsed)) {
            setIsDevotionalCompletedToday(parsed.includes(activeDate));
          }
        } catch {}
      } else {
        setIsDevotionalCompletedToday(false);
      }
    };

    handleStatusSync();

    window.addEventListener('altto_profile_updated', handleProfileSync);
    window.addEventListener('altto_bible_status_updated', handleStatusSync);
    window.addEventListener('altto_devotional_status_updated', handleStatusSync);
    return () => {
      window.removeEventListener('altto_profile_updated', handleProfileSync);
      window.removeEventListener('altto_bible_status_updated', handleStatusSync);
      window.removeEventListener('altto_devotional_status_updated', handleStatusSync);
    };
  }, [activeDate]);

  const handleToggleDevotionalPeriod = (e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    const saved = localStorage.getItem('altto_devotional_completed_dates');
    let dates: string[] = [];
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) dates = parsed;
      } catch {}
    }
    const isCompleted = dates.includes(activeDate);
    let updated: string[];
    if (isCompleted) {
      updated = dates.filter(d => d !== activeDate);
      setIsDevotionalCompletedToday(false);
      showToast('Momento devocional marcado como pendente.');
    } else {
      updated = [...dates, activeDate];
      setIsDevotionalCompletedToday(true);
      showToast('✨ Leitura devocional de hoje concluída! Parabéns pela disciplina.');
    }
    localStorage.setItem('altto_devotional_completed_dates', JSON.stringify(updated));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('altto_devotional_status_updated'));
    }
  };

  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      const allBooks = await getBooks();
      if (isCancelled) return;

      const seen = new Set<string>();
      const uniqueBooks = allBooks.filter((b) => {
        if (!b || !b.id || seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });

      // 1. Devotional book
      const savedDevId = localStorage.getItem('altto_devotional_book_id');
      let devTarget: Book | null = null;
      if (savedDevId) {
        devTarget = uniqueBooks.find((b) => b.id === savedDevId) || null;
      }
      if (!devTarget && uniqueBooks.length > 0) {
        devTarget = uniqueBooks[0];
      }
      setDevotionalBook(devTarget);

      // 2. Bible book
      const bibles = await getBibles();
      if (!isCancelled && bibles.length > 0) {
        setOfficialBible(bibles[0]);
      }

      const isAlmeida = localStorage.getItem('altto_use_official_almeida') === 'true';
      const savedBibleBookId = localStorage.getItem('altto_selected_bible_book_id');
      let resolvedBibleBook: Book | null = null;
      if (isAlmeida) {
        setUseOfficialAlmeida(true);
      } else if (savedBibleBookId) {
        const found = uniqueBooks.find((b) => b.id === savedBibleBookId);
        if (found) {
          resolvedBibleBook = found;
          setBibleBook(found);
          setUseOfficialAlmeida(false);
        } else {
          setUseOfficialAlmeida(true);
        }
      } else if (uniqueBooks.length > 0) {
        const candidate = uniqueBooks.find(
          (b) => b.title.toLowerCase().includes('bíblia') || b.title.toLowerCase().includes('biblia')
        );
        resolvedBibleBook = candidate || uniqueBooks[0];
        setBibleBook(resolvedBibleBook);
        setUseOfficialAlmeida(false);
      } else {
        setUseOfficialAlmeida(true);
      }

      // 3. Excluded IDs: Selected Bible Book and Selected Devotional Book
      const excludedBookIds = new Set<string>();
      if (savedBibleBookId) excludedBookIds.add(savedBibleBookId);
      if (resolvedBibleBook?.id) excludedBookIds.add(resolvedBibleBook.id);
      if (savedDevId) excludedBookIds.add(savedDevId);
      if (devTarget?.id) excludedBookIds.add(devTarget.id);

      // 4. Eligible books for "Continuar Leitura"
      const eligibleBooks = uniqueBooks.filter((b) => !excludedBookIds.has(b.id));

      // Fetch all recorded reading progress
      let allProgresses: ReadingProgress[] = [];
      try {
        allProgresses = await dbGetAll('reading_progress');
      } catch {}

      const progressMap = new Map<string, ReadingProgress>();
      for (const p of allProgresses) {
        if (p && p.contentId) {
          progressMap.set(p.contentId, p);
        }
      }

      const eligibleWithProgress = eligibleBooks.map((b) => {
        const p = progressMap.get(b.id);
        const percent = p ? p.percentage : (b.progressPercent || 0);
        const lastRead = p?.lastReadAt || b.lastReadAt || '';
        const lastReadTime = lastRead ? new Date(lastRead).getTime() : 0;
        const isReading = b.status === 'in_progress' || (percent > 0 && percent < 100);
        return {
          book: {
            ...b,
            currentPage: p?.currentPage ?? b.currentPage,
            progressPercent: percent,
            lastReadAt: lastRead || b.lastReadAt,
          },
          percent,
          lastReadTime,
          isReading,
        };
      });

      // Filter and sort currently reading books
      const inReadingItems = eligibleWithProgress
        .filter((item) => item.isReading)
        .sort((a, b) => b.lastReadTime - a.lastReadTime);

      let activeBook: Book | null = null;
      let secondaryBooks: Book[] = [];

      if (inReadingItems.length > 0) {
        activeBook = inReadingItems[0].book;
        secondaryBooks = inReadingItems.slice(1, 4).map((item) => item.book);
      } else {
        // If none strictly in progress, check if any book has been read previously
        const withHistory = eligibleWithProgress
          .filter((item) => item.lastReadTime > 0)
          .sort((a, b) => b.lastReadTime - a.lastReadTime);
        if (withHistory.length > 0) {
          activeBook = withHistory[0].book;
          secondaryBooks = withHistory.slice(1, 4).map((item) => item.book);
        } else if (eligibleBooks.length > 0) {
          activeBook = eligibleBooks[0];
          secondaryBooks = eligibleBooks.slice(1, 4);
        }
      }

      setCurrentReadingBook(activeBook);
      setOtherInProgressBooks(secondaryBooks);
      setInProgressBooks(eligibleWithProgress.filter((i) => i.isReading).map((i) => i.book));

      // 5. Bible plan config
      const savedPlan = localStorage.getItem('altto_bible_plan_config');
      if (savedPlan) {
        try {
          setPlanConfig(JSON.parse(savedPlan));
        } catch {}
      }

      // 6. Plan start date & start chapter
      const savedStartDate = localStorage.getItem('altto_bible_plan_start_date');
      if (savedStartDate) {
        setPlanStartDate(savedStartDate);
      } else {
        localStorage.setItem('altto_bible_plan_start_date', todayStr);
        setPlanStartDate(todayStr);
      }

      const savedStartChapter = localStorage.getItem('altto_bible_plan_start_chapter');
      if (savedStartChapter) {
        const ch = parseInt(savedStartChapter, 10);
        if (!isNaN(ch) && ch >= 1 && ch <= 1189) {
          setPlanStartChapter(ch);
        }
      }

      // 7. Period status
      const savedStatus = localStorage.getItem(`altto_bible_status_${activeDate}`);
      if (savedStatus) {
        try {
          setPeriodStatus(JSON.parse(savedStatus));
        } catch {}
      } else {
        setPeriodStatus({ morning: false, afternoon: false, night: false });
      }
    }

    loadData();

    const handleProgressUpdate = () => {
      loadData();
    };

    window.addEventListener('altto_reading_progress_updated', handleProgressUpdate);
    window.addEventListener('storage', handleProgressUpdate);

    return () => {
      isCancelled = true;
      window.removeEventListener('altto_reading_progress_updated', handleProgressUpdate);
      window.removeEventListener('storage', handleProgressUpdate);
    };
  }, [activeDate, todayStr]);

  const getDisplayCover = (b: Book): string => {
    if (isCoverValid(b.coverUrl)) return b.coverUrl!;
    return generateTypographicCover(b.title, b.author, b.format);
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
    morningCount,
    morningEnd,
    afternoonStart,
    afternoonCount,
    afternoonEnd,
    nightStart,
    nightCount,
    nightEnd,
    totalDaily,
  } = chaptersPlan;

  const totalTodayChapters = totalDaily;
  const lockDetails = getDateLockDetails(activeDate, todayStr, planStartDate);
  const isDateLocked = lockDetails.isLocked;

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

  const isMorningLocked = isDateLocked;
  const isAfternoonLocked = isDateLocked || !periodStatus.morning;
  const isNightLocked = isDateLocked || !periodStatus.afternoon;

  const handleTogglePeriod = (period: 'morning' | 'afternoon' | 'night', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (isDateLocked) {
      showToast(getLockBlockedMessage());
      return;
    }
    if (period === 'afternoon' && !periodStatus.morning) {
      showToast('🔒 Bloqueado: Conclua a leitura da Manhã primeiro para liberar a Tarde.');
      return;
    }
    if (period === 'night' && !periodStatus.afternoon) {
      showToast('🔒 Bloqueado: Conclua a leitura da Tarde primeiro para liberar a Noite.');
      return;
    }

    setPeriodStatus(prev => {
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
          showToast('✨ Manhã concluída! Turno da Tarde liberado para leitura.');
        } else if (period === 'afternoon') {
          showToast('✨ Tarde concluída! Turno da Noite liberado para leitura.');
        } else if (period === 'night') {
          showToast('Glória a Deus! Você concluiu todas as leituras de hoje! Amanhã liberado.');
        }
      }
      return updated;
    });
  };

  const handleOpenBiblePeriod = (
    startGlobal: number,
    count: number,
    period: 'morning' | 'afternoon' | 'night',
    periodLabel: string
  ) => {
    if (isDateLocked) {
      showToast(getLockBlockedMessage());
      onNavigateTab('bible');
      return;
    }
    if (period === 'afternoon' && isAfternoonLocked) {
      showToast('🔒 Bloqueado: Conclua a leitura da Manhã primeiro para liberar a Tarde.');
      return;
    }
    if (period === 'night' && isNightLocked) {
      showToast('🔒 Bloqueado: Conclua a leitura da Tarde primeiro para liberar a Noite.');
      return;
    }

    const chapterInfo = getBibleBookAndChapter(startGlobal);

    if (useOfficialAlmeida || !bibleBook) {
      onOpenReader({
        contentType: 'bible',
        contentId: officialBible?.id || 'canonical-bible',
        title: `Bíblia Sagrada — ${periodLabel}`,
        subtitle: formatChapterRange(startGlobal, count),
        bookName: chapterInfo.bookName,
        chapterNumber: chapterInfo.chapter,
        bibleBooks: officialBible?.books,
        period,
        isReadAlready: periodStatus[period],
      });
    } else {
      onOpenReader({
        contentType: 'book',
        contentId: bibleBook.id,
        title: `${bibleBook.title} — ${periodLabel}`,
        subtitle: formatChapterRange(startGlobal, count),
        bookData: bibleBook,
        period,
        isReadAlready: periodStatus[period],
      });
    }
  };

  const featuredBook = currentReadingBook || inProgressBooks[0];

  // 1. Bible Timeline Stats
  const bibleCompletedPeriods =
    (periodStatus.morning ? 1 : 0) +
    (periodStatus.afternoon ? 1 : 0) +
    (periodStatus.night ? 1 : 0);
  const biblePercent = Math.round((bibleCompletedPeriods / 3) * 100);

  // 2. Devotional Week Days Timeline (Segunda a Domingo)
  const devotionalWeekDays = useMemo(() => {
    const today = new Date();
    const currDayOfWeek = today.getDay(); // 0 is Sunday
    const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    let completedDates: string[] = [];
    try {
      const saved = localStorage.getItem('altto_devotional_completed_dates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) completedDates = parsed;
      }
    } catch {}

    const days = [];
    const distanceToMonday = currDayOfWeek === 0 ? -6 : 1 - currDayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + distanceToMonday);

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const isToday = iso === todayStr;
      const isCompleted = completedDates.includes(iso);
      const dayName = dayLabels[d.getDay()];
      days.push({
        iso,
        dayName,
        dayNum: d.getDate(),
        isToday,
        isPast,
        isCompleted,
      });
    }
    return days;
  }, [todayStr, isDevotionalCompletedToday]);

  const completedDevotionalsThisWeek = devotionalWeekDays.filter((d) => d.isCompleted).length;

  // 3. Continue Reading Progress
  const readingPercent =
    currentReadingBook?.progressPercent || (currentReadingBook?.status === 'completed' ? 100 : 0);

  const activeDateObj = new Date();
  const formattedDateLabel = activeDateObj.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const formattedDateTitle = `Hoje · ${formattedDateLabel.charAt(0).toUpperCase() + formattedDateLabel.slice(1)}`;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };
  const greeting = getGreeting();
  const userName = (userProfile.name || 'Anderson').trim();
  const firstName = userName.split(' ')[0];
  const dailyVerse = getDailyVerse(activeDate);
  const streakData = useMemo(() => calculateReadingStreak(), [isDevotionalCompletedToday, periodStatus]);

  return (
    <div id="home-view-container" className="max-w-4xl mx-auto px-3.5 sm:px-6 py-4 sm:py-5 space-y-5 bg-[#FAF9FD] min-h-screen text-[#29243A]">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="p-3 sm:p-3.5 rounded-2xl bg-white border border-[#C4B1F0] text-[#29243A] text-xs font-semibold flex items-center justify-between gap-3 shadow-[0_4px_16px_rgba(165,138,219,0.15)] animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#A58ADB] shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage('')}
            className="text-[10px] text-[#A58ADB] hover:text-[#8C6ECD] underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Saudação com Versículo Bíblico Diário Centralizado e Indicador de Sequência */}
      <div className="text-center space-y-2.5 pt-1 pb-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 shadow-2xs text-xs font-bold">
          <Flame className="w-3.5 h-3.5 text-amber-600 fill-amber-500 animate-pulse" />
          <span>{streakData.currentStreak} {streakData.currentStreak === 1 ? 'dia' : 'dias'} de sequência</span>
          {streakData.readToday ? (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-semibold">Hoje concluído ✓</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-semibold">Leitura de hoje em aberto</span>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold font-serif text-[#29243A] tracking-tight">
          {greeting}, <span className="text-[#A58ADB]">{firstName}</span>!
        </h1>

        {/* Card do Versículo Bíblico Diário */}
        <div className="max-w-xl mx-auto p-4 sm:p-5 rounded-3xl bg-white border border-[#EAE5F4] shadow-[0_2px_14px_rgba(165,138,219,0.06)] text-center space-y-2 relative overflow-hidden">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#F0EAFE] text-[#A58ADB] text-[10px] font-bold border border-[#EAE5F4]">
            <BookOpen className="w-3 h-3 text-[#A58ADB]" />
            <span>Versículo do Dia · {dailyVerse.dateLabel}</span>
          </div>
          <p className="text-xs sm:text-sm font-serif italic text-[#29243A] leading-relaxed max-w-md mx-auto">
            &ldquo;{dailyVerse.text}&rdquo;
          </p>
          <span className="text-[11px] font-bold text-[#A58ADB] block tracking-wide">
            — {dailyVerse.reference}
          </span>
        </div>
      </div>

      {/* LINHA DO TEMPO: LEITURA BÍBLICA DIÁRIA */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white border border-[#EAE5F4] shadow-xs space-y-3.5" id="home-bible-timeline-section">
        {/* Cabeçalho da Linha do Tempo Bíblica */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[#F0EAFE]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center shadow-xs shrink-0">
              <BookOpen className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold font-serif text-[#29243A]">
                  Linha do Tempo · Leitura Bíblica Diária
                </h3>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Hoje ({todayStr.split('-').reverse().slice(0, 2).join('/')})
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F0EAFE] text-[#A58ADB] font-bold border border-[#EAE5F4]">
                  {bibleCompletedPeriods} de 3 turnos
                </span>
                {isDateLocked && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 font-bold border border-amber-200 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 text-amber-700" />
                    Bloqueado
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#827A96] mt-0.5">
                {formattedDateTitle} · {totalTodayChapters} {totalTodayChapters === 1 ? 'capítulo' : 'capítulos'} hoje · {bibleBook ? bibleBook.title : 'Bíblia da biblioteca'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-xs font-bold text-[#A58ADB]">{biblePercent}% concluído</span>
            <button
              onClick={() => onNavigateTab('bible')}
              className="text-xs font-bold text-[#A58ADB] hover:text-[#8C6ECD] flex items-center gap-0.5 cursor-pointer ml-1"
            >
              <span>Ver Bíblia</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Trilha Conectada dos 3 Turnos Bíblicos (Manhã -> Tarde -> Noite) */}
        <div className="relative pl-1 sm:pl-2 space-y-2.5">
          {/* Linha vertical conectora */}
          <div className="absolute left-[19px] sm:left-[23px] top-4 bottom-5 w-0.5 bg-[#EAE5F4] pointer-events-none" />

          {/* 1. Manhã */}
          <div className="relative flex items-center gap-3 group">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs transition-all shrink-0 z-10 border-2 ${
                periodStatus.morning
                  ? 'bg-[#B9DCCB] text-emerald-950 border-white shadow-xs'
                  : isMorningLocked
                  ? 'bg-[#FAF9FD] text-[#A59FBA] border-[#EAE5F4]'
                  : 'bg-[#FEF6E6] text-[#E5A038] border-white shadow-xs'
              }`}
            >
              {periodStatus.morning ? (
                <Check className="w-4 h-4 stroke-[2.5]" />
              ) : isMorningLocked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Sun className="w-4 h-4 stroke-[2.2]" />
              )}
            </div>

            <div
              className={`flex-1 p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                periodStatus.morning
                  ? 'bg-[#B9DCCB]/15 border-[#B9DCCB]'
                  : isMorningLocked
                  ? 'bg-[#FAF9FD] border-[#EAE5F4] opacity-80'
                  : 'bg-[#FAF9FD] border-[#EAE5F4] hover:border-[#C4B1F0]'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-[#E5A038] uppercase tracking-wider flex items-center gap-1">
                    <Sun className="w-3 h-3" /> Manhã ({morningCount} cap)
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                      periodStatus.morning
                        ? 'bg-[#B9DCCB]/60 text-emerald-950 font-extrabold'
                        : isMorningLocked
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-[#FEF6E6] text-[#E5A038]'
                    }`}
                  >
                    {periodStatus.morning ? '✓ Lido' : isMorningLocked ? '🔒 Bloqueado' : '⏳ Pendente'}
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-[#29243A] font-serif truncate mt-0.5">
                  {formatChapterRange(morningStart, morningCount)}
                </h4>
                <p className="text-[10px] text-[#827A96]">Capítulos {morningStart} a {morningEnd}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                <button
                  onClick={() => handleOpenBiblePeriod(morningStart, morningCount, 'morning', 'Manhã')}
                  disabled={isMorningLocked}
                  className="py-1 px-3 rounded-lg text-xs font-bold btn-lilas transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  {isMorningLocked ? <Lock className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
                  <span>{isMorningLocked ? 'Bloqueado' : 'Ler'}</span>
                </button>
                <button
                  onClick={(e) => handleTogglePeriod('morning', e)}
                  disabled={isMorningLocked}
                  className={`p-1 px-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border shadow-2xs ${
                    periodStatus.morning
                      ? 'bg-[#B9DCCB] text-emerald-950 border-[#B9DCCB]'
                      : 'bg-white hover:bg-[#FAF9FD] text-[#29243A] border-[#EAE5F4]'
                  }`}
                  title={periodStatus.morning ? 'Desmarcar' : 'Concluir turno'}
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.2]" />
                </button>
              </div>
            </div>
          </div>

          {/* 2. Tarde */}
          <div className="relative flex items-center gap-3 group">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs transition-all shrink-0 z-10 border-2 ${
                periodStatus.afternoon
                  ? 'bg-[#B9DCCB] text-emerald-950 border-white shadow-xs'
                  : isAfternoonLocked
                  ? 'bg-[#FAF9FD] text-[#A59FBA] border-[#EAE5F4]'
                  : 'bg-[#FFEAF0] text-[#E06D8A] border-white shadow-xs'
              }`}
            >
              {periodStatus.afternoon ? (
                <Check className="w-4 h-4 stroke-[2.5]" />
              ) : isAfternoonLocked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Sunset className="w-4 h-4 stroke-[2.2]" />
              )}
            </div>

            <div
              className={`flex-1 p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                periodStatus.afternoon
                  ? 'bg-[#B9DCCB]/15 border-[#B9DCCB]'
                  : isAfternoonLocked
                  ? 'bg-[#FAF9FD] border-[#EAE5F4] opacity-80'
                  : 'bg-[#FAF9FD] border-[#EAE5F4] hover:border-[#C4B1F0]'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-[#E06D8A] uppercase tracking-wider flex items-center gap-1">
                    <Sunset className="w-3 h-3" /> Tarde ({afternoonCount} cap)
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                      periodStatus.afternoon
                        ? 'bg-[#B9DCCB]/60 text-emerald-950 font-extrabold'
                        : isAfternoonLocked
                        ? 'bg-stone-100 text-[#827A96]'
                        : 'bg-[#FFEAF0] text-[#E06D8A]'
                    }`}
                  >
                    {periodStatus.afternoon ? '✓ Lido' : isAfternoonLocked ? '⏳ Aguarda Manhã' : '⏳ Pendente'}
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-[#29243A] font-serif truncate mt-0.5">
                  {formatChapterRange(afternoonStart, afternoonCount)}
                </h4>
                <p className="text-[10px] text-[#827A96]">
                  {isAfternoonLocked ? 'Libera ao concluir Manhã' : `Capítulos ${afternoonStart} a ${afternoonEnd}`}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                <button
                  onClick={() => handleOpenBiblePeriod(afternoonStart, afternoonCount, 'afternoon', 'Tarde')}
                  disabled={isAfternoonLocked}
                  className="py-1 px-3 rounded-lg text-xs font-bold btn-lilas transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  {isAfternoonLocked ? <Lock className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
                  <span>{isAfternoonLocked ? 'Bloqueado' : 'Ler'}</span>
                </button>
                <button
                  onClick={(e) => handleTogglePeriod('afternoon', e)}
                  disabled={isAfternoonLocked}
                  className={`p-1 px-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border shadow-2xs ${
                    periodStatus.afternoon
                      ? 'bg-[#B9DCCB] text-emerald-950 border-[#B9DCCB]'
                      : 'bg-white hover:bg-[#FAF9FD] text-[#29243A] border-[#EAE5F4]'
                  }`}
                  title={periodStatus.afternoon ? 'Desmarcar' : 'Concluir turno'}
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.2]" />
                </button>
              </div>
            </div>
          </div>

          {/* 3. Noite */}
          <div className="relative flex items-center gap-3 group">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs transition-all shrink-0 z-10 border-2 ${
                periodStatus.night
                  ? 'bg-[#B9DCCB] text-emerald-950 border-white shadow-xs'
                  : isNightLocked
                  ? 'bg-[#FAF9FD] text-[#A59FBA] border-[#EAE5F4]'
                  : 'bg-[#F0EAFE] text-[#8C6ECD] border-white shadow-xs'
              }`}
            >
              {periodStatus.night ? (
                <Check className="w-4 h-4 stroke-[2.5]" />
              ) : isNightLocked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-4 h-4 stroke-[2.2]" />
              )}
            </div>

            <div
              className={`flex-1 p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                periodStatus.night
                  ? 'bg-[#B9DCCB]/15 border-[#B9DCCB]'
                  : isNightLocked
                  ? 'bg-[#FAF9FD] border-[#EAE5F4] opacity-80'
                  : 'bg-[#FAF9FD] border-[#EAE5F4] hover:border-[#C4B1F0]'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-[#8C6ECD] uppercase tracking-wider flex items-center gap-1">
                    <Moon className="w-3 h-3" /> Noite ({nightCount} cap)
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                      periodStatus.night
                        ? 'bg-[#B9DCCB]/60 text-emerald-950 font-extrabold'
                        : isNightLocked
                        ? 'bg-stone-100 text-[#827A96]'
                        : 'bg-[#F0EAFE] text-[#8C6ECD]'
                    }`}
                  >
                    {periodStatus.night ? '✓ Lido' : isNightLocked ? '⏳ Aguarda Tarde' : '⏳ Pendente'}
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-[#29243A] font-serif truncate mt-0.5">
                  {formatChapterRange(nightStart, nightCount)}
                </h4>
                <p className="text-[10px] text-[#827A96]">
                  {isNightLocked ? 'Libera ao concluir Tarde' : `Capítulos ${nightStart} a ${nightEnd}`}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                <button
                  onClick={() => handleOpenBiblePeriod(nightStart, nightCount, 'night', 'Noite')}
                  disabled={isNightLocked}
                  className="py-1 px-3 rounded-lg text-xs font-bold btn-lilas transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  {isNightLocked ? <Lock className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
                  <span>{isNightLocked ? 'Bloqueado' : 'Ler'}</span>
                </button>
                <button
                  onClick={(e) => handleTogglePeriod('night', e)}
                  disabled={isNightLocked}
                  className={`p-1 px-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border shadow-2xs ${
                    periodStatus.night
                      ? 'bg-[#B9DCCB] text-emerald-950 border-[#B9DCCB]'
                      : 'bg-white hover:bg-[#FAF9FD] text-[#29243A] border-[#EAE5F4]'
                  }`}
                  title={periodStatus.night ? 'Desmarcar' : 'Concluir turno'}
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.2]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. LINHA DO TEMPO 2: MOMENTO DEVOCIONAL DIÁRIO                */}
      {/* ============================================================== */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white border border-[#EAE5F4] shadow-xs space-y-3.5" id="home-devotional-timeline-section">
        {/* Cabeçalho do Devocional */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[#F0EAFE]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center shadow-xs shrink-0">
              <DevotionalCrossIcon className="w-4 h-4 text-[#A58ADB]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold font-serif text-[#29243A]">
                  Linha do Tempo · Momento Devocional
                </h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                    isDevotionalCompletedToday
                      ? 'bg-[#B9DCCB]/50 text-emerald-950 border-[#B9DCCB]'
                      : 'bg-[#F0EAFE] text-[#A58ADB] border-[#EAE5F4]'
                  }`}
                >
                  {isDevotionalCompletedToday ? '✓ Concluído hoje' : '⏳ Pendente hoje'}
                </span>
              </div>
              <p className="text-[11px] text-[#827A96]">
                Sua rotina de oração e meditação diária · {completedDevotionalsThisWeek} de 7 dias nesta semana
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('devotional')}
            className="text-xs font-bold text-[#A58ADB] hover:text-[#8C6ECD] flex items-center gap-0.5 cursor-pointer self-end sm:self-auto"
          >
            <span>Aba Devocional</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Trilha Semanal de Devoção (Nós dos 7 dias da semana) */}
        <div className="p-3 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-[#827A96]">
            <span>Jornada da Semana</span>
            <span className="text-[#A58ADB]">{completedDevotionalsThisWeek}/7 dias</span>
          </div>

          {/* Marcadores conectados da semana */}
          <div className="relative flex items-center justify-between pt-1">
            <div className="absolute left-3 right-3 top-4 h-0.5 bg-[#EAE5F4] z-0" />
            {devotionalWeekDays.map((d, dIdx) => (
              <div key={`dev-day-${d.iso}-${dIdx}`} className="relative z-10 flex flex-col items-center gap-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all border-2 ${
                    d.isCompleted
                      ? 'bg-[#B9DCCB] text-emerald-950 border-white shadow-2xs'
                      : d.isToday
                      ? 'bg-white border-[#A58ADB] text-[#A58ADB] shadow-xs ring-2 ring-[#A58ADB]/20'
                      : 'bg-[#FAF9FD] border-[#EAE5F4] text-[#827A96]'
                  }`}
                >
                  {d.isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : d.dayNum}
                </div>
                <span className={`text-[9px] font-semibold ${d.isToday ? 'text-[#A58ADB] font-bold' : 'text-[#827A96]'}`}>
                  {d.dayName}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Card de Ação: Livro Devocional Selecionado */}
        {devotionalBook ? (
          <div className="p-3 rounded-2xl bg-white border border-[#EAE5F4] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                onClick={() =>
                  onOpenReader({
                    contentType: 'book',
                    contentId: devotionalBook.id,
                    title: devotionalBook.title,
                    subtitle: devotionalBook.author,
                    bookData: devotionalBook,
                  })
                }
                className="w-11 h-14 rounded-xl overflow-hidden bg-[#FAF9FD] border border-[#EAE5F4] shrink-0 cursor-pointer shadow-2xs hover:scale-105 transition-transform"
              >
                <img
                  src={getDisplayCover(devotionalBook)}
                  alt={devotionalBook.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.src = generateTypographicCover(
                      devotionalBook.title,
                      devotionalBook.author,
                      devotionalBook.format
                    );
                  }}
                />
              </div>

              <div className="min-w-0">
                <span className="text-[10px] font-bold text-[#A58ADB] uppercase tracking-wider block">
                  Livro de Devoção
                </span>
                <h4
                  onClick={() =>
                    onOpenReader({
                      contentType: 'book',
                      contentId: devotionalBook.id,
                      title: devotionalBook.title,
                      subtitle: devotionalBook.author,
                      bookData: devotionalBook,
                    })
                  }
                  className="text-xs sm:text-sm font-bold text-[#29243A] font-serif truncate cursor-pointer hover:text-[#A58ADB]"
                >
                  {devotionalBook.title}
                </h4>
                <p className="text-[11px] text-[#827A96] truncate">{devotionalBook.author || 'Autor do Devocional'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <button
                onClick={() =>
                  onOpenReader({
                    contentType: 'book',
                    contentId: devotionalBook.id,
                    title: devotionalBook.title,
                    subtitle: devotionalBook.author,
                    bookData: devotionalBook,
                  })
                }
                className="py-1.5 px-3 rounded-xl text-xs font-bold btn-lilas transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs hover:scale-[1.02]"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Ler Devocional</span>
              </button>
              <button
                onClick={handleToggleDevotionalPeriod}
                className={`p-1.5 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border shadow-2xs ${
                  isDevotionalCompletedToday
                    ? 'bg-[#B9DCCB] text-emerald-950 border-[#B9DCCB]'
                    : 'bg-white hover:bg-[#FAF9FD] text-[#29243A] border-[#EAE5F4]'
                }`}
                title={isDevotionalCompletedToday ? 'Desmarcar leitura' : 'Marcar devocional como concluído'}
              >
                <Check className="w-3.5 h-3.5 stroke-[2.2]" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] text-center space-y-2">
            <p className="text-xs text-[#827A96]">
              Nenhum livro de devocional selecionado no momento. Escolha seu livro na aba Devocional para sincronizar sua rotina diária.
            </p>
            <button
              onClick={() => onNavigateTab('devotional')}
              className="py-1.5 px-4 rounded-xl text-xs font-bold btn-lilas inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <DevotionalCrossIcon className="w-3.5 h-3.5" />
              <span>Escolher Livro Devocional</span>
            </button>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 5. LINHA DO TEMPO 3: CONTINUAR LEITURA                         */}
      {/* ============================================================== */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white border border-[#EAE5F4] shadow-xs space-y-3.5" id="home-continue-reading-timeline-section">
        {/* Cabeçalho de Continuar Leitura */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[#F0EAFE]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#EAF3FE] text-[#5B92E5] flex items-center justify-center shadow-xs shrink-0">
              <BookMarked className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold font-serif text-[#29243A]">
                  Linha do Tempo · Continuar Leitura
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EAF3FE] text-[#5B92E5] font-bold border border-[#D5E6FC]">
                  Biblioteca
                </span>
                {currentReadingBook && (
                  <span className="text-[10px] font-bold text-[#A58ADB]">
                    {readingPercent}% lido
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#827A96]">
                Livro em andamento da sua biblioteca (exceto a Bíblia e o livro de Devocional)
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('library')}
            className="text-xs font-semibold text-[#A58ADB] hover:text-[#8C6ECD] flex items-center gap-1 cursor-pointer self-end sm:self-auto"
          >
            <span>Ver Biblioteca</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {!currentReadingBook ? (
          <div className="p-4 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] text-center space-y-2">
            <p className="text-xs text-[#827A96]">
              Nenhum outro livro da biblioteca em andamento no momento. Escolha um na biblioteca para iniciar sua leitura.
            </p>
            <button
              onClick={() => onNavigateTab('library')}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl btn-lilas text-xs font-bold cursor-pointer shadow-xs hover:scale-[1.02] transition-transform"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Explorar Biblioteca</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Trilha de Progresso Visual da Obra (Início -> Posição Atual -> Meta) */}
            <div className="p-3 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#827A96]">
                <span>Etapas de Leitura do Livro</span>
                <span className="text-[#A58ADB]">
                  {currentReadingBook.totalPages && currentReadingBook.totalPages > 0
                    ? `pág. ${currentReadingBook.currentPage || 1} de ${currentReadingBook.totalPages}`
                    : `${readingPercent}%`}
                </span>
              </div>

              <div className="relative flex items-center justify-between pt-1">
                <div className="absolute left-3 right-3 top-3.5 h-1 bg-[#EAE5F4] rounded-full z-0 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#5B92E5] to-[#A58ADB] rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(5, Math.min(100, readingPercent))}%` }}
                  />
                </div>

                {/* Milestone 1: Início */}
                <div className="relative z-10 flex flex-col items-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-white border-2 border-[#5B92E5] text-[#5B92E5] flex items-center justify-center text-[9px] font-bold shadow-2xs">
                    0%
                  </div>
                  <span className="text-[9px] font-semibold text-[#827A96]">Início</span>
                </div>

                {/* Milestone 2: Posição Atual */}
                <div className="relative z-10 flex flex-col items-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-[#A58ADB] border-2 border-white text-white flex items-center justify-center text-[9px] font-bold shadow-xs">
                    {readingPercent}%
                  </div>
                  <span className="text-[9px] font-bold text-[#A58ADB]">Atual</span>
                </div>

                {/* Milestone 3: Conclusão */}
                <div className="relative z-10 flex flex-col items-center gap-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shadow-2xs border-2 ${
                      readingPercent >= 100
                        ? 'bg-[#B9DCCB] text-emerald-950 border-white'
                        : 'bg-white border-[#EAE5F4] text-[#827A96]'
                    }`}
                  >
                    {readingPercent >= 100 ? <Check className="w-3 h-3 stroke-[3]" /> : '100%'}
                  </div>
                  <span className="text-[9px] font-semibold text-[#827A96]">Conclusão</span>
                </div>
              </div>
            </div>

            {/* Cartão do Livro Atual */}
            <div
              onClick={() =>
                onOpenReader({
                  contentType: 'book',
                  contentId: currentReadingBook.id,
                  title: currentReadingBook.title,
                  subtitle: currentReadingBook.author,
                  bookData: currentReadingBook,
                })
              }
              className="p-3 sm:p-4 rounded-2xl bg-white border border-[#EAE5F4] hover:border-[#C4B1F0] transition-all flex flex-col sm:flex-row items-center sm:items-stretch gap-3.5 cursor-pointer shadow-2xs group/book"
            >
              <div className="w-16 sm:w-20 aspect-[3/4] rounded-xl overflow-hidden bg-[#FAF9FD] border border-[#EAE5F4] relative shadow-xs shrink-0 group-hover/book:scale-[1.03] transition-transform">
                <img
                  src={getDisplayCover(currentReadingBook)}
                  alt={currentReadingBook.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.src = generateTypographicCover(
                      currentReadingBook.title,
                      currentReadingBook.author,
                      currentReadingBook.format
                    );
                  }}
                />
                <span className="absolute top-1 left-1 text-[7px] font-extrabold uppercase px-1 py-0.2 rounded bg-black/60 text-white backdrop-blur-xs">
                  {currentReadingBook.format.toUpperCase()}
                </span>
              </div>

              <div className="flex-1 flex flex-col justify-between w-full min-w-0 space-y-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap text-[10px] text-[#827A96]">
                    <span className="font-bold text-[#A58ADB] bg-[#F0EAFE] px-2 py-0.5 rounded-full">
                      Lendo agora
                    </span>
                    {currentReadingBook.lastReadAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(currentReadingBook.lastReadAt).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm sm:text-base font-bold text-[#29243A] font-serif line-clamp-1 mt-1 group-hover/book:text-[#A58ADB] transition-colors">
                    {currentReadingBook.title}
                  </h4>
                  <p className="text-xs text-[#827A96] truncate">
                    {currentReadingBook.author || 'Autor desconhecido'}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    className="btn-lilas px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs group-hover/book:scale-[1.02] transition-transform cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Continuar Leitura</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                  <span className="text-[11px] text-[#827A96] italic hidden sm:inline">
                    Retome exatamente de onde parou
                  </span>
                </div>
              </div>
            </div>

            {/* Outros Livros em Andamento */}
            {otherInProgressBooks.length > 0 && (
              <div className="pt-2 border-t border-[#EAE5F4] space-y-2">
                <span className="text-[11px] font-bold text-[#827A96] uppercase tracking-wider block">
                  Outros livros em andamento
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {otherInProgressBooks.map((otherBook, oIdx) => (
                    <div
                      key={`other-inprog-${otherBook.id}-${oIdx}`}
                      onClick={() =>
                        onOpenReader({
                          contentType: 'book',
                          contentId: otherBook.id,
                          title: otherBook.title,
                          subtitle: otherBook.author,
                          bookData: otherBook,
                        })
                      }
                      className="p-2 rounded-xl bg-[#FAF9FD] border border-[#EAE5F4] hover:border-[#C4B1F0] hover:bg-white transition-all cursor-pointer flex items-center gap-2 group/mini shadow-2xs"
                    >
                      <div className="w-7 h-9 rounded-lg overflow-hidden bg-white border border-[#EAE5F4] shrink-0">
                        <img
                          src={getDisplayCover(otherBook)}
                          alt={otherBook.title}
                          className="w-full h-full object-cover group-hover/mini:scale-105 transition-transform"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[#29243A] font-serif truncate" title={otherBook.title}>
                          {otherBook.title}
                        </p>
                        <p className="text-[10px] text-[#A58ADB] font-bold">
                          {otherBook.progressPercent ? `${otherBook.progressPercent}%` : 'Em leitura'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
