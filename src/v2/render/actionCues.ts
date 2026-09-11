// ---------------------------------------------------------------------------
// Pure choreography decisions between the live sim and AnimationDirector.
//
// The sim owns every instant and position. This module only answers which
// existing clip should make that fact visible, and how its authored timing is
// warped onto the fact. Keeping the decisions pure makes the live call sites
// testable without a mixer or DOM.
// ---------------------------------------------------------------------------

import type { PlayEvent, PlayState } from '../sim/play';
import { runnerPos, type RunnerState } from '../sim/runners';
import { basePos, dist } from '../sim/field';
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
 * Three tiers, because the endings differ. An OUT is the payoff of the whole
 * chase and reads with the callout over the frozen catch, so it holds past
 * the catch clip's own length (20 frames, marker at 8). A SAFE ending — the
 * throw-in after a single — holds long enough for the runner to be seen on
 * his bag and not long enough to slow a two-inning game. A HOMER holds for
 * the trot (`homeRunTrot` below): the sim scores everybody the instant the
 * ball clears the fence, so without a hold the runners never round the
 * bases at all. A foul and a play that ran out the clock end with nobody
 * holding the ball and cut.
 */
export const PLAY_END_HOLD_SEC = { out: 1.2, safe: 0.6, homer: 6 } as const;

export function playEndHoldSec(play: PlayState): number {
  if (play.phase !== 'done' || play.foul) return 0;
  if (play.homeRun) return PLAY_END_HOLD_SEC.homer;
  if (play.heldBy === null) return 0;
  // The last thing that happened, read off the final tick's own events: a
  // play that recorded an out at first and then waited for a runner to reach
  // third ends on the runner, not the out.
  const out = play.flyCaught || play.events.some((e) => e.t === 'out');
  return out ? PLAY_END_HOLD_SEC.out : PLAY_END_HOLD_SEC.safe;
}

/**
 * A home-run trot is this fraction of the kid's own sprint. His `topFts` is
 * the ONE kid speed (`athletes.ts`); this scales it for a lap nobody is
 * racing, and it lives here because it is choreography, not a sim quantity.
 */
export const TROT_FRACTION = 0.75;

export interface TrotCue {
  characterId: string;
  x: number;
  z: number;
  /** Radians, the same convention as `KidView.setFacing`. */
  facing: number;
  /** Zero once he has touched the plate. */
  speedFts: number;
  /** The bag he is trotting toward; the plate once he is on it. */
  next: { x: number; z: number };
  home: boolean;
}

/**
 * Where each scoring runner is, `elapsedSec` into the home-run hold.
 *
 * ★ RENDER-ONLY CHOREOGRAPHY FOR A PLAY THAT IS ALREADY OVER. `checkTermination`
 * marks every runner `scored` and ends the play the tick the ball leaves the
 * park, so the sim has no trot to draw; BB2026 shows one. Each runner starts
 * exactly where the sim left him (`runnerPos`, which still reads a scored
 * runner's leg) and follows the remaining bags home at his own trot. Nothing
 * here is written back: the bridge positions kids from these cues the way it
 * positions them from a live play, and the finished `PlayState` is untouched.
 *
 * ★ THE HOLD IS FIXED AND THE SPEEDS ARE REAL, so a batter who homered from
 * the box does not reach the plate inside it — a full lap at a kid's trot is
 * over twenty seconds, and "short games" is a pillar. Six seconds is sized
 * so a runner from third gets home and the batter rounds first with the
 * camera on him; the between beat then finds him at the plate for his
 * cheer, which is the same cut every other ending makes.
 */
export function homeRunTrot(play: PlayState, elapsedSec: number): TrotCue[] {
  const cues: TrotCue[] = [];
  for (const r of play.runners) {
    if (r.done !== 'scored') continue;
    const speed = r.topFts * TROT_FRACTION;
    let budget = Math.max(0, elapsedSec) * speed;
    // The path home: from where he stands, through every bag still ahead.
    let at = runnerPos(r);
    const firstAhead = r.to === r.from ? r.from + 1 : r.to;
    const waypoints: Array<{ x: number; z: number }> = [];
    for (let b = firstAhead; b <= 4; b++) waypoints.push(basePos(b));
    let facing = r.to === r.from ? 0 : Math.atan2(basePos(r.to).x - at.x, basePos(r.to).z - at.z);
    let home = waypoints.length === 0;
    let next = basePos(4);
    for (const w of waypoints) {
      const leg = dist(at, w);
      facing = Math.atan2(w.x - at.x, w.z - at.z);
      next = w;
      if (budget < leg) {
        const f = leg > 0 ? budget / leg : 1;
        at = { x: at.x + (w.x - at.x) * f, z: at.z + (w.z - at.z) * f };
        budget = 0;
        break;
      }
      budget -= leg;
      at = { x: w.x, z: w.z };
      if (w === waypoints[waypoints.length - 1]) home = true;
    }
    cues.push({ characterId: r.charId, x: at.x, z: at.z, facing, speedFts: home ? 0 : speed, next, home });
  }
  return cues;
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
