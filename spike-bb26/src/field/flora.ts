// OWNER: field agent. The green layers that give the yard depth: lumpy
// cartoon trees just past the fence, clipped hedges that peek over it,
// flower beds along the fence base inside the yard, and a distant treeline
// that melts into the render fog. Depth order (fence → yard props → houses →
// treeline) is what keeps steam-02 reading as a neighborhood, not a backdrop.

import * as THREE from 'three';
import type { Rng } from '../core/rng';
import type { MaterialsApi } from '../materials/index';
import { flat } from './ground';

function tree(m: MaterialsApi, rng: Rng, x: number, z: number, h: number, spread: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunkH = h * 0.4;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(h * 0.02 + 0.4, h * 0.03 + 0.6, trunkH, 8),
    m.wood('woodDark', { worldSize: [3, trunkH] }),
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);

  const mat = m.foliage('tree', { worldSize: [spread * 1.3, spread * 1.3] });
  const blobs = 3 + rng.int(0, 2);
  const crownY = trunkH + (h - trunkH) * 0.45;
  const mainR = spread * 0.52;
  for (let i = 0; i < blobs; i++) {
    const r = i === 0 ? mainR : mainR * rng.range(0.55, 0.8);
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
    blob.scale.y = 0.82;
    if (i === 0) blob.position.y = crownY;
    else {
      const a = rng.range(0, Math.PI * 2);
      blob.position.set(
        Math.cos(a) * mainR * 0.6,
        crownY + rng.range(-0.2, 0.55) * mainR,
        Math.sin(a) * mainR * 0.6,
      );
    }
    blob.castShadow = true;
    g.add(blob);
  }
  return g;
}

function hedge(m: MaterialsApi, x: number, z: number, len: number, h: number, rotY: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const mat = m.foliage('hedge', { worldSize: [len, h] });
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, h, 3.2), mat);
  body.position.y = h / 2;
  body.castShadow = true;
  g.add(body);
  for (const bx of [-len * 0.3, 0.4, len * 0.32]) {
    const bump = new THREE.Mesh(new THREE.SphereGeometry(h * 0.35, 8, 6), mat);
    bump.scale.y = 0.7;
    bump.position.set(bx, h, 0);
    g.add(bump);
  }
  return g;
}

function flowerBed(m: MaterialsApi, rng: Rng, x: number, z: number, rotY: number, len: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(len, 1.1, 1.5),
    m.foliage('hedge', { worldSize: [len, 1.5] }),
  );
  base.position.y = 0.55;
  base.castShadow = true;
  g.add(base);
  const colors = ['dandelion', 'buntPink', 'buntRed', 'cloverWhite', 'buntYellow'];
  const n = Math.round(len * 1.6);
  for (let i = 0; i < n; i++) {
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(rng.range(0.24, 0.36), 6, 5), flat(m, rng.pick(colors)));
    bloom.position.set(rng.range(-len / 2 + 0.4, len / 2 - 0.4), 1.15 + rng.range(0, 0.35), rng.range(-0.5, 0.5));
    g.add(bloom);
  }
  return g;
}

export function buildFlora(m: MaterialsApi, rng: Rng): THREE.Group {
  const group = new THREE.Group();
  group.name = 'field-flora';

  // Near trees, layered between fence and houses. Frame-left is +x.
  const treeSpots: [number, number, number, number][] = [
    [26, 258, 42, 34], // the big center-left crown
    [84, 232, 34, 27],
    [166, 288, 38, 30],
    [230, 250, 30, 24],
    [-24, 312, 36, 28], // behind the cream house
    [-118, 300, 40, 32],
    [-196, 268, 34, 27],
    [-250, 320, 38, 30],
  ];
  for (const [x, z, h, s] of treeSpots) group.add(tree(m, rng, x, z, h, s));

  // Hedges peeking over the fence line.
  group.add(hedge(m, -168, 212, 42, 8.5, 0.5));
  group.add(hedge(m, 108, 214, 30, 8, -0.35));
  group.add(hedge(m, 150, 250, 26, 7, 0.1));
  group.add(hedge(m, -30, 236, 20, 7.5, 0.05));

  // Flower beds hugging the fence base inside the yard (deep corners).
  const bedSpots: [number, number][] = [
    [-32, -30],
    [-42, -18],
    [-52, 8],
    [30, -26],
    [44, 20],
  ];
  for (const [angDeg, skew] of bedSpots) {
    const a = (angDeg * Math.PI) / 180;
    const r = 188.5;
    group.add(flowerBed(m, rng, Math.sin(a) * r, Math.cos(a) * r, -a + skew * 0.001, rng.range(7, 11)));
  }

  // Distant treeline: big flattened blobs that the fog melts together.
  for (let i = 0; i < 13; i++) {
    const x = -480 + i * 78 + rng.range(-22, 22);
    const z = rng.range(430, 520);
    const r = rng.range(36, 56);
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry(r, 9, 7),
      m.foliage('tree', { worldSize: [r * 1.6, r * 1.6] }),
    );
    blob.scale.y = 0.62;
    blob.position.set(x, r * 0.38, z);
    group.add(blob);
  }

  return group;
}
