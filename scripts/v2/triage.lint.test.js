// ---------------------------------------------------------------------------
// ★ 419 FINDINGS CANNOT BE "WORKED TO EMPTY" IF NOBODY CAN SAY WHICH SWEEP
// OWNS EACH ONE.
//
// `character-fidelity.json`'s `polishFindings` are free-text prose — deliberate,
// because a finding's evidence (board, crop, magnification, measurement) IS its
// content, and `apply-critique.mjs` replaces a kid's array wholesale from a
// critic's report. But the 4→5 campaign is organised as CLASS SWEEPS through
// sculptlib (a hem primitive once, not thirty hem fixes), and prose does not
// answer the only planning question that matters: how many findings does each
// sweep retire, and which kids does it touch? The first attempt to answer it
// with keywords misclassified or missed 229 of 419 — the taxonomy in people's
// heads was not the vocabulary in the file.
//
// `character-fidelity-triage.json` is the sidecar that answers it: every
// finding, keyed by `<char>:<sha1(finding text) first 12 hex>`, carries exactly
// one class — the sweep that would fix it. This file holds sidecar and ledger
// in bijection:
//
//   - a finding with no triage row fails — a critic added or reworded a
//     finding, and an untriaged finding belongs to no sweep, so it would sit
//     outside every worklist while the campaign reports itself done;
//   - a triage row with no finding fails — the finding was retired (or its
//     text edited, which is the same thing: the old claim no longer exists),
//     and a sidecar that keeps rows for retired findings inflates every count
//     it exists to make honest.
//
// Keying by text-hash rather than array index is what makes wholesale
// replacement safe: surviving findings keep their rows, removed ones go red
// here instead of silently shifting under their neighbours' classes.
//
// TO FIX A RED: re-run the classification for the named findings — add the
// missing row with the class whose sweep fixes it (the `classes` list in the
// sidecar is closed; extend it only with a class a sweep could actually
// retire), or delete the stale row. Never reword ledger text to dodge a
// re-triage; the finding's text is the critic's, not the sweeper's.
//
// `no-defect-note` rows are records that something was checked and cleared so
// no critic re-files it — they are in the bijection like everything else, but
// no sweep owns them and no count of open defect work should include them.
//
// Break-it record (both tried 2026-08-29): deleting nostrike's first triage
// row fires with "nostrike:c48188a5a62c has no triage row — classify it into
// the sweep that fixes it (\"Bun/crown shelf (junebug-front-review.png …\")";
// adding a row keyed `nostrike:000000000000` fires "triages a finding that is
// not in the ledger — … delete the row". Both name the finding, not a count.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '..', '..', 'assets', 'v2', 'source');

const ledger = JSON.parse(readFileSync(join(SOURCE, 'character-fidelity.json'), 'utf8'));
const triage = JSON.parse(readFileSync(join(SOURCE, 'character-fidelity-triage.json'), 'utf8'));

const keyFor = (char, text) =>
  `${char}:${createHash('sha1').update(text).digest('hex').slice(0, 12)}`;

const ledgerKeys = new Map(); // key -> { char, text }
for (const [char, entry] of Object.entries(ledger.characters)) {
  for (const text of entry.polishFindings ?? []) {
    ledgerKeys.set(keyFor(char, text), { char, text });
  }
}

describe('every polish finding belongs to exactly one sweep', () => {
  it('classifies every ledger finding', () => {
    const untriaged = [...ledgerKeys]
      .filter(([key]) => !(key in triage.findings))
      .map(
        ([key, f]) =>
          `${key} has no triage row — classify it into the sweep that fixes it ` +
          `("${f.text.slice(0, 70)}…")`,
      );
    expect(untriaged).toEqual([]);
  });

  it('keeps no row for a finding the ledger no longer carries', () => {
    const stale = Object.keys(triage.findings)
      .filter((key) => !ledgerKeys.has(key))
      .map(
        (key) =>
          `${key} triages a finding that is not in the ledger — the finding was ` +
          `retired or reworded; delete the row (re-triage the new text if it was reworded)`,
      );
    expect(stale).toEqual([]);
  });

  it('uses only declared classes, and its excerpts match their findings', () => {
    const classes = new Set(triage.classes);
    const bad = Object.entries(triage.findings).flatMap(([key, row]) => {
      const out = [];
      if (!classes.has(row.class)) out.push(`${key}: unknown class "${row.class}"`);
      const live = ledgerKeys.get(key);
      if (live && !live.text.startsWith(row.excerpt)) {
        out.push(`${key}: excerpt does not open the finding it keys — rebuild the row`);
      }
      if (live && row.char !== live.char) out.push(`${key}: char field disagrees with key`);
      return out;
    });
    expect(bad).toEqual([]);
  });

  it('declares no class that owns nothing', () => {
    // A ratchet with dead entries gets refilled. `other` is the one exception:
    // it must stay declared (the classifier needs a lawful fallback) and stay
    // empty or near-empty (a growing `other` means the taxonomy lost touch).
    const used = new Set(Object.values(triage.findings).map((r) => r.class));
    const dead = triage.classes.filter((c) => c !== 'other' && !used.has(c));
    expect(
      dead.map((c) => `class "${c}" classifies nothing — its sweep retired it; delete it`),
    ).toEqual([]);
  });
});
