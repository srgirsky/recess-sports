// ---------------------------------------------------------------------------
// ★ The ONLY file that loads a .glb. Render-side only.
//
// Same shape as `src/net/peer.ts` being the only file that imports peerjs, and
// for the same reason: the decoder paths, the compression settings and the
// cache policy are one decision each, and a second `new GLTFLoader()` anywhere
// in the codebase silently gets none of them. A Draco-compressed model loaded
// through a bare loader does not render wrong — it throws "no DRACOLoader
// instance provided", at runtime, on whichever device first fielded that kid.
//
// THREE THINGS IT OWNS:
//
//   1. THE DECODERS. Draco and Basis are fetched at runtime by URL (they are a
//      wasm blob and its glue, not modules a bundler can follow), so they live
//      in `public/v2/decoders/` and are kept in step with the installed `three`
//      by `scripts/v2/sync-decoders.mjs` + its test.
//   2. KTX2 SUPPORT DETECTION. `KTX2Loader.detectSupport(renderer)` asks the
//      GPU which compressed formats it can take — ETC1S on mobile, BC on
//      desktop — and without it every KTX2 texture fails to transcode. It needs
//      the real `WebGLRenderer`, which is why this module is CONFIGURED rather
//      than merely imported.
//   3. THE CACHE. One parsed GLTF per character id, shared by every instance of
//      that kid; `CharacterModel` clones the scene graph per instance so
//      geometry and textures are uploaded to the GPU exactly once. In-flight
//      loads are deduped, because a nine-kid defence built in one frame would
//      otherwise fetch the same file nine times.
// ---------------------------------------------------------------------------

import type { AnimationClip, WebGLRenderer } from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { animationUrl, assetUrl, characterAnimationUrl, characterUrl } from './assets';

let loader: GLTFLoader | null = null;
let draco: DRACOLoader | null = null;
let ktx2: KTX2Loader | null = null;

const characters = new Map<string, Promise<GLTF>>();
let animations: Promise<AnimationClip[]> | null = null;
const characterAnimations = new Map<string, Promise<AnimationClip[]>>();

/**
 * Wire the loader to a live renderer. Call once, from `Renderer`'s owner,
 * BEFORE any load.
 *
 * Safe to call again with the same renderer (idempotent); calling it with a
 * different renderer replaces the support detection, which is what a canvas
 * recreation would need.
 */
export function configureModelLoader(renderer: WebGLRenderer): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader();

    draco = new DRACOLoader();
    draco.setDecoderPath(assetUrl('decoders/draco/'));
    loader.setDRACOLoader(draco);

    ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath(assetUrl('decoders/basis/'));
    loader.setKTX2Loader(ktx2);
  }
  ktx2?.detectSupport(renderer);
  return loader;
}

/** The configured loader, or `null` if nothing has configured it yet. */
export function activeLoader(): GLTFLoader | null {
  return loader;
}

/**
 * Load `kid_<id>.glb`.
 *
 * Rejects rather than falling back — the fallback decision belongs to
 * `CharacterFactory`, which is the one place that knows whether a proxy is
 * acceptable. A loader that quietly substituted something else would make
 * "which kids are actually models?" unanswerable, and that question is exactly
 * what the review page exists to answer.
 */
export function loadCharacterModel(id: string): Promise<GLTF> {
  const cached = characters.get(id);
  if (cached) return cached;

  const pending = loadUrl(characterUrl(id)).catch((e: unknown) => {
    // Drop the failure from the cache so a transient network error can be
    // retried on the next game, rather than poisoning the id for the session.
    characters.delete(id);
    throw e;
  });
  characters.set(id, pending);
  return pending;
}

/**
 * Load the shared clip library. ONE file for all 30 kids — that is the whole
 * economic argument of the single-skeleton contract, so it is cached globally
 * rather than per character.
 */
export function loadAnimationLibrary(): Promise<AnimationClip[]> {
  animations ??= loadUrl(animationUrl())
    .then((gltf) => gltf.animations)
    .catch((e: unknown) => {
      animations = null;
      throw e;
    });
  return animations;
}

/**
 * Load one kid's optional authored takes. The caller decides whether the
 * manifest advertises a delivery and layers these over the shared library.
 */
export function loadCharacterAnimationLibrary(id: string): Promise<AnimationClip[]> {
  const cached = characterAnimations.get(id);
  if (cached) return cached;

  const pending = loadUrl(characterAnimationUrl(id))
    .then((gltf) => gltf.animations)
    .catch((e: unknown) => {
      characterAnimations.delete(id);
      throw e;
    });
  characterAnimations.set(id, pending);
  return pending;
}

function loadUrl(url: string): Promise<GLTF> {
  const active = loader;
  if (!active) {
    return Promise.reject(
      new Error(
        'modelLoader: configureModelLoader(renderer) has not been called. ' +
          'KTX2 textures cannot transcode without GPU support detection, so loading before ' +
          'configuration would fail later and less clearly than it fails here.'
      )
    );
  }
  return active.loadAsync(url);
}

/** Free the decoder worker pools. Loaded GLTFs are released with their owners. */
export function disposeModelLoader(): void {
  draco?.dispose();
  ktx2?.dispose();
  draco = null;
  ktx2 = null;
  loader = null;
  characters.clear();
  characterAnimations.clear();
  animations = null;
}
