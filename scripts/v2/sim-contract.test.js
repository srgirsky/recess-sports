// ---------------------------------------------------------------------------
// Reconciles `measures.json`'s `sim.*` records against the constants the code
// actually carries — by RECOMPUTING each figure from the imports, never by
// reading it back out of the record it is checking.
//
// Kept separate from `scripts/measure/conformance.test.js` for the reason
// `contract.test.js` states about itself: that file gates the LIVE v1 game and
// should not grow an import from a tree still being built.
//
// The idiom, from contract.test.js: one `is a well-formed record` per record
// (the local schema check — this is where a per-record required field lives),
// then a recompute that would fail if either the record or the code drifted.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AERO, BALL, AIR, INTEGRATOR } from '../../src/v2/sim/params.ts';
import {
  BALL_AREA_FT2,
  BALL_K_PER_FT,
  BALL_MASS_SLUG,
  BALL_RADIUS_FT,
  AIR_DENSITY_SLUG_FT3,
  NATHAN_K_PER_FT,
  dragCoeff,
  liftCoeff,
} from '../../src/v2/sim/ball.ts';
import { FLIGHT_HZ } from '../../src/v2/sim/flight.ts';
import { VENUE_GEOMETRY, fenceDistAt } from '../../src/v2/sim/field.ts';
import { BOUNCE } from '../../src/v2/sim/params.ts';
import { groundCor } from '../../src/v2/sim/bounce.ts';

const here = dirname(fileURLToPath(import.meta.url));
const M = JSON.parse(readFileSync(join(here, '..', 'measures.json'), 'utf8'));

/** Every sim record must declare what standard it answers to. */
function wellFormed(rec, { reference, status }) {
  expect(Object.keys(M.statuses)).toContain(rec.status);
  expect(rec.status).toBe(status);
  expect(rec.reference).toBe(reference);
  expect(rec.category).toBe('sim');
  expect(rec.informs).toBeTruthy();
}

describe('sim.ballPhysics', () => {
  const rec = M.sim.ballPhysics;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'physics', status: 'conformed' });
    expect(rec.source).toBe('physics:published'); // the confidence exemption's price
    expect(M.sources.physics).toBeTruthy();
    expect(M.sources.physics.category).toBeUndefined(); // provenance, not a record
  });

  it('recomputes K from the code constants, not from itself', () => {
    expect(BALL.MASS_OZ).toBe(rec.measured.inputs.massOz);
    expect(BALL.CIRCUMFERENCE_IN).toBe(rec.measured.inputs.circumferenceIn);
    expect(AIR.DENSITY_KG_M3).toBe(rec.measured.inputs.rhoKgM3);

    const k = (0.5 * AIR_DENSITY_SLUG_FT3 * BALL_AREA_FT2) / BALL_MASS_SLUG;
    expect(k).toBeCloseTo(BALL_K_PER_FT, 12);
    expect(k).toBeCloseTo(rec.measured.oursKPerFt, 15);

    const gapPct = (100 * Math.abs(k - NATHAN_K_PER_FT)) / NATHAN_K_PER_FT;
    expect(gapPct).toBeCloseTo(rec.measured.gapPct, 1);
  });

  it('shows the gap really is Nathan rounding', () => {
    // The record CLAIMS this; the test proves it, which is the difference
    // between a note and a finding.
    const kWithHisRho = (0.5 * (0.0767 / 32.174) * BALL_AREA_FT2) / BALL_MASS_SLUG;
    expect(kWithHisRho).toBeCloseTo(rec.measured.nathanKPerFt, 6);
    expect(rec.theGap).toMatch(/0\.0767/);
  });

  it('keeps the ball inside the rulebook the record cites', () => {
    const massOz = BALL_MASS_SLUG / (1 / 16 / 32.174);
    expect(massOz).toBeGreaterThanOrEqual(5);
    expect(massOz).toBeLessThanOrEqual(5.25);
    const circIn = BALL_RADIUS_FT * 12 * 2 * Math.PI;
    expect(circIn).toBeGreaterThanOrEqual(9);
    expect(circIn).toBeLessThanOrEqual(9.25);
    expect(M.sources.physics.rules.cite).toMatch(/3\.01/);
  });
});

describe('sim.aeroModel', () => {
  const rec = M.sim.aeroModel;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'physics', status: 'conformed' });
    expect(rec.source).toBe('physics:published');
    expect(rec.caveat).toMatch(/60-110 mph/);
  });

  it('carries the published coefficients, digit for digit', () => {
    // The record spells the model out in prose; the constants must match it.
    expect(rec.model).toContain(String(AERO.CD_0));
    expect(rec.model).toContain(String(AERO.CD_1));
    expect(rec.model).toContain(String(AERO.CL_0));
    expect(rec.model).toContain(String(AERO.CL_1));
    expect(rec.model).toContain('1.120');
    expect(AERO.CL_2).toBe(1.12);
  });

  it('reproduces the coefficient forms the record states', () => {
    const rpm = 2000;
    const w = (rpm * 2 * Math.PI) / 60;
    expect(dragCoeff(w)).toBeCloseTo(AERO.CD_0 + AERO.CD_1 * (rpm / 1000), 12);
    const s = 0.25;
    expect(liftCoeff(s)).toBeCloseTo((AERO.CL_2 * s) / (AERO.CL_0 + AERO.CL_1 * s), 12);
  });

  it('states the fit band the code also carries', () => {
    expect(AERO.FIT_SPEED_BAND_MPH).toEqual([60, 110]);
    expect(M.sources.physics.aero.fitScope).toMatch(/60-110 mph/);
  });

  it('has its low-speed extrapolation recorded as OPEN, not glossed', () => {
    // The pair matters: a `conformed` aero model next to an
    // `awaiting-measurement` about the regime we actually play in is honest;
    // the conformed record alone would not be.
    const open = M.sim.aeroModelLowSpeed;
    wellFormed(open, { reference: 'physics', status: 'awaiting-measurement' });
    expect(open.measured).toBeNull();
    expect(open.whatWouldWork).toBeTruthy();
  });
});

describe('sim.integratorStep', () => {
  const rec = M.sim.integratorStep;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'derived', status: 'conformed' });
    expect(rec.confidence).toBe('derived');
  });

  it('pins the rate the code runs at, and its phase property', () => {
    expect(FLIGHT_HZ).toBe(rec.ours.value);
    expect(INTEGRATOR.FLIGHT_HZ).toBe(FLIGHT_HZ);
    // The record says 240 is a PHASE choice; that is checkable.
    expect(FLIGHT_HZ % 60).toBe(0);
    expect(FLIGHT_HZ % 120).toBe(0);
  });

  it('keeps the finding that it is NOT an accuracy choice', () => {
    // If someone later "corrects" this record back to an accuracy claim, the
    // measured errors it carries would contradict them — so assert the record
    // still says what it measured.
    expect(rec.theFinding).toMatch(/NOT ACCURACY/);
    expect(rec.measured.carryErrorFtVs15360Hz.hz60).toBeLessThan(1e-8);
    expect(rec.measured.carryErrorFtVs15360Hz.hz240).toBeLessThan(1e-10);
    for (const r of rec.measured.convergenceRatios.clean) {
      expect(r).toBeGreaterThan(12);
      expect(r).toBeLessThan(24);
    }
    for (const r of rec.measured.convergenceRatios.throughABounce) {
      expect(r).toBeGreaterThan(12);
      expect(r).toBeLessThan(24);
    }
  });
});

describe('sim.carryVsFence', () => {
  const rec = M.sim.carryVsFence;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'derived', status: 'known-drift' });
    expect(rec.whatWouldClose).toBeTruthy();
    expect(rec.drift.gapMph).toBeGreaterThan(0);
  });

  it('names fence distances the venue table actually has', () => {
    // The record's thresholds are only meaningful against the real fences, so
    // recompute those from field.ts rather than trusting the labels.
    const park = VENUE_GEOMETRY.park;
    const sandlot = VENUE_GEOMETRY.sandlot;
    expect(Math.round(fenceDistAt(park, -45))).toBe(185);
    expect(Math.round(fenceDistAt(park, 0))).toBe(212);
    expect(Math.round(fenceDistAt(sandlot, 45))).toBe(150);
    expect(Math.round(fenceDistAt(VENUE_GEOMETRY.blacktop, 0))).toBe(188);

    const need = rec.measured.exitVelocityToClearMph;
    expect(need.parkLine185).toBeGreaterThan(need.sandlotRF150);
    expect(need.parkCF212).toBeGreaterThan(need.parkLine185);
  });

  it('keeps the decision and the rejected alternative on the record', () => {
    // The resolution is a GAME-DESIGN decision, and the record has to say so —
    // otherwise a later reader treats "power earns it" as a physics result.
    expect(rec.resolution).toMatch(/POWER STAT EARNS IT/);
    expect(rec.whyNotShrinkTheFences).toBeTruthy();
    expect(rec.ours.value).toMatch(/unchanged/);
  });

  it('has a monotone carry table', () => {
    const t = rec.measured.bestCarryFtByExitVelocityMph;
    const ks = Object.keys(t).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < ks.length; i++) {
      expect(t[String(ks[i])]).toBeGreaterThan(t[String(ks[i - 1])]);
    }
  });
});

describe('sim.flyHangRatio', () => {
  const rec = M.sim.flyHangRatio;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'bb2001', status: 'conformed' });
  });

  it('cannot claim more confidence than the anchor it is measured against', () => {
    // ★ Inherited, not chosen. pace.flyHang is n=4 / low, so this is too.
    expect(rec.n).toBe(M.pace.flyHang.n);
    expect(rec.confidence).toBe(M.pace.flyHang.confidence);
  });

  it('uses the SAME band and anchor pace.flyHang measured', () => {
    const bb = M.pace.flyHang.measured.ratioToAnchor;
    expect(rec.measured.bbBand[0]).toBeCloseTo(bb.min, 3);
    expect(rec.measured.bbBand[1]).toBeCloseTo(bb.max, 3);
    expect(rec.measured.anchorMs).toBe(M.pace.homeToFirst.measured);
  });

  it('puts the DEEP flies inside BB band and says the shallow ones are not', () => {
    const [lo, hi] = rec.measured.bbBand;
    const r = rec.measured.oursRatios;
    expect(r.ev55la30).toBeGreaterThanOrEqual(lo);
    expect(r.ev55la30).toBeLessThanOrEqual(hi);
    expect(r.ev60la35).toBeGreaterThanOrEqual(lo);
    expect(r.ev60la35).toBeLessThanOrEqual(hi);
    // And the record must not pretend the shallow ones conform.
    expect(r.ev45la35).toBeLessThan(lo);
    expect(rec.verdict).toMatch(/low end|below/i);
  });
});

describe('sim.bounceModel', () => {
  const rec = M.sim.bounceModel;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'physics', status: 'conformed' });
    expect(rec.source).toBe('physics:published');
    expect(M.sources.physics.impact).toBeTruthy();
  });

  it('keeps the sign on the record, not just in the code', () => {
    // The MINUS is the whole thing. If a future edit "simplifies" the record's
    // prose the wrong way, this catches it.
    expect(rec.theSign).toContain('(5v - 2wR)/7');
  });

  it('does not repeat the catchier version of the finding', () => {
    // "backspin bounces the ball backward" is true of the model and NOT of a
    // baseball — it needs 2900-7600 rpm. The record has to say so.
    expect(rec.theSign).toMatch(/NOT true of a baseball/);
    expect(rec.knownSimplification).toMatch(/Cross/);
  });

  it('carries the topspin result as intended behaviour, not a bug', () => {
    expect(rec.emergentAndCorrect).toMatch(/TOPSPIN ACCELERATES/);
  });
});

describe('sim.groundBounce', () => {
  const rec = M.sim.groundBounce;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'physics', status: 'awaiting-measurement' });
    expect(rec.measured).toBeNull();
    expect(rec.whatWouldWork).toBeTruthy();
    expect(rec.partialReading.confidence).toBe('low');
  });

  it('recomputes each venue COR from the code, not from the record', () => {
    expect(BOUNCE.COR_BASE).toBe(rec.ours.value.COR_BASE);
    for (const id of ['park', 'sandlot', 'blacktop']) {
      const cor = BOUNCE.COR_BASE * VENUE_GEOMETRY[id].bounceMult;
      expect(groundCor(VENUE_GEOMETRY[id])).toBeCloseTo(cor, 12);
      expect(cor).toBeCloseTo(rec.ours.value[id], 9);
    }
  });

  it('★ holds the cross-check the published band already bought', () => {
    // The venue multipliers were hand-authored long before the Pennbounce band
    // was found. Two of the three land inside it anyway; the third is outside
    // for a stated reason. That is the check, and it is worth keeping live.
    const [lo, hi] = rec.partialReading.band;
    expect(lo).toBe(0.4);
    expect(hi).toBe(0.6);
    expect(groundCor(VENUE_GEOMETRY.park)).toBeGreaterThanOrEqual(lo);
    expect(groundCor(VENUE_GEOMETRY.park)).toBeLessThanOrEqual(hi);
    expect(groundCor(VENUE_GEOMETRY.sandlot)).toBeGreaterThanOrEqual(lo);
    expect(groundCor(VENUE_GEOMETRY.sandlot)).toBeLessThanOrEqual(hi);
    expect(groundCor(VENUE_GEOMETRY.blacktop)).toBeGreaterThan(hi);
    expect(rec.partialReading.theCheckItAlreadyBuys).toMatch(/asphalt is not a turf surface/);
  });
});

describe('sim.rollFriction and sim.wallRestitution', () => {
  it('are well-formed and name their closing experiments', () => {
    for (const rec of [M.sim.rollFriction, M.sim.wallRestitution]) {
      wellFormed(rec, { reference: 'physics', status: 'awaiting-measurement' });
      expect(rec.measured).toBeNull();
      expect(rec.whatWouldWork).toBeTruthy();
    }
  });

  it('pin the values the code actually carries', () => {
    const roll = M.sim.rollFriction.ours.value;
    for (const id of ['park', 'sandlot', 'blacktop']) {
      expect(VENUE_GEOMETRY[id].rollFriction).toBeCloseTo(roll[id], 9);
    }
    const wall = M.sim.wallRestitution.ours.value;
    for (const id of ['park', 'sandlot', 'blacktop']) {
      expect(VENUE_GEOMETRY[id].wallRestitution).toBeCloseTo(wall[id], 9);
    }
    expect(BOUNCE.WALL_TANGENTIAL_KEEP).toBeCloseTo(wall.tangentialKeep, 9);
  });

  it('keeps the wall OUT of the ground band — different problem', () => {
    expect(M.sim.wallRestitution.why).toMatch(/does NOT apply/);
  });
});

describe('sim.venueRollFeel', () => {
  const rec = M.sim.venueRollFeel;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'derived', status: 'known-drift' });
    expect(rec.whatWouldClose).toBeTruthy();
  });

  it('records the contradiction rather than resolving it quietly', () => {
    const d = rec.measured.restingDistanceFt;
    expect(d.blacktop).toBeLessThan(d.park);
    expect(d.blacktop).toBeLessThan(d.sandlot);
    // The blacktop has the LOWEST friction and still plays shortest — the
    // record has to hold both halves or it reads as a simple tuning miss.
    expect(VENUE_GEOMETRY.blacktop.rollFriction).toBeLessThan(VENUE_GEOMETRY.park.rollFriction);
    expect(VENUE_GEOMETRY.blacktop.bounceMult).toBeGreaterThan(VENUE_GEOMETRY.park.bounceMult);
    expect(rec.whyNotJustRetune).toMatch(/tuning a constant to make a test pass/);
  });

  it('pins the drift so it can neither grow nor be half-fixed', () => {
    const ratio = rec.measured.restingDistanceFt.sandlot / rec.measured.restingDistanceFt.blacktop;
    expect(ratio).toBeCloseTo(rec.drift.shaggyOverAsphalt, 1);
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.5);
  });
});
