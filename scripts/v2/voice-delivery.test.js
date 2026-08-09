import { describe, expect, it } from 'vitest';
import { checkVoiceProbe, voiceMasterPath } from './voice-delivery.mjs';

const GOOD = {
  streams: [{ codec_name: 'pcm_s24le', sample_rate: '48000', channels: 1, bits_per_sample: 24 }],
  format: { duration: '1.75' },
};

describe('recorded voice delivery', () => {
  it('names masters by roster id in the non-shipping inbox', () => {
    expect(voiceMasterPath('nostrike')).toMatch(/assets\/v2\/voice-delivery\/kids\/nostrike\.wav$/);
  });

  it('accepts the lossless mono master contract', () => {
    expect(checkVoiceProbe('nostrike', GOOD)).toEqual([]);
  });

  it('reports every cheap-to-fix format error in one pass', () => {
    const issues = checkVoiceProbe('nostrike', {
      streams: [{ codec_name: 'mp3', sample_rate: '44100', channels: 2, bits_per_raw_sample: 16 }],
      format: { duration: '0.1' },
    });
    expect(issues).toHaveLength(5);
    expect(issues.join('\n')).toMatch(/24-bit PCM WAV/);
    expect(issues.join('\n')).toMatch(/48000 Hz/);
    expect(issues.join('\n')).toMatch(/mono/);
    expect(issues.join('\n')).toMatch(/0\.3–8\.0s/);
  });
});
