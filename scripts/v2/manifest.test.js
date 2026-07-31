// ---------------------------------------------------------------------------
// The delivery manifest must describe the directory it claims to describe.
//
// It is generated, and a generated file that nobody regenerates is worse than
// no file: a real `kid_*.glb` dropped into `public/v2/models/` without a
// manifest entry loads never and falls back to a proxy forever, silently and
// correctly-looking. That is a commissioned model that was paid for and is not
// on screen, and nothing else in the pipeline can see it.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { MANIFEST_PATH, manifestIsCurrent, scanModels } from './models-manifest.mjs';
import { readFileSync, existsSync } from 'node:fs';

describe('public/v2/models/manifest.json', () => {
  it('matches what is actually in the directory', () => {
    expect(manifestIsCurrent(), `stale ${MANIFEST_PATH} — run: npm run manifest:models`).toBe(true);
  });

  it('lists every model on disk, and nothing else', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    const listed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).characters;
    expect(listed).toEqual(scanModels());
  });
});
