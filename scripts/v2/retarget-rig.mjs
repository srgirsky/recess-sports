// ---------------------------------------------------------------------------
// Move every authored .blend onto the CURRENT canonical rig.
//
// `src/v2/render/skeleton.ts` is the spec `validate:models` hashes each delivery
// against, and the six Blender-authored sources carry their own copy of it in
// their armatures. Change the spec and those six go stale together — so this
// walks them, hands `blender/retarget-rig.py` the world bind pose read straight
// out of the spec, and lets it move bones and skinned vertices in step.
//
// Read `blender/retarget-rig.py`'s header before changing either: moving bones
// WITHOUT their vertices leaves a rig that renders correctly at rest, animates
// wrong, and fails no test.
//
//   npm run retarget:rig                 every authored source
//   npm run retarget:rig -- nostrike     one of them
//   npm run retarget:rig -- --dry-run    say what would move, change nothing
//
// Re-running is safe and idempotent: the script measures each bone's delta from
// where it currently is, so a source already on-spec reports nothing to move.
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { AUTHORED_CHARACTERS } from './export-authored-character.mjs';

const SOURCE_DIR = resolve('assets/v2/source');
const SCRIPT = resolve('scripts/v2/blender/retarget-rig.py');

async function bindWorld() {
  const { SKELETON } = await import(resolve('src/v2/render/skeleton.ts'));
  const world = {};
  for (const bone of SKELETON) {
    const parent = bone.parent ? world[bone.parent] : [0, 0, 0];
    world[bone.name] = [parent[0] + bone.pos[0], parent[1] + bone.pos[1], parent[2] + bone.pos[2]];
  }
  return world;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ids = args.filter((a) => !a.startsWith('--'));
const requested = ids.length ? ids : Object.keys(AUTHORED_CHARACTERS);

const unknown = requested.filter((id) => !AUTHORED_CHARACTERS[id]);
if (unknown.length) {
  console.error(`unknown authored character(s): ${unknown.join(', ')}`);
  process.exit(2);
}

const blender = process.env.BLENDER ?? 'blender';
const bones = JSON.stringify(await bindWorld());
let failed = 0;

for (const id of requested) {
  const source = join(SOURCE_DIR, AUTHORED_CHARACTERS[id].source);
  if (!existsSync(source)) {
    console.error(`✗ ${id}: missing ${source}`);
    failed++;
    continue;
  }
  console.log(`\n${id} — ${AUTHORED_CHARACTERS[id].name} (${AUTHORED_CHARACTERS[id].source})`);
  const run = spawnSync(
    blender,
    ['--background', source, '--python', SCRIPT, '--', '--bones', bones, ...(dryRun ? ['--dry-run'] : [])],
    { encoding: 'utf8' }
  );
  if (run.error) {
    console.error(`✗ ${id}: cannot run ${blender} — ${run.error.message}`);
    failed++;
    continue;
  }
  // Blender is chatty on stdout and reports nothing useful in its exit code on
  // a Python exception, so the script's own lines are the report.
  const lines = run.stdout.split('\n').filter((l) => /^(\s{2}\w|moved |saved |rig already)/.test(l));
  for (const line of lines) console.log(line);
  if (run.status !== 0 || /Error:|Traceback/.test(run.stdout + run.stderr)) {
    console.error(run.stdout.split('\n').slice(-25).join('\n'));
    console.error(run.stderr);
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} source(s) failed to retarget.`);
  process.exit(1);
}
console.log(`\n${requested.length} source(s) ${dryRun ? 'inspected' : 'retargeted'}.`);
