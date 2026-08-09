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

  it('records a reproducible Junebug audition and stock-voice selection', () => {
    expect(checkAiVoiceCard('nostrike', AI_VOICE_CAST.nostrike)).toEqual([]);
    expect(AI_VOICE_CAST.nostrike.candidates).toHaveLength(3);
    expect(new Set(AI_VOICE_CAST.nostrike.candidates).size).toBe(3);
  });

  it('ships the selected Junebug master and runtime copy', () => {
    const master = join(process.cwd(), 'assets', 'v2', 'voice-delivery', 'kids', 'nostrike.wav');
    const runtime = join(process.cwd(), 'public', 'v2', 'audio', 'voices', 'kids', 'nostrike.mp3');
    expect(existsSync(master)).toBe(true);
    expect(existsSync(runtime)).toBe(true);
    expect(readFileSync(master).toString('ascii', 0, 4)).toBe('RIFF');
    expect(readFileSync(runtime).toString('ascii', 0, 3)).toBe('ID3');
    expect(createHash('sha256').update(readFileSync(master)).digest('hex')).toBe(AI_VOICE_CAST.nostrike.masterSha256);
    expect(createHash('sha256').update(readFileSync(runtime)).digest('hex')).toBe(AI_VOICE_CAST.nostrike.runtimeSha256);
  });

  it('rejects an unreviewed or imitation-style selection', () => {
    expect(checkAiVoiceCard('nostrike', {
      candidates: ['named_person_clone'],
      voice: 'named_person_clone',
      speed: 1.4,
    }).join('\n')).toMatch(/at least two|stock voice|0.8–1.2/);
  });
});
