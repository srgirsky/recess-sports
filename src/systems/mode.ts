// ---------------------------------------------------------------------------
// Game mode (CLASSIC main mode / KID MODE) — persisted per-browser like the
// pick log, plus the resolver that merges the LIVE tunables with the mode's
// multipliers into the flat params object the live-play sim consumes.
// ---------------------------------------------------------------------------

import {
  CPU_PITCH_TRAVEL_MS,
  DIFFICULTY_TIERS,
  LIVE,
  MODES,
  PITCH_SPEED,
  PITCH_TRAVEL_MS,
  TEE_PITCH_MS,
  TIMING,
  type DifficultyLevel,
  type GameMode,
  type ModeFeatures,
} from '../config';
import { getSettings, saveSettings } from './settings';

const KEY = 'recess_mode';
/** Pre-rename key ('easy' | 'hard') — migrated on first read. */
const LEGACY_KEY = 'recess_difficulty';

export function getMode(): GameMode {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'kid' || stored === 'main') return stored;
    // Migrate the old difficulty choice: easy → kid, hard → main.
    const legacy = localStorage.getItem(LEGACY_KEY);
    const mode: GameMode = legacy === 'easy' ? 'kid' : 'main';
    localStorage.setItem(KEY, mode);
    return mode;
  } catch {
    return 'main';
  }
}

export function setMode(m: GameMode): void {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* ignore — the game still works, the choice just won't persist */
  }
}

/**
 * The player-facing difficulty tier. `recess_mode` stays the authoritative
 * internal switch (the goldlog harness + net handshake write/read it directly),
 * so the label is reconciled against it: a legacy player who set kid/main
 * before the ladder existed still sees a matching tier.
 */
export function getDifficulty(): DifficultyLevel {
  const d = getSettings().difficulty;
  if (DIFFICULTY_TIERS[d].mode === getMode()) return d;
  return getMode() === 'kid' ? 'easy' : 'medium';
}

/** Pick a difficulty: persists the label AND syncs the internal mode. */
export function setDifficulty(d: DifficultyLevel): void {
  saveSettings({ ...getSettings(), difficulty: d });
  setMode(DIFFICULTY_TIERS[d].mode);
}

/** Tee-ball sits the ball on a tee (kid difficulty + this flag). */
export function isTee(d: DifficultyLevel = getDifficulty()): boolean {
  return DIFFICULTY_TIERS[d].tee;
}

/** The CPU ramp levels a difficulty starts with (HARD begins sharper). */
export function difficultyBaseRamp(d: DifficultyLevel = getDifficulty()): number {
  return DIFFICULTY_TIERS[d].baseRamp;
}

/**
 * GAME SETUP helper toggles that trim a mode's feature set. These can only
 * DISABLE what the mode already enables (a helper is reducible, never adds a
 * mechanic kid mode doesn't have) — so the default (all true) is a no-op and
 * the seeded goldlog stream is unaffected.
 */
export interface FeatureOverrides {
  errors?: boolean;
  swingSpot?: boolean; // the batting cursor
  pitchLocator?: boolean; // pitch selection + zone aim
}

export function getFeatures(m: GameMode, o?: FeatureOverrides): ModeFeatures {
  const base = MODES[m].features;
  if (!o) return base;
  return {
    ...base,
    errors: base.errors && (o.errors ?? true),
    battingCursor: base.battingCursor && (o.swingSpot ?? true),
    pitchSelection: base.pitchSelection && (o.pitchLocator ?? true),
  };
}

/** The swing-timing windows for a mode (main widens them — the cursor is the skill). */
export function getSwingTiming(m: GameMode): typeof TIMING {
  return MODES[m].swingTiming ?? TIMING;
}

/**
 * Base pitch travel (ms) before the per-kind speedMult and per-arm term.
 * `half` is which side the HUMAN plays: 'batting' = the ball flies at you,
 * 'pitching' = you're on the mound. CLASSIC reads the Backyard-paced
 * PITCH_SPEED block; kid mode keeps the original floaty constants.
 */
export function getPitchBaseMs(
  m: GameMode,
  half: 'batting' | 'pitching',
  tee = false
): number {
  if (tee) return TEE_PITCH_MS; // tee-ball: a slow soft lob, trivial to time
  if (m === 'kid') return half === 'batting' ? PITCH_TRAVEL_MS : CPU_PITCH_TRAVEL_MS;
  return half === 'batting' ? PITCH_SPEED.MAIN_BASE_MS : PITCH_SPEED.MAIN_CPU_BASE_MS;
}

/** Everything the live-play sim needs to know about speed/forgiveness. */
export interface LiveParams {
  fielderSpeed: number; // player-steered fielder, px/s
  cpuFielderSpeed: number;
  cpuReactionMs: number;
  cpuThrowDelayMs: number;
  cpuThrowSpeed: number; // px/s
  cpuThrowErrorMs: number;
  catchRadius: number; // player's grab reach, px
  pickupRadius: number;
  cpuCatchRadius: number; // CPU reach is never inflated by kid mode
  cpuPickupRadius: number;
  throwSpeedMin: number;
  throwSpeedMax: number;
  throwMeterMs: number;
  playerRunSpeed: number; // px/s at speed stat 5
  cpuRunSpeed: number;
  autoThrowMs: number;
  maxPlayMs: number;
  playerErrorMult: number; // scale on player-team drop/wild chances (0 = never)
  cpuErrorMult: number;
  manualBaserunning: boolean; // tag-ups, doubling off, tags/rundowns, per-runner control
  assist: 'auto' | 'magnet'; // idle pointer: fielder plays itself / steering bent ball-ward
  assistBlend: number; // magnet strength (0..1)
  diveEnabled: boolean; // the tap-to-dive verb (CLASSIC only)
  diveReachBonus: number; // px added to grab reach mid-dive
  diveWindowMs: number; // lunge duration
  diveWhiffMs: number; // empty-dive freeze
}

export function resolveLiveParams(mode: GameMode, o?: FeatureOverrides): LiveParams {
  const m = MODES[mode].live;
  // Errors OFF forces both mults to 0 — mult 0 skips the rng roll entirely
  // (per config), so a no-error game stays byte-deterministic.
  const errorsOff = o?.errors === false;
  return {
    fielderSpeed: LIVE.FIELDER_SPEED,
    cpuFielderSpeed: LIVE.FIELDER_SPEED * m.cpuFielderSpeedMult,
    cpuReactionMs: m.cpuReactionMs,
    cpuThrowDelayMs: m.cpuThrowDelayMs,
    cpuThrowSpeed: LIVE.THROW_SPEED_MAX * m.cpuThrowSpeedMult,
    cpuThrowErrorMs: m.cpuThrowErrorMs,
    catchRadius: LIVE.CATCH_RADIUS * m.reachMult,
    pickupRadius: LIVE.PICKUP_RADIUS * m.reachMult,
    cpuCatchRadius: LIVE.CATCH_RADIUS,
    cpuPickupRadius: LIVE.PICKUP_RADIUS,
    throwSpeedMin: LIVE.THROW_SPEED_MIN,
    throwSpeedMax: LIVE.THROW_SPEED_MAX,
    throwMeterMs: LIVE.THROW_METER_MS,
    playerRunSpeed: LIVE.RUNNER_SPEED * m.playerRunSpeedMult,
    cpuRunSpeed: LIVE.RUNNER_SPEED * m.cpuRunSpeedMult,
    autoThrowMs: LIVE.AUTO_THROW_MS,
    maxPlayMs: LIVE.MAX_PLAY_MS,
    playerErrorMult: errorsOff ? 0 : m.playerErrorMult,
    cpuErrorMult: errorsOff ? 0 : m.cpuErrorMult,
    manualBaserunning: m.manualBaserunning,
    assist: m.fielderAssist,
    assistBlend: LIVE.ASSIST.MAGNET_BLEND,
    diveEnabled: MODES[mode].features.dive,
    diveReachBonus: LIVE.DIVE.REACH_BONUS,
    diveWindowMs: LIVE.DIVE.WINDOW_MS,
    diveWhiffMs: LIVE.DIVE.WHIFF_MS,
  };
}
