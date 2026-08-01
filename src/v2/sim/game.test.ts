// ---------------------------------------------------------------------------
// The game loop is checked against v1's own rules, running unmodified.
//
// That is the whole point of the file: `inning.ts`, `gameflow.ts` and `stats.ts`
// are the pure `systems/` modules the purity lint has been whitelisting for
// three PRs while — by its own admission — "the fence had never been leaned on".
// So the standards here are not v2's:
//
//   - `inning.applyAtBat` owns the count, the walk, and the rule that a foul is
//     a strike but never the third. `logic.test.ts` already asserts all of it.
//   - `gameflow.decideAfterHalf` owns extras and when a tie stands.
//   - `stats.foldStats` owns what an at-bat, a hit and a strikeout are.
//
// ★ AND THE PROPERTY THAT MATTERS MOST IS v1's, INHERITED: "a full simulated
// game always terminates with a score". v1's version drafts two teams and plays
// two innings; this one sweeps seeds, venues and rosters, and additionally
// requires that nobody bats out of order and no plate appearance runs away.
// ---------------------------------------------------------------------------

import { beforeAll, describe, it, expect } from 'vitest';
import { simulateGame, type GameResult, type GameSpec } from './game';
import { battingOrder, planDefence, throwDemandFt } from './lineup';
import { GAME } from './params';
import { maxThrowFt } from './fielders';
import { VENUE_GEOMETRY, FIELD_POSITIONS, FIRST, dist, type VenueId } from './field';
import { makeRng } from './rng';
import { autoAssign } from '../../systems/lineup';
import { ROSTER, getCharacter } from '../../data/characters';

const VENUES = Object.keys(VENUE_GEOMETRY) as VenueId[];
const AWAY = ROSTER.slice(0, 9).map((c) => c.id);
const HOME = ROSTER.slice(9, 18).map((c) => c.id);

function spec(over: Partial<GameSpec> = {}): GameSpec {
  return {
    away: { name: 'Rockets', ids: AWAY },
    home: { name: 'Comets', ids: HOME },
    lookup: getCharacter,
    ...over,
  };
}

const game = (seed: string, over: Partial<GameSpec> = {}): GameResult =>
  simulateGame(spec(over), makeRng(seed));

/**
 * ★ AN EXPLICIT TIMEOUT, AND WHY THIS IS NOT #45's MISTAKE.
 *
 * #45 raised nothing and fixed the waste: a test asked for the same nine values
 * sixty times and re-solved each one, and the answer was to memoise. The same
 * discipline was applied here twice and is recorded in `sim.gameShape`: the
 * pitch's release solve went from 13.6ms to a cache hit by having the pitcher
 * aim at a SPOT, and the play reducer stopped RE-TRACING a ball whose trajectory
 * had not changed. Together, 1.7s per game to 0.14s.
 *
 * What is left is not waste — it is a game being played. These tests exist to
 * assert that a game TERMINATES, at every venue and every length, which cannot
 * be done without playing several; and a CI runner is three to five times slower
 * than the machine that measured 140ms. Shaving the sweep further would leave a
 * guard too small to guard anything.
 *
 * So: a stated budget, on the tests that play games, with the cost on the record.
 */
const PLAYS_GAMES = 30_000;

// ★ WARM THE RELEASE MEMO ONCE, HERE, because it is FIXTURE and not the thing
// under test. `releaseAtSpot` solves (kind x arm x spot) the first time each is
// asked for, at 8.6ms a solve — about 860ms for two pitchers. Left inside the
// first `it`, that cost lands on whichever test happens to run first and pushes
// it past vitest's default under CI contention, which is exactly how #45 got a
// timeout raised instead of its waste fixed. Setup belongs in setup.
beforeAll(() => {
  game('warm', { regulationInnings: 1 });
}, PLAYS_GAMES);

describe('★ a full game always terminates with a score', () => {
  // ★ THE SWEEPS ARE BOUNDED AND SPLIT ON PURPOSE. A game costs ~140ms once the
  // release memo is warm, and warming it across two pitchers is ~2s on its own.
  // #45's lesson is that a suite drifting past vitest's default gets the TIMEOUT
  // raised rather than the waste fixed, so each guard gets its own budget and
  // PR 8's harness is where volume belongs.
  const shouldFinish = (g: GameResult, where: string, innings: number) => {
    expect(Number.isFinite(g.awayScore + g.homeScore), where).toBe(true);
    expect(g.awayScore, where).toBeGreaterThanOrEqual(0);
    expect(g.innings, where).toBeGreaterThanOrEqual(innings);
    expect(g.tally.plateAppearances, `${where} played nobody`).toBeGreaterThan(innings * 5);
    // `playAtBat` THROWS rather than looping, so a runaway count is a failure
    // and not a hang — but a plate appearance creeping toward the cap is the
    // warning sign, so it is asserted rather than left to the throw.
    expect(
      g.tally.pitches / g.tally.plateAppearances,
      `${where}: ${(g.tally.pitches / g.tally.plateAppearances).toFixed(1)} pitches per PA`
    ).toBeLessThan(GAME.MAX_PITCHES_PER_PA / 2);
  };

  it('at every venue', () => {
    // ★ ONE INNING EACH, because the claim is "a game at this venue TERMINATES"
    // and the venue is what varies — game LENGTH is the next test's job. Under
    // the full suite's CPU contention a 2-inning sweep here drifted past
    // vitest's default, and #45's lesson is that the alternative to trimming the
    // work is raising the timeout and hiding it.
    for (const id of VENUES) {
      shouldFinish(game(`term:${id}`, { geo: VENUE_GEOMETRY[id], regulationInnings: 1 }), id, 1);
    }
  }, PLAYS_GAMES);

  it('at every game length', () => {
    for (const innings of [1, 3, 6]) {
      for (let seed = 0; seed < 2; seed++) {
        shouldFinish(game(`len:${innings}:${seed}`, { regulationInnings: innings }), `x${innings} #${seed}`, innings);
      }
    }
  }, PLAYS_GAMES);

  it('★ never bats out of order', () => {
    // `lineupIdx` is advanced by the CALLER, not by `applyAtBat` — v1 does it at
    // four separate sites and gets it right at all four. One missed increment
    // and the same kid bats twice; one extra and a kid never bats.
    const g = game('order');
    const batted = g.log.filter((l) => l.startsWith('  ')).map((l) => l.trim().split(':')[0]);
    expect(batted.length).toBeGreaterThan(20);
    // Every logged plate appearance names somebody on one of the two rosters.
    const names = new Set([...AWAY, ...HOME].map((id) => getCharacter(id).name));
    for (const line of batted) {
      const who = line.replace(/ (walks|strikes out).*$/, '');
      expect(names.has(who), `"${who}" is not on either team`).toBe(true);
    }
  }, PLAYS_GAMES);

  it('honours the regulation length and can go to extras', () => {
    let sawExtras = false;
    let sawTie = false;
    for (let seed = 0; seed < 20; seed++) {
      const g = game(`ext:${seed}`, { regulationInnings: 1 });
      expect(g.innings).toBeGreaterThanOrEqual(1);
      expect(g.innings, 'gameflow allows exactly one bonus inning').toBeLessThanOrEqual(
        1 + GAME.MAX_EXTRA_INNINGS
      );
      if (g.innings > 1) sawExtras = true;
      if (g.tie) sawTie = true;
      if (!g.tie && !g.walkOff) expect(g.awayScore).not.toBe(g.homeScore);
    }
    expect(sawExtras, 'a one-inning game should tie sometimes').toBe(true);
    expect(sawTie, 'and some of those should still be tied after the bonus').toBe(true);
  }, PLAYS_GAMES);
});

describe('★ the three seams that bite', () => {
  it('★ attributes every run to a kid, which applyLivePlay cannot', () => {
    // Seam 1. `applyLivePlay` reads `outs`, `runs`, `bases` and `batterOut` —
    // `baseIds` is dropped. A game that folded through it and asked afterwards
    // who scored would have no answer, and every run would be anonymous.
    for (let seed = 0; seed < 6; seed++) {
      const g = game(`attr:${seed}`);
      const credited = Object.values(g.lines).reduce((a, s) => a + s.r, 0);
      expect(credited, `seed ${seed}: ${g.tally.runs} runs scored, ${credited} credited`).toBe(
        g.awayScore + g.homeScore
      );
      expect(g.awayScore + g.homeScore).toBe(g.tally.runs);
    }
  }, PLAYS_GAMES);

  it('★ keeps home and away the right way round through gameflow', () => {
    // Seam 2. `decideAfterHalf(…, awayScore, homeScore, …)` takes away first;
    // `shouldSkipBottom` and `isWalkOff` in the SAME FILE take home first.
    // Reversed arguments would show up as the wrong team walking off, or a
    // bottom half played when the home team was already ahead.
    let sawWalkOff = false;
    let sawSkip = false;
    for (let seed = 0; seed < 24; seed++) {
      const g = game(`ha:${seed}`, { regulationInnings: 2 });
      if (g.walkOff) {
        sawWalkOff = true;
        expect(g.homeScore, `seed ${seed}: a walk-off must be the HOME team ahead`).toBeGreaterThan(
          g.awayScore
        );
      }
      if (g.log.some((l) => l.includes('no bottom'))) {
        sawSkip = true;
        expect(g.homeScore, `seed ${seed}: a skipped bottom means HOME already led`).toBeGreaterThan(
          g.awayScore
        );
      }
    }
    expect(sawWalkOff || sawSkip, 'the sweep has to exercise at least one of them').toBe(true);
  }, PLAYS_GAMES);

  it('★ skips the BOTTOM of the last inning, never the top', () => {
    // `shouldSkipBottom` means "the home team already leads, so their at-bats
    // cannot change anything". Asked at the TOP of the loop instead of after the
    // top HALF, it skips the wrong one: the game ends before the visitors have
    // batted in the final inning. The symptom was a five-column line score under
    // a result claiming six innings — visible only because the demo prints one.
    let checked = 0;
    for (let seed = 0; seed < 24; seed++) {
      const g = game(`skip:${seed}`, { regulationInnings: 3 });
      const skipped = g.log.some((l) => l.includes('no bottom'));
      if (!skipped) continue;
      checked++;
      const where = `seed ${seed}`;
      // The top of the final inning WAS played...
      expect(g.lineScore.length, `${where}: line score is short`).toBe(g.innings);
      expect(g.lineScore[g.innings - 1][0], `${where}: away never batted`).not.toBeNull();
      // ...and the bottom was not.
      expect(g.lineScore[g.innings - 1][1], `${where}: bottom was played anyway`).toBeNull();
      expect(g.homeScore).toBeGreaterThan(g.awayScore);
    }
    expect(checked, 'the sweep has to produce a skipped bottom').toBeGreaterThan(0);
  }, PLAYS_GAMES);

  it('counts a walk as a plate appearance but never an at-bat', () => {
    // `stats.ts`: "Official at-bats (walks don't count)". So AB + walks + the
    // batter-reached-on-error cases must reconcile against plate appearances.
    const g = game('walks');
    const abs = Object.values(g.lines).reduce((a, s) => a + s.ab, 0);
    expect(g.tally.walks).toBeGreaterThan(0);
    expect(abs, 'every PA is an AB except the walks').toBe(
      g.tally.plateAppearances - g.tally.walks
    );
  }, PLAYS_GAMES);
});

describe('the shape of a game', () => {
  it('★ produces strikeouts, walks, fouls, hits and runs — all of them', () => {
    // Every one of these was structurally impossible in v2 before this PR: there
    // was no count, no zone, and `play.ts` never called `isFair`, so a foul ball
    // could not exist at all.
    const t = game('shape').tally;
    expect(t.strikeouts, 'strikeouts').toBeGreaterThan(0);
    expect(t.walks, 'walks').toBeGreaterThan(0);
    expect(t.fouls, 'foul balls').toBeGreaterThan(0);
    expect(t.ballsInPlay, 'balls in play').toBeGreaterThan(0);
    expect(t.hits, 'hits').toBeGreaterThan(0);
    expect(t.runs, 'runs').toBeGreaterThan(0);
  }, PLAYS_GAMES);

  it('spends a plausible number of pitches on a plate appearance', () => {
    // ★ NOT A CONFORMANCE CLAIM. Nothing measures this and `sim.plateDiscipline`
    // says so; PR 8 is the harness that gets an opinion. What a test can say is
    // that the count ADVANCES — a plate appearance averaging two pitches or
    // twelve would mean the umpire or the batter is broken.
    let pitches = 0;
    let pas = 0;
    for (let seed = 0; seed < 5; seed++) {
      const t = game(`pace:${seed}`).tally;
      pitches += t.pitches;
      pas += t.plateAppearances;
    }
    const perPa = pitches / pas;
    expect(perPa, `${perPa.toFixed(2)} pitches per plate appearance`).toBeGreaterThan(3);
    expect(perPa).toBeLessThan(8);
  }, PLAYS_GAMES);

  it('gives a better-contact lineup more contact', () => {
    const best = [...ROSTER].sort((a, b) => b.stats.contact - a.stats.contact).slice(0, 9);
    const worst = [...ROSTER].sort((a, b) => a.stats.contact - b.stats.contact).slice(0, 9);
    const kRate = (ids: string[]) => {
      let k = 0;
      let pa = 0;
      for (let seed = 0; seed < 3; seed++) {
        const g = simulateGame(
          spec({ away: { name: 'A', ids }, home: { name: 'B', ids: HOME } }),
          makeRng(`k:${ids[0]}:${seed}`)
        );
        k += g.tally.strikeouts;
        pa += g.tally.plateAppearances;
      }
      return k / pa;
    };
    expect(kRate(worst.map((c) => c.id))).toBeGreaterThan(kRate(best.map((c) => c.id)));
  }, PLAYS_GAMES);
});

describe('★ the v2 lineup planner, closing PR 6s own finding', () => {
  it('derives each position s arm demand from the FIELD', () => {
    // Nothing states that left field needs an arm; the geometry does. If
    // `FIELD_POSITIONS` moves, the lineup follows.
    expect(throwDemandFt('2B'), 'second base is a short throw').toBeLessThan(throwDemandFt('SS'));
    expect(throwDemandFt('SS')).toBeLessThan(throwDemandFt('3B'));
    expect(throwDemandFt('LF'), 'the outfield throws furthest').toBeGreaterThan(throwDemandFt('3B'));
    expect(throwDemandFt('SS')).toBeCloseTo(dist(FIELD_POSITIONS.SS, FIRST), 10);
  });

  it('★ puts a real arm at short, which autoAssign does not', () => {
    // `sim.gapBallOutcome.theArmAtShort`: v1's planner scores shortstop on
    // `fielding*2 + speed` and never looks at `pitching`, so it put a 34mph arm
    // (77ft of range) at the position with the longest routine infield throw. He
    // fields at 72ft and cannot beat the runner across.
    const v1 = autoAssign(AWAY);
    const v2 = planDefence(AWAY, getCharacter);
    const armAt = (positions: Record<string, string>, pos: string) => {
      const id = Object.entries(positions).find(([, p]) => p === pos)![0];
      return maxThrowFt(getCharacter(id).stats.pitching);
    };
    const need = dist(FIELD_POSITIONS.SS, FIRST);
    expect(armAt(v1.positions, 'SS'), `v1 shortstop reaches ${armAt(v1.positions, 'SS').toFixed(0)}ft`)
      .toBeLessThan(80);
    expect(
      armAt(v2.positions, 'SS'),
      `v2 shortstop must comfortably clear the ${need.toFixed(0)}ft throw`
    ).toBeGreaterThan(armAt(v1.positions, 'SS'));
  });

  it('still puts the best arm on the mound', () => {
    const plan = planDefence(AWAY, getCharacter);
    const best = AWAY.map(getCharacter).reduce((a, b) => (b.stats.pitching > a.stats.pitching ? b : a));
    expect(plan.pitcherId).toBe(best.id);
    expect(plan.positions[best.id]).toBe('P');
  });

  it('fills every position exactly once, on any nine', () => {
    for (let i = 0; i + 9 <= ROSTER.length; i += 3) {
      const ids = ROSTER.slice(i, i + 9).map((c) => c.id);
      const plan = planDefence(ids, getCharacter);
      const filled = Object.values(plan.positions).sort();
      expect(filled, `roster slice ${i}`).toEqual(
        ['1B', '2B', '3B', 'C', 'CF', 'LF', 'P', 'RF', 'SS'].sort()
      );
      expect(new Set(Object.keys(plan.positions)).size).toBe(9);
      expect(new Set(plan.order).size, 'and everybody bats').toBe(9);
    }
    expect(() => planDefence(AWAY.slice(0, 8), getCharacter)).toThrow();
  });

  it('bats the table-setters first', () => {
    const order = battingOrder(AWAY, getCharacter).map(getCharacter);
    const topTwo = (order[0].stats.contact + order[1].stats.contact) / 2;
    const rest = order.slice(2).reduce((a, c) => a + c.stats.contact, 0) / 7;
    expect(topTwo, 'the top of the order gets on base').toBeGreaterThan(rest);
  });
});

describe('determinism', () => {
  it('gives bit-identical results across runs', () => {
    const run = () => {
      const g = game('det');
      return [g.awayScore, g.homeScore, g.innings, ...Object.values(g.tally), g.log.length];
    };
    expect(run()).toEqual(run());
  }, PLAYS_GAMES);

  it('keeps a fork independent of its siblings', () => {
    const a = makeRng('seed');
    const b = makeRng('seed');
    b.fork('somethingElse')();
    expect(simulateGame(spec(), a).tally).toEqual(simulateGame(spec(), b).tally);
  }, PLAYS_GAMES);
});
