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
/** The physical walk from the chalk mark to the picked side's bench. */
export const DRAFT_WALK_OFF_SEC = 0.85;
/** Where the two benches sit around the centre mark, render-only feet. */
export const DRAFT_BENCH_X_FT = 7.2;

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
  if (mode !== 'pick') {
    const walkAge = afterWalk - DRAFT_REACT_SEC;
    // The stage camera looks toward +Z, so its screen-right basis is world -X.
    // Player bench is visually left and therefore +X in stage coordinates.
    const side = mode === 'mine' ? 1 : -1;
    if (walkAge + 1e-9 < DRAFT_WALK_OFF_SEC) {
      const t = Math.max(0, walkAge) / DRAFT_WALK_OFF_SEC;
      const eased = t * t * (3 - 2 * t);
      return { clip: 'walk_on', xFt: eased === 0 ? 0 : side * DRAFT_BENCH_X_FT * eased };
    }
    return { clip: 'pose_card', xFt: side * DRAFT_BENCH_X_FT };
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

export interface DraftStageCast {
  waiting: string[];
  player: string[];
  cpu: string[];
  /** Unique set of every kid the stage borrows from the live scene. */
  all: string[];
}

/**
 * The full bench: candidate + remaining kids in back, recent picks on the two
 * side benches. Capping each group protects the game scene's draw budget while
 * still letting the environment visibly remember every draft turn.
 */
export function draftStageCast(
  selectedId: string,
  pool: readonly string[],
  playerTeam: readonly string[],
  aiTeam: readonly string[],
  maxWaiting = 6,
  maxPerBench = 4
): DraftStageCast {
  const unique = (ids: readonly string[], max: number): string[] => {
    const out: string[] = [];
    for (const id of ids) {
      if (id === selectedId || out.includes(id)) continue;
      out.push(id);
      if (out.length >= max) break;
    }
    return out;
  };
  const waiting = unique(pool, maxWaiting);
  const occupied = new Set([selectedId, ...waiting]);
  const recent = (ids: readonly string[]): string[] =>
    unique(ids.filter((id) => !occupied.has(id)).slice(-maxPerBench).reverse(), maxPerBench);
  const player = recent(playerTeam);
  for (const id of player) occupied.add(id);
  const cpu = recent(aiTeam).filter((id) => !occupied.has(id));
  return { waiting, player, cpu, all: [selectedId, ...waiting, ...player, ...cpu] };
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

/** Side benches, nearest recent pick first. */
export const DRAFT_PLAYER_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [7.2, 1.8], [9.1, 2.5], [7.3, 4.2], [9.2, 5],
];
export const DRAFT_CPU_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [-7.2, 1.8], [-9.1, 2.5], [-7.3, 4.2], [-9.2, 5],
];
