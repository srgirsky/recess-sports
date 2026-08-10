// OWNER: materials agent. TEMPORARY texture swatch board — the same
// self-retiring pattern as render/stage.ts: index.ts only adds it at
// scene:ready when the 'field' API is still an empty stub, so the moment the
// field pass lands this file contributes nothing. It exists so THIS pass's
// capture actually shows the textures (materials have no scene footprint of
// their own) and the critic can score grass/dirt/chalk/wood/etc. directly.
// Field/characters owners: do not consume anything from this file.

import * as THREE from 'three';

export type Swatch = { label: string; material: THREE.Material; aspect?: number };

/**
 * A 6×2 grid of quads floated in front of the pitching camera (eye ~[4.9,6,-12.2]
 * looking at the mound), each face-on to the eye so the capture reads them flat.
 */
export function makeSwatchBoard(swatches: Swatch[], eye: [number, number, number]): THREE.Group {
  const group = new THREE.Group();
  group.name = '__materialsSwatchBoard';
  const eyeV = new THREE.Vector3(...eye);
  const COLS = 6;
  const SIZE = 2.6;
  const GAP = 0.5;
  const rows = Math.ceil(swatches.length / COLS);
  const center = new THREE.Vector3(3.9, 6.2, 6);

  swatches.forEach((s, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const aspect = s.aspect ?? 1;
    // Wide strips (chalk line, bunting) span extra width so their detail reads.
    const w = aspect > 1 ? SIZE * 2.2 : SIZE;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / aspect), s.material);
    // Screen-left is world +x from this camera, so columns run toward -x.
    const x = center.x + ((COLS - 1) / 2 - col) * (SIZE + GAP) * 0.92 - (aspect > 1 ? (w - SIZE) / 2 : 0);
    const y = center.y + ((rows - 1) / 2 - row) * (SIZE + GAP);
    mesh.position.set(x, y, center.z);
    mesh.lookAt(eyeV);
    group.add(mesh);
  });
  return group;
}
