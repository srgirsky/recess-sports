// ---------------------------------------------------------------------------
// ★ A CHARACTER SHIPPED CUT IN HALF, AND EVERY GATE WAS GREEN.
//
// Zippy's delivered board carried a 21-pixel band — 0.150ft, at 56% of her
// figure height — containing NO figure pixels at all. Background, straight
// through her body, in the front and profile views both. Her tee's hem ring sat
// at z 1.755 and `LEG_STATIONS` began at 1.560, so 0.195ft of her had no
// geometry: she had no pelvis. She had been reviewed, scored 4/4/4/4/4/4, and
// recorded as a finished candidate.
//
// ★ WHY `silhouette.lint.test.js` COULD NOT SEE IT, THOUGH IT IS THE HOLE GATE.
// That file measures the largest ENCLOSED run of background — it floods the
// backdrop in from the frame edge and asks what pocket is left over. A gap that
// runs clean through the figure is OPEN AT BOTH SIDES, so the flood reaches it
// from outside and it is never a pocket. Rubric 3.7 ("no holes, gaps or open
// interiors visible in front or profile silhouette") was being enforced only
// for holes the backdrop cannot walk into. A severed body is the one shape that
// escapes an enclosure test, and it is also the worst thing on the list.
//
// Nothing else was watching either: `validate:models` checks bones, slots, LODs
// and budgets; `measure:fidelity` reports ratios that a gap does not disturb;
// `skeleton.test.ts` DOES cast a solid-span ray for vertical continuity, but
// only over the built PROXY, never over a delivered `.glb`'s board.
//
// So this asks the one question none of them asks: between the topmost and
// bottommost row of the figure, is there a row with nothing in it?
//
// ★ IT IS DELIBERATELY THE CRUDEST POSSIBLE TEST. Any threshold subtler than
// "zero figure pixels in this row" would need tuning, and a tuned number is one
// somebody widens later. An empty row inside a figure is never antialiasing,
// never a style, and never correct.
//
// Break-it record: restoring Zippy's hem ring to z 1.755 fires with
//   "zippy front-review: 21 empty row(s) inside the figure (0.150ft at 56.1%
//    of figure height) — the body is severed there"
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { AUTHORED_CHARACTERS, slugFor } from './character-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CONCEPTS = resolve(here, '..', '..', 'docs', 'v2', 'concepts');
const VIEWS = ['front-review', 'profile-review', 'front-apose-review', 'profile-apose-review'];

/**
 * ★ A DEBT LIST, NOT AN ALLOWANCE, and every entry is a defect that is still
 * shipping. Each is the measured empty-row count for that character's WORST
 * view. The rule is the house rule: a budget may only SHRINK, and the comment
 * beside it says what earned it.
 *
 * Zippy is deliberately absent — she was the discovery and she is fixed, which
 * is what makes the other two credible rather than a blanket exemption.
 */
const DEBT = {
  // 0.035ft at 32.7% of figure — the neck/shoulder joint, in ALL FOUR views,
  // which is the tell that it is structure and not a posing artifact.
  cricket: 5,
  // 0.014ft at 60.5%, front only; 1px in profile.
  // ⚠️ THIS ENTRY ONCE CALLED IT "small enough to be a near-miss rather than a
  // true severance", AND THAT WAS WRONG. A row count is a HEIGHT, not a size: an
  // independent critic measured his gap as zero pixels at y=421 across the full
  // 92px hip width, plus a second see-through notch at the shorts crotch. One
  // row spanning the whole body is a body in two pieces exactly as much as
  // twenty-one rows are. Never read a small row count as a small defect — the
  // metric this file reports is how TALL the gap is, and it says nothing about
  // how WIDE.
  rocket: 2,
};

/** Rows inside the figure's own span that contain no figure pixel at all. */
async function emptyRows(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const opaque = (x, y) => data[(y * width + x) * 4 + 3] > 128;

  let top = height;
  let bottom = -1;
  const counts = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (opaque(x, y)) counts[y]++;
    if (counts[y] > 0) {
      if (y < top) top = y;
      bottom = y;
    }
  }
  if (bottom < 0) return { figureHeight: 0, runs: [] };

  const runs = [];
  let run = null;
  for (let y = top; y <= bottom; y++) {
    if (counts[y] === 0) {
      run = run ?? { from: y, to: y };
      run.to = y;
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return { figureHeight: bottom - top + 1, top, runs };
}

describe('a delivered character is one connected body', () => {
  const ids = Object.keys(AUTHORED_CHARACTERS).sort();

  for (const id of ids) {
    it(`${id}: no view shows background straight through the figure`, async () => {
      const bad = [];
      for (const view of VIEWS) {
        const file = join(CONCEPTS, `${slugFor(id)}-${view}.png`);
        if (!existsSync(file)) continue;
        const { figureHeight, top, runs } = await emptyRows(file);
        const worst = runs.reduce((a, r) => Math.max(a, r.to - r.from + 1), 0);
        if (worst > (DEBT[id] ?? 0)) {
          const r = runs.find((q) => q.to - q.from + 1 === worst);
          bad.push(
            `${id} ${view}: ${worst} empty row(s) inside the figure ` +
            `(${((4 * worst) / figureHeight).toFixed(3)}ft at ` +
            `${((100 * (r.from - top)) / figureHeight).toFixed(1)}% of figure height) — ` +
            'the body is severed there. Find the two forms that do not meet: it is ' +
            'usually a garment hem ring authored above the limb stations below it. ' +
            'A budget here may only shrink.',
          );
        }
      }
      expect(bad).toEqual([]);
    }, 20_000);
  }

  it('carries no debt entry for a character that is whole again', async () => {
    const paid = [];
    for (const id of Object.keys(DEBT)) {
      let worst = 0;
      for (const view of VIEWS) {
        const file = join(CONCEPTS, `${slugFor(id)}-${view}.png`);
        if (!existsSync(file)) continue;
        const { runs } = await emptyRows(file);
        worst = Math.max(worst, runs.reduce((a, r) => Math.max(a, r.to - r.from + 1), 0));
      }
      if (worst < DEBT[id]) paid.push(`${id}: debt says ${DEBT[id]}, measures ${worst} — lower it or delete it`);
    }
    expect(paid).toEqual([]);
  }, 60_000);

  it('carries no debt entry for a character nobody has sculpted', () => {
    const strays = Object.keys(DEBT).filter((id) => !(id in AUTHORED_CHARACTERS));
    expect(strays, `${strays.join(', ')} declare no .blend — nothing to exempt`).toEqual([]);
  });
});
