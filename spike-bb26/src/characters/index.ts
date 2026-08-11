// OWNER: characters agent. Registers ctx 'characters' and populates the scene
// with the cast: batter LARGE at the plate (the steam-02 homage — cream hoodie,
// green cap, orange bangs), pitcher mid-windup on the mound, catcher crouched,
// four infielders in orange team tees, and five watching kids along the fence.
//
// Registered API (ctx.get('characters')):
//   makeKid(seedOffset, outfit?) — deterministic kid Group (NOT added to the
//     scene); same seedOffset + outfit ⇒ identical kid regardless of call order.
//   pose(kid, name) / poseNames — static pose presets (poses.ts); pose() resets
//     all joints first, so the animation owner can re-pose freely.
//   cast — the placed kids: { batter, pitcher, catcher, first, second, short,
//     third, watchers: Kid[] }. Skeleton part names are documented in kid.ts.
//   root — the group holding every placed kid.
//   kidHeightFt — nominal standing height before hair (4.6).
//
// Determinism: ONE draw from ctx 'rng' seeds the subsystem; kids and placement
// jitter come from per-offset sub-rngs (rng.ts). Cast seed offsets start at
// 1000 so ad-hoc makeKid callers can use 0-999 without colliding.

import * as THREE from 'three';
import type { Ctx } from '../core/ctx';
import type { Rng } from '../core/rng';
import { subRng } from './rng';
import { MatCache, type MaterialsLike } from './parts';
import { buildKid, KID_HEIGHT_FT, type OutfitSpec } from './kid';
import { pose, POSE_NAMES, type PoseName } from './poses';

type FieldLike = {
  groundYAt(x: number, z: number): number;
};

export type CharactersApi = {
  root: THREE.Group;
  cast: {
    batter: THREE.Group;
    pitcher: THREE.Group;
    catcher: THREE.Group;
    first: THREE.Group;
    second: THREE.Group;
    short: THREE.Group;
    third: THREE.Group;
    watchers: THREE.Group[];
  };
  makeKid(seedOffset: number, outfit?: OutfitSpec): THREE.Group;
  pose(kid: THREE.Group, name: PoseName): void;
  poseNames: readonly PoseName[];
  kidHeightFt: number;
};

/** Face a kid (built looking down local +z) toward a world point. */
function faceToward(kid: THREE.Group, x: number, z: number): void {
  kid.rotation.y = Math.atan2(x - kid.position.x, z - kid.position.z);
}

export function init(ctx: Ctx): void {
  const baseSeed = Math.floor(ctx.get<Rng>('rng').next() * 2 ** 31);
  const materials = ctx.get<MaterialsLike>('materials');
  const field = ctx.get<FieldLike>('field');
  const { scene } = ctx.get<{ scene: THREE.Scene }>('render');

  const mats = new MatCache(materials);
  const makeKid = (seedOffset: number, outfit: OutfitSpec = {}): THREE.Group =>
    buildKid(mats, subRng(baseSeed, seedOffset), outfit);

  const root = new THREE.Group();
  root.name = 'characters';

  // Soft blob contact shadow under every placed kid (verdict-005 fix 2: the
  // mound pitcher "floats on flat green" — the sun's 2048px shadow map spreads
  // too thin over the ±260ft box to ground a distant kid). One shared
  // radial-alpha texture; tint derives from the palette via ctx materials, so
  // no color literal lives here.
  const shadowMat = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const ink = new THREE.Color(materials.rawColor('hudInk'));
    const rgb = `${Math.round(ink.r * 255)},${Math.round(ink.g * 255)},${Math.round(ink.b * 255)}`;
    // Bold on purpose: the low gameplay cameras compress the disc to a few
    // rows of pixels, so a subtle 0.4-alpha smudge disappears — BB's own blob
    // shadows are hard dark ellipses.
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, `rgba(${rgb},0.8)`);
    grad.addColorStop(0.6, `rgba(${rgb},0.62)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // No mipmaps: at the gameplay cameras' grazing angles the mip chain
    // averages the mostly-transparent texture toward zero alpha and the
    // shadow vanishes entirely (measured: invisible at 0.72 alpha WITH mips,
    // solid at 1.0 only because its average survived the chain).
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      // Just enough offset to beat the lawn (and the dirt patches' -1): -4
      // was so strong the pitcher's disc drew OVER the rubber slab above it.
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -2,
    });
  })();

  const place = (kid: THREE.Group, x: number, z: number, poseName: PoseName): THREE.Group => {
    kid.position.set(x, field.groundYAt(x, z), z);
    pose(kid, poseName);
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.2), shadowMat);
    disc.rotation.x = -Math.PI / 2;
    // ~1.7in off the ground: high enough to win the depth test against the
    // lawn/dirt at 100ft grazing distances (0.04-0.06 lost to precision and
    // needed a rubber-stomping polygonOffset), low enough that no gap reads.
    disc.position.y = 0.14;
    disc.renderOrder = 1; // draw after the ground; depthWrite off keeps the kid over it
    kid.add(disc);
    root.add(kid);
    return kid;
  };

  // --- batter: the steam-02 redhead homage, open stance at the third-base box.
  const batter = makeKid(1000, {
    skin: 'skinPale',
    hairColor: 'hairOrange',
    hairStyle: 'crew',
    cap: 'capGreen',
    shirt: 'jerseyCream',
    sleeves: 'long',
    hood: true,
    bottoms: 'jerseyBlue',
    legs: 'pants',
    sneakers: 'hudYellow',
    socks: false,
    bat: true,
    face: { mouth: 'grim' },
    heightScale: 1.02,
  });
  place(batter, -2.6, 0.5, 'stanceBat');
  // Open stance, swung toward the plate cameras: with the stanceBat head yaw
  // this puts the head in rear-3/4 — cheek, nose and near eye on screen in the
  // pitching view (verdict-002 fix 1), like steam-02's batter.
  batter.rotation.y = 0.72;

  // --- the fielding team: orange tees (frame-080's team), varied everything else.
  const team: OutfitSpec = { shirt: 'jerseyOrange', sleeves: 'short', glove: true };

  // Forced OPEN mouth: the pitcher is the one face looking at the batting
  // camera — a rolled thin 'grim' line vanishes at his ~60px head size.
  // Glove stays ON (team default): the windup pose tucks it at his chest.
  const pitcher = makeKid(1001, { ...team, ball: true, cap: 'jerseyBlue', face: { mouth: 'open' } });
  place(pitcher, 0, 46, 'windup');
  faceToward(pitcher, 0, 0);

  const catcher = makeKid(1002, { ...team, cap: 'jerseyRed', legs: 'shorts' });
  place(catcher, 0.9, -3.6, 'crouchCatch');
  faceToward(catcher, 0, 46);

  const infield: [number, number, number][] = [
    [36, 42, 1003], // first
    [18, 78, 1004], // second (beside the bag, not on it)
    [-16, 76, 1005], // short
    [-33, 34, 1006], // third — nudged plate-ward, clear of the hose at (-46, 57)
  ];
  const fielders = infield.map(([x, z, seed]) => {
    const kid = makeKid(seed, team);
    place(kid, x, z, 'ready');
    faceToward(kid, 0, 0);
    return kid;
  });

  // --- watchers: neighborhood kids scattered along the fence line and hedges.
  const watcherSpots: [number, number][] = [
    [78, 148],
    [-62, 168], // clear of the coiled garden hose in right foul ground
    [38, 172],
    [-32, 180],
    [112, 112],
  ];
  const idles: PoseName[] = ['idle', 'idleWave', 'idleHips', 'idleCross', 'idle'];
  const watchers = watcherSpots.map(([x, z], i) => {
    const kid = makeKid(1010 + i);
    const jitter = subRng(baseSeed, 2000 + i);
    place(kid, x + jitter.range(-4, 4), z + jitter.range(-4, 4), idles[i]);
    faceToward(kid, jitter.range(-15, 15), jitter.range(-5, 10));
    return kid;
  });

  scene.add(root);

  const api: CharactersApi = {
    root,
    cast: {
      batter,
      pitcher,
      catcher,
      first: fielders[0],
      second: fielders[1],
      short: fielders[2],
      third: fielders[3],
      watchers,
    },
    makeKid,
    pose,
    poseNames: POSE_NAMES,
    kidHeightFt: KID_HEIGHT_FT,
  };
  ctx.set('characters', api);
}
