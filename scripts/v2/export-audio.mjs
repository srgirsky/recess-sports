// Deterministic first-party audio masters. Runtime playback uses these static
// files, so every browser hears the same impacts and crowd reaction; the live
// Web Audio synthesiser remains the load-failure fallback.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', '..', 'public', 'v2', 'audio');
const RATE = 22050;

function noise(i, seed) {
  let x = (i + seed * 7919) | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) / 0xffffffff) * 2 - 1;
}

function wav(seconds, sample) {
  const count = Math.ceil(seconds * RATE);
  const out = Buffer.alloc(44 + count * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + count * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(RATE, 24);
  out.writeUInt32LE(RATE * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    const value = Math.max(-1, Math.min(1, sample(t, i)));
    out.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return out;
}

const sounds = {
  'bat-crack.wav': wav(0.42, (t, i) => {
    const snap = noise(i, 1) * Math.exp(-t * 42);
    const wood = Math.sin(t * Math.PI * 2 * 720) * Math.exp(-t * 18);
    const body = Math.sin(t * Math.PI * 2 * 145) * Math.exp(-t * 10);
    return snap * 0.72 + wood * 0.28 + body * 0.24;
  }),
  'glove-pop.wav': wav(0.34, (t, i) => {
    const thump = Math.sin(t * Math.PI * 2 * (118 - t * 90)) * Math.exp(-t * 17);
    return thump * 0.72 + noise(i, 2) * Math.exp(-t * 36) * 0.28;
  }),
  'pitch-woosh.wav': wav(0.48, (t, i) => {
    const env = Math.sin(Math.min(1, t / 0.48) * Math.PI) ** 1.7;
    return noise(Math.floor(i / 5), 3) * env * 0.25 + Math.sin(t * Math.PI * 2 * (210 + t * 310)) * env * 0.08;
  }),
  'swing-whiff.wav': wav(0.38, (t, i) => {
    const env = Math.sin(Math.min(1, t / 0.38) * Math.PI) ** 1.25;
    return noise(Math.floor(i / 7), 4) * env * 0.3;
  }),
  'crowd-cheer.wav': wav(1.25, (t, i) => {
    const rise = Math.min(1, t * 7);
    const fall = Math.min(1, (1.25 - t) * 2.2);
    const bed = noise(Math.floor(i / 11), 5) * 0.22;
    const voices = [310, 372, 438, 515].reduce((v, hz, n) => v + Math.sin(t * Math.PI * 2 * (hz + Math.sin(t * (7 + n)) * 18)) * 0.035, 0);
    return (bed + voices) * rise * fall;
  }),
  'out-stamp.wav': wav(0.46, (t, i) => {
    const hit = noise(i, 6) * Math.exp(-t * 34) * 0.45;
    const stamp = Math.sin(t * Math.PI * 2 * 92) * Math.exp(-t * 11) * 0.5;
    return hit + stamp;
  }),
};

export function exportAudio() {
  mkdirSync(OUT, { recursive: true });
  for (const [name, bytes] of Object.entries(sounds)) writeFileSync(join(OUT, name), bytes);
  return Object.entries(sounds).map(([name, bytes]) => ({ name, bytes: bytes.length }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = exportAudio();
  console.log(`wrote ${files.length} audio masters to ${OUT}`);
  for (const file of files) console.log(`  ${file.name} ${(file.bytes / 1024).toFixed(0)}KB`);
}
