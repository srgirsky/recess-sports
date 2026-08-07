import { describe, expect, it } from 'vitest';
import { EXTRA_MODES } from './ModeScreen';

describe('extra modes', () => {
  it('offers focused batting, pitching, and a genuinely hands-free game', () => {
    expect(EXTRA_MODES.map((m) => m.id)).toEqual(['batting', 'pitching', 'watch']);
    expect(new Set(EXTRA_MODES.map((m) => m.controls))).toEqual(new Set(['batting', 'pitching', 'watch']));
    for (const mode of EXTRA_MODES) {
      expect(mode.icon).not.toBe('');
      expect(mode.title).not.toBe('');
      expect(mode.line).not.toBe('');
    }
  });
});
