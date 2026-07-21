import { describe, it, expect } from 'vitest';
import { PLATE_VIEW, PLATE_ZONE, CURSOR } from '../config';
import { plateToScreen, screenToPlate, clampToCursorRange } from './plateView';

describe('frontal plate view mapping', () => {
  it('round-trips plate -> screen -> plate', () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 48, y: -50 },
      { x: -31.5, y: 17.25 },
    ]) {
      const back = screenToPlate(plateToScreen(p));
      expect(back.x).toBeCloseTo(p.x);
      expect(back.y).toBeCloseTo(p.y);
    }
  });

  it('puts the zone center at the configured anchor', () => {
    expect(plateToScreen({ x: 0, y: 0 })).toEqual({
      x: PLATE_VIEW.ZONE.CX,
      y: PLATE_VIEW.ZONE.CY,
    });
  });

  it('scales zone corners by ZONE.SCALE', () => {
    const corner = plateToScreen({ x: PLATE_ZONE.W / 2, y: PLATE_ZONE.H / 2 });
    expect(corner.x).toBeCloseTo(PLATE_VIEW.ZONE.CX + (PLATE_ZONE.W / 2) * PLATE_VIEW.ZONE.SCALE);
    expect(corner.y).toBeCloseTo(PLATE_VIEW.ZONE.CY + (PLATE_ZONE.H / 2) * PLATE_VIEW.ZONE.SCALE);
  });

  it('clamps the cursor to RANGE_MULT x half-zone', () => {
    const rx = (PLATE_ZONE.W / 2) * CURSOR.RANGE_MULT;
    const ry = (PLATE_ZONE.H / 2) * CURSOR.RANGE_MULT;
    expect(clampToCursorRange({ x: 9999, y: -9999 })).toEqual({ x: rx, y: -ry });
    expect(clampToCursorRange({ x: -3, y: 12 })).toEqual({ x: -3, y: 12 });
  });
});
