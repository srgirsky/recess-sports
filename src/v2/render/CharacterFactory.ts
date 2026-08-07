// ---------------------------------------------------------------------------
// ★ THE ONE SEAM between "a character" and "which of the two things is drawing
// it". Render-side only.
//
// Nothing else in the codebase is allowed to decide between a production
// model and a proxy, because that decision has four inputs — a URL flag, what
// has been delivered, whether the file loaded, and whether it was
// well-formed — and any call site that reimplements even part of it will get a
// different answer than the review page reports. "Are we looking at the art
// yet?" has to have exactly one answer.
//
// THE RESOLUTION ORDER, and why each step exists:
//
//   1. `?proxy=1`         forces proxies everywhere. Asset contract §5 names
//                         this flag. It is how you compare a delivery against
//                         the stand-in it replaced without editing anything,
//                         and how you get a deterministic scene for a CI
//                         screenshot.
//   2. not delivered      -> proxy, silently. The committed manifest is complete,
//                         but a partial deploy or stale cached manifest must
//                         remain a cosmetic downgrade rather than a crash.
//   3. load/parse failed  -> proxy, and warn ONCE per character. A 404 or a
//                         malformed file IS a defect, and it is the one thing
//                         here that somebody has to fix.
//
// The game keeps running in every branch. A missing model is a cosmetic
// downgrade, never a crash — which is the whole reason the proxy exists.
// ---------------------------------------------------------------------------

import type { Character } from '../../data/types';
import { CharacterModel, type CharacterModelOptions, type KidView } from './CharacterModel';
import { ProxyCharacter } from './ProxyCharacter';
import { hasDeliveredModel, loadManifest } from './assets';
import { loadCharacterModel } from './modelLoader';

export type KidSource = 'model' | 'proxy-forced' | 'proxy-undelivered' | 'proxy-failed';

export interface CreatedKid {
  view: KidView;
  /** Which branch of the resolution order produced this. */
  source: KidSource;
}

export interface CharacterFactoryOptions extends CharacterModelOptions {
  /** Override the `?proxy=1` reading. Tests set it; the game reads the URL. */
  forceProxy?: boolean;
}

const warned = new Set<string>();

/** `?proxy=1` — asset contract §5's "forces them everywhere". */
export function proxyForced(): boolean {
  if (typeof location === 'undefined') return false;
  const v = new URLSearchParams(location.search).get('proxy');
  return v !== null && v !== '0' && v !== 'false';
}

/**
 * Build a character, model if there is one and a proxy otherwise.
 *
 * Async because loading is: a caller that wants nine defenders awaits nine of
 * these. There is deliberately no synchronous variant — one would have to
 * answer "model or proxy?" before the fetch resolves, and the only honest
 * answer at that moment is "proxy", which would make every kid a proxy on the
 * first frame and pop into a model on the second.
 */
export async function createCharacter(
  character: Character,
  opts: CharacterFactoryOptions = {}
): Promise<CreatedKid> {
  const { forceProxy, ...modelOpts } = opts;
  const proxy = (source: KidSource): CreatedKid => ({
    view: new ProxyCharacter(character.visual, {
      uniform: modelOpts.uniform,
      outlines: modelOpts.outlines,
    }),
    source,
  });

  if (forceProxy ?? proxyForced()) return proxy('proxy-forced');

  // One fetch for the whole session, deduped inside `loadManifest`. Awaiting it
  // here rather than at boot keeps callers from having to remember an init step
  // whose omission would show up as "every kid is a proxy" and nothing else.
  await loadManifest();
  if (!hasDeliveredModel(character.id)) return proxy('proxy-undelivered');

  try {
    const gltf = await loadCharacterModel(character.id);
    return {
      view: new CharacterModel(character.id, gltf, character.visual, modelOpts),
      source: 'model',
    };
  } catch (e) {
    // ONCE per character, not once per instance. Nine kids of the same
    // character in one game is one defect, not nine — and a warning that
    // repeats every frame of a retry loop is how a real message gets buried.
    if (!warned.has(character.id)) {
      warned.add(character.id);
      console.warn(
        `[CharacterFactory] ${character.id} fell back to a proxy: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
    return proxy('proxy-failed');
  }
}

/** Build a whole side at once. Order is preserved; nothing rejects. */
export function createCharacters(
  characters: readonly Character[],
  opts: CharacterFactoryOptions = {}
): Promise<CreatedKid[]> {
  return Promise.all(characters.map((c) => createCharacter(c, opts)));
}

/** Test seam — the warn-once set is module state by design. */
export function resetFallbackWarnings(): void {
  warned.clear();
}
