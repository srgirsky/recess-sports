// OWNER: audio. The ambient bed: a soft looped breeze, FM bird blips, and
// distant-kid chatter pulses. Scheduling runs on sim time — the tick event's
// tMs, never wall clock — and the whole bed renders nothing until the engine
// unlocks, so capture stays silent and deterministic.

import { AudioEngine } from './engine';

export class Ambient {
  private e: AudioEngine;
  private nextBirdMs = 1200;
  private nextChatterMs = 2600;
  private bedStarted = false;

  constructor(e: AudioEngine) {
    this.e = e;
    e.onUnlock(() => this.startBed());
  }

  /** Gentle breeze: looped low-passed noise faded in over 1.5s. */
  private startBed(): void {
    if (this.bedStarted) return;
    this.bedStarted = true;
    this.e.play((ac, out, t0) => {
      const src = ac.createBufferSource();
      src.buffer = this.e.noise(ac);
      src.loop = true;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.02, t0 + 1.5);
      src.connect(lp).connect(g).connect(out);
      src.start(t0);
    });
  }

  /** Called from the tick handler with sim time. No-ops while locked. */
  update(tMs: number): void {
    if (!this.e.unlocked) return;
    if (tMs >= this.nextBirdMs) {
      this.chirp();
      this.nextBirdMs = tMs + 2500 + this.e.rand() * 6500;
    }
    if (tMs >= this.nextChatterMs) {
      this.chatter();
      this.nextChatterMs = tMs + 4500 + this.e.rand() * 9000;
    }
  }

  /** Bird = FM blips: sine carrier warbled by a fast modulator, 2-4 pips. */
  private chirp(): void {
    const r = this.e.rand;
    this.e.play((ac, out, t0) => {
      const car = ac.createOscillator();
      car.type = 'sine';
      const mod = ac.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = 90 + r() * 140;
      const modG = ac.createGain();
      modG.gain.value = 250 + r() * 650;
      mod.connect(modG).connect(car.frequency);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      const pips = 2 + Math.floor(r() * 3);
      const base = 2300 + r() * 1400;
      let t = t0;
      for (let i = 0; i < pips; i++) {
        car.frequency.setValueAtTime(base * (0.92 + r() * 0.18), t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.045, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        t += 0.12 + r() * 0.08;
      }
      car.connect(g).connect(out);
      car.start(t0);
      mod.start(t0);
      car.stop(t + 0.05);
      mod.stop(t + 0.05);
    });
  }

  /** Distant kids = band-passed noise shaped into 2-4 syllable pulses. */
  private chatter(): void {
    const r = this.e.rand;
    this.e.play((ac, out, t0) => {
      const src = ac.createBufferSource();
      src.buffer = this.e.noise(ac);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 350 + r() * 450;
      bp.Q.value = 2.2;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      const syllables = 2 + Math.floor(r() * 3);
      let t = t0;
      for (let i = 0; i < syllables; i++) {
        g.gain.exponentialRampToValueAtTime(0.016 + r() * 0.012, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        t += 0.15 + r() * 0.1;
      }
      src.connect(bp).connect(g).connect(out);
      src.start(t0, r() * 0.6, t - t0 + 0.1);
    });
  }
}
