import { describe, it, expect } from 'vitest';
import { rollPickoff, applyPickoff } from './steal';
import { newHalfInning } from './inning';

/** Fraction of an even grid of rolls that come up "picked off". */
const rate = (spec: Parameters<typeof rollPickoff>[0]) => {
  let outs = 0;
  const N = 1000;
  for (let i = 0; i < N; i++) if (rollPickoff(spec, () => (i + 0.5) / N)) outs++;
  return outs / N;
};

describe('rollPickoff', () => {
  it('catches a leaning runner far more often than one on the bag', () => {
    const leaning = rate({ runnerSpeed: 5, pitcherArm: 5, leaning: true });
    const home = rate({ runnerSpeed: 5, pitcherArm: 5, leaning: false });
    expect(leaning).toBeGreaterThan(0.5);
    expect(home).toBeLessThan(0.1);
  });

  it('a quick runner gets back more often, a strong arm catches more', () => {
    const base = rate({ runnerSpeed: 5, pitcherArm: 5, leaning: true });
    expect(rate({ runnerSpeed: 10, pitcherArm: 5, leaning: true })).toBeLessThan(base);
    expect(rate({ runnerSpeed: 5, pitcherArm: 10, leaning: true })).toBeGreaterThan(base);
  });

  it('is never certain either way', () => {
    expect(rate({ runnerSpeed: 1, pitcherArm: 10, leaning: true })).toBeLessThan(0.9);
    expect(rate({ runnerSpeed: 10, pitcherArm: 1, leaning: false })).toBeGreaterThan(0);
  });
});

describe('applyPickoff', () => {
  const withRunners = { ...newHalfInning(), bases: [true, true, false] as [boolean, boolean, boolean], count: { balls: 2, strikes: 1 } };

  it('an out clears that base and adds an out, nothing else', () => {
    const s = applyPickoff(withRunners, 2, true);
    expect(s.bases).toEqual([true, false, false]);
    expect(s.outs).toBe(withRunners.outs + 1);
    expect(s.count).toEqual(withRunners.count);
  });

  it('a safe throw, or a throw to an empty bag, changes nothing', () => {
    expect(applyPickoff(withRunners, 1, false)).toBe(withRunners);
    expect(applyPickoff(withRunners, 3, true)).toBe(withRunners);
  });
});
