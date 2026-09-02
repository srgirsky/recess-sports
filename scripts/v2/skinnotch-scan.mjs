// ---------------------------------------------------------------------------
// node scripts/v2/skinnotch-scan.mjs — enclosed skin inside a hair mass.
//
// ★ WHY THIS EXISTS. Sniffles shipped a ~40x40px bald-notch — true face skin
// (verified by raw pixel values) cut INTO the hair mass on his fringe's
// raised-sweep side, visible at the 3/4 gameplay angle — and EVERY gate
// stayed green: silhouette.lint wants see-through pockets (this is opaque),
// faceAsymmetry samples below the hairline, and measure:strands reads rows,
// not enclosure. The cause was an uncapped fringe sweep (his fringe_z_at now
// caps the raise and cites this file).
//
// ⚠️ WHY THIS IS A SCAN AND NOT A LINT, RECORDED AFTER CALIBRATION. The
// obvious detector — skin-classified components not connected to the main
// face, with a boundary that is ≥80% hair-dark — was run across all thirty
// grin stills and flagged TEN innocent kids, because on a hair-framed kid
// the FACE ITSELF is an enclosed skin component (grizz, junebug, mimi,
// penny... all faces, plus drawn-visible ears poking through hair, which
// the sheets legitimise). A gate that fires on ten innocent kids teaches
// everyone to ignore it — worse than no gate (the same reasoning that kept
// the Nyquist scan a scan). To promote this, the next attempt must ANCHOR
// the face component first (the component under the still's face-camera
// centre, or the one containing the mouth/eye marks) and flag only
// hair-enclosed skin DISJOINT from it and above its brow line. Until then:
// run the scan, eyeball its rows, and crop before filing anything.
// ---------------------------------------------------------------------------

import sharp from 'sharp';
import { readdirSync } from 'node:fs';

const DIR = '/Users/sethgirsky/Documents/Project/Recess Sports/docs/v2/concepts';
const stills = readdirSync(DIR).filter(f => f.endsWith('-runtime-face-grin.png'));

const isSkin = (r, g, b) => r > g + 12 && r > b + 12 && r > 90 && r + g + b > 190 && r + g + b < 650;
const isHairDark = (r, g, b) => r + g + b < 330 && r >= g && g >= b - 20;

for (const f of stills.sort()) {
  const { data, info } = await sharp(`${DIR}/${f}`).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const px = (x, y) => [data[(y * W + x) * C], data[(y * W + x) * C + 1], data[(y * W + x) * C + 2]];
  // label skin components (4-connectivity, coarse grid step 1)
  const lab = new Int32Array(W * H).fill(-1);
  let next = 0; const sizes = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (lab[i] !== -1) continue;
    const [r, g, b] = px(x, y);
    if (!isSkin(r, g, b)) continue;
    // BFS
    const q = [i]; lab[i] = next; let sz = 0;
    while (q.length) {
      const j = q.pop(); sz++;
      const jx = j % W, jy = (j / W) | 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (lab[k] !== -1) continue;
        const [r2, g2, b2] = px(nx, ny);
        if (isSkin(r2, g2, b2)) { lab[k] = next; q.push(k); }
      }
    }
    sizes.push(sz); next++;
  }
  const main = sizes.indexOf(Math.max(...sizes, 0));
  const flagged = [];
  for (let c = 0; c < next; c++) {
    if (c === main || sizes[c] < 120) continue;
    // boundary composition
    let hair = 0, other = 0, minx = W, maxx = 0, miny = H, maxy = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (lab[y * W + x] !== c) continue;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) { other++; continue; }
        if (lab[ny * W + nx] === c) continue;
        const [r, g, b] = px(nx, ny);
        if (isHairDark(r, g, b)) hair++; else other++;
      }
    }
    const frac = hair / (hair + other);
    if (frac >= 0.80) flagged.push(`${sizes[c]}px @${minx}-${maxx},${miny}-${maxy} hairFrac=${frac.toFixed(2)}`);
  }
  if (flagged.length) console.log(f, '→', flagged.join(' | '));
}
console.log('scan complete over', stills.length, 'stills');
