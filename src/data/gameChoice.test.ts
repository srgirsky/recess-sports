import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { GAME_CHOICE_KEY, getGameChoice, setGameChoice } from './gameChoice';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  } as Storage;
});

describe('gameChoice', () => {
  it('remembers the last game, and nothing until one is chosen', () => {
    expect(getGameChoice()).toBeNull();
    setGameChoice('classic');
    expect(getGameChoice()).toBe('classic');
    setGameChoice('3d');
    expect(getGameChoice()).toBe('3d');
  });

  it('ignores a value it does not know', () => {
    store.set(GAME_CHOICE_KEY, 'v3');
    expect(getGameChoice()).toBeNull();
  });

  it('the front door redirect reads the same key and value', () => {
    // index.html cannot import this module; it spells both out. If either
    // drifts, CLASSIC players silently stop being sent back to CLASSIC.
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toContain(`localStorage.getItem('${GAME_CHOICE_KEY}') === 'classic'`);
    // The alias must NOT redirect: every audit and measurement drives /v2/.
    const alias = readFileSync(new URL('../../v2/index.html', import.meta.url), 'utf8');
    expect(alias).not.toContain(GAME_CHOICE_KEY);
  });
});
