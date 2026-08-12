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
// settles that in a second.
//
// So this file measures what a critic was being asked to judge. Every metric
// derives its TARGET from the concept turnaround at run time. A metric is
// reported as delivered-vs-concept with a tolerance, and the script exits
// non-zero when one is outside it — or when it could not be taken at all.
//
// ★ THE HEADER USED TO CLAIM IT "TRANSFERS TO THE OTHER 29 CHARACTERS
// UNCHANGED". IT DID NOT, AND NOTHING SAID SO.
//
// The claim was true of the TARGETS and false of the DETECTORS, and running it
// across the roster for the first time found three ways it reported numbers for
// characters it could not actually measure. All three passed silently, which is
// the property that makes them worth naming:
//
//   * ONE CORNER SAMPLE FOR THE BACKDROP. Seven of thirty sheets are vignetted
//     past the tolerance, so the "front view" was the whole 1658px collage and
//     the head was measured across three views at once. Now sampled per column.
//   * "ANY NON-BACKDROP PIXEL" AS OCCUPANCY. A drop shadow spanning the sheet
//     merged four figures into one run. Now a fraction of column height, and a
//     split that fails REFUSES instead of measuring the collage.
//   * A HARDCODED `isRed`/`isCream`. That is Junebug's shoe. On a kid whose
//     shoes are not red both counters read zero, both images agree at zero, and
//     the check passes having measured nothing. The two tones are now read off
//     the concept and applied to both images.
//
// And one that reported a constant as a measurement: the head/neck detector
// returns the narrowest run in a window, so on a kid with no neck it returns the
// WINDOW EDGE. Tank measured 15.2% head height against Junebug's 33.9% — the
// floor's own value. It reports NOT MEASURED now; see `headBox`.
//
// It is deliberately NOT a `*.test.*` file yet. Vitest's default globs would
// make it a CI gate over all thirty characters, and the twenty-four nobody has
// sculpted have no delivered render to compare against — they would go red for
// existing rather than for being wrong. Promote it when the roster is delivered,
// or when it can be scoped to the characters that have a board.
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

import { slugFor } from './character-registry.mjs';

const CONCEPTS = 'docs/v2/concepts';

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const sat = (c) => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx ? (mx - mn) / mx : 0; };

// ---------------------------------------------------------------------------
// ★ THE BACKDROP IS SAMPLED PER COLUMN, BECAUSE IT IS NOT FLAT.
//
// The original test compared every pixel against ONE corner sample at (4,4)
// with a +/-16 tolerance. That holds for the three pilot sheets and fails for
// seven of the thirty: Tank's backdrop runs 240,225,208 at the left edge and
// 251,239,226 across the middle — a vignette 18 units deep — so most of the
// sheet classified as FIGURE. The symptom is not an error. It is
// `measure:fidelity` reporting a "front view" 1658px wide (97% of the sheet),
// measuring a head across three collaged views, and printing eight numbers that
// look like measurements: head height 15.5% of figure, head aspect 5.00.
//
// The figures never touch the top edge of a turnaround, so each column's own
// first few rows ARE its backdrop. Sampling there removes the gradient exactly,
// rather than by widening a tolerance until the symptom goes away — which would
// also have swallowed real pale garments.
// ---------------------------------------------------------------------------
const BACKDROP_TOLERANCE = 16;

/** A per-column backdrop estimate: the median of each column's topmost rows. */
function backdropSampler(at, W, H) {
  const rows = Array.from({ length: Math.max(3, Math.min(7, Math.round(H * 0.01))) }, (_, i) => i + 1);
  const columns = new Array(W);
  for (let x = 0; x < W; x++) {
    const channel = (k) => {
      const values = rows.map((y) => at(x, y)[k]).sort((a, b) => a - b);
      return values[values.length >> 1];
    };
    columns[x] = [channel(0), channel(1), channel(2)];
  }
  return (x) => columns[Math.min(Math.max(x, 0), W - 1)];
}

const nearBackdrop = (c, bg) =>
  Math.abs(c[0] - bg[0]) < BACKDROP_TOLERANCE &&
  Math.abs(c[1] - bg[1]) < BACKDROP_TOLERANCE &&
  Math.abs(c[2] - bg[2]) < BACKDROP_TOLERANCE;

/** A figure: pixel accessor plus a membership test, so concept crops (keyed off
 *  the backdrop) and delivered renders (real alpha) measure identically. */
async function loadFigure(path, { keyBackdrop = false, extract = null } = {}) {
  let pipeline = sharp(path);
  if (extract) pipeline = pipeline.extract(extract);
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const at = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  // ⚠️ Keyed membership needs the pixel's COLUMN, so `inFigure` takes (c, x).
  // Passing only the colour is what forced one global backdrop in the first place.
  const bgAt = keyBackdrop ? backdropSampler(at, W, H) : null;
  const inFigure = keyBackdrop
    ? (c, x) => !nearBackdrop(c, bgAt(x))
    : (c) => c[3] > 128;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inFigure(at(x, y), x)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const rowSpan = (y) => {
    let a = -1, b = -1;
    for (let x = x0; x <= x1; x++) if (inFigure(at(x, y), x)) { if (a < 0) a = x; b = x; }
    return a < 0 ? null : [a, b];
  };
  /** The contiguous figure run on row `y` that contains column `xc` — the way to
   *  follow one body part down a silhouette without arms joining the span. */
  const rowRunContaining = (y, xc) => {
    if (y < y0 || y > y1) return null;
    const xs = Math.min(Math.max(xc, x0), x1);
    if (!inFigure(at(xs, y), xs)) return null;
    let a = xc, b = xc;
    while (a > x0 && inFigure(at(a - 1, y), a - 1)) a--;
    while (b < x1 && inFigure(at(b + 1, y), b + 1)) b++;
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
  //
  // ★ AND IF THERE IS NO PINCH, THE ANSWER IS THE WINDOW EDGE, NOT THE NECK.
  //
  // "The narrowest run in a window" always returns something. On a kid with no
  // neck to speak of the silhouette narrows monotonically from crown to
  // shoulders, so the minimum lands ON the window floor and the head is reported
  // as exactly 15% of figure height — the floor's own value, dressed as a
  // measurement. Tank (`neck: -4`, the most sunken in the roster) measured 15.2%
  // against Junebug's 33.9%, and the sculpt would have been asked to shrink a
  // head that was not too big.
  //
  // A boundary hit means the detector failed, so it says so and the caller
  // refuses to report a number rather than publishing the window's edge.
  const lo = Math.round(0.15 * f.figH);
  const hi = Math.min(widths.length - 1, Math.round(0.45 * f.figH));
  let neck = lo;
  for (let i = lo; i <= hi; i++) if (widths[i] > 0 && widths[i] < widths[neck]) neck = i;
  const pinchFound = neck !== lo && neck !== hi;
  const top = f.y0;
  const bottom = f.y0 + neck;
  let widest = 0;
  for (let i = 0; i <= neck; i++) if (widths[i] > widest) widest = widths[i];
  return { top, bottom, width: widest, height: bottom - top + 1, centerX, pinchFound };
}

// Warm, saturated and light: the skin of every character in this roster reads
// r > g > b with real saturation, which separates it from both hair and cream.
const isSkin = (c) => c[0] > c[1] + 12 && c[1] >= c[2] && sat(c) > 0.22 && lum(c) > 80;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Walk the figure pixels of a horizontal band given as fractions of figure height. */
function eachBandPixel(f, fromFrac, toFrac, visit) {
  const ya = Math.round(f.y1 - toFrac * f.figH);
  const yb = Math.round(f.y1 - fromFrac * f.figH);
  for (let y = Math.max(ya, f.y0); y <= Math.min(yb, f.y1); y++) {
    for (let x = f.x0; x <= f.x1; x++) {
      const c = f.at(x, y);
      if (f.inFigure(c, x)) visit(c);
    }
  }
}

// Two colours are "different garment tones" past this much RGB distance. Junebug's
// shoe runs red (~186,63,58) against cream (~253,250,240), which is 265 apart, so
// 60 separates real two-tone construction while refusing to split one tone's own
// shading into two.
const TONE_SEPARATION = 60;
// Past this, a pixel belongs to neither declared tone — a sock, a shadow, skin.
// The old rule-based classifier abstained the same way by simply matching neither.
const TONE_MEMBERSHIP = 90;

/**
 * ★ THE TWO TONES ARE DERIVED FROM THE CONCEPT, NOT NAMED IN THIS FILE.
 *
 * This metric used to ask two hardcoded questions — `isRed` and `isCream` — and
 * that was Junebug's shoe written into a tool that claims in its own header to
 * "transfer to the other 29 characters unchanged". It does not: Tank's shoe is
 * not red, so both counters read near zero for him, both images agree at near
 * zero, and the check passes while measuring nothing. A metric that cannot fail
 * is the same as no metric, which is the failure this whole file exists to stop.
 *
 * So the band's dominant tone and its most distinct companion are read off the
 * CONCEPT at run time, and then BOTH images are classified against those same
 * two centroids. Junebug's red/cream falls out of that rather than being named,
 * and a kid in blue-and-white gets the check the rubric's 6b.2 actually promises.
 *
 * Deriving them per image instead would be the tempting mistake: the two images
 * could then pick different colours and the comparison would silently compare
 * nothing.
 */
function bandPalette(f, fromFrac, toFrac) {
  const bins = new Map();
  eachBandPixel(f, fromFrac, toFrac, (c) => {
    const key = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n++; bin.r += c[0]; bin.g += c[1]; bin.b += c[2];
    bins.set(key, bin);
  });
  const ranked = [...bins.values()]
    .sort((a, b) => b.n - a.n)
    .map((bin) => [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n]);
  if (!ranked.length) return null;
  const primary = ranked[0];
  const secondary = ranked.find((c) => dist(c, primary) > TONE_SEPARATION) ?? null;
  return { primary, secondary };
}

/** The share of a band belonging to each of the concept's two declared tones. */
function bandSplit(f, fromFrac, toFrac, palette) {
  if (!palette) return { primary: 0, secondary: 0 };
  let primary = 0, secondary = 0, total = 0;
  eachBandPixel(f, fromFrac, toFrac, (c) => {
    total++;
    const dp = dist(c, palette.primary);
    const ds = palette.secondary ? dist(c, palette.secondary) : Infinity;
    if (Math.min(dp, ds) > TONE_MEMBERSHIP) return;
    if (dp <= ds) primary++; else secondary++;
  });
  return total ? { primary: (100 * primary) / total, secondary: (100 * secondary) / total } : { primary: 0, secondary: 0 };
}

const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

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
    if (f.inFigure(f.at(x, y), x)) { run = 0; continue; }
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

function metricsFor(f, palette) {
  const head = headBox(f);
  const shoes = bandSplit(f, 0, 0.09, palette);
  const face = faceSkin(f, head);
  return {
    // null, never a boundary artifact — see `headBox`'s pinch note.
    headHeightPct: head.pinchFound ? (100 * head.height) / f.figH : null,
    headAspect: head.pinchFound ? head.width / head.height : null,
    shoePrimaryPct: shoes.primary,
    shoeSecondaryPct: shoes.secondary,
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
  ['shoePrimaryPct', 8.0, "the shoe band's dominant tone, % of the band"],
  ['shoeSecondaryPct', 8.0, "the shoe band's second tone, % of the band"],
  ['ankleDaylightPct', 12.0, 'daylight between the ankles'],
  ['faceSkinLeftPct', 6.0, 'visible face left of centre, % of head width'],
  ['faceSkinRightPct', 6.0, 'visible face right of centre, % of head width'],
];

// ⚠️ NOT `SLUGS[id] ?? id`. That fallback is how six characters silently
// resolved to turnarounds that do not exist and reported it as a missing render.
// `slugFor` throws on an unknown id instead of inventing a path for it.
const id = process.argv[2] ?? 'nostrike';
const slug = slugFor(id);
const turnaround = join(CONCEPTS, `${slug}-turnaround.png`);
const delivered = join(CONCEPTS, `${slug}-front-review.png`);
for (const p of [turnaround, delivered]) {
  if (!existsSync(p)) {
    console.error(`missing ${p} — run: npm run review:character-fidelity -- ${id}`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// ★ A COLUMN IS OCCUPIED WHEN IT HOLDS A FIGURE, NOT WHEN IT HOLDS A PIXEL.
//
// The turnaround is a multi-view sheet; the leftmost figure is the front view.
// Splitting it used to ask whether ANY sampled pixel in a column was
// non-backdrop, which is true of a column carrying only a drop shadow, a ground
// line or a caption — so Bubbles' four figures merged into one 1532px run on a
// backdrop that is genuinely flat. A figure fills a large share of a column; the
// thin furniture between figures does not, and the threshold separates them
// without caring what the furniture is.
//
// Two failures, one symptom, and neither announced itself: with the vignette
// (see the backdrop sampler above) and this, seven of the thirty sheets
// reported the whole collage as one figure. The guard below is the important
// half — a split that fails must now REFUSE, because the old code went on to
// print a full table of measurements taken across three views at once.
// ---------------------------------------------------------------------------
const COLUMN_OCCUPANCY = 0.06; // of sheet height
const MIN_FIGURE_WIDTH = 60; // px
const MAX_FIGURE_SHARE = 0.6; // of sheet width — past this the split did not happen

const sheet = await sharp(turnaround).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: SW, height: SH, channels: SC } = sheet.info;
const sheetAt = (x, y) => { const i = (y * SW + x) * SC; return [sheet.data[i], sheet.data[i + 1], sheet.data[i + 2]]; };
const sheetBg = backdropSampler(sheetAt, SW, SH);
const runs = [];
let start = null;
for (let x = 0; x < SW; x++) {
  let hits = 0, sampled = 0;
  for (let y = 0; y < SH; y += 3) { sampled++; if (!nearBackdrop(sheetAt(x, y), sheetBg(x))) hits++; }
  const occupied = hits / sampled > COLUMN_OCCUPANCY;
  if (occupied && start === null) start = x;
  if ((!occupied || x === SW - 1) && start !== null) {
    if (x - start > MIN_FIGURE_WIDTH) runs.push([start, x]);
    start = null;
  }
}
if (!runs.length) {
  console.error(`could not find a figure in ${turnaround}`);
  process.exit(2);
}
const [fx0, fx1] = runs[0];
if (fx1 - fx0 > MAX_FIGURE_SHARE * SW) {
  console.error(
    `could not separate the front view in ${turnaround}: the leftmost run is ` +
    `${fx1 - fx0}px of a ${SW}px sheet (${Math.round((100 * (fx1 - fx0)) / SW)}%), so the views are not ` +
    'split. Every metric below would be measured across the whole collage.\n' +
    'Fix the turnaround (clear backdrop between views) rather than the tolerance.',
  );
  process.exit(2);
}

const conceptFig = await loadFigure(turnaround, {
  keyBackdrop: true,
  extract: { left: fx0, top: 0, width: fx1 - fx0 + 1, height: SH },
});
const deliveredFig = await loadFigure(delivered);

// The concept declares the tones; both images are then measured against them.
const shoePalette = bandPalette(conceptFig, 0, 0.09);
const c = metricsFor(conceptFig, shoePalette);
const d = metricsFor(deliveredFig, shoePalette);

console.log(`\nMeasured fidelity — ${slug}`);
console.log(`concept front view ${conceptFig.figW}x${conceptFig.figH}px   delivered ${deliveredFig.figW}x${deliveredFig.figH}px`);
console.log(
  shoePalette?.secondary
    ? `shoe tones read off the concept: ${hex(shoePalette.primary)} and ${hex(shoePalette.secondary)}\n`
    : `shoe tone read off the concept: ${shoePalette ? hex(shoePalette.primary) : 'none'} (single-tone shoe)\n`,
);
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('metric', 42)}${pad('concept', 11)}${pad('delivered', 11)}${pad('delta', 10)}status`);
console.log('-'.repeat(84));

let failures = 0;
let unmeasured = 0;
for (const [key, tol, label] of CHECKS) {
  const cv = c[key], dv = d[key];
  const fmt = (v) => (v === null ? '—' : Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1));
  // A metric the detector could not take is NOT a pass. Reporting it as one is
  // how a window edge became a head measurement for a kid with no neck.
  if (cv === null || dv === null) {
    unmeasured++;
    console.log(`${pad(label, 42)}${pad(fmt(cv), 11)}${pad(fmt(dv), 11)}${pad('', 10)}NOT MEASURED (no neck pinch)`);
    continue;
  }
  const delta = dv - cv;
  const ok = Math.abs(delta) <= tol;
  if (!ok) failures++;
  console.log(
    `${pad(label, 42)}${pad(fmt(cv), 11)}${pad(fmt(dv), 11)}${pad((delta >= 0 ? '+' : '') + fmt(delta), 10)}${ok ? 'ok' : `OFF (tol ${tol})`}`,
  );
}
const asym = d.faceAsymmetryPct;
const asymOk = asym <= 4.0;
if (!asymOk) failures++;
console.log(`${pad('face left/right asymmetry', 42)}${pad('0.00', 11)}${pad(asym.toFixed(2), 11)}${pad('', 10)}${asymOk ? 'ok' : 'OFF (tol 4.0)'}`);

console.log('-'.repeat(84));
if (unmeasured) {
  console.log(
    `\n${unmeasured} metric${unmeasured === 1 ? '' : 's'} could not be taken: the head/neck detector found no ` +
    'silhouette pinch between crown and shoulders.\nThat is a fact about the drawing, not a pass — ' +
    'read it as "this kid has no neck to measure from" and score §3 without it.',
  );
}
if (failures || unmeasured) {
  if (failures) console.log(`\n${failures} metric${failures === 1 ? '' : 's'} outside tolerance.`);
  console.log('');
  process.exit(1);
}
console.log('\nall measured metrics within tolerance of the concept.\n');
