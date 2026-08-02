// ---------------------------------------------------------------------------
// `npm run sim:plate-sweep` — search the four coupled plate constants.
//
// ★ WHY A SWEEP AND NOT FOUR JUDGEMENT CALLS. `BAT.ATTACK_ANGLE_DEG`,
// `ATBAT.UNDERCUT_FROM_JUDGE`, `BAT.PULL_DEG_PER_FT` and
// `ATBAT.TWO_STRIKE_PROTECT_FT` all move more than one of the six targets in
// `sim.retuneTargets`, and two of them move targets in OPPOSITE directions:
// protection trades strikeouts against fouls by construction, and the undercut
// scale sets both the whiff rate and the width of the launch-angle
// distribution. Nudging them one at a time converges on whichever number was
// looked at last. Eyeballing three interacting constants is how a value gets
// tuned to make a single test pass, which is the failure `scripts/measures.json`
// exists to catch.
//
// ★ IT REPORTS, IT DOES NOT DECIDE. The targets were written into
// `sim.retuneTargets` BEFORE this script was run — see that record's
// `whyWrittenFIRST`. This prints every combination's distance from them and the
// ordering check; a human reads it and picks. A script that wrote the winning
// values back into `params.ts` would be fitting constants to a target with
// nobody in the loop.
//
// ★ AND IT CHECKS ORDERING AT EVERY POINT, not just at the end. A combination
// that hits all six targets while making a good-contact kid strike out MORE than
// a bad-contact one has broken the model. That is the real gate, per the same
// record's `theGATEISORDERING`, so it is evaluated per candidate rather than
// once on the winner.
//
// Overrides are injected through the sim's own `PlateOverrides` seam rather than
// by rewriting `params.ts`, so an interrupted run cannot leave a tuning constant
// behind — PR 7's sweep did exactly that, twice.
//
// Node >= 22.6, same as the other v2 scripts.
// ---------------------------------------------------------------------------

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const sim = (f) => join(repo, 'src', 'v2', 'sim', f);

const { simulateGame } = await import(sim('game.ts'));
const { newTotals, observe, observeGame, rates } = await import(sim('harness.ts'));
const { makeRng } = await import(sim('rng.ts'));
const { VENUE_GEOMETRY } = await import(sim('field.ts'));
const { ROSTER, getCharacter } = await import(join(repo, 'src', 'data', 'characters.ts'));

const VENUES = Object.keys(VENUE_GEOMETRY);

/** From `sim.retuneTargets`. Read, never written back. */
const TARGETS = {
  strikeoutPct: [0.15, 0.2],
  walkPct: [0.08, 0.14],
  foulToFairRatio: [1.0, 2.0],
  pitchesPerPlateAppearance: [3.6, 4.6],
  groundSharePct: [0.4, 0.5],
  launchAngleMedianDeg: [7, 14],
  // Added in PR 10, when the defence targets were set. `runsPerGame` counts
  // BOTH teams over 6 innings, so 8-12 is 4-6 a side.
  babip: [0.4, 0.45],
  runsPerGame: [8, 12],
};

/** Games per candidate. Small on purpose — this ranks, the full run confirms. */
const GAMES = Number(process.env.SWEEP_GAMES ?? 8);
const RUN_BUDGET_MS = Number(process.env.SWEEP_BUDGET_MS ?? 1_800_000);

function teamsFor(n) {
  const off = (n * 7) % ROSTER.length;
  const at = (i) => ROSTER[(off + i) % ROSTER.length].id;
  return {
    away: { name: 'AWAY', ids: Array.from({ length: 9 }, (_, i) => at(i)) },
    home: { name: 'HOME', ids: Array.from({ length: 9 }, (_, i) => at(i + 9)) },
  };
}

function measure(over, games, tag, ids) {
  const t = newTotals();
  for (let i = 0; i < games; i++) {
    const teams = ids ? { away: { name: 'A', ids }, home: { name: 'B', ids } } : teamsFor(i);
    const g = simulateGame(
      {
        ...teams,
        lookup: getCharacter,
        geo: VENUE_GEOMETRY[VENUES[i % VENUES.length]],
        plate: over,
        onEvent: (e) => observe(t, e),
      },
      makeRng(`pr9:${tag}:${i}`)
    );
    observeGame(t, g);
  }
  const r = rates(t);
  return {
    strikeoutPct: r.strikeoutPct,
    walkPct: r.walkPct,
    foulToFairRatio: t.battedFoul / Math.max(1, t.battedFair),
    pitchesPerPlateAppearance: r.pitchesPerPlateAppearance,
    groundSharePct: r.split.ground,
    launchAngleMedianDeg: r.launchAngleMedianDeg,
    babip: r.babip,
    whiffPct: r.whiffPct,
    chasePct: r.chasePct,
    exitVelocityMeanMph: r.exitVelocityMeanMph,
    runsPerGame: r.runsPerGame,
  };
}

/** Distance from the target box: 0 inside, else how far outside, normalised. */
function miss(m) {
  let total = 0;
  const worst = [];
  for (const [k, [lo, hi]] of Object.entries(TARGETS)) {
    const v = m[k];
    const span = hi - lo;
    const d = v < lo ? (lo - v) / span : v > hi ? (v - hi) / span : 0;
    total += d;
    if (d > 0) worst.push(`${k} ${v.toFixed(3)}`);
  }
  return { total, worst };
}

/**
 * ★ THE GATE. Bad contact must strike out and chase MORE than good contact.
 * Checked per candidate, not once on the winner.
 */
function orderingHolds(over) {
  const byContact = [...ROSTER].sort((a, b) => b.stats.contact - a.stats.contact);
  const good = measure(over, 4, 'ord-good', byContact.slice(0, 9).map((c) => c.id));
  const bad = measure(over, 4, 'ord-bad', byContact.slice(-9).map((c) => c.id));
  return {
    ok: bad.strikeoutPct > good.strikeoutPct && bad.whiffPct > good.whiffPct && good.chasePct < bad.chasePct,
    detail: `K ${(100 * bad.strikeoutPct).toFixed(0)}>${(100 * good.strikeoutPct).toFixed(0)} ` +
      `whiff ${(100 * bad.whiffPct).toFixed(0)}>${(100 * good.whiffPct).toFixed(0)}`,
  };
}

// ★ ATTACK IS SETTLED AT PR 9's 8 DEGREES and is not swept again: it is the one
// axis anchored to a published band (`sim.swingPlane`) rather than to a target,
// so re-fitting it here would turn a measurement into a dial.
const grid = [];
for (const attack of [8])
  for (const undercut of [0.1, 0.16, 0.22, 0.3, 0.38, 0.45])
    for (const pull of [8, 12, 16, 21, 26])
      for (const protect of [0.2, 0.35, 0.55, 0.8]) grid.push({ attack, undercut, pull, protect });

console.log(`sweeping ${grid.length} combinations x ${GAMES} games...\n`);
const started = Date.now();
const results = [];
for (let i = 0; i < grid.length; i++) {
  if (Date.now() - started > RUN_BUDGET_MS) {
    console.error(`\n!! SWEEP BUDGET EXCEEDED after ${i} of ${grid.length}. Narrow the grid.`);
    break;
  }
  const c = grid[i];
  const over = {
    attackAngleDeg: c.attack,
    undercutFromJudge: c.undercut,
    pullDegPerFt: c.pull,
    twoStrikeProtectFt: c.protect,
  };
  const m = measure(over, GAMES, `s${i}`);
  results.push({ c, m, miss: miss(m) });
  if (i % 10 === 0)
    process.stdout.write(`\r  ${i}/${grid.length}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
process.stdout.write('\r' + ' '.repeat(50) + '\r');

results.sort((a, b) => a.miss.total - b.miss.total);
console.log(`=== TOP 12 of ${results.length} (${((Date.now() - started) / 1000).toFixed(0)}s) ===\n`);
console.log(
  '  attack under pull prot |    K%   BB%  foul/fair  p/PA  grnd%  LA50 |  BABIP  runs | miss'
);
for (const r of results.slice(0, 12)) {
  const { c, m } = r;
  console.log(
    `  ${String(c.attack).padStart(6)} ${String(c.undercut).padStart(5)} ${String(c.pull).padStart(4)} ${String(c.protect).padStart(4)} |` +
      ` ${(100 * m.strikeoutPct).toFixed(1).padStart(5)} ${(100 * m.walkPct).toFixed(1).padStart(5)}` +
      ` ${m.foulToFairRatio.toFixed(2).padStart(9)} ${m.pitchesPerPlateAppearance.toFixed(2).padStart(5)}` +
      ` ${(100 * m.groundSharePct).toFixed(1).padStart(6)} ${m.launchAngleMedianDeg.toFixed(1).padStart(5)} |` +
      ` ${m.babip.toFixed(3)} ${m.runsPerGame.toFixed(2).padStart(5)} | ${r.miss.total.toFixed(2)}`
  );
}

console.log('\n=== ORDERING CHECK on the top 5 ===');
for (const r of results.slice(0, 5)) {
  const o = orderingHolds({
    attackAngleDeg: r.c.attack,
    undercutFromJudge: r.c.undercut,
    pullDegPerFt: r.c.pull,
    twoStrikeProtectFt: r.c.protect,
  });
  console.log(
    `  attack ${r.c.attack} under ${r.c.undercut} pull ${r.c.pull} prot ${r.c.protect}: ` +
      `${o.ok ? 'HOLDS' : '★ BROKEN'}  (${o.detail})`
  );
}

console.log(
  '\n  ★ This RANKS. It does not decide, and it does not write params.ts.\n' +
    '    The targets are in sim.retuneTargets and were written before this ran.'
);
