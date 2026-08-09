// ---------------------------------------------------------------------------
// Free, local AI-voice production for roster characters.
//
// Kokoro runs on the maintainer's machine through a pinned development
// dependency. The first run downloads the q8 model into `.cache/`; inference
// after that is offline and has no API key or per-line fee. Model weights and
// kokoro-js are Apache-2.0. We use only named stock voices: never a cloned
// performer, a minor's recording or an imitation of a named real person.
//
// Auditions stay in `assets/v2/voice-auditions/`. `--ship` is the deliberate
// promotion step: it writes the 48 kHz/24-bit mono master that the existing
// delivery validator accepts, then encodes the runtime MP3 from that master.
// ---------------------------------------------------------------------------

import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROSTER } from '../../src/data/characters.ts';
import { VOICE_DELIVERY_DIR } from './voice-delivery.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const AUDITION_DIR = join(ROOT, 'assets', 'v2', 'voice-auditions', 'local');
const RUNTIME_DIR = join(ROOT, 'public', 'v2', 'audio', 'voices', 'kids');

export const AI_VOICE_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const AI_VOICE_GENERATOR = 'kokoro-js@1.2.1';
export const AI_VOICE_LICENSE = 'Apache-2.0';

/**
 * A production selection is content, not a random search. Keep the short list,
 * chosen stock voice and rate together so another maintainer can reproduce the
 * decision and reopen the audition without guessing what was heard.
 */
export const AI_VOICE_CAST = {
  nostrike: {
    candidates: ['af_heart', 'af_bella', 'af_kore'],
    voice: 'af_bella',
    speed: 0.96,
    masterSha256: 'df55b8c2444d05527cd3e4be6903bad7c25af609582a39507a81a37ca288f442',
    runtimeSha256: '052202a9e93183617912232277933397e490cb7cddb33847d6920b2b6eb0f9e6',
    direction: 'Grounded and precise; dry confidence first, smallest smile on the final word.',
  },
};

export function aiVoiceCard(id) {
  return AI_VOICE_CAST[id];
}

export function checkAiVoiceCard(id, card) {
  const issues = [];
  if (!card) return [`${id}: no local AI voice has been cast`];
  if (!Array.isArray(card.candidates) || card.candidates.length < 2) {
    issues.push(`${id}: audition at least two stock voices`);
  }
  if (!card.candidates?.includes(card.voice)) {
    issues.push(`${id}: selected voice ${card.voice ?? 'missing'} is not in its audition short list`);
  }
  if (!/^a[fm]_[a-z]+$/.test(card.voice ?? '')) {
    issues.push(`${id}: selected voice must be a named American-English Kokoro stock voice`);
  }
  if (!(card.speed >= 0.8 && card.speed <= 1.2)) {
    issues.push(`${id}: speed ${card.speed ?? 'missing'} is outside the natural 0.8–1.2 review band`);
  }
  if (!/^[a-f0-9]{64}$/.test(card.masterSha256 ?? '') || !/^[a-f0-9]{64}$/.test(card.runtimeSha256 ?? '')) {
    issues.push(`${id}: approved master and runtime SHA-256 fingerprints are required`);
  }
  return issues;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${basename(command)} failed: ${(result.stderr || result.stdout).trim()}`);
  }
}

function encodeMaster(source, master) {
  mkdirSync(dirname(master), { recursive: true });
  run('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', source,
    '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s24le', master,
  ]);
  if (statSync(master).size < 4096) throw new Error(`empty voice master: ${master}`);
}

function encodeRuntime(master, runtime) {
  mkdirSync(dirname(runtime), { recursive: true });
  run('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', master,
    '-ac', '1', '-ar', '24000', '-b:a', '64k', runtime,
  ]);
  if (statSync(runtime).size < 4096) throw new Error(`empty runtime voice: ${runtime}`);
}

function requestedCards(ids) {
  const roster = new Map(ROSTER.map((character) => [character.id, character]));
  return ids.map((id) => {
    const character = roster.get(id);
    if (!character) throw new Error(`${id}: not a roster id`);
    const card = aiVoiceCard(id);
    const issues = checkAiVoiceCard(id, card);
    if (issues.length) throw new Error(issues.join('\n'));
    return { character, card };
  });
}

async function loadTts() {
  const { KokoroTTS } = await import('kokoro-js');
  console.log(`Loading ${AI_VOICE_MODEL} q8 locally (the first run downloads it to .cache/)…`);
  return KokoroTTS.from_pretrained(AI_VOICE_MODEL, { dtype: 'q8', device: 'cpu' });
}

async function render(tts, text, voice, speed, out) {
  mkdirSync(dirname(out), { recursive: true });
  const audio = await tts.generate(text, { voice, speed });
  await audio.save(out);
  if (statSync(out).size < 4096) throw new Error(`Kokoro produced an empty take: ${out}`);
}

export async function auditionAiVoices(ids) {
  const cards = requestedCards(ids);
  const tts = await loadTts();
  for (const { character, card } of cards) {
    for (const voice of card.candidates) {
      const out = join(AUDITION_DIR, character.id, `${voice}.wav`);
      await render(tts, character.draftLine ?? character.name, voice, card.speed, out);
      console.log(`✓ audition ${character.name} · ${voice} · ${out}`);
    }
  }
}

export async function shipAiVoices(ids) {
  const cards = requestedCards(ids);
  const tts = await loadTts();
  const temp = mkdtempSync(join(tmpdir(), 'recess-ai-voice-'));
  try {
    for (const { character, card } of cards) {
      const raw = join(temp, `${character.id}.wav`);
      const master = join(VOICE_DELIVERY_DIR, `${character.id}.wav`);
      const runtime = join(RUNTIME_DIR, `${character.id}.mp3`);
      await render(tts, character.draftLine ?? character.name, card.voice, card.speed, raw);
      encodeMaster(raw, master);
      encodeRuntime(master, runtime);
      console.log(`✓ shipped ${character.name} · ${card.voice} @ ${card.speed}×`);
      console.log(`  master  ${master}`);
      console.log(`  runtime ${runtime}`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function printCast() {
  console.table(Object.entries(AI_VOICE_CAST).map(([id, card]) => ({
    id,
    candidates: card.candidates.join(', '),
    selected: card.voice,
    speed: card.speed,
  })));
  console.log('\nAudition: npm run generate:ai-voice -- --audition nostrike');
  console.log('Ship:     npm run generate:ai-voice -- --ship nostrike');
}

async function main() {
  const [mode, ...ids] = process.argv.slice(2);
  if (!mode) return printCast();
  if (!['--audition', '--ship'].includes(mode)) {
    throw new Error(`unknown mode ${mode}; use --audition or --ship`);
  }
  if (!ids.length) throw new Error(`${mode} needs at least one roster id`);
  if (mode === '--audition') await auditionAiVoices(ids);
  else await shipAiVoices(ids);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
