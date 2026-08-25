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

import { Group, LatheGeometry, Mesh, SphereGeometry, Vector2, type Object3D } from 'three';
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

/** The mitt: palm-side leather ~11in for a kid's glove, in reference feet. */
export const GLOVE_RADIUS_FT = 0.24;

/** The bone every kid's glove parents to — the skeleton contract's other hand. */
export const GLOVE_ANCHOR_BONE = 'Prop_GloveAnchor';

export const GLOVE_PROP_NAME = 'prop_glove';

/** Worn leather, one tone lighter than the bat so the two props never merge. */
const GLOVE_COLOR = 0xb8804f;
const GLOVE_PALM_COLOR = 0xd9a86d;

let sharedGlove: {
  shell: SphereGeometry;
  palm: SphereGeometry;
  material: ReturnType<typeof makeToonMaterial>;
  palmMaterial: ReturnType<typeof makeToonMaterial>;
} | null = null;

function sharedGloveParts() {
  if (sharedGlove) return sharedGlove;
  sharedGlove = {
    // A cartoon mitt reads as a fat disc with a pocket, not as fingers: one
    // squashed shell plus a smaller palm inset gives it a leather rim and a
    // pocket in two draws over shared geometry, matching the bat's budget
    // discipline.
    shell: new SphereGeometry(GLOVE_RADIUS_FT, 12, 10),
    palm: new SphereGeometry(GLOVE_RADIUS_FT * 0.72, 10, 8),
    material: makeToonMaterial({ color: GLOVE_COLOR }),
    palmMaterial: makeToonMaterial({ color: GLOVE_PALM_COLOR }),
  };
  return sharedGlove;
}

/**
 * Build a mitt and parent it to this kid's `Prop_GloveAnchor` bone, hidden.
 *
 * ★ THE ANCHOR EXISTED FOR 30+ PRs WITH NOTHING ON IT. `skeleton.ts` promised
 * "the AnimationDirector parents the bat/glove/ball to these" and only the bat
 * was ever built, so every catcher and fielder in the game played bare-handed
 * — visible in any screenshot, invisible to every test. Visibility belongs to
 * the `AnimationDirector` (`setGloveVisible`), driven by `bridge.ts` from the
 * one thing that actually decides who wears leather: membership in the
 * frame's defence.
 *
 * Returns null when the rig has no anchor bone — a fixture skeleton, never a
 * contract-legal kid — so a caller can wire unconditionally, like the bat.
 */
export function attachGloveProp(view: { bones: readonly { name: string; add(o: Object3D): unknown }[] }): Object3D | null {
  const anchor = view.bones.find((b) => b.name === GLOVE_ANCHOR_BONE);
  if (!anchor) return null;
  const { shell, palm, material, palmMaterial } = sharedGloveParts();
  const glove = new Group();
  glove.name = GLOVE_PROP_NAME;
  const shellMesh = new Mesh(shell, material);
  shellMesh.scale.set(1, 0.62, 0.86);
  shellMesh.castShadow = true;
  const palmMesh = new Mesh(palm, palmMaterial);
  palmMesh.position.set(0, 0.045, 0.02);
  palmMesh.scale.set(1, 0.5, 0.86);
  glove.add(shellMesh, palmMesh);
  glove.visible = false;
  anchor.add(glove);
  return glove;
}
