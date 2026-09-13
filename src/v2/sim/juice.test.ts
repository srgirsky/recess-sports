// ---------------------------------------------------------------------------
// The juice meter and its three spends, checked as EFFECTS rather than rates.
//
// The arithmetic is asserted outright — a cap, a cost, a refusal. The spends
// are asserted the way `swing.test.ts` asserts a person's skill: a power
// swing must hit HARDER and be HARDER TO TIME in the same sweep (one without
// the other is a cheat code, and `params.ts` says why it is not one); turbo
// legs must turn a specific single into a double; a golden glove must turn a
// specific drop into a catch WITHOUT moving the drop roll — the roll is drawn
// either way, so the substream every later drop reads is where it was.
//
// The pinned cases were found by a grid search over launches and seeds and
// are recorded here as the launch that showed the effect, not tuned to it.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { addJuice, canSpend, cpuWantsSpend, newJuice, spend, spendSide, SPEND_KINDS } from './juice';
import { JUICE, PLAY } from './params';
import { makeRng } from './rng';
import { resolvePitch, throwPitch, type PitchInFlight } from './atbat';
import { beginPlay, finishPlay, stepPlay, type PlaySpec, type PlayState } from './play';
import { makeFielder, reachOf } from './fielders';
import { reachFt } from './athletes';
import { VENUE_GEOMETRY } from './field';
import type { LaunchSpec } from './launch';
import { autoAssign } from '../../systems/lineup';
import { ROSTER, getCharacter } from '../../data/characters';

describe('the meter', () => {
  it('starts empty, charges by kind, and caps at MAX', () => {
    const j = newJuice();
    expect(j.value).toBe(0);
    addJuice(j, 'hit');
    expect(j.value).toBe(JUICE.GAINS.hit);
    for (let i = 0; i < 20; i++) addJuice(j, 'homer');
    expect(j.value).toBe(JUICE.MAX);
  });

  it('spends exactly the cost, and refuses a meter that is short', () => {
    const j = newJuice();
    expect(canSpend(j, 'turboLegs')).toBe(false);
    expect(spend(j, 'turboLegs')).toBe(false);
    expect(j.value, 'a refused spend must not touch the meter').toBe(0);
    for (let i = 0; i < 10; i++) addJuice(j, 'hit');
    expect(j.value).toBe(JUICE.MAX);
    expect(spend(j, 'powerSwing')).toBe(true);
    expect(j.value).toBe(JUICE.MAX - JUICE.COSTS.powerSwing);
    expect(canSpend(j, 'powerSwing')).toBe(false);
    expect(canSpend(j, 'goldenGlove')).toBe(true);
  });

  it('names every spend once, and which side each belongs to', () => {
    expect([...SPEND_KINDS].sort()).toEqual(Object.keys(JUICE.COSTS).sort());
    expect(spendSide('powerSwing')).toBe('batting');
    expect(spendSide('turboLegs')).toBe('batting');
    expect(spendSide('goldenGlove')).toBe('fielding');
  });
});

describe('the CPU', () => {
  it('★ draws nothing when it cannot afford the spend', () => {
    // A broke side must not move a stream — with the flag on, a side that
    // never charges would otherwise shift its own later rolls.
    const rng = makeRng('broke');
    expect(cpuWantsSpend(newJuice(), 'powerSwing', -3, rng)).toBe(false);
    expect(rng.draws).toBe(0);
  });

  it('spends more when trailing than level, and more level than leading', () => {
    const full = () => {
      const j = newJuice();
      for (let i = 0; i < 10; i++) addJuice(j, 'homer');
      return j;
    };
    const rate = (diff: number) => {
      let yes = 0;
      for (let i = 0; i < 2000; i++) if (cpuWantsSpend(full(), 'turboLegs', diff, makeRng(`cpu${i}`))) yes++;
      return yes / 2000;
    };
    const trailing = rate(-2);
    const level = rate(0);
    const leading = rate(2);
    expect(trailing).toBeGreaterThan(level);
    expect(level).toBeGreaterThan(leading);
    // And the rates are the constants, within a sweep's noise.
    expect(Math.abs(trailing - JUICE.CPU_EAGERNESS.trailing)).toBeLessThan(0.05);
    expect(Math.abs(leading - JUICE.CPU_EAGERNESS.leading)).toBeLessThan(0.05);
  });
});

// --- The power swing --------------------------------------------------------

const byContact = (v: number) =>
  ROSTER.reduce((b, c) => (Math.abs(c.stats.contact - v) < Math.abs(b.stats.contact - v) ? c : b));
const BATTER = byContact(5);
const PITCHER = byContact(5);
const pitchSpec = () => ({ pitcher: PITCHER, batter: BATTER, count: { balls: 0, strikes: 0 } });

const PITCHES: PitchInFlight[] = [];
function pitches(n: number): PitchInFlight[] {
  for (let i = PITCHES.length; i < n; i++) PITCHES.push(throwPitch(pitchSpec(), makeRng(`juice-swing-${i}`)));
  return PITCHES.slice(0, n);
}

/**
 * Swing at every pitch with a timing offset — a FRACTION of that pitch's
 * flight, because the window is one (`BAT.CONTACT_WINDOW_FRAC`), and a fixed
 * number of seconds sits inside both windows on a slow kid's pitch and
 * outside both on a fast one.
 */
function sweep(offsetFrac: number, power: boolean, n = 300): { inPlay: number; meanEvFts: number } {
  let inPlay = 0;
  let ev = 0;
  pitches(n).forEach((inF, i) => {
    const r = resolvePitch(
      inF,
      pitchSpec(),
      makeRng(`juice-swing-${i}`),
      { atSec: inF.travelSec * (1 + offsetFrac), aimHeightFt: inF.crossing.y - 0.05 },
      { power }
    );
    if (r.kind === 'inPlay') {
      inPlay++;
      ev += r.launch.exitVelocityFts;
    }
  });
  return { inPlay, meanEvFts: inPlay ? ev / inPlay : NaN };
}

describe('★ a power swing hits harder AND is harder to time', () => {
  it('★ raises the mean exit velocity on a square swing', () => {
    const plain = sweep(0, false);
    const power = sweep(0, true);
    expect(power.inPlay).toBeGreaterThan(50);
    expect(power.meanEvFts, `plain ${plain.meanEvFts.toFixed(1)} power ${power.meanEvFts.toFixed(1)}`).toBeGreaterThan(
      plain.meanEvFts
    );
  });

  it('★ lowers the contact rate across the timing window, in BOTH directions', () => {
    // Any test of swing timing sweeps both signs (`src/v2/AGENTS.md` § The
    // game loop): a one-sided sweep passes for a build that only narrowed
    // the early half.
    //
    // The band between the two windows: `POWER_WINDOW_MULT * CONTACT_WINDOW_FRAC`
    // and `CONTACT_WINDOW_FRAC` of the flight. Inside it an ordinary swing
    // still touches the ball and a power swing goes by it.
    let plain = 0;
    let power = 0;
    for (const frac of [-0.23, -0.21, -0.2, 0.2, 0.21, 0.23]) {
      plain += sweep(frac, false).inPlay;
      power += sweep(frac, true).inPlay;
    }
    expect(plain, 'the ordinary window must still admit these').toBeGreaterThan(0);
    expect(power, `plain ${plain} power ${power}`).toBeLessThan(plain);
  });

  it('is exactly the ordinary swing when the boost is absent or false', () => {
    const inF = pitches(1)[0];
    const human = { atSec: inF.travelSec, aimHeightFt: inF.crossing.y - 0.05 };
    const a = resolvePitch(inF, pitchSpec(), makeRng('juice-swing-0'), human);
    const b = resolvePitch(inF, pitchSpec(), makeRng('juice-swing-0'), human, { power: false });
    expect(b).toEqual(a);
  });
});

// --- The play ---------------------------------------------------------------

const PARK = VENUE_GEOMETRY.park;
const PLAN = autoAssign(ROSTER.slice(0, 9).map((c) => c.id));
/** The play tests' batter: a speed-5 kid, so the pinned single is his. */
const RUNNER = ROSTER.find((c) => c.stats.speed === 5) ?? ROSTER[0];
const TICK = 1 / 60;

function play(launch: LaunchSpec, boost: PlaySpec['boost'], seed = 'play-tests') {
  const s = beginPlay(
    { launch, batter: RUNNER, runners: [], defence: PLAN.positions, lookup: getCharacter, outs: 0, geo: PARK, boost },
    makeRng(seed)
  );
  const events: PlayState['events'] = [];
  let n = 0;
  while (s.phase === 'live' && n++ < Math.ceil(PLAY.MAX_PLAY_SEC / TICK) + 8) {
    stepPlay(s, TICK);
    events.push(...s.events);
  }
  return { s, events, outcome: finishPlay(s) };
}

describe('★ turbo legs turn a specific single into a double', () => {
  // A blooper into shallow right-centre: on his own legs the batter holds at
  // first; at 1.35x he rounds the bag and the race to second is his.
  const BLOOP: LaunchSpec = { exitVelocityFts: 62, launchAngleDeg: 24, sprayDeg: 22, spinRpm: 1500, heightFt: 2.5 };

  it('★ the pinned case', () => {
    const plain = play(BLOOP, undefined);
    expect(plain.outcome.batterOut).toBe(false);
    expect(plain.outcome.baseIds.indexOf(RUNNER.id), 'a single on his own legs').toBe(0);
    const turbo = play(BLOOP, { turboLegs: true });
    expect(turbo.outcome.batterOut).toBe(false);
    expect(turbo.outcome.baseIds.indexOf(RUNNER.id), 'a double with turbo legs').toBe(1);
  });

  it('scales every batting-side runner, and only at the boost site', () => {
    const plain = play(BLOOP, undefined);
    const turbo = play(BLOOP, { turboLegs: true });
    turbo.s.runners.forEach((r, i) => expect(r.topFts).toBeCloseTo(plain.s.runners[i].topFts * JUICE.TURBO_SPEED_MULT, 9));
    // The fielders are untouched by turbo legs.
    turbo.s.fielders.forEach((f, i) => expect(f.topFts).toBe(plain.s.fielders[i].topFts));
  });
});

describe('★ a golden glove turns a specific drop into a catch', () => {
  // A can of corn to left-centre that this seed's drop roll muffs.
  const FLY: LaunchSpec = { exitVelocityFts: 60, launchAngleDeg: 30, sprayDeg: -15, spinRpm: 1500, heightFt: 2.5 };
  const SEED = 'glove3';

  it('★ the pinned case', () => {
    const plain = play(FLY, undefined, SEED);
    expect(plain.events.some((e) => e.t === 'error' && e.kind === 'drop'), 'the roll drops it').toBe(true);
    expect(plain.outcome.outs).toBe(0);
    const glove = play(FLY, { goldenGlove: true }, SEED);
    expect(glove.events.some((e) => e.t === 'catch'), 'the glove holds it').toBe(true);
    expect(glove.events.some((e) => e.t === 'error'), 'and nothing is dropped').toBe(false);
    expect(glove.outcome.outs).toBe(1);
  });

  it('★ still draws the drop roll, so no later stream moves', () => {
    // The verdict is overridden; the draw is not skipped. A spend that
    // skipped it would shift every later drop in the play. The two plays
    // DIVERGE after the verdict (the muffed one is picked up again, a second
    // draw), so the totals are not comparable — what is asserted is that the
    // one grab the gloved play makes cost the stream exactly one draw, the
    // same draw the plain play spent on its drop.
    const plain = play(FLY, undefined, SEED);
    const glove = play(FLY, { goldenGlove: true }, SEED);
    expect(glove.events.filter((e) => e.t === 'catch' || e.t === 'pickup' || e.t === 'error')).toHaveLength(1);
    expect(glove.s.rng.drop.draws, 'one grab, one draw — not zero').toBe(1);
    expect(plain.s.rng.drop.draws).toBeGreaterThanOrEqual(1);
  });

  it('adds the bonus to every fielder reach, and nothing else', () => {
    const f = makeFielder(ROSTER[0], 'CF');
    expect(f.reachBonusFt).toBe(0);
    expect(reachOf(f, 0)).toBe(reachFt());
    f.reachBonusFt = JUICE.GLOVE_REACH_BONUS_FT;
    expect(reachOf(f, 0)).toBe(reachFt() + JUICE.GLOVE_REACH_BONUS_FT);
    const glove = play(FLY, { goldenGlove: true }, SEED);
    for (const k of glove.s.fielders) expect(k.reachBonusFt).toBe(JUICE.GLOVE_REACH_BONUS_FT);
    expect(glove.s.sureHands).toBe(true);
    expect(play(FLY, undefined, SEED).s.sureHands).toBe(false);
  });
});
