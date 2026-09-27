import { describe, expect, it } from 'vitest';
import { cpuShift, CPU_PULL_SHIFT_POWER, shiftedPost, SHIFTS } from './shifts';
import { FIELD_POSITIONS, type PositionId } from './field';
import { ROSTER } from '../../data/characters';

const POSITIONS = Object.keys(FIELD_POSITIONS) as PositionId[];
const dist = (p: { x: number; z: number }) => Math.sqrt(p.x * p.x + p.z * p.z);

describe('a shift is where the fielders start, nothing else', () => {
  it('normal is the table itself', () => {
    for (const pos of POSITIONS) expect(shiftedPost(pos, 'normal')).toBe(FIELD_POSITIONS[pos]);
  });

  it('keeps every fielder the same distance from home — a rotation, not a move in', () => {
    for (const shift of SHIFTS)
      for (const pos of POSITIONS) expect(dist(shiftedPost(pos, shift))).toBeCloseTo(dist(FIELD_POSITIONS[pos]), 9);
  });

  it('pull swings toward left field, oppo toward right, and the force bag stays covered', () => {
    expect(shiftedPost('SS', 'pull').x).toBeLessThan(FIELD_POSITIONS.SS.x);
    expect(shiftedPost('SS', 'oppo').x).toBeGreaterThan(FIELD_POSITIONS.SS.x);
    expect(shiftedPost('1B', 'pull')).toBe(FIELD_POSITIONS['1B']);
    expect(shiftedPost('3B', 'oppo')).toBe(FIELD_POSITIONS['3B']);
    for (const shift of SHIFTS) {
      expect(shiftedPost('P', shift)).toBe(FIELD_POSITIONS.P);
      expect(shiftedPost('C', shift)).toBe(FIELD_POSITIONS.C);
    }
  });

  it('the CPU shifts on sluggers only', () => {
    for (const c of ROSTER) expect(cpuShift(c)).toBe(c.stats.power >= CPU_PULL_SHIFT_POWER ? 'pull' : 'normal');
    expect(ROSTER.some((c) => cpuShift(c) === 'pull')).toBe(true);
  });
});
