import { describe, expect, it } from 'vitest';
import { impactStrength } from './impactCues';

describe('impact spectacle', () => {
  it('stages harder contact more strongly without changing the hit', () => {
    expect(impactStrength(95, '1B', false)).toBeGreaterThan(impactStrength(55, '1B', false));
  });

  it('lets homers spend the most and keeps fouls restrained', () => {
    expect(impactStrength(82, 'HR', false)).toBeGreaterThan(impactStrength(82, '1B', false));
    expect(impactStrength(82, '1B', true)).toBeLessThan(impactStrength(82, '1B', false));
  });

  it('is bounded for any launch the sim can report', () => {
    for (const speed of [0, 45, 75, 100, 200]) {
      expect(impactStrength(speed, 'HR', false)).toBeGreaterThanOrEqual(0);
      expect(impactStrength(speed, 'HR', false)).toBeLessThanOrEqual(1);
    }
  });
});
