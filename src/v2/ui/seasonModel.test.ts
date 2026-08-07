import { describe, expect, it } from 'vitest';
import { foldStats, type KidStats } from '../../systems/stats';
import { newSeason, recordSeasonGame } from '../../systems/season';
import { seasonModel, statEventsFromLines } from './seasonModel';

describe('seasonModel', () => {
  it('turns the shared week into five scheduled day slots', () => {
    let s = newSeason(
      Array.from({ length: 9 }, (_, i) => `p${i}`),
      { color: 0, logo: 0 },
      Array.from({ length: 20 }, (_, i) => `b${i}`),
      () => 0.25
    );
    s = recordSeasonGame(s, 'W', []);
    s = recordSeasonGame(s, 'L', []);
    const model = seasonModel(s);
    expect(model).toMatchObject({ wins: 1, losses: 1, ties: 0, over: false });
    expect(model.days).toHaveLength(5);
    expect(model.days.map((d) => d.result)).toEqual(['W', 'L', null, null, null]);
    expect(model.days.filter((d) => d.next).map((d) => d.day)).toEqual(['WED']);
  });

  it('round-trips v2 folded lines through the shared event reducer', () => {
    const lines: Record<string, KidStats> = {
      a: { ab: 4, h: 2, hr: 1, r: 2, k: 0 },
      b: { ab: 3, h: 0, hr: 0, r: 0, k: 5 },
    };
    expect(foldStats({}, statEventsFromLines(lines))).toEqual(lines);
  });

  it('turns Friday into pennant awards from accumulated stats', () => {
    let s = newSeason(
      Array.from({ length: 9 }, (_, i) => `p${i}`),
      { color: 0, logo: 0 },
      Array.from({ length: 20 }, (_, i) => `b${i}`),
      () => 0.4
    );
    for (const result of ['W', 'W', 'L', 'W', 'T'] as const) s = recordSeasonGame(s, result, []);
    s.stats = { p0: { ab: 4, h: 3, hr: 1, r: 2, k: 0 } };
    const model = seasonModel(s);
    expect(model).toMatchObject({ over: true, pennant: true, wins: 3 });
    expect(model.awards.map((a) => a.id)).toContain('p0');
  });
});
