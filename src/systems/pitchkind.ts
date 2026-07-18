// ---------------------------------------------------------------------------
// Pitch types + strike-zone aiming (main mode). PURE.
//
// Everything works in "plate coords": px offsets from the strike-zone center
// (which the scene anchors at HOME.x, HOME.y + PLATE_ZONE.CY). The player (or
// the CPU) picks a pitch KIND and aims at a TARGET; meter timing + pitching
// stat decide how far the ball scatters from that aim; PLATE_ZONE decides
// whether the ACTUAL crossing point is a strike. The break numbers only shape
// the flight (ballCurveAt) and feed deception — aim is always "where it ends
// up", so aiming skill stays readable for kids.
// ---------------------------------------------------------------------------

import { PLATE_ZONE, PITCHES, PITCH_SCATTER, type PitchKind } from '../config';

export type { PitchKind };

/** A point in plate coords: (0,0) = strike-zone center. */
export interface PlateLoc {
  x: number;
  y: number;
}

/** One resolved pitch: what was thrown, where it was aimed, where it crossed. */
export interface PitchPlan {
  kind: PitchKind;
  target: PlateLoc;
  actual: PlateLoc;
  inZone: boolean;
  /** Flight time for this pitch given the half's base travel time (ms). */
  travelMs: number;
}

/** The pitch kinds a pitcher may throw. `crazy` needs juice (later phase). */
export function availablePitches(hasJuice: boolean): PitchKind[] {
  const base: PitchKind[] = ['fastball', 'changeup', 'curve', 'screwball'];
  return hasJuice ? [...base, 'crazy'] : base;
}

export function isInZone(p: PlateLoc): boolean {
  return Math.abs(p.x) <= PLATE_ZONE.W / 2 && Math.abs(p.y) <= PLATE_ZONE.H / 2;
}

/** How far (px) a point sits outside the zone edge. 0 when it's a strike. */
export function distOffZone(p: PlateLoc): number {
  const dx = Math.max(0, Math.abs(p.x) - PLATE_ZONE.W / 2);
  const dy = Math.max(0, Math.abs(p.y) - PLATE_ZONE.H / 2);
  return Math.hypot(dx, dy);
}

/** 0 at the zone center → 1 at the zone edge ("painting the corner"). */
export function edgeFactor(p: PlateLoc): number {
  return Math.min(1, Math.max(Math.abs(p.x) / (PLATE_ZONE.W / 2), Math.abs(p.y) / (PLATE_ZONE.H / 2)));
}

/**
 * Resolve where a thrown pitch actually crosses the plate. Scatter grows with
 * meter error and shrinks with the pitching stat; the aim point is the
 * intended FINAL location (break is flight shape, not drift).
 */
export function resolvePitchLocation(
  kind: PitchKind,
  target: PlateLoc,
  pitcherStat: number,
  meterErrorMs: number,
  baseTravelMs: number,
  rng: () => number
): PitchPlan {
  const def = PITCHES[kind];
  const scatter = Math.min(
    PITCH_SCATTER.MAX,
    PITCH_SCATTER.BASE +
      Math.abs(meterErrorMs) * PITCH_SCATTER.PER_ERROR_MS +
      Math.max(0, 5 - pitcherStat) * PITCH_SCATTER.PER_STAT_BELOW
  );
  const actual: PlateLoc = {
    x: target.x + (rng() * 2 - 1) * scatter,
    y: target.y + (rng() * 2 - 1) * scatter,
  };
  return {
    kind,
    target,
    actual,
    inZone: isInZone(actual),
    travelMs: baseTravelMs / def.speedMult,
  };
}

/**
 * The CPU pitcher's turn (the player is batting): pick a kind and a spot.
 * Ahead in the count it wastes pitches off the edge to tempt a chase; behind,
 * it grooves one. Execution error comes from the pitching stat.
 */
export function chooseCpuPitch(
  pitcherStat: number,
  count: { balls: number; strikes: number },
  baseTravelMs: number,
  rng: () => number
): PitchPlan {
  const kinds = availablePitches(false);
  const kind = kinds[Math.floor(rng() * kinds.length)];

  // Aim: corners by default; waste off the zone when ahead; groove when behind.
  const ahead = count.strikes >= 2 && count.balls <= 1;
  const behind = count.balls >= 3;
  const cornerX = (rng() < 0.5 ? -1 : 1) * (PLATE_ZONE.W / 2 - 12);
  const cornerY = (rng() < 0.5 ? -1 : 1) * (PLATE_ZONE.H / 2 - 14);
  let target: PlateLoc;
  if (ahead && rng() < 0.55) {
    // Waste pitch: just off the edge — a "don't swing" test with no telegraph.
    target = {
      x: cornerX * 1.55,
      y: cornerY * (rng() < 0.5 ? 1.4 : 0.6),
    };
  } else if (behind) {
    target = { x: cornerX * 0.3, y: cornerY * 0.3 }; // has to come in
  } else {
    target = { x: cornerX * (0.5 + rng() * 0.5), y: cornerY * (0.4 + rng() * 0.6) };
  }

  // CPU "meter error" scales down with its pitching stat.
  const errorMs = rng() * 160 * (1 - Math.min(9, pitcherStat) / 12);
  return resolvePitchLocation(kind, target, pitcherStat, errorMs, baseTravelMs, rng);
}

/**
 * The flight bend: an offset (plate-coord px) to ADD to a straight-line
 * mound→plate interpolation at flight fraction t (0..1). Zero at both ends so
 * the ball leaves the hand and arrives at `actual` exactly; the bow peaks
 * late so curves read as "breaking". Deterministic — shared by renderer + sim.
 */
export function ballCurveAt(plan: PitchPlan, t: number): PlateLoc {
  const def = PITCHES[plan.kind];
  const bow = Math.sin(Math.PI * t) * t; // 0 → peaks ~t 0.65 → 0
  const flutter = def.wobble > 0 ? Math.sin(t * Math.PI * 5) * def.wobble * Math.sin(Math.PI * t) : 0;
  return {
    x: def.breakX * bow + flutter,
    y: def.breakY * bow,
  };
}
