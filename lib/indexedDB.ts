import {
  Bible,
  BibleReading,
  BibleReflection,
  Devotional,
  DevotionalReading,
  Book,
  ReadingProgress,
  ReadingList,
  ReadingListItem,
  ReadingGoal,
  Bookmark,
  Highlight,
  Annotation,
  UserProfile,
} from '@/types';

const DB_NAME = 'altto_app_db';
const DB_VERSION = 2;

interface DBSchema {
  bibles: Bible;
  bible_readings: BibleReading;
  bible_reflections: BibleReflection;
  devotionals: Devotional;
  devotional_readings: DevotionalReading;
  books: Book;
  reading_progress: ReadingProgress;
  reading_lists: ReadingList;
  reading_list_items: ReadingListItem;
  reading_goals: ReadingGoal;
  bookmarks: Bookmark;
  highlights: Highlight;
  annotations: Annotation;
  blobs: { id: string; data: Blob | ArrayBuffer | string; mimeType: string; name: string };
  user_profile: UserProfile;
}

type StoreName = keyof DBSchema;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getIDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only available in browser environment'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const createStore = (
          name: StoreName,
          keyPath: string = 'id',
          indices: { name: string; keyPath: string | string[]; unique?: boolean }[] = []
        ) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath });
            indices.forEach(idx => store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique }));
          }
        };

        createStore('bibles');
        createStore('bible_readings', 'id', [
          { name: 'by_date', keyPath: 'date' },
          { name: 'by_period_date', keyPath: ['date', 'period'] }
        ]);
        createStore('bible_reflections', 'id', [
          { name: 'by_date', keyPath: 'date' },
          { name: 'by_bible', keyPath: 'bibleId' }
        ]);
        createStore('devotionals');
        createStore('devotional_readings', 'id', [
          { name: 'by_devotional', keyPath: 'devotionalId' },
          { name: 'by_date', keyPath: 'date' },
          { name: 'by_devotional_day', keyPath: ['devotionalId', 'dayNumber'], unique: true }
        ]);
        createStore('books', 'id', [
          { name: 'by_status', keyPath: 'status' },
          { name: 'by_favorite', keyPath: 'isFavorite' }
        ]);
        createStore('reading_progress', 'id', [
          { name: 'by_content', keyPath: 'contentId' }
        ]);
        createStore('reading_lists');
        createStore('reading_list_items', 'id', [
          { name: 'by_list', keyPath: 'listId' },
          { name: 'by_book', keyPath: 'bookId' }
        ]);
        createStore('reading_goals', 'id', [
          { name: 'by_book', keyPath: 'bookId' }
        ]);
        createStore('bookmarks', 'id', [
          { name: 'by_content', keyPath: 'contentId' }
        ]);
        createStore('highlights', 'id', [
          { name: 'by_content', keyPath: 'contentId' }
        ]);
        createStore('annotations', 'id', [
          { name: 'by_content', keyPath: 'contentId' }
        ]);
        createStore('blobs');
        createStore('user_profile');
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Falha ao abrir IndexedDB'));
      };
      request.onblocked = () => {
        console.warn('IndexedDB bloqueado temporariamente aguardando versão');
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

export async function dbGetAll<T extends StoreName>(storeName: T): Promise<DBSchema[T][]> {
  try {
    const db = await getIDB();
    if (!db.objectStoreNames.contains(storeName)) {
      console.warn(`ObjectStore ${storeName} inexistente no IndexedDB.`);
      return [];
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve((request.result as DBSchema[T][]) || []);
        request.onerror = () => resolve([]);
        tx.onerror = () => resolve([]);
      } catch (err) {
        console.warn(`dbGetAll erro em ${storeName}:`, err);
        resolve([]);
      }
    });
  } catch (err) {
    console.warn(`Falha de acesso ao banco em dbGetAll(${storeName}):`, err);
    return [];
  }
}

export async function dbGet<T extends StoreName>(storeName: T, key: IDBValidKey): Promise<DBSchema[T] | undefined> {
  try {
    const db = await getIDB();
    if (!db.objectStoreNames.contains(storeName)) {
      return undefined;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result as DBSchema[T] | undefined);
        request.onerror = () => resolve(undefined);
        tx.onerror = () => resolve(undefined);
      } catch (err) {
        resolve(undefined);
      }
    });
  } catch {
    return undefined;
  }
}

export async function dbPut<T extends StoreName>(storeName: T, value: DBSchema[T]): Promise<void> {
  try {
    const db = await getIDB();
    if (!db.objectStoreNames.contains(storeName)) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(value);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // Graceful fallback
  }
}

export async function dbDelete<T extends StoreName>(storeName: T, key: IDBValidKey): Promise<void> {
  try {
    const db = await getIDB();
    if (!db.objectStoreNames.contains(storeName)) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // Graceful fallback
  }
}

export async function dbClear<T extends StoreName>(storeName: T): Promise<void> {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error(`dbClear failed on ${storeName}`));
      tx.onerror = () => reject(tx.error || new Error(`dbClear tx error on ${storeName}`));
      tx.onabort = () => reject(tx.error || new Error(`dbClear tx aborted on ${storeName}`));
    } catch (err) {
      reject(err);
    }
  });
}

// Blob helper for large book files and comics
export async function saveBlob(id: string, data: Blob | ArrayBuffer | string, mimeType: string, name: string): Promise<void> {
  await dbPut('blobs', { id, data, mimeType, name });
}

export async function getBlob(id: string): Promise<{ id: string; data: Blob | ArrayBuffer | string; mimeType: string; name: string } | undefined> {
  const item = await dbGet('blobs', id);
  return item;
}

// Backup Export & Import
export async function exportAllDataAsJSON(): Promise<string> {
  const stores: StoreName[] = [
    'bibles',
    'bible_readings',
    'bible_reflections',
    'devotionals',
    'devotional_readings',
    'books',
    'reading_progress',
    'bookmarks',
    'highlights',
    'annotations',
    'reading_lists',
    'reading_list_items',
    'reading_goals',
  ];
  const exportPayload: Record<string, any[]> = {};
  for (const st of stores) {
    exportPayload[st] = await dbGetAll(st);
  }
  return JSON.stringify({
    alttoVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    data: exportPayload,
  }, null, 2);
}

export async function importDataFromJSON(jsonString: string): Promise<void> {
  const parsed = JSON.parse(jsonString);
  if (!parsed || !parsed.data) {
    throw new Error('Arquivo de backup inválido.');
  }
  const stores = Object.keys(parsed.data) as StoreName[];
  for (const st of stores) {
    const items = parsed.data[st];
    if (Array.isArray(items)) {
      for (const item of items) {
        await dbPut(st, item);
      }
    }
  }
}
