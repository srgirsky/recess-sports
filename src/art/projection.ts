// ---------------------------------------------------------------------------
// The 3/4 camera. PURE. The sim (and every test) lives in the flat logical
// 960x640 field space; the SCENE projects positions through here when it
// draws, and un-projects pointer input on the way back in. The transform is
// a gentle trapezoid: the field pinches toward the fence and kids shrink with
// depth, which is what sells the classic looking-across-the-yard view.
// Never import this from systems/ — it is render-side only.
// ---------------------------------------------------------------------------

import { HOME, FENCE_Y, type Vec } from '../systems/geometry';

/** Horizontal pinch at full depth (fraction of distance from center). */
const PINCH = 0.2;
/** Sprite shrink at full depth. Kept gentle so outfielders stay chunky enough to recognize. */
const SHRINK = 0.28;
/** The vanishing axis. */
const CX = 480;
/** Depth 0 a little below home (the batter's box), 1 at the fence line. */
const NEAR_Y = HOME.y + 40;
const FAR_Y = FENCE_Y;

/**
 * ★ Field zoom — a RENDER-ONLY dolly toward the diamond.
 *
 * MEASURED (geometry.fieldScale): BB2001's basepath is 41-42% of frame height
 * across two venues; ours was 28.1%, so the diamond read small and the players
 * read 1.6x too big NEXT TO it. This scales what is DRAWN and nothing else —
 * the sim stays in flat 960x640 space, so RUNNER_SPEED, the conformed
 * home->1B pace, clampToField's convexity argument, every systems/ test and
 * the goldlog fingerprint are all untouched.
 *
 * It is a UNIFORM scale on purpose. Stretching x more than y would buy the
 * width our 3:2 canvas is short of against BB's 4:3, but it would also change
 * the DRAWN foul slope away from the 1.2 that geometry.foulSlope conformed to
 * — the record was measured off BB's screen pixels, so breaking it on screen
 * breaks it for real.
 *
 * 1.28 is where four constraints meet, and the ceiling is structural rather
 * than aesthetic (see the record):
 *
 *   FIELD_BOTTOM_Y (600) must land at/above the canvas bottom  -> 640
 *   the catcher (540) must stay above HUD.STRIP.TOP            -> 563 < 568
 *   the fence needs room for its own structure + the skyline   -> mid 110
 *   maximise the basepath                                      -> 34.0%
 *
 * FOCUS_Y is then pinned by the first of those: it is the y that leaves the
 * bottom floor exactly on the frame edge.
 */
export const ZOOM = 1.28;
const FOCUS_Y = 458;

/** 0 at the plate → 1 at the fence (clamped; the HUD rows sit outside). */
export function depthAt(y: number): number {
  return Math.max(0, Math.min(1, (NEAR_Y - y) / (NEAR_Y - FAR_Y)));
}

/** Logical field position → screen position. */
export function project(p: Vec): Vec {
  return {
    x: CX + (p.x - CX) * (1 - PINCH * depthAt(p.y)) * ZOOM,
    y: FOCUS_Y + (p.y - FOCUS_Y) * ZOOM,
  };
}

/**
 * Screen position → logical field position (pointer input comes back in).
 *
 * Y is inverted FIRST, then depth is read off the LOGICAL y. Reading depth
 * straight off the screen y (which is what this did while y was the identity)
 * picks the pinch factor from the wrong row and skews every pointer the
 * further it is from the focal plane.
 */
export function unproject(p: Vec): Vec {
  const y = FOCUS_Y + (p.y - FOCUS_Y) / ZOOM;
  return { x: CX + (p.x - CX) / ((1 - PINCH * depthAt(y)) * ZOOM), y };
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
