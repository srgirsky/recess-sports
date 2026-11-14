// ---------------------------------------------------------------------------
// The story behaviours, for the physical model. PURE.
//
// The cast sheet gives most of the thirty a habit or a flaw. v1 has all of
// them (`src/systems/quirks.ts`); that module is v1's pixel domain and is not
// one of the five the sim may import, and most of what it does — band bumps,
// travel-time multipliers, ball chances — states an outcome this model derives.
// So this is not a port. It is the same `Character.quirk`, read here and
// expressed as the INPUTS the plate model already takes: which kinds an arm
// throws, how the ball leaves the hand, how far the release misses, whether a
// batter offers, how big his zone is, what his power is right now.
//
// ★ TWO RULES, AND THE GOLDENS REST ON BOTH.
//
//   1. THE FLAG IS ASKED ONCE, BY THE CALLER. Nothing here reads
//      `features.storyKids`. `game.ts` hands the plate a `Moment` when the flag
//      is on and nothing when it is off, and `atbat.ts` reaches this module
//      only when it has one — so with the flag off no line below runs.
//   2. A KID WITHOUT A QUIRK GETS THE VALUE HE ALWAYS GOT. Every function
//      returns the ordinary answer — the standard menu in the standard order,
//      no delivery, a multiplier of exactly 1, the same Character object — for
//      a kid who does not carry the quirk it reads. The one draw this module
//      makes (`wobblerKind`) is taken off its own labelled fork, so nobody
//      else's stream can see it.
//
// What is here so far — the mound and the plate:
//
//   one_curve      Lu        the curve is her whole menu
//   the_loop       Ezra      no fastball; a CPU batter always goes after his curve
//   forty_percent  Musa      one pitch: it flies as the crazy ball when it works
//   wild_arm       Kwame     his release misses by twice his arm's error
//   wobble         Dev       the same, milder
//   rainbow        Bao       everything he throws is the floater: slow, hanging
//   velocity       Roz       her fastball leaves the hand faster
//   never_swings   Winnie    takes every pitch, behind the smallest zone around
//   always_bunts   Rafi      every swing of his is a bunt
//   clutch_*       Nora, Marcus, Yui   a slugger's bat, in their moment only
//
// The rest of the sheet (the runners, the fielders, Mars, Sam, Josie, Hattie,
// Yaz, Jay) is not built in this tree yet; `docs/world1/cast-scope.md` has the
// list. The numbers are `params.STORY`, and almost none of them is sourced.
// ---------------------------------------------------------------------------

import type { Character, Quirk } from '../../data/types';
import { STORY } from './params';
import {
  PITCHES,
  SPECIAL_PITCHES,
  isSpecialPitch,
  type BasePitchKind,
  type Delivery,
  type PitchKind,
} from './pitch';
import type { Rng } from './rng';

const has = (kid: Character, q: Quirk): boolean => kid.quirk === q;

// --- The mound --------------------------------------------------------------

/** The base four, in `PITCHES`' own key order — the list `choosePitch` always picked from. */
const BASE_MENU: readonly BasePitchKind[] = Object.keys(PITCHES) as BasePitchKind[];
const LU_MENU: readonly BasePitchKind[] = ['curve'];
const EZRA_MENU: readonly BasePitchKind[] = BASE_MENU.filter((k) => k !== 'fastball');
const MUSA_MENU: readonly BasePitchKind[] = ['changeup'];

/**
 * The base pitches this arm throws. The CPU picks from it with ONE draw
 * whatever its length, and for an ordinary arm it is the same list in the same
 * order, so the pick is the one it always was.
 */
export function pitchMenu(pitcher: Character): readonly BasePitchKind[] {
  if (has(pitcher, 'one_curve')) return LU_MENU;
  if (has(pitcher, 'the_loop')) return EZRA_MENU;
  if (has(pitcher, 'forty_percent')) return MUSA_MENU;
  return BASE_MENU;
}

/**
 * The kind this arm throws when asked for `kind`: a base pitch that is not on
 * the menu becomes the first one that is. A special is not a base pitch and
 * passes through — it was bought, and the meter is what gates it.
 */
export function pitchOnMenu(pitcher: Character, kind: PitchKind): PitchKind {
  if (isSpecialPitch(kind)) return kind;
  const menu = pitchMenu(pitcher);
  return menu.includes(kind) ? kind : menu[0];
}

const RAINBOW: Delivery = { def: SPECIAL_PITCHES.freezeball, tag: 'rainbow' };
const VELOCITY: Delivery = {
  def: { ...PITCHES.fastball, speedMult: PITCHES.fastball.speedMult * STORY.VELOCITY_SPEED_MULT },
  tag: 'velocity',
};

/**
 * How this arm throws `kind`, when that is not how everyone throws it.
 *
 * Bao's Rainbow is the floater's flight under whatever he calls it: released
 * as slow as the solve can throw with heavy backspin, so it hangs and arrives
 * late. It is one definition for all four of his kinds on purpose — the
 * floater's speed is the slowest at which every (stat, spot) release lands
 * (`pitch.ts` § SPECIAL_PITCHES), so there is no slower curve to give him.
 *
 * Roz's is her FASTBALL at a faster release, and only her fastball. The sheet
 * says everything of hers arrives early, and v1 does that; here the release
 * solve cannot. Swept over every stat and spot, the base changeup, curve and
 * screwball already saturate it (they cross up to a foot from their aim, the
 * gap `sim.throwSpeed.comparedWithThePitch` records), and asking those three
 * for more speed moves the miss around without shortening the flight. The
 * fastball solves cleanly at every multiplier up to the fireball's.
 */
export function deliveryFor(pitcher: Character, kind: PitchKind): Delivery | undefined {
  if (isSpecialPitch(kind)) return undefined;
  if (has(pitcher, 'rainbow')) return RAINBOW;
  if (has(pitcher, 'velocity') && kind === 'fastball') return VELOCITY;
  return undefined;
}

/** How many times his own arm's error this kid's release misses by. */
export function scatterMult(pitcher: Character): number {
  if (has(pitcher, 'wild_arm')) return STORY.SCATTER_MULT.wild_arm;
  if (has(pitcher, 'wobble')) return STORY.SCATTER_MULT.wobble;
  return 1;
}

/** Does this arm's one pitch come out differently every time? */
export function throwsWobbler(pitcher: Character): boolean {
  return has(pitcher, 'forty_percent');
}

/**
 * Musa's one pitch, as it came out this time: the crazy ball's flight when it
 * works, the changeup it started as when it does not. Call it only for a kid
 * who `throwsWobbler`, with a fork nothing else reads.
 */
export function wobblerKind(kind: PitchKind, rng: Rng): PitchKind {
  if (isSpecialPitch(kind)) return kind;
  return rng() < STORY.WOBBLER_WORKS ? 'crazy' : kind;
}

/** Ezra's Loop starts outside the zone and lands in it: a CPU batter always offers. */
export function mustChase(pitcher: Character, kind: PitchKind): boolean {
  return has(pitcher, 'the_loop') && kind === 'curve';
}

// --- The plate --------------------------------------------------------------

/** Winnie has never swung the bat. */
export function neverSwings(batter: Character): boolean {
  return has(batter, 'never_swings');
}

/** The fraction of the standard zone this batter presents, each way. */
export function zoneScale(batter: Character): number {
  return has(batter, 'never_swings') ? STORY.SMALL_ZONE : 1;
}

/** Rafi bunts every single pitch. */
export function alwaysBunts(batter: Character): boolean {
  return has(batter, 'always_bunts');
}

/**
 * The moment a batter steps into. Its PRESENCE on a `PitchSpec` is the story
 * flag: `game.ts` builds one only when `features.storyKids` is on.
 */
export interface Moment {
  /** bases[0] = first. */
  bases: readonly [boolean, boolean, boolean];
  /** The batting side's runs minus the other side's, as this pitch is thrown. */
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

/**
 * The kid as she bats RIGHT NOW. A Clutch kid in her moment swings a slugger's
 * bat — `batSpeedFts` reads the power, so the ball leaves harder because the
 * bat is faster, not because a result was upgraded. The same object, untouched,
 * for everyone else and for her the rest of the time.
 */
export function batterInMoment(batter: Character, m: Moment): Character {
  if (!clutchFiring(batter, m)) return batter;
  return { ...batter, stats: { ...batter.stats, power: Math.max(batter.stats.power, STORY.CLUTCH_POWER) } };
}
