// ---------------------------------------------------------------------------
// The neighborhood beyond the fence. Render-side only.
//
// Backyard Baseball's park reads as a PLACE because the fence has a world
// behind it — houses, trees, poles, a privacy fence — where ours read as a
// green screen. This module is that world: pure set dressing, outside the
// fence, that the sim never sees and the ball can never reach (everything is
// placed beyond `fenceDistAt` + a margin, pinned by `Scenery.test.ts`).
//
// Two rules keep it affordable at the 90-draw / 180k-tri budget:
//
//   1. ONE MESH PER LAYER, vertex-coloured. Every house, trunk, plank and
//      pole bakes its transform and colour into shared BufferGeometries and
//      merges — the whole neighborhood is a handful of draw calls, not one
//      per prop. (The turf shader owns hard-edged ground pattern; up here
//      flat-shaded facets WANT the soft vertex-colour read, so the trade
//      that was wrong for mow stripes is right for scenery.)
//
//   2. DETERMINISTIC placement. Layout comes from `sceneryPlan`, a pure
//      function of (geometry, venue) jittered by the shared `hash01` — the
//      same park every load, testable in Node, and no `Math.random` to make
//      two players' establishing shots disagree.
//
// No outlines and no shadows out here: the inverted hull would double the
// scenery's draw calls to sharpen edges 200ft into the aerial haze, and a
// house's shadow can never fall on the field.
// ---------------------------------------------------------------------------

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  QuadraticBezierCurve3,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FOUL_ANGLE_DEG, type FieldGeometry, type VenueId, fenceDistAt, pointAt } from '../sim/field';
import { hash01 } from '../../art/fieldTexture';
import { makeToonMaterial } from './materials/toon';

// --- The plan: pure, deterministic, testable --------------------------------

export interface SceneryItem {
  kind: 'house' | 'tree' | 'bush' | 'pole' | 'shed';
  /** Spray angle from home, degrees (negative = left field). */
  sprayDeg: number;
  /** Distance from home, ft — always beyond the fence at that spray. */
  distFt: number;
  /** Footprint radius, ft. The placement test asserts the whole footprint clears the fence. */
  radiusFt: number;
  /** Prop heading, radians about Y. */
  rotY: number;
  /** 0..1 size/colour variation seed. */
  seed: number;
}

/** How far past the fence the privacy fence ring sits, ft. */
export const RING_OFFSET_FT = 18;
/** Nothing solid may sit closer to the fence than this, ft. */
export const CLEARANCE_FT = 10;
/** The turf plane is 560x400 with home 80ft from the near edge (Field.ts);
 *  scenery must sit ON it, with margin for the prop's own footprint. */
export const TURF_BOUND = { maxAbsX: 270, minZ: -70, maxZ: 310 } as const;

interface VenueScenery {
  houses: number;
  trees: number;
  bushes: number;
  poles: number;
  /** House body palette, cycled with jitter. */
  housePalette: number[];
  roofPalette: number[];
  foliagePalette: number[];
  ringColor: number;
  /** Blacktop swaps gable houses for flat-roofed brick blocks. */
  cityBlocks: boolean;
}

const VENUE_SCENERY: Record<VenueId, VenueScenery> = {
  park: {
    houses: 7,
    trees: 12,
    bushes: 14,
    poles: 5,
    housePalette: [0x7fa8d9, 0xf0e3c0, 0xc96f5a, 0x9dc6a1, 0xd9b075, 0xb7c9e8, 0xe8c9a0],
    // Bright on purpose: the toon ramp's shadow step eats ~40% — a "slate"
    // roof authored at its real value reads as black from the plate.
    roofPalette: [0xa8705a, 0x93a8ba, 0xc9685a, 0xa89078],
    foliagePalette: [0x4e9e4e, 0x3f8f46, 0x63ad52, 0x57a04b],
    ringColor: 0xc9a56a,
    cityBlocks: false,
  },
  sandlot: {
    houses: 5,
    trees: 15,
    bushes: 10,
    poles: 4,
    housePalette: [0xe8d9b0, 0xc98a5a, 0xa8b9c9, 0xd9c084, 0xb98a6a],
    roofPalette: [0x9b7a55, 0xa88a63, 0x8a7355],
    foliagePalette: [0x5aa04b, 0x4a8f43, 0x6bad52, 0x3f7f3c],
    ringColor: 0xb08a52,
    cityBlocks: false,
  },
  blacktop: {
    houses: 8,
    trees: 5,
    bushes: 6,
    poles: 6,
    housePalette: [0xb96f52, 0xd9b896, 0x9aa4ad, 0xc9a084, 0xa8827a, 0x8f9bb0],
    roofPalette: [0x8f939c, 0x9b9080, 0x848a94],
    foliagePalette: [0x4e9e4e, 0x57a04b],
    ringColor: 0xb0b8bd,
    cityBlocks: true,
  },
};

/** Spread `n` slots across the fair arc with jitter, avoiding dead centre stacking. */
function slots(n: number, seedBase: number, span = 50): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push(-span + 2 * span * t + (hash01(i, seedBase) - 0.5) * (span / n));
  }
  return out;
}

export function sceneryPlan(geo: FieldGeometry, venue: VenueId): SceneryItem[] {
  const cfg = VENUE_SCENERY[venue];
  const items: SceneryItem[] = [];

  const clampSpray = (s: number): number => Math.max(-54, Math.min(54, s));

  // Houses sit behind the privacy fence ring, roughly facing home.
  slots(cfg.houses, 11).forEach((spray, i) => {
    const s = clampSpray(spray);
    const seed = hash01(i, 23);
    items.push({
      kind: 'house',
      sprayDeg: s,
      distFt: fenceDistAt(geo, s) + RING_OFFSET_FT + 28 + seed * 22,
      radiusFt: 16,
      rotY: Math.atan2(-pointAt(s, 1).x, -pointAt(s, 1).z) + (seed - 0.5) * 0.3,
      seed,
    });
  });

  // Trees fill the gaps between and behind the houses.
  slots(cfg.trees, 31, 54).forEach((spray, i) => {
    const s = clampSpray(spray + (hash01(i, 37) - 0.5) * 6);
    const seed = hash01(i, 41);
    items.push({
      kind: 'tree',
      sprayDeg: s,
      distFt: fenceDistAt(geo, s) + RING_OFFSET_FT + 8 + seed * 60,
      radiusFt: 6,
      rotY: seed * Math.PI * 2,
      seed,
    });
  });

  // Bushes soften the base of the privacy fence, in the fence/ring gap.
  slots(cfg.bushes, 53, 52).forEach((spray, i) => {
    const s = clampSpray(spray);
    const seed = hash01(i, 59);
    items.push({
      kind: 'bush',
      sprayDeg: s,
      distFt: fenceDistAt(geo, s) + CLEARANCE_FT + 3 + seed * (RING_OFFSET_FT - CLEARANCE_FT - 5),
      radiusFt: 2.5,
      rotY: seed * Math.PI * 2,
      seed,
    });
  });

  // Telephone poles march down the right-field side, wires sagging between.
  for (let i = 0; i < cfg.poles; i++) {
    const s = clampSpray(18 + i * 9);
    const seed = hash01(i, 67);
    items.push({
      kind: 'pole',
      sprayDeg: s,
      distFt: fenceDistAt(geo, s) + RING_OFFSET_FT + 4,
      radiusFt: 1,
      rotY: 0,
      seed,
    });
  }

  // One garden shed on the left side — the BB staple.
  const shedSpray = -38;
  items.push({
    kind: 'shed',
    sprayDeg: shedSpray,
    distFt: fenceDistAt(geo, shedSpray) + RING_OFFSET_FT + 14,
    radiusFt: 9,
    rotY: Math.atan2(-pointAt(shedSpray, 1).x, -pointAt(shedSpray, 1).z) + 0.2,
    seed: hash01(7, 71),
  });

  // Clamp everything onto the turf plane, preserving the fence clearance.
  return items.map((it) => {
    let p = pointAt(it.sprayDeg, it.distFt);
    let d = it.distFt;
    while (
      (Math.abs(p.x) > TURF_BOUND.maxAbsX - it.radiusFt || p.z > TURF_BOUND.maxZ - it.radiusFt) &&
      d > fenceDistAt(geo, it.sprayDeg) + CLEARANCE_FT + it.radiusFt
    ) {
      d -= 4;
      p = pointAt(it.sprayDeg, d);
    }
    return { ...it, distFt: d };
  });
}

// --- Geometry baking --------------------------------------------------------

/** Bake a colour onto every vertex, so the merged mesh needs ONE material. */
function paint(geom: BufferGeometry, hex: number): BufferGeometry {
  const c = new Color(hex).convertSRGBToLinear();
  const n = geom.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geom.setAttribute('color', new BufferAttribute(arr, 3));
  return geom;
}

/** Merged parts do not survive as objects, so UVs only need to exist. */
function place(geom: BufferGeometry, x: number, y: number, z: number, rotY = 0, scale = 1): BufferGeometry {
  const m = new Matrix4()
    .makeRotationY(rotY)
    .premultiply(new Matrix4().makeTranslation(x, y, z))
    .multiply(new Matrix4().makeScale(scale, scale, scale));
  geom.applyMatrix4(m);
  return geom;
}

/** Place at a LOCAL offset inside a prop's rotated frame: T(x,0,z) · R(rotY) · T(local). */
function placeLocal(
  geom: BufferGeometry,
  x: number,
  z: number,
  rotY: number,
  lx: number,
  ly: number,
  lz: number
): BufferGeometry {
  const m = new Matrix4()
    .makeTranslation(lx, ly, lz)
    .premultiply(new Matrix4().makeRotationY(rotY))
    .premultiply(new Matrix4().makeTranslation(x, 0, z));
  geom.applyMatrix4(m);
  return geom;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(seed * arr.length) % arr.length];
}

// --- The builder ------------------------------------------------------------

export interface SceneryBuild {
  root: Group;
  dispose(): void;
}

export function buildScenery(geo: FieldGeometry, venue: VenueId): SceneryBuild {
  const cfg = VENUE_SCENERY[venue];
  const plan = sceneryPlan(geo, venue);
  const parts: BufferGeometry[] = [];

  for (const it of plan) {
    const p = pointAt(it.sprayDeg, it.distFt);
    if (it.kind === 'house') addHouse(parts, cfg, p.x, p.z, it.rotY, it.seed);
    else if (it.kind === 'tree') addTree(parts, cfg, p.x, p.z, it.rotY, it.seed);
    else if (it.kind === 'bush') addBush(parts, cfg, p.x, p.z, it.seed);
    else if (it.kind === 'shed') addShed(parts, p.x, p.z, it.rotY);
  }
  addPrivacyRing(parts, geo, cfg);
  addPoleRun(
    parts,
    plan.filter((it) => it.kind === 'pole').map((it) => pointAt(it.sprayDeg, it.distFt))
  );

  const root = new Group();
  root.name = 'scenery';

  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  const mat = makeToonMaterial({ color: 0xffffff, rimStrength: 0.12 });
  mat.vertexColors = true;
  const mesh = new Mesh(merged, mat);
  mesh.name = 'neighborhood';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);

  const clouds = buildClouds();
  root.add(clouds);

  return {
    root,
    dispose() {
      merged.dispose();
      clouds.geometry.dispose();
    },
  };
}

// A house: body + gable roof + door + two windows (+ chimney on some).
function addHouse(parts: BufferGeometry[], cfg: VenueScenery, x: number, z: number, rotY: number, seed: number): void {
  const w = 22 + seed * 10;
  const h = cfg.cityBlocks ? 22 + seed * 14 : 12 + seed * 4;
  const d = 18 + seed * 6;
  const body = pick(cfg.housePalette, seed);
  const roof = pick(cfg.roofPalette, hash01(Math.floor(seed * 97), 3));

  parts.push(place(paint(new BoxGeometry(w, h, d), body), x, h / 2, z, rotY));

  if (cfg.cityBlocks) {
    // Flat parapet cap.
    parts.push(place(paint(new BoxGeometry(w + 1.5, 1.2, d + 1.5), roof), x, h + 0.6, z, rotY));
  } else {
    // Gable roof: a box rotated 45° reads as a prism at this distance for a
    // quarter of the triangles a real prism-with-caps costs after merging.
    const half = w / 2;
    const rh = half * 0.55;
    const ridge = new BoxGeometry(half * 1.05, half * 1.05, d + 2);
    ridge.applyMatrix4(new Matrix4().makeRotationZ(Math.PI / 4));
    ridge.applyMatrix4(new Matrix4().makeScale(1, rh / (half * 0.74), 1));
    parts.push(place(paint(ridge, roof), x, h, z, rotY));
    if (seed > 0.55) {
      parts.push(place(paint(new BoxGeometry(2.2, 5, 2.2), 0xb0684f), x + w * 0.22, h + rh * 0.7, z, rotY));
    }
  }

  // Door and windows on the home-facing wall — tiny boxes proud of the face.
  const face = d / 2 + 0.15;
  parts.push(placeLocal(paint(new BoxGeometry(3.4, 6.5, 0.4), 0x6b4a33), x, z, rotY, 0, 3.25, face));
  for (const side of [-1, 1]) {
    parts.push(
      placeLocal(paint(new BoxGeometry(3.6, 3.2, 0.4), 0xdff0f8), x, z, rotY, side * w * 0.28, h * 0.55, face)
    );
  }
}

// A tree: trunk + 3 foliage balls. Low-poly spheres; the toon ramp does the rest.
function addTree(parts: BufferGeometry[], cfg: VenueScenery, x: number, z: number, rotY: number, seed: number): void {
  const trunkH = 8 + seed * 5;
  const r = 5 + seed * 3.5;
  parts.push(place(paint(new CylinderGeometry(0.7, 1.1, trunkH, 6), 0x8a5f3c), x, trunkH / 2, z));
  const g1 = pick(cfg.foliagePalette, seed);
  const g2 = pick(cfg.foliagePalette, hash01(Math.floor(seed * 89), 5));
  parts.push(place(paint(new SphereGeometry(r, 8, 6), g1), x, trunkH + r * 0.55, z));
  parts.push(
    place(paint(new SphereGeometry(r * 0.7, 8, 6), g2), x + Math.cos(rotY) * r * 0.7, trunkH + r * 0.35, z + Math.sin(rotY) * r * 0.7)
  );
  parts.push(
    place(paint(new SphereGeometry(r * 0.6, 8, 6), g1), x - Math.cos(rotY) * r * 0.6, trunkH + r * 0.75, z - Math.sin(rotY) * r * 0.55)
  );
}

function addBush(parts: BufferGeometry[], cfg: VenueScenery, x: number, z: number, seed: number): void {
  const r = 1.6 + seed * 1.2;
  parts.push(place(paint(new SphereGeometry(r, 7, 5), pick(cfg.foliagePalette, seed)), x, r * 0.7, z));
}

function addShed(parts: BufferGeometry[], x: number, z: number, rotY: number): void {
  parts.push(place(paint(new BoxGeometry(14, 9, 10), 0xe8d9a8), x, 4.5, z, rotY));
  const roof = new BoxGeometry(10.5, 10.5, 12);
  roof.applyMatrix4(new Matrix4().makeRotationZ(Math.PI / 4));
  roof.applyMatrix4(new Matrix4().makeScale(1, 0.5, 1));
  parts.push(place(paint(roof, 0x9a6b47), x, 9, z, rotY));
}

// The privacy-fence ring: per-plank thin boxes with jittered wood tones, so
// the slats read without a texture, and a post at every joint.
function addPrivacyRing(parts: BufferGeometry[], geo: FieldGeometry, cfg: VenueScenery): void {
  const H = 6.5;
  const SEGS = 76;
  const span = FOUL_ANGLE_DEG + 12;
  const at = (s: number): { x: number; z: number } =>
    pointAt(s, fenceDistAt(geo, Math.max(-FOUL_ANGLE_DEG, Math.min(FOUL_ANGLE_DEG, s))) + RING_OFFSET_FT);
  for (let i = 0; i < SEGS; i++) {
    const a = at(-span + (2 * span * i) / SEGS);
    const b = at(-span + (2 * span * (i + 1)) / SEGS);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const jitter = 0.92 + hash01(i, 83) * 0.16;
    const tone = new Color(cfg.ringColor).multiplyScalar(jitter).getHex();
    parts.push(
      place(paint(new BoxGeometry(0.4, H, len + 0.2), tone), (a.x + b.x) / 2, H / 2, (a.z + b.z) / 2, yaw)
    );
    if (i % 4 === 0) {
      parts.push(place(paint(new BoxGeometry(0.9, H + 0.7, 0.9), shade(cfg.ringColor, 0.75)), a.x, (H + 0.7) / 2, a.z));
    }
  }
}

function shade(hex: number, f: number): number {
  return new Color(hex).multiplyScalar(f).getHex();
}

// Telephone poles + sagging wires between consecutive tops.
function addPoleRun(parts: BufferGeometry[], poles: Array<{ x: number; z: number }>): void {
  const H = 26;
  for (const p of poles) {
    parts.push(place(paint(new CylinderGeometry(0.35, 0.45, H, 5), 0x9b7a55), p.x, H / 2, p.z));
    parts.push(place(paint(new BoxGeometry(6, 0.5, 0.5), 0x8a6b47), p.x, H - 2.5, p.z));
  }
  for (let i = 0; i + 1 < poles.length; i++) {
    const a = poles[i];
    const b = poles[i + 1];
    for (const dy of [0, -1.2]) {
      const start = new Vector3(a.x, H - 2.5 + dy, a.z);
      const end = new Vector3(b.x, H - 2.5 + dy, b.z);
      const mid = start.clone().lerp(end, 0.5).setY(H - 6.5 + dy);
      const curve = new QuadraticBezierCurve3(start, mid, end);
      parts.push(paint(new TubeGeometry(curve, 8, 0.09, 3), 0x3a3f4a));
    }
  }
}

// Puffy clouds: flattened sphere clusters far up in the dome. Their own mesh —
// they must not fog like ground objects, and white wants no vertex jitter.
function buildClouds(): Mesh {
  const parts: BufferGeometry[] = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const ang = -1.2 + (2.6 * i) / (N - 1) + (hash01(i, 91) - 0.5) * 0.3;
    const dist = 480 + hash01(i, 93) * 220;
    const x = Math.sin(ang) * dist;
    const z = Math.cos(ang) * dist * 0.9 + 80;
    const y = 170 + hash01(i, 97) * 120;
    const r = 22 + hash01(i, 101) * 18;
    for (let k = 0; k < 4; k++) {
      const dx = (hash01(i * 7 + k, 103) - 0.5) * r * 2.4;
      const dz = (hash01(i * 7 + k, 107) - 0.5) * r * 0.8;
      const rr = r * (0.55 + hash01(i * 7 + k, 109) * 0.5);
      const ball = new SphereGeometry(rr, 8, 6);
      ball.applyMatrix4(new Matrix4().makeScale(1, 0.55, 1));
      parts.push(place(paint(ball, 0xffffff), x + dx, y, z + dz));
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  const mat = makeToonMaterial({ color: 0xffffff, rimStrength: 0 });
  mat.vertexColors = true;
  mat.fog = false;
  const mesh = new Mesh(merged, mat);
  mesh.name = 'clouds';
  mesh.castShadow = false;
  return mesh;
}
