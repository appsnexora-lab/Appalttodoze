import { Bible, BibleBook, BibleReading, BibleReflection } from '@/types';
import { dbGetAll, dbGet, dbPut, dbDelete } from './indexedDB';
import { BIBLE_BOOKS_CATALOG } from './bibleData';

export async function getBibles(): Promise<Bible[]> {
  return await dbGetAll('bibles');
}

export async function getBibleById(id: string): Promise<Bible | undefined> {
  return await dbGet('bibles', id);
}

export async function updateBible(bible: Bible): Promise<void> {
  await dbPut('bibles', bible);
}

import { auth, deleteBookFromFirestore } from './firebase';

export async function deleteBible(id: string): Promise<void> {
  await dbDelete('bibles', id);
}

export async function cleanLegacyAlmeidaBibles(): Promise<void> {
  try {
    // 1. Clean bibles store in IndexedDB
    const allBibles = await dbGetAll('bibles');
    for (const b of allBibles) {
      if (!b || !b.id) continue;
      const isAlmeida =
        b.id === 'bible-almeida-arc' ||
        b.id === 'official-almeida' ||
        (b.name && /almeida|joão ferreira|joao ferreira/i.test(b.name)) ||
        (b.authorOrEditor && /almeida|joão ferreira|joao ferreira/i.test(b.authorOrEditor));
      if (isAlmeida) {
        await dbDelete('bibles', b.id);
      }
    }

    // 2. Clean books store in IndexedDB
    const allBooks = await dbGetAll('books');
    for (const bk of allBooks) {
      if (!bk || !bk.id) continue;
      const titleLower = (bk.title || '').toLowerCase();
      const authorLower = (bk.author || '').toLowerCase();
      const isAlmeidaBook =
        bk.id === 'official-almeida' ||
        bk.id === 'bible-almeida-arc' ||
        titleLower.includes('almeida') ||
        titleLower.includes('joão ferreira') ||
        titleLower.includes('joao ferreira') ||
        authorLower.includes('almeida') ||
        authorLower.includes('joão ferreira') ||
        authorLower.includes('joao ferreira');
      if (isAlmeidaBook) {
        await dbDelete('books', bk.id);
        await dbDelete('blobs', bk.id);
        if (bk.fileBlobKey && bk.fileBlobKey !== bk.id) {
          await dbDelete('blobs', bk.fileBlobKey);
        }
        await dbDelete('reading_progress', bk.id);
        await dbDelete('reading_progress', `progress-${bk.id}`);
        if (auth.currentUser) {
          deleteBookFromFirestore(auth.currentUser.uid, bk.id).catch(() => {});
        }
      }
    }

    // 3. Clean localStorage references
    try {
      localStorage.removeItem('altto_use_official_almeida');
      const selectedBibleId = localStorage.getItem('altto_selected_bible_book_id');
      if (
        selectedBibleId === 'official-almeida' ||
        selectedBibleId === 'bible-almeida-arc'
      ) {
        localStorage.removeItem('altto_selected_bible_book_id');
      }
    } catch {}

    // 4. Clean Firebase Firestore if user is authenticated
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      deleteBookFromFirestore(uid, 'official-almeida').catch(() => {});
      deleteBookFromFirestore(uid, 'bible-almeida-arc').catch(() => {});
    }
  } catch (e) {
    console.warn('Erro ao limpar dados legados da Bíblia Almeida:', e);
  }
}

// Stub for backwards compatibility if needed, returns a clean generic bible
export async function importOfficialAlmeidaBible(): Promise<Bible> {
  await cleanLegacyAlmeidaBibles();
  throw new Error('Bíblia Almeida removida permanentemente conforme preferência.');
}

export async function importBibleFromFile(
  file: File,
  overrides?: { name?: string; version?: string; author?: string; coverUrl?: string }
): Promise<Bible> {
  const fileText = await file.text().catch(() => '');
  let detectedName = file.name.replace(/\.[^/.]+$/, '');
  let detectedVersion = 'Personalizada';
  let detectedAuthor = 'Importação do Usuário';

  if (file.name.endsWith('.json')) {
    try {
      const parsed = JSON.parse(fileText);
      if (parsed.name) detectedName = parsed.name;
      if (parsed.version) detectedVersion = parsed.version;
      if (parsed.author) detectedAuthor = parsed.author;
    } catch {
      // ignore
    }
  }

  const books: BibleBook[] = BIBLE_BOOKS_CATALOG.map(b => ({
    id: b.id,
    name: b.name,
    testament: b.testament,
    chaptersCount: b.chaptersCount,
  }));

  const bible: Bible = {
    id: `bible-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: overrides?.name || detectedName,
    version: overrides?.version || detectedVersion,
    authorOrEditor: overrides?.author || detectedAuthor,
    coverUrl: overrides?.coverUrl || '',
    books,
    importedAt: new Date().toISOString(),
    totalChaptersRead: 0,
  };

  await dbPut('bibles', bible);
  return bible;
}

// Daily reading control
export async function getBibleReadingsByDate(dateStr: string): Promise<BibleReading[]> {
  const all = await dbGetAll('bible_readings');
  return all.filter(r => r.date === dateStr);
}

export async function getAllBibleReadings(): Promise<BibleReading[]> {
  return await dbGetAll('bible_readings');
}

export async function saveBibleReading(reading: BibleReading): Promise<void> {
  await dbPut('bible_readings', reading);
}

// Spiritual reflections ("O que Deus falou ao meu coração")
export async function saveBibleReflection(reflection: BibleReflection): Promise<void> {
  await dbPut('bible_reflections', reflection);
}

export async function getBibleReflectionsByDate(dateStr: string): Promise<BibleReflection[]> {
  const all = await dbGetAll('bible_reflections');
  return all.filter(r => r.date === dateStr);
}

export async function getAllBibleReflections(): Promise<BibleReflection[]> {
  const all = await dbGetAll('bible_reflections');
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// Sequence logic: Check if yesterday had pending readings
export async function checkYesterdayPendingBibleReading(currentDateStr: string): Promise<BibleReading | null> {
  const today = new Date(currentDateStr + 'T00:00:00');
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const yesterdayReadings = await getBibleReadingsByDate(yesterdayStr);
  const pendingReading = yesterdayReadings.find(r => r.status === 'pending');
  if (pendingReading) return pendingReading;

  const nightReading = yesterdayReadings.find(r => r.period === 'night');
  if (yesterdayReadings.length > 0 && (!nightReading || nightReading.status === 'pending')) {
    if (!nightReading) {
      return {
        id: `pending-synth-${yesterdayStr}-night`,
        bibleId: yesterdayReadings[0].bibleId,
        bookName: yesterdayReadings[0].bookName,
        chapterNumber: yesterdayReadings[0].chapterNumber,
        period: 'night',
        date: yesterdayStr,
        time: '21:00',
        userId: 'local-user',
        status: 'pending',
      };
    }
    return nightReading;
  }

  return null;
}
