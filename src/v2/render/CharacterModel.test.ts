// ---------------------------------------------------------------------------
// The delivered-character path, against a REAL `.glb`.
//
// Every assertion here is about something that is invisible until it is wrong
// and then wrong in a way that does not look like a bug:
//
//   * a jersey that renders in the exporter's colour instead of the drafting
//     team's reads as "the artist picked blue";
//   * an outline hull parented as a CHILD renders the kid as a solid navy blob,
//     which reads as a shader problem;
//   * a missing proxy LOD3 means a distant fielder is drawn at 7,000 triangles,
//     which reads as nothing at all until the frame budget is gone;
//   * a model and its proxy fallback at different heights means a kid changes
//     size when a file 404s, which reads as a rendering glitch.
//
// None of it needs a GPU: three builds the whole scene graph, the materials and
// the LOD in plain JavaScript. What is being checked is the graph.
// ---------------------------------------------------------------------------

import { describe, expect, it, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOD, Mesh, SkinnedMesh, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CharacterModel } from './CharacterModel';
import { ProxyCharacter, kidHeightFt } from './ProxyCharacter';
import { OutlineRegistry } from './materials/outline';
import { jerseyHex, skinHex } from './materials/registry';
import { ROSTER } from '../../data/characters';
import { lodDistancesFt } from './perfTier';

/**
 * The fixture is BUILT here rather than read from `public/v2/models/`.
 *
 * Depending on a committed artefact would make this suite pass or fail on what
 * somebody last exported, and the point is to test the loader against a
 * contract-legal file — which the exporter is defined to produce. It also means
 * a fresh clone runs green before anything has been generated.
 */
const ID = 'moose';
const character = ROSTER.find((c) => c.id === ID)!;
const tmp = mkdtempSync(join(tmpdir(), 'recess-model-'));

/** The exporter is plain `.mjs` with no type declarations, so it is imported
 *  through a variable specifier — `tsc` cannot resolve one, which is the point.
 *  Its shape is asserted by `scripts/v2/validate-models.test.js`. */
const EXPORTER = '../../../scripts/v2/export-proxy-kid.mjs';

// GLTFLoader's browser texture path only needs a decoded image-shaped object
// for this scene-graph test. Node supplies Blob/object URLs but no `self` or
// createImageBitmap, so provide the two narrow platform shims before parsing a
// production fixture with embedded PNGs.
const loaderGlobals = globalThis as unknown as Record<string, unknown>;
loaderGlobals.self ??= globalThis;
loaderGlobals.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} } as ImageBitmap);

interface Exporter {
  buildProxyKidGlb(id: string, out: string, spec: unknown, options?: { delivery?: boolean }): Promise<unknown>;
  loadProxySpec(): Promise<unknown>;
}

async function build(id: string, delivery = false): Promise<GLTF> {
  const { buildProxyKidGlb, loadProxySpec } = (await import(/* @vite-ignore */ EXPORTER)) as Exporter;
  const path = join(tmp, `kid_${id}${delivery ? '-roster' : ''}.glb`);
  await buildProxyKidGlb(id, path, await loadProxySpec(), { delivery });
  const bytes = readFileSync(path);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer as ArrayBuffer, '', resolve, reject);
  });
}

function meshes(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

let gltf: GLTF;
let rosterGltf: GLTF;
beforeAll(async () => {
  gltf = await build(ID);
  rosterGltf = await build(ID, true);
});

describe('a delivered model becomes a playable character', () => {
  it('reads all three LOD nodes and appends the proxy as LOD3', () => {
    // §5: "the proxies ... serve as LOD3 and as the fallback when a model fails
    // to load". Both halves are the same object, which is why the far-distance
    // path costs nothing extra to have.
    const kid = new CharacterModel(ID, gltf, character.visual);
    expect(kid.levels).toEqual(['LOD0', 'LOD1', 'LOD2', 'proxy']);
    kid.dispose();
  });

  it('switches levels at the derived distances, nearest first', () => {
    const kid = new CharacterModel(ID, gltf, character.visual);
    const lod = kid.root.children.find((c) => (c as LOD).isLOD) as LOD;
    expect(lod).toBeDefined();

    const distances = lod.levels.map((l) => l.distance);
    expect(distances[0]).toBe(0); // three requires it
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThan(distances[i - 1]);
    }
    // Not arbitrary numbers: they come from apparent PIXEL size, so they follow
    // the kid being drawn rather than one camera and one screen.
    const expected = lodDistancesFt(kid.heightFt * 1.6);
    expect(distances.slice(1)).toEqual(expected.slice(0, distances.length - 1));
    kid.dispose();
  });

  it('drops the nearest levels under lodBias, rather than only moving distances', () => {
    // `perfTier` defines lodBias as "added to every character's LOD index — 1
    // means never use LOD0". Scaling distances would still UPLOAD LOD0's 7,000
    // triangles to a device that must never draw them.
    const kid = new CharacterModel(ID, gltf, character.visual, { lodBias: 1 });
    expect(kid.levels).toEqual(['LOD1', 'LOD2', 'proxy']);
    kid.dispose();
  });

  it('parents the skeleton, and OUTSIDE the LOD', () => {
    // ★ The bug the browser found and no unit test could see. In a .glb the
    // joints are siblings of the meshes under the scene, so lifting the LOD
    // nodes into a new group orphans the whole skeleton: world matrices never
    // update, every vertex skins against a stale bind matrix, and the character
    // draws NOTHING while still reporting a mesh, a LOD level and a shadow.
    // Observed as 13 kids, "drawn 13 model / 0 proxy", and an empty field.
    const kid = new CharacterModel(ID, gltf, character.visual);

    const root = kid.bones[0];
    let top: Object3D = root;
    while (top.parent && (top.parent as never as { isBone?: boolean }).isBone) top = top.parent;
    expect(top.parent, 'the skeleton is not in the scene graph').toBe(kid.root);

    // And not inside a level — a LOD hides every level but the active one, so
    // bones parented under LOD0 would vanish the moment the kid walks away.
    // By IDENTITY, not by name: the proxy level carries its own `Root` bone
    // (a proxy owns its whole skeleton), and matching on the name finds that.
    const lod = kid.root.children.find((c) => (c as LOD).isLOD) as LOD;
    for (const level of lod.levels) {
      let contains = false;
      level.object.traverse((o) => {
        if (o === top) contains = true;
      });
      expect(contains, `${level.object.name} contains the model's skeleton`).toBe(false);
    }
    kid.dispose();
  });

  it('is the same height as the proxy it falls back to', () => {
    // A kid that changes size when a file 404s reads as a rendering glitch, not
    // as a missing model — which is why both go through `kidHeightFt`.
    const model = new CharacterModel(ID, gltf, character.visual);
    const proxy = new ProxyCharacter(character.visual);
    expect(model.heightFt).toBeCloseTo(proxy.heightFt, 10);
    expect(model.root.scale.x).toBeCloseTo(proxy.root.scale.x, 10);
    expect(model.heightFt).toBeCloseTo(kidHeightFt(character.visual), 10);
    model.dispose();
    proxy.dispose();
  });
});

describe('material slots', () => {
  it('rebinds every delivered material onto the toon shader, by slot name', () => {
    const kid = new CharacterModel(ID, gltf, character.visual);
    const named = meshes(kid.root)
      .flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material]))
      .filter((m) => m.name.startsWith('M_'));
    expect(named.length).toBeGreaterThan(0);
    for (const m of named) {
      // MeshToonMaterial, not the exporter's MeshStandardMaterial: 30 kids lit
      // by a PBR pipeline standing on a toon-shaded field is the failure.
      expect(m.type, m.name).toBe('MeshToonMaterial');
    }
    kid.dispose();
  });

  it('puts the TEAM colour on M_Uniform and nowhere else', () => {
    // ★ The entire team-identity system (§4). v1 baked 315 textures per team.
    const team = 2;
    const kid = new CharacterModel(ID, gltf, character.visual, { uniform: team });
    const bySlot = new Map<string, number[]>();
    for (const m of meshes(kid.root)) {
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const c = (mat as { color?: { getHex(): number } }).color;
        if (mat.name.startsWith('M_') && c) {
          bySlot.set(mat.name, [...(bySlot.get(mat.name) ?? []), c.getHex()]);
        }
      }
    }
    expect(bySlot.get('M_Uniform')).toContain(jerseyHex(team));
    expect(bySlot.get('M_Body')).toContain(skinHex(character.visual.skin));
    expect(bySlot.get('M_Body')).not.toContain(jerseyHex(team));
    kid.dispose();
  });

  it('wears whoever drafted them, not their own authored colour', () => {
    const own = character.visual.uniform;
    const other = (own + 1) % 4;
    const a = new CharacterModel(ID, gltf, character.visual, { uniform: own });
    const b = new CharacterModel(ID, gltf, character.visual, { uniform: other });
    const uniformColor = (kid: CharacterModel) =>
      meshes(kid.root)
        .flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material]))
        .filter((m) => m.name === 'M_Uniform')
        .map((m) => (m as unknown as { color: { getHex(): number } }).color.getHex())[0];
    expect(uniformColor(a)).not.toBe(uniformColor(b));
    a.dispose();
    b.dispose();
  });

  it('does not mutate the cached gltf, so the second kid is not the first kid', () => {
    // The GLTF is shared by every instance of this character. Rebinding the
    // ORIGINAL would give kid #2 kid #1's jersey — and only ever on the field,
    // never in a test that built one.
    const before = meshes(gltf.scene).map((m) =>
      Array.isArray(m.material) ? m.material.map((x) => x.type) : [m.material.type]
    );
    const kid = new CharacterModel(ID, gltf, character.visual, { uniform: 3 });
    const after = meshes(gltf.scene).map((m) =>
      Array.isArray(m.material) ? m.material.map((x) => x.type) : [m.material.type]
    );
    expect(after).toEqual(before);
    kid.dispose();
  });
});

describe('generated roster delivery', () => {
  it('collapses every populated slot to one skinned draw per LOD', () => {
    const outlines = new OutlineRegistry();
    const kid = new CharacterModel(ID, rosterGltf, character.visual, {
      uniform: 2,
      outlines,
      noProxyLevel: true,
    });
    const lod = kid.root.children.find((child) => (child as LOD).isLOD) as LOD;

    for (const level of lod.levels) {
      const levelMeshes = meshes(level.object);
      const colourPasses = levelMeshes.filter((mesh) => !mesh.userData.isOutline);
      const hulls = levelMeshes.filter((mesh) => mesh.userData.isOutline);
      expect(colourPasses, `${level.object.name} colour passes`).toHaveLength(1);
      expect(hulls, `${level.object.name} outline passes`).toHaveLength(1);
      expect(colourPasses[0].material).not.toBeInstanceOf(Array);
      expect((colourPasses[0].material as { name: string }).name).toBe('M_Body');
      expect((colourPasses[0].material as { userData: Record<string, unknown> }).userData.hasFaceAtlas).toBe(true);
    }

    kid.dispose();
    outlines.dispose();
  });

  it('bakes the drafting team into uniform vertices before merging', () => {
    const first = new CharacterModel(ID, rosterGltf, character.visual, { uniform: 0, noProxyLevel: true });
    const second = new CharacterModel(ID, rosterGltf, character.visual, { uniform: 2, noProxyLevel: true });
    const colours = (kid: CharacterModel) => {
      const lod = kid.root.children.find((child) => (child as LOD).isLOD) as LOD;
      return Array.from(meshes(lod.levels[0].object)[0].geometry.getAttribute('color').array as ArrayLike<number>);
    };
    expect(colours(first)).not.toEqual(colours(second));
    first.dispose();
    second.dispose();
  });
});

describe('outlines', () => {
  it('attaches every hull as a SIBLING, never a child', () => {
    // ★ A skinned hull parented UNDER its skinned mesh inherits the already-
    // posed world matrix and skins a second time: every character renders as a
    // solid navy blob. Observed, on the whole field.
    const kid = new CharacterModel(ID, gltf, character.visual, { outlines: new OutlineRegistry() });
    const hulls = meshes(kid.root).filter((m) => m.userData.isOutline);
    expect(hulls.length).toBeGreaterThan(0);
    for (const hull of hulls) {
      expect(hull.parent).toBeTruthy();
      expect((hull.parent as Mesh).isMesh, `${hull.name} is parented under a mesh`).not.toBe(true);
      expect((hull.parent as SkinnedMesh).isSkinnedMesh).not.toBe(true);
    }
    kid.dispose();
  });

  it('outlines every LOD level, not just the nearest', () => {
    // A hull shares its source mesh's geometry, so one hull cannot serve three
    // levels — and the level with no hull is the one nobody looks at closely.
    const kid = new CharacterModel(ID, gltf, character.visual, { outlines: new OutlineRegistry() });
    const lod = kid.root.children.find((c) => (c as LOD).isLOD) as LOD;
    for (const level of lod.levels) {
      const hulls = meshes(level.object).filter((m) => m.userData.isOutline);
      expect(hulls.length, `${level.object.name} has no outline`).toBeGreaterThan(0);
    }
    kid.dispose();
  });
});

describe('it refuses what it cannot draw', () => {
  it('rejects a model whose LOD nodes are named for a different character', () => {
    // Silently drawing nothing is the alternative, and an invisible fielder is
    // a bug report about the sim.
    expect(() => new CharacterModel('someone_else', gltf, character.visual)).toThrow(/LOD0/);
  });
});
