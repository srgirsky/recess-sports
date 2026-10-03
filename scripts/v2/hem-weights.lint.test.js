// ---------------------------------------------------------------------------
// ★ A TOP'S HEM IS CARRIED BY THE THIGHS, NOT HUNG FROM THE PELVIS.
//
// Tank's tee runs 0.53ft below his hip joint and every ring of it was weighted
// to `Hips` alone. Standing, nothing shows it. In the catcher's squat the thighs
// swing forward inside the shirt while the hem drops straight down with the
// pelvis, and through PITCH — the camera that holds the squat every pitch — he
// read as a purple sack with shoes (the 2026-09-29 catcher review). Grizz's top
// did the same. The fix is weights only (`sculptlib.rig.hem_follows_thighs`):
// below the hip, a garment vertex passes part of its weight to the thigh on its
// side, so the bind pose and every fidelity board are unchanged — which is also
// why no board-based gate could ever see this.
//
// The rule, read straight off the delivered models: a LOD0 vertex whose bind
// height is more than DEPTH_FT below the hip joint (`rig.LEG_HIP_Z`) and whose
// weight sits >= 0.99 on `Hips` alone is a skirt row. Only a kid on the list
// below may have one, and the list may only SHRINK:
//   - a dress hangs from the hips by design;
//   - overalls' seat is pants, which the pelvis carries;
//   - the rest are tops still owed the fix — debt, not decisions.
// A listed kid with no skirt rows left is a stale entry and fails too.
//
// Broken once before trusting it: on d66e832, Tank (141 rows) and Grizz (61)
// fail with this file's message.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAccessor, readGlb } from './glb.mjs';

const MODELS = fileURLToPath(new URL('../../public/v2/models/', import.meta.url));
/** `sculptlib/rig.py` LEG_HIP_Z — the hip joint, in the rig's feet. */
const LEG_HIP_Z = 1.6;
const DEPTH_FT = 0.3;

const ALLOWED = {
  bubbles: 'dress: the skirt hangs from the hips',
  clover: 'dress: the skirt hangs from the hips',
  diva: 'dress: the skirt hangs from the hips',
  peaches: 'dress: the skirt hangs from the hips',
  cricket: "overalls: the seat is pants, which the pelvis carries",
  gizmo: "overalls: the seat is pants, which the pelvis carries",
  penny: "overalls: the seat is pants, which the pelvis carries",
  sprout: "overalls: the seat is pants, which the pelvis carries",
  bend_it: 'debt: stripe tee, not yet reweighted (41 rows on d66e832)',
  boomer: 'debt: stripe tee, not yet reweighted (17 rows)',
  chip: 'debt: hoodie, not yet reweighted (55 rows)',
  rocket: 'debt: tee, not yet reweighted (9 rows)',
  smokey: 'debt: tee, not yet reweighted (17 rows)',
  turbo: 'debt: tee, not yet reweighted (9 rows)',
};

function skirtRows(file) {
  const gltf = readGlb(join(MODELS, file));
  const joints = gltf.json.skins[0].joints.map((i) => gltf.json.nodes[i].name);
  let rows = 0;
  for (const prim of gltf.json.meshes[0].primitives) {
    const position = readAccessor(gltf, prim.attributes.POSITION);
    const joint = readAccessor(gltf, prim.attributes.JOINTS_0);
    const weightAccessor = gltf.json.accessors[prim.attributes.WEIGHTS_0];
    const scale = weightAccessor.componentType === 5121 ? 255 : weightAccessor.componentType === 5123 ? 65535 : 1;
    const weight = readAccessor(gltf, prim.attributes.WEIGHTS_0);
    for (let v = 0; v < position.length / 3; v++) {
      if (position[v * 3 + 1] > LEG_HIP_Z - DEPTH_FT) continue;
      for (let j = 0; j < 4; j++) {
        if (joints[joint[v * 4 + j]] === 'Hips' && weight[v * 4 + j] / scale >= 0.99) rows++;
      }
    }
  }
  return rows;
}

const kids = readdirSync(MODELS).filter((f) => /^kid_.*\.glb$/.test(f)).map((f) => f.slice(4, -4)).sort();

describe('a top hangs from the thighs, not the pelvis', () => {
  it('reads every delivered kid', () => {
    expect(kids.length).toBeGreaterThanOrEqual(30);
  });
  for (const id of kids) {
    it(`${id}: ${ALLOWED[id] ?? 'no skirt rows'}`, () => {
      const rows = skirtRows(`kid_${id}.glb`);
      if (ALLOWED[id]) {
        expect(rows, `${id} has no skirt rows left: delete its ALLOWED entry (the list only shrinks)`).toBeGreaterThan(0);
      } else {
        expect(rows, `${id}: ${rows} LOD0 vertices more than ${DEPTH_FT}ft below the hip ride the pelvis alone, so the hem hangs like a skirt in a squat. Weight them with sculptlib.rig.hem_follows_thighs in the sculpt's torso loft; do not add a kid to ALLOWED to pass`).toBe(0);
      }
    });
  }
});
