// ---------------------------------------------------------------------------
// ★ THE SCULPTOR'S TAPE MEASURE — read a concept sheet, print the numbers a
// sculpt script needs, in feet.
//
// Junebug's sculpt script is 1,467 lines of code and 1,629 lines of comment,
// and a large share of that comment is hand-traced pixel arithmetic:
//
//   "Tracing junebug-turnaround.png column by column for the first row of six
//    consecutive skin pixels gives y=201 across the centre of the forehead
//    (x 268-310) and y=176-183 at x 382-388 — the hairline RISES 25px at the
//    temple"
//
// That work was right and it is why she is approved. Doing it twenty-nine more
// times by hand is not a plan, and every hand-traced number is a number nobody
// can re-check without redoing the trace.
//
// So this reads the same landmarks with the same detector `measure-fidelity`
// uses to GRADE the result — which matters more than it sounds. A sculptor
// measuring the concept one way and a gate measuring the delivery another way
// produces disagreements that are really two rulers, and four rounds on Junebug
// were spent on exactly that class of confusion.
//
// ★ IT PRINTS FEET, NOT PIXELS. Every sculpt script authors in absolute feet
// against the canonical rig, so the conversion belongs here, once, rather than
// in a comment block per character. A concept fraction f of figure height is
// model z = height - f * height, and every width is scaled by the same factor.
//
// ★ AND IT SAMPLES THE PALETTE RATHER THAN NAMING IT. Junebug's swatches are
// "SAMPLED from junebug-turnaround.png, not remembered", and the one time a
// colour WAS remembered — a round-3 verdict asserting her shoe was "white with
// a red toe cap" — it went into the next brief as fact and the sculptor
// inverted a shoe that had been closer to the art. The band colours below are
// read off the sheet.
//
//   npm run measure:turnaround -- tank
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

import { slugFor } from './character-registry.mjs';
import { floodFigureMask } from './figure-mask.mjs';

const CONCEPTS = 'docs/v2/concepts';
// The canonical rig's height. `src/v2/render/skeleton.ts` owns it; repeated here
// because this script runs under plain node with no TypeScript loader, and
// `skeleton.test.ts` is what stops the two drifting.
const REFERENCE_HEIGHT_FT = 4.0;
const BACKDROP_TOLERANCE = 16;
const COLUMN_OCCUPANCY = 0.06;
const MIN_FIGURE_WIDTH = 60;
const MAX_FIGURE_SHARE = 0.6;

const near = (c, bg) =>
  Math.abs(c[0] - bg[0]) < BACKDROP_TOLERANCE &&
  Math.abs(c[1] - bg[1]) < BACKDROP_TOLERANCE &&
  Math.abs(c[2] - bg[2]) < BACKDROP_TOLERANCE;

const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

async function loadSheet(path) {
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
  return { W, H, at, bg: (x) => columns[Math.min(Math.max(x, 0), W - 1)] };
}

/** The leftmost figure on the sheet — the front view. */
function frontView(sheet) {
  const { W, H, at, bg } = sheet;
  const runs = [];
  let start = null;
  for (let x = 0; x < W; x++) {
    let hits = 0, sampled = 0;
    for (let y = 0; y < H; y += 3) { sampled++; if (!near(at(x, y), bg(x))) hits++; }
    const occupied = hits / sampled > COLUMN_OCCUPANCY;
    if (occupied && start === null) start = x;
    if ((!occupied || x === W - 1) && start !== null) {
      if (x - start > MIN_FIGURE_WIDTH) runs.push([start, x]);
      start = null;
    }
  }
  if (!runs.length) throw new Error('no figure found on the sheet');
  const [x0, x1] = runs[0];
  if (x1 - x0 > MAX_FIGURE_SHARE * W) {
    throw new Error(
      `the views are not split: the leftmost run is ${x1 - x0}px of ${W}px. ` +
      'Every measurement below would span the whole collage.',
    );
  }
  return { x0, x1, views: runs.length };
}

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('usage: npm run measure:turnaround -- <character id>');
    process.exit(2);
  }
  const slug = slugFor(id);
  const path = join(CONCEPTS, `${slug}-turnaround.png`);
  if (!existsSync(path)) {
    console.error(`missing ${path}`);
    process.exit(2);
  }

  const sheet = await loadSheet(path);
  const { x0: fx0, x1: fx1, views } = frontView(sheet);
  const { at, bg, H, W } = sheet;
  // Connectivity, not colour — see figure-mask.mjs. Deciding this per pixel
  // let two pale highlights split Tank's head into three runs.
  const inFigure = floodFigureMask(at, bg, W, H, BACKDROP_TOLERANCE);

  // Bounding box of the front figure only.
  let bx0 = fx1, bx1 = fx0, by0 = H, by1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = fx0; x <= fx1; x++) {
      if (!inFigure(x, y)) continue;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
  }
  const figH = by1 - by0 + 1;
  const ftPerPx = REFERENCE_HEIGHT_FT / figH;
  const rowSpan = (y) => {
    let a = -1, b = -1;
    for (let x = bx0; x <= bx1; x++) if (inFigure(x, y)) { if (a < 0) a = x; b = x; }
    return a < 0 ? null : [a, b];
  };
  const runContaining = (y, xc) => {
    const xs = Math.min(Math.max(xc, bx0), bx1);
    if (!inFigure(xs, y)) return null;
    let a = xs, b = xs;
    while (a > bx0 && inFigure(a - 1, y)) a--;
    while (b < bx1 && inFigure(b + 1, y)) b++;
    return [a, b];
  };
  const centreX = Math.round((bx0 + bx1) / 2);
  const zOf = (y) => (by1 - y) * ftPerPx;          // model z, feet off the ground
  const ft = (px) => px * ftPerPx;

  console.log(`\nTurnaround measurements — ${slug} (${views} views on the sheet)`);
  console.log(`front figure ${bx1 - bx0 + 1} x ${figH}px, scaled to ${REFERENCE_HEIGHT_FT}ft`);
  console.log(`1px = ${ftPerPx.toFixed(5)}ft   |   1ft = ${(1 / ftPerPx).toFixed(1)}px\n`);

  // --- the width profile, which is what a torso/leg table is made of ---
  console.log('width profile — the contiguous run through the figure centre');
  console.log('  z (ft)   half-width (ft)   span (px)   colour at centre');
  const profile = [];
  for (let f = 0.98; f >= 0.02; f -= 0.04) {
    const y = Math.round(by1 - f * figH);
    const run = runContaining(y, centreX) ?? rowSpan(y);
    if (!run) continue;
    const half = ft((run[1] - run[0] + 1) / 2);
    profile.push({ z: zOf(y), half, colour: at(centreX, y) });
    console.log(
      `  ${zOf(y).toFixed(3).padStart(6)}   ${half.toFixed(4).padStart(9)}       ` +
      `${String(run[1] - run[0] + 1).padStart(4)}      ${hex(at(centreX, y))}`,
    );
  }

  // --- garment boundaries: where the centre column changes colour ---
  // A hem, a cuff and a sock top are all the same event — one band of colour
  // ending and another starting — so finding them is one scan, not three.
  console.log('\ngarment boundaries down the centre column (colour changes > 40)');
  let previous = null;
  for (let y = by0; y <= by1; y++) {
    if (!inFigure(centreX, y)) continue;
    const c = at(centreX, y);
    if (previous) {
      const delta = Math.hypot(c[0] - previous[0], c[1] - previous[1], c[2] - previous[2]);
      if (delta > 40) {
        console.log(`  z ${zOf(y).toFixed(3)}   ${hex(previous)} -> ${hex(c)}`);
      }
    }
    previous = c;
  }

  // --- the widest point, and where the legs part ---
  let widest = { span: 0, z: 0 };
  for (let y = by0; y <= by1; y++) {
    const run = rowSpan(y);
    if (run && run[1] - run[0] > widest.span) widest = { span: run[1] - run[0], z: zOf(y) };
  }
  console.log(`\nwidest point   ${ft(widest.span).toFixed(4)}ft across, at z ${widest.z.toFixed(3)}`);

  let gap = { px: 0, z: null };
  for (let y = by0; y <= by1; y++) {
    const run = rowSpan(y);
    if (!run) continue;
    let best = 0, current = 0;
    for (let x = run[0]; x <= run[1]; x++) {
      if (inFigure(x, y)) { current = 0; continue; }
      current++; if (current > best) best = current;
    }
    if (best > gap.px) gap = { px: best, z: zOf(y) };
  }
  console.log(
    gap.z === null
      ? 'leg daylight   none found — the legs never part on this drawing'
      : `leg daylight   ${ft(gap.px).toFixed(4)}ft at its widest, at z ${gap.z.toFixed(3)}`,
  );

  console.log('\n⚠️  These are the CONCEPT\'s numbers, and it is drawn POSED.');
  console.log('    A bind-pose sculpt will not match a stance, and widening a');
  console.log('    tolerance to make it match is the failure measure:fidelity\'s');
  console.log('    ankle-daylight note warns about. Author the stance, not the number.\n');
}

await main();
