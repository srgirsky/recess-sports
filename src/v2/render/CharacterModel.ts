// ---------------------------------------------------------------------------
// ★ THE DELIVERED CHARACTER — a production `kid_<id>.glb`, made playable.
//
// Everything the asset contract's §4 promises at RUNTIME happens here: the
// three LOD nodes become a real `LOD`, the four named material slots are rebound
// onto this project's toon shader, `M_Uniform` takes the drafting team's colour
// as a multiply, and the `face_atlas` becomes an expression you can set in one
// uniform write.
//
// ★ IT PRESENTS EXACTLY THE SAME SURFACE AS `ProxyCharacter`, and that is the
// design, not a convenience. `AnimationDirector`, the spikes and (later) the
// game bind to `KidView`, so a kid whose production file is missing,
// or whose file 404s, is not a special case anywhere downstream — it is the
// same object with cruder geometry. That is what makes §5's "batches of 5-6"
// delivery schedule remains shippable one batch at a time.
//
// FOUR RULES WORTH KNOWING BEFORE EDITING:
//
//   1. THE PROXY IS LOD3. §5 says so, and it is load-bearing twice: it is the
//      cheapest thing that can stand at 300ft, and it is already built, so the
//      fallback path and the far-distance path are the same code.
//   2. MATERIALS ARE REBOUND, NOT USED AS DELIVERED. A `.glb` arrives with
//      `MeshStandardMaterial`s from whatever exported it. Keeping them would
//      mean 30 kids lit by a PBR pipeline standing on a toon-shaded field, with
//      no rim light, no outline taper, and a program per character. The slot
//      NAMES are the contract precisely so this swap is mechanical.
//   3. OUTLINE HULLS ARE SIBLINGS — PER LEVEL. The hull-is-never-a-child rule
//      applies once for each LOD level, and each level needs its own, because a
//      hull shares its source mesh's geometry.
//   4. GEOMETRY AND TEXTURES ARE SHARED ACROSS INSTANCES. `SkeletonUtils.clone`
//      duplicates the scene graph and the skeleton while leaving buffers and
//      maps alone, so nine kids of the same character cost one upload.
// ---------------------------------------------------------------------------

import {
  Bone,
  BufferGeometry,
  Group,
  LOD,
  Mesh,
  MeshToonMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Texture,
  type Material,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VisualParams } from '../../data/types';
import { CHARACTER_SCALE, ProxyCharacter, kidHeightFt, kidRootScale } from './ProxyCharacter';
import { attachMergedOutline, attachOutline, type OutlineRegistry } from './materials/outline';
import { hairHex, jerseyHex, skinHex, trimHex, type SlotName } from './materials/registry';
import { makeToonMaterial, setFaceCell } from './materials/toon';
import { faceCellUv, restingCell, type FaceCell } from './faceAtlas';
import { lodDistancesFt } from './perfTier';

/** What every character presents, whether it is a model or a proxy. */
export interface KidView {
  readonly root: Group;
  /** What an `AnimationDirector` binds its mixer to. */
  readonly mesh: Object3D;
  readonly bones: Bone[];
  readonly skeleton: Skeleton;
  /** Real stature, floor to `HeadTop_End`, in feet. */
  readonly heightFt: number;
  /** True when this is a stand-in rather than a production model. */
  readonly isProxy: boolean;
  setPosition(x: number, z: number): void;
  setFacing(radians: number): void;
  /** A no-op on anything with no `face_atlas` — see `faceAtlas.ts`. */
  setExpression(cell: FaceCell): void;
  dispose(): void;
}

export interface CharacterModelOptions {
  /** Team colour index: full procedural kit or authored accent surface. */
  uniform?: number;
  outlines?: OutlineRegistry;
  /**
   * Added to the LOD index: 1 means "never use LOD0". Comes from
   * `perfTier.lodBias`, which is where the device decision lives.
   */
  lodBias?: number;
  /** Skip building the proxy LOD3. Tests use it; the game never should. */
  noProxyLevel?: boolean;
}

/** Ordered nearest-first, exactly as the contract names them. */
const LOD_SUFFIXES = ['LOD0', 'LOD1', 'LOD2'] as const;

export class CharacterModel implements KidView {
  readonly root = new Group();
  readonly mesh: Object3D;
  readonly bones: Bone[] = [];
  readonly skeleton: Skeleton;
  readonly heightFt: number;
  readonly isProxy = false;

  /** Which LOD levels the file actually provided, nearest first. */
  readonly levels: string[] = [];

  private readonly lod = new LOD();
  private readonly proxy: ProxyCharacter | null = null;
  private readonly bodyMaterials: MeshToonMaterial[] = [];
  private readonly owned: Material[] = [];
  private readonly ownedGeometry: BufferGeometry[] = [];

  constructor(
    readonly id: string,
    gltf: GLTF,
    visual: VisualParams,
    opts: CharacterModelOptions = {}
  ) {
    // Clone before touching anything: the cached GLTF is shared by every
    // instance of this character, and rebinding materials on the ORIGINAL would
    // give the second kid the first kid's jersey.
    const scene = cloneSkinned(gltf.scene) as Object3D;

    this.heightFt = kidHeightFt(visual);

    const uniformIndex = opts.uniform ?? visual.uniform;
    const faceAtlas = findFaceAtlas(scene);

    // --- The LOD levels -----------------------------------------------------
    const found: Array<{ name: string; node: Object3D }> = [];
    for (const suffix of LOD_SUFFIXES) {
      const wanted = `kid_${id}_${suffix}`;
      const node = scene.getObjectByName(wanted);
      if (node) found.push({ name: suffix, node });
    }
    if (!found.length) {
      throw new Error(
        `CharacterModel: ${id} has no kid_${id}_LOD0/1/2 nodes. The contract (§4) requires all ` +
          'three by name — without them there is nothing to switch between and nothing to draw.'
      );
    }

    for (const { node } of found) {
      node.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const source = Array.isArray(m.material) ? m.material : [m.material];
        const vertexPalette = source.some((material) => material.userData.recessVertexPalette === true);
        m.material = this.rebind(m.material, { skin: visual, uniformIndex, faceAtlas, vertexPalette });
        m.castShadow = true;
        m.receiveShadow = false;
      });
      this.collapseVertexPalette(node);
    }

    // The skeleton is shared by every level (one skin, per §4), so any skinned
    // mesh answers for all of them.
    const skinned = firstSkinnedMesh(found[0].node);
    this.skeleton = skinned?.skeleton ?? new Skeleton([]);
    this.bones = this.skeleton.bones;

    // ★ THE BONES HAVE TO BE PARENTED, AND NOT INSIDE THE LOD.
    //
    // In a `.glb` the joints are siblings of the meshes under the scene, not
    // children of them — so lifting the LOD nodes out and dropping them into a
    // new group leaves the whole skeleton orphaned. Its world matrices then
    // never update, every vertex skins against a stale bind matrix, and the
    // character renders as NOTHING while still reporting a mesh, a LOD level
    // and a shadow caster. (Observed: 13 kids, "drawn 13 model / 0 proxy", an
    // empty field, and faint ground shadows where they should have been.)
    //
    // Under `this.root` rather than under a LOD level, because a LOD hides
    // every level but the active one: parent the bones inside LOD0 and the kid
    // vanishes again the moment they walk far enough away.
    const boneRoot = this.bones[0] ? topmostBone(this.bones[0]) : null;
    if (boneRoot) this.root.add(boneRoot);

    // ★ THE PROXY IS LOD3 (§5). Built from the same `VisualParams`, so a kid
    // does not change shape or size when they cross the threshold.
    if (!opts.noProxyLevel) {
      this.proxy = new ProxyCharacter(visual, { uniform: uniformIndex });
      // The proxy scales its OWN root to the kid's height; inside this LOD that
      // scale is applied once, by `this.root`, so undo it here.
      this.proxy.root.scale.setScalar(1);
    }

    // A delivered model is authored at the canonical 4.0ft bind pose (§2 hashes
    // it), so per-kid stature is this uniform scale — the same one the proxy
    // applies, from the same function, so the two cannot disagree.
    this.root.scale.setScalar(kidRootScale(visual));
    this.root.name = 'kid';

    const drawn = this.heightFt * CHARACTER_SCALE;
    const distances = lodDistancesFt(drawn);
    const candidates: Array<{ name: string; node: Object3D; at: number }> = found.map((f, i) => ({
      ...f,
      at: distances[i] ?? distances[distances.length - 1],
    }));
    if (this.proxy) {
      candidates.push({ name: 'proxy', node: this.proxy.root, at: distances[2] });
    }

    // ★ `lodBias` DROPS the nearest levels rather than scaling distances.
    // `perfTier` defines it as "added to every character's LOD index — 1 means
    // never use LOD0", and dropping is literally that; scaling distances would
    // still upload LOD0's 7,000 triangles to a device that must never draw them.
    const bias = Math.max(0, Math.min(opts.lodBias ?? 0, candidates.length - 1));
    const used = candidates.slice(bias);

    used.forEach((level, i) => {
      // three requires the first level at distance 0.
      this.lod.addLevel(level.node, i === 0 ? 0 : (used[i - 1].at ?? 0));
      this.levels.push(level.name);
    });

    this.root.add(this.lod);
    this.mesh = skinned ?? this.lod;

    // Outlines LAST: `attachOutline` requires the mesh to already be in the
    // scene graph, because it adds the hull as a SIBLING.
    if (opts.outlines) {
      for (const level of used) {
        if (level.name === 'proxy') continue; // the proxy carries its own below
        // COLLECT, then attach. `attachOutline` adds the hull to the mesh's
        // PARENT, and `Object3D.traverse` re-reads `children.length` every
        // step — so attaching mid-traversal walks into the hulls it is
        // creating. The `isOutline` guard would catch it, but a loop that
        // depends on a guard to terminate is a loop waiting to be edited.
        const meshes: Mesh[] = [];
        level.node.traverse((o) => {
          const m = o as Mesh;
          if (m.isMesh && !m.userData.isOutline) meshes.push(m);
        });
        const skinned = meshes.filter((mesh): mesh is SkinnedMesh => (mesh as SkinnedMesh).isSkinnedMesh);
        const commonParent = skinned[0]?.parent;
        const mergedHull =
          commonParent && skinned.length === meshes.length && skinned.every((mesh) => mesh.parent === commonParent)
            ? attachMergedOutline(skinned, commonParent, opts.outlines)
            : null;
        if (mergedHull) this.ownedGeometry.push(mergedHull.geometry);
        else for (const m of meshes) attachOutline(m, opts.outlines);
      }
      if (this.proxy) attachOutline(this.proxy.mesh, opts.outlines);
    }

    this.setExpression(restingCell(visual.expression));
  }

  /**
   * Which level was drawn on the last frame — `LOD0`..`LOD2` or `proxy`.
   *
   * The review page reports the histogram. Without it "the LOD system works" is
   * an assertion about code nobody has watched run: three switches levels
   * silently inside `WebGLRenderer.render`, so a mis-derived distance table
   * looks exactly like a correct one until you count.
   */
  activeLevel(): string {
    return this.levels[this.lod.getCurrentLevel()] ?? this.levels[0] ?? 'none';
  }

  setPosition(x: number, z: number): void {
    this.root.position.set(x, 0, z);
  }

  setFacing(radians: number): void {
    this.root.rotation.y = radians;
  }

  /** Point every body material at an atlas cell. No-op with no `face_atlas`. */
  setExpression(cell: FaceCell): void {
    const uv = faceCellUv(cell);
    for (const m of this.bodyMaterials) setFaceCell(m, uv);
  }

  dispose(): void {
    // Geometry and textures belong to the CACHED gltf and are shared with every
    // other instance of this character — disposing them here would blank the
    // other eight kids on the field. Only the materials this instance minted
    // are ours to free.
    for (const m of this.owned) m.dispose();
    for (const geometry of this.ownedGeometry) geometry.dispose();
    this.owned.length = 0;
    this.ownedGeometry.length = 0;
    this.bodyMaterials.length = 0;
    this.proxy?.dispose();
  }

  // --- Internals ------------------------------------------------------------

  /**
   * Swap a delivered material for this project's toon material, keyed on the
   * slot NAME the contract mandates.
   *
   * An unrecognised name is not fatal: it renders as an accessory in its own
   * delivered colour. The validator is where a wrong slot name gets rejected,
   * and duplicating that judgement here would mean a model could pass the gate
   * and still fail to draw.
   */
  private rebind(
    source: Material | Material[],
    ctx: { skin: VisualParams; uniformIndex: number; faceAtlas: Texture | null; vertexPalette: boolean }
  ): Material | Material[] {
    if (Array.isArray(source)) return source.map((m) => this.rebind(m, ctx) as Material);

    const slot = source.name as SlotName | string;
    const map = (source as { map?: Texture | null }).map ?? null;
    const { skin, uniformIndex, faceAtlas, vertexPalette } = ctx;

    let material: MeshToonMaterial;
    switch (slot) {
      case 'M_Body':
        // The face atlas rides the body material — it is the only slot whose UVs
        // contain the face island.
        material = makeToonMaterial({
          color: vertexPalette ? 0xffffff : skinHex(skin.skin),
          map,
          faceAtlas: map ? faceAtlas : null,
          rimStrength: 0.16,
          rimPower: 3.4,
        });
        this.bodyMaterials.push(material);
        break;
      case 'M_Uniform':
        // Procedural roster kits remain greyscale and take the team's colour.
        // A reference-authored character may instead declare an identity
        // palette: its COLOR_0 is the character design, not a tint mask.
        // Team colour then lives only on a recessTeamAccent surface.
        material = makeToonMaterial({
          color: vertexPalette && source.userData.recessIdentityPalette === true ? 0xffffff : jerseyHex(uniformIndex),
          map,
          rimStrength: 0.26,
          rimPower: 3.0,
        });
        break;
      case 'M_Hair':
        material = makeToonMaterial({
          color: vertexPalette ? 0xffffff : hairHex(skin.hairColor),
          map,
          rimStrength: 0.34,
          rimPower: 2.6,
        });
        break;
      case 'M_Accessory':
        material = makeToonMaterial({
          color:
            source.userData.recessTeamAccent === true || !vertexPalette
              ? trimHex(uniformIndex)
              : 0xffffff,
          map,
          rimStrength: 0.22,
        });
        break;
      default:
        return source;
    }

    material.name = slot;
    material.vertexColors = vertexPalette;
    material.userData.recessVertexPalette = vertexPalette;
    this.owned.push(material);
    return material;
  }

  /**
   * Generated roster files preserve all four delivery slots, but their final
   * linear colours live in COLOR_0. Bake each slot's remaining material tint
   * into those vertices, then merge every primitive so a roster kid costs one
   * colour pass and one shadow pass. This covers both the procedural all-over
   * team multiply and an authored character's small team-accent surface. Team
   * identity is fixed when a KidView is constructed, so this loses no runtime
   * behaviour. External deliveries without the explicit material extra keep the
   * general four-slot path unchanged.
   */
  private collapseVertexPalette(root: Object3D): void {
    const meshes: SkinnedMesh[] = [];
    root.traverse((object) => {
      const mesh = object as SkinnedMesh;
      if (!mesh.isSkinnedMesh || Array.isArray(mesh.material)) return;
      if (mesh.material.userData.recessVertexPalette === true) meshes.push(mesh);
    });
    if (meshes.length < 2) return;

    const parent = meshes[0].parent;
    const body = meshes.find((mesh) => !Array.isArray(mesh.material) && mesh.material.name === 'M_Body');
    if (!parent || !body || meshes.some((mesh) => mesh.parent !== parent)) return;
    if (meshes.some((mesh) => !mesh.position.equals(meshes[0].position) || !mesh.quaternion.equals(meshes[0].quaternion) || !mesh.scale.equals(meshes[0].scale))) {
      return;
    }

    const copies = meshes.map((mesh) => {
      const copy = mesh.geometry.clone();
      const material = mesh.material as MeshToonMaterial;
      const colour = copy.getAttribute('color');
      const tint = material.color;
      if (colour) {
        for (let i = 0; i < colour.count; i++) {
          colour.setXYZ(i, colour.getX(i) * tint.r, colour.getY(i) * tint.g, colour.getZ(i) * tint.b);
        }
        colour.needsUpdate = true;
      }
      return copy;
    });
    const geometry = mergeGeometries(copies, false);
    for (const copy of copies) copy.dispose();
    if (!geometry) return;

    const merged = new SkinnedMesh(geometry, body.material as Material);
    merged.name = `${root.name || 'LOD'}__palette`;
    merged.position.copy(meshes[0].position);
    merged.quaternion.copy(meshes[0].quaternion);
    merged.scale.copy(meshes[0].scale);
    merged.bind(meshes[0].skeleton, meshes[0].bindMatrix);
    merged.castShadow = true;
    merged.receiveShadow = false;
    parent.add(merged);
    for (const mesh of meshes) mesh.removeFromParent();
    this.ownedGeometry.push(geometry);
  }
}

/** Walk up from a joint to the root of its bone hierarchy. */
function topmostBone(bone: Bone): Bone {
  let node: Object3D = bone;
  while (node.parent && (node.parent as Bone).isBone) node = node.parent;
  return node as Bone;
}

function firstSkinnedMesh(root: Object3D): SkinnedMesh | null {
  let found: SkinnedMesh | null = null;
  root.traverse((o) => {
    const s = o as SkinnedMesh;
    if (!found && s.isSkinnedMesh && !s.userData.isOutline) found = s;
  });
  return found;
}

/**
 * The `face_atlas` map, if the model shipped one.
 *
 * §4 lists it as a texture but does not name a glTF slot for it, and glTF has
 * no "second albedo" channel — so it travels as `emissiveMap` on `M_Body`,
 * which is the one map slot the toon shader ignores entirely. That is a
 * convention, and it is stated in the contract for the modeller.
 */
function findFaceAtlas(scene: Object3D): Texture | null {
  let atlas: Texture | null = null;
  scene.traverse((o) => {
    const m = (o as Mesh).material;
    const list = Array.isArray(m) ? m : m ? [m] : [];
    for (const mat of list) {
      if (mat.name !== 'M_Body') continue;
      const emissive = (mat as { emissiveMap?: Texture | null }).emissiveMap;
      if (emissive) atlas ??= emissive;
    }
  });
  return atlas;
}
