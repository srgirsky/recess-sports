// OWNER: field agent. The lawn and the sculpted earth under it: one big
// mow-banded grass plane, a low dirt pitching mound, and wobbly hand-cut worn
// patches everywhere kids actually stand (plate, bags, catcher's crouch,
// pitcher's landing lane). All surface character comes from ctx 'materials'
// textures; the only geometry trick here is ShapeGeometry over an rng-wobbled
// outline so no dirt edge ever reads machine-stamped — this is a backyard.

import * as THREE from 'three';
import type { Rng } from '../core/rng';
import type { MaterialsApi } from '../materials/index';

export const MOUND = { x: 0, z: 46, r: 8.5, h: 0.8 } as const;
/** Base positions sit on the 45° diamond: (±BASE_D, BASE_D) and (0, 2·BASE_D). */
export const BASE_D = 60 / Math.SQRT2;

/** A closed hand-cut outline: a circle whose radius wavers per vertex. */
export function wobblyShape(rng: Rng, r: number, points = 16, wobble = 0.16): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 + (rng.next() * 2 - 1) * wobble);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/** Untextured Lambert in a palette color — for trim, glass, wires, wheels. */
export function flat(m: MaterialsApi, key: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: m.color(key) });
}

function dirtPatch(m: MaterialsApi, rng: Rng, x: number, z: number, r: number, wobble = 0.2): THREE.Mesh {
  const mat = m.dirt({ worldSize: [r * 2.4, r * 2.4] });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(wobblyShape(rng, r, 26, wobble * 0.6)), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.05, z);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildGround(
  m: MaterialsApi,
  rng: Rng,
): { group: THREE.Group; groundYAt(x: number, z: number): number } {
  const group = new THREE.Group();
  group.name = 'field-ground';

  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2),
    m.grass({ worldSize: [1600, 1600] }),
  );
  lawn.receiveShadow = true;
  group.add(lawn);

  // Low mound: a squashed dome of dirt with a wobbly dirt skirt so the grass
  // edge reads hand-dug rather than stamped.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    m.dirt({ worldSize: [MOUND.r * 2.2, MOUND.r * 2.2] }),
  );
  dome.scale.set(MOUND.r, MOUND.h, MOUND.r);
  dome.position.set(MOUND.x, 0, MOUND.z);
  dome.receiveShadow = true;
  group.add(dome);
  group.add(dirtPatch(m, rng, MOUND.x, MOUND.z, MOUND.r + 1.5, 0.13));

  // Worn earth where the game happens.
  group.add(dirtPatch(m, rng, 0, 0.4, 6.2, 0.13)); // plate area
  group.add(dirtPatch(m, rng, 0, -4.4, 2.4, 0.22)); // catcher's crouch
  group.add(dirtPatch(m, rng, 0, 40.5, 2.1, 0.24)); // pitcher's landing lane
  group.add(dirtPatch(m, rng, BASE_D, BASE_D, 3.4, 0.2)); // first
  group.add(dirtPatch(m, rng, 0, BASE_D * 2, 3.2, 0.2)); // second
  group.add(dirtPatch(m, rng, -BASE_D, BASE_D, 3.4, 0.2)); // third

  const groundYAt = (x: number, z: number): number => {
    const d = Math.hypot(x - MOUND.x, z - MOUND.z);
    if (d >= MOUND.r) return 0;
    return MOUND.h * Math.sqrt(1 - (d / MOUND.r) ** 2);
  };

  return { group, groundYAt };
}
