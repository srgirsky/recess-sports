// ---------------------------------------------------------------------------
// The collision is checked against an IDENTITY, not against itself: Nathan's
// Eq. 3 is exact for any ball, bat and collision model, so it can be asserted
// symbolically. Everything else is checked against published bands (youth bat
// speed, youth exit velocity, Kensrud's measured spin range) or against the
// roster the game actually ships.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  collisionEfficiency,
  exitVelocity,
  resolveSwing,
  timingQuality,
  type SwingSpec,
} from './contact';
import { batSpeedFts } from './athletes';
import { PITCHES, armMult, flyToPlate, releasePitch, type PitchKind } from './pitch';
import { BAT, BALL } from './params';
import { makeRng } from './rng';
import { cloneState, groundGuard, stepFlight, FLIGHT_HZ } from './flight';
import { launch } from './launch';
import { ftsToMph, mphToFts } from './units';
import { VENUE_GEOMETRY, distFromHome, fenceDistAt } from './field';
import { ROSTER, getCharacter } from '../../data/characters';

const PARK = VENUE_GEOMETRY.park;
const SANDLOT = VENUE_GEOMETRY.sandlot;
const rng = makeRng('contact-tests');

/** The pitch a batter actually sees: released, flown, measured at the plate. */
function pitchAtPlate(kind: PitchKind = 'fastball', pitchingStat = 5) {
  const flown = flyToPlate(releasePitch({ kind, pitchingStat, aimHeightFt: 2.4, aimLateralFt: 0 }));
  return {
    travelSec: flown.travelSec,
    speedFts: Math.sqrt(
      flown.state.v.x * flown.state.v.x +
        flown.state.v.y * flown.state.v.y +
        flown.state.v.z * flown.state.v.z
    ),
    state: flown.state,
  };
}

/** Fly a batted ball to the ground and report how far it carried. */
function carryFt(spec: Parameters<typeof launch>[0]): number {
  let s = cloneState(launch(spec));
  const dt = 1 / FLIGHT_HZ;
  let t = 0;
  while (t < 20) {
    const r = stepFlight(s, dt, { ground: groundGuard });
    t += r.event ? r.event.tSec : dt;
    s = r.state;
    if (r.event) break;
  }
  return distFromHome({ x: s.p.x, z: s.p.z });
}

/** The best a kid can do: sweep the undercut, perfect timing. */
function bestCarryFor(powerStat: number): { carry: number; evMph: number; spinRpm: number } {
  const p = pitchAtPlate();
  const kid = ROSTER.find((c) => c.stats.power === powerStat) ?? ROSTER[0];
  let best = { carry: 0, evMph: 0, spinRpm: 0 };
  for (let u = 0; u <= 0.22; u += 0.005) {
    const r = resolveSwing(
      { timingErrorSec: 0, undercutFt: u, batter: kid, travelSec: p.travelSec, pitchSpeedFts: p.speedFts },
      rng
    );
    if (r.kind !== 'contact') continue;
    const c = carryFt(r.launch);
    if (c > best.carry) {
      best = { carry: c, evMph: ftsToMph(r.launch.exitVelocityFts), spinRpm: r.launch.spinRpm };
    }
  }
  return best;
}

describe('the collision', () => {
  it('satisfies Nathan Eq. 3 as an identity, for any inputs', () => {
    // v_f = e_A*v_ball + (1 + e_A)*v_bat is derived "from nothing other than the
    // definition of e_A followed by a change of inertial reference frame" — it
    // is exact, so it can be asserted symbolically rather than in a band.
    for (const eA of [0, 0.05, 0.1, 0.2, 0.35]) {
      for (const vp of [0, 20, 37.6, 90]) {
        for (const vb of [0, 30, 51, 130]) {
          expect(exitVelocity(eA, vp, vb), `eA=${eA} vp=${vp} vb=${vb}`).toBeCloseTo(
            eA * vp + vb + eA * vb,
            9
          );
        }
      }
    }
  });

  it('derives e_A from the recoil factor rather than stating it', () => {
    // Nathan Eq. 6: e_A = (e - r)/(1 + r), r = m/M_eff. Recomputed here from the
    // published COR and the bat's mass, so the two can never drift apart.
    const r = BALL.MASS_OZ / BAT.EFFECTIVE_MASS_OZ;
    expect(collisionEfficiency()).toBeCloseTo((BAT.BALL_BAT_COR - r) / (1 + r), 12);
    expect(collisionEfficiency()).toBeCloseTo(0.098, 3);
  });

  it('★ makes a kid a kid through the RECOIL FACTOR, not a fudge', () => {
    // The whole reason a child is not a small adult: a light bat recoils more,
    // so less of the collision reaches the ball. An adult's ~20oz effective
    // mass gives e_A ~ 0.20; a youth 14oz gives ~0.098. Same COR, same identity.
    const adult = collisionEfficiency(20.5);
    const youth = collisionEfficiency(14);
    expect(adult).toBeGreaterThan(youth * 1.8);
    expect(adult).toBeCloseTo(0.2, 2);
    // And heavier is always better, monotonically.
    let prev = -1;
    for (const m of [10, 12, 14, 16, 18, 20, 24]) {
      const e = collisionEfficiency(m);
      expect(e, `M_eff=${m}`).toBeGreaterThan(prev);
      prev = e;
    }
  });

  it('reproduces the published 8U TEE exit-velocity band', () => {
    // Off a tee the pitch contributes nothing, so v_f = (1 + e_A)*v_bat and the
    // model is being checked against coaching data with no free parameter.
    // Published: 8-and-under tee exit velocity 45-55 mph.
    const eA = collisionEfficiency();
    for (const batMph of [40, 45, 50]) {
      const tee = ftsToMph(exitVelocity(eA, 0, mphToFts(batMph)));
      expect(tee, `bat ${batMph}`).toBeGreaterThan(42);
      expect(tee, `bat ${batMph}`).toBeLessThan(56);
    }
  });
});

describe('bat speed from the power stat', () => {
  it('spans the published youth band', () => {
    // Little League bat speed runs 40-60 mph, about +2.5 mph per year from 9U,
    // so 35-53 is that carried down to four-to-eight-year-olds.
    expect(ftsToMph(batSpeedFts(1))).toBeCloseTo(BAT.SPEED_MIN_MPH, 6);
    expect(ftsToMph(batSpeedFts(10))).toBeCloseTo(BAT.SPEED_MAX_MPH, 6);
  });

  it('is monotone and clamps a content typo', () => {
    let prev = -1;
    for (let p = 1; p <= 10; p++) {
      const v = batSpeedFts(p);
      expect(v, `power ${p}`).toBeGreaterThan(prev);
      prev = v;
    }
    expect(batSpeedFts(-5)).toBe(batSpeedFts(1));
    expect(batSpeedFts(99)).toBe(batSpeedFts(10));
  });

  it('notes that nobody on the roster actually has power 1', () => {
    // The mapping is defined over 1-10, but the realised span is 2-10 — so any
    // claim about "a power-1 kid" is about a kid who does not exist.
    const powers = ROSTER.map((c) => c.stats.power);
    expect(Math.min(...powers)).toBe(2);
    expect(Math.max(...powers)).toBe(10);
  });
});

describe('the swing window', () => {
  it('★ is a FRACTION of the flight, so it cannot swallow it', () => {
    // pace.swingWindows: "CONTACT must stay below the FASTEST possible travelMs
    // in every mode, or timing stops being a skill." v1 compares absolute
    // milliseconds against a window and can only ASSERT this; a 380ms window
    // against a 270ms flight is how it got broken. Expressed as a fraction it
    // holds by construction, for every flight time there is.
    expect(BAT.CONTACT_WINDOW_FRAC).toBeLessThan(1);
    // ★ The sweep has to reach SHORT flights, because that is the only regime
    // where an absolute window misbehaves. v1's defect was a 380ms window
    // against a 270ms flight — hardcoding the window here and testing only
    // 0.4s-and-up flights passes, which is what the first version of this test
    // did. 0.2s is a 46ft pitch at 157 mph: impossible, and precisely why it is
    // the right thing to assert against.
    for (const travel of [0.15, 0.2, 0.3, 0.4, 0.8, 1.23, 2.0, 5.0]) {
      const window = BAT.CONTACT_WINDOW_FRAC * travel;
      expect(window, `travel ${travel}`).toBeLessThan(travel);
      // A tap at the instant of release must never connect, at ANY flight time.
      expect(timingQuality(travel, travel), `travel ${travel}`).toBe(0);
      // Nor may anything outside the window.
      expect(timingQuality(window, travel), `travel ${travel}`).toBe(0);
      // And something inside it must.
      expect(timingQuality(window * 0.5, travel), `travel ${travel}`).toBeGreaterThan(0);
    }
  });

  it('grades smoothly from square to nothing', () => {
    const t = 1.23;
    expect(timingQuality(0, t)).toBe(1);
    expect(timingQuality(BAT.PERFECT_WINDOW_FRAC * t, t)).toBeCloseTo(1, 6);
    expect(timingQuality(BAT.CONTACT_WINDOW_FRAC * t, t)).toBe(0);
    let prev = 1.01;
    for (let f = 0.07; f <= 0.24; f += 0.01) {
      const q = timingQuality(f * t, t);
      expect(q, `frac ${f.toFixed(2)}`).toBeLessThan(prev);
      prev = q;
    }
  });

  it('is symmetric in early and late', () => {
    expect(timingQuality(-0.1, 1.23)).toBe(timingQuality(0.1, 1.23));
  });
});

describe('the batted ball', () => {
  const p = pitchAtPlate();
  const big = getCharacter('big_lou');

  const swing = (undercutFt: number, timingErrorSec = 0, batter = big): SwingSpec => ({
    timingErrorSec,
    undercutFt,
    batter,
    travelSec: p.travelSec,
    pitchSpeedFts: p.speedFts,
  });

  it('lifts the ball when the bat goes under it and chops it when over', () => {
    const under = resolveSwing(swing(0.1), rng);
    const over = resolveSwing(swing(-0.1), rng);
    expect(under.kind).toBe('contact');
    expect(over.kind).toBe('contact');
    if (under.kind !== 'contact' || over.kind !== 'contact') return;
    expect(under.launch.launchAngleDeg).toBeGreaterThan(20);
    expect(over.launch.launchAngleDeg).toBeLessThan(-20);
    // And the spin follows the same geometry: undercut backspins, topping it
    // puts topspin on, which is what makes a chop stay down.
    expect(under.launch.spinRpm).toBeGreaterThan(0);
    expect(over.launch.spinRpm).toBeLessThan(0);
  });

  it('keeps spin inside the band Kensrud et al. measured', () => {
    // They measured 0-3500 rpm over scattering angles 0-30 deg at bat speeds
    // 63-88 mph. The angle bound is part of the measurement, not decoration:
    // our model reaches 3622 rpm at a 32 deg launch, which is OUTSIDE the range
    // they measured, so comparing there would be checking an extrapolation
    // against a band that never covered it.
    let checked = 0;
    for (let u = 0; u <= 0.16; u += 0.01) {
      const r = resolveSwing(swing(u), rng);
      if (r.kind !== 'contact') continue;
      if (Math.abs(r.launch.launchAngleDeg) > 30) continue; // beyond the measured range
      checked++;
      expect(Math.abs(r.launch.spinRpm), `undercut ${u.toFixed(2)}`).toBeLessThanOrEqual(3500);
    }
    expect(checked, 'the sweep must actually reach the measured range').toBeGreaterThan(5);
  });

  it('makes exit speed and spin LINEAR in bat speed, as measured', () => {
    // Kensrud et al.: "both the spin rate and the exit speed scale linearly
    // with the initial bat speed". Two independent checks of the same model.
    const evs: number[] = [];
    const spins: number[] = [];
    for (const power of [2, 4, 6, 8, 10]) {
      const kid = ROSTER.find((c) => c.stats.power === power)!;
      const r = resolveSwing(swing(0.08, 0, kid), rng);
      if (r.kind !== 'contact') continue;
      evs.push(r.launch.exitVelocityFts);
      spins.push(Math.abs(r.launch.spinRpm));
    }
    // Equal steps in power are equal steps in bat speed, so equal steps out.
    const diffs = (a: number[]) => a.slice(1).map((v, i) => v - a[i]);
    for (const set of [diffs(evs), diffs(spins)]) {
      const first = set[0];
      for (const d of set) expect(d / first).toBeCloseTo(1, 1);
    }
  });

  it('pulls an early swing and pushes a late one the other way', () => {
    const early = resolveSwing(swing(0.06, -0.06), rng);
    const late = resolveSwing(swing(0.06, +0.06), rng);
    if (early.kind !== 'contact' || late.kind !== 'contact') throw new Error('expected contact');
    expect(early.launch.sprayDeg).toBeLessThan(-5); // toward left field
    expect(late.launch.sprayDeg).toBeGreaterThan(5); // toward right
  });

  it('misses when the timing is outside the window', () => {
    expect(resolveSwing(swing(0.06, p.travelSec), rng).kind).toBe('miss');
  });

  it('gives Junebug her ability: she never whiffs', () => {
    // v1 turns her miss into weak contact. Here it is a floor on contact
    // quality — she still cannot drive a badly timed pitch, she just gets a bat
    // on it. The behaviour survives the model change.
    const june = getCharacter('nostrike');
    expect(june.ability).toBe('never_strikes_out');
    const hopeless = { ...swing(0.06, p.travelSec, june) };
    expect(resolveSwing(hopeless, rng).kind).not.toBe('miss');
    // Anyone else, same swing, whiffs.
    expect(resolveSwing({ ...hopeless, batter: big }, rng).kind).toBe('miss');
  });

  it('★ produces both grounders and flies across the contact window', () => {
    // The coupling pace.pitchCorridor warns about: timing and the swing window
    // are joined, so the window has to span a usable range of outcomes. If every
    // undercut gave the same launch angle, aiming would not be a skill.
    const angles: number[] = [];
    for (let u = -0.12; u <= 0.16; u += 0.02) {
      const r = resolveSwing(swing(u), rng);
      if (r.kind === 'contact') angles.push(r.launch.launchAngleDeg);
    }
    expect(Math.min(...angles)).toBeLessThan(-15);
    expect(Math.max(...angles)).toBeGreaterThan(30);
  });
});

describe('★ the roster, which is what sim.carryVsFence asked for', () => {
  const parkLine = fenceDistAt(PARK, -45);
  const parkCf = fenceDistAt(PARK, 0);
  const porch = fenceDistAt(SANDLOT, 45);

  it('lets a power-10 kid clear the park line and a power-5 kid not', () => {
    // sim.carryVsFence.whatWouldClose, verbatim: "the record should end up
    // asserting that a power-10 kid clears the park's line and a power-5 kid
    // does not."
    expect(bestCarryFor(10).carry, 'power 10 must clear the park line').toBeGreaterThan(parkLine);
    expect(bestCarryFor(5).carry, 'power 5 must not').toBeLessThan(parkLine);
  });

  it('keeps the park centre out of reach for EVERYONE', () => {
    for (const c of ROSTER) {
      expect(bestCarryFor(c.stats.power).carry, `${c.name} must not clear centre`).toBeLessThan(parkCf);
    }
  });

  it('makes the sandlot porch the cheap-homer park it is written as', () => {
    const canClearPorch = ROSTER.filter((c) => bestCarryFor(c.stats.power).carry >= porch).length;
    const canClearLine = ROSTER.filter((c) => bestCarryFor(c.stats.power).carry >= parkLine).length;
    expect(canClearPorch).toBeGreaterThan(canClearLine);
    expect(canClearPorch).toBeGreaterThanOrEqual(5);
    expect(canClearLine).toBeGreaterThanOrEqual(1);
    expect(canClearLine).toBeLessThanOrEqual(6);
  });

  it('is monotone in power', () => {
    let prev = 0;
    for (const power of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const c = bestCarryFor(power).carry;
      expect(c, `power ${power}`).toBeGreaterThan(prev);
      prev = c;
    }
  });
});

describe('the pitch', () => {
  it('★ arrives where it was aimed, which needs a SOLVE not a direction', () => {
    // Pointing the release straight at the target puts the ball 26 FEET
    // UNDERGROUND: a 46ft flight lasting 1.2s falls 24ft on the way. The first
    // version did exactly that.
    for (const kind of Object.keys(PITCHES) as PitchKind[]) {
      for (const aim of [1.6, 2.4, 3.2]) {
        const flown = flyToPlate(releasePitch({ kind, pitchingStat: 5, aimHeightFt: aim, aimLateralFt: 0 }));
        expect(flown.state.p.y, `${kind} aimed ${aim}`).toBeCloseTo(aim, 1);
      }
    }
  });

  it('lands near the measured corridor for an average arm', () => {
    // pace.pitchCorridor: 1230ms over the 46ft mound, n=1, awaiting-measurement.
    const flown = flyToPlate(releasePitch({ kind: 'fastball', pitchingStat: 5, aimHeightFt: 2.4, aimLateralFt: 0 }));
    expect(flown.travelSec).toBeGreaterThan(0.9);
    expect(flown.travelSec).toBeLessThan(1.5);
  });

  it('makes a better arm genuinely faster', () => {
    const slow = flyToPlate(releasePitch({ kind: 'fastball', pitchingStat: 1, aimHeightFt: 2.4, aimLateralFt: 0 }));
    const fast = flyToPlate(releasePitch({ kind: 'fastball', pitchingStat: 10, aimHeightFt: 2.4, aimLateralFt: 0 }));
    expect(fast.travelSec).toBeLessThan(slow.travelSec);
    expect(armMult(1)).toBeGreaterThan(armMult(10));
  });

  it('★ breaks the right WAY, which the aim solve otherwise hides', () => {
    // The Magnus force is w_hat x v, and with the pitch travelling along -z it
    // reduces to (-w_y, w_x). Every axis was inverted in the first draft — the
    // fastball's "backspin" sank and the curve rose while breaking toward
    // FIRST — and nothing caught it, because the solve compensated and put the
    // ball on the aim point anyway. Only the lateral break shows it.
    const at = (kind: PitchKind) =>
      flyToPlate(releasePitch({ kind, pitchingStat: 5, aimHeightFt: 2.4, aimLateralFt: 0 })).state.p.x;
    expect(at('curve'), 'a curve must break toward THIRD').toBeLessThan(-0.4);
    expect(at('screwball'), 'a screwball must run toward FIRST').toBeGreaterThan(0.4);
    expect(Math.abs(at('fastball')), 'a fastball must not break sideways').toBeLessThan(0.05);
  });

  it('makes off-speed pitches genuinely slower', () => {
    const fast = flyToPlate(releasePitch({ kind: 'fastball', pitchingStat: 5, aimHeightFt: 2.4, aimLateralFt: 0 }));
    const change = flyToPlate(releasePitch({ kind: 'changeup', pitchingStat: 5, aimHeightFt: 2.4, aimLateralFt: 0 }));
    expect(change.travelSec).toBeGreaterThan(fast.travelSec);
  });
});

describe('determinism', () => {
  it('gives bit-identical results across runs', () => {
    const run = () => {
      const p = pitchAtPlate();
      const out: number[] = [];
      for (const c of ROSTER.slice(0, 8)) {
        for (const u of [-0.05, 0, 0.05, 0.1]) {
          const r = resolveSwing(
            { timingErrorSec: 0.01, undercutFt: u, batter: c, travelSec: p.travelSec, pitchSpeedFts: p.speedFts },
            makeRng('det')
          );
          out.push(
            r.kind === 'contact' ? r.launch.exitVelocityFts : -1,
            r.kind === 'contact' ? r.launch.launchAngleDeg : -1,
            r.kind === 'contact' ? r.launch.spinRpm : -1
          );
        }
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('keeps a fork independent of its siblings', () => {
    // The reason the sprayT thunk is not ported: draw order is no longer part
    // of the contract.
    const p = pitchAtPlate();
    const spec: SwingSpec = {
      timingErrorSec: 0,
      undercutFt: 0.08,
      batter: getCharacter('big_lou'),
      travelSec: p.travelSec,
      pitchSpeedFts: p.speedFts,
    };
    const a = makeRng('seed');
    const b = makeRng('seed');
    b.fork('somethingElse')(); // draw from an unrelated substream
    expect(resolveSwing(spec, a)).toEqual(resolveSwing(spec, b));
  });
});
