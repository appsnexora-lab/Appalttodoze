/**
 * EpubBook.ts
 * Manages the loaded EPUB book instance, resource resolution, and object URL lifecycle.
 */
import JSZip from 'jszip';
import {
  EpubMetadata,
  EpubManifestItem,
  EpubSpineItem,
  EpubTocItem,
} from './EpubTypes';
import { EpubParser, ParsedEpubPackage } from './EpubParser';

export class EpubBook {
  public zip: JSZip;
  public metadata: EpubMetadata;
  public manifest: Map<string, EpubManifestItem>;
  public manifestByFullPath: Map<string, EpubManifestItem>;
  public spineItems: EpubSpineItem[];
  public tocItems: EpubTocItem[];
  public baseDir: string;
  public opfPath: string;
  public coverItem?: EpubManifestItem;

  private objectUrls: Set<string> = new Set();
  private blobCache: Map<string, Blob> = new Map();
  private dataUrlCache: Map<string, string> = new Map();

  constructor(zip: JSZip, parsed: ParsedEpubPackage) {
    this.zip = zip;
    this.metadata = parsed.metadata;
    this.manifest = parsed.manifest;
    this.manifestByFullPath = parsed.manifestByFullPath;
    this.spineItems = parsed.spineItems;
    this.tocItems = parsed.tocItems;
    this.baseDir = parsed.baseDir;
    this.opfPath = parsed.opfPath;
    this.coverItem = parsed.coverItem;
  }

  public static async open(buffer: ArrayBuffer): Promise<EpubBook> {
    if (!buffer || buffer.byteLength === 0) {
      throw new Error('EPUB inválido: buffer vazio ou não inicializado.');
    }
    const zip = await JSZip.loadAsync(buffer);
    const parser = new EpubParser(zip);
    const parsed = await parser.parse();
    const book = new EpubBook(zip, parsed);

    try {
      const coverUrl = await book.getCoverDataUrl();
      if (coverUrl) {
        book.metadata.coverDataUrl = coverUrl;
      }
    } catch (err) {
      console.warn('Não foi possível extrair capa do EPUB:', err);
    }

    return book;
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

  public async getFileBlob(fullPath: string, mimeType?: string): Promise<Blob | null> {
    const clean = fullPath.replace(/^\/+/, '').trim();
    if (this.blobCache.has(clean)) {
      return this.blobCache.get(clean)!;
    }

    let file = this.zip.files[clean];
    if (!file) {
      const match = Object.keys(this.zip.files).find((k) => k.toLowerCase() === clean.toLowerCase());
      if (match) file = this.zip.files[match];
    }
    if (!file || file.dir) return null;

    const detectedMime = mimeType || this.getMimeTypeForPath(clean);
    const arrayBuffer = await file.async('arraybuffer');
    const blob = new Blob([arrayBuffer], { type: detectedMime });
    this.blobCache.set(clean, blob);
    return blob;
  }

  public async getFileDataUrl(fullPath: string): Promise<string | null> {
    const clean = fullPath.replace(/^\/+/, '').trim();
    if (this.dataUrlCache.has(clean)) {
      return this.dataUrlCache.get(clean)!;
    }

    let file = this.zip.files[clean];
    if (!file) {
      const match = Object.keys(this.zip.files).find((k) => k.toLowerCase() === clean.toLowerCase());
      if (match) file = this.zip.files[match];
    }
    if (!file || file.dir) return null;

    const mime = this.getMimeTypeForPath(clean);
    const base64 = await file.async('base64');
    const dataUrl = `data:${mime};base64,${base64}`;
    this.dataUrlCache.set(clean, dataUrl);
    return dataUrl;
  }

  public async getFileText(fullPath: string): Promise<string | null> {
    const clean = fullPath.replace(/^\/+/, '').trim();
    let file = this.zip.files[clean];
    if (!file) {
      const match = Object.keys(this.zip.files).find((k) => k.toLowerCase() === clean.toLowerCase());
      if (match) file = this.zip.files[match];
    }
    if (!file || file.dir) return null;

    return await file.async('text');
  }

  public async getCoverBlob(): Promise<Blob | null> {
    if (this.coverItem) {
      return await this.getFileBlob(this.coverItem.fullPath, this.coverItem.mediaType);
    }
    return null;
  }

  public async getCoverDataUrl(): Promise<string | null> {
    if (this.coverItem) {
      const dataUrl = await this.getFileDataUrl(this.coverItem.fullPath);
      if (dataUrl) return dataUrl;
    }
    for (const item of Array.from(this.manifest.values())) {
      if (item.mediaType.startsWith('image/')) {
        const dataUrl = await this.getFileDataUrl(item.fullPath);
        if (dataUrl) return dataUrl;
      }
    }
    for (const fn of Object.keys(this.zip.files)) {
      if (/\.(jpe?g|png|webp)$/i.test(fn) && !this.zip.files[fn].dir) {
        const dataUrl = await this.getFileDataUrl(fn);
        if (dataUrl) return dataUrl;
      }
    }
    return null;
  }

  private getMimeTypeForPath(p: string): string {
    const ext = p.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'svg':
        return 'image/svg+xml';
      case 'xhtml':
      case 'html':
      case 'htm':
        return 'application/xhtml+xml';
      case 'css':
        return 'text/css';
      case 'ncx':
        return 'application/x-dtbncx+xml';
      default:
        return 'application/octet-stream';
    }
  }

  public cleanup(): void {
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();
    this.blobCache.clear();
    this.dataUrlCache.clear();
  }
}
