// ---------------------------------------------------------------------------
// npm run measure:audio
//
// ★ EVERY CLIP AT ONE LOUDNESS, AND NONE AT THE CEILING — AT PLAYBACK. Measured
// 2026-09-29 (ffmpeg ebur128): the thirty kid lines spread five decibels,
// -18.2 to -23.3 LUFS, so some kids shouted their draft line and others
// mumbled it; the glove pop peaked at -0.4 dBTP.
//
// The files are not rewritten. Six kid lines are AI-cast takes whose exact
// bytes a maintainer approved (`AI_VOICE_CAST.runtimeSha256`), every re-encode
// of an MP3 loses a generation, and a gain is reversible where a re-encode is
// not. So this measures each shipped clip and writes a per-clip playback gain
// to `src/v2/ui/audioLoudness.json`, which `RecordedAudio` applies as the
// element's volume. A volume can only attenuate, so the gain is never
// positive: voices louder than VOICE_LUFS come down to it, and any clip whose
// true peak passes PEAK_DBTP comes down under it. `audio-assets.test.js` holds
// the manifest to the shipped bytes and to the bar, so CI needs no ffmpeg.
// Re-run after `export:voices`, `generate:ai-voice` or `export:audio`.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const AUDIO = join(root, 'public', 'v2', 'audio');
const OUT = join(root, 'src', 'v2', 'ui', 'audioLoudness.json');
export const LOUDNESS = { voiceLufs: -21, peakDbtp: -1.5 };

function measure(path) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const tail = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(tail)?.[1]);
  const peak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(tail)?.[1]);
  if (!Number.isFinite(peak)) throw new Error(`could not measure ${path}`);
  return { lufs: lufs > -69 ? lufs : null, peak };
}

const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(wav|mp3)$/.test(e.name)) files.push(p);
  }
};
walk(AUDIO);

const round = (x) => Math.round(x * 10) / 10;
const manifest = { note: 'Written by scripts/v2/measure-audio.mjs; held by scripts/v2/audio-assets.test.js.', targets: LOUDNESS, files: {} };
for (const path of files.sort()) {
  const key = relative(AUDIO, path).split('\\').join('/');
  const voice = key.startsWith('voices/');
  const m = measure(path);
  const toTarget = voice && m.lufs !== null ? LOUDNESS.voiceLufs - m.lufs : 0;
  const gainDb = round(Math.min(0, toTarget, LOUDNESS.peakDbtp - m.peak));
  manifest.files[key] = {
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    lufs: m.lufs,
    peakDbtp: m.peak,
    voice,
    gainDb,
  };
  console.log(`${key.padEnd(40)} ${String(m.lufs).padStart(6)} LUFS ${String(m.peak).padStart(6)} dBTP  gain ${gainDb}`);
}
writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
