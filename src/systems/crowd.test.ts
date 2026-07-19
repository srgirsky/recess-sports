// ---------------------------------------------------------------------------
// Headless tests for the recess stream-out crowd sim — 30 kids leave one door
// and must reach two wall rows without interpenetrating, hanging, or breaking
// the stair/gap constraints. Run with: npm test
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  createCrowd,
  stepCrowd,
  type CrowdConfig,
  type CrowdEvent,
  type CrowdGeometry,
  type CrowdKidInit,
  type CrowdState,
} from './crowd';
import { CROWD } from '../config';

const seq = (nums: number[]) => {
  let i = 0;
  return () => nums[i++ % nums.length];
};

// Mirrors the Schoolyard layout: DOOR 480,208 · stairs bottom 260 · wall gap
// 428-532 exiting at 318 · two rows of 15 at y=308 / y=356.
const GEOM: CrowdGeometry = {
  door: { x: 480, y: 208 },
  stairBottomY: 260,
  stairHalfW: CROWD.STAIR_HALF_W,
  gap: { left: 428, right: 532 },
  gapExitY: 318,
  wallTopY: 222,
};

const homes = (): CrowdKidInit[] =>
  Array.from({ length: 30 }, (_, i) => {
    const row = i < 15 ? 0 : 1;
    const col = i % 15;
    const spacing = (960 - 150) / 14;
    return {
      id: `k${i}`,
      home: {
        x: Math.min(920, 75 + col * spacing + (row === 1 ? spacing / 2 : 0)),
        y: row === 0 ? 308 : 356,
      },
    };
  });

const DT = 16.7;
const GUARD = 3000; // ticks (~50s) — far beyond any sane stream-out

const make = (rng = seq([0.5]), cfg: CrowdConfig = CROWD): CrowdState =>
  createCrowd(homes(), GEOM, cfg, rng);

/** Step until allSettled (bounded), invoking check each tick, collecting events. */
const run = (
  s: CrowdState,
  cfg: CrowdConfig = CROWD,
  check?: (s: CrowdState) => void
): CrowdEvent[] => {
  const events: CrowdEvent[] = [];
  for (let t = 0; t < GUARD && !s.allSettled; t++) {
    stepCrowd(s, DT, cfg);
    events.push(...s.events);
    check?.(s);
  }
  expect(s.allSettled).toBe(true);
  return events;
};

const activePairs = (s: CrowdState) => {
  const movers = s.kids.filter((k) => k.phase === 'stairs' || k.phase === 'yard');
  const pairs: Array<[(typeof movers)[0], (typeof movers)[0]]> = [];
  for (let a = 0; a < movers.length; a++)
    for (let b = a + 1; b < movers.length; b++) pairs.push([movers[a], movers[b]]);
  return pairs;
};

describe('crowd stream-out', () => {
  it('every kid launches once, settles once, and lands exactly on their home spot', () => {
    const s = make(seq([0.2, 0.8, 0.5]));
    const events = run(s);
    const launched = events.filter((e) => e.type === 'launched');
    const settled = events.filter((e) => e.type === 'settled');
    expect(launched.length).toBe(30);
    expect(settled.length).toBe(30);
    expect(new Set(settled.map((e) => e.id)).size).toBe(30);
    for (const k of s.kids) {
      expect(k.pos).toEqual(k.home);
      expect(k.phase).toBe('settled');
    }
  });

  it('active kids never interpenetrate after burn-in', () => {
    const s = make(seq([0.13, 0.91, 0.44, 0.67, 0.28]));
    run(s, CROWD, (st) => {
      if (st.timeMs < 1000) return;
      for (const [a, b] of activePairs(st)) {
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
        expect(d).toBeGreaterThanOrEqual(0.7 * (a.radius + b.radius));
      }
    });
  });

  it('is deterministic for a given rng', () => {
    const rolls = [0.31, 0.72, 0.05, 0.88, 0.5, 0.19];
    const a = make(seq(rolls));
    const b = make(seq(rolls));
    for (let t = 0; t < 400; t++) {
      stepCrowd(a, DT, CROWD);
      stepCrowd(b, DT, CROWD);
      expect(a.kids.map((k) => k.pos)).toEqual(b.kids.map((k) => k.pos));
    }
  });

  it('meters the door: no launch while another kid is still in the doorway', () => {
    const s = make(seq([0.5, 0.1, 0.9]));
    run(s, CROWD, (st) => {
      for (const ev of st.events) {
        if (ev.type !== 'launched') continue;
        for (const k of st.kids) {
          if (k.id === ev.id || (k.phase !== 'stairs' && k.phase !== 'yard')) continue;
          const d = Math.hypot(k.pos.x - GEOM.door.x, k.pos.y - GEOM.door.y);
          // The launcher itself spawned this tick; everyone else must be clear
          // (allow the launcher's own lane offset, which is < DOOR_CLEAR_R).
          expect(d).toBeGreaterThanOrEqual(CROWD.DOOR_CLEAR_R - CROWD.LANE_SPREAD - 0.001);
        }
      }
    });
  });

  it('keeps kids on the steps within the stair column', () => {
    const s = make(seq([0.9, 0.2, 0.6]));
    run(s, CROWD, (st) => {
      for (const k of st.kids) {
        if (k.phase !== 'stairs') continue;
        expect(Math.abs(k.pos.x - GEOM.door.x)).toBeLessThanOrEqual(GEOM.stairHalfW + 0.001);
      }
    });
  });

  it('funnels every kid through the wall gap, including extreme columns', () => {
    const s = make(seq([0.5]));
    const seenInBand = new Set<string>();
    run(s, CROWD, (st) => {
      for (const k of st.kids) {
        if (k.phase !== 'yard' || k.cleared) continue;
        if (k.pos.y >= GEOM.wallTopY) {
          seenInBand.add(k.id);
          expect(k.pos.x).toBeGreaterThanOrEqual(GEOM.gap.left + CROWD.GAP_MARGIN - 0.001);
          expect(k.pos.x).toBeLessThanOrEqual(GEOM.gap.right - CROWD.GAP_MARGIN + 0.001);
        }
      }
    });
    // The extreme-column kids (homes far left/right) crossed the band too.
    expect(seenInBand.has('k0')).toBe(true);
    expect(seenInBand.has('k14')).toBe(true);
  });

  it('progress is monotonic per kid: 0 at launch, 1 when settled', () => {
    const s = make(seq([0.4, 0.6]));
    const last = new Map<string, number>();
    run(s, CROWD, (st) => {
      for (const k of st.kids) {
        expect(k.progress).toBeGreaterThanOrEqual(last.get(k.id) ?? 0);
        last.set(k.id, k.progress);
        if (k.phase === 'waiting') expect(k.progress).toBe(0);
        if (k.phase === 'settled') expect(k.progress).toBe(1);
      }
    });
  });

  it('clamps a huge dt: bounded movement, no NaN, legal phases', () => {
    const s = make(seq([0.5]));
    // Get a few kids moving first.
    for (let t = 0; t < 60; t++) stepCrowd(s, DT, CROWD);
    const before = s.kids.map((k) => ({ ...k.pos }));
    stepCrowd(s, 5000, CROWD);
    const maxStep = CROWD.SPEED * (1 + CROWD.SPEED_JITTER) * CROWD.MAX_DT_MS;
    const sepSlack = 2 * CROWD.RADIUS * CROWD.SEP_ITERATIONS;
    s.kids.forEach((k, i) => {
      expect(Number.isFinite(k.pos.x)).toBe(true);
      expect(Number.isFinite(k.pos.y)).toBe(true);
      const moved = Math.hypot(k.pos.x - before[i].x, k.pos.y - before[i].y);
      expect(moved).toBeLessThanOrEqual(maxStep + sepSlack);
      expect(['waiting', 'stairs', 'yard', 'settled']).toContain(k.phase);
    });
  });

  it('never soft-locks: pathological homes still settle within MAX_RUN_MS', () => {
    // Two kids whose homes coincide grind on each other forever without the
    // guard — separation keeps shoving whoever arrives second off the spot.
    const inits: CrowdKidInit[] = [
      { id: 'a', home: { x: 400, y: 340 } },
      { id: 'b', home: { x: 400, y: 340 } },
      { id: 'c', home: { x: 404, y: 342 } },
    ];
    const cfg = { ...CROWD, LANE_SPREAD: 0 };
    const s = createCrowd(inits, GEOM, cfg, seq([0.5]));
    run(s, cfg);
    for (const k of s.kids) expect(k.phase).toBe('settled');
  });

  it('allSettled flips only after the final (latest-launching) kid lands', () => {
    const s = make(seq([0.5]));
    let lastSettleTime = 0;
    let settledFlippedAt = 0;
    run(s, CROWD, (st) => {
      if (st.events.some((e) => e.type === 'settled')) lastSettleTime = st.timeMs;
      if (st.allSettled && settledFlippedAt === 0) settledFlippedAt = st.timeMs;
    });
    expect(settledFlippedAt).toBe(lastSettleTime);
    // The last launcher is well after the first — it really was a stream.
    const launches = s.kids.map((k) => k.launchedAtMs);
    expect(Math.max(...launches) - Math.min(...launches)).toBeGreaterThan(
      20 * CROWD.STAGGER_MS
    );
  });
});
