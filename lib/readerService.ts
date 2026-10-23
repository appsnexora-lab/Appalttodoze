import {
  ReadingProgress,
  Bookmark,
  Highlight,
  HighlightColor,
  HighlightCategory,
  Annotation,
  ContentType,
  ReaderTheme
} from '@/types';
import { dbGetAll, dbGet, dbPut, dbDelete } from './indexedDB';
import { auth, syncReadingProgressToFirestore } from './firebase';

export async function getReadingProgress(contentId: string): Promise<ReadingProgress | undefined> {
  const all = await dbGetAll('reading_progress');
  return all.find(p => p.contentId === contentId);
}

export async function saveReadingProgress(
  contentId: string,
  contentType: ContentType,
  currentPage: number,
  percentage: number,
  scrollOffset?: number,
  zoomLevel?: number,
  currentChapter?: string | number
): Promise<void> {
  const pct = Math.min(100, Math.max(0, percentage));
  const progress: ReadingProgress = {
    id: `prog-${contentId}`,
    contentId,
    contentType,
    currentPage,
    percentage: pct,
    scrollOffset,
    zoomLevel,
    currentChapter,
    lastReadAt: new Date().toISOString(),
  };
  await dbPut('reading_progress', progress);

  if (contentType === 'book') {
    try {
      const book = await dbGet('books', contentId);
      if (book) {
        book.currentPage = currentPage;
        book.progressPercent = pct;
        book.lastReadAt = progress.lastReadAt;
        if (pct >= 100) {
          book.status = 'completed';
        } else if (pct > 0) {
          book.status = 'in_progress';
        }
        await dbPut('books', book);
      }
    } catch {}
  }

  if (auth.currentUser) {
    syncReadingProgressToFirestore(auth.currentUser.uid, progress).catch(() => {});
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('altto_reading_progress_updated', { detail: progress }));
  }
}

// Bookmarks
export async function getBookmarks(contentId?: string): Promise<Bookmark[]> {
  const all = await dbGetAll('bookmarks');
  if (contentId) {
    return all.filter(b => b.contentId === contentId);
  }
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function addBookmark(
  contentId: string,
  contentType: ContentType,
  title: string,
  location: string,
  scrollOffset?: number
): Promise<Bookmark> {
  const bookmark: Bookmark = {
    id: `bm-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    userId: 'local-user',
    contentId,
    contentType,
    title,
    location,
    scrollOffset,
    createdAt: new Date().toISOString(),
  };
  await dbPut('bookmarks', bookmark);
  return bookmark;
}

export async function deleteBookmark(id: string): Promise<void> {
  await dbDelete('bookmarks', id);
}

// Highlights
export async function getHighlights(contentId?: string): Promise<Highlight[]> {
  const all = await dbGetAll('highlights');
  if (contentId) {
    return all.filter(h => h.contentId === contentId);
  }
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function addHighlight(
  contentId: string,
  contentType: ContentType,
  text: string,
  color: HighlightColor | string,
  location: string,
  note?: string,
  category?: HighlightCategory | string
): Promise<Highlight> {
  const highlight: Highlight = {
    id: `hl-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    userId: 'local-user',
    contentId,
    contentType,
    text,
    color,
    category,
    location,
    note,
    createdAt: new Date().toISOString(),
  };
  await dbPut('highlights', highlight);
  return highlight;
}

export async function deleteHighlight(id: string): Promise<void> {
  await dbDelete('highlights', id);
}

// Annotations
export async function getAnnotations(contentId?: string): Promise<Annotation[]> {
  const all = await dbGetAll('annotations');
  if (contentId) {
    return all.filter(a => a.contentId === contentId);
  }
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function addAnnotation(
  contentId: string,
  contentType: ContentType,
  text: string,
  location: string,
  title?: string
): Promise<Annotation> {
  const annotation: Annotation = {
    id: `ann-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    userId: 'local-user',
    contentId,
    contentType,
    title,
    text,
    location,
    createdAt: new Date().toISOString(),
  };
  await dbPut('annotations', annotation);
  return annotation;
}

export async function deleteAnnotation(id: string): Promise<void> {
  await dbDelete('annotations', id);
}

// Reader Theme Palettes
export const THEME_STYLES: Record<
  ReaderTheme,
  {
    name: string;
    bg: string;
    text: string;
    cardBg: string;
    accent: string;
    border: string;
    badgeBg: string;
  }
> = {
  light: {
    name: 'Claro (Padrão)',
    bg: 'bg-white',
    text: 'text-[#29243A]',
    cardBg: 'bg-[#FAF9FD]',
    accent: 'text-[#A58ADB]',
    border: 'border-[#EAE5F4]',
    badgeBg: 'bg-[#F0EAFE]',
  },
  cream: {
    name: 'Creme',
    bg: 'bg-[#FDFBF7]',
    text: 'text-[#2C2523]',
    cardBg: 'bg-[#F5F0E6]',
    accent: 'text-[#A58ADB]',
    border: 'border-[#E6DFC8]',
    badgeBg: 'bg-[#EFE8D8]',
  },
  sepia: {
    name: 'Sépia',
    bg: 'bg-[#F4ECD8]',
    text: 'text-[#433422]',
    cardBg: 'bg-[#E8DCBF]',
    accent: 'text-[#7D5A2E]',
    border: 'border-[#D6C49F]',
    badgeBg: 'bg-[#DECEAC]',
  },
  gray: {
    name: 'Cinza',
    bg: 'bg-[#22272E]',
    text: 'text-[#ADBAC7]',
    cardBg: 'bg-[#2D333B]',
    accent: 'text-[#C4B1F0]',
    border: 'border-[#444C56]',
    badgeBg: 'bg-[#373E47]',
  },
  dark: {
    name: 'Escuro',
    bg: 'bg-[#181622]',
    text: 'text-[#EAE5F4]',
    cardBg: 'bg-[#221F30]',
    accent: 'text-[#C4B1F0]',
    border: 'border-[#332E47]',
    badgeBg: 'bg-[#2E2940]',
  },
  oled: {
    name: 'Noite OLED',
    bg: 'bg-black',
    text: 'text-[#E0E0E0]',
    cardBg: 'bg-[#0E0C14]',
    accent: 'text-[#C4B1F0]',
    border: 'border-[#262135]',
    badgeBg: 'bg-[#1A1724]',
  },
};
