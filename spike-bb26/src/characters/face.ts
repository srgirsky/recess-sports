// OWNER: characters agent. The face — the single biggest read at gameplay
// distance (see steam-04's close-up kid). Big white eyes with dark pupils and a
// glint, floating brows, a chunky protruding nose, a real mouth (open smile
// with teeth and tongue, closed smile arc, or a determined grim), and ears.
// All features are blobs pushed slightly proud of the skull surface so they
// survive at distance without texture work. Coordinates are relative to the
// SKULL CENTER; skull radii are (0.84, 0.78, 0.76) ft.

import * as THREE from 'three';
import { blob, MatCache } from './parts';
import type { KidRng } from './rng';

export type FaceRecipe = {
  mouth: 'open' | 'smile' | 'grim';
  browTilt: number; // radians, + = angry-ish inner-down
  eyeGap: number; // half-distance between eye centers
  eyeSize: number;
  noseSize: number;
  blush: boolean;
};

export function rollFace(rng: KidRng): FaceRecipe {
  return {
    mouth: rng.pick(['open', 'open', 'smile', 'smile', 'grim'] as const),
    browTilt: rng.range(-0.18, 0.3),
    eyeGap: rng.range(0.23, 0.29),
    eyeSize: rng.range(0.135, 0.165),
    noseSize: rng.range(0.085, 0.115),
    blush: rng.chance(0.3),
  };
}

export function buildFace(mats: MatCache, skinKey: string, hairKey: string, f: FaceRecipe): THREE.Group {
  const g = new THREE.Group();
  g.name = 'face';

  const white = mats.get('cloudLit');
  const ink = mats.get('hudInk');
  const skin = mats.get(skinKey);
  const skinDark = mats.get(skinKey, 0.88);
  const hair = mats.get(hairKey);

  // Eyes: big white ovals + pupils + glints, poking ~0.04 proud of the skull.
  for (const s of [-1, 1]) {
    const x = s * f.eyeGap;
    g.add(blob(white, f.eyeSize, [1, 1.22, 0.55], [x, 0.06, 0.68]));
    g.add(blob(ink, 0.058, [1, 1.15, 0.5], [x - s * 0.01, 0.05, 0.68 + f.eyeSize * 0.62], 12));
    g.add(blob(white, 0.022, [1, 1, 0.8], [x + s * 0.02, 0.095, 0.7 + f.eyeSize * 0.62], 8));
    // Brow: floating thick dash of hair color.
    const brow = blob(hair, 0.042, [2.6, 0.75, 0.55], [x + s * 0.01, 0.28, 0.66], 10);
    brow.rotation.z = s * -f.browTilt;
    g.add(brow);
  }

  // Chunky nose, slightly darker than the skin so it reads as a form.
  g.add(blob(skinDark, f.noseSize, [1.05, 0.85, 0.9], [0, -0.09, 0.72], 14));

  // Ears — small and tucked low; big high ears turn brown kids into bears.
  for (const s of [-1, 1]) g.add(blob(skin, 0.1, [0.5, 0.95, 0.85], [s * 0.8, -0.08, 0.02], 12));

  // Mouth.
  if (f.mouth === 'open') {
    g.add(blob(ink, 0.16, [1.22, 0.78, 0.35], [0, -0.34, 0.6]));
    g.add(blob(white, 0.1, [1.45, 0.38, 0.42], [0, -0.26, 0.63], 12)); // teeth
    g.add(blob(mats.get('hudRed', 0.85), 0.08, [1.15, 0.5, 0.5], [0, -0.4, 0.62], 10)); // tongue
  } else if (f.mouth === 'smile') {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 8, 20, 2.1), ink);
    arc.position.set(0, -0.26, 0.66);
    arc.rotation.z = Math.PI + (Math.PI - 2.1) / 2;
    g.add(arc);
  } else {
    g.add(blob(ink, 0.035, [3.4, 0.7, 0.5], [0, -0.32, 0.66], 10));
  }

  if (f.blush) {
    for (const s of [-1, 1]) g.add(blob(mats.get('buntPink'), 0.09, [1.2, 0.75, 0.25], [s * 0.45, -0.16, 0.56], 10));
  }

  return g;
}
