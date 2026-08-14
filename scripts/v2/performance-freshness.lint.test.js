// ---------------------------------------------------------------------------
// ★ A BAKED PERFORMANCE TAKE OUTRANKS THE CODE THAT GENERATED IT.
//
// `AnimationDirector` resolves a clip character take → shared → procedural. So
// for the six characters that have an `anims_<id>_v1.glb`, editing
// `src/v2/render/proceduralClips.ts` changes NOTHING the runtime plays until
// somebody re-runs `npm run export:signature-performance -- <id>`. The edit is
// in the repo, the tests are green, the diff looks right, and the game does not
// move.
//
// ⚠️ THIS IS NOT HYPOTHETICAL, AND IT DEFEATED A HUMAN-STYLE CHECK. A round of
// work added an `elbowSwing` parameter so Tank's run would stop reading as a
// straight taper, shipped it, re-captured `tank-runtime-run.png`, LOOKED at the
// still, and recorded "the near arm now breaks at the elbow" as verified. It
// did not. `anims_tank_v1.glb` still held the old take — LeftForeArm and
// RightForeArm pinned to the constant quaternion [0, ±0.259, 0, 0.966] for all
// 25 keys, a fixed 30-degree hinge — and the file's mtime predated the edit. An
// independent review found it by reading the GLB's own rotation track, which is
// the only thing in that chain that cannot be talked out of.
//
// The failure mode is the worst kind: silent, and it makes every downstream
// piece of evidence a picture of the OLD asset while everyone believes it is a
// picture of the new one. That is the same class as the stale hero shot
// `capture-character-evidence.mjs` was written to end, and it deserves the same
// treatment — a gate, not a habit.
//
// ★ WHY BYTES AND NOT A SPOT-CHECK ON ONE TRACK. `writeAnimationClipsGlb` is
// deterministic: baking Tank twice in one process gives the same sha256, and it
// matches the shipped file. So the strongest available statement is also the
// cheapest one — re-bake into a temp directory and compare the whole file. A
// gate that compared only the tracks somebody thought to name would have missed
// this one, because nobody would have thought to name the forearm.
//
// Break-it record, below: truncating one byte of the shipped file fires with
// "tank: the shipped performance take is stale".
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { PERFORMANCE_IDS, buildSignaturePerformanceGlb } from './export-signature-performance.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const models = resolve(here, '..', '..', 'public', 'v2', 'models');
const scratch = mkdtempSync(join(tmpdir(), 'recess-performance-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const shippedPath = (id) => join(models, `anims_${id}_v1.glb`);

/** Re-bake `id` into the scratch directory and return its bytes. */
function rebake(id) {
  const out = join(scratch, `anims_${id}_v1.glb`);
  buildSignaturePerformanceGlb(id, out);
  return readFileSync(out);
}

describe('a shipped performance take matches the code that bakes it', () => {
  it('bakes deterministically, or comparing bytes would mean nothing', () => {
    const id = PERFORMANCE_IDS[0];
    expect(sha(rebake(id))).toBe(sha(rebake(id)));
  });

  it('has a builder for every take in public/v2/models', () => {
    // The reverse direction: a delivered `anims_<id>_v1.glb` with no builder is
    // a take nothing can regenerate, which this gate would silently skip.
    // `anims_recess_v1.glb` is the SHARED library and has no character builder,
    // so it is named here rather than pattern-matched away.
    const shipped = PERFORMANCE_IDS.filter((id) => existsSync(shippedPath(id)));
    expect(shipped.length).toBeGreaterThan(0);
    expect(shipped).toEqual(PERFORMANCE_IDS);
  });

  it('is byte-identical to a fresh bake for every character', () => {
    const stale = [];
    for (const id of PERFORMANCE_IDS) {
      const path = shippedPath(id);
      if (!existsSync(path)) continue;
      if (sha(rebake(id)) !== sha(readFileSync(path))) {
        stale.push(
          `${id}: the shipped performance take is stale — proceduralClips.ts has ` +
          `moved since anims_${id}_v1.glb was baked, and AnimationDirector plays ` +
          `the BAKED take, so the edit is not in the game. Run ` +
          `\`npm run export:signature-performance -- ${id}\` and re-capture that ` +
          "character's evidence, because every still of it is a picture of the old asset",
        );
      }
    }
    expect(stale).toEqual([]);
  });

  // ★ Broken once, against the real artefact rather than a fixture.
  it('fires when a shipped take drifts from the builder', () => {
    const id = PERFORMANCE_IDS[0];
    const shipped = readFileSync(shippedPath(id));
    const drifted = shipped.subarray(0, shipped.length - 1);
    expect(sha(drifted)).not.toBe(sha(rebake(id)));
  });
});
