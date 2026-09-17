// ---------------------------------------------------------------------------
// ★ WHO MADE WHAT SHIPS — the provenance record behind acceptance rule 5.
//
// `docs/v2/character-performance-brief.md` § Acceptance, rule 5: "The
// maintainer records performer/model/animation provenance before shipping;
// generated and system stand-ins are not final delivery." Until this file the
// rule had no record to write into and no gate to read one, so thirty kids
// shipped a code-baked take and a synthesised voice with nothing anywhere
// saying so. `assets/v2/source/character-provenance.json` is that record, and
// this script writes its MACHINE HALF.
//
//   npm run record:provenance            rewrite the machine half of every row
//   npm run record:provenance -- --check verify it; non-zero exit on drift
//   npm run record:provenance -- --bind <id>   print the digest a maintainer
//                                        pastes into `recorded.boundSha256`
//
// ★ THE KIND IS DERIVED, NEVER CLAIMED. An animation row reads
// `generated-stand-in` because its take was baked by an `export function` in
// `src/v2/render/proceduralClips.ts` — the builder name comes from the same
// `BUILDERS` table `export:signature-performance` bakes from, and the lint
// checks that name against the file's own text. A voice row reads
// `ai-voice-cast` because the id is in `AI_VOICE_CAST`, and
// `system-voice-bank` because it is not. `finalDelivery` is the rule's own
// sentence made boolean: a take is final only when it is not a generated
// stand-in; a voice only when a performer is on record; a model only when its
// fidelity board is `approved`. Nothing here can be edited into a better
// answer than the shipped bytes support.
//
// ★ THE MAINTAINER HALF IS PRESERVED VERBATIM AND NEVER WRITTEN. The keys in
// `maintainerFields` — `recorded`, `animation.source`, `animation.performer`,
// `voice.performer` — are copied through from the existing row untouched, the
// same arrangement `stampCapturedFrom` in `capture-character-evidence.mjs`
// uses for its own record. There is no code path that fills, clears or
// re-affirms them, for the same reason `apply-critique.mjs` cannot write
// `approved`: a human verdict an agent can manufacture is not a verdict. An
// agent working in this repo leaves `recorded` as `{by: "", at: "",
// boundSha256: ""}` on every row it did not personally witness a human sign.
//
// `status` is derived from those two halves: `awaiting-maintainer` while
// `recorded` is empty, `recorded` when its `boundSha256` still equals the
// digest of the bytes that ship (model + take + voice), and `stale` when it
// does not — the take was re-baked, the voice re-shipped or the model
// re-exported after the signature. `stale` is REPORTED by the lint and never
// red, because the only field that can clear it is one an agent may not touch.
//
// Called after `writeManifest()` by `export-signature-performance.mjs` and
// `export-authored-character.mjs`, so the record refreshes on the same path
// that refreshes the manifest. `provenance.lint.test.js` is the gate.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ROSTER } from '../../src/data/characters.ts';
import { AI_VOICE_CAST, AI_VOICE_GENERATOR, AI_VOICE_LICENSE, AI_VOICE_MODEL } from './ai-voice-cast.mjs';
import { builderNameFor } from './export-signature-performance.mjs';
import { readGlb } from './glb.mjs';
import { MODELS_DIR } from './models-manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');

export const PROVENANCE_PATH = join(repo, 'assets', 'v2', 'source', 'character-provenance.json');
export const PROCEDURAL_CLIPS_PATH = join(repo, 'src', 'v2', 'render', 'proceduralClips.ts');
export const VOICES_DIR = join(repo, 'public', 'v2', 'audio', 'voices', 'kids');
const FIDELITY_PATH = join(repo, 'assets', 'v2', 'source', 'character-fidelity.json');

/** The keys no script writes. Listed in the record so a reader can see the line. */
export const MAINTAINER_FIELDS = ['recorded', 'animation.source', 'animation.performer', 'voice.performer'];

export const EMPTY_RECORDED = Object.freeze({ by: '', at: '', boundSha256: '' });

/** The generator string for the system bank; the mp3s carry no metadata of their own. */
export const SYSTEM_VOICE_GENERATOR = 'macOS say (scripts/v2/export-voices.mjs)';

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const fileSha = (path) => (existsSync(path) ? sha(readFileSync(path)) : null);

export const takePath = (id) => join(MODELS_DIR, `anims_${id}_v1.glb`);
export const modelPath = (id) => join(MODELS_DIR, `kid_${id}.glb`);
export const voicePath = (id) => join(VOICES_DIR, `${id}.mp3`);

/** Is `name` an `export function` in proceduralClips.ts — i.e. code, not a performance? */
export function builderIsGenerated(name, source = readFileSync(PROCEDURAL_CLIPS_PATH, 'utf8')) {
  if (!name) return false;
  return new RegExp(`^export function ${name}\\s*\\(`, 'm').test(source);
}

export function readProvenance() {
  if (!existsSync(PROVENANCE_PATH)) return { version: 1, maintainerFields: MAINTAINER_FIELDS, characters: {} };
  return JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
}

/**
 * ★ WHAT A SIGNATURE IS BOUND TO. The digest of the three artefacts that ship
 * for a kid — model, take (or the word `shared`), voice — so a re-export of
 * any one of them turns a `recorded` row `stale` rather than leaving a
 * signature standing over bytes nobody signed. Not stored in the machine half;
 * the maintainer copies it into `recorded.boundSha256` by hand.
 */
export function bindingDigest(id) {
  return sha(`${fileSha(modelPath(id)) ?? 'none'}\n${fileSha(takePath(id)) ?? 'shared'}\n${fileSha(voicePath(id)) ?? 'none'}`);
}

function readGenerator(path) {
  try {
    return readGlb(path).json.asset?.generator ?? null;
  } catch {
    return null;
  }
}

function fidelityStatus(id, fidelity) {
  return fidelity?.characters?.[id]?.status ?? null;
}

function isHumanValue(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Derive one kid's full row. `existing` supplies the maintainer half verbatim
 * (and nothing else — every other field is recomputed from what ships).
 */
export function deriveProvenance(id, existing = readProvenance().characters?.[id], context = {}) {
  const fidelity = context.fidelity ?? JSON.parse(readFileSync(FIDELITY_PATH, 'utf8'));
  const clipsSource = context.clipsSource ?? readFileSync(PROCEDURAL_CLIPS_PATH, 'utf8');
  const prior = existing ?? {};
  const recorded = { ...EMPTY_RECORDED, ...(prior.recorded ?? {}) };
  const source = prior.animation?.source ?? null;
  const animationPerformer = prior.animation?.performer ?? null;
  const voicePerformer = prior.voice?.performer ?? null;

  const take = takePath(id);
  const hasTake = existsSync(take);
  const builder = hasTake ? builderNameFor(id) : null;
  let animationKind;
  if (builder && builderIsGenerated(builder, clipsSource)) animationKind = 'generated-stand-in';
  else if (!hasTake) animationKind = 'generated-stand-in';
  else if (animationPerformer) animationKind = 'performer';
  else animationKind = 'authored';

  const cast = AI_VOICE_CAST[id] ?? null;
  let voiceKind;
  if (voicePerformer) voiceKind = 'performer';
  else if (cast) voiceKind = 'ai-voice-cast';
  else voiceKind = 'system-voice-bank';

  const modelFinal = fidelityStatus(id, fidelity) === 'approved';
  const animationFinal = animationKind !== 'generated-stand-in';
  const voiceFinal = voiceKind === 'performer';

  const filled = isHumanValue(recorded.by) || isHumanValue(recorded.at) || isHumanValue(recorded.boundSha256);
  let status;
  if (!filled) status = 'awaiting-maintainer';
  else if (recorded.boundSha256 === bindingDigest(id)) status = 'recorded';
  else status = 'stale';

  return {
    model: {
      kind: 'blender-authored',
      receipt: `assets/v2/source/character-production.json#characters.${id}`,
      fidelity: `assets/v2/source/character-fidelity.json#characters.${id}`,
      finalDelivery: modelFinal,
    },
    animation: {
      take: hasTake ? `anims_${id}_v1.glb` : 'shared',
      takeSha256: hasTake ? fileSha(take) : null,
      builder,
      generator: hasTake ? readGenerator(take) : null,
      kind: animationKind,
      source,
      sourceSha256: source ? fileSha(join(repo, source)) : null,
      performer: animationPerformer,
      finalDelivery: animationFinal,
    },
    voice: {
      kind: voiceKind,
      cast: cast
        ? { voice: cast.voice, speed: cast.speed, model: AI_VOICE_MODEL, license: AI_VOICE_LICENSE }
        : null,
      generator: voiceKind === 'ai-voice-cast' ? AI_VOICE_GENERATOR : voiceKind === 'system-voice-bank' ? SYSTEM_VOICE_GENERATOR : null,
      runtime: `public/v2/audio/voices/kids/${id}.mp3`,
      runtimeSha256: fileSha(voicePath(id)),
      performer: voicePerformer,
      finalDelivery: voiceFinal,
    },
    recorded,
    status,
  };
}

/** The whole record, derived from what ships, maintainer halves carried through. */
export function deriveRecord(existing = readProvenance()) {
  const fidelity = JSON.parse(readFileSync(FIDELITY_PATH, 'utf8'));
  const clipsSource = readFileSync(PROCEDURAL_CLIPS_PATH, 'utf8');
  const ids = ROSTER.map((kid) => kid.id).sort();
  const characters = Object.fromEntries(
    ids.map((id) => [id, deriveProvenance(id, existing.characters?.[id], { fidelity, clipsSource })]),
  );
  return {
    version: 1,
    rule: 'docs/v2/character-performance-brief.md § Acceptance 5 — the maintainer records performer/model/animation provenance before shipping; generated and system stand-ins are not final delivery.',
    maintainerFields: MAINTAINER_FIELDS,
    characters,
  };
}

export function provenanceBody(existing = readProvenance()) {
  return `${JSON.stringify(deriveRecord(existing), null, 2)}\n`;
}

export function provenanceIsCurrent() {
  if (!existsSync(PROVENANCE_PATH)) return false;
  return readFileSync(PROVENANCE_PATH, 'utf8') === provenanceBody();
}

export function writeProvenance() {
  const body = provenanceBody();
  writeFileSync(PROVENANCE_PATH, body);
  return JSON.parse(body);
}

export function summarize(record) {
  const rows = Object.entries(record.characters).map(([id, row]) => ({
    id,
    take: `${row.animation.kind}${row.animation.take === 'shared' ? ' (shared)' : ' ★'}`,
    voice: row.voice.kind,
    status: row.status,
  }));
  const awaiting = rows.filter((r) => r.status === 'awaiting-maintainer').length;
  return { rows, awaiting, stale: rows.filter((r) => r.status === 'stale').length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    if (provenanceIsCurrent()) {
      const { awaiting, stale } = summarize(readProvenance());
      console.log(`character-provenance.json is current — awaiting maintainer: ${awaiting}, stale: ${stale}`);
    } else {
      console.error('character-provenance.json does not match what ships — run: npm run record:provenance');
      process.exit(1);
    }
  } else if (args[0] === '--bind') {
    const id = args[1];
    if (!ROSTER.some((kid) => kid.id === id)) throw new Error(`${id ?? '(none)'}: not a roster id`);
    console.log(bindingDigest(id));
  } else {
    const record = writeProvenance();
    const { rows, awaiting, stale } = summarize(record);
    console.table(rows);
    console.log(`wrote ${PROVENANCE_PATH}\n  awaiting maintainer: ${awaiting} · stale: ${stale}`);
  }
}
