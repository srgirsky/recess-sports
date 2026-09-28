import { describe, expect, it } from 'vitest';
import { EXTRA_MODES, versusHeadline } from './ModeScreen';

describe('extra modes', () => {
  it('offers a lesson, focused batting, pitching, and a genuinely hands-free game', () => {
    expect(EXTRA_MODES.map((m) => m.id)).toEqual(['lesson', 'versus', 'batting', 'pitching', 'watch']);
    expect(new Set(EXTRA_MODES.map((m) => m.controls))).toEqual(
      new Set(['both', 'versus', 'batting', 'pitching', 'watch'])
    );
    for (const mode of EXTRA_MODES) {
      expect(mode.icon).not.toBe('');
      expect(mode.title).not.toBe('');
      expect(mode.line).not.toBe('');
    }
  });
});

describe('pass and play', () => {
  it('names the winner by player number, and a tie as a tie', () => {
    expect(versusHeadline(3, 1)).toContain('PLAYER 1');
    expect(versusHeadline(1, 3)).toContain('PLAYER 2');
    expect(versusHeadline(2, 2)).toBe('TIE GAME!');
  });
});
