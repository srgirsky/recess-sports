// ---------------------------------------------------------------------------
// Player settings — persisted like picklog/mode. Two independent volumes
// (SFX rides the Web Audio master gain; voice rides each utterance's volume —
// they're separate pipelines by design) and the game length in innings.
// ---------------------------------------------------------------------------

import { INNINGS } from '../config';

export interface Settings {
  /** 0..1 multiplier on the SFX master gain. */
  sfx: number;
  /** 0..1 multiplier on speech volume. */
  voice: number;
  /** Regulation innings per game (gameflow already takes it as a param). */
  innings: number;
}

const KEY = 'recess_settings';
const VERSION = 1;

export const DEFAULT_SETTINGS: Settings = { sfx: 1, voice: 1, innings: INNINGS };

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<Settings>;
    const clamp01 = (v: unknown, d: number) =>
      typeof v === 'number' && v >= 0 && v <= 1 ? v : d;
    return {
      sfx: clamp01(p.sfx, DEFAULT_SETTINGS.sfx),
      voice: clamp01(p.voice, DEFAULT_SETTINGS.voice),
      innings:
        typeof p.innings === 'number' && p.innings >= 1 && p.innings <= 3
          ? Math.round(p.innings)
          : DEFAULT_SETTINGS.innings,
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
