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
    // ★ `fielders.ts` and `runners.ts` are on this list because they earn it:
    // both run every tick, for nine kids and up to four runners, which is a
    // per-step force term by any other name. Adding them cost nothing because
    // pursuit is `moveToward` (hypot and a division) and the throw arc is solved
    // through a half-angle identity that needs only `sqrt` — but it had to be
    // checked rather than assumed, and closing the door now is cheaper than
    // discovering a `Math.atan2` in the pursuit loop after the harness has
    // fingerprints riding on it.
    const HOT = ['flight.ts', 'ball.ts', 'fielders.ts', 'runners.ts', 'play.ts', 'bounce.ts'];
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
    // ★ SINCE PR 13 THIS IS *THE* GUARANTEE, not a backstop for a bundle-hash
    // check. AGENTS.md used to add "a v2 change that alters
    // dist/assets/main-*.js is a bug"; that proxy expired the moment v2's play
    // view imported the sim and Rollup hoisted `systems/inning` into a chunk
    // both entries share — see `render.v1BundleInvariant`. Reviewing diffs
    // cannot prove v1 is unaffected; a one-way dependency can — if v1's module
    // graph cannot REACH v2, no v2
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

describe('★ there is exactly ONE kid speed in the sim', () => {
  // `defense.fielderSpeed` is the record of what the alternative costs. v1's
  // `FIELDER_SPEED` sat at 210 px/s through FIVE consecutive runner slowdowns,
  // drifting from 1.20x to 2.47x runner speed one retune at a time, and the fix
  // then scaled BOTH by 1/1.987 and preserved the wrong ratio exactly. Its
  // conclusion — "a kid does not get faster by putting a glove on" — became an
  // invariant a v1 test asserts about two constants that remain free to move.
  //
  // `athletes.ts` claims in prose that "there is exactly ONE function per
  // physical quantity and every consumer calls it". This is that claim, checked.
  // A rule that is documented and unenforced is worse than one that is neither,
  // which is the whole reason this file exists.

  /** Raw physical bands. Only `athletes.ts` may read them; everyone else calls. */
  const RAW = [
    'TOP_SPEED_MIN_MPH',
    'TOP_SPEED_MAX_MPH',
    'THROW_SPEED_MIN_MPH',
    'THROW_SPEED_MAX_MPH',
    'REACTION_MIN_SEC',
    'REACTION_MAX_SEC',
    'REACH_FT',
    'HOME_TO_FIRST_SEC',
    'ANCHOR_SPEED_STAT',
    'JUDGE_FT_WORST',
    'JUDGE_FT_BEST',
    'JUDGE_FRAC_WORST',
    'JUDGE_FRAC_BEST',
    'PLATE_HALF_WIDTH_IN',
    'ZONE_BOTTOM_FRAC',
    'ZONE_TOP_FRAC',
    'PITCH_SCATTER_FT_WORST',
    'PITCH_SCATTER_FT_BEST',
  ];

  it('lets nothing but athletes.ts read a raw physical band', () => {
    for (const f of sources) {
      if (f.isTest) continue;
      if (f.rel.endsWith(join('sim', 'athletes.ts')) || f.rel.endsWith(join('sim', 'params.ts'))) continue;
      const src = code(f.text);
      for (const name of RAW) {
        expect(
          new RegExp(`\\b${name}\\b`).test(src),
          `${f.rel} reads ${name} directly — call the athletes.ts function instead, ` +
            `or it becomes a second place a kid's speed can be changed`
        ).toBe(false);
      }
    }
  });

  it('gives a fielder and a runner the same legs, for every kid on the roster', async () => {
    // The functional half. A textual rule can be routed around; this cannot.
    const athletes = await import('../../src/v2/sim/athletes.ts');
    const { makeFielder } = await import('../../src/v2/sim/fielders.ts');
    const { makeRunner } = await import('../../src/v2/sim/runners.ts');
    const { ROSTER } = await import('../../src/data/characters.ts');

    expect(ROSTER.length).toBeGreaterThan(0);
    for (const c of ROSTER) {
      const f = makeFielder(c, 'SS');
      const r = makeRunner(c, 1);
      expect(f.topFts, `${c.name}: a glove does not make a kid faster`).toBe(r.topFts);
      expect(f.accelFtS2, `${c.name}: nor does it make one quicker off the mark`).toBe(r.accelFtS2);
      expect(f.topFts).toBe(athletes.sprintTopSpeedFts(c.stats.speed));
    }

    // And across the WHOLE stat range, not just the values the roster happens to
    // use — the drift being guarded against is in the SLOPE as much as the
    // level, and a roster with no speed-1 kid cannot see a broken bottom end.
    for (let stat = 1; stat <= 10; stat++) {
      const kid = { ...ROSTER[0], stats: { ...ROSTER[0].stats, speed: stat } };
      expect(makeFielder(kid, 'CF').topFts, `stat ${stat}`).toBe(makeRunner(kid, 0).topFts);
      expect(makeFielder(kid, 'CF').accelFtS2, `stat ${stat}`).toBe(makeRunner(kid, 0).accelFtS2);
    }
  });
});

describe('★ the bridge reads sim state and never writes it', () => {
  // ★ THE RULE AGENTS.md STATES FOR `src/v2/render/**`, made structural. The
  // bridge is the single named coupling point, and the whole value of having
  // ONE named seam is that the sim cannot be perturbed by anything the camera
  // or the animation wants. Reviewing a render diff for stray assignments is
  // exactly the kind of care this file exists to replace.
  //
  // Checked textually rather than by types: `PlayState` is a mutable object and
  // TypeScript will happily let the render layer write to it.
  const bridge = readFileSync(join(repo, 'src/v2/render/bridge.ts'), 'utf8');

  it('never assigns into a frame, a play, a fielder or a runner', () => {
    // Any `x.y = ...` where the root is sim-owned. Reads, calls and destructuring
    // are all fine; only assignment is not.
    const roots = ['frame', 'play', 'f', 'r', 'p', 'cur'];
    const offenders = [];
    for (const line of bridge.split('\n')) {
      const code = line.replace(/\/\/.*$/, '');
      for (const root of roots) {
        // `root.a.b = ` or `root.a = `, but not `===`, `<=`, `>=`, `!=`.
        const re = new RegExp(`\\b${root}(\\.[A-Za-z_$][\\w$]*)+\\s*(\\+|-|\\*|/)?=(?!=)`);
        if (re.test(code)) offenders.push(line.trim());
      }
    }
    expect(offenders, 'the bridge must not write sim state').toEqual([]);
  });

  it('touches the scene only through the objects it was handed', () => {
    // `SceneRefs` is the whole surface. A bridge that reached into the scene
    // graph directly would be a second place that decides what is on screen.
    expect(bridge).toMatch(/refs\.ball/);
    expect(bridge).not.toMatch(/new Scene\(/);
    expect(bridge).not.toMatch(/document\./);
  });
});

describe('★ PlayInputs is read, not merely accepted', () => {
  // ★ FOR EIGHT PRs `stepPlay` TOOK `_inputs` AND IGNORED IT. The underscore
  // was honest — the parameter was defaulted and referenced nowhere — and the
  // seam's own header called it "a typed seam so the signature does not change
  // when they land". PR 14 landed them. This is the regression guard, in the
  // shape `isFair` and `startDive` earned: a mechanism can be authored, typed
  // and documented while no code path reaches it.
  const play = readFileSync(join(repo, 'src/v2/sim/play.ts'), 'utf8');

  it('★ stepPlay does not take an underscored, ignored input', () => {
    const sig = play.match(/export function stepPlay\([^)]*\)/s)?.[0] ?? '';
    expect(sig, 'stepPlay signature not found').toBeTruthy();
    expect(sig, 'a leading underscore means nobody reads it').not.toMatch(/_inputs/);
  });

  it('★ each verb reaches the decision it overrides', () => {
    // Presence of the field name is not enough — it has to appear where the
    // CPU would otherwise decide. Behaviour is asserted in `play.test.ts`;
    // this catches the field being read into a variable and dropped.
    expect(play, 'pointer must reach the chase target').toMatch(
      /inputs\.pointer[\s\S]{0,200}chaseTarget/
    );
    expect(play, 'dive must reach startDive').toMatch(/inputs\.dive[\s\S]{0,200}startDive/);
    expect(play, 'throwTo must reach release').toMatch(/inputs\.throwTo[\s\S]{0,300}release\(/);
  });

  it('the scope note no longer promises a throw meter', () => {
    // v2 has no throw POWER — `release` computes flight from the arm, which is
    // a measured quantity. v1 needed a meter because its throws were arbitrary.
    //
    // ★ SCOPED TO THE HEADER, not the whole file. `maybeThrow`'s comment QUOTES
    // the old promise in order to explain why it is gone, and a blunt
    // whole-file match failed on that — which would have pushed the next person
    // to delete the explanation rather than the promise.
    const header = play.slice(0, play.indexOf('\nimport '));
    expect(header).not.toMatch(/throw-charge meter/);
    expect(header, 'and it should say why there is none').toMatch(/THERE IS NO THROW METER/);
  });
});

describe('★ the swing is a person supplying the model own two error terms', () => {
  // ★ THE SHAPE PR 14 EARNED, POINTED AT BATTING. `PlayInputs.swing` can be
  // authored, typed and documented while nothing reaches it — which is exactly
  // what `isFair`, `startDive` and `PlayInputs` itself each did for several PRs.
  // Behaviour is asserted in `swing.test.ts`; these catch the wiring going away.
  const atbat = readFileSync(join(repo, 'src/v2/sim/atbat.ts'), 'utf8');
  const game = readFileSync(join(repo, 'src/v2/sim/game.ts'), 'utf8');
  const view = readFileSync(join(repo, 'src/v2/spike/PlayView.ts'), 'utf8');

  it('★ the pitch is yielded BEFORE it is resolved', () => {
    // The whole architectural change. If `resolvePitch` runs before the yield,
    // the view animates a ball whose fate is already settled and a human cannot
    // bat at it — which is what the single `pitchAndSwing` call did.
    // ★ ASSERTED ON THE SLICE, NOT ON FIRST INDEXES. The first version compared
    // `indexOf('yield frame')` against `indexOf('throwPitch(')`, which broke the
    // moment PR 16 added the `windup` yield BEFORE the throw — the property was
    // still true and the test said otherwise. Ask the real question: is there a
    // yield between the throw and the resolve?
    const thrown = game.indexOf('throwPitch(');
    const resolved = game.indexOf('resolvePitch(');
    expect(thrown, 'throwPitch not called').toBeGreaterThan(-1);
    expect(resolved, 'the pitch must resolve after it is thrown').toBeGreaterThan(thrown);
    expect(
      game.slice(thrown, resolved),
      'the pitch must be yielded BETWEEN the throw and the resolve'
    ).toMatch(/yield frame/);
  });

  it('★ the pitcher decides on a windup frame, BEFORE the ball is thrown', () => {
    // Same property one step earlier: a choice a person makes has to be
    // collected before the thing it decides happens. Without the windup yield
    // the only yield preceding a throw is the previous pitch's, so a player
    // would be choosing pitch N during pitch N-1's flight.
    const windup = game.indexOf("'windup'");
    const thrown = game.indexOf('throwPitch(');
    expect(windup, 'no windup phase').toBeGreaterThan(-1);
    expect(thrown).toBeGreaterThan(windup);
    expect(
      game.slice(windup, thrown),
      'the windup must be yielded before the throw'
    ).toMatch(/yield frame/);
    expect(game, 'and the chosen plan must reach throwPitch').toMatch(
      /throwPitch\([^)]*\bchosen\b[^)]*\)/
    );
  });

  it('★ the swing arrives through the yield and reaches the resolve', () => {
    expect(game).toMatch(/\(\(yield frame\)[\s\S]{0,80}\)\.swing/);
    expect(game, 'the swing must reach resolvePitch').toMatch(
      /resolvePitch\([^)]*\bswing\b[^)]*\)/
    );
  });

  it('★ a human gets neither the judge error nor two-strike protection', () => {
    // Both are CPU decision rules, not rules of baseball. The human branch must
    // return before either is computed.
    const body = atbat.slice(atbat.indexOf('export function resolvePitch'));
    const human = body.indexOf('if (human)');
    const judge = body.indexOf("fork('judge')");
    const protect = body.indexOf('twoStrikeProtectFt');
    expect(human).toBeGreaterThan(-1);
    expect(judge, 'the CPU read must come after the human branch').toBeGreaterThan(human);
    expect(protect).toBeGreaterThan(human);
    expect(
      body.slice(human, judge),
      'the human branch must return, not fall through into the read'
    ).toMatch(/return offer\(/);
  });

  it('★ aim is a HEIGHT, so no lateral intent is put on the wire', () => {
    // `contact.ts` derives `sprayDeg` from `timingErrorSec` — pulling it is what
    // being early MEANS — so a lateral aim term would be a second, independent
    // source for the same quantity. A field nobody reads is a field nobody can
    // trust: PR 8 shipped two of them.
    const iface = atbat.slice(atbat.indexOf('export interface HumanSwing'));
    const decl = iface.slice(0, iface.indexOf('}'));
    expect(decl).toMatch(/aimHeightFt/);
    expect(decl, 'a two-axis aim would be unread').not.toMatch(/aimFt|\bx\s*:|lateral/i);
  });

  it('★ the view holds the pitch past the crossing, so late swings exist', () => {
    // Without the tail the latest reachable swing is exactly on time, and half
    // the timing window is unreachable BY CONSTRUCTION — the model would look
    // symmetric while the game only ever punished being early.
    expect(view).toMatch(/SWING_TAIL_SEC/);
    expect(view, 'the hold must extend past travelSec').toMatch(
      /pitchElapsed >= [^\n]*travelSec \+ SWING_TAIL_SEC/
    );
  });

  it('★ the zone the player is shown is the zone he is judged against', () => {
    // Drawn from `zoneBandFt`/`zoneHalfWidthFt`, the same functions `isStrike`
    // asks. A second copy would be a drawing that could disagree with the call.
    expect(view).toMatch(/zoneBandFt\(\)/);
    expect(view).toMatch(/zoneHalfWidthFt\(\)/);
    expect(view, 'the aim bar must be drawn at the real tolerance').toMatch(
      /BALL_RADIUS_FT \+ BAT\.BARREL_RADIUS_FT/
    );
  });
});

describe('★ the mound and the baselines are read, not merely accepted', () => {
  // ★ SIXTH AND SEVENTH INSTANCE OF THE PATTERN. `sendRunner`/`holdRunner` were
  // declared in PR 6 and read by NOTHING for ten PRs, after `isFair`,
  // `startDive`, `bridge.ts`, `PlayInputs` itself and `swing`. Behaviour is
  // asserted in `play.test.ts` and `mound.test.ts`; these catch the wiring going
  // away, because "wired but inert" is the failure mode.
  const atbat = readFileSync(join(repo, 'src/v2/sim/atbat.ts'), 'utf8');
  const play = readFileSync(join(repo, 'src/v2/sim/play.ts'), 'utf8');
  const view = readFileSync(join(repo, 'src/v2/spike/PlayView.ts'), 'utf8');

  it('★ a human plan replaces choosePitch and NOTHING else', () => {
    // The execution error must stay downstream of the plan, or a player would
    // out-throw his own kid's arm — the thing that makes the roster matter.
    const body = atbat.slice(atbat.indexOf('export function throwPitch'));
    const chosen = body.indexOf('human ?? choosePitch');
    const release = body.indexOf('releaseAtSpot');
    expect(chosen, 'the human plan must replace choosePitch').toBeGreaterThan(-1);
    expect(release, 'and the execution error must still run after it').toBeGreaterThan(chosen);
  });

  it('★ there is no pitch meter, and no accuracy constant for a person', () => {
    // v2 has no throw power anywhere: how hard it leaves the hand is the kid's
    // arm, and how far it misses is his `pitching` stat.
    // ★ ASSERTED ON CODE, NOT PROSE — PR 14's lesson, which cost a red build
    // there too. The comment explaining WHY there is no meter contains the word
    // "meter", and a blunt whole-file match pushes the next person to delete the
    // explanation rather than the thing. Strip comments and ask again.
    const code = view.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/pitchPower|pitchMeter|chargePitch/i);
    const iface = atbat.slice(atbat.indexOf('export interface PitchPlan'));
    const decl = iface.slice(0, iface.indexOf('}'));
    expect(decl).toMatch(/aimLateralFt/);
    expect(decl, 'a power or speed field would be a second source').not.toMatch(
      /power|speedFts|velocity|effort/i
    );
  });

  it('★ a send overrides the CPU judgement but never the traffic guard', () => {
    expect(play, 'sendRunner must reach send()').toMatch(
      /inputs\.sendRunner[\s\S]{0,200}send\(s, r, next\)/
    );
    // `send` keeps `baseIsOpen` — that guard is about traffic, not judgement,
    // and without it a runner VANISHES out of `baseIds`.
    const send = play.slice(play.indexOf('function send('));
    expect(send.slice(0, send.indexOf('\n}'))).toMatch(/baseIsOpen/);
  });

  it('★ a forced runner cannot be held', () => {
    // The batter is coming and the bag is not the runner's to keep.
    expect(play).toMatch(/inputs\.holdRunner === r\.charId && !isForced\(s, r\)/);
  });

  it('★ the pitcher decides before the throw, and cannot hang the game', () => {
    // v1's `FLOW.PITCH_CLOCK_MS` rule: dither and the game throws for you.
    expect(view).toMatch(/PITCH_CLOCK_SEC/);
    expect(view, 'the windup must time out').toMatch(
      /windupElapsed >= PITCH_CLOCK_SEC/
    );
  });

  it('★ the human has a SIDE, or the two tap verbs collide', () => {
    // The same tap on a base means THROW THERE when fielding and SEND HIM THERE
    // when batting. Without a side, one of them is unreachable.
    expect(view).toMatch(/humanBats/);
    expect(view, 'sends belong to the batting side').toMatch(
      /this\.humanBats[\s\S]{0,120}tapBaseAsRunner/
    );
  });
});
