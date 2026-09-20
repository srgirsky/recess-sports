// ---------------------------------------------------------------------------
// Export one first-party produced character's partial performance.
//
// Each delivery overrides only the named clips. Shared and procedural motion
// remains available for everything else, so one character can finish through
// the production gates without waiting for the rest of the roster.
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildFlashPilotClips,
  buildCricketPilotClips,
  buildMoosePilotClips,
  buildPeachesPilotClips,
  buildGizmoPilotClips,
  buildCloverPilotClips,
  buildRocketPilotClips,
  buildChipPilotClips,
  buildBoomerPilotClips,
  buildAcePilotClips,
  buildBendItPilotClips,
  buildBigLouPilotClips,
  buildBubblesPilotClips,
  buildDexPilotClips,
  buildDivaPilotClips,
  buildGrizzPilotClips,
  buildNoodlePilotClips,
  buildProfPilotClips,
  buildSnifflesPilotClips,
  buildLeftyPilotClips,
  buildPennyPilotClips,
  buildSmokeyPilotClips,
  buildJunebugPilotClips,
  buildMimiMashPilotClips,
  buildSproutPilotClips,
  buildTankPilotClips,
  buildTheoPilotClips,
  buildTurboPilotClips,
  buildZippyPilotClips,
  buildZoomSeatedLibrary,
} from '../../src/v2/render/proceduralClips.ts';
import { writeAnimationClipsGlb } from './export-animation-library.mjs';
import { scanPerformances, writeManifest } from './models-manifest.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const BUILDERS = {
  nostrike: { name: 'Junebug', build: buildJunebugPilotClips },
  calls_shot: { name: 'Big Talk Theo', build: buildTheoPilotClips },
  wheelchair_ace: { name: 'Zoom Ramirez', build: buildZoomSeatedLibrary },
  big_lou: { name: 'Big Lou', build: buildBigLouPilotClips },
  tank: { name: 'Tank', build: buildTankPilotClips },
  mimi_mash: { name: 'Mimi Mash', build: buildMimiMashPilotClips },
  turbo: { name: 'Turbo', build: buildTurboPilotClips },
  sprout: { name: 'Sprout', build: buildSproutPilotClips },
  zippy: { name: 'Zippy Kwan', build: buildZippyPilotClips },
  ace_kid: { name: 'Ace', build: buildAcePilotClips },
  penny: { name: 'Penny Pockets', build: buildPennyPilotClips },
  dex: { name: 'Dex', build: buildDexPilotClips },
  lefty: { name: 'Lefty Lu', build: buildLeftyPilotClips },
  smokey: { name: 'Smokey', build: buildSmokeyPilotClips },
  bend_it: { name: 'Bend-It', build: buildBendItPilotClips },
  noodle: { name: 'Noodle', build: buildNoodlePilotClips },
  bubbles: { name: 'Bubbles', build: buildBubblesPilotClips },
  sniffles: { name: 'Sniffles', build: buildSnifflesPilotClips },
  the_prof: { name: 'The Professor', build: buildProfPilotClips },
  diva: { name: 'Dazzle', build: buildDivaPilotClips },
  grizz: { name: 'Grizz', build: buildGrizzPilotClips },
  flash: { name: 'Flash', build: buildFlashPilotClips },
  cricket: { name: 'Cricket', build: buildCricketPilotClips },
  moose: { name: 'Moose', build: buildMoosePilotClips },
  peaches: { name: 'Peaches', build: buildPeachesPilotClips },
  gizmo: { name: 'Gizmo', build: buildGizmoPilotClips },
  clover: { name: 'Clover', build: buildCloverPilotClips },
  rocket: { name: 'Rocket Rosa', build: buildRocketPilotClips },
  chip: { name: 'Chip', build: buildChipPilotClips },
  boomer: { name: 'Boomer', build: buildBoomerPilotClips },
};

/** The ids this script can bake, for the freshness gate to walk. */
export const PERFORMANCE_IDS = Object.keys(BUILDERS);

/**
 * The name of the function that bakes `id`'s take, or null when nothing here
 * does. `character-provenance.mjs` checks that name against
 * `proceduralClips.ts` to derive `generated-stand-in` — the kind is read off
 * the code that bakes the bytes, never claimed.
 */
export function builderNameFor(id) {
  return BUILDERS[id]?.build.name ?? null;
}

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
  // Provenance imports these builders: run its CLI separately so awaiting
  // the import cannot deadlock this module’s top-level evaluation.
  const provenance = spawnSync(process.execPath, [...process.execArgv, join(here, 'character-provenance.mjs')], { stdio: 'inherit' });
  if (provenance.status !== 0) throw new Error('Character provenance refresh failed');
  console.log(`wrote ${result.outPath}`);
  console.log(`  ${result.clips} clips · ${result.tracks} tracks · ${(result.bytes / 1024).toFixed(0)}KB`);
  console.log(`manifest performances: ${scanPerformances().join(', ') || 'missing'}`);
}
