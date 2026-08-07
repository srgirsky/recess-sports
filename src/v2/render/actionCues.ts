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
