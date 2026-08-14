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

// ---------------------------------------------------------------------------
// ★ RUN IDENTITY — WHICH OBJECT IS THIS RUN?
//
// `segmentsAt` answers "how many pieces of figure does this row cross" and
// stops there, and every expensive failure on this project has been the caller
// guessing the rest. Four of them, all the same shape — a quantity read down a
// line that passes through more than one object:
//
//   · the torso measured across `sleeve | torso | sleeve` as one span: half
//     0.910 authored where the torso alone is 0.532, and the maintainer's words
//     for the result were "the corners of the T-shirt ended up on his stomach";
//   · the shoe measured across two overlapping feet in the profile view —
//     1.211ft for a foot that is 0.86;
//   · the mouth measured on the chin shadow, which put the atlas's mouth at
//     97.3% of head height;
//   · the shoe's colour bands never traced at all.
//
// `torsoTraceable` below is the right idea and it stops one step short: it
// counts runs. Counting is not naming. These functions name them, by asking
// which MATERIAL each run is made of, so "the torso run" is a lookup rather
// than a guess and `sleeve | torso | sleeve` stops being three anonymous spans.
//
// ★ AND THE POINT IS THE REFUSAL, NOT THE NUMBER. Every one of those failures
// would have been prevented by returning nothing. So these return
// `{ notTraceable: { class, reason } }` rather than a plausible number whenever
// the row cannot be attributed to one object — and `not-traceable` is a
// first-class answer the sculpt scripts already know how to record.
// ---------------------------------------------------------------------------

import { TONE_MEMBERSHIP, TONE_SEPARATION, toneDistance } from './tone.mjs';

/** Figure pixels are binned coarsely, then merged in tone space. */
const PALETTE_BITS = 5;

/**
 * The materials a figure is painted in, largest area first.
 *
 * Deliberately unsupervised: a hardcoded `isShirt` is one character's wardrobe
 * written into a shared tool, which is the mistake `measure-fidelity`'s own
 * header records making with `isRed`/`isCream`. Bins are merged with
 * `toneDistance`, so a garment and its own shading stay ONE material while two
 * genuinely different garments stay two — that separation is what
 * `TONE_SEPARATION` is for and it is not re-derived here.
 */
export function palette(f, { max = 8 } = {}) {
  const shift = 8 - PALETTE_BITS;
  const bins = new Map();
  for (let y = f.y0; y <= f.y1; y++) {
    for (let x = f.x0; x <= f.x1; x++) {
      if (!f.inFigure(x, y)) continue;
      const c = f.at(x, y);
      const key = ((c[0] >> shift) << (PALETTE_BITS * 2)) | ((c[1] >> shift) << PALETTE_BITS) | (c[2] >> shift);
      const bin = bins.get(key) ?? [0, 0, 0, 0];
      bin[0] += c[0]; bin[1] += c[1]; bin[2] += c[2]; bin[3]++;
      bins.set(key, bin);
    }
  }
  const ranked = [...bins.values()]
    .map((b) => ({ rgb: [b[0] / b[3], b[1] / b[3], b[2] / b[3]].map(Math.round), n: b[3] }))
    .sort((a, b) => b.n - a.n);
  const total = ranked.reduce((s, r) => s + r.n, 0) || 1;
  const kept = [];
  for (const r of ranked) {
    const near = kept.find((k) => toneDistance(k.rgb, r.rgb) <= TONE_SEPARATION);
    if (near) { near.n += r.n; continue; }
    if (kept.length < max) kept.push({ rgb: r.rgb, n: r.n });
  }
  return kept
    .sort((a, b) => b.n - a.n)
    .map((k) => ({ rgb: k.rgb, hex: '#' + k.rgb.map((v) => v.toString(16).padStart(2, '0')).join(''), sharePct: (100 * k.n) / total }));
}

/**
 * Pixel -> material index, or -1.
 *
 * ⚠️ NEVER "NEAREST WINS". A pixel further than `TONE_MEMBERSHIP` from every
 * material abstains, exactly as `bandSplit` abstains, because a rule that
 * always answers cannot report that it does not know — and not knowing is the
 * outcome this whole module exists to be able to express.
 */
export function classifier(pal) {
  return (rgb) => {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const d = toneDistance(pal[i].rgb, rgb);
      if (d < bestD) { bestD = d; best = i; }
    }
    return bestD > TONE_MEMBERSHIP ? -1 : best;
  };
}

/**
 * The runs at a height, each named by the material it is made of.
 *
 * Runs of the SAME material separated by a gap thinner than `seamPx` are kept
 * apart and the gap is reported, because that gap is the shadow between a
 * sleeve and the body it lies on — Tank's is one to two pixels wide, and
 * merging it is precisely how the sleeves ended up measured into his stomach.
 */
export function regionRunsAt(f, pal, z, { minPx = 3 } = {}) {
  const y = rowAt(f, z);
  const classify = classifier(pal);
  const runs = [];
  let cur = null;
  for (let x = f.x0; x <= f.x1; x++) {
    const inside = f.inFigure(x, y);
    const m = inside ? classify(f.at(x, y)) : -2;
    if (cur && cur.material === m) { cur.x1 = x; continue; }
    if (cur && cur.x1 - cur.x0 + 1 >= minPx && cur.material !== -2) runs.push(cur);
    cur = m === -2 ? null : { x0: x, x1: x, material: m };
  }
  if (cur && cur.x1 - cur.x0 + 1 >= minPx && cur.material !== -2) runs.push(cur);

  const centre = Math.round((f.x0 + f.x1) / 2);
  return runs.map((r, i) => ({
    ...r,
    widthFt: (r.x1 - r.x0 + 1) * f.ftPerPx,
    hex: r.material >= 0 ? pal[r.material].hex : null,
    role: r.x0 <= centre && centre <= r.x1 ? 'centre' : r.x1 < centre ? 'flankLeft' : 'flankRight',
    seamLeftPx: i > 0 ? r.x0 - runs[i - 1].x1 - 1 : null,
    seamRightPx: i < runs.length - 1 ? runs[i + 1].x0 - r.x1 - 1 : null,
  }));
}

/**
 * One named run, or a refusal that says why.
 *
 * `parts` is the discriminator the four failures all needed: three parts of one
 * material is `flank | centre | flank` and is answerable; one part is the whole
 * thing and is answerable; TWO is ambiguous — an arm crossing the body, or two
 * feet — and answering it is how 1.211ft of "foot" was authored.
 */
export function namedRunAt(f, pal, z, { material, role = 'centre', paired = false, minPx = 3 } = {}) {
  const runs = regionRunsAt(f, pal, z, { minPx });
  if (!runs.length) return { notTraceable: { class: 'no-view', reason: `z ${z} is off the figure` } };
  const abstained = runs.filter((r) => r.material === -1);
  const mine = runs.filter((r) => r.material === material);
  if (!mine.length) {
    return { notTraceable: {
      class: 'no-such-material',
      reason: `material ${material} is not present at z ${z}; the row is ${runs.map((r) => r.hex ?? 'abstain').join(' | ')}`,
    } };
  }
  // ★ A PAIR IS DECLARED, NOT COUNTED, and that distinction is the shoe bug.
  //
  // Counting runs looks like it should work and does not: at Tank's shoe height
  // the cream is SEVEN runs, because each shoe is cream|navy|cream across its
  // own width, and the run that contains the centre column spans the inner edge
  // of BOTH feet — which is precisely the span that was authored as 1.211ft of
  // foot. No count distinguishes that from a torso.
  //
  // So the caller declares the part paired (a recipe knows a kid has two feet;
  // pixels do not), and any run crossing the centreline is then refused rather
  // than returned. `insteadUse` names the reading that IS available, because a
  // refusal with no alternative just moves the guess somewhere else.
  if (paired) {
    const centreX = Math.round((f.x0 + f.x1) / 2);
    const straddles = mine.find((r) => r.x0 <= centreX && centreX <= r.x1);
    if (straddles) {
      return { notTraceable: {
        class: 'paired-part',
        reason:
          `material ${material} is declared paired, and the run at z ${z} spanning ` +
          `${straddles.x0}-${straddles.x1} crosses the centreline at ${centreX} — it is both ` +
          'of them read as one, which is how a foot came to measure 1.211ft',
        insteadUse: 'one side: take the widest run wholly left or right of the centreline',
      } };
    }
  }
  const pick = mine.find((r) => r.role === role) ?? (mine.length === 1 ? mine[0] : null);
  if (!pick) {
    return { notTraceable: {
      class: 'ambiguous-parts',
      reason: `${mine.length} runs of material ${material} at z ${z} and none is the ${role} one`,
    } };
  }
  return {
    value: pick.widthFt / 2,
    widthFt: pick.widthFt,
    px: { row: rowAt(f, z), x0: pick.x0, x1: pick.x1, seamLeftPx: pick.seamLeftPx, seamRightPx: pick.seamRightPx },
    parts: mine.length,
    abstainedRuns: abstained.length,
  };
}
