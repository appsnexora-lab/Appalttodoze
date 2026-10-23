/**
 * EpubSpine.ts
 * Manages the linear sequence of reading chapters and path mapping.
 */
import { EpubSpineItem } from './EpubTypes';

export class EpubSpine {
  private items: EpubSpineItem[];

  constructor(items: EpubSpineItem[]) {
    this.items = items;
  }

  public get length(): number {
    return this.items.length;
  }

  public getItems(): EpubSpineItem[] {
    return [...this.items];
  }

  public getItem(index: number): EpubSpineItem | undefined {
    return this.items[index];
  }

  public findByPath(targetPath: string): { item: EpubSpineItem; index: number; anchor?: string } | null {
    if (!targetPath) return null;
    const [cleanPath, anchor] = targetPath.split('#');
    const normalized = cleanPath.replace(/^\/+/, '');

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (
        item.fullPath === normalized ||
        item.href === normalized ||
        item.fullPath.endsWith(normalized) ||
        normalized.endsWith(item.fullPath)
      ) {
        return { item, index: i, anchor };
      }
    }
    return null;
  }
}
