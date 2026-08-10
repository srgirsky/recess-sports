// OWNER: audio. The three event one-shots — pitch whoosh, bat CRACK, ball
// thud — all cartoon-bright, all built from the shared seeded noise buffer
// plus plain oscillators. Every function is safe to call any time: the engine
// no-ops them until the pointerdown unlock.

import { AudioEngine, env } from './engine';

/** 'pitch:release' — filtered-noise sweep rising through the flight. */
export function whoosh(e: AudioEngine, durMs = 320): void {
  e.play((ac, out, t0) => {
    const dur = Math.min(0.5, Math.max(0.15, durMs / 1000));
    const src = ac.createBufferSource();
    src.buffer = e.noise(ac);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(350, t0);
    bp.frequency.exponentialRampToValueAtTime(2400, t0 + dur * 0.8);
    const g = ac.createGain();
    env(g.gain, t0, 0.2, dur * 0.55, dur * 0.45);
    src.connect(bp).connect(g).connect(out);
    src.start(t0, e.rand() * 0.4, dur + 0.1);
  });
}

/** 'bat:contact' — a woody CRACK: bright snap + narrow wood resonators + a
 *  pitch-dropping thump. */
export function crack(e: AudioEngine): void {
  e.play((ac, out, t0) => {
    // 1. the snap — a very short bright noise burst
    const snap = ac.createBufferSource();
    snap.buffer = e.noise(ac);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const sg = ac.createGain();
    env(sg.gain, t0, 0.5, 0.002, 0.05);
    snap.connect(hp).connect(sg).connect(out);
    snap.start(t0, e.rand() * 0.5, 0.08);

    // 2. the wood — two narrow resonators ringing for a blink
    for (const f of [1150, 1900]) {
      const ring = ac.createBufferSource();
      ring.buffer = e.noise(ac);
      const bpq = ac.createBiquadFilter();
      bpq.type = 'bandpass';
      bpq.frequency.value = f;
      bpq.Q.value = 18;
      const rg = ac.createGain();
      env(rg.gain, t0, 0.32, 0.003, 0.09);
      ring.connect(bpq).connect(rg).connect(out);
      ring.start(t0, e.rand() * 0.5, 0.12);
    }

    // 3. the thump — sine punch dropping 190 -> 70 Hz
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, t0);
    osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.12);
    const og = ac.createGain();
    env(og.gain, t0, 0.38, 0.004, 0.13);
    osc.connect(og).connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.18);
  });
}

/** 'ball:land' — a soft grassy thud. */
export function thud(e: AudioEngine): void {
  e.play((ac, out, t0) => {
    const src = ac.createBufferSource();
    src.buffer = e.noise(ac);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = ac.createGain();
    env(g.gain, t0, 0.26, 0.005, 0.12);
    src.connect(lp).connect(g).connect(out);
    src.start(t0, e.rand() * 0.5, 0.16);

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t0);
    osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.1);
    const og = ac.createGain();
    env(og.gain, t0, 0.2, 0.004, 0.1);
    osc.connect(og).connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.15);
  });
}
