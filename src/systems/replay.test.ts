// ---------------------------------------------------------------------------
// Replay helpers — first dedicated coverage: snapshot/apply round trips
// through a real stepped play, plus lerpFrames (the 20 Hz → 60 fps guest
// interpolator for two-device play). Pure, headless, house fixture style.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { resolveLiveParams } from './mode';
import { startLivePlay, stepLivePlay, type LivePlayState } from './liveplay';
import type { Launch } from './atbat';
import type { PositionId } from './geometry';
import {
  snapshotLive,
  applyFrame,
  lerpFrames,
  newHighlights,
  isReplayWorthy,
  type ReplayFrame,
} from './replay';

const POSITIONS: PositionId[] = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
const DEFENSE = POSITIONS.map((p, i) => ({ position: p, charId: `f${i}`, speed: 5, glove: 5, arm: 5 }));

const flyToCenter: Launch = {
  type: 'fly',
  landing: { x: 480, y: 240 },
  hangMs: 1200,
  rollSpeed: 350,
  homer: false,
};

function freshPlay(): LivePlayState {
  return startLivePlay({
    mode: 'defense',
    launch: flyToCenter,
    batter: { charId: 'batter', speed: 6 },
    baseRunners: [{ base: 1, charId: 'runner1', speed: 7 }],
    defense: DEFENSE,
    outs: 0,
    params: resolveLiveParams('kid'), // kid params: rng-free, byte-stable
  });
}

/** Step a play N ticks recording a frame per tick (what the scene does). */
function recordFrames(s: LivePlayState, ticks: number): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  for (let i = 0; i < ticks && s.phase !== 'done'; i++) {
    s = stepLivePlay(s, {}, 50, resolveLiveParams('kid'), () => 0.5);
    frames.push(snapshotLive(s));
  }
  return frames;
}

describe('snapshotLive / applyFrame', () => {
  it('applying a recorded frame restores those positions exactly', () => {
    const s = freshPlay();
    const frames = recordFrames(s, 30);
    expect(frames.length).toBeGreaterThan(12);
    const target = frames[10];
    const fresh = freshPlay();
    applyFrame(fresh, target);
    expect(fresh.ball.pos).toEqual(target.ball.pos);
    expect(fresh.ball.height).toBe(target.ball.height);
    expect(fresh.ball.phase).toBe(target.ball.phase);
    expect(fresh.ball.heldBy).toBe(target.ball.heldBy);
    fresh.fielders.forEach((f, i) => expect(f.pos).toEqual(target.fielders[i].pos));
    fresh.runners.forEach((r, i) => {
      expect(r.pos).toEqual(target.runners[i].pos);
      expect(r.progress).toBe(target.runners[i].progress);
      expect(r.done).toBe(target.runners[i].done);
    });
  });

  it('snapshots are deep copies — later sim steps cannot mutate them', () => {
    let s = freshPlay();
    s = stepLivePlay(s, {}, 50, resolveLiveParams('kid'), () => 0.5);
    const frame = snapshotLive(s);
    const before = JSON.stringify(frame);
    for (let i = 0; i < 20; i++) s = stepLivePlay(s, {}, 50, resolveLiveParams('kid'), () => 0.5);
    expect(JSON.stringify(frame)).toBe(before);
  });

  it('applyFrame tolerates a frame with fewer entries than the state', () => {
    const s = freshPlay();
    const frame = snapshotLive(s);
    frame.fielders = frame.fielders.slice(0, 3);
    frame.runners = [];
    expect(() => applyFrame(s, frame)).not.toThrow();
  });
});

describe('lerpFrames', () => {
  const mk = (t: number, x: number, progress: number): ReplayFrame => ({
    t,
    ball: { pos: { x, y: 100 + x }, height: x / 1000, phase: 'flight', heldBy: null },
    fielders: [{ pos: { x: x + 10, y: 50 }, diving: false }],
    runners: [{ pos: { x: x + 20, y: 60 }, from: 0, to: 1, progress, done: null }],
  });

  it('t=0 matches a numerically; t=1 matches b', () => {
    const a = mk(1000, 100, 0.2);
    const b = mk(1050, 200, 0.4);
    const at0 = lerpFrames(a, b, 0);
    expect(at0.t).toBe(1000);
    expect(at0.ball.pos.x).toBe(100);
    expect(at0.runners[0].progress).toBeCloseTo(0.2);
    const at1 = lerpFrames(a, b, 1);
    expect(at1.t).toBe(1050);
    expect(at1.ball.pos.x).toBe(200);
    expect(at1.fielders[0].pos.x).toBe(210);
    expect(at1.runners[0].progress).toBeCloseTo(0.4);
  });

  it('midpoint math lerps every numeric field', () => {
    const a = mk(1000, 100, 0.2);
    const b = mk(1050, 200, 0.4);
    const mid = lerpFrames(a, b, 0.5);
    expect(mid.t).toBe(1025);
    expect(mid.ball.pos.x).toBe(150);
    expect(mid.ball.pos.y).toBe(250);
    expect(mid.ball.height).toBeCloseTo(0.15);
    expect(mid.fielders[0].pos.x).toBe(160);
    expect(mid.runners[0].pos.x).toBe(170);
    expect(mid.runners[0].progress).toBeCloseTo(0.3);
  });

  it('clamps t01 outside [0,1]', () => {
    const a = mk(1000, 100, 0.2);
    const b = mk(1050, 200, 0.4);
    expect(lerpFrames(a, b, -0.5).ball.pos.x).toBe(100);
    expect(lerpFrames(a, b, 1.5).ball.pos.x).toBe(200);
  });

  it('discrete fields snap from b (phase, holder, diving, done never lag)', () => {
    const a = mk(1000, 100, 0.2);
    const b = mk(1050, 200, 0.9);
    b.ball.phase = 'held';
    b.ball.heldBy = 4;
    b.fielders[0].diving = true;
    b.runners[0].done = 'out';
    const mid = lerpFrames(a, b, 0.25);
    expect(mid.ball.phase).toBe('held');
    expect(mid.ball.heldBy).toBe(4);
    expect(mid.fielders[0].diving).toBe(true);
    expect(mid.runners[0].done).toBe('out');
  });

  it('items missing from a snap from b (a late-added batter-runner)', () => {
    const a = mk(1000, 100, 0.2);
    const b = mk(1050, 200, 0.4);
    b.runners.push({ pos: { x: 700, y: 500 }, from: 0, to: 1, progress: 0.1, done: null });
    const mid = lerpFrames(a, b, 0.5);
    expect(mid.runners).toHaveLength(2);
    expect(mid.runners[1].pos).toEqual({ x: 700, y: 500 });
    expect(mid.runners[1].progress).toBe(0.1);
  });

  it('interpolated frames applyFrame cleanly onto a live state', () => {
    const s = freshPlay();
    const frames = recordFrames(s, 20);
    const mid = lerpFrames(frames[5], frames[6], 0.4);
    const fresh = freshPlay();
    expect(() => applyFrame(fresh, mid)).not.toThrow();
    expect(fresh.ball.pos.x).toBeCloseTo(
      frames[5].ball.pos.x + (frames[6].ball.pos.x - frames[5].ball.pos.x) * 0.4
    );
  });
});

describe('highlights classifier (piggyback coverage)', () => {
  it('worthy: dive-catch, 2+ outs, or a carom', () => {
    expect(isReplayWorthy(newHighlights())).toBe(false);
    expect(isReplayWorthy({ ...newHighlights(), diveCatch: true })).toBe(true);
    expect(isReplayWorthy({ ...newHighlights(), outs: 2 })).toBe(true);
    expect(isReplayWorthy({ ...newHighlights(), carom: true })).toBe(true);
    expect(isReplayWorthy({ ...newHighlights(), outs: 1, sawDive: true })).toBe(false);
  });
});
