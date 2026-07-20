// ---------------------------------------------------------------------------
// Voice profiles. PURE (no Phaser, no browser APIs): the two booth kids'
// fixed profiles, plus a stable derived voice for each of the 30 characters —
// hash(id) picks pitch/rate inside config.VOICE.KID ranges, nudged by the
// kid's face expression. audio.say() applies a profile to the utterance.
// ---------------------------------------------------------------------------

import { VOICE } from '../config';
import type { Character } from '../data/types';

export interface VoiceProfile {
  pitch: number;
  rate: number;
  /** Index into the cached English voice list (modulo its length). */
  voiceIdx?: number;
}

/** The two commentators: A = Pip (hyped little kid), B = Rocco (deadpan older kid). */
export type Speaker = 'A' | 'B';

export function commentatorProfile(speaker: Speaker): VoiceProfile {
  return VOICE.COMMENTATORS[speaker];
}

/** FNV-1a — tiny, stable, good-enough spread for 30 short id strings. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A stable voice for one kid: same id always yields the same profile. Two
 * independent hash rolls place pitch/rate inside the KID ranges, the
 * expression nudge shifts them (clamped back into range), and a third bit
 * splits kids across the two cached English voices.
 */
export function kidVoice(char: Pick<Character, 'id' | 'visual'>): VoiceProfile {
  const K = VOICE.KID;
  const h = hash(char.id);
  const pitchRoll = ((h & 0xffff) / 0xffff) * (K.PITCH_MAX - K.PITCH_MIN) + K.PITCH_MIN;
  const rateRoll = (((h >>> 16) & 0x7fff) / 0x7fff) * (K.RATE_MAX - K.RATE_MIN) + K.RATE_MIN;
  const nudge = K.NUDGE[char.visual.expression ?? 'happy'];
  return {
    pitch: clamp(pitchRoll + nudge.pitch, K.PITCH_MIN, K.PITCH_MAX),
    rate: clamp(rateRoll + nudge.rate, K.RATE_MIN, K.RATE_MAX),
    voiceIdx: (h >>> 31) & 1,
  };
}
