// ---------------------------------------------------------------------------
// The validator, gated in CI.
//
// Two jobs, and the second is the one that matters.
//
//   1. Everything the repo itself produces must PASS: the exported rig, and an
//      animation library built from the procedural stand-ins. If our own output
//      cannot clear the contract, the contract is not implementable and the
//      artist would find that out at their expense.
//
//   2. Every rule must FIRE. A validator is worth exactly what its failures are
//      worth, and a rule that silently never triggers is indistinguishable from
//      no rule at all — which is the state `npm run validate:models` was in
//      before this branch: cited in five places, existing in none. So each
//      check below deliberately breaks one thing and demands the specific
//      rejection.
//
// Runs under vitest so CI (Node 20) gets the same rules the CLI runs on Node
// 22.6+, where TypeScript type stripping makes the contract importable directly.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readGlb, writeGlb, f32 } from './glb.mjs';
import { checkAnimations, checkContainer, checkSkeleton, makeReport } from './modelRules.mjs';
import { buildSkeletonGlb } from './export-skeleton.mjs';

import * as skeletonSpec from '../../src/v2/render/skeleton.ts';
import * as clipSpec from '../../src/v2/render/clips.ts';
import { buildProceduralClips } from '../../src/v2/render/proceduralClips.ts';

const contract = { ...skeletonSpec, ...clipSpec };
const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'recess-glb-'));

const FPS = clipSpec.FPS;

// --- Fixtures ----------------------------------------------------------------

/**
 * Write an animation-library .glb from a set of clips.
 *
 * Deliberately built by a DIFFERENT path from the one that reads it — three's
 * AnimationClips out, hand-written glTF in, plain-JS parsing back. A round trip
 * through one code path proves nothing; this proves the reader understands a
 * file it did not itself lay out.
 */
function writeAnimGlb(path, clips, { bones = contract.SKELETON } = {}) {
  const byName = new Map(bones.map((b, i) => [b.name, i]));
  const nodes = bones.map((b) => ({ name: b.name, translation: [...b.pos], children: [] }));
  for (const b of bones) if (b.parent) nodes[byName.get(b.parent)].children.push(byName.get(b.name));
  for (const n of nodes) if (!n.children.length) delete n.children;

  const chunks = [];
  const accessors = [];
  const bufferViews = [];
  const animations = [];

  const push = (values, type, count) => {
    const index = accessors.length;
    chunks.push(f32(values));
    bufferViews.push({ buffer: 0, byteOffset: 0, byteLength: 0 }); // patched below
    accessors.push({ bufferView: index, componentType: 5126, count, type });
    return index;
  };

  for (const clip of clips) {
    const channels = [];
    const samplers = [];
    for (const track of clip.tracks) {
      const [nodeName, property] = track.name.split('.');
      // three names the property `quaternion`/`position`; glTF's animation
      // target paths are `rotation`/`translation`. Writing three's names
      // produces a file every glTF reader silently ignores — which is exactly
      // what happened, and the marker check reported "peaks at frame 1" for
      // all ten clips because nothing was animating at all.
      const path = {
        quaternion: 'rotation',
        position: 'translation',
        scale: 'scale',
        // The hand-written fixtures below already speak glTF.
        rotation: 'rotation',
        translation: 'translation',
      }[property];
      const node = byName.get(nodeName);
      if (node === undefined || !path) continue;
      const parts = path === 'rotation' ? 4 : 3;
      const count = track.times.length;
      const input = push(Array.from(track.times), 'SCALAR', count);
      const output = push(Array.from(track.values), parts === 4 ? 'VEC4' : 'VEC3', count);
      samplers.push({ input, output, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node, path } });
    }
    animations.push({ name: clip.name, channels, samplers });
  }

  // Lay the buffer views out in the order the chunks were appended.
  let at = 0;
  chunks.forEach((c, i) => {
    bufferViews[i] = { buffer: 0, byteOffset: at, byteLength: c.length };
    at += c.length + ((4 - (c.length % 4)) % 4);
  });

  const json = {
    asset: { version: '2.0', generator: 'recess-sports test fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    animations,
    accessors,
    bufferViews,
  };
  writeGlb(path, json, chunks);
  return path;
}

let rigPath;
let animPath;

beforeAll(async () => {
  rigPath = join(tmp, 'skeleton_recess_v1.glb');
  await buildSkeletonGlb(rigPath);
  animPath = join(tmp, 'anims_recess_v1.glb');
  writeAnimGlb(animPath, buildProceduralClips());
});

function validate(path, kind) {
  const gltf = readGlb(path);
  const report = makeReport();
  checkContainer(gltf, report);
  if (kind === 'skeleton') checkSkeleton(gltf, contract, report);
  else checkAnimations(gltf, contract, report);
  return report;
}

const failures = (report) => report.items.filter((i) => i.severity === 'fail');
const rules = (report) => failures(report).map((i) => i.rule);

// --- What the repo produces must pass ----------------------------------------

describe('the assets this repo generates clear their own contract', () => {
  it('accepts the exported rig', () => {
    const report = validate(rigPath, 'skeleton');
    expect(failures(report).map((f) => `${f.rule}: ${f.message}`)).toEqual([]);
  });

  it('reports the rig at exactly the reference height', () => {
    const report = validate(rigPath, 'skeleton');
    const height = report.items.find((i) => i.rule === 'height');
    expect(height.message).toContain(`${skeletonSpec.REFERENCE_HEIGHT_FT.toFixed(3)}ft`);
  });

  it('gives the rig a skin, or importers build 33 loose empties', () => {
    // Without this the file is not an armature and is useless to an animator —
    // the reason the placeholder mesh exists at all.
    const gltf = readGlb(rigPath);
    expect(gltf.json.skins).toHaveLength(1);
    expect(gltf.json.skins[0].joints).toHaveLength(contract.SKELETON.length);
    expect(gltf.json.nodes.some((n) => n.skin !== undefined && n.mesh !== undefined)).toBe(true);
  });

  it('accepts the procedural animation library', () => {
    const report = validate(animPath, 'animations');
    expect(failures(report).map((f) => `${f.rule}: ${f.message}`)).toEqual([]);
  });

  it('confirms every marker frame from the motion alone', () => {
    // The derivation the contract commits to, run over 35 real clips.
    const report = validate(animPath, 'animations');
    const markerWarnings = report.items.filter((i) => i.rule === 'clip.marker' && i.severity === 'warn');
    expect(markerWarnings.map((w) => w.message)).toEqual([]);
    const confirmed = report.items.filter((i) => i.rule === 'clip.marker' && i.severity === 'info');
    expect(confirmed).toHaveLength(clipSpec.CLIPS.filter((c) => c.marker).length);
  });
});

// --- Every rule must fire ----------------------------------------------------

describe('the rules actually reject', () => {
  it('rejects a text .gltf renamed to .glb', () => {
    const path = join(tmp, 'kid_fake.glb');
    writeFileSync(path, JSON.stringify({ asset: { version: '2.0' } }));
    expect(() => readGlb(path)).toThrow(/text \.gltf/);
  });

  it('rejects a renamed bone', () => {
    const path = join(tmp, 'skeleton_renamed.glb');
    const bones = contract.SKELETON.map((b) => (b.name === 'LeftHand' ? { ...b, name: 'left_hand' } : b));
    const patched = contract.SKELETON.map((b) => (b.parent === 'LeftHand' ? { ...b, parent: 'left_hand' } : b));
    writeAnimGlb(path, [], { bones: bones.map((b, i) => ({ ...b, parent: patched[i].parent })) });
    const gltf = readGlb(path);
    const report = makeReport();
    checkSkeleton(gltf, contract, report);
    expect(rules(report)).toContain('bones.missing');
  });

  it('rejects a reordered skeleton, even when the set is right', () => {
    // Order is contractual: engine and retargeting tools both index joints
    // positionally, so a reordered rig animates, and animates WRONG.
    const path = join(tmp, 'skeleton_reordered.glb');
    const bones = [...contract.SKELETON];
    const i = bones.findIndex((b) => b.name === 'LeftShoulder');
    const j = bones.findIndex((b) => b.name === 'RightShoulder');
    [bones[i], bones[j]] = [bones[j], bones[i]];
    writeAnimGlb(path, [], { bones });
    const gltf = readGlb(path);
    const report = makeReport();
    checkSkeleton(gltf, contract, report);
    expect(rules(report)).toContain('bones.order');
  });

  it('rejects a 2mm nudge to the bind pose', () => {
    // The contract's own example of what gets rejected.
    const path = join(tmp, 'skeleton_nudged.glb');
    const bones = contract.SKELETON.map((b) =>
      b.name === 'LeftShoulder' ? { ...b, pos: [b.pos[0], b.pos[1] + 0.0066, b.pos[2]] } : b
    );
    writeAnimGlb(path, [], { bones });
    const gltf = readGlb(path);
    const report = makeReport();
    checkSkeleton(gltf, contract, report);
    const hit = failures(report).find((f) => f.rule === 'bones.bindPose');
    expect(hit).toBeDefined();
    expect(hit.message).toMatch(/LeftShoulder sits 2\.0mm/);
  });

  it('rejects a rig outside the height band', () => {
    const path = join(tmp, 'skeleton_short.glb');
    const bones = contract.SKELETON.map((b) => (b.name === 'HeadTop_End' ? { ...b, pos: [0, 0.4, 0] } : b));
    writeAnimGlb(path, [], { bones });
    const gltf = readGlb(path);
    const report = makeReport();
    checkSkeleton(gltf, contract, report);
    // The rig this branch fixed was 3.4ft against a 3.6ft floor. This is that
    // failure, caught by the gate instead of by an animator's invoice.
    expect(rules(report)).toContain('height.band');
  });

  it('rejects root motion', () => {
    const path = join(tmp, 'anims_rootmotion.glb');
    const clip = { name: 'run', tracks: [{ name: 'Root.translation', times: [0, 0.8], values: [0, 0, 0, 0, 0, 12] }] };
    writeAnimGlb(path, [clip]);
    const report = validate(path, 'animations');
    expect(rules(report)).toContain('clip.rootMotion');
  });

  it('rejects keyframes off the 30fps grid', () => {
    const path = join(tmp, 'anims_offgrid.glb');
    // 24fps: the single most likely wrong export setting.
    const clip = {
      name: 'run',
      tracks: [{ name: 'Hips.rotation', times: [0, 1 / 24, 2 / 24], values: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }],
    };
    writeAnimGlb(path, [clip]);
    const report = validate(path, 'animations');
    expect(rules(report)).toContain('clip.frameRate');
  });

  it('rejects an unclosed loop seam', () => {
    const path = join(tmp, 'anims_openloop.glb');
    const clip = {
      name: 'run',
      tracks: [
        { name: 'Hips.rotation', times: [0, 12 / FPS, 24 / FPS], values: [0, 0, 0, 1, 0.1, 0, 0, 0.99, 0.05, 0, 0, 0.99] },
        { name: 'Spine.rotation', times: [0, 24 / FPS], values: [0, 0, 0, 1, 0, 0, 0, 1] },
      ],
    };
    writeAnimGlb(path, [clip]);
    const report = validate(path, 'animations');
    expect(rules(report)).toContain('clip.loopSeam');
  });

  it('rejects a clip that travels when the sim owns the ground track', () => {
    const path = join(tmp, 'anims_travel.glb');
    // A slide that also travels forward makes the runner arrive at a base they
    // are not standing on yet.
    const hipsY = contract.SKELETON.find((b) => b.name === 'Hips').pos[1];
    const clip = {
      name: 'slide',
      tracks: [
        { name: 'Hips.position', times: [0, 39 / FPS], values: [0, hipsY, 0, 0, hipsY, 6] },
        { name: 'Spine.rotation', times: [0, 39 / FPS], values: [0, 0, 0, 1, 0, 0, 0, 1] },
      ],
    };
    writeAnimGlb(path, [clip]);
    const report = validate(path, 'animations');
    const hit = failures(report).find((f) => f.rule === 'clip.bodyTravel');
    expect(hit).toBeDefined();
    expect(hit.message).toMatch(/6\.00ft/);
  });

  it('reports every missing clip by name', () => {
    const path = join(tmp, 'anims_partial.glb');
    writeAnimGlb(path, buildProceduralClips().filter((c) => c.name !== 'trot'));
    const report = validate(path, 'animations');
    const hit = failures(report).find((f) => f.rule === 'clips.missing');
    expect(hit.message).toContain('trot');
  });

  it('warns, but does not fail, when a marker is not where the motion says', () => {
    // A DERIVED check: it is an inference about intent, so it informs rather
    // than rejects. A gate that cries wolf gets ignored, and then so do the
    // real failures.
    const path = join(tmp, 'anims_marker.glb');
    const swing = buildProceduralClips().find((c) => c.name === 'swing_contact');
    // Reverse the clip: same poses, event now near the other end.
    const reversed = {
      name: 'swing_contact',
      tracks: swing.tracks.map((t) => {
        const stride = t.getValueSize();
        const n = t.times.length;
        const values = [];
        for (let i = n - 1; i >= 0; i--) values.push(...Array.from(t.values).slice(i * stride, i * stride + stride));
        const last = t.times[n - 1];
        return { name: t.name, times: t.times.map((x) => last - x).reverse(), values };
      }),
    };
    writeAnimGlb(path, [reversed]);
    const report = validate(path, 'animations');
    const warns = report.items.filter((i) => i.rule === 'clip.marker' && i.severity === 'warn');
    expect(warns.length).toBe(1);
    expect(warns[0].message).toMatch(/time-warps/);
    expect(rules(report)).not.toContain('clip.marker');
  });

  it('rejects an empty clip that would otherwise pass every other rule', () => {
    const path = join(tmp, 'anims_empty.glb');
    writeAnimGlb(path, [{ name: 'idle', tracks: [] }]);
    const report = validate(path, 'animations');
    expect(rules(report)).toContain('clip.empty');
  });

  it('rejects morph targets', () => {
    const path = join(tmp, 'kid_morph.glb');
    const json = {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [] }],
      nodes: [],
      meshes: [{ name: 'body', primitives: [{ attributes: {}, targets: [{ POSITION: 0 }] }] }],
    };
    writeGlb(path, json, [f32([0])]);
    const report = makeReport();
    checkContainer(readGlb(path), report);
    expect(rules(report)).toContain('gltf.noMorphTargets');
  });

  it('rejects a character over the size budget', () => {
    const path = join(tmp, 'kid_huge.glb');
    const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [] };
    writeGlb(path, json, [f32(new Array(160_000).fill(1))]);
    const report = makeReport();
    checkContainer(readGlb(path), report, { maxBytes: 400 * 1024 });
    expect(rules(report)).toContain('gltf.size');
  });
});

describe('the exported rig on disk is current', () => {
  it('matches what export-skeleton would write today', async () => {
    // The committed asset is what gets emailed to an artist. If skeleton.ts
    // moves and nobody re-runs the exporter, the file in the repo is a rig
    // nothing in the codebase believes in any more.
    const committed = join(here, '..', '..', 'assets', 'v2', 'skeleton_recess_v1.glb');
    const fresh = join(tmp, 'fresh.glb');
    await buildSkeletonGlb(fresh);
    expect(readFileSync(committed).equals(readFileSync(fresh)), 'run: npm run export:skeleton').toBe(true);
  });
});
