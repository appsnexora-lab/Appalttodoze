'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Library,
  BookOpen,
  Star,
  ListOrdered,
  Target,
  ArrowUp,
  ArrowDown,
  Trash2,
  Search,
  UploadCloud,
  Files,
  X,
  Loader2,
  MoreVertical,
  ArrowUpDown,
  BookMarked,
  FileText,
  CheckSquare,
  Check,
  CheckCircle2,
  SlidersHorizontal,
  AlertTriangle,
  Copy,
  Layers,
} from 'lucide-react';
import { Book, ReadingList, ReadingListItem, ReadingGoal } from '@/types';
import {
  getBooks,
  ensureAllBookCovers,
  auditAndRepairBlankCovers,
  importBookFromFile,
  importMultipleBooks,
  ImportCancelToken,
  updateBook,
  deleteBook,
  batchDeleteBooks,
  checkBookDuplicate,
  findDuplicateBooksInLibrary,
  DuplicateGroup,
  SkippedDuplicateInfo,
  getReadingLists,
  getReadingListItems,
  addBookToReadingList,
  removeBookFromReadingList,
  reorderReadingListItems,
  toggleReadingListItemPriority,
  saveReadingGoal,
} from '@/lib/bookService';
import { cleanBookMetadata, isCoverValid, generateTypographicCover, isCoverImageBlank } from '@/lib/bookMetadataHelper';
import { dbPut, dbGetAll } from '@/lib/indexedDB';

interface LibraryViewProps {
  onOpenReader: (params: {
    contentType: 'book';
    contentId: string;
    title: string;
    subtitle?: string;
    bookData: Book;
  }) => void;
  initialFilter?: string;
}

type PrimaryCategory = 'all' | 'in_progress' | 'favorites' | 'completed';
type FormatFilter = 'all' | 'pdf' | 'epub' | 'bible' | 'reading_list';

type SortOption = 'recent' | 'title' | 'progress';

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const LibraryView: React.FC<LibraryViewProps> = ({ onOpenReader, initialFilter }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [readingListItems, setReadingListItems] = useState<ReadingListItem[]>([]);
  const [readingList, setReadingList] = useState<ReadingList | null>(null);
  const [goalsMap, setGoalsMap] = useState<Record<string, ReadingGoal>>({});
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});

  const [activeCategory, setActiveCategory] = useState<PrimaryCategory>(() => {
    if (initialFilter === 'favorites') return 'favorites';
    if (initialFilter === 'in_progress') return 'in_progress';
    if (initialFilter === 'completed') return 'completed';
    return 'all';
  });

  const [formatFilter, setFormatFilter] = useState<FormatFilter>(() => {
    if (initialFilter === 'pdf') return 'pdf';
    if (initialFilter === 'epub') return 'epub';
    if (initialFilter === 'reading_list') return 'reading_list';
    return 'all';
  });

  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importTitle, setImportTitle] = useState<string>('');
  const [importAuthor, setImportAuthor] = useState<string>('');
  const [importDescription, setImportDescription] = useState<string>('');
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    currentFileName: string;
    percent: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [importToast, setImportToast] = useState<string>('');
  const cancelTokenRef = useRef<ImportCancelToken>({ isCancelled: false });
  const lastProgressUpdateRef = useRef<number>(0);

  const [selectedBookForGoal, setSelectedBookForGoal] = useState<Book | null>(null);
  const [targetDays, setTargetDays] = useState<number>(30);
  const [visibleCount, setVisibleCount] = useState<number>(48);
  const [bookOptionsMenu, setBookOptionsMenu] = useState<Book | null>(null);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);

  // Multi-select & Batch Deletion state
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState<boolean>(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState<boolean>(false);

  // Fallback map for dynamically repairing any broken/blank cover
  const [imgErrorMap, setImgErrorMap] = useState<Record<string, string>>({});
  const [isAuditingCovers, setIsAuditingCovers] = useState<boolean>(false);

  const handleAuditBlankCovers = async () => {
    if (isAuditingCovers) return;
    setIsAuditingCovers(true);
    setImportToast('Identificando e verificando capas em branco...');
    try {
      const res = await auditAndRepairBlankCovers();
      const fresh = await getBooks();
      setBooks(fresh);
      if (res.fixedCount > 0) {
        setImportToast(`✓ O ALTTO identificou e corrigiu ${res.fixedCount} capa(s) que estavam em branco!`);
      } else {
        setImportToast('✓ Todas as capas da sua biblioteca estão perfeitas e sem páginas em branco!');
      }
      setTimeout(() => setImportToast(''), 5000);
    } catch {
      setImportToast('Erro ao auditar capas em branco.');
      setTimeout(() => setImportToast(''), 5000);
    } finally {
      setIsAuditingCovers(false);
    }
  };

  // Duplicate Book Detection & Warning State
  const [duplicateWarning, setDuplicateWarning] = useState<{
    file: File;
    existingBook: Book;
    candidateTitle: string;
    candidateAuthor: string;
    description?: string;
  } | null>(null);

  const [batchDuplicatesWarning, setBatchDuplicatesWarning] = useState<SkippedDuplicateInfo[] | null>(null);
  const [selectedDuplicatesToDelete, setSelectedDuplicatesToDelete] = useState<Set<string>>(new Set());

  const [libraryDuplicateGroups, setLibraryDuplicateGroups] = useState<DuplicateGroup[] | null>(null);
  const [isCheckingLibraryDuplicates, setIsCheckingLibraryDuplicates] = useState<boolean>(false);

  const handleResolveSingleDuplicate = async (action: 'replace' | 'keep_existing' | 'keep_both' | 'cancel') => {
    if (!duplicateWarning) return;
    const { file, existingBook, candidateTitle, candidateAuthor, description } = duplicateWarning;

    try {
      if (action === 'keep_existing') {
        // Keep the existing book safe in the library, discard the repeated file
        setImportToast(`✓ Livro repetido descartado. A cópia "${existingBook.title}" foi mantida na biblioteca.`);
        setDuplicateWarning(null);
        setImportFiles([]);
      } else if (action === 'replace') {
        // Replace previous version with the newly imported file
        await deleteBook(existingBook.id);
        await importBookFromFile(file, {
          title: candidateTitle,
          author: candidateAuthor,
          description,
        });
        setImportToast(`✓ Livro anterior substituído pelo novo arquivo com sucesso!`);
        setDuplicateWarning(null);
        setImportFiles([]);
        await loadData();
      } else if (action === 'keep_both') {
        // Keep both: import the new one as a separate copy
        await importBookFromFile(file, {
          title: `${candidateTitle} (Cópia)`,
          author: candidateAuthor,
          description,
        });
        setImportToast(`✓ Livro importado como cópia separada na biblioteca.`);
        setDuplicateWarning(null);
        setImportFiles([]);
        await loadData();
      } else {
        setDuplicateWarning(null);
        setImportFiles([]);
      }
    } catch (err) {
      console.error('Erro ao resolver duplicata:', err);
      setImportToast('Erro ao processar duplicata.');
    }
  };

  const handleConfirmBatchDeleteDuplicates = async () => {
    if (!batchDuplicatesWarning) return;
    try {
      // 1. The incoming duplicate files were skipped during import, so the original book remains preserved.
      // 2. Scan the library for any existing duplicate copies (e.g. 3 copies of the same book):
      const freshBooks = await getBooks();
      const groups = findDuplicateBooksInLibrary(freshBooks);
      const surplusIdsToDelete: string[] = [];

      for (const group of groups) {
        // Keep the best copy: prefer completed or highest reading progress, then oldest addedAt
        const sorted = [...group.books].sort((a, b) => {
          if (a.status === 'completed' && b.status !== 'completed') return -1;
          if (b.status === 'completed' && a.status !== 'completed') return 1;
          const progA = a.progressPercent || 0;
          const progB = b.progressPercent || 0;
          if (progB !== progA) return progB - progA;
          return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
        });
        // CRITICAL: Always keep sorted[0] in the library! Only delete surplus copies sorted[1..N-1]
        for (let i = 1; i < sorted.length; i++) {
          surplusIdsToDelete.push(sorted[i].id);
        }
      }

      if (surplusIdsToDelete.length > 0) {
        await batchDeleteBooks(surplusIdsToDelete);
      }

      setImportToast(`✓ Livros repetidos excluídos com sucesso. 1 cópia de cada livro foi mantida com segurança na biblioteca!`);
      setBatchDuplicatesWarning(null);
      setSelectedDuplicatesToDelete(new Set());
      await loadData();
    } catch (err) {
      console.error('Erro ao excluir duplicatas:', err);
      setImportToast('Erro ao processar duplicatas.');
    }
  };

  const handleKeepAllBatchDuplicates = async () => {
    if (!batchDuplicatesWarning || batchDuplicatesWarning.length === 0) {
      setBatchDuplicatesWarning(null);
      return;
    }
    setIsImporting(true);
    setImportProgress({
      current: 0,
      total: batchDuplicatesWarning.length,
      currentFileName: 'Importando e mantendo todos os livros...',
      percent: 0,
    });
    try {
      let importedCount = 0;
      for (let i = 0; i < batchDuplicatesWarning.length; i++) {
        const dupe = batchDuplicatesWarning[i];
        setImportProgress({
          current: i + 1,
          total: batchDuplicatesWarning.length,
          currentFileName: dupe.fileName || dupe.existingTitle,
          percent: Math.round(((i + 1) / batchDuplicatesWarning.length) * 100),
        });

        if (dupe.file) {
          await importBookFromFile(dupe.file, {
            title: `${dupe.existingTitle} (Cópia ${i + 1})`,
            skipSync: true,
          });
          importedCount++;
        } else if (dupe.existingBook) {
          // If file reference was detached, duplicate the book record pointing to the stored blob
          const newBookId = `book-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const copyBook: Book = {
            ...dupe.existingBook,
            id: newBookId,
            title: `${dupe.existingTitle} (Cópia ${i + 1})`,
            addedAt: new Date().toISOString(),
            fileBlobKey: dupe.existingBook.fileBlobKey || dupe.existingBook.id,
            syncStatus: 'synced',
          };
          await dbPut('books', copyBook);
          importedCount++;
        }
      }
      setBatchDuplicatesWarning(null);
      setSelectedDuplicatesToDelete(new Set());
      await loadData();
      setImportToast(`✓ Todos os ${importedCount} livro(s) repetidos foram mantidos e cadastrados na sua biblioteca!`);
    } catch (err) {
      console.error('Erro ao manter todos os livros repetidos:', err);
      setImportToast('Erro ao importar cópias repetidas.');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleCheckLibraryDuplicates = () => {
    setIsCheckingLibraryDuplicates(true);
    try {
      const groups = findDuplicateBooksInLibrary(books);
      if (groups.length === 0) {
        setImportToast('✓ Nenhum livro repetido encontrado na sua biblioteca!');
      } else {
        setLibraryDuplicateGroups(groups);
      }
    } finally {
      setIsCheckingLibraryDuplicates(false);
    }
  };

  const handleRemoveLibraryDuplicateBook = async (bookId: string) => {
    try {
      await deleteBook(bookId);
      const fresh = await getBooks();
      setBooks(fresh);
      const updatedGroups = findDuplicateBooksInLibrary(fresh);
      setLibraryDuplicateGroups(updatedGroups.length > 0 ? updatedGroups : null);
      setImportToast('✓ Livro repetido removido da sua biblioteca.');
    } catch {
      setImportToast('Erro ao remover livro repetido.');
    }
  };

  const handleKeepNewestInGroup = async (group: DuplicateGroup) => {
    try {
      const sorted = [...group.books].sort(
        (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
      );
      const toDelete = sorted.slice(1).map((b) => b.id);
      await batchDeleteBooks(toDelete);
      const fresh = await getBooks();
      setBooks(fresh);
      const updatedGroups = findDuplicateBooksInLibrary(fresh);
      setLibraryDuplicateGroups(updatedGroups.length > 0 ? updatedGroups : null);
      setImportToast(`✓ Duplicatas removidas. Apenas a versão mais recente foi mantida.`);
    } catch {
      setImportToast('Erro ao remover duplicatas.');
    }
  };

  const getDisplayCover = (b: Book): string => {
    if (imgErrorMap[b.id]) return imgErrorMap[b.id];
    if (isCoverValid(b.coverUrl)) return b.coverUrl!;
    return generateTypographicCover(b.title, b.author, b.format);
  };

  const toggleSelectMode = () => {
    if (isSelectMode) {
      setIsSelectMode(false);
      setSelectedBookIds(new Set());
    } else {
      setIsSelectMode(true);
      setSelectedBookIds(new Set());
    }
  };

  const handleToggleSelectBook = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setVisibleCount(48);
  };

  const handleCategoryChange = (cat: PrimaryCategory) => {
    setActiveCategory(cat);
    setVisibleCount(48);
  };

  const handleFormatChange = (fmt: FormatFilter) => {
    setFormatFilter(fmt);
    setVisibleCount(48);
  };

  const loadData = async () => {
    const bookList = await getBooks();
    setBooks(bookList);

    const lists = await getReadingLists();
    if (lists.length > 0) {
      setReadingList(lists[0]);
      const items = await getReadingListItems(lists[0].id);
      setReadingListItems(items);
    }

    const [allGoals, allProgresses] = await Promise.all([
      dbGetAll('reading_goals'),
      dbGetAll('reading_progress'),
    ]);

    const gMap: Record<string, ReadingGoal> = {};
    for (const g of allGoals) {
      if (g && g.bookId) gMap[g.bookId] = g;
    }
    const pMap: Record<string, number> = {};
    for (const p of allProgresses) {
      if (p && p.contentId) pMap[p.contentId] = p.percentage;
    }
    setGoalsMap(gMap);
    setProgressMap(pMap);
    setLoading(false);
  };

  useEffect(() => {
    let isCancelled = false;
    async function fetchData() {
      const bookList = await getBooks();
      if (isCancelled) return;
      setBooks(bookList);

      const lists = await getReadingLists();
      if (isCancelled) return;
      if (lists.length > 0) {
        setReadingList(lists[0]);
        const items = await getReadingListItems(lists[0].id);
        if (!isCancelled) setReadingListItems(items);
      }

      const [allGoals, allProgresses] = await Promise.all([
        dbGetAll('reading_goals'),
        dbGetAll('reading_progress'),
      ]);
      if (isCancelled) return;

      const gMap: Record<string, ReadingGoal> = {};
      for (const g of allGoals) {
        if (g && g.bookId) gMap[g.bookId] = g;
      }
      const pMap: Record<string, number> = {};
      for (const p of allProgresses) {
        if (p && p.contentId) pMap[p.contentId] = p.percentage;
      }
      setGoalsMap(gMap);
      setProgressMap(pMap);
      setLoading(false);
    }
    fetchData();
    return () => {
      isCancelled = true;
    };
  }, []);

  const handleFilesSelected = (selectedList: FileList | File[]) => {
    const validExtensions = ['.pdf', '.epub', '.mobi', '.cbz', '.cbr', '.txt'];
    const added: File[] = [];
    Array.from(selectedList).forEach((file) => {
      const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
      if (validExtensions.includes(ext)) {
        added.push(file);
      }
    });

    if (added.length === 0) return;

    setImportFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const newUnique = added.filter((f) => !existingKeys.has(`${f.name}-${f.size}`));
      const combined = [...prev, ...newUnique];
      if (combined.length === 1 && !importTitle) {
        setImportTitle(combined[0].name.replace(/\.[^/.]+$/, ''));
      }
      return combined;
    });
  };

  const handleRemoveFile = (index: number) => {
    setImportFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImportSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault?.();
    if (importFiles.length === 0 || isImporting) return;

    setIsImporting(true);
    cancelTokenRef.current = { isCancelled: false };
    const totalCount = importFiles.length;
    const filesToProcess = [...importFiles];

    try {
      let successCount = 0;
      let dupeCount = 0;
      let msg = '';

      if (totalCount === 1) {
        const file = filesToProcess[0];
        const pre = cleanBookMetadata(file.name, importTitle, importAuthor);
        const existingDupe = checkBookDuplicate(file.name, pre.title, pre.author, books);
        if (existingDupe) {
          setShowImportModal(false);
          setDuplicateWarning({
            file,
            existingBook: existingDupe,
            candidateTitle: pre.title,
            candidateAuthor: pre.author,
            description: importDescription,
          });
          setIsImporting(false);
          return;
        }

        setImportProgress({
          current: 1,
          total: 1,
          currentFileName: file.name,
          percent: 50,
        });

        await importBookFromFile(file, {
          title: importTitle || undefined,
          author: importAuthor || undefined,
          description: importDescription || undefined,
        });
        successCount = 1;
        msg = '✓ Livro importado com capa original e metadados com sucesso!';
      } else {
        lastProgressUpdateRef.current = 0;
        const result = await importMultipleBooks(
          filesToProcess,
          (prog) => {
            const now = Date.now();
            if (
              prog.current === 1 ||
              prog.current === prog.total ||
              now - lastProgressUpdateRef.current > 120
            ) {
              lastProgressUpdateRef.current = now;
              setImportProgress(prog);
            }
          },
          cancelTokenRef.current
        );

        successCount = result.success.length;
        dupeCount = result.duplicatesSkipped.length;

        if (dupeCount > 0) {
          setShowImportModal(false);
          setBatchDuplicatesWarning(result.duplicatesSkipped);
          setSelectedDuplicatesToDelete(new Set(result.duplicatesSkipped.map((d) => d.existingBook.id)));
        }

        if (successCount > 0 && dupeCount > 0) {
          msg = `✓ ${successCount} livro(s) importado(s) com sucesso. ${dupeCount} livro(s) repetidos detectados!`;
        } else if (successCount > 0) {
          msg = `✓ ${successCount} livro(s) importado(s) com capas originais e metadados com sucesso!`;
        } else if (dupeCount > 0) {
          msg = `⚠️ Os ${dupeCount} livros selecionados já constam na biblioteca.`;
        } else {
          msg = `Nenhum livro pôde ser importado. Verifique os arquivos.`;
        }
      }

      setShowImportModal(false);
      setImportFiles([]);
      setImportTitle('');
      setImportAuthor('');
      setImportDescription('');
      setImportProgress(null);
      await loadData();
      setImportToast(msg);
      setTimeout(() => setImportToast(''), 6000);
    } catch (err: any) {
      console.error('Falha geral na importação:', err);
      setImportToast('Erro ao importar arquivo(s). Verifique os formatos ou armazenamento disponível.');
      setTimeout(() => setImportToast(''), 5000);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleAddClassicBook = async (preset: 'peregrino' | 'imitacao') => {
    setIsImporting(true);
    const bookId = `classic-${preset}-${Date.now()}`;
    let book: Book;

    if (preset === 'peregrino') {
      book = {
        id: bookId,
        title: 'O Peregrino',
        author: 'John Bunyan',
        description:
          'A célebre alegoria cristã de Cristão em sua jornada desde a Cidade da Destruição até a Cidade Celestial.',
        format: 'txt',
        totalPages: 240,
        totalChapters: 10,
        textContent:
          'Caminhando pelo deserto deste mundo, cheguei a um lugar onde havia uma caverna; ali me deitei para dormir e, enquanto dormia, tive um sonho. Vi um homem vestido de farrapos, de pé em certo lugar, com as costas voltadas para a sua própria casa, um fardo pesado sobre os ombros e um livro nas mãos. Olhei, e vi-o abrir o livro e ler nele; e, enquanto lia, chorava e tremia; e, não podendo conter-se por mais tempo, deu um grito angustioso dizendo: "Que farei eu?"',
        status: 'not_started',
        isFavorite: true,
        addedAt: new Date().toISOString(),
      };
    } else {
      book = {
        id: bookId,
        title: 'A Imitação de Cristo',
        author: 'Tomás de Kempis',
        description:
          'Um dos maiores clássicos de devoção e disciplina espiritual de todos os tempos.',
        format: 'txt',
        totalPages: 180,
        totalChapters: 4,
        textContent:
          'Aquele que me segue não andará em trevas, diz o Senhor. Com estas palavras Cristo nos exorta a imitar Sua vida e Seus costumes, se queremos ser verdadeiramente iluminados e livres de toda cegueira do coração. Seja, pois, nosso principal estudo meditar sobre a vida de Jesus Cristo.',
        status: 'not_started',
        isFavorite: false,
        addedAt: new Date().toISOString(),
      };
    }

    await dbPut('books', book);
    setIsImporting(false);
    setShowImportModal(false);
    await loadData();
  };

  const handleToggleFavorite = async (book: Book) => {
    const updated = { ...book, isFavorite: !book.isFavorite };
    await updateBook(updated);
    setBooks((prev) => prev.map((b) => (b.id === book.id ? updated : b)));
  };

  const handleToggleReadingList = async (bookId: string) => {
    if (!readingList) return;
    const existing = readingListItems.find((i) => i.bookId === bookId);
    if (existing) {
      await removeBookFromReadingList(existing.id);
    } else {
      await addBookToReadingList(readingList.id, bookId);
    }
    const updated = await getReadingListItems(readingList.id);
    setReadingListItems(updated);
  };

  const handleMoveItem = async (index: number, direction: 'up' | 'down') => {
    const newItems = [...readingListItems];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newItems.length) return;
    const temp = newItems[index];
    newItems[index] = newItems[targetIdx];
    newItems[targetIdx] = temp;
    setReadingListItems(newItems);
    await reorderReadingListItems(newItems);
  };

  const handleSaveGoal = async () => {
    if (!selectedBookForGoal) return;
    const g = await saveReadingGoal(
      selectedBookForGoal.id,
      targetDays,
      selectedBookForGoal.totalPages || 120
    );
    setGoalsMap((prev) => ({ ...prev, [selectedBookForGoal.id]: g }));
    setSelectedBookForGoal(null);
  };

  const handleConfirmDeleteBook = async () => {
    if (!bookToDelete) return;
    await deleteBook(bookToDelete.id);
    setBooks((prev) => prev.filter((x) => x.id !== bookToDelete.id));
    setBookToDelete(null);
    setImportToast(`Livro "${bookToDelete.title}" removido da biblioteca.`);
    setTimeout(() => setImportToast(''), 3000);
  };

  const inProgressCount = useMemo(() => {
    return books.filter((b) => b.status === 'in_progress' || (progressMap[b.id] || 0) > 0).length;
  }, [books, progressMap]);

  const favoritesCount = useMemo(() => {
    return books.filter((b) => b.isFavorite).length;
  }, [books]);

  const completedCount = useMemo(() => {
    return books.filter((b) => b.status === 'completed' || (progressMap[b.id] === 100)).length;
  }, [books, progressMap]);

  const filteredBooks = useMemo(() => {
    const seenIds = new Set<string>();
    return books
      .filter((b) => {
        if (!b || !b.id) return false;
        if (seenIds.has(b.id)) return false;
        seenIds.add(b.id);

        const matchesSearch =
          !searchQuery.trim() ||
          b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.author.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;

        // Primary Category filter
        if (activeCategory === 'in_progress') {
          const prog = progressMap[b.id] ?? b.progressPercent ?? 0;
          if (b.status !== 'in_progress' && prog === 0) return false;
        } else if (activeCategory === 'favorites') {
          if (!b.isFavorite) return false;
        } else if (activeCategory === 'completed') {
          const prog = progressMap[b.id] ?? b.progressPercent ?? 0;
          if (b.status !== 'completed' && prog < 100) return false;
        }

        // Format filter
        if (formatFilter === 'pdf') {
          if (b.format !== 'pdf') return false;
        } else if (formatFilter === 'epub') {
          if (b.format !== 'epub' && b.format !== 'mobi') return false;
        } else if (formatFilter === 'bible') {
          const t = b.title.toLowerCase();
          if (!t.includes('bíblia') && !t.includes('biblia') && !t.includes('testamento')) return false;
        } else if (formatFilter === 'reading_list') {
          if (!readingListItems.some((i) => i.bookId === b.id)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOption === 'title') {
          return a.title.localeCompare(b.title);
        }
        if (sortOption === 'progress') {
          const progA = progressMap[a.id] ?? a.progressPercent ?? 0;
          const progB = progressMap[b.id] ?? b.progressPercent ?? 0;
          return progB - progA;
        }
        const dateA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
        const dateB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
        return dateB - dateA;
      });
  }, [books, searchQuery, activeCategory, formatFilter, sortOption, progressMap, readingListItems]);

  const handleSelectAllFiltered = () => {
    if (selectedBookIds.size === filteredBooks.length && filteredBooks.length > 0) {
      setSelectedBookIds(new Set());
    } else {
      setSelectedBookIds(new Set(filteredBooks.map((b) => b.id)));
    }
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedBookIds.size === 0 || isDeletingBatch) return;
    setIsDeletingBatch(true);
    try {
      const idsToDelete = Array.from(selectedBookIds);
      const count = await batchDeleteBooks(idsToDelete);
      setBooks((prev) => prev.filter((b) => !selectedBookIds.has(b.id)));
      setShowBatchDeleteModal(false);
      setIsSelectMode(false);
      setSelectedBookIds(new Set());
      await loadData();
      setImportToast(`✓ ${count} livro(s) excluído(s) com sucesso da biblioteca.`);
      setTimeout(() => setImportToast(''), 5000);
    } catch (err) {
      console.error('Erro na exclusão em lote:', err);
      setImportToast('Erro ao excluir livros selecionados.');
      setTimeout(() => setImportToast(''), 5000);
    } finally {
      setIsDeletingBatch(false);
    }
  };

  const renderCompactBookCard = (b: Book, cardIdx?: number) => {
    const inList = readingListItems.some((i) => i.bookId === b.id);
    const recordedProgress = progressMap[b.id] ?? b.progressPercent ?? 0;
    let progressPct = recordedProgress;
    if (b.status === 'completed') {
      progressPct = 100;
    } else if (progressPct === 0) {
      if (b.currentPage && b.totalPages && b.totalPages > 0) {
        progressPct = Math.min(100, Math.round((b.currentPage / b.totalPages) * 100));
      } else if (b.currentChapterIndex !== undefined && b.totalChapters && b.totalChapters > 0) {
        progressPct = Math.min(100, Math.round(((b.currentChapterIndex + 1) / b.totalChapters) * 100));
      }
    }

    const hasPageInfo = Boolean(b.totalPages && b.totalPages > 0);
    const pageProgressStr = hasPageInfo
      ? `pág. ${b.currentPage || 1}/${b.totalPages}`
      : b.totalChapters && b.totalChapters > 0
      ? `cap. ${(b.currentChapterIndex ?? 0) + 1}/${b.totalChapters}`
      : null;

    const isCompleted = b.status === 'completed' || progressPct === 100;
    const isReading = !isCompleted && progressPct > 0;
    const isSelected = selectedBookIds.has(b.id);

    return (
      <div
        key={`book-card-${b.id}-${cardIdx ?? ''}`}
        id={`book-card-${b.id}`}
        className={`group flex flex-col justify-between select-none cursor-pointer min-w-0 w-full rounded-2xl p-1.5 sm:p-2 transition-all duration-200 ${
          isSelectMode && isSelected
            ? 'bg-[#F0EAFE] border-2 border-[#A58ADB] shadow-[0_4px_16px_rgba(165,138,219,0.25)] ring-1 ring-[#A58ADB]'
            : isSelectMode
            ? 'bg-white hover:bg-[#FAF9FD] border-2 border-[#EAE5F4] hover:border-[#C4B1F0]'
            : 'bg-white hover:bg-[#FAF9FD] border border-[#EAE5F4] hover:border-[#C4B1F0] shadow-[0_2px_10px_rgba(165,138,219,0.06)] hover:shadow-[0_4px_16px_rgba(165,138,219,0.14)]'
        }`}
        onClick={() => {
          if (isSelectMode) {
            handleToggleSelectBook(b.id);
          } else {
            onOpenReader({
              contentType: 'book',
              contentId: b.id,
              title: b.title,
              subtitle: b.author,
              bookData: b,
            });
          }
        }}
      >
        {/* Book Cover Container with physical book proportions (3:4) */}
        <div className="w-full aspect-[3/4] relative rounded-xl overflow-hidden bg-[#FAF9FD] border border-[#EAE5F4] shadow-xs group-hover:shadow-sm transition-all duration-200 flex items-center justify-center p-0.5">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-r from-black/20 via-black/05 to-transparent z-10 pointer-events-none" />
          <img
            src={getDisplayCover(b)}
            alt={`Capa de ${b.title}`}
            className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            decoding="async"
            onError={() => {
              const fallback = generateTypographicCover(b.title, b.author, b.format);
              setImgErrorMap((prev) => (prev[b.id] === fallback ? prev : { ...prev, [b.id]: fallback }));
            }}
          />

          {isSelectMode ? (
            <div
              onClick={(e) => handleToggleSelectBook(b.id, e)}
              className="absolute top-1.5 left-1.5 z-20 cursor-pointer"
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shadow-xs transition-all ${
                  isSelected
                    ? 'bg-[#A58ADB] text-white scale-105'
                    : 'bg-white/95 border-2 border-[#827A96] text-transparent hover:border-[#A58ADB]'
                }`}
              >
                <Check className={`w-3.5 h-3.5 stroke-[3] ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
              </div>
            </div>
          ) : (
            <span className="absolute top-1 left-1.5 z-10 text-[7px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/65 text-white shadow-xs backdrop-blur-xs leading-none">
              {b.format.toUpperCase()}
            </span>
          )}

          {!isSelectMode && (
            <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 bg-white/95 text-[#29243A] backdrop-blur-xs rounded-lg px-1 py-0.5 shadow-xs border border-[#EAE5F4] transition-colors">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFavorite(b);
                }}
                className={`p-0.5 rounded transition-colors cursor-pointer ${
                  b.isFavorite ? 'text-[#A58ADB] fill-[#A58ADB]' : 'text-[#827A96] hover:text-[#A58ADB]'
                }`}
                title={b.isFavorite ? 'Remover dos favoritos' : 'Favoritar livro'}
              >
                <Star className={`w-3 h-3 ${b.isFavorite ? 'fill-[#A58ADB] text-[#A58ADB]' : ''}`} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleReadingList(b.id);
                }}
                className={`p-0.5 rounded transition-colors cursor-pointer ${
                  inList ? 'text-[#A58ADB] font-bold' : 'text-[#827A96] hover:text-[#29243A]'
                }`}
                title={inList ? 'Na Minha Lista' : 'Adicionar à Minha Lista'}
              >
                <ListOrdered className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBookOptionsMenu(b);
                }}
                className="p-0.5 rounded text-[#827A96] hover:text-[#29243A] transition-colors cursor-pointer"
                title="Mais opções"
              >
                <MoreVertical className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Book Details Below Cover */}
        <div className="mt-1.5 pt-1.5 border-t border-[#EAE5F4] flex flex-col justify-between flex-1 min-w-0 space-y-1.5">
          <div className="min-w-0 w-full space-y-0.5">
            <h3
              className="w-full min-w-0 text-[10.5px] sm:text-[11.5px] font-bold font-serif text-[#29243A] leading-snug group-hover:text-[#A58ADB] transition-colors line-clamp-2 break-words"
              title={b.title}
            >
              {b.title}
            </h3>
            <p
              className="w-full min-w-0 text-[9px] sm:text-[10px] text-[#827A96] font-medium leading-tight truncate"
              title={b.author || 'Autor não informado'}
            >
              {b.author || 'E-book'}
            </p>
          </div>

          {/* Reading Progress Indicator */}
          <div className="space-y-1 pt-0.5 min-w-0 w-full">
            <div className="flex items-center justify-between text-[8px] sm:text-[8.5px] font-medium text-[#827A96] gap-1">
              <span
                className={`px-1 py-0.2 rounded font-semibold text-[7.5px] uppercase tracking-wide leading-none ${
                  isCompleted
                    ? 'bg-[#E9F7EF] text-[#2E7D32]'
                    : isReading
                    ? 'bg-[#F0EAFE] text-[#A58ADB]'
                    : 'bg-[#FAF9FD] text-[#827A96]'
                }`}
              >
                {isCompleted ? 'Concluído' : isReading ? 'Lendo' : 'Não lido'}
              </span>
              {pageProgressStr && (
                <span className="text-[7.5px] text-[#827A96] shrink-0 truncate">
                  {pageProgressStr}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 w-full min-w-0">
              <div className="flex-1 h-1.5 rounded-full bg-[#F0EAFE] border border-[#EAE5F4] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isCompleted ? 'bg-[#B9DCCB]' : 'bg-[#A58ADB]'
                  }`}
                  style={{ width: `${Math.max(progressPct > 0 ? 5 : 0, progressPct)}%` }}
                />
              </div>
              <span className="text-[8px] sm:text-[8.5px] text-[#29243A] font-bold shrink-0 leading-none">
                {progressPct}%
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-[#827A96] gap-3">
        <div className="w-8 h-8 border-2 border-[#A58ADB] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium">Carregando biblioteca...</span>
      </div>
    );
  }

  return (
    <div id="library-view-container" className="max-w-[1560px] w-full mx-auto px-2 sm:px-4 md:px-6 py-4 space-y-4 bg-white min-h-screen text-[#29243A]">
      {/* Toast message */}
      {importToast && (
        <div className="p-3.5 rounded-2xl bg-white border border-[#C4B1F0] text-[#29243A] text-xs font-semibold flex items-center justify-between gap-3 shadow-[0_4px_16px_rgba(165,138,219,0.15)] animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#A58ADB] shrink-0" />
            <span>{importToast}</span>
          </div>
          <button
            onClick={() => setImportToast('')}
            className="text-[10px] text-[#A58ADB] hover:text-[#8C6ECD] underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#EAE5F4] pb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-serif text-[#29243A] tracking-tight">Biblioteca</h1>
          <p className="text-xs text-[#827A96] mt-0.5">
            Sua coleção completa de livros, Bíblia, e-books e documentos (PDF, EPUB, MOBI, CBZ).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {books.length > 0 && (
            <>
              <button
                id="btn-audit-blank-covers"
                onClick={handleAuditBlankCovers}
                disabled={isAuditingCovers}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border bg-white hover:bg-[#FAF9FD] text-[#29243A] border-[#EAE5F4] hover:border-[#C4B1F0] disabled:opacity-50 shadow-2xs"
                title="Detectar e restaurar automaticamente livros com capas em branco"
              >
                {isAuditingCovers ? (
                  <Loader2 className="w-3.5 h-3.5 text-[#A58ADB] animate-spin" />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-[#A58ADB]" />
                )}
                <span>{isAuditingCovers ? 'Corrigindo...' : 'Corrigir Capas'}</span>
              </button>

              <button
                id="btn-check-duplicates"
                onClick={handleCheckLibraryDuplicates}
                disabled={isCheckingLibraryDuplicates}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border bg-white hover:bg-[#FAF9FD] text-[#29243A] border-[#EAE5F4] hover:border-[#C4B1F0] disabled:opacity-50 shadow-2xs"
                title="Localizar e remover livros duplicados ou repetidos na biblioteca"
              >
                {isCheckingLibraryDuplicates ? (
                  <Loader2 className="w-3.5 h-3.5 text-[#A58ADB] animate-spin" />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-[#A58ADB]" />
                )}
                <span>{isCheckingLibraryDuplicates ? 'Verificando...' : 'Verificar Repetidos'}</span>
              </button>

              <button
                id="btn-toggle-select-mode"
                onClick={toggleSelectMode}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  isSelectMode
                    ? 'bg-[#F0EAFE] text-[#A58ADB] border-[#C4B1F0] shadow-xs'
                    : 'bg-white hover:bg-[#FAF9FD] text-[#29243A] border-[#EAE5F4]'
                }`}
                title={isSelectMode ? 'Sair da seleção' : 'Selecionar vários livros para excluir ou gerenciar'}
              >
                <CheckSquare className="w-3.5 h-3.5 text-[#A58ADB]" />
                <span>{isSelectMode ? 'Sair da Seleção' : 'Selecionar Vários'}</span>
              </button>
            </>
          )}

          <button
            id="btn-import-book-top"
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold btn-lilas shadow-xs cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>+ Importar Livros</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-3">
        {/* Minimalist Primary Classification - 100% Screen Fitted, zero horizontal scroll */}
        <div className="grid grid-cols-4 gap-1 sm:gap-2 w-full p-1 bg-[#FAF9FD] rounded-2xl border border-[#EAE5F4]">
          <button
            id="filter-books-all"
            onClick={() => {
              setActiveCategory('all');
              setVisibleCount(48);
            }}
            className={`py-2 px-1 rounded-xl text-center text-xs font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 ${
              activeCategory === 'all'
                ? 'bg-white text-[#A58ADB] shadow-xs border border-[#EAE5F4]'
                : 'text-[#827A96] hover:text-[#29243A] hover:bg-white/60'
            }`}
          >
            <span>Todos</span>
            <span className="text-[10px] opacity-75 font-normal">({books.length})</span>
          </button>

          <button
            id="filter-books-in-progress"
            onClick={() => {
              setActiveCategory('in_progress');
              setVisibleCount(48);
            }}
            className={`py-2 px-1 rounded-xl text-center text-xs font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 ${
              activeCategory === 'in_progress'
                ? 'bg-white text-[#A58ADB] shadow-xs border border-[#EAE5F4]'
                : 'text-[#827A96] hover:text-[#29243A] hover:bg-white/60'
            }`}
          >
            <span>Lendo</span>
            <span className="text-[10px] opacity-75 font-normal">({inProgressCount})</span>
          </button>

          <button
            id="filter-books-favorites"
            onClick={() => {
              setActiveCategory('favorites');
              setVisibleCount(48);
            }}
            className={`py-2 px-1 rounded-xl text-center text-xs font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 ${
              activeCategory === 'favorites'
                ? 'bg-white text-[#A58ADB] shadow-xs border border-[#EAE5F4]'
                : 'text-[#827A96] hover:text-[#29243A] hover:bg-white/60'
            }`}
          >
            <span>Favoritos</span>
            <span className="text-[10px] opacity-75 font-normal">({favoritesCount})</span>
          </button>

          <button
            id="filter-books-completed"
            onClick={() => {
              setActiveCategory('completed');
              setVisibleCount(48);
            }}
            className={`py-2 px-1 rounded-xl text-center text-xs font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 ${
              activeCategory === 'completed'
                ? 'bg-white text-[#A58ADB] shadow-xs border border-[#EAE5F4]'
                : 'text-[#827A96] hover:text-[#29243A] hover:bg-white/60'
            }`}
          >
            <span>Concluídos</span>
            <span className="text-[10px] opacity-75 font-normal">({completedCount})</span>
          </button>
        </div>

        {/* Search, Format Filter and Sort Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A58ADB]" />
            <input
              type="text"
              placeholder="Buscar por título ou autor..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-[#FAF9FD] border border-[#EAE5F4] rounded-2xl pl-10 pr-9 py-2 text-xs text-[#29243A] placeholder-[#827A96] focus:outline-none focus:bg-white focus:border-[#A58ADB] transition-colors shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#827A96] hover:text-[#29243A] p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Format Filter Selector */}
            <div className="flex items-center gap-1.5 bg-[#FAF9FD] border border-[#EAE5F4] rounded-2xl px-2.5 py-1 text-xs flex-1 sm:flex-initial">
              <span className="text-[#827A96] font-medium hidden md:inline">Formato:</span>
              <select
                value={formatFilter}
                onChange={(e) => {
                  setFormatFilter(e.target.value as FormatFilter);
                  setVisibleCount(48);
                }}
                className="bg-transparent text-xs text-[#29243A] font-semibold pr-1 py-1 focus:outline-none cursor-pointer w-full sm:w-auto"
              >
                <option value="all">Todos os formatos ({books.length})</option>
                <option value="pdf">Documentos PDF ({books.filter((b) => b.format === 'pdf').length})</option>
                <option value="epub">E-books EPUB ({books.filter((b) => b.format === 'epub' || b.format === 'mobi').length})</option>
                <option value="bible">Bíblias da Biblioteca ({books.filter((b) => b.title.toLowerCase().includes('bíblia') || b.title.toLowerCase().includes('biblia')).length})</option>
                <option value="reading_list">Lista Quero Ler ({readingListItems.length})</option>
              </select>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1 bg-[#FAF9FD] border border-[#EAE5F4] rounded-2xl px-2 py-1 text-xs shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#A58ADB] ml-1" />
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="bg-transparent text-xs text-[#29243A] font-semibold pr-1 py-1 focus:outline-none cursor-pointer"
              >
                <option value="recent">Recentes</option>
                <option value="title">Título (A-Z)</option>
                <option value="progress">Progresso</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Batch Selection Action Bar */}
      {isSelectMode && (
        <div className="p-3 sm:p-3.5 bg-white border-2 border-[#A58ADB]/40 rounded-2xl flex items-center justify-between flex-wrap gap-3 shadow-[0_4px_20px_rgba(165,138,219,0.15)] animate-in fade-in slide-in-from-top-1 sticky top-2 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="flex items-center gap-2 text-xs font-bold text-[#29243A] hover:text-[#A58ADB] cursor-pointer"
            >
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                  selectedBookIds.size > 0 && selectedBookIds.size === filteredBooks.length
                    ? 'bg-[#A58ADB] text-white shadow-xs'
                    : 'bg-white border-2 border-[#827A96]'
                }`}
              >
                {selectedBookIds.size > 0 && selectedBookIds.size === filteredBooks.length ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : null}
              </div>
              <span>
                {selectedBookIds.size === filteredBooks.length && filteredBooks.length > 0
                  ? 'Desmarcar todos'
                  : 'Selecionar todos'}
              </span>
            </button>
            <span className="text-xs px-2.5 py-1 rounded-full bg-[#F0EAFE] text-[#A58ADB] font-bold">
              {selectedBookIds.size} de {filteredBooks.length} livro(s) selecionado(s)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedBookIds.size === 0 || isDeletingBatch}
              onClick={() => setShowBatchDeleteModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs flex items-center gap-1.5 transition-all border border-rose-200 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Excluir selecionados ({selectedBookIds.size})</span>
            </button>
            <button
              type="button"
              onClick={toggleSelectMode}
              className="px-3 py-1.5 rounded-xl bg-[#FAF9FD] hover:bg-[#F0EAFE] text-[#827A96] hover:text-[#29243A] font-semibold text-xs border border-[#EAE5F4] cursor-pointer"
            >
              Concluir
            </button>
          </div>
        </div>
      )}

      {/* READING LIST REORDER SECTION */}
      {formatFilter === 'reading_list' && (
        <div className="p-5 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold font-serif text-[#29243A] flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-[#A58ADB]" />
                <span>Quero Ler — Sequência Personalizada</span>
              </h2>
              <p className="text-xs text-[#827A96]">
                Defina sua ordem de prioridade para leituras futuras. Use as setas para organizar a lista.
              </p>
            </div>
          </div>

          {readingListItems.length === 0 ? (
            <p className="text-xs text-[#827A96] italic">
              Nenhum livro adicionado à sua lista ainda. Toque no ícone de lista em qualquer livro para adicioná-lo.
            </p>
          ) : (
            <div className="space-y-2">
              {readingListItems.map((item, idx) => {
                const book = books.find((b) => b.id === item.bookId);
                if (!book) return null;
                return (
                  <div
                    key={`rli-${item.id}-${idx}`}
                    className="p-3 rounded-xl bg-white border border-[#EAE5F4] flex items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center font-bold text-xs text-[#A58ADB] font-mono">
                        {idx + 1}.
                      </span>
                      {book.coverUrl ? (
                        <div className="w-9 h-12 rounded overflow-hidden bg-[#FAF9FD] border border-[#EAE5F4] shrink-0">
                          <img src={book.coverUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : null}
                      <div>
                        <h4 className="text-xs font-bold text-[#29243A] font-serif">{book.title}</h4>
                        <p className="text-[11px] text-[#827A96]">{book.author || 'Autor não informado'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={async () => {
                          await toggleReadingListItemPriority(item.id);
                          if (readingList) {
                            const updated = await getReadingListItems(readingList.id);
                            setReadingListItems(updated);
                          }
                        }}
                        className={`p-1.5 rounded-lg cursor-pointer ${
                          item.isPriority ? 'text-[#A58ADB]' : 'text-[#827A96] hover:text-[#29243A]'
                        }`}
                        title="Marcar prioridade"
                      >
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </button>
                      <button
                        disabled={idx === 0}
                        onClick={() => handleMoveItem(idx, 'up')}
                        className="p-1.5 rounded-lg hover:bg-[#F0EAFE] text-[#827A96] disabled:opacity-20 cursor-pointer"
                        title="Subir na fila"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={idx === readingListItems.length - 1}
                        onClick={() => handleMoveItem(idx, 'down')}
                        className="p-1.5 rounded-lg hover:bg-[#F0EAFE] text-[#827A96] disabled:opacity-20 cursor-pointer"
                        title="Descer na fila"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          onOpenReader({
                            contentType: 'book',
                            contentId: book.id,
                            title: book.title,
                            subtitle: book.author,
                            bookData: book,
                          })
                        }
                        className="px-3 py-1 rounded-lg btn-lilas text-[11px] font-bold ml-1 shadow-2xs cursor-pointer"
                      >
                        Ler
                      </button>
                      <button
                        onClick={async () => {
                          await removeBookFromReadingList(item.id);
                          if (readingList) {
                            const updated = await getReadingListItems(readingList.id);
                            setReadingListItems(updated);
                          }
                        }}
                        className="p-1.5 text-[#827A96] hover:text-rose-600 cursor-pointer"
                        title="Remover da lista"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MAIN BOOKS DISPLAY */}
      {filteredBooks.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#FAF9FD] border border-[#EAE5F4] text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center mx-auto shadow-xs">
            <Library className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#29243A] font-serif">Nenhum livro encontrado</h3>
            <p className="text-xs text-[#827A96] mt-1 max-w-sm mx-auto leading-relaxed">
              Tente ajustar sua busca ou adicione novos livros e e-books à sua biblioteca.
            </p>
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="px-5 py-2.5 rounded-xl btn-lilas font-bold text-xs shadow-xs cursor-pointer"
          >
            + Importar Livros (PDF / EPUB)
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            id="main-books-grid"
            className="w-full grid grid-cols-4 gap-2 sm:gap-3.5 md:gap-4 book-grid-4"
          >
            {filteredBooks.slice(0, visibleCount).map((b, bIdx) => renderCompactBookCard(b, bIdx))}
          </div>

          {filteredBooks.length > visibleCount && (
            <div className="pt-6 pb-2 text-center">
              <button
                onClick={() => setVisibleCount((prev) => prev + 48)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white hover:bg-[#F0EAFE] text-[#29243A] hover:text-[#A58ADB] font-bold text-xs transition-colors border border-[#EAE5F4] hover:border-[#C4B1F0] shadow-xs cursor-pointer"
              >
                <span>Carregar mais livros</span>
                <span className="text-[11px] text-[#827A96] font-normal">
                  (Exibindo {visibleCount} de {filteredBooks.length})
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Book Options Menu Modal */}
      {bookOptionsMenu && (
        <div
          className="fixed inset-0 z-50 bg-[#29243A]/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setBookOptionsMenu(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-[#EAE5F4] space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#EAE5F4] pb-3">
              <div className="min-w-0 pr-2">
                <h4 className="font-bold text-sm font-serif text-[#29243A] truncate">
                  {bookOptionsMenu.title}
                </h4>
                <p className="text-xs text-[#827A96] truncate">
                  {bookOptionsMenu.author || 'Autor não informado'}
                </p>
              </div>
              <button
                onClick={() => setBookOptionsMenu(null)}
                className="text-[#827A96] hover:text-[#29243A] p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              <button
                onClick={() => {
                  const b = bookOptionsMenu;
                  setBookOptionsMenu(null);
                  onOpenReader({
                    contentType: 'book',
                    contentId: b.id,
                    title: b.title,
                    subtitle: b.author,
                    bookData: b,
                  });
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#F0EAFE] text-[#29243A] hover:text-[#A58ADB] font-medium text-xs transition-colors text-left cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-[#A58ADB]" />
                <span>Abrir Leitor</span>
              </button>

              <button
                onClick={() => {
                  handleToggleFavorite(bookOptionsMenu);
                  setBookOptionsMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#FAF9FD] text-[#29243A] font-medium text-xs transition-colors text-left cursor-pointer"
              >
                <Star
                  className={`w-4 h-4 ${
                    bookOptionsMenu.isFavorite ? 'text-[#A58ADB] fill-[#A58ADB]' : 'text-[#827A96]'
                  }`}
                />
                <span>{bookOptionsMenu.isFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}</span>
              </button>

              <button
                onClick={() => {
                  handleToggleReadingList(bookOptionsMenu.id);
                  setBookOptionsMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#FAF9FD] text-[#29243A] font-medium text-xs transition-colors text-left cursor-pointer"
              >
                <ListOrdered className="w-4 h-4 text-[#827A96]" />
                <span>
                  {readingListItems.some((i) => i.bookId === bookOptionsMenu.id)
                    ? 'Remover da Minha Lista'
                    : 'Adicionar à Minha Lista'}
                </span>
              </button>

              <button
                onClick={() => {
                  const b = bookOptionsMenu;
                  setBookOptionsMenu(null);
                  setSelectedBookForGoal(b);
                  const goal = goalsMap[b.id];
                  if (goal) setTargetDays(goal.targetDays);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#FAF9FD] text-[#29243A] font-medium text-xs transition-colors text-left cursor-pointer"
              >
                <Target className="w-4 h-4 text-[#A58ADB]" />
                <span>Definir Meta de Leitura</span>
              </button>

              <button
                onClick={() => {
                  const b = bookOptionsMenu;
                  setBookOptionsMenu(null);
                  setBookToDelete(b);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-rose-50 text-rose-600 font-medium text-xs transition-colors text-left cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-rose-500" />
                <span>Excluir Livro da Biblioteca</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {bookToDelete && (
        <div
          className="fixed inset-0 z-50 bg-[#29243A]/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setBookToDelete(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-[#EAE5F4] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="font-bold text-base font-serif text-[#29243A]">Excluir livro?</h4>
              <p className="text-xs text-[#827A96] leading-relaxed">
                Tem certeza que deseja excluir <strong>&ldquo;{bookToDelete.title}&rdquo;</strong> da sua biblioteca?
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setBookToDelete(null)}
                className="flex-1 py-2 px-3 rounded-xl bg-[#FAF9FD] hover:bg-[#F0EAFE] text-[#29243A] font-semibold text-xs border border-[#EAE5F4] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDeleteBook}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteModal && (
        <div
          className="fixed inset-0 z-50 bg-[#29243A]/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => !isDeletingBatch && setShowBatchDeleteModal(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-[#EAE5F4] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="font-bold text-base font-serif text-[#29243A]">
                Excluir {selectedBookIds.size} livro(s) selecionado(s)?
              </h4>
              <p className="text-xs text-[#827A96] leading-relaxed">
                Esta ação apagará permanentemente os {selectedBookIds.size} livros selecionados da sua biblioteca, incluindo arquivos armazenados localmente e o histórico de leitura.
              </p>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1 p-2 bg-[#FAF9FD] rounded-xl border border-[#EAE5F4] text-xs">
              {filteredBooks
                .filter((b) => selectedBookIds.has(b.id))
                .slice(0, 6)
                .map((b, bIdx) => (
                  <div key={`del-preview-${b.id}-${bIdx}`} className="text-[#29243A] font-medium truncate flex items-center gap-1.5">
                    <span className="text-rose-500">•</span>
                    <span className="truncate">{b.title}</span>
                    <span className="text-[#827A96] shrink-0">({b.author || 'Autor desconhecido'})</span>
                  </div>
                ))}
              {selectedBookIds.size > 6 && (
                <div className="text-[11px] text-[#827A96] italic pt-1 pl-3">
                  ... e mais {selectedBookIds.size - 6} outro(s) livro(s).
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingBatch}
                onClick={() => setShowBatchDeleteModal(false)}
                className="flex-1 py-2 px-3 rounded-xl bg-[#FAF9FD] hover:bg-[#F0EAFE] text-[#29243A] font-semibold text-xs border border-[#EAE5F4] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingBatch}
                onClick={handleConfirmBatchDelete}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isDeletingBatch ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir {selectedBookIds.size} Livros</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GOAL MODAL */}
      {selectedBookForGoal && (
        <div
          className="fixed inset-0 z-50 bg-[#29243A]/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedBookForGoal(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-[#EAE5F4] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#EAE5F4] pb-3">
              <h4 className="font-bold text-sm font-serif text-[#29243A]">
                Meta de Leitura
              </h4>
              <button
                onClick={() => setSelectedBookForGoal(null)}
                className="text-[#827A96] hover:text-[#29243A] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-[#827A96]">
                Quantos dias você planeja levar para ler{' '}
                <strong className="text-[#29243A] font-serif">{selectedBookForGoal.title}</strong>?
              </p>
              <div className="flex items-center justify-center gap-3 py-2">
                <button
                  type="button"
                  onClick={() => setTargetDays((d) => Math.max(7, d - 7))}
                  className="w-8 h-8 rounded-xl bg-[#FAF9FD] border border-[#EAE5F4] text-[#29243A] font-bold text-sm flex items-center justify-center hover:bg-[#F0EAFE] cursor-pointer"
                >
                  -
                </button>
                <span className="text-xl font-bold font-serif text-[#29243A] min-w-[60px] text-center">
                  {targetDays} <span className="text-xs font-sans text-[#827A96]">dias</span>
                </span>
                <button
                  type="button"
                  onClick={() => setTargetDays((d) => d + 7)}
                  className="w-8 h-8 rounded-xl bg-[#FAF9FD] border border-[#EAE5F4] text-[#29243A] font-bold text-sm flex items-center justify-center hover:bg-[#F0EAFE] cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setSelectedBookForGoal(null)}
                className="flex-1 py-2 px-3 rounded-xl bg-[#FAF9FD] hover:bg-[#F0EAFE] text-[#29243A] font-semibold text-xs border border-[#EAE5F4] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveGoal}
                className="flex-1 py-2 px-3 rounded-xl btn-lilas font-semibold text-xs transition-colors cursor-pointer"
              >
                Salvar Meta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MULTI-BOOK MODAL */}
      {showImportModal && (
        <div
          id="modal-import-book"
          className="fixed inset-0 z-50 bg-[#29243A]/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-xl bg-white border border-[#EAE5F4] rounded-3xl p-5 sm:p-6 shadow-2xl text-[#29243A] space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-[#EAE5F4] pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center shadow-xs">
                  <Files className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base font-serif text-[#29243A]">
                    Importar Livros (PDF / EPUB)
                  </h3>
                  <p className="text-[11px] text-[#827A96]">
                    Selecione arquivos para leitura e extração automática de capas
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!isImporting) {
                    setShowImportModal(false);
                    setImportFiles([]);
                  }
                }}
                disabled={isImporting}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#827A96] hover:text-[#29243A] hover:bg-[#F0EAFE] transition-colors disabled:opacity-40 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-0.5 flex-1">
              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  if (isImporting) return;
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  if (isImporting) return;
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files) {
                    handleFilesSelected(e.dataTransfer.files);
                  }
                }}
                className={`border-2 border-dashed rounded-3xl p-6 text-center transition-all ${
                  isImporting
                    ? 'opacity-50 cursor-not-allowed border-[#EAE5F4] bg-[#FAF9FD]'
                    : isDragging
                    ? 'border-[#A58ADB] bg-[#F0EAFE]/70 scale-[0.99] cursor-pointer'
                    : 'border-[#EAE5F4] hover:border-[#C4B1F0] bg-[#FAF9FD] hover:bg-[#F0EAFE]/30 cursor-pointer'
                }`}
                onClick={() => {
                  if (!isImporting) {
                    document.getElementById('multi-file-input')?.click();
                  }
                }}
              >
                <input
                  id="multi-file-input"
                  type="file"
                  multiple
                  disabled={isImporting}
                  accept=".pdf,.epub,.mobi,.cbz,.cbr,.txt"
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFilesSelected(e.target.files);
                      e.target.value = '';
                    }
                  }}
                  className="hidden"
                />

                <div className="flex flex-col items-center justify-center gap-1.5 pointer-events-none">
                  <div className="w-12 h-12 rounded-2xl bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center mb-1">
                    <UploadCloud className="w-6 h-6 stroke-[2.2]" />
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-[#29243A]">
                    Clique ou arraste seus livros (+500 livros de uma vez)
                  </p>
                  <p className="text-[11px] text-[#827A96] max-w-sm">
                    PDF, EPUB, MOBI, CBZ, CBR e TXT — Capas originais e leitura garantida
                  </p>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F0EAFE] text-[#A58ADB] text-[10px] font-semibold mt-1">
                    <Check className="w-3 h-3" />
                    <span>Anti-Duplicação inteligente ativa (ignora livros já existentes)</span>
                  </div>
                </div>
              </div>

              {/* Selected Files List */}
              {importFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#29243A]">
                    <span>Arquivos selecionados ({importFiles.length}):</span>
                    {!isImporting && (
                      <button
                        type="button"
                        onClick={() => setImportFiles([])}
                        className="text-[#A58ADB] hover:underline text-[11px] cursor-pointer"
                      >
                        Limpar todos
                      </button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {importFiles.slice(0, 15).map((f, i) => (
                      <div
                        key={`${f.name}-${i}`}
                        className="flex items-center justify-between p-2 rounded-xl bg-[#FAF9FD] border border-[#EAE5F4] text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <BookOpen className="w-3.5 h-3.5 text-[#A58ADB] shrink-0" />
                          <span className="truncate max-w-[240px] text-[#29243A] font-medium">{f.name}</span>
                          <span className="text-[10px] text-[#827A96]">({formatFileSize(f.size)})</span>
                        </div>
                        {!isImporting && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(i)}
                            className="text-[#827A96] hover:text-rose-500 p-0.5 cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {importFiles.length > 15 && (
                      <div className="p-3 rounded-2xl bg-[#F0EAFE]/80 border border-[#EAE5F4] text-center space-y-0.5">
                        <span className="text-xs font-bold text-[#A58ADB] block">
                          + outros {importFiles.length - 15} livros prontos para importação
                        </span>
                        <span className="text-[10px] text-[#827A96] block">
                          Total de {importFiles.length} arquivos selecionados — Modo de importação em lote otimizado
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Single File Metadata inputs */}
              {importFiles.length === 1 && !isImporting && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-[#29243A] mb-1">
                      Título da Obra (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Cristianismo Puro e Simples"
                      value={importTitle}
                      onChange={(e) => setImportTitle(e.target.value)}
                      className="w-full bg-[#FAF9FD] border border-[#EAE5F4] rounded-xl px-3 py-2 text-xs text-[#29243A] placeholder-[#827A96] focus:outline-none focus:border-[#A58ADB]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#29243A] mb-1">
                      Autor (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: C.S. Lewis"
                      value={importAuthor}
                      onChange={(e) => setImportAuthor(e.target.value)}
                      className="w-full bg-[#FAF9FD] border border-[#EAE5F4] rounded-xl px-3 py-2 text-xs text-[#29243A] placeholder-[#827A96] focus:outline-none focus:border-[#A58ADB]"
                    />
                  </div>
                </div>
              )}

              {/* Import Progress Bar */}
              {isImporting && importProgress && (
                <div className="p-4 rounded-2xl bg-[#F0EAFE] border border-[#C4B1F0] space-y-2.5">
                  <div className="flex justify-between items-center text-xs font-bold text-[#29243A]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Loader2 className="w-3.5 h-3.5 text-[#A58ADB] animate-spin shrink-0" />
                      <span className="truncate max-w-[220px]">
                        {importProgress.currentFileName}
                      </span>
                    </div>
                    <span className="shrink-0 text-[#A58ADB] font-bold">
                      {importProgress.current} de {importProgress.total} ({importProgress.percent}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-white overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-gradient-to-r from-[#A58ADB] to-[#C4B1F0] transition-all duration-200"
                      style={{ width: `${importProgress.percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                    <p className="text-[11px] text-[#827A96] italic">
                      Extraindo capas originais e organizando metadados...
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        cancelTokenRef.current.isCancelled = true;
                      }}
                      className="text-[11px] font-bold text-rose-500 hover:text-rose-600 underline cursor-pointer shrink-0"
                    >
                      Parar e salvar já importados
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#EAE5F4] shrink-0">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                disabled={isImporting}
                className="px-4 py-2 rounded-xl bg-[#FAF9FD] hover:bg-[#F0EAFE] text-[#29243A] font-semibold text-xs border border-[#EAE5F4] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={isImporting || importFiles.length === 0}
                className="px-5 py-2 rounded-xl btn-lilas font-bold text-xs shadow-xs cursor-pointer disabled:opacity-40 flex items-center gap-2"
              >
                {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                <span>{isImporting ? 'Importando...' : `Confirmar Importação (${importFiles.length})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SINGLE DUPLICATE WARNING MODAL */}
      {duplicateWarning && (
        <div
          id="modal-duplicate-warning"
          className="fixed inset-0 z-50 bg-[#29243A]/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setDuplicateWarning(null)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-amber-200 text-[#29243A] space-y-4 max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[#EAE5F4] pb-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
                  <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="font-bold text-base font-serif text-[#29243A]">
                    Livro Repetido Detectado!
                  </h3>
                  <p className="text-[11px] text-[#827A96]">
                    Este livro já consta cadastrado na sua biblioteca ALTTO
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDuplicateWarning(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#827A96] hover:text-[#29243A] hover:bg-[#F0EAFE] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Comparison cards */}
            <div className="overflow-y-auto space-y-3 flex-1 pr-1 text-xs">
              <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200/90 text-amber-900 text-[11px] leading-relaxed">
                O arquivo <strong className="font-semibold">{duplicateWarning.file.name}</strong> possui título ou autor idêntico a um livro existente. Escolha como deseja resolver para manter sua biblioteca organizada:
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Livro Atual na Biblioteca */}
                <div className="p-3 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#A58ADB] block">
                    Já na sua Biblioteca
                  </span>
                  <div className="flex gap-2.5 items-start">
                    <div className="w-12 h-16 rounded-lg overflow-hidden bg-[#F0EAFE] shrink-0 border border-[#EAE5F4] shadow-xs">
                      <img
                        src={getDisplayCover(duplicateWarning.existingBook)}
                        alt={duplicateWarning.existingBook.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <h4 className="font-bold text-xs text-[#29243A] line-clamp-2">
                        {duplicateWarning.existingBook.title}
                      </h4>
                      <p className="text-[10px] text-[#827A96] truncate">
                        {duplicateWarning.existingBook.author || 'Autor desconhecido'}
                      </p>
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="px-1.5 py-0.5 rounded bg-white text-[#827A96] text-[9px] uppercase font-bold border border-[#EAE5F4]">
                          {duplicateWarning.existingBook.format}
                        </span>
                        {duplicateWarning.existingBook.status === 'completed' && (
                          <span className="text-[9px] text-emerald-600 font-semibold">Lido</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Novo Arquivo Importado */}
                <div className="p-3 rounded-2xl bg-amber-50/50 border border-amber-200 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
                    Novo Arquivo Selecionado
                  </span>
                  <div className="space-y-1">
                    <h4 className="font-bold text-xs text-[#29243A] line-clamp-2">
                      {duplicateWarning.candidateTitle || duplicateWarning.file.name}
                    </h4>
                    <p className="text-[10px] text-[#827A96] truncate">
                      {duplicateWarning.candidateAuthor || 'Autor detectado'}
                    </p>
                    <p className="text-[10px] text-[#827A96] truncate font-mono">
                      {duplicateWarning.file.name}
                    </p>
                    <span className="inline-block px-1.5 py-0.5 rounded bg-white text-amber-700 text-[9px] uppercase font-bold border border-amber-200">
                      Tamanho: {(duplicateWarning.file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-2">
                {/* 1. Descartar o arquivo repetido (Manter 1 cópia na biblioteca) */}
                <button
                  type="button"
                  onClick={() => handleResolveSingleDuplicate('keep_existing')}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 transition-colors text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-200/70 text-amber-800 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-amber-950 group-hover:text-black">
                        Descartar o arquivo repetido (Manter 1 cópia na biblioteca)
                      </div>
                      <div className="text-[10px] text-amber-700">
                        Mantém o livro já existente e não adiciona a cópia duplicada
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-amber-700 group-hover:translate-x-0.5 transition-transform">→</span>
                </button>

                {/* 2. Substituir versão antiga pela nova */}
                <button
                  type="button"
                  onClick={() => handleResolveSingleDuplicate('replace')}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#F0EAFE] hover:bg-[#E4D8FD] border border-[#C4B1F0] text-[#29243A] transition-colors text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#C4B1F0]/70 text-[#473B69] flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-[#29243A]">
                        Substituir pela nova versão
                      </div>
                      <div className="text-[10px] text-[#827A96]">
                        Exclui o livro anterior e salva o novo arquivo com capa e dados atualizados
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#A58ADB] group-hover:translate-x-0.5 transition-transform">→</span>
                </button>

                {/* 3. Manter ambos */}
                <button
                  type="button"
                  onClick={() => handleResolveSingleDuplicate('keep_both')}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#FAF9FD] hover:bg-[#F0EAFE] border border-[#EAE5F4] text-[#29243A] transition-colors text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-white text-[#827A96] flex items-center justify-center shrink-0 border border-[#EAE5F4]">
                      <Copy className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-[#29243A]">
                        Manter ambos (importar como cópia)
                      </div>
                      <div className="text-[10px] text-[#827A96]">
                        Mantém a versão atual e adiciona este como &ldquo;{duplicateWarning.candidateTitle} (Cópia)&rdquo;
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#827A96] group-hover:translate-x-0.5 transition-transform">→</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end pt-2 border-t border-[#EAE5F4] shrink-0">
              <button
                type="button"
                onClick={() => setDuplicateWarning(null)}
                className="px-4 py-2 rounded-xl bg-[#FAF9FD] hover:bg-[#F0EAFE] text-[#29243A] font-semibold text-xs border border-[#EAE5F4] cursor-pointer"
              >
                Cancelar Importação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BATCH DUPLICATES WARNING MODAL */}
      {batchDuplicatesWarning && (
        <div
          id="modal-batch-duplicates-warning"
          className="fixed inset-0 z-50 bg-[#29243A]/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setBatchDuplicatesWarning(null)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-amber-200 text-[#29243A] space-y-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#EAE5F4] pb-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
                  <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="font-bold text-base font-serif text-[#29243A]">
                    {batchDuplicatesWarning.length} Livro(s) Repetido(s) Detectado(s)
                  </h3>
                  <p className="text-[11px] text-[#827A96]">
                    Estes arquivos já existem na sua biblioteca. Selecione quais deseja remover.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBatchDuplicatesWarning(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#827A96] hover:text-[#29243A] hover:bg-[#F0EAFE] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-3 flex-1 pr-1 text-xs">
              <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200/90 text-amber-900 text-[11px] leading-relaxed">
                Durante a importação, o ALTTO detectou <strong>{batchDuplicatesWarning.length} livro(s)</strong> já presentes na sua biblioteca. Você pode optar por manter todos os livros (adicionando cópias separadas) ou excluir os repetidos, garantindo que <strong>exatamente 1 cópia de cada obra seja preservada intacta</strong> na sua biblioteca:
              </div>

              <div className="flex items-center justify-between text-xs font-semibold px-1">
                <span>Livros Duplicados ({batchDuplicatesWarning.length}):</span>
                <span className="text-[11px] text-[#827A96]">1 cópia sempre preservada na biblioteca</span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {batchDuplicatesWarning.slice(0, 20).map((dupe, dupeIdx) => {
                  return (
                    <div
                      key={`batch-dupe-${dupe.existingBook.id}-${dupe.fileName}-${dupeIdx}`}
                      className="p-3 rounded-2xl border bg-[#FAF9FD] border-[#EAE5F4] hover:bg-[#F0EAFE]/40 transition-all flex items-center gap-3"
                    >
                      <div className="w-10 h-14 rounded-lg overflow-hidden bg-white shrink-0 border border-[#EAE5F4] shadow-2xs">
                        <img
                          src={getDisplayCover(dupe.existingBook)}
                          alt={dupe.existingBook.title}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-[#29243A] truncate">
                          {dupe.existingBook.title}
                        </div>
                        <div className="text-[10px] text-[#827A96] truncate">
                          {dupe.existingBook.author || 'Autor desconhecido'} • {dupe.existingBook.format.toUpperCase()}
                        </div>
                        <div className="text-[10px] text-amber-700 truncate font-mono mt-0.5">
                          Arquivo: {dupe.fileName}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setBatchDuplicatesWarning((prev) =>
                            prev ? prev.filter((_, idx) => idx !== dupeIdx) : null
                          );
                          setImportToast(`✓ Arquivo repetido "${dupe.fileName}" descartado. O livro na biblioteca foi mantido.`);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-bold border border-amber-200 transition-colors cursor-pointer shrink-0"
                        title="Descartar este arquivo repetido e manter o livro existente"
                      >
                        Descartar Repetido
                      </button>
                    </div>
                  );
                })}
                {batchDuplicatesWarning.length > 20 && (
                  <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 text-center text-xs font-bold text-amber-800">
                    + outros {batchDuplicatesWarning.length - 20} livros repetidos detectados
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#EAE5F4] shrink-0">
              <button
                type="button"
                onClick={handleKeepAllBatchDuplicates}
                className="px-4 py-2.5 rounded-xl bg-[#FAF9FD] hover:bg-[#F0EAFE] text-[#29243A] hover:text-[#A58ADB] font-bold text-xs border border-[#EAE5F4] transition-colors cursor-pointer flex items-center gap-1.5"
                title="Importa todos os arquivos repetidos como cópias separadas na biblioteca"
              >
                <Copy className="w-3.5 h-3.5 text-[#A58ADB]" />
                <span>Manter Todos na Biblioteca</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmBatchDeleteDuplicates}
                className="px-4 py-2.5 rounded-xl bg-[#A58ADB] hover:bg-[#8C6ECD] text-white font-bold text-xs transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                title="Mantém com segurança 1 cópia de cada livro e remove os repetidos"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Excluir Repetidos (Manter 1 cópia)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIBRARY DUPLICATES MANAGER MODAL */}
      {libraryDuplicateGroups && (
        <div
          id="modal-library-duplicates-manager"
          className="fixed inset-0 z-50 bg-[#29243A]/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setLibraryDuplicateGroups(null)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-[#EAE5F4] text-[#29243A] space-y-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#EAE5F4] pb-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center shrink-0 border border-[#EAE5F4]">
                  <Layers className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="font-bold text-base font-serif text-[#29243A]">
                    Livros Repetidos na Biblioteca
                  </h3>
                  <p className="text-[11px] text-[#827A96]">
                    Encontrados {libraryDuplicateGroups.length} grupo(s) de livros com títulos repetidos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLibraryDuplicateGroups(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#827A96] hover:text-[#29243A] hover:bg-[#F0EAFE] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pr-1 text-xs">
              {libraryDuplicateGroups.map((group, gIdx) => (
                <div
                  key={group.normalizedKey || gIdx}
                  className="p-3.5 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] space-y-3"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="font-bold text-xs text-[#29243A] font-serif">
                        &ldquo;{group.title}&rdquo;
                      </h4>
                      <p className="text-[10px] text-[#827A96]">
                        {group.books.length} cópias cadastradas
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleKeepNewestInGroup(group)}
                      className="px-3 py-1.5 rounded-xl btn-lilas text-[10px] font-bold cursor-pointer"
                    >
                      Manter apenas o mais recente
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.books.map((b, bIdx) => (
                      <div
                        key={`dupe-group-${group.normalizedKey}-${b.id}-${bIdx}`}
                        className="p-2.5 rounded-xl bg-white border border-[#EAE5F4] flex items-center gap-2.5 justify-between"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-12 rounded overflow-hidden bg-[#FAF9FD] shrink-0 border border-[#EAE5F4]">
                            <img
                              src={getDisplayCover(b)}
                              alt={b.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-[11px] text-[#29243A] truncate">
                              {b.title}
                            </p>
                            <p className="text-[9px] text-[#827A96] truncate">
                              {b.author || 'Autor desconhecido'} • {b.format.toUpperCase()}
                            </p>
                            <p className="text-[9px] text-[#827A96]">
                              Adicionado: {new Date(b.addedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveLibraryDuplicateBook(b.id)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer shrink-0"
                          title="Excluir este livro duplicado"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-[#EAE5F4] shrink-0">
              <button
                type="button"
                onClick={() => setLibraryDuplicateGroups(null)}
                className="px-4 py-2 rounded-xl bg-[#FAF9FD] hover:bg-[#F0EAFE] text-[#29243A] font-semibold text-xs border border-[#EAE5F4] cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
