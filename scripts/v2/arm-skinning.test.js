// The shared arm builder used garment-band labels as rigid bone assignments.
// Twenty-nine shipped kids had no elbow/wrist blends; some bare upper-arm
// rings followed ForeArm before reaching the elbow. Rest-pose measurements
// cannot see that: only bending moves the wrongly weighted skin.
//
// Inspect DELIVERED LOD0 skin weights, on both sides, so fixing the Python but
// forgetting to rebuild/export cannot pass. A complete ring must share
// meaningful influence; one token blended vertex is not a joint transition.
// Ring count is not a quality metric: the delivered low-poly arm tables have
// different sampling densities. Preserve those shapes and review the motion.
// This is a deformation prerequisite, not a substitute for motion review.
// Break check: the pre-fix Sprout GLB fails all four joint checks with zero
// blended rings. Junebug's separately authored arm passes without modification.
import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../src/data/characters';
import { readGlb, readAccessor } from './glb.mjs';

export function jointBlendRings(g, side, parent, child) {
  const names = g.json.skins[0].joints.map(i => g.json.nodes[i].name);
  const rings = new Map();
  for (const mesh of g.json.meshes.filter(m => m.name?.includes('LOD0'))) {
    for (const { attributes: a } of mesh.primitives) {
      if (a.WEIGHTS_0 === undefined) continue;
      const p = readAccessor(g, a.POSITION);
      const j = readAccessor(g, a.JOINTS_0);
      const w = readAccessor(g, a.WEIGHTS_0);
      const accessor = g.json.accessors[a.WEIGHTS_0];
      const divisor = accessor.normalized ? ({ 5121: 255, 5123: 65535 }[accessor.componentType] ?? 1) : 1;
      for (let v = 0; v < p.length / 3; v++) {
        const weights = {};
        for (let k = 0; k < 4; k++) weights[names[j[4 * v + k]]] = w[4 * v + k] / divisor;
        if (weights[side + parent] >= .1 && weights[side + child] >= .1) {
          const x = Math.abs(p[3 * v]).toFixed(3);
          if (!rings.has(x)) rings.set(x, new Set());
          rings.get(x).add(p.slice(3 * v, 3 * v + 3).map(n => n.toFixed(5)).join(','));
        }
      }
    }
  }
  return [...rings.values()].filter(vertices => vertices.size >= 6);
}

describe('delivered arms bend across the elbow and wrist', () => {
  for (const kid of ROSTER) {
    it(`${kid.id}: both elbows and wrists have a skinning transition`, () => {
      const g = readGlb(`public/v2/models/kid_${kid.id}.glb`);
      for (const side of ['Left', 'Right']) {
        for (const [parent, child] of [['Arm', 'ForeArm'], ['ForeArm', 'Hand']]) {
          expect(jointBlendRings(g, side, parent, child).length,
            `${kid.id} ${side} ${parent}→${child}: rebuild the source with continuous joint weights and re-export; do not certify the bind pose`)
            .toBeGreaterThanOrEqual(1);
        }
      }
    });
  }
});
