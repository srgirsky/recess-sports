// ---------------------------------------------------------------------------
// Voice-profile tests: derived kid voices are stable, in range, spread out
// across the roster, and nudged by expression in the right direction.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { commentatorProfile, kidVoice, rankVoices } from './voices';
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
      expect(Number.isInteger(v.voiceIdx), c.id).toBe(true);
      expect(v.voiceIdx, c.id).toBeGreaterThanOrEqual(0);
      expect(v.voiceIdx, c.id).toBeLessThan(VOICE.PICK.TOP_N);
    }
  });

  it('voices spread out across the roster (not everyone sounds the same)', () => {
    const pitches = new Set(ROSTER.map((c) => kidVoice(c).pitch));
    expect(pitches.size).toBeGreaterThanOrEqual(8);
    // Kids should also land on several different base voices.
    const idxes = new Set(ROSTER.map((c) => kidVoice(c).voiceIdx));
    expect(idxes.size).toBeGreaterThanOrEqual(2);
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

describe('rankVoices', () => {
  const v = (name: string, lang = 'en-US') => ({ name, lang });

  it('Chrome/macOS: Google voices win, novelty voices are dropped', () => {
    const ranked = rankVoices([
      v('Albert'),
      v('Bad News'),
      v('Samantha'),
      v('Zarvox'),
      v('Karen', 'en-AU'),
      v('Google US English'),
      v('Google UK English Female', 'en-GB'),
    ]);
    expect(ranked[0].name).toBe('Google US English');
    const names = ranked.map((r) => r.name);
    expect(names).not.toContain('Albert');
    expect(names).not.toContain('Bad News');
    expect(names).not.toContain('Zarvox');
    expect(names).toContain('Samantha');
  });

  it('Edge/Windows: the child voice Ana ranks first, neural before plain', () => {
    const ranked = rankVoices([
      v('Microsoft David - English (United States)'),
      v('Microsoft Aria Online (Natural) - English (United States)'),
      v('Microsoft Ana Online (Natural) - English (United States)'),
    ]);
    expect(ranked[0].name).toContain('Ana');
    expect(ranked.map((r) => r.name).indexOf('Microsoft Aria Online (Natural) - English (United States)')).toBeLessThan(
      ranked.map((r) => r.name).indexOf('Microsoft David - English (United States)'),
    );
  });

  it('Safari/Firefox on mac: Samantha outranks the deep voices', () => {
    const ranked = rankVoices([v('Fred'), v('Albert'), v('Samantha'), v('Ralph')]);
    expect(ranked[0].name).toBe('Samantha');
  });

  it('caps at TOP_N and returns everything when the input is shorter', () => {
    const many = Array.from({ length: 10 }, (_, i) => v(`Voice ${i}`));
    expect(rankVoices(many)).toHaveLength(VOICE.PICK.TOP_N);
    expect(rankVoices([v('Solo')])).toHaveLength(1);
  });

  it('dedupes by name', () => {
    const ranked = rankVoices([v('Samantha'), v('Samantha'), v('Karen', 'en-AU')]);
    expect(ranked.filter((r) => r.name === 'Samantha')).toHaveLength(1);
  });

  it('never empties a non-empty input, even if every voice is on the avoid list', () => {
    const ranked = rankVoices([v('Zarvox'), v('Bubbles')]);
    expect(ranked.length).toBeGreaterThan(0);
  });

  it('empty in, empty out; unmatched inventories keep browser order', () => {
    expect(rankVoices([])).toEqual([]);
    const plain = [v('Voice A'), v('Voice B', 'fr-FR'), v('Voice C', 'de-DE')];
    // A gets the preferred-lang bonus; B and C tie at 0 and keep input order.
    expect(rankVoices(plain).map((r) => r.name)).toEqual(['Voice A', 'Voice B', 'Voice C']);
  });
});
