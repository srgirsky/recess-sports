// ---------------------------------------------------------------------------
// ★ A LOOKUP THAT IS NEVER PERFORMED CANNOT FAIL, which is how six characters
// came to have no reachable concept art while every gate stayed green.
//
// `character-registry.json` maps a roster id to the filename its concept art was
// drawn under. For 11 of 30 kids those differ (`ace_kid` -> `ace`, `bend_it` ->
// `bendy-bao`, `diva` -> `dazzle`, `flash` -> `flash-gordon-jr`, `rocket` ->
// `rocket-rosa`, `the_prof` -> `the-professor`, plus five underscore/hyphen
// swaps). Before this file the mapping lived in three places, each covering only
// the six pilot characters, and `measure-fidelity.mjs` closed the gap with
// `SLUGS[id] ?? id` — so an unmapped kid resolved to a path that does not exist
// and the tool exited "missing ..., run review:character-fidelity", which reads
// like a missing render rather than a missing map entry.
//
// This gate is what lets the root brief's "ROSTER is the only source of
// character ids" survive a second file that is keyed by character id. It proves
// the registry is a MAPPING and never a second roster.
//
// Broken deliberately while writing it, each demanding its own message:
//   * renaming `ace` to `ace_kid` in the JSON  -> "no turnaround for ace_kid"
//   * deleting the `boomer` record             -> "registry is missing: boomer"
//   * adding a `custom_player` record          -> "not in ROSTER: custom_player"
//   * changing Dazzle's name to "Diva"         -> "name differs from ROSTER"
//   * giving `turbo` a source with no .blend   -> "declares a source that does not exist"
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ROSTER } from '../../src/data/characters.ts';
import { AUTHORED_CHARACTERS, CHARACTERS, conceptFor, slugFor } from './character-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const conceptsDir = join(repo, 'docs', 'v2', 'concepts');
const sourceDir = join(repo, 'assets', 'v2', 'source');

describe('the character registry maps the roster and never restates it', () => {
  it('covers every roster id exactly once and invents none', () => {
    const roster = ROSTER.map((character) => character.id).sort();
    const registered = Object.keys(CHARACTERS).sort();
    expect(registered.filter((id) => !roster.includes(id))).toEqual([]);
    expect(roster.filter((id) => !registered.includes(id))).toEqual([]);
  });

  it('agrees with ROSTER on every name, so the registry cannot become a second roster', () => {
    const wrong = ROSTER.filter((character) => CHARACTERS[character.id]?.name !== character.name).map(
      (character) => `${character.id}: "${CHARACTERS[character.id]?.name}" differs from ROSTER's "${character.name}"`,
    );
    expect(wrong).toEqual([]);
  });

  it('resolves every id to a turnaround that exists', () => {
    const missing = ROSTER.map((character) => character.id)
      .filter((id) => !existsSync(join(conceptsDir, conceptFor(id))))
      .map((id) => `no turnaround for ${id} at ${conceptFor(id)}`);
    expect(missing).toEqual([]);
  });

  it('gives every character a distinct slug', () => {
    const slugs = Object.keys(CHARACTERS).map(slugFor);
    expect(slugs.length).toBe(new Set(slugs).size);
  });

  // The ratchet: an entry that restates its own id is dead weight, and dead
  // weight is what an allowlist gets refilled with. If a future roster id is
  // renamed to match its art, delete the mapping rather than leaving it.
  it('carries no slug entry that merely repeats its id', () => {
    const redundant = Object.entries(CHARACTERS)
      .filter(([id, record]) => record.slug === id && !existsSync(join(conceptsDir, `${id}-turnaround.png`)))
      .map(([id]) => id);
    expect(redundant).toEqual([]);
  });

  it('derives AUTHORED_CHARACTERS from a declared source, and every source exists', () => {
    const declared = Object.entries(CHARACTERS)
      .filter(([, record]) => record.source)
      .map(([id]) => id)
      .sort();
    expect(Object.keys(AUTHORED_CHARACTERS).sort()).toEqual(declared);

    const broken = declared
      .filter((id) => !existsSync(join(sourceDir, CHARACTERS[id].source)))
      .map((id) => `${id} declares a source that does not exist: ${CHARACTERS[id].source}`);
    expect(broken).toEqual([]);
  });

  it('gives every authored character exactly five defining traits', () => {
    const wrong = Object.entries(AUTHORED_CHARACTERS)
      .filter(([, record]) => record.traits?.length !== 5)
      .map(([id]) => `${id}: ${AUTHORED_CHARACTERS[id].traits?.length ?? 0} traits, expected 5`);
    expect(wrong).toEqual([]);
  });

  it('refuses an unknown id rather than guessing a slug from it', () => {
    expect(() => slugFor('not_a_kid')).toThrow(/unknown character id/);
  });
});
