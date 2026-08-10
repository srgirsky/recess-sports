// OWNER: characters agent. Hair and headwear. Styles are silhouette-first:
// afro cloud, huge frame-080 ponytail, jaw-length bob, twin puffs, top curls,
// plain crew shell. Every style starts from a tilted hemispherical shell (tilt
// lifts the front edge off the face — the classic no-texture hairline trick).
// The cap (crown shell + half-disc brim + button) can layer over crew/fringe
// hair, like steam-02's redhead with orange bangs poking out.
// Coordinates relative to SKULL CENTER, radii (0.84, 0.78, 0.76) ft.

import * as THREE from 'three';
import { blob, MatCache } from './parts';
import type { KidRng } from './rng';

export type HairStyle = 'crew' | 'afro' | 'ponytail' | 'bob' | 'puffs' | 'curls';

export const HAIR_STYLES: readonly HairStyle[] = ['crew', 'afro', 'ponytail', 'bob', 'puffs', 'curls'];

function shell(
  mat: THREE.Material,
  radii: [number, number, number],
  thetaLength: number,
  tilt: number,
): THREE.Mesh {
  // 32 width segments: the open rim shows as a silhouette edge over the skull
  // and hair, and at 24 it scallops visibly on the caps.
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, thetaLength), mat);
  m.scale.set(...radii);
  m.rotation.x = tilt;
  return m;
}

/** Bang mass peeking out under a cap / over the forehead. */
export function fringe(mat: THREE.Material): THREE.Mesh {
  return blob(mat, 1, [0.58, 0.2, 0.32], [0, 0.42, 0.56], 16);
}

export function buildHair(mats: MatCache, colorKey: string, style: HairStyle, rng: KidRng): THREE.Group {
  const g = new THREE.Group();
  g.name = 'hairstyle';
  const mat = mats.get(colorKey);
  const dark = mats.get(colorKey, 0.85);

  switch (style) {
    case 'crew':
      // Theta 2.05: the shell must wrap the lower back of the skull, or a
      // forward-pitched head (catcher, fielders) shows bare scalp under a cap.
      g.add(shell(mat, [0.88, 0.83, 0.8], 2.05, -0.3));
      g.add(fringe(mat));
      // Nape mass — wide, so the whole under-cap back edge stays hair-colored.
      g.add(blob(mat, 1, [0.72, 0.48, 0.34], [0, -0.3, -0.58], 14));
      break;
    case 'afro': {
      g.add(shell(mat, [0.88, 0.83, 0.8], 1.9, -0.25));
      // Cloud of lumps over the upper hemisphere.
      const n = rng.int(8, 10);
      for (let i = 0; i < n; i++) {
        const az = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
        const el = rng.range(0.35, 1.1); // elevation above equator
        const r = rng.range(0.28, 0.38);
        const R = 0.62;
        g.add(
          blob(
            mat,
            r,
            [1, 1, 1],
            [R * Math.cos(el) * Math.sin(az), 0.18 + R * Math.sin(el), R * Math.cos(el) * Math.cos(az) - 0.08],
            12,
          ),
        );
      }
      g.add(blob(mat, 0.4, [1, 1, 1], [0, 0.78, -0.05], 12));
      break;
    }
    case 'ponytail': {
      g.add(shell(mat, [0.88, 0.85, 0.82], 2.0, -0.35));
      g.add(fringe(mat));
      // The huge frame-080 tail: descending lumps down the back.
      const tail: [number, number, number, number][] = [
        [0.3, 0.42, -0.82, 1],
        [0.27, 0.05, -0.98, 1],
        [0.24, -0.38, -1.04, 1],
        [0.2, -0.78, -0.98, 1],
        [0.15, -1.1, -0.86, 1],
      ];
      for (const [r, y, z] of tail) g.add(blob(mat, r, [0.9, 1.1, 1], [0, y, z], 14));
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16), mats.get('buntYellow'));
      band.position.set(0, 0.58, -0.72);
      band.rotation.x = Math.PI / 2 - 0.5;
      g.add(band);
      break;
    }
    case 'bob':
      g.add(shell(mat, [0.92, 0.9, 0.87], 2.15, -0.42));
      g.add(fringe(mat));
      g.add(blob(dark, 0.2, [1.1, 1.6, 1.1], [-0.78, -0.25, 0.05], 12));
      g.add(blob(dark, 0.2, [1.1, 1.6, 1.1], [0.78, -0.25, 0.05], 12));
      break;
    case 'puffs':
      // Side puffs, kept low and wide — high round ones read as bear ears.
      g.add(shell(mat, [0.87, 0.82, 0.79], 1.85, -0.3));
      g.add(blob(mat, 0.27, [1.05, 0.9, 1], [-0.68, 0.48, -0.12], 14));
      g.add(blob(mat, 0.27, [1.05, 0.9, 1], [0.68, 0.48, -0.12], 14));
      break;
    case 'curls': {
      g.add(shell(mat, [0.88, 0.84, 0.81], 1.9, -0.28));
      for (let i = 0; i < 6; i++) {
        const az = rng.range(0, Math.PI * 2);
        const rad = rng.range(0.15, 0.5);
        g.add(blob(mat, rng.range(0.16, 0.24), [1, 0.85, 1], [Math.sin(az) * rad, 0.72, Math.cos(az) * rad - 0.06], 10));
      }
      break;
    }
  }
  return g;
}

/** Ball cap: crown shell riding HIGH on the skull (verdict-001: the old
 * near-sphere crown swallowed the head to the shoulders — a neckless dome),
 * with a chunky blob brim as a separate mass, a crown seam, and a button. The
 * crown still dips below the hair shell at the back so hair never reads as a
 * second cap color (the two-tone-beret bug of the first capture). */
export function buildCap(mats: MatCache, colorKey: string): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cap';
  const mat = mats.get(colorKey);
  const crown = shell(mat, [0.95, 0.86, 0.9], 1.78, -0.28);
  crown.position.y = 0.03;
  g.add(crown);
  // Brim: a fat squashed blob, not a paper disc — it must read as its own mass.
  const brim = blob(mats.get(colorKey, 0.94), 0.5, [1.12, 0.16, 0.92], [0, 0.34, 0.88], 16);
  brim.rotation.x = 0.3;
  g.add(brim);
  // Front seam panel + button in a darker shade — construction lines.
  g.add(blob(mats.get(colorKey, 0.85), 0.09, [1, 0.65, 1], [0, 0.9, 0.02], 8));
  return g;
}
