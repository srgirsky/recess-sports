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
const PINCH = 0.14;
/** Sprite shrink at full depth. */
const SHRINK = 0.3;
/** The vanishing axis. */
const CX = 480;
/** Depth 0 a little below home (the batter's box), 1 at the fence line. */
const NEAR_Y = HOME.y + 40;
const FAR_Y = FENCE_Y;

/** 0 at the plate → 1 at the fence (clamped; the HUD rows sit outside). */
export function depthAt(y: number): number {
  return Math.max(0, Math.min(1, (NEAR_Y - y) / (NEAR_Y - FAR_Y)));
}

/** Logical field position → screen position. */
export function project(p: Vec): Vec {
  return { x: CX + (p.x - CX) * (1 - PINCH * depthAt(p.y)), y: p.y };
}

/** Screen position → logical field position (pointer input comes back in). */
export function unproject(p: Vec): Vec {
  return { x: CX + (p.x - CX) / (1 - PINCH * depthAt(p.y)), y: p.y };
}

/** How big a kid standing at logical `p` should draw (1 at the plate). */
export function depthScale(p: Vec): number {
  return 1 - SHRINK * depthAt(p.y);
}
