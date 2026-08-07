// ---------------------------------------------------------------------------
// ★ `public/v2/models/manifest.json` — which characters have a model on disk.
//
//   npm run manifest:models            rewrite it from the directory
//   npm run manifest:models -- --check verify it; non-zero exit on drift
//
// WHY A FILE AND NOT A GLOB. The obvious implementation is Vite's
// `import.meta.glob` over `public/v2/models/`, and it works — it also SHIPS
// EVERY MODEL TWICE. Vite copies `public/` verbatim into `dist/` and then, on
// seeing the glob, emits each matched file a second time as a hashed bundle
// asset. Measured: 1.34MB of `.glb` in `dist/assets/` next to the same 1.34MB
// in `dist/v2/models/`, for five early stand-ins. At the complete roster that
// is megabytes of duplicate download on a free static host,
// and nothing in the build output says the two lists are the same files.
//
// So the manifest is generated instead: one small JSON the page fetches once,
// and no second copy of anything. `manifest.test.js` regenerates it and
// compares, so a delivery dropped into the directory without re-running this
// fails CI rather than silently rendering as a proxy forever.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');

export const MODELS_DIR = join(repo, 'public', 'v2', 'models');
export const MANIFEST_PATH = join(MODELS_DIR, 'manifest.json');

/** Character ids with a `kid_<id>.glb` on disk, sorted. */
export function scanModels() {
  if (!existsSync(MODELS_DIR)) return [];
  return readdirSync(MODELS_DIR)
    .map((f) => /^kid_(.+)\.glb$/.exec(f)?.[1])
    .filter(Boolean)
    .sort();
}

export function manifestBody() {
  return JSON.stringify({ characters: scanModels() }, null, 2) + '\n';
}

/** @returns true when the file on disk already matches the directory. */
export function manifestIsCurrent() {
  if (!existsSync(MANIFEST_PATH)) return false;
  return readFileSync(MANIFEST_PATH, 'utf8') === manifestBody();
}

export function writeManifest() {
  mkdirSync(MODELS_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, manifestBody());
  return scanModels();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check')) {
    if (manifestIsCurrent()) {
      console.log(`manifest.json is current (${scanModels().length} characters)`);
    } else {
      console.error('manifest.json does not match public/v2/models — run: npm run manifest:models');
      process.exit(1);
    }
  } else {
    const ids = writeManifest();
    console.log(`wrote ${MANIFEST_PATH}\n  ${ids.length} characters: ${ids.join(', ') || '(none)'}`);
  }
}
