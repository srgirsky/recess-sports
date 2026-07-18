// ---------------------------------------------------------------------------
// Difficulty setting (EASY / HARD) — persisted per-browser like the pick log,
// plus the resolver that merges the LIVE tunables with the difficulty
// multipliers into the flat params object the live-play sim consumes.
// ---------------------------------------------------------------------------

import { LIVE, DIFFICULTY, type Difficulty } from '../config';

const KEY = 'recess_difficulty';

export function getDifficulty(): Difficulty {
  try {
    return localStorage.getItem(KEY) === 'hard' ? 'hard' : 'easy';
  } catch {
    return 'easy';
  }
}

export function setDifficulty(d: Difficulty): void {
  try {
    localStorage.setItem(KEY, d);
  } catch {
    /* ignore — the game still works, the choice just won't persist */
  }
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
  cpuCatchRadius: number; // CPU reach is never inflated by easy mode
  cpuPickupRadius: number;
  throwSpeedMin: number;
  throwSpeedMax: number;
  throwMeterMs: number;
  playerRunSpeed: number; // px/s at speed stat 5
  cpuRunSpeed: number;
  autoThrowMs: number;
  maxPlayMs: number;
}

export function resolveLiveParams(d: Difficulty): LiveParams {
  const m = DIFFICULTY[d];
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
  };
}
