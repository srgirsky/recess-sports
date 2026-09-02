// ---------------------------------------------------------------------------
// node scripts/v2/hairline-scan.mjs <id> [<id> ...]
//
// WHERE THE RENDERED HAIRLINE ACTUALLY FALLS — a scan, not a lint.
//
// Sprout's brows were moved down the atlas under the fringe's AUTHORED arc
// and still did not render (#204): a critic's column scan found the fringe's
// RENDERED edge on the iris tops, ~0.3 ft below the arc, because the rows
// above the arc stand proud of the face and the board camera looks down on
// them. The arithmetic (brow z vs fringe z) says "clear"; the pixels say
// hidden. This reads the pixels.
//
// For each kid: on `<slug>-front-review.png` and each `-runtime-face-*.png`,
// find the largest skin component (the face), then for every column across
// its middle 60% take the head's top (first non-background row), the FIRST
// skin row — the hairline — and the first ink run within 30% of head height
// below it (a brow, if one shows). Reports the hairline as a fraction of the
// HEAD height, how many columns carry ink under the hairline, and the same
// numbers off the concept's front figure. Boards only: the runtime stills
// sit on the field and the head box is not readable there. A hairline that sits lower than the sheet's by more than the
// eye's own height is what "no brows render" looks like in numbers.
//
// Deliberately a scan: skin classification is a heuristic (isSkin in
// tone.mjs), sheets vary in framing, and a fringe DRAWN to the brows is
// correct. Read it, then decide; do not gate on it. Two caveats critics have
// already filed: the "ink below the hairline" line compares whatever dark
// mark comes first (a sheet's swept bang against a board's brow), so only
// the hairline percentage is worth reading; and the head band is bounded at
// the chin by a width rule that a kid with no drawn neck can miss — when
// the sheet and board numbers disagree by more than the eye's own height,
// crop and look before touching a fringe table.
// ---------------------------------------------------------------------------
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { isSkin } from './tone.mjs';

const DIR = 'docs/v2/concepts';
const ids = process.argv.slice(2);
if (!ids.length) { console.error('usage: node scripts/v2/hairline-scan.mjs <id> ...'); process.exit(2); }

const slugOf = (id) => ({ the_prof: 'the-professor', mimi_mash: 'mimi-mash', big_lou: 'big-lou', bend_it: 'bendy-bao', wheelchair_ace: 'zoom', diva: 'dazzle', calls_shot: 'calls-shot', ace_kid: 'ace' }[id] ?? id);

async function load(path) {
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  return { W, H, px: (x, y) => [data[(y * W + x) * C], data[(y * W + x) * C + 1], data[(y * W + x) * C + 2]] };
}

/** Largest 4-connected skin component; returns its bbox and a membership test. */
function faceComponent(img, x0 = 0, x1 = img.W) {
  const { W, H, px } = img;
  const lab = new Int32Array(W * H).fill(-1);
  let next = 0; const sizes = []; const boxes = [];
  for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) {
    const i = y * W + x; if (lab[i] !== -1 || !isSkin(px(x, y))) continue;
    const q = [i]; lab[i] = next; let sz = 0; const box = [x, x, y, y];
    while (q.length) {
      const j = q.pop(); sz++; const jx = j % W, jy = (j / W) | 0;
      box[0] = Math.min(box[0], jx); box[1] = Math.max(box[1], jx); box[2] = Math.min(box[2], jy); box[3] = Math.max(box[3], jy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = jx + dx, ny = jy + dy; if (nx < x0 || ny < 0 || nx >= x1 || ny >= H) continue;
        const k = ny * W + nx; if (lab[k] !== -1 || !isSkin(px(nx, ny))) continue; lab[k] = next; q.push(k);
      }
    }
    sizes.push(sz); boxes.push(box); next++;
  }
  if (!next) return null;
  const main = sizes.indexOf(Math.max(...sizes));
  return { box: boxes[main], is: (x, y) => lab[y * W + x] === main };
}

/** Non-background test against the image's top-left corner tone. */
function bgTest(img) {
  const [r0, g0, b0] = img.px(0, 0);
  return (x, y) => { const [r, g, b] = img.px(x, y); return Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0) > 60; };
}

/**
 * Per column across the face's middle 60%: the head's top (first non-
 * background row), the hairline (first face-skin row), and the first ink
 * run below the hairline. All as fractions of the HEAD height (head top to
 * face bottom), which is the sheet's own frame for "where the fringe stops".
 */
function scan(img, face) {
  const [bx0, bx1, by0, byBlob] = face.box; const nonBg = bgTest(img);
  // ★ THE HEAD ENDS AT THE CHIN, NOT WHERE THE SKIN ENDS. On a sheet the skin
  // blob runs down the neck to the collar; on a board with no neck pinch it
  // stops at the chin — and "46.7% of one" against "49.0% of the other" was
  // not the same rung (Turbo's critic, 2026-09-02). The chin is the first row
  // below the widest face row where the skin narrows to under 55% of it.
  let maxW = 0, maxRow = by0; const widthAt = [];
  for (let y = by0; y <= byBlob; y++) { let w = 0; for (let x = bx0; x <= bx1; x++) if (face.is(x, y)) w++; widthAt[y] = w; if (w > maxW) { maxW = w; maxRow = y; } }
  let by1 = byBlob; for (let y = maxRow; y <= byBlob; y++) if (widthAt[y] < 0.55 * maxW) { by1 = y; break; }
  const cx0 = Math.round(bx0 + (bx1 - bx0) * 0.2), cx1 = Math.round(bx0 + (bx1 - bx0) * 0.8);
  const hair = [], gap = []; let headTop = by0;
  for (let x = cx0; x <= cx1; x++) { for (let y = 0; y < by0; y++) if (nonBg(x, y)) { headTop = Math.min(headTop, y); break; } }
  const headH = by1 - headTop + 1;
  for (let x = cx0; x <= cx1; x++) {
    let top = -1; for (let y = by0; y <= by1; y++) if (face.is(x, y)) { top = y; break; }
    if (top < 0) continue;
    hair.push((top - headTop) / headH);
    let ink = -1; for (let y = top; y <= Math.min(by1, top + headH * 0.3); y++) { const [r, g, b] = img.px(x, y); if (!face.is(x, y) && r + g + b < 240) { ink = y; break; } }
    if (ink >= 0) gap.push((ink - top) / headH);
  }
  const med = (a) => a.length ? a.slice().sort((p, q) => p - q)[a.length >> 1] : NaN;
  return { hairline: med(hair), gapToInk: med(gap), inkCols: gap.length / Math.max(1, hair.length), headH };
}

for (const id of ids) {
  const slug = slugOf(id);
  const sheet = `${DIR}/${slug}-turnaround.png`;
  // Boards only: their flat background makes the head box readable. The
  // runtime stills sit on the field and need a different background test.
  const files = [`${slug}-front-review.png`].map((f) => `${DIR}/${f}`);
  console.log(`\n${id}`);
  if (existsSync(sheet)) {
    const img = await load(sheet); const face = faceComponent(img, 0, Math.round(img.W * 0.22));
    if (face) { const s = scan(img, face); console.log(`  concept front      hairline at ${(s.hairline * 100).toFixed(1)}% of head height; ink within 30% below it on ${(s.inkCols * 100).toFixed(0)}% of columns, ${(s.gapToInk * 100).toFixed(1)}% down (head ${s.headH}px)`); }
  }
  for (const f of files) {
    if (!existsSync(f)) continue;
    const img = await load(f); const face = faceComponent(img);
    if (!face) { console.log(`  ${f.split('/').pop()}: no skin component`); continue; }
    const s = scan(img, face);
    console.log(`  ${f.split('/').pop().padEnd(34)} hairline at ${(s.hairline * 100).toFixed(1)}% of head height; ink within 30% below it on ${(s.inkCols * 100).toFixed(0)}% of columns, ${(s.gapToInk * 100).toFixed(1)}% down (head ${s.headH}px)`);
  }
}
