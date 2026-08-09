import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../src/data/characters.ts';
import { COMMENTARY_LINES } from './export-voices.mjs';

const ROOT = join(process.cwd(), 'public', 'v2', 'audio');

function expectWav(path) {
  const bytes = readFileSync(path);
  expect(bytes.length, path).toBeGreaterThan(4096);
  expect(bytes.toString('ascii', 0, 4), path).toBe('RIFF');
  expect(bytes.toString('ascii', 8, 12), path).toBe('WAVE');
}

function expectMp3(path) {
  const bytes = readFileSync(path);
  expect(bytes.length, path).toBeGreaterThan(4096);
  expect(bytes.toString('ascii', 0, 3), path).toBe('ID3');
}

describe('v2 recorded audio delivery', () => {
  it('ships every stable gameplay master', () => {
    for (const file of ['bat-crack.wav', 'glove-pop.wav', 'pitch-woosh.wav', 'swing-whiff.wav', 'crowd-cheer.wav', 'out-stamp.wav']) {
      const path = join(ROOT, file);
      expect(existsSync(path), file).toBe(true);
      expectWav(path);
    }
  });

  it('ships both commentators and one authored line per roster kid', () => {
    for (const kind of Object.keys(COMMENTARY_LINES)) {
      const path = join(ROOT, 'voices', 'commentary', `${kind}.mp3`);
      expect(existsSync(path), kind).toBe(true);
      expectMp3(path);
    }
    for (const kid of ROSTER) {
      const path = join(ROOT, 'voices', 'kids', `${kid.id}.mp3`);
      expect(existsSync(path), kid.id).toBe(true);
      expectMp3(path);
    }
  });
});
