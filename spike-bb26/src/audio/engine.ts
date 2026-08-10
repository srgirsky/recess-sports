// OWNER: audio. The gesture gate and the master output chain. WebAudio
// synthesis only — no audio assets. The AudioContext is created on the FIRST
// pointerdown (the browser autoplay rule) and every play() before that moment
// is a silent no-op. That same gate is what keeps headless capture silent: no
// pointer gesture ever arrives there, so no context is ever built.

export type Rand = () => number; // [0,1) — a PRIVATE stream derived from ctx rng

export class AudioEngine {
  readonly rand: Rand;
  private ac: AudioContext | null = null;
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private unlockFns: Array<() => void> = [];

  constructor(rand: Rand) {
    this.rand = rand;
  }

  /** Arm the one-time pointerdown unlock. Called once at init. */
  install(): void {
    const unlock = (): void => {
      window.removeEventListener('pointerdown', unlock);
      if (this.ac !== null || typeof AudioContext === 'undefined') return;
      this.ac = new AudioContext();
      void this.ac.resume();
      // master gain -> gentle compressor -> speakers. The compressor keeps a
      // crack landing on top of the ambient bed from clipping.
      const master = this.ac.createGain();
      master.gain.value = 0.45;
      const comp = this.ac.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      master.connect(comp);
      comp.connect(this.ac.destination);
      this.out = master;
      for (const fn of this.unlockFns) fn();
    };
    window.addEventListener('pointerdown', unlock);
  }

  get unlocked(): boolean {
    return this.ac !== null;
  }

  /** Fires once, right after the context comes alive (starts the ambient bed). */
  onUnlock(fn: () => void): void {
    this.unlockFns.push(fn);
  }

  setVolume(v: number): void {
    if (this.out) this.out.gain.value = Math.max(0, Math.min(1, v));
  }

  /** Run a voice against the live graph, or silently no-op while locked. */
  play(fn: (ac: AudioContext, out: GainNode, t0: number) => void): void {
    if (this.ac === null || this.out === null) return;
    fn(this.ac, this.out, this.ac.currentTime);
  }

  /** One shared 1s white-noise buffer, filled from the seeded stream —
   *  Math.random stays forbidden even here. Built lazily after unlock. */
  noise(ac: AudioContext): AudioBuffer {
    if (this.noiseBuf === null) {
      const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = this.rand() * 2 - 1;
      this.noiseBuf = buf;
    }
    return this.noiseBuf;
  }
}

/** Attack/decay gain envelope shared by every one-shot voice. */
export function env(g: AudioParam, t0: number, peak: number, attack: number, decay: number): void {
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}
