// ---------------------------------------------------------------------------
// Free, code-generated sound. No audio files, no cost:
//   - SFX are synthesized with the Web Audio API (oscillators + noise).
//   - Voice callouts use the browser's built-in SpeechSynthesis.
//
// Browsers block audio until the user interacts, so call unlock() from the
// first tap/click (we do it on the Title PLAY button). Everything no-ops when
// muted or before unlock, so it's always safe to call.
// ---------------------------------------------------------------------------

import { AUDIO } from '../config';

const MUTE_KEY = 'recess_muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

/** Flip mute and persist it. Returns the new state. */
export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (muted) window.speechSynthesis?.cancel();
  return muted;
}

/** Create/resume the AudioContext. Safe to call repeatedly; call on a user gesture. */
export function unlock(): void {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = AUDIO.masterVolume;
      master.connect(ctx.destination);
      // Pre-bake one second of white noise we can reuse for cracks/cheers.
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* Web Audio unavailable — the game still runs silently. */
  }
}

function ready(): boolean {
  return !muted && !!ctx && !!master && ctx.state === 'running';
}

// --- SFX primitives --------------------------------------------------------

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  freqEnd?: number
): void {
  if (!ready()) return;
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), c.currentTime + dur);
  }
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(g).connect(master!);
  osc.start();
  osc.stop(c.currentTime + dur + 0.02);
}

function noise(dur: number, gain: number, filterFreq: number, q = 1, sweepTo?: number): void {
  if (!ready() || !noiseBuffer) return;
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(filterFreq, c.currentTime);
  filter.Q.value = q;
  if (sweepTo !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), c.currentTime + dur);
  }
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(filter).connect(g).connect(master!);
  src.start();
  src.stop(c.currentTime + dur + 0.02);
}

// --- Named sounds ----------------------------------------------------------

/** Bat crack on solid contact — a short, bright transient. */
export function crack(): void {
  noise(0.09, 0.9, 2200, 0.8);
  tone(180, 0.08, 'square', 0.25, 90);
}

/** A whiff / swing-and-miss swish. */
export function whiff(): void {
  noise(0.22, 0.35, 1400, 0.7, 300);
}

/** A small UI blip (draft pick, button). */
export function pop(): void {
  tone(660, 0.09, 'sine', 0.3, 990);
}

/** A crowd cheer for runs / wins — a noise swell plus a rising sparkle. */
export function cheer(): void {
  if (!ready()) return;
  const c = ctx!;
  // Crowd swell.
  const src = c.createBufferSource();
  src.buffer = noiseBuffer!;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.linearRampToValueAtTime(0.5, c.currentTime + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.8);
  src.connect(filter).connect(g).connect(master!);
  src.start();
  src.stop(c.currentTime + 0.85);
  // Rising sparkle.
  tone(523, 0.5, 'triangle', 0.22, 1046);
}

/** Quiet woosh as a pitch is thrown. */
export function pitchWoosh(): void {
  noise(0.18, 0.14, 700, 0.9, 1600);
}

/** The recess bell — a classic electric school-bell trill. */
export function bell(): void {
  if (!ready()) return;
  const c = ctx!;
  // Eight fast clapper strikes, each a bright fundamental + overtone with a
  // sharp decay. Scheduled against currentTime so the trill is even.
  for (let i = 0; i < 8; i++) {
    const t0 = c.currentTime + i * 0.065;
    for (const [freq, gain] of [
      [1976, 0.2],
      [2637, 0.09],
    ] as const) {
      const osc = c.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      osc.connect(g).connect(master!);
      osc.start(t0);
      osc.stop(t0 + 0.08);
    }
  }
}

// --- Voice -----------------------------------------------------------------

let pickedVoice: SpeechSynthesisVoice | null = null;

function chooseVoice(): SpeechSynthesisVoice | null {
  const synth = window.speechSynthesis;
  if (!synth) return null;
  if (pickedVoice) return pickedVoice;
  const voices = synth.getVoices();
  if (!voices.length) return null;
  // Prefer an English voice; fall back to the first available.
  pickedVoice =
    voices.find((v) => /en[-_]/i.test(v.lang) && /female|samantha|karen|zira/i.test(v.name)) ||
    voices.find((v) => /en[-_]/i.test(v.lang)) ||
    voices[0];
  return pickedVoice;
}

/** Speak a short kid-friendly callout. No-ops when muted / unsupported. */
export function say(text: string): void {
  if (muted) return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  try {
    synth.cancel(); // don't let callouts pile up
    const u = new SpeechSynthesisUtterance(text);
    const v = chooseVoice();
    if (v) u.voice = v;
    u.pitch = 1.3; // brighter / younger
    u.rate = 1.05;
    u.volume = 1;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}
