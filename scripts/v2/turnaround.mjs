// ---------------------------------------------------------------------------
// ★ ONE READER FOR THE CONCEPT SHEETS, because a sculptor and a gate that
// measure the same drawing two ways produce disagreements that are really two
// rulers.
//
// `measure-turnaround.mjs` (the sculptor's tape measure) and
// `sculpt-provenance.lint.test.js` (the gate that checks a sculpt script's
// cited numbers are still true) both live on this. Four rounds on Junebug went
// into exactly that class of confusion, and `measure-fidelity.mjs` already
// shares its detector with the board for the same reason.
//
// ★ AND IT REPORTS WHETHER A LANDMARK IS TRACEABLE AT ALL, which is the whole
// reason this file exists as something separate.
//
// Junebug's torso table cites "the contiguous run through the figure's centre,
// once the arms have separated from the torso at y=520". That trace works on
// her sheet. On Tank's it does not: scanned row by row, EVERY view of his
// turnaround has a run count of 1 from crown to ankle, because the concept
// draws his arms resting against his body in all five poses. The same trace
// returns arm-plus-torso and means nothing.
//
// ⚠️ NOBODY NOTICED FOR EIGHT REVIEW ROUNDS. The step was simply skipped, his
// form tables were authored by eye and then nudged against review prose, and
// eight independent reviews spent themselves describing the consequence — "a
// cone of revolution", "a lampshade", "the bulk is gone", "stick limbs" —
// which are all the same missing measurement wearing different words.
//
// So `runsAt` is a first-class result and not a diagnostic. A landmark that
// cannot be traced has to be DECLARED untraceable in the sculpt script, which
// turns a silent gap into a reviewable one.
// ---------------------------------------------------------------------------

import sharp from 'sharp';

// The canonical rig's height. `src/v2/render/skeleton.ts` owns it; repeated
// here because this runs under plain node with no TypeScript loader, and
// `skeleton.test.ts` is what stops the two drifting.
export const REFERENCE_HEIGHT_FT = 4.0;
export const BACKDROP_TOLERANCE = 16;
const COLUMN_OCCUPANCY = 0.06;
const MIN_FIGURE_WIDTH = 60;
const MAX_FIGURE_SHARE = 0.6;

/** Background is what connects to the frame edge — see figure-mask.mjs. */
export { floodFigureMask } from './figure-mask.mjs';
import { floodFigureMask } from './figure-mask.mjs';

export async function loadSheet(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const at = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };
  // Per-column backdrop, because seven of the thirty sheets are vignetted past
  // a single corner sample. Same rule as measure-fidelity.
  const rows = Array.from({ length: Math.max(3, Math.min(7, Math.round(H * 0.01))) }, (_, i) => i + 1);
  const columns = new Array(W);
  for (let x = 0; x < W; x++) {
    const channel = (k) => {
      const values = rows.map((y) => at(x, y)[k]).sort((a, b) => a - b);
      return values[values.length >> 1];
    };
    columns[x] = [channel(0), channel(1), channel(2)];
  }
  const bg = (x) => columns[Math.min(Math.max(x, 0), W - 1)];
  const inFigure = floodFigureMask(at, bg, W, H, BACKDROP_TOLERANCE);
  return { W, H, at, bg, inFigure };
}

/** Every figure on the sheet, left to right. The leftmost is the front view. */
export function views(sheet) {
  const { W, H, inFigure } = sheet;
  const runs = [];
  let start = null;
  for (let x = 0; x < W; x++) {
    let hits = 0, sampled = 0;
    for (let y = 0; y < H; y += 3) { sampled++; if (inFigure(x, y)) hits++; }
    const occupied = hits / sampled > COLUMN_OCCUPANCY;
    if (occupied && start === null) start = x;
    if ((!occupied || x === W - 1) && start !== null) {
      if (x - start > MIN_FIGURE_WIDTH) runs.push([start, x]);
      start = null;
    }
  }
  if (!runs.length) throw new Error('no figure found on the sheet');
  if (runs[0][1] - runs[0][0] > MAX_FIGURE_SHARE * W) {
    throw new Error(
      `the views are not split: the leftmost run is ${runs[0][1] - runs[0][0]}px of ${W}px. ` +
      'Every measurement would span the whole collage.',
    );
  }
  return runs;
}

/**
 * A single figure, scaled so its own height is the canonical rig's height.
 *
 * ⚠️ Every figure on a sheet is scaled INDEPENDENTLY. A crouching pose is
 * shorter in pixels than the standing one beside it, so sharing one scale
 * across views would silently stretch it.
 */
export function figure(sheet, index = 0) {
  const [vx0, vx1] = views(sheet)[index];
  const { H, inFigure, at } = sheet;
  let x0 = vx1, x1 = vx0, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = vx0; x <= vx1; x++) {
      if (!inFigure(x, y)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const figH = y1 - y0 + 1;
  return { x0, x1, y0, y1, figH, ftPerPx: REFERENCE_HEIGHT_FT / figH, inFigure, at };
}

/** The image row holding a given model z, in feet off the ground. */
export const rowAt = (f, z) => Math.round(f.y1 - z / f.ftPerPx);

/** Every separate horizontal run of figure at this height. */
export function segmentsAt(f, z) {
  const y = rowAt(f, z);
  const segments = [];
  let start = null;
  for (let x = f.x0; x <= f.x1; x++) {
    const inside = f.inFigure(x, y);
    if (inside && start === null) start = x;
    if ((!inside || x === f.x1) && start !== null) {
      if (x - start > 2) segments.push([start, x]);
      start = null;
    }
  }
  return segments;
}

/**
 * How many separate pieces of figure this row crosses.
 *
 * 1 means the arms are against the body and a width taken here is arm PLUS
 * torso — which is exactly the reading that cannot be used for a torso table.
 */
export const runsAt = (f, z) => segmentsAt(f, z).length;

/** Half the width of the run through the figure's centre, in feet. */
export function halfWidthAt(f, z) {
  const segments = segmentsAt(f, z);
  if (!segments.length) return null;
  const centre = Math.round((f.x0 + f.x1) / 2);
  const run = segments.find(([a, b]) => centre >= a && centre <= b)
    ?? [...segments].sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
  return ((run[1] - run[0]) * f.ftPerPx) / 2;
}

/**
 * Whether a torso landmark at this height can be traced at all.
 *
 * ★ THIS IS THE CHECK THAT WAS MISSING. It is deliberately conservative: a
 * torso width is traceable only where the row crosses three runs (arm, body,
 * arm) or one run that the arms demonstrably are not part of. The caller gets
 * the run count and decides; the sculpt script must then either cite the
 * measurement or declare it untraceable.
 */
export function torsoTraceable(f, z) {
  return runsAt(f, z) >= 3;
}
