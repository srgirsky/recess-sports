// ---------------------------------------------------------------------------
// ★ `npm run validate:models` — the gate `docs/v2/asset-contract.md` and
// `docs/v2/animation-brief.md` both promise, and the first line of acceptance
// for every delivered asset.
//
//   npm run validate:models                 everything in assets/v2/
//   npm run validate:models path/to.glb     one file
//
// The deal it offers the artist: rejections are automatic and free, and a file
// that passes is accepted. That only works if the failures are SPECIFIC, so
// every rule says what is wrong and why the rule exists — see modelRules.mjs.
//
// File kind is inferred from the name, because that is what the contract names:
//   skeleton_recess_v1.glb   the rig
//   anims_recess_v1.glb      the animation library
//   kid_<id>.glb             a character
//
// NODE >= 22.6 REQUIRED, because this imports the spec straight out of
// `src/v2/render/*.ts` via type stripping. That is deliberate: the contract has
// exactly one home, and a validator reading a copied-out JSON of the rules is a
// validator that can disagree with the engine. CI pins Node 20, so the same
// rules also run there through `validate-models.test.js`, which gets its TS
// import from vite instead.
// ---------------------------------------------------------------------------

import { readdirSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readGlb } from './glb.mjs';
import { checkAnimations, checkCharacter, checkContainer, checkSkeleton, makeReport } from './modelRules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
/**
 * The artist's directory and the validation inbox: the rig the modellers work
 * from, and where a delivery is dropped to be checked.
 */
export const ASSET_DIR = join(repo, 'assets', 'v2');

/**
 * The RUNTIME directory — what actually ships. Scanned too, because "it
 * validated" and "it ships" being two separate acts is only a safeguard if the
 * second one is also checked: the whole point of moving a file here is that it
 * passed, and nothing would otherwise notice a file that got here another way.
 * `export-proxy-kid.mjs` writes its stand-ins here.
 */
export const RUNTIME_DIR = join(repo, 'public', 'v2', 'models');

const MAX_CHARACTER_BYTES = 400 * 1024;

/** Load the contract from the TypeScript source — its only home. */
export async function loadContract() {
  const skeleton = await import(join(repo, 'src', 'v2', 'render', 'skeleton.ts'));
  const clips = await import(join(repo, 'src', 'v2', 'render', 'clips.ts'));
  return { ...skeleton, ...clips };
}

export function classify(path) {
  const name = basename(path);
  if (name.startsWith('skeleton_')) return 'skeleton';
  if (name.startsWith('anims_')) return 'animations';
  if (name.startsWith('kid_')) return 'character';
  return 'unknown';
}

/** Validate one file. Returns a report; never throws for content reasons. */
export function validateFile(path, contract) {
  const report = makeReport();
  const kind = classify(path);
  if (kind === 'unknown') {
    report.fail(
      'file.name',
      `cannot tell what "${basename(path)}" is — expected skeleton_*.glb, anims_*.glb or kid_<id>.glb`
    );
    return { kind, report };
  }

  let gltf;
  try {
    gltf = readGlb(path);
  } catch (e) {
    report.fail('file.read', e.message);
    return { kind, report };
  }

  checkContainer(gltf, report, { maxBytes: kind === 'character' ? MAX_CHARACTER_BYTES : undefined });

  if (kind === 'skeleton') {
    checkSkeleton(gltf, contract, report);
  } else if (kind === 'animations') {
    // NOT skeleton-checked: an animation file's node rest transforms are
    // whatever frame 0 baked, not the bind pose, so hashing them would reject
    // every correct delivery.
    checkAnimations(gltf, contract, report);
  } else {
    const id = basename(path).replace(/^kid_/, '').replace(/\.glb$/, '');
    checkSkeleton(gltf, contract, report);
    checkCharacter(gltf, contract, report, id);
  }

  return { kind, report };
}

function print(path, kind, report) {
  const fails = report.items.filter((i) => i.severity === 'fail');
  const warns = report.items.filter((i) => i.severity === 'warn');
  const infos = report.items.filter((i) => i.severity === 'info');

  const mark = fails.length ? '✗' : warns.length ? '!' : '✓';
  console.log(`\n${mark} ${basename(path)}  (${kind})`);
  for (const i of fails) console.log(`   FAIL  [${i.rule}] ${i.message}`);
  for (const i of warns) console.log(`   warn  [${i.rule}] ${i.message}`);
  if (process.env.VERBOSE) for (const i of infos) console.log(`   info  [${i.rule}] ${i.message}`);
  else if (infos.length) console.log(`   (${infos.length} measurements — set VERBOSE=1 to see them)`);
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 6)) {
    console.error(
      `Node ${process.versions.node} cannot import the TypeScript contract directly.\n` +
        'Use Node 22.6+ (type stripping), or run the same rules via: npx vitest run scripts/v2/validate-models.test.js'
    );
    process.exit(2);
  }

  const contract = await loadContract();
  const args = process.argv.slice(2);

  let files;
  if (args.length) {
    files = args.map((a) => resolve(process.cwd(), a));
  } else {
    files = [ASSET_DIR, RUNTIME_DIR]
      .filter((dir) => existsSync(dir))
      .flatMap((dir) =>
        readdirSync(dir)
          .filter((f) => f.endsWith('.glb'))
          .map((f) => join(dir, f))
      );
  }

  if (!files.length) {
    console.log(`Nothing to validate. Put .glb deliveries in ${ASSET_DIR}, or pass paths.`);
    console.log('Generate the rig with: npm run export:skeleton');
    return;
  }

  let failed = 0;
  for (const path of files) {
    const { kind, report } = validateFile(path, contract);
    print(path, kind, report);
    if (report.failed) failed++;
  }

  console.log(
    `\n${files.length - failed}/${files.length} passed` +
      (failed ? ` — ${failed} rejected. Fix and re-run; rejections are free.` : '')
  );
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
