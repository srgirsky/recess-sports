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
// base, `import.meta.url` points at the hashed JS bundle while `public/v2/`
// lands beside the two HTML entry points. The front door therefore needs
// `v2/<path>` and the permanent `/v2/` alias needs `<path>`. Resolve that one
// difference here; models, decoders, audio and shell art must never each invent
// their own URL rule.
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
  return assetUrlForPage(path, document.baseURI);
}

/** Resolve one `public/v2/` asset from either shipped HTML entry point. */
export function assetUrlForPage(path: string, pageBase: string): string {
  const pageDir = new URL('.', pageBase);
  const assetPath = pageDir.pathname.endsWith('/v2/') ? path : `v2/${path}`;
  return new URL(assetPath, pageDir).href;
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

/** Optional character-authored clip overrides; missing names keep shared motion. */
export function characterAnimationFile(id: string): string {
  return `anims_${id}_v1.glb`;
}

export function characterAnimationUrl(id: string): string {
  return assetUrl(MODELS + characterAnimationFile(id));
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
let performances: Set<string> | null = null;
let pending: Promise<Set<string>> | null = null;

/**
 * Fetch the manifest once. Never rejects: a missing or malformed manifest means
 * "nothing has been delivered", which is the safe direction — every kid draws
 * as a proxy and the game runs.
 */
export function loadManifest(): Promise<Set<string>> {
  if (manifest) return Promise.resolve(manifest);
  pending ??= fetch(assetUrl(MODELS + 'manifest.json'))
    .then((r) => (r.ok ? r.json() : { characters: [], performances: [] }))
    .catch(() => ({ characters: [], performances: [] }))
    .then((json: { characters?: string[]; performances?: string[] }) => {
      manifest = new Set(json.characters ?? []);
      performances = new Set(json.performances ?? []);
      return manifest;
    });
  return pending;
}

/** Synchronous view of the manifest. `false` until `loadManifest` resolves. */
export function hasDeliveredModel(id: string): boolean {
  return manifest?.has(id) ?? false;
}

/** Whether an optional kid-specific animation take is present in the manifest. */
export function hasDeliveredPerformance(id: string): boolean {
  return performances?.has(id) ?? false;
}

/** Every delivered id, sorted — the review page reports this. */
export function deliveredIds(): string[] {
  return manifest ? [...manifest].sort() : [];
}

/** Test seam: seed the manifest without a network. */
export function primeManifest(ids: readonly string[], performanceIds: readonly string[] = []): void {
  manifest = new Set(ids);
  performances = new Set(performanceIds);
  pending = Promise.resolve(manifest);
}
