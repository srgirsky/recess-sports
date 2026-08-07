// ---------------------------------------------------------------------------
// Generate the roster-quality character deliveries.
//
// Unlike `export-proxy-kid`, these files are not labelled STAND-IN. They add
// the delivered-model face contract (UV island, albedo binding and a unique
// 4x4 expression atlas) and use the richer roster geometry path. The permanent
// primitive proxy remains LOD3 and the load-failure fallback at runtime.
//
//   npm run export:roster-kid          all 30
//   npm run export:roster-kid -- turbo zippy
// ---------------------------------------------------------------------------

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  LOD_BUDGET,
  RUNTIME_DIR,
  buildProxyKidGlb,
  loadProxySpec,
} from './export-proxy-kid.mjs';
import { writeManifest } from './models-manifest.mjs';

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 6)) {
    console.error(`Node ${process.versions.node} cannot import the TypeScript character source. Use Node 22.6+.`);
    process.exit(2);
  }

  const spec = await loadProxySpec();
  const args = process.argv.slice(2);
  const ids = args.length ? args : spec.ROSTER.map((c) => c.id);
  let failed = 0;

  for (const id of ids) {
    const out = resolve(RUNTIME_DIR, `kid_${id}.glb`);
    try {
      const result = await buildProxyKidGlb(id, out, spec, { delivery: true });
      console.log(
        `✓ kid_${id}.glb  ${(result.bytes / 1024).toFixed(0)}KB  ` +
          `tris ${result.triangles.join(' / ')}  (budgets ${LOD_BUDGET.join(' / ')})`
      );
    } catch (error) {
      failed++;
      console.error(`✗ kid_${id}: ${error.message}`);
    }
  }

  const listed = writeManifest();
  console.log(`\n${ids.length - failed}/${ids.length} roster models written to ${RUNTIME_DIR}`);
  console.log(`manifest.json lists ${listed.length}: ${listed.join(', ')}`);
  console.log('Validate them with: npm run validate:models');
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
