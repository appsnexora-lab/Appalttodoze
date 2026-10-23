/**
 * EpubTypes.ts
 * Core data models and configuration types for the ALTTO EPUB reader engine.
 */
export interface EpubMetadata {
  title: string;
  creator: string; // Author
  publisher?: string;
  language?: string;
  description?: string;
  rights?: string;
  publicationDate?: string;
  coverHref?: string;
  coverDataUrl?: string;
  coverType?: string;
  coverSource?: 'metadata' | 'cover-item' | 'manifest' | 'first-image' | 'first-page' | 'cbz-page' | 'fallback';
  epubVersion: string; // '2.0' | '3.0' | string
}

export interface EpubManifestItem {
  id: string;
  href: string;
  fullPath: string;
  mediaType: string;
  properties?: string;
}

export interface EpubSpineItem {
  id: string;
  idref: string;
  href: string;
  fullPath: string;
  index: number;
  linear: boolean;
}

export interface EpubTocItem {
  id: string;
  label: string;
  href: string;
  fullPath: string;
  anchor?: string;
  chapterIndex?: number;
  subitems: EpubTocItem[];
  level: number;
}

export interface EpubReadingPosition {
  chapterIndex: number;
  chapterId: string;
  elementId?: string;
  scrollTop: number;
  scrollPercent: number; // 0 to 100 within chapter
  totalProgress: number; // 0 to 100 overall book progress
  chapterTitle?: string;
  updatedAt: string;
}

export type EpubTheme = 'light' | 'sepia' | 'dark' | 'night';
export type EpubFontFamily = 'serif' | 'sans' | 'mono' | 'literata' | 'georgia';
export type EpubContentWidth = 'compact' | 'normal' | 'wide' | 'full';
export type EpubTextAlign = 'justify' | 'left';

export interface EpubStyleOptions {
  theme: EpubTheme;
  fontSize: number; // 14 to 32 (default 18)
  fontFamily: EpubFontFamily;
  lineHeight: number; // 1.4 to 2.2 (default 1.6)
  paragraphSpacing: number; // 0.6 to 1.8 (default 1.0 rem)
  contentWidth: EpubContentWidth;
  textAlign: EpubTextAlign;
  marginHorizontal: number; // px padding
}

export interface EpubSearchResult {
  chapterIndex: number;
  chapterTitle: string;
  chapterHref: string;
  snippet: string;
  matchIndexInChapter: number;
  matchId: string;
}
