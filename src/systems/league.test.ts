import { describe, it, expect } from 'vitest';
import { rivalPairs, rivalGames, standings, finalOpponent, finalPending, leagueSeed, YOU } from './league';
import { newSeason, recordSeasonGame, recordFinal, wonChampionship, type GameResult, type SeasonState } from './season';
import { ROSTER } from '../data/characters';
import { SEASON } from '../config';

const ids = ROSTER.map((k) => k.id);

function seededRng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function week(results: GameResult[], seed = 7): SeasonState {
  let s = newSeason(ids.slice(0, 9), { color: 0, logo: 0 }, ids.slice(9), seededRng(seed));
  for (const r of results) s = recordSeasonGame(s, r, []);
  return s;
}

describe('the league schedule', () => {
  it('is a true round robin: every pair of the six teams meets exactly once', () => {
    const met = new Map<string, number>();
    const meet = (a: number, b: number) => {
      const k = [a, b].sort((x, y) => x - y).join('v');
      met.set(k, (met.get(k) ?? 0) + 1);
    };
    for (let day = 0; day < SEASON.GAMES; day++) {
      const playing = new Set<number>([YOU, day]);
      meet(YOU, day); // the player's game that day
      for (const [a, b] of rivalPairs(day)) {
        expect(playing.has(a) || playing.has(b), `day ${day}: someone plays twice`).toBe(false);
        playing.add(a);
        playing.add(b);
        meet(a, b);
      }
      expect(playing.size).toBe(6);
    }
    expect(met.size).toBe(15); // C(6,2)
    for (const n of met.values()) expect(n).toBe(1);
  });

  it('plays out the same way every time for the same week', () => {
    const a = week(['W', 'L', 'W', 'W', 'L']);
    const b = week(['W', 'L', 'W', 'W', 'L']);
    expect(rivalGames(a, 5)).toEqual(rivalGames(b, 5));
    expect(leagueSeed(a)).toBe(leagueSeed(b));
  });

  it('a different week is a different league', () => {
    const seeds = new Set([1, 2, 3, 4, 5].map((n) => leagueSeed(week([], n))));
    expect(seeds.size).toBe(5);
  });
});

describe('the rivals', () => {
  it('are five different teams, whatever colour the player picks', () => {
    for (let color = 0; color < 7; color++) {
      const s = newSeason(ids.slice(0, 9), { color, logo: 0 }, ids.slice(9), seededRng(color));
      const names = new Set(s.rivals.map((r) => `${r.color}/${r.logo}`));
      expect(names.size, `player colour ${color}`).toBe(SEASON.GAMES);
      for (const r of s.rivals) expect(r.color).not.toBe(color);
    }
  });
});

describe('standings', () => {
  it('counts only the days played, and every game has a winner and a loser', () => {
    for (const days of [0, 2, 5]) {
      const s = week((['W', 'L', 'T', 'W', 'L'] as GameResult[]).slice(0, days));
      const rows = standings(s);
      expect(rows).toHaveLength(6);
      const games = rows.reduce((n, r) => n + r.w + r.l + r.t, 0);
      expect(games).toBe(days * 3 * 2); // three games a day, two teams each
      const you = rows.find((r) => r.team === YOU)!;
      expect(you.w + you.l + you.t).toBe(days);
    }
  });

  it('a perfect week is always first, a winless one never makes the final', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const best = week(['W', 'W', 'W', 'W', 'W'], seed);
      expect(standings(best)[0].team).toBe(YOU);
      expect(finalOpponent(best)).not.toBeNull();
      const worst = week(['L', 'L', 'L', 'L', 'L'], seed);
      expect(finalOpponent(worst)).toBeNull();
    }
  });
});

describe('the championship', () => {
  it('waits for Friday, then pairs the top two', () => {
    const s = week(['W', 'W', 'W', 'W']);
    expect(finalOpponent(s)).toBeNull();
    expect(finalPending(s)).toBe(false);
    const done = recordSeasonGame(s, 'W', []);
    const opp = finalOpponent(done)!;
    expect(standings(done).slice(0, 2).map((r) => r.team)).toEqual([YOU, opp]);
    expect(finalPending(done)).toBe(true);
  });

  it('is recorded apart from the five weekdays, and its stats count', () => {
    const s = week(['W', 'W', 'W', 'W', 'W']);
    const opp = finalOpponent(s)!;
    const after = recordFinal(s, opp, 'W', [{ t: 'atBat', kid: ids[0] }, { t: 'hit', kid: ids[0], homer: true }]);
    expect(after.results).toHaveLength(5);
    expect(after.gameIndex).toBe(s.gameIndex);
    expect(after.stats[ids[0]]).toMatchObject({ ab: 1, h: 1, hr: 1 });
    expect(wonChampionship(after)).toBe(true);
    expect(finalPending(after)).toBe(false);
  });
});
