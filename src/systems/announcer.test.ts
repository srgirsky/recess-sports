// ---------------------------------------------------------------------------
// Announcer tests: every moment has lines, the booth never repeats itself
// back-to-back, big moments always speak, and chatter is rate-limited.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { Announcer, ANNOUNCE_COOLDOWN_MS, poolSizes, type AnnounceKind } from './announcer';

describe('announcer', () => {
  it('every moment has a non-empty line pool', () => {
    for (const [kind, size] of Object.entries(poolSizes())) {
      expect(size, `${kind} pool is empty`).toBeGreaterThan(0);
    }
  });

  it('fills in the kid name', () => {
    const a = new Announcer(() => 0.6);
    const line = a.line('homer', 0, { name: 'Junebug' }, 2);
    expect(line).toBeTruthy();
    expect(line!.includes('{name}')).toBe(false);
  });

  it('never repeats the same line back-to-back', () => {
    // rng pinned to 0 would always pick pool[0]; the repeat guard must rotate.
    const a = new Announcer(() => 0);
    const first = a.line('hitSafe', 0, {}, 2);
    const second = a.line('hitSafe', ANNOUNCE_COOLDOWN_MS + 1, {}, 2);
    expect(second).not.toBe(first);
  });

  it('rate-limits chatter but lets big moments through', () => {
    const a = new Announcer(() => 0.4);
    expect(a.line('hitSafe', 1000)).toBeTruthy();
    expect(a.line('outRace', 1500)).toBeNull(); // booth is busy
    expect(a.line('doublePlay', 1500, {}, 2)).toBeTruthy(); // priority talks anyway
    expect(a.line('hitSafe', 1500 + ANNOUNCE_COOLDOWN_MS + 1)).toBeTruthy();
  });

  it('covers the whole pool over many calls', () => {
    const kinds = Object.keys(poolSizes()) as AnnounceKind[];
    for (const kind of kinds) {
      const seen = new Set<string>();
      for (let i = 0; i < 60; i++) {
        const a = new Announcer(() => (i % 10) / 10);
        const line = a.line(kind, 0, { name: 'X' }, 2);
        if (line) seen.add(line);
      }
      expect(seen.size).toBe(poolSizes()[kind]);
    }
  });
});
