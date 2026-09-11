import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PlayState } from '../sim/play';
import type { RunnerState } from '../sim/runners';
import {
  PITCH_DELIVERY_RELEASE_SEC,
  PLAY_END_HOLD_SEC,
  SWING_PREROLL_SEC,
  TROT_FRACTION,
  cpuSwingCue,
  diveClip,
  homeRunTrot,
  playEndHoldSec,
  playEventCue,
  slideCue,
} from './actionCues';
import { FPS, clipSpec, framesToSec, markerLeadSec } from './clips';
import { beginPlay, stepPlay, type PlaySpec } from '../sim/play';
import type { LaunchSpec } from '../sim/launch';
import { PLAY } from '../sim/params';
import { VENUE_GEOMETRY, basePos, dist } from '../sim/field';
import { runnerPos } from '../sim/runners';
import { makeRng } from '../sim/rng';
import { autoAssign } from '../../systems/lineup';
import { ROSTER, getCharacter } from '../../data/characters';

/** A real play, stepped to its end — the fixture `play.test.ts` uses. */
function finished(launch: LaunchSpec, over: Partial<PlaySpec> = {}): PlayState {
  const plan = autoAssign(ROSTER.slice(0, 9).map((c) => c.id));
  const s = beginPlay(
    {
      launch,
      batter: ROSTER.find((c) => c.stats.speed === 5) ?? ROSTER[0],
      runners: [],
      defence: plan.positions,
      lookup: getCharacter,
      outs: 0,
      geo: VENUE_GEOMETRY.park,
      ...over,
    },
    makeRng('hold-tests')
  );
  const dt = 1 / 60;
  for (let n = 0; s.phase === 'live' && n < Math.ceil(PLAY.MAX_PLAY_SEC / dt) + 8; n++) stepPlay(s, dt);
  expect(s.phase).toBe('done');
  return s;
}

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
    expect(view, 'the play-end hold is wired, not decorative').toMatch(/playEndHoldSec\(/);
  });
});

describe('★ the play-end hold — a catch is longer than one frame', () => {
  it('holds a caught fly on the OUT tier', () => {
    const s = finished({ exitVelocityFts: 70, launchAngleDeg: 38, sprayDeg: 0, spinRpm: 1500, heightFt: 2.5 });
    expect(s.flyCaught).toBe(true);
    expect(s.heldBy, 'the play ends in a glove').not.toBeNull();
    expect(playEndHoldSec(s)).toBe(PLAY_END_HOLD_SEC.out);
  });

  it('holds a grounder retired at first on the OUT tier — the throw arrives and the play is over', () => {
    const s = finished({ exitVelocityFts: 45, launchAngleDeg: -2, sprayDeg: 0, spinRpm: -400, heightFt: 2.5 });
    expect(s.flyCaught).toBe(false);
    expect(s.outs).toBe(1);
    expect(s.events.some((e) => e.t === 'out'), 'the out is on the final tick').toBe(true);
    expect(playEndHoldSec(s)).toBe(PLAY_END_HOLD_SEC.out);
  });

  it('holds a ball into the gap on the SAFE tier, once the throw-in is held', () => {
    const s = finished({ exitVelocityFts: 95, launchAngleDeg: 22, sprayDeg: -13, spinRpm: 1800, heightFt: 2.5 });
    expect(s.outs).toBe(0);
    expect(s.heldBy).not.toBeNull();
    expect(playEndHoldSec(s)).toBe(PLAY_END_HOLD_SEC.safe);
  });

  it('cuts straight to the between beat on a foul, a loose ball, or a play still going', () => {
    const base = { phase: 'done', heldBy: 3, foul: false, homeRun: false, flyCaught: false, events: [] } as unknown as PlayState;
    expect(playEndHoldSec({ ...base, foul: true })).toBe(0);
    expect(playEndHoldSec({ ...base, heldBy: null })).toBe(0);
    expect(playEndHoldSec({ ...base, phase: 'live' })).toBe(0);
  });

  it('holds a homer for the trot, whoever is holding nothing', () => {
    const base = { phase: 'done', heldBy: null, foul: false, homeRun: true, flyCaught: false, events: [] } as unknown as PlayState;
    expect(playEndHoldSec(base)).toBe(PLAY_END_HOLD_SEC.homer);
    expect(PLAY_END_HOLD_SEC.homer).toBeGreaterThan(PLAY_END_HOLD_SEC.out);
  });

  it('★ trots every scorer home from where the sim left him, at his own pace, and no further', () => {
    const s = finished(
      { exitVelocityFts: 115, launchAngleDeg: 28, sprayDeg: 0, spinRpm: 2200, heightFt: 2.5 },
      { runners: [{ base: 1, char: ROSTER[3] }, { base: 3, char: ROSTER[4] }] }
    );
    expect(s.homeRun).toBe(true);
    const scorers = s.runners.filter((r) => r.done === 'scored');
    expect(scorers.length).toBe(3);

    const start = homeRunTrot(s, 0);
    expect(start.map((c) => c.characterId)).toEqual(scorers.map((r) => r.charId));
    for (const c of start) {
      const r = scorers.find((x) => x.charId === c.characterId)!;
      const p = runnerPos(r);
      expect(c.x, 'starts where the sim froze him').toBeCloseTo(p.x, 9);
      expect(c.z).toBeCloseTo(p.z, 9);
      expect(c.speedFts, 'his own sprint, scaled').toBeCloseTo(r.topFts * TROT_FRACTION, 9);
      expect(c.home).toBe(false);
    }

    // He covers exactly his trot's worth of ground every step until the
    // plate — never more, never idle — and stops there. (Straight-line
    // distance to home is NOT monotone on a lap: first to second runs away
    // from the plate, which is why this measures the ground covered.)
    let prev = start;
    for (let t = 0.25; t <= 30; t += 0.25) {
      const now = homeRunTrot(s, t);
      for (let i = 0; i < now.length; i++) {
        const moved = dist({ x: prev[i].x, z: prev[i].z }, { x: now[i].x, z: now[i].z });
        const stride = prev[i].speedFts * 0.25;
        expect(moved, 'never faster than his trot').toBeLessThanOrEqual(stride + 1e-6);
        // A step that turns a 90° corner at a bag shows a chord of at least
        // stride/√2; anything under that is a kid who stopped short.
        if (!now[i].home) expect(moved, 'never idle on the lap').toBeGreaterThanOrEqual(stride * 0.7 - 1e-6);
        if (prev[i].home) expect(now[i].home, 'nobody leaves the plate').toBe(true);
      }
      prev = now;
    }
    for (const c of homeRunTrot(s, 60)) {
      expect(c.home).toBe(true);
      expect(c.speedFts).toBe(0);
      expect(dist({ x: c.x, z: c.z }, basePos(4))).toBeLessThan(1e-9);
      expect(c.next).toEqual(basePos(4));
    }
    // The bag ahead is the trot's own, not the leg the sim froze: four
    // seconds in, the batter is round first and heading for second.
    const batter = homeRunTrot(s, 4)[2];
    expect(dist({ x: batter.x, z: batter.z }, basePos(1)), 'past first by four seconds').toBeGreaterThan(1);
    expect(batter.next).toEqual(basePos(2));
    // The runner from third is home first; the batter, with the longest lap,
    // last — at eight seconds a kid has trotted more than one leg and less
    // than three.
    const at = homeRunTrot(s, 8);
    expect(at.find((c) => c.characterId === ROSTER[4].id)!.home).toBe(true);
    expect(at[at.length - 1].home).toBe(false);
  });

  it('★ the OUT tier outlasts the catch clip, so the fielder is seen holding the ball', () => {
    // The clip is 20 frames with the marker at 8; the hold starts on the
    // marker. Shorter than what remains and the kid would still be mid-catch
    // at the cut, which is the 16ms failure in a longer coat.
    const remains = framesToSec(clipSpec('catch_chest').frames) - markerLeadSec('catch_chest');
    expect(PLAY_END_HOLD_SEC.out).toBeGreaterThan(remains);
    expect(PLAY_END_HOLD_SEC.safe).toBeGreaterThan(0);
    expect(PLAY_END_HOLD_SEC.safe, 'a safe ending must not out-hold an out').toBeLessThan(PLAY_END_HOLD_SEC.out);
  });
});
