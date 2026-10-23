/**
 * EpubSearch.ts
 * Real full-text search engine for EPUB documents across all spine chapters.
 */
import { EpubSearchResult } from './EpubTypes';
import { EpubBook } from './EpubBook';
import { EpubSpine } from './EpubSpine';
import { EpubChapter } from './EpubChapter';

export class EpubSearch {
  private book: EpubBook;
  private spine: EpubSpine;
  private chapterTextCache: Map<number, { title: string; text: string }> = new Map();
  private isCancelled: boolean = false;

  constructor(book: EpubBook, spine: EpubSpine) {
    this.book = book;
    this.spine = spine;
  }

  public cancelSearch(): void {
    this.isCancelled = true;
  }

  public async search(
    query: string,
    onProgress?: (processed: number, total: number) => void
  ): Promise<EpubSearchResult[]> {
    this.isCancelled = false;
    const cleanQuery = query.trim();
    if (!cleanQuery || cleanQuery.length < 2) return [];

    const lowerQuery = cleanQuery.toLowerCase();
    const results: EpubSearchResult[] = [];
    const total = this.spine.length;

    for (let i = 0; i < total; i++) {
      if (this.isCancelled) break;
      const spineItem = this.spine.getItem(i);
      if (!spineItem) continue;

      let cached = this.chapterTextCache.get(i);
      if (!cached) {
        try {
          const chapter = new EpubChapter(spineItem, this.book, this.spine);
          const loaded = await chapter.load();
          cached = { title: loaded.title, text: loaded.rawText };
          this.chapterTextCache.set(i, cached);
        } catch (err) {
          console.warn(`Erro ao carregar capítulo ${i} para busca:`, err);
          continue;
        }
      }

      const lowerText = cached.text.toLowerCase();
      let pos = 0;
      let matchIdx = 0;

      while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
        if (this.isCancelled) break;
        const start = Math.max(0, pos - 50);
        const end = Math.min(cached.text.length, pos + lowerQuery.length + 50);
        const snippet = cached.text.substring(start, end).replace(/\s+/g, ' ').trim();

        results.push({
          chapterIndex: i,
          chapterTitle: cached.title,
          chapterHref: spineItem.href,
          snippet: `...${snippet}...`,
          matchIndexInChapter: matchIdx,
          matchId: `search-${i}-${matchIdx}`,
        });

        matchIdx++;
        pos += lowerQuery.length;
        if (matchIdx > 30) break;
      }

      if (onProgress) {
        onProgress(i + 1, total);
      }
    }

    return results;
  }
}
