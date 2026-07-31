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

describe('the rig reads as one depth', () => {
  // Every ground actor in the behind-plate rig, feet-anchored (setOrigin(0.5,1)
  // in BattingView), so Y IS the feet line and H IS the drawn pixel height.
  const actors = [
    ...Object.entries(PLATE_VIEW.FIELDERS).map(([id, s]) => ({ id, Y: s.Y, H: s.H })),
    { id: 'P', Y: PLATE_VIEW.PITCHER.Y, H: PLATE_VIEW.PITCHER.H },
  ].sort((a, b) => a.Y - b.Y);

  it('never draws a nearer actor smaller than a farther one', () => {
    // ★ The bug this exists for: 1B/3B sat at Y 330, twelve pixels IN FRONT of
    // the pitcher at 318, drawn ten pixels SHORTER (94 vs 104). Lower in frame
    // and smaller states two contradictory depths at once, which is what
    // flattened the defense onto the fence. Nothing caught it: no test touched
    // PLATE_VIEW.FIELDERS, and audit:layout covers menu scenes only.
    for (let i = 1; i < actors.length; i++) {
      const far = actors[i - 1];
      const near = actors[i];
      expect(
        near.H,
        `${near.id} is nearer than ${far.id} (Y ${near.Y} > ${far.Y}) but drawn shorter (${near.H} < ${far.H})`
      ).toBeGreaterThanOrEqual(far.H);
    }
  });

  it('keeps every background fielder behind the pitcher', () => {
    // art.rigFielders: BB2001 puts its pitcher 17-20px below its horizon at 35px
    // tall while every background fielder sits within -6..+2px OF the horizon at
    // 15-19px. The pitcher is the nearest thing on the field that is not the
    // battery, in BB and here.
    for (const [id, spot] of Object.entries(PLATE_VIEW.FIELDERS)) {
      expect(spot.Y, `${id} is drawn in front of the pitcher`).toBeLessThan(PLATE_VIEW.PITCHER.Y);
      expect(spot.H, `${id} is drawn taller than the pitcher`).toBeLessThan(PLATE_VIEW.PITCHER.H);
    }
  });

  it('keeps every fielder inside the drawn foul wedge', () => {
    // BattingView.drawBackdrop chalks the lines from the plate corners out to
    // the fence: (452,544)->(40,294) and (508,544)->(920,294). A fielder outside
    // them is standing in foul ground, which is what moving a spot up-frame
    // without moving it inward would do.
    const edgeAt = (y: number, fromX: number, toX: number) => {
      const t = (544 - y) / (544 - 294);
      return fromX + (toX - fromX) * t;
    };
    for (const [id, spot] of Object.entries(PLATE_VIEW.FIELDERS)) {
      expect(spot.X, `${id} is left of the third-base line`).toBeGreaterThan(edgeAt(spot.Y, 452, 40));
      expect(spot.X, `${id} is right of the first-base line`).toBeLessThan(edgeAt(spot.Y, 508, 920));
    }
  });

  it('keeps the whole defense below the horizon', () => {
    for (const [id, spot] of Object.entries(PLATE_VIEW.FIELDERS)) {
      expect(spot.Y, `${id} stands above the horizon`).toBeGreaterThan(PLATE_VIEW.HORIZON_Y);
    }
  });
});
