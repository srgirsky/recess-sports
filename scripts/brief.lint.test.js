// ---------------------------------------------------------------------------
// The briefs have a budget, and nothing is allowed to fall out of one silently.
//
// Every `AGENTS.md` in this repo is loaded into an AI coding session: the root
// one ALWAYS, a nested one whenever a file in its subtree is read. The root file
// reached 160,909 bytes / 1,020 lines — about 43k tokens spent before any work
// started — having tripled in thirteen days at ~8.5kB per merged PR, because the
// brief's own "Keeping docs current" section told every agent to add to it and
// nothing ever told one to stop. Published guidance puts the ceiling near 200
// lines, and length does not merely cost tokens: a longer brief is followed less
// reliably, so the file was simultaneously the most expensive and the least
// obeyed thing in the repo.
//
// The material was not lost by shrinking it, because most of it was never
// unique. The chaser-leash finding existed in the brief, in docs/OVERVIEW.md, in
// `sim.chaserLeash` and in fielders.test.ts — four copies of one fact, which is
// exactly what the brief's own closing line forbids ("one source of truth per
// fact + pointers between docs — don't duplicate, or they'll drift").
//
// So this file enforces two different things:
//
//   1. A CEILING on every brief, and — the half that actually matters — a FLOOR
//      under the slack. A ceiling alone is not a ratchet; 8.5kB per PR simply
//      refills the headroom and the file is back where it started in a quarter.
//      A brief that comes in well under budget must have its budget LOWERED, so
//      the gain is locked in rather than lent out.
//
//   2. That no rule was LOST on the way out. `brief-inventory.json` is a census
//      of all 225 items the 161kB brief carried: each has an `anchor` (a string
//      that travels with the rule — a symbol, a constant, a record id) and an
//      `owner` (the file that carries it now). Moving a rule means flipping its
//      `owner`; this test then proves the anchor is really there. The inventory
//      is a census, NOT a copy: it restates no rule's content, it is never
//      auto-loaded, and it is hand-maintained (do not regenerate it — that would
//      clobber the `owner` edits that are the entire point).
//
// ★ EVERY ASSERTION HERE WAS BROKEN ON PURPOSE BEFORE IT WAS TRUSTED, because a
// rule that never fires is indistinguishable from no rule. Deleting the injected-
// Rng bullet from AGENTS.md fails § "no rule was lost" with:
//   the rule '★ The Rng is INJECTED and FORKED, never module-scope' was carried
//   by `AGENTS.md` and its anchor `fork('a').fork('b')` is gone.
// The ceiling, the slack floor, the symlink check and both tense rules were each
// tripped the same way and each named the file and said what to do.
//
// ★ AND THE FIRST ATTEMPT AT THAT DEMO SILENTLY PASSED, which is the most useful
// thing in this file. Deleting the `stepLooseBallFull` bullet changes nothing,
// because that anchor ALSO appears in the Key-files row for bounce.ts — the two
// copies are the duplication this whole effort exists to remove. Measured while
// writing this: 83 of the 225 anchors occur more than once inside AGENTS.md.
// So while an entry's `owner` is still the root brief, assertion 9 is WEAK for it
// — the file vouches for itself. It gets its teeth as owners diverge, which is
// exactly when it is needed: the risk is a rule evaporating during a MOVE, and
// after a move the anchor has to be found in a different file. Do not read a
// green run on an unmigrated entry as proof the rule is safe.
//
// Lives in scripts/ as plain JS for the same reason hitrect.lint.test.js and
// conformance.test.js do: it touches the filesystem, and tsconfig's `include` is
// src-only with no @types/node.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, lstatSync, readlinkSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/**
 * Every brief, with its ceiling. These may only SHRINK. Raising one is the
 * reviewable act, and the comment beside it must say what earned the bytes.
 *
 * `imperative` / `numbersFree` are the two rules that cannot be switched on
 * until a file has actually been rewritten — they are the DESTINATION state, and
 * a flag sitting at `false` is a visible admission that the file is not there
 * yet, rather than a rule quietly not applying.
 */
const BUDGET = {
  // The always-loaded one. Every byte here is spent in every session, whether or
  // not the session goes anywhere near the thing the byte describes.
  'AGENTS.md': { bytes: 56_000, lines: 290, imperative: false, numbersFree: false },

  // ★ A LAZY BRIEF IS CHARGED ONLY TO SESSIONS IN ITS SUBTREE, which is why
  // these two sit well above the always-loaded file's eventual ceiling. The v2
  // rules were 57,812 B in the root brief and are 34,559 B here — the stories
  // went to the records and the source headers that already held them, and the
  // rules did not. Compressing further would trade the guarantee the inventory
  // exists to give for bytes that no v1 session ever pays.
  'src/v2/AGENTS.md': { bytes: 23_300, lines: 370, imperative: true, numbersFree: false },
  'src/v2/render/AGENTS.md': { bytes: 13_400, lines: 215, imperative: true, numbersFree: false },

  // v1's four trees. Same argument as the v2 pair: lazily loaded, so the cost
  // falls only on sessions editing that layer.
  'src/systems/AGENTS.md': { bytes: 11_500, lines: 200, imperative: true, numbersFree: false },
  'src/scenes/AGENTS.md': { bytes: 10_500, lines: 190, imperative: true, numbersFree: false },
  'src/art/AGENTS.md': { bytes: 10_300, lines: 190, imperative: true, numbersFree: false },
  'src/ui/AGENTS.md': { bytes: 5_000, lines: 95, imperative: true, numbersFree: false },

  // The measurement instrument and the lints.
  'scripts/AGENTS.md': { bytes: 3_500, lines: 70, imperative: true, numbersFree: false },
};

/** Under this fraction of its budget, a brief has earned a lower one. */
const SLACK_FLOOR = 0.7;

/**
 * Structural constants the root brief is allowed to state, because they are the
 * units the whole project is written in and they cannot drift without the game
 * itself changing. If this list grows past a handful, that is the signal that
 * measured values are creeping back into the always-loaded file.
 */
const ALLOWED_NUMBERS = ['60ft', '46ft', '200ft', '960×640'];

const briefs = Object.keys(BUDGET);
const sizeOf = (p) => {
  const t = read(p);
  return { bytes: Buffer.byteLength(t, 'utf8'), lines: t.split('\n').length, text: t };
};

describe('the briefs stay within budget', () => {
  it.each(briefs)('%s is inside its ceiling', (p) => {
    const { bytes, lines } = sizeOf(p);
    const b = BUDGET[p];
    expect(
      bytes <= b.bytes && lines <= b.lines,
      `\`${p}\` is ${bytes} B / ${lines} lines against a ${b.bytes} B / ${b.lines} line ceiling.\n` +
        `It is loaded into an AI session before any work starts. New material goes to the tree\n` +
        `that owns it — see § "Keeping docs current" in the root brief for which one. If a rule\n` +
        `genuinely binds before any file is read, it belongs here; make room by moving something\n` +
        `that does not.`,
    ).toBe(true);
  });

  it.each(briefs)('%s has no slack it is not using', (p) => {
    const { bytes } = sizeOf(p);
    const b = BUDGET[p];
    expect(
      bytes >= Math.floor(b.bytes * SLACK_FLOOR),
      `\`${p}\` is ${bytes} B against a ${b.bytes} B budget — under ${SLACK_FLOOR * 100}% of it.\n` +
        `This file improved. LOWER its budget in BUDGET so the gain is locked in; leaving the\n` +
        `headroom lends it straight back, which is how the root brief tripled in thirteen days.`,
    ).toBe(true);
  });
});

describe('the briefs are reachable', () => {
  // A nested AGENTS.md with no CLAUDE.md beside it is loaded by nobody: it is a
  // file that looks like a brief, passes every other assertion here, and silently
  // instructs no one. This is the single point of failure for the whole scheme,
  // and it also catches an editor or a merge materialising the symlink into a
  // real file, which would reintroduce the per-tool drift the symlinks prevent.
  it.each(briefs)('%s has a CLAUDE.md symlink beside it', (p) => {
    const twin = p.replace(/AGENTS\.md$/, 'CLAUDE.md');
    const abs = join(ROOT, twin);
    expect(existsSync(abs), `\`${twin}\` is missing. Create it: ln -s AGENTS.md ${twin}`).toBe(true);
    expect(
      lstatSync(abs).isSymbolicLink() && readlinkSync(abs) === 'AGENTS.md',
      `\`${twin}\` must be a symlink to AGENTS.md, not a real file. A copy drifts; that is why\n` +
        `the root pair is a symlink. Replace it: rm ${twin} && ln -s AGENTS.md ${twin}`,
    ).toBe(true);
  });

  it('every brief in the tree is budgeted and announced', () => {
    const found = [];
    const walk = (rel) => {
      for (const e of readdirSync(join(ROOT, rel || '.'), { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
        const child = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(child);
        else if (e.name === 'AGENTS.md') found.push(child);
      }
    };
    walk('');

    const unbudgeted = found.filter((f) => !BUDGET[f]);
    expect(
      unbudgeted,
      `these briefs have no budget, so nothing stops them growing: ${unbudgeted.join(', ')}`,
    ).toEqual([]);

    // A brief nobody is told to read is the failure mode that makes lazy loading
    // useless: it costs nothing and does nothing.
    const root = read('AGENTS.md');
    const unannounced = found.filter((f) => f !== 'AGENTS.md' && !root.includes(f));
    expect(
      unannounced,
      `the root brief does not mention: ${unannounced.join(', ')}.\n` +
        `List it under § "Deep briefs" so an agent knows to read it.`,
    ).toEqual([]);
  });
});

// --- what a brief may say --------------------------------------------------

const spansIn = (text) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);

const TOP = ['src', 'scripts', 'docs', 'public', 'assets', 'v2', '.claude', '.agents', '.github'];
const EXT = /\.(ts|tsx|js|mjs|cjs|json|md|glb|html|css|woff2|yml)$/;
// A brief writes `sim/rng.ts` and `net/peer.ts` the way a person reads them.
const PREFIXES = ['', 'src', 'src/v2', 'scripts'];
// `dist/` is build output and gitignored — it does not exist on a clean checkout
// or in CI before `npm run build`, so a path into it can never be checked here.
const UNCHECKABLE = /^dist\//;

describe('a brief points rather than restates', () => {
  const measures = JSON.parse(read('scripts/measures.json'));
  const CATEGORIES = Object.keys(measures).filter(
    (k) => measures[k] && typeof measures[k] === 'object' && !Array.isArray(measures[k]),
  );

  it.each(briefs)('%s cites only measures.json records that exist', (p) => {
    const bad = [];
    for (const s of spansIn(read(p))) {
      // A record id is `<category>.<key>[.<sub>]` and nothing else — no slashes,
      // no extension, and a first segment that is really a category. The
      // extension check is load-bearing: `geometry.ts` is a FILE, and `geometry`
      // is also a real category, so without it every module named after one of
      // the seven categories reads as a rotted record id.
      if (!/^[a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/.test(s)) continue;
      if (EXT.test(s)) continue;
      if (!CATEGORIES.includes(s.split('.')[0])) continue;
      let node = measures;
      for (const seg of s.split('.')) node = node?.[seg];
      if (node === undefined) bad.push(s);
    }
    expect(
      bad,
      `\`${p}\` cites measures.json records that are not there: ${bad.join(', ')}.\n` +
        `Pointers replace prose in these files, so a rotted pointer is the new drift.`,
    ).toEqual([]);
  });

  // A path in a brief is the only part of the deleted Key-files table worth
  // keeping: the table's real job was telling you where a thing lived, and it
  // could not check itself, so it just rotted.
  it.each(briefs)('%s cites only paths that exist', (p) => {
    const bad = [];
    for (const s of spansIn(read(p))) {
      if (!/^[\w.@-]+(\/[\w.@*-]+)+\/?$/.test(s)) continue;      // must look like a path
      if (s.includes('<') || s.includes('>')) continue;          // a template, not a path
      if (UNCHECKABLE.test(s)) continue;
      if (!EXT.test(s) && !TOP.includes(s.split('/')[0])) continue; // `px/s`, `ft/s`, `+ - * /`
      const probe = s.includes('*') ? s.slice(0, s.indexOf('*')).replace(/\/$/, '') : s;
      if (!probe) continue;
      if (!PREFIXES.some((pre) => existsSync(join(ROOT, pre, probe)))) bad.push(s);
    }
    expect(
      bad,
      `\`${p}\` cites paths that do not exist: ${bad.join(', ')}.\n` +
        `Either the file moved and the brief did not, or the path is a typo.`,
    ).toEqual([]);
  });
});

describe('a brief is a rule, not a history', () => {
  // The brief and docs/OVERVIEW.md hold the same corpus in two moods. Splitting
  // them by TENSE is what makes the duplication checkable: OVERVIEW keeps every
  // story ("PR 10 — the defence, and the shortstop who watched it go by") and
  // costs nothing because it is loaded on demand; a brief says what you must do.
  // `PR <n>` and "used to" are crude markers that happen to be an exact tell —
  // every one of them in the root brief sits in a sentence that is narrative.
  const imperative = briefs.filter((p) => BUDGET[p].imperative);

  it.each(imperative)('%s carries no narrative markers', (p) => {
    const text = read(p);
    const found = [
      ...[...text.matchAll(/\bPR \d+\b/g)].map((m) => m[0]),
      ...[...text.matchAll(/\bused to\b/gi)].map((m) => m[0]),
    ];
    expect(
      [...new Set(found)],
      `\`${p}\` reads as a history. Those sentences belong in docs/OVERVIEW.md (project-level)\n` +
        `or the source file's own header (module-level). A brief says what you must do.`,
    ).toEqual([]);
  });

  // The always-loaded file is where a copied number does the most damage: it
  // agrees with a stale record forever, and every session pays to read it.
  const numberFree = briefs.filter((p) => BUDGET[p].numbersFree);

  it.each(numberFree)('%s states no number that could drift', (p) => {
    let text = read(p);
    for (const ok of ALLOWED_NUMBERS) text = text.split(ok).join('');
    const found = [...text.matchAll(/\b\d+(?:\.\d+)?\s?(?:ft|px|ms|mph|rpm|kB|%|σ)\b/g)].map((m) => m[0]);
    expect(
      [...new Set(found)],
      `\`${p}\` states measured values: a number in the always-loaded brief is a number that\n` +
        `will drift. Put it in scripts/measures.json and cite the record id instead.`,
    ).toEqual([]);
  });
});

describe('no rule was lost', () => {
  const inventory = JSON.parse(read('scripts/brief-inventory.json'));

  it('the census is well formed', () => {
    const anchors = inventory.map((e) => e.anchor);
    expect(anchors.filter((a) => !a || a.length < 4)).toEqual([]);
    expect(new Set(anchors).size, 'anchors must be unique — they identify the entry').toBe(
      inventory.length,
    );

    // The inventory contains every anchor BY CONSTRUCTION, so an entry that
    // owns itself is vacuously satisfied forever. Same for a CLAUDE.md, which
    // is a symlink to the AGENTS.md beside it and so vouches for nothing extra.
    const selfOwning = inventory.filter(
      (e) => e.owner === 'scripts/brief-inventory.json' || /(^|\/)CLAUDE\.md$/.test(e.owner),
    );
    expect(
      selfOwning.map((e) => e.anchor),
      `an entry may not be owned by the inventory itself or by a CLAUDE.md symlink — it would\n` +
        `satisfy the check without any file actually carrying the rule.`,
    ).toEqual([]);
  });

  it('every rule is still somewhere', () => {
    const cache = new Map();
    const body = (p) => {
      if (!cache.has(p)) cache.set(p, existsSync(join(ROOT, p)) ? read(p) : null);
      return cache.get(p);
    };

    const lost = [];
    for (const e of inventory) {
      const text = body(e.owner);
      if (text === null) lost.push({ ...e, why: 'owner file does not exist' });
      else if (!text.includes(e.anchor)) lost.push({ ...e, why: 'anchor not found' });
    }

    expect(
      lost.map((e) => `${e.owner} :: ${e.anchor} (${e.why})`),
      lost
        .map(
          (e) =>
            `the rule '${e.claim}' was carried by \`${e.owner}\` and its anchor ` +
            `\`${e.anchor}\` is gone (${e.why}).\n` +
            `  Either restore it, or point the entry at the file that carries it now — and if the\n` +
            `  rule was deleted on purpose because another file already said it, delete the entry\n` +
            `  deliberately. That is the reviewable act.`,
        )
        .join('\n'),
    ).toEqual([]);
  });
});
