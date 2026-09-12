// ---------------------------------------------------------------------------
// Pitcher stamina — PURE. A held feature: `features.stamina`, off by default.
//
// Every pitch drains a little of the tank; below `STAMINA.TIRED_AT` the arm's
// effective `pitching` stat sags linearly toward `stat - MAX_STAT_LOSS`, and the
// existing execution error (`pitchScatterFt(stat)` in `atbat.ts`) does the
// rest — a tired kid misses his spot more, and the CPU batter punishes hangers
// through the same plate model that already exists. Nothing new is drawn.
//
// v2-native on purpose: v1's `systems/fatigue.ts` reads `src/config.ts`'s
// `FATIGUE` block and its `PitchKind`, and `systems/` is not on the sim's
// five-module fence. The numbers are v1's, restated in `params.ts` with the
// caveat that they were never measured (`sim.stamina`).
//
// ★ `effectivePitching` RETURNS AN INTEGER IN 1..10, AND THAT IS LOAD-BEARING.
// `releaseAtSpot` memoises the release solve on `kind|pitchingStat|spot` and
// `fastballFlightSec` on the stat alone; each solve is ~13.6ms. v1 handed a
// fractional stat to a scatter formula and paid nothing for it. Here a
// fractional stat would be a fresh cache key every pitch — a whole game of
// misses, and the harness's 50,000 plate appearances would take forty-nine
// minutes again. So the sag is rounded, and `stamina.test.ts` asserts the
// image of the function over every (stat, stamina) is integers inside the band.
//
// ★ THERE IS NO RELIEF. v2 has no bullpen picker and no CPU relief rule, so
// the tank only goes down and a tired pitcher finishes the game. A playtest
// with children is what decides whether the tell reads and whether a bullpen
// is worth its UI; the hold in `docs/playtests/holds.json` records that.
//
// The state is mutated in place, the way `HalfState` and `PlayState` are —
// one object per fielding side for the whole game, owned by `game.ts`'s `Side`.
// ---------------------------------------------------------------------------

import { STAMINA } from './params';

export interface StaminaState {
  /** 1 = a full tank, 0 = running on fumes. */
  stamina: number;
}

/** A fresh arm. */
export function newStamina(): StaminaState {
  return { stamina: 1 };
}

/** One pitch thrown. A special pitch (PR D's kinds) costs triple. */
export function drainPitch(s: StaminaState, special: boolean): void {
  const cost = special ? STAMINA.DRAIN_SPECIAL : STAMINA.DRAIN_PER_PITCH;
  s.stamina = Math.max(0, s.stamina - cost);
}

/**
 * The stat a tired arm actually throws with: the full stat down to
 * `TIRED_AT`, then a linear sag to `stat - MAX_STAT_LOSS` at empty — ROUNDED,
 * and clamped to the 1..10 band every stat lives in (see the header).
 */
export function effectivePitching(stat: number, s: StaminaState): number {
  const t = Math.min(1, s.stamina / STAMINA.TIRED_AT);
  const sagged = Math.round(stat - (1 - t) * STAMINA.MAX_STAT_LOSS);
  return Math.max(1, Math.min(10, sagged));
}

/** Sweat territory: the HUD's tell, and where the sag begins. */
export function isTired(s: StaminaState): boolean {
  return s.stamina < STAMINA.TIRED_AT;
}
