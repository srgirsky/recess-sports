// ---------------------------------------------------------------------------
// Free, code-generated sound. No audio files, no cost:
//   - SFX are synthesized with the Web Audio API (oscillators + noise).
//   - Voice callouts use the browser's built-in SpeechSynthesis.
//
// Browsers block audio until the user interacts, so call unlock() from the
// first tap/click (we do it on the Title PLAY button). Everything no-ops when
// muted or before unlock, so it's always safe to call.
// ---------------------------------------------------------------------------

import { AUDIO, VOICE } from '../config';
import { rankVoices } from './voices';
import type { VoiceProfile } from './voices';

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
  if (muted) cancelSpeech();
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
  // Warm the voice cache: the user gesture kicks off Chrome's async getVoices()
  // population so the first spoken line gets a curated voice, not the default.
  if (window.speechSynthesis) void enVoices();
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
// Every speaker (the two booth kids + the 30 characters) is a VoiceProfile
// (pitch/rate/voiceIdx) applied per utterance. A tiny sequential queue lets a
// commentator exchange or a drafted kid's line finish instead of the old
// cancel-everything behavior.

let voiceList: SpeechSynthesisVoice[] = [];
let voicesHooked = false;

/** Cached curated voice list (rankVoices over the English inventory).
 *  getVoices() populates async — re-cache on voiceschanged. */
function enVoices(): SpeechSynthesisVoice[] {
  const synth = window.speechSynthesis;
  if (!synth) return [];
  if (!voicesHooked) {
    voicesHooked = true;
    synth.addEventListener?.('voiceschanged', () => {
      voiceList = [];
    });
  }
  if (!voiceList.length) {
    const all = synth.getVoices();
    voiceList = rankVoices(all.filter((v) => /en[-_]/i.test(v.lang)));
    if (!voiceList.length && all.length) voiceList = rankVoices(all);
    if (import.meta.env.DEV && voiceList.length)
      console.debug('[voice] curated:', voiceList.map((v) => `${v.name} (${v.lang})`));
  }
  return voiceList;
}

/**
 * flush = big moment: cancel everything and speak now.
 * queue = speak after the current line (small cap; oldest pending drops).
 * chatter = only speaks if nothing else is talking or waiting.
 */
export type SayMode = 'flush' | 'queue' | 'chatter';

let pending: { text: string; profile: VoiceProfile }[] = [];
let speaking = false;
let watchdog: ReturnType<typeof setTimeout> | undefined;
/** Invalidates deferred flush speaks when the queue is cleared under them. */
let flushSeq = 0;

function clearQueue(): void {
  pending = [];
  speaking = false;
  flushSeq++;
  if (watchdog !== undefined) clearTimeout(watchdog);
  watchdog = undefined;
}

/** Stop any in-flight speech (used when the game pauses). Always safe to call. */
export function cancelSpeech(): void {
  clearQueue();
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

function advance(): void {
  speaking = false;
  if (watchdog !== undefined) clearTimeout(watchdog);
  watchdog = undefined;
  const next = pending.shift();
  if (next) speakNow(next.text, next.profile);
}

function speakNow(text: string, profile: VoiceProfile): void {
  if (muted) {
    clearQueue();
    return;
  }
  const synth = window.speechSynthesis;
  if (!synth) return;
  try {
    speaking = true;
    const u = new SpeechSynthesisUtterance(text);
    const voices = enVoices();
    if (voices.length) u.voice = voices[(profile.voiceIdx ?? 0) % voices.length];
    // Humanizing jitter: repeated lines shouldn't sound byte-identical. Lives
    // here (the impure module) so kidVoice profiles stay deterministic.
    const j = VOICE.JITTER;
    u.pitch = Math.min(2, Math.max(0, profile.pitch + (Math.random() * 2 - 1) * j.PITCH));
    u.rate = Math.min(2, Math.max(0.5, profile.rate + (Math.random() * 2 - 1) * j.RATE));
    u.volume = VOICE.VOLUME;
    u.onend = advance;
    u.onerror = advance;
    synth.speak(u);
    // Chrome sometimes never fires onend (esp. around cancel) — a duration
    // watchdog keeps the queue from wedging. Whichever fires first advances.
    const est = VOICE.QUEUE.EST_BASE_MS + (text.length * VOICE.QUEUE.EST_MS_PER_CHAR) / profile.rate;
    watchdog = setTimeout(advance, est);
  } catch {
    speaking = false;
  }
}

/** Old single-voice feel for bare say(text) call sites. */
const DEFAULT_PROFILE: VoiceProfile = { pitch: 1.2, rate: 1.02, voiceIdx: 0 };

/** Speak a short kid-friendly callout. No-ops when muted / unsupported. */
export function say(text: string, profile: VoiceProfile = DEFAULT_PROFILE, mode: SayMode = 'queue'): void {
  if (muted || !window.speechSynthesis) return;
  if (mode === 'flush') {
    cancelSpeech();
    // Chrome drops an utterance spoken synchronously after cancel() — defer a
    // tick. Reserve the speaking slot NOW so a follow-up 'queue' line (e.g.
    // the second half of a booth exchange) lines up behind this one instead
    // of jumping in front during the deferred gap.
    speaking = true;
    const seq = flushSeq;
    setTimeout(() => {
      if (seq === flushSeq) speakNow(text, profile);
    }, 0);
    return;
  }
  if (!speaking) {
    speakNow(text, profile);
    return;
  }
  if (mode === 'chatter') return; // droppable — never talks over anyone
  pending.push({ text, profile });
  if (pending.length > VOICE.QUEUE.MAX_PENDING) pending.shift(); // newest info wins
}
