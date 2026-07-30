// ---------------------------------------------------------------------------
// Units. PURE.
//
// v2 works in REAL UNITS: feet, seconds, and radians internally. v1 worked in
// an arbitrary 960x640 screen-pixel space, and that is not a cosmetic
// difference — it is the reason the balance never came right. Converting v1's
// field to feet (its 179.64px basepath read as 60ft => 2.994 px/ft) puts
// centre field at 89ft, or 1.49 basepaths, against a real Little League
// 2.5-2.9. The outfield was half as deep as it should be, so no ball could
// ever land in a gap, so every ball a fielder reached was an out at first.
// Three rounds of speed retuning and an invented cutoff relay chased that and
// got BABIP from 0% to ~7% against baseball's ~30%.
//
// Real units are therefore the balance fix, not just a physics upgrade.
// ---------------------------------------------------------------------------

/** Gravity, ft/s². */
export const G = 32.174;

// --- Angles -----------------------------------------------------------------

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export function toRad(deg: number): number {
  return deg * DEG;
}
export function toDeg(rad: number): number {
  return rad * RAD;
}

// --- Speed ------------------------------------------------------------------

/** 1 mph = 1.466667 ft/s. */
export const FTS_PER_MPH = 5280 / 3600;

export function mphToFts(mph: number): number {
  return mph * FTS_PER_MPH;
}
export function ftsToMph(fts: number): number {
  return fts / FTS_PER_MPH;
}

// --- Length -----------------------------------------------------------------

export function inToFt(inches: number): number {
  return inches / 12;
}
export function ftToIn(ft: number): number {
  return ft * 12;
}

// --- Rotation ---------------------------------------------------------------

/** Revolutions per minute -> radians per second. */
export function rpmToRadS(rpm: number): number {
  return (rpm * 2 * Math.PI) / 60;
}
export function radSToRpm(radS: number): number {
  return (radS * 60) / (2 * Math.PI);
}

// --- Small helpers the whole sim shares -------------------------------------

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smoothstep easing on t in [0,1]. C1-continuous, and never overshoots —
 *  which is why the fence curve uses it instead of Catmull-Rom. */
export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

// --- The v1 bridge ----------------------------------------------------------

/**
 * v1's px-per-foot, stated once so `scripts/measures.json`'s pixel-domain
 * records can be re-expressed in real units without the conversion being
 * rediscovered (or misremembered) at each call site.
 *
 * Derived from v1's `geometry.BASEPATH_PX` = hypot(138, 115) = 179.6386px
 * read as one 60ft basepath leg.
 */
export const V1_PX_PER_FT = 179.6386 / 60; // 2.99398

export function v1PxToFt(px: number): number {
  return px / V1_PX_PER_FT;
}
