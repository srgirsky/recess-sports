// ---------------------------------------------------------------------------
// The draft, as rules. `DraftScreen.ts` is the thing you tap.
//
// ★ THIS IS THE PRODUCT, NOT A MENU. The root brief's first paragraph: the game
// is a "voting machine" — every draft pick is tallied, and pick rates reveal
// which kids should become toys and shows. A v2 that plays beautifully and logs
// nothing has shipped the demo and left the product behind.
//
// ★ AND THE ONE RULE IS WHICH PICKS COUNT. `picklog.ts` says it plainly: "AI
// picks are intentionally NOT counted — we only want human preference." v1 also
// excludes its ⚡ AUTO fast-forward for the same reason, and both of those are
// invisible failures: a CPU pick that got tallied does not look like anything,
// it just quietly poisons the dataset the whole project exists to gather. So the
// recorder is INJECTED here, which is what lets a test assert exactly which ids
// were voted for rather than trusting that the right branch called the right
// function.
//
// The draft state itself is v1's `systems/draft.ts`, imported and not
// reimplemented: it is pure, it is unit-tested, and `chooseBestPick` is the same
// greedy value the CPU has always used — so leaving a stud on the board costs
// you exactly what it costs in v1.
// ---------------------------------------------------------------------------

import {
  applyPick,
  chooseBestPick,
  createDraft,
  isDraftComplete,
  type DraftState,
} from '../../systems/draft';
import { recordPick } from '../../systems/picklog';

export type { DraftState };
export { isDraftComplete };

/** Records a vote. Injected so a test can see exactly what was counted. */
export type VoteRecorder = (characterId: string) => void;

export function startDraft(allIds: string[]): DraftState {
  return createDraft(allIds);
}

/**
 * A pick the PERSON made. This is the one that votes.
 *
 * The vote is recorded even though `applyPick` may refuse the id (it returns
 * the state unchanged for a kid not in the pool) — so the guard is here, before
 * either happens, and a rejected pick votes for nothing.
 */
export function pickByHuman(
  state: DraftState,
  id: string,
  record: VoteRecorder = recordPick
): DraftState {
  if (state.turn !== 'player' || !state.pool.includes(id)) return state;
  record(id);
  return applyPick(state, id);
}

/**
 * A pick the CPU made. This one does NOT vote, and that is the whole point.
 *
 * Returns the id as well as the state so the screen can show WHICH kid was
 * taken — a draft where the other team's picks just silently vanish from the
 * board reads as kids disappearing.
 */
export function pickByCpu(
  state: DraftState,
  rng: () => number
): { state: DraftState; id: string | null } {
  if (state.turn !== 'ai' || state.pool.length === 0) return { state, id: null };
  const id = chooseBestPick(state, rng);
  return { state: applyPick(state, id), id };
}
