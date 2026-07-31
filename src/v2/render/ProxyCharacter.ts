// ---------------------------------------------------------------------------
// ★ THE PROXY CHARACTER — the schedule de-risker, and the skeleton's own test.
//
// A kid built entirely from three.js primitives, skinned to the SAME canonical
// skeleton the 30 commissioned models are bound to, with each primitive
// rigidly weighted to exactly one bone. The consequence is the whole point:
//
//   * Proxies play every clip in the shared animation library CORRECTLY.
//     Animation authoring, camera work, gameplay tuning, the whole statistical
//     harness and real playtesting all proceed with ZERO art delivered.
//   * They are the acceptance test for `skeleton.ts`. If a clip reads right on
//     a proxy, the skeleton can express it — and that is known BEFORE anyone
//     is paid to model against it.
//   * They double as the permanent LOD3, the fallback when a model fails to
//     load, and the deterministic baseline for CI screenshots.
//
// Per-kid variation costs nothing extra: it is driven by the EXISTING
// `VisualParams`/`BodySpec` already authored for all 30 kids in
// `src/data/characters.ts`. Height, shoulder width, hips, belly, neck and head
// size map straight onto primitive dimensions; skin/hair/uniform palette
// indexes map to vertex colours. So day one there are 30 visibly distinct
// kids and a working draft.
//
// ONE MATERIAL, ONE DRAW CALL. Part colours live in a vertex-colour attribute
// rather than in separate materials, so a proxy costs 1 mesh + 1 outline hull
// — exactly the 2-draw-calls-per-character the perf budget allows.
// ---------------------------------------------------------------------------

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Bone,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  Group,
  Matrix4,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Accessory, HairStyle, VisualParams } from '../../data/types';
import {
  BONE_INDEX,
  HEIGHT_MAX_FT,
  HEIGHT_MIN_FT,
  REFERENCE_HEIGHT_FT,
  SKELETON,
  crownHeightFt,
} from './skeleton';
import { shadeInt } from '../../art/fieldTexture';
import { hairHex, jerseyHex, skinHex, trimHex } from './materials/registry';
import { makeToonMaterial } from './materials/toon';
import { attachOutline, type OutlineRegistry } from './materials/outline';
import { clamp } from '../sim/units';

/**
 * ★ RENDER-ONLY character exaggeration. The sim never sees this.
 *
 * Real 6-to-8-year-olds are 3.6-4.4ft on a field whose basepath is 60ft, so a
 * kid is 1/15 of a basepath and reads as a speck in any shot that contains the
 * whole infield. BB2001 drew its kids at 0.205 basepaths — the equivalent of a
 * FOURTEEN FOOT child — which it could do because its field was a painted
 * backdrop with no physics behind it (see CHARACTER_PRESENCE in cameraCues.ts).
 *
 * We cannot follow it that far: real gravity over real distances is the whole
 * balance fix, and a 14ft kid would tower over the 8ft wall they are meant to
 * rob home runs at. 1.6x draws a 4ft kid as 6.4ft — chunky-cartoon, clearly
 * stylised, and still comfortably under the fence, the backstop and the foul
 * poles. The rest of the character presence comes from camera distance (the
 * PLAY rig), not from more size.
 *
 * CRITICAL: this must never leak into `src/v2/sim/**`. Catch radii, reach,
 * collision and stride length are all real feet; only the drawn mesh is
 * exaggerated. `purity.lint.test.js` keeps the sim from importing render/.
 */
export const CHARACTER_SCALE = 1.6;

/**
 * ★ The head sphere's centre offset, as a fraction of its own radius.
 *
 * The head is the ONE primitive whose size is not free: it decides where the
 * drawn silhouette ends, and the rig's `HeadTop_End` is the contractual
 * definition of a character's height. So the radius is DERIVED from the crown
 * (`r = (crown - headY) / (HEAD_RISE + headH)`) rather than picked, and the
 * drawn kid tops out exactly on the bone by construction.
 *
 * It used to be a hardcoded 0.46 against a bone chain that reached 3.4ft, so a
 * "4.0ft" proxy actually drew 3.105ft — a 22% shortfall that made
 * `render.characterPresence`'s "~5% of frame height" residual really 3.9%.
 * `skeleton.test.ts` measures the built mesh's bounding box now, so drawn
 * height and claimed height cannot drift apart again.
 *
 * ★ AND IT WAS 0.75, WHICH FIXED THE HEIGHT AND KEPT THE BOBBLEHEAD. At 0.75
 * the sphere reaches the crown only by hanging three quarters of a radius BELOW
 * the Head joint, so the drawn head spanned 1.479ft — **37.0% of body height**,
 * against a bone chain that puts the head at 32.4% and a commission brief
 * (`docs/v2/asset-contract.md`, `docs/v2/animation-brief.md`) that tells the
 * animator ~30%. The proxy was drawing bigger than the number the artists are
 * given, on the one axis the whole spec is about.
 *
 * 1.0 is the value that needs no explanation: the centre sits exactly one
 * radius above the Head joint, so the sphere spans `Head → HeadTop_End` — the
 * segment the bone table already calls "the head". Drawn and bone proportions
 * are then the same number, and `skeleton.test.ts` asserts they stay that way.
 */
export const HEAD_RISE = 1.0;

/**
 * ★ How far hair may rise above `HeadTop_End`, as a fraction of body height.
 *
 * Not zero: a character's height is defined on the BONE, so hair legitimately
 * stands above it — an afro that stops at the skull is not an afro. But the
 * drawn crown is what `render.characterPresence` makes a claim about, and the
 * afro was overshooting by 14.2% of body height, half a head of hair above the
 * top of the kid. Nothing could see it: the bounding-box test's fixture is
 * `hair: 'bald'`, so all 11 styles and all 4 accessories went unmeasured.
 */
export const HAIR_HEADROOM_FRAC = 0.04;

/**
 * ★ How far the brow is shaded from the kid's hair colour, toward the shared
 * cool shadow (`shadeInt`, the same mix v1's art and the DOM tokens use).
 *
 * Chosen, not assumed. Over all 30 kids' real skin × hair pairs the worst
 * brow-against-skin separation runs 71 raw → 78 at 0.35 → **96 at 0.55**
 * (weighted RGB distance). The worst case is `moose` — brown hair on the darkest
 * skin — and he is worst at every value, because shading toward navy moves a
 * brow TOWARD dark skin; 0.8 only buys him 114, so more shade is not the answer
 * for him and the inverted-hull outline is what carries it.
 *
 * `BROW_MIN_CONTRAST` is the floor a test holds the whole roster to. It sits
 * below the 96 the palette actually achieves so it has real headroom, rather
 * than being a threshold reverse-engineered to pass.
 */
export const BROW_SHADE = 0.55;
export const BROW_MIN_CONTRAST = 90;

// --- Bind-pose bookkeeping --------------------------------------------------

export interface BuiltSkeleton {
  root: Bone;
  bones: Bone[];
  skeleton: Skeleton;
  /** Bind-pose world position of each bone, by name. */
  world: Map<string, Vector3>;
}

/** Instantiate the canonical skeleton in its bind pose. */
export function buildSkeleton(): BuiltSkeleton {
  const bones: Bone[] = [];
  const byName = new Map<string, Bone>();
  const world = new Map<string, Vector3>();

  for (const spec of SKELETON) {
    const bone = new Bone();
    bone.name = spec.name;
    bone.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    bones.push(bone);
    byName.set(spec.name, bone);

    if (spec.parent) {
      const parent = byName.get(spec.parent);
      if (!parent) throw new Error(`Skeleton: ${spec.name} names a parent that comes after it`);
      parent.add(bone);
      const pw = world.get(spec.parent)!;
      world.set(spec.name, pw.clone().add(new Vector3(...spec.pos)));
    } else {
      world.set(spec.name, new Vector3(...spec.pos));
    }
  }

  const root = bones[0];
  root.updateMatrixWorld(true);
  return { root, bones, skeleton: new Skeleton(bones), world };
}

// --- Geometry helpers -------------------------------------------------------

const UP = new Vector3(0, 1, 0);

/** A capsule spanning two bind-pose points. */
function limb(a: Vector3, b: Vector3, r: number): BufferGeometry {
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length();
  const cyl = Math.max(0.02, len - 2 * r);
  const g = new CapsuleGeometry(r, cyl, 3, 8);
  const q = new Quaternion().setFromUnitVectors(UP, dir.normalize());
  const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.applyMatrix4(new Matrix4().compose(mid, q, new Vector3(1, 1, 1)));
  return g;
}

function ball(at: Vector3, r: number, scale = new Vector3(1, 1, 1), seg = 14, rings = 10): BufferGeometry {
  const g = new SphereGeometry(r, seg, rings);
  g.scale(scale.x, scale.y, scale.z);
  g.translate(at.x, at.y, at.z);
  return g;
}

/**
 * ★ An ellipsoid stated in HALF-EXTENTS (feet) rather than radius × factor.
 *
 * `ball`'s third argument is a dimensionless SCALE, and the torso handed one
 * axis a length instead: `new Vector3(torsoW / 0.424, (chest.y - hips.y) * 0.85,
 * (torsoW * 0.72) / 0.424)` divides x and z by the sphere radius to convert a
 * half-extent into a factor, and y does not. The torso therefore drew 0.49ft
 * tall against 1.18ft wide — a pancake, and the reason the proxy read as a head
 * balanced on nothing. Anything sized in real feet goes through here, where the
 * units are in the name and no axis can be handed the wrong kind of number.
 */
function blob(at: Vector3, hx: number, hy: number, hz: number): BufferGeometry {
  return ball(at, 1, new Vector3(hx, hy, hz));
}

function box(at: Vector3, w: number, h: number, d: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(at.x, at.y, at.z);
  return g;
}

interface Part {
  geom: BufferGeometry;
  bone: string;
  color: number;
  /**
   * ★ What this primitive IS, for tests that ask whether it can be seen.
   *
   * Colour cannot answer that question. The nose is drawn in skin colour on a
   * skin-coloured head, so "is the frontmost surface here skin?" passes just as
   * happily with the nose deleted; eyes, brows and glasses all share one ink.
   * Identity has to come from the part list, so it is recorded at merge time.
   */
  tag?: FeatureTag;
}

export type FeatureTag = 'eye' | 'brow' | 'nose' | 'glasses';

/** Index-buffer span of a tagged part in the merged geometry. */
export interface FeatureRange {
  tag: FeatureTag;
  indexStart: number;
  indexCount: number;
}

/**
 * Merge parts into ONE skinned geometry: every vertex rigidly weighted to its
 * part's bone, and tinted by its part's colour.
 *
 * Hand-rolled rather than pulled from BufferGeometryUtils because we need to
 * write skin and colour attributes per source geometry anyway, and this way
 * the proxy has no dependency outside three's core.
 */
function mergeParts(parts: Part[], ranges: FeatureRange[] = []): BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    vCount += p.geom.attributes.position.count;
    iCount += p.geom.index ? p.geom.index.count : p.geom.attributes.position.count;
  }

  const position = new Float32Array(vCount * 3);
  const normal = new Float32Array(vCount * 3);
  const color = new Float32Array(vCount * 3);
  const skinIndex = new Uint16Array(vCount * 4);
  const skinWeight = new Float32Array(vCount * 4);
  const index = new Uint32Array(iCount);

  let vo = 0;
  let io = 0;
  const c = new Color();

  for (const p of parts) {
    const bone = BONE_INDEX[p.bone];
    if (bone === undefined) throw new Error(`Proxy part names an unknown bone: ${p.bone}`);
    const pos = p.geom.attributes.position;
    const nor = p.geom.attributes.normal;
    c.setHex(p.color).convertSRGBToLinear();

    for (let i = 0; i < pos.count; i++) {
      const v = vo + i;
      position[v * 3 + 0] = pos.getX(i);
      position[v * 3 + 1] = pos.getY(i);
      position[v * 3 + 2] = pos.getZ(i);
      normal[v * 3 + 0] = nor.getX(i);
      normal[v * 3 + 1] = nor.getY(i);
      normal[v * 3 + 2] = nor.getZ(i);
      color[v * 3 + 0] = c.r;
      color[v * 3 + 1] = c.g;
      color[v * 3 + 2] = c.b;
      // Rigid binding: full weight on one bone. This is what lets a primitive
      // pile follow a real skeletal clip without any skin weighting work.
      skinIndex[v * 4 + 0] = bone;
      skinWeight[v * 4 + 0] = 1;
    }

    const src = p.geom.index;
    const n = src ? src.count : pos.count;
    for (let i = 0; i < n; i++) index[io + i] = (src ? src.getX(i) : i) + vo;
    if (p.tag) ranges.push({ tag: p.tag, indexStart: io, indexCount: n });

    vo += pos.count;
    io += n;
    p.geom.dispose();
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setAttribute('normal', new BufferAttribute(normal, 3));
  g.setAttribute('color', new BufferAttribute(color, 3));
  g.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  g.setIndex(new BufferAttribute(index, 1));
  return g;
}

// --- The proxy ---------------------------------------------------------------

export interface ProxyOptions {
  /** Team colour index. A kid wears whoever drafted them, not their own. */
  uniform?: number;
  outlines?: OutlineRegistry;
}

/**
 * ★ What the builder actually DREW, in rig feet (before the per-kid root scale).
 *
 * Recorded rather than re-derived: the errors this file has shipped were all
 * "the number in the comment is not the number in the geometry", so the test
 * reads the same locals the primitives were built from. Restating the arithmetic
 * in the test would just be a second place for it to be wrong.
 */
export interface ProxyProportions {
  headTopFt: number;
  headBottomFt: number;
  neckTopFt: number;
  neckBottomFt: number;
  torsoTopFt: number;
  torsoBottomFt: number;
  torsoHalfWidthFt: number;
}

export class ProxyCharacter {
  readonly root = new Group();
  readonly mesh: SkinnedMesh;
  readonly skeleton: Skeleton;
  readonly bones: Bone[];
  /** Actual height, floor to crown, in feet. */
  readonly heightFt: number;
  readonly proportions: ProxyProportions;
  /** Which triangles belong to which face feature — see `Part.tag`. */
  readonly features: FeatureRange[] = [];

  constructor(visual: VisualParams, opts: ProxyOptions = {}) {
    const b = visual.body ?? {};
    // v1 authored `height` as a 0.82-1.0 scale; map that band onto the real
    // 3.6-4.4ft range so 30 existing kids get sensible real-world statures
    // with no content edits.
    //
    // The default is the MIDDLE of v1's authored band, not the top of it. The
    // six kids in characters.ts with no `height` used to default to 1.0 and so
    // came out at 4.4ft — every one of them the tallest child in the game,
    // purely for lack of a content field.
    const hNorm = clamp(b.height ?? 0.91, 0.82, 1);
    this.heightFt = HEIGHT_MIN_FT + ((hNorm - 0.82) / 0.18) * (HEIGHT_MAX_FT - HEIGHT_MIN_FT);

    const shoulder = clamp(b.shoulderW ?? 46, 36, 56) / 46;
    const hip = 1 + clamp(b.hipW ?? 0, -8, 10) / 46;
    const belly = clamp(b.belly ?? 0, 0, 1);
    // Feet, so it scales with the rig. (v1's px-derived /100 predates the
    // 4.0ft rescale; /85 keeps the same visual travel at the new size.)
    const neck = clamp(b.neck ?? 0, -6, 8) / 85;
    const headW = clamp(b.headW ?? 1, 0.9, 1.08);
    const headH = clamp(b.headH ?? 1, 0.9, 1.08);

    const skel = buildSkeleton();
    this.bones = skel.bones;
    this.skeleton = skel.skeleton;

    const W = skel.world;
    const at = (n: string) => W.get(n)!.clone();

    const skinC = skinHex(visual.skin);
    const hairC = hairHex(visual.hairColor);
    const jersey = jerseyHex(opts.uniform ?? visual.uniform);
    const pants = trimHex(opts.uniform ?? visual.uniform);
    const shoe = 0x33404f;

    const parts: Part[] = [];

    // ---- Head ----
    const head = at('Head');
    head.y += neck;
    // Derived, never picked: the sphere's top lands on HeadTop_End. Deriving
    // it AFTER the neck offset also makes total height invariant to the neck
    // knob — a longer neck gives a slightly smaller head, not a taller kid.
    // `headH` is in the denominator because it scales the sphere's Y radius: a
    // headH 1.08 kid used to draw its crown 1.5% ABOVE the bone that defines
    // its height, inside the test band but leaking all the same.
    const headR = (crownHeightFt() - head.y) / (HEAD_RISE + headH);
    const headC = head.clone().add(new Vector3(0, headR * HEAD_RISE, 0));
    parts.push({
      geom: ball(headC, headR, new Vector3(headW, headH, headW * 0.95)),
      bone: 'Head',
      color: skinC,
    });
    parts.push(...hairParts(visual.hair, headC, headR, headW, headH, hairC));
    parts.push(...accessoryParts(visual.accessory, headC, headR, headW, headH, jersey));
    parts.push(...facingCue(headC, headR, headW, headH, skinC, shadeInt(hairC, BROW_SHADE)));

    // ---- Torso ----
    // Bounded by BIND-POSE LANDMARKS rather than magic numbers: the ellipsoid's
    // top pole clears the shoulder joints and its bottom sinks into the pelvis
    // ball, so the trunk is continuous with both by construction.
    const hips = at('Hips');
    const chest = at('Spine2');
    const torsoTop = at('LeftShoulder').y + 0.06;
    const torsoBot = hips.y - 0.05;
    const torsoW = 0.59 * shoulder;
    parts.push({
      geom: blob(
        new Vector3(0, (torsoTop + torsoBot) / 2, 0),
        torsoW,
        (torsoTop - torsoBot) / 2,
        torsoW * 0.72
      ),
      bone: 'Spine1',
      color: jersey,
    });

    // ---- Neck ----
    // Nothing was bound to `Neck` or `Spine2` at all, which left 0.23ft of open
    // air between the torso and the head — invisible only because the head was
    // big enough to hide it — and meant every head-turn key in the clip library
    // drove nothing the eye could see. Both endpoints are pushed INSIDE the
    // parts they join (`limb` spans exactly a→b, it does not cap past them), so
    // the join stays closed for every `neck` and `headH` a kid can carry.
    const neckR = headR * 0.25;
    const neckBot = chest.y + 0.06;
    const neckTop = head.y + headR * 0.15;
    parts.push({
      geom: limb(new Vector3(0, neckBot, 0), new Vector3(0, neckTop, 0), neckR),
      bone: 'Neck',
      color: skinC,
    });

    this.proportions = {
      headTopFt: headC.y + headR * headH,
      headBottomFt: headC.y - headR * headH,
      neckTopFt: neckTop,
      neckBottomFt: neckBot,
      torsoTopFt: torsoTop,
      torsoBottomFt: torsoBot,
      torsoHalfWidthFt: torsoW,
    };
    // Belly rounds the lower torso — v1's `belly` knob, in 3D.
    if (belly > 0.05) {
      parts.push({
        geom: ball(new Vector3(0, hips.y + 0.188, 0.047), 0.353 * (1 + belly * 0.5), new Vector3(1, 0.78, 0.9)),
        bone: 'Spine',
        color: jersey,
      });
    }
    parts.push({
      geom: ball(new Vector3(0, hips.y, 0), 0.353 * hip, new Vector3(1, 0.7, 0.86)),
      bone: 'Hips',
      color: pants,
    });

    // ---- Arms ----
    for (const side of ['Left', 'Right'] as const) {
      parts.push({ geom: limb(at(`${side}Arm`), at(`${side}ForeArm`), 0.129), bone: `${side}Arm`, color: jersey });
      parts.push({ geom: limb(at(`${side}ForeArm`), at(`${side}Hand`), 0.112), bone: `${side}ForeArm`, color: skinC });
      parts.push({ geom: ball(at(`${side}Hand`), 0.147, new Vector3(1, 0.9, 0.85)), bone: `${side}Hand`, color: skinC });
    }

    // ---- Legs ----
    for (const side of ['Left', 'Right'] as const) {
      parts.push({ geom: limb(at(`${side}UpLeg`), at(`${side}Leg`), 0.171 * hip), bone: `${side}UpLeg`, color: pants });
      parts.push({ geom: limb(at(`${side}Leg`), at(`${side}Foot`), 0.135), bone: `${side}Leg`, color: pants });
      const foot = at(`${side}Foot`);
      parts.push({
        geom: box(foot.clone().add(new Vector3(0, -0.059, 0.106)), 0.282, 0.153, 0.494),
        bone: `${side}Foot`,
        color: shoe,
      });
    }

    const geom = mergeParts(parts, this.features);
    const mat = makeToonMaterial({ color: 0xffffff, rimStrength: 0.24, rimPower: 3.0 });
    mat.vertexColors = true;

    this.mesh = new SkinnedMesh(geom, mat);
    this.mesh.name = 'proxyKid';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.add(skel.root);
    this.mesh.bind(this.skeleton);

    // Scale the whole rig to this kid's real height. Scaling the ROOT GROUP
    // (not the bones) keeps every animation clip valid — clips are authored
    // at the reference height and a uniform scale can't invalidate them.
    const s = (this.heightFt / REFERENCE_HEIGHT_FT) * CHARACTER_SCALE;
    this.root.scale.setScalar(s);
    this.root.add(this.mesh);
    this.root.name = 'kid';

    if (opts.outlines) attachOutline(this.mesh, opts.outlines);
  }

  /** Feet stay on the ground plane; the sim owns (x, z). */
  setPosition(x: number, z: number): void {
    this.root.position.set(x, 0, z);
  }

  setFacing(radians: number): void {
    this.root.rotation.y = radians;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as { dispose(): void }).dispose();
  }
}

// --- Hair + accessories ------------------------------------------------------

/**
 * ★ Where hair and hats hang, expressed against the head SPHERE.
 *
 * They used to anchor off the Head BONE (`head + 0.95r`) while the skull sits at
 * `head + HEAD_RISE·r`, so the two only lined up for one particular value of
 * `HEAD_RISE`. Changing that constant — exactly what fixing the bobblehead
 * required — would have slid every cap a quarter-radius down the skull and put a
 * bald patch on the crown of eleven hair styles, with no test able to see it.
 * Anchored to the sphere, hair scales with the head and `HEAD_RISE` stops being
 * secretly load-bearing for the whole hair system.
 *
 * `crown` is the top of the skull-hugging cap; `jaw` is the low anchor a
 * ponytail, pigtails and glasses hang from. The offsets (+0.20r, −0.75r) are the
 * old ones re-expressed, so the re-anchor was a pixel-for-pixel no-op.
 */
function headAnchors(c: Vector3, r: number): { crown: Vector3; jaw: Vector3 } {
  return {
    crown: c.clone().add(new Vector3(0, r * 0.2, 0)),
    jaw: c.clone().add(new Vector3(0, -r * 0.75, 0)),
  };
}

/**
 * Hair as primitives. Crude by design — these are proxies — but the SILHOUETTE
 * has to differ per style, because silhouette is what makes 30 kids readable
 * at outfield distance, and reading them at distance is what the spike exists
 * to prove.
 *
 * Hair MAY rise above `HeadTop_End` — real hair adds height and the contract
 * measures a character on the BONE, not the mesh — but only by
 * `HAIR_HEADROOM_FRAC` of body height. Past that the silhouette stops being a
 * kid with hair and becomes hair with a kid under it.
 */
function hairParts(
  style: HairStyle,
  /** ★ The head SPHERE's centre, not the Head bone — see `headAnchors`. */
  c: Vector3,
  r: number,
  headW: number,
  headH: number,
  color: number
): Part[] {
  const { crown, jaw } = headAnchors(c, r);
  const sx = headW;
  const sy = headH;
  const out: Part[] = [];
  const add = (g: BufferGeometry, bone = 'Head') => out.push({ geom: g, bone, color });

  switch (style) {
    case 'bald':
      break;
    case 'buzz':
      add(ball(crown, r * 1.02, new Vector3(sx, sy * 0.62, sx)));
      break;
    case 'short':
      add(ball(crown, r * 1.06, new Vector3(sx, sy * 0.78, sx)));
      break;
    case 'curly':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add(ball(crown.clone().add(new Vector3(Math.cos(a) * r * 0.62, r * 0.1, Math.sin(a) * r * 0.55)), r * 0.42));
      }
      add(ball(crown, r * 0.95, new Vector3(sx, sy * 0.7, sx)));
      break;
    case 'afro':
      // Sat 14.2% of body height above the crown — half a head of hair above
      // the top of the kid. Wider than the skull by 2.68r, so it still reads
      // unmistakably as an afro; it just frames the face now instead of
      // towering over it.
      //
      // ★ TWO parts, and the second is not decoration. A single ball this wide
      // is convex and centred on the head, so its front surface swallowed the
      // whole face: `grizz` drew ZERO pixels of skin — a sphere of hair with a
      // body under it. Pulling the ball back far enough to clear the eyes pulls
      // it back past the forehead too (a convex ellipsoid's front surface is
      // monotone), which trades no-face for no-hairline — a bald kid in a fur
      // collar. So: the wide ball, pulled back, carries the SILHOUETTE, and a
      // skull-hugging cap carries the HAIRLINE. Width (1.34r) and top (1.219r)
      // are unchanged by both, so the headroom budget and the outline are
      // exactly what they were.
      add(
        ball(
          crown.clone().add(new Vector3(0, -r * 0.08, -r * 0.15)),
          r * 1.34,
          new Vector3(sx, sy * 0.82, sx * 0.75)
        )
      );
      add(ball(crown, r * 1.06, new Vector3(sx, sy * 0.78, sx)));
      break;
    case 'mohawk':
      add(ball(crown, r * 1.0, new Vector3(sx, sy * 0.5, sx)));
      // The fin's width was 0.165 ABSOLUTE feet in an otherwise r-relative
      // system, so it stopped scaling the moment the head did.
      add(box(crown.clone().add(new Vector3(0, r * 0.5, -0.024)), r * 0.26, r * 0.99, r * 1.7));
      break;
    case 'spiky': {
      add(ball(crown, r * 1.02, new Vector3(sx, sy * 0.66, sx)));
      // ★ These spikes were BURIED. Absolute-size cones (0.106 × 0.353ft) at
      // +0.42r topped out inside the skull, so `spiky` rendered as a plain cap
      // — one of eleven silhouettes was a duplicate of `short`, on a proxy
      // whose entire job is that 30 kids read apart at distance.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const g = new ConeGeometry(r * 0.16, r * 0.55, 5);
        g.translate(crown.x + Math.cos(a) * r * 0.42, crown.y + r * 0.75, crown.z + Math.sin(a) * r * 0.38);
        add(g);
      }
      break;
    }
    case 'ponytail':
      add(ball(crown, r * 1.06, new Vector3(sx, sy * 0.78, sx)));
      add(ball(jaw.clone().add(new Vector3(0, r * 0.5, -r * 1.05)), r * 0.5, new Vector3(0.8, 1.5, 0.8)));
      break;
    case 'pigtails':
      add(ball(crown, r * 1.06, new Vector3(sx, sy * 0.76, sx)));
      for (const sgn of [-1, 1]) {
        add(ball(jaw.clone().add(new Vector3(sgn * r * 1.05, r * 0.42, -r * 0.2)), r * 0.42, new Vector3(0.85, 1.3, 0.85)));
      }
      break;
    case 'bun':
      add(ball(crown, r * 1.04, new Vector3(sx, sy * 0.76, sx)));
      add(ball(crown.clone().add(new Vector3(0, r * 0.5, -r * 0.55)), r * 0.42));
      break;
    case 'long':
      add(ball(crown, r * 1.08, new Vector3(sx, sy * 0.82, sx)));
      add(ball(jaw.clone().add(new Vector3(0, -r * 0.1, -r * 0.5)), r * 0.66, new Vector3(1.05, 1.5, 0.7)));
      break;
  }
  return out;
}

/**
 * ★ Where a feature sits on the FRONT of the skull, in units of `r`.
 *
 * `x` and `y` are latitude/longitude on the head ellipsoid; the returned z is
 * the ellipsoid's own front surface there, minus `sink` so the primitive is
 * embedded rather than stuck on.
 *
 * The reason this is a function and not three more constants: the skull's z
 * half-extent is `headW · 0.95`, and `headW` runs 0.90-1.08 across the roster,
 * so the face of a wide-headed kid bulges FORWARD past any fixed depth. The
 * eyes and nose survived it by luck — they were still proud on all 30 kids, but
 * by as little as 0.014r on `sprout` and `the_prof`, which is a bump you cannot
 * see. A brow at a fixed z does not survive it: the skull's front runs
 * `0.884 · headW` at the brow's latitude against a fixed front of 0.930, so it
 * is swallowed outright above `headW 1.052` — `calls_shot`, `cricket`, `sprout`
 * and `the_prof`. Derived, the margin is a constant +0.066r for every kid.
 *
 * Same defect class as the torso's Y scale — a quantity that has to move with
 * the head, written as a constant. Verified a no-op at `headW = headH = 1`.
 */
function onSkull(x: number, y: number, headW: number, headH: number, sink: number): Vector3 {
  const t = Math.max(0, 1 - (x / headW) ** 2 - (y / headH) ** 2);
  return new Vector3(x, y, 0.95 * headW * Math.sqrt(t) - sink);
}

/**
 * ★ A FACING CUE — eyes, brows and a nose. Not a face.
 *
 * The delivered models carry the face as a TEXTURE: `M_Body` with its own UV
 * island and a 512² `face_atlas` of 12 expressions, swapped per cell
 * (`docs/v2/asset-contract.md`). Nothing here is a spec change, and the line is
 * drawn deliberately: no mouth, no expression, ever — that lives in the atlas.
 *
 * What this fixes is a review surface that could not review. The proxy had
 * nothing on the front of its head, so at the animation page's own criterion 4
 * ("readable at 40px tall") a kid was rotationally ambiguous and a clip authored
 * 180° backwards would have looked completely fine. Which way a fielder is
 * facing is the difference between charging and retreating, and it was the one
 * thing the page could not show you.
 *
 * Everything sits LOW on the skull, and that is not a style choice: the hair
 * caps are authored large, so the skin a kid actually shows is the bottom third
 * of the head. The first attempt put the brow at the anatomical middle, where
 * the fringe covers it on nine of eleven styles, and drew it in raw hair colour
 * so that where it did emerge it matched what it was emerging from. It is the
 * kid's hair colour SHADED now — ink would have been the same mistake wearing a
 * different hat, since three of the seven hair colours are near-black.
 *
 * Low segment counts on purpose: this lands on every kid in the Look Spike and
 * on every LOD3 fielder in the game, where it must cost nothing.
 */
function facingCue(
  c: Vector3,
  r: number,
  headW: number,
  headH: number,
  skin: number,
  brow: number
): Part[] {
  const out: Part[] = [];
  const at = (v: Vector3) => c.clone().add(v.multiplyScalar(r));
  for (const sgn of [-1, 1]) {
    out.push({
      geom: ball(at(onSkull(sgn * 0.3 * headW, -0.43 * headH, headW, headH, 0.03)), r * 0.13, undefined, 8, 6),
      bone: 'Head',
      color: 0x2b3440,
      tag: 'eye',
    });
    // The brow is the kid's own hair colour, SHADED. Raw hair colour is what
    // failed the first time — and ink would have failed differently: three of
    // the seven hair colours are near-black, so an ink brow would vanish into
    // the fringe it half-emerges from. Shading toward the shared cool shadow
    // keeps it that kid's brow and guarantees it separates from skin.
    out.push({
      geom: ball(
        at(onSkull(sgn * 0.3 * headW, -0.21 * headH, headW, headH, 0.02)),
        r * 0.22,
        new Vector3(1, 0.28, 0.3),
        8,
        6
      ),
      bone: 'Head',
      color: brow,
      tag: 'brow',
    });
  }
  out.push({
    geom: ball(at(onSkull(0, -0.6 * headH, headW, headH, 0.02)), r * 0.1, new Vector3(1, 0.9, 1.1), 8, 6),
    bone: 'Head',
    color: skin,
    tag: 'nose',
  });
  return out;
}

/**
 * Worn ON the head, so unlike hair these get no headroom above the crown: a hat
 * that stands proud of `HeadTop_End` is a hat drawn wrong, not a taller kid.
 */
function accessoryParts(
  acc: Accessory,
  /** The head SPHERE's centre — see `headAnchors`. */
  c: Vector3,
  r: number,
  headW: number,
  headH: number,
  teamColor: number
): Part[] {
  const { crown, jaw } = headAnchors(c, r);
  switch (acc) {
    case 'cap': {
      const dome = ball(crown.clone().add(new Vector3(0, r * 0.14, 0)), r * 1.08, new Vector3(headW, headH * 0.6, headW));
      const brim = box(crown.clone().add(new Vector3(0, -r * 0.05, r * 0.62)), r * 1.2, 0.071, r * 0.8);
      return [
        { geom: dome, bone: 'Head', color: teamColor },
        { geom: brim, bone: 'Head', color: teamColor },
      ];
    }
    case 'headband':
      return [
        {
          geom: ball(jaw.clone().add(new Vector3(0, r * 0.62, 0)), r * 1.1, new Vector3(headW, headH * 0.16, headW)),
          bone: 'Head',
          color: 0xffffff,
        },
      ];
    case 'glasses':
      // ★ These were at y −0.03r — the head's vertical CENTRE, 0.37r above the
      // eyes — and only 0.011r proud of the skull, so four kids wore an
      // accessory that drew under a pixel. They were placed against an older
      // face and never re-checked when the eyes moved down. Now they ring the
      // eyes, on the same skull derivation the eyes use so a wide-headed kid
      // cannot swallow them, and they stand off far enough to actually read.
      return [-1, 1].map((sgn) => ({
        geom: ball(
          c.clone().add(onSkull(sgn * 0.3 * headW, -0.43 * headH, headW, headH, -0.04).multiplyScalar(r)),
          r * 0.2,
          new Vector3(1, 0.8, 0.24)
        ),
        bone: 'Head',
        color: 0x2b3440,
        tag: 'glasses' as const,
      }));
    default:
      return [];
  }
}
