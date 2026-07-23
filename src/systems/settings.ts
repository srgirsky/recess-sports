// ---------------------------------------------------------------------------
// Player settings — persisted like picklog/mode. Two independent volumes
// (SFX rides the Web Audio master gain; voice rides each utterance's volume —
// they're separate pipelines by design), the game length in innings, and the
// GAME SETUP choices (difficulty ladder + errors/helper toggles). The setup
// screen (scenes/GameSetupScene.ts) reads/writes all of them; mode.ts derives
// the internal GameMode + feature overrides from the difficulty + toggles.
// ---------------------------------------------------------------------------

import { INNINGS, type DifficultyLevel } from '../config';

/** The innings choices offered on the setup screen (short kid games + full). */
export const INNING_CHOICES = [1, 2, 3, 6, 9] as const;

export interface Settings {
  /** 0..1 multiplier on the SFX master gain. */
  sfx: number;
  /** 0..1 multiplier on speech volume. */
  voice: number;
  /** Regulation innings per game (gameflow already takes it as a param). */
  innings: number;
  /** BB2001-style difficulty ladder; drives the internal GameMode + CPU ramp. */
  difficulty: DifficultyLevel;
  /** Errors ON/OFF (drops & wild throws). OFF forces the error mults to 0. */
  errors: boolean;
  /** 🎯 Swing Spot helper — the positionable batting cursor (features.battingCursor). */
  swingSpot: boolean;
  /** 🥊 Pitch Locator helper — pitch selection + zone aim (features.pitchSelection). */
  pitchLocator: boolean;
}

const KEY = 'recess_settings';
const VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  sfx: 1,
  voice: 1,
  innings: INNINGS,
  difficulty: 'medium',
  errors: true,
  swingSpot: true,
  pitchLocator: true,
};

const DIFFICULTIES: readonly DifficultyLevel[] = ['teeball', 'easy', 'medium', 'hard'];

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<Settings>;
    const clamp01 = (v: unknown, d: number) =>
      typeof v === 'number' && v >= 0 && v <= 1 ? v : d;
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
    return {
      sfx: clamp01(p.sfx, DEFAULT_SETTINGS.sfx),
      voice: clamp01(p.voice, DEFAULT_SETTINGS.voice),
      innings: (INNING_CHOICES as readonly number[]).includes(p.innings as number)
        ? (p.innings as number)
        : DEFAULT_SETTINGS.innings,
      difficulty: DIFFICULTIES.includes(p.difficulty as DifficultyLevel)
        ? (p.difficulty as DifficultyLevel)
        : DEFAULT_SETTINGS.difficulty,
      errors: bool(p.errors, DEFAULT_SETTINGS.errors),
      swingSpot: bool(p.swingSpot, DEFAULT_SETTINGS.swingSpot),
      pitchLocator: bool(p.pitchLocator, DEFAULT_SETTINGS.pitchLocator),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...s }));
  } catch {
    /* non-persistent is fine */
  }
}
