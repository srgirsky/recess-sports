// ---------------------------------------------------------------------------
// A person batting, checked as a SKILL rather than against a rate.
//
// Every assertion here is falsifiable without a published band, which is the
// standard `sim.harnessMethod` sets: swinging at the right moment must beat
// swinging at the wrong one, aiming under the ball must lift it, and a person
// who does both must out-hit a kid who cannot. None of that is stated anywhere
// as a probability, and there is no human hit rate to tune.
//
// ★ WHAT IT DELIBERATELY DOES NOT ASSERT is a level — how often a player makes
// contact. That is a consequence of the bat's real half-width and the measured
// swing window, and `sim.humanSwing` records it rather than pinning it.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { cpuSwingAtSec, resolvePitch, throwPitch, type PitchInFlight } from './atbat';
import { makeRng, type Rng } from './rng';
import { ATBAT, resolvePlate } from './params';
import { ROSTER } from '../../data/characters';

const byContact = (v: number) =>
  ROSTER.reduce((b, c) => (Math.abs(c.stats.contact - v) < Math.abs(b.stats.contact - v) ? c : b));

const BATTER = byContact(5);
const PITCHER = byContact(5);
const spec = (batter = BATTER) => ({
  pitcher: PITCHER,
  batter,
  count: { balls: 0, strikes: 0 },
});

/**
 * N pitches, each with its own seed, so a sweep sees a real spread.
 *
 * ★ MEMOISED, because throwing a pitch is the expensive half. `releasePitch`
 * runs a secant solve per pitch (`sim.pitchCorridorV2`: 13.6ms, 350x the flight
 * it produces, which is why PR 8 memoised it in the sim too), and every sweep
 * cell below re-threw the SAME seeded pitches just to swing at them differently.
 * The pitch does not depend on the swing, so it is thrown once per seed.
 */
const PITCH_CACHE = new Map<string, PitchInFlight[]>();
function pitches(n: number, batter = BATTER): Array<{ rng: () => Rng; inF: PitchInFlight }> {
  const key = batter.id;
  let got = PITCH_CACHE.get(key);
  if (!got) PITCH_CACHE.set(key, (got = []));
  for (let i = got.length; i < n; i++) got.push(throwPitch(spec(batter), makeRng(`swing-${i}`)));
  return Array.from({ length: n }, (_, i) => ({
    rng: () => makeRng(`swing-${i}`),
    inF: got![i],
  }));
}

/** Swing at every pitch with the given timing offset and aim, and count. */
function sweep(
  offsetSec: number,
  aimBelowFt: number,
  n = 300,
  batter = BATTER
): { inPlay: number; whiff: number; foul: number; meanLaunchDeg: number } {
  let inPlay = 0,
    whiff = 0,
    foul = 0,
    la = 0;
  for (const { rng, inF } of pitches(n, batter)) {
    const r = resolvePitch(inF, spec(batter), rng(), {
      atSec: inF.travelSec + offsetSec,
      aimHeightFt: inF.crossing.y - aimBelowFt,
    });
    if (r.kind === 'inPlay') {
      inPlay++;
      la += r.launch.launchAngleDeg;
    } else if (r.kind === 'swingingStrike') whiff++;
    else if (r.kind === 'foulTip') foul++;
  }
  return { inPlay, whiff, foul, meanLaunchDeg: inPlay ? la / inPlay : NaN };
}

describe('★ timing is a skill, and the window is a fraction of the flight', () => {
  it('★ is a gradient: on time beats early, and beats late', () => {
    // The shape, not the level. Swinging at the moment the ball arrives must be
    // the best a player can do, and being wrong in either direction must cost.
    const onTime = sweep(0, 0);
    const early = sweep(-0.4, 0);
    const late = sweep(0.4, 0);
    expect(onTime.inPlay).toBeGreaterThan(early.inPlay);
    expect(onTime.inPlay).toBeGreaterThan(late.inPlay);
    // And being badly wrong must mostly MISS, rather than merely hit it softly.
    expect(early.whiff).toBeGreaterThan(early.inPlay);
    expect(late.whiff).toBeGreaterThan(late.inPlay);
  });

  it('★ degrades monotonically as the swing moves away from the ball', () => {
    // ★ SWEPT ON BOTH SIDES ON PURPOSE. A one-sided sweep passes for a model
    // that only punishes being early, which is exactly the asymmetry the view's
    // `SWING_TAIL_SEC` exists to make reachable — before it, no late swing could
    // be expressed at all and this test could not have failed.
    for (const sign of [-1, 1]) {
      let prev = Infinity;
      for (const mag of [0, 0.15, 0.3, 0.45]) {
        const got = sweep(sign * mag, 0).inPlay;
        expect(got, `offset ${sign * mag}`).toBeLessThanOrEqual(prev);
        prev = got;
      }
    }
  });

  it('★ has no swing-outcome constant to tune', () => {
    // The `sim.plateDiscipline` check, pointed at the human. A name that looks
    // like an outcome knob is the thing this model exists to not have: a human
    // whiff rate would be a second, independent answer to a question the swing
    // window already answers.
    for (const k of Object.keys(ATBAT)) {
      expect(/SWING_RATE|WHIFF|CONTACT_RATE|HUMAN/.test(k), `ATBAT.${k} looks like an outcome knob`).toBe(
        false
      );
    }
  });
});

describe('★ aim is a skill, and it is the undercut geometry', () => {
  it('★ swinging under the ball lifts it, monotonically', () => {
    // Nothing says "aim low to hit a fly". It falls out of where the barrel
    // passed, through the same `asin(offset / centreSep)` the CPU goes through.
    let prev = -Infinity;
    for (const below of [-0.15, -0.075, 0, 0.075, 0.15]) {
      const { meanLaunchDeg, inPlay } = sweep(0, below);
      expect(inPlay, `aim ${below} produced no contact`).toBeGreaterThan(0);
      expect(meanLaunchDeg, `aim ${below}`).toBeGreaterThan(prev);
      prev = meanLaunchDeg;
    }
  });

  it('★ misses entirely past the bat`s own half-width', () => {
    // ★ THE TOLERANCE IS A REAL DIMENSION, NOT A KNOB: `BALL_RADIUS_FT +
    // BAT.BARREL_RADIUS_FT`, 2.70in. Past it the bat is not there, which is
    // PR 8's clamp bug stated as a requirement — that bug recorded every such
    // swing as a ball hit exactly straight up or straight down.
    expect(sweep(0, 0.45).inPlay).toBe(0);
    expect(sweep(0, -0.45).inPlay).toBe(0);
    // And inside it, contact is available at every aim.
    expect(sweep(0, 0.15).inPlay).toBeGreaterThan(0);
  });
});

describe('★ a person is not the CPU batter, and two constants prove it', () => {
  const inF = throwPitch(spec(), makeRng('one'));
  const human = { atSec: inF.travelSec, aimHeightFt: inF.crossing.y - 0.1 };

  it('★ `UNDERCUT_FROM_JUDGE` does not apply to him', () => {
    // That constant converts a READ error into a PLACEMENT error, and exists
    // because the CPU's aim is a misjudgement it is unaware of. A player's
    // pointer IS the placement. So changing it must not move a human outcome —
    // and it moves the CPU's, which is what stops this being vacuous.
    const a = resolvePitch(inF, { ...spec(), plate: resolvePlate({ undercutFromJudge: 0.1 }) }, makeRng('r'), human);
    const b = resolvePitch(inF, { ...spec(), plate: resolvePlate({ undercutFromJudge: 2.5 }) }, makeRng('r'), human);
    expect(a).toEqual(b);

    let moved = 0;
    for (let i = 0; i < 120; i++) {
      const p = throwPitch(spec(), makeRng(`u${i}`));
      const lo = resolvePitch(p, { ...spec(), plate: resolvePlate({ undercutFromJudge: 0.1 }) }, makeRng(`u${i}`));
      const hi = resolvePitch(p, { ...spec(), plate: resolvePlate({ undercutFromJudge: 2.5 }) }, makeRng(`u${i}`));
      if (lo.kind !== hi.kind) moved++;
    }
    expect(moved, 'the constant must matter to the CPU, or the test above is vacuous').toBeGreaterThan(0);
  });

  it('★ two-strike protection does not apply to him either', () => {
    // It exists so a poor-contact CPU kid is a foul-ball machine rather than a
    // strikeout machine — a statement about an AI's decision rule, not a rule of
    // baseball. A person decides for himself whether to offer.
    const zero = resolvePitch(inF, { ...spec(), count: { balls: 0, strikes: 0 } }, makeRng('r'), human);
    const two = resolvePitch(inF, { ...spec(), count: { balls: 0, strikes: 2 } }, makeRng('r'), human);
    expect(zero).toEqual(two);
  });

  it('★ he swings when he says so, even at a pitch nowhere near the zone', () => {
    // No `distOutsideZone` gate: a human has no take decision, because not
    // tapping IS the take. A ball at his ankles must be swingable and missable.
    const wild = throwPitch(spec(), makeRng('wild'));
    const r = resolvePitch(wild, spec(), makeRng('r'), { atSec: wild.travelSec, aimHeightFt: -3 });
    expect(r.kind === 'swingingStrike' || r.kind === 'foulTip').toBe(true);
    // Never a called strike or a ball — those are outcomes of NOT swinging.
    expect(r.kind).not.toBe('ball');
    expect(r.kind).not.toBe('calledStrike');
  });

  it('carries his real timing error through to presentation', () => {
    // The field is feedback, not another judgement: the UI may say EARLY or
    // LATE, but it must read the exact error the shared swing model resolved.
    const early = resolvePitch(inF, spec(), makeRng('early-feedback'), {
      atSec: inF.travelSec - 0.08,
      aimHeightFt: inF.crossing.y,
    });
    const late = resolvePitch(inF, spec(), makeRng('late-feedback'), {
      atSec: inF.travelSec + 0.06,
      aimHeightFt: inF.crossing.y,
    });
    expect('timingErrorSec' in early && early.timingErrorSec).toBeCloseTo(-0.08, 10);
    expect('timingErrorSec' in late && late.timingErrorSec).toBeCloseTo(0.06, 10);
  });
});

describe('the CPU swing preview', () => {
  it('is the exact decision later resolved, never a second animation guess', () => {
    for (let i = 0; i < 120; i++) {
      const rng = makeRng(`preview-${i}`);
      const inF = throwPitch(spec(), rng);
      const atSec = cpuSwingAtSec(inF, spec(), rng);
      const result = resolvePitch(inF, spec(), rng);
      if ('timingErrorSec' in result) {
        expect(atSec).toBeCloseTo(result.travelSec + result.timingErrorSec, 12);
      } else {
        expect(atSec).toBeNull();
      }
    }
  });
});

describe('★ the ordering gate: skill beats a kid who has none', () => {
  it('★ a person timing and aiming well out-hits a contact-1 kid', () => {
    // ★ ONE VARIABLE, PER PR 10'S THREE WRONG TRIES. The same pitches, the same
    // seeds and the same batter CHARACTER — the only difference is whether the
    // swing came from a person or from that kid's own two error terms. Swapping
    // in a different kid would also swap his power and his bat speed.
    const kid = byContact(1);
    let human = 0,
      cpu = 0;
    for (const { rng, inF } of pitches(400, kid)) {
      const h = resolvePitch(inF, spec(kid), rng(), {
        atSec: inF.travelSec,
        aimHeightFt: inF.crossing.y,
      });
      if (h.kind === 'inPlay') human++;
      if (resolvePitch(inF, spec(kid), rng()).kind === 'inPlay') cpu++;
    }
    expect(human).toBeGreaterThan(cpu);
  });
});
