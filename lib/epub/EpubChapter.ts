/**
 * EpubChapter.ts
 * Loads, sanitizes, rewrites images/links, and prepares an EPUB chapter for reflowable DOM display.
 */
import { EpubSpineItem } from './EpubTypes';
import { EpubBook } from './EpubBook';
import { EpubSpine } from './EpubSpine';

export interface LoadedChapter {
  index: number;
  id: string;
  title: string;
  html: string;
  rawText: string;
}

export class EpubChapter {
  public item: EpubSpineItem;
  private book: EpubBook;
  private spine: EpubSpine;
  private domParser: DOMParser;

  constructor(item: EpubSpineItem, book: EpubBook, spine: EpubSpine) {
    this.item = item;
    this.book = book;
    this.spine = spine;
    this.domParser = new DOMParser();
  }

  public async load(): Promise<LoadedChapter> {
    const rawXhtml = await this.book.getFileText(this.item.fullPath);
    if (!rawXhtml) {
      return {
        index: this.item.index,
        id: this.item.id,
        title: `Capítulo ${this.item.index + 1}`,
        html: `<div class="p-6 text-center text-slate-500 italic">Capítulo vazio ou sem conteúdo de texto.</div>`,
        rawText: '',
      };
    }

    const doc = this.domParser.parseFromString(rawXhtml, 'text/html');

    // 1. Sanitize scripts, iframes, and dangerous handlers
    const dangerousElements = doc.querySelectorAll('script, iframe, object, embed');
    dangerousElements.forEach((el) => el.remove());

    const allElements = doc.querySelectorAll('*');
    for (const el of Array.from(allElements)) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
      }
    }

    // 2. Extract Title
    let title = '';
    const h1 = doc.querySelector('h1, h2, h3');
    if (h1 && h1.textContent?.trim()) {
      title = h1.textContent.trim();
    } else {
      const docTitle = doc.querySelector('title');
      if (docTitle && docTitle.textContent?.trim()) {
        title = docTitle.textContent.trim();
      }
    }

    const tocMatch = this.findTocTitle(this.item.fullPath);
    if (tocMatch) {
      title = tocMatch;
    }
    if (!title) {
      title = `Capítulo ${this.item.index + 1}`;
    }

    // 3. Resolve and rewrite images
    const images = Array.from(doc.querySelectorAll('img, image'));
    for (const img of images) {
      let src = img.getAttribute('src');
      let isXlink = false;
      if (!src) {
        src = img.getAttribute('xlink:href') || img.getAttribute('href');
        isXlink = true;
      }

      if (src && !src.startsWith('data:') && !src.startsWith('http')) {
        const resolvedImagePath = this.book.resolvePath(this.item.fullPath, src);
        try {
          const dataUrl = await this.book.getFileDataUrl(resolvedImagePath);
          if (dataUrl) {
            if (isXlink) {
              img.setAttribute('xlink:href', dataUrl);
              img.setAttribute('href', dataUrl);
            } else {
              img.setAttribute('src', dataUrl);
            }
          }
        } catch (err) {
          console.warn(`Imagem não encontrada no EPUB: ${resolvedImagePath}`, err);
        }
      }

      img.classList.add('max-w-full', 'h-auto', 'my-4', 'rounded-lg', 'mx-auto', 'block');
      img.removeAttribute('width');
      img.removeAttribute('height');
    }

    // 4. Rewrite internal and external links
    const links = Array.from(doc.querySelectorAll('a'));
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;

      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
        link.classList.add('text-amber-500', 'hover:underline');
      } else if (href.startsWith('#')) {
        const anchor = href.substring(1);
        link.setAttribute('data-epub-anchor', anchor);
        link.setAttribute('data-chapter-index', this.item.index.toString());
        link.setAttribute('href', 'javascript:void(0);');
        link.classList.add('epub-internal-link', 'text-amber-500', 'hover:underline', 'font-medium');
      } else {
        const [targetPath, anchor] = href.split('#');
        const resolvedPath = this.book.resolvePath(this.item.fullPath, targetPath);
        const match = this.spine.findByPath(resolvedPath);
        if (match) {
          link.setAttribute('data-chapter-index', match.index.toString());
          if (anchor) link.setAttribute('data-epub-anchor', anchor);
          link.setAttribute('href', 'javascript:void(0);');
          link.classList.add('epub-internal-link', 'text-amber-500', 'hover:underline', 'font-medium');
        }
      }
    }

    const body = doc.body;
    const rawText = body.textContent || '';
    const innerHtml = body.innerHTML;

    return {
      index: this.item.index,
      id: this.item.id,
      title,
      html: innerHtml,
      rawText,
    };
  }

  private findTocTitle(fullPath: string): string | null {
    const searchToc = (items: typeof this.book.tocItems): string | null => {
      for (const it of items) {
        if (it.fullPath === fullPath || fullPath.endsWith(it.fullPath)) {
          return it.label;
        }
        if (it.subitems && it.subitems.length > 0) {
          const found = searchToc(it.subitems);
          if (found) return found;
        }
      }
      return null;
    };
    return searchToc(this.book.tocItems);
  }
}
