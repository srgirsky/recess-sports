// ---------------------------------------------------------------------------
// ★ A FACE CAN SIT AT THE WRONG HEIGHT ON ITS OWN HEAD, AND NOTHING SAW IT.
//
// Every feature Tank has was authored one notch too low. Measured on his board
// against the approved turnaround, as a percentage of head height from crown to
// neck:
//
//                 turnaround   delivered
//     brow            36.7%       37.9%
//     eyes            56.5%       57.5%
//     nose            67.7%       82.8%      <- a whole feature low
//     mouth           78.3%       94.6%      <- on his chin
//     ear line        64.3%       69.9%
//
// The maintainer saw it immediately — "the eyebrows, eyes, nose, and mouth, as
// well as the ears, all seem like they're lower on the head than they should
// be" — and every automated gate was green, because none of them asked WHERE a
// feature is. `measure:fidelity` checks head height, head aspect and how much
// skin is visible; `skeleton.test.ts` checks the rig; `clips.test.ts` checks
// animation. A face slid two-thirds of the way onto the jaw and passed all of it.
//
// ★ THE CAUSE WAS A MEASUREMENT, NOT A SCULPT. `sculpt-tank-source.py`'s own
// header records "mouth z 3.00" read off a dark-pixel detector — and z 3.00 is
// 97.3% of the way down that head. The detector had found the shadow UNDER the
// jaw and called it the lip line. The island window was then solved to honour
// that number, so the atlas obediently painted the mouth onto the chin. It is
// the same class as the shoe built from two overlapping feet: a quantity read
// down a line that passes through more than one thing.
//
// ★ WHY THIS IS ARITHMETIC AND NOT A PIXEL DETECTOR. The obvious gate re-runs
// feature detection on both images and compares. It was written first and
// thrown away: on the turnaround the darkest row in the lower face is the
// NOSTRIL (luminance 20) not the lip line (22), so it reports the mouth 10
// points high; and Junebug's fringe merges with her brow, so the band ordering
// that works for a bald kid finds one band instead of three. A gate that
// mis-identifies a feature fires falsely, and a gate that fires falsely gets
// weakened. This one instead asks the SOURCE where it has put each feature —
// the atlas row, the island window, the head ellipsoid, the ear centre — which
// is exactly the arithmetic that was wrong, and compares it against a ratio
// measured once from the turnaround and recorded below.
//
// Break-it record, in the tests below: restoring `mouthY: 104` fires with
// "tank mouth sits at 94.6% of head height, want 78.3% (+-2.5)".
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FACE_SPECS } from './face-specs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sculpt = (slug) => readFileSync(resolve(here, 'blender', `sculpt-${slug}-source.py`), 'utf8');

/**
 * ★ THE CROWN-TO-NECK SPAN IS NOT THE ELLIPSOID'S DIAMETER, and this constant
 * is the difference. "Percent of head height" everywhere in this project means
 * the span the board renders — crown down to the neck pinch — because that is
 * what a person measures off a turnaround with a ruler. That span is set by the
 * collar and the neck, not by the skull alone, so it cannot be derived from
 * `HEAD_RADII`.
 *
 * Calibrated once, on the two features that were never in doubt: with the head
 * at centre z 3.460 and vertical radius 0.552, Tank's delivered brow and eye
 * measured 37.9% and 57.5% of head height at latitudes +0.289 and -0.081 rad.
 * Both solve `pct = K * (1 - sin(latitude))` at K = 53.0 and 53.2 — agreement
 * to 0.2 of a point across a 20-point separation, which is what makes the
 * linear-in-z form trustworthy rather than assumed.
 */
const PCT_PER_RADIUS = 53.1;

/** Where a latitude on the skull lands, as % of head height from the crown. */
const pctOfHead = (latitude) => PCT_PER_RADIUS * (1 - Math.sin(latitude));

/** The latitude an atlas cell row is painted onto, through the island window. */
const latitudeOfCell = (cellY, low, span) => low + (1 - cellY / 128) * span;

/**
 * ★ MEASURED OFF THE APPROVED TURNAROUND, ONCE, AND CITED HERE.
 *
 * Front figure, crown row 137 to neck pinch row 319 — a 182px head. Brow and
 * eye are the centroids of the two topmost dark bands in the central third
 * (rows 199-210 and 230-247). The mouth is the darkest run in the central 60px
 * BELOW the nose, rows 278-281, taken narrow on purpose so the nostril above it
 * and the chin shadow below it are both excluded. The ear line is the head's
 * widest row, which is what an ear IS in a front silhouette.
 *
 * ⚠️ Tolerances are the honest precision of that trace, not a comfort margin.
 * A band centroid on a 182px head is good to about a pixel, which is 0.55 of a
 * point; 2.5 allows for the render's own softness and for a character's brow
 * being drawn thicker than the mark that represents it. Do not widen one to
 * clear a change — the change is what moved.
 */
const TURNAROUND = {
  tank: {
    slug: 'tank',
    brow: 36.7,
    eye: 56.5,
    mouth: 78.3,
    earLine: 64.3,
    tolerance: 2.5,
    // ★ THE SHOE IS THE SAME PROBLEM ONE LIMB DOWN, so it is gated the same way.
    //
    // Its four colour bands were a stack in the right ORDER with every boundary
    // in the wrong PLACE — the navy quarter ran to 0.64 of shoe height against
    // the drawing's 0.41 and ate the vamp, so the board read as a cream loaf
    // with a belt round it. Mapped cell by cell off the concept's own front-left
    // shoe (x 86-190, y 740-824, classified navy / cream / shaded / background
    // at 2px steps; shoe top row 748, ground 819, so 71px):
    //
    //   cream midsole 0.00-0.24   navy quarter 0.25-0.41
    //   cream vamp    0.44-0.79   navy collar  0.80-1.00
    //
    // Only the two INNER boundaries are gated. The outer two are 0 and 1 by
    // construction, and the vamp/collar edge at 0.795 is the one the drawing
    // pins least precisely — it is the soft top of a shadowed panel.
    shoeBands: { midsoleTop: 0.24, quarterTop: 0.41, tolerance: 0.05 },
  },
  // ★ GRIZZ'S CROWN IS HAIR, so `PCT_PER_RADIUS` cannot place him: that
  // constant assumes the rendered crown is the skull's own top, and his board
  // crown is an afro apex half a foot above it. His entry instead declares the
  // SPAN the ratios were measured against — afro apex z 3.99 to neck pinch
  // z 2.48, both traced off his turnaround — and the check maps a latitude to
  // a height directly. He also has NO earLine: his ears are not drawn in any
  // view (the afro covers them), his sculpt builds none, and his head's widest
  // row is the afro's equator, which is not an ear however the detector
  // labels it. An entry without `earLine` skips that check and permits a
  // sculpt without an EarSpec — explicitly, never silently.
  grizz: {
    slug: 'grizz',
    // Bounded traces on grizz-turnaround.png (crown row 128, neck row 387):
    // brow band rows 279-292, eye band rows 309-320, lip line rows 351-352.
    // The spec REFUSES his mouth (ambiguous-parts: nose shadow vs frown line
    // within 7 luminance counts) — these are the bounded probes the refusal
    // asks for, recorded in sculpt-grizz-source.py's FACE_ISLAND note.
    brow: 60.8,
    eye: 72.0,
    mouth: 86.5,
    span: { crownZ: 3.99, neckZ: 2.48 },
    tolerance: 2.5,
  },
  // ★ BENDY BAO'S EYES ARE BEHIND GLASSES, and the spec REFUSES his eye band
  // (merged-region: the wire frames fuse with the sideburn columns into one
  // region as wide as the face). These are the bounded probes the refusal asks
  // for, traced on bendy-bao-turnaround.png (bun apex row 110, neck row 354):
  // brow bands rows 227-237 paired about cx (centroid row 232); the lens rings
  // span rows 249-287 with their centres — which is where the eyes ARE — at
  // row 262; the smile is rows 302-304 (corners 172-187 / 247-261, symmetric
  // about cx 216). The analyser's own "brow" at 84.9% is the chin-crease
  // singles at rows 315-320 misread as a paired band, and its "mouth" at 68.4%
  // is the frames' lower arc — both recorded in sculpt-bendy-bao-source.py's
  // FACE_ISLAND note. His crown is the bun apex, not the skull top, so like
  // grizz he declares the span the ratios were measured against.
  bend_it: {
    slug: 'bendy-bao',
    brow: 50.0,
    eye: 62.3,
    mouth: 79.0,
    earLine: 71.3,
    span: { crownZ: 3.99, neckZ: 2.49 },
    tolerance: 2.5,
  },
};

function constantsFor(slug, { needsEar = true } = {}) {
  const src = sculpt(slug);
  const num = '(-?\\d+\\.?\\d*)';
  const island = src.match(new RegExp(`^FACE_ISLAND = \\(${num}, ${num}, ${num}\\)`, 'm'));
  const centre = src.match(new RegExp(`^HEAD_CENTER = \\(${num}, ${num}, ${num}\\)`, 'm'));
  const radii = src.match(new RegExp(`^HEAD_RADII = \\(${num}, ${num}, ${num}\\)`, 'm'));
  // Optional only when the character's TURNAROUND entry has no earLine target
  // — a kid whose ears are not drawn sculpts none, and demanding the spec
  // would invite a decorative EarSpec that exists to satisfy a regex.
  const ear = src.match(new RegExp(`EarSpec\\(center=\\(${num}, ${num}\\)`));
  if (!island || !centre || !radii || (needsEar && !ear)) {
    throw new Error(`${slug}: could not read FACE_ISLAND / HEAD_CENTER / HEAD_RADII / EarSpec — ` +
      'the regexes above track the literal shape of those lines, so a reformat breaks this gate ' +
      'rather than silently skipping it');
  }
  return {
    islandLow: Number(island[2]),
    islandSpan: Number(island[3]),
    headZ: Number(centre[3]),
    headRz: Number(radii[3]),
    earZ: ear ? Number(ear[2]) : null,
  };
}

describe('a face sits where the turnaround puts it', () => {
  for (const [id, want] of Object.entries(TURNAROUND)) {
    const spec = FACE_SPECS[id];
    const k = constantsFor(want.slug, { needsEar: 'earLine' in want });

    // The atlas rows the generator is TOLD to draw at. `brow()` and `eye()`
    // centre their marks ~2 cells above the anchor, which is why the numbers in
    // face-specs.mjs sit 2 below where the feature lands; that offset is part of
    // what these ratios were fitted against and is why this asserts the
    // delivered POSITION rather than the anchor.
    // A `span` entry maps a latitude to its height directly against the
    // declared crown-to-neck span; the calibrated PCT_PER_RADIUS form remains
    // for characters whose rendered crown IS the skull top.
    const pctAt = (latitude) => want.span
      ? (100 * (want.span.crownZ - (k.headZ + k.headRz * Math.sin(latitude)))) / (want.span.crownZ - want.span.neckZ)
      : pctOfHead(latitude);
    const at = (cellY) => pctAt(latitudeOfCell(cellY, k.islandLow, k.islandSpan));

    it(`${id}: brow, eyes and mouth land at the turnaround's ratios`, () => {
      const got = { brow: at(spec.browY - 2), eye: at(spec.eyeY - 2), mouth: at(spec.mouthY + 3) };
      const bad = [];
      for (const feature of ['brow', 'eye', 'mouth']) {
        if (Math.abs(got[feature] - want[feature]) > want.tolerance) {
          bad.push(
            `${id} ${feature} sits at ${got[feature].toFixed(1)}% of head height, ` +
            `want ${want[feature]}% (+-${want.tolerance}). Move it with face-specs.mjs's ` +
            `${feature}Y or with FACE_ISLAND in sculpt-${want.slug}-source.py — and re-measure ` +
            'the turnaround before changing the target, because the target is the drawing',
          );
        }
      }
      expect(bad).toEqual([]);
    });

    it(`${id}: the ear line sits where the head is widest in the drawing`, (ctx) => {
      // No earLine target means the drawing shows no ears (see grizz's entry);
      // there is nothing to place and no EarSpec to read.
      if (!('earLine' in want)) return ctx.skip();
      // A span entry maps the ear's own z directly; the PCT_PER_RADIUS form
      // stays for characters whose rendered crown is the skull top.
      const got = want.span
        ? (100 * (want.span.crownZ - k.earZ)) / (want.span.crownZ - want.span.neckZ)
        : PCT_PER_RADIUS * (1 - (k.earZ - k.headZ) / k.headRz);
      expect(
        Math.abs(got - want.earLine) <= want.tolerance,
        `${id} ear line at ${got.toFixed(1)}% of head height, want ${want.earLine}% ` +
        `(+-${want.tolerance}) — EAR_SPEC's centre z in sculpt-${want.slug}-source.py`,
      ).toBe(true);
    });
  }

  for (const [id, want] of Object.entries(TURNAROUND)) {
    if (!want.shoeBands) continue;
    it(`${id}: the shoe's colour bands sit where the drawing puts them`, () => {
      const src = sculpt(want.slug);
      const table = src.match(/^SHOE_BANDS = \[([\s\S]*?)^\]/m);
      expect(table, 'could not read SHOE_BANDS').not.toBeNull();
      const rows = [...table[1].matchAll(/\(\s*(-?\d+\.?\d*)\s*,\s*"(\w+)"/g)]
        .map(([, at, band]) => ({ at: Number(at), band }));
      // midsole -> quarter -> collar -> quarter, and the first two edges are
      // the ones the concept pins.
      expect(rows.map((r) => r.band)).toEqual(['midsole', 'quarter', 'collar', 'quarter']);
      const bad = [];
      const check = (label, got, wanted) => {
        if (Math.abs(got - wanted) > want.shoeBands.tolerance) {
          bad.push(
            `${id} shoe ${label} boundary at ${got.toFixed(3)} of shoe height, want ` +
            `${wanted} (+-${want.shoeBands.tolerance}) — SHOE_BANDS in ` +
            `sculpt-${want.slug}-source.py. The bands are a STACK: getting the order ` +
            'right is not getting the boundaries right, and the tone-split metric ' +
            'cannot tell the difference because it counts how much, never where',
          );
        }
      };
      check('midsole top', rows[1].at, want.shoeBands.midsoleTop);
      check('quarter top', rows[2].at, want.shoeBands.quarterTop);
      expect(bad).toEqual([]);
    });
  }

  // ★ Broken once, against the real constants: the value that actually shipped.
  it('fires on the mouth position that shipped', () => {
    const k = constantsFor('tank');
    const shipped = pctOfHead(latitudeOfCell(104 + 3, k.islandLow, k.islandSpan));
    expect(Math.abs(shipped - TURNAROUND.tank.mouth)).toBeGreaterThan(TURNAROUND.tank.tolerance);
    expect(shipped).toBeGreaterThan(90); // it was on his chin
  });
});
