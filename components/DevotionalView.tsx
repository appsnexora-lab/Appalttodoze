'use client';

import React, { useState, useEffect } from 'react';
import {
  BookMarked,
  BookOpen,
  Calendar,
  CheckCircle2,
  Flame,
  Edit3,
  Target,
  ArrowRight,
  Library,
  Check,
} from 'lucide-react';
import { Book } from '@/types';
import { getBooks } from '@/lib/bookService';
import { dbPut } from '@/lib/indexedDB';
import { getReadingProgress } from '@/lib/readerService';

interface DevotionalViewProps {
  onOpenReader: (params: {
    contentType: 'book' | 'devotional';
    contentId: string;
    title: string;
    subtitle?: string;
    bookData?: Book;
    initialChapterOrDay?: number;
    devotionalDays?: any[];
  }) => void;
  selectedDateStr?: string;
  onDateChange?: (date: string) => void;
}

interface DevotionalReflectionItem {
  id: string;
  date: string;
  bookId: string;
  bookTitle: string;
  text: string;
  createdAt: string;
}

export const DevotionalView: React.FC<DevotionalViewProps> = ({
  onOpenReader,
  selectedDateStr,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const activeDate = selectedDateStr || todayStr;

  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [, setSelectedBookId] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [completedDates, setCompletedDates] = useState<string[]>([]);
  const [showBookPickerModal, setShowBookPickerModal] = useState<boolean>(false);
  const [reflectionText, setReflectionText] = useState<string>('');
  const [reflections, setReflections] = useState<DevotionalReflectionItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  useEffect(() => {
    let isCancelled = false;
    async function loadData() {
      try {
        const allBooks = await getBooks();
        if (isCancelled) return;
        setBooks(allBooks);

        const savedBookId = localStorage.getItem('altto_devotional_book_id');
        let currentBook: Book | null = null;
        if (savedBookId) {
          currentBook = allBooks.find((b) => b.id === savedBookId) || null;
        }
        if (!currentBook && allBooks.length > 0) {
          currentBook = allBooks[0];
          localStorage.setItem('altto_devotional_book_id', currentBook.id);
        }
        if (isCancelled) return;
        setSelectedBook(currentBook);
        setSelectedBookId(currentBook ? currentBook.id : null);

        if (currentBook) {
          const prog = await getReadingProgress(currentBook.id);
          if (!isCancelled) {
            setProgressPct(prog ? prog.percentage : (currentBook.progressPercent || 0));
          }
        }

        const savedCompleted = localStorage.getItem('altto_devotional_completed_dates');
        if (savedCompleted) {
          try {
            if (!isCancelled) setCompletedDates(JSON.parse(savedCompleted));
          } catch {
            if (!isCancelled) setCompletedDates([]);
          }
        }

        const savedReflections = localStorage.getItem('altto_devotional_reflections');
        if (savedReflections) {
          try {
            const list: DevotionalReflectionItem[] = JSON.parse(savedReflections);
            if (!isCancelled) {
              setReflections(list);
              const todayRef = list.find((r) => r.date === activeDate);
              setReflectionText(todayRef ? todayRef.text : '');
            }
          } catch {
            if (!isCancelled) setReflections([]);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar dados do devocional:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      isCancelled = true;
    };
  }, [activeDate, refreshTrigger]);

  const handleSelectBook = async (book: Book) => {
    setSelectedBook(book);
    setSelectedBookId(book.id);
    localStorage.setItem('altto_devotional_book_id', book.id);
    setShowBookPickerModal(false);
    const prog = await getReadingProgress(book.id);
    setProgressPct(prog ? prog.percentage : (book.progressPercent || 0));
    setToastMessage(`✓ "${book.title}" definido como seu livro devocional diário!`);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleToggleTodayCompleted = () => {
    const isCompleted = completedDates.includes(activeDate);
    let updated: string[];
    if (isCompleted) {
      updated = completedDates.filter((d) => d !== activeDate);
    } else {
      updated = [...completedDates, activeDate];
    }
    setCompletedDates(updated);
    localStorage.setItem('altto_devotional_completed_dates', JSON.stringify(updated));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('altto_devotional_status_updated'));
    }
    if (!isCompleted) {
      setToastMessage('✨ Leitura devocional de hoje concluída! Parabéns pela disciplina espiritual.');
    } else {
      setToastMessage('Leitura marcada como pendente.');
    }
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleSaveReflection = () => {
    if (!reflectionText.trim()) return;
    const existingIdx = reflections.findIndex((r) => r.date === activeDate);
    let updated: DevotionalReflectionItem[];
    const item: DevotionalReflectionItem = {
      id: `ref-${activeDate}-${Date.now()}`,
      date: activeDate,
      bookId: selectedBook?.id || 'devotional',
      bookTitle: selectedBook?.title || 'Livro Devocional',
      text: reflectionText.trim(),
      createdAt: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      updated = [...reflections];
      updated[existingIdx] = item;
    } else {
      updated = [item, ...reflections];
    }
    setReflections(updated);
    localStorage.setItem('altto_devotional_reflections', JSON.stringify(updated));

    if (!completedDates.includes(activeDate)) {
      const newDates = [...completedDates, activeDate];
      setCompletedDates(newDates);
      localStorage.setItem('altto_devotional_completed_dates', JSON.stringify(newDates));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('altto_devotional_status_updated'));
      }
    }

    setToastMessage('✓ Reflexão salva com sucesso!');
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleAddClassicDevotional = async (preset: 'imitacao' | 'peregrino') => {
    const bookId = `classic-${preset}-${Date.now()}`;
    let book: Book;
    if (preset === 'imitacao') {
      book = {
        id: bookId,
        title: 'A Imitação de Cristo',
        author: 'Tomás de Kempis',
        description: 'Um dos maiores clássicos de devoção e disciplina espiritual de todos os tempos.',
        format: 'txt',
        totalPages: 180,
        totalChapters: 4,
        textContent:
          'Aquele que me segue não andará em trevas, diz o Senhor. Com estas palavras Cristo nos exorta a imitar Sua vida e Seus costumes, se queremos ser verdadeiramente iluminados e livres de toda cegueira do coração. Seja, pois, nosso principal estudo meditar sobre a vida de Jesus Cristo.',
        status: 'in_progress',
        isFavorite: true,
        addedAt: new Date().toISOString(),
      };
    } else {
      book = {
        id: bookId,
        title: 'O Peregrino',
        author: 'John Bunyan',
        description: 'A célebre alegoria cristã de Cristão em sua jornada desde a Cidade da Destruição até a Cidade Celestial.',
        format: 'txt',
        totalPages: 240,
        totalChapters: 10,
        textContent:
          'Caminhando pelo deserto deste mundo, cheguei a um lugar onde havia uma caverna; ali me deitei para dormir e, enquanto dormia, tive um sonho. Vi um homem vestido de farrapos, de pé em certo lugar, com as costas voltadas para a sua própria casa, um fardo pesado sobre os ombros e um livro nas mãos.',
        status: 'in_progress',
        isFavorite: true,
        addedAt: new Date().toISOString(),
      };
    }
    await dbPut('books', book);
    await handleSelectBook(book);
    setRefreshTrigger((n) => n + 1);
  };

  const calculateStreak = (): number => {
    let streak = 0;
    const checkDate = new Date();
    while (true) {
      const dStr = checkDate.toISOString().split('T')[0];
      if (completedDates.includes(dStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        if (streak === 0 && dStr === todayStr) {
          checkDate.setDate(checkDate.getDate() - 1);
          const yesterdayStr = checkDate.toISOString().split('T')[0];
          if (completedDates.includes(yesterdayStr)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
          }
        }
        break;
      }
    }
    return streak;
  };

  const streak = calculateStreak();
  const isReadToday = completedDates.includes(activeDate);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-[#827A96] gap-3">
        <div className="w-8 h-8 border-2 border-[#A58ADB] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium">Carregando seu livro devocional...</span>
      </div>
    );
  }

  return (
    <div id="devotional-view-container" className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6 text-[#29243A]">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#EAE5F4] pb-4 flex-wrap gap-3">
        <div>
          <span className="text-xs font-bold text-[#A58ADB] uppercase tracking-wider flex items-center gap-1.5">
            <BookMarked className="w-4 h-4 text-[#A58ADB]" />
            Devocional Diário
          </span>
          <h1 className="text-2xl font-bold font-serif text-[#29243A] tracking-tight">
            Meu Momento com Deus
          </h1>
          <p className="text-xs text-[#827A96] mt-0.5">
            Leia seu livro devocional escolhido da biblioteca todos os dias e registre suas reflexões espirituais.
          </p>
        </div>
        <button
          onClick={() => setShowBookPickerModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-[#FAF9FD] text-[#29243A] border border-[#EAE5F4] shadow-xs transition-colors cursor-pointer"
        >
          <Library className="w-4 h-4 text-[#A58ADB]" />
          <span>{selectedBook ? 'Trocar Livro Devocional' : 'Escolher Livro'}</span>
        </button>
      </div>

      {/* Selected Devotional Book Hero */}
      {selectedBook ? (
        <div className="bg-white border border-[#EAE5F4] rounded-3xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(165,138,219,0.06)] space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-[#29243A] border-b border-[#EAE5F4] pb-3">
            <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-[#A58ADB]">
              <BookMarked className="w-4 h-4 text-[#A58ADB]" />
              Livro Devocional Selecionado
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#F0EAFE] text-[#A58ADB] font-mono text-[10px] border border-[#EAE5F4]">
              {selectedBook.format.toUpperCase()}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div
              onClick={() =>
                onOpenReader({
                  contentType: 'book',
                  contentId: selectedBook.id,
                  title: selectedBook.title,
                  subtitle: selectedBook.author,
                  bookData: selectedBook,
                })
              }
              className="w-28 sm:w-32 aspect-[3/4] rounded-2xl overflow-hidden bg-[#FAF9FD] border border-[#EAE5F4] shadow-xs shrink-0 cursor-pointer group hover:scale-[1.02] transition-transform"
            >
              {selectedBook.coverUrl ? (
                <img
                  src={selectedBook.coverUrl}
                  alt={selectedBook.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-[#F0EAFE] text-[#A58ADB]">
                  <BookOpen className="w-8 h-8 mb-1 text-[#A58ADB]" />
                  <span className="text-[10px] font-serif font-bold text-[#29243A] line-clamp-2">
                    {selectedBook.title}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-3 text-center sm:text-left min-w-0">
              <div>
                <h2 className="text-lg sm:text-xl font-bold font-serif text-[#29243A] leading-snug">
                  {selectedBook.title}
                </h2>
                <p className="text-xs text-[#827A96] mt-0.5 font-medium">
                  {selectedBook.author || 'Autor não informado'}
                </p>
                {selectedBook.description && (
                  <p className="text-xs text-[#827A96] mt-2 line-clamp-2 leading-relaxed">
                    {selectedBook.description}
                  </p>
                )}
              </div>

              <div className="space-y-1 max-w-md">
                <div className="flex justify-between text-[11px] font-semibold text-[#827A96]">
                  <span>Progresso Geral de Leitura</span>
                  <span className="text-[#29243A] font-bold">{progressPct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#F0EAFE] overflow-hidden">
                  <div
                    className="h-full bg-[#A58ADB] rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-[#827A96]">
                  {selectedBook.totalPages ? `${selectedBook.totalPages} páginas no total` : 'Leitura contínua'}
                </span>
              </div>

              <div className="pt-1 flex flex-wrap gap-2.5 items-center justify-center sm:justify-start">
                <button
                  id="btn-open-devotional-book"
                  onClick={() =>
                    onOpenReader({
                      contentType: 'book',
                      contentId: selectedBook.id,
                      title: selectedBook.title,
                      subtitle: selectedBook.author,
                      bookData: selectedBook,
                    })
                  }
                  className="px-5 py-2.5 rounded-xl btn-lilas font-bold text-xs shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Continuar Leitura Devocional de Hoje</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowBookPickerModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-[#FAF9FD] text-[#29243A] text-xs font-semibold border border-[#EAE5F4] transition-colors cursor-pointer"
                >
                  Trocar Livro
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-2xs">
            <BookMarked className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Nenhum livro devocional definido</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              Escolha um livro da sua biblioteca (ou adicione um clássico devocional) para acompanhar sua leitura espiritual todos os dias.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              onClick={() => setShowBookPickerModal(true)}
              className="px-5 py-2.5 rounded-xl bg-[#A58ADB] text-white font-bold text-xs hover:bg-[#9376CD] transition-colors shadow-xs cursor-pointer"
            >
              Escolher Livro da Biblioteca
            </button>
          </div>
        </div>
      )}

      {/* Daily Tracker & Habits */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              Leitura de Hoje
            </span>
            <span className="text-[10px] text-slate-400">{activeDate}</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className={`text-xs font-bold ${isReadToday ? 'text-emerald-600' : 'text-amber-700'}`}>
              {isReadToday ? '✓ Concluída hoje' : 'Pendente para hoje'}
            </span>
            <button
              id="btn-toggle-devotional-today"
              onClick={handleToggleTodayCompleted}
              className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                isReadToday
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {isReadToday ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Check className="w-4 h-4 text-slate-400" />}
              <span>{isReadToday ? 'Concluído' : 'Marcar lido'}</span>
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Flame className="w-3.5 h-3.5 text-amber-600" />
              Constância Diária
            </span>
            <span className="text-[10px] text-slate-400">Hábito</span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xl font-bold font-serif text-slate-900">{streak}</span>
            <span className="text-xs text-slate-500 leading-tight">
              {streak === 1 ? 'dia consecutivo lendo' : 'dias consecutivos lendo'}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Target className="w-3.5 h-3.5 text-amber-600" />
              Ritmo de Leitura
            </span>
            <span className="text-[10px] text-slate-400">Meta</span>
          </div>
          <p className="text-xs text-slate-600 font-medium leading-tight pt-1">
            Recomendado: <strong>1 capítulo ou 5 a 10 páginas</strong> por dia no seu devocional.
          </p>
        </div>
      </div>

      {/* Reflections & Prayer Journal */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="font-bold text-sm font-serif text-slate-900 flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-amber-600" />
            <span>Reflexão & Oração do Dia</span>
          </h3>
          <span className="text-[10px] text-slate-400">{activeDate}</span>
        </div>
        <p className="text-xs text-slate-500">
          O que Deus ministrou ao seu coração através da leitura do livro devocional hoje?
        </p>
        <textarea
          id="input-devotional-reflection"
          rows={3}
          value={reflectionText}
          onChange={(e) => setReflectionText(e.target.value)}
          placeholder="Escreva aqui seus aprendizados, orações ou versículos marcantes..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 leading-relaxed placeholder-slate-400 resize-y"
        />
        <div className="flex justify-end">
          <button
            onClick={handleSaveReflection}
            disabled={!reflectionText.trim()}
            className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 disabled:opacity-40 transition-colors shadow-2xs cursor-pointer"
          >
            Salvar Reflexão de Hoje
          </button>
        </div>

        {reflections.length > 0 && (
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Suas reflexões registradas ({reflections.length}):
            </span>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {reflections.map((ref) => (
                <div
                  key={ref.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1"
                >
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                    <span className="font-bold text-slate-700">{ref.bookTitle}</span>
                    <span>{ref.date}</span>
                  </div>
                  <p className="text-slate-700 leading-relaxed italic">&ldquo;{ref.text}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Book Picker Modal */}
      {showBookPickerModal && (
        <div
          id="modal-pick-devotional-book"
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
                    Escolher Livro Devocional
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Selecione um livro da sua biblioteca para sua leitura diária
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBookPickerModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
              {books.length === 0 ? (
                <div className="p-6 text-center text-slate-500 space-y-2">
                  <p className="text-xs">Sua biblioteca ainda não tem livros cadastrados.</p>
                  <p className="text-[11px] text-[#827A96]">Importe seus e-books ou PDFs na aba Biblioteca.</p>
                </div>
              ) : (
                books.map((b, bIdx) => {
                  const isCurrent = selectedBook?.id === b.id;
                  return (
                    <div
                      key={`dev-book-${b.id}-${bIdx}`}
                      onClick={() => handleSelectBook(b)}
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
                            {b.author || 'Autor não informado'}
                          </p>
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 mt-1 inline-block">
                            {b.format.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors ${
                          isCurrent
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-100 text-slate-700 hover:bg-amber-100 hover:text-amber-900'
                        }`}
                      >
                        {isCurrent ? 'Selecionado' : 'Escolher'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end items-center pt-2 border-t border-slate-100 shrink-0 text-xs">
              <button
                onClick={() => setShowBookPickerModal(false)}
                className="px-4 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-16 sm:bottom-6 right-4 sm:right-6 z-50 px-4 py-3 bg-slate-900 text-white text-xs font-semibold rounded-2xl shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 backdrop-blur-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
