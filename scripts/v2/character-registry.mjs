// ---------------------------------------------------------------------------
// ★ ONE PLACE FOR THE id -> CONCEPT-ART SLUG, because three copies of it had
// already drifted into a live bug.
//
// A roster id (`ace_kid`) and the filename its art was drawn under
// (`ace-turnaround.png`) are different strings for 11 of the 30 kids, and every
// tool that opens a concept image needs the mapping. It existed in three places
// — `AUTHORED_CHARACTERS[id].concept`, `render-character-fidelity.mjs` and
// `measure-fidelity.mjs` — and all three knew only the six pilot characters.
//
// PR #119 then added 24 turnarounds and changed no code, so
// `npm run measure:fidelity -- ace_kid` looked for `ace_kid-turnaround.png`,
// which does not exist, and `review:character-fidelity` threw outright. The tool
// the quality rubric names as the thing that must settle §3 BEFORE any 1-5 eye
// score could not run at all for `ace_kid`, `bend_it`, `diva`, `flash`,
// `rocket` or `the_prof` — and nothing went red, because a lookup that is never
// performed cannot fail.
//
// ★ THE DATA IS JSON, NOT THIS FILE, and that is deliberate. `validate:models`,
// `manifest:models` and `measure:fidelity` run under plain `node` with no
// TypeScript loader, and two Blender scripts need the same mapping from Python.
// A `.json` is the one format all four can read. `character-registry.test.js`
// binds it to `ROSTER` — every id present, no extras, every name matching, every
// slug resolving to a real turnaround — so `src/data/characters.ts` stays the
// only source of character ids and this stays a mapping rather than a second
// roster.
//
// ⚠️ **Do not write a regenerator for it.** The slug, the `.blend` and the five
// defining traits are authored facts that no roster field implies, so a
// generator would need its own copy of the slug map — which is the duplication
// this file exists to delete. Edit the JSON by hand and let the test check it,
// the same arrangement `brief-inventory.json` uses for the same reason.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const REGISTRY_PATH = join(here, 'character-registry.json');

/** Every roster character: `{ name, slug, source?, traits? }`, keyed by roster id. */
export const CHARACTERS = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')).characters;

/**
 * The subset with an authored Blender source — the baseline
 * `authored-character.test.js` demands receipts, boards and scores for.
 *
 * Membership is EARNED by declaring a `source`, never by being listed twice. A
 * kid with concept art and no `.blend` is a kid nobody has sculpted yet, and the
 * gate must not ask them for evidence that cannot exist.
 */
export const AUTHORED_CHARACTERS = Object.fromEntries(
  Object.entries(CHARACTERS)
    .filter(([, record]) => record.source)
    .map(([id, record]) => [
      id,
      { name: record.name, source: record.source, concept: conceptFor(id), traits: record.traits },
    ]),
);

/** The concept-art slug for a roster id. Throws rather than guessing: a silent
 *  `?? id` fallback is exactly how six characters came to resolve to files that
 *  do not exist. */
export function slugFor(id) {
  const record = CHARACTERS[id];
  if (!record) {
    throw new Error(`unknown character id "${id}" — add it to scripts/v2/character-registry.json`);
  }
  return record.slug;
}

/** The turnaround filename under `docs/v2/concepts/`. */
export function conceptFor(id) {
  return `${slugFor(id)}-turnaround.png`;
}
