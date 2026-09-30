import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
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

describe('★ every clip at one loudness, and none at the ceiling', () => {
  // scripts/v2/measure-audio.mjs measures each shipped clip with ffmpeg and
  // writes a playback gain; this holds that manifest to the shipped bytes and
  // to the bar, so CI needs no ffmpeg. Measured on main: voices -18.2 to -23.3
  // LUFS (5.1 dB apart), the glove pop at -0.4 dBTP, and no gain applied.
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'src', 'v2', 'ui', 'audioLoudness.json'), 'utf8'));
  const shipped = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(wav|mp3)$/.test(e.name)) shipped.push(p);
    }
  };
  walk(ROOT);

  it('measures every shipped clip as shipped (run `npm run measure:audio`)', () => {
    for (const path of shipped) {
      const key = relative(ROOT, path).split('\\').join('/');
      const row = manifest.files[key];
      expect(row, `${key} is not in audioLoudness.json`).toBeDefined();
      expect(createHash('sha256').update(readFileSync(path)).digest('hex'), `${key} changed since it was measured`).toBe(row.sha256);
    }
  });

  it('plays every clip under the true-peak ceiling', () => {
    for (const [key, row] of Object.entries(manifest.files)) {
      expect(row.gainDb, key).toBeLessThanOrEqual(0);
      expect(row.peakDbtp + row.gainDb, key).toBeLessThanOrEqual(manifest.targets.peakDbtp + 0.05);
    }
  });

  it('plays the voices within 2.5 dB of each other', () => {
    const voices = Object.values(manifest.files).filter((r) => r.voice);
    expect(voices.length).toBeGreaterThan(30);
    const heard = voices.map((r) => r.lufs + r.gainDb);
    expect(Math.max(...heard) - Math.min(...heard)).toBeLessThanOrEqual(2.5);
  });

  it('★ RecordedAudio applies the gain as the element volume', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'v2', 'ui', 'RecordedAudio.ts'), 'utf8');
    expect(src).toMatch(/\.volume = playbackVolume\(file\)/);
  });
});
