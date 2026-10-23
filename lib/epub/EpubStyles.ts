/**
 * EpubStyles.ts
 * Manages reflowable typography, themes (Light, Sepia, Dark, Night), margins, and line spacing.
 */
import {
  EpubStyleOptions,
  EpubTheme,
  EpubFontFamily,
  EpubContentWidth,
  EpubTextAlign,
} from './EpubTypes';

export type {
  EpubStyleOptions,
  EpubTheme,
  EpubFontFamily,
  EpubContentWidth,
  EpubTextAlign,
};

export interface ThemeConfig {
  name: EpubTheme;
  label: string;
  bg: string;
  text: string;
  border: string;
  cardBg: string;
  accent: string;
  scrollbar: string;
}

export const EPUB_THEMES: Record<EpubTheme, ThemeConfig> = {
  light: {
    name: 'light',
    label: 'Claro (Padrão)',
    bg: '#FFFFFF',
    text: '#29243A',
    border: '#EAE5F4',
    cardBg: '#FAF9FD',
    accent: '#A58ADB',
    scrollbar: '#D7CEC7',
  },
  sepia: {
    name: 'sepia',
    label: 'Sépia',
    bg: '#F4ECD8',
    text: '#3D2F1D',
    border: '#E2D5BE',
    cardBg: '#EFE5CE',
    accent: '#A58ADB',
    scrollbar: '#D6C5A9',
  },
  dark: {
    name: 'dark',
    label: 'Escuro',
    bg: '#181622',
    text: '#EAE5F4',
    border: '#332E47',
    cardBg: '#221F30',
    accent: '#C4B1F0',
    scrollbar: '#374151',
  },
  night: {
    name: 'night',
    label: 'Noturno OLED',
    bg: '#000000',
    text: '#CBD5E1',
    border: '#27272A',
    cardBg: '#09090B',
    accent: '#C4B1F0',
    scrollbar: '#27272A',
  },
};

export const DEFAULT_EPUB_STYLES: EpubStyleOptions = {
  theme: 'light',
  fontSize: 18,
  fontFamily: 'serif',
  lineHeight: 1.65,
  paragraphSpacing: 1.1,
  contentWidth: 'normal',
  textAlign: 'justify',
  marginHorizontal: 20,
};

export function getContentMaxWidth(width: EpubContentWidth): string {
  switch (width) {
    case 'compact':
      return '580px';
    case 'normal':
      return '720px';
    case 'wide':
      return '880px';
    case 'full':
      return '100%';
    default:
      return '720px';
  }
}

export function getFontFamilyCss(family: EpubFontFamily): string {
  switch (family) {
    case 'serif':
      return 'Georgia, Cambria, "Times New Roman", Times, serif';
    case 'georgia':
      return 'Georgia, serif';
    case 'literata':
      return '"Literata", Georgia, "Times New Roman", serif';
    case 'sans':
      return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    default:
      return 'Georgia, serif';
  }
}

export function generateEpubScopedCss(options: EpubStyleOptions): string {
  const theme = EPUB_THEMES[options.theme];
  const maxWidth = getContentMaxWidth(options.contentWidth);
  const fontFamily = getFontFamilyCss(options.fontFamily);

  return `
    .epub-content-wrapper {
      max-width: ${maxWidth};
      margin-left: auto;
      margin-right: auto;
      font-family: ${fontFamily};
      font-size: ${options.fontSize}px;
      line-height: ${options.lineHeight};
      text-align: ${options.textAlign};
      color: ${theme.text};
      word-wrap: break-word;
      overflow-wrap: break-word;
      hyphens: auto;
    }
    .epub-content-wrapper p {
      margin-top: 0;
      margin-bottom: ${options.paragraphSpacing}rem;
      line-height: ${options.lineHeight};
    }
    .epub-content-wrapper h1,
    .epub-content-wrapper h2,
    .epub-content-wrapper h3,
    .epub-content-wrapper h4 {
      font-weight: 700;
      line-height: 1.3;
      margin-top: 1.8em;
      margin-bottom: 0.6em;
      color: ${theme.accent};
    }
    .epub-content-wrapper h1 { font-size: 1.65em; }
    .epub-content-wrapper h2 { font-size: 1.35em; }
    .epub-content-wrapper h3 { font-size: 1.15em; }
    .epub-content-wrapper blockquote {
      margin: 1.2em 0;
      padding-left: 1.2em;
      border-left: 3px solid ${theme.accent};
      font-style: italic;
      opacity: 0.9;
    }
    .epub-content-wrapper hr {
      border: 0;
      height: 1px;
      background-color: ${theme.border};
      margin: 2em 0;
    }
    .epub-content-wrapper img,
    .epub-content-wrapper svg {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1.5em auto;
      border-radius: 8px;
    }
    .epub-content-wrapper a.epub-internal-link {
      color: ${theme.accent};
      text-decoration: none;
      border-bottom: 1px dashed ${theme.accent};
      cursor: pointer;
    }
    .epub-content-wrapper a.epub-internal-link:hover {
      opacity: 0.8;
      border-bottom-style: solid;
    }
    .epub-content-wrapper .highlight-match {
      background-color: rgba(245, 158, 11, 0.4);
      color: inherit;
      padding: 2px 4px;
      border-radius: 4px;
    }
  `;
}
