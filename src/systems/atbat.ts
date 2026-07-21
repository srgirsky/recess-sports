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
import { TIMING, LIVE, CURSOR, JUICE, SWING_TYPES } from '../config';
import { HOME, DEFAULT_GEOMETRY, fencePointAt, type FieldGeometry, type Vec } from './geometry';
import type { PitchPlan, PlateLoc } from './pitchkind';

export type SwingBand = 'perfect' | 'good' | 'weak' | 'miss';

/** Pre-pitch swing choice (CLASSIC): trade contact ease against power. */
export type SwingType = 'normal' | 'safe' | 'big' | 'bunt';

/**
 * The timing windows for a swing type: SAFE widens every band (easy contact),
 * BIG narrows the contact tail (crushed or nothing), BUNT is trivially easy
 * to get bat on. The band the caller computes from these feeds the resolver.
 */
export function timingForSwing(base: typeof TIMING, type: SwingType): typeof TIMING {
  switch (type) {
    case 'safe': {
      const f = SWING_TYPES.SAFE.FORGIVE_MS;
      return { PERFECT: base.PERFECT + f * 0.5, GOOD: base.GOOD + f, CONTACT: base.CONTACT + f };
    }
    case 'big': {
      const n = SWING_TYPES.BIG.NARROW_MS;
      return {
        PERFECT: base.PERFECT,
        GOOD: Math.max(base.PERFECT + 10, base.GOOD - n * 0.5),
        CONTACT: Math.max(base.PERFECT + 20, base.CONTACT - n),
      };
    }
    case 'bunt':
      return { ...base, CONTACT: base.CONTACT + SWING_TYPES.BUNT.FORGIVE_MS };
    default:
      return base;
  }
}

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

/** Shift a band up one step (the juice-powered swing). */
function upgrade(band: SwingBand): SwingBand {
  const i = BAND_ORDER.indexOf(band);
  return BAND_ORDER[Math.min(BAND_ORDER.length - 1, i + 1)];
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
  rng: () => number,
  geo?: FieldGeometry
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
      geo,
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
  /** A spent juice POWER SWING: band steps up + a quality bonus. */
  boost?: { power: boolean };
  /** Pre-pitch swing choice. Default 'normal' (unmodified). */
  swingType?: SwingType;
  /** The venue's field shape. Default: the park. */
  geo?: FieldGeometry;
}): AimedSwing {
  let { band } = spec;
  const { cursor, plan, batter, pitcher, rng } = spec;
  const powered = spec.boost?.power === true;
  const swingType = spec.swingType ?? 'normal';
  if (pitcher.ability === 'unhittable_pitch') band = downgrade(band);

  // Cursor overlap: dead-on keeps the timing band, the sweet-spot fringe costs
  // one band, and swinging where the ball isn't is a whiff.
  const missDist = Math.hypot(cursor.x - plan.actual.x, cursor.y - plan.actual.y);
  if (missDist > CURSOR.CONTACT_R) band = 'miss';
  else if (missDist > CURSOR.SWEET_R) band = downgrade(band);

  if (batter.ability === 'never_strikes_out' && band === 'miss') band = 'weak';
  // A power swing muscles decent contact up a band — but can't fix a whiff.
  if (powered && band !== 'miss') band = upgrade(band);
  // The BIG swing is all-or-nothing: weak contact becomes a whiff outright.
  if (swingType === 'big' && band === 'weak') band = 'miss';

  if (band === 'miss') {
    return { swing: { kind: 'strike', description: 'Swing and a miss!' }, band };
  }
  if (band === 'weak' && rng() < 0.25) {
    return { swing: { kind: 'foul', description: 'Ticked it foul.' }, band };
  }

  const { contact, power } = batter.stats;
  const bandBoost = band === 'perfect' ? 0.35 : band === 'good' ? 0.12 : 0;
  const swingQAdj =
    swingType === 'safe'
      ? SWING_TYPES.SAFE.Q_ADJ
      : swingType === 'big'
        ? SWING_TYPES.BIG.Q_ADJ
        : swingType === 'bunt'
          ? SWING_TYPES.BUNT.Q_ADJ
          : 0;
  let q =
    rng() +
    bandBoost +
    (power - 5) * 0.04 +
    (contact - 5) * 0.01 +
    (powered ? JUICE.POWER_Q_BONUS : 0) +
    swingQAdj;

  // Spray: early swings pull (left field), late go opposite (right field);
  // meeting the ball on its inner/outer half nudges the same way.
  const aimNudge = (cursor.x - plan.actual.x) / CURSOR.CONTACT_R;
  let sprayT = 0.5 + (spec.errorMs / 300) * 0.55 + aimNudge * 0.18;
  // Launch shape: cursor under the ball lifts it, over the top chops it down.
  let typeBias = Math.max(-1, Math.min(1, (cursor.y - plan.actual.y) / CURSOR.CONTACT_R));
  if (swingType === 'big') typeBias += SWING_TYPES.BIG.TYPE_BIAS;
  // A bunt is deadened in front of the plate, kept between the lines.
  if (swingType === 'bunt') {
    const B = SWING_TYPES.BUNT;
    sprayT = Math.min(B.SPRAY_MAX, Math.max(B.SPRAY_MIN, sprayT));
  }

  // The kid who ALWAYS calls his shot (and is always wrong) finally gets to be
  // right — a powered swing from him is a guaranteed moonshot.
  const calledShot = powered && batter.ability === 'calls_shot';
  if (calledShot) {
    q = Math.max(q, JUICE.CALLED_SHOT_Q_FLOOR);
    typeBias = 1;
  }

  const launch = buildLaunch({
    band: band as Exclude<SwingBand, 'miss'>,
    q,
    typeBias,
    forceType: calledShot ? 'fly' : swingType === 'bunt' ? 'grounder' : undefined,
    distCap: swingType === 'bunt' ? SWING_TYPES.BUNT.DIST_CAP : undefined,
    sprayT: () => sprayT,
    rng,
    geo: spec.geo,
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
  /** Skip the contact-type roll entirely (the called shot IS a fly). */
  forceType?: ContactType;
  /** Hard cap on travel distance, px from home (the bunt's dead ball). */
  distCap?: number;
  /** The venue's field shape (fence distances / obstacles). Default: the park. */
  geo?: FieldGeometry;
}

/**
 * Turn contact quality + direction into a Launch. Shared by the kid-mode RNG
 * spray path (resolveContact) and the main-mode aimed path (resolveContactAimed).
 */
export function buildLaunch(spec: LaunchSpec): Launch {
  const L = LIVE.LAUNCH;
  const geo = spec.geo ?? DEFAULT_GEOMETRY;
  const { q } = spec;
  const type = spec.forceType ?? contactType(spec.band, spec.rng, spec.typeBias);

  const t = Math.min(1 - L.SPRAY_MARGIN, Math.max(L.SPRAY_MARGIN, spec.sprayT()));
  // The fence distance varies by direction (a short porch = cheap homers there).
  const target: Vec = fencePointAt(geo, t);
  const dirLen = Math.hypot(target.x - HOME.x, target.y - HOME.y);
  const dir: Vec = { x: (target.x - HOME.x) / dirLen, y: (target.y - HOME.y) / dirLen };

  const distFor: Record<ContactType, number> = {
    grounder: L.GROUNDER_DIST.BASE + Math.max(0, q) * L.GROUNDER_DIST.SCALE,
    liner: L.LINER_DIST.BASE + Math.max(0, q) * L.LINER_DIST.SCALE,
    fly: L.FLY_DIST.BASE + Math.max(0, q) * L.FLY_DIST.SCALE,
  };

  // A crushed fly clears the fence outright. The threshold scales with how
  // far THIS venue's fence is versus the park's — squared, so a short porch
  // reads as genuinely cheap homers instead of a rounding error.
  const refTarget = fencePointAt(DEFAULT_GEOMETRY, t);
  const refLen = Math.hypot(refTarget.x - HOME.x, refTarget.y - HOME.y);
  const homer = type === 'fly' && q > L.HR_Q * (dirLen / refLen) ** 2;
  // Everything else stays on the field, just short of the wall.
  const maxDist = dirLen - 14;
  const d = homer ? dirLen + 60 : Math.min(distFor[type], maxDist, spec.distCap ?? Infinity);
  const landing: Vec = { x: HOME.x + dir.x * d, y: HOME.y + dir.y * d };
  // Nothing settles inside a tree — nudge the landing to its edge.
  if (!homer) {
    for (const o of geo.obstacles) {
      const d0 = Math.hypot(landing.x - o.x, landing.y - o.y);
      if (d0 < o.r + 6) {
        const push = (o.r + 8) / Math.max(1, d0);
        landing.x = o.x + (landing.x - o.x) * push;
        landing.y = o.y + (landing.y - o.y) * push;
      }
    }
  }

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

