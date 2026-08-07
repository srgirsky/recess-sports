// ---------------------------------------------------------------------------
// The draft's presentation policy. PURE: the DOM reports which kid is being
// inspected; this file decides who shares the background and which front-end
// clip owns the hero. GameView only applies the result to the already-loaded
// scene objects.
// ---------------------------------------------------------------------------

import type { AnimName } from './clips';

export type DraftSpotlightMode = 'pick' | 'mine' | 'cpu';

/** A short, readable entrance before the candidate holds their card pose. */
export const DRAFT_WALK_SEC = 0.55;
/** A picked kid gets a reaction before returning to the authored hero pose. */
export const DRAFT_REACT_SEC = 0.8;

export interface DraftHeroPose {
  clip: AnimName;
  /** Render-only offset from the centre mark, in feet. */
  xFt: number;
}

/**
 * One candidate's little performance. `walkIn` is false when PICK? changes to
 * PICKED for the same kid, so confirming a choice cannot teleport them back to
 * the edge of the stage.
 */
export function draftHeroPose(
  ageSec: number,
  mode: DraftSpotlightMode,
  walkIn: boolean
): DraftHeroPose {
  const age = Math.max(0, ageSec);
  if (walkIn && age < DRAFT_WALK_SEC) {
    const t = age / DRAFT_WALK_SEC;
    // Smoothstep: arrive without the hard stop a linear walk produces.
    const eased = t * t * (3 - 2 * t);
    return { clip: 'walk_on', xFt: -3.8 * (1 - eased) };
  }
  const afterWalk = age - (walkIn ? DRAFT_WALK_SEC : 0);
  if (mode !== 'pick' && afterWalk < DRAFT_REACT_SEC) {
    return { clip: 'cheer', xFt: 0 };
  }
  return { clip: 'pose_card', xFt: 0 };
}

/**
 * The candidate plus a small, stable slice of the remaining roster. The whole
 * board stays in DOM; seven live kids are enough to make this a waiting group
 * rather than a solo model viewer without doubling the gameplay draw budget.
 */
export function draftCast(selectedId: string, pool: readonly string[], max = 7): string[] {
  const cast = [selectedId];
  for (const id of pool) {
    if (id === selectedId || cast.includes(id)) continue;
    cast.push(id);
    if (cast.length >= max) break;
  }
  return cast;
}

/** Background positions, left-to-right in two shallow rows behind the hero. */
export const DRAFT_CAST_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [-4.2, 3.8],
  [-2.2, 4.7],
  [2.2, 4.7],
  [4.2, 3.8],
  [-3.2, 6.3],
  [3.2, 6.3],
];
