// ---------------------------------------------------------------------------
// Pure policy for the two pieces of field chrome that make a live play legible:
// the ball's ground shadow and the player-controlled fielder ring.
//
// BB2026 never asks the player to infer a fly ball's depth from perspective
// alone, and it always marks the kid receiving fielding input. These cues are
// deliberately render-only: they reveal facts the sim already owns and cannot
// change a catch, route, bounce or input tolerance.
// ---------------------------------------------------------------------------

export type BallCuePhase = 'windup' | 'pitch' | 'live' | 'between';

export interface CuePoint3 {
  x: number;
  y: number;
  z: number;
}

export interface GroundCue {
  visible: boolean;
  x: number;
  z: number;
  /** Uniform mesh scale. The geometry owns the cue's base size. */
  scale: number;
}

/** Above this height the shadow has reached its largest readable footprint. */
export const SHADOW_MAX_HEIGHT_FT = 72;
/** A high fly may grow, but never into a fake landing-zone assist. */
export const SHADOW_MAX_SCALE = 2.6;

export function ballShadowCue(point: CuePoint3, phase: BallCuePhase, enabled = true): GroundCue {
  const visible = enabled && (phase === 'pitch' || phase === 'live');
  const height = Math.max(0, Math.min(SHADOW_MAX_HEIGHT_FT, point.y));
  const t = height / SHADOW_MAX_HEIGHT_FT;
  return {
    visible,
    x: point.x,
    z: point.z,
    scale: 1 + (SHADOW_MAX_SCALE - 1) * t,
  };
}

/**
 * The pitched and batted ball, grown for the lens.
 *
 * `BALL_RADIUS_FT` is the real 0.12ft ball and the flight it flies is the
 * sim's — but drawn honestly it is a 3-4px dot from the plate camera, and
 * `docs/research/backyard-2026-reference.md` gap #12 records the consequence:
 * "on a live ball the ball is a near-invisible dot". Both reference games
 * draw the ball far larger than life. The cue is pure policy: a uniform draw
 * scale from camera distance, growing past the distance where honest pixels
 * stop being readable and capped before the ball reads as a beach ball.
 * Render-only, like the shadow: reach, catches and bounces stay real feet.
 */
export const BALL_PRESENCE_REF_FT = 14;
export const BALL_PRESENCE_MAX_SCALE = 3.2;

export function ballPresenceCue(
  point: CuePoint3,
  cameraAt: CuePoint3,
  phase: BallCuePhase,
  enabled = true
): { scale: number } {
  if (!enabled || (phase !== 'pitch' && phase !== 'live')) return { scale: 1 };
  const d = Math.sqrt(
    (point.x - cameraAt.x) ** 2 + (point.y - cameraAt.y) ** 2 + (point.z - cameraAt.z) ** 2
  );
  return { scale: Math.min(BALL_PRESENCE_MAX_SCALE, Math.max(1, d / BALL_PRESENCE_REF_FT)) };
}

export interface ActiveFielderState {
  active: number;
  fielders: ReadonlyArray<{ p: { x: number; z: number } }>;
}

export function activeFielderCue(
  play: ActiveFielderState | null,
  fieldingControl: boolean,
  enabled = true
): GroundCue {
  const fielder = play?.fielders[play.active];
  return {
    visible: enabled && fieldingControl && !!fielder,
    x: fielder?.p.x ?? 0,
    z: fielder?.p.z ?? 0,
    scale: 1,
  };
}
