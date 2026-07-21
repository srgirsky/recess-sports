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
