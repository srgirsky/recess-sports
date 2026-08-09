// ---------------------------------------------------------------------------
// Export the first-party shared animation library.
//
// `proceduralClips.ts` is authored against the canonical skeleton and already
// exercises every timing, marker, root-motion and ground-contact contract. This
// exporter turns that authored library into the same animations-only GLB an
// external animator delivers, so the runtime path and validator are exercised
// by a real shared asset instead of an unreachable loader plus in-bundle clips.
//
//   npm run export:animations
// ---------------------------------------------------------------------------

import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { f32, writeGlb } from './glb.mjs';
import {
  buildDirectedReactionClips,
  buildProceduralClips,
} from '../../src/v2/render/proceduralClips.ts';
import { CLIP_BY_NAME } from '../../src/v2/render/clips.ts';
import { SKELETON, bindPoseHash } from '../../src/v2/render/skeleton.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
export const DEFAULT_OUT = join(repo, 'public', 'v2', 'models', 'anims_recess_v1.glb');

function paddedLength(bytes) {
  return bytes + ((4 - (bytes % 4)) % 4);
}

export function buildAnimationLibraryGlb(outPath = DEFAULT_OUT) {
  const directed = new Map(buildDirectedReactionClips().map((clip) => [clip.name, clip]));
  const clips = buildProceduralClips().map((clip) => directed.get(clip.name) ?? clip);
  const byName = new Map(SKELETON.map((bone, index) => [bone.name, index]));
  const nodes = SKELETON.map((bone) => ({
    name: bone.name,
    translation: [...bone.pos],
    children: [],
  }));
  for (const bone of SKELETON) {
    if (bone.parent) nodes[byName.get(bone.parent)].children.push(byName.get(bone.name));
  }
  for (const node of nodes) if (!node.children.length) delete node.children;

  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let byteOffset = 0;

  const accessor = (values, type, count, min, max) => {
    const bytes = f32(values);
    const view = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length });
    chunks.push(bytes);
    byteOffset += paddedLength(bytes.length);
    const index = accessors.length;
    accessors.push({ bufferView: view, componentType: 5126, count, type, ...(min ? { min, max } : {}) });
    return index;
  };

  const animations = clips.map((clip) => {
    const spec = CLIP_BY_NAME[clip.name];
    if (!spec) throw new Error(`export-animation-library: ${clip.name} is not in clips.ts`);
    const samplers = [];
    const channels = [];

    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.');
      const boneName = track.name.slice(0, dot);
      const property = track.name.slice(dot + 1);
      const node = byName.get(boneName);
      if (node === undefined) throw new Error(`${clip.name}: track targets unknown bone ${boneName}`);
      const path = property === 'quaternion' ? 'rotation' : property === 'position' ? 'translation' : null;
      if (!path) throw new Error(`${clip.name}: unsupported track property ${property}`);

      const width = path === 'rotation' ? 4 : 3;
      const times = Array.from(track.times);
      const values = Array.from(track.values);
      const duration = spec.frames / 30;
      const last = times[times.length - 1] ?? 0;
      // three can hold a clip duration beyond its last authored key, while glTF
      // derives duration from accessors. Preserve that deliberate held tail.
      if (duration - last > 1e-6) {
        times.push(duration);
        values.push(...values.slice(values.length - width));
      }

      const input = accessor(times, 'SCALAR', times.length, [times[0]], [times[times.length - 1]]);
      const output = accessor(values, path === 'rotation' ? 'VEC4' : 'VEC3', times.length);
      const sampler = samplers.length;
      samplers.push({ input, output, interpolation: 'LINEAR' });
      channels.push({ sampler, target: { node, path } });
    }
    return { name: clip.name, samplers, channels };
  });

  const json = {
    asset: {
      version: '2.0',
      generator: `recess-sports shared animation library (bindPoseHash ${bindPoseHash()})`,
    },
    scene: 0,
    scenes: [{ nodes: [byName.get('Root')] }],
    nodes,
    accessors,
    bufferViews,
    animations,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  const { bytes } = writeGlb(outPath, json, chunks);
  return { bytes, clips: animations.length, tracks: animations.reduce((n, clip) => n + clip.channels.length, 0) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_OUT;
  const result = buildAnimationLibraryGlb(out);
  console.log(`wrote ${out}`);
  console.log(`  ${result.clips} clips · ${result.tracks} tracks · ${(result.bytes / 1024).toFixed(0)}KB`);
}
