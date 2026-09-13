// ---------------------------------------------------------------------------
// The juice meter — PURE. A held feature: `features.juice`, off by default.
//
// Great plays charge a per-side meter; a side spends it on one of three
// powers, each armed for the rest of the plate appearance it was bought in:
//
//   powerSwing   the batter's bat is faster and his window is narrower
//                (`contact.ts` `resolveSwing`, `SwingSpec.power`);
//   turboLegs    every runner on the batting side is faster on this PA's ball
//                in play (`play.ts` `beginPlay`, `PlaySpec.boost`);
//   goldenGlove  every fielder reaches a foot further and nothing is dropped
//                on this PA's ball in play (`fielders.ts` `reachBonusFt`,
//                `play.ts` `sureHands`).
//
//   crazy · fireball · freezeball
//                the fielding side's three special pitches
//                (`features.specialPitches`, `pitch.ts` `SPECIAL_PITCHES`),
//                bought on the windup for THIS pitch and thrown by
//                `throwPitch` as a physical parameter set; `game.ts` is the
//                gate that downgrades one the meter cannot cover.
//
// v2-native on purpose: v1's `systems/juice.ts` reads `src/config.ts`'s
// `JUICE` (a pixel world's numbers) and `data/types`' ability hooks, and
// `systems/` is not on the sim's five-module fence. The numbers are v1's,
// restated in `params.ts` with the caveat that they were never measured
// (`sim.juice`, `sim.specialPitches`). What is deliberately NOT here: the
// ability hooks (a signature kid's discount is a content question the hold
// does not ask), and `rallyCap` (`params.ts` says why).
//
// ★ THE STATE IS MUTATED IN PLACE, the way `StaminaState` and `PlayState`
// are — one object per side for the whole game, owned by `game.ts`'s `Side`.
//
// ★ THE CPU's ROLL DRAWS ONLY WHEN IT CAN AFFORD THE SPEND. `cpuWantsSpend`
// returns before touching the rng when the meter is short, so a broke side
// costs nothing; and its rng is a per-plate-appearance `fork('juice')` that
// nothing else reads, so with the flag off the fork is never drawn from and
// the golden fingerprints hold by `rng.ts`'s own rule ("a substream that is
// never drawn from costs nothing and shifts nothing").
// ---------------------------------------------------------------------------

import { JUICE } from './params';
import { SPECIAL_PITCH_KINDS, type SpecialPitchKind } from './pitch';
import type { Rng } from './rng';

export type JuiceGain = keyof typeof JUICE.GAINS;
/** Everything the meter buys: the three powers and the three special pitches. */
export type SpendKind = keyof typeof JUICE.COSTS;
/** The three POWERS — the spends that arm for a plate appearance and sit on the tray. */
export type PowerKind = Exclude<SpendKind, SpecialPitchKind>;

/**
 * The three POWERS, in the order the tray shows them. The special pitches are
 * spends too (`SpendKind` covers them, the `spend` event names them) but they
 * are not chips — a special is picked off the pitch picker's extra cards, and
 * `pitch.ts` `SPECIAL_PITCH_KINDS` is that order.
 */
export const SPEND_KINDS: ReadonlyArray<PowerKind> = Object.freeze([
  'powerSwing',
  'turboLegs',
  'goldenGlove',
] as const);

/** Is this spend one of the special pitches rather than a power? */
export function isSpecialSpend(kind: SpendKind): kind is SpecialPitchKind {
  return (SPECIAL_PITCH_KINDS as ReadonlyArray<string>).includes(kind);
}

export interface JuiceState {
  /** Meter points, 0..`JUICE.MAX`. */
  value: number;
}

/** An empty meter. */
export function newJuice(): JuiceState {
  return { value: 0 };
}

/** Charge the meter for a play, capped at the ceiling. */
export function addJuice(j: JuiceState, kind: JuiceGain): void {
  j.value = Math.min(JUICE.MAX, j.value + JUICE.GAINS[kind]);
}

export function canSpend(j: JuiceState, kind: SpendKind): boolean {
  return j.value >= JUICE.COSTS[kind];
}

/** Spend, if affordable. Returns whether it happened; a short meter is untouched. */
export function spend(j: JuiceState, kind: SpendKind): boolean {
  if (!canSpend(j, kind)) return false;
  j.value -= JUICE.COSTS[kind];
  return true;
}

/** Which side a spend belongs to: the batter's two, or the fielders' four. */
export function spendSide(kind: SpendKind): 'batting' | 'fielding' {
  return kind === 'goldenGlove' || isSpecialSpend(kind) ? 'fielding' : 'batting';
}

/**
 * Does the CPU spend this now? One roll at an eagerness keyed on the score
 * from the CPU's own side (`scoreDiff` = its runs minus the other side's),
 * and NO roll when it cannot afford the kind.
 */
export function cpuWantsSpend(j: JuiceState, kind: SpendKind, scoreDiff: number, rng: Rng): boolean {
  if (!canSpend(j, kind)) return false;
  const e = JUICE.CPU_EAGERNESS;
  const eagerness = scoreDiff < 0 ? e.trailing : scoreDiff === 0 ? e.level : e.leading;
  return rng() < eagerness;
}

/**
 * Which special pitch, if any, the CPU throws on this windup
 * (`features.specialPitches`): v1's `cpuPickSpecialPitch` shape — one
 * want-roll at `cpuWantsSpend`'s eagerness, then a uniform pick among what
 * the meter can afford. ZERO draws when it can afford none, one when the
 * roll fails, two on a pick — so a broke side costs nothing, and off the
 * same per-plate-appearance `fork('juice')` the powers roll on.
 */
export function cpuPickSpecialPitch(j: JuiceState, scoreDiff: number, rng: Rng): SpecialPitchKind | null {
  const affordable = SPECIAL_PITCH_KINDS.filter((k) => canSpend(j, k));
  if (affordable.length === 0) return null;
  const e = JUICE.CPU_EAGERNESS;
  const eagerness = scoreDiff < 0 ? e.trailing : scoreDiff === 0 ? e.level : e.leading;
  if (rng() >= eagerness) return null;
  return rng.pick(affordable);
}
