// Pre-render the small reusable voice set. This maintainer tool uses macOS's
// installed English voices plus ffmpeg; the committed MP3s are the runtime
// contract, so players do not depend on their browser's voice inventory.

import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROSTER } from '../../src/data/characters.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', '..', 'public', 'v2', 'audio', 'voices');

export const COMMENTARY_LINES = {
  homer: { speaker: 'pip', text: 'It is gone! Home run!' },
  strikeoutSwinging: { speaker: 'pip', text: 'Swing and a miss! Strike three!' },
  strikeoutPitched: { speaker: 'rocco', text: 'Strike three. What a pitch.' },
  hitSafe: { speaker: 'pip', text: 'Base hit! Everybody is safe!' },
  outRace: { speaker: 'rocco', text: 'Got them at the bag!' },
  catch: { speaker: 'pip', text: 'Caught it! What a grab!' },
  walk: { speaker: 'rocco', text: 'Ball four. Take your base.' },
};

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${basename(command)} failed: ${result.stderr || result.stdout}`);
}

function render(temp, out, text, voice, rate) {
  const aiff = join(temp, `${basename(out, '.mp3')}.aiff`);
  run('/usr/bin/say', ['-v', voice, '-r', String(rate), '-o', aiff, text]);
  if (statSync(aiff).size <= 4096) {
    throw new Error(`say produced no audio for ${basename(out)}; run with access to the macOS speech service`);
  }
  run('ffmpeg', ['-loglevel', 'error', '-y', '-i', aiff, '-ac', '1', '-ar', '24000', '-b:a', '64k', out]);
  if (statSync(out).size < 4096) throw new Error(`ffmpeg produced an empty ${basename(out)}`);
}

export function exportVoices() {
  const temp = mkdtempSync(join(tmpdir(), 'recess-voices-'));
  const booth = join(OUT, 'commentary');
  const kids = join(OUT, 'kids');
  mkdirSync(booth, { recursive: true });
  mkdirSync(kids, { recursive: true });
  try {
    for (const [kind, line] of Object.entries(COMMENTARY_LINES)) {
      render(temp, join(booth, `${kind}.mp3`), line.text, line.speaker === 'pip' ? 'Eddy (English (US))' : 'Reed (English (US))', line.speaker === 'pip' ? 215 : 185);
    }
    ROSTER.forEach((kid, i) => {
      const feminine = kid.voiceGender === 'girl';
      const voices = feminine ? ['Sandy (English (US))', 'Shelley (English (US))'] : ['Eddy (English (US))', 'Reed (English (US))'];
      render(temp, join(kids, `${kid.id}.mp3`), kid.draftLine ?? kid.name, voices[i % voices.length], 196 + (i % 5) * 5);
    });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  return { commentary: Object.keys(COMMENTARY_LINES).length, kids: ROSTER.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = exportVoices();
  console.log(`wrote ${result.commentary} commentator calls and ${result.kids} kid lines to ${OUT}`);
}
