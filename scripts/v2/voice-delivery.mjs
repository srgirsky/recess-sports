// ---------------------------------------------------------------------------
// Technical intake for roster voice masters, human-performed or locally
// generated from an approved stock AI voice.
//
// The system-voice exporter is a stable runtime fallback, not a casting path.
// Production delivers lossless masters to `assets/v2/voice-delivery/kids/`; this
// check catches the cheap round trips (wrong kid id, stereo, compressed audio,
// wrong sample rate/bit depth, or an implausibly short/long take) before anyone
// reviews acting. It never writes shipping audio.
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROSTER } from '../../src/data/characters.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const VOICE_DELIVERY_DIR = join(here, '..', '..', 'assets', 'v2', 'voice-delivery', 'kids');

export function voiceMasterPath(id) {
  return join(VOICE_DELIVERY_DIR, `${id}.wav`);
}

/** Pure rule layer, kept separate so the contract does not depend on ffprobe. */
export function checkVoiceProbe(id, probe) {
  const stream = probe.streams?.[0] ?? {};
  const duration = Number(probe.format?.duration ?? stream.duration);
  const bits = Number(stream.bits_per_raw_sample || stream.bits_per_sample);
  const issues = [];
  if (stream.codec_name !== 'pcm_s24le') issues.push(`${id}: codec is ${stream.codec_name ?? 'unknown'}, expected 24-bit PCM WAV`);
  if (Number(stream.sample_rate) !== 48_000) issues.push(`${id}: sample rate is ${stream.sample_rate ?? 'unknown'}, expected 48000 Hz`);
  if (Number(stream.channels) !== 1) issues.push(`${id}: ${stream.channels ?? 'unknown'} channels, expected mono`);
  if (bits !== 24) issues.push(`${id}: bit depth is ${bits || 'unknown'}, expected 24`);
  if (!Number.isFinite(duration) || duration < 0.3 || duration > 8) {
    issues.push(`${id}: duration is ${Number.isFinite(duration) ? `${duration.toFixed(2)}s` : 'unknown'}, expected 0.3–8.0s`);
  }
  return issues;
}

export function probeVoiceMaster(path) {
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_name,sample_rate,channels,bits_per_sample,bits_per_raw_sample,duration:format=duration',
      '-of',
      'json',
      path,
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'ffprobe failed');
  return JSON.parse(result.stdout);
}

export function validateVoiceMasters(ids, probe = probeVoiceMaster) {
  const roster = new Set(ROSTER.map((character) => character.id));
  const issues = [];
  for (const id of ids) {
    if (!roster.has(id)) {
      issues.push(`${id}: not a roster id`);
      continue;
    }
    const path = voiceMasterPath(id);
    if (!existsSync(path)) {
      issues.push(`${id}: missing ${path}`);
      continue;
    }
    try {
      issues.push(...checkVoiceProbe(id, probe(path)));
    } catch (error) {
      issues.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return issues;
}

function main() {
  const requested = process.argv.slice(2);
  const ids = requested.length ? requested : ROSTER.map((character) => character.id);
  const issues = validateVoiceMasters(ids);
  if (issues.length) {
    console.error(issues.map((issue) => `✗ ${issue}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${ids.length}/${ids.length} voice master${ids.length === 1 ? '' : 's'} ready for acting review`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
