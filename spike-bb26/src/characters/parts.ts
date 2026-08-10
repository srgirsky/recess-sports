// OWNER: characters agent. Shared building blocks for the kid generator: the
// palette-backed material cache, rounded-form helpers (lathe / squashed-sphere
// blobs — never bare boxes), and the equipment meshes (bat, glove, ball,
// sneaker, mitten hand). Units are FEET; a kid is ~4.6 ft tall.
//
// Color rule: hex lives only in materials/palette.ts. Everything here resolves
// palette KEYS through ctx 'materials' (rawColor), with an optional derived
// shade factor — computed shades of palette colors, never new literals.

import * as THREE from 'three';

/** The slice of ctx 'materials' this subsystem consumes (import type only). */
export type MaterialsLike = {
  rawColor(key: string): string;
};

export class MatCache {
  private cache = new Map<string, THREE.MeshLambertMaterial>();
  constructor(private readonly materials: MaterialsLike) {}

  /** Lambert material for a palette key, optionally shaded (0..1 darkens, >1 lightens). */
  get(key: string, shade = 1, doubleSide = false): THREE.MeshLambertMaterial {
    const id = `${key}|${shade}|${doubleSide ? 'd' : 's'}`;
    let m = this.cache.get(id);
    if (!m) {
      const c = new THREE.Color(this.materials.rawColor(key));
      if (shade !== 1) c.multiplyScalar(shade);
      m = new THREE.MeshLambertMaterial({ color: c, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide });
      this.cache.set(id, m);
    }
    return m;
  }

  /** Self-lit variant for face features (sclera, teeth): partly emissive so eye
   * whites stay WHITE on the shadow side of the head — verdict-001's "faces are
   * unreadable dark smudges at gameplay distance" was mostly Lambert shading. */
  glow(key: string, shade = 1, strength = 0.55): THREE.MeshLambertMaterial {
    const id = `${key}|${shade}|g${strength}`;
    let m = this.cache.get(id);
    if (!m) {
      const c = new THREE.Color(this.materials.rawColor(key));
      if (shade !== 1) c.multiplyScalar(shade);
      m = new THREE.MeshLambertMaterial({
        color: c.clone().multiplyScalar(1 - strength * 0.55),
        emissive: c.clone().multiplyScalar(strength),
      });
      this.cache.set(id, m);
    }
    return m;
  }
}

/** Squashed-sphere blob — the core rounded form. */
export function blob(
  mat: THREE.Material,
  r: number,
  scale: [number, number, number],
  pos: [number, number, number],
  segs = 20,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, segs, Math.max(10, Math.round(segs * 0.7))), mat);
  mesh.scale.set(...scale);
  mesh.position.set(...pos);
  return mesh;
}

/** Capsule along local Y, centered so its top cap sits at y=0 (hangs downward). */
export function limbSegment(mat: THREE.Material, r: number, len: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r) + r, 6, 14), mat);
  mesh.position.y = -len / 2;
  return mesh;
}

/** Lathe from (radius, y) pairs — merged rounded silhouettes (torso, bat). */
export function lathe(mat: THREE.Material, profile: [number, number][], segs = 22): THREE.Mesh {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.Mesh(new THREE.LatheGeometry(pts, segs), mat);
}

/** Chunky mitt hand: fat palm + real thumb + two knuckle bumps so fingers read
 * in silhouette. side: -1 right, +1 left (thumb faces in). */
export function mittenHand(skin: THREE.Material, side: number): THREE.Group {
  const g = new THREE.Group();
  g.add(blob(skin, 0.2, [0.9, 1.05, 1.0], [0, -0.09, 0]));
  // Thumb: a stubby capsule angled off the palm, not a pea.
  const thumb = blob(skin, 0.1, [0.85, 1.35, 0.85], [-side * 0.17, -0.04, 0.1], 12);
  thumb.rotation.z = side * 0.55;
  g.add(thumb);
  // Knuckle bumps along the outer edge — finger hint at distance.
  g.add(blob(skin, 0.085, [1, 1.1, 1], [side * 0.13, -0.22, 0.05], 10));
  g.add(blob(skin, 0.075, [1, 1.05, 1], [side * 0.04, -0.27, 0.06], 10));
  return g;
}

/** Chunky cartoon sneaker, toe pointing +z, ankle at origin, sole at y=-0.2.
 * Oversized on purpose — shoe mass is a silhouette anchor (verdict-001). */
export function sneaker(body: THREE.Material, trim: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(blob(body, 0.3, [0.95, 0.75, 1.35], [0, 0.0, 0.12]));
  g.add(blob(trim, 0.31, [0.94, 0.34, 1.4], [0, -0.13, 0.12])); // fat white sole
  g.add(blob(trim, 0.17, [1.05, 0.78, 0.85], [0, -0.06, 0.48], 14)); // toe cap
  g.add(blob(body, 0.16, [1, 0.9, 0.8], [0, 0.06, -0.22], 12)); // heel collar
  return g;
}

/** Wooden bat, knob at origin, barrel up +y, ~2.3 ft. */
export function bat(wood: THREE.Material, tape: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bat';
  const body = lathe(wood, [
    [0.001, 0],
    [0.09, 0.015],
    [0.095, 0.05],
    [0.058, 0.11],
    [0.055, 0.55],
    [0.075, 1.05],
    [0.105, 1.55],
    [0.12, 2.0],
    [0.118, 2.22],
    [0.09, 2.3],
    [0.001, 2.33],
  ]);
  g.add(body);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.32, 12), tape);
  grip.position.y = 0.32;
  g.add(grip);
  return g;
}

/** Fielder's glove worn over a hand: fat pad + finger bumps + thumb. */
export function glove(leather: THREE.Material, dark: THREE.Material, side: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'glove';
  g.add(blob(leather, 0.24, [1.0, 1.12, 0.62], [0, -0.08, 0.04]));
  for (let i = 0; i < 3; i++) {
    g.add(blob(leather, 0.095, [1, 1.25, 1], [(i - 1) * 0.13, 0.14, 0.05], 10));
  }
  g.add(blob(leather, 0.1, [1.15, 1, 1], [side * 0.22, -0.05, 0.08], 10));
  g.add(blob(dark, 0.13, [1, 1, 0.4], [0, -0.05, 0.16], 10)); // pocket shadow
  return g;
}

/** Baseball for the pitcher's hand — white with two red stitch arcs. */
export function ball(white: THREE.Material, stitch?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'ball';
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), white));
  if (stitch) {
    for (const s of [-1, 1]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 6, 16, 2.2), stitch);
      arc.position.x = s * 0.045;
      arc.rotation.y = s * 0.7;
      arc.rotation.z = -1.1;
      g.add(arc);
    }
  }
  return g;
}
