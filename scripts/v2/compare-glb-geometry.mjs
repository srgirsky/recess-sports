// ---------------------------------------------------------------------------
// ★ A REFACTOR THAT CHANGES NO FLOAT CANNOT CHANGE THE MESH, AND THIS IS HOW
// YOU PROVE IT.
//
// Restructuring a sculpt script is the one change with no natural gate. Every
// existing check asks whether the delivery is CONTRACT-LEGAL — bone order, LOD
// budgets, height band, palette — and a refactor that silently moved a vertex
// by a foot would pass all of them. The reviewable question is different: did
// the geometry change AT ALL?
//
// It is answerable exactly, because the pipeline turns out to be deterministic
// where it matters. Measured on Junebug: re-running her sculpt script and
// re-exporting reproduces the binary buffer BYTE FOR BYTE (378,728 bytes) and
// all 89 accessors identically.
//
// ★ TWO THINGS DO MOVE, AND NEITHER IS GEOMETRY. Blender's `save_as_mainfile`
// is not byte-reproducible, so the `.blend`'s hash changes on every run — and
// since the export stamps that hash into `asset.extras.recessAuthoring`, the
// GLB's own bytes change with it. Comparing whole files would therefore report
// a difference on every single run and be useless. And Blender appends `.001`
// to a name that collides, so a mesh authored over an already-populated file
// carries a suffix that a clean rebuild does not.
//
// So this compares the BINARY BUFFER and every decoded ACCESSOR, and reports
// structural JSON differences with those two known-benign classes separated
// out. A difference in a vertex, index, weight, joint or colour is a real
// finding; a difference in `sourceSha256` is bookkeeping.
//
//   node scripts/v2/compare-glb-geometry.mjs <baseline.glb> <candidate.glb>
//
// Exits non-zero when geometry differs.
//
// ★ BROKEN ONCE BEFORE BEING TRUSTED, AND THE FIRST ATTEMPT TO BREAK IT WAS
// ITSELF THE BUG. Moving "the first float in the buffer" by 3mm changed
// nothing and the comparison correctly reported no difference — because the
// buffer OPENS with `COLOR_0`, a normalised `UNSIGNED_BYTE` accessor. Read as a
// float that is -1.77e38, and adding 0.003 to a number that size does not move
// a single bit of the float32. The check looked lenient and was fine; the test
// was measuring nothing, the same shape as this repo's "asserted a function
// equals itself" trap. Nudging a vertex in a real FLOAT VEC3 accessor instead
// reports the buffer difference AND names accessor 1. Break it on a POSITION,
// never on byte zero.
// ---------------------------------------------------------------------------

import process from 'node:process';

import { readAccessor, readGlb } from './glb.mjs';

/** Differences that are bookkeeping rather than geometry, with why. */
const BENIGN = [
  [/^\/asset\/extras\/recessAuthoring\/sourceSha256$/, "the .blend's hash — Blender's save is not byte-reproducible"],
  [/^\/asset\/extras\/recessAuthoring\/conceptSha256$/, 'the turnaround hash — changes only when the art does'],
  [/^\/meshes\/\d+\/name$/, "Blender's .001 duplicate-name suffix, an artifact of the authoring session"],
  [/^\/asset\/generator$/, 'the exporter version string'],
];

function jsonDifferences(a, b, path = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  const bothObjects = a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b);
  if (bothObjects) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      jsonDifferences(a?.[key], b?.[key], `${path}/${key}`, out);
    }
    return out;
  }
  out.push({ path, a, b });
  return out;
}

export function compareGeometry(baselinePath, candidatePath) {
  const A = readGlb(baselinePath);
  const B = readGlb(candidatePath);
  const findings = [];

  const bufA = Buffer.from(A.bin ?? []);
  const bufB = Buffer.from(B.bin ?? []);
  const bufferIdentical = bufA.length === bufB.length && Buffer.compare(bufA, bufB) === 0;
  if (!bufferIdentical) {
    findings.push(`binary buffer differs: ${bufA.length} vs ${bufB.length} bytes`);
  }

  // The buffer can match while an accessor reads it differently — a changed
  // offset, count or component type is a real geometry change with identical
  // bytes behind it. Decode both.
  const countA = (A.json.accessors ?? []).length;
  const countB = (B.json.accessors ?? []).length;
  let accessorsDiffering = 0;
  if (countA !== countB) {
    findings.push(`accessor count differs: ${countA} vs ${countB}`);
  } else {
    for (let i = 0; i < countA; i++) {
      const va = readAccessor(A, i);
      const vb = readAccessor(B, i);
      if (va.length !== vb.length || va.some((v, k) => v !== vb[k])) {
        accessorsDiffering++;
        if (accessorsDiffering <= 5) {
          findings.push(`accessor ${i} (${A.json.accessors[i].type}) differs`);
        }
      }
    }
    if (accessorsDiffering > 5) findings.push(`…and ${accessorsDiffering - 5} more accessors`);
  }

  const structural = [];
  const bookkeeping = [];
  for (const diff of jsonDifferences(A.json, B.json)) {
    const benign = BENIGN.find(([pattern]) => pattern.test(diff.path));
    (benign ? bookkeeping : structural).push({ ...diff, why: benign?.[1] });
  }

  return {
    ok: bufferIdentical && accessorsDiffering === 0 && countA === countB && structural.length === 0,
    findings,
    structural,
    bookkeeping,
    accessorCount: countA,
    bufferBytes: bufA.length,
  };
}

const invokedDirectly = process.argv[1]?.endsWith('compare-glb-geometry.mjs');
if (invokedDirectly) {
  const [baseline, candidate] = process.argv.slice(2);
  if (!baseline || !candidate) {
    console.error('usage: node scripts/v2/compare-glb-geometry.mjs <baseline.glb> <candidate.glb>');
    process.exit(2);
  }
  const result = compareGeometry(baseline, candidate);
  console.log(`\nbinary buffer   ${result.bufferBytes} bytes`);
  console.log(`accessors       ${result.accessorCount} compared`);
  for (const finding of result.findings) console.log(`  ✗ ${finding}`);
  for (const diff of result.structural) {
    console.log(`  ✗ ${diff.path}\n      baseline: ${JSON.stringify(diff.a)}\n      candidate: ${JSON.stringify(diff.b)}`);
  }
  if (result.bookkeeping.length) {
    console.log('\nignored (bookkeeping, not geometry):');
    for (const diff of result.bookkeeping) console.log(`  · ${diff.path} — ${diff.why}`);
  }
  console.log(result.ok ? '\n✓ geometry is identical\n' : `\n✗ geometry CHANGED\n`);
  process.exit(result.ok ? 0 : 1);
}
