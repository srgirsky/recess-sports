// ---------------------------------------------------------------------------
// Character acting direction. PURE: the roster supplies identity, this file
// supplies how that identity behaves when the shared rig asks for a familiar
// baseball action.
//
// A shared skeleton must not mean thirty synchronized mannequins. Each roster
// slot below is an explicit acting choice: how the kid presents themself, how
// large a feeling becomes, and how quickly stillness turns into a fidget. The
// profile list follows ROSTER order so character ids remain defined in exactly
// one place (`src/data/characters.ts`). The test makes order drift fail loudly.
//
// Physics timing still wins. These choices affect held/front-end/reaction
// motion and face-atlas cells; marker clips and locomotion rates continue to be
// driven by the simulated instant and ground speed in AnimationDirector.
// ---------------------------------------------------------------------------

import { ROSTER } from '../../data/characters';
import type { Expression } from '../../data/types';
import type { AnimName } from './clips';
import { restingCell, type FaceCell } from './faceAtlas';

export type HeroStance = 'swagger' | 'batter' | 'glove' | 'bashful';
export type Spirit = 'sunny' | 'cool' | 'fierce' | 'goofy' | 'tender';
export type Tempo = 'calm' | 'steady' | 'quick';

export interface PerformanceProfile {
  hero: HeroStance;
  spirit: Spirit;
  tempo: Tempo;
}

/**
 * One direction per ROSTER slot, deliberately hand-authored rather than
 * hashed from stats or colours. The latter would manufacture variation; these
 * choices interpret the personality already written in each kid's name,
 * tagline and draft line.
 */
const HERO = { s: 'swagger', b: 'batter', g: 'glove', h: 'bashful' } as const;
const SPIRIT = { s: 'sunny', c: 'cool', f: 'fierce', g: 'goofy', t: 'tender' } as const;
const TEMPO = { c: 'calm', s: 'steady', q: 'quick' } as const;

/** Three-character codes are hero/spirit/tempo, still grouped in ROSTER order. */
const DIRECTION_CODES = [
  'bfs sgq gcs', // Junebug · Theo · Zoom
  'sgs bfc bfq', // Big Lou · Tank · Mimi
  'bgq hsq gsq', // Turbo · Sprout · Zippy
  'gcs gts gcc', // Ace · Penny · Dex
  'gfs sfq hgs', // Lefty · Smokey · Bend-It
  'htq ssq hts', // Noodle · Bubbles · Sniffles
  'gcc sfs hcc', // The Professor · Diva · Grizz
  'bfq hgq gts', // Flash · Cricket · Moose
  'bss scq sss', // Peaches · Gizmo · Clover
  'gfq gsq sgq', // Rocket · Chip · Boomer
].join(' ').split(' ');

const ROSTER_PERFORMANCES: readonly PerformanceProfile[] = DIRECTION_CODES.map((code) => ({
  hero: HERO[code[0] as keyof typeof HERO],
  spirit: SPIRIT[code[1] as keyof typeof SPIRIT],
  tempo: TEMPO[code[2] as keyof typeof TEMPO],
}));

const DEFAULT_PROFILE: PerformanceProfile = { hero: 'swagger', spirit: 'sunny', tempo: 'steady' };

const BY_ID = new Map(ROSTER.map((character, i) => [character.id, ROSTER_PERFORMANCES[i]] as const));

export function performanceFor(id: string): PerformanceProfile {
  return BY_ID.get(id) ?? DEFAULT_PROFILE;
}

/** A hero pose chosen for personality, not batting average. */
export function heroClipFor(profile: PerformanceProfile): AnimName {
  switch (profile.hero) {
    case 'batter': return 'bat_stance';
    case 'glove': return 'field_ready';
    case 'bashful': return 'nervous';
    default: return 'pose_card';
  }
}

/** One emotional beat per spirit; sunny keeps the original broad read. */
export function reactionClipFor(profile: PerformanceProfile, won: boolean): AnimName {
  const family = won ? 'cheer' : 'upset';
  return profile.spirit === 'sunny' ? family : `${family}_${profile.spirit}` as AnimName;
}

/**
 * A body clip and a face are one performance. Previously the atlas was set at
 * model construction and never touched again, so a kid celebrated and struck
 * out behind the same frozen expression.
 */
export function faceForClip(
  profile: PerformanceProfile,
  clip: AnimName,
  authoredRest: Expression | undefined
): FaceCell {
  const rest = restingCell(authoredRest);

  if (clip.startsWith('cheer')) {
    return { sunny: 'cheer', cool: 'wink', fierce: 'determined', goofy: 'tongue', tender: 'surprised' }[profile.spirit] as FaceCell;
  }
  if (clip.startsWith('upset') || clip === 'swing_whiff') {
    return { sunny: 'upset', cool: 'worried', fierce: 'angry', goofy: 'upset', tender: 'worried' }[profile.spirit] as FaceCell;
  }
  if (clip === 'nervous') return profile.spirit === 'goofy' ? 'tongue' : 'worried';
  if (clip === 'dodge') return 'surprised';
  if (clip === 'idle_fidget') {
    return { sunny: 'grin', cool: 'sleepy', fierce: 'determined', goofy: 'tongue', tender: 'blink' }[profile.spirit] as FaceCell;
  }
  if (
    clip === 'bat_load' || clip === 'swing_contact' || clip === 'bunt' ||
    clip === 'pitch_windup' || clip === 'pitch_stride' || clip === 'pitch_release' ||
    clip === 'throw_overhand' || clip === 'throw_quick' || clip.startsWith('catch_') ||
    clip === 'field_scoop' || clip.startsWith('dive_')
  ) {
    return profile.spirit === 'goofy' ? 'grin' : 'determined';
  }
  if (clip === 'pose_card') {
    return { sunny: 'grin', cool: 'neutral', fierce: 'determined', goofy: 'tongue', tender: 'neutral' }[profile.spirit] as FaceCell;
  }
  return rest;
}

/** Reactions and front-end acting vary in tempo; physics-owned rates do not. */
export function actingRateFor(profile: PerformanceProfile, clip: AnimName): number {
  const base = profile.tempo === 'quick' ? 1.12 : profile.tempo === 'calm' ? 0.9 : 1;
  if (clip.startsWith('cheer') && profile.spirit === 'fierce') return base * 1.08;
  if (clip.startsWith('upset') && profile.spirit === 'tender') return base * 0.92;
  return base;
}

export function blinkEverySec(profile: PerformanceProfile): number {
  return profile.tempo === 'quick' ? 3.4 : profile.tempo === 'calm' ? 5.8 : 4.6;
}

export function fidgetEverySec(profile: PerformanceProfile): number {
  return profile.tempo === 'quick' ? 5.6 : profile.tempo === 'calm' ? 11.4 : 8.2;
}

/** Stable 0..1 phase from identity; no synchronized army of blinking kids. */
export function performancePhase(id: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h / 0x1_0000_0000;
}

/** Exported for the completeness gate; gameplay reads through performanceFor. */
export const PERFORMANCE_COUNT = ROSTER_PERFORMANCES.length;
