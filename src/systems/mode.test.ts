// ---------------------------------------------------------------------------
// GAME SETUP layer: the difficulty ladder → GameMode derivation, the feature
// overrides that trim (never add) a mode's mechanics, and tee-ball pitch pace.
// The override defaults are a NO-OP by contract — that's what keeps the seeded
// goldlog stream byte-identical (verified separately in-browser).
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DIFFICULTY_TIERS, TEE_PITCH_MS, MODES, type DifficultyLevel } from '../config';
import {
  getMode,
  getDifficulty,
  setDifficulty,
  isTee,
  difficultyBaseRamp,
  getFeatures,
  resolveLiveParams,
  getPitchBaseMs,
} from './mode';

// A fresh in-memory localStorage per test (the store is module-global state).
function installStore(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  return store;
}

describe('difficulty ladder ↔ GameMode', () => {
  let prev: unknown;
  beforeEach(() => {
    prev = (globalThis as { localStorage?: unknown }).localStorage;
    installStore();
  });
  afterEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = prev;
  });

  it('each tier derives the right internal mode, and setDifficulty round-trips', () => {
    (['teeball', 'easy', 'medium', 'hard'] as DifficultyLevel[]).forEach((d) => {
      setDifficulty(d);
      expect(getDifficulty()).toBe(d);
      expect(getMode()).toBe(DIFFICULTY_TIERS[d].mode);
    });
  });

  it('teeball/easy → kid, medium/hard → main', () => {
    expect(DIFFICULTY_TIERS.teeball.mode).toBe('kid');
    expect(DIFFICULTY_TIERS.easy.mode).toBe('kid');
    expect(DIFFICULTY_TIERS.medium.mode).toBe('main');
    expect(DIFFICULTY_TIERS.hard.mode).toBe('main');
  });

  it('only tee-ball sits on a tee; only hard seeds the ramp', () => {
    expect(isTee('teeball')).toBe(true);
    expect(isTee('easy')).toBe(false);
    expect(difficultyBaseRamp('hard')).toBeGreaterThan(0);
    expect(difficultyBaseRamp('medium')).toBe(0);
  });

  it('the label reconciles against a legacy recess_mode set directly', () => {
    // A player who chose kid/main before the ladder existed: getMode is the
    // authority, so getDifficulty must report a tier whose mode matches.
    localStorage.setItem('recess_mode', 'kid');
    expect(DIFFICULTY_TIERS[getDifficulty()].mode).toBe('kid');
    localStorage.setItem('recess_mode', 'main');
    expect(DIFFICULTY_TIERS[getDifficulty()].mode).toBe('main');
  });
});

describe('feature overrides trim, never add', () => {
  it('the all-true default is a no-op for both modes', () => {
    for (const m of ['kid', 'main'] as const) {
      const noArg = getFeatures(m);
      const allOn = getFeatures(m, { errors: true, swingSpot: true, pitchLocator: true });
      expect(allOn).toEqual(noArg);
      expect(allOn).toEqual(MODES[m].features);
    }
  });

  it('an override can DISABLE a classic feature but never ENABLE a kid one', () => {
    const trimmed = getFeatures('main', { errors: false, swingSpot: false, pitchLocator: false });
    expect(trimmed.errors).toBe(false);
    expect(trimmed.battingCursor).toBe(false);
    expect(trimmed.pitchSelection).toBe(false);
    // Kid mode has these off; asking to turn them on stays off (can't add).
    const kid = getFeatures('kid', { errors: true, swingSpot: true, pitchLocator: true });
    expect(kid.errors).toBe(false);
    expect(kid.battingCursor).toBe(false);
    expect(kid.pitchSelection).toBe(false);
  });
});

describe('resolveLiveParams errors override', () => {
  it('errors:false forces both error mults to 0 (the rng-skip path)', () => {
    const on = resolveLiveParams('main');
    const off = resolveLiveParams('main', { errors: false });
    expect(on.playerErrorMult).toBeGreaterThan(0);
    expect(off.playerErrorMult).toBe(0);
    expect(off.cpuErrorMult).toBe(0);
  });

  it('no override leaves the mults at the mode defaults', () => {
    expect(resolveLiveParams('main', { swingSpot: false })).toEqual(resolveLiveParams('main'));
  });
});

describe('tee-ball pitch pace', () => {
  it('the tee flag lobs slow regardless of mode/half', () => {
    expect(getPitchBaseMs('kid', 'batting', true)).toBe(TEE_PITCH_MS);
    expect(getPitchBaseMs('main', 'pitching', true)).toBe(TEE_PITCH_MS);
    // Without the flag, tee never leaks in.
    expect(getPitchBaseMs('kid', 'batting', false)).not.toBe(TEE_PITCH_MS);
  });
});
