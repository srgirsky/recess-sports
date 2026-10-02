// ---------------------------------------------------------------------------
// Defensive alignment — PURE. BB2001 lets the fielding side reposition from
// the mini-diamond before a pitch; this is that pad's three presets. Only the
// fielders' STARTING spots move (their `home` in the live sim, so the chaser
// election's leash and the post-play walk-back follow), which keeps every
// rule downstream unchanged. Spots are clamped per venue: a DEEP outfielder
// on the sandlot's short porch stops short of the wall.
// ---------------------------------------------------------------------------

import { ALIGN } from '../config';
import {
  FIELD_POSITIONS,
  HOME,
  clampToField,
  fenceYAtX,
  DEFAULT_GEOMETRY,
  type FieldGeometry,
  type PositionId,
  type Vec,
} from './geometry';

export type Alignment = 'normal' | 'in' | 'deep';

export const ALIGNMENTS: Alignment[] = ['normal', 'in', 'deep'];

const INFIELD = new Set<PositionId>(['1B', '2B', 'SS', '3B']);
const OUTFIELD = new Set<PositionId>(['LF', 'CF', 'RF']);

/** The next preset when the pad is tapped: NORMAL → IN → DEEP → NORMAL. */
export function nextAlignment(a: Alignment): Alignment {
  return ALIGNMENTS[(ALIGNMENTS.indexOf(a) + 1) % ALIGNMENTS.length];
}

/** Does this alignment move this position at all? */
export function isShifted(pos: PositionId, a: Alignment): boolean {
  return (a === 'in' && INFIELD.has(pos)) || (a === 'deep' && OUTFIELD.has(pos));
}

/** Where `pos` starts a play under alignment `a`, in sim coords. */
export function alignedSpot(pos: PositionId, a: Alignment, geo: FieldGeometry = DEFAULT_GEOMETRY): Vec {
  const base = FIELD_POSITIONS[pos];
  if (!isShifted(pos, a)) return { ...base };
  const dx = base.x - HOME.x;
  const dy = base.y - HOME.y;
  const len = Math.hypot(dx, dy);
  // Along the line from the plate: IN walks toward it, DEEP away from it.
  const step = a === 'in' ? -ALIGN.IN_PX : ALIGN.DEEP_PX;
  const moved = { x: base.x + (dx / len) * step, y: base.y + (dy / len) * step };
  if (a === 'in') return moved;
  // Never back into (or behind) the wall — a short porch caps the retreat,
  // and never past the spot itself: DEEP is never shallower than NORMAL.
  const p = clampToField(geo, moved, ALIGN.FENCE_GAP_PX);
  return p.y > base.y ? { ...base } : p;
}

/** True when `p` sits at least FENCE_GAP_PX in front of this venue's wall. */
export function clearOfFence(geo: FieldGeometry, p: Vec): boolean {
  return p.y >= fenceYAtX(geo, p.x) + ALIGN.FENCE_GAP_PX - 0.001;
}
