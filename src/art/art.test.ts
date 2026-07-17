// ---------------------------------------------------------------------------
// Guards the art pipeline: every roster kid must produce valid SVG with no
// undefined values leaking in (a param/palette mismatch would show as
// "undefined" in a fill and render nothing).
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { ROSTER } from '../data/characters';
import { buildCharacterSVG } from './CharacterArt';

describe('character art', () => {
  it('produces valid SVG for every kid', () => {
    for (const char of ROSTER) {
      const svg = buildCharacterSVG(char.visual);
      expect(svg.startsWith('<svg'), `${char.id} should start with <svg`).toBe(true);
      expect(svg.includes('</svg>')).toBe(true);
      expect(svg.includes('undefined'), `${char.id} has an undefined value`).toBe(false);
      expect(svg.includes('NaN'), `${char.id} has a NaN value`).toBe(false);
    }
  });
});
