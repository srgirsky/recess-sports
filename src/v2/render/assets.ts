// ---------------------------------------------------------------------------
// Where the v2 runtime assets live, and how to name one. Render-side only.
//
// TWO DIRECTORIES, TWO JOBS — and conflating them is the mistake this file
// exists to prevent:
//
//   assets/v2/          the ARTIST's directory and the validation inbox. The
//                       rig the modellers work from lives here, and a delivery
//                       is dropped here to be run through
//                       `npm run validate:models`. Vite never sees it.
//   public/v2/models/   the RUNTIME directory. Only files that have passed the
//                       gate are copied here, and `public/` is the one place
//                       Vite copies verbatim into `dist/`.
//
// So "it validated" and "it ships" are two separate, deliberate acts. A model
// cannot reach a player without someone having moved it past the gate.
//
// ★ URLS RESOLVE AGAINST `document.baseURI`, NEVER `import.meta.url`.
//
// `vite.config.ts` sets `base: './'` so the built site works from any static
// host path (the GitHub Pages sub-path is the live case). Under a relative
// base, `import.meta.url` points at the hashed JS bundle in `dist/v2/assets/`,
// while `public/v2/models/` lands at `dist/v2/models/` — one directory level
// apart in the build and *the same* level in dev, which is precisely the kind
// of difference that works locally and 404s in production. `document.baseURI`
// is the page, and the page is `/v2/` in both.
// ---------------------------------------------------------------------------

/** Runtime asset root, relative to the page. */
const MODELS = 'models/';

/**
 * Resolve a runtime asset path against the PAGE, not against this module.
 *
 * Falls back to the bare relative path when there is no DOM (vitest, and any
 * future headless harness) — nothing in Node fetches these, so the value only
 * has to be stable and inspectable.
 */
export function assetUrl(path: string): string {
  if (typeof document === 'undefined' || !document.baseURI) return path;
  return new URL(path, document.baseURI).href;
}

/** `kid_<id>.glb` — the per-character file named in the asset contract §4. */
export function characterFile(id: string): string {
  return `kid_${id}.glb`;
}

export function characterUrl(id: string): string {
  return assetUrl(MODELS + characterFile(id));
}

/** The shared clip library (asset contract §3). One file for all 30 kids. */
export const ANIMATION_FILE = 'anims_recess_v1.glb';

export function animationUrl(): string {
  return assetUrl(MODELS + ANIMATION_FILE);
}

/**
 * ★ The delivery manifest: which character ids have a model in `public/v2/`.
 *
 * A generated `manifest.json`, fetched once, rather than a hand-maintained
 * array (a second source of truth) or a HEAD request per kid (30 round trips
 * before the first frame).
 *
 * It is NOT `import.meta.glob`, which was the first implementation and which
 * ships every model TWICE: Vite copies `public/` verbatim into `dist/` and then
 * emits each globbed file again as a hashed bundle asset. Five early stand-ins
 * measured 1.34MB duplicated; the complete roster would duplicate megabytes.
 * `scripts/v2/models-manifest.mjs` writes the file and a test keeps it in step
 * with the directory.
 *
 * A character with no entry is not an error — they fall back to a proxy. That
 * is what keeps a partial deploy or a future roster addition playable instead
 * of turning missing cosmetics into a boot failure.
 */
let manifest: Set<string> | null = null;
let pending: Promise<Set<string>> | null = null;

/**
 * Fetch the manifest once. Never rejects: a missing or malformed manifest means
 * "nothing has been delivered", which is the safe direction — every kid draws
 * as a proxy and the game runs.
 */
export function loadManifest(): Promise<Set<string>> {
  if (manifest) return Promise.resolve(manifest);
  pending ??= fetch(assetUrl(MODELS + 'manifest.json'))
    .then((r) => (r.ok ? r.json() : { characters: [] }))
    .catch(() => ({ characters: [] }))
    .then((json: { characters?: string[] }) => {
      manifest = new Set(json.characters ?? []);
      return manifest;
    });
  return pending;
}

/** Synchronous view of the manifest. `false` until `loadManifest` resolves. */
export function hasDeliveredModel(id: string): boolean {
  return manifest?.has(id) ?? false;
}

/** Every delivered id, sorted — the review page reports this. */
export function deliveredIds(): string[] {
  return manifest ? [...manifest].sort() : [];
}

/** Test seam: seed the manifest without a network. */
export function primeManifest(ids: readonly string[]): void {
  manifest = new Set(ids);
  pending = Promise.resolve(manifest);
}
