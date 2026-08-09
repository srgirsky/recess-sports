import { describe, expect, it } from 'vitest';
import { RECORDED_COMMENTARY, RECORDED_CUE_FILES } from './RecordedAudio';

describe('recorded audio bank', () => {
  it('gives every audible gameplay cue a stable asset', () => {
    expect(Object.keys(RECORDED_CUE_FILES).sort()).toEqual(
      ['call:strike', 'cheer', 'crack', 'out', 'pop', 'whiff', 'woosh'].sort()
    );
  });

  it('keeps assets under the v2 audio root', () => {
    for (const file of Object.values(RECORDED_CUE_FILES)) expect(file).toMatch(/^[a-z-]+\.wav$/);
  });

  it('records every commentator moment the v2 cue policy emits', () => {
    expect([...RECORDED_COMMENTARY].sort()).toEqual(
      ['homer', 'strikeoutSwinging', 'strikeoutPitched', 'hitSafe', 'outRace', 'catch', 'walk'].sort()
    );
  });
});
