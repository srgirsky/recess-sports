// ---------------------------------------------------------------------------
// `npm run sim:game` — a whole v2 game, played headless and printed.
//
// ★ WHAT THIS IS FOR. `sim:trajectory` answers questions about a ball; this one
// answers the question nothing could ask until PR 7: what does a GAME look like?
// It prints a line score, a box score, a play-by-play, and the counting stats
// PR 8's harness will aggregate — the last of which are REPORTED, NOT CONFORMED.
// `sim.gameShape` is a `note` for that reason, and the sim category's own warning
// applies: conforming a game for four-to-eight-year-olds to MLB's strikeout rate
// is the mistake the `reference` field exists to prevent.
//
// Node >= 22.6, same as the other v2 scripts; the resolution hook comes from the
// npm script's `--import`.
// ---------------------------------------------------------------------------

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const sim = (f) => join(repo, 'src', 'v2', 'sim', f);

const { simulateGame } = await import(sim('game.ts'));
const { planDefence } = await import(sim('lineup.ts'));
const { makeRng } = await import(sim('rng.ts'));
const { VENUE_GEOMETRY } = await import(sim('field.ts'));
const { statLine } = await import(join(repo, 'src', 'systems', 'stats.ts'));
const { ROSTER, getCharacter } = await import(join(repo, 'src', 'data', 'characters.ts'));

const seed = process.argv[2] ?? 'sim-game';
const away = { name: 'THE RED ROCKETS', ids: ROSTER.slice(0, 9).map((c) => c.id) };
const home = { name: 'THE BLUE COMETS', ids: ROSTER.slice(9, 18).map((c) => c.id) };

const started = Date.now();
const g = simulateGame(
  { away, home, lookup: getCharacter, geo: VENUE_GEOMETRY.park },
  makeRng(seed)
);
const elapsed = Date.now() - started;

console.log('=== THE LINE SCORE ===');
const head = ['            '];
for (let i = 0; i < g.lineScore.length; i++) head.push(String(i + 1).padStart(3));
console.log(head.join('') + '   R');
const row = (name, pick) =>
  '  ' +
  name.padEnd(10) +
  g.lineScore.map((ls) => String(pick(ls) ?? '-').padStart(3)).join('') +
  '  ' +
  String(pick === ((ls) => ls[0]) ? g.awayScore : g.homeScore).padStart(3);
console.log(
  '  ' + away.name.padEnd(18) + g.lineScore.map((ls) => String(ls[0]).padStart(3)).join('') + '   ' + g.awayScore
);
console.log(
  '  ' + home.name.padEnd(18) + g.lineScore.map((ls) => String(ls[1] ?? '-').padStart(3)).join('') + '   ' + g.homeScore
);
void row;
const winner = g.tie ? 'TIE' : g.awayScore > g.homeScore ? away.name : home.name;
console.log(`\n  ${g.tie ? 'TIE GAME' : winner + ' win'}${g.walkOff ? ' — WALK-OFF!' : ''}, ${g.innings} innings, played in ${elapsed}ms`);

console.log('\n=== WHO PLAYED WHERE (the v2 planner, which weighs the ARM) ===');
for (const team of [away, home]) {
  const plan = planDefence(team.ids, getCharacter);
  const byPos = Object.fromEntries(Object.entries(plan.positions).map(([id, p]) => [p, getCharacter(id)]));
  console.log(`  ${team.name}`);
  console.log(
    '    ' +
      ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF']
        .map((p) => `${p} ${byPos[p].name.split(' ')[0]}(arm${byPos[p].stats.pitching})`)
        .join('  ')
  );
}

console.log('\n=== THE BOX SCORE ===');
const rows = Object.entries(g.lines)
  .map(([id, line]) => ({ name: getCharacter(id).name, line }))
  .filter((r) => r.line.ab > 0 || r.line.k > 0)
  .sort((a, b) => b.line.h - a.line.h || b.line.r - a.line.r);
for (const r of rows) console.log(`  ${r.name.padEnd(18)} ${statLine(r.line)}`);

console.log('\n=== WHAT THE GAME PRODUCED (reported, NOT conformed) ===');
const t = g.tally;
const pct = (n, d) => ((n / d) * 100).toFixed(1).padStart(5) + '%';
console.log(`  plate appearances ${String(t.plateAppearances).padStart(4)}     pitches ${String(t.pitches).padStart(4)}   (${(t.pitches / t.plateAppearances).toFixed(2)} per PA)`);
console.log(`  strikeouts        ${String(t.strikeouts).padStart(4)}  ${pct(t.strikeouts, t.plateAppearances)} of PA`);
console.log(`  walks             ${String(t.walks).padStart(4)}  ${pct(t.walks, t.plateAppearances)} of PA`);
console.log(`  balls in play     ${String(t.ballsInPlay).padStart(4)}  ${pct(t.ballsInPlay, t.plateAppearances)} of PA`);
console.log(`  foul balls        ${String(t.fouls).padStart(4)}  ${pct(t.fouls, t.pitches)} of pitches`);
console.log(`  hits              ${String(t.hits).padStart(4)}     BABIP ${((t.hits - t.homeRuns) / Math.max(1, t.ballsInPlay - t.homeRuns)).toFixed(3)}`);
console.log(`  runs              ${String(t.runs).padStart(4)}`);
console.log('\n  ★ BABIP is the number that is wrong — real baseball is about .300, and');
console.log('    every second ball in play here is a hit. That is the DEFENCE, and the');
console.log('    causes are on the record already: the arm band (sim.throwSpeed, still');
console.log('    awaiting measurement), the 3ft reach (sim.catchRadius), and the tag-ups');
console.log('    and rundowns PR 7 deferred. PR 8 measures it; PR 9 moves it. Nothing');
console.log('    here was tuned to make it look better.');

console.log('\n=== THE PLAY-BY-PLAY ===');
for (const line of g.log) console.log('  ' + line);
