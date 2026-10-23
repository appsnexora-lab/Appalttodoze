import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';
import { Book, ReadingProgress, UserProfile } from '@/types';

// 1. Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with forceLongPolling to prevent 10s backend streaming timeout in iframe/cloud environments
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

// 2. Initialize Services with specific database ID if configured
export const auth = getAuth(app);
export const db = firestoreInstance; /* CRITICAL: The app will break without this line */
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// 3. Error Handling conforming to Firebase Integration Skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 4. Connection check helper
export async function testConnection(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'test', 'connection'));
    return snap.exists();
  } catch {
    return false;
  }
}

// 5. Auth helpers
export async function loginWithGoogle(): Promise<User | null> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err: any) {
    if (err.code === 'auth/popup-closed-by-user') {
      return null;
    }
    console.error('Erro na autenticação Google:', err);
    throw err;
  }
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export function onUserAuthStateChanged(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

// 6. Firebase Storage: Cloud binary storage for PDFs/EPUBs and original covers
export async function uploadBookFileToStorage(
  userId: string,
  bookId: string,
  fileBlob: Blob,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const ext = fileName.split('.').pop() || 'bin';
  const cleanBookId = bookId.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const path = `users/${userId}/books/${cleanBookId}.${ext}`;
  const fileRef = ref(storage, path);

  const uploadTask = uploadBytesResumable(fileRef, fileBlob);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(pct);
        }
      },
      (error) => {
        console.error('Erro no upload para Firebase Storage:', error);
        reject(error);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

// 7. Cloud Firestore: Book metadata sync
export async function syncBookMetadataToFirestore(userId: string, book: Book): Promise<void> {
  const path = `users/${userId}/books/${book.id}`;
  try {
    // Sanitize book payload to match firestore.rules strictly
    const docData: Record<string, any> = {
      id: book.id,
      ownerId: userId,
      title: book.title || 'Sem título',
      author: book.author || 'Desconhecido',
      format: book.format,
      addedAt: book.addedAt || new Date().toISOString(),
      isFavorite: Boolean(book.isFavorite),
      status: book.status || 'not_started',
      syncStatus: 'synced',
    };

    if (book.description) docData.description = book.description.substring(0, 4000);
    if (book.currentPage !== undefined) docData.currentPage = book.currentPage;
    if (book.totalPages !== undefined) docData.totalPages = book.totalPages;
    if (book.currentChapterIndex !== undefined) docData.currentChapterIndex = book.currentChapterIndex;
    if (book.totalChapters !== undefined) docData.totalChapters = book.totalChapters;
    if (book.progressPercent !== undefined) docData.progressPercent = book.progressPercent;
    if (book.coverType) docData.coverType = book.coverType;
    if (book.coverSource) docData.coverSource = book.coverSource;
    if (book.coverGeneratedAt) docData.coverGeneratedAt = book.coverGeneratedAt;
    if (book.lastReadAt) docData.lastReadAt = book.lastReadAt;

    // Persist coverUrl in docData if reasonable size (< 300KB)
    if (book.coverUrl && book.coverUrl.length < 300000) {
      docData.coverUrl = book.coverUrl;
    }

    docData.updatedAt = new Date().toISOString();

    await setDoc(doc(db, 'users', userId, 'books', book.id), docData, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchBooksFromFirestore(userId: string): Promise<Book[]> {
  const path = `users/${userId}/books`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'books'));
    const books: Book[] = [];
    snap.forEach((d) => {
      const data = d.data();
      books.push({
        id: data.id || d.id,
        title: data.title,
        author: data.author,
        format: data.format,
        description: data.description,
        coverUrl: data.coverUrl,
        coverType: data.coverType,
        coverSource: data.coverSource,
        coverGeneratedAt: data.coverGeneratedAt,
        status: data.status || 'not_started',
        isFavorite: Boolean(data.isFavorite),
        currentPage: data.currentPage,
        totalPages: data.totalPages,
        currentChapterIndex: data.currentChapterIndex,
        totalChapters: data.totalChapters,
        progressPercent: data.progressPercent,
        addedAt: data.addedAt,
        lastReadAt: data.lastReadAt,
      });
    });
    return books;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteBookFromFirestore(userId: string, bookId: string): Promise<void> {
  const path = `users/${userId}/books/${bookId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'books', bookId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// 8. Cloud Firestore: Reading Progress sync
export async function syncReadingProgressToFirestore(
  userId: string,
  progress: ReadingProgress
): Promise<void> {
  const path = `users/${userId}/reading_progress/${progress.contentId}`;
  try {
    const payload: Record<string, any> = {
      id: progress.id || progress.contentId,
      userId,
      contentId: progress.contentId,
      contentType: progress.contentType,
      percentage: progress.percentage,
      lastReadAt: progress.lastReadAt || new Date().toISOString(),
    };
    if (progress.currentPage !== undefined) payload.currentPage = progress.currentPage;
    if (progress.currentChapter !== undefined) payload.currentChapter = String(progress.currentChapter);
    if (progress.scrollOffset !== undefined) payload.scrollOffset = progress.scrollOffset;

    await setDoc(doc(db, 'users', userId, 'reading_progress', progress.contentId), payload, {
      merge: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchReadingProgressFromFirestore(
  userId: string
): Promise<Record<string, ReadingProgress>> {
  const path = `users/${userId}/reading_progress`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'reading_progress'));
    const result: Record<string, ReadingProgress> = {};
    snap.forEach((d) => {
      const p = d.data() as ReadingProgress;
      if (p.contentId) {
        result[p.contentId] = p;
      }
    });
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function uploadAvatarImageToStorage(
  userId: string,
  blobOrBase64: Blob | string
): Promise<string> {
  let blob: Blob;
  if (typeof blobOrBase64 === 'string') {
    const arr = blobOrBase64.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    blob = new Blob([u8arr], { type: mime });
  } else {
    blob = blobOrBase64;
  }
  const fileRef = ref(storage, `users/${userId}/avatar.jpg`);
  const uploadTask = uploadBytesResumable(fileRef, blob);
  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      null,
      (error) => reject(error),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

// 9. Cloud Firestore: User Profile sync
export async function syncUserProfileToFirestore(
  userId: string,
  profile: Partial<UserProfile>
): Promise<void> {
  const path = `users/${userId}`;
  try {
    let finalAvatarUrl = profile.avatarUrl;
    // If avatar is a local base64, store binary in Firebase Cloud Storage as per requirement 15.1
    if (finalAvatarUrl && finalAvatarUrl.startsWith('data:image/')) {
      try {
        finalAvatarUrl = await uploadAvatarImageToStorage(userId, finalAvatarUrl);
      } catch (uploadErr) {
        console.warn('Armazenamento na nuvem do avatar pausado, mantendo local:', uploadErr);
      }
    }

    const payload: Record<string, any> = {
      id: userId,
      name: profile.name || 'Leitor ALTTO',
      updatedAt: new Date().toISOString(),
    };
    if (profile.email) payload.email = profile.email;
    if (finalAvatarUrl && finalAvatarUrl.length <= 2048) payload.avatarUrl = finalAvatarUrl;
    if (profile.avatarPreset) payload.avatarPreset = profile.avatarPreset;
    if (profile.favoriteVerse) payload.favoriteVerse = profile.favoriteVerse;
    if (profile.bio) payload.bio = profile.bio;
    if (profile.dailyGoalChapters !== undefined) payload.dailyGoalChapters = profile.dailyGoalChapters;
    if (profile.streakDays !== undefined) payload.streakDays = profile.streakDays;

    await setDoc(doc(db, 'users', userId), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchUserProfileFromFirestore(userId: string): Promise<UserProfile | null> {
  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}
