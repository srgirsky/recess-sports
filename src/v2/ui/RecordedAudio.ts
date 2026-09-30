// Stable v2 audio assets with the shared synthesiser as fallback. The cue map
// remains in `soundCues.ts`; this module only decides file-or-synth playback.

import { isMuted } from '../../systems/audio';
import { assetUrl } from '../render/assets';
import type { Cue } from './soundCues';
import type { AnnounceKind } from '../../systems/announcer';
import loudness from './audioLoudness.json';

/**
 * The element volume that plays `file` at the measured loudness bar
 * (`scripts/v2/measure-audio.mjs`): 1 for a clip that needs nothing, less for
 * a voice louder than the target or a clip near the ceiling. Never above 1.
 */
export function playbackVolume(file: string): number {
  const row = (loudness.files as Record<string, { gainDb: number } | undefined>)[file];
  return row ? Math.min(1, 10 ** (row.gainDb / 20)) : 1;
}

export const RECORDED_CUE_FILES: Partial<Record<Cue, string>> = {
  woosh: 'pitch-woosh.wav',
  crack: 'bat-crack.wav',
  whiff: 'swing-whiff.wav',
  pop: 'glove-pop.wav',
  cheer: 'crowd-cheer.wav',
  'call:strike': 'glove-pop.wav',
  out: 'out-stamp.wav',
};

export const RECORDED_COMMENTARY: ReadonlyArray<AnnounceKind> = [
  'homer',
  'strikeoutSwinging',
  'strikeoutPitched',
  'hitSafe',
  'outRace',
  'catch',
  'walk',
];

export class RecordedAudio {
  play(cue: Cue, fallback: () => void): void {
    const file = RECORDED_CUE_FILES[cue];
    if (file) this.playFile(file, fallback);
    else fallback();
  }

  playCommentary(kind: AnnounceKind, fallback: () => void): void {
    if (!RECORDED_COMMENTARY.includes(kind)) {
      fallback();
      return;
    }
    this.playFile(`voices/commentary/${kind}.mp3`, fallback);
  }

  playKid(id: string, fallback: () => void): void {
    this.playFile(`voices/kids/${id}.mp3`, fallback);
  }

  private playFile(file: string, fallback: () => void): void {
    if (isMuted() || typeof Audio === 'undefined') return fallback();
    const clip = new Audio(assetUrl(`audio/${file}`));
    clip.volume = playbackVolume(file);
    void clip.play().catch(fallback);
  }
}
