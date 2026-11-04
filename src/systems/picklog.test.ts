// ---------------------------------------------------------------------------
// The voting machine's one hard rule since the 2026-11 re-cast: a tally counts
// votes for ONE cast. The slot ids did not change when the kids did, so the
// stored object carries the cast it was cast for, and a tally for any other
// cast — or the bare pre-cast `{id: n}` shape — is discarded together with the
// games-played denominator the first time it is read.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from 'vitest';
import { getGamesPlayed, readPickRates, recordGamePlayed, recordPick } from './picklog';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

describe('the pick tally is scoped to a cast', () => {
  it('counts a pick and reads it back under the same cast', () => {
    recordPick('nostrike');
    recordPick('nostrike');
    recordGamePlayed();
    expect(readPickRates()[0]).toMatchObject({ id: 'nostrike', count: 2, rate: 1 });
    expect(getGamesPlayed()).toBe(1);
    expect(JSON.parse(store.get('recess_pickcounts')!).cast).toBe('world1');
  });

  it('discards the pre-cast bare shape, and the games it was counted over', () => {
    store.set('recess_pickcounts', JSON.stringify({ nostrike: 40, calls_shot: 3 }));
    store.set('recess_games_played', '12');
    expect(readPickRates().every((r) => r.count === 0)).toBe(true);
    expect(store.has('recess_pickcounts')).toBe(false);
    expect(getGamesPlayed()).toBe(0);
  });

  it("discards another cast's tally rather than merging it", () => {
    store.set('recess_pickcounts', JSON.stringify({ cast: 'world0', counts: { calls_shot: 9 } }));
    store.set('recess_games_played', '9');
    recordPick('calls_shot');
    const mars = readPickRates().find((r) => r.id === 'calls_shot')!;
    expect(mars.count).toBe(1);
    expect(getGamesPlayed()).toBe(0);
  });

  it('survives a storage that is missing or garbage', () => {
    store.set('recess_pickcounts', '{not json');
    expect(() => readPickRates()).not.toThrow();
    expect(readPickRates().every((r) => r.count === 0)).toBe(true);
  });
});
