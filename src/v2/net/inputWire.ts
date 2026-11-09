// ---------------------------------------------------------------------------
// Whose verb is it? PURE.
//
// ★ ONLINE, THE SIM HAS NO SIDE TO GUARD. With one person it is told
// `humanSide` and drops a wrong-side order itself; with two people it is run
// the way pass-and-play runs it — no human side at all — and then it takes
// every input it is handed. So the guard moves here: a `PlayInputs` is split by
// ROLE, the batting player's verbs come only from whoever is batting and the
// fielding player's only from whoever is fielding, and the two halves are
// joined into the one object the generator reads.
//
// That is a fairness rule and a safety rule at once. Without it a batter's tap
// on a base — which also moves the pointer — would steer the other kid's
// fielder, and a guest's device could order the host's runners about.
//
// And nothing off the wire is trusted for SHAPE either: `sanitizeInputs`
// rebuilds the object field by field from known keys, finite numbers and known
// enumerations, so a malformed or hostile message becomes "no input".
// ---------------------------------------------------------------------------

import type { PlayInputs } from '../sim/play';
import { SPEND_KINDS, spendSide, type SpendKind } from '../sim/juice';
import { SPECIAL_PITCH_KINDS, type PitchKind } from '../sim/pitch';
import { SHIFTS, type Shift } from '../sim/shifts';

export type Side = 'away' | 'home';
export type Role = 'bat' | 'field';

/** The visitors bat the top of every inning. */
export function roleOf(side: Side, half: 'top' | 'bottom'): Role {
  return (side === 'away') === (half === 'top') ? 'bat' : 'field';
}

export function otherSide(side: Side): Side {
  return side === 'away' ? 'home' : 'away';
}

/** Only the verbs that belong to `role`. Never mutates its argument. */
export function verbsFor(inputs: PlayInputs, role: Role): PlayInputs {
  const out: PlayInputs = {};
  if (role === 'bat') {
    if (inputs.swing) out.swing = inputs.swing;
    if (inputs.steal) out.steal = inputs.steal;
    if (inputs.sendRunner) out.sendRunner = inputs.sendRunner;
    if (inputs.holdRunner) out.holdRunner = inputs.holdRunner;
  } else {
    if (inputs.pitch) out.pitch = inputs.pitch;
    if (inputs.pickoff) out.pickoff = inputs.pickoff;
    if (inputs.shift) out.shift = inputs.shift;
    if (inputs.throwDown) out.throwDown = inputs.throwDown;
    if (inputs.pointer) out.pointer = inputs.pointer;
    if (inputs.dive) out.dive = inputs.dive;
    if (inputs.throwTo) out.throwTo = inputs.throwTo;
  }
  if (inputs.spend && spendSide(inputs.spend) === (role === 'bat' ? 'batting' : 'fielding')) {
    out.spend = inputs.spend;
  }
  return out;
}

/**
 * The one object the generator reads: each player's inputs cut down to the
 * role they hold this half, then joined. The roles are disjoint, so the join
 * cannot overwrite anything.
 */
export function joinInputs(
  half: 'top' | 'bottom',
  mine: PlayInputs,
  mySide: Side,
  theirs: PlayInputs
): PlayInputs {
  return {
    ...verbsFor(mine, roleOf(mySide, half)),
    ...verbsFor(theirs, roleOf(otherSide(mySide), half)),
  };
}

const BASE_KINDS: ReadonlyArray<PitchKind> = ['fastball', 'changeup', 'curve', 'screwball'];
const PITCH_KINDS: ReadonlyArray<string> = [...BASE_KINDS, ...SPECIAL_PITCH_KINDS];
const SPENDS: ReadonlyArray<string> = [...SPEND_KINDS, ...SPECIAL_PITCH_KINDS];

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** A character id: short, and nothing but the characters an id is made of. */
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9_]{1,40}$/i.test(v);
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;

/** Rebuild a `PlayInputs` from untrusted JSON. Anything malformed is dropped. */
export function sanitizeInputs(raw: unknown): PlayInputs {
  const out: PlayInputs = {};
  const r = obj(raw);
  if (!r) return out;

  const pointer = obj(r.pointer);
  if (pointer && num(pointer.x) && num(pointer.z)) out.pointer = { x: pointer.x, z: pointer.z };
  if (r.dive === true) out.dive = true;
  const throwTo = obj(r.throwTo);
  if (throwTo && (throwTo.base === 1 || throwTo.base === 2 || throwTo.base === 3 || throwTo.base === 4)) {
    out.throwTo = { base: throwTo.base };
  }
  if (id(r.sendRunner)) out.sendRunner = r.sendRunner;
  if (id(r.holdRunner)) out.holdRunner = r.holdRunner;
  const swing = obj(r.swing);
  if (swing && num(swing.atSec) && num(swing.aimHeightFt)) {
    out.swing = { atSec: swing.atSec, aimHeightFt: swing.aimHeightFt };
    if (swing.bunt === true) out.swing.bunt = true;
  }
  const pitch = obj(r.pitch);
  if (
    pitch &&
    typeof pitch.kind === 'string' &&
    PITCH_KINDS.includes(pitch.kind) &&
    num(pitch.aimLateralFt) &&
    num(pitch.aimHeightFt)
  ) {
    out.pitch = {
      kind: pitch.kind as PitchKind,
      aimLateralFt: pitch.aimLateralFt,
      aimHeightFt: pitch.aimHeightFt,
    };
  }
  if (typeof r.spend === 'string' && SPENDS.includes(r.spend)) out.spend = r.spend as SpendKind;
  if (typeof r.shift === 'string' && (SHIFTS as ReadonlyArray<string>).includes(r.shift)) {
    out.shift = r.shift as Shift;
  }
  if (r.steal === true) out.steal = true;
  const throwDown = obj(r.throwDown);
  if (throwDown && num(throwDown.atSec)) out.throwDown = { atSec: throwDown.atSec };
  if (r.pickoff === true) out.pickoff = true;
  return out;
}

/** Is there anything in it worth a message? */
export function hasVerb(inputs: PlayInputs): boolean {
  return Object.keys(inputs).length > 0;
}
