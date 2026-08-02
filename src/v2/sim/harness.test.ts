// ---------------------------------------------------------------------------
// The CI slice of the statistical harness.
//
// ★ WHAT A SLICE CAN AND CANNOT DO. It runs a fraction of `npm run sim:harness`
// through the SAME aggregator, so it cannot measure something subtly different
// from the full run — but it is small enough that a rate wobbles. Every band
// here is therefore sized against the difference between the slice and the full
// run, both of which are on the record in `sim.harnessMethod`, and not drawn
// tight around the slice's own number.
//
// ★ AND WHAT IT IS FOR, which is not "checking the numbers are right". Most of
// them are not known to be right — `sim.plateDiscipline` and `sim.babip` are
// pinned, not conformed, because there is no published band for
// four-to-eight-year-olds to hold them to. What this file asserts is the part
// that IS falsifiable without a band:
//
//   1. INTERNAL CONSISTENCY — a split that sums to one, a BABIP that is hits
//      over balls in play, rates inside [0, 1]. Cheap, and they caught nothing;
//      they are here so that a future refactor of `rates()` cannot quietly
//      change what a number means.
//   2. ORDERING — better contact strikes out less, more power hits it harder.
//      These are the assertions with teeth, because they are true of baseball
//      and of any model worth shipping, and no band is needed to state them.
//   3. SHAPE — no launch-angle bin may hold an implausible share. That one is
//      written from experience: PR 8's first histogram had 22% of fair balls in
//      the single 5-degree bin at the top of the scale, because `resolveSwing`
//      clamped a bat that had missed into a graze at exactly 90 degrees. The
//      totals all looked reasonable. See `sim.contactGeometry`.
//   4. THE PIN — today's rates, in bands wide enough to survive noise and tight
//      enough that a retune has to come here and say so.
// ---------------------------------------------------------------------------

import { beforeAll, describe, it, expect } from 'vitest';
import { simulateGame, type GameSpec } from './game';
import {
  newTotals,
  observe,
  observeGame,
  rates,
  classifyLaunch,
  percentileFromBins,
  LAUNCH_CUTS,
  type HarnessTotals,
} from './harness';
import { makeRng } from './rng';
import { VENUE_GEOMETRY, type VenueId } from './field';
import { ROSTER, getCharacter } from '../../data/characters';

const VENUES = Object.keys(VENUE_GEOMETRY) as VenueId[];

/**
 * ★ THE SLICE'S BUDGET, in `game.test.ts`'s idiom and for its reason.
 *
 * A game costs ~84ms once the release memo is warm; twenty of them is under two
 * seconds on the machine that measured it and comfortably past vitest's 5s
 * default on a contended CI runner. #45's lesson is that the answer to a slow
 * suite is to remove the waste and only then state a budget — the waste was
 * removed in PR 7 (1.7s per game to 0.14s, then 84ms) and what is left is games
 * being played, which is the thing under test.
 *
 * `npm run sim:harness` is 874 games. This is 20. Cut THIS if it gets slow,
 * never the full run — the 50k figure is a promise `rng.ts` made when it chose
 * sfc32 over mulberry32.
 */
const SLICE_MS = 60_000;
const SLICE_GAMES = 20;

/** The rotation the full run uses, so the slice sees the same roster spread. */
function teamsFor(n: number) {
  const off = (n * 7) % ROSTER.length;
  const at = (i: number) => ROSTER[(off + i) % ROSTER.length].id;
  return {
    away: { name: 'AWAY', ids: Array.from({ length: 9 }, (_, i) => at(i)) },
    home: { name: 'HOME', ids: Array.from({ length: 9 }, (_, i) => at(i + 9)) },
  };
}

/**
 * Run games into a fresh set of totals.
 *
 * ★ EACH GAME GETS ITS OWN ROOT SEED. The per-plate-appearance fork key is
 * `${inning}${half}${lineupIdx}`, which is NOT unique across games — two
 * `simulateGame` calls sharing a root produce byte-identical games, and a
 * harness would happily measure one game twenty times.
 */
function run(games: number, tag: string, over: Partial<GameSpec> = {}): HarnessTotals {
  const t = newTotals();
  for (let i = 0; i < games; i++) {
    const { away, home } = teamsFor(i);
    const g = simulateGame(
      {
        away,
        home,
        lookup: getCharacter,
        geo: VENUE_GEOMETRY[VENUES[i % VENUES.length]],
        onEvent: (e) => observe(t, e),
        ...over,
      },
      makeRng(`pr8:${tag}:${i}`)
    );
    observeGame(t, g);
  }
  return t;
}

let slice: HarnessTotals;
let r: ReturnType<typeof rates>;

beforeAll(() => {
  slice = run(SLICE_GAMES, 'slice');
  r = rates(slice);
}, SLICE_MS);

describe('the aggregator says what it means', () => {
  it('sums the batted-ball split to one', () => {
    const total = r.split.ground + r.split.line + r.split.fly + r.split.popup;
    expect(total).toBeCloseTo(1, 9);
  });

  it('classifies on the stated cuts, boundaries included', () => {
    expect(classifyLaunch(LAUNCH_CUTS.ground - 0.001)).toBe('ground');
    expect(classifyLaunch(LAUNCH_CUTS.ground)).toBe('line');
    expect(classifyLaunch(LAUNCH_CUTS.line)).toBe('fly');
    expect(classifyLaunch(LAUNCH_CUTS.fly)).toBe('popup');
    expect(classifyLaunch(-45)).toBe('ground');
  });

  it('computes BABIP as hits over balls in play, both excluding home runs', () => {
    const hits = slice.byHit['1B'] + slice.byHit['2B'] + slice.byHit['3B'] + slice.byHit.HR;
    expect(r.babip).toBeCloseTo(
      (hits - slice.byHit.HR) / (slice.battedFair - slice.byHit.HR),
      9
    );
    // And a foul is not a ball in play — the denominator must exclude them.
    expect(slice.battedFoul).toBeGreaterThan(0);
    expect(slice.battedFair + slice.byHit.out).not.toBe(NaN);
  });

  it('keeps every rate inside [0, 1]', () => {
    for (const [k, v] of Object.entries(r)) {
      if (typeof v !== 'number') continue;
      if (['games', 'plateAppearances', 'pitchesPerPlateAppearance', 'runsPerGame'].includes(k))
        continue;
      if (k.endsWith('Mph') || k.endsWith('Deg')) continue;
      expect(v, k).toBeGreaterThanOrEqual(0);
      expect(v, k).toBeLessThanOrEqual(1);
    }
  });

  it('reads a percentile off the histogram at bin resolution', () => {
    // Ten in one bin: every percentile is that bin's midpoint.
    const bins = [0, 0, 10, 0];
    expect(percentileFromBins(bins, 5, 0, 0.5)).toBe(12.5);
    expect(percentileFromBins(bins, 5, 0, 0.9)).toBe(12.5);
    expect(percentileFromBins([1, 1], 2, 0, 0.5)).toBe(1);
    expect(percentileFromBins([0, 0], 2, 0, 0.5)).toBeNaN();
  });

  it('counts every pitch exactly once', () => {
    // Swings and takes partition the pitches; so do in-zone and out-of-zone.
    expect(slice.pitchesInZone + slice.pitchesOutOfZone).toBe(slice.pitches);
    expect(slice.swingsInZone + slice.swingsOutOfZone).toBe(slice.swings);
    expect(slice.swings).toBeLessThanOrEqual(slice.pitches);
  });
});

describe('★ the assertions that need no band', () => {
  it('★ strikes out a bad-contact lineup more than a good-contact one', () => {
    // The single most falsifiable thing the harness can say, and it does not
    // need to know what the right strikeout rate IS.
    const byContact = [...ROSTER].sort((a, b) => b.stats.contact - a.stats.contact);
    const best = byContact.slice(0, 9).map((c) => c.id);
    const worst = byContact.slice(-9).map((c) => c.id);
    const one = (ids: string[], tag: string) => {
      const t = newTotals();
      for (let i = 0; i < 6; i++) {
        const g = simulateGame(
          {
            away: { name: 'A', ids },
            home: { name: 'B', ids },
            lookup: getCharacter,
            onEvent: (e) => observe(t, e),
          },
          makeRng(`pr8:${tag}:${i}`)
        );
        observeGame(t, g);
      }
      return rates(t);
    };
    const good = one(best, 'good');
    const bad = one(worst, 'bad');
    expect(bad.strikeoutPct).toBeGreaterThan(good.strikeoutPct);
    expect(bad.whiffPct).toBeGreaterThan(good.whiffPct);
    // And the good eye chases less, which is the other half of the same stat.
    expect(good.chasePct).toBeLessThan(bad.chasePct);
  }, SLICE_MS);

  it('★ hits the ball harder with more power', () => {
    const byPower = [...ROSTER].sort((a, b) => b.stats.power - a.stats.power);
    const one = (ids: string[], tag: string) => {
      const t = newTotals();
      for (let i = 0; i < 6; i++) {
        const g = simulateGame(
          {
            away: { name: 'A', ids },
            home: { name: 'B', ids },
            lookup: getCharacter,
            onEvent: (e) => observe(t, e),
          },
          makeRng(`pr8:${tag}:${i}`)
        );
        observeGame(t, g);
      }
      return rates(t);
    };
    const strong = one(byPower.slice(0, 9).map((c) => c.id), 'strong');
    const weak = one(byPower.slice(-9).map((c) => c.id), 'weak');
    expect(strong.exitVelocityMeanMph).toBeGreaterThan(weak.exitVelocityMeanMph);
    expect(strong.runsPerGame).toBeGreaterThan(weak.runsPerGame);
  }, SLICE_MS);
});

describe('★ the shape, which is what a total cannot show', () => {
  // ★ THIS IS THE GATE PR 8 WISHES IT HAD HAD. Before the geometry fix, 22% of
  // fair balls sat in the single 5-degree bin at the top of the launch-angle
  // scale and 8% more at the bottom, because `resolveSwing` clamped a bat that
  // had missed the ball into a graze at exactly asin(1). Every total was
  // plausible; only the distribution was absurd.
  it('★ stacks no launch-angle bin against the vertical', () => {
    const total = slice.laBins.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(200);
    const top = slice.laBins[slice.laBins.length - 1] / total;
    const bottom = slice.laBins[0] / total;
    // A continuous distribution cannot pile up at its own boundary. Before the
    // fix these read 0.22 and 0.08.
    expect(top, 'share in the topmost 5-degree bin').toBeLessThan(0.04);
    expect(bottom, 'share in the bottommost bin').toBeLessThan(0.04);
  });

  // ★ THERE IS DELIBERATELY NO "no angle reaches exactly 90" ASSERTION HERE,
  // and the reason is worth more than the test would have been: at 5-degree bin
  // resolution a saturated 90.0 and a perfectly ordinary 89.1 fall in the same
  // bucket, so a histogram CANNOT tell them apart. Written anyway, it would have
  // compared the top bin's midpoint against itself and failed for a reason that
  // has nothing to do with the sim.
  //
  // The exact boundary is asserted where the exact value exists — `contact.test`
  // sweeps undercuts past the barrel and requires `max(|launchAngle|) < 90`.
  // Here the measurable claim is the one above: no PILE-UP at the boundary.


  it('puts the bulk of contact on the ground, as a kid with a heavy bat does', () => {
    // Not a borrowed band — a consequence of a 4ft child swinging under a
    // 46ft pitch. It is here so a change that inverts the split has to argue.
    expect(r.split.ground).toBeGreaterThan(r.split.line);
    expect(r.split.ground).toBeGreaterThan(r.split.fly);
    expect(r.split.ground).toBeGreaterThan(r.split.popup);
  });
});

describe('★ the pin — today, in bands a retune has to come and move', () => {
  // ★ THESE ARE PINNED, NOT CONFORMED, and the distinction is the whole reason
  // `measures.json` has a `status` field. Nothing published measures BABIP or
  // strikeout rate for four-to-eight-year-olds, and `sim.note` says plainly that
  // borrowing MLB's numbers is the failure the `reference` field exists to
  // prevent. So these bands say "this is what the sim does today", and
  // `sim.babip` / `sim.plateDiscipline` say what would close them.
  //
  // The width is the slice-vs-full-run difference, which is on the record in
  // `sim.harnessMethod`: over the quantities below the slice ran within 0.5pp to
  // 2.5pp of the 50,045-PA run, so the bands are +-6pp of an absolute rate.
  const near = (got: number, want: number, tol: number, what: string) => {
    expect(Math.abs(got - want), `${what}: ${got.toFixed(3)} vs pinned ${want}`).toBeLessThan(tol);
  };

  it('pins the plate', () => {
    near(r.strikeoutPct, 0.43, 0.06, 'strikeout rate');
    near(r.walkPct, 0.115, 0.05, 'walk rate');
    near(r.zonePct, 0.48, 0.06, 'share of pitches in the zone');
    near(r.whiffPct, 0.243, 0.06, 'whiff rate');
    near(r.pitchesPerPlateAppearance, 5.12, 0.6, 'pitches per PA');
  });

  it('★ pins the count-aware and hit-type numbers the gate sweep found unread', () => {
    // Both of these were emitted and aggregated by nothing. Replacing the count
    // with a constant 0-0, and crediting every baserunner a single, each moved
    // no assertion at all — so each got one.
    expect(slice.twoStrikePitches, 'two-strike pitches happen').toBeGreaterThan(50);
    // `TWO_STRIKE_PROTECT_FT` is what makes a batter offer at a pitch he reads
    // as a ball once he has two strikes. If the count were not reaching the
    // observer, this would sit at the ordinary swing rate.
    expect(r.twoStrikeSwingPct, 'protection widens the swing').toBeGreaterThan(
      slice.swings / slice.pitches
    );
    near(r.twoStrikeSwingPct, 0.683, 0.12, 'two-strike swing rate');
    // Hit type is DERIVED from where the batter ended up; if it collapsed to
    // "everyone gets a single", this is the number that would notice.
    near(r.extraBasePct, 0.19, 0.09, 'extra-base share of hits');
    expect(slice.byHit['2B'] + slice.byHit['3B'], 'extra-base hits occur').toBeGreaterThan(5);
  });

  it('pins the batted ball', () => {
    near(r.split.ground, 0.602, 0.06, 'ground-ball share');
    near(r.split.line, 0.147, 0.05, 'line-drive share');
    near(r.split.fly, 0.151, 0.05, 'fly-ball share');
    near(r.split.popup, 0.1, 0.05, 'pop-up share');
    near(r.exitVelocityMeanMph, 50.2, 3, 'mean exit velocity, mph');
  });

  it('★ pins the BABIP this PR deliberately does not fix', () => {
    // .713 against real baseball's ~.300. The causes are already on the record
    // — `sim.throwSpeed` is unmeasured, the reach is 3ft, tag-ups are deferred —
    // and PR 9 is the retune. Pinning it is what makes that PR's "before"
    // exist; leaving it unpinned is what would let it drift instead of move.
    near(r.babip, 0.713, 0.08, 'BABIP');
    expect(r.babip, 'still far above real baseball — PR 9 owns this').toBeGreaterThan(0.5);
  });
});
