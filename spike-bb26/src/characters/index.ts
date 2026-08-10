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

  const place = (kid: THREE.Group, x: number, z: number, poseName: PoseName): THREE.Group => {
    kid.position.set(x, field.groundYAt(x, z), z);
    pose(kid, poseName);
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
  batter.rotation.y = 0.42; // open to the mound, turned a touch toward the plate

  // --- the fielding team: orange tees (frame-080's team), varied everything else.
  const team: OutfitSpec = { shirt: 'jerseyOrange', sleeves: 'short', glove: true };

  const pitcher = makeKid(1001, { ...team, glove: false, ball: true, cap: 'jerseyBlue' });
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
