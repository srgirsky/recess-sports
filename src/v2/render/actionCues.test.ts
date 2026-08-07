import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PlayState } from '../sim/play';
import type { RunnerState } from '../sim/runners';
import {
  PITCH_DELIVERY_RELEASE_SEC,
  SWING_PREROLL_SEC,
  cpuSwingCue,
  diveClip,
  playEventCue,
  slideCue,
} from './actionCues';
import { FPS, clipSpec, framesToSec, markerLeadSec } from './clips';

describe('action choreography', () => {
  it('derives the pitch release from the clip chain', () => {
    expect(PITCH_DELIVERY_RELEASE_SEC).toBe(
      framesToSec(clipSpec('pitch_windup').frames) +
        framesToSec(clipSpec('pitch_stride').frames) +
        markerLeadSec('pitch_release')
    );
  });

  it('starts a CPU swing exactly one authored pre-roll before its instant', () => {
    expect(cpuSwingCue('batter', 0.5, 0.5 + SWING_PREROLL_SEC + 1 / FPS, false)).toBeNull();
    const cue = cpuSwingCue('batter', 0.5, 0.5 + SWING_PREROLL_SEC, false)!;
    expect(cue.characterId).toBe('batter');
    expect(cue.clip).toBe('swing_contact');
    expect(cue.secUntilEvent).toBeCloseTo(SWING_PREROLL_SEC, 12);
    expect(cpuSwingCue('batter', 0.5, 0.6, true)).toBeNull();
  });

  it('maps field facts to marker clips without inventing an outcome', () => {
    const play = {
      ball: { p: { x: -4 } },
      fielders: [{ charId: 'glove', p: { x: 2 } }],
    } as PlayState;
    expect(diveClip(play, 'glove')).toBe('dive_left');
    expect(playEventCue({ t: 'catch', fielder: 'glove' }, play)).toEqual({
      characterId: 'glove', clip: 'catch_chest', secUntilEvent: 0,
    });
    expect(playEventCue({ t: 'throw', fielder: 'glove', toBase: 2 }, play)).toEqual({
      characterId: 'glove', clip: 'throw_overhand', secUntilEvent: 0,
    });
    expect(playEventCue({ t: 'safe', runner: 'runner', base: 2 }, play)).toBeNull();
  });

  it('fits one slide to the end of an advancing leg', () => {
    const runner = {
      charId: 'speedy', done: null, from: 1, to: 2,
      alongFt: 56, legFt: 60, speedFts: 12, touchedAtSec: 3,
    } as RunnerState;
    const cue = slideCue(runner)!;
    expect(cue.key).toBe('speedy:1->2:3');
    expect(cue.rate).toBeGreaterThan(1);
    expect(slideCue({ ...runner, from: 0, to: 1 } as RunnerState)).toBeNull();
    expect(slideCue({ ...runner, from: 2, to: 1 } as RunnerState)).toBeNull();
  });

  it('is called by the live game rather than remaining a review-page feature', () => {
    const view = readFileSync(new URL('../game/GameView.ts', import.meta.url), 'utf8');
    expect(view).toMatch(/PITCH_DELIVERY_RELEASE_SEC/);
    expect(view).toMatch(/cpuSwingCue\(/);
    expect(view).toMatch(/playEventCue\(/);
    expect(view).toMatch(/slideCue\(/);
    expect(view).toMatch(/\.playToMarker\(/);
  });
});
