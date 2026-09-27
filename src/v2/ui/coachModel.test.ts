import { describe, expect, it } from 'vitest';
import { COACH_LINES, COACH_TIMES_PER_VERB, Coach, LESSON_COOLDOWN_SEC, timingRing, verbOfHint } from './coachModel';
import { controlHint, type PlayerControlMode } from '../game/controlMode';

describe('the coach says the hint out loud', () => {
  it('every hint controlMode can show names a verb the coach can say', () => {
    const modes: PlayerControlMode[] = ['both', 'batting', 'pitching', 'watch'];
    for (const m of modes)
      for (const half of ['top', 'bottom'] as const)
        for (const phase of ['windup', 'pitch', 'live', 'between'] as const) {
          const h = controlHint(m, half, phase);
          if (h) expect(verbOfHint(h), h).not.toBeNull();
          else expect(verbOfHint(h)).toBeNull();
        }
  });

  it('speaks each verb only on a change, and only a few times per browser', () => {
    let saved = {};
    const c = new Coach({}, (x) => (saved = x));
    const bat = controlHint('both', 'top', 'pitch');
    const watch = controlHint('both', 'top', 'windup');
    expect(c.onHint(bat, 0)).toBe(COACH_LINES.bat);
    expect(c.onHint(bat, 1)).toBeNull(); // repaint, not a change
    let spoken = 1;
    for (let i = 0; i < 10; i++) {
      c.onHint(watch, i);
      if (c.onHint(bat, i)) spoken++;
    }
    expect(spoken).toBe(COACH_TIMES_PER_VERB);
    expect(saved).toMatchObject({ bat: COACH_TIMES_PER_VERB });
    // A new coach reading the saved counts stays quiet about batting.
    const again = new Coach(saved, () => {});
    expect(again.onHint(bat, 0)).toBeNull();
  });

  it('the lesson repeats a verb, but not faster than its cooldown', () => {
    const c = new Coach({ bat: 99 }, () => {}, true);
    const bat = controlHint('both', 'top', 'pitch');
    const watch = controlHint('both', 'top', 'windup');
    expect(c.onHint(bat, 0)).toBe(COACH_LINES.bat);
    c.onHint(watch, 1);
    expect(c.onHint(bat, 2)).toBeNull();
    c.onHint(watch, 3);
    expect(c.onHint(bat, LESSON_COOLDOWN_SEC + 1)).toBe(COACH_LINES.bat);
  });
});

describe('the timing ring closes exactly on the crossing', () => {
  it('starts wide, reaches 1 at the plate, and says NOW only around it', () => {
    expect(timingRing(0, 1.2).scale).toBeGreaterThan(3);
    expect(timingRing(1.2, 1.2).scale).toBe(1);
    expect(timingRing(1.2, 1.2).now).toBe(true);
    expect(timingRing(0.6, 1.2).now).toBe(false);
    expect(timingRing(2, 1.2).scale).toBe(1);
    const a = timingRing(0.3, 1.2).scale;
    const b = timingRing(0.9, 1.2).scale;
    expect(b).toBeLessThan(a);
  });
});
