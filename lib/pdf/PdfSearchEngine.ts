/**
 * PdfSearchEngine.ts
 * Fast in-document text search across real PDF pages with snippet extraction.
 */
import { PdfDocumentModel } from './PdfDocument';

export interface SearchResult {
  pageNumber: number;
  snippet: string;
  matchIndex: number;
}

export class PdfSearchEngine {
  private pdfDocModel: PdfDocumentModel;
  private textCache: Map<number, string> = new Map();
  private isSearching: boolean = false;

  constructor(docModel: PdfDocumentModel) {
    this.pdfDocModel = docModel;
  }

  private normalize(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  async getPageText(pageNumber: number): Promise<string> {
    if (this.textCache.has(pageNumber)) {
      return this.textCache.get(pageNumber)!;
    }
    try {
      const page = await this.pdfDocModel.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageStr = textContent.items
        .map((item: any) => item.str || '')
        .join(' ');
      this.textCache.set(pageNumber, pageStr);
      return pageStr;
    } catch (e) {
      console.warn(`Could not extract text on page ${pageNumber}:`, e);
      return '';
    }
  }

  async search(
    query: string,
    onProgress?: (progressPercent: number) => void
  ): Promise<SearchResult[]> {
    const cleanQuery = this.normalize(query.trim());
    if (!cleanQuery || !this.pdfDocModel.isLoaded || this.pdfDocModel.totalPages <= 0) {
      return [];
    }

    this.isSearching = true;
    const results: SearchResult[] = [];
    const total = this.pdfDocModel.totalPages;

    for (let p = 1; p <= total; p++) {
      if (!this.isSearching) break;
      const rawText = await this.getPageText(p);
      const normText = this.normalize(rawText);
      let startIndex = 0;
      let matchIdx = 0;

      while ((startIndex = normText.indexOf(cleanQuery, startIndex)) !== -1) {
        const snippetStart = Math.max(0, startIndex - 35);
        const snippetEnd = Math.min(rawText.length, startIndex + cleanQuery.length + 35);
        const snippet = '...' + rawText.slice(snippetStart, snippetEnd).trim() + '...';

        results.push({
          pageNumber: p,
          snippet,
          matchIndex: matchIdx++,
        });

        startIndex += cleanQuery.length;
      }

      if (onProgress && p % 5 === 0) {
        onProgress(Math.round((p / total) * 100));
      }
    }

    this.isSearching = false;
    return results;
  }

  async findFirst(
    query: string,
    startPage = 1,
    endPage?: number
  ): Promise<SearchResult | null> {
    const cleanQuery = this.normalize(query.trim());
    if (!cleanQuery || !this.pdfDocModel.isLoaded || this.pdfDocModel.totalPages <= 0) {
      return null;
    }

    const total = this.pdfDocModel.totalPages;
    const maxPage = endPage ? Math.min(total, endPage) : total;
    const minPage = Math.max(1, startPage);

    for (let p = minPage; p <= maxPage; p++) {
      const rawText = await this.getPageText(p);
      const normText = this.normalize(rawText);
      const startIndex = normText.indexOf(cleanQuery);
      if (startIndex !== -1) {
        const snippetStart = Math.max(0, startIndex - 35);
        const snippetEnd = Math.min(rawText.length, startIndex + cleanQuery.length + 35);
        const snippet = '...' + rawText.slice(snippetStart, snippetEnd).trim() + '...';
        return {
          pageNumber: p,
          snippet,
          matchIndex: 0,
        };
      }
    }
    return null;
  }

  cancelSearch(): void {
    this.isSearching = false;
  }

  clearCache(): void {
    this.textCache.clear();
  }
}
