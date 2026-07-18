// ---------------------------------------------------------------------------
// Venue tests: fence shapes change home-run math, obstacles stop rollers,
// and the ground changes the pace — while the default park stays identical
// to the pre-venue game.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { VENUES } from '../data/venues';
import { getFieldGeometry } from './venue';
import { DEFAULT_GEOMETRY, fencePointAt, FENCE_Y, dist } from './geometry';
import { buildLaunch, type Launch } from './atbat';
import { startLivePlay, stepLivePlay, type LivePlayState } from './liveplay';
import { resolveLiveParams } from './mode';
import type { PositionId } from './geometry';

const POSITIONS: PositionId[] = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
const DEFENSE = POSITIONS.map((p, i) => ({ position: p, charId: `f${i}` }));

const launchWith = (q: number, sprayT: number, geo = DEFAULT_GEOMETRY): Launch =>
  buildLaunch({ band: 'perfect', q, typeBias: 0, forceType: 'fly', sprayT: () => sprayT, rng: () => 0.5, geo });

describe('venue geometry', () => {
  it('the park geometry matches the pre-venue constants', () => {
    const park = getFieldGeometry(VENUES.park);
    expect(park).toEqual(DEFAULT_GEOMETRY);
    expect(fencePointAt(park, 0.5).y).toBe(FENCE_Y);
  });

  it('a short porch makes homers cheaper only in that direction', () => {
    const sandlot = getFieldGeometry(VENUES.sandlot);
    // A q just under the park threshold: not a homer at the park...
    const q = 1.1;
    expect(launchWith(q, 0.9).homer).toBe(false);
    // ...but it clears the sandlot's short right-field porch...
    expect(launchWith(q, 0.9, sandlot).homer).toBe(true);
    // ...while deep LEFT at the sandlot is HARDER than the park.
    expect(launchWith(1.19, 0.1).homer).toBe(true);
    expect(launchWith(1.19, 0.1, sandlot).homer).toBe(false);
  });

  it('nothing lands inside the sandlot oak', () => {
    const sandlot = getFieldGeometry(VENUES.sandlot);
    const oak = sandlot.obstacles[0];
    for (let q = 0; q < 1.2; q += 0.07) {
      for (let t = 0.1; t < 0.9; t += 0.05) {
        const L = buildLaunch({ band: 'good', q, typeBias: 0, sprayT: () => t, rng: () => 0.5, geo: sandlot });
        if (!L.homer) {
          expect(dist(L.landing, oak)).toBeGreaterThan(oak.r);
        }
      }
    }
  });
});

describe('venue ground & obstacles in the live sim', () => {
  const params = resolveLiveParams('kid'); // slow CPU keeps the ball rolling

  const roller: Launch = {
    type: 'grounder',
    landing: { x: 660, y: 260 }, // up the right-center gap (clear of the oak)
    hangMs: 0,
    rollSpeed: 420,
    homer: false,
  };

  const settleTicks = (s: LivePlayState) => {
    let ticks = 0;
    while (s.ball.phase === 'rolling' && s.ball.rollV !== 0 && ticks++ < 400) {
      s = stepLivePlay(s, {}, 50, params, () => 0.9);
    }
    return { ticks, s };
  };

  const play = (geo = DEFAULT_GEOMETRY) =>
    startLivePlay({
      mode: 'defense',
      launch: roller,
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params,
      geo,
    });

  it('fast ground settles the same roller in fewer ticks', () => {
    const grass = settleTicks(play()).ticks;
    const asphalt = settleTicks(play(getFieldGeometry(VENUES.blacktop))).ticks;
    const shaggy = settleTicks(play(getFieldGeometry(VENUES.sandlot))).ticks;
    expect(asphalt).toBeLessThan(grass);
    expect(grass).toBeLessThan(shaggy);
  });

  it('a roller through the oak stops dead with a bonk', () => {
    // Aim the roll straight through the tree at (330, 262).
    const throughTree: Launch = { ...roller, landing: { x: 330, y: 240 } };
    let s = startLivePlay({
      mode: 'defense',
      launch: throughTree,
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [],
      defense: DEFENSE,
      outs: 0,
      params,
      geo: getFieldGeometry(VENUES.sandlot),
    });
    let bonked = false;
    let guard = 0;
    while (guard++ < 300 && s.ball.phase === 'rolling') {
      s = stepLivePlay(s, {}, 50, params, () => 0.9);
      if (s.events.some((e) => e.t === 'bonk')) {
        bonked = true;
        break;
      }
    }
    expect(bonked).toBe(true);
    expect(s.ball.rollV).toBe(0);
    const oak = VENUES.sandlot.obstacles[0];
    expect(dist(s.ball.pos, oak)).toBeLessThanOrEqual(oak.r + 2);
  });
});
