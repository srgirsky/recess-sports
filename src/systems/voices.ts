// ---------------------------------------------------------------------------
// Voice profiles. PURE (no Phaser, no browser APIs): the two booth kids'
// fixed profiles, plus a stable derived voice for each of the 30 characters —
// hash(id) picks pitch/rate inside config.VOICE.KID ranges (pitch inside the
// kid's voiceGender band), nudged by the kid's face expression. curateVoices
// splits the ranked browser inventory into mixed/boy/girl sublists and
// pickVoice resolves a profile to a concrete voice; audio.say() applies the
// profile to the utterance.
// ---------------------------------------------------------------------------

import { VOICE } from '../config';
import type { Character } from '../data/types';

export interface VoiceProfile {
  pitch: number;
  rate: number;
  /** Index into the curated voice list rankVoices builds (modulo its length). */
  voiceIdx?: number;
  /** Prefer the gendered curated sublist (curateVoices). Omitted = mixed list. */
  voiceGender?: 'boy' | 'girl';
}

/** Minimal shape of SpeechSynthesisVoice the ranker needs (keeps it pure/testable). */
export interface VoiceInfo {
  name: string;
  lang: string;
}

const normLang = (lang: string) => lang.toLowerCase().replace(/_/g, '-');

/**
 * Rank the browser's voice inventory by childlike suitability and return the
 * curated top VOICE.PICK.TOP_N — real child voices first, then neural/Google
 * quality voices, then younger-leaning system voices; deep/novelty voices are
 * dropped. voiceIdx indexes into this list. If nothing matches any tier the
 * result degrades to raw browser order, and a non-empty input never ranks to
 * an empty list.
 */
export function rankVoices<T extends VoiceInfo>(voices: T[]): T[] {
  return rankAll(voices).slice(0, VOICE.PICK.TOP_N);
}

/** The full ranked pool (dedupe → avoid-filter → score → sort), unsliced. */
function rankAll<T extends VoiceInfo>(voices: T[]): T[] {
  const P = VOICE.PICK;
  const seen = new Set<string>();
  const deduped = voices.filter((v) => !seen.has(v.name) && (seen.add(v.name), true));
  const kept = deduped.filter((v) => !P.AVOID.test(v.name));
  const pool = kept.length ? kept : deduped;
  const preferred = new Set(P.PREFERRED_LANGS.map(normLang));
  const score = (v: VoiceInfo): number => {
    const tier = P.TIERS.findIndex((re) => re.test(v.name));
    return (tier >= 0 ? (P.TIERS.length - tier) * 100 : 0) + (preferred.has(normLang(v.lang)) ? 10 : 0);
  };
  return pool
    .map((v, i) => ({ v, s: score(v), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i) // equal scores keep browser order
    .map((e) => e.v);
}

/** The curated lists pickVoice chooses from: mixed = rankVoices as before,
 *  boy/girl = gender-classified sublists (either may be empty). */
export interface CuratedVoices<T extends VoiceInfo> {
  mixed: T[];
  boy: T[];
  girl: T[];
}

/**
 * Rank the FULL inventory, then partition by the GENDER name regexes and slice
 * each sublist to TOP_N. Partitioning before slicing matters: cutting to the
 * mixed top-4 first would routinely leave a gender with 0–1 voices. GIRL is
 * tested first, so the sublists are disjoint; names matching neither regex
 * (e.g. "Google US English") appear only in `mixed`.
 */
export function curateVoices<T extends VoiceInfo>(voices: T[]): CuratedVoices<T> {
  const P = VOICE.PICK;
  const ranked = rankAll(voices);
  return {
    mixed: ranked.slice(0, P.TOP_N),
    girl: ranked.filter((v) => P.GENDER.GIRL.test(v.name)).slice(0, P.TOP_N),
    boy: ranked.filter((v) => !P.GENDER.GIRL.test(v.name) && P.GENDER.BOY.test(v.name)).slice(0, P.TOP_N),
  };
}

/**
 * Resolve a profile to a concrete voice: the profile's gender sublist when it
 * has one (and the browser offered any matching voices), otherwise the mixed
 * list — where the gendered pitch band still keeps boys and girls apart.
 * Undefined only when the whole inventory is empty.
 */
export function pickVoice<T extends VoiceInfo>(c: CuratedVoices<T>, profile: VoiceProfile): T | undefined {
  const gendered = profile.voiceGender ? c[profile.voiceGender] : [];
  const list = gendered.length ? gendered : c.mixed;
  return list.length ? list[(profile.voiceIdx ?? 0) % list.length] : undefined;
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
 * independent hash rolls place pitch/rate inside the KID ranges — pitch inside
 * the kid's GENDER_PITCH band — the expression nudge shifts them (clamped back
 * into range/band), and a third hash slice spreads kids across the curated
 * voice list. voiceGender rides along so audio.ts picks the gendered sublist.
 */
export function kidVoice(char: Pick<Character, 'id' | 'visual' | 'voiceGender'>): VoiceProfile {
  const K = VOICE.KID;
  const band = K.GENDER_PITCH[char.voiceGender];
  const h = hash(char.id);
  const pitchRoll = ((h & 0xffff) / 0xffff) * (band.MAX - band.MIN) + band.MIN;
  const rateRoll = (((h >>> 16) & 0x7fff) / 0x7fff) * (K.RATE_MAX - K.RATE_MIN) + K.RATE_MIN;
  const nudge = K.NUDGE[char.visual.expression ?? 'happy'];
  return {
    pitch: clamp(pitchRoll + nudge.pitch, band.MIN, band.MAX),
    rate: clamp(rateRoll + nudge.rate, K.RATE_MIN, K.RATE_MAX),
    voiceIdx: (h >>> 24) % VOICE.PICK.TOP_N,
    voiceGender: char.voiceGender,
  };
}
