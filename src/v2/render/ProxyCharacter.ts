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
// — 2 draw calls per character.
//
// Production GLBs still preserve all four material slots required by the asset
// contract. First-party roster files opt into a compatible vertex palette, so
// CharacterModel can bake the team colour and merge those slots at load time:
// one colour pass plus one merged hull, the same 2 draws as a proxy. The
// foreground 13-kid review measures 66 draws against the 90-draw budget; see
// `render.characterDrawCost` in `scripts/measures.json`.
// ---------------------------------------------------------------------------

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Bone,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { Accessory, HairStyle, OutfitKind, VisualParams } from '../../data/types';
import {
  BONE_INDEX,
  HEIGHT_MAX_FT,
  HEIGHT_MIN_FT,
  REFERENCE_HEIGHT_FT,
  SKELETON,
  crownHeightFt,
} from './skeleton';
import { shadeInt } from '../../art/fieldTexture';
import { hairHex, jerseyHex, skinHex, trimHex, type SlotName } from './materials/registry';
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
 * Re-exported, not defined here: it MOVED to `skeleton.ts` so that
 * `scripts/v2/validate-models.mjs` — which must not import the renderer — can
 * enforce the same number on a delivered model that this file enforces on a
 * proxy. Enforcing it only on our own stand-ins would be checking the one
 * character nobody is paid to make. It stays exported from here because that is
 * where every existing reader looks for it.
 *
 * Not zero: a character's height is defined on the BONE, so hair legitimately
 * stands above it — an afro that stops at the skull is not an afro. But the
 * drawn crown is what `render.characterPresence` makes a claim about, and the
 * afro was overshooting by 14.2% of body height, half a head of hair above the
 * top of the kid. Nothing could see it: the bounding-box test's fixture is
 * `hair: 'bald'`, so all 11 styles and all 4 accessories went unmeasured.
 */
export { HAIR_HEADROOM_FRAC } from './skeleton';

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

/**
 * ★ A kid's real-world height, in feet, from the content already authored for
 * them. THE one derivation — shared by the proxy and by delivered models.
 *
 * It has to be shared, and the reason is specific. Every delivered `.glb` is
 * authored at the canonical 4.0ft bind pose (§2 hashes it, so a model cannot
 * carry its own stature), which means per-kid height is a uniform scale the
 * ENGINE applies. If `CharacterModel` derived it separately from
 * `ProxyCharacter`, the two would agree only by coincidence — and the moment
 * they drifted, a kid whose model failed to load would visibly change size on
 * falling back to their proxy, which reads as a rendering glitch rather than as
 * a missing file.
 *
 * v1 authored `height` as a 0.82-1.0 scale; that band maps onto the real
 * 3.6-4.4ft range so 30 existing kids get sensible statures with no content
 * edits. The default is the MIDDLE of v1's band, not the top of it: the six
 * kids in characters.ts with no `height` used to default to 1.0 and so came out
 * at 4.4ft — every one of them the tallest child in the game, purely for lack
 * of a content field.
 */
export function kidHeightFt(visual: VisualParams): number {
  const hNorm = clamp(visual.body?.height ?? 0.91, 0.82, 1);
  return HEIGHT_MIN_FT + ((hNorm - 0.82) / 0.18) * (HEIGHT_MAX_FT - HEIGHT_MIN_FT);
}

/**
 * The uniform scale applied to a character's ROOT GROUP — never to the bones,
 * so every animation clip stays valid (they are authored at the reference
 * height, and a uniform scale cannot invalidate them).
 */
export function kidRootScale(visual: VisualParams): number {
  return (kidHeightFt(visual) / REFERENCE_HEIGHT_FT) * CHARACTER_SCALE;
}

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

/**
 * ★ Tessellation multiplier, 1 = full detail.
 *
 * It exists so `scripts/v2/export-proxy-kid.mjs` can emit the three LOD meshes
 * the asset contract §4 requires from ONE geometry description, instead of
 * either hand-authoring three or writing a mesh decimator. Dropping segment
 * counts is a crude decimation, but on a pile of spheres and capsules it is
 * exactly the right one: the silhouette is the primitive, so fewer segments
 * costs smoothness and never a feature.
 *
 * MODULE STATE, and safely so: `withDetail` is the only writer, it restores in
 * a `finally`, and a `ProxyCharacter` constructor is straight-line synchronous
 * code that calls nothing which could re-enter it. Threading a parameter
 * through would touch ~30 call sites across four functions, and every one of
 * those is a place to forget it.
 */
let detail = 1;

/** Run `build` with a tessellation multiplier, then restore the previous one. */
export function withDetail<T>(level: number, build: () => T): T {
  const previous = detail;
  detail = Math.max(0.15, level);
  try {
    return build();
  } finally {
    detail = previous;
  }
}

/** Segment count at the current detail, never below what still closes a solid. */
function seg(full: number, floor = 3): number {
  return Math.max(floor, Math.round(full * detail));
}

/** A capsule spanning two bind-pose points. */
function limb(a: Vector3, b: Vector3, r: number): BufferGeometry {
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length();
  const cyl = Math.max(0.02, len - 2 * r);
  const g = new CapsuleGeometry(r, cyl, seg(3, 1), seg(8, 4));
  const q = new Quaternion().setFromUnitVectors(UP, dir.normalize());
  const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.applyMatrix4(new Matrix4().compose(mid, q, new Vector3(1, 1, 1)));
  return g;
}

function ball(at: Vector3, r: number, scale = new Vector3(1, 1, 1), segments = 14, rings = 10): BufferGeometry {
  const g = new SphereGeometry(r, seg(segments), seg(rings));
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

function slantedBox(at: Vector3, w: number, h: number, d: number, angle: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.rotateZ(angle);
  g.translate(at.x, at.y, at.z);
  return g;
}

interface Part {
  geom: BufferGeometry;
  bone: string;
  color: number;
  /**
   * Map this primitive's native UVs into the body material's face island.
   * Only the roster model's skull uses it; the permanent proxy keeps its
   * geometry face and pays no texture cost.
   */
  faceUv?: boolean;
  /**
   * ★ What this primitive IS, for tests that ask whether it can be seen.
   *
   * Colour cannot answer that question. The nose is drawn in skin colour on a
   * skin-coloured head, so "is the frontmost surface here skin?" passes just as
   * happily with the nose deleted; eyes, brows and glasses all share one ink.
   * Identity has to come from the part list, so it is recorded at merge time.
   */
  tag?: FeatureTag;
  /**
   * ★ Which of the asset contract's four material slots this primitive would
   * belong to on a COMMISSIONED model.
   *
   * The proxy itself does not need it — it is one material with vertex colours,
   * which is what keeps it to two draw calls. It is here because
   * `export-proxy-kid.mjs` emits a contract-legal `.glb` from these same parts,
   * and §4 requires exactly `M_Body` / `M_Uniform` / `M_Hair` / `M_Accessory`.
   *
   * Stated per part rather than derived from `color`, for the reason the `tag`
   * field above already records: the nose is skin-coloured and the brow is hair
   * -coloured, so colour cannot tell you what a thing IS. Deriving the slot
   * from the colour would put the nose in `M_Body` by luck and the brow in
   * `M_Hair` by luck, and break the first time a palette moved.
   */
  slot?: SlotName;
}

export type FeatureTag = 'eye' | 'brow' | 'nose' | 'glasses';

/**
 * Team-uniform reinterpretations of the six outfit identities already
 * authored for the roster. These are geometry, not paint: a hoodie keeps its
 * hood and pocket, overalls keep their bib, and a dress keeps its flare after
 * every kid is recoloured for the team that drafted them.
 *
 * Every piece remains in M_Uniform so the first-party vertex-palette merge
 * still collapses the delivery to one colour pass plus one outline hull.
 */
function outfitSculpt(
  kind: OutfitKind,
  torsoW: number,
  torsoTop: number,
  torsoBot: number,
  hipsY: number,
  jersey: number,
  pants: number,
  productionId?: string
): Part[] {
  const pieces: Part[] = [];
  const front = torsoW * 0.72 + 0.045;
  const dark = shadeInt(jersey, 0.3);
  const trim = shadeInt(pants, 0.28);
  const push = (geom: BufferGeometry, bone: string, color = dark, slot: SlotName = 'M_Uniform') => {
    pieces.push({ geom, bone, color, slot });
  };
  const collar = () => {
    const g = new TorusGeometry(torsoW * 0.34, 0.045, seg(6, 4), seg(16, 8));
    g.rotateX(Math.PI / 2);
    g.translate(0, torsoTop - 0.08, 0);
    push(g, 'Spine2');
  };
  const waist = () => {
    const g = new TorusGeometry(torsoW * 0.58, 0.035, seg(5, 3), seg(16, 8));
    g.rotateX(Math.PI / 2);
    g.scale(1, 1, 0.75);
    g.translate(0, hipsY + 0.12, 0);
    push(g, 'Hips', trim);
  };

  switch (kind) {
    case 'stripeTee': {
      waist();
      if (productionId === 'nostrike') {
        // Junebug's production sculpt replaces the generic round collar and
        // floating chest bands with a constructed baseball jersey: V-neck,
        // placket, buttons, shoulder piping and a tucked hem. The pale pieces
        // live in the accessory palette so team tint can recolour the jersey
        // without turning its trim muddy.
        for (const sgn of [-1, 1]) {
          push(
            slantedBox(
              new Vector3(sgn * torsoW * 0.15, torsoTop - 0.12, front + 0.018),
              0.052,
              0.27,
              0.05,
              -sgn * 0.55
            ),
            'Spine2',
            0xf5efe2,
            'M_Accessory'
          );
        }
        push(
          box(
            new Vector3(0, torsoTop - 0.43, front + 0.02),
            0.035,
            0.48,
            0.045
          ),
          'Spine1',
          0xf5efe2,
          'M_Accessory'
        );
        for (const y of [torsoTop - 0.28, torsoTop - 0.45, torsoTop - 0.62]) {
          push(
            ball(
              new Vector3(0, y, front + 0.052),
              0.032,
              new Vector3(1, 1, 0.42),
              8,
              5
            ),
            'Spine1',
            0xd9d1c2,
            'M_Accessory'
          );
        }
        for (const sgn of [-1, 1]) {
          for (let stripe = 0; stripe < 2; stripe++) {
            const drop = stripe * 0.065;
            push(
              limb(
                new Vector3(sgn * torsoW * 0.19, torsoTop - 0.035 - drop, front + 0.018),
                new Vector3(sgn * torsoW * 0.82, torsoTop - 0.18 - drop, front + 0.012),
                0.022
              ),
              'Spine2',
              0xf5efe2,
              'M_Accessory'
            );
          }
        }
        const hem = new TorusGeometry(torsoW * 0.63, 0.028, seg(5, 3), seg(18, 8));
        hem.rotateX(Math.PI / 2);
        hem.scale(1, 1, 0.74);
        hem.translate(0, torsoBot + 0.09, 0);
        push(hem, 'Spine1', 0xf5efe2, 'M_Accessory');
        break;
      }
      collar();
      for (const y of [torsoTop - 0.38, torsoTop - 0.69]) {
        const band = new TorusGeometry(torsoW * 0.78, 0.055, seg(5, 3), seg(18, 8));
        band.rotateX(Math.PI / 2);
        band.scale(1, 1, 0.72);
        band.translate(0, y, 0);
        push(band, 'Spine1', trim);
      }
      break;
    }
    case 'hoodie': {
      const hood = new TorusGeometry(torsoW * 0.5, 0.105, seg(8, 4), seg(18, 8));
      hood.scale(1, 1.14, 0.86);
      hood.translate(0, torsoTop + 0.13, -torsoW * 0.37);
      push(hood, 'Spine2');

      push(
        blob(
          new Vector3(0, hipsY + 0.34, front),
          torsoW * 0.44,
          0.18,
          0.075
        ),
        'Spine1',
        trim
      );
      for (const x of [-0.105, 0.105]) {
        push(
          limb(
            new Vector3(x, torsoTop - 0.12, front + 0.02),
            new Vector3(x * 1.08, torsoTop - 0.33, front + 0.025),
            0.015
          ),
          'Spine2',
          0xf1e5c6
        );
      }
      break;
    }
    case 'overalls': {
      push(
        box(new Vector3(0, hipsY + 0.51, front), torsoW * 1.03, 0.48, 0.09),
        'Spine1',
        trim
      );
      for (const x of [-torsoW * 0.35, torsoW * 0.35]) {
        push(
          slantedBox(
            new Vector3(x, torsoTop - 0.29, front + 0.01),
            0.12,
            0.54,
            0.08,
            x < 0 ? -0.13 : 0.13
          ),
          'Spine2',
          trim
        );
        push(
          ball(new Vector3(x * 0.92, hipsY + 0.7, front + 0.075), 0.055, new Vector3(1, 1, 0.35), 8, 5),
          'Spine1',
          0xf5e9b8
        );
      }
      break;
    }
    case 'dress': {
      collar();
      const skirt = new CylinderGeometry(
        torsoW * 0.58,
        torsoW * 0.96,
        0.7,
        seg(20, 8),
        1,
        false
      );
      skirt.translate(0, hipsY - 0.17, 0);
      push(skirt, 'Hips', jersey);
      const sash = new TorusGeometry(torsoW * 0.61, 0.055, seg(6, 4), seg(18, 8));
      sash.rotateX(Math.PI / 2);
      sash.scale(1, 1, 0.76);
      sash.translate(0, hipsY + 0.16, 0);
      push(sash, 'Hips', trim);
      break;
    }
    case 'jacket': {
      waist();
      collar();
      for (const x of [-torsoW * 0.36, torsoW * 0.36]) {
        push(
          slantedBox(
            new Vector3(x, hipsY + 0.38, front),
            torsoW * 0.42,
            0.065,
            0.075,
            x < 0 ? -0.2 : 0.2
          ),
          'Spine1',
          dark
        );
      }
      push(
        box(new Vector3(0, (torsoTop + torsoBot) / 2, front + 0.018), 0.025, torsoTop - torsoBot - 0.18, 0.05),
        'Spine1',
        0xf5e9b8
      );
      break;
    }
    case 'tee':
    default: {
      collar();
      waist();
      push(
        ball(
          new Vector3(0, torsoTop - 0.45, front),
          0.13,
          new Vector3(1, 1.15, 0.22),
          12,
          8
        ),
        'Spine1',
        0xf5e9b8
      );
      break;
    }
  }

  return pieces;
}

/** Index-buffer span of a tagged part in the merged geometry. */
export interface FeatureRange {
  tag: FeatureTag;
  indexStart: number;
  indexCount: number;
}

/** Index-buffer span of one material slot in the merged geometry. */
export interface SlotRange {
  slot: SlotName;
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
function mergeParts(
  parts: Part[],
  ranges: FeatureRange[] = [],
  slots: SlotRange[] = []
): BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    vCount += p.geom.attributes.position.count;
    iCount += p.geom.index ? p.geom.index.count : p.geom.attributes.position.count;
  }

  const position = new Float32Array(vCount * 3);
  const normal = new Float32Array(vCount * 3);
  const color = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
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
    const srcUv = p.geom.attributes.uv;
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
      if (p.faceUv && srcUv) {
        // `FACE_ISLAND` is [0..0.5, 0.5..1]. Keep that arithmetic local to
        // the geometry generator so the exported UVs and shader contract
        // cannot drift independently.
        uv[v * 2 + 0] = srcUv.getX(i) * 0.5;
        uv[v * 2 + 1] = 0.5 + srcUv.getY(i) * 0.5;
      } else {
        // A point outside the face island. The body base map is white, so the
        // exact texel is immaterial; what matters is that an expression never
        // paints a neck or hand.
        uv[v * 2 + 0] = 0.75;
        uv[v * 2 + 1] = 0.25;
      }
      // Rigid binding: full weight on one bone. This is what lets a primitive
      // pile follow a real skeletal clip without any skin weighting work.
      skinIndex[v * 4 + 0] = bone;
      skinWeight[v * 4 + 0] = 1;
    }

    const src = p.geom.index;
    const n = src ? src.count : pos.count;
    for (let i = 0; i < n; i++) index[io + i] = (src ? src.getX(i) : i) + vo;
    if (p.tag) ranges.push({ tag: p.tag, indexStart: io, indexCount: n });
    if (p.slot) slots.push({ slot: p.slot, indexStart: io, indexCount: n });

    vo += pos.count;
    io += n;
    p.geom.dispose();
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setAttribute('normal', new BufferAttribute(normal, 3));
  g.setAttribute('color', new BufferAttribute(color, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
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
  /**
   * `roster` adds the data needed by an exported delivery (UV face island and
   * authored silhouette details). Runtime fallbacks always use `proxy`.
   */
  fidelity?: 'proxy' | 'roster';
  /** Production-only sculpt variant; runtime proxies never branch on ids. */
  productionId?: string;
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
  /**
   * Which triangles belong to which material slot — see `Part.slot`.
   *
   * The proxy itself draws with one material and ignores this; it is what lets
   * `scripts/v2/export-proxy-kid.mjs` split the same geometry into the four
   * named slots §4 requires, without a second description of the character.
   */
  readonly slots: SlotRange[] = [];

  constructor(visual: VisualParams, opts: ProxyOptions = {}) {
    const rosterFidelity = opts.fidelity === 'roster';
    const b = visual.body ?? {};
    // v1 authored `height` as a 0.82-1.0 scale; map that band onto the real
    // 3.6-4.4ft range so 30 existing kids get sensible real-world statures
    // with no content edits.
    //
    // The default is the MIDDLE of v1's authored band, not the top of it. The
    // six kids in characters.ts with no `height` used to default to 1.0 and so
    // came out at 4.4ft — every one of them the tallest child in the game,
    // purely for lack of a content field.
    this.heightFt = kidHeightFt(visual);

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
      slot: 'M_Body',
      faceUv: rosterFidelity,
    });
    parts.push(...hairParts(visual, headC, headR, headW, headH, hairC, rosterFidelity ? opts.productionId : undefined));
    parts.push(...accessoryParts(visual.accessory, headC, headR, headW, headH, jersey));
    // Delivered roster models paint the full expression into their atlas.
    // The permanent proxy still carries its cheap geometry facing cue.
    if (!rosterFidelity) {
      parts.push(...facingCue(headC, headR, headW, headH, skinC, shadeInt(hairC, BROW_SHADE)));
    } else {
      // The atlas supplies the front; small ears keep the head from reading as
      // a texture pasted onto a ball in the three-quarter hero camera.
      for (const sgn of [-1, 1]) {
        parts.push({
          geom: ball(
            headC.clone().add(new Vector3(sgn * headR * headW * 0.96, -headR * 0.23, 0)),
            headR * 0.16,
            new Vector3(0.52, 1, 0.72),
            10,
            7
          ),
          bone: 'Head',
          color: skinC,
          slot: 'M_Body',
        });
        parts.push({
          geom: ball(
            headC.clone().add(new Vector3(sgn * headR * headW * 1.005, -headR * 0.23, headR * 0.015)),
            headR * 0.09,
            new Vector3(0.35, 0.78, 0.4),
            8,
            5
          ),
          bone: 'Head',
          color: shadeInt(skinC, 0.18),
          slot: 'M_Body',
        });
      }
    }

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
      slot: 'M_Uniform',
    });
    if (rosterFidelity) {
      parts.push(...outfitSculpt(
        visual.outfit?.kind ?? 'tee',
        torsoW,
        torsoTop,
        torsoBot,
        hips.y,
        jersey,
        pants,
        opts.productionId
      ));
    }

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
      slot: 'M_Body',
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
        slot: 'M_Uniform',
      });
    }
    parts.push({
      geom: ball(new Vector3(0, hips.y, 0), 0.353 * hip, new Vector3(1, 0.7, 0.86)),
      bone: 'Hips',
      color: pants,
      slot: 'M_Uniform',
    });

    // ---- Arms ----
    for (const side of ['Left', 'Right'] as const) {
      parts.push({ geom: limb(at(`${side}Arm`), at(`${side}ForeArm`), 0.129), bone: `${side}Arm`, color: jersey, slot: 'M_Uniform' });
      parts.push({ geom: limb(at(`${side}ForeArm`), at(`${side}Hand`), 0.112), bone: `${side}ForeArm`, color: skinC, slot: 'M_Body' });
      parts.push({ geom: ball(at(`${side}Hand`), 0.147, new Vector3(1, 0.9, 0.85)), bone: `${side}Hand`, color: skinC, slot: 'M_Body' });
      if (rosterFidelity) {
        // Moulded sleeve and wrist seams stop the limbs reading as two tubes
        // pushed together in the close draft camera.
        parts.push({
          geom: ball(at(`${side}ForeArm`), 0.143, new Vector3(1.08, 0.42, 1.08), 8, 5),
          bone: `${side}Arm`,
          color: shadeInt(jersey, 0.22),
          slot: 'M_Uniform',
        });
        parts.push({
          geom: ball(at(`${side}Hand`).clone().lerp(at(`${side}ForeArm`), 0.28), 0.119, new Vector3(1.05, 0.28, 1.05), 8, 5),
          bone: `${side}ForeArm`,
          color: 0xf1e5c6,
          slot: 'M_Accessory',
        });
      }
    }

    // ---- Legs ----
    if (visual.accessory === 'wheelchair') {
      // Zoom's lower body stays tucked behind the chair instead of running in
      // place through its wheels. The shared upper-body clips still read, and
      // the chair travels with the sim-owned character root.
      for (const side of ['Left', 'Right'] as const) {
        const upper = at(`${side}UpLeg`);
        parts.push({
          geom: limb(upper, upper.clone().add(new Vector3(0, -0.12, 0.34)), 0.16 * hip),
          bone: `${side}UpLeg`,
          color: pants,
          slot: 'M_Uniform',
        });
      }
      parts.push(...wheelchairParts(hips, jersey));
    } else {
      for (const side of ['Left', 'Right'] as const) {
        parts.push({ geom: limb(at(`${side}UpLeg`), at(`${side}Leg`), 0.171 * hip), bone: `${side}UpLeg`, color: pants, slot: 'M_Uniform' });
        parts.push({ geom: limb(at(`${side}Leg`), at(`${side}Foot`), 0.135), bone: `${side}Leg`, color: pants, slot: 'M_Uniform' });
        const foot = at(`${side}Foot`);
        parts.push({
          geom: box(foot.clone().add(new Vector3(0, -0.059, 0.106)), 0.282, 0.153, 0.494),
          bone: `${side}Foot`,
          color: shoe,
          slot: 'M_Accessory',
        });
        if (rosterFidelity) {
          parts.push({
            geom: box(foot.clone().add(new Vector3(0, -0.13, 0.13)), 0.3, 0.055, 0.52),
            bone: `${side}Foot`,
            color: 0xf3eee3,
            slot: 'M_Accessory',
          });
          for (const dz of [0.04, 0.13, 0.22]) {
            parts.push({
              geom: box(foot.clone().add(new Vector3(0, 0.028, dz)), 0.22, 0.025, 0.035),
              bone: `${side}Foot`,
              color: 0xf3eee3,
              slot: 'M_Accessory',
            });
          }
        }
      }
    }

    // Every part must name a slot, or the exported stand-in silently loses
    // triangles: a primitive with no slot lands in no primitive group, and the
    // omission is invisible in the proxy itself (one material draws them all).
    const unslotted = parts.filter((p) => !p.slot).length;
    if (unslotted) throw new Error(`ProxyCharacter: ${unslotted} part(s) name no material slot`);

    const geom = mergeParts(parts, this.features, this.slots);
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
    this.root.scale.setScalar(kidRootScale(visual));
    this.root.add(this.mesh);
    this.root.name = 'kid';

    if (opts.outlines) attachOutline(this.mesh, opts.outlines);
  }

  /**
   * ★ A proxy is a stand-in, and every caller is allowed to know it — the
   * review page reports the count, and it is the honest answer to "are we
   * looking at the art yet?".
   */
  readonly isProxy = true;

  /**
   * Deliberately a no-op: a proxy has a facing CUE (eyes, brows, nose) and no
   * face. Expression is the `face_atlas` texture on the delivered models — see
   * `faceAtlas.ts`. Throwing here would make every caller ask first, and a
   * silent no-op is the correct behaviour for a kid with no face to change.
   */
  setExpression(): void {}

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
  visual: VisualParams,
  /** ★ The head SPHERE's centre, not the Head bone — see `headAnchors`. */
  c: Vector3,
  r: number,
  headW: number,
  headH: number,
  color: number,
  productionId?: string
): Part[] {
  const style: HairStyle = visual.hair;
  const spec = visual.hairSpec ?? {};
  const volume = clamp(spec.volume ?? 1, 0.88, 1.1);
  const length = clamp(spec.length ?? 1, 0.8, 1.25);
  const part = clamp(spec.part ?? 0, -1, 1);
  const wisps = Math.round(clamp(spec.wisps ?? 0, 0, 3));
  const { crown, jaw } = headAnchors(c, r);
  const sx = headW * volume;
  const sy = headH;
  const out: Part[] = [];
  const add = (g: BufferGeometry, bone = 'Head') =>
    out.push({ geom: g, bone, color, slot: 'M_Hair' });
  // A full ellipsoid centred on the crown crosses the face at eye height —
  // the old "cap" was literally a dark band through every kid's eyes. Pull
  // the hair mass behind the skull and flatten its depth. The silhouette stays
  // full from the side and above while the face owns the front surface.
  const cap = (scale = 1.04, yScale = 0.74) =>
    ball(
      crown.clone().add(new Vector3(part * r * 0.1, 0, -r * 0.28)),
      r * scale,
      new Vector3(sx, sy * yScale, sx * 0.82)
    );

  switch (style) {
    case 'bald':
      break;
    case 'buzz':
      add(cap(1.02, 0.62));
      break;
    case 'short':
      add(cap(1.06, 0.78));
      break;
    case 'curly':
      for (let i = 0; i < 7 + wisps; i++) {
        const a = (i / (7 + wisps)) * Math.PI * 2;
        add(
          ball(
            crown.clone().add(
              new Vector3(Math.cos(a) * r * 0.62, r * 0.1, (-0.15 + Math.sin(a) * 0.35) * r)
            ),
            r * 0.42 * volume
          )
        );
      }
      add(cap(0.95, 0.7));
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
          crown.clone().add(new Vector3(0, -r * 0.08, -r * 0.27)),
          r * 1.34,
          new Vector3(sx, sy * 0.82, sx * 0.68)
        )
      );
      add(cap(1.06, 0.78));
      break;
    case 'mohawk':
      add(cap(1.0, 0.5));
      // The fin's width was 0.165 ABSOLUTE feet in an otherwise r-relative
      // system, so it stopped scaling the moment the head did.
      add(box(crown.clone().add(new Vector3(0, r * 0.5, -r * 0.25)), r * 0.26, r * 0.99, r * 1.5));
      break;
    case 'spiky': {
      add(cap(1.02, 0.66));
      // ★ These spikes were BURIED. Absolute-size cones (0.106 × 0.353ft) at
      // +0.42r topped out inside the skull, so `spiky` rendered as a plain cap
      // — one of eleven silhouettes was a duplicate of `short`, on a proxy
      // whose entire job is that 30 kids read apart at distance.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const g = new ConeGeometry(r * 0.16, r * 0.55, seg(5));
        g.translate(crown.x + Math.cos(a) * r * 0.42, crown.y + r * 0.75, crown.z + Math.sin(a) * r * 0.38);
        add(g);
      }
      break;
    }
    case 'ponytail':
      add(cap(1.06, 0.78));
      if (productionId === 'nostrike') {
        // A deliberate three-piece arrow rather than the generic hanging
        // ellipsoid: compact knot, swept shaft, tapered point. It is the
        // silhouette called out by Junebug's production direction and remains
        // legible from the side and back at gameplay scale.
        const knot = c.clone().add(new Vector3(part * r * 0.08, r * 0.16, -r * 0.92));
        add(ball(knot, r * 0.25, new Vector3(1.08, 0.82, 0.9), 10, 7));
        add(limb(knot, knot.clone().add(new Vector3(0, -r * 0.68, -r * 0.1)), r * 0.22));
        const point = new ConeGeometry(r * 0.34, r * 0.72, seg(10, 5));
        point.rotateZ(Math.PI);
        point.translate(knot.x, knot.y - r * 0.95, knot.z - r * 0.1);
        add(point);
        break;
      }
      add(
        ball(
          jaw.clone().add(new Vector3(part * r * 0.12, r * 0.5, -r * 1.05)),
          r * 0.5,
          new Vector3(0.8 * volume, 1.5 * length, 0.8)
        )
      );
      break;
    case 'pigtails':
      add(cap(1.06, 0.76));
      for (const sgn of [-1, 1]) {
        add(
          ball(
            jaw.clone().add(new Vector3(sgn * r * 1.05 * volume, r * 0.42, -r * 0.2)),
            r * 0.42,
            new Vector3(0.85 * volume, 1.3 * length, 0.85)
          )
        );
      }
      break;
    case 'bun':
      add(cap(1.04, 0.76));
      add(ball(crown.clone().add(new Vector3(part * r * 0.2, r * 0.5, -r * 0.55)), r * 0.42 * volume));
      break;
    case 'long':
      add(cap(1.08, 0.82));
      add(
        ball(
          jaw.clone().add(new Vector3(part * r * 0.08, -r * 0.1, -r * 0.5)),
          r * 0.66,
          new Vector3(1.05 * volume, 1.5 * length, 0.7)
        )
      );
      break;
  }

  // `wisps` is the per-kid difference between otherwise identical style
  // silhouettes. Keep them below the crown budget and above the brows: small
  // hairline clumps, never spikes that silently make the kid taller.
  if (style !== 'bald' && style !== 'buzz') {
    for (let i = 0; i < wisps; i++) {
      const x = (i - (wisps - 1) / 2 + part * 0.6) * r * 0.22;
      add(ball(crown.clone().add(new Vector3(x, r * 0.08, r * 0.48)), r * 0.13 * volume));
    }
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
      slot: 'M_Accessory',
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
      // Hair-DERIVED, but not the hair slot: on a delivered model a brow is
      // painted into the face atlas, and `M_Accessory` is where ink lives.
      slot: 'M_Accessory',
    });
  }
  out.push({
    geom: ball(at(onSkull(0, -0.6 * headH, headW, headH, 0.02)), r * 0.1, new Vector3(1, 0.9, 1.1), 8, 6),
    bone: 'Head',
    color: skin,
    tag: 'nose',
    slot: 'M_Body',
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
  const { crown } = headAnchors(c, r);
  switch (acc) {
    case 'cap': {
      const dome = ball(
        crown.clone().add(new Vector3(0, r * 0.14, -r * 0.18)),
        r * 1.08,
        new Vector3(headW, headH * 0.6, headW * 0.82)
      );
      // High, short bill: it shades the forehead without becoming a visor
      // across both eyes when `idle` nods the head toward the camera.
      const brim = box(
        crown.clone().add(new Vector3(0, r * 0.18, r * 0.45)),
        r * 1.12,
        0.058,
        r * 0.5
      );
      return [
        { geom: dome, bone: 'Head', color: teamColor, slot: 'M_Accessory' as const },
        { geom: brim, bone: 'Head', color: teamColor, slot: 'M_Accessory' as const },
      ];
    }
    case 'headband':
      return [
        {
          // Forehead, not eyes. The old jaw-relative centre landed the lower
          // edge directly across the atlas pupils once a real face arrived.
          geom: ball(
            c.clone().add(new Vector3(0, r * 0.3, -r * 0.04)),
            r * 1.05,
            new Vector3(headW, headH * 0.1, headW * 0.9)
          ),
          bone: 'Head',
          color: 0xffffff,
          slot: 'M_Accessory' as const,
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
        slot: 'M_Accessory' as const,
      }));
    default:
      return [];
  }
}

/**
 * Zoom's sport chair, built around the canonical bind pose.
 *
 * It is root-space equipment, not a second locomotion system: the simulation
 * still owns the kid's position and every clip still targets the shared rig.
 * Large side wheels and the forward casters are the silhouette that has to
 * survive at 40px; the frame and hubs keep the close camera from reading two
 * unattached rings.
 */
function wheelchairParts(hips: Vector3, teamColor: number): Part[] {
  const out: Part[] = [];
  const dark = 0x263445;
  const metal = 0xaeb9c5;
  const add = (geom: BufferGeometry, color: number) => {
    out.push({ geom, bone: 'Root', color, slot: 'M_Accessory' });
  };

  for (const sgn of [-1, 1]) {
    const wheel = new TorusGeometry(0.5, 0.065, seg(6, 4), seg(18, 8));
    wheel.rotateY(Math.PI / 2);
    wheel.translate(sgn * 0.53, 0.55, -0.04);
    add(wheel, dark);

    const hub = new CylinderGeometry(0.11, 0.11, 0.12, seg(10, 6));
    hub.rotateZ(Math.PI / 2);
    hub.translate(sgn * 0.53, 0.55, -0.04);
    add(hub, metal);

    const caster = new TorusGeometry(0.14, 0.045, seg(5, 3), seg(12, 6));
    caster.rotateY(Math.PI / 2);
    caster.translate(sgn * 0.34, 0.18, 0.58);
    add(caster, dark);

    add(
      limb(
        new Vector3(sgn * 0.34, 0.32, 0.5),
        new Vector3(sgn * 0.42, 0.76, 0.1),
        0.035
      ),
      metal
    );
  }

  add(box(new Vector3(0, 0.82, 0.05), 0.72, 0.12, 0.67), teamColor);
  add(box(new Vector3(0, hips.y + 0.05, -0.31), 0.72, 0.72, 0.12), teamColor);

  const axle = new CylinderGeometry(0.045, 0.045, 1.06, seg(8, 5));
  axle.rotateZ(Math.PI / 2);
  axle.translate(0, 0.55, -0.04);
  add(axle, metal);

  return out;
}
