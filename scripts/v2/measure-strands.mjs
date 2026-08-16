// ---------------------------------------------------------------------------
// ★ "HAIR MASS" WAS THE ONE RUBRIC CATEGORY WITH NO RULER, AND FOURTEEN KIDS
// WERE PARKED AT 4 BECAUSE OF IT.
//
// Rubric 3.3's five is "sculpted strand grouping — a smooth featureless blob
// caps at 4 however correct its silhouette". Every critic who has scored it
// reached for the same words and none of them could say by how much, which is
// exactly the swing `measure:fidelity`'s header records for the other
// categories: the same board drew 4,4,4,4,4,3 from one reviewer and 3,4,3,3,3,3
// from the next.
//
// So this measures what they were being asked to judge. It contrast-stretches
// each row of the hair mass, counts LOCAL MINIMA along it — the creases between
// strand groups — and reports their prominence, on the concept sheet and the
// delivered board, with the same detector.
//
// ★ FIRST ROSTER SWEEP, 2026-08-16, and it says one thing very clearly. All
// fourteen hair kids under-carry strand COUNT while their prominence is fine or
// well over: penny 2%, mimi_mash 3%, lefty 8%, grizz 10%, rocket 15%, gizmo
// 19%, ace_kid 20%, bend_it 23%, flash 26%, the_prof 30%, cricket 34%, zippy
// 48%, diva 49%, smokey 57% of the concept's count — at 70-318% of its
// prominence. The creases that exist are deep enough; there are not enough of
// them. That is Junebug's round-7 finding ("the contrast has to come from a
// sharper crease profile or more columns, not more depth") confirmed across the
// roster instead of inferred from one bun.
//
// ★ THE CAUSE IS NYQUIST, AND IT IS IN EVERY HAIR BUILDER. Grizz's afro asks
// for six lobes across twenty-four columns — four samples per lobe — and
// delivers 1.56 minima per row. A ring cannot express a crease it has no
// columns for, so authoring more lobes into the same ring buys nothing:
// measured, twelve lobes at 24 columns moved him 10% -> 12%, eight lobes with a
// sharpened crease profile 10% -> 14%.
//
// ★ AND MORE COLUMNS IS BUDGET-BLOCKED, WHICH IS THE REAL FINDING. Grizz ships
// at 6800 of 7000 LOD0 triangles and 391 of 400KB; 24 -> 32 columns refuses the
// export on BOTH limits at once (7104 triangles, 400KB). Strands are VERTICAL
// grooves, so his afro's rows can be traded for columns at constant cost —
// 14 rows x 32 columns is 896 triangles against 19 x 24's 912. Measured, that
// trade exports 6KB SMALLER, leaves every `measure:fidelity` metric unmoved,
// and takes him 10% -> 15%.
//
// ⚠️ AND 15% IS WHERE THE NUMBER STOPS BEING THE TARGET. Look at the two crops
// before optimising any further: the concept afro is PHOTOGRAPHIC curl texture,
// hundreds of individual curls, and its 15.89 minima per row are not a thing a
// toon mesh should reproduce or a player would want. What the drawing actually
// reads as at game scale is a SCALLOPED SILHOUETTE EDGE over a near-hemisphere
// crown; what ships is a smooth dome with a pointed, faceted apex (the cap
// vertex sits 0.03 above a 0.06-radius top ring, which is a cone point, and it
// is the "afro crown runs flatter than the turnaround's" polish finding seen
// from the other side).
//
// So use this as a RELATIVE instrument — did this build carry more grouping
// than the last one — and settle "is the hair right" on the silhouette and the
// eye. A ratio chased to parity here would sculpt a wig out of noise.
// ---------------------------------------------------------------------------
//
//   npm run measure:strands -- <id> [bandLo] [bandHi]
//
// The band is the fraction of head height to sample, crown downward; it
// defaults to 0.05-0.45, which is the hair mass on most of the roster. A kid
// whose hair hangs low (pigtails, a ponytail) wants a taller band.
import sharp from 'sharp';
import { loadSheet, views, figure, headSpan } from './turnaround.mjs';
import { slugFor } from './character-registry.mjs';
import { RECIPES } from './turnaround-recipes.mjs';

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Per-row minima count and mean prominence over a band of the hair mass. */
function strandStats(rows) {
  let totalMin = 0, promSum = 0, promN = 0, counted = 0;
  const perRow = [];
  for (const vals of rows) {
    if (vals.length < 12) continue;
    // contrast stretch this row to 0..255 (the "6x" of the original note, but
    // normalised so a dark afro and a pale bun are measured on one scale)
    const lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 3) { perRow.push(0); counted++; continue; }
    const s = vals.map((v) => ((v - lo) / (hi - lo)) * 255);
    // smooth by 3 to kill single-pixel noise
    const sm = s.map((_, i) => (s[Math.max(0, i - 1)] + s[i] + s[Math.min(s.length - 1, i + 1)]) / 3);
    let mins = 0;
    for (let i = 2; i < sm.length - 2; i++) {
      if (sm[i] < sm[i - 1] && sm[i] < sm[i + 1] && sm[i] <= sm[i - 2] && sm[i] <= sm[i + 2]) {
        // prominence: rise to the higher of the two flanking local maxima
        let l = i, r = i;
        while (l > 0 && sm[l - 1] >= sm[l]) l--;
        while (r < sm.length - 1 && sm[r + 1] >= sm[r]) r++;
        const prom = Math.min(sm[l] - sm[i], sm[r] - sm[i]);
        if (prom >= 6) { mins++; promSum += prom; promN++; }
      }
    }
    perRow.push(mins);
    totalMin += mins;
    counted++;
  }
  return {
    rows: counted,
    minPerRow: counted ? totalMin / counted : 0,
    meanProminence: promN ? promSum / promN : 0,
    histogram: perRow,
  };
}

async function conceptRows(id, band) {
  const slug = slugFor(id);
  const recipe = RECIPES[id];
  const sheet = await loadSheet(`docs/v2/concepts/${slug}-turnaround.png`);
  const figures = views(sheet).map((_, i) => figure(sheet, i));
  const f = figures[recipe.views.indexOf('front')];
  const head = headSpan(f);
  const rows = [];
  for (let y = Math.round(head.crown + head.height * band[0]); y <= Math.round(head.crown + head.height * band[1]); y++) {
    const vals = [];
    for (let x = f.x0; x <= f.x1; x++) if (f.inFigure(x, y)) vals.push(lum(...f.at(x, y)));
    rows.push(vals);
  }
  return { rows, label: `${slug}-turnaround.png head ${head.crown}-${head.neck}` };
}

async function deliveredRows(slug, band) {
  const src = `docs/v2/concepts/${slug}-front-review.png`;
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const A = (x, y) => data[(y * W + x) * 4 + 3];
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y) > 128) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const figH = y1 - y0 + 1;
  const wid = [];
  for (let y = y0; y <= y1; y++) { let l = null, r = null; for (let x = x0; x <= x1; x++) if (A(x, y) > 128) { if (l === null) l = x; r = x; } wid[y] = l === null ? 0 : r - l + 1; }
  let headWide = y0, hw = 0;
  for (let y = y0; y < Math.round(y0 + figH * 0.30); y++) if (wid[y] > hw) { hw = wid[y]; headWide = y; }
  const hi = Math.round(y0 + figH * 0.40);
  let neck = headWide, pw = Infinity;
  for (let y = headWide; y <= hi; y++) if (wid[y] < pw) { pw = wid[y]; neck = y; }
  const headPx = neck - y0;
  const rows = [];
  for (let y = Math.round(y0 + headPx * band[0]); y <= Math.round(y0 + headPx * band[1]); y++) {
    const vals = [];
    for (let x = x0; x <= x1; x++) if (A(x, y) > 128) vals.push(lum(...px(x, y)));
    rows.push(vals);
  }
  return { rows, label: `${slug}-front-review.png head ${y0}-${neck}` };
}

const id = process.argv[2];
const band = [Number(process.argv[3] ?? 0.05), Number(process.argv[4] ?? 0.45)];
const slug = slugFor(id);
const c = await conceptRows(id, band);
const d = await deliveredRows(slug, band);
const cs = strandStats(c.rows), ds = strandStats(d.rows);
console.log(`\n${id} (${slug})  hair band ${(band[0] * 100).toFixed(0)}-${(band[1] * 100).toFixed(0)}% of head height`);
console.log(`  concept   ${c.label}`);
console.log(`            ${cs.minPerRow.toFixed(2)} strand minima/row, mean prominence ${cs.meanProminence.toFixed(1)} (${cs.rows} rows)`);
console.log(`  delivered ${d.label}`);
console.log(`            ${ds.minPerRow.toFixed(2)} strand minima/row, mean prominence ${ds.meanProminence.toFixed(1)} (${ds.rows} rows)`);
const ratio = cs.minPerRow ? ds.minPerRow / cs.minPerRow : 0;
console.log(`  => delivered carries ${(ratio * 100).toFixed(0)}% of the concept's strand count, ` +
  `${cs.meanProminence ? (ds.meanProminence / cs.meanProminence * 100).toFixed(0) : 0}% of its prominence`);
