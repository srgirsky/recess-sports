// ---------------------------------------------------------------------------
// One pitch, from the mound to whatever it becomes. PURE.
//
// ★ WHAT THIS REPLACES. v1's at-bat is two systems glued at a rolled endpoint.
// `pitchkind.ts` picks an aim point, adds scatter, and asks `isInZone(actual)`
// — where `actual` is a NUMBER IN PLATE COORDS, a space with no relation to the
// field, chosen so a rectangle could be drawn around it. The ball's flight is a
// straight lerp with a decorative bow. And the batter's decision is a table of
// probabilities per band (`resolveCpuPitch`: ball chance 0 / 0.1 / 0.45 / 0.85,
// chase 0.2, swing band from a stat roll) — five constants describing an outcome
// distribution rather than a kid.
//
// Here the pitch is a trajectory, where it crosses is a fact about that
// trajectory, and the batter has ONE faculty: he judges where and when the ball
// will be, imperfectly.
//
// ★ ONE ERROR, TWO BEHAVIOURS, AND THAT IS THE WHOLE DESIGN.
//
// The obvious build gives a batter a chase rate and a whiff rate and tunes them
// apart. But a real hitter does not have two faculties. Give him a single
// judgement error, sized by his `contact` stat, and both fall out:
//
//   - he swings when he BELIEVES the pitch is a strike, so CHASES and TAKES are
//     consequences rather than constants;
//   - the same error in TIME becomes `SwingSpec.timingErrorSec`, so WHIFFS and
//     weak contact come out of the window `contact.ts` already grades against.
//
// A better-contact kid then chases less AND times better, from one number, and
// neither a chase rate nor a whiff rate exists anywhere to be tuned apart.
//
// ★ THE TEMPORAL HALF IS A FRACTION OF THE FLIGHT, NEVER MILLISECONDS.
// `pace.swingWindows` records what absolute windows cost: v1's 380ms CONTACT
// band sat over a 270ms flight, so "a tap at the instant of release still
// connects, and timing stops being a skill". `BAT.CONTACT_WINDOW_FRAC` is scale
// -free for that reason; a batter noise measured in ms would reintroduce the
// same failure from the other side, and the two would drift apart the next time
// the pitch corridor is re-measured.
//
// ★ ON TRIG: none of its own. It composes `pitch.ts` and `contact.ts`, which
// each declare their once-per-event trig; this file is arithmetic.
// ---------------------------------------------------------------------------

import type { Character } from '../../data/types';
import { ATBAT, BAT, resolvePlate, type PlateParams } from './params';
import {
  pitchScatterFt,
  plateJudgementFt,
  swingTimingSigmaFrac,
  zoneBandFt,
  zoneHalfWidthFt,
} from './athletes';
import {
  PITCHES,
  PITCH_SPOTS,
  SPECIAL_PITCHES,
  flyToPlate,
  isSpecialPitch,
  releaseAtSpot,
  releaseFrom,
  type PitchKind,
} from './pitch';
import { MOUND_DIST } from './field';
import { resolveSwing } from './contact';
import type { LaunchSpec } from './launch';
import type { Rng } from './rng';
import type { BallState } from './flight';
import {
  alwaysBunts,
  batterInMoment,
  blindBatter,
  deliveryFor,
  foulBack,
  mustChase,
  neverProtects,
  neverSwings,
  pitchMenu,
  pitchOnMenu,
  scatterMult as storyScatterMult,
  storyLaunch,
  swingsBlind,
  throwsWobbler,
  wobblerKind,
  zoneScale,
  type Moment,
} from './quirks';

/** Where a pitch crossed the plate: lateral offset and height, both ft. */
export interface Crossing {
  x: number;
  y: number;
}

/**
 * What one pitch did.
 *
 * ★ `travelSec` IS ON EVERY BRANCH, not just `inPlay`. `flyToPlate` integrates
 * it for every pitch anyway, and the steal race needs it on the pitches the
 * batter does NOT hit — a catcher cannot start his throw to second until the
 * ball reaches him, so the pitch's own flight time is what gives a runner his
 * jump. That is how `sim.stealRace` gets v1's hard-coded "+0.12 off slow stuff"
 * for free instead of as a constant.
 *
 * `release` rides along for the RENDER: `flight.sampleAt` was "the render seam,
 * exposed before any renderer exists", and a view that wants to draw the ball
 * flying to the plate needs the state it flew from. Both are computed already.
 */
export type PitchResult =
  /** Taken, and outside the zone. */
  | { kind: 'ball'; crossing: Crossing; pitch: PitchKind; travelSec: number; release: BallState }
  /** Taken, and over the plate. */
  | { kind: 'calledStrike'; crossing: Crossing; pitch: PitchKind; travelSec: number; release: BallState }
  /** Offered at and missed. */
  | {
      kind: 'swingingStrike';
      crossing: Crossing;
      pitch: PitchKind;
      travelSec: number;
      release: BallState;
      /** Signed against the plate crossing: negative is early, positive late. */
      timingErrorSec: number;
    }
  /** Nicked it. A strike, but never the third. */
  | {
      kind: 'foulTip';
      crossing: Crossing;
      pitch: PitchKind;
      travelSec: number;
      release: BallState;
      timingErrorSec: number;
    }
  /** Hit it. Fair or foul is the play's to decide, not the swing's. */
  | {
      kind: 'inPlay';
      crossing: Crossing;
      pitch: PitchKind;
      launch: LaunchSpec;
      travelSec: number;
      plateSpeedFts: number;
      release: BallState;
      timingErrorSec: number;
    };

export interface PitchSpec {
  pitcher: Character;
  batter: Character;
  /** The count BEFORE this pitch. Drives what the pitcher tries. */
  count: { balls: number; strikes: number };
  /** Resolved plate constants. Omit for the shipped values. */
  plate?: PlateParams;
  /**
   * The moment the batter steps into — and, by being here at all, the story
   * flag (`features.storyKids`, `quirks.ts`). Omitted, no kid's quirk is read
   * and this file does exactly what it did before they had any.
   */
  story?: Moment;
}

// --- The umpire -------------------------------------------------------------

/**
 * Is this crossing a strike?
 *
 * ★ IT ASKS THE TRAJECTORY, which is the difference from v1. `pitchkind.ts`
 * sets `inZone` on the aim point plus a scatter roll — a number invented at
 * release. Here `flyToPlate` integrates the ball through drag and Magnus and
 * reports where it actually was when `z` reached zero, and the umpire looks at
 * that. A curveball that breaks out of the zone is a ball because it broke, not
 * because something decided in advance that it would be.
 */
export function isStrike(c: Crossing, batterHeightFt?: number, scale = 1): boolean {
  const [lo, hi] = zoneBandFt(batterHeightFt);
  // The standard zone is compared as it always was; a scaled one (`quirks.ts`
  // `zoneScale`) shrinks about the zone's own centre, both ways.
  if (scale === 1) return Math.abs(c.x) <= zoneHalfWidthFt() && c.y >= lo && c.y <= hi;
  const mid = (lo + hi) / 2;
  return Math.abs(c.x) <= zoneHalfWidthFt() * scale && Math.abs(c.y - mid) <= ((hi - lo) / 2) * scale;
}

/** How far outside the zone this crossing sits, ft. Zero for a strike. */
export function distOutsideZone(c: Crossing, batterHeightFt?: number): number {
  const [lo, hi] = zoneBandFt(batterHeightFt);
  const dx = Math.max(0, Math.abs(c.x) - zoneHalfWidthFt());
  const dy = c.y < lo ? lo - c.y : c.y > hi ? c.y - hi : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

// --- The mound --------------------------------------------------------------

/**
 * Where the pitcher is trying to put it, and with what.
 *
 * v1's `chooseCpuPitch` shape, kept because its reasoning is sound and its
 * comment says it plainly: "Ahead in the count it wastes pitches off the edge to
 * tempt a chase; behind, it grooves one." The numbers are re-expressed in feet.
 */
/**
 * What the pitcher decided: a KIND and a SPOT.
 *
 * ★ THIS IS THE WHOLE OF PITCHING, and it is deliberately not a meter. v2 has
 * no throw power (`play.ts`'s header: "THERE IS NO THROW METER IN v2, BECAUSE
 * THERE IS NO POWER"), and the same argument holds on the mound — how hard the
 * ball leaves the hand is `throwSpeedFts`, a MEASURED quantity of the kid, and
 * how far it misses the spot is his `pitching` stat. A meter would be a second
 * source for a thing the roster already decides, and it would let a player
 * out-throw his own arm.
 */
export interface PitchPlan {
  kind: PitchKind;
  aimLateralFt: number;
  aimHeightFt: number;
}

export function choosePitch(spec: PitchSpec, rng: Rng): PitchPlan {
  // ★ THE BASE FOUR ONLY. `SPECIAL_PITCHES` is a separate record so this draw
  // never sees a fifth key; the CPU reaches a special through `game.ts` and
  // `juice.ts` `cpuPickSpecialPitch`, which replaces the KIND and keeps the
  // spot this function drew.
  // With the story on, the list is the ARM'S OWN menu — the same four in the
  // same order for an ordinary arm, so the pick below is the one it was.
  const kinds: readonly PitchKind[] = spec.story ? pitchMenu(spec.pitcher) : (Object.keys(PITCHES) as PitchKind[]);
  const kind = rng.pick(kinds);
  const [lo, hi] = zoneBandFt();
  const mid = (lo + hi) / 2;
  const halfW = zoneHalfWidthFt();
  const halfH = (hi - lo) / 2;

  // Ahead: off the edge, tempting a chase. Behind: it has to come in.
  const ahead = spec.count.strikes >= ATBAT.STRIKES_PER_K - 1 && spec.count.balls <= 1;
  const behind = spec.count.balls >= ATBAT.BALLS_PER_WALK - 1;
  const ring = ahead ? ATBAT.SPOT_RING_EDGE : behind ? 0 : ATBAT.SPOT_RING_IN;
  const spot = rng.pick(PITCH_SPOTS);
  return {
    kind,
    aimLateralFt: spot.lateral * halfW * ring,
    aimHeightFt: mid + spot.height * halfH * ring,
  };
}

// --- One pitch --------------------------------------------------------------

/**
 * Throw it, judge it, and swing or don't.
 *
 * ★ THE SUBSTREAMS ARE NAMED AND SEPARATE. A pitch draws for the pitcher's
 * choice, his execution, the batter's read and the contact roll; off one stream
 * the ORDER of those draws would be part of the contract, which is the class
 * `Rng.fork` exists to delete. The caller forks per plate appearance and this
 * forks per decision inside it.
 */
/**
 * A pitch that has been thrown but not yet judged.
 *
 * ★ THE SPLIT EXISTS SO A PERSON CAN BAT. `pitchAndSwing` did everything in one
 * call, so `playAtBatLive` could only yield a frame AFTER the outcome was
 * decided — the view animated a ball whose fate was already settled, which no
 * human can swing at. Throwing and judging are separate acts in the world and
 * are now separate here.
 */
export interface PitchInFlight {
  kind: PitchKind;
  release: BallState;
  crossing: Crossing;
  travelSec: number;
  plateSpeedFts: number;
}

/**
 * What a person did, instead of what the CPU's two error terms did.
 *
 * ★ AIM IS A HEIGHT, NOT A POINT, AND THAT IS A MODELLING RESULT RATHER THAN A
 * SIMPLIFICATION. `resolveSwing` reads exactly two things: when the bat arrived
 * and how far under the ball's centre it passed. Where the ball GOES laterally
 * is already decided — `contact.ts` derives `sprayDeg` from `timingErrorSec`,
 * so pulling is what being early MEANS. A lateral aim term would be a second,
 * independent source for the same quantity, and the two would disagree.
 *
 * So a 2D cursor would have put a field on the wire that nothing downstream
 * reads. `sim.humanSwing` records it, and `atbat.test.ts` asserts that lateral
 * intent has no channel — this repo has shipped an unread field before (PR 8's
 * count and hit type), and "a field nobody reads is a field nobody can trust".
 */
/**
 * What the meter bought this plate appearance (`features.juice`). Only the
 * batting side's power swing reaches the plate model; the other two spends
 * are the play's. Omitted is an ordinary swing.
 */
export interface SwingBoost {
  power: boolean;
}

export interface HumanSwing {
  /** Seconds into the flight at which they swung. */
  atSec: number;
  /**
   * The height they aimed the barrel at, ft above the plate. Aiming BELOW the
   * ball is an undercut, which lifts it.
   */
  aimHeightFt: number;
  /** Squared around: the bat is held in the ball's path, not swung (`BAT.BUNT_*`). */
  bunt?: boolean;
}

/**
 * Throw it. No batter is involved.
 *
 * ★ SPLITTING THIS COULD NOT MOVE A DRAW, and that is a property rather than a
 * hope. `rng.ts`'s substreams derive from `(root seed, label)` and never from
 * position in the parent stream, so — in its own words — "forking in a different
 * order gives the same streams" and "a substream that is never drawn from costs
 * nothing and shifts nothing". Two functions forking the same labels off the
 * same parent are indistinguishable from one that forked both. PR 13's golden
 * fingerprints and 30-game checksum are what prove it rather than assert it.
 */
export function throwPitch(spec: PitchSpec, rng: Rng, human?: PitchPlan): PitchInFlight {
  // ★ A PERSON PICKS THE PLAN AND STILL MISSES BY HIS OWN ARM. `choosePitch` is
  // the only thing a human replaces: the execution error below is untouched, so
  // a weak-armed kid scatters exactly as far whoever chose the spot. That is
  // what keeps the 30 characters meaningful on the mound, and it is the same
  // shape as the swing — supply the model's inputs, never its outcomes.
  //
  // Not drawing from `fork('choose')` shifts nothing for anybody: substreams are
  // keyed on (root seed, label), so "a substream that is never drawn from costs
  // nothing and shifts nothing".
  const asked = human ?? choosePitch(spec, rng.fork('choose'));
  // ★ THE STORY, ON THE MOUND (`quirks.ts`). A person may ask this arm for a
  // pitch it does not throw, so the menu is enforced HERE and not in the
  // picker; Musa's one pitch is rolled off its own fork, which nobody else
  // reads. For an ordinary arm `kind` is `asked.kind` and nothing was drawn.
  let kind = asked.kind;
  let wobbler = false;
  if (spec.story) {
    kind = pitchOnMenu(spec.pitcher, kind);
    if (throwsWobbler(spec.pitcher)) {
      const out = wobblerKind(kind, rng.fork('wobbler'));
      wobbler = out !== kind;
      kind = out;
    }
  }
  const plan = kind === asked.kind ? asked : { ...asked, kind };

  // ★ THE SOLVE IS FOR THE SPOT; THE ERROR IS ON THE RELEASE. Perturbing the
  // AIM and re-solving costs 13.6ms a pitch — measured, and forty-nine minutes
  // over PR 8's 200,000 — for a model that is also backwards: a pitcher does not
  // aim badly, he executes badly. `releaseAtSpot` memoises the solve for the
  // finite set of (kind, arm, spot); the scatter is an angular nudge on the
  // answer, small-angle so a miss of `scatterFt` at the plate is `scatterFt /
  // MOUND_DIST` radians. One integration per pitch instead of ninety.
  const plan2 = releaseAtSpot({
    kind: plan.kind,
    pitchingStat: spec.pitcher.stats.pitching,
    aimHeightFt: plan.aimHeightFt,
    aimLateralFt: plan.aimLateralFt,
    delivery: spec.story ? deliveryFor(spec.pitcher, plan.kind, spec.story.heaterReady === true) : undefined,
  });
  const miss = rng.fork('execute');
  // ★ A SPECIAL IS A PARAMETER SET, AND THIS IS ITS ONLY OTHER KNOB. The
  // crazy ball is wild by `scatterMult` on the kid's OWN execution error —
  // same draws, same bell, a wider nudge — so a strong arm's crazy ball is
  // still tamer than a weak arm's. Every base kind and the other two
  // specials multiply by exactly 1, which is exact in IEEE and is why the
  // goldens do not see this line. Whether the kind was PAID FOR is not asked
  // here: `game.ts` downgrades an unaffordable special before the throw.
  // A wobbler that worked has the crazy ball's FLIGHT and Musa's own aim: the
  // wildness is what a spent crazy ball buys, and his was free. Kwame's and
  // Dev's releases miss by more, on the same two draws.
  const kindMult = isSpecialPitch(plan.kind) && !wobbler ? SPECIAL_PITCHES[plan.kind].scatterMult : 1;
  const scatterMult = spec.story ? kindMult * storyScatterMult(spec.pitcher) : kindMult;
  const scatterRad = (pitchScatterFt(spec.pitcher.stats.pitching) * scatterMult) / MOUND_DIST;
  const released = releaseFrom(plan2, miss.bell() * scatterRad, miss.bell() * scatterRad);

  const flown = flyToPlate(released);
  const crossing: Crossing = { x: flown.state.p.x, y: flown.state.p.y };
  const plateSpeedFts = Math.sqrt(
    flown.state.v.x * flown.state.v.x +
      flown.state.v.y * flown.state.v.y +
      flown.state.v.z * flown.state.v.z
  );
  return { kind: plan.kind, release: released, crossing, travelSec: flown.travelSec, plateSpeedFts };
}

/**
 * Judge it, and swing or don't.
 *
 * With no `human` this is the CPU batter exactly as before. With one, the two
 * error terms it would have rolled are supplied by a person instead.
 */
export function resolvePitch(
  inFlight: PitchInFlight,
  spec: PitchSpec,
  rng: Rng,
  human?: HumanSwing,
  boost?: SwingBoost
): PitchResult {
  const { kind: pitchKind, release: released, crossing, travelSec, plateSpeedFts } = inFlight;
  const plate = spec.plate ?? resolvePlate();
  // ★ THE STORY, AT THE PLATE (`quirks.ts`). Each of these is the ordinary
  // value — the same batter object, `false`, a scale of exactly 1 — unless the
  // flag is on AND this kid carries the quirk it reads.
  const story = spec.story;
  const batter = story ? blindBatter(batterInMoment(spec.batter, story)) : spec.batter;
  const bunts = story !== undefined && alwaysBunts(spec.batter);
  const taken = (): PitchResult => {
    const kind = isStrike(crossing, undefined, story ? zoneScale(spec.batter) : 1) ? 'calledStrike' : 'ball';
    return { kind, crossing, pitch: pitchKind, travelSec: travelSec, release: released };
  };
  // Winnie does not swing, whoever is holding the controller.
  if (story && neverSwings(spec.batter)) return taken();

  // ★ ONE OFFER, TWO WAYS OF ARRIVING AT IT. The CPU rolls its two error terms
  // and a person supplies them; from there the swing is resolved by exactly the
  // same code. Keeping two copies of these three branches is how a human path
  // quietly acquires different physics from the CPU's.
  const offer = (timingErrorSec: number, undercutFt: number, bunt = false): PitchResult => {
    const swing = resolveSwing(
      {
        timingErrorSec,
        undercutFt,
        batter,
        travelSec,
        pitchSpeedFts: plateSpeedFts,
        plate,
        // The power swing grades the CPU's and a person's timing alike —
        // one offer, one physics, the rule this closure exists for.
        power: boost?.power ?? false,
        bunt,
        foulTip: story ? foulBack(spec.batter) : undefined,
      },
      rng.fork('swing')
    );
    const base = { crossing, pitch: pitchKind, travelSec, release: released, timingErrorSec };
    if (swing.kind === 'miss') return { kind: 'swingingStrike', ...base };
    if (swing.kind === 'foulTip') return { kind: 'foulTip', ...base };
    // A bunt is a bunt whoever squares: the story's two launches are swings.
    const launch =
      story && !bunt
        ? storyLaunch(spec.batter, swing.launch, Math.abs(timingErrorSec) <= BAT.PERFECT_WINDOW_FRAC * travelSec)
        : swing.launch;
    return { kind: 'inPlay', launch, plateSpeedFts, ...base };
  };

  if (human) {
    // ★ A PERSON SUPPLIES THE MODEL'S OWN TWO ERROR TERMS, and nothing new is
    // invented for him: `timingQuality` grades the WHEN exactly as it grades the
    // CPU's, and the undercut geometry turns the WHERE into a launch angle
    // exactly as it does for the CPU. There is no human hit rate anywhere.
    //
    // ★ `UNDERCUT_FROM_JUDGE` DELIBERATELY DOES NOT APPLY. That constant turns a
    // READ error into a PLACEMENT error, and it exists because the CPU's aim is
    // a misjudgement it is unaware of. A player's pointer IS the placement;
    // there is nothing to convert. Scaling it would model a human as if he were
    // guessing at his own intention.
    //
    // ★ NOR DOES TWO-STRIKE PROTECTION, and for the same kind of reason. It
    // exists so a poor-contact CPU kid is a foul-ball machine rather than a
    // strikeout machine — a statement about an AI's decision rule, not a rule of
    // baseball. A person decides for himself whether to offer.
    return offer(human.atSec - travelSec, crossing.y - human.aimHeightFt, bunts || (human.bunt ?? false));
  }

  const decision = cpuSwingDecision(inFlight, spec, rng, plate);
  if (!decision) return taken();
  return offer(decision.timingErrorSec, decision.undercutFt, bunts);
}

interface CpuSwingDecision {
  timingErrorSec: number;
  undercutFt: number;
}

/**
 * The CPU's read, factored so the live frame may preview WHEN its bat moves.
 *
 * Calling this twice is deterministic and does not consume a parent stream:
 * `fork('judge')` derives from the root seed and label, never draw position.
 * The later resolution therefore produces the exact same decision and outcome.
 */
function cpuSwingDecision(
  inFlight: PitchInFlight,
  spec: PitchSpec,
  rng: Rng,
  plate: PlateParams
): CpuSwingDecision | null {
  const { crossing, travelSec } = inFlight;
  // Winnie's bat never moves, so the frame's preview must not say it will.
  if (spec.story && neverSwings(spec.batter)) return null;
  // The read. One error, in space and in time. (Yaz reads with her eyes shut:
  // the same two draws, sized by the worst eye there is.)
  const blind = spec.story !== undefined && swingsBlind(spec.batter);
  const reader = blind ? blindBatter(spec.batter) : spec.batter;
  const eye = rng.fork('judge');
  const judgeFt = plateJudgementFt(reader.stats.contact);
  const judged: Crossing = {
    x: crossing.x + eye.bell() * judgeFt,
    y: crossing.y + eye.bell() * judgeFt,
  };

  // ★ WITH TWO STRIKES HE PROTECTS. Without this a batter offers only at what
  // he READS as a strike, so every misread with two strikes is a called third —
  // which turns a poor-contact kid into a strikeout machine instead of the
  // foul-ball machine a six-year-old actually is.
  // (Sam does not protect: he would rather wear one — `quirks.ts`.)
  const protects = !(spec.story !== undefined && neverProtects(spec.batter));
  const protectFt = protects && spec.count.strikes >= ATBAT.STRIKES_PER_K - 1 ? plate.twoStrikeProtectFt : 0;
  // Ezra's Loop looks like a ball and is not: he offers whatever he read.
  const swings =
    distOutsideZone(judged, undefined) <= protectFt ||
    blind ||
    (spec.story !== undefined && mustChase(spec.pitcher, inFlight.kind));
  if (!swings) return null;

  // He offered. The same read decides how well.
  const timingErrorSec =
    eye.bell() * swingTimingSigmaFrac(reader.stats.contact) * travelSec;
  // Reading the ball LOW means swinging under it, which lifts it.
  return {
    timingErrorSec,
    undercutFt: (crossing.y - judged.y) * plate.undercutFromJudge,
  };
}

/**
 * When the CPU intends its bat to meet the pitch, seconds from release.
 * Null means a take. This is presentation data only; `resolvePitch` remains the
 * one place that turns the same decision into an outcome.
 */
export function cpuSwingAtSec(inFlight: PitchInFlight, spec: PitchSpec, rng: Rng): number | null {
  const decision = cpuSwingDecision(inFlight, spec, rng, spec.plate ?? resolvePlate());
  return decision ? inFlight.travelSec + decision.timingErrorSec : null;
}

/**
 * Throw it, judge it, and swing or don't — the CPU path, unchanged.
 *
 * Kept as a thin wrapper so every existing caller and test is untouched by the
 * split, which is what lets the checksum mean something.
 */
export function pitchAndSwing(spec: PitchSpec, rng: Rng): PitchResult {
  return resolvePitch(throwPitch(spec, rng), spec, rng);
}
