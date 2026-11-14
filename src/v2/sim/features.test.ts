// ---------------------------------------------------------------------------
// The flags parse the way a person at a playtest will type them, and every
// one of them starts off. The hold itself — that a held feature may not default
// on — is `scripts/playtest.lint.test.js`'s job, which reads this module's
// source against `docs/playtests/holds.json`; this file covers the parser.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURES, FEATURE_NAMES, enabledFeatures, parseFeatures, type Features } from './features';

const ALL: Features = { stamina: true, juice: true, specialPitches: true, shifts: true };

describe('the defaults', () => {
  it('★ are all false', () => {
    for (const name of FEATURE_NAMES) expect(DEFAULT_FEATURES[name], name).toBe(false);
    expect(enabledFeatures(DEFAULT_FEATURES)).toEqual([]);
  });

  it('name every key of the interface exactly once', () => {
    expect([...FEATURE_NAMES].sort()).toEqual(Object.keys(DEFAULT_FEATURES).sort());
    expect(new Set(FEATURE_NAMES).size).toBe(FEATURE_NAMES.length);
  });

  it('are frozen — a caller gets a copy, never the shared object', () => {
    expect(Object.isFrozen(DEFAULT_FEATURES)).toBe(true);
    const parsed = parseFeatures(null);
    expect(parsed).toEqual(DEFAULT_FEATURES);
    expect(parsed).not.toBe(DEFAULT_FEATURES);
    parsed.juice = true;
    expect(DEFAULT_FEATURES.juice).toBe(false);
  });
});

describe('parseFeatures', () => {
  const table: Array<[string | null, Partial<Features>]> = [
    [null, {}],
    ['', {}],
    ['all', ALL],
    ['ALL', ALL],
    ['stamina', { stamina: true }],
    ['juice,shifts', { juice: true, shifts: true }],
    [' juice , shifts ', { juice: true, shifts: true }],
    ['specialpitches', { specialPitches: true }],
    ['SpecialPitches', { specialPitches: true }],
    ['stamina,juice,specialPitches,shifts', ALL],
    ['stamina,all', ALL],
    ['bogus', {}],
    ['bogus,stamina', { stamina: true }],
    ['stamina,,shifts,', { stamina: true, shifts: true }],
  ];

  it.each(table)('parses %j', (raw, on) => {
    expect(parseFeatures(raw)).toEqual({ ...DEFAULT_FEATURES, ...on });
  });

  it('★ ignores an unknown name rather than throwing', () => {
    // A typo at a playtest should cost the feature it misspelled, not the session.
    expect(() => parseFeatures('stamna')).not.toThrow();
    expect(parseFeatures('stamna')).toEqual(DEFAULT_FEATURES);
  });

  it('lists what is on in the documented order', () => {
    expect(enabledFeatures(parseFeatures('shifts,stamina'))).toEqual(['stamina', 'shifts']);
    expect(enabledFeatures(parseFeatures('all'))).toEqual([...FEATURE_NAMES]);
  });
});
