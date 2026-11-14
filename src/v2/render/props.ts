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

import { CylinderGeometry, Group, LatheGeometry, Mesh, SphereGeometry, Vector2, type Object3D } from 'three';
import { makeToonMaterial } from './materials/toon';
import type { Signature } from '../../data/types';

/** Youth bat, knob to tip, in reference feet (a real 26" bat is 2.17ft). */
export const BAT_LENGTH_FT = 2.2;
/** Barrel contact point measured from the upper palm anchor. */
export const BAT_SWEET_SPOT_FT = BAT_LENGTH_FT * .75;

/**
 * Mars's bat (`VisualParams.signature: 'bigBat'`, the cast sheet's "visibly
 * too big for anyone"): longer than it is fatter, so it reads as a bat for a
 * bigger kid rather than a club. A LOOK only — the sim's bat is the roster's
 * (`sim/contact.ts`), and nothing reads this.
 */
export const BIG_BAT_SCALE = { length: 1.3, girth: 1.18 } as const;

/** The bone every kid's bat parents to — mandatory in the skeleton contract. */
export const BAT_ANCHOR_BONE = 'Prop_BatGrip';

export const BAT_PROP_NAME = 'prop_bat';

/** Warm wood, toon-stepped like everything else on the field. */
const BAT_COLOR = 0xc9945a;

/**
 * The grip point sits INSIDE the hands, so the profile runs from just below
 * the anchor (knob); the whole profile remains `BAT_LENGTH_FT` long.
 */
// Anchor is the upper (right) palm; leave handle below it for the left hand.
const KNOB_BELOW_GRIP_FT = 0.35;

let shared: { geometry: LatheGeometry; material: ReturnType<typeof makeToonMaterial> } | null = null;

function sharedParts() {
  if (shared) return shared;
  // Radius/height pairs, knob to rounded tip. Lathe around Y.
  const profile: Array<[number, number]> = [
    [0.0, -KNOB_BELOW_GRIP_FT],
    [0.055, -KNOB_BELOW_GRIP_FT + 0.005],
    [0.055, -KNOB_BELOW_GRIP_FT + 0.05],
    [0.033, -KNOB_BELOW_GRIP_FT + 0.09],
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
export function attachBatProp(
  view: { bones: readonly { name: string; add(o: Object3D): unknown }[] },
  /** `bigBat`: Mars's, visibly too big for anyone (`BIG_BAT_SCALE`). */
  signature?: Signature
): Object3D | null {
  const anchor = view.bones.find((b) => b.name === BAT_ANCHOR_BONE);
  if (!anchor) return null;
  const { geometry, material } = sharedParts();
  const bat = new Mesh(geometry, material);
  bat.name = BAT_PROP_NAME;
  // The bat's origin IS the grip, so a scale grows it away from the hands and
  // the handle stays in them. The shared geometry is untouched.
  if (signature === 'bigBat') bat.scale.set(BIG_BAT_SCALE.girth, BIG_BAT_SCALE.length, BIG_BAT_SCALE.girth);
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

/** The band's tube, proud of a reference forearm (~0.07ft radius). */
export const TEAM_BAND_RADIUS_FT = 0.1;
export const TEAM_BAND_WIDTH_FT = 0.12;

/**
 * A WRISTBAND, not an armband: most kids wear sleeves over the upper arm, and
 * a band mounted there vanished inside the sleeve geometry on the first
 * painted check. Forearms are bare on nearly every outfit, and a wristband on
 * the throwing arm is the most baseball accessory there is.
 */
const TEAM_BAND_ALONG_ARM_FT = 0.38;

export const TEAM_BAND_ANCHOR_BONE = 'RightForeArm';
export const TEAM_BAND_PROP_NAME = 'prop_team_band';

let bandGeometry: CylinderGeometry | null = null;
let bandTrimGeometry: CylinderGeometry | null = null;
let bandTrimMaterial: ReturnType<typeof makeToonMaterial> | null = null;
const bandMaterials = new Map<number, ReturnType<typeof makeToonMaterial>>();

function bandParts(colorHex: number) {
  // The colour ring rides a slightly wider white base tube: a sweatband's
  // white edges are what keep the team colour legible when a kid's own
  // sleeve happens to BE the team colour (first painted check: a blue band
  // on Ace's blue cuff read as nothing at all).
  bandGeometry ??= new CylinderGeometry(TEAM_BAND_RADIUS_FT + 0.006, TEAM_BAND_RADIUS_FT + 0.006, TEAM_BAND_WIDTH_FT * 0.55, 10, 1, true);
  bandTrimGeometry ??= new CylinderGeometry(TEAM_BAND_RADIUS_FT, TEAM_BAND_RADIUS_FT, TEAM_BAND_WIDTH_FT, 10, 1, true);
  bandTrimMaterial ??= makeToonMaterial({ color: 0xf6f2e8 });
  let material = bandMaterials.get(colorHex);
  if (!material) {
    material = makeToonMaterial({ color: colorHex });
    bandMaterials.set(colorHex, material);
  }
  return { geometry: bandGeometry, material, trimGeometry: bandTrimGeometry, trimMaterial: bandTrimMaterial };
}

/**
 * A team-coloured armband on the throwing arm, hidden until a team dresses it.
 *
 * ★ THE TEAM HAS TO READ WITHOUT REPAINTING THE KID. A finished signature
 * palette is identity, not team paint (`render/CLAUDE.md`), and the one
 * `recessTeamAccent` surface every kid carries is a cap-band or headband that
 * disappears at field distance — so a "Purple Tigers" game showed no purple
 * anywhere (2026-08-24 review; Seth's call: identity stays, accents get
 * louder). The band is a PROP like the bat and the mitt: one shared tube, one
 * toon material per palette colour, parented to the arm bone so it rides
 * every clip for free. `GameView` shows and tints it from `teamUniforms` —
 * a kid with no team (the draft pod, spectators) never wears one.
 */
export function attachTeamBandProp(view: {
  bones: readonly { name: string; add(o: Object3D): unknown }[];
}): Object3D | null {
  const anchor = view.bones.find((b) => b.name === TEAM_BAND_ANCHOR_BONE);
  if (!anchor) return null;
  const holder = new Group();
  holder.name = TEAM_BAND_PROP_NAME;
  holder.position.set(TEAM_BAND_ALONG_ARM_FT, 0, 0);
  // Cylinder axis is Y; the arm bone runs along +X.
  holder.rotation.z = Math.PI / 2;
  holder.visible = false;
  anchor.add(holder);
  return holder;
}

/** Dress (or undress) an attached band in a team colour. */
export function paintTeamBand(band: Object3D, colorHex: number | null): void {
  const holder = band as Group;
  if (colorHex === null) {
    holder.visible = false;
    return;
  }
  const { geometry, material, trimGeometry, trimMaterial } = bandParts(colorHex);
  let mesh = holder.children[0] as Mesh | undefined;
  if (!mesh) {
    const trim = new Mesh(trimGeometry, trimMaterial);
    trim.castShadow = false;
    mesh = new Mesh(geometry, material);
    mesh.castShadow = false;
    holder.add(mesh, trim);
  } else {
    mesh.material = material;
  }
  holder.visible = true;
}

// --- Signature looks that are props ------------------------------------------
//
// The cast sheet gives seven kids a signature look. Four of them are geometry
// ON the kid (a wrap in place of hair, gear over a torso, a different chair)
// and belong to the sculpt. Three are things a kid WEARS OR CARRIES, and those
// can ride a bone like the bat does: Mars's bat (above), June's helmet and
// Ezra's tassels. A look only — nothing in the sim reads any of this.

export const HELMET_PROP_NAME = 'prop_helmet';
export const TASSEL_PROP_NAME = 'prop_tzitzit';

/**
 * June's batting helmet: "too big", so it is a shell a clear margin wider
 * than the canonical head (1.29 ft from the `Head` joint to its crown), sat
 * low over the brow with a bill out front. Sized in the skeleton's own feet
 * on the `Head` bone, so it follows every clip and every head scale.
 */
export const HELMET = { radiusFt: 0.8, centreUpFt: 0.62, billFt: 0.42, color: 0xc0392b, tiltRad: -0.1 } as const;

let helmetParts: { shell: SphereGeometry; bill: CylinderGeometry; material: ReturnType<typeof makeToonMaterial> } | null = null;

function attachHelmet(bones: readonly { name: string; add(o: Object3D): unknown }[]): Object3D | null {
  const head = bones.find((b) => b.name === 'Head');
  if (!head) return null;
  helmetParts ??= {
    // The top 58% of a sphere: crown to just under the widest point.
    shell: new SphereGeometry(HELMET.radiusFt, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
    bill: new CylinderGeometry(HELMET.radiusFt * 0.78, HELMET.radiusFt * 0.78, 0.05, 18, 1, false, -Math.PI * 0.3, Math.PI * 0.6),
    material: makeToonMaterial({ color: HELMET.color }),
  };
  const helmet = new Group();
  helmet.name = HELMET_PROP_NAME;
  const shell = new Mesh(helmetParts.shell, helmetParts.material);
  shell.castShadow = true;
  // The bill: a flat wedge of disc, pushed forward of the brow.
  const bill = new Mesh(helmetParts.bill, helmetParts.material);
  bill.position.set(0, -HELMET.radiusFt * 0.12, HELMET.billFt);
  helmet.add(shell, bill);
  helmet.position.set(0, HELMET.centreUpFt, 0);
  helmet.rotation.x = HELMET.tiltRad;
  head.add(helmet);
  return helmet;
}

/**
 * Ezra's tzitzit: four white tassels below the hem, one at each corner of the
 * garment — front and back of each hip. Hung from `Hips` so they ride the
 * body; they are short enough to stay clear of a striding thigh.
 */
export const TASSELS = { outFt: 0.3, depthFt: 0.3, dropFt: 0.2, lengthFt: 0.44, radiusFt: 0.026, color: 0xf6f2e8 } as const;

let tasselParts: { strand: CylinderGeometry; material: ReturnType<typeof makeToonMaterial> } | null = null;

function attachTassels(bones: readonly { name: string; add(o: Object3D): unknown }[]): Object3D | null {
  const hips = bones.find((b) => b.name === 'Hips');
  if (!hips) return null;
  tasselParts ??= {
    // Narrow at the knot, flared at the fringe.
    strand: new CylinderGeometry(TASSELS.radiusFt, TASSELS.radiusFt * 2, TASSELS.lengthFt, 6),
    material: makeToonMaterial({ color: TASSELS.color }),
  };
  const group = new Group();
  group.name = TASSEL_PROP_NAME;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const strand = new Mesh(tasselParts.strand, tasselParts.material);
      strand.position.set(sx * TASSELS.outFt, -TASSELS.dropFt - TASSELS.lengthFt / 2, sz * TASSELS.depthFt);
      group.add(strand);
    }
  }
  hips.add(group);
  return group;
}

/**
 * Hang whatever this kid's signature look is, if it is one a prop can be.
 * Null for a kid with no signature, for the four looks that live on the
 * sculpt, and for `bigBat` (which is the bat's own business).
 */
export function attachSignatureProp(
  view: { bones: readonly { name: string; add(o: Object3D): unknown }[] },
  signature?: Signature
): Object3D | null {
  if (signature === 'slidingHelmet') return attachHelmet(view.bones);
  if (signature === 'tzitzit') return attachTassels(view.bones);
  return null;
}
