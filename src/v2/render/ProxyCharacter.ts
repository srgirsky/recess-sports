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
 * (`r = (crown - headY) / (1 + HEAD_RISE)`) rather than picked, and the drawn
 * kid tops out exactly on the bone by construction.
 *
 * It used to be a hardcoded 0.46 against a bone chain that reached 3.4ft, so a
 * "4.0ft" proxy actually drew 3.105ft — a 22% shortfall that made
 * `render.characterPresence`'s "~5% of frame height" residual really 3.9%.
 * `skeleton.test.ts` measures the built mesh's bounding box now, so drawn
 * height and claimed height cannot drift apart again.
 */
const HEAD_RISE = 0.75;

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

function ball(at: Vector3, r: number, scale = new Vector3(1, 1, 1)): BufferGeometry {
  const g = new SphereGeometry(r, 14, 10);
  g.scale(scale.x, scale.y, scale.z);
  g.translate(at.x, at.y, at.z);
  return g;
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
}

/**
 * Merge parts into ONE skinned geometry: every vertex rigidly weighted to its
 * part's bone, and tinted by its part's colour.
 *
 * Hand-rolled rather than pulled from BufferGeometryUtils because we need to
 * write skin and colour attributes per source geometry anyway, and this way
 * the proxy has no dependency outside three's core.
 */
function mergeParts(parts: Part[]): BufferGeometry {
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

export class ProxyCharacter {
  readonly root = new Group();
  readonly mesh: SkinnedMesh;
  readonly skeleton: Skeleton;
  readonly bones: Bone[];
  /** Actual height, floor to crown, in feet. */
  readonly heightFt: number;

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
    const headR = (crownHeightFt() - head.y) / (1 + HEAD_RISE);
    parts.push({
      geom: ball(head.clone().add(new Vector3(0, headR * HEAD_RISE, 0)), headR, new Vector3(headW, headH, headW * 0.95)),
      bone: 'Head',
      color: skinC,
    });
    parts.push(...hairParts(visual.hair, head, headR, headW, headH, hairC));
    parts.push(...accessoryParts(visual.accessory, head, headR, headW, headH, jersey));

    // ---- Torso ----
    const hips = at('Hips');
    const chest = at('Spine2');
    const torsoW = 0.59 * shoulder;
    parts.push({
      geom: ball(
        new Vector3(0, (hips.y + chest.y) / 2 + 0.035, 0),
        0.424,
        new Vector3(torsoW / 0.424, (chest.y - hips.y) * 0.85, (torsoW * 0.72) / 0.424)
      ),
      bone: 'Spine1',
      color: jersey,
    });
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

    const geom = mergeParts(parts);
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
 * Hair as primitives. Crude by design — these are proxies — but the SILHOUETTE
 * has to differ per style, because silhouette is what makes 30 kids readable
 * at outfield distance, and reading them at distance is what the spike exists
 * to prove.
 */
function hairParts(
  style: HairStyle,
  head: Vector3,
  r: number,
  headW: number,
  headH: number,
  color: number
): Part[] {
  const crown = head.clone().add(new Vector3(0, r * 0.95, 0));
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
      add(ball(crown.clone().add(new Vector3(0, r * 0.22, 0)), r * 1.42, new Vector3(sx, sy * 0.95, sx)));
      break;
    case 'mohawk':
      add(ball(crown, r * 1.0, new Vector3(sx, sy * 0.5, sx)));
      add(box(crown.clone().add(new Vector3(0, r * 0.55, -0.024)), 0.165, r * 1.0, r * 1.7));
      break;
    case 'spiky': {
      add(ball(crown, r * 1.02, new Vector3(sx, sy * 0.66, sx)));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const g = new ConeGeometry(0.106, 0.353, 5);
        g.translate(crown.x + Math.cos(a) * r * 0.42, crown.y + r * 0.42, crown.z + Math.sin(a) * r * 0.38);
        add(g);
      }
      break;
    }
    case 'ponytail':
      add(ball(crown, r * 1.06, new Vector3(sx, sy * 0.78, sx)));
      add(ball(head.clone().add(new Vector3(0, r * 0.5, -r * 1.05)), r * 0.5, new Vector3(0.8, 1.5, 0.8)));
      break;
    case 'pigtails':
      add(ball(crown, r * 1.06, new Vector3(sx, sy * 0.76, sx)));
      for (const sgn of [-1, 1]) {
        add(ball(head.clone().add(new Vector3(sgn * r * 1.05, r * 0.42, -r * 0.2)), r * 0.42, new Vector3(0.85, 1.3, 0.85)));
      }
      break;
    case 'bun':
      add(ball(crown, r * 1.04, new Vector3(sx, sy * 0.76, sx)));
      add(ball(crown.clone().add(new Vector3(0, r * 0.5, -r * 0.55)), r * 0.42));
      break;
    case 'long':
      add(ball(crown, r * 1.08, new Vector3(sx, sy * 0.82, sx)));
      add(ball(head.clone().add(new Vector3(0, -r * 0.1, -r * 0.5)), r * 0.66, new Vector3(1.05, 1.5, 0.7)));
      break;
  }
  return out;
}

function accessoryParts(
  acc: Accessory,
  head: Vector3,
  r: number,
  headW: number,
  headH: number,
  teamColor: number
): Part[] {
  const crown = head.clone().add(new Vector3(0, r * 0.95, 0));
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
          geom: ball(head.clone().add(new Vector3(0, r * 0.62, 0)), r * 1.1, new Vector3(headW, headH * 0.16, headW)),
          bone: 'Head',
          color: 0xffffff,
        },
      ];
    case 'glasses':
      return [-1, 1].map((sgn) => ({
        geom: ball(head.clone().add(new Vector3(sgn * r * 0.34, r * 0.72, r * 0.82)), r * 0.24, new Vector3(1, 0.85, 0.35)),
        bone: 'Head',
        color: 0x2b3440,
      }));
    default:
      return [];
  }
}
