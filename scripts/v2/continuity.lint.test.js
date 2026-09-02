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
// ★ AND THE ROW TEST WAS STILL REPORTING THE WRONG UNIT. It says how TALL a
// gap is, which is not what anyone means by "how bad". Cricket's entry read
// "5 empty rows" and Rocket's "2"; a connected-component scan says those gaps
// detach 39.4% and 30.9% OF THE CHARACTER — his head and her legs are separate
// objects. A 2-vs-21 row count reads as a 10x difference in severity and is
// nothing of the kind. The component test below asks the question in the unit
// that matters, and also catches a part that comes away SIDEWAYS, which no
// row test can see because the row still holds the rest of the body.
//
// Break-it record: restoring Zippy's hem ring to z 1.755 fires with
//   "zippy front-review: 21 empty row(s) inside the figure (0.150ft at 56.1%
//    of figure height) — the body is severed there"
// and zeroing rocket's detached-ink budget fires with
//   "rocket front-review: 30.8% of the figure's ink is NOT connected to the
//    rest of it (largest loose piece 17609px at x189-350 y423-645)"
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
  // Cricket is deliberately absent, like Rocket and Zippy: his 0.035ft
  // neck gap (which detached his whole HEAD — 31.7-40% of his ink) was
  // closed by a fourth NECK_LEVELS ring at z 2.800 that ends inside the
  // skull, the same moved-ring pattern as the other two.
  // Rocket is deliberately absent, like Zippy: her 2-row hip gap (which
  // detached 30.8% of her ink — her legs) was closed by the hem sweep: the
  // tee's bottom ring moved from z 1.620 to 1.560, below the leg stations'
  // 1.600 top, so the two forms overlap. Never read a small row count as a
  // small defect — the metric here is how TALL a gap is, not how WIDE.
};

/**
 * ★ THE SAME QUESTION ASKED SO IT CANNOT BE UNDERSTATED: how much of the
 * character is not attached to the character?
 *
 * The row test above reports how TALL a gap is. That is the wrong unit for the
 * thing anyone cares about, and its own `rocket` comment already says so. Two
 * empty rows and twenty-one empty rows read as a 10x difference in severity and
 * are nothing of the kind — rocket's two rows detach 30.8% of her ink and
 * cricket's five detach 31.7%. It also cannot see a part that comes away
 * SIDEWAYS, because the row still holds the rest of the body.
 *
 * So this counts connected components of the figure mask (8-connectivity, so a
 * single diagonal touch still counts as attached) and reports stray ink as a
 * share of the whole.
 *
 * ⚠️ THE FLOOR IS NOT A TUNED THRESHOLD, and the measurement is why. Across all
 * 30 characters x 4 views the strays fall into two populations three orders of
 * magnitude apart: antialiasing specks at 1-21px (bubbles, calls_shot,
 * nostrike, penny — single pixels where a ponytail or a badge grazes an edge)
 * and real detachments at 2853-20896px. Any floor between 25 and 2000 gives the
 * same answer, so 25 is not a knob anyone can lean on.
 */
const SPECK_PX = 25;

/** Detached ink as a fraction of the figure, per character's WORST view. */
const DETACHED_INK = {
  // 9.5% at worst (front A-pose), across two loose pieces: a wheel is modelled
  // as free-standing geometry that never touches the frame. Unlike the two above it is a
  // PROP rather than a body part, so it is the least urgent of the three —
  // but a wheel that touches nothing is still a wheel that will separate
  // from the chair the moment anything moves it.
  wheelchair_ace: 0.096,
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

/** Connected components of the figure mask, largest first. 8-connectivity. */
async function components(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const on = (i) => data[i * 4 + 3] > 128;
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const comps = [];
  for (let start = 0; start < W * H; start++) {
    if (!on(start) || seen[start]) continue;
    let sp = 0;
    let size = 0;
    let minX = W, maxX = -1, minY = H, maxY = -1;
    stack[sp++] = start;
    seen[start] = 1;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p / W) | 0;
      size++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (!seen[q] && on(q)) {
            seen[q] = 1;
            stack[sp++] = q;
          }
        }
      }
    }
    comps.push({ size, minX, maxX, minY, maxY });
  }
  return comps.sort((a, b) => b.size - a.size);
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

  for (const id of ids) {
    it(`${id}: every part of the figure is attached to the figure`, async () => {
      const bad = [];
      for (const view of VIEWS) {
        const file = join(CONCEPTS, `${slugFor(id)}-${view}.png`);
        if (!existsSync(file)) continue;
        const comps = (await components(file)).filter((c) => c.size > SPECK_PX);
        if (comps.length <= 1) continue;
        const total = comps.reduce((a, c) => a + c.size, 0);
        const stray = comps.slice(1).reduce((a, c) => a + c.size, 0) / total;
        if (stray > (DETACHED_INK[id] ?? 0)) {
          const s = comps[1];
          bad.push(
            `${id} ${view}: ${(100 * stray).toFixed(1)}% of the figure's ink is NOT ` +
            `connected to the rest of it (largest loose piece ${s.size}px at ` +
            `x${s.minX}-${s.maxX} y${s.minY}-${s.maxY}). Find the two forms that ` +
            'should meet and do not. A budget here may only shrink.',
          );
        }
      }
      expect(bad).toEqual([]);
    }, 30_000);
  }

  it('carries no detached-ink debt for a character that is whole again', async () => {
    const paid = [];
    for (const [id, budget] of Object.entries(DETACHED_INK)) {
      let worst = 0;
      for (const view of VIEWS) {
        const file = join(CONCEPTS, `${slugFor(id)}-${view}.png`);
        if (!existsSync(file)) continue;
        const comps = (await components(file)).filter((c) => c.size > SPECK_PX);
        if (comps.length <= 1) continue;
        const total = comps.reduce((a, c) => a + c.size, 0);
        worst = Math.max(worst, comps.slice(1).reduce((a, c) => a + c.size, 0) / total);
      }
      if (worst < budget - 0.005) {
        paid.push(`${id}: debt says ${budget}, measures ${worst.toFixed(3)} — lower it or delete it`);
      }
    }
    expect(paid).toEqual([]);
  }, 60_000);

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
