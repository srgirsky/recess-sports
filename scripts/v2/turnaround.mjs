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

import { TONE_MEMBERSHIP, TONE_SEPARATION, lum, toneDistance } from './tone.mjs';

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
  // ★ TWO PARTS IS THE AMBIGUOUS CASE, and it has to be refused even when the
  // material is not a declared pair. Three same-material runs is
  // `flank | centre | flank` and answerable; one is the whole thing and
  // answerable; TWO is a torso with a sleeve merged into one side, or an arm
  // crossing the body, and the run through the centre column is then part
  // garment and part something else. Tank's sweep shows it as a step: 0.507 at
  // z 2.10 with three parts, 0.671 at z 2.16 with two — a discontinuity no
  // garment has, and exactly the shape of the failure this module exists for.
  if (role === 'centre' && mine.length === 2) {
    return { notTraceable: {
      class: 'ambiguous-parts',
      reason:
        `two runs of material ${material} at z ${z} (${mine.map((r) => `${r.x0}-${r.x1}`).join(' and ')}) — ` +
        'one flank has merged with the centre, so a centre width here is part garment and part something else',
      insteadUse: 'a height where the row crosses three runs of this material, or the profile view',
    } };
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

// ---------------------------------------------------------------------------
// ★ LANDMARKS, AND THE TWO THINGS THAT DEFEAT A NAIVE DETECTOR.
//
// A pixel detector for face features was written for `featurelatitude.lint` and
// thrown away, for reasons worth keeping:
//
//   · on a turnaround the DARKEST row in the lower face is often the NOSTRIL,
//     not the lip line — Tank's nostril reads luminance 20 against his mouth's
//     22 — so "darkest wins" reports the mouth ten points high;
//   · a fringe merges with the brow, so band-ordering that works on a bald kid
//     finds one band where there are three.
//
// Both have the same tell and it is not brightness: it is WIDTH RELATIVE TO THE
// FACE. A chin shadow spans ~90% of the head run at its row and a mouth ~22%; a
// fringe spans ~100%. So every landmark here carries `hostFrac`, and anything
// wider than half its host is refused rather than returned.
//
// These do NOT replace `featurelatitude.lint`'s arithmetic check. That gate asks
// the sculpt SOURCE where it put a feature and compares against a recorded
// target; these produce the target, once, offline, under review.
// ---------------------------------------------------------------------------

/**
 * Crown, neck pinch and ear line.
 *
 * The pinch is searched BELOW the head's widest row — searched from the crown it
 * finds the crown. `pinchFound` is false when the minimum lands on a window
 * edge, and a caller must treat that as a refusal rather than a measurement:
 * the same rule `measure-fidelity`'s `headBox` states, for the same reason.
 */
export function headSpan(f) {
  const wid = [];
  for (let y = f.y0; y <= f.y1; y++) {
    let l = null, r = null;
    for (let x = f.x0; x <= f.x1; x++) if (f.inFigure(x, y)) { if (l === null) l = x; r = x; }
    wid[y] = l === null ? 0 : r - l + 1;
  }
  let headWide = f.y0, hw = 0;
  for (let y = f.y0; y < Math.round(f.y0 + f.figH * 0.30); y++) if (wid[y] > hw) { hw = wid[y]; headWide = y; }
  const hi = Math.round(f.y0 + f.figH * 0.40);
  let neck = headWide, pw = Infinity;
  for (let y = headWide; y <= hi; y++) if (wid[y] < pw) { pw = wid[y]; neck = y; }
  let earY = f.y0, ew = 0;
  for (let y = Math.round(f.y0 + (neck - f.y0) * 0.15); y <= neck; y++) if (wid[y] > ew) { ew = wid[y]; earY = y; }
  const height = neck - f.y0;
  return {
    crown: f.y0, neck, height, widestRow: headWide,
    pinchFound: neck !== headWide && neck !== hi,
    earLinePct: (100 * (earY - f.y0)) / height,
    earWidthPx: ew,
    templeWidthPx: wid[Math.round(f.y0 + height * 0.30)] ?? 0,
  };
}

/** Dark bands down the centre of a face, each with the width tell. */
export function inkBandsIn(f, head, { dark = 100, minInk = 3 } = {}) {
  const cx = Math.round((f.x0 + f.x1) / 2);
  const strip = Math.round(head.earWidthPx * 0.34);
  const rows = [];
  for (let y = head.crown; y <= head.crown + Math.round(head.height * 0.97); y++) {
    const runs = []; let s = null; let hostW = 0;
    for (let x = cx - strip; x <= cx + strip; x++) {
      if (!f.inFigure(x, y)) { if (s !== null) { if (x - s >= 2) runs.push([s, x - 1]); s = null; } continue; }
      hostW++;
      if (lum(f.at(x, y)) < dark) { if (s === null) s = x; }
      else if (s !== null) { if (x - s >= 2) runs.push([s, x - 1]); s = null; }
    }
    if (s !== null) runs.push([s, cx + strip]);
    const ink = runs.reduce((a, r) => a + r[1] - r[0] + 1, 0);
    if (ink >= minInk) rows.push({ y, runs, ink, hostW, widest: Math.max(...runs.map((r) => r[1] - r[0] + 1)) });
  }
  const bands = []; let cur = null;
  for (const r of rows) {
    if (cur && r.y === cur.y1 + 1) {
      cur.y1 = r.y; cur.ink += r.ink; cur.wy += r.ink * r.y; cur.n++;
      cur.pairs += r.runs.length >= 2 ? 1 : 0;
      cur.hostFrac = Math.max(cur.hostFrac, r.widest / Math.max(1, r.hostW));
    } else {
      if (cur) bands.push(cur);
      cur = { y0: r.y, y1: r.y, ink: r.ink, wy: r.ink * r.y, n: 1, pairs: r.runs.length >= 2 ? 1 : 0, hostFrac: r.widest / Math.max(1, r.hostW) };
    }
  }
  if (cur) bands.push(cur);
  const pct = (y) => (100 * (y - head.crown)) / head.height;
  return bands.filter((b) => b.n >= 2).map((b) => ({
    fromPct: pct(b.y0), toPct: pct(b.y1), centroidPct: pct(b.wy / b.ink),
    paired: b.pairs / b.n > 0.6, hostFrac: b.hostFrac,
  }));
}

/**
 * The lip line, or a refusal.
 *
 * Narrowness is the discriminator, not darkness — see this section's header.
 * `maxHostFrac` is what rejects a chin shadow, and it is the only reason this
 * returns the mouth rather than the jaw.
 */
export function mouthIn(f, head, { below = 0.68, above = 0.95, maxHostFrac = 0.5 } = {}) {
  const cx = Math.round((f.x0 + f.x1) / 2);
  const strip = Math.round(head.earWidthPx * 0.22);
  let best = null, rejected = 0;
  for (let y = Math.round(head.crown + head.height * below); y <= Math.round(head.crown + head.height * above); y++) {
    let hostW = 0, darkest = 999, run = 0, widest = 0;
    for (let x = cx - strip; x <= cx + strip; x++) {
      if (!f.inFigure(x, y)) continue;
      hostW++;
      const L = lum(f.at(x, y));
      if (L < 100) { run++; widest = Math.max(widest, run); darkest = Math.min(darkest, L); } else run = 0;
    }
    if (!hostW || !widest) continue;
    if (widest / hostW > maxHostFrac) { rejected++; continue; }
    if (!best || darkest < best.darkest) best = { y, darkest, hostFrac: widest / hostW };
  }
  if (!best) {
    return { notTraceable: {
      class: 'merged-region',
      reason: `no dark run below ${(100 * below).toFixed(0)}% of head height is narrower than ` +
        `${maxHostFrac} of its own row — every candidate is as wide as the face, which is a shadow, not a mouth`,
    } };
  }
  return { pct: (100 * (best.y - head.crown)) / head.height, row: best.y, darkest: best.darkest, hostFrac: best.hostFrac, rejectedRows: rejected };
}

/**
 * A garment's colour bands by height, as fractions of the band window.
 *
 * The shoe's four bands were never traced at all — its navy quarter was authored
 * running to 0.64 of shoe height against the drawing's 0.41, and the tone-split
 * metric could not tell because it counts how MUCH of each tone is present and
 * never where it sits.
 */
export function bandBoundaries(f, pal, { x0, x1, top, ground, minShare = 0.4 } = {}) {
  const classify = classifier(pal);
  const height = ground - top;
  const rows = [];
  for (let y = top; y <= ground; y++) {
    const counts = new Map();
    let n = 0;
    for (let x = x0; x <= x1; x++) {
      if (!f.inFigure(x, y)) continue;
      const m = classify(f.at(x, y));
      if (m < 0) continue;
      counts.set(m, (counts.get(m) ?? 0) + 1); n++;
    }
    if (!n) continue;
    const [material, c] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    rows.push({ y, material, share: c / n, frac: (ground - y) / height });
  }
  const bands = [];
  for (const r of rows) {
    if (r.share < minShare) continue;
    const last = bands[bands.length - 1];
    if (last && last.material === r.material) { last.fromFrac = Math.min(last.fromFrac, r.frac); last.toFrac = Math.max(last.toFrac, r.frac); }
    else bands.push({ material: r.material, hex: pal[r.material].hex, fromFrac: r.frac, toFrac: r.frac });
  }
  return bands.filter((b) => b.toFrac - b.fromFrac > 0.02);
}
