// ---------------------------------------------------------------------------
// ★ THE ONE INVARIANT THE WHOLE PROJECT RESTS ON: only a person's pick votes.
//
// `picklog.ts`: "AI picks are intentionally NOT counted — we only want human
// preference." A CPU pick that gets tallied does not look like anything. There
// is no crash, no wrong number on screen, no red test — it just quietly poisons
// the one dataset the game exists to gather, and nobody finds out until someone
// asks which characters to make toys of.
//
// That is why the recorder is injected rather than called directly: this asserts
// the exact set of ids that were voted for, instead of trusting that the right
// branch happened to call the right function.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { CUSTOM_PLAYER_ID, ROSTER } from '../../data/characters';
import { makeRng } from '../sim/rng';
import { isDraftComplete, pickByCpu, pickByHuman, startDraft } from './draftSession';

const ALL = ROSTER.map((c) => c.id);

/** Play a whole draft, recording every vote. Returns the votes and the teams. */
function runDraft(seed: string, choose: (pool: string[]) => string) {
  const votes: string[] = [];
  const rng = makeRng(seed);
  let state = startDraft(ALL);
  let guard = 0;
  while (!isDraftComplete(state) && guard++ < 200) {
    if (state.turn === 'player') {
      state = pickByHuman(state, choose(state.pool), (id) => votes.push(id));
    } else {
      state = pickByCpu(state, rng).state;
    }
  }
  return { votes, state };
}

describe('★ only a person’s pick votes', () => {
  it('★ records every human pick and not one CPU pick', () => {
    const { votes, state } = runDraft('a', (pool) => pool[0]);

    expect(isDraftComplete(state), 'the draft did not finish').toBe(true);
    expect(votes).toEqual(state.playerTeam);
    // The teams are the same size, so a recorder that counted everything would
    // have exactly twice as many entries — assert the CPU's are absent by
    // IDENTITY, not by count, or a swapped pair would pass.
    for (const id of state.aiTeam) {
      expect(votes, `${id} was drafted by the CPU and got a vote`).not.toContain(id);
    }
    expect(votes).toHaveLength(9);
  });

  it('★ votes for the kid that was actually taken, in order', () => {
    // A recorder wired to the wrong id — the previous pick, the CPU's last one,
    // the first of the pool — produces a plausible-looking tally that is wrong
    // about every character. Pick deliberately from the END of the pool so an
    // off-by-one or a "first available" bug cannot coincide with the answer.
    const { votes, state } = runDraft('b', (pool) => pool[pool.length - 1]);
    expect(votes).toEqual(state.playerTeam);
  });

  it('does not vote for a pick the draft refuses', () => {
    const votes: string[] = [];
    const state = startDraft(ALL);
    const after = pickByHuman(state, 'not-a-real-kid', (id) => votes.push(id));
    expect(votes, 'a rejected pick still voted').toEqual([]);
    expect(after).toBe(state);
  });

  it('does not vote out of turn', () => {
    // The screen should not offer a pick on the CPU's turn, but "should not"
    // is not a guarantee — a double tap arrives before the CPU has answered.
    const votes: string[] = [];
    let state = startDraft(ALL);
    state = pickByHuman(state, ALL[0], (id) => votes.push(id));
    expect(state.turn).toBe('ai');
    const after = pickByHuman(state, ALL[1], (id) => votes.push(id));
    expect(votes, 'a tap during the CPU turn voted').toEqual([ALL[0]]);
    expect(after).toBe(state);
  });
});

describe('the CPU', () => {
  it('names the kid it took, so the board can show them leaving', () => {
    const rng = makeRng('c');
    let state = startDraft(ALL);
    state = pickByHuman(state, ALL[3], () => {});
    const { state: next, id } = pickByCpu(state, rng);
    expect(id).not.toBeNull();
    expect(next.aiTeam).toContain(id!);
    expect(next.pool).not.toContain(id!);
  });

  it('declines to pick on the human’s turn', () => {
    const state = startDraft(ALL);
    const { state: same, id } = pickByCpu(state, () => 0.5);
    expect(id).toBeNull();
    expect(same).toBe(state);
  });

  it('leaves nine and nine from one pool, with nobody drafted twice', () => {
    const { state } = runDraft('d', (pool) => pool[0]);
    const both = [...state.playerTeam, ...state.aiTeam];
    expect(both).toHaveLength(18);
    expect(new Set(both).size, 'a kid was drafted by both teams').toBe(18);
    for (const id of both) expect(state.pool).not.toContain(id);
  });
});

describe('a custom captain', () => {
  it('starts one captain on each side and records only eight authored picks', () => {
    const votes: string[] = [];
    const rng = makeRng('captains');
    let state = startDraft(ALL, { player: CUSTOM_PLAYER_ID, rng });
    expect(state.playerTeam).toEqual([CUSTOM_PLAYER_ID]);
    expect(state.aiTeam).toHaveLength(1);
    expect(state.pool).not.toContain(state.aiTeam[0]);
    expect(state.pool).not.toContain(CUSTOM_PLAYER_ID);

    let guard = 0;
    while (!isDraftComplete(state) && guard++ < 200) {
      state = state.turn === 'player'
        ? pickByHuman(state, state.pool[0], (id) => votes.push(id))
        : pickByCpu(state, rng).state;
    }
    expect(isDraftComplete(state)).toBe(true);
    expect(state.playerTeam).toHaveLength(9);
    expect(state.aiTeam).toHaveLength(9);
    expect(votes).toEqual(state.playerTeam.slice(1));
    expect(votes).toHaveLength(8);
  });
});
