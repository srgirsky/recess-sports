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

  it('rear poses show no face', () => {
    // face() always paints the #ff9d9d cheek circles; a rear view must not.
    for (const char of ROSTER) {
      for (const pose of ['batRear', 'catchRear'] as const) {
        expect(
          buildCharacterSVG(char.visual, pose).includes('ff9d9d'),
          `${char.id}/${pose} rendered a face`
        ).toBe(false);
      }
    }
  });

  it('reaction poses override the resting face', () => {
    // The baked reaction must win no matter what expression the kid rests in:
    // upset paints the flipped-arc frown, nervous paints the sweat-bead blue.
    // Neither string appears in any resting expression's face parts.
    for (const char of ROSTER) {
      expect(
        buildCharacterSVG(char.visual, 'upset').includes('q 18 -16 36 0'),
        `${char.id}/upset is missing the frown`
      ).toBe(true);
      expect(
        buildCharacterSVG(char.visual, 'nervous').includes('#9fd8f5'),
        `${char.id}/nervous is missing the sweat bead`
      ).toBe(true);
    }
  });

  it('back hair never covers the face in side poses', () => {
    // The afro's back layer must be drawn BEFORE the face (behind the body),
    // or afro/long-hair kids bat and dive with their face hidden.
    const afroKid = ROSTER.find((c) => c.visual.hair === 'afro');
    expect(afroKid).toBeDefined();
    for (const pose of ['bat', 'slide', 'throw', 'dive', 'run1'] as const) {
      const svg = buildCharacterSVG(afroKid!.visual, pose);
      const afroIdx = svg.indexOf('a56 52 0 0 1 0 104'); // the afro dome path
      const faceIdx = svg.indexOf('ff9d9d'); // face() cheek color
      expect(afroIdx, `${pose}: afro missing`).toBeGreaterThan(-1);
      expect(afroIdx, `${pose}: afro drawn over the face`).toBeLessThan(faceIdx);
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
