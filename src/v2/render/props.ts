// ---------------------------------------------------------------------------
// Hand props — the bat, first.
//
// `skeleton.ts` has carried `Prop_BatGrip` since the rig was specified, with a
// comment promising "the AnimationDirector parents the bat/glove/ball to
// these" — and, like `bridge.ts` before PR 13, nothing had ever leaned on it.
// The 2026-08-15 re-audit's #1 finding was the consequence: every batter at
// the plate, mid-swing and on the clip review page held nothing.
//
// The split of responsibilities:
//   * THIS FILE builds the mesh and parents it to the anchor bone. Geometry is
//     authored in REFERENCE FEET (the 4.0ft rig) and shared by all thirty
//     kids; the bone inherits the kid's root scale, so a bigger kid swings a
//     proportionally bigger bat for free.
//   * `clips.holdsBat` decides WHEN it shows — policy stays in the clip data,
//     per the "no call-site clip policy" rule.
//   * `AnimationDirector` applies that answer on every `play()`, because it is
//     the only place clips are played and therefore the only place the answer
//     can change.
//
// Geometry and material are module-level singletons on purpose: thirty bats
// are thirty cheap meshes over ONE geometry and ONE toon material, matching
// the "materials are shared by slot+colour" budget rule in `materials/`.
// ---------------------------------------------------------------------------

import { LatheGeometry, Mesh, Vector2, type Object3D } from 'three';
import { makeToonMaterial } from './materials/toon';

/** Youth bat, knob to tip, in reference feet (a real 26" bat is 2.17ft). */
export const BAT_LENGTH_FT = 2.2;

/** The bone every kid's bat parents to — mandatory in the skeleton contract. */
export const BAT_ANCHOR_BONE = 'Prop_BatGrip';

export const BAT_PROP_NAME = 'prop_bat';

/** Warm wood, toon-stepped like everything else on the field. */
const BAT_COLOR = 0xc9945a;

/**
 * The grip point sits INSIDE the hands, so the profile runs from just below
 * the anchor (knob) to `BAT_LENGTH_FT` above it (tip).
 */
const KNOB_BELOW_GRIP_FT = 0.15;

let shared: { geometry: LatheGeometry; material: ReturnType<typeof makeToonMaterial> } | null = null;

function sharedParts() {
  if (shared) return shared;
  // Radius/height pairs, knob to rounded tip. Lathe around Y.
  const profile: Array<[number, number]> = [
    [0.0, -KNOB_BELOW_GRIP_FT],
    [0.055, -KNOB_BELOW_GRIP_FT + 0.005],
    [0.055, -0.1],
    [0.033, -0.06],
    [0.033, 0.55],
    [0.07, 1.1],
    [0.088, 1.6],
    [0.088, BAT_LENGTH_FT - KNOB_BELOW_GRIP_FT - 0.1],
    [0.05, BAT_LENGTH_FT - KNOB_BELOW_GRIP_FT - 0.02],
    [0.0, BAT_LENGTH_FT - KNOB_BELOW_GRIP_FT],
  ];
  shared = {
    geometry: new LatheGeometry(
      profile.map(([r, y]) => new Vector2(r, y)),
      12
    ),
    material: makeToonMaterial({ color: BAT_COLOR }),
  };
  return shared;
}

/**
 * Build a bat and parent it to this kid's `Prop_BatGrip` bone, hidden.
 *
 * Returns the bat so the caller can hand it to the kid's `AnimationDirector`,
 * which owns its visibility. Null when the rig has no anchor bone — a fixture
 * skeleton, never a contract-legal kid — so a caller can wire unconditionally.
 */
export function attachBatProp(view: { bones: readonly { name: string; add(o: Object3D): unknown }[] }): Object3D | null {
  const anchor = view.bones.find((b) => b.name === BAT_ANCHOR_BONE);
  if (!anchor) return null;
  const { geometry, material } = sharedParts();
  const bat = new Mesh(geometry, material);
  bat.name = BAT_PROP_NAME;
  bat.castShadow = true;
  bat.visible = false;
  anchor.add(bat);
  return bat;
}
