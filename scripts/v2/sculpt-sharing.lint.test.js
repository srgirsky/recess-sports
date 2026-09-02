// ---------------------------------------------------------------------------
// ★ TWO CHARACTERS SHIPPED THE SAME LEGS WHILE CITING TWO DIFFERENT DRAWINGS.
//
// `sculpt-cricket-source.py` and `sculpt-gizmo-source.py` carry a BYTE-IDENTICAL
// `LEG_STATIONS` table, comments included. Above it, each carries its own
// `measured:` provenance, and the two disagree by a third:
//
//     cricket   front z=1.10 halfWidth=0.3810   z=0.80 0.3894   z=0.46 0.4230
//     gizmo     front z=1.10 halfWidth=0.5007   z=0.80 0.5210   z=0.46 0.5673
//
// Gizmo's legs are drawn 31-34% wider than Cricket's at every one of the three
// heights either sheet was read at. They ship the same numbers. Resolving the
// shipped table through `leg_x` puts it BETWEEN the two children and outside
// both tolerances: Cricket goes out +0.081/+0.095 ft against a declared 0.03,
// Gizmo -0.038/-0.126 ft against 0.03/0.04. One table was split down the middle
// between two kids and neither got its own body.
//
// The same shape holds for `dex`/`lefty` (cited 0.6167 vs 0.4441 at z=1.25 —
// and in OPPOSITE directions at the two heights, so their legs do not even
// taper the same way) and for `clover`/`peaches` (0.3864 vs 0.4226 at z=0.70).
//
// ★ WHY `sculpt-provenance.lint.test.js` IS GREEN ON ALL SIX, AND IS RIGHT TO
// BE. Its own header says so in as many words: "IT CHECKS THE CITATION, NOT THE
// TABLE." That is deliberate and well-argued — a sculpt may legitimately ship
// away from the drawing, as Junebug's torso does, with the residual recorded.
// The gate's job is to stop a CLAIM about the drawing the drawing will not
// support, and it does that job.
//
// What it cannot distinguish is a considered deviation from a copy-paste
// nobody re-fitted. This file asks the one question that separates them, and
// it needs no tolerance to ask it: two characters traced from two different
// sheets do not arrive at the same number to the byte, comment for comment.
// Identity is the evidence. There is nothing to tune and nothing to widen.
//
// ⚠️ SCOPE, AND WHY IT IS NARROW. Only tables whose provenance is `measured:`
// are covered. A `not-traceable:` table is a declared refusal — the sheet
// cannot give the number, so kids legitimately share a default, and several do
// (ARM_STATIONS, CROTCH_LEVELS, NECK_LEVELS). Those are a real "one kid's body
// worn by others" concern, but they are `sculptspec.lint.test.js`'s argument
// about the shared library, not a false claim about a drawing. Widening this
// file to cover them would bury the three real defects in fourteen shrugs.
//
// Break-it record: copying smokey's `LEG_STATIONS` over boomer's fires with
//   "boomer and smokey ship a byte-identical LEG_STATIONS, both citing
//    `measured:` provenance from their own turnarounds..."
//
// ⚠️ The FIRST break attempt copied smokey's `TORSO_LEVELS` instead and stayed
// green, which looked like a hole and is not one: smokey's torso carries only
// `not-traceable:` provenance, so it is out of scope by the rule above and the
// pair never forms. Recorded because the same near-miss will look like a bug to
// the next person — pick a table BOTH kids cite as `measured:` when testing
// this, or the test proves nothing.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { AUTHORED_CHARACTERS, slugFor } from './character-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BLENDER = resolve(here, 'blender');

/** Form tables that describe THIS character's body, not the rig's conventions. */
const BODY_TABLES = new Set([
  'LEG_STATIONS',
  'TORSO_LEVELS',
  'TORSO_LEVELS_CRISP',
  'ARM_STATIONS',
  'NECK_LEVELS',
  'CROTCH_LEVELS',
  'HEAD_LEVELS',
]);

/**
 * ★ A DEBT LIST, NOT AN ALLOWANCE. Each entry is a pair of characters that
 * genuinely ship one body between them today, with the measured spread of the
 * citations they each claim. The house rule applies: it may only SHRINK, and
 * the fix is to re-trace the table from the kid's own sheet — never to add a
 * row here.
 */
const DEBT = [
  // cited pair-outer half at z=1.10 / 0.80 / 0.46; shipped lands between them
  // and outside BOTH declared tolerances (+0.095 cricket, -0.126 gizmo).
  ['cricket', 'gizmo', 'LEG_STATIONS'],
  // dex+lefty was paid 2026-08-29: the hem sweep's belt-line rows broke the
  // byte-identity. Whether dex's station numbers are now truly HIS remains
  // tracked by his open proportions findings — this lint only ever saw the
  // copy, and the copy is gone.
  // cited 0.3864 vs 0.4226 at z=0.70 (9.4% apart).
  // clover/peaches LEG_STATIONS: re-traced apart 2026-09-02 (Peaches' calf and ankle, #214).
];

const debtKey = (a, b, t) => [[a, b].sort().join('+'), t].join(':');
const DEBT_KEYS = new Set(DEBT.map(([a, b, t]) => debtKey(a, b, t)));

/** Module-level ALL-CAPS table literals, with the provenance lines above them. */
function tablesIn(source) {
  const lines = source.split('\n');
  const out = [];
  const re = /^([A-Z][A-Z0-9_]{3,})\s*=\s*[[{(][\s\S]*?^(?=[A-Za-z@#]|$)/gm;
  for (let m = re.exec(source); m !== null; m = re.exec(source)) {
    const [body, name] = [m[0], m[1]];
    if (!BODY_TABLES.has(name) || body.length < 120) continue;
    const lineNo = source.slice(0, m.index).split('\n').length - 1;
    const above = lines.slice(Math.max(0, lineNo - 8), lineNo);
    out.push({
      name,
      sha: createHash('sha256').update(body).digest('hex'),
      measured: above.some((l) => l.includes('measured:')),
    });
  }
  return out;
}

const byTable = new Map(); // `${name}:${sha}` -> [ids], measured-cited only
for (const id of Object.keys(AUTHORED_CHARACTERS).sort()) {
  let source;
  try {
    source = readFileSync(join(BLENDER, `sculpt-${slugFor(id)}-source.py`), 'utf8');
  } catch {
    continue; // no authored script — validate:models owns that
  }
  for (const t of tablesIn(source)) {
    if (!t.measured) continue;
    const key = `${t.name}:${t.sha}`;
    byTable.set(key, [...(byTable.get(key) ?? []), id]);
  }
}

/** Every unordered pair of characters sharing one measured-cited table. */
function sharedPairs() {
  const pairs = [];
  for (const [key, ids] of byTable) {
    if (ids.length < 2) continue;
    const table = key.split(':')[0];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j], table]);
    }
  }
  return pairs;
}

describe('a character is traced from its own sheet', () => {
  it('no two characters ship a byte-identical measured body table', () => {
    const undeclared = sharedPairs()
      .filter(([a, b, t]) => !DEBT_KEYS.has(debtKey(a, b, t)))
      .map(([a, b, t]) =>
        `${a} and ${b} ship a byte-identical ${t}, both citing \`measured:\` ` +
        'provenance from their own turnarounds. Two sheets do not produce the ' +
        `same table to the byte — re-trace ${t} for at least one of them ` +
        'against its own drawing. Do not add a row to DEBT.',
      );
    expect(undeclared).toEqual([]);
  });

  it('carries no debt for a pair that has been re-traced', () => {
    const live = new Set(sharedPairs().map(([a, b, t]) => debtKey(a, b, t)));
    const paid = DEBT.filter(([a, b, t]) => !live.has(debtKey(a, b, t))).map(
      ([a, b, t]) => `${a}+${b} ${t}: no longer shared — delete the DEBT row`,
    );
    expect(paid).toEqual([]);
  });

  it('carries no debt for a character nobody has sculpted', () => {
    const strays = DEBT.flatMap(([a, b]) => [a, b]).filter((id) => !(id in AUTHORED_CHARACTERS));
    expect(strays, `${strays.join(', ')} declare no .blend`).toEqual([]);
  });
});
