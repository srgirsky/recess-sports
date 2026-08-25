import { describe, expect, it } from 'vitest';
import {
  SHADOW_MAX_SCALE,
  activeFielderCue,
  ballShadowCue,
  BALL_PRESENCE_MAX_SCALE,
  BALL_PRESENCE_REF_FT,
  ballPresenceCue,
} from './readabilityCues';

describe('ballShadowCue', () => {
  it('tracks the ball on the ground during pitches and live plays', () => {
    expect(ballShadowCue({ x: 12, y: 4, z: 38 }, 'pitch')).toMatchObject({
      visible: true,
      x: 12,
      z: 38,
    });
    expect(ballShadowCue({ x: -9, y: 0, z: 84 }, 'live')).toMatchObject({
      visible: true,
      x: -9,
      z: 84,
      scale: 1,
    });
  });

  it('grows with height but never becomes a landing-zone assist', () => {
    const low = ballShadowCue({ x: 0, y: 3, z: 0 }, 'live');
    const high = ballShadowCue({ x: 0, y: 300, z: 0 }, 'live');
    expect(high.scale).toBeGreaterThan(low.scale);
    expect(high.scale).toBe(SHADOW_MAX_SCALE);
  });

  it('stays out of menus and between-pitch staging', () => {
    expect(ballShadowCue({ x: 0, y: 3, z: 0 }, 'between').visible).toBe(false);
    expect(ballShadowCue({ x: 0, y: 3, z: 0 }, 'live', false).visible).toBe(false);
  });
});

describe('activeFielderCue', () => {
  const play = {
    active: 1,
    fielders: [{ p: { x: -8, z: 55 } }, { p: { x: 22, z: 91 } }],
  };

  it('marks exactly the fielder receiving human steering', () => {
    expect(activeFielderCue(play, true)).toEqual({
      visible: true,
      x: 22,
      z: 91,
      scale: 1,
    });
  });

  it('does not imply control on CPU or batting-side plays', () => {
    expect(activeFielderCue(play, false).visible).toBe(false);
    expect(activeFielderCue(play, true, false).visible).toBe(false);
    expect(activeFielderCue(null, true).visible).toBe(false);
  });
});

describe('ballPresenceCue', () => {
  const eye = { x: 0, y: 5, z: -18 };

  it('leaves a close ball honest and grows a far one', () => {
    const near = ballPresenceCue({ x: 0, y: 5, z: -10 }, eye, 'pitch');
    expect(near.scale).toBeCloseTo(1, 5);
    const far = ballPresenceCue({ x: 0, y: 5, z: 24 }, eye, 'pitch');
    expect(far.scale).toBeCloseTo(42 / BALL_PRESENCE_REF_FT, 5);
  });

  it('caps before the ball reads as a beach ball', () => {
    const deep = ballPresenceCue({ x: 0, y: 5, z: 300 }, eye, 'live');
    expect(deep.scale).toBe(BALL_PRESENCE_MAX_SCALE);
  });

  it('is a gameplay cue only: honest at rest and on review surfaces', () => {
    expect(ballPresenceCue({ x: 0, y: 5, z: 46 }, eye, 'windup').scale).toBe(1);
    expect(ballPresenceCue({ x: 0, y: 5, z: 46 }, eye, 'between').scale).toBe(1);
    expect(ballPresenceCue({ x: 0, y: 5, z: 46 }, eye, 'pitch', false).scale).toBe(1);
  });
});
