// ---------------------------------------------------------------------------
// The outfield wall + backstop. Render-side only.
//
// Built by sampling `sim/field.ts`'s radial fence profile, so the wall the
// player sees IS the wall the ball caroms off — the same one-source-of-truth
// discipline v1 kept between its geometry and its renderer, and the reason a
// short right-field porch can't drift out of sync with where homers are given.
// ---------------------------------------------------------------------------

import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
} from 'three';
import { BACKSTOP_Z, FOUL_ANGLE_DEG, type FieldGeometry, fenceDistAt, pointAt } from '../sim/field';
import { makeToonMaterial } from './materials/toon';
import type { OutlineRegistry } from './materials/outline';
import { attachOutline } from './materials/outline';
import type { VenueLook } from './Field';

/** Sample count across the 90° of fair territory. 90 = one per degree. */
const SEGMENTS = 90;

export interface FenceBuild {
  root: Group;
  dispose(): void;
}

export function buildFence(
  geo: FieldGeometry,
  look: VenueLook,
  outlines: OutlineRegistry
): FenceBuild {
  const root = new Group();
  root.name = 'fence';
  const disposers: Array<() => void> = [];

  const h = geo.fenceHeight;

  // ---- The wall itself: a ribbon swept along the fence arc ---------------
  const wallGeom = sweepWall(geo, h);
  const wallMat = makeToonMaterial({ color: look.fence, rimStrength: 0.2 });
  wallMat.side = 2; // DoubleSide — the wall is seen from both faces on a homer
  const wall = new Mesh(wallGeom, wallMat);
  wall.name = 'wall';
  wall.castShadow = true;
  wall.receiveShadow = false;
  root.add(wall);
  attachOutline(wall, outlines);
  disposers.push(() => wallGeom.dispose());

  // ---- The trim cap along the top ----------------------------------------
  const capGeom = sweepWall(geo, 0.5, h);
  const capMat = makeToonMaterial({ color: look.fenceTrim, rimStrength: 0.3 });
  capMat.side = 2;
  const cap = new Mesh(capGeom, capMat);
  cap.name = 'wallCap';
  root.add(cap);
  disposers.push(() => capGeom.dispose());

  // ---- Posts, as ONE instanced mesh --------------------------------------
  const postCount = 31;
  const postGeom = new CylinderGeometry(0.3, 0.35, h + 0.6, 6);
  const postMat = makeToonMaterial({ color: look.fenceTrim, rimStrength: 0.18 });
  const posts = new InstancedMesh(postGeom, postMat, postCount);
  posts.name = 'fencePosts';
  posts.castShadow = false;
  const m = new Matrix4();
  const q = new Quaternion();
  const one = new Vector3(1, 1, 1);
  for (let i = 0; i < postCount; i++) {
    const spray = -FOUL_ANGLE_DEG + (2 * FOUL_ANGLE_DEG * i) / (postCount - 1);
    const p = pointAt(spray, fenceDistAt(geo, spray));
    m.compose(new Vector3(p.x, (h + 0.6) / 2, p.z), q, one);
    posts.setMatrixAt(i, m);
  }
  posts.instanceMatrix.needsUpdate = true;
  root.add(posts);
  disposers.push(() => postGeom.dispose());

  // ---- Foul poles ---------------------------------------------------------
  for (const side of [-1, 1] as const) {
    const p = pointAt(side * FOUL_ANGLE_DEG, fenceDistAt(geo, side * FOUL_ANGLE_DEG));
    const poleGeom = new CylinderGeometry(0.4, 0.4, 22, 8);
    const pole = new Mesh(poleGeom, makeToonMaterial({ color: 0xffce3a, rimStrength: 0.35 }));
    pole.position.set(p.x, 11, p.z);
    pole.castShadow = true;
    pole.name = `foulPole${side > 0 ? 'R' : 'L'}`;
    root.add(pole);
    attachOutline(pole, outlines);
    disposers.push(() => poleGeom.dispose());
  }

  // ---- Backstop behind the plate -----------------------------------------
  const backGeom = new BoxGeometry(30, 9, 0.5);
  const back = new Mesh(backGeom, makeToonMaterial({ color: look.fence, rimStrength: 0.15 }));
  back.position.set(0, 4.5, BACKSTOP_Z - 0.5);
  back.castShadow = true;
  back.name = 'backstop';
  root.add(back);
  attachOutline(back, outlines);
  disposers.push(() => backGeom.dispose());

  return {
    root,
    dispose() {
      for (const d of disposers) d();
    },
  };
}

/**
 * Sweep a vertical ribbon along the fence arc.
 *
 * `baseY` lets the same function build the wall (0 -> h) and the trim cap
 * (h -> h + 0.5) without a second sweep implementation, which is what keeps
 * the cap glued to the wall when a venue changes its profile.
 */
function sweepWall(geo: FieldGeometry, height: number, baseY = 0): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i <= SEGMENTS; i++) {
    const spray = -FOUL_ANGLE_DEG + (2 * FOUL_ANGLE_DEG * i) / SEGMENTS;
    const p = pointAt(spray, fenceDistAt(geo, spray));
    pos.push(p.x, baseY, p.z);
    pos.push(p.x, baseY + height, p.z);
    const u = i / SEGMENTS;
    uv.push(u, 0, u, 1);
  }
  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
