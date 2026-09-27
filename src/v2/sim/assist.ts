// ---------------------------------------------------------------------------
// Skill levels: T-BALL, ROOKIE, NORMAL, ALL-STAR. PURE.
//
// ★ AN ASSIST SUPPLIES INPUTS, NEVER OUTCOMES. The swing model's rule is that a
// person supplies the model's own two error terms (`atbat.ts` `resolvePitch`).
// T-BALL keeps that rule: it shrinks the person's timing and aim errors toward
// the pitch before the model sees them, so contact, launch and the play are
// still the physics, and a kid with a weak bat still hits weakly. There is no
// hit rate here, and no fielding assist (`src/v2/AGENTS.md` § The human).
//
// ★ ONLY A PERSON'S SIDE IS EVER TOUCHED. Every function here is a no-op unless
// the game names a human side, and headless runs never do — so the harness, the
// golden fingerprints and every measurement record see NORMAL by construction.
// NORMAL is the identity everywhere: no draw, no copy, no arithmetic.
//
// What each level changes, and only where a person is playing:
//   · the CPU pitcher's PLAN when the person bats (T-BALL: a slow one down the
//     middle; ALL-STAR: always on the edge of the zone),
//   · the person's swing error (T-BALL removes most of it, ALL-STAR none),
//   · the CPU batter's contact stat when the person pitches (T-BALL weaker,
//     ALL-STAR sharper) — a stat, so `athletes.ts` still owns what it means.
// ---------------------------------------------------------------------------

import { ATBAT } from './params';
import { PITCH_SPOTS } from './pitch';
import { zoneBandFt, zoneHalfWidthFt } from './athletes';
import type { Character } from '../../data/types';
import type { HumanSwing, PitchInFlight, PitchPlan, PitchSpec } from './atbat';
import type { Rng } from './rng';

export type Skill = 'tball' | 'rookie' | 'normal' | 'allstar';

export const SKILLS: ReadonlyArray<Skill> = Object.freeze(['tball', 'rookie', 'normal', 'allstar'] as const);

export const DEFAULT_SKILL: Skill = 'normal';

interface SkillDef {
  /** Fraction of the person's TIMING error removed before the model sees it. */
  timingPull: number;
  /** Fraction of the person's AIM error removed (toward `SWEET_UNDERCUT_FT`). */
  aimPull: number;
  /** How the CPU pitches to a person. */
  cpuPitch: 'meatball' | 'normal' | 'edge';
  /** Added to a CPU batter's contact stat while a person pitches, clamped 1..10. */
  cpuContactDelta: number;
}

export const SKILL_DEFS: Readonly<Record<Skill, SkillDef>> = Object.freeze({
  // Measured on a clumsy, wandering-late tap over four seeds (`assist.test.ts`):
  // NORMAL 10 hits / 18 K, T-BALL 21 hits / 0 K. Aim matters more than timing —
  // a little timing error left in is what sprays the ball into the gaps.
  tball: { timingPull: 0.75, aimPull: 0.9, cpuPitch: 'meatball', cpuContactDelta: -3 },
  rookie: { timingPull: 0.4, aimPull: 0.5, cpuPitch: 'normal', cpuContactDelta: -1 },
  normal: { timingPull: 0, aimPull: 0, cpuPitch: 'normal', cpuContactDelta: 0 },
  allstar: { timingPull: 0, aimPull: 0, cpuPitch: 'edge', cpuContactDelta: 2 },
});

export function parseSkill(raw: string | null | undefined): Skill {
  return (SKILLS as readonly string[]).includes(raw ?? '') ? (raw as Skill) : DEFAULT_SKILL;
}

/**
 * The CPU's plan against a person, or undefined for "choose as usual".
 *
 * The meatball is the CHANGEUP, the slowest base kind, aimed at the middle of
 * the zone — the pitcher's own execution scatter still applies downstream, so a
 * wild arm is still a little wild. The edge plan draws its spot from its own
 * fork so no other stream moves.
 */
export function assistPitchPlan(skill: Skill, spec: PitchSpec, rng: Rng): PitchPlan | undefined {
  const mode = SKILL_DEFS[skill].cpuPitch;
  if (mode === 'normal') return undefined;
  const [lo, hi] = zoneBandFt();
  const mid = (lo + hi) / 2;
  if (mode === 'meatball') return { kind: 'fastball', aimLateralFt: 0, aimHeightFt: mid };
  const r = rng.fork('allstar');
  const kinds = ['fastball', 'changeup', 'curve', 'screwball'] as const;
  const kind = r.pick(kinds);
  // Behind in the count he still has to come in; otherwise he paints.
  const behind = spec.count.balls >= ATBAT.BALLS_PER_WALK - 1;
  const ring = behind ? ATBAT.SPOT_RING_IN : ATBAT.SPOT_RING_EDGE;
  const spot = r.pick(PITCH_SPOTS);
  return {
    kind,
    aimLateralFt: spot.lateral * zoneHalfWidthFt() * ring,
    aimHeightFt: mid + spot.height * ((hi - lo) / 2) * ring,
  };
}

/**
 * From this pitch of a plate appearance on, T-BALL's pull ramps toward a
 * perfect swing, one `PATIENCE_STEP` a pitch.
 *
 * ★ WITHOUT IT T-BALL CAN FOUL FOREVER. A meatball is nearly the same pitch
 * every time, so a child repeating the same slightly-late tap gets the same
 * foul every time — a foul is never strike three — and the plate appearance
 * runs into `GAME.MAX_PITCHES_PER_PA`, which throws. The ramp guarantees the
 * at-bat ends in the ball in play the level promises.
 */
export const PATIENCE_FROM_PITCH = 6;
/**
 * Where T-BALL pulls the aim: this far UNDER the ball's centre, not at it.
 * Dead centre launches at the swing plane alone (`BAT.ATTACK_ANGLE_DEG`), a
 * low skipper the infield eats; a few hundredths of a foot under lifts it
 * into a line drive (`contact.ts`: asin(undercut / centre separation)).
 */
export const SWEET_UNDERCUT_FT = 0.045;
export const PATIENCE_STEP = 0.1;

/** The person's swing with part of its error removed. Identity at NORMAL. */
export function assistSwing(
  skill: Skill,
  swing: HumanSwing | undefined,
  pitch: PitchInFlight,
  pitchOfPa = 1
): HumanSwing | undefined {
  const def = SKILL_DEFS[skill];
  if (!swing || (def.timingPull === 0 && def.aimPull === 0)) return swing;
  const patience = Math.max(0, pitchOfPa - PATIENCE_FROM_PITCH) * PATIENCE_STEP;
  const keepT = 1 - Math.min(1, def.timingPull + patience);
  const keepA = 1 - Math.min(1, def.aimPull + patience);
  const sweet = pitch.crossing.y - SWEET_UNDERCUT_FT;
  return {
    atSec: pitch.travelSec + (swing.atSec - pitch.travelSec) * keepT,
    aimHeightFt: sweet - (sweet - swing.aimHeightFt) * keepA,
  };
}

/** A CPU batter facing a person, with the level's contact delta. Same object at NORMAL. */
export function assistBatter(skill: Skill, batter: Character): Character {
  const delta = SKILL_DEFS[skill].cpuContactDelta;
  if (delta === 0) return batter;
  const contact = Math.min(10, Math.max(1, batter.stats.contact + delta));
  return { ...batter, stats: { ...batter.stats, contact } };
}
