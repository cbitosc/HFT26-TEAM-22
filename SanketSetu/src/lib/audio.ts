/**
 * Short confirmation tones (src/lib/audio.ts). WebAudio oscillators only — no audio files and no
 * background/ambient sound. Muted by default; the user can turn sounds on in Settings. Nothing in
 * the app relies on sound alone: every tone accompanies visible text and haptics.
 */

const MUTE_KEY = 'sanket-sound-muted';

class ToneEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean;
  private listeners = new Set<() => void>();

  constructor() {
    let stored: string | null = null;
    try {
      stored = typeof localStorage !== 'undefined' ? localStorage.getItem(MUTE_KEY) : null;
    } catch {
      stored = null;
    }
    this.muted = stored !== 'false';
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, String(muted));
    } catch {
      // ignore
    }
    for (const cb of this.listeners) cb();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) this.playTick(520, 0.045);
    return this.muted;
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public playTick(freq = 680, duration = 0.035) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  public playHoverTick() {
    this.playTick(680, 0.03);
  }

  public playSelectChord() {
    this.playTick(540, 0.055);
  }

  /** Distinct three-tone confirmation used when an SOS is actually sent. */
  public playSosSent() {
    this.playTick(880, 0.12);
    window.setTimeout(() => this.playTick(880, 0.12), 160);
    window.setTimeout(() => this.playTick(1100, 0.2), 320);
  }
}

export const soundEngine = new ToneEngine();
