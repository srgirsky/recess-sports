// ---------------------------------------------------------------------------
// Field-chatter tests: cooldown + chance gating, signature lines join the
// pool, generic fallback for plain kids, and no back-to-back repeats.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { Chatter, genericPoolSizes } from './chatter';
import { VOICE } from '../config';
import { getCharacter, ROSTER } from '../data/characters';

const COOLDOWN = VOICE.CHATTER.COOLDOWN_MS;

describe('chatter', () => {
  it('both generic pools have lines', () => {
    const sizes = genericPoolSizes();
    expect(sizes.batterUp).toBeGreaterThan(0);
    expect(sizes.fielding).toBeGreaterThan(0);
  });

  it('respects its cooldown', () => {
    const c = new Chatter(() => 0); // chance roll always passes
    const kid = ROSTER[0];
    expect(c.pick('batterUp', 1000, kid)).toBeTruthy();
    expect(c.pick('batterUp', 1000 + COOLDOWN - 1, kid)).toBeNull();
    expect(c.pick('batterUp', 1000 + COOLDOWN + 1, kid)).toBeTruthy();
  });

  it('stays quiet when the chance roll misses', () => {
    const c = new Chatter(() => 0.999); // above CHANCE
    expect(c.pick('fielding', 0, ROSTER[0])).toBeNull();
  });

  it('signature kids can say their own lines', () => {
    const boomer = getCharacter('boomer');
    expect(boomer.chatterLines?.length).toBeGreaterThan(0);
    // rng 0: passes the chance roll and picks pool[0] — a signature line,
    // since chatterLines are merged in ahead of the generic pool.
    const c = new Chatter(() => 0);
    const pick = c.pick('fielding', 0, boomer)!;
    expect(boomer.chatterLines).toContain(pick.text);
  });

  it('kids without signature lines fall back to the generic pool', () => {
    const dex = getCharacter('dex');
    expect(dex.chatterLines).toBeUndefined();
    const c = new Chatter(() => 0);
    expect(c.pick('batterUp', 0, dex)).toBeTruthy();
  });

  it('never repeats the same line back-to-back', () => {
    const c = new Chatter(() => 0);
    const kid = getCharacter('dex');
    const first = c.pick('batterUp', 0, kid)!.text;
    const second = c.pick('batterUp', COOLDOWN + 1, kid)!.text;
    expect(second).not.toBe(first);
  });

  it('speaks in the kid’s derived voice', () => {
    const c = new Chatter(() => 0);
    const kid = getCharacter('turbo');
    const pick = c.pick('batterUp', 0, kid)!;
    expect(pick.profile.pitch).toBeGreaterThan(0);
    expect(pick.profile.rate).toBeGreaterThan(0);
  });
});
