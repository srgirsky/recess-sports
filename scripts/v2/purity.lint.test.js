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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const SIM = join(repo, 'src', 'v2', 'sim');

/** What `src/v2/sim/**` is allowed to import, per AGENTS.md. */
const ALLOWED_PREFIXES = ['./', '../sim/', '../../data/', '../../config', '../../systems/'];

/** Pure systems v2 reuses. Anything else in systems/ may touch Phaser. */
const PURE_SYSTEMS = [
  'picklog', 'inning', 'gameflow', 'stats', 'album', 'team', 'draft', 'lineup',
  'season', 'awards', 'voices', 'announcer', 'chatter', 'audio', 'difficulty',
  'juice', 'fatigue', 'crowd', 'mode', 'atbat', 'pitch', 'pitchkind', 'steal',
  'geometry', 'venue', 'replay', 'liveplay', 'fielding', 'settings',
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.ts$/.test(entry)) out.push(path);
  }
  return out;
}

const simFiles = walk(SIM);
const sources = simFiles.map((path) => ({
  path,
  rel: relative(repo, path),
  text: readFileSync(path, 'utf8'),
  isTest: /\.test\.ts$/.test(path),
}));

/** Every module specifier a file imports (static, type-only and dynamic). */
function importsOf(text) {
  const out = [];
  const patterns = [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) out.push(m[1]);
  }
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
    for (const f of sources) {
      for (const spec of importsOf(f.text)) {
        expect(spec === 'three' || spec.startsWith('three/'), `${f.rel} imports ${spec}`).toBe(false);
      }
    }
  });

  it('never imports the render layer', () => {
    // The one that keeps CHARACTER_SCALE out of the physics.
    for (const f of sources) {
      for (const spec of importsOf(f.text)) {
        expect(/(^|\/)render\//.test(spec), `${f.rel} imports ${spec}`).toBe(false);
        expect(/(^|\/)spike\//.test(spec), `${f.rel} imports ${spec}`).toBe(false);
        expect(/(^|\/)ui\//.test(spec), `${f.rel} imports ${spec}`).toBe(false);
      }
    }
  });

  it('imports only from the four places AGENTS.md allows', () => {
    for (const f of sources) {
      for (const spec of importsOf(f.text)) {
        if (f.isTest && (spec === 'vitest' || spec.startsWith('node:'))) continue;
        const ok = ALLOWED_PREFIXES.some((p) => spec.startsWith(p));
        expect(ok, `${f.rel} imports "${spec}", which is outside sim/, data/, config.ts and pure systems/`).toBe(true);
        if (spec.includes('systems/')) {
          const name = spec.split('systems/')[1].replace(/\.ts$/, '');
          expect(PURE_SYSTEMS, `${f.rel} imports systems/${name}, which is not on the pure list`).toContain(name);
        }
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
