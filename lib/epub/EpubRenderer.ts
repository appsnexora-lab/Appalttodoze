/**
 * EpubRenderer.ts
 * Coordinates progressive chapter loading, internal anchor clicks, and footnote resolution.
 */
import { EpubBook } from './EpubBook';
import { EpubSpine } from './EpubSpine';
import { EpubChapter, LoadedChapter } from './EpubChapter';

export interface ChapterLoadCallback {
  (index: number, chapter: LoadedChapter): void;
}

export class EpubRenderer {
  private book: EpubBook;
  private spine: EpubSpine;
  private chapterCache: Map<number, LoadedChapter> = new Map();
  private loadingPromises: Map<number, Promise<LoadedChapter>> = new Map();

  constructor(book: EpubBook, spine: EpubSpine) {
    this.book = book;
    this.spine = spine;
  }

  public get totalChapters(): number {
    return this.spine.length;
  }

  public async loadChapter(index: number): Promise<LoadedChapter> {
    if (this.chapterCache.has(index)) {
      return this.chapterCache.get(index)!;
    }
    if (this.loadingPromises.has(index)) {
      return await this.loadingPromises.get(index)!;
    }

    const spineItem = this.spine.getItem(index);
    if (!spineItem) {
      throw new Error(`Capítulo de índice ${index} não encontrado no spine.`);
    }

    const loadPromise = (async () => {
      const chapter = new EpubChapter(spineItem, this.book, this.spine);
      const loaded = await chapter.load();
      this.chapterCache.set(index, loaded);
      this.loadingPromises.delete(index);
      return loaded;
    })();

    this.loadingPromises.set(index, loadPromise);
    return await loadPromise;
  }

  public preloadAdjacent(currentIndex: number, range: number = 2): void {
    const start = Math.max(0, currentIndex - 1);
    const end = Math.min(this.totalChapters - 1, currentIndex + range);

    for (let i = start; i <= end; i++) {
      if (!this.chapterCache.has(i) && !this.loadingPromises.has(i)) {
        this.loadChapter(i).catch((err) => {
          console.warn(`Falha ao pré-carregar capítulo ${i}:`, err);
        });
      }
    }
  }

  public getCachedChapter(index: number): LoadedChapter | undefined {
    return this.chapterCache.get(index);
  }

  public clearCache(): void {
    this.chapterCache.clear();
    this.loadingPromises.clear();
  }
}
