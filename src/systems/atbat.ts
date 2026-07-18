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
import { TIMING, LIVE, CURSOR } from '../config';
import { HOME, FENCE_Y, type Vec } from './geometry';
import type { PitchPlan, PlateLoc } from './pitchkind';

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
export function bandFromError(errorMs: number, timing: typeof TIMING = TIMING): SwingBand {
  const e = Math.abs(errorMs);
  if (e <= timing.PERFECT) return 'perfect';
  if (e <= timing.GOOD) return 'good';
  if (e <= timing.CONTACT) return 'weak';
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

  // Contact quality: the same shape as the old hitBases roll — band + power
  // (and a whisper of contact) push the ball deeper and harder.
  const bandBoost = band === 'perfect' ? 0.35 : band === 'good' ? 0.12 : 0;
  const q = rng() + bandBoost + (power - 5) * 0.04 + (contact - 5) * 0.01;

  const L = LIVE.LAUNCH;
  return {
    kind: 'inPlay',
    launch: buildLaunch({
      band,
      q,
      typeBias: 0,
      // Spray direction: RNG along the horizon between the foul lines.
      sprayT: () => L.SPRAY_MARGIN + rng() * (1 - 2 * L.SPRAY_MARGIN),
      rng,
    }),
  };
}

/** An aimed swing's result: the outcome plus the band actually credited. */
export interface AimedSwing {
  swing: SwingOutcome;
  /** The effective band after cursor overlap + abilities (for feedback UI). */
  band: SwingBand;
}

/**
 * Main-mode swing: timing band × cursor-vs-ball overlap decide the contact,
 * and WHERE the cursor met the ball decides the spray (inside = pull, outside
 * = opposite field, blended with early/late timing) and the launch shape
 * (under it = fly, over it = chopper). Same ability hooks as resolveContact.
 */
export function resolveContactAimed(spec: {
  band: SwingBand;
  /** Signed timing error, ms (negative = early). */
  errorMs: number;
  /** Where the swing cursor sat, plate coords. */
  cursor: PlateLoc;
  /** The pitch that was crossing (its `actual` is the ball's location). */
  plan: PitchPlan;
  batter: Character;
  pitcher: Character;
  rng: () => number;
}): AimedSwing {
  let { band } = spec;
  const { cursor, plan, batter, pitcher, rng } = spec;
  if (pitcher.ability === 'unhittable_pitch') band = downgrade(band);

  // Cursor overlap: dead-on keeps the timing band, the sweet-spot fringe costs
  // one band, and swinging where the ball isn't is a whiff.
  const missDist = Math.hypot(cursor.x - plan.actual.x, cursor.y - plan.actual.y);
  if (missDist > CURSOR.CONTACT_R) band = 'miss';
  else if (missDist > CURSOR.SWEET_R) band = downgrade(band);

  if (batter.ability === 'never_strikes_out' && band === 'miss') band = 'weak';

  if (band === 'miss') {
    return { swing: { kind: 'strike', description: 'Swing and a miss!' }, band };
  }
  if (band === 'weak' && rng() < 0.25) {
    return { swing: { kind: 'foul', description: 'Ticked it foul.' }, band };
  }

  const { contact, power } = batter.stats;
  const bandBoost = band === 'perfect' ? 0.35 : band === 'good' ? 0.12 : 0;
  const q = rng() + bandBoost + (power - 5) * 0.04 + (contact - 5) * 0.01;

  // Spray: early swings pull (left field), late go opposite (right field);
  // meeting the ball on its inner/outer half nudges the same way.
  const aimNudge = (cursor.x - plan.actual.x) / CURSOR.CONTACT_R;
  const sprayT = 0.5 + (spec.errorMs / 300) * 0.55 + aimNudge * 0.18;
  // Launch shape: cursor under the ball lifts it, over the top chops it down.
  const typeBias = Math.max(-1, Math.min(1, (cursor.y - plan.actual.y) / CURSOR.CONTACT_R));

  const launch = buildLaunch({
    band: band as Exclude<SwingBand, 'miss'>,
    q,
    typeBias,
    sprayT: () => sprayT,
    rng,
  });
  return { swing: { kind: 'inPlay', launch }, band };
}

/** Everything buildLaunch needs to shape a batted ball. */
export interface LaunchSpec {
  band: Exclude<SwingBand, 'miss'>;
  /** Contact quality (higher = deeper/harder). */
  q: number;
  /** Lifts (+, toward flies) or chops (−, toward grounders) the contact. */
  typeBias: number;
  /**
   * 0..1 along the fence, left line → right line. A thunk (not a value) so a
   * caller's rng rolls stay in the exact order the seeded tests expect.
   */
  sprayT: () => number;
  rng: () => number;
}

/**
 * Turn contact quality + direction into a Launch. Shared by the kid-mode RNG
 * spray path (resolveContact) and the main-mode aimed path (resolveContactAimed).
 */
export function buildLaunch(spec: LaunchSpec): Launch {
  const L = LIVE.LAUNCH;
  const { q } = spec;
  const type = contactType(spec.band, spec.rng, spec.typeBias);

  const t = Math.min(1 - L.SPRAY_MARGIN, Math.max(L.SPRAY_MARGIN, spec.sprayT()));
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

  return { type, landing, hangMs, rollSpeed, homer };
}

/**
 * Better timing lifts the ball: weak = choppers, perfect = liners and flies.
 * `bias` shifts the roll: + (swung under it) adds air, − (over it) chops down.
 */
function contactType(band: Exclude<SwingBand, 'miss'>, rng: () => number, bias = 0): ContactType {
  const r = Math.min(1, Math.max(0, rng() + bias * 0.3));
  if (band === 'weak') return r < 0.7 ? 'grounder' : r < 0.9 ? 'fly' : 'liner';
  if (band === 'good') return r < 0.45 ? 'grounder' : r < 0.75 ? 'liner' : 'fly';
  return r < 0.2 ? 'grounder' : r < 0.6 ? 'liner' : 'fly'; // perfect
}

