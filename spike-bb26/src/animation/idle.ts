// OWNER: animation agent. Idle life: nobody stands still. Three additive
// layers — breathing (torso swell + tiny head nod), weight shift (slow hips
// lean the legs don't follow, so the kid settles onto one foot), and
// occasional head glances (piecewise turn-hold-return). Every parameter is
// drawn from the seeded rng ONCE at construction (phase, rate, amplitude), so
// the crowd never moves in sync and the same seed reproduces the same crowd.
//
// A layer owns an optional base snapshot: watchers/fielders/catcher re-apply
// their base pose every tick before the additive life (see rig.ts layering
// contract); the batter and pitcher pass base=null because the beat state
// machine (beat.ts) applies their base pose first.

import type { Rng } from '../core/rng';
import { Rig, Snapshot, easeInOut } from './rig';

const TAU = Math.PI * 2;

export type IdleScales = {
  breath?: number; // torso swell amplitude ×
  sway?: number; // weight-shift amplitude ×
  glance?: number; // head-glance amplitude × (0 = eyes stay on the game)
};

export class IdleLife {
  private readonly rig: Rig;
  private readonly base: Snapshot | null;

  private readonly breathAmp: number;
  private readonly breathHz: number;
  private readonly breathPhase: number;

  private readonly swayAmp: number;
  private readonly swayHz: number;
  private readonly swayPhase: number;

  private readonly glanceAmp: number;
  private readonly glancePeriodMs: number;
  private readonly glanceOffsetMs: number;

  private readonly fidgetPhase: number;

  constructor(rng: Rng, rig: Rig, base: Snapshot | null, scales: IdleScales = {}) {
    this.rig = rig;
    this.base = base;
    const breath = scales.breath ?? 1;
    const sway = scales.sway ?? 1;
    const glance = scales.glance ?? 1;

    // All rng draws happen HERE, at init, in construction order — the runtime
    // path below is a pure function of time.
    this.breathAmp = rng.range(0.014, 0.022) * breath;
    this.breathHz = rng.range(0.26, 0.38);
    this.breathPhase = rng.range(0, TAU);
    this.swayAmp = rng.range(0.025, 0.05) * sway;
    this.swayHz = rng.range(0.09, 0.16);
    this.swayPhase = rng.range(0, TAU);
    this.glanceAmp = rng.range(0.35, 0.6) * glance;
    this.glancePeriodMs = rng.range(4600, 9200);
    this.glanceOffsetMs = rng.range(0, this.glancePeriodMs);
    this.fidgetPhase = rng.range(0, TAU);
  }

  /** Piecewise glance: ease out to the side, hold, ease back, rest. */
  private glance(tMs: number): number {
    if (this.glanceAmp === 0) return 0;
    const shifted = tMs + this.glanceOffsetMs;
    const p = shifted % this.glancePeriodMs;
    const cycle = Math.floor(shifted / this.glancePeriodMs);
    const amp = this.glanceAmp * (cycle % 2 === 0 ? 1 : -1); // alternate sides
    if (p < 420) return amp * easeInOut(p / 420);
    if (p < 1750) return amp;
    if (p < 2170) return amp * (1 - easeInOut((p - 1750) / 420));
    return 0;
  }

  apply(tMs: number): void {
    const rig = this.rig;
    if (this.base) rig.apply(this.base);

    const t = tMs / 1000;

    // Breathing: torso swells, shoulders rise a hair, head nods behind it.
    const b = this.breathAmp * Math.sin(TAU * this.breathHz * t + this.breathPhase);
    rig.setTorsoBreath(b);
    rig.add('head', b * 0.9, 0, 0);

    // Weight shift: hips lean over planted feet; head counter-tilts level.
    const s = this.swayAmp * Math.sin(TAU * this.swayHz * t + this.swayPhase);
    rig.add('hips', 0, 0, s);
    rig.addHipsPos(s * 1.1, -Math.abs(s) * 0.35);
    rig.add('head', 0, 0, -s * 0.7);

    // Arm fidget: slow, tiny, out of phase with the sway.
    const f = Math.sin(TAU * 0.19 * t + this.fidgetPhase) * 0.035;
    rig.add('armL', 0, 0, f);
    rig.add('armR', 0, 0, -f);

    // Glances.
    rig.add('head', 0, this.glance(tMs), 0);
  }
}
