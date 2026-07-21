// ---------------------------------------------------------------------------
// Recess Week: season progression, stat folding, awards, persistence.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { SEASON } from '../config';
import { ROSTER } from '../data/characters';
import {
  newSeason,
  recordSeasonGame,
  isWeekOver,
  wonPennant,
  wins,
  getSeason,
  saveSeason,
  clearSeason,
} from './season';
import { foldStats, statLine, EMPTY_LINE, type StatEvent } from './stats';
import { computeAwards } from './awards';

const seq = (nums: number[]) => {
  let i = 0;
  return () => nums[i++ % nums.length];
};

const nine = ROSTER.slice(0, 9).map((c) => c.id);
const bench = ROSTER.map((c) => c.id);
const identity = { color: 0, logo: 0 };

describe('season: the week', () => {
  it('a fresh week has 5 rivals, none wearing your color, all fielding 9', () => {
    const s = newSeason(nine, identity, bench, seq([0.3, 0.7, 0.1, 0.9, 0.5]));
    expect(s.gameIndex).toBe(0);
    expect(s.rivals).toHaveLength(SEASON.GAMES);
    expect(s.rivalTeams).toHaveLength(SEASON.GAMES);
    for (const r of s.rivals) expect(r.color).not.toBe(identity.color);
    for (const team of s.rivalTeams) {
      expect(team).toHaveLength(9);
      for (const id of team) expect(nine).not.toContain(id); // never your own kids
    }
  });

  it('recording games advances the week to the pennant', () => {
    let s = newSeason(nine, identity, bench, seq([0.5]));
    s = recordSeasonGame(s, 'W', []);
    s = recordSeasonGame(s, 'L', []);
    s = recordSeasonGame(s, 'W', []);
    s = recordSeasonGame(s, 'W', []);
    expect(isWeekOver(s)).toBe(false);
    s = recordSeasonGame(s, 'T', []);
    expect(isWeekOver(s)).toBe(true);
    expect(wins(s)).toBe(3);
    expect(wonPennant(s)).toBe(true);
  });

  it('stats accumulate across games', () => {
    let s = newSeason(nine, identity, bench, seq([0.5]));
    const g1: StatEvent[] = [
      { t: 'atBat', kid: 'a' },
      { t: 'hit', kid: 'a', homer: true },
      { t: 'run', kid: 'a' },
    ];
    const g2: StatEvent[] = [
      { t: 'atBat', kid: 'a' },
      { t: 'kThrown', kid: 'p' },
    ];
    s = recordSeasonGame(s, 'W', g1);
    s = recordSeasonGame(s, 'L', g2);
    expect(s.stats['a']).toEqual({ ab: 2, h: 1, hr: 1, r: 1, k: 0 });
    expect(s.stats['p'].k).toBe(1);
  });

  it('persists and survives a round-trip; junk clears to null', () => {
    const store = new Map<string, string>();
    const g = globalThis as { localStorage?: unknown };
    const prev = g.localStorage;
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    try {
      const s = newSeason(nine, identity, bench, seq([0.5]));
      saveSeason(s);
      expect(getSeason()?.playerTeam).toEqual(nine);
      store.set('recess_season', '{"v":999}');
      expect(getSeason()).toBeNull();
      clearSeason();
      expect(getSeason()).toBeNull();
    } finally {
      g.localStorage = prev;
    }
  });
});

describe('stats: folding + display', () => {
  it('folds without mutating the base', () => {
    const base = { a: { ...EMPTY_LINE, h: 1 } };
    const next = foldStats(base, [{ t: 'hit', kid: 'a' }]);
    expect(base.a.h).toBe(1);
    expect(next.a.h).toBe(2);
  });

  it('statLine reads like a scorecard', () => {
    expect(statLine({ ab: 4, h: 2, hr: 1, r: 0, k: 0 })).toBe('2-for-4 · 1 HR');
  });
});

describe('awards', () => {
  it('picks deterministic winners and skips empty categories', () => {
    const stats = {
      a: { ab: 10, h: 6, hr: 2, r: 4, k: 0 },
      b: { ab: 10, h: 3, hr: 3, r: 1, k: 0 },
      p: { ab: 2, h: 0, hr: 0, r: 0, k: 7 },
    };
    const aw = computeAwards(stats, ['a', 'b', 'p']);
    expect(aw.mvp).toBe('a'); // 6+4+4=14 vs 3+6+1=10
    expect(aw.homerKing).toBe('b');
    expect(aw.strikeoutKing).toBe('p');
    const none = computeAwards({ a: { ab: 3, h: 1, hr: 0, r: 0, k: 0 } }, ['a']);
    expect(none.homerKing).toBeNull();
    expect(none.strikeoutKing).toBeNull();
  });
});
