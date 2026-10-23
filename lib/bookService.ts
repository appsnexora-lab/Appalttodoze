import { Book, ReadingList, ReadingListItem, ReadingGoal, BookFormat } from '@/types';
import { dbGetAll, dbGet, dbPut, dbDelete, saveBlob, getBlob } from './indexedDB';
import {
  fastExtractEpub,
  fastExtractPdf,
  fastExtractCbz,
  cleanBookMetadata,
  generateTypographicCover,
  isCoverValid,
  isCoverImageBlank,
} from './bookMetadataHelper';
import { auth, syncBookMetadataToFirestore, deleteBookFromFirestore } from './firebase';
import { enqueueBookUpload } from './syncService';

export async function getBooks(): Promise<Book[]> {
  const list = await dbGetAll('books');
  const seen = new Set<string>();
  const unique: Book[] = [];
  for (const b of list) {
    if (b && b.id && !seen.has(b.id)) {
      seen.add(b.id);
      unique.push(b);
    }
  }
  return unique;
}

export async function getBookById(id: string): Promise<Book | undefined> {
  return await dbGet('books', id);
}

export async function updateBook(book: Book): Promise<void> {
  await dbPut('books', book);
  if (auth.currentUser) {
    syncBookMetadataToFirestore(auth.currentUser.uid, book).catch(() => {});
  }
}

export async function ensureBookCover(book: Book): Promise<Book> {
  // If book already has a valid real image cover (not a fallback SVG placeholder), keep it
  if (
    isCoverValid(book.coverUrl) &&
    !book.coverUrl?.startsWith('data:image/svg+xml') &&
    book.coverSource !== 'generated'
  ) {
    return book;
  }
  try {
    const blobItem = await getBlob(book.fileBlobKey || book.id);
    if (!blobItem || !blobItem.data) {
      book.coverUrl = generateTypographicCover(book.title, book.author, book.format);
      book.coverSource = 'generated';
      book.coverType = 'image/svg+xml';
      await dbPut('books', book);
      return book;
    }

    let arrayBuffer: ArrayBuffer;
    if (blobItem.data instanceof Blob) {
      arrayBuffer = await blobItem.data.arrayBuffer();
    } else if (blobItem.data instanceof ArrayBuffer) {
      arrayBuffer = blobItem.data;
    } else if (typeof blobItem.data === 'string') {
      const bin = atob(blobItem.data);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      arrayBuffer = u8.buffer;
    } else {
      book.coverUrl = generateTypographicCover(book.title, book.author, book.format);
      book.coverSource = 'generated';
      book.coverType = 'image/svg+xml';
      await dbPut('books', book);
      return book;
    }

    let extractedCover: string | undefined;
    let coverType = 'image/jpeg';
    let coverSource: Book['coverSource'] = 'fallback';

    if (book.format === 'epub') {
      const res = await fastExtractEpub(arrayBuffer);
      if (res.coverUrl && isCoverValid(res.coverUrl)) {
        extractedCover = res.coverUrl;
        coverType = res.coverType || 'image/jpeg';
        coverSource = res.coverSource || 'metadata';
      }
    } else if (book.format === 'pdf') {
      const res = await fastExtractPdf(arrayBuffer);
      if (res.coverUrl && isCoverValid(res.coverUrl)) {
        extractedCover = res.coverUrl;
        coverType = res.coverType || 'image/jpeg';
        coverSource = 'first-page';
      }
    } else if (book.format === 'cbz') {
      const res = await fastExtractCbz(arrayBuffer);
      if (res.coverUrl && isCoverValid(res.coverUrl)) {
        extractedCover = res.coverUrl;
        coverType = res.coverType || 'image/jpeg';
        coverSource = 'first-page';
      }
    }

    if (!extractedCover || !isCoverValid(extractedCover)) {
      extractedCover = generateTypographicCover(book.title, book.author, book.format);
      coverSource = 'generated';
      coverType = 'image/svg+xml';
    }

    book.coverUrl = extractedCover;
    book.coverType = coverType;
    book.coverSource = coverSource;
    book.coverGeneratedAt = new Date().toISOString();
    await dbPut('books', book);
  } catch (err) {
    console.warn('Falha ao restaurar capa do livro:', book.title, err);
    if (!isCoverValid(book.coverUrl)) {
      book.coverUrl = generateTypographicCover(book.title, book.author, book.format);
      book.coverSource = 'generated';
      book.coverType = 'image/svg+xml';
      try {
        await dbPut('books', book);
      } catch {}
    }
  }
  return book;
}

export interface CoverAuditResult {
  totalScanned: number;
  fixedCount: number;
  fixedBooks: Book[];
}

/**
 * Intelligent scanner that audits all books in the database to detect any missing,
 * corrupted, or blank white covers, and restores them accurately.
 */
export async function auditAndRepairBlankCovers(
  onProgress?: (current: number, total: number, fixed: number) => void
): Promise<CoverAuditResult> {
  const books = await dbGetAll('books');
  const total = books.length;
  let fixedCount = 0;
  const fixedBooks: Book[] = [];

  for (let i = 0; i < total; i++) {
    const b = books[i];
    const needsRepair =
      !isCoverValid(b.coverUrl) ||
      b.coverSource === 'generated' ||
      b.coverSource === 'fallback' ||
      (typeof b.coverUrl === 'string' && b.coverUrl.startsWith('data:image/svg+xml'));

    if (needsRepair) {
      let repaired = false;
      // 1. Try to re-extract cover from stored file blob
      try {
        const blobItem = await getBlob(b.fileBlobKey || b.id);
        if (blobItem && blobItem.data) {
          let arrayBuffer: ArrayBuffer | null = null;
          if (blobItem.data instanceof Blob) {
            arrayBuffer = await blobItem.data.arrayBuffer();
          } else if (blobItem.data instanceof ArrayBuffer) {
            arrayBuffer = blobItem.data;
          }
          if (arrayBuffer) {
            if (b.format === 'pdf') {
              const res = await fastExtractPdf(arrayBuffer);
              if (res.coverUrl && isCoverValid(res.coverUrl) && !res.coverUrl.startsWith('data:image/svg+xml')) {
                b.coverUrl = res.coverUrl;
                b.coverType = res.coverType || 'image/jpeg';
                b.coverSource = res.coverSource || 'first-page';
                repaired = true;
              }
            } else if (b.format === 'epub') {
              const res = await fastExtractEpub(arrayBuffer);
              if (res.coverUrl && isCoverValid(res.coverUrl) && !res.coverUrl.startsWith('data:image/svg+xml')) {
                b.coverUrl = res.coverUrl;
                b.coverType = res.coverType || 'image/jpeg';
                b.coverSource = res.coverSource || 'metadata';
                repaired = true;
              }
            }
          }
        }
      } catch (err) {
        console.warn('Tentativa de re-extração do arquivo falhou:', err);
      }

      // 2. If re-extraction failed and file had no valid cover, generate elegant typographic cover
      if (!repaired && !isCoverValid(b.coverUrl)) {
        b.coverUrl = generateTypographicCover(b.title, b.author, b.format);
        b.coverSource = 'generated';
        b.coverType = 'image/svg+xml';
      }

      if (repaired) {
        b.coverGeneratedAt = new Date().toISOString();
        await dbPut('books', b);
        fixedCount++;
        fixedBooks.push(b);
      }
    }

    if (onProgress) {
      onProgress(i + 1, total, fixedCount);
    }

    if ((i + 1) % 6 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  return { totalScanned: total, fixedCount, fixedBooks };
}

export async function ensureAllBookCovers(books: Book[]): Promise<Book[]> {
  let hasChanges = false;
  const updated = books.map((b) => {
    if (!isCoverValid(b.coverUrl)) {
      hasChanges = true;
      return {
        ...b,
        coverUrl: generateTypographicCover(b.title, b.author, b.format),
        coverSource: 'generated' as const,
        coverType: 'image/svg+xml',
      };
    }
    return b;
  });

  if (!hasChanges) {
    return books;
  }

  for (const b of updated) {
    const orig = books.find((x) => x.id === b.id);
    if (orig && !isCoverValid(orig.coverUrl)) {
      await dbPut('books', b).catch(() => {});
    }
  }

  return updated;
}

export async function deleteBook(id: string): Promise<void> {
  if (!id) return;
  try {
    const book = await dbGet('books', id);
    await dbDelete('books', id);
    await dbDelete('blobs', id);
    if (book?.fileBlobKey && book.fileBlobKey !== id) {
      await dbDelete('blobs', book.fileBlobKey);
    }
    await dbDelete('reading_progress', id);
    await dbDelete('reading_progress', `progress-${id}`);

    if (auth.currentUser) {
      deleteBookFromFirestore(auth.currentUser.uid, id).catch(() => {});
    }

    const listItems = await dbGetAll('reading_list_items');
    for (const item of listItems) {
      if (item && item.bookId === id) {
        await dbDelete('reading_list_items', item.id);
      }
    }
    const goals = await dbGetAll('reading_goals');
    for (const goal of goals) {
      if (goal && goal.bookId === id) {
        await dbDelete('reading_goals', goal.id);
      }
    }
  } catch (err) {
    console.error(`Erro ao excluir livro ${id}:`, err);
    throw err;
  }
}

export async function batchDeleteBooks(ids: string[]): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  const targetIds = new Set(ids);
  let count = 0;

  try {
    // 1. Fetch books to identify blob keys
    const allBooks = await dbGetAll('books');
    const bookMap = new Map(allBooks.map((b) => [b.id, b]));

    // 2. Perform deletions per id with isolated error boundaries
    for (const id of ids) {
      try {
        const book = bookMap.get(id);
        await dbDelete('books', id);
        await dbDelete('blobs', id);
        if (book?.fileBlobKey && book.fileBlobKey !== id) {
          await dbDelete('blobs', book.fileBlobKey);
        }
        await dbDelete('reading_progress', id);
        await dbDelete('reading_progress', `progress-${id}`);

        if (auth.currentUser) {
          deleteBookFromFirestore(auth.currentUser.uid, id).catch(() => {});
        }
        count++;
      } catch (itemErr) {
        console.warn(`Aviso ao excluir item ${id} em lote:`, itemErr);
      }

      // Memory and UI breathing space every 10 items
      if (count % 10 === 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    // 3. Batch cleanup related list items and goals in a single scan
    try {
      const [allListItems, allGoals] = await Promise.all([
        dbGetAll('reading_list_items'),
        dbGetAll('reading_goals'),
      ]);

      for (const item of allListItems) {
        if (item && targetIds.has(item.bookId)) {
          await dbDelete('reading_list_items', item.id);
        }
      }
      for (const goal of allGoals) {
        if (goal && targetIds.has(goal.bookId)) {
          await dbDelete('reading_goals', goal.id);
        }
      }
    } catch (cleanupErr) {
      console.warn('Aviso ao limpar listas/metas na exclusão em lote:', cleanupErr);
    }
  } catch (err) {
    console.error('Falha geral na exclusão em lote:', err);
  }

  return count;
}

function normalizeForComparison(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkBookDuplicate(
  fileName: string,
  candidateTitle: string,
  candidateAuthor: string,
  existingList: Book[]
): Book | undefined {
  const normTitle = normalizeForComparison(candidateTitle);
  const normAuthor = normalizeForComparison(candidateAuthor);
  const cleanBaseName = fileName.replace(/\.[^/.]+$/, '').trim();
  const normFileName = normalizeForComparison(cleanBaseName);

  for (const b of existingList) {
    const existingTitle = normalizeForComparison(b.title);
    const existingAuthor = normalizeForComparison(b.author);

    if (normFileName && normFileName.length >= 3 && normFileName === existingTitle) {
      return b;
    }
    if (normTitle && normTitle.length >= 3 && normTitle === existingTitle) {
      const a1Generic =
        !normAuthor ||
        normAuthor.includes('desconhecido') ||
        normAuthor.includes('unknown') ||
        normAuthor.includes('autor');
      const a2Generic =
        !existingAuthor ||
        existingAuthor.includes('desconhecido') ||
        existingAuthor.includes('unknown') ||
        existingAuthor.includes('autor');
      if (a1Generic || a2Generic || normAuthor === existingAuthor) {
        return b;
      }
    }
  }
  return undefined;
}

export async function importBookFromFile(
  file: File,
  overrides?: { title?: string; author?: string; coverUrl?: string; description?: string; skipSync?: boolean }
): Promise<Book> {
  const fileName = file.name;
  const ext = fileName.split('.').pop()?.toLowerCase() || 'txt';
  let format: BookFormat = 'txt';
  if (['pdf', 'epub', 'mobi', 'cbz', 'cbr', 'txt'].includes(ext)) {
    format = ext as BookFormat;
  }

  const bookId = `book-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  let detectedTitle = '';
  let detectedAuthor = '';
  let detectedDescription = '';
  let totalPages = 10;
  let totalChapters = 1;
  let coverUrl = overrides?.coverUrl || '';
  let coverType = 'image/jpeg';
  let coverSource: Book['coverSource'] = 'fallback';

  try {
    await saveBlob(bookId, file, file.type || 'application/octet-stream', fileName);
  } catch (storageErr) {
    console.warn(`Aviso de quota ao salvar blob de ${fileName}:`, storageErr);
  }

  if (format === 'epub') {
    const meta = await fastExtractEpub(file);
    detectedTitle = meta.title;
    detectedAuthor = meta.author;
    detectedDescription = meta.description;
    totalPages = meta.totalPages || 20;
    totalChapters = meta.totalChapters || 1;
    if (meta.coverUrl && !coverUrl) {
      coverUrl = meta.coverUrl;
      coverType = meta.coverType || 'image/jpeg';
      coverSource = 'metadata';
    }
  } else if (format === 'pdf') {
    const meta = await fastExtractPdf(file);
    detectedTitle = meta.title;
    detectedAuthor = meta.author;
    detectedDescription = meta.description;
    totalPages = meta.totalPages || 1;
    totalChapters = 1;
    if (meta.coverUrl && !coverUrl) {
      coverUrl = meta.coverUrl;
      coverType = 'image/jpeg';
      coverSource = 'first-page';
    }
  } else if (format === 'cbz') {
    const meta = await fastExtractCbz(file);
    detectedTitle = meta.title;
    detectedAuthor = meta.author;
    detectedDescription = meta.description;
    totalPages = meta.totalPages || 10;
    totalChapters = 1;
    if (meta.coverUrl && !coverUrl) {
      coverUrl = meta.coverUrl;
      coverType = meta.coverType || 'image/jpeg';
      coverSource = 'first-page';
    }
  } else if (format === 'txt') {
    const cleaned = cleanBookMetadata(fileName, undefined, undefined, undefined, 'txt');
    detectedTitle = cleaned.title;
    detectedAuthor = cleaned.author;
    detectedDescription = cleaned.description;
    totalPages = Math.max(1, Math.ceil(file.size / 2000));
  } else {
    const cleaned = cleanBookMetadata(fileName, undefined, undefined, undefined, format);
    detectedTitle = cleaned.title;
    detectedAuthor = cleaned.author;
    detectedDescription = cleaned.description;
    totalPages = Math.max(1, Math.ceil(file.size / 30000));
  }

  const finalMeta = cleanBookMetadata(
    fileName,
    overrides?.title || detectedTitle,
    overrides?.author || detectedAuthor,
    overrides?.description || detectedDescription,
    format
  );

  // Preserve extracted original cover if valid; only generate fallback if no cover was extracted
  if (!isCoverValid(coverUrl)) {
    coverUrl = generateTypographicCover(finalMeta.title, finalMeta.author, format);
    coverSource = 'generated';
    coverType = 'image/svg+xml';
  }

  const book: Book = {
    id: bookId,
    title: finalMeta.title,
    author: finalMeta.author,
    coverUrl,
    coverType,
    coverSource,
    coverGeneratedAt: new Date().toISOString(),
    description: finalMeta.description,
    format,
    totalPages,
    totalChapters,
    fileBlobKey: bookId,
    textContent:
      format === 'pdf'
        ? 'Documento PDF com páginas reais, leitura contínua e renderização fiel.'
        : format === 'epub'
        ? 'Livro digital EPUB pronto para leitura com paginação dinâmica.'
        : 'Documento importado pronto para leitura.',
    chapters: [],
    images: [],
    status: 'not_started',
    isFavorite: false,
    addedAt: new Date().toISOString(),
  };

  await dbPut('books', book);
  if (auth.currentUser && !overrides?.skipSync) {
    syncBookMetadataToFirestore(auth.currentUser.uid, book).catch(() => {});
    enqueueBookUpload(auth.currentUser.uid, book, file).catch(() => {});
  }
  return book;
}

export interface MultiImportProgress {
  current: number;
  total: number;
  currentFileName: string;
  percent: number;
}

export interface ImportCancelToken {
  isCancelled: boolean;
}

export interface DuplicateGroup {
  normalizedKey: string;
  title: string;
  books: Book[];
}

export function findDuplicateBooksInLibrary(books: Book[]): DuplicateGroup[] {
  const groups = new Map<string, { title: string; list: Book[] }>();

  for (const b of books) {
    const key = normalizeForComparison(b.title);
    if (!key || key.length < 3) continue;
    const item = groups.get(key) || { title: b.title, list: [] };
    item.list.push(b);
    groups.set(key, item);
  }

  const result: DuplicateGroup[] = [];
  for (const [normalizedKey, val] of groups.entries()) {
    if (val.list.length > 1) {
      result.push({ normalizedKey, title: val.title, books: val.list });
    }
  }
  return result;
}

export interface SkippedDuplicateInfo {
  fileName: string;
  existingTitle: string;
  existingBook: Book;
  file?: File;
}

export interface MultiImportResult {
  success: Book[];
  errors: { fileName: string; error: string }[];
  duplicatesSkipped: SkippedDuplicateInfo[];
}

export async function importMultipleBooks(
  files: File[],
  onProgress?: (progress: MultiImportProgress) => void,
  cancelToken?: ImportCancelToken
): Promise<MultiImportResult> {
  const success: Book[] = [];
  const errors: { fileName: string; error: string }[] = [];
  const duplicatesSkipped: SkippedDuplicateInfo[] = [];
  const total = files.length;
  const opId = `batch-import-${Date.now()}`;

  console.log(`[BatchImport:${opId}] Iniciando importação segura de ${total} arquivo(s)...`);

  // 1. Build lightweight index without retaining massive base64 images in RAM
  const allBooksRaw = await dbGetAll('books');
  const existingIndex: Book[] = allBooksRaw.map((b) => ({
    id: b.id,
    title: b.title || 'Sem título',
    author: b.author || 'Autor Desconhecido',
    format: b.format,
    status: b.status,
    isFavorite: b.isFavorite,
    addedAt: b.addedAt,
    coverUrl: b.coverUrl,
    progressPercent: b.progressPercent,
  } as Book));

  // 2. Process in small memory-isolated chunks
  const CHUNK_SIZE = 4;
  for (let i = 0; i < total; i++) {
    if (cancelToken?.isCancelled) {
      console.log(`[BatchImport:${opId}] Importação cancelada pelo usuário após ${i} arquivo(s).`);
      break;
    }

    const file = files[i];
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        currentFileName: file.name,
        percent: Math.round(((i + 1) / total) * 100),
      });
    }

    const preClean = cleanBookMetadata(file.name);
    const existingDuplicate = checkBookDuplicate(
      file.name,
      preClean.title,
      preClean.author,
      existingIndex
    );

    if (existingDuplicate) {
      duplicatesSkipped.push({
        fileName: file.name,
        existingTitle: existingDuplicate.title,
        existingBook: existingDuplicate,
        file,
      });
      continue;
    }

    try {
      const book = await importBookFromFile(file, { skipSync: true });
      const postDuplicate = checkBookDuplicate(
        file.name,
        book.title,
        book.author,
        existingIndex.filter((b) => b.id !== book.id)
      );

      if (postDuplicate) {
        await deleteBook(book.id);
        duplicatesSkipped.push({
          fileName: file.name,
          existingTitle: postDuplicate.title,
          existingBook: postDuplicate,
          file,
        });
      } else {
        success.push(book);
        existingIndex.push({
          id: book.id,
          title: book.title,
          author: book.author,
          format: book.format,
          status: book.status,
          isFavorite: book.isFavorite,
          addedAt: book.addedAt,
          coverUrl: book.coverUrl,
        } as Book);
      }
    } catch (err: any) {
      console.error(`[BatchImport:${opId}] Falha ao importar "${file.name}":`, err);
      errors.push({
        fileName: file.name,
        error: err?.message || 'Erro ao processar arquivo',
      });
    }

    // Yield control to event loop & allow garbage collection to run
    if ((i + 1) % CHUNK_SIZE === 0 || i === total - 1) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        await new Promise((r) => (window as any).requestIdleCallback(r, { timeout: 150 }));
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  // 3. Cloud metadata sync with concurrency throttle (4 at a time)
  if (auth.currentUser && success.length > 0) {
    const userUid = auth.currentUser.uid;
    (async () => {
      const SYNC_CHUNK = 4;
      for (let i = 0; i < success.length; i += SYNC_CHUNK) {
        const slice = success.slice(i, i + SYNC_CHUNK);
        await Promise.all(slice.map((b) => syncBookMetadataToFirestore(userUid, b).catch(() => {})));
        await new Promise((r) => setTimeout(r, 60));
      }
    })().catch((err) => console.warn('Erro ao sincronizar lote com Firestore:', err));
  }

  console.log(`[BatchImport:${opId}] Concluído: ${success.length} sucesso(s), ${duplicatesSkipped.length} duplicata(s), ${errors.length} erro(s).`);

  return { success, errors, duplicatesSkipped };
}

// Reading Lists
export async function getReadingLists(): Promise<ReadingList[]> {
  const lists = await dbGetAll('reading_lists');
  if (lists.length === 0) {
    const defaultList: ReadingList = {
      id: 'default-reading-list',
      name: 'Quero Ler',
      description: 'Minha lista de leitura prioritária',
      createdAt: new Date().toISOString(),
    };
    await dbPut('reading_lists', defaultList);
    return [defaultList];
  }
  return lists;
}

export async function getReadingListItems(listId: string): Promise<ReadingListItem[]> {
  const all = await dbGetAll('reading_list_items');
  return all.filter(i => i.listId === listId).sort((a, b) => a.order - b.order);
}

export async function addBookToReadingList(listId: string, bookId: string, isPriority: boolean = false): Promise<void> {
  const existing = await getReadingListItems(listId);
  const alreadyThere = existing.find(i => i.bookId === bookId);
  if (alreadyThere) return;

  const newItem: ReadingListItem = {
    id: `rli-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    listId,
    bookId,
    order: existing.length + 1,
    isPriority,
    addedAt: new Date().toISOString(),
  };
  await dbPut('reading_list_items', newItem);
}

export async function removeBookFromReadingList(itemId: string): Promise<void> {
  await dbDelete('reading_list_items', itemId);
}

export async function reorderReadingListItems(items: ReadingListItem[]): Promise<void> {
  for (let idx = 0; idx < items.length; idx++) {
    const updated = { ...items[idx], order: idx + 1 };
    await dbPut('reading_list_items', updated);
  }
}

export async function toggleReadingListItemPriority(itemId: string): Promise<void> {
  const item = await dbGet('reading_list_items', itemId);
  if (item) {
    item.isPriority = !item.isPriority;
    await dbPut('reading_list_items', item);
  }
}

// Reading Goals
export async function getReadingGoal(bookId: string): Promise<ReadingGoal | undefined> {
  const goals = await dbGetAll('reading_goals');
  return goals.find(g => g.bookId === bookId);
}

export async function saveReadingGoal(bookId: string, targetDays: number, totalPages: number = 100): Promise<ReadingGoal> {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + targetDays);
  const dailyTargetPages = Math.max(1, Math.ceil(totalPages / targetDays));
  const goal: ReadingGoal = {
    id: `goal-${bookId}`,
    bookId,
    targetDays,
    targetDate: targetDate.toISOString().split('T')[0],
    dailyTargetPages,
    createdAt: new Date().toISOString(),
  };
  await dbPut('reading_goals', goal);
  return goal;
}
