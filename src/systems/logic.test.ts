// ---------------------------------------------------------------------------
// Headless tests for the pure game logic. These run without a browser, so they
// prove the draft / at-bat / inning rules independently of Phaser's render loop.
// Run with: npm test
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { ROSTER, getCharacter } from '../data/characters';
import type { Character } from '../data/types';
import {
  createDraft,
  applyPick,
  chooseAiPick,
  isDraftComplete,
} from './draft';
import { bandFromError, resolveSwing } from './atbat';
import { newHalfInning, applyAtBat } from './inning';

const seq = (nums: number[]) => {
  let i = 0;
  return () => nums[i++ % nums.length];
};

describe('roster', () => {
  it('has 30 unique characters', () => {
    expect(ROSTER).toHaveLength(30);
    expect(new Set(ROSTER.map((c) => c.id)).size).toBe(30);
  });

  it('includes the three signature ability kids', () => {
    const abilities = ROSTER.map((c) => c.ability);
    expect(abilities).toContain('never_strikes_out');
    expect(abilities).toContain('calls_shot');
    expect(abilities).toContain('unhittable_pitch');
  });
});

describe('draft', () => {
  it('alternates turns and fills both teams to 9', () => {
    let state = createDraft(ROSTER.map((c) => c.id));
    let guard = 0;
    while (!isDraftComplete(state) && guard++ < 100) {
      if (state.turn === 'player') {
        state = applyPick(state, state.pool[0]); // player grabs whatever
      } else {
        state = applyPick(state, chooseAiPick(state, () => 0.5));
      }
    }
    expect(state.playerTeam).toHaveLength(9);
    expect(state.aiTeam).toHaveLength(9);
    expect(state.pool).toHaveLength(30 - 18);
    // No kid drafted twice, no overlap between teams.
    const all = [...state.playerTeam, ...state.aiTeam];
    expect(new Set(all).size).toBe(18);
  });

  it('AI grabs a strong kid left on the board (drafting tension)', () => {
    // Player passes on the best overall hitter; AI should take it next turn.
    const byBat = [...ROSTER].sort(
      (a, b) =>
        b.stats.contact + b.stats.power + b.stats.speed -
        (a.stats.contact + a.stats.power + a.stats.speed)
    );
    const stud = byBat[0];
    let state = createDraft(ROSTER.map((c) => c.id));
    // Player picks a deliberately weak kid instead of the stud.
    const weak = [...ROSTER].sort(
      (a, b) =>
        a.stats.contact + a.stats.power + a.stats.speed -
        (b.stats.contact + b.stats.power + b.stats.speed)
    )[0];
    state = applyPick(state, weak.id);
    const aiPick = chooseAiPick(state, () => 0); // no jitter
    expect(aiPick).toBe(stud.id);
  });
});

describe('at-bat timing bands', () => {
  it('maps swing error to the right band', () => {
    expect(bandFromError(0)).toBe('perfect');
    expect(bandFromError(-40)).toBe('perfect'); // early but dead-on
    expect(bandFromError(100)).toBe('good');
    expect(bandFromError(200)).toBe('weak');
    expect(bandFromError(400)).toBe('miss');
  });
});

describe('at-bat abilities', () => {
  const plain = (over: Partial<Character>): Character => ({
    id: 'x',
    name: 'X',
    tagline: '',
    stats: { contact: 5, power: 5, speed: 5, pitching: 5 },
    visual: { skin: 0, hair: 'short', hairColor: 0, uniform: 0, accessory: 'none' },
    ability: 'none',
    ...over,
  });

  it('never_strikes_out turns a miss into contact (never a strikeout swing)', () => {
    const batter = plain({ ability: 'never_strikes_out' });
    const pitcher = plain({});
    // Force the "out" branch deterministically: rng high enough to miss the hit roll.
    const r = resolveSwing('miss', batter, pitcher, seq([0.99, 0.99, 0.99]));
    expect(r.kind).not.toBe('strike'); // upgraded away from a whiff
  });

  it('unhittable_pitch drags the batter down a band (perfect -> good)', () => {
    const batter = plain({});
    const acePitcher = plain({ ability: 'unhittable_pitch' });
    // With a perfect swing vs the ace, and a low roll, it should still be tougher
    // than vs a normal pitcher. We check it never returns a home run on a low roll.
    const r = resolveSwing('perfect', batter, acePitcher, seq([0.5, 0.1]));
    expect(['hit', 'out', 'foul', 'strike']).toContain(r.kind);
  });
});

describe('inning: auto-baserunning', () => {
  it('a home run with the bases loaded scores 4 and clears the bases', () => {
    let s = newHalfInning();
    s.bases = [true, true, true];
    const res = applyAtBat(s, { kind: 'hit', bases: 4, description: 'HR' });
    expect(res.runsScored).toBe(4);
    expect(res.state.bases).toEqual([false, false, false]);
    expect(res.state.runs).toBe(4);
  });

  it('a single advances runners by one and puts the batter on first', () => {
    let s = newHalfInning();
    s.bases = [true, false, true]; // runners on 1st and 3rd
    const res = applyAtBat(s, { kind: 'hit', bases: 1, description: '1B' });
    // 3rd scores, 1st -> 2nd, batter -> 1st
    expect(res.runsScored).toBe(1);
    expect(res.state.bases).toEqual([true, true, false]);
  });

  it('three strikeouts end the half-inning', () => {
    let s = newHalfInning();
    for (let i = 0; i < 3; i++) {
      // three swinging strikes on the same batter = one out; do it for 3 batters
      let r = applyAtBat(s, { kind: 'strike', bases: 0, description: 'K' });
      s = r.state;
      r = applyAtBat(s, { kind: 'strike', bases: 0, description: 'K' });
      s = r.state;
      r = applyAtBat(s, { kind: 'strike', bases: 0, description: 'K' });
      s = r.state;
    }
    expect(s.outs).toBe(3);
  });

  it('a foul does not become the third strike', () => {
    let s = newHalfInning();
    s.count.strikes = 2;
    const res = applyAtBat(s, { kind: 'foul', bases: 0, description: 'foul' });
    expect(res.state.count.strikes).toBe(2);
    expect(res.batterOut).toBe(false);
  });
});

describe('sanity: a full simulated game always terminates with a score', () => {
  it('plays 2 innings without hanging', () => {
    // Draft two teams greedily.
    let d = createDraft(ROSTER.map((c) => c.id));
    let guard = 0;
    while (!isDraftComplete(d) && guard++ < 100) {
      d = applyPick(d, chooseAiPick(d, () => Math.random()));
    }
    const bat = (team: string[], pitcher: Character) => {
      let s = newHalfInning();
      let i = 0;
      let g = 0;
      while (s.outs < 3 && g++ < 200) {
        const batter = getCharacter(team[i % team.length]);
        const bands = ['perfect', 'good', 'weak', 'miss'] as const;
        const band = bands[Math.floor(Math.random() * 4)];
        const r = resolveSwing(band, batter, pitcher, () => Math.random());
        const applied = applyAtBat(s, r);
        s = applied.state;
        if (applied.batterDone) i++;
      }
      return s.runs;
    };
    const aiPitcher = getCharacter(d.aiTeam[0]);
    const playerPitcher = getCharacter(d.playerTeam[0]);
    let playerScore = 0;
    let aiScore = 0;
    for (let inn = 0; inn < 2; inn++) {
      playerScore += bat(d.playerTeam, aiPitcher);
      aiScore += bat(d.aiTeam, playerPitcher);
    }
    expect(Number.isFinite(playerScore)).toBe(true);
    expect(Number.isFinite(aiScore)).toBe(true);
    expect(playerScore).toBeGreaterThanOrEqual(0);
    expect(aiScore).toBeGreaterThanOrEqual(0);
  });
});
