// ---------------------------------------------------------------------------
// NON-SHIPPING voice auditions for the full cast.
//
// The committed runtime bank was rendered from four macOS system voices. It is
// stable, but it cannot answer the product question "does this feel cast and
// acted?". This tool writes individually directed comparison takes to the
// artist inbox (`assets/v2/voice-auditions/`), never `public/`, using explicit
// per-character direction and OpenAI's speech endpoint.
//
// No arguments prints the casting sheet and makes no request. `--generate`
// spends API usage and writes the cast; ids after it narrow the batch. The
// signature trio remains the recommended first review, not the limit of the
// casting work.
// Shipping one of these would also require the product's AI-voice disclosure.
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { directionSheet } from './character-directions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', '..', 'assets', 'v2', 'voice-auditions');
const MODEL = 'gpt-4o-mini-tts-2025-12-15';

export const VOICE_AUDITIONS = directionSheet().map((card) => ({
  character: card.character,
  voice: card.auditionVoice,
  direction: card.direction,
}));

export function auditionSheet() {
  return VOICE_AUDITIONS.map(({ character, voice, direction }) => ({
    id: character.id,
    name: character.name,
    line: character.draftLine ?? character.name,
    voice,
    direction,
  }));
}

async function generate(ids) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const wanted = new Set(ids);
  const cast = VOICE_AUDITIONS.filter(({ character }) => wanted.size === 0 || wanted.has(character.id));
  if (!cast.length) throw new Error(`No roster character matches: ${ids.join(', ')}`);
  for (const id of wanted) {
    if (!cast.some(({ character }) => character.id === id)) {
      throw new Error(`${id} is not in the roster voice audition`);
    }
  }

  mkdirSync(OUT, { recursive: true });
  for (const { character, voice, direction } of cast) {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        voice,
        input: character.draftLine ?? character.name,
        instructions: direction,
        response_format: 'mp3',
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`${character.id}: speech API ${response.status} ${detail}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 4096) throw new Error(`${character.id}: speech API returned only ${bytes.length} bytes`);
    const out = join(OUT, `${character.id}.mp3`);
    writeFileSync(out, bytes);
    console.log(`✓ ${character.name} · ${voice} · ${(bytes.length / 1024).toFixed(0)}KB · ${out}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const live = args[0] === '--generate';
  if (!live) {
    console.table(auditionSheet().map(({ id, name, line, voice }) => ({ id, name, voice, line })));
    console.log('\nDry run only. Start with: npm run audition:voices -- --generate nostrike calls_shot wheelchair_ace');
    return;
  }
  await generate(args.slice(1));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
