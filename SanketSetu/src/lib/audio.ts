import { scrollState, setDiscreteState } from './scroll';

/**
 * Procedural WebAudio Engine (src/lib/audio.ts)
 * -----------------------------------------------------------------------------
 * Generates a subtle warm ambient hum and soft tactile tick sounds on hover
 * and scene transitions using WebAudio oscillators. Zero external audio files.
 * Default muted until the user clicks the circular mute/unmute button.
 */

class ProceduralSoundEngine {
  private ctx: AudioContext | null = null;
  private droneGain: GainNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private isStarted = false;

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

  private startAmbientDrone() {
    const ctx = this.ensureContext();
    if (!ctx || this.isStarted) return;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const oscA = ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.value = 65.41; // C2

    const oscB = ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.value = 98.0; // G2 fifth

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    oscA.start();
    oscB.start();

    this.oscA = oscA;
    this.oscB = oscB;
    this.droneGain = gain;
    this.isStarted = true;
  }

  public toggleMute(): boolean {
    const nextMuted = !scrollState.isMuted;
    setDiscreteState({ isMuted: nextMuted });

    const ctx = this.ensureContext();
    if (!ctx) return nextMuted;

    if (!this.isStarted) {
      this.startAmbientDrone();
    }

    if (this.droneGain) {
      const now = ctx.currentTime;
      this.droneGain.gain.cancelScheduledValues(now);
      this.droneGain.gain.setTargetAtTime(nextMuted ? 0.0001 : 0.028, now, 0.25);
    }

    if (!nextMuted) {
      this.playTick(520, 0.045);
    }

    return nextMuted;
  }

  public playTick(freq = 680, duration = 0.035) {
    if (scrollState.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration);

    gain.gain.setValueAtTime(0.035, now);
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
}

export const soundEngine = new ProceduralSoundEngine();
