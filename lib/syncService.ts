import { useState, useEffect } from 'react';
import {
  auth,
  syncBookMetadataToFirestore,
  fetchBooksFromFirestore,
  uploadBookFileToStorage,
  syncReadingProgressToFirestore,
  fetchReadingProgressFromFirestore,
  syncUserProfileToFirestore,
  fetchUserProfileFromFirestore,
} from './firebase';
import { dbGetAll, dbPut, dbGet } from './indexedDB';
import { Book, ReadingProgress, UserProfile } from '@/types';
import { getUserProfile, saveUserProfile } from './userService';

export interface SyncState {
  isOnline: boolean;
  isAuthenticated: boolean;
  userEmail: string | null;
  status: 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
  lastSyncedAt: string | null;
  activeUploads: number;
  totalUploads: number;
  message: string;
}

// Single immutable snapshot reference for useSyncExternalStore cache stability
let currentSyncState: SyncState = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isAuthenticated: false,
  userEmail: null,
  status: 'idle',
  lastSyncedAt: null,
  activeUploads: 0,
  totalUploads: 0,
  message: '',
};

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {}
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('altto_sync_updated', { detail: currentSyncState }));
  }
}

function updateSyncState(partial: Partial<SyncState>) {
  currentSyncState = { ...currentSyncState, ...partial };
  notifyListeners();
}

/**
 * Returns the stable, cached snapshot of SyncState.
 * Must return the exact same object reference if unchanged (required by useSyncExternalStore).
 */
export function getSyncState(): SyncState {
  return currentSyncState;
}

/**
 * Subscribes a listener to sync state updates.
 * Complies strictly with React's useSyncExternalStore contract.
 */
export function subscribeSyncState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(getSyncState);

  useEffect(() => {
    return subscribeSyncState(() => {
      setState(getSyncState());
    });
  }, []);

  return state;
}

// Background Upload Queue with concurrency limiter (2 concurrent uploads max)
const MAX_CONCURRENT_UPLOADS = 2;
let runningUploads = 0;
const uploadQueue: Array<{
  userId: string;
  book: Book;
  fileBlob: Blob;
  resolve: (url: string) => void;
  reject: (err: any) => void;
}> = [];

async function processNextUpload() {
  if (runningUploads >= MAX_CONCURRENT_UPLOADS || uploadQueue.length === 0) {
    return;
  }

  const task = uploadQueue.shift();
  if (!task) return;

  runningUploads++;
  updateSyncState({
    activeUploads: runningUploads,
    status: 'syncing',
  });

  try {
    const ext = task.book.format || 'pdf';
    const fileName = `${task.book.title || 'livro'}.${ext}`;
    const url = await uploadBookFileToStorage(
      task.userId,
      task.book.id,
      task.fileBlob,
      fileName,
      (pct) => {
        updateSyncState({
          message: `Enviando "${task.book.title.slice(0, 20)}...": ${pct}%`,
        });
      }
    );

    // Update book locally with storage link and sync status
    const updatedBook: Book = {
      ...task.book,
      storagePath: url,
      syncStatus: 'synced',
    };
    await dbPut('books', updatedBook);
    await syncBookMetadataToFirestore(task.userId, updatedBook);

    task.resolve(url);
  } catch (err) {
    console.warn(`Erro no upload em segundo plano de "${task.book.title}":`, err);
    task.reject(err);
  } finally {
    runningUploads--;
    if (runningUploads === 0 && uploadQueue.length === 0) {
      updateSyncState({
        activeUploads: 0,
        status: 'synced',
        lastSyncedAt: new Date().toISOString(),
        message: 'Sincronização na nuvem concluída com sucesso.',
      });
    } else {
      updateSyncState({
        activeUploads: runningUploads,
      });
    }
    processNextUpload();
  }
}

export function enqueueBookUpload(
  userId: string,
  book: Book,
  fileBlob: Blob
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Avoid re-uploading if already in Firebase Storage
    if (book.storagePath && book.storagePath.startsWith('http')) {
      resolve(book.storagePath);
      return;
    }

    uploadQueue.push({ userId, book, fileBlob, resolve, reject });
    updateSyncState({
      totalUploads: uploadQueue.length + runningUploads,
    });
    processNextUpload();
  });
}

/**
 * Full Two-Way Synchronization:
 * 1. Pushes local books and progress to Cloud Firestore.
 * 2. Fetches remote books from Cloud Firestore (merging books not present locally).
 * 3. Resolves reading progress conflict by preferring newest timestamp.
 */
export async function syncLibraryWithCloud(): Promise<{
  syncedBooks: number;
  newBooksFromCloud: number;
}> {
  const user = auth.currentUser;
  if (!user) {
    updateSyncState({
      isAuthenticated: false,
      status: 'idle',
    });
    return { syncedBooks: 0, newBooksFromCloud: 0 };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    updateSyncState({
      isOnline: false,
      status: 'offline',
      message: 'Dispositivo offline. Leitura disponível localmente.',
    });
    return { syncedBooks: 0, newBooksFromCloud: 0 };
  }

  updateSyncState({
    isAuthenticated: true,
    userEmail: user.email,
    status: 'syncing',
    message: 'Sincronizando biblioteca com a nuvem...',
  });

  try {
    const userId = user.uid;

    // 1. Sync User Profile
    const localProfile = getUserProfile();
    await syncUserProfileToFirestore(userId, localProfile);
    const remoteProfile = await fetchUserProfileFromFirestore(userId);
    if (remoteProfile) {
      saveUserProfile({
        ...localProfile,
        name: remoteProfile.name || localProfile.name,
        favoriteVerse: remoteProfile.favoriteVerse || localProfile.favoriteVerse,
        bio: remoteProfile.bio || localProfile.bio,
      });
    }

    // 2. Local Books -> Cloud
    const localBooks = await dbGetAll('books');
    for (const b of localBooks) {
      if (!b.syncStatus || b.syncStatus !== 'synced') {
        await syncBookMetadataToFirestore(userId, b);
        await dbPut('books', { ...b, syncStatus: 'synced' });
      }
    }

    // 3. Cloud Books -> Local
    const cloudBooks = await fetchBooksFromFirestore(userId);
    const localMap = new Map<string, Book>();
    localBooks.forEach((b) => localMap.set(b.id, b));

    let newBooksFromCloud = 0;
    for (const cb of cloudBooks) {
      const existing = localMap.get(cb.id);
      if (!existing) {
        // Book was uploaded from another authenticated device!
        await dbPut('books', {
          ...cb,
          syncStatus: 'synced',
        });
        newBooksFromCloud++;
      } else {
        // Merge progress and favorite state if cloud is more recent
        const cloudDate = cb.lastReadAt ? new Date(cb.lastReadAt).getTime() : 0;
        const localDate = existing.lastReadAt ? new Date(existing.lastReadAt).getTime() : 0;
        if (cloudDate > localDate) {
          await dbPut('books', {
            ...existing,
            currentPage: cb.currentPage ?? existing.currentPage,
            totalPages: cb.totalPages ?? existing.totalPages,
            currentChapterIndex: cb.currentChapterIndex ?? existing.currentChapterIndex,
            totalChapters: cb.totalChapters ?? existing.totalChapters,
            progressPercent: cb.progressPercent ?? existing.progressPercent,
            status: cb.status ?? existing.status,
            lastReadAt: cb.lastReadAt,
            syncStatus: 'synced',
          });
        }
      }
    }

    // 4. Reading Progress Two-Way Merge
    const localProgressList = await dbGetAll('reading_progress');
    for (const p of localProgressList) {
      await syncReadingProgressToFirestore(userId, p);
    }

    const cloudProgressMap = await fetchReadingProgressFromFirestore(userId);
    for (const [contentId, cp] of Object.entries(cloudProgressMap)) {
      const lp = await dbGet('reading_progress', contentId);
      if (!lp) {
        await dbPut('reading_progress', cp);
      } else {
        const cloudTime = cp.lastReadAt ? new Date(cp.lastReadAt).getTime() : 0;
        const localTime = lp.lastReadAt ? new Date(lp.lastReadAt).getTime() : 0;
        if (cloudTime > localTime) {
          await dbPut('reading_progress', cp);
        }
      }
    }

    updateSyncState({
      status: 'synced',
      lastSyncedAt: new Date().toISOString(),
      message: 'Sua biblioteca e progresso estão 100% sincronizados.',
    });

    return {
      syncedBooks: localBooks.length,
      newBooksFromCloud,
    };
  } catch (error) {
    console.error('Falha na sincronização com Firebase:', error);
    updateSyncState({
      status: 'error',
      message: 'Erro ao sincronizar com a nuvem. Tentando novamente mais tarde.',
    });
    throw error;
  }
}

// Global Network and Auth event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    updateSyncState({ isOnline: true });
    syncLibraryWithCloud().catch(() => {});
  });

  window.addEventListener('offline', () => {
    updateSyncState({
      isOnline: false,
      status: 'offline',
      message: 'Sem conexão com a internet. O ALTTO funciona normalmente offline.',
    });
  });

  auth.onAuthStateChanged((user) => {
    updateSyncState({
      isAuthenticated: Boolean(user),
      userEmail: user ? user.email : null,
    });
    if (user) {
      syncLibraryWithCloud().catch(() => {});
    }
  });
}
