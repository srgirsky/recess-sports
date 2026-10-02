import { describe, it, expect } from 'vitest';
import { alignedSpot, clearOfFence, isShifted, nextAlignment, ALIGNMENTS } from './alignment';
import { FIELD_POSITIONS, HOME, dist, fencePointAt, type PositionId } from './geometry';
import { getFieldGeometry } from './venue';
import { VENUES } from '../data/venues';
import { startLivePlay } from './liveplay';
import { resolveLiveParams } from './mode';
import type { Launch } from './atbat';

const POSITIONS = Object.keys(FIELD_POSITIONS) as PositionId[];

describe('alignedSpot', () => {
  it('NORMAL is exactly the classic spot — a normal game plays unchanged', () => {
    for (const pos of POSITIONS) expect(alignedSpot(pos, 'normal')).toEqual(FIELD_POSITIONS[pos]);
  });

  it('INFIELD IN brings only the four infielders nearer the plate', () => {
    for (const pos of POSITIONS) {
      const before = dist(FIELD_POSITIONS[pos], HOME);
      const after = dist(alignedSpot(pos, 'in'), HOME);
      if (isShifted(pos, 'in')) expect(after).toBeLessThan(before - 20);
      else expect(after).toBeCloseTo(before, 6);
    }
  });

  it('PLAY DEEP backs only the outfield up, and never shallower', () => {
    for (const v of Object.values(VENUES)) {
      const geo = getFieldGeometry(v);
      for (const pos of POSITIONS) {
        const before = dist(FIELD_POSITIONS[pos], HOME);
        const after = dist(alignedSpot(pos, 'deep', geo), HOME);
        if (isShifted(pos, 'deep')) expect(after, `${v.id} ${pos}`).toBeGreaterThanOrEqual(before);
        else expect(after).toBeCloseTo(before, 6);
      }
    }
  });

  it('every aligned spot is fair, clear of obstacles and short of the wall, in every venue', () => {
    for (const v of Object.values(VENUES)) {
      const geo = getFieldGeometry(v);
      const left = fencePointAt(geo, 0);
      const right = fencePointAt(geo, 1);
      for (const a of ALIGNMENTS) {
        for (const pos of POSITIONS) {
          if (pos === 'C') continue; // squats behind the plate, off-diamond
          const p = alignedSpot(pos, a, geo);
          const where = `${v.id} ${a} ${pos}`;
          const leftLineX = HOME.x + ((left.x - HOME.x) * (HOME.y - p.y)) / (HOME.y - left.y);
          const rightLineX = HOME.x + ((right.x - HOME.x) * (HOME.y - p.y)) / (HOME.y - right.y);
          expect(p.x, where).toBeGreaterThan(leftLineX);
          expect(p.x, where).toBeLessThan(rightLineX);
          // A spot the pad MOVED keeps its distance from the wall (the sandlot's
          // normal RF already stands on the short porch; DEEP leaves him there).
          const moved = dist(p, FIELD_POSITIONS[pos]) > 0.001;
          if (moved) expect(clearOfFence(geo, p), where).toBe(true);
          for (const o of geo.obstacles) expect(dist(p, o), where).toBeGreaterThan(o.r);
        }
      }
    }
  });

  it('the pad cycles NORMAL → IN → DEEP → NORMAL', () => {
    expect(nextAlignment('normal')).toBe('in');
    expect(nextAlignment('in')).toBe('deep');
    expect(nextAlignment('deep')).toBe('normal');
  });
});

describe('the live sim honors the alignment', () => {
  it('fielders start, and walk back to, their aligned spots', () => {
    const launch: Launch = { type: 'grounder', landing: { x: 395, y: 300 }, hangMs: 0, rollSpeed: 176, homer: false };
    const s = startLivePlay({
      mode: 'defense',
      launch,
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [],
      defense: POSITIONS.map((position) => ({ position, charId: position })),
      outs: 0,
      params: resolveLiveParams('main'),
      alignment: 'in',
    });
    for (const f of s.fielders) {
      expect(f.home).toEqual(alignedSpot(f.position, 'in'));
      expect(f.pos).toEqual(f.home);
    }
  });
});
