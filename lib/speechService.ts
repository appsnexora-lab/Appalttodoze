// Web Speech API Text-to-Speech Engine for Altto
// Works 100% offline in browser and PWA

export interface SpeechOptions {
  rate?: number; // 0.75 to 2.0
  pitch?: number; // 0.8 to 1.2
  onStart?: () => void;
  onEnd?: () => void;
  onBoundary?: (charIndex: number) => void;
  onChunkChange?: (index: number, total: number) => void;
  onError?: (err: any) => void;
}

class SpeechController {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private chunks: string[] = [];
  private currentChunkIndex: number = 0;
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private currentRate: number = 1.0;
  private options: SpeechOptions = {};
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  private initVoices(): void {
    if (!this.synth) return;
    try {
      const voices = this.synth.getVoices();
      if (!voices || voices.length === 0) return;

      // Prefer pt-BR voices
      const ptBrVoices = voices.filter(
        (v) => v.lang.startsWith('pt-BR') || v.lang.startsWith('pt_BR') || v.lang === 'pt'
      );

      // Prefer natural sounding / Google / Microsoft / Apple voices
      const natural = ptBrVoices.find(
        (v) =>
          v.name.toLowerCase().includes('natural') ||
          v.name.toLowerCase().includes('google') ||
          v.name.toLowerCase().includes('luciana') ||
          v.name.toLowerCase().includes('maria') ||
          v.name.toLowerCase().includes('daniel')
      );

      this.selectedVoice = natural || ptBrVoices[0] || voices.find((v) => v.lang.startsWith('pt')) || null;
    } catch {}
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getState() {
    return {
      isSupported: this.isSupported(),
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      rate: this.currentRate,
      currentChunk: this.currentChunkIndex + 1,
      totalChunks: Math.max(1, this.chunks.length),
    };
  }

  public setRate(rate: number): void {
    this.currentRate = Math.max(0.7, Math.min(2.0, rate));
    if (this.isPlaying && !this.isPaused) {
      // Re-speak current chunk with new rate
      const cur = this.chunks[this.currentChunkIndex];
      if (cur) {
        this.stopCurrentOnly();
        this.speakChunk(this.currentChunkIndex);
      }
    }
    this.notify();
  }

  /**
   * Chunks large texts by sentences to prevent Android/Chrome ~15s synthesis cutoff bug.
   */
  private splitIntoChunks(text: string): string[] {
    const clean = text
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) return [];

    // Split by punctuation followed by space or newline
    const sentences = clean.split(/(?<=[.?!;:\n])\s+/);
    const result: string[] = [];
    let current = '';

    for (const s of sentences) {
      if ((current + ' ' + s).length > 200) {
        if (current.trim()) result.push(current.trim());
        current = s;
      } else {
        current = current ? `${current} ${s}` : s;
      }
    }
    if (current.trim()) result.push(current.trim());

    return result.length > 0 ? result : [clean];
  }

  public speak(text: string, options: SpeechOptions = {}): void {
    if (!this.synth) return;
    this.stop();

    this.options = options;
    if (options.rate) this.currentRate = options.rate;
    this.chunks = this.splitIntoChunks(text);
    if (this.chunks.length === 0) return;

    this.currentChunkIndex = 0;
    this.isPlaying = true;
    this.isPaused = false;
    this.notify();

    if (this.options.onStart) this.options.onStart();
    this.speakChunk(0);
  }

  private stopCurrentOnly(): void {
    if (!this.synth) return;
    try {
      this.synth.cancel();
    } catch {}
  }

  private speakChunk(index: number): void {
    if (!this.synth || index >= this.chunks.length || !this.isPlaying) {
      this.handleComplete();
      return;
    }

    this.currentChunkIndex = index;
    if (this.options.onChunkChange) {
      this.options.onChunkChange(index + 1, this.chunks.length);
    }
    this.notify();

    const chunkText = this.chunks[index];
    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.lang = 'pt-BR';
    if (this.selectedVoice) utterance.voice = this.selectedVoice;
    utterance.rate = this.currentRate;
    utterance.pitch = this.options.pitch || 1.0;

    utterance.onend = () => {
      if (!this.isPlaying) return;
      if (this.currentChunkIndex + 1 < this.chunks.length) {
        this.speakChunk(this.currentChunkIndex + 1);
      } else {
        this.handleComplete();
      }
    };

    utterance.onerror = (e) => {
      // Ignore normal cancel/interrupted events
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      console.warn('SpeechSynthesis error:', e);
      if (this.options.onError) this.options.onError(e);
      // Attempt next chunk
      if (this.currentChunkIndex + 1 < this.chunks.length) {
        this.speakChunk(this.currentChunkIndex + 1);
      } else {
        this.handleComplete();
      }
    };

    this.currentUtterance = utterance;
    try {
      this.synth.speak(utterance);
    } catch (e) {
      console.warn('Failed to speak utterance:', e);
    }
  }

  private handleComplete(): void {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentUtterance = null;
    this.notify();
    if (this.options.onEnd) this.options.onEnd();
  }

  public pause(): void {
    if (!this.synth || !this.isPlaying || this.isPaused) return;
    try {
      this.synth.pause();
      this.isPaused = true;
      this.notify();
    } catch {}
  }

  public resume(): void {
    if (!this.synth || !this.isPlaying || !this.isPaused) return;
    try {
      this.synth.resume();
      this.isPaused = false;
      this.notify();
    } catch {}
  }

  public togglePlayPause(): void {
    if (this.isPaused) {
      this.resume();
    } else if (this.isPlaying) {
      this.pause();
    }
  }

  public stop(): void {
    if (!this.synth) return;
    this.isPlaying = false;
    this.isPaused = false;
    this.chunks = [];
    this.currentChunkIndex = 0;
    this.currentUtterance = null;
    try {
      this.synth.cancel();
    } catch {}
    this.notify();
  }
}

export const speechService = new SpeechController();
