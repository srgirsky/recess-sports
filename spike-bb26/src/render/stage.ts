// OWNER: render agent. TEMPORARY placeholder stage, and nothing more — it
// exists so camera framing, sun shadows and fog are verifiable before the
// field and characters passes land. It SELF-RETIRES: at scene:ready, the grass
// stage is skipped if 'field' registered a non-empty API, and the kid dummies
// are skipped if 'characters' did. Field/characters owners: register a real
// (non-empty) API object and this file contributes nothing — do NOT edit it,
// it lives in render/'s directory.

import * as THREE from 'three';
import { STAGE } from './colors';

const KID_HEIGHT = 4.6; // ft — chunky BB kid, the height the presets frame for
const BATTER_BOX: [number, number, number] = [-2.6, 0, 0.5]; // third-base box (righty)

function dummy(x: number, y: number, z: number): THREE.Mesh {
  const r = 0.85;
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(r, KID_HEIGHT - 2 * r, 6, 12),
    new THREE.MeshLambertMaterial({ color: STAGE.dummy }),
  );
  mesh.position.set(x, y + KID_HEIGHT / 2, z);
  mesh.castShadow = true;
  return mesh;
}

export function makePlaceholderStage(opts: { field: boolean; characters: boolean }): THREE.Group | null {
  const group = new THREE.Group();
  group.name = '__renderPlaceholderStage';

  if (opts.field) {
    const grassMat = new THREE.MeshLambertMaterial({ color: STAGE.grass });
    const dirtMat = new THREE.MeshLambertMaterial({ color: STAGE.dirt });
    const chalkMat = new THREE.MeshLambertMaterial({ color: STAGE.chalk });

    const lawn = new THREE.Mesh(new THREE.CircleGeometry(600, 48), grassMat);
    lawn.rotation.x = -Math.PI / 2;
    lawn.receiveShadow = true;
    group.add(lawn);

    const homeDirt = new THREE.Mesh(new THREE.CircleGeometry(13, 32), dirtMat);
    homeDirt.rotation.x = -Math.PI / 2;
    homeDirt.position.y = 0.02;
    homeDirt.receiveShadow = true;
    group.add(homeDirt);

    const mound = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 0.8, 24), dirtMat);
    mound.position.set(0, 0.4, 46);
    mound.castShadow = true;
    mound.receiveShadow = true;
    group.add(mound);

    // Foul lines out to the ~200 ft fences, 45° off the plate-mound axis.
    for (const side of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 200), chalkMat);
      line.rotation.y = (side * Math.PI) / 4;
      line.position.set((side * 100) / Math.SQRT2, 0.03, 100 / Math.SQRT2);
      group.add(line);
    }

    // Bases, so the high preset has its bags to read.
    const bag = 60 / Math.SQRT2;
    for (const [bx, bz] of [
      [bag, bag],
      [0, 2 * bag],
      [-bag, bag],
    ]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.25, 2.5), chalkMat);
      base.position.set(bx, 0.12, bz);
      base.castShadow = true;
      group.add(base);
    }
  }

  if (opts.characters) {
    group.add(dummy(...BATTER_BOX)); // batter — the preset's 40%-height subject
    group.add(dummy(0, 0.8, 46)); // pitcher on the mound
  }

  return group.children.length > 0 ? group : null;
}
