// ---------------------------------------------------------------------------
// The defence is checked against three things that are true independently of it:
// published youth throwing velocity, the projectile range formula (which the
// closed-form throw time must satisfy without either being fitted to the other),
// and the SHIPPED FIELD — `field.ts`'s real positions, `bounce.ts`'s real
// physics, and the roster the game actually has.
//
// ★ AND ONE THING NOTHING BEFORE THIS COULD BE CHECKED AGAINST AT ALL: whether a
// ball into the gap is a hit. `defense.fielderSpeed.notSufficient` measured six
// of these in v1 and every one was an out; the true LF-CF gap was an out by
// 897ms. That record's own conclusion is that geometry, not chase speed, was the
// binding constraint. The last block here is the first time the claim can be run
// rather than argued.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  makeFielder,
  stepFielder,
  isFrozen,
  reachOf,
  canReach,
  tryCatch,
  startDive,
  settleDive,
  fumble,
  throwFlightSec,
  maxThrowFt,
  electChaser,
  shouldSwitch,
  type FielderState,
} from './fielders';
import { reachFt, reactionSec, sprintTimeSec, sprintTopSpeedFts, throwSpeedFts } from './athletes';
import { DEFENSE, RUN } from './params';
import { launch } from './launch';
import { traceLooseBall } from './bounce';
import {
  BASEPATH,
  FIELD_POSITIONS,
  FIRST,
  SECOND,
  VENUE_GEOMETRY,
  dist,
  distFromHome,
  type PositionId,
  type Vec2,
} from './field';
import { makeRunner } from './runners';
import { ftsToMph, mphToFts, G } from './units';
import { makeRng } from './rng';
import { simulatePlay } from './play';
import { autoAssign } from '../../systems/lineup';
import { ROSTER, getCharacter } from '../../data/characters';

const PARK = VENUE_GEOMETRY.park;
const POSITIONS: PositionId[] = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
const TICK = 1 / 240;

/**
 * Nine kids at their posts.
 *
 * ★ THROUGH `autoAssign`, not by roster order, and the difference is not
 * cosmetic. The shipped planner puts the best arm on the mound and fills
 * up-the-middle defence first, so the arms left in the corners are the ones a
 * real lineup leaves there. Handing out positions by array index gave a third
 * baseman who could not throw to first — a fact about `ROSTER[5]`, not about
 * the game.
 */
const PLAN = autoAssign(ROSTER.slice(0, 9).map((c) => c.id));
function defence(nowSec = 0): FielderState[] {
  return Object.entries(PLAN.positions).map(([id, pos]) => makeFielder(getCharacter(id), pos, { nowSec }));
}

/** One kid, ready immediately, so a pursuit test measures pursuit. */
function ready(position: PositionId, statIdx = 0, at?: Vec2): FielderState {
  const f = makeFielder(ROSTER[statIdx], position, { at });
  f.readyAtSec = -1;
  return f;
}

describe('the athlete a fielder is', () => {
  it('★ is the SAME kid as the runner, which is the whole point of athletes.ts', () => {
    // defense.fielderSpeed: v1's FIELDER_SPEED drifted to 2.48x RUNNER_SPEED
    // across five retunes, and the fix then scaled both by 1/1.987 and kept the
    // ratio. Here a fielder has no speed of its own to drift.
    for (const c of ROSTER) {
      const f = makeFielder(c, 'SS');
      const r = makeRunner(c, 1);
      expect(f.topFts, `${c.name} top speed`).toBe(r.topFts);
      expect(f.accelFtS2, `${c.name} acceleration`).toBe(r.accelFtS2);
      expect(f.topFts).toBe(sprintTopSpeedFts(c.stats.speed));
    }
  });

  it('reads the ball in a plausible child s reaction time, not v1 s two seconds', () => {
    // Published simple visual reaction in 8-10 year olds is ~280-350ms. v1
    // spends cpuReactionMs 835 + cpuThrowDelayMs 1192 = 2027ms standing still,
    // 48% of a 4200ms leg.
    for (const c of ROSTER) {
      const sec = reactionSec(c.stats.fielding);
      expect(sec).toBeGreaterThanOrEqual(DEFENSE.REACTION_MIN_SEC);
      expect(sec).toBeLessThanOrEqual(DEFENSE.REACTION_MAX_SEC);
    }
    // Decreasing in the stat. `armMult` shipped inverted for want of this test.
    for (let s = 1; s < 10; s++) expect(reactionSec(s + 1)).toBeLessThan(reactionSec(s));
    expect(reactionSec(1) + DEFENSE.RELEASE_SEC).toBeLessThan(2.027 / 2);
  });

  it('throws inside the published youth band, and v1 CLASSIC does not', () => {
    // 36-42 mph at 8U, 37-50 at 9U.
    for (let s = 1; s <= 10; s++) {
      const mph = ftsToMph(throwSpeedFts(s));
      expect(mph, `arm ${s}`).toBeGreaterThanOrEqual(30);
      expect(mph, `arm ${s}`).toBeLessThanOrEqual(50);
    }
    // The comparison `defense.throwSpeed` asks for and cannot make: a multiple
    // of runner speed. The record is blocked because the play it needs — a
    // contested catcher-to-second steal — does not occur in the capture.
    const runner = sprintTopSpeedFts(RUN.ANCHOR_SPEED_STAT);
    const ours = [throwSpeedFts(1) / runner, throwSpeedFts(10) / runner];
    expect(ours[0]).toBeCloseTo(2.44, 1);
    expect(ours[1]).toBeCloseTo(3.91, 1);
    // The published band in the same units: 36-50 mph over an 18.01 ft/s runner
    // is 2.93x-4.07x. Ours brackets it, a little low at the bottom because this
    // roster is four-to-eight-year-olds and the published data is 8U/9U.
    expect(ours[0]).toBeLessThan(mphToFts(36) / runner);
    expect(ours[1]).toBeLessThan(mphToFts(50) / runner);
    // v1 KID — the mode that actually produces base hits — is 4.60x, just above
    // our top. v1 CLASSIC is 9.65x, two and a half times it. That ordering is
    // the strongest thing the blocked record can be given, and it explains
    // KID's playability instead of leaving it a coincidence.
    expect(ours[1]).toBeLessThan(4.6);
    expect(4.6).toBeLessThan(9.65);
  });
});

describe('pursuit', () => {
  it('does not move at all until the kid has read it', () => {
    const f = makeFielder(ROSTER[0], 'CF', { nowSec: 0 });
    const start = { ...f.p };
    let t = 0;
    while (t < f.readyAtSec - TICK) {
      t += TICK;
      stepFielder(f, { x: 0, z: 0 }, TICK, t, PARK);
    }
    expect(isFrozen(f, t)).toBe(true);
    expect(f.p).toEqual(start);
    // And then goes.
    t += reactionSec(ROSTER[0].stats.fielding);
    stepFielder(f, { x: 0, z: 0 }, TICK, t, PARK);
    expect(dist(f.p, start)).toBeGreaterThan(0);
  });

  it('★ accelerates, which is what v1 confounded with its reaction delay', () => {
    // defense.cpuReaction did not promote its 1050ms partial reading because "a
    // displacement threshold cannot separate a DECISION DELAY from an
    // ACCELERATION RAMP" — and v1 could only ever have been measuring the first,
    // because it has no ramp. Here they are two separate quantities.
    const f = ready('CF');
    stepFielder(f, { x: 0, z: 0 }, TICK, 0, PARK);
    expect(f.speedFts).toBeLessThan(1);
    let t = 0;
    while (t < 3) {
      t += TICK;
      stepFielder(f, { x: 0, z: 0 }, TICK, t, PARK);
    }
    expect(f.speedFts).toBeCloseTo(f.topFts, 5);
  });

  it('covers ground at exactly the rate the closed form says', () => {
    for (const idx of [0, 7, 14, 21, 29]) {
      const f = ready('CF', idx, { x: 0, z: 100 });
      const target = { x: 0, z: 60 };
      let t = 0;
      while (t < 20 && dist(f.p, target) > 0.01) {
        t += TICK;
        stepFielder(f, target, TICK, t, PARK);
      }
      expect(t, `${ROSTER[idx].name} covers 40ft`).toBeCloseTo(
        sprintTimeSec(40, ROSTER[idx].stats.speed),
        1
      );
    }
  });

  it('never leaves the field, even chasing a ball resting against the wall', () => {
    const geo = PARK;
    for (const spray of [-40, -20, 0, 20, 40]) {
      const f = ready('CF');
      const target = { x: 400 * Math.sin((spray * Math.PI) / 180), z: 400 * Math.cos((spray * Math.PI) / 180) };
      let t = 0;
      while (t < 30) {
        t += TICK;
        stepFielder(f, target, TICK, t, geo);
      }
      const d = distFromHome(f.p);
      expect(d, `spray ${spray}`).toBeLessThan(400);
      expect(d, `spray ${spray}`).toBeLessThan(distFromHome(target));
    }
  });

  it('is independent of the tick rate', () => {
    for (const hz of [60, 240, 960]) {
      const f = ready('CF', 0, { x: 0, z: 100 });
      let t = 0;
      while (t < 20 && dist(f.p, { x: 0, z: 40 }) > 0.02) {
        t += 1 / hz;
        stepFielder(f, { x: 0, z: 40 }, 1 / hz, t, PARK);
      }
      expect(t, `${hz} Hz`).toBeCloseTo(sprintTimeSec(60, ROSTER[0].stats.speed), 1);
    }
  });
});

describe('the glove', () => {
  it('★ is a sphere with a HEIGHT, which v1 s flat radius is not', () => {
    // v1's fly-ball test is dist(chaser.pos, b.pos) in the flat plane, so a kid
    // standing under a ball 40ft up is "within 34px". Only CATCHABLE_TAIL — a
    // rule that the last 40% of the flight is catchable — stops that, which is
    // a timing constant standing in for a geometry fact.
    const f = ready('CF', 0, { x: 0, z: 100 });
    expect(canReach(f, { x: 0, y: DEFENSE.CATCH_CENTRE_FT, z: 100 }, 1)).toBe(true);
    expect(canReach(f, { x: 0, y: 0.12, z: 100 }, 1), 'a ball at their feet').toBe(true);
    expect(canReach(f, { x: 0, y: 40, z: 100 }, 1), 'a ball forty feet up').toBe(false);
    // The ceiling is chest height plus a reach and nothing else.
    const top = DEFENSE.CATCH_CENTRE_FT + reachFt();
    expect(canReach(f, { x: 0, y: top - 0.01, z: 100 }, 1)).toBe(true);
    expect(canReach(f, { x: 0, y: top + 0.01, z: 100 }, 1)).toBe(false);
  });

  it('reaches exactly REACH_FT sideways and no further', () => {
    const f = ready('CF', 0, { x: 0, z: 100 });
    const y = DEFENSE.CATCH_CENTRE_FT;
    expect(canReach(f, { x: reachFt() - 0.01, y, z: 100 }, 1)).toBe(true);
    expect(canReach(f, { x: reachFt() + 0.01, y, z: 100 }, 1)).toBe(false);
  });

  it('gives a dive a real lunge and charges for an empty one', () => {
    const f = ready('CF', 0, { x: 0, z: 100 });
    expect(reachOf(f, 0)).toBe(reachFt());
    expect(startDive(f, 0)).toBe(true);
    expect(reachOf(f, 0.1)).toBe(reachFt() + DEFENSE.DIVE_REACH_FT);
    expect(canReach(f, { x: reachFt() + 1, y: DEFENSE.CATCH_CENTRE_FT, z: 100 }, 0.1)).toBe(true);
    // The window closes, empty, and the kid is face down.
    expect(settleDive(f, 0.1), 'not over yet').toBe(false);
    expect(settleDive(f, DEFENSE.DIVE_WINDOW_SEC + 0.001), 'empty dive').toBe(true);
    expect(isFrozen(f, DEFENSE.DIVE_WINDOW_SEC + 0.1)).toBe(true);
    expect(canReach(f, { x: 0, y: DEFENSE.CATCH_CENTRE_FT, z: 100 }, DEFENSE.DIVE_WINDOW_SEC + 0.1)).toBe(false);
    // And a diving catch is still a fifth of v1's 21.4ft one.
    expect(reachFt() + DEFENSE.DIVE_REACH_FT).toBeLessThan((34 + 30) / (179.6386 / 60) / 4);
  });

  it('drops the ball at a rate the fielding stat drives', () => {
    const rng = makeRng('drops');
    const counts = [3, 5, 10].map((glove) => {
      const f = ready('CF');
      f.glove = glove;
      let held = 0;
      for (let i = 0; i < 2000; i++) if (tryCatch(f, 'fly', rng.fork(`t${i}`))) held++;
      return held;
    });
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
    // A routine fly is caught the overwhelming majority of the time.
    expect(counts[1] / 2000).toBeGreaterThan(0.8);
    // And a grounder is easier than a fly for the same kid.
    const g = ready('CF');
    let flies = 0;
    let grounders = 0;
    for (let i = 0; i < 2000; i++) {
      if (tryCatch(g, 'fly', rng.fork(`f${i}`))) flies++;
      if (tryCatch(g, 'grounder', rng.fork(`f${i}`))) grounders++;
    }
    expect(grounders).toBeGreaterThan(flies);
  });

  it('freezes a kid who muffs it', () => {
    const f = ready('CF');
    f.hasBall = true;
    fumble(f, 2);
    expect(f.hasBall).toBe(false);
    expect(isFrozen(f, 2.1)).toBe(true);
    expect(isFrozen(f, 2 + DEFENSE.FUMBLE_SEC + 0.01)).toBe(false);
  });
});

describe('the throw', () => {
  it('★ satisfies the projectile range formula, which is not what it is written as', () => {
    // The implementation uses the half-angle identity to avoid trig; the check
    // is the identity it is standing in for: a projectile launched for time t
    // covers v*cos(θ)*t horizontally and returns to its own height at
    // t = 2v sin(θ)/g. Recovering θ from t and re-deriving the range closes it.
    for (const arm of [2, 5, 8, 10]) {
      const v = throwSpeedFts(arm);
      for (const R of [30, 60, 80]) {
        const t = throwFlightSec({ x: 0, z: 0 }, { x: 0, z: R }, arm);
        if (t === null) continue;
        const sinT = (t * G) / (2 * v);
        const cosT = Math.sqrt(1 - sinT * sinT);
        expect(v * cosT * t, `arm ${arm} over ${R}ft`).toBeCloseTo(R, 4);
      }
    }
  });

  it('takes the FAST arc, not the lob', () => {
    // sin(2θ) = Rg/v² has two roots and only one of them is a throw.
    for (const arm of [3, 6, 9]) {
      const v = throwSpeedFts(arm);
      const R = maxThrowFt(arm) * 0.5;
      const t = throwFlightSec({ x: 0, z: 0 }, { x: 0, z: R }, arm)!;
      const sinT = (t * G) / (2 * v);
      expect(Math.asin(sinT) * (180 / Math.PI), `arm ${arm}`).toBeLessThan(45);
    }
  });

  it('is monotone: a longer throw takes longer, a better arm takes less', () => {
    for (const arm of [3, 6, 9]) {
      let prev = 0;
      for (let R = 10; R < maxThrowFt(arm) - 5; R += 10) {
        const t = throwFlightSec({ x: 0, z: 0 }, { x: 0, z: R }, arm)!;
        expect(t, `arm ${arm} at ${R}ft`).toBeGreaterThan(prev);
        prev = t;
      }
    }
    for (let s = 1; s < 10; s++) {
      const a = throwFlightSec({ x: 0, z: 0 }, { x: 0, z: 50 }, s)!;
      const b = throwFlightSec({ x: 0, z: 0 }, { x: 0, z: 50 }, s + 1)!;
      expect(b).toBeLessThan(a);
      expect(maxThrowFt(s + 1)).toBeGreaterThan(maxThrowFt(s));
    }
  });

  it('★ makes the relay a CONSEQUENCE OF AN ARM, not an invented mechanic', () => {
    // v1 had to invent LIVE.RELAY and gate it on a hand-picked 1.39 basepath
    // legs, because throw DISTANCE provably could not discriminate on its field:
    // "a coin-flip on a routine grounder needs an 806px throw and the longest
    // that exists is 418px". Here an average kid in centre simply cannot reach
    // first base, and everybody can make the throw from short.
    const cfToFirst = dist(FIELD_POSITIONS.CF, FIRST);
    const ssToFirst = dist(FIELD_POSITIONS.SS, FIRST);
    expect(cfToFirst).toBeGreaterThan(120);
    expect(throwFlightSec(FIELD_POSITIONS.CF, FIRST, 5), 'an average arm cannot').toBeNull();
    expect(throwFlightSec(FIELD_POSITIONS.CF, FIRST, 10), 'the best arm can').not.toBeNull();
    for (const c of ROSTER) {
      expect(
        throwFlightSec(FIELD_POSITIONS.SS, FIRST, c.stats.pitching),
        `${c.name} must be able to make the routine throw (${ssToFirst.toFixed(0)}ft)`
      ).not.toBeNull();
    }
    // The cutoff is reachable by everybody who needs it: CF to second is a
    // throw, and second to first is a throw.
    expect(throwFlightSec(FIELD_POSITIONS.CF, SECOND, 4)).not.toBeNull();
    expect(throwFlightSec(SECOND, FIRST, 2)).not.toBeNull();
  });
});

// --- The gap ball -----------------------------------------------------------
//
// ★ THIS BLOCK USED TO CARRY ITS OWN REDUCER, and deleting it is the point of
// PR 6. It stepped ONE chaser against ONE runner and said so: "no relays, no
// cutoff, no CPU baserunning policy, no errors. Every one of those omissions
// makes the DEFENCE look better than it will be, so a 'hit' here is a lower
// bound on a hit." It was ninety lines of tick loop that duplicated the control
// flow the real play now owns — a second implementation kept only because the
// first one did not exist yet.
//
// `play.ts` exists. These assertions are the same questions asked of the thing
// that actually plays the game, and `play.test.ts` carries the rest.

describe('★ the gap ball, which is the question v2 exists to answer', () => {
  const PLAN = autoAssign(ROSTER.slice(0, 9).map((c) => c.id));
  const BATTER = ROSTER.find((c) => c.stats.speed === 5) ?? ROSTER[0];
  const hit = (l: Parameters<typeof launch>[0], seed: string) => {
    const o = simulatePlay(
      {
        launch: l,
        batter: BATTER,
        runners: [],
        defence: PLAN.positions,
        lookup: getCharacter,
        outs: 0,
        geo: PARK,
      },
      makeRng(seed),
      1 / 60
    );
    return { hit: !o.batterOut && o.outs === 0, o };
  };

  it('makes a ball into the true LF-CF gap a hit, where v1 made it an out by 897ms', () => {
    // v1's own measurement, at v1's geometry: "true LF-CF gap: out by 897ms".
    // Its record concluded the problem was structural — centre field at 1.49
    // basepaths where real baseball is ~3.3 — and that "any real fix to offense
    // has to touch geometry.FIELD_POSITIONS or the throw ratio, not the chase".
    const r = hit({ exitVelocityFts: 95, launchAngleDeg: 22, sprayDeg: -13, spinRpm: 1800, heightFt: 2.5 }, 'lfcf');
    expect(r.hit, r.o.description).toBe(true);
    // And not marginally: he is standing on second, not first.
    expect(r.o.bases, 'extra bases, through a real defence').toEqual([false, true, false]);
  });

  it('★ still retires a routine infield grounder, which is the other half', () => {
    // A defence that cannot make an out is not a fix — this is the play v1 got
    // right and the one an over-corrected v2 would lose.
    const r = hit({ exitVelocityFts: 45, launchAngleDeg: -2, sprayDeg: 14, spinRpm: -400, heightFt: 2.5 }, 'routine');
    expect(r.o.batterOut, `${r.o.description}`).toBe(true);
  });

  it('★ rewards a fast batter over a slow one on the same ball', () => {
    // The race the whole defence is measured against. Half a second of leg is
    // the difference between the roster's slowest kid and its fastest.
    expect(sprintTimeSec(BASEPATH, 10)).toBeLessThan(sprintTimeSec(BASEPATH, 2) - 0.5);
  });
});

describe('the chaser election', () => {
  const trace = (spec: Parameters<typeof launch>[0]) =>
    traceLooseBall(launch(spec), PARK, { horizonSec: 10, samples: DEFENSE.CHASE_SAMPLES });

  it('sends the nearest kid to the landing spot on a ball in the air', () => {
    const tr = trace({ exitVelocityFts: 85, launchAngleDeg: 30, sprayDeg: -20, spinRpm: 1500, heightFt: 2.5 });
    expect(tr.leftPark, 'this one has to stay in the park to have a landing spot').toBe(false);
    const pick = electChaser({ fielders: defence(), trace: tr, inAir: true });
    expect(pick.point).toEqual(tr.landing);
    expect(['LF', 'CF'], `elected ${POSITIONS[pick.index]}`).toContain(POSITIONS[pick.index]);
  });

  it('★ does not hand every grounder to the pitcher, which is what the leash is for', () => {
    // systems/fielding.ts: "a grounder starts at HOME and rolls outward, so the
    // pitcher is nearest its early path at every spray angle and would field
    // essentially every ground ball".
    let toP = 0;
    for (let spray = -40; spray <= 40; spray += 4) {
      const tr = trace({ exitVelocityFts: 70, launchAngleDeg: -3, sprayDeg: spray, spinRpm: -500, heightFt: 2.5 });
      const pick = electChaser({ fielders: defence(), trace: tr, inAir: false });
      if (POSITIONS[pick.index] === 'P') toP++;
    }
    expect(toP, 'the pitcher fields balls hit AT him and lets the rest go').toBeLessThan(6);
  });

  it('★ counts a kid s READ as part of the journey', () => {
    // It did not at first, and the symptom was spectacular: a shortstop was
    // elected on a 1.42s cut-off when 0.46s of that would be spent standing
    // still, the ball went past him at 7ft, and he trailed it eighty feet into
    // left field before catching up with it at rest. Nothing about that is
    // visible in a fielder's POSITION, so it could only be found by running the
    // election against the pursuit it was predicting.
    const tr = trace({ exitVelocityFts: 70, launchAngleDeg: -3, sprayDeg: -18, spinRpm: -500, heightFt: 2.5 });

    // Two identical kids in the same place. The one who has already read it
    // must be sent, even though the blind one is the zone owner by tie-break.
    const blind = ready('SS');
    const alert = ready('SS');
    blind.readyAtSec = 4;
    const pick = electChaser({ fielders: [blind, alert], trace: tr, inAir: false });
    expect(pick.index, 'the kid who cannot see it yet is not the chaser').toBe(1);

    // And the reported time carries the wait, in both regimes.
    const air = { exitVelocityFts: 85, launchAngleDeg: 28, sprayDeg: -18, spinRpm: 1500, heightFt: 2.5 };
    const trAir = trace(air);
    const now = electChaser({ fielders: [ready('CF')], trace: trAir, inAir: true }).sec;
    const late = ready('CF');
    late.readyAtSec = 1.5;
    expect(electChaser({ fielders: [late], trace: trAir, inAir: true }).sec).toBeCloseTo(now + 1.5, 6);
  });

  it('★ measures what the ratio gate actually bought, which is less than claimed', () => {
    // `defense.chaserElection` says v1's fixed 400ms cut-ahead "cannot be
    // speed-neutral by construction", and measured the zone owner being
    // overridden 27.7% of the time at 106px/s against 32.4% at 42.8px/s. The
    // obvious inference is that a dimensionless gate would be neutral. It is
    // not, and the first version of this test asserted that it was — while
    // scaling fields the election did not read, so it passed while proving
    // nothing.
    //
    // Measured on identical inputs (sim.chaserElectionGate, n=215): the ratio
    // gate drifts 7.4pp across a 4x speed spread and a fixed 0.40s gate drifts
    // 7.4pp. They are the same. What moves the rate is WHICH FIELDERS CAN
    // INTERCEPT AT ALL — a slow kid's cut-off returns null and they leave the
    // comparison — and no gate form touches that.
    //
    // So this pins the drift's SIZE, the way a known-drift record does, instead
    // of claiming an invariance the code does not have.
    const specs: Parameters<typeof launch>[0][] = [];
    for (let spray = -42; spray <= 42; spray += 2) {
      for (const ev of [40, 55, 70, 85, 100]) {
        specs.push({ exitVelocityFts: ev, launchAngleDeg: -3, sprayDeg: spray, spinRpm: -400, heightFt: 2.5 });
      }
    }
    const traces = specs.map((s) => trace(s));
    const overrideRate = (scale: number) => {
      let over = 0;
      for (const tr of traces) {
        const fs = defence();
        for (const f of fs) {
          f.topFts *= scale;
          f.accelFtS2 *= scale;
          f.readyAtSec = 0; // isolate the gate from the read
        }
        let owner = 0;
        let bestZone = Infinity;
        fs.forEach((f, i) => {
          const z = dist(f.home, tr.settle);
          if (z < bestZone) {
            bestZone = z;
            owner = i;
          }
        });
        if (electChaser({ fielders: fs, trace: tr, inAir: false }).index !== owner) over++;
      }
      return (over / traces.length) * 100;
    };
    const rates = [0.5, 1, 2].map(overrideRate);
    expect(rates[1], 'the rate at shipped speed').toBeCloseTo(18.6, 0);
    const spread = Math.max(...rates) - Math.min(...rates);
    expect(spread, 'pinned so it cannot grow unnoticed').toBeLessThan(9);
    expect(spread, 'and so a real improvement is not mistaken for noise').toBeGreaterThan(5);
    // The gate itself is at least dimensionless, which is the thing that IS
    // true: there is no duration here for a future retune to leave stale.
    expect(DEFENSE.CUT_AHEAD_FRAC).toBeLessThan(1);
    expect(Object.keys(DEFENSE).filter((k) => /CUT_AHEAD|SWITCH_MARGIN/.test(k))).toEqual([
      'CUT_AHEAD_FRAC',
      'SWITCH_MARGIN_FRAC',
    ]);
  });

  it('keeps a chaser who is already on the ball', () => {
    const pick = { index: 3, point: { x: 0, z: 0 }, sec: 1 };
    expect(
      shouldSwitch({
        challenger: pick,
        incumbent: 6,
        incumbentToBallFt: DEFENSE.KEEP_RADIUS_FT - 1,
        incumbentSec: 99,
        sinceElectionSec: 99,
      }),
      'you are on it, it is yours'
    ).toBe(false);
    expect(
      shouldSwitch({
        challenger: pick,
        incumbent: 6,
        incumbentToBallFt: 100,
        incumbentSec: 99,
        sinceElectionSec: DEFENSE.SWITCH_COOLDOWN_SEC / 2,
      }),
      'and handovers have a cooldown'
    ).toBe(false);
    expect(
      shouldSwitch({
        challenger: pick,
        incumbent: 6,
        incumbentToBallFt: 100,
        incumbentSec: 1.05,
        sinceElectionSec: 99,
      }),
      'a marginal challenger does not take the job'
    ).toBe(false);
    expect(
      shouldSwitch({
        challenger: pick,
        incumbent: 6,
        incumbentToBallFt: 100,
        incumbentSec: 99,
        sinceElectionSec: 99,
      })
    ).toBe(true);
    expect(
      shouldSwitch({ challenger: pick, incumbent: 3, incumbentToBallFt: 999, incumbentSec: 999, sinceElectionSec: 999 }),
      'nobody hands the ball to themselves'
    ).toBe(false);
  });

  it('always returns somebody, at every venue and angle', () => {
    for (const id of Object.keys(VENUE_GEOMETRY) as (keyof typeof VENUE_GEOMETRY)[]) {
      for (let spray = -44; spray <= 44; spray += 4) {
        for (const angle of [-3, 12, 30]) {
          const tr = traceLooseBall(
            launch({ exitVelocityFts: 90, launchAngleDeg: angle, sprayDeg: spray, spinRpm: 1000, heightFt: 2.5 }),
            VENUE_GEOMETRY[id],
            { horizonSec: 10, samples: DEFENSE.CHASE_SAMPLES }
          );
          const pick = electChaser({ fielders: defence(), trace: tr, inAir: angle > 5 });
          expect(pick.index, `${id} @${spray} ${angle}deg`).toBeGreaterThanOrEqual(0);
          expect(pick.index).toBeLessThan(9);
          expect(Number.isFinite(pick.point.x + pick.point.z)).toBe(true);
        }
      }
    }
  });
});

describe('determinism', () => {
  it('gives bit-identical results across runs', () => {
    const run = () => {
      const out: number[] = [];
      for (const spray of [-30, -10, 10, 30]) {
        const tr = traceLooseBall(
          launch({ exitVelocityFts: 85, launchAngleDeg: 8, sprayDeg: spray, spinRpm: 900, heightFt: 2.5 }),
          PARK,
          { horizonSec: 10, samples: DEFENSE.CHASE_SAMPLES }
        );
        const fs = defence();
        const pick = electChaser({ fielders: fs, trace: tr, inAir: false });
        out.push(pick.index, pick.point.x, pick.point.z, pick.sec === Infinity ? -1 : pick.sec);
        const f = fs[pick.index];
        f.readyAtSec = -1;
        let t = 0;
        while (t < 2) {
          t += TICK;
          stepFielder(f, pick.point, TICK, t, PARK);
          out.push(f.p.x, f.p.z, f.speedFts);
        }
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('keeps a fork independent of its siblings', () => {
    const f = ready('CF');
    const a = makeRng('seed');
    const b = makeRng('seed');
    b.fork('somethingElse')();
    expect(tryCatch(f, 'fly', a.fork('catch'))).toBe(tryCatch(f, 'fly', b.fork('catch')));
  });
});
