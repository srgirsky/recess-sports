// ---------------------------------------------------------------------------
// ★ 26 OF 30 CHARACTERS WERE BEING SCORED FROM STILLS OF AN OLDER MODEL.
//
// Rubric 3.6 ("identity survives the hero close-up AND the 40px field read")
// and 3.14 (lips, teeth and tongue) are graded off `<slug>-runtime-*.png` in
// docs/v2/concepts. Those seven stills per kid are shot by
// `capture-character-evidence.mjs` against the delivered `.glb`.
//
// On 2026-08-16 a roster scan asked a question nobody had asked: for each
// character, is the runtime evidence NEWER than the model it claims to show?
// It was not, for 26 of the 30. A bulk model change had re-exported every kid
// and nothing re-shot the captures, so every hero and field-scale score on the
// record had been read off a previous sculpt — including scores that named
// specific pixels and sampled specific colours.
//
// ★ WHY NO EXISTING GATE SAW IT. `authored-character.test.js` checks that the
// stills EXIST and that the board hash matches the scores printed on it;
// `validate:models` checks the GLB; `measure:fidelity` grades the board views,
// not the runtime ones. Every one of them was green. Existence is not currency,
// and nothing in the repo related a PNG to the model that produced it — the
// relation simply was not recorded, so it could not be checked.
//
// The capture script's own header had ALREADY named this failure: "evidence
// that a human must remember to refresh is evidence that lies eventually." It
// was written after Junebug's palette fix shipped against pre-fix captures. The
// script was then built to make refreshing easy — and easy is not the same as
// enforced, so it rotted again at eight times the scale. That is the lesson
// this file exists to stop repeating: a rule that only lives in prose protects
// the one character that discovered it.
//
// ★ WHAT IS COMPARED, AND WHY A FULL-FILE HASH IS RIGHT HERE. The sculpt skill
// warns that a delivered GLB's sha256 is NOT a geometry check, and that is
// true: Blender's save is not byte-reproducible, so the hash moves when the
// source is rebuilt even if the shape is identical. That warning is about the
// question "did the shape change", which this hash genuinely cannot answer.
// The question here is narrower — "were these pixels produced by the bytes now
// on disk?" — and for that the full-file hash is exact. The cost of the
// mismatch is one re-shoot on a no-op rebuild, a few minutes; the failure it
// replaces ran for weeks.
//
// Break-it record: hand-editing one character's `capturedFromGlbSha256` to a
// wrong digest fires with
//   "clover: runtime stills were shot from a different kid_clover.glb
//    (stamped 1234abcd…, on disk 9f21c0de…) — re-run
//    `npm run capture:character-evidence -- clover`"
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { AUTHORED_CHARACTERS, slugFor } from './character-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const CONCEPTS = join(repo, 'docs', 'v2', 'concepts');
const RECORD = join(repo, 'assets', 'v2', 'source', 'character-evidence.json');

/** The stills the rubric grades. Kept in step with `CAPTURES` in the capturer. */
const RUNTIME_VIEWS = [
  'hero',
  'run',
  'swing',
  'face-grin',
  'face-cheer',
  'face-tongue',
  'face-angry',
];

const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : {};

function glbSha(id) {
  const file = join(repo, 'public', 'v2', 'models', `kid_${id}.glb`);
  if (!existsSync(file)) return null;
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Which of this character's runtime stills are actually on disk. */
function presentViews(id) {
  const slug = slugFor(id);
  return RUNTIME_VIEWS.filter((v) => existsSync(join(CONCEPTS, `${slug}-runtime-${v}.png`)));
}

describe('runtime evidence shows the model that ships', () => {
  const ids = Object.keys(AUTHORED_CHARACTERS).sort();

  for (const id of ids) {
    it(`${id}: stills were shot from the delivered .glb`, () => {
      const present = presentViews(id);
      // A character with no runtime stills at all is a character nobody has
      // captured — that is `authored-character.test.js`'s call to make when it
      // asks for evidence, not this file's. This file only rules on currency.
      if (present.length === 0) return;

      const onDisk = glbSha(id);
      expect(onDisk, `kid_${id}.glb is missing but its runtime stills are not`).not.toBeNull();

      const stamped = record[id]?.capturedFromGlbSha256;
      expect(
        stamped,
        `${id}: ${present.length} runtime still(s) exist with no provenance in ` +
          'assets/v2/source/character-evidence.json. Re-shoot them so the record ' +
          `is written: \`npm run capture:character-evidence -- ${id}\``,
      ).toBeTruthy();

      expect(
        stamped,
        `${id}: runtime stills were shot from a different kid_${id}.glb ` +
          `(stamped ${String(stamped).slice(0, 8)}…, on disk ${onDisk.slice(0, 8)}…) — ` +
          `re-run \`npm run capture:character-evidence -- ${id}\`. Any hero or ` +
          '40px score standing on these stills was read off a previous model.',
      ).toBe(onDisk);
    });
  }

  it('every captured character still has all seven stills', () => {
    const partial = [];
    for (const id of ids) {
      const present = presentViews(id);
      if (present.length > 0 && present.length < RUNTIME_VIEWS.length) {
        const missing = RUNTIME_VIEWS.filter((v) => !present.includes(v));
        partial.push(`${id}: missing ${missing.join(', ')}`);
      }
    }
    expect(partial, 'a partial capture is stamped as if it were a whole one').toEqual([]);
  });

  it('carries no provenance for a character nobody has sculpted', () => {
    const strays = Object.keys(record).filter((id) => !(id in AUTHORED_CHARACTERS));
    expect(
      strays,
      `${strays.join(', ')} declare no .blend — delete their rows rather than ` +
        'leaving provenance for evidence that cannot be regenerated',
    ).toEqual([]);
  });
});
