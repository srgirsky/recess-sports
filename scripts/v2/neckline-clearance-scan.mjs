// ---------------------------------------------------------------------------
// The sawtooth-collar scan. Two kids paid for the same defect in one sweep:
// a garment's top hole ring authored INSIDE the neck loft, so the visible
// "edge" is the interpenetration circle of two lofts tessellated at different
// column counts — a per-column zigzag of skin against cloth (turbo: hole
// 0.134 vs neck 0.140; ace: hole 0.132 vs a neck bottom ring 0.134 wide).
// The fix both times: move the hole ring OUTSIDE the neck loft (>=0.008
// clear), so the visible edge is the ring itself.
//
// ⚠️ CANDIDATE LIST, NOT A LINT — same status as hem-boundary-scan.mjs. It
// reads the first width column of module-level TORSO_LEVELS and NECK_LEVELS
// tables and flags a topmost torso ring that fails to clear the neck's
// interpolated width at its z by 0.005. It over-reports where a collar shell
// (not the torso loft) owns the neckline, and under-reports non-standard
// table names. Crop the board at the neckline before authoring anything.
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLENDER = join(dirname(fileURLToPath(import.meta.url)), 'blender');
const CLEAR = 0.005;

function table(src, name) {
  const m = src.match(new RegExp(`^${name}\\s*=\\s*\\[([\\s\\S]*?)^\\]`, 'm'));
  if (!m) return null;
  return [...m[1].matchAll(/^\s*\(\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/gm)]
    .map((r) => ({ z: Number(r[1]), w: Number(r[2]) }));
}

for (const file of readdirSync(BLENDER).filter((f) => f.startsWith('sculpt-') && f.endsWith('-source.py'))) {
  const src = readFileSync(join(BLENDER, file), 'utf8');
  const torso = table(src, 'TORSO_LEVELS');
  const neck = table(src, 'NECK_LEVELS');
  if (!torso?.length || !neck?.length) continue;
  const top = torso.reduce((a, b) => (b.z > a.z ? b : a));
  const zs = neck.map((r) => r.z);
  if (top.z < Math.min(...zs) || top.z > Math.max(...zs)) continue; // no overlap
  const sorted = [...neck].sort((a, b) => a.z - b.z);
  let w = sorted[0].w;
  for (let i = 1; i < sorted.length; i++) {
    if (top.z <= sorted[i].z) {
      const [a, b] = [sorted[i - 1], sorted[i]];
      w = a.w + ((top.z - a.z) / (b.z - a.z || 1)) * (b.w - a.w);
      break;
    }
    w = sorted[i].w;
  }
  if (top.w < w + CLEAR) {
    console.log(`${file.replace(/^sculpt-|-source\.py$/g, '')}: torso hole ring ${top.w.toFixed(3)} @ z=${top.z} vs neck ${w.toFixed(3)} — clearance ${(top.w - w).toFixed(3)} (< ${CLEAR})`);
  }
}
console.log('scan done');
