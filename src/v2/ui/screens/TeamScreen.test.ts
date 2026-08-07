import { describe, expect, it } from 'vitest';
import { VENUE_GEOMETRY } from '../../sim/field';
import { VENUE_OPTIONS } from './TeamScreen';

describe('venue picker', () => {
  it('makes every playable geometry reachable exactly once', () => {
    const ids = VENUE_OPTIONS.map((v) => v.id);
    expect(ids).toEqual(Object.keys(VENUE_GEOMETRY));
    expect(new Set(ids).size).toBe(ids.length);
    for (const option of VENUE_OPTIONS) {
      expect(option.icon.length).toBeGreaterThan(0);
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});
