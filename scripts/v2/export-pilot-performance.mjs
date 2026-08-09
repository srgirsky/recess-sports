// ---------------------------------------------------------------------------
// Export the first first-party character-performance vertical slice.
//
// This is deliberately a PARTIAL animations-only GLB: the five included names
// override the shared library for Junebug, while all other names continue to
// resolve shared -> procedural. That is the same delivery seam an external
// animator would use and keeps the pilot honest about its scope.
// ---------------------------------------------------------------------------

import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildJunebugPilotClips } from '../../src/v2/render/proceduralClips.ts';
import { writeAnimationClipsGlb } from './export-animation-library.mjs';
import { scanPerformances, writeManifest } from './models-manifest.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
export const DEFAULT_OUT = join(here, '..', '..', 'public', 'v2', 'models', 'anims_nostrike_v1.glb');

export function buildJunebugPilotGlb(outPath = DEFAULT_OUT) {
  return writeAnimationClipsGlb(
    buildJunebugPilotClips(),
    outPath,
    'recess-sports Junebug authored pilot performance'
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = buildJunebugPilotGlb();
  writeManifest();
  console.log(`wrote ${DEFAULT_OUT}`);
  console.log(`  ${result.clips} clips · ${result.tracks} tracks · ${(result.bytes / 1024).toFixed(0)}KB`);
  console.log(`manifest performances: ${scanPerformances().join(', ') || 'missing'}`);
}
