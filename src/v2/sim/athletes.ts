// ---------------------------------------------------------------------------
// Where a 1-10 STAT becomes a real physical quantity. PURE.
//
// ★ WHY THIS FILE EXISTS AT ALL, and it is not tidiness.
//
// `defense.fielderSpeed` records v1's most expensive tuning bug: `FIELDER_SPEED`
// sat at 210 px/s through FIVE consecutive runner slowdowns, drifting from 1.20x
// to 2.47x runner speed, and the 2026-07-24 retune then scaled BOTH by 1/1.987 —
// faithfully preserving the wrong ratio. Its conclusion was that fielders and
// baserunners are the same kids, so the honest ratio is 1.0: "a kid does not get
// faster by putting a glove on."
//
// In v1 that is an invariant a test asserts. Here it becomes structurally
// impossible to violate, because there is exactly ONE function per physical
// quantity and every consumer calls it.
//
// ★ WHAT IS DELIBERATELY NOT HERE YET.
//
// `sprintSpeedFts`, `throwSpeedFts`, `reachFt`, `reactionSec`. They have no
// consumer until fielders and runners exist, and shipping them now would repeat
// exactly what `field.ts` did with `rollFriction` / `wallRestitution` /
// `bounceMult` / `obstacles`: four physics fields authored, tested, and
// consumed by nothing for months, which is a thing this project has criticised
// itself for twice. They land in PR 5, with the code that calls them.
// ---------------------------------------------------------------------------

import { BAT } from './params';
import { mphToFts } from './units';

/** Clamp a 1-10 stat, so a content typo cannot produce a negative bat. */
function stat01(stat: number): number {
  const s = stat < 1 ? 1 : stat > 10 ? 10 : stat;
  return (s - 1) / 9;
}

/**
 * Bat speed at the sweet spot, ft/s, from the `power` stat.
 *
 * ★ THE STAT'S OWN DOC COMMENT IS NOW STALE. `data/types.ts` glosses `power` as
 * "turns hits into extra bases (doubles, homers)" — a description of an OUTCOME,
 * written when outcomes were rolled. It is an input now: power sets how fast the
 * kid swings, and whether that becomes a double, a homer or a long out is
 * decided by the ball's flight and the defence.
 *
 * Linear in the stat because nothing justifies a curve. The roster spans power
 * 2-10 (nobody has 1), so the realised band is 37-53 mph.
 */
export function batSpeedFts(powerStat: number): number {
  const mph = BAT.SPEED_MIN_MPH + (BAT.SPEED_MAX_MPH - BAT.SPEED_MIN_MPH) * stat01(powerStat);
  return mphToFts(mph);
}
