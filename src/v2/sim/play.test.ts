// ---------------------------------------------------------------------------
// The reducer is checked against four things that are true independently of it:
//
//   - `traceLooseBall`, which predicts where a ball goes and must agree with the
//     tick-by-tick ball the play actually steps — they are the same function, so
//     a disagreement is a bug in the extraction rather than a tolerance;
//   - the closed-form runner leg from `athletes.ts`, which decides every race;
//   - `defense.fielderSpeed.notSufficient`, which measured six plays in v1 and
//     found every one of them an out;
//   - real baseball's SHAPE — a soft grounder is an out, a hard one finds a
//     hole, a ball in the gap is extra bases.
//
// ★ AND ONE CLASS OF TEST THAT IS NOT ABOUT BASEBALL AT ALL. v1 carries eight
// separate anti-hang guards, every one added after a play wedged in someone's
// browser. The sweep in "no play can hang" is the structural version: over every
// venue, spray, contact quality and base state, a play must terminate and every
// runner must be accounted for. v1 found two of those bugs stochastically.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { beginPlay, finishPlay, simulatePlay, stepPlay, type PlaySpec, type PlayState } from './play';
import { traceLooseBall } from './bounce';
import { launch, type LaunchSpec } from './launch';
import { DEFENSE, PLAY } from './params';
import { sprintTimeSec } from './athletes';
import { BASEPATH, FIELD_POSITIONS, VENUE_GEOMETRY, type VenueId } from './field';
import { makeRng } from './rng';
import { mphToFts } from './units';
import { autoAssign } from '../../systems/lineup';
import { ROSTER, getCharacter } from '../../data/characters';

const PARK = VENUE_GEOMETRY.park;
const VENUES = Object.keys(VENUE_GEOMETRY) as VenueId[];
const TICK = 1 / 120;

/** The shipped planner, on a real nine. `fielders.test.ts` uses the same one. */
const PLAN = autoAssign(ROSTER.slice(0, 9).map((c) => c.id));
const BATTER = ROSTER.find((c) => c.stats.speed === 5) ?? ROSTER[0];

function spec(l: LaunchSpec, over: Partial<PlaySpec> = {}): PlaySpec {
  return {
    launch: l,
    batter: BATTER,
    runners: [],
    defence: PLAN.positions,
    lookup: getCharacter,
    outs: 0,
    geo: PARK,
    ...over,
  };
}

const GROUNDER = (sprayDeg: number, exitVelocityFts = 45): LaunchSpec => ({
  exitVelocityFts,
  launchAngleDeg: -2,
  sprayDeg,
  spinRpm: -400,
  heightFt: 2.5,
});
const GAP: LaunchSpec = {
  exitVelocityFts: 95,
  launchAngleDeg: 22,
  sprayDeg: -13,
  spinRpm: 1800,
  heightFt: 2.5,
};

/** Run a play, keeping every event and a per-tick trail. */
function play(sp: PlaySpec, seed = 'play-tests', dt = TICK) {
  const s = beginPlay(sp, makeRng(seed));
  const events: PlayState['events'] = [];
  const trail: Array<{ t: number; outs: number; heldBy: number | null; relayInFlight: boolean }> = [];
  let n = 0;
  while (s.phase === 'live' && n++ < Math.ceil(PLAY.MAX_PLAY_SEC / dt) + 8) {
    const relayInFlight = s.throw?.target.kind === 'fielder';
    stepPlay(s, dt);
    events.push(...s.events);
    trail.push({ t: s.elapsedSec, outs: s.outs, heldBy: s.heldBy, relayInFlight });
  }
  return { s, events, trail, outcome: finishPlay(s) };
}

const kinds = (events: PlayState['events']) => events.map((e) => e.t);

describe('★ one ball implementation, not two', () => {
  it('flies the REDUCER s ball exactly where the trace said it would', () => {
    // ★ THE COMPARISON HAS TO CROSS A BOUNDARY OR IT PROVES NOTHING. The first
    // version of this test stepped `stepLooseBall` in a loop and compared it
    // against `traceLooseBall` — which is a loop over `stepLooseBall`. It was
    // asserting that a function equals itself, and it stayed green when the
    // physics was deliberately perturbed. This one steps the PLAY and reads the
    // ball off `PlayState`, so it fails if the reducer ever grows a ball of its
    // own — the divergence v1's `fielding.ts` has to hedge about and cannot fix.
    for (const id of VENUES) {
      const geo = VENUE_GEOMETRY[id];
      for (const sprayDeg of [-40, -20, 0, 20, 40]) {
        const l: LaunchSpec = {
          exitVelocityFts: 85,
          launchAngleDeg: 12,
          sprayDeg,
          spinRpm: 900,
          heightFt: 2.5,
        };
        const tr = traceLooseBall(launch(l), geo, { horizonSec: 12, samples: 240 });
        if (tr.leftPark) continue;

        // Nine kids who never move and never reach, so the ball's whole life is
        // the ball's. (`readyAtSec` past the horizon is the cleanest way to ask
        // "what would this ball do if nobody touched it".)
        const s = beginPlay(spec(l, { geo }), makeRng(`trace${id}${sprayDeg}`));
        for (const f of s.fielders) f.readyAtSec = 1e6;
        let n = 0;
        while (s.ballPhase !== 'atRest' && n++ < 240 * 12) stepPlay(s, 1 / 240);

        const where = `${id} @${sprayDeg}`;
        expect(s.ball.p.x, `${where} x`).toBeCloseTo(tr.settle.x, 4);
        expect(s.ball.p.z, `${where} z`).toBeCloseTo(tr.settle.z, 4);
        expect(s.elapsedSec, `${where} rest time`).toBeCloseTo(tr.restAtSec, 2);
      }
    }
  });

  it('reports an apex, which is how a fly is told from a grounder', () => {
    // Not the phase: a ball skipping through the infield is airborne between
    // hops. What makes it catchable is that it rises above a kid's glove.
    const ceiling = DEFENSE.CATCH_CENTRE_FT + 3;
    const grounder = traceLooseBall(launch(GROUNDER(-20)), PARK, { horizonSec: 10, samples: 64 });
    const fly = traceLooseBall(launch(GAP), PARK, { horizonSec: 10, samples: 64 });
    expect(grounder.apexFt, 'a grounder never gets above a glove').toBeLessThan(ceiling);
    expect(fly.apexFt, 'a fly does, by a lot').toBeGreaterThan(ceiling * 3);
  });
});

describe('a play, end to end', () => {
  it('retires a routine grounder at first', () => {
    // Hit to the second-base side, where the throw across is 40ft rather than
    // 70. ★ THE SIDE MATTERS, and that is a finding rather than a fixture
    // choice: `systems/lineup.ts` `autoAssign` scores shortstop on
    // `fielding*2 + speed` and never looks at the arm, so this nine puts a
    // 34mph arm at short. He fields a routine grounder at 72ft and cannot
    // quite beat the runner across. See `sim.gapBallOutcome.theArmAtShort`.
    const r = play(spec(GROUNDER(14)));
    expect(kinds(r.events), 'somebody fields it and throws it').toContain('pickup');
    expect(kinds(r.events)).toContain('throw');
    expect(r.outcome.batterOut, `${r.outcome.description} at ${r.s.elapsedSec.toFixed(2)}s`).toBe(true);
    expect(r.outcome.outs).toBe(1);
    expect(r.outcome.bases).toEqual([false, false, false]);
  });

  it('★ makes a ball into the gap EXTRA BASES, which v1 could not', () => {
    // `defense.fielderSpeed.notSufficient` measured v1's true LF-CF gap as "out
    // by 897ms". Here the outfielder gets to it and still cannot do anything
    // with it — 27 of 30 kids cannot throw centre field to first — so the batter
    // takes second while the ball is being relayed in.
    const r = play(spec(GAP));
    expect(r.outcome.batterOut).toBe(false);
    expect(r.outcome.outs).toBe(0);
    expect(r.outcome.bases, 'standing on SECOND, not first').toEqual([false, true, false]);
    expect(kinds(r.events)).toContain('run');
  });

  it('catches a lazy fly for an out', () => {
    const r = play(spec({ exitVelocityFts: 70, launchAngleDeg: 38, sprayDeg: 0, spinRpm: 1500, heightFt: 2.5 }));
    expect(r.outcome.flyCaught).toBe(true);
    expect(r.outcome.batterOut).toBe(true);
    expect(kinds(r.events)).toContain('catch');
    expect(r.s.elapsedSec, 'caught in the air, not chased down').toBeLessThan(5);
  });

  it('★ calls a ball hooked over the POLE a foul, not a home run', () => {
    // ★ THE GATE SWEEP FOUND THIS TEST MISSING. `play.ts` asks `isFair` at the
    // fence as well as at the first touchdown, and deleting that check broke
    // NOTHING — none of the six named plays in `sim.gapBallOutcome` leaves the
    // park outside the lines, so a foul home run was unguarded. Before PR 7 it
    // was worse than unguarded: `isFair` had no caller at all, and every ball
    // that cleared the wall anywhere was a home run.
    const over = (sprayDeg: number) =>
      play(
        spec({ exitVelocityFts: 115, launchAngleDeg: 28, sprayDeg, spinRpm: 2200, heightFt: 2.5 }),
        `pole${sprayDeg}`
      ).outcome;

    for (const sprayDeg of [-60, -52, 52, 60]) {
      const o = over(sprayDeg);
      expect(o.foul, `spray ${sprayDeg} is outside the lines`).toBe(true);
      expect(o.runs, `spray ${sprayDeg} must not score`).toBe(0);
      expect(o.description).toBe('FOUL BALL!');
    }
    for (const sprayDeg of [-40, 0, 40]) {
      const o = over(sprayDeg);
      expect(o.foul, `spray ${sprayDeg} is fair`).toBe(false);
      expect(o.runs, `spray ${sprayDeg} is a home run`).toBeGreaterThan(0);
    }
  });

  it('scores a home run and everybody on', () => {
    const r = play(
      spec({ exitVelocityFts: 115, launchAngleDeg: 28, sprayDeg: 0, spinRpm: 2200, heightFt: 2.5 }, {
        runners: [{ base: 1, char: ROSTER[3] }, { base: 3, char: ROSTER[4] }],
      })
    );
    expect(kinds(r.events)).toContain('homeRun');
    expect(r.outcome.runs, 'batter plus the two aboard').toBe(3);
    expect(r.outcome.outs).toBe(0);
    expect(r.outcome.bases).toEqual([false, false, false]);
  });

  it('★ grades outs into hits as contact gets harder, which is what BABIP IS', () => {
    // The property v1 could not have at any speed: it measured every ball a
    // fielder reached as an out, at every angle.
    const sweep = (ev: number) => {
      let hits = 0;
      for (let sprayDeg = -42; sprayDeg <= 42; sprayDeg += 6) {
        const o = simulatePlay(spec(GROUNDER(sprayDeg, ev)), makeRng(`g${ev}:${sprayDeg}`), 1 / 60);
        if (!o.batterOut && o.outs === 0) hits++;
      }
      return hits;
    };
    const soft = sweep(45);
    const medium = sweep(62);
    const hard = sweep(80);
    expect(soft, 'a 31mph grounder is an out almost anywhere').toBeLessThanOrEqual(4);
    expect(medium, 'a 42mph grounder finds the holes').toBeGreaterThan(soft);
    expect(hard, 'a 55mph grounder gets through').toBeGreaterThanOrEqual(medium);
    expect(hard, 'and it is not simply everything').toBeLessThanOrEqual(15);
  });

  it('★ never turns a ball that LANDS in the outfield into an out at FIRST', () => {
    // v1's claim, restated in the only form that survives a real defence.
    //
    // ★ AND THE DISTINCTION MATTERS: a ball can be a clean hit AND end with the
    // batter out, because he rounded first and was gunned down going for two.
    // That is not the defence converting the ball into an out — it is the
    // offence making a decision and losing. `outs === 0` cannot tell them apart,
    // so this asks the events, which can.
    let landed = 0;
    for (const sprayDeg of [-38, -25, -13, 0, 13, 25, 38]) {
      const r = play(
        spec({ exitVelocityFts: 92, launchAngleDeg: 12, sprayDeg, spinRpm: 1200, heightFt: 2.5 }),
        `of${sprayDeg}`,
        1 / 60
      );
      if (r.outcome.flyCaught) continue; // caught in the air is an honest out
      landed++;
      const outAtFirst = r.events.some((e) => e.t === 'out' && e.base === 1);
      expect(outAtFirst, `spray ${sprayDeg}: ${r.outcome.description}`).toBe(false);
    }
    expect(landed, 'most of these have to actually land or the test is empty').toBeGreaterThanOrEqual(5);
  });

  it('rewards a faster batter on the same ball', () => {
    const l = GROUNDER(-22);
    const slow = simulatePlay(spec(l, { batter: ROSTER.find((c) => c.stats.speed <= 2) ?? BATTER }), makeRng('a'), 1 / 60);
    const fast = simulatePlay(spec(l, { batter: ROSTER.find((c) => c.stats.speed === 10) ?? BATTER }), makeRng('a'), 1 / 60);
    expect(sprintTimeSec(BASEPATH, 10)).toBeLessThan(sprintTimeSec(BASEPATH, 2));
    expect(fast.batterOut ? 1 : 0, 'the fast kid is never MORE out').toBeLessThanOrEqual(slow.batterOut ? 1 : 0);
  });
});

describe('★ the invariants v1 paid for', () => {
  it('never records an out on a throw to a TEAMMATE', () => {
    // v1: "Nobody can be put out on a throw to a teammate, so this branch
    // returns BEFORE the runner loop below. That return is the whole safety
    // argument for the mechanic; do not restructure it away."
    let relayLegs = 0;
    for (const sprayDeg of [-38, -30, -13, 0, 13, 30, 38]) {
      for (const ev of [88, 95, 105]) {
        const st = beginPlay(
          spec({ exitVelocityFts: ev, launchAngleDeg: 20, sprayDeg, spinRpm: 1600, heightFt: 2.5 }),
          makeRng(`relay${sprayDeg}:${ev}`)
        );
        let n = 0;
        while (st.phase === 'live' && n++ < 60 * PLAY.MAX_PLAY_SEC + 8) {
          const wasRelay = st.throw?.target.kind === 'fielder';
          const outsBefore = st.outs;
          stepPlay(st, 1 / 60);
          const landed = wasRelay && st.throw?.target.kind !== 'fielder';
          if (!landed) continue;
          relayLegs++;
          expect(
            st.outs,
            `spray ${sprayDeg} at ${ev}fts: a relay leg landed at ${st.elapsedSec.toFixed(2)}s and retired somebody`
          ).toBe(outsBefore);
        }
      }
    }
    expect(relayLegs, 'the sweep has to actually relay or it proves nothing').toBeGreaterThan(0);
  });

  it('keeps possession in exactly one pair of hands, relays included', () => {
    // `secureBall` is the single choke point, and its invariant is that the kid
    // holding the ball is the kid being steered. A relay is where it is easiest
    // to lose: two kids are involved in one possession change.
    let sawRelay = false;
    for (const sprayDeg of [-30, -13, 13, 30]) {
      const s = beginPlay(spec({ ...GAP, sprayDeg }), makeRng(`hands${sprayDeg}`));
      let n = 0;
      while (s.phase === 'live' && n++ < 60 * PLAY.MAX_PLAY_SEC + 8) {
        stepPlay(s, 1 / 60);
        if (s.events.some((e) => e.t === 'relay')) sawRelay = true;
        const holders = s.fielders.filter((f) => f.hasBall);
        expect(holders.length, `spray ${sprayDeg} at ${s.elapsedSec.toFixed(2)}s`).toBeLessThanOrEqual(1);
        if (s.heldBy !== null) {
          expect(s.fielders[s.heldBy].hasBall, 'heldBy must be the kid with the ball').toBe(true);
          expect(s.active, 'and he is the one being steered').toBe(s.heldBy);
        } else {
          expect(holders.length, 'nobody holds it when nobody holds it').toBe(0);
        }
      }
    }
    expect(sawRelay, 'the sweep must actually relay or it proves nothing').toBe(true);
  });

  it('never lets a half-inning pass three outs', () => {
    // v1 checks `halfHasThreeOuts` INSIDE every out loop for exactly this: "the
    // third out ends the play — no fourth".
    //
    // ★ HONESTLY: this is DEFENCE IN DEPTH, not a gate, and deleting the guard
    // does not make it fire. Bases loaded gives four retirable runners, but the
    // CPU-only rule set in this PR does not turn enough of them into outs on one
    // play to reach four — no tag-ups to double anyone off, no rundowns, and a
    // throw retires at most one forced runner. The guard stays because PR 7 adds
    // exactly the mechanics that would reach it; the test asserts the property
    // rather than pretending to prove it.
    for (const sprayDeg of [-30, -10, 10, 30]) {
      for (const before of [0, 2]) {
        const o = simulatePlay(
          spec(GROUNDER(sprayDeg, 55), {
            outs: before,
            runners: [
              { base: 1, char: ROSTER[3] },
              { base: 2, char: ROSTER[4] },
              { base: 3, char: ROSTER[5] },
            ],
          }),
          makeRng(`o${sprayDeg}:${before}`),
          1 / 60
        );
        expect(before + o.outs, `spray ${sprayDeg} with ${before} away`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('★ never leaves a runner at the plate, or on base 4, or nowhere', () => {
    // Three of v1's bugs are the same bug seen from three sides: a live runner
    // reported on no base is DELETED by the fold into the inning. The straggler
    // settle (`min(from, to)`, in runners.ts), the "a batter at the plate is not
    // settled" termination guard, and the base-occupancy check in `send` are the
    // three places it has to be caught — and the third was missing until this
    // sweep found two runners stacked on second.
    for (const id of VENUES) {
      for (let sprayDeg = -40; sprayDeg <= 40; sprayDeg += 10) {
        for (const ev of [40, 70, 100]) {
          const sp = spec(
            { exitVelocityFts: ev, launchAngleDeg: ev > 80 ? 20 : -2, sprayDeg, spinRpm: 600, heightFt: 2.5 },
            {
              geo: VENUE_GEOMETRY[id],
              runners: [
                { base: 1, char: ROSTER[5] },
                { base: 2, char: ROSTER[8] },
              ],
            }
          );
          const st = beginPlay(sp, makeRng(`acct${id}${sprayDeg}${ev}`));
          let n = 0;
          while (st.phase === 'live' && n++ < 60 * PLAY.MAX_PLAY_SEC + 8) stepPlay(st, 1 / 60);
          const where = `${id} @${sprayDeg} ${ev}fts`;
          for (const r of st.runners) {
            const ok = r.done !== null || (r.from >= 1 && r.from <= 3 && r.to === r.from);
            expect(ok, `${where}: ${r.charId} ended from=${r.from} to=${r.to} done=${r.done}`).toBe(true);
          }
          const out = finishPlay(st);
          const placed = out.bases.filter(Boolean).length;
          const gone = st.runners.filter((r) => r.done !== null).length;
          expect(placed + gone, `${where}: ${st.runners.length} runners in, ${placed + gone} out`).toBe(
            st.runners.length
          );
        }
      }
    }
  });

  it('★ places a runner somewhere even if one reaches finishPlay at the plate', () => {
    // The belt-and-braces v1 carries, and the only one here that is UNREACHABLE
    // through the reducer by design — the termination guard refuses to end a
    // play with a batter still at base 0. So it is asked directly, which is the
    // honest way to test a guard whose whole job is to catch a state that should
    // not occur. v1: "applyLivePlay would silently DELETE them."
    const st = beginPlay(spec(GROUNDER(-22)), makeRng('base0'));
    const batter = st.runners[st.runners.length - 1];
    batter.from = 0;
    batter.to = 0;
    batter.done = null;
    const out = finishPlay(st);
    expect(out.bases[0], 'a runner at the plate is placed on FIRST, not dropped').toBe(true);
    expect(out.baseIds[0]).toBe(batter.charId);
  });
});

describe('★ who gets sent, which took three bugs to get right', () => {
  it('★ only sends a kid after a ball his LEASH covers', () => {
    // Three separate defects showed up here, and each alone was enough to put
    // the wrong kid on the ball for a whole play:
    //   - the two regimes split on PHASE, so a ball skipping through the infield
    //     was "in the air" and the election chased each individual hop;
    //   - every hop re-landed, so the chase changed hands at every bounce;
    //   - `shouldSwitch` got a null incumbent score, so its third guard could
    //     not run and every challenger won.
    // The catcher fielded a ball 88ft from home. The pitcher fielded one forty
    // feet behind the shortstop. Both are leash violations, which is what the
    // leash is FOR: "the pitcher fields balls hit AT him and lets the rest go
    // through."
    let checked = 0;
    for (let sprayDeg = -40; sprayDeg <= 40; sprayDeg += 8) {
      // ★ THE LOW ANGLES BITE HARDEST. A ball at 4-9 degrees hangs for a second
      // and never rises above a glove: reading the PHASE calls that a fly for
      // its whole flight and sends whoever is nearest where it first touches
      // down, which for a liner is an infielder's feet.
      for (const [ev, ang] of [[45, -2], [62, -2], [80, -2], [70, 6], [85, 9], [95, 4]] as const) {
        const st = beginPlay(
          spec({ exitVelocityFts: ev, launchAngleDeg: ang, sprayDeg, spinRpm: -300, heightFt: 2.5 }),
          makeRng(`who${sprayDeg}:${ev}:${ang}`)
        );
        let n = 0;
        let caught: { pos: string; at: { x: number; z: number } } | null = null;
        while (st.phase === 'live' && n++ < 60 * PLAY.MAX_PLAY_SEC + 8) {
          stepPlay(st, 1 / 60);
          if (caught === null && st.heldBy !== null) {
            caught = { pos: st.fielders[st.heldBy].position, at: { ...st.fielders[st.heldBy].p } };
          }
        }
        if (!caught) continue;
        checked++;
        const leash = DEFENSE.LEASH_FT[caught.pos as keyof typeof DEFENSE.LEASH_FT];
        const home = FIELD_POSITIONS[caught.pos as keyof typeof FIELD_POSITIONS];
        const strayed = Math.hypot(caught.at.x - home.x, caught.at.z - home.z);
        expect(
          strayed,
          `spray ${sprayDeg} at ${ev}fts/${ang}deg: the ${caught.pos} fielded it ${strayed.toFixed(0)}ft from his post (leash ${leash})`
        ).toBeLessThanOrEqual(leash);
      }
    }
    expect(checked, 'the sweep has to actually field some of these').toBeGreaterThan(20);
  });
});

describe('★ no play can hang', () => {
  it('always terminates, and never on the clock', () => {
    // ★ THE CAP FIRING IS A BUG THAT WAS CAUGHT, NOT A RULE. v1's `MAX_PLAY_MS`
    // is 21862 and "NOT measured -- scaled with RUNNER_SPEED"; nothing there
    // asserts a legitimate play stays under it, so the cap silently became the
    // way some plays ended. This is the assertion that makes it a backstop.
    let longest = 0;
    let capped = 0;
    let n = 0;
    for (const id of VENUES) {
      for (let sprayDeg = -44; sprayDeg <= 44; sprayDeg += 8) {
        for (const [ev, ang] of [[35, 2], [55, -3], [80, 10], [100, 25], [120, 30]] as const) {
          const sp = spec(
            { exitVelocityFts: ev, launchAngleDeg: ang, sprayDeg, spinRpm: 800, heightFt: 2.5 },
            {
              geo: VENUE_GEOMETRY[id],
              runners: [
                { base: 1, char: ROSTER[6] },
                { base: 2, char: ROSTER[7] },
              ],
            }
          );
          const s = beginPlay(sp, makeRng(`hang${id}${sprayDeg}${ev}`));
          let ticks = 0;
          while (s.phase === 'live' && ticks++ < 60 * PLAY.MAX_PLAY_SEC + 60) stepPlay(s, 1 / 60);
          expect(s.phase, `${id} @${sprayDeg} ${ev}fts never ended`).toBe('done');
          if (s.elapsedSec >= PLAY.MAX_PLAY_SEC) capped++;
          if (s.elapsedSec > longest) longest = s.elapsedSec;
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(150);
    expect(capped, `${capped} of ${n} plays ran to the ${PLAY.MAX_PLAY_SEC}s cap`).toBe(0);
    expect(longest, 'and the longest legitimate play leaves real headroom').toBeLessThan(
      PLAY.MAX_PLAY_SEC * 0.75
    );
  });

  it('is independent of the tick rate', () => {
    for (const l of [GROUNDER(-22), GAP]) {
      const at = (hz: number) => {
        const o = simulatePlay(spec(l), makeRng('rate'), 1 / hz);
        return `${o.outs}/${o.runs}/${o.bases.map((b) => (b ? 1 : 0)).join('')}`;
      };
      expect(at(120), 'the outcome cannot depend on the step size').toBe(at(240));
      expect(at(60)).toBe(at(120));
    }
  });
});

describe('the outcome', () => {
  it('is shaped exactly like v1s LiveOutcome, so PR 7 needs no adapter', () => {
    // `systems/inning.ts` type-imports `LiveOutcome` and `applyLivePlay` reads
    // only `outs`, `runs`, `bases` and `batterOut`. This file does not import
    // `inning` — the fold-back is PR 7's — but the shape has to fit today or
    // that is a rewrite rather than a wiring job.
    //
    // ★ A SUPERSET, NOT AN EQUAL SET, and the difference is the point. PR 7 added
    // `foul`, which v1's `LiveOutcome` does not have and cannot need: v1 rolls
    // fouls at the SWING (`resolveContact` has a flat 25% on weak contact), so a
    // foul never reaches its play reducer at all. Here a foul is a fact about
    // where the ball landed, so it can only be known once it has. What has to
    // hold is that every field `applyLivePlay` reads is still there — an
    // equal-set assertion would have failed for the wrong reason.
    const o = simulatePlay(spec(GROUNDER(-22)), makeRng('shape'), 1 / 60);
    const v1Keys = ['baseIds', 'bases', 'batterOut', 'description', 'flyCaught', 'outs', 'runs'];
    for (const k of v1Keys) expect(Object.keys(o), `LiveOutcome.${k}`).toContain(k);
    expect(o).toHaveProperty('foul');
    expect(o.bases).toHaveLength(3);
    expect(o.baseIds).toHaveLength(3);
    o.bases.forEach((b, i) => {
      expect(typeof b, `bases[${i}]`).toBe('boolean');
      expect(Boolean(o.baseIds[i]), `baseIds[${i}] agrees with bases[${i}]`).toBe(b);
    });
  });

  it('describes the play in words a six-year-old gets', () => {
    expect(simulatePlay(spec(GROUNDER(-22)), makeRng('d1'), 1 / 60).description).toMatch(/OUT|SAFE/);
    expect(
      simulatePlay(
        spec({ exitVelocityFts: 115, launchAngleDeg: 28, sprayDeg: 0, spinRpm: 2200, heightFt: 2.5 }),
        makeRng('d2'),
        1 / 60
      ).description
    ).toMatch(/HOME RUN!/);
  });
});

describe('determinism', () => {
  it('gives bit-identical results across runs', () => {
    const run = () => {
      const out: number[] = [];
      for (const sprayDeg of [-30, -10, 10, 30]) {
        const s = beginPlay(spec(GROUNDER(sprayDeg, 70)), makeRng('det'));
        let n = 0;
        while (s.phase === 'live' && n++ < 1200) {
          stepPlay(s, TICK);
          out.push(s.ball.p.x, s.ball.p.z, s.outs, s.runs, s.active, s.heldBy ?? -1);
        }
        const o = finishPlay(s);
        out.push(o.outs, o.runs, ...o.bases.map((b) => (b ? 1 : 0)));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('keeps a fork independent of its siblings', () => {
    // The play forks its own substreams for drops and wild throws, so adding a
    // draw anywhere else cannot move them.
    const a = makeRng('seed');
    const b = makeRng('seed');
    b.fork('somethingElse')();
    const one = simulatePlay(spec(GROUNDER(-22)), a, 1 / 60);
    const two = simulatePlay(spec(GROUNDER(-22)), b, 1 / 60);
    expect(one).toEqual(two);
  });

  it('★ keeps the drop roll off the throw roll', () => {
    // Two substreams, not one stream and an order. `resolveSwing` proved the
    // point for contact; a play has two kinds of luck in it and the same rule
    // applies: draw order must not be part of the contract.
    const s = beginPlay(spec(GROUNDER(-22)), makeRng('substreams'));
    expect(s.rng.drop.key).not.toBe(s.rng.wild.key);
    const drops = s.rng.drop;
    const before = drops();
    s.rng.wild();
    s.rng.wild();
    const after = makeRng('substreams').fork('drop');
    expect(after(), 'the wild stream cannot move the drop stream').toBe(before);
  });
});

describe('★ the dive is a last resort', () => {
  // ★ `startDive` had no caller at all until PR 10 — `isFair` in PR 7 and
  // `BASE_COVER` in PR 6, again. Wiring it naively then made EVERY routine fly
  // ball a diving catch, because a descending fly passes through the diving
  // envelope on its way into the standing one. It cost no outs, which is exactly
  // why it would have survived: the only symptom was a `dive` event on every
  // catch, and nothing asserted what a dive means.
  const routineFlies = () => {
    const plan = PLAN;
    let dived = 0;
    let caught = 0;
    for (const launchAngleDeg of [35, 45, 55, 65]) {
      for (const sprayDeg of [-30, -10, 10, 30]) {
        const s = beginPlay(
          {
            launch: { exitVelocityFts: 66, launchAngleDeg, sprayDeg, spinRpm: 1500, heightFt: 2.5 },
            defence: plan.positions,
            batter: BATTER,
            lookup: getCharacter,
            geo: VENUE_GEOMETRY.park,
            outs: 0,
          },
          makeRng(`routine${launchAngleDeg}${sprayDeg}`)
        );
        let dive = false;
        let n = 0;
        while (s.phase !== 'done' && n++ < 2000) {
          stepPlay(s, 1 / 60, {});
          for (const e of s.events) {
            if (e.t === 'dive') dive = true;
            if (e.t === 'catch') caught++;
          }
        }
        if (dive) dived++;
      }
    }
    return { dived, caught, total: 16 };
  };

  it('★ does not dive for a ball it is about to catch standing up', () => {
    const { dived, caught, total } = routineFlies();
    expect(caught, 'these are routine fly balls and should be caught').toBeGreaterThan(6);
    // Before the "gap must be opening" gate this was every single one.
    expect(dived, `dived on ${dived} of ${total} routine flies`).toBeLessThan(total / 2);
  });
});

describe('★ the caught fly — tag-ups, sac flies, and the batter', () => {
  const runnerAt = (base: 1 | 2 | 3, idx = 12) => ({
    base,
    char: getCharacter(ROSTER[idx].id),
  });
  const fly = (launchAngleDeg: number, ev: number, runners: ReturnType<typeof runnerAt>[] = []) =>
    simulatePlay(
      {
        launch: { exitVelocityFts: mphToFts(ev), launchAngleDeg, sprayDeg: -5, spinRpm: 1600, heightFt: 2.5 },
        defence: PLAN.positions,
        batter: BATTER,
        runners,
        lookup: getCharacter,
        geo: VENUE_GEOMETRY.park,
        outs: 0,
      },
      makeRng(`fly${launchAngleDeg}${ev}${runners.length}`),
      1 / 60
    );

  it('★ ALWAYS retires the batter, however long it hung', () => {
    // ★ THE RULES BUG PR 12 FOUND. `retireBatterOnCatch` identified the batter
    // by `from === 0`, and a batter-runner who has TOUCHED FIRST is at
    // `from === 1`. Measured: a 50-degree pop-up caught at t=4.17s, after he
    // reached first at t=4.08, produced a caught fly and ZERO outs. A caught fly
    // retires the batter however long it hung — that cannot be said positionally.
    // ★ THE SWEEP MUST REACH THE HANG TIMES THAT TRIGGER IT. The batter's leg
    // is 4.2s, so only a fly that stays up LONGER exposes the bug — measured, it
    // needs 55-65 degrees. A sweep that stopped at 50 passed against the broken
    // code, which the gate sweep caught.
    let caught = 0;
    let hungPastFirst = 0;
    for (const la of [30, 40, 50, 55, 60, 65]) {
      for (const ev of [50, 54, 58]) {
        const o = fly(la, ev);
        if (!o.flyCaught) continue;
        caught++;
        expect(o.batterOut, `${la}deg ${ev}mph: caught but batter safe`).toBe(true);
        expect(o.outs, `${la}deg ${ev}mph: caught but no out recorded`).toBeGreaterThanOrEqual(1);
        if (la >= 55) hungPastFirst++;
      }
    }
    expect(caught, 'the sweep has to actually catch some').toBeGreaterThan(4);
    expect(hungPastFirst, 'and some must hang past the 4.2s leg — that is the case').toBeGreaterThan(2);
  });

  it('★ doubles off a runner caught off his bag', () => {
    // ★ READ OFF THE EVENT'S BASE, because the outcome alone cannot tell this
    // apart from its opposite. A runner who TAGS and is thrown out also makes
    // two outs and also leaves the bases empty — the gate sweep caught two
    // versions that counted him. A double-off is an out recorded at the base he
    // came FROM; a thrown-out tagger is out at the base ahead.
    let doubled = 0;
    let catches = 0;
    for (const la of [25, 30, 35, 40, 45, 50]) {
      for (const ev of [48, 54, 60, 66]) {
        for (const from of [1, 2, 3] as const) {
          const runner = getCharacter(ROSTER[12].id);
          const st = beginPlay(
            {
              launch: { exitVelocityFts: mphToFts(ev), launchAngleDeg: la, sprayDeg: -20, spinRpm: 1500, heightFt: 2.5 },
              defence: PLAN.positions,
              batter: BATTER,
              runners: [{ base: from, char: runner }],
              lookup: getCharacter,
              geo: VENUE_GEOMETRY.park,
              outs: 0,
            },
            makeRng(`dbl${la}${ev}${from}`)
          );
          let caught = false;
          let n = 0;
          while (st.phase !== 'done' && n++ < 2000) {
            stepPlay(st, 1 / 60, {});
            for (const e of st.events) {
              if (e.t === 'catch') caught = true;
              // Retired at his own bag, after the catch: he never got back.
              if (caught && e.t === 'out' && e.runner === runner.id && e.base === from) doubled++;
            }
          }
          if (caught) catches++;
        }
      }
    }
    expect(catches).toBeGreaterThan(20);
    // ★ AND IT IS ZERO TODAY, WHICH IS THE FINDING. The branch is the correct
    // rule and it is currently UNREACHABLE: the CPU running policy never commits
    // a runner off his bag on a catchable fly, so nobody is ever caught out
    // there. An earlier version of this test counted `outs >= 2` and read 2 of
    // 50 as double-offs — those were runners who TAGGED and were thrown out at
    // the next base, the opposite play.
    //
    // Pinned at zero rather than deleted, and pinned rather than left silent:
    // `isFair`, `startDive` and `BASE_COVER` were all authored and reachable by
    // nothing, and each cost a PR to find. This one is named. It becomes
    // reachable the moment `PlayInputs` lets a human send a runner, and this
    // assertion will start failing then — which is the point.
    expect(doubled, 'unreachable today — see the note; PlayInputs makes it live').toBe(0);
  });

  it('★ scores the runner from third — and that is the ARM band, not a mechanic', () => {
    // 0 of 30 kids can throw 180ft and 1 of 30 can reach 150ft, so a tag from
    // third is not a contest. Asserted AS the finding: anyone who makes this
    // fail has changed `sim.throwSpeed`, and `sim.tagUp` says what that means.
    let scored = 0;
    let caught = 0;
    for (const la of [35, 40, 45, 50]) {
      const o = fly(la, 58, [runnerAt(3)]);
      if (!o.flyCaught) continue;
      caught++;
      if (o.runs >= 1) scored++;
    }
    expect(caught).toBeGreaterThan(2);
    expect(scored, 'a deep fly with a runner on third should score him').toBe(caught);
  });

  it('holds a runner on a fly too shallow to tag', () => {
    // The other half: the tag-up is a RACE, so a short fly must not score him.
    const o = fly(28, 44, [runnerAt(3)]);
    if (!o.flyCaught) return;
    expect(o.runs).toBe(0);
  });
});
