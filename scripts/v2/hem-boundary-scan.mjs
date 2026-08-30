// ---------------------------------------------------------------------------
// The hem-pass scan, as a script instead of prose: a garment edge that is only
// a colour change reads as paint (rubric 3.4 held thirteen kids at 4 for it).
// A `color_fn` switching at some z, with no loft rings around that z, makes
// the loft interpolate the switch across the whole gap between its nearest
// rings — Penny's waist smeared denim→pink over 0.2ft of gradient. The fix is
// a ring PAIR straddling the boundary plus a PROUD LIP (~0.010ft) on the lower
// ring: crisp is a colour edge, crisp+proud is a constructed garment
// (sculpt-penny-source.py TORSO_LEVELS 1.987/1.999 is the exemplar).
//
// ⚠️ THIS IS A CANDIDATE LIST, NOT A DEFECT LIST, AND DELIBERATELY NOT A LINT.
// It over-reports two known ways (the sculpt skill's hem-pass lesson): a z
// selection inside an explicit ring loop whose rings sit at exactly those z is
// not a colour edge, and a proud-geometry panel (Penny's bib) is not a painted
// boundary. Crop the profile board at the z in question before authoring a
// single ring. It also under-reports: it associates boundaries with ALL level
// tables in the file, so a boundary served by a ring in an unrelated table
// looks covered. A lint needs a defensible fn→table mapping; this has none.
//
//   node scripts/v2/hem-boundary-scan.mjs           # whole roster
//   node scripts/v2/hem-boundary-scan.mjs <slug>    # one kid
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLENDER = join(dirname(fileURLToPath(import.meta.url)), 'blender');
const NEAR = 0.02; // a ring within this of the boundary makes the edge crisp

const only = process.argv[2];
const files = readdirSync(BLENDER)
  .filter((f) => f.startsWith('sculpt-') && f.endsWith('-source.py'))
  .filter((f) => !only || f === `sculpt-${only}-source.py`);

for (const file of files) {
  const src = readFileSync(join(BLENDER, file), 'utf8');

  // z rows of every module-level ALL-CAPS table: first float of each tuple row.
  const ringZ = [];
  const tableRe = /^[A-Z][A-Z0-9_]{3,}\s*=\s*\[([\s\S]*?)^\]/gm;
  for (let m = tableRe.exec(src); m; m = tableRe.exec(src)) {
    for (const row of m[1].matchAll(/^\s*\(\s*(-?\d+\.\d+)/gm)) ringZ.push(Number(row[1]));
  }

  // z thresholds inside colour functions: `if z <" N` / `z >= N` etc. within
  // any def whose name mentions color/colour.
  const found = [];
  const fnRe = /^def\s+(\w*colou?r\w*)\s*\([^)]*\):\n([\s\S]*?)(?=^def |^[A-Z@]|\Z)/gm;
  for (let m = fnRe.exec(src); m; m = fnRe.exec(src)) {
    const [body, fn] = [m[2], m[1]];
    for (const t of body.matchAll(/\bz\s*(?:<=?|>=?)\s*(-?\d+\.\d+)/g)) {
      const b = Number(t[1]);
      const above = Math.min(...ringZ.filter((z) => z >= b).map((z) => z - b), Infinity);
      const below = Math.min(...ringZ.filter((z) => z < b).map((z) => b - z), Infinity);
      if (above > NEAR || below > NEAR) found.push({ fn, b, above, below });
    }
  }
  if (found.length) {
    console.log(file.replace(/^sculpt-|-source\.py$/g, ''));
    for (const f of found) {
      const fmt = (v) => (v === Infinity ? 'none' : v.toFixed(3));
      console.log(`  ${f.fn} @ z=${f.b}: nearest ring above ${fmt(f.above)}, below ${fmt(f.below)} — smear span ${fmt(f.above === Infinity || f.below === Infinity ? Infinity : f.above + f.below)}ft`);
    }
  }
}
