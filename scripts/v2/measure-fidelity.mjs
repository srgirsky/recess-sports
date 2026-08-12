// Measured fidelity: the concept is the target, and every number here is read
// off BOTH images with the same detector.
//
// ---------------------------------------------------------------------------
// Why this exists, and what it replaces.
//
// Rubric §3's six categories are scored 1-5 by eye. Across four rounds on
// Junebug the same asset drew 4,4,4,4,4,3 from one critic and 3,4,3,3,3,3 from
// the next — a full point of swing on evidence that had barely changed, because
// "does the hair read as one designed mass" has no scale. Worse, a round-3
// verdict asserted the concept's shoe was "white with a red toe cap"; nobody
// measured it, it went into the next brief as fact, and the sculptor inverted a
// shoe that had been closer to the art before. One classifier over both images
// settles that in a second: the concept runs 38.1% red to 46.3% cream.
//
// So this file measures what a critic was being asked to judge. Every metric
// derives its TARGET from the concept turnaround at run time — nothing here
// hardcodes what Junebug should look like, which is why it transfers to the
// other 29 characters unchanged. A metric is reported as delivered-vs-concept
// with a tolerance, and the script exits non-zero when one is outside it.
//
// It is deliberately NOT a `*.test.*` file yet. Vitest's default globs would
// make it a CI gate immediately, and characters that have never been sculpted
// would go red on their first commit. Promote it once a character passes.
//
// Scale-invariance is the whole trick: a concept render and a shipped GLB
// render at different pixel sizes, so every metric is a RATIO against something
// in its own image (figure height, head width, iris spacing). Comparing raw
// pixel counts across the two is the mistake that produced eyes 38% too small.
//
//   npm run measure:fidelity -- nostrike

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const CONCEPTS = 'docs/v2/concepts';
const SLUGS = { nostrike: 'junebug', calls_shot: 'theo', wheelchair_ace: 'zoom', big_lou: 'big-lou', tank: 'tank', mimi_mash: 'mimi-mash' };

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const sat = (c) => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx ? (mx - mn) / mx : 0; };

/** A figure: pixel accessor plus a membership test, so concept crops (keyed off
 *  a flat backdrop) and delivered renders (real alpha) measure identically. */
async function loadFigure(path, { backdrop = null, extract = null } = {}) {
  let pipeline = sharp(path);
  if (extract) pipeline = pipeline.extract(extract);
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const at = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  const inFigure = backdrop
    ? (c) => !(Math.abs(c[0] - backdrop[0]) < 16 && Math.abs(c[1] - backdrop[1]) < 16 && Math.abs(c[2] - backdrop[2]) < 16)
    : (c) => c[3] > 128;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inFigure(at(x, y))) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const rowSpan = (y) => {
    let a = -1, b = -1;
    for (let x = x0; x <= x1; x++) if (inFigure(at(x, y))) { if (a < 0) a = x; b = x; }
    return a < 0 ? null : [a, b];
  };
  /** The contiguous figure run on row `y` that contains column `xc` — the way to
   *  follow one body part down a silhouette without arms joining the span. */
  const rowRunContaining = (y, xc) => {
    if (y < y0 || y > y1) return null;
    if (!inFigure(at(Math.min(Math.max(xc, x0), x1), y))) return null;
    let a = xc, b = xc;
    while (a > x0 && inFigure(at(a - 1, y))) a--;
    while (b < x1 && inFigure(at(b + 1, y))) b++;
    return [a, b];
  };
  return { W, H, at, inFigure, x0, x1, y0, y1, figH: y1 - y0 + 1, figW: x1 - x0 + 1, rowSpan, rowRunContaining };
}

/** Head box, tracked as the contiguous silhouette run containing the head's own
 *  centre column.
 *
 *  Measuring the widest row instead is wrong and quietly so: the board renders a
 *  T-pose, where the widest row in the upper half is the ARMS, which yielded a
 *  "head" 15x wider than tall. Following one run down from the crown also walks
 *  past a bun or a ponytail correctly, because those are part of the same run.
 *  The chin is the neck pinch — the run's local minimum before the shoulders
 *  widen it again. */
function headBox(f) {
  const topSpan = f.rowSpan(f.y0 + 2);
  const centerX = topSpan ? Math.round((topSpan[0] + topSpan[1]) / 2) : Math.round((f.x0 + f.x1) / 2);
  const scanTo = f.y0 + Math.round(0.5 * f.figH);
  const widths = [];
  for (let y = f.y0; y <= scanTo; y++) {
    const run = f.rowRunContaining(y, centerX);
    widths.push(run ? run[1] - run[0] + 1 : 0);
  }
  // Find the NECK, not the skull's peak. Walking down for the first peak breaks
  // on any character whose hair narrows between a bun and the skull below it —
  // it stops at the bun and calls that the head. The neck is unambiguous: the
  // narrowest run between the crown and the shoulders. The window starts below
  // the crown so a narrow bun cannot win, and ends above the hips.
  const lo = Math.round(0.15 * f.figH);
  const hi = Math.min(widths.length - 1, Math.round(0.45 * f.figH));
  let neck = lo;
  for (let i = lo; i <= hi; i++) if (widths[i] > 0 && widths[i] < widths[neck]) neck = i;
  const top = f.y0;
  const bottom = f.y0 + neck;
  let widest = 0;
  for (let i = 0; i <= neck; i++) if (widths[i] > widest) widest = widths[i];
  return { top, bottom, width: widest, height: bottom - top + 1, centerX };
}

const isRed = (c) => c[0] > c[1] + 28 && c[0] > c[2] + 22 && sat(c) > 0.30;
const isCream = (c) => lum(c) > 140 && sat(c) < 0.28;
const isHair = (c) => lum(c) < 95;
// Warm, saturated and light: the skin of every character in this roster reads
// r > g > b with real saturation, which separates it from both hair and cream.
const isSkin = (c) => c[0] > c[1] + 12 && c[1] >= c[2] && sat(c) > 0.22 && lum(c) > 80;

/** Colour split across a horizontal band expressed as a fraction of figure height. */
function bandSplit(f, fromFrac, toFrac) {
  const ya = Math.round(f.y1 - toFrac * f.figH);
  const yb = Math.round(f.y1 - fromFrac * f.figH);
  let red = 0, cream = 0, total = 0;
  for (let y = ya; y <= yb; y++) {
    for (let x = f.x0; x <= f.x1; x++) {
      const c = f.at(x, y);
      if (!f.inFigure(c)) continue;
      total++;
      if (isRed(c)) red++; else if (isCream(c)) cream++;
    }
  }
  return total ? { red: (100 * red) / total, cream: (100 * cream) / total } : { red: 0, cream: 0 };
}

/** Widest run of background between the legs, just above the shoes — rubric
 *  3.12's "daylight between the calves", as a fraction of the leg pair's width.
 *
 *  ⚠️ This one compares a BIND POSE against a POSED drawing, so a gap of its own
 *  is expected: the board renders the rig at rest while the turnaround draws a
 *  kid standing with her feet apart. Read a failure here as "look at the stance",
 *  not as a colour or sculpt defect — and do NOT widen the tolerance to clear it,
 *  because the fix is the leg placement in the sculpt and the matching bone
 *  positions, which is a rig change and wants its own pass. */
function ankleDaylight(f) {
  const y = Math.round(f.y1 - 0.13 * f.figH);
  const s = f.rowSpan(y);
  if (!s) return 0;
  let best = 0, run = 0;
  for (let x = s[0]; x <= s[1]; x++) {
    if (f.inFigure(f.at(x, y))) { run = 0; continue; }
    run++; if (run > best) best = run;
  }
  return (100 * best) / (s[1] - s[0] + 1);
}

/** How much of the head's width is visible FACE at the brow line.
 *
 *  Counting hair inward from the silhouette edge instead looks obvious and does
 *  not work: where an ear or a cheek protrudes past the hair the scan stops on
 *  its first pixel and reports zero, so the metric can never fail. Skin as a
 *  fraction of head width measures the thing that actually matters — a heavy
 *  temple wedge closes the face down into a dark-framed mask — and it fires.
 *  Split left and right of centre so a lopsided head shows up as asymmetry. */
function faceSkin(f, head) {
  const y = head.top + Math.round(0.62 * head.height);
  const s = f.rowRunContaining(y, head.centerX);
  if (!s) return { left: 0, right: 0 };
  let left = 0, right = 0;
  for (let x = s[0]; x <= s[1]; x++) {
    if (!isSkin(f.at(x, y))) continue;
    if (x < head.centerX) left++; else right++;
  }
  return { left: (100 * left) / head.width, right: (100 * right) / head.width };
}

function metricsFor(f) {
  const head = headBox(f);
  const shoes = bandSplit(f, 0, 0.09);
  const face = faceSkin(f, head);
  return {
    headHeightPct: (100 * head.height) / f.figH,
    headAspect: head.width / head.height,
    shoeRedPct: shoes.red,
    shoeCreamPct: shoes.cream,
    ankleDaylightPct: ankleDaylight(f),
    faceSkinLeftPct: face.left,
    faceSkinRightPct: face.right,
    faceAsymmetryPct: Math.abs(face.left - face.right),
  };
}

// tolerance is in the metric's own units; asymmetry is judged against zero.
const CHECKS = [
  ['headHeightPct', 2.0, 'head height as % of figure height'],
  ['headAspect', 0.08, 'head width : head height'],
  ['shoeRedPct', 8.0, 'red as % of the shoe band'],
  ['shoeCreamPct', 8.0, 'cream as % of the shoe band'],
  ['ankleDaylightPct', 12.0, 'daylight between the ankles'],
  ['faceSkinLeftPct', 6.0, 'visible face left of centre, % of head width'],
  ['faceSkinRightPct', 6.0, 'visible face right of centre, % of head width'],
];

const id = process.argv[2] ?? 'nostrike';
const slug = SLUGS[id] ?? id;
const turnaround = join(CONCEPTS, `${slug}-turnaround.png`);
const delivered = join(CONCEPTS, `${slug}-front-review.png`);
for (const p of [turnaround, delivered]) {
  if (!existsSync(p)) {
    console.error(`missing ${p} — run: npm run review:character-fidelity -- ${id}`);
    process.exit(2);
  }
}

// The turnaround is a multi-view sheet on a flat backdrop. Take the leftmost
// figure — the front view — by finding columns the backdrop does not own.
const sheet = await sharp(turnaround).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: SW, height: SH, channels: SC } = sheet.info;
const sheetAt = (x, y) => { const i = (y * SW + x) * SC; return [sheet.data[i], sheet.data[i + 1], sheet.data[i + 2]]; };
const backdrop = sheetAt(4, 4);
const isBg = (c) => Math.abs(c[0] - backdrop[0]) < 16 && Math.abs(c[1] - backdrop[1]) < 16 && Math.abs(c[2] - backdrop[2]) < 16;
const runs = [];
let start = null;
for (let x = 0; x < SW; x++) {
  let occupied = false;
  for (let y = 0; y < SH; y += 3) if (!isBg(sheetAt(x, y))) { occupied = true; break; }
  if (occupied && start === null) start = x;
  if ((!occupied || x === SW - 1) && start !== null) {
    if (x - start > 60) runs.push([start, x]);
    start = null;
  }
}
if (!runs.length) { console.error('could not find a figure in the turnaround'); process.exit(2); }
const [fx0, fx1] = runs[0];

const conceptFig = await loadFigure(turnaround, {
  backdrop,
  extract: { left: fx0, top: 0, width: fx1 - fx0 + 1, height: SH },
});
const deliveredFig = await loadFigure(delivered);

const c = metricsFor(conceptFig);
const d = metricsFor(deliveredFig);

console.log(`\nMeasured fidelity — ${slug}`);
console.log(`concept front view ${conceptFig.figW}x${conceptFig.figH}px   delivered ${deliveredFig.figW}x${deliveredFig.figH}px\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('metric', 42)}${pad('concept', 11)}${pad('delivered', 11)}${pad('delta', 10)}status`);
console.log('-'.repeat(84));

let failures = 0;
for (const [key, tol, label] of CHECKS) {
  const cv = c[key], dv = d[key];
  const delta = dv - cv;
  const ok = Math.abs(delta) <= tol;
  if (!ok) failures++;
  const fmt = (v) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1));
  console.log(
    `${pad(label, 42)}${pad(fmt(cv), 11)}${pad(fmt(dv), 11)}${pad((delta >= 0 ? '+' : '') + fmt(delta), 10)}${ok ? 'ok' : `OFF (tol ${tol})`}`,
  );
}
const asym = d.faceAsymmetryPct;
const asymOk = asym <= 4.0;
if (!asymOk) failures++;
console.log(`${pad('face left/right asymmetry', 42)}${pad('0.00', 11)}${pad(asym.toFixed(2), 11)}${pad('', 10)}${asymOk ? 'ok' : 'OFF (tol 4.0)'}`);

console.log('-'.repeat(84));
if (failures) {
  console.log(`\n${failures} metric${failures === 1 ? '' : 's'} outside tolerance.\n`);
  process.exit(1);
}
console.log('\nall measured metrics within tolerance of the concept.\n');
