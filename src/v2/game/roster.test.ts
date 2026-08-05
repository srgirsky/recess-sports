// ---------------------------------------------------------------------------
// ★ A KID THE SCENE NEVER BUILT PLAYS THE WHOLE GAME INVISIBLE.
//
// `GameView.start()` built `ROSTER.slice(0, 18)`, which was the entire cast
// while the two teams WERE the first eighteen in roster order. The draft made
// that a bug in one PR: a player picks their own nine, the teams scatter across
// all thirty, and anyone past index 17 has no scene object. `showOnly` and
// `applyIdleDefence` both do `refs.kids.get(id)` and skip a miss, so he bats, he
// fields, he is announced, and there is nobody there. No error. No warning.
//
// Found by drafting from the BACK of the board, which is exactly the shape of
// test that a "pick the first available" sweep never produces.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { ROSTER, getCharacter } from '../../data/characters';
import { makeRng } from '../sim/rng';
import { isDraftComplete, pickByCpu, pickByHuman, startDraft } from '../ui/draftSession';
import { GameView } from './GameView';

const ALL = ROSTER.map((c) => c.id);

describe('★ everyone who can be fielded has a body', () => {
  it('★ catches the exact bug that shipped: the first eighteen, and a late pick', () => {
    // The historical scene: ROSTER[0..17] built, and a draft that reached past it.
    const built = new Set(ALL.slice(0, 18));
    const drafted = [ALL[29], ALL[25], ALL[3]];
    expect(GameView.missingFromScene(drafted, built)).toEqual([ALL[29], ALL[25]]);
  });

  it('★ is satisfied by the whole roster, which is what start() now builds', () => {
    const built = new Set(ALL);
    expect(GameView.missingFromScene(ALL, built)).toEqual([]);
  });

  it('★ a real draft can reach every corner of the roster', () => {
    // The reason the scene must cover ALL of it rather than any slice: play a
    // draft that takes the last kid on the board each time and the teams
    // genuinely land outside the first eighteen.
    const rng = makeRng('back');
    let state = startDraft(ALL);
    let guard = 0;
    while (!isDraftComplete(state) && guard++ < 200) {
      state =
        state.turn === 'player'
          ? pickByHuman(state, state.pool[state.pool.length - 1], () => {})
          : pickByCpu(state, rng).state;
    }
    const fielded = [...state.playerTeam, ...state.aiTeam];
    const late = fielded.filter((id) => ALL.indexOf(id) >= 18);
    expect(late.length, 'no draft reached past roster index 17').toBeGreaterThan(0);

    // Against the old scene those kids were invisible; against the new one they
    // are not. Both halves asserted, so the fix cannot be undone quietly.
    expect(GameView.missingFromScene(fielded, new Set(ALL.slice(0, 18))).length).toBeGreaterThan(0);
    expect(GameView.missingFromScene(fielded, new Set(ALL))).toEqual([]);
  });

  it('names the kid, not just a count — a bare number is unactionable', () => {
    const missing = GameView.missingFromScene([ALL[20]], new Set(ALL.slice(0, 18)));
    expect(missing).toEqual([ALL[20]]);
    expect(getCharacter(missing[0]).name.length).toBeGreaterThan(0);
  });
});
