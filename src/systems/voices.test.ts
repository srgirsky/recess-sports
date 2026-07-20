// ---------------------------------------------------------------------------
// Voice-profile tests: derived kid voices are stable, in range, spread out
// across the roster, and nudged by expression in the right direction.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { commentatorProfile, kidVoice } from './voices';
import { VOICE } from '../config';
import { ROSTER } from '../data/characters';
import type { VisualParams } from '../data/types';

const visual = (expression?: VisualParams['expression']): VisualParams => ({
  skin: 0,
  hair: 'short',
  hairColor: 0,
  uniform: 0,
  accessory: 'none',
  expression,
});

describe('voices', () => {
  it('the two commentators have distinct profiles', () => {
    const a = commentatorProfile('A');
    const b = commentatorProfile('B');
    expect(a.pitch).not.toBe(b.pitch);
    expect(a.rate).not.toBe(b.rate);
    expect(a.voiceIdx).not.toBe(b.voiceIdx);
  });

  it('same id always yields the same profile', () => {
    for (const c of ROSTER) {
      expect(kidVoice(c)).toEqual(kidVoice(c));
    }
  });

  it('every roster kid stays inside the config ranges', () => {
    const K = VOICE.KID;
    for (const c of ROSTER) {
      const v = kidVoice(c);
      expect(v.pitch, c.id).toBeGreaterThanOrEqual(K.PITCH_MIN);
      expect(v.pitch, c.id).toBeLessThanOrEqual(K.PITCH_MAX);
      expect(v.rate, c.id).toBeGreaterThanOrEqual(K.RATE_MIN);
      expect(v.rate, c.id).toBeLessThanOrEqual(K.RATE_MAX);
      expect([0, 1]).toContain(v.voiceIdx);
    }
  });

  it('voices spread out across the roster (not everyone sounds the same)', () => {
    const pitches = new Set(ROSTER.map((c) => kidVoice(c).pitch));
    expect(pitches.size).toBeGreaterThanOrEqual(8);
  });

  it('expression nudges shift the voice in the expected direction', () => {
    // Same id → same hash roll, so the delta between expressions IS the nudge
    // (unless clamping eats it — pick a mid-range id-free comparison instead:
    // cool must never be higher-pitched than goofy for the same kid).
    for (const c of ROSTER) {
      const cool = kidVoice({ id: c.id, visual: visual('cool') });
      const goofy = kidVoice({ id: c.id, visual: visual('goofy') });
      expect(cool.pitch).toBeLessThanOrEqual(goofy.pitch);
      expect(cool.rate).toBeLessThanOrEqual(goofy.rate);
    }
  });
});
