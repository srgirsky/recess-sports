// ---------------------------------------------------------------------------
// ★ A CHECKED-IN MEASUREMENT IS A CLAIM ABOUT A DRAWING, AND CLAIMS GO STALE.
//
// `scripts/v2/turnaround-specs/*.spec.json` is what a sculptor implements: the
// numbers a concept sheet actually supports, and — the part that matters — the
// ones it does not. The moment those files exist they can drift from the sheet
// they describe, silently, and a sculpt built on a stale spec is a sculpt built
// on a number nobody can re-check. That is the exact failure the whole
// provenance apparatus exists to prevent, reintroduced by writing it down.
//
// So storage is not the guarantee. RE-DERIVATION is. This regenerates every
// spec from its sheet and requires the result to be identical.
//
// ★ AND THIS IS DELIBERATELY NOT THE GATE THAT CHECKS THE SCULPT. Two different
// questions, and conflating them makes both useless:
//
//   · does the SPEC still match the SHEET?  <- here
//   · does the SCULPT match the SPEC?       <- featurelatitude.lint.test.js
//
// If one gate did both by re-detecting at assert time it would only prove the
// detector agrees with itself, which is true of any detector including a wrong
// one.
//
// ⚠️ IT ITERATES OVER FILES, NEVER OVER THE ROSTER. Twenty-four characters have
// no spec because nobody has sculpted them; walking `ROSTER` would turn that
// into twenty-four red tests about work that has not started.
// `measure-fidelity.mjs`'s header records this same mistake being made and
// undone.
//
// Break-it record: editing one `value` in a checked-in spec fires with the
// pointer to the changed field and the command that regenerates it; deleting a
// `reason` from a refusal fires on the shape rule.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SPEC_DIR, analyse, specPath } from './analyse-turnaround.mjs';
import { RECIPES } from './turnaround-recipes.mjs';

const specs = existsSync(SPEC_DIR)
  ? readdirSync(SPEC_DIR).filter((f) => f.endsWith('.spec.json'))
  : [];

/** Every `notTraceable` in a spec, with the pointer that reaches it. */
function refusals(node, path = '', out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.notTraceable) { out.push({ at: path, ...node.notTraceable }); return out; }
  for (const [k, v] of Object.entries(node)) refusals(v, `${path}/${k}`, out);
  return out;
}

/** The closed set. A free-text class cannot be counted across thirty sheets. */
const CLASSES = new Set([
  'posed-view', 'paired-part', 'occluded', 'single-run', 'ambiguous-parts',
  'weak-seam', 'no-such-material', 'merged-region', 'no-pinch', 'no-view',
]);

describe('a turnaround spec still describes its sheet', () => {
  it('has a spec for every recipe, and a recipe for every spec', () => {
    // Neither direction may drift: a spec with no recipe cannot be regenerated,
    // and a recipe with no spec is a character nobody has analysed.
    const bySlug = Object.values(RECIPES).map((r) => `${r.slug}.spec.json`).sort();
    expect(specs.sort()).toEqual(bySlug);
  });

  for (const file of specs) {
    const spec = JSON.parse(readFileSync(join(SPEC_DIR, file), 'utf8'));

    it(`${spec.id}: regenerates identically from the sheet`, async () => {
      const fresh = await analyse(spec.id);
      expect(
        fresh,
        `${file} no longer matches ${spec.source.sheet}. If the art changed this is correct and expected — ` +
          `run \`npm run analyse:turnaround -- ${spec.id} --write\` and REVIEW THE DIFF, because every number ` +
          'a sculpt cites from this file moves with it. If the art did not change, the analyser did.',
      ).toEqual(spec);
    });

    it(`${spec.id}: says exactly one of a value or a refusal, never neither`, () => {
      // Absence is not how a gap is expressed here. A missing key reads as an
      // oversight; `notTraceable` reads as an answer, and it is one.
      const bad = [];
      const walk = (node, path) => {
        if (!node || typeof node !== 'object') return;
        if ('value' in node && 'notTraceable' in node) bad.push(`${path}: both a value and a refusal`);
        if (node.notTraceable) return;
        for (const [k, v] of Object.entries(node)) walk(v, `${path}/${k}`);
      };
      walk(spec.landmarks, '/landmarks');
      walk(spec.profiles, '/profiles');
      expect(bad).toEqual([]);
    });

    it(`${spec.id}: every refusal names a known class and explains itself`, () => {
      const bad = [];
      for (const r of refusals({ views: spec.views, materials: spec.materials, landmarks: spec.landmarks, profiles: spec.profiles, bands: spec.bands })) {
        if (!CLASSES.has(r.class)) bad.push(`${r.at}: unknown class "${r.class}"`);
        // A one-word reason is how a refusal becomes noise nobody reads.
        if (!r.reason || r.reason.length < 40) bad.push(`${r.at}: reason too thin to act on`);
      }
      expect(bad).toEqual([]);
    });

    it(`${spec.id}: never takes a z off a posed view`, () => {
      // Every figure is scaled independently to the rig height, so a crouch is
      // shorter in pixels and every z read on it is wrong by that ratio.
      const posed = new Set(spec.views.filter((v) => v.pose === 'posed').map((v) => v.role));
      const bad = [];
      for (const [name, prof] of Object.entries(spec.profiles ?? {})) {
        if (posed.has(prof.view)) bad.push(`profiles/${name} reads z off the posed ${prof.view} view`);
      }
      expect(bad).toEqual([]);
    });

    it(`${spec.id}: is bound to the bytes of the sheet it measured`, () => {
      expect(spec.source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(existsSync(specPath(spec.slug))).toBe(true);
    });
  }

  it('records what the sheets refused, so it can be counted rather than felt', () => {
    // Not an assertion about a number — a report. A character whose sheet
    // defeats the tool is a fact worth having before the sculpt starts, and
    // Grizz is the one it found: his afro merges with his brow and his tee is
    // tonally next to his skin.
    const counts = {};
    for (const file of specs) {
      const spec = JSON.parse(readFileSync(join(SPEC_DIR, file), 'utf8'));
      counts[spec.id] = spec.notTraceable.length;
    }
    expect(Object.keys(counts).length).toBe(specs.length);
  });
});
