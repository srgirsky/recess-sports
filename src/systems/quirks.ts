// ---------------------------------------------------------------------------
// Signature behaviours. PURE. The habit or flaw the cast sheet gives a kid,
// as something that happens on the field.
//
// ★ ONE RULE HOLDS ALL OF THIS TOGETHER: A KID WITHOUT A QUIRK NEVER REACHES
// AN EXTRA RNG DRAW. Every hook here returns the unmodified value, drawing
// nothing, unless the kid in question carries the quirk it reads. That is what
// keeps a game with none of these eleven kids in it identical to the game
// before they had behaviours, and it is why each call site asks this module
// instead of rolling for itself.
//
// The numbers are `config.QUIRKS`, and none of them is measured — see the
// warning there. What each kid does:
//
//   never_swings   Winnie    takes every pitch; her zone is the smallest around
//   green_light    Zaya      goes on her own, and gets a better jump
//   wild_arm       Kwame     his pitches scatter; so do the balls
//   wobble         Dev       the same, milder (his `unhittable_pitch` ability
//                            is what makes the wobble hard to hit)
//   wrong_base     Roya      a full-power throw to a bag nobody chose
//   clutch_*       Nora, Marcus, Yui   ordinary until their moment, then a slugger
//   moonshot       Mars      perfect timing is a home run, whatever was thrown
//   foul_back      Josie     weak contact goes foul far more often
//   same_spot      Hattie    every ball in play lands in the same place
//
// A kid the PLAYER controls keeps the quirk: the player times Mars's swing and
// steers Roya's throw, and the quirk does the rest. The two that take a choice
// away — Winnie will not swing, Zaya goes when she likes — are the two whose
// whole character is that nobody tells them what to do.
// ---------------------------------------------------------------------------

import type { Character, Quirk } from '../data/types';
import { PLATE_ZONE, QUIRKS } from '../config';
import type { PitchPlan, PlateLoc } from './pitchkind';

const has = (kid: Character | undefined, q: Quirk): boolean => kid?.quirk === q;

// --- The batter -------------------------------------------------------------

/** Winnie has never swung the bat. */
export function neverSwings(batter: Character): boolean {
  return has(batter, 'never_swings');
}

/** The fraction of the standard strike zone this batter presents. */
export function zoneScaleFor(batter: Character): number {
  return has(batter, 'never_swings') ? QUIRKS.SMALL_ZONE : 1;
}

/** Is this point a strike to THIS batter? */
export function inZoneFor(p: PlateLoc, batter: Character): boolean {
  const k = zoneScaleFor(batter);
  return Math.abs(p.x) <= (PLATE_ZONE.W / 2) * k && Math.abs(p.y) <= (PLATE_ZONE.H / 2) * k;
}

/**
 * The same pitch, called against this batter's zone. Returns the plan it was
 * given for every kid with a standard zone, so nothing downstream can tell.
 */
export function planForBatter(plan: PitchPlan, batter: Character): PitchPlan {
  if (zoneScaleFor(batter) === 1) return plan;
  return { ...plan, inZone: inZoneFor(plan.actual, batter) };
}

/** What a Clutch kid needs to know about the moment she steps in. */
export interface Moment {
  /** bases[0] = first. */
  bases: readonly [boolean, boolean, boolean];
  /** Her team's runs minus the other team's. */
  lead: number;
}

/** Is this the moment this Clutch kid shows up for? False for everyone else. */
export function clutchFiring(batter: Character, m: Moment): boolean {
  switch (batter.quirk) {
    case 'clutch_behind':
      return m.lead < 0;
    case 'clutch_risp':
      return (m.bases[1] || m.bases[2]) && m.lead <= 0;
    case 'clutch_runners':
      return m.bases[0] || m.bases[1] || m.bases[2];
    default:
      return false;
  }
}

/** The kid as she bats RIGHT NOW: a Clutch kid in her moment hits like a slugger. */
export function batterInMoment(batter: Character, m: Moment): Character {
  if (!clutchFiring(batter, m)) return batter;
  return { ...batter, stats: { ...batter.stats, power: Math.max(batter.stats.power, QUIRKS.CLUTCH_POWER) } };
}

/** Mars: is perfectly timed contact from this kid gone, whatever was thrown? */
export function isMoonshot(batter: Character): boolean {
  return has(batter, 'moonshot');
}

/** Chance that weak contact is fouled off. */
export function foulChance(batter: Character): number {
  return has(batter, 'foul_back') ? QUIRKS.FOUL_BACK : 0.25;
}

/** What the booth says when this kid fouls one off. */
export function foulLine(batter: Character): string {
  return has(batter, 'foul_back') ? 'Fouled it back at the pitcher!' : 'Ticked it foul.';
}

/** Hattie's spot, or null for a kid whose ball goes where she hit it. */
export function sameSpot(batter: Character): { spray: number; dist: number } | null {
  return has(batter, 'same_spot') ? { spray: QUIRKS.SAME_SPOT.SPRAY, dist: QUIRKS.SAME_SPOT.DIST } : null;
}

// --- The pitcher ------------------------------------------------------------

/** How much wider this arm's pitches land than its pitching stat says. */
export function scatterMultFor(pitcher: Character): number {
  if (has(pitcher, 'wild_arm')) return QUIRKS.SCATTER_MULT.wild_arm;
  if (has(pitcher, 'wobble')) return QUIRKS.SCATTER_MULT.wobble;
  return 1;
}

/** Added to the chance of a ball where a pitch has no location (kid mode). */
export function ballBumpFor(pitcher: Character): number {
  if (has(pitcher, 'wild_arm')) return QUIRKS.BALL_BUMP.wild_arm;
  if (has(pitcher, 'wobble')) return QUIRKS.BALL_BUMP.wobble;
  return 0;
}

// --- The runner -------------------------------------------------------------

/** Zaya steals when she feels like it. */
export function hasGreenLight(runner: Character): boolean {
  return has(runner, 'green_light');
}

/** Added to this runner's steal odds. */
export function stealEdgeFor(runner: Character): number {
  return has(runner, 'green_light') ? QUIRKS.GREEN_LIGHT_EDGE : 0;
}

// --- The fielder ------------------------------------------------------------

/** Chance that one of this kid's throws goes to a base nobody chose. */
export function wrongBaseChance(fielder: Character): number {
  return has(fielder, 'wrong_base') ? QUIRKS.WRONG_BASE : 0;
}
