/**
 * EpubNavigation.ts
 * Manages Table of Contents hierarchy, navigation lookups, and active section tracking.
 */
import { EpubTocItem, EpubSpineItem } from './EpubTypes';

export class EpubNavigation {
  private toc: EpubTocItem[];
  private spineItems: EpubSpineItem[];
  private flattenedToc: EpubTocItem[] = [];

  constructor(toc: EpubTocItem[], spineItems: EpubSpineItem[]) {
    this.toc = toc;
    this.spineItems = spineItems;
    this.flattenToc(this.toc);
  }

  public getToc(): EpubTocItem[] {
    return this.toc;
  }

  public getFlattenedToc(): EpubTocItem[] {
    return this.flattenedToc;
  }

  private flattenToc(items: EpubTocItem[]): void {
    for (const item of items) {
      this.flattenedToc.push(item);
      if (item.subitems && item.subitems.length > 0) {
        this.flattenToc(item.subitems);
      }
    }
  }

  public findTocItemForChapter(chapterIndex: number): EpubTocItem | undefined {
    const match = this.flattenedToc.find((item) => item.chapterIndex === chapterIndex);
    if (match) return match;

    const spine = this.spineItems[chapterIndex];
    if (spine) {
      return this.flattenedToc.find(
        (item) => item.fullPath === spine.fullPath || spine.fullPath.endsWith(item.fullPath)
      );
    }
    return undefined;
  }

  public resolveTarget(item: EpubTocItem): { chapterIndex: number; anchor?: string } {
    if (typeof item.chapterIndex === 'number' && item.chapterIndex >= 0) {
      return { chapterIndex: item.chapterIndex, anchor: item.anchor };
    }
    for (let i = 0; i < this.spineItems.length; i++) {
      const sp = this.spineItems[i];
      if (sp.fullPath === item.fullPath || item.fullPath.endsWith(sp.fullPath)) {
        return { chapterIndex: i, anchor: item.anchor };
      }
    }
    return { chapterIndex: 0, anchor: item.anchor };
  }
}
