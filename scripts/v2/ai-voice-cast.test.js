import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_VOICE_CAST, AI_VOICE_GENERATOR, AI_VOICE_LICENSE, AI_VOICE_MODEL, checkAiVoiceCard } from './ai-voice-cast.mjs';

describe('local AI voice casting', () => {
  it('pins the free local model and generator', () => {
    expect(AI_VOICE_MODEL).toBe('onnx-community/Kokoro-82M-v1.0-ONNX');
    expect(AI_VOICE_GENERATOR).toBe('kokoro-js@1.2.1');
    expect(AI_VOICE_LICENSE).toBe('Apache-2.0');
  });

  it('records reproducible stock-voice auditions for every promoted character', () => {
    for (const [id, card] of Object.entries(AI_VOICE_CAST)) {
      expect(checkAiVoiceCard(id, card)).toEqual([]);
      expect(card.candidates).toHaveLength(3);
      expect(new Set(card.candidates).size).toBe(3);
    }
  });

  it('ships each selected master and runtime copy with pinned fingerprints', () => {
    for (const [id, card] of Object.entries(AI_VOICE_CAST)) {
      const master = join(process.cwd(), 'assets', 'v2', 'voice-delivery', 'kids', `${id}.wav`);
      const runtime = join(process.cwd(), 'public', 'v2', 'audio', 'voices', 'kids', `${id}.mp3`);
      expect(existsSync(master), id).toBe(true);
      expect(existsSync(runtime), id).toBe(true);
      expect(readFileSync(master).toString('ascii', 0, 4)).toBe('RIFF');
      expect(readFileSync(runtime).toString('ascii', 0, 3)).toBe('ID3');
      expect(createHash('sha256').update(readFileSync(master)).digest('hex')).toBe(card.masterSha256);
      expect(createHash('sha256').update(readFileSync(runtime)).digest('hex')).toBe(card.runtimeSha256);
    }
  });

  it('rejects an unreviewed or imitation-style selection', () => {
    expect(checkAiVoiceCard('nostrike', {
      candidates: ['named_person_clone'],
      voice: 'named_person_clone',
      speed: 1.4,
    }).join('\n')).toMatch(/at least two|stock voice|0.8–1.2/);
  });
});
