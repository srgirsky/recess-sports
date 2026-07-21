// ---------------------------------------------------------------------------
// Voice-profile tests: derived kid voices are stable, in range (inside their
// gender pitch band), spread out across the roster, nudged by expression in
// the right direction — and the curated voice lists partition by gender with
// a graceful fallback when a browser offers no gender-marked voices.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { commentatorProfile, curateVoices, kidVoice, pickVoice, rankVoices } from './voices';
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

  it('every roster kid has a voiceGender the profile carries through', () => {
    for (const c of ROSTER) {
      expect(['boy', 'girl'], c.id).toContain(c.voiceGender);
      expect(kidVoice(c).voiceGender, c.id).toBe(c.voiceGender);
    }
  });

  it('every roster kid stays inside the config ranges and their gender pitch band', () => {
    const K = VOICE.KID;
    for (const c of ROSTER) {
      const band = K.GENDER_PITCH[c.voiceGender];
      const v = kidVoice(c);
      expect(v.pitch, c.id).toBeGreaterThanOrEqual(band.MIN);
      expect(v.pitch, c.id).toBeLessThanOrEqual(band.MAX);
      // The bands sit inside the global range, so the old invariant still holds.
      expect(v.pitch, c.id).toBeGreaterThanOrEqual(K.PITCH_MIN);
      expect(v.pitch, c.id).toBeLessThanOrEqual(K.PITCH_MAX);
      expect(v.rate, c.id).toBeGreaterThanOrEqual(K.RATE_MIN);
      expect(v.rate, c.id).toBeLessThanOrEqual(K.RATE_MAX);
      expect(Number.isInteger(v.voiceIdx), c.id).toBe(true);
      expect(v.voiceIdx, c.id).toBeGreaterThanOrEqual(0);
      expect(v.voiceIdx, c.id).toBeLessThan(VOICE.PICK.TOP_N);
    }
  });

  it('girls pitch above boys on average (the no-gendered-voices fallback tell)', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const boys = ROSTER.filter((c) => c.voiceGender === 'boy').map((c) => kidVoice(c).pitch);
    const girls = ROSTER.filter((c) => c.voiceGender === 'girl').map((c) => kidVoice(c).pitch);
    expect(boys.length).toBeGreaterThan(0);
    expect(girls.length).toBeGreaterThan(0);
    expect(mean(girls)).toBeGreaterThan(mean(boys));
  });

  it('voices spread out across the roster (not everyone sounds the same)', () => {
    const pitches = new Set(ROSTER.map((c) => kidVoice(c).pitch));
    expect(pitches.size).toBeGreaterThanOrEqual(8);
    // Kids should land on several different base voices — within each gender
    // sublist too, or all boys (or girls) would share one voice.
    for (const g of ['boy', 'girl'] as const) {
      const idxes = new Set(ROSTER.filter((c) => c.voiceGender === g).map((c) => kidVoice(c).voiceIdx));
      expect(idxes.size, g).toBeGreaterThanOrEqual(2);
    }
  });

  it('expression nudges shift the voice in the expected direction', () => {
    // Same id → same hash roll, so the delta between expressions IS the nudge
    // (unless clamping eats it — pick a mid-range id-free comparison instead:
    // cool must never be higher-pitched than goofy for the same kid).
    for (const c of ROSTER) {
      const cool = kidVoice({ id: c.id, visual: visual('cool'), voiceGender: c.voiceGender });
      const goofy = kidVoice({ id: c.id, visual: visual('goofy'), voiceGender: c.voiceGender });
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

describe('curateVoices / pickVoice', () => {
  const v = (name: string, lang = 'en-US') => ({ name, lang });
  const boyProfile = { pitch: 1.1, rate: 1, voiceIdx: 0, voiceGender: 'boy' as const };
  const girlProfile = { pitch: 1.3, rate: 1, voiceIdx: 0, voiceGender: 'girl' as const };

  it('Edge/Windows inventory partitions into disjoint boy/girl sublists', () => {
    const c = curateVoices([
      v('Microsoft David - English (United States)'),
      v('Microsoft Guy Online (Natural) - English (United States)'),
      v('Microsoft Aria Online (Natural) - English (United States)'),
      v('Microsoft Jenny Online (Natural) - English (United States)'),
      v('Microsoft Ana Online (Natural) - English (United States)'),
    ]);
    const names = (vs: { name: string }[]) => vs.map((x) => x.name);
    expect(names(c.girl).join()).toMatch(/Ana/);
    expect(names(c.girl).join()).toMatch(/Aria/);
    expect(names(c.girl).join()).toMatch(/Jenny/);
    expect(names(c.boy).join()).toMatch(/David/);
    expect(names(c.boy).join()).toMatch(/Guy/);
    for (const b of names(c.boy)) expect(names(c.girl)).not.toContain(b);
  });

  it('macOS inventory partitions and each sublist preserves rank order', () => {
    const c = curateVoices([v('Daniel', 'en-GB'), v('Samantha'), v('Junior'), v('Karen', 'en-AU'), v('Tessa', 'en-ZA'), v('Alex')]);
    expect(c.girl.map((x) => x.name)).toContain('Samantha');
    expect(c.girl.map((x) => x.name)).toContain('Karen');
    expect(c.boy.map((x) => x.name)).toContain('Daniel');
    // Junior is tier-1 (a real child voice) so it must lead the boy sublist.
    expect(c.boy[0].name).toBe('Junior');
  });

  it('unmarked voices land only in mixed; sublists cap at TOP_N', () => {
    const c = curateVoices([v('Google US English'), v('Samantha')]);
    expect(c.mixed.map((x) => x.name)).toContain('Google US English');
    expect(c.boy.map((x) => x.name)).not.toContain('Google US English');
    expect(c.girl.map((x) => x.name)).not.toContain('Google US English');

    const girls = curateVoices(['Samantha', 'Karen', 'Tessa', 'Moira', 'Fiona', 'Zira'].map((n) => v(n)));
    expect(girls.girl.length).toBeLessThanOrEqual(VOICE.PICK.TOP_N);
  });

  it('mixed matches rankVoices exactly (existing behavior preserved)', () => {
    const inv = [v('Albert'), v('Samantha'), v('Google US English'), v('Karen', 'en-AU'), v('Daniel', 'en-GB')];
    expect(curateVoices(inv).mixed).toEqual(rankVoices(inv));
  });

  it('a gendered profile picks only from its sublist when it is populated', () => {
    const c = curateVoices([v('Samantha'), v('Daniel', 'en-GB'), v('Karen', 'en-AU'), v('Alex')]);
    for (let i = 0; i < 6; i++) {
      const g = pickVoice(c, { ...girlProfile, voiceIdx: i })!;
      expect(VOICE.PICK.GENDER.GIRL.test(g.name)).toBe(true);
      const b = pickVoice(c, { ...boyProfile, voiceIdx: i })!;
      expect(VOICE.PICK.GENDER.GIRL.test(b.name)).toBe(false);
    }
  });

  it('falls back to the mixed list when the gender sublist is empty', () => {
    const c = curateVoices([v('Google US English'), v('Samantha')]);
    expect(c.boy).toHaveLength(0);
    expect(pickVoice(c, boyProfile)).toBe(c.mixed[0]);
    // A genderless profile (commentator Pip, DEFAULT_PROFILE) always uses mixed.
    expect(pickVoice(c, { pitch: 1.2, rate: 1, voiceIdx: 0 })).toBe(c.mixed[0]);
    // Empty inventory → undefined, never a throw.
    expect(pickVoice(curateVoices([]), girlProfile)).toBeUndefined();
  });
});
