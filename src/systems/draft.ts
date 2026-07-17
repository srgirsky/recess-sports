// ---------------------------------------------------------------------------
// Draft logic. PURE — no Phaser, no DOM. State in, new state out. The scene
// just draws whatever this returns, which keeps the tricky bits testable.
//
// Player and AI alternate picks (player first) until each team has TEAM_SIZE.
// The AI is greedy: it grabs the most valuable kid left. That's what makes
// "leaving a stud on the board" cost you — the AI takes them on its next turn.
// ---------------------------------------------------------------------------

import type { Character } from '../data/types';
import { getCharacter } from '../data/characters';
import { TEAM_SIZE } from '../config';

export interface DraftState {
  pool: string[]; // remaining character ids
  playerTeam: string[];
  aiTeam: string[];
  turn: 'player' | 'ai';
}

export function createDraft(allIds: string[]): DraftState {
  return {
    pool: [...allIds],
    playerTeam: [],
    aiTeam: [],
    turn: 'player',
  };
}

export function isDraftComplete(state: DraftState): boolean {
  return (
    state.playerTeam.length >= TEAM_SIZE && state.aiTeam.length >= TEAM_SIZE
  );
}

/** Apply a pick for whoever's turn it is, returning a new state (never mutates). */
export function applyPick(state: DraftState, id: string): DraftState {
  if (!state.pool.includes(id)) return state;
  const pool = state.pool.filter((x) => x !== id);
  if (state.turn === 'player') {
    return {
      pool,
      playerTeam: [...state.playerTeam, id],
      aiTeam: state.aiTeam,
      turn: 'ai',
    };
  }
  return {
    pool,
    playerTeam: state.playerTeam,
    aiTeam: [...state.aiTeam, id],
    turn: 'player',
  };
}

/**
 * How much the AI wants a given kid. Overall bat value plus a pitching bonus
 * that only kicks in while the AI still needs an arm — so it grabs ~one good
 * pitcher instead of hoarding them.
 */
function draftValue(char: Character, aiNeedsPitcher: boolean): number {
  const bat = char.stats.contact + char.stats.power + char.stats.speed;
  const arm = aiNeedsPitcher ? char.stats.pitching * 1.4 : char.stats.pitching * 0.2;
  return bat + arm;
}

/**
 * Pick the AI's next kid. `rng` (0-1) only breaks ties, so behavior is
 * deterministic-ish but not robotic. Returns the chosen id.
 */
export function chooseAiPick(state: DraftState, rng: () => number): string {
  // Does the AI already have a real pitcher (7+)?
  const aiNeedsPitcher = !state.aiTeam.some(
    (id) => getCharacter(id).stats.pitching >= 7
  );

  let best: string = state.pool[0];
  let bestScore = -Infinity;
  for (const id of state.pool) {
    const score =
      draftValue(getCharacter(id), aiNeedsPitcher) + rng() * 0.5; // tiny jitter
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}
