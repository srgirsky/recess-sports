// ---------------------------------------------------------------------------
// Pitcher fatigue: drain math, the stat sag, and the thresholds.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { FATIGUE } from '../config';
import { newFatigue, drainPitch, effectivePitching, isTired, cpuWantsRelief } from './fatigue';

describe('fatigue', () => {
  it('drains per pitch, crazy costs more, floors at zero', () => {
    let f = newFatigue();
    f = drainPitch(f, 'fastball');
    expect(f.stamina).toBeCloseTo(1 - FATIGUE.DRAIN_PITCH);
    f = drainPitch(f, 'crazy');
    expect(f.stamina).toBeCloseTo(1 - FATIGUE.DRAIN_PITCH - FATIGUE.DRAIN_CRAZY);
    for (let i = 0; i < 100; i++) f = drainPitch(f, 'crazy');
    expect(f.stamina).toBe(0);
  });

  it('all three juice specials drain like the crazy pitch', () => {
    for (const kind of ['crazy', 'fireball', 'freezeball'] as const) {
      const f = drainPitch(newFatigue(), kind);
      expect(f.stamina).toBeCloseTo(1 - FATIGUE.DRAIN_CRAZY);
    }
  });

  it('a fresh arm throws its full stat; an empty one sags by MAX_STAT_LOSS', () => {
    expect(effectivePitching(8, newFatigue())).toBe(8);
    expect(effectivePitching(8, { stamina: 0 })).toBe(8 - FATIGUE.MAX_STAT_LOSS);
    expect(effectivePitching(2, { stamina: 0 })).toBe(1); // floored, never 0
  });

  it('the sag only starts below TIRED_AT and grows linearly', () => {
    const at = FATIGUE.TIRED_AT;
    expect(effectivePitching(8, { stamina: at })).toBe(8);
    expect(effectivePitching(8, { stamina: at / 2 })).toBeCloseTo(8 - FATIGUE.MAX_STAT_LOSS / 2);
  });

  it('thresholds: sweat first, CPU relief later', () => {
    expect(isTired(newFatigue())).toBe(false);
    expect(isTired({ stamina: FATIGUE.TIRED_AT - 0.01 })).toBe(true);
    expect(cpuWantsRelief({ stamina: FATIGUE.TIRED_AT - 0.01 })).toBe(false);
    expect(cpuWantsRelief({ stamina: FATIGUE.CPU_RELIEF_AT })).toBe(true);
  });

  it('a real game tires a starter into relief territory', () => {
    let f = newFatigue();
    for (let i = 0; i < 30; i++) f = drainPitch(f, 'fastball');
    expect(isTired(f)).toBe(true);
  });
});
