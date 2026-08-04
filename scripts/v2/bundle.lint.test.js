// ---------------------------------------------------------------------------
// What replaced the v1 bundle-hash invariant.
//
// ★ AGENTS.md SAID "a v2 change that alters `dist/assets/main-*.js` is a bug"
// from the day v2 started, and PR 13 retired it. The play view is the first v2
// code to import the sim, which value-imports the pure `systems/inning`, so for
// the first time both entry points needed the same v1 module and Rollup hoisted
// it into a shared chunk — v1's bundle moved without a line of v1 changing.
// Three fixes were measured and none preserves the hash; building v1 ALONE
// produces a different hash and 18kB more, which proves the hash was a property
// of the combined build rather than a fingerprint of v1's source.
// `render.v1BundleInvariant` has the arithmetic.
//
// The guarantee is carried by `purity.lint.test.js` § "v1 has no path to v2"
// (v1's module graph cannot reach v2) and by the empty v1 source diff. What
// those two do NOT catch is accidental bloat, which the hash incidentally did —
// so that is what this file keeps.
//
// It runs only when `dist/` exists, so `npm test` does not require a build.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const assets = join(repo, 'dist', 'assets');

/**
 * Measured at PR 13, kB. The band is +-2%: bloat is the thing worth catching.
 *
 * V1 has not moved since it was pinned and must not; every raise below is v2's.
 *
 * ⚠️ THE NUMBERS CHANGED MEANING at PR 21: they are now what an ENTRY LOADS
 * (its chunk plus its preloads), not the size of one file. See `entryKb`.
 *
 * V2 RAISES, each a reviewed act with what earned it:
 *   782 -> 799   PR 20, the app shell. `App`, `Router`, the title and result
 *                screens, the DOM helpers and the pure `resultModel` -- plus
 *                v1's `systems/awards`, which the result screen IMPORTS rather
 *                than reimplementing so a kid who is MVP here is MVP by the
 *                same arithmetic as in the sticker album. 17kB for the whole
 *                front end of the game, and it is the last thing standing
 *                between v2 and being playable end to end.
 *   799 -> 887   PR 21, the draft. 30 kid cards drawn by v1's own
 *                `art/CharacterArt.ts` -- 62kB of SVG builder, IMPORTED rather
 *                than a second set of thirty portraits commissioned or copied.
 *                v1 already paid for it, so the shared chunk it moves into is
 *                loaded by both entries and v1's own payload is unchanged
 *                (1908.4 -> 1908.7kB).
 */
const V1_KB = 1909;
const V2_KB = 887;
const TOLERANCE = 0.02;

/**
 * What an ENTRY actually costs a player: its own chunk plus every chunk its
 * HTML preloads.
 *
 * ★ MEASURING ONE FILE IS THE RETIRED HASH'S MISTAKE IN ANOTHER FORM. This
 * summed `main-*.js` alone, and the moment v2's draft board started using v1's
 * `art/CharacterArt.ts` Rollup hoisted 62kB out of v1's entry into the shared
 * chunk — so `main-` "shrank" 1887 -> 1824 and the gate reported a 3.3% drift
 * on a build where v1's real payload moved by 0.3kB (1908.4 -> 1908.7). Chunk
 * BOUNDARIES are a property of the combined build, exactly as the hash was;
 * only the total an entry pulls down is a property of the entry.
 *
 * Read from the built HTML rather than by prefix, so a chunk that is renamed or
 * split cannot fall out of the measurement silently.
 */
const entryKb = (html) => {
  const file = join(repo, 'dist', html);
  if (!existsSync(file)) return null;
  const src = readFileSync(file, 'utf8');
  const names = [...src.matchAll(/(?:src|href)="[^"]*?\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
  if (names.length === 0) return null;
  return names.reduce((kb, n) => kb + statSync(join(assets, n)).size / 1000, 0);
};

describe('the built bundles stay the size they were', () => {
  it.runIf(existsSync(assets))('★ v1 has not silently gained weight', () => {
    const kb = entryKb('index.html');
    expect(kb, 'no v1 entry in dist/').not.toBeNull();
    const drift = Math.abs(kb - V1_KB) / V1_KB;
    expect(
      drift,
      `v1 loads ${kb.toFixed(0)}kB against a pinned ${V1_KB}kB. If this is deliberate, move the constant AND say what earned it.`
    ).toBeLessThan(TOLERANCE);
  });

  it.runIf(existsSync(assets))('and v2 has not either', () => {
    const kb = entryKb('v2/index.html');
    expect(kb, 'no v2 entry in dist/').not.toBeNull();
    expect(
      Math.abs(kb - V2_KB) / V2_KB,
      `v2 loads ${kb.toFixed(0)}kB against a pinned ${V2_KB}kB.`
    ).toBeLessThan(TOLERANCE);
  });
});
