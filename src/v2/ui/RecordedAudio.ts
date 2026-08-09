// Stable v2 audio assets with the shared synthesiser as fallback. The cue map
// remains in `soundCues.ts`; this module only decides file-or-synth playback.

import { isMuted } from '../../systems/audio';
import { assetUrl } from '../render/assets';
import type { Cue } from './soundCues';
import type { AnnounceKind } from '../../systems/announcer';

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
    void new Audio(assetUrl(`audio/${file}`)).play().catch(fallback);
  }
}
