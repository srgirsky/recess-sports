// ---------------------------------------------------------------------------
// `npm run sim:harness` — the full statistical run.
//
// ★ WHAT THIS ANSWERS THAT `sim:game` CANNOT. One game is an anecdote. `rng.ts`
// chose sfc32 over v1's mulberry32 explicitly because of this script — "2^128 of
// period against 2^32, which matters once the harness runs 50k plate appearances
// across 8 seeds" — and the pitch solve and the play reducer were both optimised
// for it (1.7s per game to 0.14s). This is the cheque those three PRs wrote.
//
// The aggregation lives in `src/v2/sim/harness.ts` and is shared with the CI
// slice in `harness.test.ts`, the way `layout.browser.js` is shared between the
// dev overlay and `layout-audit.mjs`. A slice measuring something subtly
// different from the full run would be worse than no slice at all.
//
// ★ THE ROSTER ROTATES, AND THAT IS NOT COSMETIC. `sim:game` plays kids 0-8
// against 9-17, so twelve of the thirty never bat. Every rate here — BABIP,
// strikeout share, exit-velocity shape — is a roster average, and one taken over
// 60% of a roster whose stats span 1-10 is a different number from one taken
// over all of it. The rotation is deterministic (an offset per game), so the run
// is reproducible.
//
// ★ AND WHAT IT REFUSES TO DO. The roadmap promises the harness "asserts ...
// against real baseball bands". For most of these quantities there is no
// published band for four-to-eight-year-olds, and `sim.note` says plainly that
// borrowing MLB's is THE failure the `reference` field exists to prevent. So it
// measures, prints, and the records pin — each saying what would close it.
//
// Node >= 22.6, same as the other v2 scripts.
// ---------------------------------------------------------------------------

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const sim = (f) => join(repo, 'src', 'v2', 'sim', f);

const { simulateGame } = await import(sim('game.ts'));
const { newTotals, observe, observeGame, rates, EV_BIN_MPH, LA_BIN_DEG, LAUNCH_CUTS } =
  await import(sim('harness.ts'));
const { makeRng } = await import(sim('rng.ts'));
const { VENUE_GEOMETRY } = await import(sim('field.ts'));
const { ROSTER, getCharacter } = await import(join(repo, 'src', 'data', 'characters.ts'));

/** The promise `rng.ts` made. */
const TARGET_PA = Number(process.env.HARNESS_PA ?? 50_000);
const SEEDS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
const VENUES = Object.keys(VENUE_GEOMETRY);

/**
 * ★ A HARD CEILING, COPIED FROM `layout-audit.mjs`.
 *
 * Not a timeout on any one game — a game that hangs would blow this too, but so
 * would a change that made every game four times slower, which is the case a
 * per-game timeout misses entirely. The measured cost is ~85s; the ceiling is
 * generous enough that a slow laptop is not a failure and tight enough that a
 * regression is.
 */
const RUN_BUDGET_MS = Number(process.env.HARNESS_BUDGET_MS ?? 420_000);

const t = newTotals();
const started = Date.now();
let games = 0;
let seedIdx = 0;

// The rotation: each game slides the 18-kid window around the 30-kid roster, so
// over a full run every kid bats roughly equally often on both sides.
const teamsFor = (n) => {
  const off = (n * 7) % ROSTER.length; // 7 is coprime with 30 — a full cycle
  const at = (i) => ROSTER[(off + i) % ROSTER.length].id;
  return {
    away: { name: 'AWAY', ids: Array.from({ length: 9 }, (_, i) => at(i)) },
    home: { name: 'HOME', ids: Array.from({ length: 9 }, (_, i) => at(i + 9)) },
  };
};

while (t.plateAppearances < TARGET_PA) {
  const elapsed = Date.now() - started;
  if (elapsed > RUN_BUDGET_MS) {
    console.error(
      `\n!! RUN BUDGET EXCEEDED: ${(elapsed / 1000).toFixed(1)}s > ${(RUN_BUDGET_MS / 1000).toFixed(0)}s ` +
        `after ${games} games / ${t.plateAppearances} PA.\n` +
        `   Either the sim got slower or the target moved. Do not raise the budget without ` +
        `finding out which — see #45 in AGENTS.md.`
    );
    process.exit(1);
  }
  const seed = SEEDS[seedIdx % SEEDS.length];
  const { away, home } = teamsFor(games);
  // ★ EACH GAME GETS ITS OWN ROOT. The per-PA fork key is `${inning}${half}
  // ${lineupIdx}`, which is NOT unique across games — two `simulateGame` calls
  // sharing a root produce byte-identical games, and the harness would measure
  // one game 590 times without noticing.
  const g = simulateGame(
    {
      away,
      home,
      lookup: getCharacter,
      geo: VENUE_GEOMETRY[VENUES[games % VENUES.length]],
      onEvent: (e) => observe(t, e),
    },
    makeRng(`pr8:${seed}:${games}`)
  );
  observeGame(t, g);
  games += 1;
  if (games % 8 === 0) seedIdx += 1;
  if (games % 50 === 0) {
    process.stdout.write(
      `\r  ${games} games / ${t.plateAppearances} PA / ${((Date.now() - started) / 1000).toFixed(0)}s`
    );
  }
}
const elapsedMs = Date.now() - started;
process.stdout.write('\r' + ' '.repeat(60) + '\r');

const r = rates(t);
const pct = (x) => (x * 100).toFixed(1).padStart(5) + '%';
const num = (x, d = 3) => x.toFixed(d).padStart(6);

console.log('=== THE RUN ===');
console.log(`  ${games} games, ${t.plateAppearances} plate appearances, ${t.pitches} pitches`);
console.log(`  ${SEEDS.length} seeds, ${VENUES.length} venues, all ${ROSTER.length} kids`);
console.log(`  ${(elapsedMs / 1000).toFixed(1)}s (${(elapsedMs / games).toFixed(0)}ms per game)`);

console.log('\n=== THE PLATE ===   (sim.plateDiscipline)');
console.log(`  strikeout rate      ${pct(r.strikeoutPct)}   of plate appearances`);
console.log(`  walk rate           ${pct(r.walkPct)}`);
console.log(`  pitches in the zone ${pct(r.zonePct)}   as the umpire called them`);
console.log(`  swing at a strike   ${pct(r.zoneSwingPct)}`);
console.log(`  chase a ball        ${pct(r.chasePct)}`);
console.log(`  whiff on a swing    ${pct(r.whiffPct)}`);
console.log(`  foul                ${pct(r.foulPct)}   of pitches`);
console.log(`  swing with 2 strikes${pct(r.twoStrikeSwingPct)}   protection (ATBAT.TWO_STRIKE_PROTECT_FT)`);
console.log(`  pitches per PA      ${num(r.pitchesPerPlateAppearance, 2)}`);

console.log('\n=== THE BATTED BALL ===   (sim.battedBallSplit)');
console.log(
  `  ground (<${LAUNCH_CUTS.ground}deg)       ${pct(r.split.ground)}\n` +
    `  line (${LAUNCH_CUTS.ground}-${LAUNCH_CUTS.line}deg)      ${pct(r.split.line)}\n` +
    `  fly (${LAUNCH_CUTS.line}-${LAUNCH_CUTS.fly}deg)        ${pct(r.split.fly)}\n` +
    `  popup (>${LAUNCH_CUTS.fly}deg)       ${pct(r.split.popup)}`
);
console.log(`  fair balls          ${t.battedFair}   (${t.battedFoul} foul)`);
console.log(`  exit velo mean      ${num(r.exitVelocityMeanMph, 1)} mph`);
console.log(`  exit velo median    ${num(r.exitVelocityMedianMph, 1)} mph  (+-${EV_BIN_MPH / 2})`);
console.log(`  exit velo p90       ${num(r.exitVelocityP90Mph, 1)} mph  (+-${EV_BIN_MPH / 2})`);
console.log(`  launch angle median ${num(r.launchAngleMedianDeg, 1)} deg  (+-${LA_BIN_DEG / 2})`);
console.log(`  launch angle MEAN   ${num(r.launchAngleMeanDeg, 1)} deg  (0 means no swing plane — sim.swingPlane)`);

console.log('\n=== THE OUTCOME ===   (sim.gameShape)');
console.log(`  BABIP               ${num(r.babip)}   hits per non-HR ball in play`);
console.log(`  average on contact  ${num(r.battingAverageOnContact)}`);
console.log(`  extra-base share    ${pct(r.extraBasePct)}   of hits`);
console.log(`  singles/doubles/triples  ${t.byHit['1B']} / ${t.byHit['2B']} / ${t.byHit['3B']}`);
console.log(`  home runs           ${t.byHit.HR}`);
console.log(`  runs per game       ${num(r.runsPerGame, 2)}`);
console.log(`  fly balls caught    ${t.flyCaught}`);
console.log(`  steal attempts      ${num(r.stealAttemptsPerGame, 2)} per game, ${pct(r.stealSuccessPct)} safe`);

console.log('\n=== THE HISTOGRAMS ===');
bar('exit velocity, mph', t.evBins, EV_BIN_MPH, 0);
bar('launch angle, deg', t.laBins, LA_BIN_DEG, -90);

console.log(
  '\n  ★ These numbers are MEASURED AND PINNED, not conformed. There is no\n' +
    '    published band for four-to-eight-year-olds to hold most of them to;\n' +
    '    each record says what would close it. See scripts/measures.json.'
);

function bar(title, bins, width, origin) {
  const max = Math.max(...bins);
  if (max === 0) return;
  console.log(`\n  ${title}`);
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] === 0) continue;
    const lo = origin + i * width;
    console.log(
      `    ${String(lo).padStart(4)}-${String(lo + width).padStart(4)}  ` +
        '#'.repeat(Math.max(1, Math.round((bins[i] / max) * 48))) +
        ` ${bins[i]}`
    );
  }
}
