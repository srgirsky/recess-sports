// ---------------------------------------------------------------------------
// Guards the art pipeline: every roster kid must produce valid SVG in every
// pose with no undefined/NaN leaking in (a param/palette mismatch would show
// as "undefined" in a fill and render nothing).
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { ROSTER } from '../data/characters';
import { buildCharacterSVG, POSES } from './CharacterArt';
import { STREET_POSES } from './textureFactory';

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

  it('long back hair also stays behind the face in side poses', () => {
    const longKid = ROSTER.find((c) => c.visual.hair === 'long');
    expect(longKid).toBeDefined();
    for (const pose of ['bat', 'slide', 'throw', 'dive', 'run1'] as const) {
      const svg = buildCharacterSVG(longKid!.visual, pose);
      const hairIdx = svg.indexOf('M 48 70'); // the long-drape back path
      const faceIdx = svg.indexOf('ff9d9d');
      expect(hairIdx, `${pose}: long drape missing`).toBeGreaterThan(-1);
      expect(hairIdx, `${pose}: long drape drawn over the face`).toBeLessThan(faceIdx);
    }
  });

  it('height scale is anchored at the GROUND line (feet stay planted)', () => {
    // The outer scale wrapper must pivot at (100, 248): a shorter kid's head
    // drops while their shoes stay on the shared ground line.
    for (const char of ROSTER) {
      expect(buildCharacterSVG(char.visual, 'stand')).toContain('translate(100 248)');
    }
  });

  it('BodySpec/FaceSpec values are clamped (a content typo cannot clip the viewBox)', () => {
    const base = ROSTER[0].visual;
    const wild = buildCharacterSVG({
      ...base,
      body: { height: 9, shoulderW: 500, hipW: 99, belly: 7, neck: 40, headW: 5, headH: 5 },
      face: { eyeGap: 90, eyeSize: 9, mouthW: 9, cheeks: 99 },
    });
    const maxed = buildCharacterSVG({
      ...base,
      body: { height: 1, shoulderW: 56, hipW: 10, belly: 1, neck: 6, headW: 1.08, headH: 1.08 },
      face: { eyeGap: 24, eyeSize: 1.3, mouthW: 1.25, cheeks: 1.4 },
    });
    expect(wild).toBe(maxed);
  });

  it('body and face specs actually reshape the art', () => {
    const base = ROSTER[0].visual;
    const plain = buildCharacterSVG(base, 'stand');
    expect(buildCharacterSVG({ ...base, body: { height: 0.85 } }, 'stand')).not.toBe(plain);
    expect(buildCharacterSVG({ ...base, face: { eyeGap: 22 } }, 'stand')).not.toBe(plain);
  });

  it('street clothes render valid SVG for every kid in the draft poses', () => {
    for (const char of ROSTER) {
      expect(char.visual.outfit, `${char.id} has no outfit`).toBeDefined();
      for (const pose of STREET_POSES) {
        const svg = buildCharacterSVG(char.visual, pose, undefined, { street: true });
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg.includes('undefined'), `${char.id}/${pose} street has undefined`).toBe(false);
        expect(svg.includes('NaN'), `${char.id}/${pose} street has NaN`).toBe(false);
        // Street clothes are not a jersey: no chest badge circle.
        expect(svg, `${char.id}/${pose} street shows a jersey badge`).not.toContain('opacity="0.9"/><text');
      }
    }
  });

  it('street outfits differ from the jersey look', () => {
    for (const char of ROSTER) {
      expect(
        buildCharacterSVG(char.visual, 'stand', undefined, { street: true }),
        `${char.id} street === jersey`
      ).not.toBe(buildCharacterSVG(char.visual, 'stand'));
    }
  });

  it('jersey mode ignores the outfit field entirely', () => {
    // The wardrobe plumbing must be invisible outside street mode: a kid with
    // an outfit renders byte-identically to the same kid without one.
    for (const char of ROSTER) {
      const { outfit: _drop, ...noOutfit } = char.visual;
      for (const pose of ['stand', 'bat', 'batRear', 'run1'] as const) {
        expect(
          buildCharacterSVG(char.visual, pose),
          `${char.id}/${pose} jersey render depends on outfit`
        ).toBe(buildCharacterSVG(noOutfit, pose));
      }
    }
  });

  it('every kid is visually unique (no two stand textures identical)', () => {
    const seen = new Map<string, string>();
    for (const char of ROSTER) {
      const svg = buildCharacterSVG(char.visual, 'stand');
      const dup = seen.get(svg);
      expect(dup, `${char.id} renders identically to ${dup}`).toBeUndefined();
      seen.set(svg, char.id);
    }
  });
});
