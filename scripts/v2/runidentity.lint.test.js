// ---------------------------------------------------------------------------
// ★ A RUN COUNT IS NOT A RUN IDENTITY, AND THE DIFFERENCE HAS COST FOUR ROUNDS.
//
// `turnaround.mjs` could already say how many pieces of figure a row crosses.
// It could not say WHICH OBJECT each piece is, so every caller guessed — and
// four separate failures on this project are the same guess going wrong. All of
// them are one shape: a quantity read down a line that passes through more than
// one object.
//
//   · the torso read across `sleeve | torso | sleeve` as one span — half 0.910
//     authored where the torso alone is 0.532. The maintainer's words for the
//     result were "the corners of the T-shirt ended up on his stomach", which is
//     literally true: they were the sleeves, measured into the belly.
//   · the shoe read across two overlapping feet — 1.211ft for a foot that is
//     0.86, and the sculpt's own header had already rejected that number once.
//   · the mouth read on the chin shadow, putting the atlas mouth at 97.3% of
//     head height.
//   · the shoe's colour bands never traced at all.
//
// `torsoTraceable` was the right idea one step short: it counts. This gate
// covers the primitives that name.
//
// ★ WHAT MAKES THIS NOT A TAUTOLOGY. The analyser is not asserted against
// itself. It is asserted against numbers that were traced BY HAND, by a person,
// column by column, and recorded in `sculpt-tank-source.py`'s header before any
// of this code existed. If the tool and the hand disagree, one of them is wrong
// and the disagreement is the finding — the tolerance is not there to absorb it.
//
// ⚠️ THE TOLERANCE IS TIGHTER THAN THE GATE THAT CONSUMES IT (0.03ft in
// `sculpt-provenance.lint.test.js`). If the analyser only agreed to the
// consuming gate's tolerance, that gate would be absorbing analyser error and
// measuring nothing.
//
// Break-it record, below: asking for the silhouette instead of the named centre
// run reproduces the 0.918 that shipped, and the shoe refusal turns back into a
// number the moment the pair is not declared.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { figure, halfWidthAt, loadSheet, namedRunAt, palette, regionRunsAt } from './turnaround.mjs';

const SHEET = 'docs/v2/concepts/tank-turnaround.png';

/** Pick a material by its role in the drawing, the way a recipe would. */
const shirtOf = (pal) => pal.findIndex((p) => p.rgb[2] > p.rgb[0] + 8 && p.rgb[1] < p.rgb[0] - 8);
const creamOf = (pal) => pal.findIndex((p) => p.rgb[0] > 200 && p.rgb[1] > 200 && p.rgb[2] > 180);

let f, pal;
async function load() {
  if (!f) { const sheet = await loadSheet(SHEET); f = figure(sheet, 0); pal = palette(f); }
  return { f, pal };
}

describe('a run knows which object it belongs to', () => {
  it('separates a figure into the materials the drawing actually uses', async () => {
    const { pal } = await load();
    // Unsupervised on purpose: a hardcoded `isShirt` is one kid's wardrobe
    // written into a shared tool, which is the mistake `measure-fidelity`'s own
    // header records making with `isRed`/`isCream`.
    expect(pal.length).toBeGreaterThanOrEqual(4);
    expect(shirtOf(pal)).toBeGreaterThanOrEqual(0);
    expect(creamOf(pal)).toBeGreaterThanOrEqual(0);
    // Tank's tee, sampled by hand into his sculpt header as rgb(103,68,127).
    expect(Math.abs(pal[shirtOf(pal)].rgb[0] - 103)).toBeLessThanOrEqual(12);
    expect(Math.abs(pal[shirtOf(pal)].rgb[2] - 127)).toBeLessThanOrEqual(12);
  });

  // ★ THE NUMBERS BELOW WERE TRACED BY HAND, BEFORE THIS CODE EXISTED.
  // `sculpt-tank-source.py`'s "ROUND 31" header, retracing the torso from the
  // CENTRAL run after discovering the old column was sleeve-to-sleeve.
  const HAND_TRACED = [
    { z: 1.88, half: 0.541 },
    { z: 1.94, half: 0.532 },
    { z: 2.06, half: 0.515 },
    { z: 2.18, half: 0.494 },
  ];

  it('reproduces the hand-traced torso column', async () => {
    const { f, pal } = await load();
    const shirt = shirtOf(pal);
    const off = [];
    for (const { z, half } of HAND_TRACED) {
      const got = namedRunAt(f, pal, z, { material: shirt });
      expect(got.value, `z ${z} was refused: ${got.notTraceable?.reason}`).toBeDefined();
      if (Math.abs(got.value - half) > 0.01) off.push(`z ${z}: tool ${got.value.toFixed(4)} vs hand ${half}`);
    }
    expect(off, 'the tool and the hand trace disagree — one of them is wrong').toEqual([]);
  });

  it('names the sleeve|torso|sleeve the silhouette hides', async () => {
    const { f, pal } = await load();
    const runs = regionRunsAt(f, pal, 1.94).filter((r) => r.material === shirtOf(pal));
    // Three same-material runs: flank, centre, flank. The header records the
    // hand-found pixel spans as 60-114 / 119-300 / 305-372.
    expect(runs.length).toBe(3);
    expect(runs.map((r) => r.role)).toEqual(['flankLeft', 'centre', 'flankRight']);
    const centre = runs.find((r) => r.role === 'centre');
    expect(Math.abs(centre.x0 - 119)).toBeLessThanOrEqual(4);
    expect(Math.abs(centre.x1 - 300)).toBeLessThanOrEqual(4);
    // The seams are one to two pixels of shadow. Merging them is the bug.
    expect(centre.seamLeftPx).toBeLessThanOrEqual(3);
    expect(centre.seamRightPx).toBeLessThanOrEqual(3);
  });

  // ★ BROKEN ONCE, AGAINST THE NUMBER THAT ACTUALLY SHIPPED. The silhouette is
  // still there and still wrong; naming the run is what fixes it, not a
  // tolerance.
  it('shows the silhouette still reports the number that shipped', async () => {
    const { f } = await load();
    const silhouette = halfWidthAt(f, 1.94);
    expect(silhouette).toBeGreaterThan(0.9);           // 0.918 — authored as 0.910
    expect(Math.abs(silhouette - 0.532)).toBeGreaterThan(0.3);
  });

  it('refuses a paired part instead of measuring across both of them', async () => {
    const { f, pal } = await load();
    const cream = creamOf(pal);
    const refused = namedRunAt(f, pal, 0.15, { material: cream, paired: true });
    expect(refused.value, 'a declared pair must not return a width').toBeUndefined();
    expect(refused.notTraceable.class).toBe('paired-part');
    expect(refused.notTraceable.reason).toMatch(/crosses the centreline/);
    expect(refused.notTraceable.insteadUse).toBeTruthy();
  });

  it('measures the same row happily when the pair is NOT declared — which is the danger', async () => {
    // The counterpart to the test above, and the reason a pair has to be
    // DECLARED rather than counted: at this height the cream is seven runs
    // (each shoe is cream|navy|cream across its own width), so no count
    // distinguishes two feet from one torso, and the run through the centre
    // column spans the inner edge of both.
    const { f, pal } = await load();
    const undeclared = namedRunAt(f, pal, 0.15, { material: creamOf(pal) });
    expect(undeclared.value).toBeDefined();
    expect(undeclared.notTraceable).toBeUndefined();
  });

  it('refuses a material that is not on the row rather than taking the nearest', async () => {
    const { f, pal } = await load();
    const high = namedRunAt(f, pal, 3.6, { material: creamOf(pal) });   // his bald crown
    expect(high.value).toBeUndefined();
    expect(high.notTraceable.class).toBe('no-such-material');
    expect(high.notTraceable.reason).toMatch(/#/);   // says what IS there
  });
});
