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
  kind:
    | 'house'
    | 'tree'
    | 'bush'
    | 'pole'
    | 'shed'
    | 'tower'
    | 'dumpster'
    | 'kiosk'
    | 'pool'
    | 'playset'
    | 'barn'
    | 'tires'
    | 'bleacher'
    | 'dome_portal'
    | 'bench'
    | 'bike'
    | 'flowerbed'
    | 'mailbox'
    | 'chalkboard'
    | 'crates'
    | 'pennant';
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
  /** Extra silhouette/prop language that makes two city courts different. */
  theme:
    | 'suburb'
    | 'city'
    | 'alley'
    | 'gardens'
    | 'backyard'
    | 'playground'
    | 'acres'
    | 'dirt'
    | 'stadium'
    | 'dome';
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
    theme: 'suburb',
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
    theme: 'suburb',
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
    theme: 'city',
  },
  tin_can: {
    houses: 11,
    trees: 1,
    bushes: 0,
    poles: 5,
    housePalette: [0x9b503e, 0xb56349, 0x7e463a, 0xc27a56, 0x8b5450],
    roofPalette: [0x50565c, 0x64696c, 0x454b52],
    foliagePalette: [0x4f7848],
    ringColor: 0x6d7275,
    cityBlocks: true,
    theme: 'alley',
  },
  cement: {
    houses: 10,
    trees: 4,
    bushes: 8,
    poles: 5,
    housePalette: [0xb67858, 0xd0a079, 0x9f6754, 0xc38b6a, 0xaa7462],
    roofPalette: [0x77736e, 0x8d8175, 0x686b70],
    foliagePalette: [0x538c4f, 0x629a58, 0x477f48],
    ringColor: 0xc3a05e,
    cityBlocks: true,
    theme: 'gardens',
  },
  steele: {
    houses: 8,
    trees: 10,
    bushes: 12,
    poles: 4,
    housePalette: [0xe6d6aa, 0x91b7d4, 0xca735d, 0xa9c690],
    roofPalette: [0xa67555, 0x8799a8, 0xb56758],
    foliagePalette: [0x4c9947, 0x61ab52, 0x3f8741],
    ringColor: 0xb98a56,
    cityBlocks: false,
    theme: 'backyard',
  },
  playground: {
    houses: 3,
    trees: 8,
    bushes: 6,
    poles: 5,
    housePalette: [0xc96c58, 0xe6cf9f, 0x779cc2],
    roofPalette: [0x768696, 0xa16b55],
    foliagePalette: [0x4b984c, 0x61aa56],
    ringColor: 0x547f9e,
    cityBlocks: false,
    theme: 'playground',
  },
  eckman: {
    houses: 3,
    trees: 18,
    bushes: 12,
    poles: 3,
    housePalette: [0xe0cf9f, 0xc58d5d, 0xb6c59a],
    roofPalette: [0x8c6d50, 0x9e7b58],
    foliagePalette: [0x628f42, 0x769f48, 0x4d7f3f],
    ringColor: 0x9a7a4d,
    cityBlocks: false,
    theme: 'acres',
  },
  dirt_yards: {
    houses: 4,
    trees: 4,
    bushes: 2,
    poles: 4,
    housePalette: [0xa96848, 0xc28a5e, 0x8c5c48],
    roofPalette: [0x765747, 0x8a6450],
    foliagePalette: [0x6f8540, 0x5c793b],
    ringColor: 0x8b5736,
    cityBlocks: false,
    theme: 'dirt',
  },
  big_city: {
    houses: 12,
    trees: 3,
    bushes: 4,
    poles: 6,
    housePalette: [0x9a796d, 0xb2907a, 0x7e8796, 0xa76f63],
    roofPalette: [0x626b76, 0x77716b],
    foliagePalette: [0x468b4f, 0x57995b],
    ringColor: 0x425c7c,
    cityBlocks: true,
    theme: 'stadium',
  },
  dome: {
    houses: 0,
    trees: 0,
    bushes: 0,
    poles: 0,
    housePalette: [0x777777],
    roofPalette: [0x777777],
    foliagePalette: [0x447755],
    ringColor: 0x625c96,
    cityBlocks: false,
    theme: 'dome',
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

  // Four light towers, close behind the fence — the floods the night key
  // light claims to hang from, and honest daytime park furniture. Fixed
  // sprays, no jitter: towers are INSTALLED, not scattered.
  for (const spray of [-42, -14, 14, 42]) {
    items.push({
      kind: 'tower',
      sprayDeg: spray,
      distFt: fenceDistAt(geo, spray) + CLEARANCE_FT + 4,
      radiusFt: 2,
      rotY: Math.atan2(-pointAt(spray, 1).x, -pointAt(spray, 1).z),
      seed: hash01(spray + 100, 113),
    });
  }

  // One garden shed on neighborhood fields — stadiums, the farm and the dome
  // have a larger signature structure instead.
  if (!['acres', 'stadium', 'dome'].includes(cfg.theme)) {
    const shedSpray = -38;
    items.push({
      kind: 'shed',
      sprayDeg: shedSpray,
      distFt: fenceDistAt(geo, shedSpray) + RING_OFFSET_FT + 14,
      radiusFt: 9,
      rotY: Math.atan2(-pointAt(shedSpray, 1).x, -pointAt(shedSpray, 1).z) + 0.2,
      seed: hash01(7, 71),
    });
  }

  // Tin Can Alley earns its name at ground level: recycling dumpsters hug the
  // brick wall instead of being implied by a grey palette.
  if (cfg.theme === 'alley') {
    for (const [i, spray] of [-28, 3, 31].entries()) {
      items.push({
        kind: 'dumpster',
        sprayDeg: spray,
        distFt: fenceDistAt(geo, spray) + CLEARANCE_FT + 4,
        radiusFt: 4,
        rotY: Math.atan2(-pointAt(spray, 1).x, -pointAt(spray, 1).z),
        seed: hash01(i, 149),
      });
    }
  }

  // Cement Gardens is a commandeered shopping-court car park. The espresso
  // kiosk is the prop that survives every camera and separates it from the
  // brick alley before a player reads the chip label.
  if (cfg.theme === 'gardens') {
    const spray = -30;
    items.push({
      kind: 'kiosk',
      sprayDeg: spray,
      distFt: fenceDistAt(geo, spray) + CLEARANCE_FT + 7,
      radiusFt: 7,
      rotY: Math.atan2(-pointAt(spray, 1).x, -pointAt(spray, 1).z),
      seed: hash01(3, 151),
    });
  }

  const signature = (
    kind: SceneryItem['kind'],
    sprayDeg: number,
    radiusFt: number,
    extra = 0
  ) => items.push({
    kind,
    sprayDeg,
    distFt: fenceDistAt(geo, sprayDeg) + CLEARANCE_FT + radiusFt + extra,
    radiusFt,
    rotY: Math.atan2(-pointAt(sprayDeg, 1).x, -pointAt(sprayDeg, 1).z),
    seed: hash01(radiusFt, sprayDeg + 173),
  });
  if (cfg.theme === 'backyard') signature('pool', -27, 10, 2);
  if (cfg.theme === 'playground') signature('playset', 28, 9, 2);
  if (cfg.theme === 'acres') signature('barn', -24, 14, 4);
  if (cfg.theme === 'dirt') {
    signature('tires', -24, 4);
    signature('tires', 4, 4);
    signature('tires', 29, 4);
  }
  if (cfg.theme === 'stadium') {
    signature('bleacher', -25, 13, 2);
    signature('bleacher', 25, 13, 2);
  }
  if (cfg.theme === 'dome') signature('dome_portal', 0, 18, 2);

  // The production environment kit: small story props shared as a vocabulary,
  // composed differently per park. Parks #2 is the proof scene and carries the
  // densest set; the other ten use the same affordable modules without becoming
  // palette swaps of one neighborhood.
  const kit: SceneryItem['kind'][] = [
    'bench', 'bike', 'flowerbed', 'mailbox', 'chalkboard', 'crates', 'pennant',
  ];
  const venueIndex = Object.keys(VENUE_SCENERY).indexOf(venue);
  const detailCount = venue === 'park' ? 5 : 3;
  for (let i = 0; i < detailCount; i++) {
    signature(kit[(venueIndex * 2 + i) % kit.length], -40 + i * (80 / (detailCount - 1)), 5, 3);
  }

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

/**
 * Paint a gable roof with baked two-tone slopes.
 *
 * ★ A FLAT-PAINTED ROOF READS AS A HOLE FROM THE OUTFIELD CAMERAS. The gable
 * is a box rotated 45°, so seen ridge-on its silhouette is a diamond — and
 * when the house happens to sit behind CF, BOTH visible slopes face away from
 * the key light, land on the toon ramp's darkest step together, and the whole
 * shape renders one flat dark diamond floating on the sky (re-audit #7's
 * "giant unlit black triangle behind CF"). Baking a light/dark split across
 * the ridge into the vertex colours keeps the prism readable from any angle
 * under any key, for zero extra triangles or draws.
 */
function paintGable(geom: BufferGeometry, roofHex: number, bodyHex: number): BufferGeometry {
  paint(geom, roofHex);
  const lit = new Color(shade(roofHex, 1.18)).convertSRGBToLinear();
  const dark = new Color(shade(roofHex, 0.72)).convertSRGBToLinear();
  const wall = new Color(bodyHex).convertSRGBToLinear();
  const normals = geom.getAttribute('normal');
  const colors = geom.getAttribute('color') as BufferAttribute;
  for (let i = 0; i < normals.count; i++) {
    const nx = normals.getX(i);
    if (Math.abs(nx) < 0.2) {
      // The ridge-end CAPS are the diamond the outfield camera stares at.
      // A real house shows its gable WALL there, so they wear the body
      // colour and the "roof" survives as the two shaded slopes.
      colors.setXYZ(i, wall.r, wall.g, wall.b);
      continue;
    }
    const c = nx > 0 ? lit : dark;
    colors.setXYZ(i, c.r, c.g, c.b);
  }
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

export interface SceneryOptions {
  /** Evening: house windows paint LIT (warm) instead of glass-blue. */
  night?: boolean;
}

export function buildScenery(geo: FieldGeometry, venue: VenueId, opts: SceneryOptions = {}): SceneryBuild {
  const cfg = VENUE_SCENERY[venue];
  const plan = sceneryPlan(geo, venue);
  const parts: BufferGeometry[] = [];

  for (const it of plan) {
    const p = pointAt(it.sprayDeg, it.distFt);
    if (it.kind === 'house') addHouse(parts, cfg, p.x, p.z, it.rotY, it.seed, opts.night === true);
    else if (it.kind === 'tree') addTree(parts, cfg, p.x, p.z, it.rotY, it.seed);
    else if (it.kind === 'bush') addBush(parts, cfg, p.x, p.z, it.seed);
    else if (it.kind === 'shed') addShed(parts, p.x, p.z, it.rotY);
    else if (it.kind === 'tower') addLightTower(parts, p.x, p.z, it.rotY, opts.night === true);
    else if (it.kind === 'dumpster') addDumpster(parts, p.x, p.z, it.rotY, it.seed);
    else if (it.kind === 'kiosk') addKiosk(parts, p.x, p.z, it.rotY, opts.night === true);
    else if (it.kind === 'pool') addPool(parts, p.x, p.z, it.rotY);
    else if (it.kind === 'playset') addPlayset(parts, p.x, p.z, it.rotY);
    else if (it.kind === 'barn') addBarn(parts, p.x, p.z, it.rotY);
    else if (it.kind === 'tires') addTires(parts, p.x, p.z, it.rotY);
    else if (it.kind === 'bleacher') addBleacher(parts, p.x, p.z, it.rotY);
    else if (it.kind === 'dome_portal') addDomePortal(parts, p.x, p.z, it.rotY);
    else if (it.kind === 'bench') addBench(parts, p.x, p.z, it.rotY);
    else if (it.kind === 'bike') addBike(parts, p.x, p.z, it.rotY, it.seed);
    else if (it.kind === 'flowerbed') addFlowerbed(parts, cfg, p.x, p.z, it.rotY, it.seed);
    else if (it.kind === 'mailbox') addMailbox(parts, p.x, p.z, it.rotY, it.seed);
    else if (it.kind === 'chalkboard') addChalkboard(parts, p.x, p.z, it.rotY, it.seed);
    else if (it.kind === 'crates') addCrates(parts, p.x, p.z, it.rotY, it.seed);
    else if (it.kind === 'pennant') addPennant(parts, p.x, p.z, it.rotY, it.seed);
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

  // The dome's ceiling light must never have outdoor clouds drifting through it.
  const clouds = cfg.theme === 'dome' ? null : buildClouds(opts.night === true);
  if (clouds) root.add(clouds);

  return {
    root,
    dispose() {
      merged.dispose();
      clouds?.geometry.dispose();
    },
  };
}

// A house: body + gable roof + door + two windows (+ chimney on some).
function addHouse(parts: BufferGeometry[], cfg: VenueScenery, x: number, z: number, rotY: number, seed: number, night = false): void {
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
    parts.push(place(paintGable(ridge, roof, body), x, h, z, rotY));
    if (seed > 0.55) {
      parts.push(place(paint(new BoxGeometry(2.2, 5, 2.2), 0xb0684f), x + w * 0.22, h + rh * 0.7, z, rotY));
    }
  }

  // Door and windows on the home-facing wall — tiny boxes proud of the face.
  const face = d / 2 + 0.15;
  parts.push(placeLocal(paint(new BoxGeometry(3.4, 6.5, 0.4), 0x6b4a33), x, z, rotY, 0, 3.25, face));
  // Foundation, sill/crossbars and imperfect facade patches create readable
  // material history without another texture or draw. They are modules, not a
  // random-noise shader, so the same house stays the same between visits.
  parts.push(placeLocal(paint(new BoxGeometry(w + 0.25, 1.05, 0.32), shade(body, 0.72)), x, z, rotY, 0, 0.55, face));
  parts.push(placeLocal(paint(new SphereGeometry(0.18, 6, 4), 0xe0b64d), x, z, rotY, 1.05, 3.25, face + 0.28));
  for (const side of [-1, 1]) {
    // Day: glass reflecting sky. Night: somebody is home. (Vertex colour, not
    // emissive — one merged material serves the whole neighborhood, and under
    // the dim night key a bright warm paint reads lit enough at 250ft.)
    parts.push(
      placeLocal(
        paint(new BoxGeometry(3.6, 3.2, 0.4), night ? 0xffdf8a : 0xdff0f8),
        x, z, rotY, side * w * 0.28, h * 0.55, face
      )
    );
    parts.push(placeLocal(paint(new BoxGeometry(0.22, 3.4, 0.46), 0xf3ead5), x, z, rotY, side * w * 0.28, h * 0.55, face + 0.08));
    parts.push(placeLocal(paint(new BoxGeometry(3.8, 0.22, 0.46), 0xf3ead5), x, z, rotY, side * w * 0.28, h * 0.55, face + 0.08));
  }
  for (let i = 0; i < 3; i++) {
    const px = (hash01(i, Math.floor(seed * 997)) - 0.5) * w * 0.72;
    const py = 2 + hash01(i, Math.floor(seed * 619)) * Math.max(2, h - 4);
    parts.push(placeLocal(paint(new BoxGeometry(2.2 + i * 0.5, 0.32, 0.28), shade(body, 0.82)), x, z, rotY, px, py, face + 0.04));
  }

  if (cfg.theme === 'alley') {
    // Fire-escape platforms and ladders, proud of the home-facing brick wall.
    // Blocky silhouettes are intentional at 180ft and stay in the merged draw.
    for (const y of [8, 14, 20].filter((v) => v < h - 1)) {
      parts.push(placeLocal(paint(new BoxGeometry(w * 0.56, 0.45, 3), 0x4d555b), x, z, rotY, 0, y, face + 1.2));
      for (const side of [-1, 1]) {
        parts.push(placeLocal(paint(new BoxGeometry(0.35, 3.2, 0.35), 0x42494f), x, z, rotY, side * w * 0.26, y + 1.6, face + 2.4));
      }
    }
  } else if (cfg.theme === 'gardens') {
    // Shopfront awning and window boxes: warmer, lower street furniture than
    // the alley's vertical steel, so both city venues read at silhouette range.
    parts.push(placeLocal(paint(new BoxGeometry(w * 0.72, 0.65, 3.6), 0xe7c24b), x, z, rotY, 0, 7.2, face + 1.6));
    for (const side of [-1, 1]) {
      parts.push(placeLocal(paint(new BoxGeometry(4.4, 0.9, 1.2), 0x5f9b55), x, z, rotY, side * w * 0.28, h * 0.39, face + 0.7));
    }
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
  parts.push(place(paintGable(roof, 0x9a6b47, 0xe8d9a8), x, 9, z, rotY));
}

/** Recycling dumpster: body, sloped lid, wheels, and a bright side badge. */
function addDumpster(
  parts: BufferGeometry[],
  x: number,
  z: number,
  rotY: number,
  seed: number
): void {
  const body = seed > 0.5 ? 0x2f7b67 : 0x397760;
  parts.push(place(paint(new BoxGeometry(7.5, 4.5, 4.8), body), x, 2.25, z, rotY));
  const lid = new BoxGeometry(8, 0.55, 5.2);
  lid.applyMatrix4(new Matrix4().makeRotationX(-0.12));
  parts.push(place(paint(lid, 0x39464a), x, 4.8, z, rotY));
  for (const side of [-1, 1]) {
    parts.push(placeLocal(paint(new CylinderGeometry(0.55, 0.55, 0.7, 8), 0x30343a), x, z, rotY, side * 2.6, 0.65, 2.25));
  }
  parts.push(placeLocal(paint(new BoxGeometry(3.1, 1.5, 0.2), 0xe8e0c4), x, z, rotY, 0, 2.7, 2.5));
}

/** Cement Gardens' espresso kiosk: striped canopy, serving window, roof sign. */
function addKiosk(
  parts: BufferGeometry[],
  x: number,
  z: number,
  rotY: number,
  night: boolean
): void {
  parts.push(place(paint(new BoxGeometry(12, 9, 9), 0xefd7aa), x, 4.5, z, rotY));
  parts.push(placeLocal(paint(new BoxGeometry(7.5, 4.2, 0.35), night ? 0xffdf8a : 0x82b8c5), x, z, rotY, 0, 5.1, 4.65));
  parts.push(placeLocal(paint(new BoxGeometry(13.5, 0.7, 3.5), 0xd9584c), x, z, rotY, 0, 8.7, 5.5));
  for (const side of [-1, 1]) {
    parts.push(placeLocal(paint(new BoxGeometry(2.2, 0.72, 3.6), 0xf5e2b7), x, z, rotY, side * 4.2, 8.75, 5.55));
  }
  parts.push(placeLocal(paint(new BoxGeometry(8.5, 2.4, 0.6), 0x4d775f), x, z, rotY, 0, 11.2, 0));
}

/** Steele's unmistakable backyard pool and diving board. */
function addPool(parts: BufferGeometry[], x: number, z: number, rotY: number): void {
  parts.push(place(paint(new CylinderGeometry(10, 10, 0.35, 24), 0x58cce0), x, 0.18, z, rotY));
  for (const side of [-1, 1]) {
    parts.push(placeLocal(paint(new BoxGeometry(1.2, 0.55, 19), 0xe9e1cd), x, z, rotY, side * 9.7, 0.35, 0));
    parts.push(placeLocal(paint(new BoxGeometry(19, 0.55, 1.2), 0xe9e1cd), x, z, rotY, 0, 0.35, side * 9.7));
  }
  parts.push(placeLocal(paint(new BoxGeometry(2.2, 0.35, 7), 0xf2f0e7), x, z, rotY, 0, 1.2, -7));
}

/** Playground Commons' slide, deck and swing frame. */
function addPlayset(parts: BufferGeometry[], x: number, z: number, rotY: number): void {
  for (const side of [-1, 1]) {
    parts.push(placeLocal(paint(new BoxGeometry(0.7, 10, 0.7), 0x3d74a5), x, z, rotY, side * 3.5, 5, 0));
  }
  parts.push(placeLocal(paint(new BoxGeometry(8, 0.7, 6), 0xe5b43f), x, z, rotY, 0, 6.2, 0));
  const slide = new BoxGeometry(3.2, 0.55, 10);
  slide.applyMatrix4(new Matrix4().makeRotationX(-0.55));
  parts.push(placeLocal(paint(slide, 0xd9504d), x, z, rotY, 0, 3.7, 6));
  parts.push(placeLocal(paint(new BoxGeometry(12, 0.65, 0.65), 0x3d74a5), x, z, rotY, 0, 10, -4));
  for (const side of [-1, 1]) {
    parts.push(placeLocal(paint(new BoxGeometry(0.28, 6, 0.28), 0xd9d2bc), x, z, rotY, side * 3.2, 6.8, -4));
  }
}

/** Eckman Acres' broad red barn. */
function addBarn(parts: BufferGeometry[], x: number, z: number, rotY: number): void {
  parts.push(place(paint(new BoxGeometry(24, 12, 18), 0xb6463e), x, 6, z, rotY));
  parts.push(placeLocal(paint(new BoxGeometry(7, 8, 0.5), 0xf0dfbf), x, z, rotY, 0, 4, 9.25));
  for (const side of [-1, 1]) {
    const roof = new BoxGeometry(15, 0.8, 20);
    roof.applyMatrix4(new Matrix4().makeRotationZ(side * 0.48));
    parts.push(placeLocal(paint(roof, 0x6f574b), x, z, rotY, side * 5.6, 13.7, 0));
  }
}

/** Dirt Yards' stacks of discarded tires. */
function addTires(parts: BufferGeometry[], x: number, z: number, rotY: number): void {
  for (let i = 0; i < 3; i++) {
    parts.push(placeLocal(paint(new CylinderGeometry(2.2, 2.2, 0.9, 14), 0x2d3032), x, z, rotY, 0, 0.5 + i * 0.85, 0));
  }
  parts.push(placeLocal(paint(new CylinderGeometry(0.8, 0.8, 3, 12), 0xb96f42), x, z, rotY, 0, 1.4, 0));
}

/** Big City Stadium's two compact banks of bleachers. */
function addBleacher(parts: BufferGeometry[], x: number, z: number, rotY: number): void {
  for (let i = 0; i < 4; i++) {
    parts.push(placeLocal(paint(new BoxGeometry(24, 0.65, 4), 0xa9b4bd), x, z, rotY, 0, 1.2 + i * 1.7, -4 + i * 2.2));
    parts.push(placeLocal(paint(new BoxGeometry(22, 1.2 + i * 1.7, 0.55), 0x66717a), x, z, rotY, 0, (1.2 + i * 1.7) / 2, -5.8 + i * 2.2));
  }
}

/** The dome's glowing centre-field structural arch. */
function addDomePortal(parts: BufferGeometry[], x: number, z: number, rotY: number): void {
  // Three concentric roof ribs make a CANOPY at gameplay distance; the first
  // pass used a 32ft portal that vanished behind the 12ft wall from the plate.
  for (const [span, height, depth, color] of [
    [56, 48, 14, 0x65d9df],
    [47, 42, 3, 0x7068aa],
    [38, 35, -8, 0x65d9df],
  ] as const) {
    const curve = new QuadraticBezierCurve3(
      new Vector3(-span, 0, 0),
      new Vector3(0, height, 0),
      new Vector3(span, 0, 0)
    );
    parts.push(placeLocal(paint(new TubeGeometry(curve, 24, 1.15, 7, false), color), x, z, rotY, 0, 0, depth));
  }
  parts.push(placeLocal(paint(new BoxGeometry(22, 7, 1), 0x282d55), x, z, rotY, 0, 17, 1));
}

// --- Production environment kit -------------------------------------------

function addBench(parts: BufferGeometry[], x: number, z: number, rotY: number): void {
  const wood = 0xb87845;
  for (const y of [1.5, 3.2]) {
    parts.push(placeLocal(paint(new BoxGeometry(7.5, 0.55, 1.05), wood), x, z, rotY, 0, y, 0));
  }
  for (const side of [-1, 1]) {
    parts.push(placeLocal(paint(new BoxGeometry(0.45, 3.4, 0.45), 0x59636b), x, z, rotY, side * 2.8, 1.7, -0.15));
  }
}

function addBike(parts: BufferGeometry[], x: number, z: number, rotY: number, seed: number): void {
  const ink = 0x303944;
  const frame = seed > 0.5 ? 0xe75b53 : 0x4f8fc7;
  for (const side of [-1, 1]) {
    const wheel = new CylinderGeometry(1.35, 1.35, 0.12, 12);
    wheel.rotateX(Math.PI / 2);
    parts.push(placeLocal(paint(wheel, ink), x, z, rotY, side * 1.65, 1.45, 0));
  }
  const bar = (ax: number, ay: number, bx: number, by: number, color = frame) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const g = new CylinderGeometry(0.09, 0.09, len, 5);
    g.rotateZ(Math.atan2(-dx, dy));
    g.translate((ax + bx) / 2, (ay + by) / 2, 0);
    parts.push(placeLocal(paint(g, color), x, z, rotY, 0, 0, 0));
  };
  bar(-1.65, 1.45, 0, 2.65);
  bar(0, 2.65, 1.65, 1.45);
  bar(-1.65, 1.45, 0.45, 1.45);
  bar(0.45, 1.45, 0, 2.65);
  bar(0, 2.65, 0.75, 3.3, ink);
}

function addFlowerbed(parts: BufferGeometry[], cfg: VenueScenery, x: number, z: number, rotY: number, seed: number): void {
  parts.push(placeLocal(paint(new BoxGeometry(8, 0.7, 3.2), 0x76533d), x, z, rotY, 0, 0.35, 0));
  const flowers = [0xf7d44a, 0xf06b72, 0x8d79d8, 0xf4efe2];
  for (let i = 0; i < 7; i++) {
    const lx = -3 + i;
    const lz = (hash01(i, Math.floor(seed * 401)) - 0.5) * 1.8;
    const h = 0.7 + hash01(i, 409) * 0.6;
    parts.push(placeLocal(paint(new CylinderGeometry(0.06, 0.08, h, 4), 0x4d8b4b), x, z, rotY, lx, 0.7 + h / 2, lz));
    parts.push(placeLocal(paint(new SphereGeometry(0.24, 6, 4), pick(flowers, hash01(i, 419))), x, z, rotY, lx, 0.72 + h, lz));
  }
  parts.push(placeLocal(paint(new SphereGeometry(1.15, 7, 5), pick(cfg.foliagePalette, seed)), x, z, rotY, 0, 0.85, -0.4));
}

function addMailbox(parts: BufferGeometry[], x: number, z: number, rotY: number, seed: number): void {
  const body = seed > 0.5 ? 0x5c84a7 : 0xd96355;
  parts.push(placeLocal(paint(new BoxGeometry(0.45, 4.5, 0.45), 0x7c5b3d), x, z, rotY, 0, 2.25, 0));
  parts.push(placeLocal(paint(new BoxGeometry(2.5, 1.4, 1.8), body), x, z, rotY, 0, 4.4, 0.35));
  parts.push(placeLocal(paint(new BoxGeometry(0.14, 1.5, 0.14), 0xe6c24a), x, z, rotY, 1.1, 5.3, 0.7));
}

function addChalkboard(parts: BufferGeometry[], x: number, z: number, rotY: number, seed: number): void {
  for (const side of [-1, 1]) {
    parts.push(placeLocal(paint(new BoxGeometry(0.45, 6.4, 0.45), 0x7d593b), x, z, rotY, side * 3, 3.2, 0));
  }
  parts.push(placeLocal(paint(new BoxGeometry(7, 4.4, 0.42), 0x33574b), x, z, rotY, 0, 4.4, 0));
  // Chalk inning marks: the crooked rhythm reads as hand-made at field range.
  for (let i = 0; i < 4; i++) {
    parts.push(placeLocal(paint(new BoxGeometry(0.16, 1.7, 0.48), 0xf1ead8), x, z, rotY, -1.7 + i * 0.85, 4.5 + (hash01(i, Math.floor(seed * 211)) - 0.5) * 0.25, 0.03));
  }
}

function addCrates(parts: BufferGeometry[], x: number, z: number, rotY: number, seed: number): void {
  const colors = [0xb77a43, 0x9c673b, 0xc28a52];
  for (let i = 0; i < 3; i++) {
    const s = 1.8 + hash01(i, Math.floor(seed * 307)) * 0.7;
    const lx = (i - 1) * 2.1;
    const y = i === 1 ? s * 1.35 : s / 2;
    parts.push(placeLocal(paint(new BoxGeometry(s, s, s), colors[i]), x, z, rotY, lx, y, i === 1 ? 0.2 : 0));
    parts.push(placeLocal(paint(new BoxGeometry(s * 0.78, 0.16, s + 0.08), 0xe0b06d), x, z, rotY, lx, y, i === 1 ? 0.2 : 0));
  }
}

function addPennant(parts: BufferGeometry[], x: number, z: number, rotY: number, seed: number): void {
  for (const side of [-1, 1]) {
    parts.push(placeLocal(paint(new CylinderGeometry(0.12, 0.16, 8, 5), 0x68727b), x, z, rotY, side * 5.2, 4, 0));
  }
  parts.push(placeLocal(paint(new BoxGeometry(10.4, 0.08, 0.08), 0xe4dcc8), x, z, rotY, 0, 7.2, 0));
  const colors = [0xe95852, 0xf2c84b, 0x4c91c6, 0x64a85b];
  for (let i = 0; i < 7; i++) {
    const flag = new BoxGeometry(0.72, 1.05, 0.12);
    flag.rotateZ(-0.18);
    parts.push(placeLocal(paint(flag, pick(colors, hash01(i, Math.floor(seed * 503)))), x, z, rotY, -4.5 + i * 1.5, 6.55, 0));
  }
}

// A ballpark light tower: lattice-suggesting pole, crossarm, and a 2x3 lamp
// bank facing home. The lamps are the point — at night they paint BRIGHT
// warm and visibly justify the flood-white key light's direction; by day
// they are grey glass. Merged like everything else: zero extra draw calls.
function addLightTower(parts: BufferGeometry[], x: number, z: number, rotY: number, night: boolean): void {
  const H = 36;
  parts.push(place(paint(new CylinderGeometry(0.55, 0.8, H, 6), 0x6f7a84), x, H / 2, z));
  // Crossarm, facing home.
  parts.push(placeLocal(paint(new BoxGeometry(9, 1.1, 0.9), 0x5a636c), x, z, rotY, 0, H - 1.5, 0));
  const lamp = night ? 0xfff4c8 : 0xcfd6da;
  for (const row of [0, 1]) {
    for (const colIdx of [-1, 0, 1]) {
      parts.push(
        placeLocal(
          paint(new BoxGeometry(2.2, 1.6, 0.7), lamp),
          x, z, rotY, colIdx * 2.9, H - 0.6 + row * 1.9, 0.5
        )
      );
    }
  }
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
function buildClouds(night = false): Mesh {
  const parts: BufferGeometry[] = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const ang = -1.2 + (2.6 * i) / (N - 1) + (hash01(i, 91) - 0.5) * 0.3;
    const dist = 470 + hash01(i, 93) * 180;
    const x = Math.sin(ang) * dist;
    const z = Math.cos(ang) * dist * 0.9 + 80;
    // Horizon-hugging on purpose. The behind-plate camera pitches DOWN at the
    // plate, so its frame top is only ~11° of elevation — clouds authored at a
    // "realistic" 170-290ft projected to NDC y 1.8-3.5, an empty sky in the
    // money shot (measured by projecting the vertices). ~50-100ft at this
    // distance sits at 4-8°: in frame, layered behind the rooftops.
    const y = 48 + hash01(i, 97) * 55;
    const r = 22 + hash01(i, 101) * 18;
    for (let k = 0; k < 4; k++) {
      const dx = (hash01(i * 7 + k, 103) - 0.5) * r * 2.4;
      const dz = (hash01(i * 7 + k, 107) - 0.5) * r * 0.8;
      const rr = r * (0.55 + hash01(i * 7 + k, 109) * 0.5);
      const ball = new SphereGeometry(rr, 8, 6);
      ball.applyMatrix4(new Matrix4().makeScale(1, 0.55, 1));
      parts.push(place(paint(ball, night ? 0x8593b0 : 0xffffff), x + dx, y, z + dz));
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
