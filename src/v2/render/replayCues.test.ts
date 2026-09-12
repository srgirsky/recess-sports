// ---------------------------------------------------------------------------
// The instant replay's pure half, against real seeded games.
//
// The classifier is folded tick by tick from the live generator the view
// pumps — never from a between frame, which carries none of the play's events
// — and the camera input is the bridge's own, so the bang-bang read is the one
// the live camera used. The snapshot ring is checked against the play cap
// that `runPlayLive` enforces, so a play the sim allows can never overflow it.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { simulateGameLive, type LiveFrame } from '../sim/game';
import { makeRng } from '../sim/rng';
import { PLAY } from '../sim/params';
import { ROSTER, getCharacter } from '../../data/characters';
import { cameraInputFor } from './bridge';
import {
  REPLAY,
  foldHighlights,
  isReplayWorthy,
  lerpSnapshot,
  newHighlights,
  replayCamera,
  type PlayHighlights,
  type ReplaySnapshot,
} from './replayCues';

const spec = () => ({
  away: { name: 'Rockets', ids: ROSTER.slice(0, 9).map((c) => c.id) },
  home: { name: 'Comets', ids: ROSTER.slice(9, 18).map((c) => c.id) },
  lookup: getCharacter,
});

/** Every play of a seeded game, folded the way `GameView.advance` folds it. */
function playsOf(seed: string): Array<{ h: PlayHighlights; ticks: number; outs: number; homer: boolean }> {
  const it = simulateGameLive(spec(), makeRng(seed));
  const plays: Array<{ h: PlayHighlights; ticks: number; outs: number; homer: boolean }> = [];
  let h = newHighlights();
  let ticks = 0;
  let r = it.next();
  let wasLive = false;
  while (!r.done) {
    const f = r.value as LiveFrame;
    if (f.phase === 'windup') {
      h = newHighlights();
      ticks = 0;
    }
    if (f.phase === 'live' && f.play) {
      foldHighlights(h, f.play, cameraInputFor(f));
      ticks++;
      wasLive = true;
    } else if (wasLive) {
      plays.push({ h, ticks, outs: h.outs, homer: h.homer });
      wasLive = false;
    }
    r = it.next();
  }
  return plays;
}

describe('which plays earn a replay', () => {
  const seeds = ['replay-a', 'replay-b', 'replay-c', 'replay-d'];
  const plays = seeds.flatMap(playsOf);

  it('folds real plays out of the live generator', () => {
    expect(plays.length).toBeGreaterThan(40);
  });

  it('never replays a homer — the trot and the fireworks own that beat', () => {
    for (const p of plays) if (p.homer) expect(isReplayWorthy(p.h)).toBe(false);
  });

  it('replays a double play', () => {
    const dp = plays.filter((p) => p.outs >= 2 && !p.homer);
    for (const p of dp) expect(isReplayWorthy(p.h)).toBe(true);
  });

  it('does not replay a routine play', () => {
    const routine = plays.filter((p) => p.outs <= 1 && !p.h.diveCatch && !p.h.carom && !p.h.bangBang);
    expect(routine.length).toBeGreaterThan(10);
    for (const p of routine) expect(isReplayWorthy(p.h)).toBe(false);
  });

  it('marks a catch as a dive-catch only by the fielder who dove', () => {
    const h = newHighlights();
    const play = (events: Array<Record<string, unknown>>, outs = 0) =>
      ({ events, outs, homeRun: false }) as never;
    foldHighlights(h, play([{ t: 'dive', fielder: 'a' }]), { phase: 'live' });
    foldHighlights(h, play([{ t: 'catch', fielder: 'b' }]), { phase: 'live' });
    expect(h.diveCatch).toBe(false);
    foldHighlights(h, play([{ t: 'catch', fielder: 'a' }]), { phase: 'live' });
    expect(h.diveCatch).toBe(true);
  });

  it('reads a bang-bang play off the camera input, inside its window', () => {
    const out = [{ t: 'out', base: 1, runner: 'x' }];
    const play = { events: out, outs: 1, homeRun: false } as never;
    const wide = newHighlights();
    foldHighlights(wide, play, { phase: 'live', bangBangSec: REPLAY.BANG_BANG_SEC + 0.1 });
    expect(wide.bangBang).toBe(false);
    const tight = newHighlights();
    foldHighlights(tight, play, { phase: 'live', bangBangSec: REPLAY.BANG_BANG_SEC });
    expect(tight.bangBang).toBe(true);
    expect(isReplayWorthy(tight)).toBe(true);
  });
});

describe('the tape', () => {
  it('holds the longest play the sim allows', () => {
    expect(REPLAY.MAX_FRAMES).toBeGreaterThanOrEqual(Math.ceil(PLAY.MAX_PLAY_SEC * 60));
  });

  const snap = (t: number, x: number, clip: 'run' | 'catch_chest', clipTime: number): ReplaySnapshot => ({
    t,
    ball: [x, 2 * x, 3 * x],
    actors: [{ id: 'k', x, z: -x, facing: x, visible: true, clip, clipTime, glove: true }],
    activeId: 'k',
    camera: { phase: 'live', ball: [x, 2 * x, 3 * x] },
  });

  it('interpolates continuous fields and snaps discrete ones', () => {
    const mid = lerpSnapshot(snap(0, 0, 'run', 0), snap(1, 10, 'run', 1), 0.25);
    expect(mid.t).toBeCloseTo(0.25);
    expect(mid.ball).toEqual([2.5, 5, 7.5]);
    expect(mid.actors[0].x).toBeCloseTo(2.5);
    expect(mid.actors[0].clipTime).toBeCloseTo(0.25);
    // A clip change snaps to the later frame and does not blend its time.
    const swap = lerpSnapshot(snap(0, 0, 'run', 0.8), snap(1, 10, 'catch_chest', 0.1), 0.5);
    expect(swap.actors[0].clip).toBe('catch_chest');
    expect(swap.actors[0].clipTime).toBe(0.1);
    expect(swap.actors[0].facing).toBe(10);
  });

  it('clamps the blend to the two frames it was given', () => {
    expect(lerpSnapshot(snap(0, 0, 'run', 0), snap(1, 10, 'run', 1), 2).ball[0]).toBe(10);
    expect(lerpSnapshot(snap(0, 0, 'run', 0), snap(1, 10, 'run', 1), -1).ball[0]).toBe(0);
  });

  it('re-frames the recorded cast with the same policy, cutting on its first frame', () => {
    const first = replayCamera(snap(0, 5, 'run', 0));
    expect(first.transition).toBe('cut');
    const next = replayCamera(snap(0.1, 6, 'run', 0.1), first);
    expect(next.transition).not.toBe('cut');
  });
});
