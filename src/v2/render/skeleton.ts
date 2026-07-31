// ---------------------------------------------------------------------------
// ★ THE CANONICAL SKELETON — the single most load-bearing spec in v2.
//
// All 30 characters are commissioned individually, but every one of them is
// bound to THIS skeleton with THIS bind pose. That is what makes the animation
// library a single shared asset instead of a per-character cost: ~33 clips
// authored once, played by all 30 kids and by the primitive proxy alike.
//
// Get this wrong and the project pays 30x for animation forever, so:
//   * `scripts/v2/validate-models.mjs` hashes the bind pose of every delivered
//     glb against the table below and rejects any drift.
//   * `ProxyCharacter.ts` builds a playable character from primitives on this
//     exact skeleton — which makes the proxy the ACCEPTANCE TEST for the spec.
//     If a clip looks right on the proxy, the spec is expressible.
//
// Conventions (also stated in docs/v2/asset-contract.md, for the artist):
//   * 1 unit = 1 FOOT. Origin on the floor between the feet.
//   * Character faces +Z. T-pose: arms along ±X, palms down, feet parallel.
//   * Mixamo-style bone names, so off-the-shelf retargeting tools work.
//   * NO root motion in any clip — the sim owns position, always.
// ---------------------------------------------------------------------------

export interface BoneSpec {
  name: string;
  parent: string | null;
  /** Bind-pose position RELATIVE TO THE PARENT, in feet, for a 4.0ft kid. */
  pos: [number, number, number];
}

/**
 * Reference height (floor to HeadTop_End) the table below is authored at.
 *
 * ★ THIS NUMBER AND THE TABLE MUST AGREE, AND FOR A WHILE THEY DID NOT.
 *
 * The table originally summed to a crown of 3.400ft while this constant said
 * 4.0 — 15% short, and below `HEIGHT_MIN_FT`, i.e. the canonical rig was
 * outside its own legal height band. It went unnoticed because nothing
 * computed the sum: every consumer read `REFERENCE_HEIGHT_FT` and trusted it.
 *
 * That is not a cosmetic error. `docs/v2/animation-brief.md` tells the animator
 * "1 unit = 1 foot, the reference kid is 4.0ft", and stride length, foot
 * plants and dive travel are all authored in absolute feet against the rig they
 * are handed. A 3.4ft rig buys 33 clips whose every distance is 17% wrong,
 * against a sim that works in real feet — and it is discovered after the
 * invoice, not before.
 *
 * The whole table was therefore rescaled by 4.0/3.4 (proportions untouched —
 * the head still spans 32.4% of the crown). `skeleton.test.ts` now asserts the
 * forward sum EXACTLY, so the two can never disagree again.
 */
export const REFERENCE_HEIGHT_FT = 4.0;

/** Per-kid height must land in this band — a real 6-to-8-year-old. */
export const HEIGHT_MIN_FT = 3.6;
export const HEIGHT_MAX_FT = 4.4;

/**
 * ★ How far DRAWN geometry may rise above `HeadTop_End`, as a fraction of body
 * height. Hair only: body geometry and hats may not exceed the bone at all.
 *
 * It lives here, next to `crownHeightFt`, because it is a rule about the crown
 * — and because it has to be readable by two things that cannot see each other.
 * `ProxyCharacter` re-exports it and enforces it on the primitive stand-ins;
 * `scripts/v2/validate-models.mjs` reads it straight out of this file to enforce
 * the same number on a DELIVERED model. The validator deliberately imports only
 * `skeleton.ts` and `clips.ts` (it must not depend on the renderer), so a
 * constant that stayed in `ProxyCharacter.ts` could be enforced on our own
 * stand-ins and on nothing anybody was paid to make.
 *
 * Not zero: a character's height is defined on the BONE, so hair legitimately
 * stands above it — an afro that stops at the skull is not an afro. But the
 * drawn crown is what `render.characterPresence` makes a claim about, and the
 * proxy's afro was overshooting by 14.2% of body height, half a head of hair
 * above the top of the kid.
 */
export const HAIR_HEADROOM_FRAC = 0.04;

/**
 * The 33 mandatory bones. Order is part of the contract: the validator
 * compares the name list positionally, so a model that reorders them fails
 * even if the set matches.
 *
 * Proportions are toy-chibi: the head is ~30% of total height. That is
 * deliberately LESS extreme than v1's 2D art (~45%), because at real 3D depth
 * an oversized head stops reading as stylised and starts reading as a
 * bobblehead — the silhouette cue that carried it in flat art is gone.
 */
export const SKELETON: readonly BoneSpec[] = [
  { name: 'Root', parent: null, pos: [0, 0, 0] },
  { name: 'Hips', parent: 'Root', pos: [0, 1.671, 0] },
  { name: 'Spine', parent: 'Hips', pos: [0, 0.212, 0] },
  { name: 'Spine1', parent: 'Spine', pos: [0, 0.235, 0] },
  { name: 'Spine2', parent: 'Spine1', pos: [0, 0.235, 0] },
  { name: 'Neck', parent: 'Spine2', pos: [0, 0.188, 0] },
  { name: 'Head', parent: 'Neck', pos: [0, 0.165, 0] },
  // 1.671 + 0.212 + 0.235 + 0.235 + 0.188 + 0.165 = 2.706, + 1.294 = 4.000.
  // The rounded table sums to the reference height EXACTLY, on purpose.
  { name: 'HeadTop_End', parent: 'Head', pos: [0, 1.294, 0] },

  { name: 'LeftShoulder', parent: 'Spine2', pos: [-0.165, 0.118, 0] },
  { name: 'LeftArm', parent: 'LeftShoulder', pos: [-0.235, 0, 0] },
  { name: 'LeftForeArm', parent: 'LeftArm', pos: [-0.518, 0, 0] },
  { name: 'LeftHand', parent: 'LeftForeArm', pos: [-0.447, 0, 0] },
  { name: 'LeftHandThumb1', parent: 'LeftHand', pos: [-0.071, 0, 0.082] },
  { name: 'LeftHandIndex1', parent: 'LeftHand', pos: [-0.165, 0, 0.024] },

  { name: 'RightShoulder', parent: 'Spine2', pos: [0.165, 0.118, 0] },
  { name: 'RightArm', parent: 'RightShoulder', pos: [0.235, 0, 0] },
  { name: 'RightForeArm', parent: 'RightArm', pos: [0.518, 0, 0] },
  { name: 'RightHand', parent: 'RightForeArm', pos: [0.447, 0, 0] },
  { name: 'RightHandThumb1', parent: 'RightHand', pos: [0.071, 0, 0.082] },
  { name: 'RightHandIndex1', parent: 'RightHand', pos: [0.165, 0, 0.024] },

  // Leg chain: 1.671 - 0.071 - 0.776 - 0.729 = 0.095 at the ankle, and the toe
  // offset is exactly -0.095 so the toes sit ON the floor plane. A rig whose
  // feet float is a rig every foot-plant is authored wrong against.
  { name: 'LeftUpLeg', parent: 'Hips', pos: [-0.2, -0.071, 0] },
  { name: 'LeftLeg', parent: 'LeftUpLeg', pos: [0, -0.776, 0] },
  { name: 'LeftFoot', parent: 'LeftLeg', pos: [0, -0.729, 0] },
  { name: 'LeftToeBase', parent: 'LeftFoot', pos: [0, -0.095, 0.259] },

  { name: 'RightUpLeg', parent: 'Hips', pos: [0.2, -0.071, 0] },
  { name: 'RightLeg', parent: 'RightUpLeg', pos: [0, -0.776, 0] },
  { name: 'RightFoot', parent: 'RightLeg', pos: [0, -0.729, 0] },
  { name: 'RightToeBase', parent: 'RightFoot', pos: [0, -0.095, 0.259] },

  // Prop anchors. The AnimationDirector parents the bat/glove/ball to these,
  // so a swing clip never has to know which hand a given kid bats with.
  { name: 'Prop_BatGrip', parent: 'RightHand', pos: [0.094, 0, 0] },
  { name: 'Prop_GloveAnchor', parent: 'LeftHand', pos: [-0.094, 0, 0] },
  { name: 'Prop_BallAnchor', parent: 'RightHand', pos: [0.094, 0, 0.047] },
  { name: 'Prop_CapAnchor', parent: 'Head', pos: [0, 0.729, 0] },
  { name: 'Prop_HairAnchor', parent: 'Head', pos: [0, 0.494, 0] },
];

/** Optional secondary bones a model MAY add, beyond the mandatory 33. */
export const OPTIONAL_BONES: readonly string[] = [
  'Hair_01',
  'Hair_02',
  'Hair_03',
  'Accessory_01',
  'Accessory_02',
  'Accessory_03',
];

/** Hard cap. 42 bones keeps every character inside one uniform block on the
 *  low-tier GPUs in the perf budget. */
export const MAX_BONES = 42;

export const BONE_NAMES: readonly string[] = SKELETON.map((b) => b.name);

/**
 * Bind-pose world position of every bone, resolved by walking the parent chain.
 *
 * Shared rather than re-derived: `ProxyCharacter` needs it to place primitives,
 * `skeleton.test.ts` needs it to assert the crown, and
 * `scripts/v2/validate-models.mjs` needs the identical arithmetic to measure a
 * DELIVERED model's height. Three copies of a forward sum is three chances for
 * one of them to disagree about what "height" means.
 */
export function bindWorld(bones: readonly BoneSpec[] = SKELETON): Map<string, [number, number, number]> {
  const world = new Map<string, [number, number, number]>();
  for (const b of bones) {
    const p = b.parent ? world.get(b.parent) : [0, 0, 0];
    if (!p) throw new Error(`Skeleton: ${b.name} names a parent that comes after it`);
    world.set(b.name, [p[0] + b.pos[0], p[1] + b.pos[1], p[2] + b.pos[2]]);
  }
  return world;
}

/**
 * THE definition of a character's height: floor to `HeadTop_End`, in feet.
 *
 * The asset contract states the height band in exactly these terms, so the
 * measurement has to exist as code — otherwise "3.6-4.4ft" is a sentence in a
 * markdown file that nothing can check, which is precisely how the canonical
 * rig came to be 3.4ft while claiming 4.0.
 */
export function crownHeightFt(bones: readonly BoneSpec[] = SKELETON): number {
  const crown = bindWorld(bones).get('HeadTop_End');
  if (!crown) throw new Error('Skeleton: no HeadTop_End bone — height is undefined');
  return crown[1];
}

/** Index of a bone by name — the proxy and the rig both weight by index. */
export const BONE_INDEX: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(SKELETON.map((b, i) => [b.name, i]))
);

/**
 * A stable hash of the bind pose. The validator compares a delivered model's
 * computed hash against this, so "the artist nudged the shoulder 2mm" is a
 * build failure rather than a subtle animation drift discovered weeks later.
 */
export function bindPoseHash(bones: readonly BoneSpec[] = SKELETON): string {
  let h = 0x811c9dc5;
  for (const b of bones) {
    const s = `${b.name}|${b.parent ?? ''}|${b.pos.map((n) => n.toFixed(4)).join(',')}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}
