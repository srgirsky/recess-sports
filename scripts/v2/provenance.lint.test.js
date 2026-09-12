// ---------------------------------------------------------------------------
// ★ A STAND-IN TAKE OR A SYSTEM VOICE SHIPPING WITH NO MAINTAINER ON RECORD.
//
// `docs/v2/character-performance-brief.md` § Acceptance, rule 5, says the
// maintainer records performer/model/animation provenance before shipping and
// that generated and system stand-ins are not final delivery. For a year of
// the roster the rule was a sentence: six kids, then thirty, shipped a take
// baked by `proceduralClips.ts` and a voice synthesised by `say` or Kokoro,
// and no file anywhere said which kid had what, who had looked, or whether
// any of it counted as final. Every gate was green, because no gate asked.
//
// `assets/v2/source/character-provenance.json` is the record and
// `character-provenance.mjs` writes its machine half. This file keeps the
// record TRUE TO THE SHIPPED BYTES and refuses the two ways it could lie:
//
//   1. A ROW GOING STALE. The machine half must deep-equal a fresh derivation
//      from what is on disk — take sha, voice sha, builder, fidelity status.
//      An edited row, a re-baked take with no re-run, a voice re-shipped under
//      the old digest: all fail with "run npm run record:provenance".
//
//   2. A KIND BEING CLAIMED. `generated-stand-in` is not an opinion; it is what
//      a take IS when the builder named on its row is an `export function` in
//      `proceduralClips.ts`. A row may read `authored` or `performer` only with
//      no builder, an id outside the bake table, and a `source` under
//      `assets/v2/source/` whose sha matches. `finalDelivery` is then arithmetic
//      on the kind, and `status` is arithmetic on `recorded` and the binding
//      digest. Nothing on the row can be typed into a better answer.
//
// ★ AN AGENT NEVER FILLS, CLEARS OR RE-AFFIRMS `recorded` OR A `performer`
// BLOCK. This is the `apply-critique.mjs` rule — an agent may only ever write
// what a script derives, and the one thing a script cannot derive is that a
// human looked. So `recorded.by` must be a human-looking name (two capitalised
// words) that does not match /agent|claude|codex|gpt|copilot|bot|assistant|
// script/i, `at` a real date not in the future, and the three fields are all
// empty or all filled — a half-signed row is a row somebody started to fake.
//
// ★ `stale` IS REPORTED AND NEVER RED. A filled row whose `boundSha256` no
// longer matches the digest of the shipped model + take + voice reads
// `status: "stale"`. Making that a failure would hand an agent a red test that
// only a human field can clear — and the fix it would reach for is the one
// edit it must never make. The table below prints it instead.
//
// ★ WHY `at` IS NOT COMPARED TO THE TAKE'S BAKE DATE. The plan asked for it;
// the GLB carries no timestamp and a file's git date is HEAD's date on the
// shallow checkout CI uses, so the check would flag a true signature the next
// time anything merged. `boundSha256` carries the same fact exactly: a
// signature made before a re-bake cannot match the bytes that ship.
//
// Break-it record, each against an in-memory copy of a real row:
//   takeSha256 edited → "nostrike: animation.takeSha256 does not match the
//     shipped anims_nostrike_v1.glb — run `npm run record:provenance`"
//   kind set to "authored" with the builder still named → "nostrike:
//     animation.kind claims authored but builder buildJunebugPilotClips is an
//     export function in proceduralClips.ts — a take baked by code is
//     generated-stand-in whatever the row says"
//   recorded.by = "Claude Agent" → "nostrike: recorded.by "Claude Agent"
//     matches the agent blocklist — only a human maintainer signs this row"
//   recorded half-filled → "nostrike: recorded is half-filled ..."
//   boundSha256 wrong on a filled row → status "stale", zero problems.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ROSTER } from '../../src/data/characters.ts';
import { AI_VOICE_CAST } from './ai-voice-cast.mjs';
import { CHARACTERS } from './character-registry.mjs';
import {
  MAINTAINER_FIELDS,
  PROCEDURAL_CLIPS_PATH,
  PROVENANCE_PATH,
  bindingDigest,
  builderIsGenerated,
  deriveProvenance,
  deriveRecord,
  readProvenance,
  takePath,
  voicePath,
} from './character-provenance.mjs';
import { PERFORMANCE_IDS } from './export-signature-performance.mjs';
import { scanPerformances } from './models-manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const fileSha = (path) => (existsSync(path) ? sha(readFileSync(path)) : null);

const HUMAN_NAME = /^\p{Lu}[\p{L}'’.-]+(?: \p{Lu}[\p{L}'’.-]+)+$/u;
const AGENT_BLOCKLIST = /agent|claude|codex|gpt|copilot|bot|assistant|script/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX64 = /^[a-f0-9]{64}$/;

const record = readProvenance();
const fidelity = JSON.parse(readFileSync(join(repo, 'assets', 'v2', 'source', 'character-fidelity.json'), 'utf8'));
const clipsSource = readFileSync(PROCEDURAL_CLIPS_PATH, 'utf8');
const delivered = new Set(scanPerformances());
const rosterIds = ROSTER.map((kid) => kid.id).sort();

/** Everything a row is checked against, read from disk once per kid. */
function environment(id) {
  return {
    hasTake: delivered.has(id),
    takeSha: fileSha(takePath(id)),
    voiceSha: fileSha(voicePath(id)),
    cast: AI_VOICE_CAST[id] ?? null,
    inBakeTable: PERFORMANCE_IDS.includes(id),
    fidelityStatus: fidelity.characters?.[id]?.status ?? null,
    binding: bindingDigest(id),
    today: new Date().toISOString().slice(0, 10),
  };
}

function humanProblems(id, label, value) {
  const problems = [];
  if (typeof value !== 'string' || !HUMAN_NAME.test(value.trim())) {
    problems.push(`${id}: ${label} "${value}" is not a human-looking name (two capitalised words) — only a human maintainer signs this row`);
  }
  if (AGENT_BLOCKLIST.test(String(value))) {
    problems.push(`${id}: ${label} "${value}" matches the agent blocklist — only a human maintainer signs this row`);
  }
  return problems;
}

function performerProblems(id, label, performer) {
  if (performer === null) return [];
  if (typeof performer !== 'object' || Array.isArray(performer)) {
    return [`${id}: ${label} must be null or an object with a human \`name\``];
  }
  return humanProblems(id, `${label}.name`, performer.name);
}

/** The rules, as a list of what is wrong with one row. Empty means clean. */
export function problemsFor(id, row, env) {
  const problems = [];
  const { animation, voice, model, recorded } = row;

  // --- the take -----------------------------------------------------------
  if (env.hasTake) {
    if (animation.take !== `anims_${id}_v1.glb`) {
      problems.push(`${id}: anims_${id}_v1.glb ships but the row says take "${animation.take}" — run \`npm run record:provenance\``);
    }
    if (animation.takeSha256 !== env.takeSha) {
      problems.push(`${id}: animation.takeSha256 does not match the shipped anims_${id}_v1.glb — run \`npm run record:provenance\``);
    }
  } else {
    if (animation.take !== 'shared' || animation.takeSha256 !== null) {
      problems.push(`${id}: no anims_${id}_v1.glb ships, so the row must read take "shared" with a null sha — run \`npm run record:provenance\``);
    }
  }

  // --- the kind cannot be claimed ----------------------------------------
  if (animation.builder !== null) {
    if (!builderIsGenerated(animation.builder, clipsSource)) {
      problems.push(`${id}: animation.builder ${animation.builder} is not an export function in proceduralClips.ts — a builder nothing exports bakes nothing`);
    } else if (animation.kind !== 'generated-stand-in') {
      problems.push(`${id}: animation.kind claims ${animation.kind} but builder ${animation.builder} is an export function in proceduralClips.ts — a take baked by code is generated-stand-in whatever the row says`);
    }
  }
  if (animation.kind === 'authored' || animation.kind === 'performer') {
    if (animation.builder !== null) {
      problems.push(`${id}: animation.kind ${animation.kind} requires builder null`);
    }
    if (env.inBakeTable) {
      problems.push(`${id}: animation.kind ${animation.kind} while ${id} is still in BUILDERS in export-signature-performance.mjs — remove the bake entry or the claim`);
    }
    if (typeof animation.source !== 'string' || !animation.source.startsWith('assets/v2/source/')) {
      problems.push(`${id}: animation.kind ${animation.kind} requires animation.source under assets/v2/source/`);
    } else if (animation.sourceSha256 !== fileSha(join(repo, animation.source))) {
      problems.push(`${id}: animation.sourceSha256 does not match ${animation.source} — run \`npm run record:provenance\``);
    }
    if (animation.kind === 'performer' && animation.performer === null) {
      problems.push(`${id}: animation.kind performer requires an animation.performer block`);
    }
  } else if (animation.kind !== 'generated-stand-in') {
    problems.push(`${id}: animation.kind "${animation.kind}" is not one of generated-stand-in | authored | performer`);
  }
  problems.push(...performerProblems(id, 'animation.performer', animation.performer));

  // --- the voice ------------------------------------------------------------
  if (voice.runtimeSha256 !== env.voiceSha) {
    problems.push(`${id}: voice.runtimeSha256 does not match public/v2/audio/voices/kids/${id}.mp3 — run \`npm run record:provenance\``);
  }
  if (voice.performer !== null) {
    if (voice.kind !== 'performer') problems.push(`${id}: a voice.performer is on record, so voice.kind must be performer`);
    if (env.cast) problems.push(`${id}: voice.performer is on record but AI_VOICE_CAST still casts ${id} as ${env.cast.voice} — retire the cast entry`);
  } else if (env.cast) {
    if (voice.kind !== 'ai-voice-cast') problems.push(`${id}: AI_VOICE_CAST casts ${id}, so voice.kind must be ai-voice-cast`);
    if (voice.runtimeSha256 !== env.cast.runtimeSha256) {
      problems.push(`${id}: voice.runtimeSha256 disagrees with AI_VOICE_CAST.${id}.runtimeSha256 — the shipped mp3 is not the cast take`);
    }
  } else if (voice.kind !== 'system-voice-bank') {
    problems.push(`${id}: no performer and no AI_VOICE_CAST entry, so voice.kind must be system-voice-bank`);
  }
  problems.push(...performerProblems(id, 'voice.performer', voice.performer));

  // --- final delivery is arithmetic on the kind ----------------------------
  if (animation.finalDelivery !== (animation.kind !== 'generated-stand-in')) {
    problems.push(`${id}: animation.finalDelivery must equal (kind !== generated-stand-in) — rule 5 says a stand-in is not final`);
  }
  if (voice.finalDelivery !== (voice.kind === 'performer')) {
    problems.push(`${id}: voice.finalDelivery must equal (kind === performer) — rule 5 says a generated or system voice is not final`);
  }
  if (model.finalDelivery !== (env.fidelityStatus === 'approved')) {
    problems.push(`${id}: model.finalDelivery must equal (fidelity status === approved); it is ${env.fidelityStatus}`);
  }

  // --- the maintainer half -------------------------------------------------
  const keys = Object.keys(recorded ?? {}).sort();
  if (keys.join(',') !== 'at,boundSha256,by') {
    problems.push(`${id}: recorded must carry exactly by, at and boundSha256`);
  }
  const values = [recorded?.by, recorded?.at, recorded?.boundSha256].map((v) => (typeof v === 'string' ? v.trim() : ''));
  const filledCount = values.filter((v) => v !== '').length;
  const filled = filledCount === 3;
  if (filledCount !== 0 && filledCount !== 3) {
    problems.push(`${id}: recorded is half-filled (${filledCount} of 3) — a maintainer signs by, at and boundSha256 together, or not at all`);
  }
  if (filled) {
    problems.push(...humanProblems(id, 'recorded.by', recorded.by));
    if (!ISO_DATE.test(recorded.at) || Number.isNaN(Date.parse(recorded.at))) {
      problems.push(`${id}: recorded.at "${recorded.at}" is not a YYYY-MM-DD date`);
    } else if (recorded.at > env.today) {
      problems.push(`${id}: recorded.at ${recorded.at} is in the future`);
    }
    if (!HEX64.test(recorded.boundSha256)) {
      problems.push(`${id}: recorded.boundSha256 is not a sha256 — \`npm run record:provenance -- --bind ${id}\` prints the digest to sign`);
    }
  }

  // --- status is arithmetic on the two halves ------------------------------
  const expectedStatus = !filled ? 'awaiting-maintainer' : recorded.boundSha256 === env.binding ? 'recorded' : 'stale';
  if (filledCount === 0 || filled) {
    if (row.status !== expectedStatus) {
      problems.push(`${id}: status "${row.status}" should derive to "${expectedStatus}" — run \`npm run record:provenance\``);
    }
  }

  return problems;
}

describe('character-provenance.json covers the roster', () => {
  it('exists', () => {
    expect(existsSync(PROVENANCE_PATH), 'run: npm run record:provenance').toBe(true);
  });

  it('has a row for every ROSTER id and no strays', () => {
    expect(Object.keys(record.characters).sort()).toEqual(rosterIds);
  });

  it('names the four fields no script writes', () => {
    expect(record.maintainerFields).toEqual(MAINTAINER_FIELDS);
    expect(MAINTAINER_FIELDS).toEqual(['recorded', 'animation.source', 'animation.performer', 'voice.performer']);
  });
});

describe('the machine half is true to the shipped bytes', () => {
  it('deep-equals a fresh derivation', () => {
    const fresh = deriveRecord(record);
    for (const id of rosterIds) {
      expect(
        record.characters[id],
        `${id}: character-provenance.json is stale — run \`npm run record:provenance\``,
      ).toEqual(fresh.characters[id]);
    }
    expect(record.version).toBe(fresh.version);
    expect(record.rule).toBe(fresh.rule);
  });

  it('a take is on the row iff it ships', () => {
    for (const id of rosterIds) {
      const onDisk = delivered.has(id);
      expect(record.characters[id].animation.take !== 'shared', id).toBe(onDisk);
    }
  });

  it.each(rosterIds)('%s: every rule holds', (id) => {
    expect(problemsFor(id, record.characters[id], environment(id))).toEqual([]);
  });
});

describe('the roster, as it stands', () => {
  it('prints the table and how many rows await a maintainer', () => {
    const rows = rosterIds.map((id) => {
      const row = record.characters[id];
      return {
        id,
        name: CHARACTERS[id].name,
        take: `${row.animation.kind}${row.animation.take === 'shared' ? ' (shared)' : ' ★'}`,
        voice: row.voice.kind,
        model: row.model.finalDelivery ? 'approved' : 'not final',
        status: row.status,
      };
    });
    console.table(rows);
    const awaiting = rows.filter((r) => r.status === 'awaiting-maintainer').length;
    const stale = rows.filter((r) => r.status === 'stale');
    console.log(`awaiting maintainer: ${awaiting}`);
    if (stale.length) {
      console.log(`stale (signed over bytes that have since changed — a maintainer re-signs): ${stale.map((r) => r.id).join(', ')}`);
    }
    expect(rows).toHaveLength(rosterIds.length);
  });
});

// --- broken once each way, against in-memory copies ------------------------

describe('the gate fires', () => {
  const id = 'nostrike';
  const env = environment(id);
  const clone = () => structuredClone(record.characters[id]);

  it('when the take sha drifts', () => {
    const row = clone();
    row.animation.takeSha256 = 'f'.repeat(64);
    expect(problemsFor(id, row, env).join('\n')).toMatch(/takeSha256 does not match the shipped anims_nostrike_v1\.glb/);
  });

  it('when the voice sha drifts, and when the cast disagrees', () => {
    const row = clone();
    row.voice.runtimeSha256 = 'f'.repeat(64);
    const text = problemsFor(id, row, env).join('\n');
    expect(text).toMatch(/voice\.runtimeSha256 does not match/);
    expect(text).toMatch(/disagrees with AI_VOICE_CAST/);
  });

  it('when a kind is claimed over a named builder', () => {
    const row = clone();
    row.animation.kind = 'authored';
    row.animation.finalDelivery = true;
    const text = problemsFor(id, row, env).join('\n');
    expect(text).toMatch(/claims authored but builder buildJunebugPilotClips is an export function/);
    expect(text).toMatch(/requires builder null/);
    expect(text).toMatch(/still in BUILDERS/);
    expect(text).toMatch(/requires animation\.source under assets\/v2\/source\//);
  });

  it('when a builder is named that proceduralClips.ts does not export', () => {
    const row = clone();
    row.animation.builder = 'buildNobodyClips';
    expect(problemsFor(id, row, env).join('\n')).toMatch(/buildNobodyClips is not an export function/);
  });

  it('when a voice kind is claimed over the cast', () => {
    const row = clone();
    row.voice.kind = 'system-voice-bank';
    expect(problemsFor(id, row, env).join('\n')).toMatch(/AI_VOICE_CAST casts nostrike, so voice\.kind must be ai-voice-cast/);
  });

  it('when finalDelivery is asserted rather than derived', () => {
    const row = clone();
    row.animation.finalDelivery = true;
    row.voice.finalDelivery = true;
    row.model.finalDelivery = true;
    const text = problemsFor(id, row, env).join('\n');
    expect(text).toMatch(/animation\.finalDelivery must equal/);
    expect(text).toMatch(/voice\.finalDelivery must equal/);
    expect(text).toMatch(/model\.finalDelivery must equal/);
  });

  it('when recorded is half-filled', () => {
    const row = clone();
    row.recorded.by = 'Jane Maintainer';
    expect(problemsFor(id, row, env).join('\n')).toMatch(/recorded is half-filled \(1 of 3\)/);
  });

  it('when recorded.by is an agent, a script, or not a name', () => {
    for (const by of ['Claude Agent', 'Codex', 'record-provenance script', 'GPT Reviewer', 'x']) {
      const row = clone();
      row.recorded = { by, at: env.today, boundSha256: env.binding };
      row.status = 'recorded';
      expect(problemsFor(id, row, env).join('\n'), by).toMatch(/agent blocklist|not a human-looking name/);
    }
  });

  it('when recorded.at is in the future or not a date', () => {
    const future = clone();
    future.recorded = { by: 'Jane Maintainer', at: '2999-01-01', boundSha256: env.binding };
    future.status = 'recorded';
    expect(problemsFor(id, future, env).join('\n')).toMatch(/is in the future/);
    const junk = clone();
    junk.recorded = { by: 'Jane Maintainer', at: 'yesterday', boundSha256: env.binding };
    junk.status = 'recorded';
    expect(problemsFor(id, junk, env).join('\n')).toMatch(/not a YYYY-MM-DD date/);
  });

  it('when status is typed rather than derived', () => {
    const row = clone();
    row.status = 'recorded';
    expect(problemsFor(id, row, env).join('\n')).toMatch(/status "recorded" should derive to "awaiting-maintainer"/);
  });

  it('accepts a properly signed row, and reports — never fails — a stale one', () => {
    const signed = clone();
    signed.recorded = { by: 'Jane Maintainer', at: env.today, boundSha256: env.binding };
    signed.status = 'recorded';
    expect(problemsFor(id, signed, env)).toEqual([]);
    expect(deriveProvenance(id, signed, { clipsSource, fidelity }).status).toBe('recorded');

    const stale = clone();
    stale.recorded = { by: 'Jane Maintainer', at: env.today, boundSha256: 'a'.repeat(64) };
    stale.status = 'stale';
    expect(problemsFor(id, stale, env)).toEqual([]);
    expect(deriveProvenance(id, stale, { clipsSource, fidelity }).status).toBe('stale');
  });

  it('carries the maintainer half through a re-derivation untouched', () => {
    const signed = clone();
    signed.recorded = { by: 'Jane Maintainer', at: env.today, boundSha256: env.binding };
    signed.voice.performer = { name: 'Sam Reader', role: 'voice' };
    const fresh = deriveProvenance(id, signed, { clipsSource, fidelity });
    expect(fresh.recorded).toEqual(signed.recorded);
    expect(fresh.voice.performer).toEqual(signed.voice.performer);
    expect(fresh.voice.kind).toBe('performer');
    expect(fresh.voice.finalDelivery).toBe(true);
    // ...and the lint then notices the cast still lists the kid.
    expect(problemsFor(id, fresh, env).join('\n')).toMatch(/AI_VOICE_CAST still casts nostrike/);
  });
});
