// OWNER: characters agent. The face — the single biggest read at gameplay
// distance (see steam-04's close-up kid). Built to the verdict-001 spec: white
// sclera ellipses ~1/4 head width with big dark pupils, thick sculpted brows, a
// chunky protruding nose, a mouth that can open (dark interior + teeth strip +
// tongue), and ears. Sclera and teeth use MatCache.glow() — partly emissive —
// so the face reads even on the shadow side of the head; Lambert-only whites
// were verdict-001's "unreadable dark smudges". All features are blobs pushed
// proud of the skull surface so they survive at distance without texture work.
// Coordinates are relative to the SKULL CENTER; skull radii (0.84, 0.78, 0.76).

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
    // Verdict-002: bias to OPEN — the dark mouth interior is the feature that
    // still reads when everything else has washed out at distance.
    mouth: rng.pick(['open', 'open', 'open', 'smile', 'grim'] as const),
    browTilt: rng.range(-0.18, 0.3),
    eyeGap: rng.range(0.26, 0.31),
    // Verdict-002: sized for a ~60px head (the batting-view pitcher), not a
    // close-up. Whites are 0.42-0.48 across on a 1.68-wide head — a shade OVER
    // steam-04's 1/4 head width, because BB draws faces oversized on purpose.
    eyeSize: rng.range(0.21, 0.24),
    noseSize: rng.range(0.11, 0.14),
    blush: rng.chance(0.3),
  };
}

export function buildFace(mats: MatCache, skinKey: string, hairKey: string, f: FaceRecipe): THREE.Group {
  const g = new THREE.Group();
  g.name = 'face';

  const white = mats.glow('cloudLit', 1, 0.68);
  const ink = mats.get('hudInk');
  const skin = mats.get(skinKey);
  const skinDark = mats.get(skinKey, 0.85);
  const brow = mats.get(hairKey, 0.72);

  // Eyes: big white ovals + pupils + glints, poking well proud of the skull.
  // Eye line at y 0.10; the fringe (hair.ts) and cap brim are pinned ABOVE
  // y ≈ 0.44 so nothing dark ever crosses the whites — verdict-002's smudge
  // was the old fringe mass dipping to y 0.22, right through the eye tops.
  for (const s of [-1, 1]) {
    const x = s * f.eyeGap;
    g.add(blob(white, f.eyeSize, [0.95, 1.25, 0.5], [x, 0.1, 0.66]));
    // Pupil: big and dark, sitting on the sclera's front face.
    g.add(blob(ink, 0.105, [1, 1.15, 0.45], [x - s * 0.02, 0.07, 0.66 + f.eyeSize * 0.48], 12));
    g.add(blob(mats.glow('cloudLit', 1, 0.8), 0.042, [1, 1, 0.7], [x + s * 0.02, 0.15, 0.7 + f.eyeSize * 0.48], 8));
    // Brow: thick sculpted dash in a darkened hair tone, proud of the fringe.
    const b = blob(brow, 0.08, [2.4, 0.85, 0.6], [x + s * 0.01, 0.44, 0.68], 10);
    b.rotation.z = s * -f.browTilt;
    g.add(b);
  }

  // Chunky nose, slightly darker than the skin so it reads as a form.
  g.add(blob(skinDark, f.noseSize, [1.05, 0.85, 0.95], [0, -0.1, 0.76], 14));

  // Ears — small and tucked low; big high ears turn brown kids into bears.
  for (const s of [-1, 1]) g.add(blob(skin, 0.1, [0.5, 0.95, 0.85], [s * 0.8, -0.08, 0.02], 12));

  // Mouth — sized to survive a ~60px head (verdict-002 spec), not a close-up.
  if (f.mouth === 'open') {
    g.add(blob(ink, 0.26, [1.25, 0.85, 0.35], [0, -0.4, 0.56])); // dark interior
    g.add(blob(mats.glow('cloudLit', 1, 0.45), 0.15, [1.55, 0.42, 0.42], [0, -0.26, 0.6], 12)); // teeth strip
    g.add(blob(mats.get('hudRed', 0.85), 0.13, [1.15, 0.55, 0.5], [0, -0.5, 0.58], 10)); // tongue
  } else if (f.mouth === 'smile') {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.065, 8, 20, 2.1), ink);
    arc.position.set(0, -0.26, 0.64);
    arc.rotation.z = Math.PI + (Math.PI - 2.1) / 2;
    g.add(arc);
    // Lower-lip hint under the smile so it reads as a mouth, not a scratch.
    g.add(blob(skinDark, 0.085, [1.7, 0.55, 0.5], [0, -0.46, 0.6], 10));
  } else {
    g.add(blob(ink, 0.065, [3.0, 0.75, 0.55], [0, -0.36, 0.62], 10));
  }

  if (f.blush) {
    for (const s of [-1, 1]) g.add(blob(mats.get('buntPink'), 0.09, [1.2, 0.75, 0.25], [s * 0.47, -0.18, 0.55], 10));
  }

  return g;
}
