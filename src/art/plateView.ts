// ---------------------------------------------------------------------------
// The frontal plate↔screen mapping for the behind-home-plate pitch view.
//
// Plate coords stay exactly what systems/atbat + systems/pitchkind speak:
// px offsets from the strike-zone center, +x toward the 1B side. This module
// only decides where that zone sits ON SCREEN while the BattingView rig is up
// (anchor + uniform scale — the frontal zone is ~1.8x plate size).
//
// RENDER-SIDE ONLY, like projection.ts: never import this from systems/.
// Pure functions (no Phaser) so it stays vitest-testable.
// ---------------------------------------------------------------------------

import { PLATE_VIEW, PLATE_ZONE, CURSOR } from '../config';
import type { PlateLoc } from '../systems/pitchkind';

export interface Vec {
  x: number;
  y: number;
}

/** Screen position of a plate-coord point on the frontal zone. */
export function plateToScreen(p: PlateLoc): Vec {
  const { CX, CY, SCALE } = PLATE_VIEW.ZONE;
  return { x: CX + p.x * SCALE, y: CY + p.y * SCALE };
}

/** Inverse of plateToScreen — raw screen pointer coords -> plate coords.
 *  (The rig ignores the 3/4 projection entirely: never unproject first.) */
export function screenToPlate(s: Vec): PlateLoc {
  const { CX, CY, SCALE } = PLATE_VIEW.ZONE;
  return { x: (s.x - CX) / SCALE, y: (s.y - CY) / SCALE };
}

/** Clamp a plate-coord point into the batting cursor's roam window. */
export function clampToCursorRange(p: PlateLoc): PlateLoc {
  const rx = (PLATE_ZONE.W / 2) * CURSOR.RANGE_MULT;
  const ry = (PLATE_ZONE.H / 2) * CURSOR.RANGE_MULT;
  return {
    x: Math.max(-rx, Math.min(rx, p.x)),
    y: Math.max(-ry, Math.min(ry, p.y)),
  };
}
