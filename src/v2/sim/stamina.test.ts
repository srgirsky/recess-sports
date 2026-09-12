// ---------------------------------------------------------------------------
// stamina.ts — the arithmetic of a tiring arm, and the one property the caches
// depend on: the sagged stat is always an integer in 1..10.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { drainPitch, effectivePitching, isTired, newStamina } from './stamina';
import { STAMINA } from './params';

describe('the tank', () => {
  it('starts full, drains monotonically, and floors at empty', () => {
    const s = newStamina();
    expect(s.stamina).toBe(1);
    let prev = s.stamina;
    for (let i = 0; i < 60; i++) {
      drainPitch(s, false);
      expect(s.stamina).toBeLessThanOrEqual(prev);
      expect(s.stamina).toBeGreaterThanOrEqual(0);
      prev = s.stamina;
    }
    expect(s.stamina, 'sixty ordinary pitches is past empty').toBe(0);
  });

  it('charges a special pitch triple, as v1 did', () => {
    const a = newStamina();
    const b = newStamina();
    drainPitch(a, false);
    drainPitch(b, true);
    expect(1 - b.stamina).toBeCloseTo(3 * (1 - a.stamina), 12);
    expect(STAMINA.DRAIN_SPECIAL).toBeCloseTo(3 * STAMINA.DRAIN_PER_PITCH, 12);
  });

  it('is tired exactly below TIRED_AT', () => {
    const s = newStamina();
    expect(isTired(s)).toBe(false);
    s.stamina = STAMINA.TIRED_AT;
    expect(isTired(s), 'at the line is not yet tired').toBe(false);
    s.stamina = STAMINA.TIRED_AT - 1e-9;
    expect(isTired(s)).toBe(true);
  });
});

describe('★ the effective stat', () => {
  it('is the full stat until the arm is tired', () => {
    for (let stat = 1; stat <= 10; stat++) {
      for (const st of [1, 0.8, 0.6, STAMINA.TIRED_AT]) {
        expect(effectivePitching(stat, { stamina: st }), `stat ${stat} at ${st}`).toBe(stat);
      }
    }
  });

  it('sags monotonically to stat − MAX_STAT_LOSS at empty, floored at 1', () => {
    for (let stat = 1; stat <= 10; stat++) {
      let prev = effectivePitching(stat, { stamina: 1 });
      for (let i = 100; i >= 0; i--) {
        const eff = effectivePitching(stat, { stamina: i / 100 });
        expect(eff, `stat ${stat} at ${i / 100} rose`).toBeLessThanOrEqual(prev);
        prev = eff;
      }
      expect(effectivePitching(stat, { stamina: 0 })).toBe(Math.max(1, stat - STAMINA.MAX_STAT_LOSS));
    }
    // The floor: a 1 stays a 1, a 3 empties to 1, never below.
    expect(effectivePitching(1, { stamina: 0 })).toBe(1);
    expect(effectivePitching(3, { stamina: 0 })).toBe(1);
  });

  it('★ is an INTEGER in 1..10 over the whole (stat, stamina) plane — the release memo keys on it', () => {
    // `releaseAtSpot` memoises on `kind|pitchingStat|spot` and every miss is a
    // 13.6ms solve. A fractional stat here would be a fresh key on every pitch.
    for (let stat = 1; stat <= 10; stat++) {
      for (let i = 0; i <= 1000; i++) {
        const eff = effectivePitching(stat, { stamina: i / 1000 });
        expect(Number.isInteger(eff), `stat ${stat} at ${i / 1000}: ${eff}`).toBe(true);
        expect(eff).toBeGreaterThanOrEqual(1);
        expect(eff).toBeLessThanOrEqual(10);
      }
    }
  });
});
