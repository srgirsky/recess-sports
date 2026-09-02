// ---------------------------------------------------------------------------
// node scripts/v2/redundant-rows-scan.mjs [<slug> ...]
//
// WHICH LOFT ROWS A KID CAN SPARE — a scan, not a lint.
//
// The roster is jammed against the LOD0 budget (7000 triangles): the ears
// cost Bubbles and Grizz ~300 each and were paid with rows within 0.025 of
// their neighbours' linear interpolation; Penny's shoulder root ring was
// refused at 7048; Bendy, Flash and Zippy sit within sixty of the wall. Every
// one of those trades was found by hand, one table at a time.
//
// This reads every `*_LEVELS = [ (z, half_x, half_y, y_centre), ... ]` table
// in a sculpt source and lists the rows whose (half_x, half_y, y_centre) sit
// within `tol` of the linear interpolation between their two neighbours in z
// — the rows the mesh would draw almost identically without. The triangle
// saving is `2 × columns` per row at LOD0; the column count is read from the
// `segments = N if detail >= 2` line nearest the table, or assumed 24.
//
// Deliberately a scan: a row can be load-bearing for a colour boundary (a
// hem's ring pair), a window edge (a fringe arc's ring pair) or a bone weight
// change, and none of that is in the numbers. Read it, open the table, then
// decide. Never drop a row that a comment says is a pair — and a row can be
// load-bearing in a dimension the numbers do not carry: Penny's 3.300 sat
// within 0.009 of its neighbours' half-widths and was the brow line where
// the face-band floor and skull clamp were sampled; dropping it turned two
// green visible-face metrics red (a critic's measurement, 2026-09-02). Run
// measure:fidelity after a drop, before a critic.
//
// Two more ways a numerically spare row is load-bearing (the knee rollout,
// 2026-09-02): a hair row the `hair_window_z` was tuned against — Calls
// Shot's 3.240 — moves the shell when dropped and the window lets the mass
// eat a side of the face (visible face right 27.1 → 15.1); and the middle
// row of three carrying one arc — Clover's cap 3.560 — turns the curve into
// two chords with a corner. Prefer rows at a loft's ends, never the one a
// window or a comment is tuned against, and diff the before/after boards.
// ---------------------------------------------------------------------------
import { readdirSync, readFileSync } from 'node:fs';

const DIR = 'scripts/v2/blender';
const tol = Number(process.env.TOL ?? 0.025);
const wanted = process.argv.slice(2);
const files = readdirSync(DIR).filter((f) => /^sculpt-.*-source\.py$/.test(f)).filter((f) => !wanted.length || wanted.some((w) => f.includes(w)));

for (const file of files.sort()) {
  const text = readFileSync(`${DIR}/${file}`, 'utf8');
  const out = [];
  for (const m of text.matchAll(/^([A-Z_]+_LEVELS)\s*=\s*\[([\s\S]*?)^\]/gm)) {
    const rows = [...m[2].matchAll(/^\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)/gm)].map((r) => r.slice(1, 5).map(Number));
    if (rows.length < 3) continue;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 4000);
    const seg = after.match(/segments = (\d+) if detail >= 2/);
    const cols = seg ? Number(seg[1]) : 24;
    const spare = [];
    for (let i = 1; i < rows.length - 1; i++) {
      const [z0, ...a] = rows[i - 1], [z, ...b] = rows[i], [z1, ...c] = rows[i + 1];
      const t = (z - z0) / (z1 - z0);
      const err = Math.max(...b.map((v, k) => Math.abs(v - (a[k] + (c[k] - a[k]) * t))));
      if (err <= tol) spare.push(`${z.toFixed(3)} (err ${err.toFixed(3)})`);
    }
    if (spare.length) out.push(`  ${m[1].padEnd(16)} ${rows.length} rows × ${cols} cols — spare within ${tol}: ${spare.join(', ')}  → up to ${spare.length * cols * 2} LOD0 tris`);
  }
  if (out.length) { console.log(file.replace(/^sculpt-|-source\.py$/g, '')); for (const l of out) console.log(l); }
}
