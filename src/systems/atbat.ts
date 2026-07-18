// ---------------------------------------------------------------------------
// At-bat resolution. PURE. Two ideas kept separate on purpose:
//
//   TIMING is the skill  -> how close the swing was decides the "band".
//   STATS are the flavor -> within a band, the kid's stats shape the LAUNCH.
//
// Since the live-play rework, a swing resolves into a trajectory (grounder /
// liner / fly, where it lands, how long it hangs) — NOT a hit/out. Whether it
// becomes a hit or an out emerges from the interactive play in liveplay.ts.
// Only home runs are decided here (crushed flies that clear the fence).
// Ability hooks (never_strikes_out, unhittable_pitch) still apply to the band.
// ---------------------------------------------------------------------------

import type { Character } from '../data/types';
import { TIMING, LIVE } from '../config';
import { HOME, FENCE_Y, type Vec } from './geometry';

export type SwingBand = 'perfect' | 'good' | 'weak' | 'miss';

export type AtBatKind = 'hit' | 'out' | 'strike' | 'foul' | 'ball';

export interface AtBatResult {
  kind: AtBatKind;
  /** Bases the batter takes on a hit: 1=single .. 4=home run. 0 otherwise. */
  bases: number;
  /** Short, kid-readable line for the announcer / speech bubble. */
  description: string;
}

/** Map swing-timing error (ms) to a band. A late/no swing is handled by the caller. */
export function bandFromError(errorMs: number): SwingBand {
  const e = Math.abs(errorMs);
  if (e <= TIMING.PERFECT) return 'perfect';
  if (e <= TIMING.GOOD) return 'good';
  if (e <= TIMING.CONTACT) return 'weak';
  return 'miss';
}

const BAND_ORDER: SwingBand[] = ['miss', 'weak', 'good', 'perfect'];

/** Shift a band down one step (used by unhittable_pitch). */
function downgrade(band: SwingBand): SwingBand {
  const i = BAND_ORDER.indexOf(band);
  return BAND_ORDER[Math.max(0, i - 1)];
}

// --- Contact → launch (the interactive live-play path) ----------------------

export type ContactType = 'grounder' | 'liner' | 'fly';

/** A batted ball's trajectory. The live-play sim turns this into outs/hits. */
export interface Launch {
  type: ContactType;
  /** Where the ball lands (fly/liner) or settles (grounder), screen coords. */
  landing: Vec;
  /** Air time in ms (0 for grounders). */
  hangMs: number;
  /** Initial ground speed (px/s) — grounders decelerate to stop at `landing`. */
  rollSpeed: number;
  /** Over the fence — skip the live play and celebrate. */
  homer: boolean;
}

export type SwingOutcome =
  | { kind: 'strike' | 'foul'; description: string }
  | { kind: 'inPlay'; launch: Launch };

/**
 * Resolve a swing into a LAUNCH, not an outcome — whether it becomes a hit or
 * an out now emerges from the live fielding/running play. Keeps the same band
 * logic and ability hooks as resolveSwing, but the only dice rolled here are
 * "where does the ball go".
 */
export function resolveContact(
  band: SwingBand,
  batter: Character,
  pitcher: Character,
  rng: () => number
): SwingOutcome {
  if (pitcher.ability === 'unhittable_pitch') band = downgrade(band);
  if (batter.ability === 'never_strikes_out' && band === 'miss') band = 'weak';

  if (band === 'miss') {
    return { kind: 'strike', description: 'Swing and a miss!' };
  }

  // Weak contact still has a small chance to be fouled straight off.
  if (band === 'weak' && rng() < 0.25) {
    return { kind: 'foul', description: 'Ticked it foul.' };
  }

  const { contact, power } = batter.stats;
  const L = LIVE.LAUNCH;

  // Contact quality: the same shape as the old hitBases roll — band + power
  // (and a whisper of contact) push the ball deeper and harder.
  const bandBoost = band === 'perfect' ? 0.35 : band === 'good' ? 0.12 : 0;
  const q = rng() + bandBoost + (power - 5) * 0.04 + (contact - 5) * 0.01;

  const type = contactType(band, rng);

  // Spray direction: a point along the horizon between the foul lines.
  const t = L.SPRAY_MARGIN + rng() * (1 - 2 * L.SPRAY_MARGIN);
  const target: Vec = { x: 132 + t * (828 - 132), y: FENCE_Y };
  const dirLen = Math.hypot(target.x - HOME.x, target.y - HOME.y);
  const dir: Vec = { x: (target.x - HOME.x) / dirLen, y: (target.y - HOME.y) / dirLen };

  const distFor: Record<ContactType, number> = {
    grounder: L.GROUNDER_DIST.BASE + Math.max(0, q) * L.GROUNDER_DIST.SCALE,
    liner: L.LINER_DIST.BASE + Math.max(0, q) * L.LINER_DIST.SCALE,
    fly: L.FLY_DIST.BASE + Math.max(0, q) * L.FLY_DIST.SCALE,
  };

  // A crushed fly clears the fence outright.
  const homer = type === 'fly' && q > L.HR_Q;
  // Everything else stays on the field, just short of the wall.
  const maxDist = dirLen - 14;
  const d = homer ? dirLen + 60 : Math.min(distFor[type], maxDist);
  const landing: Vec = { x: HOME.x + dir.x * d, y: HOME.y + dir.y * d };

  const depth = Math.min(1, d / dirLen);
  const hangMs =
    type === 'fly'
      ? L.FLY_HANG_MS.MIN + depth * (L.FLY_HANG_MS.MAX - L.FLY_HANG_MS.MIN)
      : type === 'liner'
        ? L.LINER_HANG_MS.MIN + depth * (L.LINER_HANG_MS.MAX - L.LINER_HANG_MS.MIN)
        : 0;
  const rollSpeed =
    L.GROUNDER_SPEED.MIN + Math.min(1, Math.max(0, q)) * (L.GROUNDER_SPEED.MAX - L.GROUNDER_SPEED.MIN);

  return { kind: 'inPlay', launch: { type, landing, hangMs, rollSpeed, homer } };
}

/** Better timing lifts the ball: weak = choppers, perfect = liners and flies. */
function contactType(band: Exclude<SwingBand, 'miss'>, rng: () => number): ContactType {
  const r = rng();
  if (band === 'weak') return r < 0.7 ? 'grounder' : r < 0.9 ? 'fly' : 'liner';
  if (band === 'good') return r < 0.45 ? 'grounder' : r < 0.75 ? 'liner' : 'fly';
  return r < 0.2 ? 'grounder' : r < 0.6 ? 'liner' : 'fly'; // perfect
}

