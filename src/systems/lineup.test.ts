// ---------------------------------------------------------------------------
// Lineup planning tests: auto-assign always yields a valid, sensible plan and
// the two swap edits preserve validity.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { ROSTER, getCharacter } from '../data/characters';
import { autoAssign, validateLineup, swapOrder, swapPositions } from './lineup';

const teamOf = (start: number) => ROSTER.slice(start, start + 9).map((c) => c.id);

describe('lineup: autoAssign', () => {
  it('produces a valid plan for any 9 kids', () => {
    for (const start of [0, 5, 9, 13, 21]) {
      const team = teamOf(start);
      const plan = autoAssign(team);
      expect(validateLineup(plan, team)).toBe(true);
    }
  });

  it('the best arm takes the mound', () => {
    const team = teamOf(0);
    const plan = autoAssign(team);
    const best = [...team].sort(
      (a, b) => getCharacter(b).stats.pitching - getCharacter(a).stats.pitching
    )[0];
    expect(plan.pitcherId).toBe(best);
    expect(plan.positions[best]).toBe('P');
  });

  it('the leadoff kid out-tables the ninth hitter', () => {
    const plan = autoAssign(teamOf(0));
    const table = (id: string) => {
      const s = getCharacter(id).stats;
      return s.contact * 2 + s.speed;
    };
    expect(table(plan.order[0])).toBeGreaterThanOrEqual(table(plan.order[8]));
  });
});

describe('lineup: edits', () => {
  it('swapOrder permutes without breaking validity', () => {
    const team = teamOf(0);
    let plan = autoAssign(team);
    plan = swapOrder(plan, 0, 8);
    expect(validateLineup(plan, team)).toBe(true);
  });

  it('swapPositions trades gloves and follows the mound', () => {
    const team = teamOf(0);
    let plan = autoAssign(team);
    const someInfielder = plan.order.find((id) => plan.positions[id] === 'SS')!;
    plan = swapPositions(plan, plan.pitcherId, someInfielder);
    expect(validateLineup(plan, team)).toBe(true);
    expect(plan.positions[someInfielder]).toBe('P');
    expect(plan.pitcherId).toBe(someInfielder);
  });
});
