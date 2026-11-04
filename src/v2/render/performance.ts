// ---------------------------------------------------------------------------
// Character acting direction. PURE: the roster supplies identity, this file
// supplies how that identity behaves when the shared rig asks for a familiar
// baseball action.
//
// A shared skeleton must not mean thirty synchronized mannequins. Each roster
// slot below is an explicit acting choice: how the kid presents themself, how
// large a feeling becomes, and how quickly stillness turns into a fidget. The
// table is keyed by the slot ids `src/data/characters.ts` defines, and the test
// fails loudly on a slot it does not direct or a direction with no slot.
//
// Physics timing still wins. These choices affect held/front-end/reaction
// motion and face-atlas cells; marker clips and locomotion rates continue to be
// driven by the simulated instant and ground speed in AnimationDirector.
// ---------------------------------------------------------------------------

import type { Expression } from '../../data/types';
import type { AnimName } from './clips';
import { restingCell, type FaceCell } from './faceAtlas';

export type HeroStance = 'swagger' | 'batter' | 'glove' | 'bashful';
export type Spirit = 'sunny' | 'cool' | 'fierce' | 'goofy' | 'tender';
export type Tempo = 'calm' | 'steady' | 'quick';

/** These long-haired kids hold the ready bat ahead of their rear hair volume. This moves the
 * preparation only; the shared contact point still owns the actual swing. */
export function battingReadyDepth(id?: string): number {
  if (id === 'clover') return .75;
  return id === 'zippy' || id === 'penny' || id === 'bubbles' ? .72 : .6;
}

export interface PerformanceProfile {
  hero: HeroStance;
  spirit: Spirit;
  tempo: Tempo;
  restFace?: FaceCell;
}

/**
 * One direction per ROSTER slot, deliberately hand-authored rather than
 * hashed from stats or colours. The latter would manufacture variation; these
 * choices interpret the personality already written in each kid's name,
 * tagline, draft line and the World 1 cast sheet
 * (`docs/world1/kids-roster-v0.7.md`).
 *
 * Keyed by slot id, never by position: the November 2026 recast reordered
 * ROSTER and a positional table silently handed every kid a neighbour's
 * acting. The ids are slots (`characters.ts`); a slot with no direction here,
 * or a direction for a slot ROSTER no longer has, fails the completeness
 * test rather than drifting.
 */
const HERO = { s: 'swagger', b: 'batter', g: 'glove', h: 'bashful' } as const;
const SPIRIT = { s: 'sunny', c: 'cool', f: 'fierce', g: 'goofy', t: 'tender' } as const;
const TEMPO = { c: 'calm', s: 'steady', q: 'quick' } as const;

/** Three-character codes are hero/spirit/tempo, grouped as the cast sheet groups the kids. */
const DIRECTION_CODES: Readonly<Record<string, string>> = {
  // --- Tier 1 — the Seven. Seven silhouettes that do not repeat. ---------
  nostrike: 'bfs',       // Junebug — the underdog: planted at the plate, nine fouls with a straight face
  calls_shot: 'sgq',     // Mars — the swagger: the called shot IS the pose; wrong constantly, unembarrassed
  smokey: 'gfq',         // Jay — the intensity: glasses pushed up between every pitch, will not come out
  tank: 'gtc',           // Sonny — the heart: the immovable catcher who apologizes to the ball, softest voice, slowest
  wheelchair_ace: 'gsq', // Dev — the chaos: enormous grin, maximum delight, no idea where it goes
  rocket: 'gcq',         // Zaya — the prodigy: silent, locked in, already leaving
  bend_it: 'scc',        // Ezra — the purist: tall, slouchy, talks like a retired pitching coach
  // --- Tier 2 — the Neighborhood ------------------------------------------
  turbo: 'scq',          // Ollie — "Tag me. Go ahead. Try."
  zippy: 'bsq',          // Fatou — "Race you to first!"
  big_lou: 'sgc',        // Guri — the tall goofy slugger, banned from three yards, in no hurry
  mimi_mash: 'bgs',      // Yaz — swings with her eyes closed and insists it helps
  chip: 'bss',           // Toby — little guy, BIG swing
  diva: 'gcs',           // Roz — throws harder than Jay, never mentions it
  boomer: 'hts',         // Kwame — pure gas, sorry in advance
  grizz: 'gfc',          // Greta — built like a door; nothing gets past her, nothing
  gizmo: 'hss',          // Musa — watched the video twice, is ready, works 40% of the time
  peaches: 'bts',        // Hattie — the underrated sister; same soft single, same spot
  sniffles: 'bsq',       // Anton — Junebug's best friend, practices EVERY day
  cricket: 'bcc',        // Winnie — has never swung; it is a philosophy
  sprout: 'bgq',         // Rafi — bunts every single pitch
  clover: 'hgq',         // Josie — "Oops! Did I hit that at you?"
  noodle: 'hcs',         // Sam — stands in to get hit; calls it strategy
  penny: 'gcc',          // Nora — utterly ordinary until you are behind
  dex: 'bcs',            // Marcus — "Is this a real game? Then I am good."
  bubbles: 'hsq',        // Yui — "Me? Okay! Just put someone on base first."
  lefty: 'gfs',          // Lu — one perfect curve, all she throws
  the_prof: 'ggs',       // Bao — the Rainbow; look UP
  flash: 'gfq',          // Rudy — Roz's little sister; do not run on her
  ace_kid: 'scs',        // Amir — plays center alone, does not need help
  moose: 'ssq',          // Roya — watch THIS throw; which base does not matter
};

function profileOf(code: string): PerformanceProfile {
  return {
    hero: HERO[code[0] as keyof typeof HERO],
    spirit: SPIRIT[code[1] as keyof typeof SPIRIT],
    tempo: TEMPO[code[2] as keyof typeof TEMPO],
  };
}

const DEFAULT_PROFILE: PerformanceProfile = { hero: 'swagger', spirit: 'sunny', tempo: 'steady' };

const BY_ID = new Map(Object.entries(DIRECTION_CODES).map(([id, code]) => [id, profileOf(code)] as const));

/** True when a slot has an authored direction; the custom captain and unknown ids fall to the default. */
export function hasDirection(id: string): boolean {
  return BY_ID.has(id);
}

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
  const rest = profile.restFace ?? restingCell(authoredRest);

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
export const PERFORMANCE_COUNT = BY_ID.size;
