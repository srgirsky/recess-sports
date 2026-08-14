// ---------------------------------------------------------------------------
// Export one first-party produced character's partial performance.
//
// Each delivery overrides only the named clips. Shared and procedural motion
// remains available for everything else, so one character can finish through
// the production gates without waiting for the rest of the roster.
// ---------------------------------------------------------------------------

import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildBigLouPilotClips,
  buildJunebugPilotClips,
  buildMimiMashPilotClips,
  buildTankPilotClips,
  buildTheoPilotClips,
  buildZoomPilotClips,
} from '../../src/v2/render/proceduralClips.ts';
import { writeAnimationClipsGlb } from './export-animation-library.mjs';
import { scanPerformances, writeManifest } from './models-manifest.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const BUILDERS = {
  nostrike: { name: 'Junebug', build: buildJunebugPilotClips },
  calls_shot: { name: 'Big Talk Theo', build: buildTheoPilotClips },
  wheelchair_ace: { name: 'Zoom Ramirez', build: buildZoomPilotClips },
  big_lou: { name: 'Big Lou', build: buildBigLouPilotClips },
  tank: { name: 'Tank', build: buildTankPilotClips },
  mimi_mash: { name: 'Mimi Mash', build: buildMimiMashPilotClips },
};

/** The ids this script can bake, for the freshness gate to walk. */
export const PERFORMANCE_IDS = Object.keys(BUILDERS);

export function buildSignaturePerformanceGlb(id, outPath = join(here, '..', '..', 'public', 'v2', 'models', `anims_${id}_v1.glb`)) {
  const entry = BUILDERS[id];
  if (!entry) throw new Error(`${id}: no authored character performance builder`);
  return {
    outPath,
    ...writeAnimationClipsGlb(entry.build(), outPath, `recess-sports ${entry.name} authored performance`),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const id = process.argv[2];
  if (!id) throw new Error(`usage: npm run export:signature-performance -- <character-id>`);
  const result = buildSignaturePerformanceGlb(id);
  writeManifest();
  console.log(`wrote ${result.outPath}`);
  console.log(`  ${result.clips} clips · ${result.tracks} tracks · ${(result.bytes / 1024).toFixed(0)}KB`);
  console.log(`manifest performances: ${scanPerformances().join(', ') || 'missing'}`);
}
