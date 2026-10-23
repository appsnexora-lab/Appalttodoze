/**
 * EpubPositionManager.ts
 * Manages precise reading position tracking, scroll restoration, and persistence to IndexedDB.
 */
import { EpubReadingPosition } from './EpubTypes';
import { saveReadingProgress, getReadingProgress } from '@/lib/readerService';

export class EpubPositionManager {
  private bookId: string;
  private totalChapters: number;
  private currentPosition: EpubReadingPosition;
  private saveDebounceTimer?: NodeJS.Timeout;
  private onPositionChange?: (pos: EpubReadingPosition) => void;

  constructor(
    bookId: string,
    totalChapters: number,
    onPositionChange?: (pos: EpubReadingPosition) => void
  ) {
    this.bookId = bookId;
    this.totalChapters = Math.max(1, totalChapters);
    this.onPositionChange = onPositionChange;
    this.currentPosition = {
      chapterIndex: 0,
      chapterId: 'spine-0',
      scrollTop: 0,
      scrollPercent: 0,
      totalProgress: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  public getPosition(): EpubReadingPosition {
    return { ...this.currentPosition };
  }

  public async restore(): Promise<EpubReadingPosition | null> {
    try {
      const saved = await getReadingProgress(this.bookId);
      if (saved) {
        const rawChapter = typeof saved.currentChapter === 'number'
          ? saved.currentChapter
          : parseInt(String(saved.currentChapter || '0'), 10);
        const chapterIdx = Math.max(0, Math.min(this.totalChapters - 1, isNaN(rawChapter) ? 0 : rawChapter));

        const pos: EpubReadingPosition = {
          chapterIndex: chapterIdx,
          chapterId: `spine-${chapterIdx}`,
          scrollTop: saved.scrollOffset || 0,
          scrollPercent: saved.percentage || 0,
          totalProgress: saved.percentage || 0,
          updatedAt: new Date().toISOString(),
        };
        this.currentPosition = pos;
        return pos;
      }
    } catch (err) {
      console.warn('Erro ao restaurar posição do EPUB:', err);
    }
    return null;
  }

  public update(
    chapterIndex: number,
    scrollTop: number,
    chapterHeight: number,
    clientHeight: number,
    chapterTitle?: string
  ): void {
    const clampedIndex = Math.max(0, Math.min(this.totalChapters - 1, chapterIndex));
    const maxScroll = Math.max(1, chapterHeight - clientHeight);
    const scrollPercent = Math.min(100, Math.max(0, Math.round((scrollTop / maxScroll) * 100)));

    const chapterWeight = 100 / this.totalChapters;
    const baseProgress = clampedIndex * chapterWeight;
    const intraProgress = (scrollPercent / 100) * chapterWeight;
    const totalProgress = Math.min(100, Math.max(0, Math.round(baseProgress + intraProgress)));

    this.currentPosition = {
      chapterIndex: clampedIndex,
      chapterId: `spine-${clampedIndex}`,
      scrollTop,
      scrollPercent,
      totalProgress,
      chapterTitle,
      updatedAt: new Date().toISOString(),
    };

    if (this.onPositionChange) {
      this.onPositionChange(this.currentPosition);
    }

    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => {
      this.persist();
    }, 600);
  }

  public async persist(): Promise<void> {
    try {
      await saveReadingProgress(
        this.bookId,
        'book',
        this.currentPosition.chapterIndex,
        this.currentPosition.totalProgress,
        this.currentPosition.scrollTop,
        1.0,
        this.currentPosition.chapterIndex
      );
    } catch (err) {
      console.warn('Erro ao salvar progresso do EPUB:', err);
    }
  }

  public destroy(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.persist();
    }
  }
}
