// ---------------------------------------------------------------------------
// A module-resolution hook that lets Node import this project's TypeScript the
// way the bundler does: `import './skeleton'` finds `skeleton.ts`.
//
// WHY IT IS NEEDED. Node >= 22.6 strips TypeScript types on import, which is
// what lets `validate-models.mjs` and `export-proxy-kid.mjs` read the contract
// from its ONE home in `src/` rather than from a copied-out JSON. But stripping
// types is not the same as understanding a TypeScript project: Node still
// resolves specifiers by the ES module rules, which require a file extension.
// `skeleton.ts` and `clips.ts` happen to import nothing relative, so they load
// fine — `ProxyCharacter.ts` imports six modules extensionlessly and does not.
//
// So the choice was: put `.ts` extensions on every import in `src/v2/` (a
// project-wide style change, made to satisfy a build script), run the exporter
// under vitest (a test runner asked to write build artefacts), or teach Node
// this one resolution rule. This is the small one, and it is confined to the
// two scripts that opt into it.
//
// It ONLY fires after normal resolution has already failed, so it can never
// shadow a real file or change how anything else resolves.
// ---------------------------------------------------------------------------

import { extname } from 'node:path';

const CANDIDATES = ['.ts', '.tsx', '/index.ts'];

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    const relative = specifier.startsWith('.') || specifier.startsWith('/');
    if (!relative || extname(specifier)) throw error;

    for (const suffix of CANDIDATES) {
      try {
        return await next(specifier + suffix, context);
      } catch {
        // Try the next candidate; the ORIGINAL error is what gets reported if
        // none of them work, because "cannot find ./skeleton" is a more useful
        // message than "cannot find ./skeleton/index.ts".
      }
    }
    throw error;
  }
}
