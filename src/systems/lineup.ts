// ---------------------------------------------------------------------------
// Lineup planning — PURE. Batting order + position assignment + starting
// pitcher for a 9-kid team. The LineupScene's AUTO button, the kid-mode skip
// path, and the CPU all use the same heuristic so nobody fields a nonsense
// defense. The player's edits only ever permute a valid plan.
// ---------------------------------------------------------------------------

import { getCharacter } from '../data/characters';
import type { PositionId } from './geometry';

/** A complete plan for one team. `order` is the batting order (ids). */
export interface LineupPlan {
  order: string[];
  positions: Record<string, PositionId>;
  pitcherId: string;
}

/** Fill priority: up-the-middle defense matters most, corners least. */
const DEFENSE_PRIORITY: Array<{ pos: PositionId; score: (s: { fielding: number; speed: number; pitching: number; power: number }) => number }> = [
  { pos: 'C', score: (s) => s.pitching * 2 + s.fielding }, // the arm behind the plate
  { pos: 'SS', score: (s) => s.fielding * 2 + s.speed },
  { pos: 'CF', score: (s) => s.fielding + s.speed * 2 },
  { pos: '2B', score: (s) => s.fielding * 2 + s.speed },
  { pos: '3B', score: (s) => s.fielding + s.pitching }, // the hot-corner arm
  { pos: 'LF', score: (s) => s.fielding + s.speed },
  { pos: 'RF', score: (s) => s.fielding + s.speed },
  { pos: '1B', score: (s) => s.fielding },
];

/**
 * A sensible full plan for these 9 kids: best arm pitches, the rest fill
 * positions by up-the-middle priority, and the batting order goes classic —
 * quick contact kids up top, sluggers 3-4-5, everyone else by overall.
 */
export function autoAssign(teamIds: string[]): LineupPlan {
  const kids = teamIds.map(getCharacter);
  const pitcher = [...kids].sort((a, b) => b.stats.pitching - a.stats.pitching)[0];

  const positions: Record<string, PositionId> = { [pitcher.id]: 'P' };
  const unassigned = new Set(kids.filter((k) => k.id !== pitcher.id).map((k) => k.id));
  for (const { pos, score } of DEFENSE_PRIORITY) {
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const id of unassigned) {
      const s = score(getCharacter(id).stats);
      if (s > bestScore) {
        bestScore = s;
        best = id;
      }
    }
    if (best === null) break;
    positions[best] = pos;
    unassigned.delete(best);
  }

  // Batting order: 1-2 contact+speed table-setters, 3-4-5 the big bats,
  // then everyone else by overall. Simple, readable, close enough to real.
  const tableSet = (k: (typeof kids)[0]) => k.stats.contact * 2 + k.stats.speed;
  const bigBat = (k: (typeof kids)[0]) => k.stats.power * 2 + k.stats.contact;
  const overall = (k: (typeof kids)[0]) =>
    k.stats.contact + k.stats.power + k.stats.speed + k.stats.fielding;
  const pool = [...kids];
  const take = (score: (k: (typeof kids)[0]) => number): string => {
    pool.sort((a, b) => score(b) - score(a));
    return pool.shift()!.id;
  };
  const order = [
    take(tableSet),
    take(tableSet),
    take(bigBat),
    take(bigBat),
    take(bigBat),
    ...pool.sort((a, b) => overall(b) - overall(a)).map((k) => k.id),
  ];

  return { order, positions, pitcherId: pitcher.id };
}

/** Every kid exactly once in the order, every position covered exactly once,
 *  and the pitcher really is the kid standing on the mound. */
export function validateLineup(plan: LineupPlan, teamIds: string[]): boolean {
  if (plan.order.length !== teamIds.length) return false;
  if (new Set(plan.order).size !== teamIds.length) return false;
  if (!plan.order.every((id) => teamIds.includes(id))) return false;
  const posList = Object.values(plan.positions);
  if (posList.length !== teamIds.length) return false;
  if (new Set(posList).size !== teamIds.length) return false;
  return plan.positions[plan.pitcherId] === 'P';
}

/** Swap two kids' batting-order slots (returns a new plan). */
export function swapOrder(plan: LineupPlan, a: number, b: number): LineupPlan {
  const order = [...plan.order];
  [order[a], order[b]] = [order[b], order[a]];
  return { ...plan, order };
}

/** Swap two kids' positions (returns a new plan; pitcherId follows the mound). */
export function swapPositions(plan: LineupPlan, idA: string, idB: string): LineupPlan {
  if (idA === idB) return plan;
  const positions = { ...plan.positions };
  [positions[idA], positions[idB]] = [positions[idB], positions[idA]];
  const pitcherId = positions[idA] === 'P' ? idA : positions[idB] === 'P' ? idB : plan.pitcherId;
  return { ...plan, positions, pitcherId };
}
