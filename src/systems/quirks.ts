// ---------------------------------------------------------------------------
// Signature behaviours. PURE. The habit or flaw the cast sheet gives a kid,
// as something that happens on the field.
//
// ★ ONE RULE HOLDS ALL OF THIS TOGETHER: A KID WITHOUT A QUIRK NEVER REACHES
// AN EXTRA RNG DRAW. Every hook here returns the unmodified value, drawing
// nothing, unless the kid in question carries the quirk it reads. That is what
// keeps a game with none of these kids in it identical to the game
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
//   hit_by_pitch   Sam       never chases; a ball he takes may hit him — free base
//   always_bunts   Rafi      every swing of his is a bunt
//   one_curve      Lu        the curve is her whole menu
//   the_loop       Ezra      no fastball; batters always go after his curve
//   rainbow        Bao       every pitch arrives late, on a high arc
//   heater         Jay       one fastball a half inning at full gas, for double
//                            the stamina; and nobody takes him off the mound
//   velocity       Roz       every pitch arrives early
//   forty_percent  Musa      one pitch: a wobbler that works, or a floater
//   brick_house    Sonny     never drops one, and reaches further than anyone
//   sure_hands     Greta     never drops one
//   never_tagged   Ollie     no tag, caught-stealing or pickoff ever gets him
//   fence_arm      Rudy      throws half again as hard, straight to the bag
//   plays_alone    Amir      the same arm, and he covers the ground himself
//   eyes_closed    Yaz       the ball vanishes halfway; what she hits, she HITS
//
// A kid the PLAYER controls keeps the quirk: the player times Mars's swing and
// steers Roya's throw, and the quirk does the rest. The two that take a choice
// away — Winnie will not swing, Zaya goes when she likes — are the two whose
// whole character is that nobody tells them what to do.
// ---------------------------------------------------------------------------

import type { Character, Quirk } from '../data/types';
import { PLATE_ZONE, QUIRKS, type PitchKind } from '../config';
import type { HalfInningState } from './inning';
import type { PitchPlan, PlateLoc } from './pitchkind';
import type { SwingBand } from './atbat';

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

/** Rafi bunts every single pitch. */
export function alwaysBunts(batter: Character): boolean {
  return has(batter, 'always_bunts');
}

/** Sam does not chase: a ball is an opportunity. */
export function leansIn(batter: Character): boolean {
  return has(batter, 'hit_by_pitch');
}

/** Chance that a ball this batter TAKES hits him instead. */
export function hitByPitchChance(batter: Character): number {
  return has(batter, 'hit_by_pitch') ? QUIRKS.HIT_BY_PITCH : 0;
}

/**
 * The half inning as it stands the instant he is hit: one ball short of a
 * walk, so the ball about to be recorded sends him to first and moves only the
 * runners he forces — which is exactly the rule for a hit batter. Done here
 * rather than as a new at-bat result so the rules layer, which both games
 * share, does not grow a case only one of them can reach.
 */
export function countWhenHit(state: HalfInningState): HalfInningState {
  return { ...state, count: { ...state.count, balls: 3 } };
}

/** Yaz swings with her eyes closed. */
export function swingsBlind(batter: Character): boolean {
  return has(batter, 'eyes_closed');
}

/** The fraction of a pitch's flight this batter can see (1 = all of it). */
export function ballVisibleUntil(batter: Character): number {
  return has(batter, 'eyes_closed') ? QUIRKS.EYES_CLOSED_AT : 1;
}

const BAND_UP: Record<SwingBand, SwingBand> = { miss: 'miss', weak: 'good', good: 'perfect', perfect: 'perfect' };

/**
 * A HUMAN's timing band, as this kid swings it. Yaz insists closing her eyes
 * helps, and it does: whatever she touches goes up a band. A miss stays a miss.
 */
export function blindSwingBand(batter: Character, band: SwingBand): SwingBand {
  return has(batter, 'eyes_closed') ? BAND_UP[band] : band;
}

/**
 * The CPU's swing for a kid who is not looking: a lottery that ignores the
 * pitch. Null for everyone else — draw the usual contact roll instead. One
 * draw either way, so the stream is the same length with or without her.
 */
export function cpuBlindBand(batter: Character, rng: () => number): SwingBand | null {
  if (!has(batter, 'eyes_closed')) return null;
  const r = rng();
  const t = QUIRKS.EYES_CLOSED_BANDS;
  return r < t.perfect ? 'perfect' : r < t.good ? 'good' : r < t.weak ? 'weak' : 'miss';
}

// --- The pitcher ------------------------------------------------------------

const BASE_MENU: readonly PitchKind[] = ['fastball', 'changeup', 'curve', 'screwball'];
const LU_MENU: readonly PitchKind[] = ['curve'];
const EZRA_MENU: readonly PitchKind[] = ['changeup', 'curve', 'screwball'];
const MUSA_MENU: readonly PitchKind[] = ['changeup'];

/**
 * The pitches this kid throws without juice. Lu has one; Ezra has never thrown
 * a fastball. Everyone else gets the standard four, in the standard order —
 * the CPU samples this list with ONE draw whatever its length.
 */
export function pitchMenuFor(pitcher: Character): readonly PitchKind[] {
  if (has(pitcher, 'one_curve')) return LU_MENU;
  if (has(pitcher, 'the_loop')) return EZRA_MENU;
  if (has(pitcher, 'forty_percent')) return MUSA_MENU;
  return BASE_MENU;
}

/**
 * The pitch this kid actually throws when asked for `kind`: a base pitch that
 * is not on her menu becomes the first one that is. Juice specials are not
 * base pitches and pass through untouched.
 */
export function pitchOnMenu(pitcher: Character, kind: PitchKind): PitchKind {
  const menu = pitchMenuFor(pitcher);
  return BASE_MENU.includes(kind) && !menu.includes(kind) ? menu[0] : kind;
}

/** Ezra's Loop starts outside the zone and lands in it: batters always swing. */
export function batterMustChase(pitcher: Character, kind: PitchKind): boolean {
  return has(pitcher, 'the_loop') && kind === 'curve';
}

/** How many times longer this kid's pitches take to arrive. */
export function travelMultFor(pitcher: Character): number {
  if (has(pitcher, 'rainbow')) return QUIRKS.RAINBOW_TRAVEL;
  if (has(pitcher, 'velocity')) return QUIRKS.VELOCITY_TRAVEL;
  return 1;
}

/**
 * Is THIS pitch Jay's Heater? One a half inning: his first fastball, or his
 * first pitch where pitches have no kind (`kind === null`, kid mode). The
 * caller owns `thrownThisHalf` and sets it when this returns true.
 */
export function throwsHeater(pitcher: Character, kind: PitchKind | null, thrownThisHalf: boolean): boolean {
  return has(pitcher, 'heater') && !thrownThisHalf && (kind === null || kind === 'fastball');
}

/** How many times as fast the Heater arrives. */
export function heaterTravelMult(): number {
  return QUIRKS.HEATER_TRAVEL;
}

/** The same pitch, thrown as the Heater. */
export function heaterPlan(plan: PitchPlan): PitchPlan {
  return { ...plan, travelMs: plan.travelMs * QUIRKS.HEATER_TRAVEL };
}

/** Jay will not come out. Nobody relieves him, him included. */
export function refusesRelief(pitcher: Character): boolean {
  return has(pitcher, 'heater');
}

/**
 * Chance a CPU batter is LATE on this pitch — down one band. The Heater
 * always; anything of Roz's sometimes; 0 for everyone else, and 0 and 1 are
 * both decided without a draw (`pitch.swingLate`).
 */
export function lateSwingChance(pitcher: Character, heater: boolean): number {
  if (heater) return 1;
  return has(pitcher, 'velocity') ? QUIRKS.VELOCITY_LATE : 0;
}

/** How one of Musa's wobblers came out. */
export type Wobbler = 'works' | 'flat';

/**
 * Musa's one pitch: it works 40% of the time. Null — and NO draw — for every
 * other arm, and for a juice special (that is not the wobbler).
 */
export function rollWobbler(pitcher: Character, kind: PitchKind | null, rng: () => number): Wobbler | null {
  if (!has(pitcher, 'forty_percent')) return null;
  if (kind !== null && !BASE_MENU.includes(kind)) return null;
  return rng() < QUIRKS.WOBBLER_WORKS ? 'works' : 'flat';
}

/**
 * The kind a wobbler flies as: when it works it gets the wobbling flight of
 * the CRAZY pitch, free; when it does not it is the floater it started as.
 */
export function wobblerKind(w: Wobbler | null, kind: PitchKind): PitchKind {
  return w === 'works' ? 'crazy' : kind;
}

/** How many times as long this wobbler takes to arrive (the flat one floats). */
export function wobblerTravelMult(w: Wobbler | null): number {
  return w === 'flat' ? QUIRKS.WOBBLER_FLAT_TRAVEL : 1;
}

/** The same pitch, thrown by THIS arm. Identity for everyone but Bao. */
export function planForPitcher(plan: PitchPlan, pitcher: Character): PitchPlan {
  const k = travelMultFor(pitcher);
  return k === 1 ? plan : { ...plan, travelMs: plan.travelMs * k };
}

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

/** Ollie has never been tagged out: no tag, caught-stealing or pickoff gets him. */
export function neverTagged(runner: Character): boolean {
  return has(runner, 'never_tagged');
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

/** Sonny and Greta have never dropped anything: no drop or bobble roll at all. */
export function sureHands(fielder: Character): boolean {
  return has(fielder, 'brick_house') || has(fielder, 'sure_hands');
}

/** How much further than anyone else this kid reaches for a ball. */
export function reachMultFor(fielder: Character): number {
  return has(fielder, 'brick_house') ? QUIRKS.BRICK_HOUSE_REACH : 1;
}

/**
 * How many times as fast this kid's throws travel. Above 1 is a Cannon: she
 * also never throws wild, and never needs the cutoff man.
 */
export function cannonFor(fielder: Character): number {
  return has(fielder, 'fence_arm') || has(fielder, 'plays_alone') ? QUIRKS.CANNON_SPEED : 1;
}

/** The speed stat this kid chases a ball with. */
export function chaseSpeedFor(fielder: Character): number {
  return has(fielder, 'plays_alone') ? Math.max(fielder.stats.speed, QUIRKS.ALONE_RANGE) : fielder.stats.speed;
}
