// OWNER: field agent. The chalk vocabulary: foul lines out to the fence, the
// infield square, batter's boxes, a pentagon plate, canvas bags and the
// pitching rubber. Every line is a flat strip of materials.chalkLine() — the
// texture itself wavers and gaps, so strips are laid dead straight and the
// hand-limed backyard look comes free.

import * as THREE from 'three';
import type { MaterialsApi } from '../materials/index';
import { BASE_D, MOUND } from './ground';

const LINE_Y = 0.09;
// The chalkLine texture draws its wobbly ~0.6 ft line centered in a 2 ft-tall
// transparent band — strips must be 2 ft wide and sample the FULL band, or
// they show only the band's clear margin (the invisible-diamond bug).
const LINE_BAND = 2;

function strip(m: MaterialsApi, x0: number, z0: number, x1: number, z1: number): THREE.Mesh {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const geo = new THREE.PlaneGeometry(len, LINE_BAND).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, m.chalkLine({ worldSize: [len, LINE_BAND] }));
  mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  mesh.position.set((x0 + x1) / 2, LINE_Y, (z0 + z1) / 2);
  return mesh;
}

/** Rectangle outline from four strips (cx/cz center, w along x, d along z). */
function boxOutline(m: MaterialsApi, cx: number, cz: number, w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  g.add(strip(m, cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2));
  g.add(strip(m, cx - w / 2, cz + d / 2, cx + w / 2, cz + d / 2));
  g.add(strip(m, cx - w / 2, cz - d / 2, cx - w / 2, cz + d / 2));
  g.add(strip(m, cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2));
  return g;
}

export function buildDiamond(m: MaterialsApi, fenceR: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'field-diamond';

  // Foul lines: plate to the fence, 45° each side. Start a few feet out so
  // they don't fight the plate-area chalk.
  const s = Math.SQRT1_2;
  const t0 = 4;
  const t1 = fenceR - 2;
  group.add(strip(m, t0 * s, t0 * s, t1 * s, t1 * s));
  group.add(strip(m, -t0 * s, t0 * s, -t1 * s, t1 * s));

  // The outfield half of the infield square: first→second→third.
  group.add(strip(m, BASE_D, BASE_D, 0, BASE_D * 2));
  group.add(strip(m, 0, BASE_D * 2, -BASE_D, BASE_D));

  // Batter's boxes, kid-scaled.
  group.add(boxOutline(m, 2.95, 0.3, 3.6, 5.6));
  group.add(boxOutline(m, -2.95, 0.3, 3.6, 5.6));

  // Home plate: pentagon, point toward the catcher (-z).
  const plate = new THREE.Shape();
  plate.moveTo(-0.72, -0.55);
  plate.lineTo(0.72, -0.55);
  plate.lineTo(0.72, 0.18);
  plate.lineTo(0, 0.9);
  plate.lineTo(-0.72, 0.18);
  plate.closePath();
  const plateMesh = new THREE.Mesh(new THREE.ShapeGeometry(plate), m.chalk({ worldSize: [1.6, 1.6] }));
  plateMesh.rotation.x = -Math.PI / 2;
  plateMesh.position.set(0, 0.1, 0);
  group.add(plateMesh);

  // Bags: chalky canvas pillows, corners toward the basepaths.
  for (const [bx, bz] of [
    [BASE_D, BASE_D],
    [0, BASE_D * 2],
    [-BASE_D, BASE_D],
  ]) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.24, 1.9), m.chalk({ worldSize: [2, 2] }));
    bag.rotation.y = Math.PI / 4;
    bag.position.set(bx, 0.12, bz);
    bag.castShadow = true;
    group.add(bag);
  }

  // Pitching rubber on the mound crown.
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.5), m.chalk({ worldSize: [2, 0.6] }));
  rubber.position.set(MOUND.x, MOUND.h + 0.07, MOUND.z);
  rubber.castShadow = true;
  group.add(rubber);

  return group;
}
