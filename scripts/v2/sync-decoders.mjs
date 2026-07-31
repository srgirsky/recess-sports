// ---------------------------------------------------------------------------
// ★ Copy the Draco and Basis decoders out of `three` and into `public/v2/`.
//
//   npm run sync:decoders          copy (and report what changed)
//   npm run sync:decoders -- --check   verify only; non-zero exit on drift
//
// WHY THEY ARE COMMITTED RATHER THAN IMPORTED. `DRACOLoader.setDecoderPath` and
// `KTX2Loader.setTranscoderPath` take a URL that is fetched at RUNTIME — these
// are not ES modules the bundler can follow, they are a wasm blob and its
// loader glue. Vite therefore never sees them, so pointing at `node_modules/`
// works in dev and 404s in the built site. `public/` is the one directory whose
// contents are copied verbatim, which makes it the only correct home.
//
// WHY A SCRIPT AND A CHECK, rather than a one-time manual copy. A committed
// copy of a dependency's file is a fork the moment that dependency moves: bump
// `three` and the decoder glue can expect a different wasm ABI than the blob
// sitting in `public/`, which fails at the first compressed model — in the
// browser, at runtime, on whichever device happened to load one. `--check` runs
// in `npm test` (see `decoders.test.js`) so the bump fails in CI instead.
//
// THE ENCODER IS DELIBERATELY NOT COPIED. `draco_encoder.js` is 954KB and this
// game only ever READS compressed geometry; shipping it would nearly double the
// decoder payload for a code path that does not exist.
// ---------------------------------------------------------------------------

import { copyFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');

const LIBS = join(repo, 'node_modules', 'three', 'examples', 'jsm', 'libs');
export const DEST = join(repo, 'public', 'v2', 'decoders');

/**
 * Source (under three's `examples/jsm/libs`) -> destination (under
 * `public/v2/decoders`).
 *
 * Draco comes from the `gltf/` subfolder on purpose: it is the build compiled
 * specifically for glTF's attribute layout, and it is what `DRACOLoader`'s own
 * documentation points at. The generic build in the parent folder decodes the
 * same files but is larger.
 */
export const DECODER_FILES = [
  // Draco: the wasm blob, its glue, and the asm.js fallback for the (rare)
  // browser with no WebAssembly. DRACOLoader picks between them itself.
  ['draco/gltf/draco_wasm_wrapper.js', 'draco/draco_wasm_wrapper.js'],
  ['draco/gltf/draco_decoder.wasm', 'draco/draco_decoder.wasm'],
  ['draco/gltf/draco_decoder.js', 'draco/draco_decoder.js'],
  // Basis/KTX2, for the `albedo` / `face_atlas` / `mask` textures.
  ['basis/basis_transcoder.js', 'basis/basis_transcoder.js'],
  ['basis/basis_transcoder.wasm', 'basis/basis_transcoder.wasm'],
];

/**
 * @returns `{ synced, drifted, missing }` — `drifted` names files whose
 * committed copy differs from the installed `three`, which is the state a
 * version bump leaves behind.
 */
export function syncDecoders({ check = false } = {}) {
  const drifted = [];
  const missing = [];
  const synced = [];

  for (const [from, to] of DECODER_FILES) {
    const src = join(LIBS, from);
    const dst = join(DEST, to);

    if (!existsSync(src)) {
      // Not a drift: `three` moved or renamed the file, which is a different
      // (and louder) problem than a stale copy.
      missing.push(from);
      continue;
    }

    const same = existsSync(dst) && readFileSync(src).equals(readFileSync(dst));
    if (same) {
      synced.push(to);
      continue;
    }

    drifted.push(to);
    if (!check) {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
  }

  return { synced, drifted, missing };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const { synced, drifted, missing } = syncDecoders({ check });

  for (const f of missing) console.error(`  MISSING in three: ${f}`);
  for (const f of drifted) console.log(`  ${check ? 'DRIFTED' : 'copied'}: ${f}`);
  console.log(`${synced.length}/${DECODER_FILES.length} already current in ${DEST}`);

  if (missing.length) {
    console.error(
      '\nthree no longer ships a file this script copies. Check the three release notes\n' +
        'and update DECODER_FILES — do not silently drop a decoder.'
    );
    process.exit(2);
  }
  if (check && drifted.length) {
    console.error('\nRun: npm run sync:decoders');
    process.exit(1);
  }
}
