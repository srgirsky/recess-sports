// ---------------------------------------------------------------------------
// Difficulty ramp: monotonic, capped, and never negative.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { DIFFICULTY } from '../config';
import { rampLevel, rampedArm, rampedCpuBatter } from './difficulty';
import { getCharacter, ROSTER } from '../data/characters';

describe('difficulty ramp', () => {
  it('climbs per game and caps at MAX_LEVEL', () => {
    expect(rampLevel(0)).toBe(0);
    expect(rampLevel(1)).toBeCloseTo(DIFFICULTY.PER_GAME);
    expect(rampLevel(1000)).toBe(DIFFICULTY.MAX_LEVEL);
    expect(rampLevel(-5)).toBe(0);
  });

  it('arm and contact bonuses cap at 10', () => {
    expect(rampedArm(10, DIFFICULTY.MAX_LEVEL)).toBe(10);
    expect(rampedArm(5, 2)).toBeCloseTo(5 + 2 * DIFFICULTY.ARM_PER_LEVEL);
    const kid = getCharacter(ROSTER[0].id);
    const ramped = rampedCpuBatter(kid, DIFFICULTY.MAX_LEVEL);
    expect(ramped.stats.contact).toBeLessThanOrEqual(10);
    expect(ramped.stats.contact).toBeGreaterThanOrEqual(kid.stats.contact);
    // Level 0 returns the character untouched (no clone churn).
    expect(rampedCpuBatter(kid, 0)).toBe(kid);
  });
});
