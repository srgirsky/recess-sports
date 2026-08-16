// ---------------------------------------------------------------------------
// ★ THE RECORD HALF OF A CRITIC ROUND, DONE IN THE ONE ORDER THAT IS CORRECT.
//
// A round ends with four writes that have to happen in sequence, and the
// sequence is not the obvious one:
//
//   1. the six scores and their notes go into character-fidelity.json
//   2. the status is DERIVED from those scores, never asserted
//   3. THEN the fidelity board is re-rendered — because the board PRINTS the
//      scores and the status
//   4. and only then is that board's sha256 taken and bound as
//      `scoredBoardSha256`
//
// Doing 3 before 1 binds the scores to a board that shows the previous ones,
// which is the Mimi failure `authored-character.test.js` was written to catch,
// and it looks exactly like success. This script exists so that ordering is not
// re-derived by hand thirty times.
//
// ★ IT CANNOT WRITE `approved`, AND THAT IS DELIBERATE. Status is computed from
// the scores: every applicable category >= 4 gives `candidate`, anything below
// gives `needs-polish`. `approved` requires a human approver, timestamp and
// board hash, and an agent may not author or re-affirm a human verdict — so
// there is no code path here that can produce it, rather than a rule saying not
// to.
//
// ⚠️ THE SCULPTOR MUST NOT BE THE AUTHOR OF THE FILE THIS READS. This applies a
// critique; it does not make one. The input is written by an independent critic
// that rendered the board and ran the instruments itself.
//
//   npm run apply:critique -- /tmp/critique-<id>.json
//
// Input shape:
//   { id, scores: {<category>: 1-5 | null}, notes: {<category>: string},
//     measured: string, polishFindings: string[] }
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

const RECORD = 'assets/v2/source/character-fidelity.json';
const CONCEPTS = 'docs/v2/concepts';

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('usage: npm run apply:critique -- /tmp/critique-<id>.json [more...]');
  process.exit(2);
}

const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const CATEGORIES = record.categories;
const today = new Date().toISOString().slice(0, 10);
const applied = [];

for (const path of inputs) {
  const critique = JSON.parse(readFileSync(resolve(path), 'utf8'));
  const { id } = critique;
  const entry = record.characters?.[id];
  if (!entry) throw new Error(`${path}: no character "${id}" in ${RECORD}`);

  const missing = CATEGORIES.filter((c) => !(c in (critique.scores ?? {})));
  if (missing.length) throw new Error(`${id}: critique is missing ${missing.join(', ')}`);

  for (const category of CATEGORIES) {
    const score = critique.scores[category];
    if (score !== null && !(Number.isInteger(score) && score >= 1 && score <= 5)) {
      throw new Error(`${id}: ${category} score ${score} is not an integer 1-5 or null`);
    }
    const note = critique.notes?.[category];
    if (!note || !note.trim()) throw new Error(`${id}: ${category} has a score but no note`);
    entry.categories[category].score = score;
    entry.categories[category].note = note;
  }

  // Status is DERIVED. An abstained category (bald kids, hairMass) does not
  // block; anything scored below 4 does.
  const scored = CATEGORIES.map((c) => critique.scores[c]).filter((s) => s !== null);
  const status = scored.every((s) => s >= 4) ? 'candidate' : 'needs-polish';
  entry.status = status;

  if (Array.isArray(critique.polishFindings)) entry.polishFindings = critique.polishFindings;
  if (critique.measured) {
    entry.measuredFidelity = entry.measuredFidelity ?? {};
    entry.measuredFidelity.command = `npm run measure:fidelity -- ${id}`;
    entry.measuredFidelity.ranAt = today;
    entry.measuredFidelity.board = entry.evidence;
    entry.measuredFidelity.result = critique.measured;
  }
  applied.push({ id, status, scores: CATEGORIES.map((c) => critique.scores[c]) });
}

// 1+2 land before the board is drawn.
writeFileSync(RECORD, `${JSON.stringify(record, null, 1)}\n`);

for (const { id } of applied) {
  // 3. The board is re-rendered from the record that now holds these scores.
  const render = spawnSync('npm', ['run', 'review:character-fidelity', '--', id], { encoding: 'utf8' });
  if (render.status !== 0) {
    throw new Error(`${id}: review:character-fidelity failed\n${render.stdout}\n${render.stderr}`);
  }
}

// 4. Only now is the hash taken, and it is taken from the freshly drawn board.
const after = JSON.parse(readFileSync(RECORD, 'utf8'));
for (const { id } of applied) {
  const board = resolve(CONCEPTS, after.characters[id].evidence);
  if (!existsSync(board)) throw new Error(`${id}: no board at ${board}`);
  after.characters[id].scoredBoardSha256 = createHash('sha256').update(readFileSync(board)).digest('hex');
}
writeFileSync(RECORD, `${JSON.stringify(after, null, 1)}\n`);

for (const { id, status, scores } of applied) {
  console.log(`✓ ${id.padEnd(16)} ${status.padEnd(12)} ${scores.map((s) => (s === null ? '-' : s)).join(' ')}`);
}
console.log(`\n${applied.length} critique(s) applied, scores bound to freshly rendered boards.`);
console.log('Approval remains the maintainer\'s: no path here writes `approved`.');
