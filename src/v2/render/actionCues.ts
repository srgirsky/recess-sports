// ---------------------------------------------------------------------------
// Pure choreography decisions between the live sim and AnimationDirector.
//
// The sim owns every instant and position. This module only answers which
// existing clip should make that fact visible, and how its authored timing is
// warped onto the fact. Keeping the decisions pure makes the live call sites
// testable without a mixer or DOM.
// ---------------------------------------------------------------------------

import type { PlayEvent, PlayState } from '../sim/play';
import type { RunnerState } from '../sim/runners';
import {
  WARP_MAX_RATE,
  clipSpec,
  framesToSec,
  markerLeadSec,
  type AnimName,
} from './clips';

export interface ActionCue {
  characterId: string;
  clip: AnimName;
  /** Zero means the sim event is on this tick and the director seeks its marker. */
  secUntilEvent: number;
}

/** The full delivery from windup frame zero to the ball leaving the hand. */
export const PITCH_DELIVERY_RELEASE_SEC =
  framesToSec(clipSpec('pitch_windup').frames) +
  framesToSec(clipSpec('pitch_stride').frames) +
  markerLeadSec('pitch_release');

/** Do not slow a swing from pitch release; start at its authored pre-roll. */
export const SWING_PREROLL_SEC = markerLeadSec('swing_contact');

/**
 * How long the view holds a finished play's last picture before the between
 * cut, seconds, by how the play ended. Zero means cut now.
 *
 * ★ A PLAY THAT ENDS IN A GLOVE ENDS IN THE SAME SIM STEP AS THE CATCH. The
 * reducer's tick order emits `playOver` with the final out, so the sim yields
 * exactly ONE live frame with the ball gloved and the next frame is `between`,
 * where the camera eases to the plate and the defence resets to its posts. On
 * screen that was a 16ms catch, and the fielder who made it was never seen
 * holding the ball. BB2026 holds on its catches (`docs/research/
 * backyard-2026-reference.md`, the 2026-09-01 instrument note).
 *
 * ★ AND THE HOLD IS THE VIEW'S, NEVER THE SIM'S. Settle frames yielded after
 * the final out would put a feel constant inside the one implementation the
 * headless harness drains, and the play reducer's step order is load-bearing
 * (`src/v2/AGENTS.md` § The play). The view already owns every other beat —
 * `BETWEEN_SEC`, `HALF_BREAK_SEC`, the visible delivery — so it owns this one:
 * it keeps painting the finished `PlayState`, which the sim never touches
 * again, and only then starts the between beat.
 *
 * Two tiers, because the verdicts differ. An OUT is the payoff of the whole
 * chase and reads with the callout over the frozen catch, so it holds past
 * the catch clip's own length (20 frames, marker at 8). A SAFE ending — the
 * throw-in after a single — holds long enough for the runner to be seen on
 * his bag and not long enough to slow a two-inning game. A foul, a homer and
 * a play that ran out the clock end with nobody holding the ball: the foul
 * cuts, and the homer has its own staging (the camera cue, fireworks, the
 * reactions).
 */
export const PLAY_END_HOLD_SEC = { out: 1.2, safe: 0.6 } as const;

export function playEndHoldSec(play: PlayState): number {
  if (play.phase !== 'done' || play.heldBy === null || play.foul || play.homeRun) return 0;
  // The last thing that happened, read off the final tick's own events: a
  // play that recorded an out at first and then waited for a runner to reach
  // third ends on the runner, not the out.
  const out = play.flyCaught || play.events.some((e) => e.t === 'out');
  return out ? PLAY_END_HOLD_SEC.out : PLAY_END_HOLD_SEC.safe;
}

export function cpuSwingCue(
  batterId: string,
  pitchElapsedSec: number,
  swingAtSec: number | null,
  started: boolean
): ActionCue | null {
  if (started || swingAtSec === null) return null;
  const left = swingAtSec - pitchElapsedSec;
  // The authored lead is 7/30s; subtracting it from an accumulated clock can
  // land a few ulps above the same value. Do not lose the one exact trigger
  // frame to representation noise.
  if (left - SWING_PREROLL_SEC > 1e-9) return null;
  return {
    characterId: batterId,
    clip: 'swing_contact',
    secUntilEvent: Math.max(0, left),
  };
}

/** World-left/world-right is enough for the proxy's readable lateral dive. */
export function diveClip(play: PlayState, fielderId: string): AnimName {
  const fielder = play.fielders.find((f) => f.charId === fielderId);
  if (!fielder) return 'dive_left';
  return play.ball.p.x < fielder.p.x ? 'dive_left' : 'dive_right';
}

/** Events whose physical instant is known only on the tick it happens. */
export function playEventCue(event: PlayEvent, _play: PlayState): ActionCue | null {
  switch (event.t) {
    case 'catch':
      return { characterId: event.fielder, clip: 'catch_chest', secUntilEvent: 0 };
    case 'pickup':
      return { characterId: event.fielder, clip: 'field_scoop', secUntilEvent: 0 };
    case 'throw':
    case 'relay':
      return { characterId: event.fielder, clip: 'throw_overhand', secUntilEvent: 0 };
    default:
      return null;
  }
}

export interface SlideCue {
  characterId: string;
  clip: 'slide';
  rate: number;
  /** Identifies one directed leg; a runner may slide again on a later leg. */
  key: string;
}

/**
 * Start the slide as late as the clip contract permits, then fit its end to the
 * bag. The sim keeps moving the root; this clip only lowers and extends the kid.
 */
export function slideCue(runner: RunnerState): SlideCue | null {
  if (
    runner.done !== null ||
    runner.to <= runner.from ||
    runner.to < 2 ||
    runner.legFt <= 0 ||
    runner.speedFts <= 0
  ) {
    return null;
  }
  const leftFt = Math.max(0, runner.legFt - runner.alongFt);
  const leftSec = leftFt / runner.speedFts;
  const durationSec = framesToSec(clipSpec('slide').frames);
  if (leftSec > durationSec / WARP_MAX_RATE) return null;
  return {
    characterId: runner.charId,
    clip: 'slide',
    rate: Math.min(WARP_MAX_RATE, durationSec / Math.max(leftSec, 1 / 60)),
    key: `${runner.charId}:${runner.from}->${runner.to}:${runner.touchedAtSec}`,
  };
}
