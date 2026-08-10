// OWNER: field agent. Assembles the venue — ground, chalk diamond, privacy
// fence with bunting, the neighborhood beyond it, and the flora layers — and
// registers ctx 'field'. Registered API:
//   root          — the whole venue THREE.Group (already added to the scene)
//   home / bases / moundTop — key positions in feet, [x, y, z]
//   fenceRadiusFt — nominal fence arc radius (per-post wobble is ±3.5)
//   groundYAt(x, z) — terrain height (the mound dome; 0 elsewhere) so later
//                     owners can stand a pitcher on the rubber's crown
// Randomness: draws from ctx 'rng' happen once, here, in a fixed build order,
// so every later subsystem's random stream stays stable across seeds.

import * as THREE from 'three';
import type { Ctx } from '../core/ctx';
import type { Rng } from '../core/rng';
import type { MaterialsApi } from '../materials/index';
import { buildGround, MOUND, BASE_D } from './ground';
import { buildDiamond } from './diamond';
import { buildFence, FENCE_R } from './fence';
import { buildYard } from './yard';
import { buildFlora } from './flora';

export type Vec3Ft = [number, number, number];

export type FieldApi = {
  root: THREE.Group;
  home: Vec3Ft;
  bases: { first: Vec3Ft; second: Vec3Ft; third: Vec3Ft };
  moundTop: Vec3Ft;
  fenceRadiusFt: number;
  groundYAt(x: number, z: number): number;
};

export function init(ctx: Ctx): void {
  const m = ctx.get<MaterialsApi>('materials');
  const rng = ctx.get<Rng>('rng');
  const { scene } = ctx.get<{ scene: THREE.Scene }>('render');

  const root = new THREE.Group();
  root.name = 'field';

  const { group: ground, groundYAt } = buildGround(m, rng);
  root.add(ground);
  root.add(buildDiamond(m, FENCE_R));
  root.add(buildFence(m, rng));
  root.add(buildYard(m, rng));
  root.add(buildFlora(m, rng));
  scene.add(root);

  const api: FieldApi = {
    root,
    home: [0, 0, 0],
    bases: {
      first: [BASE_D, 0, BASE_D],
      second: [0, 0, BASE_D * 2],
      third: [-BASE_D, 0, BASE_D],
    },
    moundTop: [MOUND.x, MOUND.h, MOUND.z],
    fenceRadiusFt: FENCE_R,
    groundYAt,
  };
  ctx.set('field', api);
}
