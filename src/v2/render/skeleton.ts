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

/** Reference height (floor to HeadTop_End) the table below is authored at. */
export const REFERENCE_HEIGHT_FT = 4.0;

/** Per-kid height must land in this band — a real 6-to-8-year-old. */
export const HEIGHT_MIN_FT = 3.6;
export const HEIGHT_MAX_FT = 4.4;

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
  { name: 'Hips', parent: 'Root', pos: [0, 1.42, 0] },
  { name: 'Spine', parent: 'Hips', pos: [0, 0.18, 0] },
  { name: 'Spine1', parent: 'Spine', pos: [0, 0.2, 0] },
  { name: 'Spine2', parent: 'Spine1', pos: [0, 0.2, 0] },
  { name: 'Neck', parent: 'Spine2', pos: [0, 0.16, 0] },
  { name: 'Head', parent: 'Neck', pos: [0, 0.14, 0] },
  { name: 'HeadTop_End', parent: 'Head', pos: [0, 1.1, 0] },

  { name: 'LeftShoulder', parent: 'Spine2', pos: [-0.14, 0.1, 0] },
  { name: 'LeftArm', parent: 'LeftShoulder', pos: [-0.2, 0, 0] },
  { name: 'LeftForeArm', parent: 'LeftArm', pos: [-0.44, 0, 0] },
  { name: 'LeftHand', parent: 'LeftForeArm', pos: [-0.38, 0, 0] },
  { name: 'LeftHandThumb1', parent: 'LeftHand', pos: [-0.06, 0, 0.07] },
  { name: 'LeftHandIndex1', parent: 'LeftHand', pos: [-0.14, 0, 0.02] },

  { name: 'RightShoulder', parent: 'Spine2', pos: [0.14, 0.1, 0] },
  { name: 'RightArm', parent: 'RightShoulder', pos: [0.2, 0, 0] },
  { name: 'RightForeArm', parent: 'RightArm', pos: [0.44, 0, 0] },
  { name: 'RightHand', parent: 'RightForeArm', pos: [0.38, 0, 0] },
  { name: 'RightHandThumb1', parent: 'RightHand', pos: [0.06, 0, 0.07] },
  { name: 'RightHandIndex1', parent: 'RightHand', pos: [0.14, 0, 0.02] },

  { name: 'LeftUpLeg', parent: 'Hips', pos: [-0.17, -0.06, 0] },
  { name: 'LeftLeg', parent: 'LeftUpLeg', pos: [0, -0.66, 0] },
  { name: 'LeftFoot', parent: 'LeftLeg', pos: [0, -0.62, 0] },
  { name: 'LeftToeBase', parent: 'LeftFoot', pos: [0, -0.08, 0.22] },

  { name: 'RightUpLeg', parent: 'Hips', pos: [0.17, -0.06, 0] },
  { name: 'RightLeg', parent: 'RightUpLeg', pos: [0, -0.66, 0] },
  { name: 'RightFoot', parent: 'RightLeg', pos: [0, -0.62, 0] },
  { name: 'RightToeBase', parent: 'RightFoot', pos: [0, -0.08, 0.22] },

  // Prop anchors. The AnimationDirector parents the bat/glove/ball to these,
  // so a swing clip never has to know which hand a given kid bats with.
  { name: 'Prop_BatGrip', parent: 'RightHand', pos: [0.08, 0, 0] },
  { name: 'Prop_GloveAnchor', parent: 'LeftHand', pos: [-0.08, 0, 0] },
  { name: 'Prop_BallAnchor', parent: 'RightHand', pos: [0.08, 0, 0.04] },
  { name: 'Prop_CapAnchor', parent: 'Head', pos: [0, 0.62, 0] },
  { name: 'Prop_HairAnchor', parent: 'Head', pos: [0, 0.42, 0] },
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
