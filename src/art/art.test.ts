// ---------------------------------------------------------------------------
// Guards the art pipeline: every roster kid must produce valid SVG in every
// pose with no undefined/NaN leaking in (a param/palette mismatch would show
// as "undefined" in a fill and render nothing).
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { ROSTER } from '../data/characters';
import { buildCharacterSVG, POSES } from './CharacterArt';

describe('character art', () => {
  it('produces valid SVG for every kid in every pose', () => {
    for (const char of ROSTER) {
      for (const pose of POSES) {
        const svg = buildCharacterSVG(char.visual, pose);
        expect(svg.startsWith('<svg'), `${char.id}/${pose} should start with <svg`).toBe(true);
        expect(svg.includes('</svg>')).toBe(true);
        expect(svg.includes('undefined'), `${char.id}/${pose} has an undefined value`).toBe(false);
        expect(svg.includes('NaN'), `${char.id}/${pose} has a NaN value`).toBe(false);
      }
    }
  });

  it('defaults to the stand pose', () => {
    for (const char of ROSTER) {
      expect(buildCharacterSVG(char.visual)).toBe(buildCharacterSVG(char.visual, 'stand'));
    }
  });

  it('run frames differ (there is an actual cycle to animate)', () => {
    for (const char of ROSTER) {
      expect(
        buildCharacterSVG(char.visual, 'run1'),
        `${char.id} run1 === run2`
      ).not.toBe(buildCharacterSVG(char.visual, 'run2'));
    }
  });

  it('the wheelchair kid keeps her wheel in the run frames', () => {
    const zoom = ROSTER.find((c) => c.visual.accessory === 'wheelchair');
    expect(zoom).toBeDefined();
    for (const pose of ['run1', 'run2'] as const) {
      expect(buildCharacterSVG(zoom!.visual, pose)).toContain('<circle cx="92"');
    }
  });
});
