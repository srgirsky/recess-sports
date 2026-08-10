// OWNER: characters agent. The kid assembler: one chunky stylized child as a
// THREE.Group of named, poseable parts. Proportions are the BB2026 read — head
// ~1/3 of body height, thick limbs, split-finger hands, big face — built from merged
// rounded forms (lathe torso, capsule limbs, blob everything), never boxes.
//
// Skeleton (pivot groups, all rotations start at 0 = standing straight,
// kid faces LOCAL +z, ground at y=0, ~4.6 ft tall before hair):
//
//   kid
//   ├─ legL / legR      hip pivots (x=±0.27, y=1.5); geometry hangs -y
//   │   └─ kneeL/kneeR  knee pivots (y -0.7 in leg space)
//   │       └─ footL/footR  ankle pivots (y -0.5 in knee space); sneaker +z
//   └─ hips             torso pivot (y=1.5): twist/lean moves everything above
//       ├─ torso        shirt lathe + shorts + hood
//       ├─ armL / armR  shoulder pivots (x=±0.46, y=1.24 in hips space)
//       │   └─ elbowL/elbowR (y -0.6)
//       │       └─ handL/handR (y -0.52) — fingered hand; bat/glove/ball parent here
//       └─ head         neck pivot (y=1.52 in hips space); skull center +1.02
//           ├─ face (face.ts) · hairstyle (hair.ts) · cap
//
// userData: { recipe, hipsY } — poses use hipsY to restore crouch offsets.

import * as THREE from 'three';
import { MatCache, blob, lathe, limbSegment, mittenHand, sneaker, bat, glove, ball } from './parts';
import { buildFace, rollFace, type FaceRecipe } from './face';
import { buildHair, buildCap, HAIR_STYLES, type HairStyle } from './hair';
import type { KidRng } from './rng';

export const KID_HEIGHT_FT = 4.6;

export type OutfitSpec = {
  skin?: string;
  hairColor?: string;
  hairStyle?: HairStyle;
  cap?: string | null; // palette key, or null = bare head
  shirt?: string;
  sleeves?: 'tank' | 'short' | 'long';
  hood?: boolean;
  bottoms?: string;
  legs?: 'shorts' | 'pants';
  sneakers?: string;
  socks?: boolean;
  bat?: boolean;
  glove?: boolean;
  ball?: boolean;
  heightScale?: number;
  bulk?: number;
  face?: Partial<FaceRecipe>;
};

export type KidRecipe = Required<Omit<OutfitSpec, 'face'>> & { face: FaceRecipe };

const SKINS = ['skinPale', 'skinPeach', 'skinTan', 'skinBrown', 'skinDeep'];
const HAIRS = ['hairBlack', 'hairBlack', 'hairBrown', 'hairOrange', 'hairBlonde'];
const SHIRTS = ['jerseyRed', 'jerseyBlue', 'jerseyGreen', 'jerseyOrange', 'jerseyPurple', 'jerseyTeal', 'jerseyCream'];
const BOTTOMS = ['jerseyBlue', 'jerseyNavy', 'jerseyRed', 'jerseyGreen', 'hudOrange', 'jerseyPurple'];
const SNEAKERS = ['ballWhite', 'hudYellow', 'jerseyRed', 'jerseyBlue', 'jerseyGreen', 'hudOrange'];
const CAPS = ['capGreen', 'jerseyRed', 'jerseyBlue', 'hudYellow'];

export function rollRecipe(rng: KidRng, outfit: OutfitSpec = {}): KidRecipe {
  const rolledFace = rollFace(rng);
  return {
    skin: outfit.skin ?? rng.pick(SKINS),
    hairColor: outfit.hairColor ?? rng.pick(HAIRS),
    hairStyle: outfit.hairStyle ?? rng.pick(HAIR_STYLES),
    cap: outfit.cap !== undefined ? outfit.cap : rng.chance(0.35) ? rng.pick(CAPS) : null,
    shirt: outfit.shirt ?? rng.pick(SHIRTS),
    sleeves: outfit.sleeves ?? rng.pick(['tank', 'short', 'short', 'long'] as const),
    hood: outfit.hood ?? false,
    bottoms: outfit.bottoms ?? rng.pick(BOTTOMS),
    legs: outfit.legs ?? rng.pick(['shorts', 'shorts', 'pants'] as const),
    sneakers: outfit.sneakers ?? rng.pick(SNEAKERS),
    socks: outfit.socks ?? rng.chance(0.8),
    bat: outfit.bat ?? false,
    glove: outfit.glove ?? false,
    ball: outfit.ball ?? false,
    heightScale: outfit.heightScale ?? rng.range(0.93, 1.07),
    bulk: outfit.bulk ?? rng.range(0.95, 1.12),
    face: { ...rolledFace, ...outfit.face },
  };
}

export function buildKid(mats: MatCache, rng: KidRng, outfit: OutfitSpec = {}): THREE.Group {
  const r = rollRecipe(rng, outfit);
  const kid = new THREE.Group();
  kid.name = 'kid';

  const skin = mats.get(r.skin);
  const shirt = mats.get(r.shirt);
  const shirtDark = mats.get(r.shirt, 0.85);
  const shirtTrim = mats.get(r.shirt, 0.68); // construction lines: collar/cuff/hem
  const bottoms = mats.get(r.bottoms);
  const bottomsTrim = mats.get(r.bottoms, 0.7);
  const sock = mats.get('cloudLit');
  const capIsHairSafe = r.hairStyle === 'crew' || r.hairStyle === 'curls';

  // ---- legs ----
  const hipY = 1.5;
  const pantsOn = r.legs === 'pants';
  for (const side of [1, -1] as const) {
    const L = side === 1;
    const leg = new THREE.Group();
    leg.name = L ? 'legL' : 'legR';
    leg.position.set(side * 0.27, hipY, 0);
    leg.add(limbSegment(pantsOn ? bottoms : skin, 0.2 * r.bulk, 0.72));
    if (!pantsOn) {
      // Shorts cuff riding the thigh, with a darker hem band — a real garment edge.
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * r.bulk, 0.24 * r.bulk, 0.3, 14), bottoms);
      cuff.position.y = -0.16;
      leg.add(cuff);
      const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * r.bulk, 0.24 * r.bulk, 0.08, 14), bottomsTrim);
      hem.position.y = -0.33;
      leg.add(hem);
    }
    const knee = new THREE.Group();
    knee.name = L ? 'kneeL' : 'kneeR';
    knee.position.y = -0.7;
    knee.add(limbSegment(pantsOn ? bottoms : skin, 0.165 * r.bulk, 0.55));
    if (pantsOn) {
      // Pants ankle cuff so the leg doesn't pour straight into the shoe.
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * r.bulk, 0.18 * r.bulk, 0.09, 12), bottomsTrim);
      cuff.position.y = -0.44;
      knee.add(cuff);
    } else if (r.socks) {
      // Tall white sock + team-color band above the sneaker (verdict-001's
      // "sock bands above the shoes" construction line).
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * r.bulk, 0.175 * r.bulk, 0.28, 12), sock);
      s.position.y = -0.38;
      knee.add(s);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.182 * r.bulk, 0.18 * r.bulk, 0.07, 12), bottoms);
      band.position.y = -0.27;
      knee.add(band);
    }
    const foot = new THREE.Group();
    foot.name = L ? 'footL' : 'footR';
    foot.position.y = -0.5;
    foot.add(sneaker(mats.get(r.sneakers), mats.get('chalkCream')));
    knee.add(foot);
    leg.add(knee);
    kid.add(leg);
  }

  // ---- hips + torso ----
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.y = hipY;
  kid.add(hips);

  const w = r.bulk;
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.add(
    lathe(shirt, [
      [0.01, -0.24],
      [0.36 * w, -0.22],
      [0.47 * w, -0.06],
      [0.49 * w, 0.12], // hem flare
      [0.44 * w, 0.28],
      [0.45 * w, 0.6],
      [0.47 * w, 0.95],
      [0.48 * w, 1.18],
      [0.4 * w, 1.35],
      [0.2, 1.44],
      [0.15, 1.48],
      [0.01, 1.48],
    ]),
  );
  // Shorts / pants seat under the hem.
  torso.add(
    lathe(bottoms, [
      [0.01, -0.42],
      [0.42 * w, -0.4],
      [0.5 * w, -0.16],
      [0.485 * w, -0.02],
      [0.01, 0.0],
    ]),
  );
  // Construction lines: ribbed collar ring + shirt hem band in a darker shade.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.05, 8, 18), shirtTrim);
  collar.position.y = 1.44;
  collar.rotation.x = Math.PI / 2;
  torso.add(collar);
  const hemBand = new THREE.Mesh(new THREE.CylinderGeometry(0.485 * w, 0.49 * w, 0.09, 22), shirtTrim);
  hemBand.position.y = 0.02;
  torso.add(hemBand);
  if (r.hood) {
    torso.add(blob(shirtDark, 0.26, [1.35, 0.75, 0.7], [0, 1.28, -0.42], 14));
  }
  hips.add(torso);

  // ---- arms ----
  const longSleeves = r.sleeves === 'long';
  for (const side of [1, -1] as const) {
    const L = side === 1;
    const arm = new THREE.Group();
    arm.name = L ? 'armL' : 'armR';
    arm.position.set(side * 0.46 * w, 1.24, 0);
    arm.add(blob(r.sleeves === 'tank' ? skin : shirt, 0.17 * w, [1, 1, 1], [0, 0, 0], 14)); // shoulder ball
    arm.add(limbSegment(longSleeves ? shirt : skin, 0.15 * w, 0.62));
    if (r.sleeves === 'short') {
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * w, 0.185 * w, 0.3, 14), shirt);
      sleeve.position.y = -0.13;
      arm.add(sleeve);
      // Fat contrast cuff — the sleeve/arm boundary must read at distance.
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.195 * w, 0.19 * w, 0.09, 14), shirtTrim);
      cuff.position.y = -0.31;
      arm.add(cuff);
    }
    const elbow = new THREE.Group();
    elbow.name = L ? 'elbowL' : 'elbowR';
    elbow.position.y = -0.6;
    elbow.add(limbSegment(longSleeves ? shirt : skin, 0.13 * w, 0.5));
    if (longSleeves) {
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.145 * w, 0.145 * w, 0.11, 12), shirtTrim);
      cuff.position.y = -0.44;
      elbow.add(cuff);
    }
    const hand = mittenHand(skin, side);
    hand.name = L ? 'handL' : 'handR';
    hand.position.y = -0.52;
    elbow.add(hand);
    arm.add(elbow);
    hips.add(arm);
  }

  // ---- head ----
  // Raised so a real NECK gap shows between collar and chin — verdict-001's
  // "neckless capsule" was the skull sitting directly on the torso.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.52;
  // Neck column: slimmer than the 0.26 collar ring so the silhouette PINCHES
  // between shoulders and skull — that pinch, not the skin color, is what
  // reads as "has a neck" at second-base distance.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.62, 14), skin);
  neck.position.y = 0.1;
  head.add(neck);
  // Skull rides at 1.02 (was 0.88): verdicts 001-003 called the read
  // "neckless" three times running — the 0.88 chin left a ~0.1ft sliver the
  // collar swallowed. At 1.02 a ~0.27ft skin column (≈6% of kid height, the
  // steam-02 proportion) stays visible between collar top and chin.
  head.add(blob(skin, 1, [0.84, 0.78, 0.76], [0, 1.02, 0], 26)); // skull
  const skullCenter = new THREE.Group();
  skullCenter.position.y = 1.02;
  skullCenter.add(buildFace(mats, r.skin, r.hairColor, r.face));
  skullCenter.add(buildHair(mats, r.hairColor, r.cap && !capIsHairSafe ? 'crew' : r.hairStyle, rng));
  if (r.cap) skullCenter.add(buildCap(mats, r.cap));
  head.add(skullCenter);
  hips.add(head);

  // ---- equipment ----
  if (r.bat) {
    const b = bat(mats.get('batWood'), mats.get('hudInk'));
    kid.getObjectByName('handR')!.add(b);
    b.position.set(0, -0.12, 0.05);
  }
  if (r.glove) {
    const gl = glove(mats.get('gloveBrown'), mats.get('gloveBrown', 0.6), 1);
    kid.getObjectByName('handL')!.add(gl);
    gl.position.set(0, -0.05, 0.05);
  }
  if (r.ball) {
    const bl = ball(mats.get('ballWhite'), mats.get('ballStitch'));
    kid.getObjectByName('handR')!.add(bl);
    bl.position.set(0, -0.12, 0.08);
  }

  kid.scale.setScalar(r.heightScale);
  kid.userData.recipe = r;
  kid.userData.hipsY = hipY;
  kid.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return kid;
}
