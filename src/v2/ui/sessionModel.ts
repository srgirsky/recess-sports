// ---------------------------------------------------------------------------
// What a playtest session added up to, decided purely. `sessionLog.ts` stores it.
//
// ★ THE SAME SPLIT AS `soundCues.ts`, FOR THE SAME REASON. A count that is
// wrong by one is invisible in a browser and obvious in a test fed a real game.
// So this is a fold over three streams the view already has — the sim's own
// `SimEvent`s, the scalar `Snapshot` `soundCues.snapshot` copies off each
// frame, and the input verbs `GameView.onInput` reports — and it never touches
// the DOM, the clock or storage.
//
// ★ WHAT IT COUNTS, AND WHY IT IS THIS AND NOT MORE. `docs/playtests/PROTOCOL.md`
// asks an observer to watch a child, not a spreadsheet. The log exists so that
// the observer's notes can be reconciled against what the game actually did —
// how many pitches the kid saw, how often they swung, how often they whiffed,
// how many outs they made in the field, how often they tapped each verb, and
// how long the session ran. Counts only; nothing here identifies a child.
//
// ★ SIDE COMES FROM `controlsAt`, NOT FROM THE FRAME. A `pitch` event does not
// say who was batting; the fold keeps the latest frame's `half` and asks
// `controlMode.ts` whose half it is, so "human-side" means exactly what the
// mode promised — the same function the view uses to route a tap.
//
// ⚠️ THE FRAME IS REUSED (see `LiveFrame`). This file takes `Snapshot`s, which
// are copies, and never a frame.
// ---------------------------------------------------------------------------

import type { SimEvent } from '../sim/game';
import type { Snapshot } from './soundCues';
import { controlsAt, type PlayerControlMode } from '../game/controlMode';

/** The verbs `GameView` reports, one per site that writes `PlayInputs`. */
export type InputVerb =
  /** A pointer-down on the field while a fielder is steerable. */
  | 'pointer'
  /** A drag continuing that steer. */
  | 'steer'
  | 'swing'
  | 'pitch'
  | 'throwTo'
  | 'dive'
  | 'sendRunner'
  | 'holdRunner';

export const INPUT_VERBS: ReadonlyArray<InputVerb> = Object.freeze([
  'pointer',
  'steer',
  'swing',
  'pitch',
  'throwTo',
  'dive',
  'sendRunner',
  'holdRunner',
] as const);

export interface SessionCounts {
  /** Every pitch thrown, either side. Reconciles with `GameResult.tally.pitches`. */
  pitches: number;
  /** The half-innings the person batted in. */
  humanBat: {
    pitchesSeen: number;
    swings: number;
    whiffs: number;
    hits: number;
    strikeouts: number;
    walks: number;
  };
  /** Outs recorded while the person was fielding, and while the CPU was. */
  humanField: { outs: number };
  cpuField: { outs: number };
  /** How often each verb was used. */
  taps: Record<InputVerb, number>;
  /** The last scoreboard seen. */
  score: { away: number; home: number };
  inning: number;
  half: 'top' | 'bottom';
}

export function emptySession(): SessionCounts {
  const taps = {} as Record<InputVerb, number>;
  for (const v of INPUT_VERBS) taps[v] = 0;
  return {
    pitches: 0,
    humanBat: { pitchesSeen: 0, swings: 0, whiffs: 0, hits: 0, strikeouts: 0, walks: 0 },
    humanField: { outs: 0 },
    cpuField: { outs: 0 },
    taps,
    score: { away: 0, home: 0 },
    inning: 1,
    half: 'top',
  };
}

/**
 * Fold one sim event. `half` is the latest frame's — the sim emits the event
 * synchronously inside the tick that resolves the pitch, before the next frame
 * is yielded, so the frame the view last saw is the half the pitch was thrown in.
 */
export function foldEvent(
  s: SessionCounts,
  e: SimEvent,
  mode: PlayerControlMode,
  half: 'top' | 'bottom'
): SessionCounts {
  const humanBats = controlsAt(mode, half).bat;
  if (e.t === 'pitch') {
    const humanBat = humanBats
      ? {
          ...s.humanBat,
          pitchesSeen: s.humanBat.pitchesSeen + 1,
          swings: s.humanBat.swings + (e.swung ? 1 : 0),
          whiffs: s.humanBat.whiffs + (e.kind === 'swingingStrike' ? 1 : 0),
        }
      : s.humanBat;
    return { ...s, pitches: s.pitches + 1, humanBat };
  }
  if (e.t === 'pa' && humanBats) {
    return {
      ...s,
      humanBat: {
        ...s.humanBat,
        hits: s.humanBat.hits + (e.result === 'hit' ? 1 : 0),
        strikeouts: s.humanBat.strikeouts + (e.result === 'k' ? 1 : 0),
        walks: s.humanBat.walks + (e.result === 'walk' ? 1 : 0),
      },
    };
  }
  return s;
}

/**
 * Fold one frame's scalars against the previous frame's.
 *
 * Only a RISE in `outs` is an out — `outs` resets to 0 on a new half, and the
 * sim yields the third-out frame (outs 3) before the half turns over, so every
 * out is seen as a rise exactly once. The side is the half the out happened
 * in, which is `next.half`: the rise and the half agree on the same frame.
 */
export function foldFrame(
  s: SessionCounts,
  prev: Snapshot | null,
  next: Snapshot,
  mode: PlayerControlMode
): SessionCounts {
  const rose = prev ? Math.max(0, next.outs - prev.outs) : next.outs;
  let out = s;
  if (rose > 0) {
    const humanFields = controlsAt(mode, next.half).field;
    out = humanFields
      ? { ...s, humanField: { outs: s.humanField.outs + rose } }
      : { ...s, cpuField: { outs: s.cpuField.outs + rose } };
  }
  if (
    out.score.away !== next.awayScore ||
    out.score.home !== next.homeScore ||
    out.inning !== next.inning ||
    out.half !== next.half
  ) {
    out = {
      ...out,
      score: { away: next.awayScore, home: next.homeScore },
      inning: next.inning,
      half: next.half,
    };
  }
  return out;
}

/** Fold one input verb. */
export function foldInput(s: SessionCounts, verb: InputVerb): SessionCounts {
  return { ...s, taps: { ...s.taps, [verb]: s.taps[verb] + 1 } };
}
