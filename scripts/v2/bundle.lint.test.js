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
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const assets = join(repo, 'dist', 'assets');

/** Measured at PR 13, kB. The band is +-2%: bloat is the thing worth catching. */
const V1_KB = 1887;
const V2_KB = 782;
const TOLERANCE = 0.02;

const sizeKb = (prefix) => {
  const f = readdirSync(assets).find((n) => n.startsWith(prefix) && n.endsWith('.js'));
  return f ? statSync(join(assets, f)).size / 1000 : null;
};

describe('the built bundles stay the size they were', () => {
  it.runIf(existsSync(assets))('★ v1 has not silently gained weight', () => {
    const kb = sizeKb('main-');
    expect(kb, 'no v1 bundle in dist/').not.toBeNull();
    const drift = Math.abs(kb - V1_KB) / V1_KB;
    expect(
      drift,
      `v1 bundle is ${kb.toFixed(0)}kB against a pinned ${V1_KB}kB. If this is deliberate, move the constant AND say why in render.v1BundleInvariant.`
    ).toBeLessThan(TOLERANCE);
  });

  it.runIf(existsSync(assets))('and v2 has not either', () => {
    const kb = sizeKb('v2-');
    expect(kb).not.toBeNull();
    expect(Math.abs(kb - V2_KB) / V2_KB).toBeLessThan(TOLERANCE);
  });
});
