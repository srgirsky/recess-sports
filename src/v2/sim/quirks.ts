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
// What each kid does:
//
//   one_curve      Lu        the curve is her whole menu
//   the_loop       Ezra      no fastball; a CPU batter always goes after his curve
//   forty_percent  Musa      one pitch: it flies as the crazy ball when it works
//   wild_arm       Kwame     his release misses by twice his arm's error
//   wobble         Dev       the same, milder
//   rainbow        Bao       everything he throws is the floater: slow, hanging
//   velocity       Roz       everything she throws leaves the hand faster
//   never_swings   Winnie    takes every pitch, behind the smallest zone around
//   always_bunts   Rafi      every swing of his is a bunt
//   clutch_*       Nora, Marcus, Yui   a slugger's bat, in their moment only
//   moonshot       Mars      a perfectly timed ball leaves every park
//   foul_back      Josie     anything short of square is likelier ticked foul
//   same_spot      Hattie    every ball she puts in play is the same flare
//   eyes_closed    Yaz       offers at everything, reads nothing, hits it HARD
//
//   green_light    Zaya      goes when SHE judges it, order or no order, and
//                            is never late off the pitcher's first move
//   never_tagged   Ollie     the tag misses: no caught-stealing, no pickoff
//
//   brick_house    Sonny     never drops one, and reaches a foot further
//   sure_hands     Greta     never drops one
//   fence_arm      Rudy      the strongest arm the scale has, wherever she stands
//   plays_alone    Amir      the same arm
//   wrong_base     Roya      a third of her throws go to a bag nobody chose
//
//   hit_by_pitch   Sam       never protects; a ball he takes far enough inside hits him
//   heater         Jay       his first fastball of each half inning is the fireball
//
// And two rules about a TEAM: siblings drafted together are each a little
// better (`familyLookup`), and three kids stand where their story says
// (`storyDefence`). Not built here: Amir's range (see `storyFielder`) and
// Jay refusing relief (this game has no relief to refuse); `docs/world1/cast-scope.md` has the
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
import type { LaunchSpec } from './launch';
import type { FielderState } from './fielders';
import type { DefencePlan } from './lineup';
import type { PositionId } from './field';
import { zoneBandFt, zoneHalfWidthFt } from './athletes';

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
const VELOCITY = Object.fromEntries(
  BASE_MENU.map((kind) => [
    kind,
    { def: { ...PITCHES[kind], speedMult: PITCHES[kind].speedMult * STORY.VELOCITY_SPEED_MULT }, tag: 'velocity' },
  ])
) as Record<BasePitchKind, Delivery>;

/**
 * How this arm throws `kind`, when that is not how everyone throws it.
 *
 * Bao's Rainbow is the floater's flight under whatever he calls it: released
 * as slow as the solve can throw with heavy backspin, so it hangs and arrives
 * late. It is one definition for all four of his kinds on purpose — the
 * floater's speed is the slowest at which every (stat, spot) release lands
 * (`pitch.ts` § SPECIAL_PITCHES), so there is no slower curve to give him.
 *
 * Roz's is each kind's own spin at a faster release: everything she throws
 * gets there sooner. (Until the release solve was bracketed this could only
 * be her fastball — asked for more speed on a kind that already saturated,
 * the old solve moved the miss around without shortening the flight.)
 */
export function deliveryFor(pitcher: Character, kind: PitchKind, heaterReady = false): Delivery | undefined {
  if (isSpecialPitch(kind)) return undefined;
  if (heaterReady && throwsHeater(pitcher) && kind === 'fastball') return HEATER;
  if (has(pitcher, 'rainbow')) return RAINBOW;
  if (has(pitcher, 'velocity')) return VELOCITY[kind];
  return undefined;
}

/** Jay's Heater is the fireball's flight, free: one a half inning (`Moment.heaterReady`). */
const HEATER: Delivery = { def: SPECIAL_PITCHES.fireball, tag: 'heater' };

/** Does this arm have a Heater in it? The half inning's owner tracks whether it is spent. */
export function throwsHeater(pitcher: Character): boolean {
  return has(pitcher, 'heater');
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

/**
 * Does this arm aim its breaking ball THROUGH the break? An ordinary pitcher
 * aims at a spot and the ball breaks off it, which is why most curves in this
 * game are balls. These three throw one pitch for a living and know where it
 * ends up: Lu's only pitch, Ezra's Loop ("starts outside the zone and lands
 * in it"), and Musa's wobbler on the days it works. `atbat.ts` re-aims by the
 * break the release would have had, so the ball starts off the spot and
 * arrives on it — before the arm's own execution error, which is untouched.
 */
export function aimsThroughBreak(pitcher: Character, kind: PitchKind, wobbler: boolean): boolean {
  if (wobbler) return true;
  return kind === 'curve' && (has(pitcher, 'one_curve') || has(pitcher, 'the_loop'));
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
  /** The pitcher has not thrown his Heater this half inning (`throwsHeater`). */
  heaterReady?: boolean;
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

/**
 * Yaz swings with her eyes closed. She offers at everything, reads the ball
 * like the worst eye on the roster, and what she does meet she meets with the
 * biggest bat on it. Both halves ride the stats the plate model already
 * reads — her judgement and timing off `contact`, her bat speed off `power` —
 * so nothing about a swing is decided here.
 */
export function swingsBlind(batter: Character): boolean {
  return has(batter, 'eyes_closed');
}

/** The kid as she swings with her eyes shut. The same object for everyone else. */
export function blindBatter(batter: Character): Character {
  if (!has(batter, 'eyes_closed')) return batter;
  return {
    ...batter,
    stats: {
      ...batter.stats,
      contact: STORY.BLIND.CONTACT,
      power: Math.max(batter.stats.power, STORY.BLIND.POWER),
    },
  };
}

/**
 * Josie's foul-back window, or undefined for a kid whose glancing contact is
 * judged by `contact.ts`'s own pair.
 */
export function foulBack(batter: Character): { below: number; chance: number } | undefined {
  return has(batter, 'foul_back') ? { below: STORY.FOUL_BACK.BELOW, chance: STORY.FOUL_BACK.CHANCE } : undefined;
}

/**
 * The batted ball as this kid's story sends it. `dead` is whether the swing
 * was dead on: inside `moonshotWindowFrac` of the flight.
 *
 * These two are the only places the story states where a ball GOES rather
 * than how it was hit, because that is what each sheet line says: Hattie's
 * lands in the same place every time, and Mars's perfect swing is gone
 * whatever was thrown. Everything after the launch — the flight, the fence,
 * whether anybody catches it — is still the play's.
 */
export function storyLaunch(batter: Character, launch: LaunchSpec, dead: boolean): LaunchSpec {
  if (has(batter, 'same_spot')) {
    const s = STORY.SAME_SPOT;
    return { ...launch, exitVelocityFts: s.EXIT_FTS, launchAngleDeg: s.ANGLE_DEG, sprayDeg: s.SPRAY_DEG, spinRpm: s.SPIN_RPM };
  }
  if (has(batter, 'moonshot') && dead) {
    const m = STORY.MOONSHOT;
    const spray = launch.sprayDeg > m.SPRAY_MAX_DEG ? m.SPRAY_MAX_DEG : launch.sprayDeg < -m.SPRAY_MAX_DEG ? -m.SPRAY_MAX_DEG : launch.sprayDeg;
    return { ...launch, exitVelocityFts: m.EXIT_FTS, launchAngleDeg: m.ANGLE_DEG, sprayDeg: spray, spinRpm: m.SPIN_RPM };
  }
  return launch;
}

// --- The bases --------------------------------------------------------------

/** Zaya steals when she feels like it: her own judgement runs even for a person's bench. */
export function hasGreenLight(runner: Character): boolean {
  return has(runner, 'green_light');
}

/**
 * The latest this runner ever leaves, seconds after the pitcher's first move —
 * or undefined for a kid whose jump is whatever he drew. Zaya's is zero: she
 * may still be early, never late. A cap on the race's own error term, so her
 * edge is in the race and not on its result.
 */
export function jumpCapSec(runner: Character): number | undefined {
  return has(runner, 'green_light') ? 0 : undefined;
}

/** Ollie has never been tagged out. A race he loses at a bag, he wins anyway. */
export function slipsTheTag(runner: Character): boolean {
  return has(runner, 'never_tagged');
}

// --- The field --------------------------------------------------------------

/**
 * Dress one fielder in his story, at the start of a play. A kid without a
 * fielding story is not touched at all.
 *
 * Applied where the juice spends are — on the play's own copy, after
 * `makeFielder` — so `makeFielder` stays the one place a stat becomes a
 * fielder. Amir's "covers the ground himself" is deliberately NOT here: his
 * legs in the field are his legs on the bases (`purity.lint.test.js` § one kid
 * speed), and a second speed for one of them is the drift that lint exists to
 * stop.
 */
export function storyFielder(f: FielderState, kid: Character): void {
  if (has(kid, 'brick_house')) {
    f.sure = true;
    f.reachBonusFt += STORY.BRICK_HOUSE_REACH_FT;
  } else if (has(kid, 'sure_hands')) {
    f.sure = true;
  } else if (has(kid, 'fence_arm') || has(kid, 'plays_alone')) {
    f.arm = Math.max(f.arm, STORY.CANNON_ARM);
  } else if (has(kid, 'wrong_base')) {
    f.strays = true;
  }
}

/**
 * Roya's throw: the bag she was asked for, or — some of the time — the next
 * one round that her arm can reach. `reaches` is the play's own range test.
 * Call it only for a fielder who `strays`, with a fork nothing else reads.
 */
export function strayBase(base: 1 | 2 | 3 | 4, rng: Rng, reaches: (b: 1 | 2 | 3 | 4) => boolean): 1 | 2 | 3 | 4 {
  if (!(rng() < STORY.WRONG_BASE)) return base;
  for (let i = 1; i <= 3; i++) {
    const other = ((((base - 1 + i) % 4) + 1) as 1 | 2 | 3 | 4);
    if (reaches(other)) return other;
  }
  return base;
}

/** Sam does not protect the plate: with two strikes he still offers only at what he reads as one. */
export function neverProtects(batter: Character): boolean {
  return has(batter, 'hit_by_pitch');
}

/**
 * Did a ball this batter TOOK hit him? Sam leans in over the plate, so a ball
 * crossing far enough inside — on a right-handed batter's side, which is the
 * third-base side, negative x — between his knees and his shoulders has
 * nowhere to go but him. Where the ball crossed is the trajectory's own fact;
 * nothing is rolled.
 */
export function hitByPitch(batter: Character, crossing: { x: number; y: number }): boolean {
  if (!has(batter, 'hit_by_pitch')) return false;
  const [lo, hi] = zoneBandFt();
  return crossing.x < -(zoneHalfWidthFt() + STORY.LEAN_IN_FT) && crossing.y >= lo && crossing.y <= hi + (hi - lo) / 2;
}

// --- The team ---------------------------------------------------------------

/** The cast sheet's two sets of siblings, by roster id. */
export const SIBLINGS: ReadonlyArray<readonly [string, string]> = [
  ['diva', 'flash'], // Roz & Rudy Achterberg
  ['peaches', 'bend_it'], // Hattie & Ezra Bloom
];

/**
 * The same lookup, with siblings who were drafted onto the same nine each one
 * better at every stat. Applied to the CHARACTER, before any stat becomes a
 * physical quantity, so a sister's legs are the same legs on the bases and in
 * the field and the one-kid-speed rule is not touched. Every other kid comes
 * back as the object the roster holds.
 */
export function familyLookup(
  lookup: (id: string) => Character,
  teams: ReadonlyArray<readonly string[]>
): (id: string) => Character {
  const boosted = new Map<string, Character>();
  const up = (n: number) => Math.min(10, n + STORY.SIBLING_BONUS);
  for (const [a, b] of SIBLINGS) {
    if (!teams.some((t) => t.includes(a) && t.includes(b))) continue;
    for (const id of [a, b]) {
      const kid = lookup(id);
      const s = kid.stats;
      boosted.set(id, {
        ...kid,
        stats: { contact: up(s.contact), power: up(s.power), speed: up(s.speed), pitching: up(s.pitching), fielding: up(s.fielding) },
      });
    }
  }
  if (boosted.size === 0) return lookup;
  return (id) => boosted.get(id) ?? lookup(id);
}

/** Where a kid's story says they stand, most particular claim first. */
const STORY_POSITIONS: ReadonlyArray<{ quirk: Quirk; spots: readonly PositionId[] }> = [
  { quirk: 'brick_house', spots: ['C'] }, // Sonny is the catcher. He is wearing the gear.
  { quirk: 'plays_alone', spots: ['CF'] }, // Amir plays centre field alone.
  { quirk: 'fence_arm', spots: ['RF', 'LF', 'CF'] }, // Rudy throws them out from the fence.
];

/**
 * The same defence, with the kids whose story names a position standing in
 * it. Each trades places with whoever was there; the pitcher is never moved.
 * A plan with none of these kids out of place is the object it was.
 */
export function storyDefence(plan: DefencePlan, lookup: (id: string) => Character): DefencePlan {
  let positions = plan.positions;
  const settled = new Set<string>();
  for (const { quirk, spots } of STORY_POSITIONS) {
    for (const id of Object.keys(plan.positions)) {
      if (!has(lookup(id), quirk) || id === plan.pitcherId) continue;
      if (spots.includes(positions[id])) {
        settled.add(id);
        continue;
      }
      for (const spot of spots) {
        const holder = Object.keys(positions).find((k) => positions[k] === spot);
        if (!holder || settled.has(holder) || holder === plan.pitcherId) continue;
        positions = { ...positions, [id]: spot, [holder]: positions[id] };
        settled.add(id);
        break;
      }
    }
  }
  return positions === plan.positions ? plan : { ...plan, positions };
}

// --- What the view is told ---------------------------------------------------

/**
 * A story moment worth saying out loud. `game.ts` emits one as a `story`
 * event the instant it happens, and only with the flag on; the view names it
 * (`ui/playCalloutModel.ts`). A beat is a fact the sim already settled —
 * nothing reads one back.
 */
export type StoryBeat = 'heater' | 'wobbler' | 'clutch' | 'moonshot' | 'hitByPitch' | 'slippedTag';

/** Was this batted ball Mars's perfect swing? */
export function wasMoonshot(batter: Character, launch: LaunchSpec): boolean {
  return has(batter, 'moonshot') && launch.exitVelocityFts === STORY.MOONSHOT.EXIT_FTS && launch.launchAngleDeg === STORY.MOONSHOT.ANGLE_DEG;
}

/**
 * The fraction of a pitch's flight this batter can SEE (1 is all of it). The
 * view's question: a person batting as Yaz loses the ball partway in, because
 * her eyes are shut. The sim does not read it — her swing is whatever the
 * person does with what they saw.
 */
export function ballSeenFrac(batter: Character): number {
  return has(batter, 'eyes_closed') ? STORY.BLIND_SEEN_FRAC : 1;
}

/** What this arm's card for `kind` is called, when it is not the usual name. */
export function pitchCardFor(pitcher: Character, kind: PitchKind): { icon: string; label: string } | undefined {
  return has(pitcher, 'forty_percent') && kind === 'changeup' ? { icon: '🎲', label: 'WOBBLER' } : undefined;
}

/**
 * How close to the crossing Mars's swing must be to be THE swing, as a
 * fraction of the pitch's flight. Much narrower than the perfect window:
 * the CPU lands inside that one on about half its swings, and a kid who
 * homers every other time up is not a slugger, she is a different game.
 */
export function moonshotWindowFrac(): number {
  return STORY.MOONSHOT.WINDOW_FRAC;
}
