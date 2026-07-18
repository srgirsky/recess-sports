// ---------------------------------------------------------------------------
// Field geometry. PURE — shared by the scene (rendering) and the live-play
// sim (systems/liveplay.ts), which both work in the game's fixed 960x640
// screen space. One source of truth so the sim and the pixels can't disagree.
// ---------------------------------------------------------------------------

export interface Vec {
  x: number;
  y: number;
}

// A clean diamond seen from behind home plate.
export const HOME: Vec = { x: 480, y: 500 };
export const FIRST: Vec = { x: 662, y: 358 };
export const SECOND: Vec = { x: 480, y: 216 };
export const THIRD: Vec = { x: 298, y: 358 };
export const MOUND: Vec = { x: 480, y: 356 };

/** Top of the outfield wall — a fly landing above this line is a home run. */
export const FENCE_Y = 210;

/** The foul lines meet the fence band at these x's (left/right). */
export const FENCE_LEFT_X = 132;
export const FENCE_RIGHT_X = 828;

/**
 * Venue-shaped field geometry: where the fence sits per spray direction, how
 * the ground plays, and what's in the way. Bases/mound are fixed for every
 * venue. PURE data + helpers, shared by atbat launches, the live sim, and
 * the renderer.
 */
export interface FieldGeometry {
  /** Fence y at the left foul line and at the right foul line. */
  fenceLeftY: number;
  fenceRightY: number;
  /** Grounder roll-speed multiplier. */
  rollMult: number;
  obstacles: Array<{ x: number; y: number; r: number }>;
}

/** The classic park — identical to the pre-venue constants. */
export const DEFAULT_GEOMETRY: FieldGeometry = {
  fenceLeftY: FENCE_Y,
  fenceRightY: FENCE_Y,
  rollMult: 1,
  obstacles: [],
};

/** The point on the fence at spray fraction t (0 = left line, 1 = right). */
export function fencePointAt(geo: FieldGeometry, t: number): Vec {
  return {
    x: FENCE_LEFT_X + t * (FENCE_RIGHT_X - FENCE_LEFT_X),
    y: geo.fenceLeftY + t * (geo.fenceRightY - geo.fenceLeftY),
  };
}

/** Position for a base index: 0 & 4 = home, 1/2/3 = the bases. */
export function basePos(idx: number): Vec {
  switch (idx) {
    case 1:
      return FIRST;
    case 2:
      return SECOND;
    case 3:
      return THIRD;
    default:
      return HOME; // 0 (batter) and 4 (scored)
  }
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Step `from` toward `to` by at most `maxStep` px. Never overshoots. */
export function moveToward(from: Vec, to: Vec, maxStep: number): Vec {
  const d = dist(from, to);
  if (d <= maxStep || d === 0) return { x: to.x, y: to.y };
  const t = maxStep / d;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** The nine defensive positions. */
export type PositionId = 'P' | 'C' | '1B' | '2B' | 'SS' | '3B' | 'LF' | 'CF' | 'RF';

/** Where each fielder stands at the start of a play (screen coords). */
export const FIELD_POSITIONS: Record<PositionId, Vec> = {
  P: MOUND,
  C: { x: 480, y: 540 },
  '1B': { x: 690, y: 330 },
  '2B': { x: 565, y: 258 },
  SS: { x: 395, y: 258 },
  '3B': { x: 270, y: 330 },
  LF: { x: 260, y: 235 },
  CF: { x: 480, y: 225 },
  RF: { x: 700, y: 235 },
};

/** Which position covers each base for a throw (4 = home plate). */
export const BASE_COVER: Record<1 | 2 | 3 | 4, PositionId> = {
  1: '1B',
  2: '2B',
  3: '3B',
  4: 'C',
};
