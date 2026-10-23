/**
 * EpubParser.ts
 * Parses EPUB 2 and EPUB 3 containers, OPF packages, NCX/NAV tables of contents,
 * metadata, and spine collections.
 */
import JSZip from 'jszip';
import {
  EpubMetadata,
  EpubManifestItem,
  EpubSpineItem,
  EpubTocItem,
} from './EpubTypes';

export interface ParsedEpubPackage {
  opfPath: string;
  baseDir: string;
  metadata: EpubMetadata;
  manifest: Map<string, EpubManifestItem>;
  manifestByFullPath: Map<string, EpubManifestItem>;
  spineItems: EpubSpineItem[];
  tocItems: EpubTocItem[];
  coverItem?: EpubManifestItem;
}

export class EpubParser {
  private zip: JSZip;
  private domParser: DOMParser;

  constructor(zip: JSZip) {
    this.zip = zip;
    this.domParser = new DOMParser();
  }

  public async parse(): Promise<ParsedEpubPackage> {
    const opfPath = await this.locateOpfPath();
    const baseDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    const opfContent = await this.readZipFileText(opfPath);
    if (!opfContent) {
      throw new Error(`OPF package file not found in EPUB: ${opfPath}`);
    }

    const opfDoc = this.domParser.parseFromString(opfContent, 'application/xml');
    const parserError = opfDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`Invalid OPF XML format: ${parserError.textContent}`);
    }

    const packageEl = opfDoc.querySelector('package');
    const epubVersion = packageEl?.getAttribute('version') || '2.0';

    const metadata = this.parseMetadata(opfDoc, epubVersion);
    const { manifest, manifestByFullPath } = this.parseManifest(opfDoc, baseDir);
    const spineItems = this.parseSpine(opfDoc, manifest);

    const coverItem = await this.findCoverItem(opfDoc, metadata, manifest, baseDir, spineItems);
    if (coverItem) {
      metadata.coverHref = coverItem.fullPath;
    }

    const tocItems = await this.parseTableOfContents(opfDoc, manifest, baseDir, spineItems);

    return {
      opfPath,
      baseDir,
      metadata,
      manifest,
      manifestByFullPath,
      spineItems,
      tocItems,
      coverItem,
    };
  }

  private async locateOpfPath(): Promise<string> {
    const containerXml = await this.readZipFileText('META-INF/container.xml');
    if (!containerXml) {
      const anyOpf = Object.keys(this.zip.files).find((fn) => fn.toLowerCase().endsWith('.opf'));
      if (anyOpf) return anyOpf;
      throw new Error('EPUB inválido: arquivo META-INF/container.xml não encontrado.');
    }

    const doc = this.domParser.parseFromString(containerXml, 'application/xml');
    const rootfile = doc.querySelector('rootfile');
    const fullPath = rootfile?.getAttribute('full-path');

    if (!fullPath) {
      const anyOpf = Object.keys(this.zip.files).find((fn) => fn.toLowerCase().endsWith('.opf'));
      if (anyOpf) return anyOpf;
      throw new Error('EPUB inválido: elemento rootfile não especifica full-path.');
    }

    return this.cleanPath(fullPath);
  }

  private parseMetadata(opfDoc: Document, epubVersion: string): EpubMetadata {
    const metadataEl = opfDoc.querySelector('metadata');

    const getFirstText = (...tags: string[]): string => {
      if (!metadataEl) return '';
      for (const tag of tags) {
        const el =
          metadataEl.querySelector(tag) ||
          Array.from(metadataEl.getElementsByTagName('*')).find(
            (e) => e.localName.toLowerCase() === tag.toLowerCase()
          );
        if (el && el.textContent) {
          const val = el.textContent.trim();
          if (val) return val;
        }
      }
      return '';
    };

    const title = getFirstText('dc\\:title', 'title') || 'Documento EPUB';
    const creator = getFirstText('dc\\:creator', 'creator') || 'Autor Desconhecido';
    const publisher = getFirstText('dc\\:publisher', 'publisher');
    const language = getFirstText('dc\\:language', 'language') || 'pt';
    const description = getFirstText('dc\\:description', 'description');
    const rights = getFirstText('dc\\:rights', 'rights');
    const publicationDate = getFirstText('dc\\:date', 'date');

    return {
      title,
      creator,
      publisher,
      language,
      description,
      rights,
      publicationDate,
      epubVersion,
    };
  }

  private parseManifest(
    opfDoc: Document,
    baseDir: string
  ): {
    manifest: Map<string, EpubManifestItem>;
    manifestByFullPath: Map<string, EpubManifestItem>;
  } {
    const manifest = new Map<string, EpubManifestItem>();
    const manifestByFullPath = new Map<string, EpubManifestItem>();
    const itemElements = Array.from(opfDoc.querySelectorAll('manifest > item'));

    for (const el of itemElements) {
      const id = el.getAttribute('id');
      const href = el.getAttribute('href');
      const mediaType = el.getAttribute('media-type') || 'application/octet-stream';
      const properties = el.getAttribute('properties') || undefined;

      if (id && href) {
        const fullPath = this.resolvePath(baseDir, href);
        const item: EpubManifestItem = {
          id,
          href,
          fullPath,
          mediaType,
          properties,
        };
        manifest.set(id, item);
        manifestByFullPath.set(fullPath, item);
      }
    }

    return { manifest, manifestByFullPath };
  }

  private parseSpine(opfDoc: Document, manifest: Map<string, EpubManifestItem>): EpubSpineItem[] {
    const spineItems: EpubSpineItem[] = [];
    const itemrefs = Array.from(opfDoc.querySelectorAll('spine > itemref'));
    let index = 0;

    for (const ref of itemrefs) {
      const idref = ref.getAttribute('idref');
      const linear = ref.getAttribute('linear') !== 'no';

      if (idref && manifest.has(idref)) {
        const item = manifest.get(idref)!;
        spineItems.push({
          id: `spine-${index}`,
          idref,
          href: item.href,
          fullPath: item.fullPath,
          index,
          linear,
        });
        index++;
      }
    }

    return spineItems;
  }

  private async findCoverItem(
    opfDoc: Document,
    metadata: EpubMetadata,
    manifest: Map<string, EpubManifestItem>,
    _baseDir: string,
    spineItems: EpubSpineItem[]
  ): Promise<EpubManifestItem | undefined> {
    const metaCoverTags = Array.from(opfDoc.querySelectorAll('metadata > meta[name="cover"]'));
    for (const metaCover of metaCoverTags) {
      const coverRef = metaCover.getAttribute('content') || metaCover.getAttribute('value');
      if (coverRef) {
        if (manifest.has(coverRef)) {
          metadata.coverSource = 'metadata';
          return manifest.get(coverRef);
        }
        for (const item of Array.from(manifest.values())) {
          if (
            item.href === coverRef ||
            item.fullPath.endsWith(coverRef) ||
            item.id.toLowerCase() === coverRef.toLowerCase()
          ) {
            metadata.coverSource = 'metadata';
            return item;
          }
        }
      }
    }

    for (const item of Array.from(manifest.values())) {
      if (item.properties && item.properties.split(/\s+/).includes('cover-image')) {
        metadata.coverSource = 'cover-item';
        return item;
      }
    }

    for (const item of Array.from(manifest.values())) {
      if (item.mediaType.startsWith('image/')) {
        const idLower = item.id.toLowerCase();
        const hrefLower = item.href.toLowerCase();
        if (
          idLower === 'cover' ||
          idLower === 'cover-image' ||
          idLower === 'capa' ||
          idLower === 'book-cover' ||
          hrefLower.includes('cover') ||
          hrefLower.includes('capa')
        ) {
          metadata.coverSource = 'manifest';
          return item;
        }
      }
    }

    if (spineItems.length > 0) {
      const firstSpine = spineItems[0];
      const spineHrefLower = firstSpine.href.toLowerCase();
      if (
        spineHrefLower.includes('cover') ||
        spineHrefLower.includes('capa') ||
        spineHrefLower.includes('titlepage')
      ) {
        try {
          const coverHtml = await this.readZipFileText(firstSpine.fullPath);
          if (coverHtml) {
            let src: string | null = null;
            try {
              const doc = this.domParser.parseFromString(coverHtml, 'text/html');
              const imgEl =
                doc.querySelector('img[src]') ||
                doc.querySelector('image[*|href]') ||
                doc.querySelector('image[href]') ||
                doc.querySelector('image[xlink\\:href]');
              if (imgEl) {
                src =
                  imgEl.getAttribute('src') ||
                  imgEl.getAttribute('xlink:href') ||
                  imgEl.getAttribute('href') ||
                  imgEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
              }
            } catch {
              // DOMParser fallback to regex
            }

            if (!src) {
              const match =
                coverHtml.match(/<image[^>]+(?:href|xlink:href)=["']([^"']+)["']/i) ||
                coverHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
              if (match) {
                src = match[1];
              }
            }

            if (src) {
              const imgPath = this.resolvePath(firstSpine.fullPath, src);
              const matched = Array.from(manifest.values()).find(
                (m) => m.fullPath === imgPath || m.href.endsWith(src) || m.href.toLowerCase().endsWith(src.toLowerCase())
              );
              if (matched) {
                metadata.coverSource = 'manifest';
                return matched;
              }
            }
          }
        } catch (e) {
          console.warn('Falha ao inspecionar primeira página de capa:', e);
        }
      }
    }

    const allImages = Array.from(manifest.values()).filter((item) =>
      item.mediaType.startsWith('image/')
    );

    if (allImages.length > 0) {
      const rasterImages = allImages.filter(
        (img) =>
          img.mediaType === 'image/jpeg' ||
          img.mediaType === 'image/jpg' ||
          img.mediaType === 'image/png' ||
          img.mediaType === 'image/webp'
      );
      const candidate = rasterImages[0] || allImages[0];
      if (candidate) {
        metadata.coverSource = 'first-image';
        return candidate;
      }
    }

    return undefined;
  }

  private async parseTableOfContents(
    opfDoc: Document,
    manifest: Map<string, EpubManifestItem>,
    _baseDir: string,
    spineItems: EpubSpineItem[]
  ): Promise<EpubTocItem[]> {
    for (const item of Array.from(manifest.values())) {
      if (item.properties && item.properties.includes('nav')) {
        try {
          const navContent = await this.readZipFileText(item.fullPath);
          if (navContent) {
            const navDir = item.fullPath.includes('/')
              ? item.fullPath.substring(0, item.fullPath.lastIndexOf('/') + 1)
              : '';
            const toc = this.parseEpub3Nav(navContent, navDir, spineItems);
            if (toc.length > 0) return toc;
          }
        } catch (err) {
          console.warn('Erro ao processar NAV EPUB 3, tentando NCX:', err);
        }
      }
    }

    const spineEl = opfDoc.querySelector('spine');
    const tocId = spineEl?.getAttribute('toc');
    let ncxItem: EpubManifestItem | undefined;

    if (tocId && manifest.has(tocId)) {
      ncxItem = manifest.get(tocId);
    } else {
      for (const item of Array.from(manifest.values())) {
        if (
          item.mediaType === 'application/x-dtbncx+xml' ||
          item.fullPath.toLowerCase().endsWith('.ncx')
        ) {
          ncxItem = item;
          break;
        }
      }
    }

    if (ncxItem) {
      try {
        const ncxContent = await this.readZipFileText(ncxItem.fullPath);
        if (ncxContent) {
          const ncxDir = ncxItem.fullPath.includes('/')
            ? ncxItem.fullPath.substring(0, ncxItem.fullPath.lastIndexOf('/') + 1)
            : '';
          const toc = this.parseEpub2Ncx(ncxContent, ncxDir, spineItems);
          if (toc.length > 0) return toc;
        }
      } catch (err) {
        console.warn('Erro ao processar NCX EPUB 2:', err);
      }
    }

    return spineItems.map((item, idx) => ({
      id: `toc-auto-${idx}`,
      label: `Capítulo ${idx + 1}`,
      href: item.href,
      fullPath: item.fullPath,
      chapterIndex: idx,
      subitems: [],
      level: 1,
    }));
  }

  private parseEpub3Nav(navHtml: string, navDir: string, spineItems: EpubSpineItem[]): EpubTocItem[] {
    const doc = this.domParser.parseFromString(navHtml, 'text/html');
    let navEl =
      doc.querySelector('nav[*|type="toc"]') ||
      doc.querySelector('nav[type="toc"]') ||
      doc.querySelector('nav#toc') ||
      doc.querySelector('nav');

    if (!navEl) return [];
    const ol = navEl.querySelector('ol');
    if (!ol) return [];

    const parseList = (olElement: Element, level: number = 1): EpubTocItem[] => {
      const items: EpubTocItem[] = [];
      const liElements = Array.from(olElement.children).filter(
        (c) => c.tagName.toLowerCase() === 'li'
      );

      for (const li of liElements) {
        const a = li.querySelector('a, span');
        const text = a?.textContent?.trim() || 'Seção';
        const rawHref = a?.getAttribute('href') || '';
        const [filePath, anchor] = rawHref.split('#');
        const fullPath = filePath ? this.resolvePath(navDir, filePath) : '';
        const chapterIdx = spineItems.findIndex(
          (sp) => sp.fullPath === fullPath || sp.fullPath.endsWith(filePath)
        );

        let subitems: EpubTocItem[] = [];
        const childOl = li.querySelector('ol');
        if (childOl) {
          subitems = parseList(childOl, level + 1);
        }

        items.push({
          id: `nav-${Math.random().toString(36).substring(2, 8)}`,
          label: text,
          href: rawHref,
          fullPath: fullPath || (chapterIdx >= 0 ? spineItems[chapterIdx].fullPath : ''),
          anchor,
          chapterIndex: chapterIdx >= 0 ? chapterIdx : 0,
          subitems,
          level,
        });
      }
      return items;
    };

    return parseList(ol, 1);
  }

  private parseEpub2Ncx(ncxXml: string, ncxDir: string, spineItems: EpubSpineItem[]): EpubTocItem[] {
    const doc = this.domParser.parseFromString(ncxXml, 'application/xml');
    const navMap = doc.querySelector('navMap');
    if (!navMap) return [];

    const parseNavPoints = (parentElement: Element, level: number = 1): EpubTocItem[] => {
      const items: EpubTocItem[] = [];
      const navPoints = Array.from(parentElement.children).filter(
        (c) => c.localName.toLowerCase() === 'navpoint'
      );

      for (const np of navPoints) {
        const id = np.getAttribute('id') || `ncx-${Math.random().toString(36).substring(2, 7)}`;
        const textEl = np.querySelector('navLabel > text');
        const label = textEl?.textContent?.trim() || 'Capítulo';
        const contentEl = np.querySelector('content');
        const rawSrc = contentEl?.getAttribute('src') || '';
        const [filePath, anchor] = rawSrc.split('#');
        const fullPath = filePath ? this.resolvePath(ncxDir, filePath) : '';
        const chapterIdx = spineItems.findIndex(
          (sp) => sp.fullPath === fullPath || sp.fullPath.endsWith(filePath)
        );

        const subitems = parseNavPoints(np, level + 1);

        items.push({
          id,
          label,
          href: rawSrc,
          fullPath: fullPath || (chapterIdx >= 0 ? spineItems[chapterIdx].fullPath : ''),
          anchor,
          chapterIndex: chapterIdx >= 0 ? chapterIdx : 0,
          subitems,
          level,
        });
      }
      return items;
    };

    return parseNavPoints(navMap, 1);
  }

  public resolvePath(basePath: string, relativePath: string): string {
    if (!relativePath) return basePath;
    if (relativePath.startsWith('/')) return relativePath.substring(1);

    const cleanRelative = relativePath.split('#')[0].split('?')[0];
    const stack = basePath.split('/').filter(Boolean);
    if (stack.length > 0 && !basePath.endsWith('/')) {
      stack.pop();
    }

    const parts = cleanRelative.split('/').filter(Boolean);
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') {
        if (stack.length > 0) stack.pop();
      } else {
        stack.push(part);
      }
    }
    return stack.join('/');
  }

  private cleanPath(p: string): string {
    return p.replace(/^\/+/, '').trim();
  }

  private async readZipFileText(path: string): Promise<string | null> {
    const clean = this.cleanPath(path);
    let file = this.zip.files[clean];
    if (!file) {
      const matchKey = Object.keys(this.zip.files).find(
        (k) => k.toLowerCase() === clean.toLowerCase()
      );
      if (matchKey) file = this.zip.files[matchKey];
    }
    if (!file || file.dir) return null;
    return await file.async('text');
  }
}
