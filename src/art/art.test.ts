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

  it('run frames are pairwise distinct (there is an actual 4-frame gait)', () => {
    const RUN = ['run1', 'run2', 'run3', 'run4'] as const;
    for (const char of ROSTER) {
      const svgs = RUN.map((p) => buildCharacterSVG(char.visual, p));
      for (let a = 0; a < RUN.length; a++) {
        for (let b = a + 1; b < RUN.length; b++) {
          expect(svgs[a], `${char.id} ${RUN[a]} === ${RUN[b]}`).not.toBe(svgs[b]);
        }
      }
    }
  });

  it('rear poses show no face', () => {
    // face() always paints the #ff9d9d cheek circles; a rear view must not.
    for (const char of ROSTER) {
      for (const pose of [
        'batRear',
        'catchRear',
        'swingLoadRear',
        'swingMidRear',
        'swingFollowRear',
      ] as const) {
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

  it('dodge leans the upper body away and carries back hair inside the lean', () => {
    for (const char of ROSTER) {
      const svg = buildCharacterSVG(char.visual, 'dodge');
      expect(svg.includes('rotate(-14 100'), `${char.id}/dodge is missing the hip lean`).toBe(true);
    }
    // The lean moves the head far from its anchor — origin-anchored back hair
    // would detach, so the afro dome must sit INSIDE the lean group (after it
    // opens) and still behind the face.
    const afroKid = ROSTER.find((c) => c.visual.hair === 'afro');
    expect(afroKid).toBeDefined();
    const svg = buildCharacterSVG(afroKid!.visual, 'dodge');
    const lean = svg.indexOf('rotate(-14 100');
    const afro = svg.indexOf('a56 52 0 0 1 0 104');
    const face = svg.indexOf('ff9d9d');
    expect(afro, 'dodge: afro missing').toBeGreaterThan(-1);
    expect(afro, 'dodge: back hair outside the lean').toBeGreaterThan(lean);
    expect(afro, 'dodge: afro drawn over the face').toBeLessThan(face);
  });

  it('back hair never covers the face in side poses', () => {
    // The afro's back layer must be drawn BEFORE the face (behind the body),
    // or afro/long-hair kids bat and dive with their face hidden.
    const afroKid = ROSTER.find((c) => c.visual.hair === 'afro');
    expect(afroKid).toBeDefined();
    for (const pose of ['bat', 'slide', 'throw', 'dive', 'run1', 'run3', 'run4', 'swingLoad', 'swingMid', 'swingFollow'] as const) {
      const svg = buildCharacterSVG(afroKid!.visual, pose);
      const afroIdx = svg.indexOf('a56 52 0 0 1 0 104'); // the afro dome path
      const faceIdx = svg.indexOf('ff9d9d'); // face() cheek color
      expect(afroIdx, `${pose}: afro missing`).toBeGreaterThan(-1);
      expect(afroIdx, `${pose}: afro drawn over the face`).toBeLessThan(faceIdx);
    }
  });

  it('the wheelchair kid keeps her wheel in the run frames — and it turns', () => {
    const zoom = ROSTER.find((c) => c.visual.accessory === 'wheelchair');
    expect(zoom).toBeDefined();
    for (const pose of ['run1', 'run2', 'run3', 'run4'] as const) {
      expect(buildCharacterSVG(zoom!.visual, pose)).toContain('<circle cx="92"');
    }
    // The spoke group rotates 22.5° per gait step (1 → 3 → 2 → 4), so the
    // wheel visibly turns instead of sliding.
    expect(buildCharacterSVG(zoom!.visual, 'run3')).toContain('rotate(22.5 92');
    expect(buildCharacterSVG(zoom!.visual, 'run2')).toContain('rotate(45 92');
    expect(buildCharacterSVG(zoom!.visual, 'run4')).toContain('rotate(67.5 92');
  });

  it('long back hair also stays behind the face in side poses', () => {
    const longKid = ROSTER.find((c) => c.visual.hair === 'long');
    expect(longKid).toBeDefined();
    for (const pose of ['bat', 'slide', 'throw', 'dive', 'run1', 'run3', 'run4', 'swingLoad', 'swingMid', 'swingFollow'] as const) {
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
      for (const pose of ['stand', 'bat', 'batRear', 'run1', 'run3', 'windup2', 'swingLoad', 'swingMid', 'swingFollowRear'] as const) {
        expect(
          buildCharacterSVG(char.visual, pose),
          `${char.id}/${pose} jersey render depends on outfit`
        ).toBe(buildCharacterSVG(noOutfit, pose));
      }
    }
  });

  it('swing frames actually differ from the stance and each other', () => {
    // stance → load → contact → follow-through must be four distinct drawings,
    // or the swing sequence animates nothing (mirrors the run-frame guard).
    for (const char of ROSTER) {
      const stance = buildCharacterSVG(char.visual, 'bat');
      const load = buildCharacterSVG(char.visual, 'swingLoad');
      const mid = buildCharacterSVG(char.visual, 'swingMid');
      const follow = buildCharacterSVG(char.visual, 'swingFollow');
      expect(load, `${char.id} swingLoad === bat`).not.toBe(stance);
      expect(mid, `${char.id} swingMid === swingLoad`).not.toBe(load);
      expect(follow, `${char.id} swingFollow === swingMid`).not.toBe(mid);
      const stanceR = buildCharacterSVG(char.visual, 'batRear');
      const loadR = buildCharacterSVG(char.visual, 'swingLoadRear');
      const midR = buildCharacterSVG(char.visual, 'swingMidRear');
      const followR = buildCharacterSVG(char.visual, 'swingFollowRear');
      expect(loadR, `${char.id} swingLoadRear === batRear`).not.toBe(stanceR);
      expect(midR, `${char.id} swingMidRear === swingLoadRear`).not.toBe(loadR);
      expect(followR, `${char.id} swingFollowRear === swingMidRear`).not.toBe(midR);
    }
  });

  it('swing frames keep the bat in hand', () => {
    // Every swing frame must still draw the bat wood — a frame that dropped
    // the batProp call would flash an empty-handed batter mid-swing.
    for (const char of ROSTER) {
      for (const pose of [
        'swingLoad',
        'swingMid',
        'swingFollow',
        'swingLoadRear',
        'swingMidRear',
        'swingFollowRear',
      ] as const) {
        expect(
          buildCharacterSVG(char.visual, pose).includes('#d39a5c'),
          `${char.id}/${pose} lost the bat`
        ).toBe(true);
      }
    }
  });

  it('batting poses grip with real fists (no bare circle hands)', () => {
    // The fist helper paints its knuckle-hint path; the old marble hands did
    // not. Both grips of every batting/swing pose must wear it.
    for (const char of ROSTER) {
      for (const pose of [
        'bat',
        'batRear',
        'swingLoad',
        'swingLoadRear',
        'swingMid',
        'swingMidRear',
      ] as const) {
        expect(
          buildCharacterSVG(char.visual, pose).includes('q 3 2.5 0 5'),
          `${char.id}/${pose} has no fists`
        ).toBe(true);
      }
    }
  });

  it('the bat is a real bat: tapered barrel, flared knob, opposed-thumb grip', () => {
    // The tapered-silhouette path and the knob ellipse are what keep the prop
    // from regressing to a uniform rod; the flipped top fist is what keeps
    // the stacked hands reading as a two-hand grip instead of one blob.
    const TAPER = 'C 9 -56 9 -50 3.5 -44';
    const KNOB = 'rx="6.5" ry="4"';
    for (const char of ROSTER) {
      for (const pose of [
        'bat',
        'batRear',
        'swingLoad',
        'swingLoadRear',
        'swingMid',
        'swingFollow',
        'swingMidRear',
        'swingFollowRear',
      ] as const) {
        const svg = buildCharacterSVG(char.visual, pose);
        expect(svg.includes(TAPER), `${char.id}/${pose} lost the barrel taper`).toBe(true);
        expect(svg.includes(KNOB), `${char.id}/${pose} lost the knob flare`).toBe(true);
        expect(svg.includes(' scale(-1 1)'), `${char.id}/${pose} lost the opposed thumb`).toBe(
          true
        );
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
