import { describe, expect, it } from 'vitest';
import type { AlbumState } from '../../systems/album';
import { clubhouseModel } from './clubhouseModel';

const album: AlbumState = {
  v: 1,
  drafted: { a: 3, b: 1, stale: 99 },
  wonWith: { a: 2, stale: 99 },
  trophies: { b: 2, c: 1, stale: 99 },
};

describe('clubhouseModel', () => {
  it('only counts the current roster and unlocks a trophy winner', () => {
    const model = clubhouseModel(
      album,
      7,
      [
        { id: 'b', name: 'B', count: 4, rate: 0.5 },
        { id: 'a', name: 'A', count: 4, rate: 0.5 },
        { id: 'stale', name: 'Old', count: 20, rate: 0.1 },
        { id: 'c', name: 'C', count: 1, rate: 0.1 },
      ],
      ['a', 'b', 'c', 'd']
    );

    expect(model).toMatchObject({ gamesPlayed: 7, unlocked: 3, total: 4, foils: 1, trophies: 3 });
    expect(model.favorites).toEqual([
      { id: 'a', picks: 4 },
      { id: 'b', picks: 4 },
      { id: 'c', picks: 1 },
    ]);
    expect(model.stickers.find((s) => s.id === 'c')).toMatchObject({ unlocked: true, games: 0, trophies: 1 });
    expect(model.stickers.find((s) => s.id === 'd')).toMatchObject({ unlocked: false, foil: false });
  });

  it('clamps damaged negative counters instead of displaying them', () => {
    const model = clubhouseModel(
      { v: 1, drafted: { a: -3 }, wonWith: { a: -1 }, trophies: { a: -2 } },
      -9,
      [],
      ['a']
    );
    expect(model).toMatchObject({ gamesPlayed: 0, unlocked: 0, foils: 0, trophies: 0 });
    expect(model.stickers[0]).toMatchObject({ games: 0, wins: 0, trophies: 0, unlocked: false });
  });
});
