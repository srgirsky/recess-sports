import { describe, it, expect } from 'vitest';
import {
  foldBox,
  todayLine,
  moundLine,
  playerOfTheGame,
  highlights,
  gameScore,
  EMPTY_BOX,
  type BoxEvent,
} from './boxscore';

const hit = (kid: string, bases: 1 | 2 | 3 | 4, rbi = 0, pitcher = 'p'): BoxEvent => ({
  t: 'pa',
  kid,
  pitcher,
  result: { kind: 'hit', bases },
  rbi,
});

describe('foldBox', () => {
  it('counts a plate appearance on both the batter and the pitcher', () => {
    const box = foldBox({}, [
      { t: 'pitch', pitcher: 'p' },
      { t: 'pitch', pitcher: 'p' },
      { t: 'pa', kid: 'a', pitcher: 'p', result: { kind: 'k' }, rbi: 0 },
      { t: 'pitch', pitcher: 'p' },
      { t: 'pa', kid: 'b', pitcher: 'p', result: { kind: 'walk' }, rbi: 1 },
    ]);
    expect(box.a).toMatchObject({ ab: 1, h: 0, so: 1 });
    // A walk is no at-bat, but a bases-loaded walk still drives one in.
    expect(box.b).toMatchObject({ ab: 0, bb: 1, rbi: 1 });
    expect(box.p).toMatchObject({ pt: 3, k: 1, bbAllowed: 1 });
  });

  it('sorts hits by length, and a homer is a hit', () => {
    const box = foldBox({}, [hit('a', 1), hit('a', 2), hit('a', 3), hit('a', 4, 2)]);
    expect(box.a).toMatchObject({ ab: 4, h: 4, doubles: 1, triples: 1, hr: 1, rbi: 2 });
  });

  it('never mutates its input', () => {
    const base = { a: { ...EMPTY_BOX } };
    const next = foldBox(base, [{ t: 'run', kid: 'a' }, { t: 'sb', kid: 'a' }, { t: 'catch', kid: 'a' }]);
    expect(base.a.r).toBe(0);
    expect(next.a).toMatchObject({ r: 1, sb: 1, catches: 1 });
  });
});

describe('the strip lines', () => {
  it('reads like BB2001\'s "today" line, hits first', () => {
    const box = foldBox({}, [hit('a', 4, 3), hit('a', 2), { t: 'pa', kid: 'a', result: { kind: 'out' }, rbi: 0 }]);
    expect(todayLine(box.a)).toBe('2-for-3 · HR · 2B · 3 RBI');
  });

  it('is empty until the kid has batted', () => {
    expect(todayLine(undefined)).toBe('');
    expect(todayLine({ ...EMPTY_BOX, pt: 4 })).toBe('');
    expect(todayLine({ ...EMPTY_BOX, bb: 1 })).toBe('0-for-0 · 1 BB');
  });

  it('reads the mound line in BB2001\'s own abbreviations', () => {
    expect(moundLine(undefined)).toBe('0 PT');
    expect(moundLine({ ...EMPTY_BOX, pt: 14, k: 3, bbAllowed: 1 })).toBe('14 PT · 3 K · 1 BB');
  });

});

describe('playerOfTheGame', () => {
  it('crowns what happened, not who was rated highest', () => {
    const box = foldBox({}, [hit('slugger', 1), hit('bench', 4, 3), { t: 'run', kid: 'bench' }]);
    expect(playerOfTheGame(box, ['slugger', 'bench'])).toBe('bench');
  });

  it('a pitcher and a fielder can win it', () => {
    const box = foldBox({}, [
      hit('a', 1),
      ...Array.from({ length: 5 }, () => ({ t: 'pa', kid: 'x', pitcher: 'ace', result: { kind: 'k' }, rbi: 0 }) as BoxEvent),
    ]);
    expect(playerOfTheGame(box, ['a', 'ace'])).toBe('ace');
  });

  it('only looks at the featured team', () => {
    const box = foldBox({}, [hit('them', 4, 4), hit('us', 1)]);
    expect(playerOfTheGame(box, ['us'])).toBe('us');
  });

  it('a tie goes to the earlier kid in the order', () => {
    const box = foldBox({}, [hit('second', 1), hit('first', 1)]);
    expect(playerOfTheGame(box, ['first', 'second'])).toBe('first');
  });

  it('is null when nobody did anything worth crowning', () => {
    const box = foldBox({}, [{ t: 'pa', kid: 'a', result: { kind: 'k' }, rbi: 0 }]);
    expect(gameScore(box.a)).toBeLessThan(0);
    expect(playerOfTheGame(box, ['a'])).toBeNull();
    expect(playerOfTheGame({}, ['a'])).toBeNull();
  });
});

describe('highlights', () => {
  it('leads with the biggest thing, pluralised', () => {
    const box = foldBox({}, [hit('a', 4, 1), hit('a', 4, 1), hit('a', 2)]);
    expect(highlights(box.a)).toEqual(['2 HOMERS', 'DOUBLE', '2 RBI']);
  });

  it('falls back to the hit line', () => {
    const box = foldBox({}, [hit('a', 1)]);
    expect(highlights(box.a)).toEqual(['1-FOR-1']);
  });
});
