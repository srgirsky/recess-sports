// ---------------------------------------------------------------------------
// Game mode (CLASSIC main mode / KID MODE) — persisted per-browser like the
// pick log, plus the resolver that merges the LIVE tunables with the mode's
// multipliers into the flat params object the live-play sim consumes.
// ---------------------------------------------------------------------------

import { LIVE, MODES, TIMING, type GameMode, type ModeFeatures } from '../config';

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

export function getFeatures(m: GameMode): ModeFeatures {
  return MODES[m].features;
}

/** The swing-timing windows for a mode (main widens them — the cursor is the skill). */
export function getSwingTiming(m: GameMode): typeof TIMING {
  return MODES[m].swingTiming ?? TIMING;
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
}

export function resolveLiveParams(mode: GameMode): LiveParams {
  const m = MODES[mode].live;
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
    playerErrorMult: m.playerErrorMult,
    cpuErrorMult: m.cpuErrorMult,
    manualBaserunning: m.manualBaserunning,
    assist: m.fielderAssist,
    assistBlend: LIVE.ASSIST.MAGNET_BLEND,
  };
}
