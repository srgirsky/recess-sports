// ---------------------------------------------------------------------------
// The 3/4 camera. PURE. The sim (and every test) lives in the flat logical
// 960x640 field space; the SCENE projects positions through here when it
// draws, and un-projects pointer input on the way back in. The transform is
// a true PERSPECTIVE view of the ground plane (a homography): the field
// pinches toward the fence AND the far half of the diamond compresses in
// depth, which is what BB2001's camera does. Kids shrink with depth through
// their own gentler curve (depthScale).
// Never import this from systems/ — it is render-side only.
// ---------------------------------------------------------------------------

import { GAME_HEIGHT } from '../config';
import { HOME, FIRST, FENCE_Y, FIELD_BOTTOM_Y, type Vec } from '../systems/geometry';

/** Sprite shrink at full depth. Kept gentle so outfielders stay chunky enough to recognize. */
const SHRINK = 0.28;
/** The vanishing axis. */
const CX = 480;
/** Sprite depth 0 a little below home (the batter's box), 1 at the fence line. */
const NEAR_Y = HOME.y + 40;
const FAR_Y = FENCE_Y;

/**
 * ★ Perspective strength — MEASURED (geometry.projectionType).
 *
 * BB2001's diamond is not an affine squash: its two diagonals do not bisect
 * each other, because the far half is drawn shorter than the near half. The
 * record measures that as (diagonal-midpoint gap ÷ home→2B height) across
 * three venues; this is its median. The camera is the homography
 *
 *     w = 1 + K·(HOME.y − y)        x' ∝ (x − CX) / w        y' ∝ (y − HOME.y) / w
 *
 * anchored at the plate (w = 1 there), and for that family the strength comes
 * out in closed form as ½·K·leg / (1 + K·leg), with `leg` the depth of first
 * base. K is solved from the measured strength below, not tuned by eye.
 *
 * Two things fall out for free, and the conformance gate holds both:
 *  - lines stay lines, so the chalk drawn between two projected points still
 *    passes through every base on it;
 *  - x and y shrink by the SAME 1/w along any ray from the plate, so the drawn
 *    foul slope is exactly the logical FOUL_SLOPE (geometry.foulSlope) at any K.
 */
export const PERSPECTIVE = 0.0872;
const LEG = HOME.y - FIRST.y;
const K = (2 * PERSPECTIVE) / (1 - 2 * PERSPECTIVE) / LEG;

/** The homography's divisor at logical row y (1 at the plate, > 1 deeper). */
function w(y: number): number {
  return 1 + K * (HOME.y - y);
}

/** Logical y → the perspective ground row, before the zoom. */
function groundY(y: number): number {
  return HOME.y + (y - HOME.y) / w(y);
}

/**
 * ★ Field zoom — a RENDER-ONLY dolly toward the diamond.
 *
 * MEASURED (geometry.fieldScale): BB2001's basepath is 41-42% of frame height
 * across two venues. This scales what is DRAWN and nothing else — the sim
 * stays in flat 960x640 space, so RUNNER_SPEED, the conformed home->1B pace,
 * clampToField's convexity argument, every systems/ test and the goldlog
 * fingerprint are all untouched. Uniform on purpose: a non-uniform zoom would
 * drag the drawn foul slope out of its measured band.
 *
 * It is the largest zoom four constraints allow, and the ceiling is
 * structural rather than aesthetic (see the record). Perspective compresses
 * the outfield, which is what bought the extra zoom over the flat camera:
 *
 *   FIELD_BOTTOM_Y (600) must land at/above the canvas bottom  -> 640
 *   the catcher (540) must stay above HUD.STRIP.TOP            -> 510 < 568
 *   the fence needs room for its own structure + the skyline   -> mid 112
 *   maximise the basepath                                      -> 38.0%
 *
 * FOCUS_Y is then DERIVED from the first of those: the y that leaves the
 * bottom floor exactly on the frame edge.
 */
export const ZOOM = 1.64;
const FOCUS_Y = (GAME_HEIGHT - groundY(FIELD_BOTTOM_Y) * ZOOM) / (1 - ZOOM);

/** 0 at the plate → 1 at the fence (clamped; the HUD rows sit outside). */
export function depthAt(y: number): number {
  return Math.max(0, Math.min(1, (NEAR_Y - y) / (NEAR_Y - FAR_Y)));
}

/** Logical field position → screen position. */
export function project(p: Vec): Vec {
  return {
    x: CX + ((p.x - CX) / w(p.y)) * ZOOM,
    y: FOCUS_Y + (groundY(p.y) - FOCUS_Y) * ZOOM,
  };
}

/**
 * Screen position → logical field position (pointer input comes back in).
 *
 * Y is inverted FIRST — the zoom, then the homography's own inverse — and
 * only then is the row's divisor read, off the LOGICAL y. Reading it straight
 * off the screen row picks the pinch from the wrong depth and skews every
 * pointer the further it is from the plate.
 */
export function unproject(p: Vec): Vec {
  const v = FOCUS_Y + (p.y - FOCUS_Y) / ZOOM - HOME.y; // = u / w(y), u = y − HOME.y
  const y = HOME.y + v / (1 + K * v);
  return { x: CX + ((p.x - CX) / ZOOM) * w(y), y };
}

/**
 * How big a kid standing at logical `p` should draw (1 at the plate).
 *
 * Takes a LOGICAL point. Deliberately NOT scaled by ZOOM: the field grows and
 * the kids do not, which is the whole point — BB's fielder is ~20% of a
 * basepath tall and ours was 33%.
 */
export function depthScale(p: Vec): number {
  return 1 - SHRINK * depthAt(p.y);
}

/**
 * How many screen px one logical px of GROUND spans across, at `p`: the
 * zoom over the perspective divisor. For things PAINTED on the field — the
 * mound, the plate, chalk, worn dirt, a tree's footprint — which must shrink
 * exactly as the field does. (Kids use depthScale: they are not the ground.)
 */
export function groundScale(p: Vec): number {
  return ZOOM / w(p.y);
}
