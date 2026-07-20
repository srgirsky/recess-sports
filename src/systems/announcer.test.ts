// ---------------------------------------------------------------------------
// Booth tests: every moment has lines, the two kids alternate and never repeat
// themselves back-to-back, big moments always speak (sometimes as a two-line
// exchange), and chatter is rate-limited.
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
    const lines = a.line('homer', 0, { name: 'Junebug' }, 2);
    expect(lines).toBeTruthy();
    for (const l of lines!) expect(l.text.includes('{name}')).toBe(false);
  });

  it('never repeats the same line back-to-back', () => {
    // rng pinned to 0 would always pick pool[0]; the repeat guard must rotate.
    const a = new Announcer(() => 0);
    const first = a.line('hitSafe', 0, {}, 2)![0].text;
    const second = a.line('hitSafe', ANNOUNCE_COOLDOWN_MS + 1, {}, 2)![0].text;
    expect(second).not.toBe(first);
  });

  it('rate-limits chatter but lets big moments through', () => {
    const a = new Announcer(() => 0.4);
    expect(a.line('hitSafe', 1000)).toBeTruthy();
    expect(a.line('outRace', 1500)).toBeNull(); // booth is busy
    expect(a.line('doublePlay', 1500, {}, 2)).toBeTruthy(); // priority talks anyway
    expect(a.line('hitSafe', 1500 + ANNOUNCE_COOLDOWN_MS + 1)).toBeTruthy();
  });

  it('the two commentators alternate calls', () => {
    // rng 0 picks pool[0] of each kind — none of these name-drop the other
    // kid, so pure alternation decides the speaker (priority 1: no exchange).
    const a = new Announcer(() => 0);
    const s1 = a.line('walk', 0)![0].speaker;
    const s2 = a.line('strikeoutSwinging', ANNOUNCE_COOLDOWN_MS + 1)![0].speaker;
    const s3 = a.line('errorWild', 2 * (ANNOUNCE_COOLDOWN_MS + 1))![0].speaker;
    expect(s1).not.toBe(s2);
    expect(s2).not.toBe(s3);
    expect(s1).toBe(s3);
  });

  it('lines that name-drop a commentator come out of the other kid’s mouth', () => {
    // Sweep every pool: a line mentioning Rocco is Pip ('A') talking, and v.v.
    const kinds = Object.keys(poolSizes()) as AnnounceKind[];
    for (const kind of kinds) {
      for (let i = 0; i < 10; i++) {
        const a = new Announcer(() => (i % 10) / 10 + 0.099); // 0.099: skip exchange-roll ambiguity
        const lines = a.line(kind, 0, { name: 'X' }, 2)!;
        const first = lines[0];
        if (first.text.includes('Rocco')) expect(first.speaker, first.text).toBe('A');
        if (first.text.includes('Pip')) expect(first.speaker, first.text).toBe('B');
      }
    }
  });

  it('big moments can become a two-line exchange between the kids', () => {
    const a = new Announcer(() => 0); // rng 0: always rolls under EXCHANGE_CHANCE
    const lines = a.line('homer', 0, { name: 'Big Lou' }, 2)!;
    expect(lines.length).toBe(2);
    expect(lines[0].speaker).not.toBe(lines[1].speaker);
    expect(lines[1].text.length).toBeGreaterThan(0);
  });

  it('priority-1 calls never produce an exchange', () => {
    const a = new Announcer(() => 0);
    expect(a.line('hitSafe', 0)!.length).toBe(1);
  });

  it('covers the whole pool over many calls', () => {
    const kinds = Object.keys(poolSizes()) as AnnounceKind[];
    for (const kind of kinds) {
      const seen = new Set<string>();
      for (let i = 0; i < 60; i++) {
        const a = new Announcer(() => (i % 10) / 10);
        const lines = a.line(kind, 0, { name: 'X' }, 2);
        if (lines) seen.add(lines[0].text);
      }
      expect(seen.size).toBe(poolSizes()[kind]);
    }
  });
});
