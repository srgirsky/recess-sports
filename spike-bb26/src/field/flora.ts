// OWNER: field agent. The green layers that give the yard depth: three tree
// species (lumpy broccoli crowns, stacked-cone conifers, columnar poplars)
// plus small blossoming fruit trees just past the fence, clipped hedges that
// peek over it and bridge the back-row house gaps, flower beds along the
// fence base inside the yard, and a distant treeline that melts into the
// render fog. Depth order (fence → yard props → houses → back row →
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

/** Conifer: a stack of squashed cones — a hard silhouette break from the
 *  round broccoli crowns, in the darker hedge greens so it reads as a
 *  different species even in fog. */
function pine(m: MaterialsApi, x: number, z: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunkH = h * 0.18;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(h * 0.018 + 0.35, h * 0.026 + 0.5, trunkH + h * 0.2, 8),
    m.wood('woodDark', { worldSize: [2.5, trunkH] }),
  );
  trunk.position.y = (trunkH + h * 0.2) / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const mat = m.foliage('hedge', { worldSize: [h * 0.5, h * 0.5] });
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = h * 0.24 * (1 - t * 0.55);
    const coneH = h * 0.42 * (1 - t * 0.18);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, coneH, 10), mat);
    cone.position.y = trunkH + h * (0.16 + t * 0.3) + coneH / 2;
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

/** Poplar: one tall narrow column — the third distinct canopy shape. */
function poplar(m: MaterialsApi, x: number, z: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunkH = h * 0.16;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.7, trunkH * 1.6, 8),
    m.wood('woodDark', { worldSize: [2, trunkH] }),
  );
  trunk.position.y = (trunkH * 1.6) / 2;
  g.add(trunk);
  const crownH = h - trunkH;
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(crownH / 2, 9, 9),
    m.foliage('tree', { worldSize: [h * 0.4, h * 0.8] }),
  );
  crown.scale.set(0.34, 1, 0.34);
  crown.position.y = trunkH + crownH / 2;
  crown.castShadow = true;
  g.add(crown);
  return g;
}

/** Small yard fruit tree: one round crown flecked with blossoms. */
function fruitTree(m: MaterialsApi, rng: Rng, x: number, z: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunkH = h * 0.38;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, trunkH, 7),
    m.wood('woodDark', { worldSize: [2, trunkH] }),
  );
  trunk.position.y = trunkH / 2;
  g.add(trunk);
  const r = h * 0.36;
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(r, 9, 8),
    m.foliage('tree', { worldSize: [r * 2, r * 2] }),
  );
  crown.scale.y = 0.9;
  crown.position.y = trunkH + r * 0.72;
  crown.castShadow = true;
  g.add(crown);
  const bloomColors = ['buntPink', 'cloverWhite'];
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, Math.PI * 2);
    const ele = rng.range(-0.2, 1.0);
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(rng.range(0.28, 0.45), 6, 5),
      flat(m, rng.pick(bloomColors)),
    );
    bloom.position.set(
      Math.cos(a) * r * 0.88,
      trunkH + r * 0.72 + ele * r * 0.8,
      Math.sin(a) * r * 0.88,
    );
    g.add(bloom);
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
  // Three species (broccoli crown / conifer / poplar column) at deliberately
  // uneven scales so no two neighbours repeat a silhouette.
  const treeSpots: [number, number, number, number][] = [
    [26, 258, 44, 36], // the big center-left crown
    [84, 232, 27, 20], // dropped small so its neighbour reads bigger
    [166, 288, 41, 33],
    [230, 250, 24, 17], // small against the corner pines
    [-24, 312, 36, 28], // behind the cream house
    [-118, 300, 46, 37], // grown into the layer's biggest crown
    [-196, 268, 30, 22],
    [-250, 320, 39, 31],
  ];
  for (const [x, z, h, s] of treeSpots) group.add(tree(m, rng, x, z, h, s));

  // Conifers and poplars interleaved through the crowns.
  group.add(pine(m, -70, 264, 46));
  group.add(pine(m, 134, 318, 40));
  group.add(pine(m, -262, 286, 36));
  group.add(pine(m, 258, 296, 44));
  group.add(poplar(m, 198, 238, 33));
  group.add(poplar(m, -34, 248, 27));
  group.add(poplar(m, -216, 312, 42));
  group.add(poplar(m, 108, 262, 30));
  group.add(poplar(m, -178, 272, 38));

  // Small fruit trees against the fence line.
  group.add(fruitTree(m, rng, 58, 300, 17));
  group.add(fruitTree(m, rng, -144, 244, 15));

  // Hedges peeking over the fence line.
  group.add(hedge(m, -168, 212, 42, 8.5, 0.5));
  group.add(hedge(m, 108, 214, 30, 8, -0.35));
  group.add(hedge(m, 150, 250, 26, 7, 0.1));
  group.add(hedge(m, -30, 236, 20, 7.5, 0.05));

  // Hedge runs bridging the gaps between the back-row houses, so the second
  // depth layer reads continuous instead of houses floating on lawn.
  group.add(hedge(m, 216, 348, 46, 9, 0.12));
  group.add(hedge(m, 96, 372, 52, 8, -0.06));
  group.add(hedge(m, -52, 378, 44, 9.5, 0.08));
  group.add(hedge(m, -172, 352, 50, 8.5, -0.14));
  group.add(hedge(m, -268, 336, 38, 9, 0.2));

  // The lawn corners past the fence ends, left (+x) and right (-x), were bare
  // green to the frame edge — bank them closed with hedge + mixed trees.
  group.add(hedge(m, 224, 128, 36, 9, -1.05));
  group.add(tree(m, rng, 252, 158, 34, 27));
  group.add(pine(m, 228, 190, 38));
  group.add(fruitTree(m, rng, 204, 108, 14));
  group.add(hedge(m, -226, 134, 40, 9.5, 1.1));
  group.add(tree(m, rng, -254, 168, 37, 29));
  group.add(poplar(m, -230, 196, 34));
  group.add(fruitTree(m, rng, -206, 112, 13));

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
