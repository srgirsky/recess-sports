// ---------------------------------------------------------------------------
// Render a JSON job list through the same pinned Kokoro model the shipping
// pipeline uses (`ai-voice-cast.mjs`), so every kid-voice experiment starts
// from the identical source take. Research tooling: it writes wherever the job
// list says (the bake-off writes to the git-ignored audition inbox) and never
// touches `public/`.
//
//   node scripts/v2/kid-voice/kokoro-batch.mjs jobs.json
//   jobs.json = [{ "text": "...", "voice": "af_bella", "speed": 1, "out": "a.wav" }]
// ---------------------------------------------------------------------------

import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { AI_VOICE_MODEL } from '../ai-voice-cast.mjs';

const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { KokoroTTS } = await import('kokoro-js');
const tts = await KokoroTTS.from_pretrained(AI_VOICE_MODEL, { dtype: 'q8', device: 'cpu' });
for (const job of jobs) {
  mkdirSync(dirname(job.out), { recursive: true });
  const audio = await tts.generate(job.text, { voice: job.voice, speed: job.speed ?? 1 });
  await audio.save(job.out);
  if (statSync(job.out).size < 4096) throw new Error(`Kokoro produced an empty take: ${job.out}`);
  console.log(`✓ ${job.voice} @ ${job.speed ?? 1}× → ${job.out}`);
}
