// ---------------------------------------------------------------------------
// The rules layer. PURE. Tracks the count, outs, and bases, and advances
// runners on a hit. Baserunning is deliberately "dumb" (everyone moves up by
// the number of bases hit) — little kids won't notice, and it saves a world of
// edge cases. Speed occasionally buys one extra base, handled in atbat.ts.
// ---------------------------------------------------------------------------

import type { AtBatResult } from './atbat';

export interface HalfInningState {
  outs: number;
  /** bases[0]=first, [1]=second, [2]=third. true = runner present. */
  bases: [boolean, boolean, boolean];
  runs: number;
  count: { balls: number; strikes: number };
}

export function newHalfInning(): HalfInningState {
  return {
    outs: 0,
    bases: [false, false, false],
    runs: 0,
    count: { balls: 0, strikes: 0 },
  };
}

export function isHalfOver(state: HalfInningState): boolean {
  return state.outs >= 3;
}

/**
 * One runner's journey on a hit, in base units: 0 = home/at-bat (the batter),
 * 1/2/3 = the bases, 4 = crossed home and scored. The scene tweens sprites
 * along exactly these paths, so the animation is always driven by the real
 * rules — it can never disagree with the resulting `state.bases`.
 */
export interface RunnerMove {
  fromBase: number; // 0 = batter at home, 1-3 = on a base
  toBase: number; // 1-3 = ended on a base, 4 = scored
}

export interface ApplyResult {
  state: HalfInningState;
  /** Runs that scored on THIS at-bat (for pop-up animations / SFX). */
  runsScored: number;
  /** True if this at-bat retired the batter (out or strikeout). */
  batterOut: boolean;
  /** True if the batter's turn ended (out or reached base) — advance the lineup. */
  batterDone: boolean;
  /** Runner movements to animate (only on a hit; empty otherwise). */
  movements: RunnerMove[];
}

/**
 * Fold a single at-bat outcome into the half-inning. Returns a fresh state plus
 * a little summary the scene uses to animate.
 */
export function applyAtBat(
  prev: HalfInningState,
  result: AtBatResult
): ApplyResult {
  const state: HalfInningState = {
    outs: prev.outs,
    bases: [...prev.bases] as [boolean, boolean, boolean],
    runs: prev.runs,
    count: { ...prev.count },
  };

  switch (result.kind) {
    case 'foul': {
      // Foul is a strike, but never the third strike.
      if (state.count.strikes < 2) state.count.strikes += 1;
      return { state, runsScored: 0, batterOut: false, batterDone: false, movements: [] };
    }

    case 'strike': {
      state.count.strikes += 1;
      if (state.count.strikes >= 3) {
        state.outs += 1;
        state.count = { balls: 0, strikes: 0 };
        return { state, runsScored: 0, batterOut: true, batterDone: true, movements: [] };
      }
      return { state, runsScored: 0, batterOut: false, batterDone: false, movements: [] };
    }

    case 'out': {
      state.outs += 1;
      state.count = { balls: 0, strikes: 0 };
      return { state, runsScored: 0, batterOut: true, batterDone: true, movements: [] };
    }

    case 'hit': {
      const { runs, movements } = advanceRunners(state, result.bases);
      state.runs += runs;
      state.count = { balls: 0, strikes: 0 };
      return { state, runsScored: runs, batterOut: false, batterDone: true, movements };
    }
  }
}

/**
 * Push every runner (and the batter) forward by `bases`. Anyone past third
 * scores. Mutates `state.bases` in place; returns runs scored plus the list of
 * per-runner movements for the scene to animate.
 */
function advanceRunners(
  state: HalfInningState,
  bases: number
): { runs: number; movements: RunnerMove[] } {
  // Positions as distances from home: batter starts at 0.
  // Represent occupied bases as a list of positions (1..3), add the batter.
  const runners: number[] = [];
  if (state.bases[0]) runners.push(1);
  if (state.bases[1]) runners.push(2);
  if (state.bases[2]) runners.push(3);
  runners.push(0); // the batter

  let runs = 0;
  const movements: RunnerMove[] = [];
  const newBases: [boolean, boolean, boolean] = [false, false, false];
  for (const pos of runners) {
    const dest = pos + bases;
    movements.push({ fromBase: pos, toBase: Math.min(dest, 4) });
    if (dest >= 4) {
      runs += 1; // crossed home
    } else {
      newBases[dest - 1] = true;
    }
  }
  state.bases = newBases;
  return { runs, movements };
}
