/**
 * bookMetadataHelper.ts
 * High-performance, low-memory metadata & original cover extractor for large batches (+500 books).
 * Extracts original covers from EPUB and PDF without loading entire books into memory.
 */
import JSZip from 'jszip';
import { PdfDocumentModel } from './pdf/PdfDocument';

export interface CleanedBookMetadata {
  title: string;
  author: string;
  description: string;
  coverUrl?: string;
  coverType?: string;
  coverSource?: 'metadata' | 'first-page' | 'generated' | 'fallback';
  totalPages?: number;
  totalChapters?: number;
}

/**
 * Intelligent cleaner for book titles, authors and descriptions.
 * Cleans filenames with noise like "[Docero]", "(Z-Library)", leading ISBNs, etc.
 */
export function cleanBookMetadata(
  fileName: string,
  rawTitle?: string,
  rawAuthor?: string,
  rawDesc?: string,
  format?: string
): { title: string; author: string; description: string } {
  // 1. Remove extension
  let cleanName = fileName.replace(/\.[^/.]+$/, '').trim();

  // 2. Remove common distribution watermarks and tags
  cleanName = cleanName
    .replace(/\[\s*(docero(\.com(\.br)?)?|z-library|z-lib\.org|lelivros|livraria|pdf|epub|mobi|cbz|cbr|pt-br|br|eng|portugues|completo)\s*\]/gi, '')
    .replace(/\(\s*(docero(\.com(\.br)?)?|z-library|z-lib\.org|lelivros|livraria|1|2|3|4|5|pdf|epub)\s*\)/gi, '')
    .replace(/(https?:\/\/)?(www\.)?[a-zA-Z0-9-]+\.(com|org|net|br|me)(\/[^\s]+)?/gi, '')
    .replace(/^\d{10,13}\s*[-_]?\s*/, '') // Remove ISBN prefix (e.g. 97885...)
    .replace(/^\d{1,4}\s*[-_]\s*/, '') // Remove track prefix (e.g. 01 - ...)
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let detectedTitle = cleanName;
  let detectedAuthor = 'Autor Desconhecido';

  // Check if filename has Author - Title pattern
  if (cleanName.includes(' - ')) {
    const parts = cleanName.split(' - ').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      detectedAuthor = parts[0];
      detectedTitle = parts.slice(1).join(' - ');
    }
  } else if (/ por /i.test(cleanName)) {
    const parts = cleanName.split(/ por /i);
    detectedTitle = parts[0].trim();
    detectedAuthor = parts[1].trim();
  } else if (/ by /i.test(cleanName)) {
    const parts = cleanName.split(/ by /i);
    detectedTitle = parts[0].trim();
    detectedAuthor = parts[1].trim();
  }

  // Use rawTitle if valid and not a placeholder
  let finalTitle = detectedTitle;
  if (rawTitle && rawTitle.trim()) {
    const t = rawTitle.trim();
    const isGeneric = /^(untitled|sem t[ií]tulo|microsoft word|documento|scan|livro|document|arquivo)/i.test(t);
    if (!isGeneric && t.length > 1) {
      finalTitle = t;
    }
  }

  // Use rawAuthor if valid
  let finalAuthor = detectedAuthor;
  if (rawAuthor && rawAuthor.trim()) {
    const a = rawAuthor.trim();
    const isGeneric = /^(unknown|desconhecido|admin|autor desconhecido|anonymous|user|scan|autor)/i.test(a);
    if (!isGeneric && a.length > 1) {
      finalAuthor = a;
    }
  }

  // Clean description (remove HTML markup, decode entities)
  let finalDesc = '';
  if (rawDesc && rawDesc.trim()) {
    finalDesc = rawDesc
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (!finalDesc || finalDesc.length < 10) {
    const fmt = (format || 'livro').toUpperCase();
    finalDesc = `Livro digital em formato ${fmt} importado para a Biblioteca do ALTTO. Obra preservada para leitura, estudo e anotações.`;
  }

  return {
    title: finalTitle || 'Livro Sem Título',
    author: finalAuthor || 'Autor Desconhecido',
    description: finalDesc,
  };
}

/**
 * Generate a high-aesthetic typographic book cover SVG when original image is missing.
 */
export function generateTypographicCover(title: string, author: string, format: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }

  const palettes = [
    { start: '#5B4382', end: '#30224A', accent: '#D4C5F9' }, // Deep Lilac
    { start: '#2E5A88', end: '#172C42', accent: '#B8DBFF' }, // Midnight Blue
    { start: '#3D6B5A', end: '#1E362D', accent: '#C1E7D8' }, // Sage Forest
    { start: '#8A5338', end: '#452618', accent: '#F5D3B8' }, // Amber Leather
    { start: '#6A3E63', end: '#381C33', accent: '#F0CBEA' }, // Plum Velvet
    { start: '#425466', end: '#232D37', accent: '#D2DEE8' }, // Slate Charcoal
  ];
  const p = palettes[Math.abs(hash) % palettes.length];

  const escapeXml = (unsafe: string) =>
    unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const safeTitle = escapeXml(title.slice(0, 50));
  const safeAuthor = escapeXml(author.slice(0, 35));
  const safeFormat = escapeXml(format.toUpperCase());

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" width="300" height="420">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${p.start}"/>
        <stop offset="100%" stop-color="${p.end}"/>
      </linearGradient>
      <linearGradient id="spine" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.35"/>
        <stop offset="40%" stop-color="#ffffff" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="300" height="420" fill="url(#bg)"/>
    <rect x="0" y="0" width="22" height="420" fill="url(#spine)"/>
    
    <!-- Border Frame -->
    <rect x="24" y="24" width="252" height="372" fill="none" stroke="${p.accent}" stroke-opacity="0.3" stroke-width="1.5" rx="4"/>
    <rect x="28" y="28" width="244" height="364" fill="none" stroke="${p.accent}" stroke-opacity="0.15" stroke-width="0.8" rx="2"/>
    
    <!-- Badge -->
    <rect x="36" y="38" width="54" height="18" rx="4" fill="${p.accent}" fill-opacity="0.2"/>
    <text x="63" y="50" font-family="system-ui, sans-serif" font-size="9" font-weight="bold" fill="${p.accent}" text-anchor="middle" letter-spacing="1.5">${safeFormat}</text>

    <!-- Book Emblem Icon -->
    <circle cx="150" cy="120" r="28" fill="${p.accent}" fill-opacity="0.15"/>
    <path d="M140 112 C145 110, 155 110, 160 112 M140 120 C145 118, 155 118, 160 120 M140 128 C145 126, 155 126, 160 128" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>

    <!-- Title -->
    <text x="150" y="195" font-family="'Cinzel', 'Playfair Display', Georgia, serif" font-size="19" font-weight="bold" fill="#ffffff" text-anchor="middle" width="220">
      ${safeTitle.length > 25 ? safeTitle.slice(0, 24) + '...' : safeTitle}
    </text>
    ${
      safeTitle.length > 25
        ? `<text x="150" y="222" font-family="'Cinzel', 'Playfair Display', Georgia, serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">
             ${safeTitle.slice(24, 50)}
           </text>`
        : ''
    }

    <!-- Divider Line -->
    <line x1="110" y1="260" x2="190" y2="260" stroke="${p.accent}" stroke-opacity="0.4" stroke-width="1.5" stroke-linecap="round"/>

    <!-- Author -->
    <text x="150" y="295" font-family="system-ui, sans-serif" font-size="12" font-weight="500" fill="${p.accent}" text-anchor="middle" letter-spacing="0.5">
      ${safeAuthor}
    </text>

    <!-- Footer Seal -->
    <text x="150" y="372" font-family="system-ui, sans-serif" font-size="8" font-weight="600" fill="#ffffff" fill-opacity="0.4" text-anchor="middle" letter-spacing="2">
      ALTTO • BIBLIOTECA
    </text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Rigorously checks if a cover URL is a valid, displayable image.
 */
export function isCoverValid(coverUrl?: string | null): boolean {
  if (!coverUrl || typeof coverUrl !== 'string') return false;
  const trimmed = coverUrl.trim();
  if (trimmed === '' || trimmed === 'about:blank') return false;

  // SVG Data URL is always valid if not empty
  if (trimmed.startsWith('data:image/svg+xml')) {
    return trimmed.length > 40;
  }

  // Blob or regular URL
  if (trimmed.startsWith('blob:') || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
    return true;
  }

  if (trimmed.startsWith('data:image/')) {
    // Only detect HTML error files disguised as images
    if (
      trimmed.includes(';base64,PCFE') || // <!DO
      trimmed.includes(';base64,PGh0') || // <ht
      trimmed.includes(';base64,PGh0bW') || // <htm
      trimmed.includes(';base64,PDwh') // <!
    ) {
      return false;
    }
    return trimmed.length > 50;
  }

  return true;
}

/**
 * Asynchronously checks if an image URL (data: or http:) renders as a blank white/empty image.
 * Uses a tiny 32x42 offscreen canvas to sample pixels in under 2ms.
 */
export function isCoverImageBlank(coverUrl?: string | null): Promise<boolean> {
  return new Promise((resolve) => {
    if (!coverUrl || typeof coverUrl !== 'string') return resolve(true);
    const trimmed = coverUrl.trim();
    if (trimmed.length < 50 || trimmed === 'about:blank') return resolve(true);

    // SVG covers generated by our system are rich in colors/gradients and never blank
    if (trimmed.startsWith('data:image/svg+xml')) {
      return resolve(false);
    }

    if (typeof document === 'undefined') {
      return resolve(false);
    }

    const img = new Image();
    const timer = setTimeout(() => {
      resolve(false);
    }, 1200);

    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 42;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return resolve(false);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 32, 42);
        ctx.drawImage(img, 0, 0, 32, 42);

        const imgData = ctx.getImageData(0, 0, 32, 42);
        const data = imgData.data;
        let nonWhite = 0;
        const total = 32 * 42;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // A pixel is non-white if it has ink/darkness/color
          if (r < 236 || g < 236 || b < 236) {
            nonWhite++;
          }
        }

        canvas.width = 0;
        canvas.height = 0;

        // Only if there is strictly zero ink/content is it blank
        if (nonWhite === 0) {
          resolve(true);
        } else {
          resolve(false);
        }
      } catch {
        resolve(false);
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      resolve(true); // Image failed to load or corrupt -> mark as blank/broken so it can be restored
    };

    img.src = trimmed;
  });
}

/**
 * Ultra-fast, zero-bloat EPUB metadata & cover extractor.
 */
export async function fastExtractEpub(
  fileOrBuffer: File | ArrayBuffer
): Promise<CleanedBookMetadata> {
  let zip: JSZip | null = null;
  const fileName = fileOrBuffer instanceof File ? fileOrBuffer.name : 'livro.epub';
  try {
    const arrayBuffer =
      fileOrBuffer instanceof ArrayBuffer
        ? fileOrBuffer
        : await fileOrBuffer.arrayBuffer();
    zip = await JSZip.loadAsync(arrayBuffer);

    // Locate OPF package file
    let opfPath = '';
    const containerEntry =
      zip.files['META-INF/container.xml'] ||
      Object.values(zip.files).find((f) => f.name.toLowerCase() === 'meta-inf/container.xml');

    if (containerEntry) {
      const containerXml = await containerEntry.async('text');
      const m = containerXml.match(/full-path=["']([^"']+)["']/i);
      if (m) opfPath = m[1].replace(/^\/+/, '');
    }
    if (!opfPath) {
      const anyOpf = Object.keys(zip.files).find((fn) => fn.toLowerCase().endsWith('.opf'));
      if (anyOpf) opfPath = anyOpf;
    }

    let rawTitle = '';
    let rawAuthor = '';
    let rawDescription = '';
    let coverUrl = '';
    let coverType = 'image/jpeg';
    let coverSource: CleanedBookMetadata['coverSource'] = 'fallback';
    let totalChapters = 1;

    if (opfPath && zip.files[opfPath]) {
      const opfXml = await zip.files[opfPath].async('text');
      const baseDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
      let coverHref = '';

      if (typeof DOMParser !== 'undefined') {
        try {
          const parser = new DOMParser();
          const opfDoc = parser.parseFromString(opfXml, 'application/xml');

          // Metadata
          const titleEl = opfDoc.querySelector('title') || opfDoc.getElementsByTagNameNS('*', 'title')[0];
          if (titleEl?.textContent) rawTitle = titleEl.textContent.trim();

          const creatorEl = opfDoc.querySelector('creator') || opfDoc.getElementsByTagNameNS('*', 'creator')[0];
          if (creatorEl?.textContent) rawAuthor = creatorEl.textContent.trim();

          const descEl = opfDoc.querySelector('description') || opfDoc.getElementsByTagNameNS('*', 'description')[0];
          if (descEl?.textContent) rawDescription = descEl.textContent.trim();

          const spineItems = opfDoc.querySelectorAll('itemref');
          totalChapters = spineItems.length || 1;

          // Strategy 1: <meta name="cover" content="some-id" />
          const metaCover = opfDoc.querySelector('meta[name="cover"]');
          if (metaCover) {
            const coverId = metaCover.getAttribute('content');
            if (coverId) {
              const item = opfDoc.getElementById(coverId) || opfDoc.querySelector(`item[id="${coverId}"]`);
              if (item) coverHref = item.getAttribute('href') || '';
            }
          }

          // Strategy 2: <item properties="cover-image" ...>
          if (!coverHref) {
            const item = opfDoc.querySelector('item[properties*="cover-image"]');
            if (item) coverHref = item.getAttribute('href') || '';
          }

          // Strategy 3: Item with id or href matching cover / capa
          if (!coverHref) {
            const items = Array.from(opfDoc.querySelectorAll('item'));
            const found = items.find((it) => {
              const id = (it.getAttribute('id') || '').toLowerCase();
              const href = (it.getAttribute('href') || '').toLowerCase();
              const type = (it.getAttribute('media-type') || '').toLowerCase();
              return (
                type.startsWith('image/') &&
                (id.includes('cover') || id.includes('capa') || href.includes('cover') || href.includes('capa'))
              );
            });
            if (found) coverHref = found.getAttribute('href') || '';
          }
        } catch {
          // fallback to regex parsing below
        }
      }

      // Regex Fallback (works in all environments & with malformed XML)
      if (!rawTitle) {
        const m = opfXml.match(/<(?:dc:)?title[^>]*>([^<]+)<\/(?:dc:)?title>/i);
        if (m) rawTitle = m[1].trim();
      }
      if (!rawAuthor) {
        const m = opfXml.match(/<(?:dc:)?creator[^>]*>([^<]+)<\/(?:dc:)?creator>/i);
        if (m) rawAuthor = m[1].trim();
      }
      if (!rawDescription) {
        const m = opfXml.match(/<(?:dc:)?description[^>]*>([^<]+)<\/(?:dc:)?description>/i);
        if (m) rawDescription = m[1].trim();
      }
      if (!coverHref) {
        const mCover = opfXml.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i) ||
                       opfXml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']cover["']/i);
        if (mCover) {
          const coverId = mCover[1];
          const itemRegex = new RegExp(`<item[^>]+id=["']${coverId}["'][^>]+href=["']([^"']+)["']`, 'i');
          const mItem = opfXml.match(itemRegex);
          if (mItem) coverHref = mItem[1];
        }
      }
      if (!coverHref) {
        const mProp = opfXml.match(/<item[^>]+properties=["'][^"']*cover-image[^"']*["'][^>]+href=["']([^"']+)["']/i) ||
                      opfXml.match(/<item[^>]+href=["']([^"']+)["'][^>]+properties=["'][^"']*cover-image[^"']*["']/i);
        if (mProp) coverHref = mProp[1];
      }
      if (!coverHref) {
        const mImg = opfXml.match(/<item[^>]+href=["']([^"']*(?:cover|capa)[^"']*\.(?:jpe?g|png|webp|gif))["']/i);
        if (mImg) coverHref = mImg[1];
      }

      if (!coverHref) {
        const mGuide = opfXml.match(/<reference[^>]+type=["']cover["'][^>]+href=["']([^"']+)["']/i) ||
                       opfXml.match(/<reference[^>]+href=["']([^"']+)["'][^>]+type=["']cover["']/i);
        if (mGuide) coverHref = mGuide[1];
      }
      if (!coverHref) {
        const mItemId = opfXml.match(/<item[^>]+id=["'][^"']*(?:cover|capa|portada)[^"']*["'][^>]+href=["']([^"']+)["']/i) ||
                        opfXml.match(/<item[^>]+href=["']([^"']+)["'][^>]+id=["'][^"']*(?:cover|capa|portada)[^"']*["']/i);
        if (mItemId) coverHref = mItemId[1];
      }

      let fileEntry: JSZip.JSZipObject | undefined;

      // Read cover image candidate
      if (coverHref) {
        const cleanHref = decodeURIComponent(coverHref.split('#')[0].split('?')[0]);
        const fullCoverPath = (baseDir + cleanHref)
          .replace(/^\/+/, '')
          .replace(/\/\.\//g, '/')
          .replace(/[^\/]+\/\.\.\//g, '');

        fileEntry = zip.files[fullCoverPath];
        if (!fileEntry) {
          fileEntry = Object.values(zip.files).find(
            (f) =>
              f.name.toLowerCase() === fullCoverPath.toLowerCase() ||
              f.name.toLowerCase().endsWith(cleanHref.toLowerCase())
          );
        }

        // Check if coverHref was an XHTML/HTML page containing the real image
        if (
          fileEntry &&
          (/\.(x?html?|xml)$/i.test(fileEntry.name) || !/\.(jpe?g|png|webp|gif|avif)$/i.test(fileEntry.name))
        ) {
          try {
            const htmlText = await fileEntry.async('text');
            // Matches both <img> and SVG <image ... xlink:href="..." or href="...">
            const imgMatch = htmlText.match(/<(?:img|image)[\s\S]*?(?:xlink:href|src|href)=["']([^"']+)["']/i);
            if (imgMatch && imgMatch[1]) {
              const relPath = decodeURIComponent(imgMatch[1].split('#')[0].split('?')[0]);
              const htmlDir = fullCoverPath.includes('/')
                ? fullCoverPath.substring(0, fullCoverPath.lastIndexOf('/') + 1)
                : '';
              const resolvedImg = (htmlDir + relPath)
                .replace(/^\/+/, '')
                .replace(/\/\.\//g, '/')
                .replace(/[^\/]+\/\.\.\//g, '');
              const realImgEntry =
                zip.files[resolvedImg] ||
                Object.values(zip.files).find(
                  (f) =>
                    f.name.toLowerCase() === resolvedImg.toLowerCase() ||
                    f.name.toLowerCase().endsWith(relPath.toLowerCase())
                );
              if (realImgEntry && /\.(jpe?g|png|webp|gif|avif)$/i.test(realImgEntry.name)) {
                fileEntry = realImgEntry;
              } else {
                fileEntry = undefined;
              }
            } else {
              fileEntry = undefined;
            }
          } catch {
            fileEntry = undefined;
          }
        }
      }

      // Strategy 4: Deep scan of archive images with name & size heuristics
      if (!fileEntry || !/\.(jpe?g|png|webp|gif|avif)$/i.test(fileEntry.name)) {
        const allImages = Object.values(zip.files).filter(
          (f) => !f.dir && /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name)
        );
        if (allImages.length > 0) {
          // 1. Explicit cover names
          const coverMatch = allImages.find((f) => /cover|capa|portada/i.test(f.name));
          if (coverMatch) {
            fileEntry = coverMatch;
          } else {
            // 2. Front, titlepage, page_1, jacket
            const titleMatch = allImages.find((f) => /title|front|jacket|p001|page_?1/i.test(f.name));
            if (titleMatch) {
              fileEntry = titleMatch;
            } else {
              // 3. Sort by estimated uncompressed file size (the cover is almost always the largest image)
              const sortedBySize = [...allImages].sort((a: any, b: any) => {
                const sizeA = a._data?.uncompressedSize || a._data?.compressedSize || 0;
                const sizeB = b._data?.uncompressedSize || b._data?.compressedSize || 0;
                return sizeB - sizeA;
              });
              fileEntry = sortedBySize[0];
            }
          }
        }
      }

      if (fileEntry && /\.(jpe?g|png|webp|gif|avif)$/i.test(fileEntry.name)) {
        try {
          const base64 = await fileEntry.async('base64');
          const ext = fileEntry.name.split('.').pop()?.toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          const candidateUrl = `data:${mime};base64,${base64}`;
          if (isCoverValid(candidateUrl)) {
            coverUrl = candidateUrl;
            coverType = mime;
            coverSource = 'metadata';
          }
        } catch (e) {
          console.warn('Falha ao decodificar imagem de capa do EPUB:', e);
        }
      }
    }

    const cleaned = cleanBookMetadata(fileName, rawTitle, rawAuthor, rawDescription, 'epub');

    if (!isCoverValid(coverUrl)) {
      coverUrl = generateTypographicCover(cleaned.title, cleaned.author, 'epub');
      coverType = 'image/svg+xml';
      coverSource = 'generated';
    }

    return {
      title: cleaned.title,
      author: cleaned.author,
      description: cleaned.description,
      coverUrl,
      coverType,
      coverSource,
      totalPages: Math.max(15, totalChapters * 15),
      totalChapters,
    };
  } catch (err) {
    console.warn('Erro na extração de EPUB:', err);
    const cleaned = cleanBookMetadata(fileName, undefined, undefined, undefined, 'epub');
    const coverUrl = generateTypographicCover(cleaned.title, cleaned.author, 'epub');
    return {
      title: cleaned.title,
      author: cleaned.author,
      description: cleaned.description,
      coverUrl,
      coverType: 'image/svg+xml',
      coverSource: 'generated',
      totalPages: 15,
      totalChapters: 1,
    };
  } finally {
    zip = null;
  }
}

/**
 * Ultra-fast PDF metadata & cover extractor with strict timeout.
 */
export async function fastExtractPdf(
  fileOrBuffer: File | ArrayBuffer
): Promise<CleanedBookMetadata> {
  let pdfDoc: PdfDocumentModel | null = null;
  const fileName = fileOrBuffer instanceof File ? fileOrBuffer.name : 'documento.pdf';
  try {
    const arrayBuffer =
      fileOrBuffer instanceof ArrayBuffer
        ? fileOrBuffer
        : await fileOrBuffer.arrayBuffer();
    pdfDoc = new PdfDocumentModel();

    const loadPromise = pdfDoc.load(arrayBuffer);
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('PDF_LOAD_TIMEOUT')), 6000)
    );
    const meta = (await Promise.race([loadPromise, timeoutPromise])) as any;

    let rawTitle = meta?.title;
    let rawAuthor = meta?.author;
    let totalPages = meta?.totalPages || 1;
    let coverUrl = '';
    let coverSource: CleanedBookMetadata['coverSource'] = 'first-page';
    let coverType = 'image/jpeg';

    try {
      // Memory-optimized cover search:
      // Try page 1 first at compact 220px. If rich in content (cover page), stop immediately!
      // Only inspect page 2 or 3 if previous pages were flyleaves/blank.
      const maxPagesToCheck = Math.min(3, totalPages);
      let bestCandidate: { dataUrl: string; nonWhiteRatio: number } | null = null;

      for (let pNum = 1; pNum <= maxPagesToCheck; pNum++) {
        try {
          const renderPromise = pdfDoc.renderPageToDataUrl(pNum, 220, 0.72);
          const renderTimeout = new Promise<{ dataUrl: string; isBlank: boolean; nonWhiteRatio?: number }>(
            (_, reject) => setTimeout(() => reject(new Error('PDF_RENDER_TIMEOUT')), 3500)
          );
          const res = await Promise.race([renderPromise, renderTimeout]);
          if (res && res.dataUrl && isCoverValid(res.dataUrl)) {
            const ratio = res.nonWhiteRatio ?? (res.isBlank ? 0 : 0.1);
            if (!bestCandidate || ratio > bestCandidate.nonWhiteRatio) {
              bestCandidate = { dataUrl: res.dataUrl, nonWhiteRatio: ratio };
            }
            // If page has substantial ink/artwork (> 3%), it's the cover! Stop scanning further pages.
            if (!res.isBlank && ratio >= 0.03) {
              break;
            }
          }
        } catch {
          // continue checking next candidate page if any
        }
      }

      if (bestCandidate && bestCandidate.dataUrl) {
        coverUrl = bestCandidate.dataUrl;
        coverType = 'image/jpeg';
        coverSource = 'first-page';
      }
    } catch {
      // Cover timeout or render failure: continue gracefully
    }

    const cleaned = cleanBookMetadata(fileName, rawTitle, rawAuthor, undefined, 'pdf');
    if (!isCoverValid(coverUrl)) {
      coverUrl = generateTypographicCover(cleaned.title, cleaned.author, 'pdf');
      coverType = 'image/svg+xml';
      coverSource = 'generated';
    }

    return {
      title: cleaned.title,
      author: cleaned.author,
      description: cleaned.description,
      coverUrl,
      coverType,
      coverSource,
      totalPages: Math.max(1, totalPages),
      totalChapters: 1,
    };
  } catch (err) {
    console.warn(`Erro na leitura de metadados do PDF (${fileName}):`, err);
    const cleaned = cleanBookMetadata(fileName, undefined, undefined, undefined, 'pdf');
    const coverUrl = generateTypographicCover(cleaned.title, cleaned.author, 'pdf');
    return {
      title: cleaned.title,
      author: cleaned.author,
      description: cleaned.description,
      coverUrl,
      coverType: 'image/svg+xml',
      coverSource: 'generated',
      totalPages: 1,
      totalChapters: 1,
    };
  } finally {
    if (pdfDoc) {
      try {
        pdfDoc.cleanup();
      } catch {}
      pdfDoc = null;
    }
  }
}

/**
 * Fast CBZ / CBR comic cover extractor.
 */
export async function fastExtractCbz(
  fileOrBuffer: File | ArrayBuffer
): Promise<CleanedBookMetadata> {
  let zip: JSZip | null = null;
  const fileName = fileOrBuffer instanceof File ? fileOrBuffer.name : 'quadrinho.cbz';
  try {
    const arrayBuffer =
      fileOrBuffer instanceof ArrayBuffer
        ? fileOrBuffer
        : await fileOrBuffer.arrayBuffer();
    const loadedZip = await JSZip.loadAsync(arrayBuffer);
    zip = loadedZip;

    const imageFiles = Object.keys(loadedZip.files)
      .filter((fn) => /\.(jpe?g|png|webp|gif)$/i.test(fn) && !loadedZip.files[fn].dir)
      .sort();

    let coverUrl = '';
    let coverType = 'image/jpeg';
    let coverSource: CleanedBookMetadata['coverSource'] = 'first-page';

    if (imageFiles.length > 0) {
      const first = imageFiles[0];
      const base64 = await loadedZip.files[first].async('base64');
      const ext = first.split('.').pop()?.toLowerCase();
      coverType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const candidate = `data:${coverType};base64,${base64}`;
      if (isCoverValid(candidate)) {
        coverUrl = candidate;
        coverSource = 'first-page';
      }
    }

    const cleaned = cleanBookMetadata(fileName, undefined, undefined, undefined, 'cbz');
    if (!isCoverValid(coverUrl)) {
      coverUrl = generateTypographicCover(cleaned.title, cleaned.author, 'cbz');
      coverType = 'image/svg+xml';
      coverSource = 'generated';
    }

    return {
      title: cleaned.title,
      author: cleaned.author,
      description: cleaned.description,
      coverUrl,
      coverType,
      coverSource,
      totalPages: Math.max(1, imageFiles.length),
      totalChapters: 1,
    };
  } catch (err) {
    console.warn('Erro ao processar CBZ:', err);
    const cleaned = cleanBookMetadata(fileName, undefined, undefined, undefined, 'cbz');
    return {
      title: cleaned.title,
      author: cleaned.author,
      description: cleaned.description,
      totalPages: 10,
      totalChapters: 1,
    };
  } finally {
    zip = null;
  }
}
