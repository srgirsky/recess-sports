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
import { BAT, BOUNCE, PITCH } from '../../src/v2/sim/params.ts';
import { groundCor } from '../../src/v2/sim/bounce.ts';
import { collisionEfficiency, exitVelocity } from '../../src/v2/sim/contact.ts';
import {
  batSpeedFts,
  reachFt,
  reactionSec,
  sprintAccelFtS2,
  sprintAccelSec,
  sprintTimeSec,
  sprintTopSpeedFts,
  throwSpeedFts,
} from '../../src/v2/sim/athletes.ts';
import { DEFENSE, RUN } from '../../src/v2/sim/params.ts';
import { BASEPATH, FIELD_MARGIN, FIELD_POSITIONS, FIRST, dist } from '../../src/v2/sim/field.ts';
import { maxThrowFt } from '../../src/v2/sim/fielders.ts';
import { makeRunner } from '../../src/v2/sim/runners.ts';
import { REFERENCE_HEIGHT_FT } from '../../src/v2/render/skeleton.ts';
import { ftsToMph, v1PxToFt } from '../../src/v2/sim/units.ts';
import { ROSTER } from '../../src/data/characters.ts';

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

  it('is a well-formed record, and is now CLOSED', () => {
    // known-drift -> conformed. `statuses.known-drift` says closing one "means
    // editing the record -- a visible, reviewed act", and this assertion going
    // red is what made it one.
    wellFormed(rec, { reference: 'derived', status: 'conformed' });
    expect(rec.conformNote, 'a closure must say what closed it').toBeTruthy();
    expect(rec.whatClosedIt).toMatch(/Not a retune/);
    // The drift it used to carry stays on the record rather than being deleted.
    expect(rec.drift.gapMph).toBeGreaterThan(0);
  });

  it('closed by moving the MAPPING, not the geometry', () => {
    // The fences are the thing sim.carryVsFence explicitly refused to move, and
    // `whyNotShrinkTheFences` explains what that would have cost. Assert the
    // geometry is genuinely untouched rather than trusting the prose.
    expect(rec.ours.value).toMatch(/unchanged/);
    expect(Math.round(fenceDistAt(VENUE_GEOMETRY.park, -45))).toBe(185);
    expect(Math.round(fenceDistAt(VENUE_GEOMETRY.park, 0))).toBe(212);
    expect(Math.round(fenceDistAt(VENUE_GEOMETRY.sandlot, 45))).toBe(150);
  });

  it('records the margin as a decision, not an accident', () => {
    // A 35->50 band cleared the park line by ONE FOOT. That is a number that
    // reads as success and behaves as failure, so the widening is on the record.
    expect(rec.theMarginIsDeliberate).toMatch(/ONE FOOT/);
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

describe('sim.batBallCollision', () => {
  const rec = M.sim.batBallCollision;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'physics', status: 'conformed' });
    expect(rec.source).toBe('physics:published');
    expect(M.sources.physics.batBall.identity).toMatch(/change of inertial reference frame/);
  });

  it('recomputes e_A from the code, not from the record', () => {
    expect(BAT.BALL_BAT_COR).toBe(rec.ours.value.ballBatCor);
    expect(BAT.EFFECTIVE_MASS_OZ).toBe(rec.ours.value.effectiveMassOz);
    expect(collisionEfficiency()).toBeCloseTo(rec.ours.value.eA, 3);
  });

  it('holds the identity the record calls an identity', () => {
    for (const [eA, vp, vb] of [[0.1, 37, 51], [0.2, 0, 130], [0, 20, 20]]) {
      expect(exitVelocity(eA, vp, vb)).toBeCloseTo(eA * vp + (1 + eA) * vb, 9);
    }
  });

  it('keeps the recoil-factor explanation, which is the whole mechanism', () => {
    expect(rec.theKidResult).toMatch(/no fudge factor/i);
    expect(collisionEfficiency(20.5)).toBeGreaterThan(collisionEfficiency(14) * 1.8);
  });
});

describe('sim.obliqueContact', () => {
  const rec = M.sim.obliqueContact;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'physics', status: 'conformed' });
    expect(rec.source).toBe('physics:published');
  });

  it('★ records that the 40% enhancement is NOT applied, and why', () => {
    // The interesting half. Applying a published correction that double-counts
    // is the kind of mistake a citation makes look rigorous.
    expect(BAT.GRIP_SPIN_ENHANCEMENT).toBe(1);
    expect(rec.theEnhancementIsNotApplied).toMatch(/DOUBLE-COUNTS/);
    expect(rec.theEnhancementIsNotApplied).toMatch(/3600 rpm/);
    expect(rec.whatWouldClose).toBeTruthy();
  });

  it('restricts its spin check to the angles actually measured', () => {
    expect(rec.validation.angleBandDeg).toEqual([0, 30]);
    expect(rec.validation.spinBandRpm).toEqual([0, 3500]);
    expect(rec.validation.note).toMatch(/outside the ANGLE range/);
  });
});

describe('sim.batSpeed', () => {
  const rec = M.sim.batSpeed;

  it('★ is the first record to use reference: baseball', () => {
    // The vocabulary has carried the value since it was introduced and nothing
    // had needed it. This is neither BB2001, nor physics, nor our own
    // arithmetic — it is what real children do.
    wellFormed(rec, { reference: 'baseball', status: 'awaiting-measurement' });
    expect(rec.measured).toBeNull();
    expect(rec.partialReading.confidence).toBe('low');
    expect(rec.whatWouldWork).toBeTruthy();
  });

  it('pins the band the code actually carries', () => {
    expect(BAT.SPEED_MIN_MPH).toBe(rec.ours.value.minMph);
    expect(BAT.SPEED_MAX_MPH).toBe(rec.ours.value.maxMph);
    expect(ftsToMph(batSpeedFts(1))).toBeCloseTo(rec.ours.value.minMph, 6);
    expect(ftsToMph(batSpeedFts(10))).toBeCloseTo(rec.ours.value.maxMph, 6);
  });

  it('keeps the roster caveat true', () => {
    // "Nobody on the roster has power 1" is a claim about content, so check it
    // against the content rather than trusting the sentence.
    const powers = ROSTER.map((c) => c.stats.power);
    expect(Math.min(...powers)).toBe(2);
    expect(rec.rosterNote).toMatch(/NOBODY ON THE ROSTER HAS POWER 1/);
    const [lo, hi] = rec.ours.value.realisedRosterMph;
    expect(ftsToMph(batSpeedFts(Math.min(...powers)))).toBeCloseTo(lo, 0);
    expect(ftsToMph(batSpeedFts(Math.max(...powers)))).toBeCloseTo(hi, 0);
  });
});

describe('sim.pitchCorridor (v2)', () => {
  const rec = M.sim.pitchCorridorV2;

  it('is a well-formed record and inherits its parent confidence', () => {
    wellFormed(rec, { reference: 'bb2001', status: 'awaiting-measurement' });
    expect(rec.measured).toBeNull();
    // ★ Inherited, not chosen — the same discipline sim.flyHangRatio follows.
    expect(rec.partialReading.n).toBe(M.pace.pitchCorridor.partialReading.n);
    expect(rec.partialReading.confidence).toBe(M.pace.pitchCorridor.partialReading.confidence);
    expect(rec.partialReading.flightMs).toBe(M.pace.pitchCorridor.partialReading.flightMs);
  });

  it('records that the measured quantity is a TIME, not a speed', () => {
    expect(PITCH.FLIGHT_TIME_SEC).toBeCloseTo(rec.ours.value.flightSec, 6);
    expect(rec.theReparameterisation).toMatch(/26 FEET UNDERGROUND/);
  });

  it('records the inverted-axis bug the aim solve hid', () => {
    expect(rec.theBreakIsEmergent).toMatch(/every spin axis was inverted/i);
  });
});

describe('sim.aeroModelLowSpeed, after the mapping landed', () => {
  const rec = M.sim.aeroModelLowSpeed;

  it('★ has had its significance raised, not quietly leaned on', () => {
    // It was a caveat on a conformed model. It is now the open question every
    // batted ball in the game passes through.
    expect(rec.significanceRaisedBy).toMatch(/TWENTY-NINE OF THIRTY/);
    // And that is checkable: the roster's exit velocities against the fit floor.
    const eA = collisionEfficiency();
    const below = ROSTER.filter(
      (c) => ftsToMph(exitVelocity(eA, 37.6, batSpeedFts(c.stats.power))) < AERO.FIT_SPEED_BAND_MPH[0]
    ).length;
    expect(below).toBeGreaterThanOrEqual(29);
  });
});

describe('sim.kidSprintSpeed', () => {
  const rec = M.sim.kidSprintSpeed;

  it('is a well-formed record and inherits the anchor rather than re-measuring it', () => {
    wellFormed(rec, { reference: 'bb2001', status: 'conformed' });
    // ★ It CONSUMES pace.homeToFirst. Consuming a number does not measure it,
    // so every figure it states about the measurement has to be that record's.
    expect(rec.measured.inheritedFrom).toBe('pace.homeToFirst');
    expect(rec.measured.homeToFirstMs).toBe(M.pace.homeToFirst.measured);
    expect(rec.measured.n).toBe(M.pace.homeToFirst.n);
    expect(rec.measured.spreadMs).toBe(M.pace.homeToFirst.spread);
    expect(rec.measured.confidence).toBe(M.pace.homeToFirst.confidence);
  });

  it('★ recomputes the acceleration from the anchor, not from the record', () => {
    // T = 2*(t - d/V), derived here from RUN and BASEPATH and compared against
    // what athletes.ts actually produces. If either drifts this goes red.
    const v = sprintTopSpeedFts(RUN.ANCHOR_SPEED_STAT);
    expect(sprintAccelSec()).toBeCloseTo(2 * (RUN.HOME_TO_FIRST_SEC - BASEPATH / v), 10);
    expect(sprintAccelSec()).toBeCloseTo(rec.ours.value.accelSec, 4);
    for (const [stat, want] of [[1, 'stat1'], [5, 'stat5'], [10, 'stat10']]) {
      expect(sprintTopSpeedFts(stat)).toBeCloseTo(rec.ours.value.topSpeedFts[want], 3);
      expect(sprintAccelFtS2(stat)).toBeCloseTo(rec.ours.value.accelFtS2[want], 3);
      expect(Math.round(sprintTimeSec(BASEPATH, stat) * 1000)).toBe(rec.ours.value.homeToFirstMs[want]);
    }
    expect(ftsToMph(sprintTopSpeedFts(1))).toBeCloseTo(rec.ours.value.topSpeedMph[0], 6);
    expect(ftsToMph(sprintTopSpeedFts(10))).toBeCloseTo(rec.ours.value.topSpeedMph[1], 6);
  });

  it('keeps the drift claim honest: zero, and says why that is not circular', () => {
    expect(rec.drift.pct).toBe(0);
    expect(Math.round(sprintTimeSec(BASEPATH, RUN.ANCHOR_SPEED_STAT) * 1000)).toBe(M.pace.homeToFirst.measured);
    expect(rec.drift.note).toMatch(/free to come out absurd/);
    // The non-circular half, checked rather than asserted in prose.
    expect(sprintAccelFtS2(5)).toBeGreaterThan(8);
    expect(sprintAccelFtS2(5)).toBeLessThan(13);
  });
});

describe('sim.fielderRunnerParity', () => {
  const rec = M.sim.fielderRunnerParity;

  it('is a well-formed record and claims nothing about BB', () => {
    wellFormed(rec, { reference: 'derived', status: 'conformed' });
    expect(rec.measured).toBeNull();
    expect(rec.whyNotMeasurable).toMatch(/how our own code is organised/);
  });

  it('★ names the enforcement that exists, which is the thing v1 lacked', () => {
    // defense.fielderSpeed's invariant is a sentence in a config file that was
    // true for five retunes while the ratio drifted underneath it.
    expect(rec.enforcement).toMatch(/purity\.lint\.test\.js/);
    expect(M.defense.fielderSpeed.history).toMatch(/FIVE consecutive runner slowdowns/);
    expect(rec.ours.value.v1Ratio).toBe(2.48);
    // And the ratio is 1.0 because there is one function, not two constants.
    for (const c of ROSTER) {
      expect(makeRunner(c, 1).topFts, c.name).toBe(sprintTopSpeedFts(c.stats.speed));
    }
  });
});

describe('sim.catchRadius', () => {
  const rec = M.sim.catchRadius;

  it('is a well-formed record, drifting against v1 rather than a measurement', () => {
    wellFormed(rec, { reference: 'baseball', status: 'known-drift' });
    expect(rec.drift.against).toBe('v1');
    expect(rec.measured.n).toBe(0);
  });

  it('★ recomputes v1 s reach and the area ratio from v1 s own constants', () => {
    // 34px and 28px are read out of v1's config; the feet and the ratio are
    // derived here, so neither the record nor the conversion can drift alone.
    expect(v1PxToFt(34)).toBeCloseTo(rec.drift.v1ReachFt, 3);
    expect(v1PxToFt(28)).toBeCloseTo(rec.drift.v1PickupFt, 3);
    expect(v1PxToFt(34 + 30)).toBeCloseTo(rec.drift.v1DivingFt, 3);
    expect((v1PxToFt(34) / reachFt()) ** 2).toBeCloseTo(rec.drift.areaRatio, 1);
    expect(reachFt()).toBe(rec.ours.value.reachFt);
    expect(DEFENSE.CATCH_CENTRE_FT + reachFt()).toBe(rec.ours.value.maxCatchHeightFt);
  });

  it('★ pins the hard floor PR 3 handed forward, from both ends', () => {
    expect(FIELD_MARGIN - 1).toBe(3); // BOUNCE.BALL_SETTLE_MARGIN_FT
    expect(reachFt()).toBeGreaterThanOrEqual(FIELD_MARGIN - 1);
    expect(rec.theHardFloor).toMatch(/PR 5 catch radius must cover this/);
  });

  it('keeps the reference kid the same one the rig is built on', () => {
    // ★ The ONE place allowed to look at both. `src/v2/sim/**` may not import
    // the render layer at all — that is the purity gate's whole job — so if
    // DEFENSE.REFERENCE_HEIGHT_FT and skeleton.ts ever disagree, nothing inside
    // the sim could notice. This is the seam that would.
    expect(DEFENSE.REFERENCE_HEIGHT_FT).toBe(REFERENCE_HEIGHT_FT);
    expect(reachFt()).toBeLessThan(REFERENCE_HEIGHT_FT);
  });
});

describe('sim.throwSpeed', () => {
  const rec = M.sim.throwSpeed;

  it('is a well-formed record and says why it went to another reference class', () => {
    wellFormed(rec, { reference: 'baseball', status: 'awaiting-measurement' });
    expect(rec.measured).toBeNull();
    expect(rec.partialReading.n).toBe(1);
    // The BB2001 record it stands in for is blocked, and stays blocked.
    expect(M.defense.throwSpeed.blocked).toBeTruthy();
    expect(rec.why).toMatch(/THE CLEANEST TARGET DOES NOT EXIST IN THIS CAPTURE/);
  });

  it('★ recomputes the ratio ordering, which is the whole claim', () => {
    const runner = sprintTopSpeedFts(RUN.ANCHOR_SPEED_STAT);
    expect(throwSpeedFts(1) / runner).toBeCloseTo(rec.ours.value.ratioToRunner[0], 2);
    expect(throwSpeedFts(10) / runner).toBeCloseTo(rec.ours.value.ratioToRunner[1], 2);
    expect(ftsToMph(throwSpeedFts(1))).toBeCloseTo(rec.ours.value.mph[0], 6);
    expect(ftsToMph(throwSpeedFts(10))).toBeCloseTo(rec.ours.value.mph[1], 6);
    // ours < v1 KID < v1 CLASSIC, which is what makes KID's playability a result.
    expect(throwSpeedFts(10) / runner).toBeLessThan(4.6);
    expect(4.6).toBeLessThan(9.65);
  });

  it('★ makes the relay a consequence of an arm, and counts the kids it applies to', () => {
    expect(maxThrowFt(5)).toBeCloseTo(rec.ours.value.maxRangeFt.arm5, 1);
    expect(maxThrowFt(10)).toBeCloseTo(rec.ours.value.maxRangeFt.arm10, 1);
    const cfToFirst = dist(FIELD_POSITIONS.CF, FIRST);
    const ssToFirst = dist(FIELD_POSITIONS.SS, FIRST);
    expect(cfToFirst).toBeCloseTo(129.7, 1);
    expect(ssToFirst).toBeCloseTo(68.2, 1);
    // "27 of 30 cannot make that throw; every one of the 30 can make the short one."
    expect(ROSTER.filter((c) => maxThrowFt(c.stats.pitching) < cfToFirst).length).toBe(27);
    expect(ROSTER.filter((c) => maxThrowFt(c.stats.pitching) >= ssToFirst).length).toBe(ROSTER.length);
    expect(rec.theRelayBecomesAConsequence).toMatch(/806px/);
  });
});

describe('sim.fielderReaction', () => {
  const rec = M.sim.fielderReaction;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'baseball', status: 'awaiting-measurement' });
    expect(rec.measured).toBeNull();
  });

  it('★ recomputes the overhead it is compared against, on both sides', () => {
    expect(reactionSec(1) * 1000).toBeCloseTo(rec.ours.value.readMs[1], 6);
    expect(reactionSec(10) * 1000).toBeCloseTo(rec.ours.value.readMs[0], 6);
    expect(DEFENSE.RELEASE_SEC * 1000).toBe(rec.ours.value.releaseMs);
    expect(rec.ours.value.worstCaseOverheadMs).toBe(rec.ours.value.readMs[1] + rec.ours.value.releaseMs);
    // v1's side, from v1's own records rather than from this one.
    expect(rec.ours.value.v1OverheadMs).toBe(
      M.defense.cpuReaction.ours.value + M.defense.cpuThrowDelay.ours.value
    );
    expect(rec.ours.value.worstCaseOverheadMs).toBeLessThan(rec.ours.value.v1OverheadMs / 2);
    // The roster's realised span, from the roster.
    const ms = ROSTER.map((c) => reactionSec(c.stats.fielding) * 1000);
    expect(Math.round(Math.min(...ms))).toBe(rec.ours.value.realisedRosterMs[0]);
    expect(Math.round(Math.max(...ms))).toBe(rec.ours.value.realisedRosterMs[1]);
  });

  it('★ records that v1 s confound is gone, and quotes the record it answers', () => {
    expect(rec.theConfoundIsGone).toMatch(/ACCELERATION RAMP/);
    expect(M.defense.cpuReaction.partialReading).toBeTruthy();
    expect(M.sim.kidSprintSpeed.ours.value.accelSec).toBeGreaterThan(0);
    // And the second finding: the election has to include the read.
    expect(rec.itIsAlsoPartOfTheElection).toMatch(/eighty feet into left field/);
  });
});

describe('sim.chaserElectionGate', () => {
  const rec = M.sim.chaserElectionGate;

  it('is a well-formed NOTE — a finding about a decision, not a tuning target', () => {
    wellFormed(rec, { reference: 'derived', status: 'note' });
    expect(rec.measured.n).toBe(215);
  });

  it('★ records that the ratio gate bought nothing measurable, and says so', () => {
    const r = rec.measured.overrideRateByDefenceSpeed;
    // The two forms drift identically. That is the finding, and it CORRECTS a
    // reading of defense.chaserElection rather than confirming it.
    expect(r.ratioGate0_15.spreadPp).toBeCloseTo(r.fixedGate0_40sec.spreadPp, 1);
    expect(rec.finding).toMatch(/IT DOES NOT/);
    expect(rec.whyKeepTheRatioAnyway).toMatch(/correctness-of-form change, not a measured improvement/);
    // And the record it corrects is left standing, not overwritten.
    expect(M.defense.chaserElection.measuredWindow.stabilityClaimCorrected).toMatch(/cannot be speed-neutral/);
    expect(rec.whatThisCorrects).toMatch(/stands and is not challenged here/);
  });

  it('pins the constants, and that neither of them carries a unit', () => {
    expect(DEFENSE.CUT_AHEAD_FRAC).toBe(rec.ours.value.cutAheadFrac);
    expect(DEFENSE.SWITCH_MARGIN_FRAC).toBe(rec.ours.value.switchMarginFrac);
    expect(Object.keys(DEFENSE).filter((k) => /CUT_AHEAD|SWITCH_MARGIN/.test(k))).toEqual([
      'CUT_AHEAD_FRAC',
      'SWITCH_MARGIN_FRAC',
    ]);
  });
});
