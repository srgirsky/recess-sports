// ---------------------------------------------------------------------------
// ★ Emit `skeleton_recess_v1.glb` — the rig the animator and all 30 modellers
// work from — FROM `src/v2/render/skeleton.ts`.
//
// Generated, never hand-authored, and that is the whole point. The brief opens
// with "1 unit = 1 foot, the reference kid is 4.0ft"; if the file that ships
// with it were maintained by hand it could disagree with the code, and it
// would disagree silently, and 43 clips would come back authored against the
// wrong proportions. (The engine-side version of exactly that bug is why
// `REFERENCE_HEIGHT_FT` said 4.0 while the bone table summed to 3.4.)
//
//   npm run export:skeleton
//
// ★ THE PLACEHOLDER MESH IS NOT OPTIONAL. glTF only recognises a node as a
// joint if some skin references it, and a skin is only reachable through a
// node that has BOTH `mesh` and `skin`. Ship the 33 bones alone and Blender
// imports 33 loose empties — no armature, nothing to pose, useless to an
// animator. Two triangles bound to `Hips` cost 200 bytes and make the file a
// real rig. The contract tells the artist to delete it.
// ---------------------------------------------------------------------------

import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bounds, f32, u16, writeGlb } from './glb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');

export async function loadSkeletonSpec() {
  // Node >= 22.6 strips TypeScript types on import, so the spec has exactly one
  // home. See the note in validate-models.mjs about the version requirement.
  return import(join(repo, 'src', 'v2', 'render', 'skeleton.ts'));
}

export async function buildSkeletonGlb(outPath) {
  const { SKELETON, REFERENCE_HEIGHT_FT, bindPoseHash, crownHeightFt } = await loadSkeletonSpec();

  const crown = crownHeightFt();
  if (Math.abs(crown - REFERENCE_HEIGHT_FT) > 1e-6) {
    // Refuse rather than ship. A rig whose height contradicts its own spec is
    // the single most expensive thing this file could emit.
    throw new Error(
      `skeleton.ts is inconsistent: crown is ${crown.toFixed(4)}ft but REFERENCE_HEIGHT_FT is ${REFERENCE_HEIGHT_FT}`
    );
  }

  const byName = new Map(SKELETON.map((b, i) => [b.name, i]));
  const nodes = SKELETON.map((b) => ({
    name: b.name,
    translation: [...b.pos],
    children: [],
  }));
  for (const b of SKELETON) {
    if (b.parent) nodes[byName.get(b.parent)].children.push(byName.get(b.name));
  }
  for (const n of nodes) if (!n.children.length) delete n.children;

  // Inverse bind matrices: the inverse of each joint's world transform. The
  // bind pose is translation-only, so the inverse is a translation by -world.
  const world = new Map();
  for (const b of SKELETON) {
    const p = b.parent ? world.get(b.parent) : [0, 0, 0];
    world.set(b.name, [p[0] + b.pos[0], p[1] + b.pos[1], p[2] + b.pos[2]]);
  }
  const ibm = [];
  for (const b of SKELETON) {
    const [x, y, z] = world.get(b.name);
    // Column-major, per glTF.
    ibm.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1);
  }

  // The placeholder: two triangles at the hips, fully weighted to `Hips`.
  const hipsY = world.get('Hips')[1];
  const positions = [
    -0.05, hipsY - 0.05, 0, 0.05, hipsY - 0.05, 0, 0.05, hipsY + 0.05, 0, -0.05, hipsY + 0.05, 0,
  ];
  const indices = [0, 1, 2, 0, 2, 3];
  const joints = [];
  const weights = [];
  const hipsJoint = byName.get('Hips');
  for (let i = 0; i < 4; i++) {
    joints.push(hipsJoint, 0, 0, 0);
    weights.push(1, 0, 0, 0);
  }

  const skinNode = nodes.length;
  nodes.push({ name: 'RIG_PLACEHOLDER', mesh: 0, skin: 0 });

  const chunks = [f32(positions), u16(indices), u16(joints), f32(weights), f32(ibm)];
  const lengths = chunks.map((c) => c.length);
  const offsets = [];
  let at = 0;
  for (const len of lengths) {
    offsets.push(at);
    at += len + ((4 - (len % 4)) % 4);
  }
  const pos = bounds(positions, 3);

  const json = {
    asset: {
      version: '2.0',
      generator: `recess-sports export-skeleton (bindPoseHash ${bindPoseHash()}, ${REFERENCE_HEIGHT_FT}ft)`,
    },
    scene: 0,
    scenes: [{ nodes: [0, skinNode] }],
    nodes,
    skins: [{ name: 'skeleton_recess_v1', inverseBindMatrices: 4, skeleton: 0, joints: SKELETON.map((_, i) => i) }],
    meshes: [
      {
        name: 'RIG_PLACEHOLDER',
        primitives: [{ attributes: { POSITION: 0, JOINTS_0: 2, WEIGHTS_0: 3 }, indices: 1, mode: 4 }],
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: pos.min, max: pos.max },
      { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
      { bufferView: 2, componentType: 5123, count: 4, type: 'VEC4' },
      { bufferView: 3, componentType: 5126, count: 4, type: 'VEC4' },
      { bufferView: 4, componentType: 5126, count: SKELETON.length, type: 'MAT4' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: lengths[0], target: 34962 },
      { buffer: 0, byteOffset: offsets[1], byteLength: lengths[1], target: 34963 },
      { buffer: 0, byteOffset: offsets[2], byteLength: lengths[2], target: 34962 },
      { buffer: 0, byteOffset: offsets[3], byteLength: lengths[3], target: 34962 },
      { buffer: 0, byteOffset: offsets[4], byteLength: lengths[4] },
    ],
  };

  mkdirSync(dirname(outPath), { recursive: true });
  const { bytes } = writeGlb(outPath, json, chunks);
  return { bytes, bones: SKELETON.length, crown, hash: bindPoseHash() };
}

const DEFAULT_OUT = join(repo, 'assets', 'v2', 'skeleton_recess_v1.glb');

// pathToFileURL, not a template string: this repo's path contains a space, and
// `file://.../Recess Sports/...` never equals the percent-encoded import.meta.url.
// The guard silently never fired.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_OUT;
  const r = await buildSkeletonGlb(out);
  console.log(`wrote ${out}`);
  console.log(`  ${r.bones} bones · crown ${r.crown.toFixed(3)}ft · bindPoseHash ${r.hash} · ${r.bytes} bytes`);
}

export { DEFAULT_OUT };
