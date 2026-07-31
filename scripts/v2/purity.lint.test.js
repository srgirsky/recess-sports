// ---------------------------------------------------------------------------
// ★ THE SIM PURITY GATE — cited in two places before it existed.
//
// `ProxyCharacter.ts:76` and `scripts/measures.json`'s
// `render.characterPresence` both say "purity.lint.test.js keeps the sim from
// importing render/". Neither was true; the file was not in the tree. A rule
// that is documented and unenforced is worse than one that is neither, because
// the next person reads the comment and believes it.
//
// What it protects, concretely:
//
//   RENDER MUST NOT LEAK INTO THE SIM. `CHARACTER_SCALE` draws a 4ft kid at
//   6.4ft. If that number — or anything derived from it — ever reaches
//   `src/v2/sim/**`, then catch radii, reach, stride and collision quietly stop
//   being real feet, and real feet ARE the balance fix v2 exists for. v1's
//   equivalent rule ("never import projection from systems/") was enforced by
//   discipline alone, and the fielder-speed bug is what discipline alone costs.
//
//   THE SIM MUST STAY NODE-RUNNABLE AND DETERMINISTIC. No three, no DOM, no
//   `Math.random`, no `Date.now`. That is what turns v1's fragile
//   browser-paste goldlog into an ordinary vitest that runs in CI and cannot be
//   polluted by a cosmetic change. One `Math.random` in the sim gives that up.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const SIM = join(repo, 'src', 'v2', 'sim');

/** What `src/v2/sim/**` is allowed to import, per AGENTS.md. */
const ALLOWED_PREFIXES = ['./', '../sim/', '../../data/', '../../config', '../../systems/'];

/**
 * ★ THE WHITELIST IS A FENCE, NOT A WISH LIST — and it used to be the latter.
 *
 * This list held 29 names. Among them: `geometry` (v1 SCREEN PIXELS —
 * `BASEPATH_PX` 179.6386, `HOME` at (480, 600)), `liveplay` / `atbat` /
 * `fielding` / `pitchkind` / `steal` (px/s throughout), `mode` (`resolveLiveParams`
 * returns px/s and transitively reaches `localStorage`), and `picklog` / `album`
 * / `team` / `season` / `settings` / `audio` (`localStorage` and Web Audio).
 *
 * The header above says this gate's job is to stop render and pixels leaking
 * into the sim, because real feet ARE the balance fix. A whitelist that permits
 * `import { BASEPATH_PX } from '../../systems/geometry'` does not do that job.
 * It was harmless only because it was VACUOUSLY SATISFIED — nothing under
 * `src/v2/sim/**` imported any system at all, so the fence had never been
 * leaned on. The moment the sim core starts sharing modules for real, a wish
 * list becomes a hole.
 *
 * These five are the ones actually verified shareable: each is unit-free, and
 * `keeps its own promises` below re-derives that rather than trusting this
 * comment. Everything else in `systems/` remains AVAILABLE for v2's render and
 * UI layers — this list governs `src/v2/sim/**` only, and only VALUE imports.
 * A type-only import erases at build and cannot carry a constant, so it is
 * allowed from anywhere in `systems/` (see `TYPE_ONLY` handling below).
 */
const PURE_SYSTEMS = ['inning', 'gameflow', 'stats', 'lineup', 'draft'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.ts$/.test(entry)) out.push(path);
  }
  return out;
}

/** Every `.ts` under a tree, including nested directories. */
const walkAll = walk;

const simFiles = walk(SIM);
const sources = simFiles.map((path) => ({
  path,
  rel: relative(repo, path),
  text: readFileSync(path, 'utf8'),
  isTest: /\.test\.ts$/.test(path),
}));

/**
 * Every module a file imports, as `{ spec, typeOnly }`.
 *
 * `typeOnly` is true only for a whole-statement `import type` / `export type`,
 * which TypeScript erases entirely. A MIXED statement (`import { type A, B }`)
 * is deliberately counted as a value import: it has a value binding, so it is
 * exactly as capable of carrying a pixel constant as any other.
 */
function importsOf(text) {
  const out = [];
  // `import ... from 'x'` / `export ... from 'x'`, capturing the leading keyword
  // pair so a whole-statement type import can be told apart.
  const re = /\b(import|export)\s+(type\s+)?([^'"]*?)from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text))) out.push({ spec: m[4], typeOnly: Boolean(m[2]) });
  const dyn = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dyn.exec(text))) out.push({ spec: m[1], typeOnly: false });
  return out;
}

/** Strip comments and strings, so a rule cannot fire on prose about itself. */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

describe('src/v2/sim is pure', () => {
  it('has files to check', () => {
    // A lint over an empty set passes forever and means nothing.
    expect(simFiles.length).toBeGreaterThan(0);
  });

  it('never imports three', () => {
    // Absolute, type imports included: a three type in the sim is design drift
    // even though it erases.
    for (const f of sources) {
      for (const { spec } of importsOf(f.text)) {
        expect(spec === 'three' || spec.startsWith('three/'), `${f.rel} imports ${spec}`).toBe(false);
      }
    }
  });

  it('never imports the render layer', () => {
    // The one that keeps CHARACTER_SCALE out of the physics.
    for (const f of sources) {
      for (const { spec } of importsOf(f.text)) {
        expect(/(^|\/)render\//.test(spec), `${f.rel} imports ${spec}`).toBe(false);
        expect(/(^|\/)spike\//.test(spec), `${f.rel} imports ${spec}`).toBe(false);
        expect(/(^|\/)ui\//.test(spec), `${f.rel} imports ${spec}`).toBe(false);
      }
    }
  });

  it('imports only from the four places AGENTS.md allows', () => {
    for (const f of sources) {
      for (const { spec, typeOnly } of importsOf(f.text)) {
        if (f.isTest && (spec === 'vitest' || spec.startsWith('node:'))) continue;
        const ok = ALLOWED_PREFIXES.some((p) => spec.startsWith(p));
        expect(ok, `${f.rel} imports "${spec}", which is outside sim/, data/, config.ts and pure systems/`).toBe(true);
        if (spec.includes('systems/')) {
          const name = spec.split('systems/')[1].replace(/\.ts$/, '');
          // The type-only lane. A whole-statement `import type` compiles to
          // nothing, so it cannot carry a px constant into the sim — which is
          // what lets `field.ts` share `PositionId` with v1's `lineup.ts`
          // without opening the value door to v1's pixel-domain `geometry.ts`.
          if (typeOnly) continue;
          expect(
            PURE_SYSTEMS,
            `${f.rel} VALUE-imports systems/${name}, which is not on the pure list. ` +
              `If you only need its types, use \`import type\`.`
          ).toContain(name);
        }
      }
    }
  });

  it('never builds an Rng at module scope', () => {
    // A module-scope generator is a hidden global: two callers share a stream,
    // import order decides who gets which values, and the seed the harness
    // passes in is silently ignored. All randomness is INJECTED.
    const moduleScope = /^(export\s+)?(const|let|var)\s+\w+\s*=\s*makeRng\s*\(/m;
    for (const f of sources) {
      if (f.isTest) continue;
      expect(
        moduleScope.test(code(f.text)),
        `${f.rel} builds an Rng at module scope — take one as a parameter instead`
      ).toBe(false);
    }
  });

  it('never reaches for an implementation-approximated Math function', () => {
    // ★ ECMAScript requires only + - * / and Math.sqrt to be CORRECTLY ROUNDED.
    // `Math.exp`, `log`, `pow`, `cbrt`, `atan2`, `sin`, `cos`, `tan` and `**`
    // are "implementation-approximated" — V8 has changed them across versions,
    // and results can differ between engines. A determinism fingerprint built
    // on them goes red on a Node bump and reads as somebody's bug.
    //
    // This is affordable only because it turned out not to cost anything:
    // Nathan's drag and lift model is `CD_0 + CD_1*rpm/1000` and
    // `CL_2*S/(CL_0 + CL_1*S)` — pure arithmetic, no interpolation tables
    // needed. `Rng.normal()` is the one thing still owed a table, which is why
    // it does not exist yet.
    //
    // Trig IS allowed at the boundary where a human-facing angle becomes a
    // vector (`launch`, `pointAt`, `sprayOf`), because that is a once-per-play
    // conversion of an authored number, not a per-step force term. It is
    // confined to files that declare it, and the hot path below is checked
    // separately.
    const HOT = ['flight.ts', 'ball.ts'];
    const banned = /Math\s*\.\s*(exp|log|log2|log10|pow|cbrt|sinh|cosh|tanh|expm1|log1p)\b|\*\*/;
    for (const f of sources) {
      if (f.isTest) continue;
      const src = code(f.text);
      const hit = banned.exec(src);
      expect(hit, `${f.rel} uses ${hit?.[0]} — not bit-stable across engines`).toBeNull();
      // The per-step force path additionally may not use trig at all.
      if (HOT.some((h) => f.rel.endsWith(h))) {
        const trig = /Math\s*\.\s*(sin|cos|tan|asin|acos|atan|atan2)\b/.exec(src);
        expect(trig, `${f.rel} is on the per-step path and uses ${trig?.[0]}`).toBeNull();
      }
    }
  });

  it('never reaches for the DOM', () => {
    const banned = /\b(document|window|navigator|localStorage|HTMLElement|requestAnimationFrame)\b/;
    for (const f of sources) {
      if (f.isTest) continue;
      const hit = banned.exec(code(f.text));
      expect(hit, `${f.rel} references ${hit?.[0]} — the sim must run in plain Node`).toBeNull();
    }
  });

  it('never calls Math.random or Date.now', () => {
    // All randomness comes from an injected Rng. This is the property that
    // makes the statistical conformance harness reproducible, and it is worth
    // exactly nothing if it holds "almost everywhere".
    for (const f of sources) {
      if (f.isTest) continue;
      const src = code(f.text);
      expect(/Math\s*\.\s*random/.test(src), `${f.rel} calls Math.random — inject an Rng instead`).toBe(false);
      expect(/Date\s*\.\s*now/.test(src), `${f.rel} calls Date.now — the sim is stepped with an explicit dt`).toBe(false);
      expect(/new\s+Date\s*\(/.test(src), `${f.rel} constructs a Date`).toBe(false);
      expect(/performance\s*\.\s*now/.test(src), `${f.rel} calls performance.now`).toBe(false);
    }
  });

  it('runs in plain Node, not just in vitest', async () => {
    // The end-to-end version of every rule above: if it imports, it is pure
    // enough to run headless in CI without a browser or a renderer.
    for (const f of sources) {
      if (f.isTest) continue;
      await expect(import(f.path)).resolves.toBeDefined();
    }
  });
});

describe('the pure-systems whitelist keeps its own promises', () => {
  // Naming a module on PURE_SYSTEMS is a CLAIM about it. Nothing checked the
  // claim, which is how `geometry` — 960x640 screen pixels — sat on the list
  // as "pure". Purity there means two different things and both are asserted:
  // it must not reach for the browser, and it must not drag in a module that
  // does. A name-only list cannot tell you either.
  const systemsDir = join(repo, 'src', 'systems');

  it('lists only modules that exist', () => {
    for (const name of PURE_SYSTEMS) {
      expect(
        existsSync(join(systemsDir, `${name}.ts`)),
        `PURE_SYSTEMS names systems/${name}, which does not exist`
      ).toBe(true);
    }
  });

  it('lists only modules that are genuinely browser-free', () => {
    const banned = /\b(document|window|navigator|localStorage|sessionStorage|AudioContext|requestAnimationFrame)\b/;
    for (const name of PURE_SYSTEMS) {
      const src = code(readFileSync(join(systemsDir, `${name}.ts`), 'utf8'));
      const hit = banned.exec(src);
      expect(hit, `systems/${name}.ts references ${hit?.[0]} — it is not pure`).toBeNull();
      expect(/from\s+['"]phaser['"]/.test(src), `systems/${name}.ts imports Phaser`).toBe(false);
      expect(/Math\s*\.\s*random/.test(src), `systems/${name}.ts calls Math.random`).toBe(false);
      expect(/Date\s*\.\s*now/.test(src), `systems/${name}.ts calls Date.now`).toBe(false);
    }
  });

  it('lists only modules whose own VALUE imports are also pure', () => {
    // Transitivity is the half a name list always misses: a module that is
    // itself clean can still pull a pixel-domain one in behind it.
    const allowed = new Set(PURE_SYSTEMS);
    for (const name of PURE_SYSTEMS) {
      const text = readFileSync(join(systemsDir, `${name}.ts`), 'utf8');
      for (const { spec, typeOnly } of importsOf(text)) {
        if (typeOnly) continue;
        const ok =
          spec.startsWith('../data/') ||
          spec === '../config' ||
          spec.startsWith('../config') ||
          (spec.startsWith('./') && allowed.has(spec.slice(2).replace(/\.ts$/, '')));
        expect(
          ok,
          `systems/${name}.ts value-imports "${spec}", so it is not safely shareable with the sim`
        ).toBe(true);
      }
    }
  });
});

describe('v1 has no path to v2', () => {
  it('is never imported by anything outside src/v2', () => {
    // The structural guarantee behind AGENTS.md's "a v2 change that alters
    // dist/assets/main-*.js is a bug". Reviewing diffs cannot provide it; a
    // one-way dependency can — if v1's module graph cannot REACH v2, no v2
    // edit can appear in v1's bundle, and the two games stay independent by
    // construction rather than by care. (`scripts/v2/*` is build and test
    // tooling, not bundled, and imports v2 freely.)
    const v1Files = walkAll(join(repo, 'src')).filter(
      (p) => !relative(repo, p).startsWith(join('src', 'v2'))
    );
    expect(v1Files.length).toBeGreaterThan(0);
    for (const path of v1Files) {
      const rel = relative(repo, path);
      for (const { spec } of importsOf(readFileSync(path, 'utf8'))) {
        expect(
          /(^|\/)v2\//.test(spec),
          `${rel} imports "${spec}" — v1 must never reach into v2`
        ).toBe(false);
      }
    }
  });
});

describe('src/v2/render may not be imported by the pure camera policy either', () => {
  it('keeps cameraCues and clips free of three', () => {
    // Both are POLICY: numbers and rules, testable without a renderer. It is
    // what lets cameraCues.test.ts close two `known-drift` records by projecting
    // bases through a matrix with no pixels, and what lets clips.test.ts assert
    // the warp maths with no mixer.
    for (const name of ['cameraCues.ts', 'clips.ts']) {
      const text = readFileSync(join(repo, 'src', 'v2', 'render', name), 'utf8');
      for (const spec of importsOf(text)) {
        expect(spec === 'three' || spec.startsWith('three/'), `${name} imports ${spec}`).toBe(false);
      }
    }
  });
});
