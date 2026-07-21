// ---------------------------------------------------------------------------
// Instant replay — PURE helpers. The scene records a position SNAPSHOT of the
// live play every tick (never inputs — the sim's rng is unseeded, so
// re-simulation would diverge) and plays the frames back through the same
// renderer at slow motion. The classifier decides which plays deserve it.
// ---------------------------------------------------------------------------

import type { LivePlayState } from './liveplay';
import type { Vec } from './geometry';

/** What the renderer needs per tick — positions and motion cues only. */
export interface ReplayFrame {
  t: number; // play-elapsed ms at capture
  ball: {
    pos: Vec;
    height: number;
    phase: LivePlayState['ball']['phase'];
    heldBy: number | null;
  };
  fielders: Array<{ pos: Vec; diving: boolean }>;
  runners: Array<{
    pos: Vec;
    from: number;
    to: number;
    progress: number;
    done: 'safe' | 'out' | 'scored' | null;
  }>;
}

/** Flags the scene collects from the play's event stream. */
export interface PlayHighlights {
  /** A dive happened earlier in this play (arming diveCatch). */
  sawDive: boolean;
  diveCatch: boolean; // a catch on a play with a dive
  outs: number; // outs recorded on the play (2+ = a genuine double play)
  carom: boolean; // the ball came off the fence
}

export function newHighlights(): PlayHighlights {
  return { sawDive: false, diveCatch: false, outs: 0, carom: false };
}

/** Does this play earn the 📼 treatment? */
export function isReplayWorthy(h: PlayHighlights): boolean {
  return h.diveCatch || h.outs >= 2 || h.carom;
}

/** Capture this tick. Small plain objects — a 9s play is ~550 frames. */
export function snapshotLive(s: LivePlayState): ReplayFrame {
  return {
    t: s.elapsed,
    ball: {
      pos: { ...s.ball.pos },
      height: s.ball.height,
      phase: s.ball.phase,
      heldBy: s.ball.heldBy,
    },
    fielders: s.fielders.map((f) => ({
      pos: { ...f.pos },
      diving: f.diveUntil !== undefined || f.diveDown === true,
    })),
    runners: s.runners.map((r) => ({
      pos: { ...r.pos },
      from: r.from,
      to: r.to,
      progress: r.progress,
      done: r.done,
    })),
  };
}

/**
 * Interpolate two snapshots for the guest renderer in two-device play:
 * frames arrive at NET.FRAME_HZ (20 Hz) and render at 60 fps. Numeric fields
 * (positions, height, progress, t) lerp; discrete fields (ball phase/holder,
 * diving, runner from/to/done) SNAP from `b` — at 20 Hz that is at most one
 * 50 ms frame early, and `done` must never lag its exit fade. Array items
 * missing from either frame snap from `b`.
 */
export function lerpFrames(a: ReplayFrame, b: ReplayFrame, t01: number): ReplayFrame {
  const k = Math.min(1, Math.max(0, t01));
  const num = (x: number, y: number) => x + (y - x) * k;
  const vec = (x: Vec, y: Vec): Vec => ({ x: num(x.x, y.x), y: num(x.y, y.y) });
  return {
    t: num(a.t, b.t),
    ball: {
      pos: vec(a.ball.pos, b.ball.pos),
      height: num(a.ball.height, b.ball.height),
      phase: b.ball.phase,
      heldBy: b.ball.heldBy,
    },
    fielders: b.fielders.map((bf, i) => {
      const af = a.fielders[i];
      return { pos: af ? vec(af.pos, bf.pos) : { ...bf.pos }, diving: bf.diving };
    }),
    runners: b.runners.map((br, i) => {
      const ar = a.runners[i];
      return {
        pos: ar ? vec(ar.pos, br.pos) : { ...br.pos },
        from: br.from,
        to: br.to,
        progress: ar ? num(ar.progress, br.progress) : br.progress,
        done: br.done,
      };
    }),
  };
}

/**
 * Write a frame's positions back into the live state so the ordinary renderer
 * draws it. The LAST frame restores the true end-of-play state exactly, so
 * settling after playback folds the correct outcome.
 */
export function applyFrame(s: LivePlayState, f: ReplayFrame): void {
  s.ball.pos = { ...f.ball.pos };
  s.ball.height = f.ball.height;
  s.ball.phase = f.ball.phase;
  s.ball.heldBy = f.ball.heldBy;
  f.fielders.forEach((snap, i) => {
    const fielder = s.fielders[i];
    if (!fielder) return;
    fielder.pos = { ...snap.pos };
    fielder.diveDown = snap.diving;
    fielder.diveUntil = undefined;
  });
  f.runners.forEach((snap, i) => {
    const r = s.runners[i];
    if (!r) return;
    r.pos = { ...snap.pos };
    r.from = snap.from as typeof r.from;
    r.to = snap.to as typeof r.to;
    r.progress = snap.progress;
    r.done = snap.done;
  });
}
