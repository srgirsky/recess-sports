// ---------------------------------------------------------------------------
// The delivery manifest must describe the complete roster it claims to ship.
//
// It is generated, and a generated file that nobody regenerates is worse than
// no file: a real `kid_*.glb` dropped into `public/v2/models/` without a
// manifest entry loads never and falls back to a proxy forever, silently and
// correctly-looking. That is a production model that exists but is not
// on screen, and nothing else in the pipeline can see it.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { MANIFEST_PATH, MODELS_DIR, manifestIsCurrent, scanModels } from './models-manifest.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROSTER } from '../../src/data/characters.ts';
import { readGlb } from './glb.mjs';
import { checkCharacter, checkContainer, checkSkeleton, makeReport } from './modelRules.mjs';
import * as skeletonSpec from '../../src/v2/render/skeleton.ts';

describe('public/v2/models/manifest.json', () => {
  it('matches what is actually in the directory', () => {
    expect(manifestIsCurrent(), `stale ${MANIFEST_PATH} — run: npm run manifest:models`).toBe(true);
  });

  it('lists every model on disk, and nothing else', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    const listed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).characters;
    expect(listed).toEqual(scanModels());
  });

  it('ships one validated, non-stand-in model for every roster character', () => {
    const listed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).characters;
    const roster = ROSTER.map((c) => c.id).sort();
    expect(listed).toEqual(roster);

    for (const id of roster) {
      const gltf = readGlb(join(MODELS_DIR, `kid_${id}.glb`));
      expect(gltf.json.asset?.generator, id).not.toContain('STAND-IN');
      const body = gltf.json.materials?.find((material) => material.name === 'M_Body');
      expect(body?.pbrMetallicRoughness?.baseColorTexture, `${id} body albedo`).toBeTruthy();
      expect(body?.emissiveTexture, `${id} face atlas binding`).toBeTruthy();
      expect(gltf.json.images?.some((image) => image.name === 'face_atlas'), `${id} face atlas image`).toBe(true);
      for (const mesh of gltf.json.meshes ?? []) {
        for (const primitive of mesh.primitives ?? []) {
          expect(primitive.attributes?.TEXCOORD_0, `${id} ${mesh.name} UVs`).toBeTypeOf('number');
        }
      }

      const report = makeReport();
      checkContainer(gltf, report, { maxBytes: 400 * 1024 });
      checkSkeleton(gltf, skeletonSpec, report);
      checkCharacter(gltf, skeletonSpec, report, id);
      const failures = report.items
        .filter((item) => item.severity === 'fail')
        .map((item) => `${item.rule}: ${item.message}`);
      expect(failures, id).toEqual([]);
    }
  });
});
