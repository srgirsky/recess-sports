// ---------------------------------------------------------------------------
// Camera POLICY. PURE — no three.js import, so it is unit-testable without a
// renderer. `CameraDirector` is the thin thing that applies a cue.
//
// This is the direct heir of v1's discipline of keeping `art/projection.ts`
// pure and render-side, and it buys something v1 could never have: because a
// cue is just numbers, `cameraCues.test.ts` can project the four bases through
// a preset's matrix and assert the RESULT — which is how two measurement
// records that v1 recorded as permanent `known-drift` get closed:
//
//   * `geometry.projectionType` — BB2001's field is true perspective, v1's was
//     affine. A PerspectiveCamera simply is one.
//   * `geometry.fieldScale` — BB's basepath spans 41-42% of frame height; v1
//     was stuck at 34.0% because four constraints pinned its zoom. A real
//     camera has a free parameter (distance) that an affine dolly does not.
//
// And v1's measured `FOUL_SLOPE` (1.197-1.241) turns out to be a property of
// THIS file, not of the field: the foul lines are 45° in world space, and the
// slope is what the camera must project them to.
// ---------------------------------------------------------------------------

export type CameraPreset = 'PITCH' | 'PITCH_HERO' | 'PLAY' | 'FIELD' | 'DEEP' | 'BANG' | 'HOMER';

/**
 * ★ THE FINDING THAT SPLITS `FIELD` FROM `PLAY`.
 *
 * BB2001's field framing and BB2001's character size are JOINTLY UNSATISFIABLE
 * at real scale, and going to real units is what exposed it:
 *
 *   `geometry.fieldScale`  basepath = 41.4% of frame height   (measured, n=3)
 *   `art.characterScale`   a fielder = 8-9% of frame height   (measured)
 *   => BB's kid is 0.205 basepaths tall.
 *   A real 4ft kid on a real 60ft basepath is 0.045-0.059 basepaths tall.
 *
 * BB's characters are ~3.5x larger relative to their field than real
 * proportions permit. Matching both records at once would need a FOURTEEN FOOT
 * kid — taller than the outfield wall they are supposed to catch balls at.
 * BB could do it because its field was a painted backdrop with no physics
 * behind it; we cannot, because the ball obeys real gravity over real
 * distances and that is the whole balance fix.
 *
 * So the two records are honoured in different places:
 *   FIELD  conforms to `geometry.fieldScale` and is the ESTABLISHING shot —
 *          half-inning starts, replays, the wide reset. It is also what
 *          `cameraCues.test.ts` asserts against, since it is the framing the
 *          measurements describe.
 *   PLAY   is the camera the game actually spends its time in. It ignores the
 *          field-scale record deliberately and gets its character presence
 *          from CAMERA DISTANCE instead of from oversized kids — which is what
 *          a modern 3D sports game does, and what a fixed-camera 2D game of
 *          2001 could not.
 *
 * See `render.characterPresence` in scripts/measures.json.
 */
export const CHARACTER_PRESENCE = {
  bbKidPerBasepath: 0.205,
  realKidPerBasepath: 0.052,
  /** What it would take to match BB at real scale. Recorded to be refused. */
  requiredKidHeightFt: 14.0,
} as const;

export interface CameraRig {
  /** Eye position, ft. */
  eye: [number, number, number];
  /** Look-at target, ft. */
  target: [number, number, number];
  /** Vertical field of view, degrees. */
  fov: number;
}

/**
 * The preset rigs.
 *
 * PITCH is the behind-the-catcher view every pitch plays out in — the TV angle,
 * and v1's `BattingView` rig without the hand-placed backdrop. FIELD is the
 * play camera. Note FIELD sits BEHIND home (negative z) looking out, which is
 * the classic looking-across-the-yard framing.
 */
export const RIGS: Record<CameraPreset, CameraRig> = {
  PITCH: { eye: [0, 4.6, -13], target: [0, 2.4, 1], fov: 40 },
  PITCH_HERO: { eye: [3.6, 4.4, -11], target: [0, 2.6, 2], fov: 36 },
  // ★ SOLVED, not chosen. See FIELD_SOLVE below and cameraCues.test.ts.
  // The ESTABLISHING shot: conforms to `geometry.fieldScale`, shows the whole
  // park, used for half-inning starts, wide resets and replays.
  FIELD: { eye: [0, 99.63, -76.74], target: [0, 0, 42], fov: 46 },
  // The camera the game actually lives in — same 40° elevation (so the foul
  // slope never shifts on a cut) at 115ft instead of 155ft. Deliberately does
  // NOT conform to `geometry.fieldScale`: see CHARACTER_PRESENCE above for
  // why that record and the character-size record cannot both be met at real
  // scale, and why the answer is camera distance rather than giant kids.
  PLAY: { eye: [0, 73.92, -36.1], target: [0, 0, 52], fov: 46 },
  // Pulled back to 210ft to hold a deep fly's apex in frame, at 43.98° rather
  // than FIELD's 40° — because the projected foul slope is NOT a function of
  // elevation alone. Perspective strength falls with distance (the projection
  // tends toward orthographic, whose slope here is 1/sin θ), so holding the
  // elevation while pulling back would have shifted the slope 1.233 -> 1.317
  // and the cut would read as the FIELD tilting rather than the camera
  // stepping back. Elevation is re-solved to hold the slope instead.
  DEEP: { eye: [0, 145.83, -109.11], target: [0, 0, 42], fov: 46 },
  BANG: { eye: [0, 6, 0], target: [0, 2, 0], fov: 34 }, // positioned per-play
  HOMER: { eye: [0, 30, -40], target: [0, 20, 120], fov: 50 },
};

/**
 * How the FIELD rig was derived, kept next to the result so it can be re-solved
 * rather than nudged.
 *
 * Two of `scripts/measures.json`'s records constrain it, and they constrain
 * DIFFERENT free parameters, which is what makes the solve well-posed:
 *
 *   `geometry.foulSlope`  (1.197-1.241, status conformed, n=3)
 *        depends on ELEVATION only. Our first guess of ~23° projected the
 *        45° foul lines to a slope of 1.77 — far outside the band. 40° lands
 *        at 1.233.
 *   `geometry.fieldScale` (41.4-42.1% of frame height at the two LOCAL
 *        venues; the 52.3% stadium reading is a per-venue outlier the record
 *        itself says not to chase)
 *        depends on DISTANCE and FOV. 155ft at 46° vertical gives 41.4%.
 *
 * v1 recorded this as a permanent `known-drift` at 34.0%, because its affine
 * projection had a single ZOOM scalar pinned by four simultaneous layout
 * constraints. A perspective camera has independent elevation, distance and
 * FOV, so both records are satisfiable at once — which is the concrete,
 * measurable payoff of the renderer change.
 *
 * Note the metric is aspect-INDEPENDENT: with a fixed vertical FOV the
 * pixels-per-foot at a given depth do not change with aspect, so 41.4% holds
 * on 4:3, 3:2, 16:10 and 16:9 alike. Only how much extra WIDTH is revealed
 * changes — which is why the foul poles fall just outside a 4:3 frame and
 * comfortably inside anything wider.
 */
export const FIELD_SOLVE = {
  elevationDeg: 40,
  distanceFt: 155,
  lookAtZ: 42,
  fovDeg: 46,
  /** What the solve produces, asserted in cameraCues.test.ts. */
  expect: { basepathPctOfFrameHeight: 41.4, foulSlope: 1.233 },
} as const;

export interface CameraCue {
  preset: CameraPreset;
  /** Where the camera should be looking, ft. */
  focus: [number, number, number];
  /**
   * How to get there. A CUT is instantaneous with a white flash; a BLEND is a
   * damped move over `ms`.
   */
  transition: 'cut' | { blendMs: number };
}

export interface CameraInput {
  phase: 'pitch' | 'contact' | 'live' | 'between';
  /** Ball position, ft. */
  ball?: [number, number, number];
  /** Lead runner position, ft. */
  leadRunner?: [number, number];
  /** The chasing fielder, ft. */
  chaser?: [number, number];
  /** Launch angle of the batted ball, degrees. */
  launchDeg?: number;
  /** Projected carry, ft. */
  carryFt?: number;
  /** A play at a base is within this many seconds. */
  bangBangSec?: number;
  homer?: boolean;
}

/**
 * ★ THE HARD CUT. PITCH -> FIELD is instantaneous with a 90ms white flash,
 * never a blend.
 *
 * This is not a stylistic call: it is proven in v1 (`PLATE_VIEW`'s rig
 * show/hide plus `FX.HIT_PAUSE_MS`), it is what Backyard Baseball does, and a
 * blend across that much distance takes ~400ms during which a six-year-old
 * cannot tell where the ball is. Blends are reserved for non-gameplay.
 */
export function chooseCamera(input: CameraInput, prev?: CameraCue): CameraCue {
  const focusOf = (): [number, number, number] => {
    if (!input.ball) return [0, 0, 46];
    // Weighted focus: mostly the ball, but pulled toward the lead runner and
    // the chasing fielder so a play at a base stays in frame.
    let [fx, fy, fz] = input.ball;
    fx *= 0.6;
    fy *= 0.6;
    fz *= 0.6;
    if (input.leadRunner) {
      fx += input.leadRunner[0] * 0.25;
      fz += input.leadRunner[1] * 0.25;
    } else {
      fx /= 0.85;
      fz /= 0.85;
    }
    if (input.chaser) {
      fx += input.chaser[0] * 0.15;
      fz += input.chaser[1] * 0.15;
    }
    return [fx, fy, fz];
  };

  if (input.homer) {
    return { preset: 'HOMER', focus: input.ball ?? [0, 20, 150], transition: { blendMs: 200 } };
  }

  if (input.phase === 'pitch' || input.phase === 'between') {
    return { preset: 'PITCH', focus: [0, 2.4, 1], transition: prev?.preset === 'PITCH' ? { blendMs: 0 } : 'cut' };
  }

  if (input.bangBangSec !== undefined && input.bangBangSec <= 0.4) {
    return { preset: 'BANG', focus: focusOf(), transition: 'cut' };
  }

  // A deep fly needs the wider rig BEFORE it gets there, or the ball leaves
  // frame at the apex. Decided on the launch, not on where the ball is now.
  const deep = (input.launchDeg ?? 0) > 25 && (input.carryFt ?? 0) > 140;
  const preset: CameraPreset = deep ? 'DEEP' : 'PLAY';

  return {
    preset,
    focus: focusOf(),
    // Contact is THE cut. Everything after it is a damped move.
    transition: input.phase === 'contact' ? 'cut' : { blendMs: 260 },
  };
}

/**
 * The framing constraint the FIELD camera must satisfy: home plate and the
 * ball both inside a safe rect. Pure, so the director can solve for a dolly
 * distance instead of guessing.
 */
export const SAFE_RECT = 0.85;

/** Critically-damped spring constant for camera moves, rad/s. */
export const CAMERA_OMEGA = 6;

/**
 * Critically-damped step toward a target. Frame-rate independent, and it
 * cannot overshoot — an overshooting camera on a fly ball reads as a stumble.
 */
export function damp(current: number, target: number, vel: number, dt: number, omega = CAMERA_OMEGA): [number, number] {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const det = 1 / (f + hhoo);
  const detX = (current * f + vel * dt + target * hhoo) * det;
  const detV = (vel + (target - current) * hoo) * det;
  return [detX, detV];
}
