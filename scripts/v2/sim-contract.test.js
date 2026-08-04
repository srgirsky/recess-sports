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
import { RIGS } from '../../src/v2/render/cameraCues.ts';
import { VENUE_GEOMETRY, fenceDistAt } from '../../src/v2/sim/field.ts';
import { BAT, BOUNCE, PITCH } from '../../src/v2/sim/params.ts';
import { groundCor } from '../../src/v2/sim/bounce.ts';
import { collisionEfficiency, exitVelocity, resolveSwing } from '../../src/v2/sim/contact.ts';
import {
  batSpeedFts,
  reachFt,
  reactionSec,
  sprintAccelFtS2,
  sprintAccelSec,
  sprintTimeSec,
  sprintTopSpeedFts,
  throwSpeedFts,
  zoneBandFt,
  zoneHalfWidthFt,
  plateJudgementFt,
  swingTimingSigmaFrac,
} from '../../src/v2/sim/athletes.ts';
import { ATBAT, DEFENSE, PLAY, RUN } from '../../src/v2/sim/params.ts';
import { BASEPATH, FIELD_MARGIN, FIELD_POSITIONS, FIRST, dist } from '../../src/v2/sim/field.ts';
import { maxThrowFt } from '../../src/v2/sim/fielders.ts';
import { beginPlay, finishPlay, simulatePlay, stepPlay } from '../../src/v2/sim/play.ts';
import { classifyLaunch, LAUNCH_CUTS } from '../../src/v2/sim/harness.ts';
import { projectedMarginSec } from '../../src/v2/sim/steal.ts';
import { SECOND } from '../../src/v2/sim/field.ts';
import { distFromHome } from '../../src/v2/sim/field.ts';
import { electChaser, makeFielder } from '../../src/v2/sim/fielders.ts';
import { launch } from '../../src/v2/sim/launch.ts';
import { traceLooseBall } from '../../src/v2/sim/bounce.ts';
import { resolvePlate } from '../../src/v2/sim/params.ts';
import { PITCHES, releasePitch, flyToPlate } from '../../src/v2/sim/pitch.ts';
import { makeRng } from '../../src/v2/sim/rng.ts';
import { autoAssign } from '../../src/systems/lineup.ts';
import { ROSTER, getCharacter } from '../../src/data/characters.ts';
import { planDefence, throwDemandFt } from '../../src/v2/sim/lineup.ts';
import { simulateGame } from '../../src/v2/sim/game.ts';
import { makeRunner } from '../../src/v2/sim/runners.ts';
import { REFERENCE_HEIGHT_FT } from '../../src/v2/render/skeleton.ts';
import { ftsToMph, inToFt, mphToFts, v1PxToFt } from '../../src/v2/sim/units.ts';

const here = dirname(fileURLToPath(import.meta.url));
const M = JSON.parse(readFileSync(join(here, '..', 'measures.json'), 'utf8'));

/** Every sim record must declare what standard it answers to. */
function wellFormed(rec, { reference, status, category = 'sim' }) {
  expect(Object.keys(M.statuses)).toContain(rec.status);
  expect(rec.status).toBe(status);
  expect(rec.reference).toBe(reference);
  expect(rec.category).toBe(category);
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

  it('is a well-formed record, and CONFORMED now that it measures the right thing', () => {
    // ★ CLOSED IN PR 11, and not by changing a constant. It was `known-drift`
    // because the blacktop rested shortest; the drift was in the METRIC.
    wellFormed(rec, { reference: 'derived', status: 'conformed' });
    expect(rec.theFinding).toMatch(/Resting distance is not speed/);
    expect(rec.supersedes.why).toMatch(/THE MEASUREMENT THE WRONG MECHANISM WAS INFERRED FROM/);
  });

  it('★ recomputes all four metrics from the venues, not from the record', () => {
    const conds = [];
    for (const ev of [45, 55, 62, 70])
      for (const launchAngleDeg of [3, 8, 14])
        for (const sprayDeg of [-35, -20, 0, 20, 35]) conds.push({ ev, launchAngleDeg, sprayDeg });
    for (const [id, geo] of Object.entries(VENUE_GEOMETRY)) {
      let rest = 0;
      let live = 0;
      let t150 = 0;
      for (const c of conds) {
        const tr = traceLooseBall(
          launch({
            exitVelocityFts: mphToFts(c.ev),
            launchAngleDeg: c.launchAngleDeg,
            sprayDeg: c.sprayDeg,
            spinRpm: 1200,
            heightFt: 2.5,
          }),
          geo
        );
        rest += distFromHome(tr.settle);
        live += tr.restAtSec;
        const hit = tr.samples.find((s) => distFromHome(s.p) >= 150);
        if (hit) t150 += hit.tSec;
      }
      const got = rec.measured.byVenue[id];
      expect(rest / conds.length, `${id} rest`).toBeCloseTo(got.restFt, 0);
      expect(live / conds.length, `${id} live`).toBeCloseTo(got.liveSec, 1);
      expect(t150 / conds.length, `${id} to 150ft`).toBeCloseTo(got.timeTo150Sec, 1);
    }
  });

  it('★ THE BLACKTOP IS THE FAST PARK — soonest out, longest live', () => {
    const v = rec.measured.byVenue;
    // The two metrics that mean "fast".
    expect(v.blacktop.timeTo150Sec).toBeLessThan(v.park.timeTo150Sec);
    expect(v.blacktop.timeTo150Sec).toBeLessThan(v.sandlot.timeTo150Sec);
    expect(v.blacktop.liveSec).toBeGreaterThan(v.park.liveSec);
    expect(v.blacktop.liveSec).toBeGreaterThan(v.sandlot.liveSec);
    // And it is a real margin, not a rounding — 37% over the park.
    expect(v.blacktop.liveSec / v.park.liveSec).toBeGreaterThan(1.2);
  });

  it('★ THE METRIC-CONFUSION GUARD: it rests SHORTEST while being fastest', () => {
    // ★ THIS IS THE TRAP, PINNED SO NOBODY WALKS BACK INTO IT. For three PRs the
    // record read the short resting distance as "plays slowest" and blamed the
    // bounce. A ball that stops sooner may have travelled FURTHER and hit
    // something: `containRoll` caroms a rolling ball off the wall, so on a small
    // slick park the resting place is set by the FENCE, not the surface.
    //
    // If you are here because you want to make the blacktop rest further: read
    // `whyRESTINGDISTANCEISTHEWRONGMETRIC` first. It cannot be bought anyway —
    // the record's sweep shows its best is 161ft against the park's 176.
    const v = rec.measured.byVenue;
    expect(v.blacktop.restFt).toBeLessThan(v.park.restFt);
    expect(v.blacktop.restFt).toBeLessThan(v.sandlot.restFt);
    expect(rec.whyRESTINGDISTANCEISTHEWRONGMETRIC).toMatch(/set by the FENCE, not by the surface/);
    // The blacktop really is the slickest and the springiest — both halves held.
    expect(VENUE_GEOMETRY.blacktop.rollFriction).toBeLessThan(VENUE_GEOMETRY.park.rollFriction);
    expect(VENUE_GEOMETRY.blacktop.bounceMult).toBeGreaterThan(VENUE_GEOMETRY.park.bounceMult);
  });

  it('★ records that the old proposed fix moved the number the wrong way', () => {
    expect(rec.whatTHEOLDPROPOSEDFIXWOULDHAVEDONE).toMatch(/120ft -> 76ft/);
    expect(rec.whatTHEOLDPROPOSEDFIXWOULDHAVEDONE).toMatch(/smaller park/);
    // And that refusing to retune in PR 3 was right.
    expect(rec.whyNotJustRetune).toMatch(/refused to tune a constant to\s+make a test pass/);
    expect(rec.whyNotJustRetune).toMatch(/not even the\s+TERM/);
  });

  it('★ keeps the 411ft roll visible, since the venue now depends on it', () => {
    // `sim.rollFriction` is awaiting-measurement and 0.10 was never measured.
    const G = 32.174;
    const roll = (51.4 * 51.4) / (2 * VENUE_GEOMETRY.blacktop.rollFriction * G);
    expect(roll).toBeGreaterThan(400);
    expect(roll).toBeGreaterThan(fenceDistAt(VENUE_GEOMETRY.blacktop, 0) * 2);
    expect(rec.theRollIsLongerThanThePark).toMatch(/411ft/);
    expect(rec.theRollIsLongerThanThePark).toMatch(/no measurement to change it\s+TOWARD/);
    expect(M.sim.rollFriction.status).toBe('awaiting-measurement');
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
    // ★ THE TWO-GATE COMPARISON LIVES IN THE SUPERSEDED READING, which is where
    // it was taken. PR 10's first step moved the ratio gate's own numbers and
    // did NOT re-measure the fixed gate — so asserting the comparison against
    // the current reading would be asserting a measurement nobody made. The
    // finding it supports is unchanged and the evidence stays where it is.
    const r = rec.supersedes.reading.overrideRateByDefenceSpeed;
    // The two forms drift identically. That is the finding, and it CORRECTS a
    // reading of defense.chaserElection rather than confirming it.
    expect(r.ratioGate0_15.spreadPp).toBeCloseTo(r.fixedGate0_40sec.spreadPp, 1);
    expect(rec.finding).toMatch(/IT DOES NOT/);
    expect(rec.whyKeepTheRatioAnyway).toMatch(/correctness-of-form change, not a measured improvement/);
    // And the record it corrects is left standing, not overwritten.
    expect(M.defense.chaserElection.measuredWindow.stabilityClaimCorrected).toMatch(/cannot be speed-neutral/);
    expect(rec.whatThisCorrects).toMatch(/stands and is not challenged here/);
  });

  it('★ re-measured in PR 10, and says the lineup is part of the measurement', () => {
    // The first step barely moved the drift — 7.4pp to 6.0 — which is what the
    // record's own mechanism predicts, since the gate is not the dominant term.
    // ★ AND IN PR 10 THE METRIC CHANGED MEANING AGAIN, so the comparison is no
    // longer spread-against-spread. `sim.chaserLeash` made the settle-zone owner
    // the WRONG answer on most grounders, so a high override rate is now the
    // intended behaviour rather than instability.
    const now = rec.measured.overrideRateByDefenceSpeed.ratioGate0_15;
    expect(now.x1).toBeGreaterThan(80);
    expect(rec.theMETRICCHANGEDMEANINGINPR10).toMatch(/intended behaviour rather than instability/);
    // ★ AND THE TRAP THAT NEARLY WENT ON THE RECORD AS A FINDING: measured with
    // a different nine kids it reads 17.7pp and looks like a regression.
    expect(rec.aMEASUREMENTTRAPWORTHRECORDING).toMatch(/17\.7pp/);
    expect(rec.aMEASUREMENTTRAPWORTHRECORDING).toMatch(/It was a different defence/);
    expect(rec.measured.grid).toMatch(/autoAssign/);
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

// --- PR 6: the play reducer -------------------------------------------------

const PLAN = autoAssign(ROSTER.slice(0, 9).map((c) => c.id));
const BATTER = ROSTER.find((c) => c.stats.speed === 5) ?? ROSTER[0];
const playSpec = (launch, over = {}) => ({
  launch,
  batter: BATTER,
  runners: [],
  defence: PLAN.positions,
  lookup: getCharacter,
  outs: 0,
  geo: VENUE_GEOMETRY.park,
  ...over,
});

describe('sim.gapBallOutcome', () => {
  const rec = M.sim.gapBallOutcome;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'derived', status: 'conformed' });
    expect(rec.measured.n).toBe(6);
  });

  it('★ re-runs the six plays and gets what it says it gets', () => {
    // Recomputed from the reducer, not read back out of the record.
    const outcome = (l, seed) => {
      const o = simulatePlay(playSpec(l), makeRng(seed), 1 / 60);
      if (o.flyCaught) return 'caught';
      if (o.batterOut) return 'out';
      return o.bases[2] ? 'triple' : o.bases[1] ? 'double' : 'single';
    };
    const gap = { exitVelocityFts: 95, launchAngleDeg: 22, sprayDeg: -13, spinRpm: 1800, heightFt: 2.5 };
    expect(outcome(gap, 'six:true LF-CF gap')).toBe('double');
    expect(rec.measured.plays.trueLFCFGap.v2).toBe('DOUBLE');
    // v1's side comes from v1's own record, not from this one.
    expect(M.defense.fielderSpeed.notSufficient).toMatch(/TRUE LF-CF gap out by 897ms/);
    expect(rec.measured.plays.trueLFCFGap.v1).toBe('out by 897ms');
    // And the slow roller is still an out, which is the other half.
    expect(
      outcome({ exitVelocityFts: 35, launchAngleDeg: 2, sprayDeg: -30, spinRpm: -200, heightFt: 2.5 }, 'six:slow roller to 3B')
    ).toBe('out');
  });

  it('★ recomputes the gradient, and refuses to call it BABIP', () => {
    const sweep = (ev) => {
      let hits = 0;
      for (let sprayDeg = -42; sprayDeg <= 42; sprayDeg += 6) {
        const o = simulatePlay(
          playSpec({ exitVelocityFts: ev, launchAngleDeg: -3, sprayDeg, spinRpm: -500, heightFt: 2.5 }),
          makeRng(`g${ev}${sprayDeg}`),
          1 / 60
        );
        if (!o.batterOut && o.outs === 0) hits++;
      }
      return hits;
    };
    expect(`${sweep(45)}/15`).toBe(rec.measured.gradient['31mph']);
    expect(`${sweep(80)}/15`).toBe(rec.measured.gradient['55mph']);
    expect(`${sweep(62)}/15`).toBe(rec.measured.gradient['42mph']);
    expect(sweep(45)).toBeLessThan(sweep(62)); // the gradient itself
    expect(sweep(62)).toBeLessThan(sweep(80));
    // ★ RE-RUN IN PR 10 rather than left describing older code, and the middle
    // is where it moved: 10/15 -> 5/15 at 42mph, from sim.chaserLeash.
    expect(rec.measured.gradient.supersedes.why).toMatch(/RE-RUN IN PR 10/);
    expect(rec.notABabipClaim).toMatch(/THIS IS NOT BABIP/);
  });

  it('keeps the arm-at-short finding honest about what it does NOT fix', () => {
    // The shortstop autoAssign picks really cannot make the throw.
    const ssId = Object.entries(PLAN.positions).find(([, p]) => p === 'SS')[0];
    const ss = getCharacter(ssId);
    expect(maxThrowFt(ss.stats.pitching)).toBeLessThan(80);
    expect(rec.theArmAtShort).toMatch(/autoAssign is v1 code and v1 must stay byte-identical/);
  });
});

describe('sim.playClock', () => {
  const rec = M.sim.playClock;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'derived', status: 'conformed' });
    expect(PLAY.MAX_PLAY_SEC).toBe(rec.ours.value.maxPlaySec);
  });

  it('★ asserts the cap is a backstop, which is the thing v1 never did', () => {
    expect(rec.measured.cappedPlays).toBe(0);
    expect(rec.measured.longestPlaySec).toBeLessThan(PLAY.MAX_PLAY_SEC);
    // Recomputed headroom, from the two numbers rather than the stated one.
    const headroom = Math.round((1 - rec.measured.longestPlaySec / PLAY.MAX_PLAY_SEC) * 100);
    expect(headroom).toBe(rec.measured.headroomPct);
    expect(rec.why).toMatch(/NOT measured -- scaled with RUNNER_SPEED/);
  });
});

describe('sim.cutoffRelay', () => {
  const rec = M.sim.cutoffRelay;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'derived', status: 'conformed' });
    expect(rec.ours.value.maxLegs).toBe(PLAY.RELAY_MAX_LEGS);
  });

  it('★ recomputes why a relay has to exist at all', () => {
    expect(dist(FIELD_POSITIONS.CF, FIRST)).toBeCloseTo(rec.measured.cfToFirstFt, 1);
    expect(ROSTER.filter((c) => maxThrowFt(c.stats.pitching) < dist(FIELD_POSITIONS.CF, FIRST)).length).toBe(
      rec.measured.armsThatCannotMakeIt
    );
    expect(ROSTER.length).toBe(rec.measured.rosterSize);
  });

  it('★ records that the look-back concession was NOT ported, and it still works', () => {
    expect(rec.ours.value.lookBackRule).toBe(false);
    expect(rec.theLookBackRuleWasNotNeeded).toMatch(/a statement about v1's GEOMETRY, not about relays/);
    // The v1 record it answers is left standing.
    expect(M.defense.fielderSpeed.notSufficient).toBeTruthy();
  });

  it('★ never records an out on a relay leg', () => {
    // The invariant v1 calls "the whole safety argument for the mechanic".
    let sawRelay = false;
    for (const sprayDeg of [-35, -13, 13, 35]) {
      const s = beginPlay(
        playSpec({ exitVelocityFts: 95, launchAngleDeg: 22, sprayDeg, spinRpm: 1800, heightFt: 2.5 }),
        makeRng(`rl${sprayDeg}`)
      );
      let n = 0;
      let prevOuts = 0;
      let prevRelay = false;
      while (s.phase === 'live' && n++ < 60 * PLAY.MAX_PLAY_SEC + 8) {
        const inFlight = s.throw?.target.kind === 'fielder';
        stepPlay(s, 1 / 60);
        if (s.events.some((e) => e.t === 'relay')) sawRelay = true;
        if (prevRelay && !inFlight) expect(s.outs, `spray ${sprayDeg}`).toBe(prevOuts);
        prevRelay = inFlight;
        prevOuts = s.outs;
      }
      finishPlay(s);
    }
    expect(sawRelay, 'the sweep must actually relay or it proves nothing').toBe(true);
  });
});

// --- PR 7: the at-bat and the game loop -------------------------------------

describe('sim.strikeZone', () => {
  const rec = M.sim.strikeZone;

  it('is a well-formed record, and pays for its confidence exemption', () => {
    wellFormed(rec, { reference: 'baseball', status: 'conformed' });
    // n=1 at high confidence is allowed for a RULEBOOK, but only if it names
    // the source — the same price sim.ballPhysics pays.
    expect(rec.measured.n).toBe(1);
    expect(rec.measured.confidence).toBe('high');
    expect(rec.derivation).toMatch(/Official Baseball Rules 2\.02/);
    expect(rec.derivation).toMatch(/Little League Rulebook 1\.05/);
  });

  it('★ recomputes the zone from the plate and the ball, not from itself', () => {
    expect(zoneHalfWidthFt()).toBeCloseTo(inToFt(ATBAT.PLATE_HALF_WIDTH_IN) + BALL_RADIUS_FT, 10);
    expect(zoneHalfWidthFt() * 2 * 12).toBeCloseTo(rec.measured.widthIn, 1);
    const [lo, hi] = zoneBandFt(rec.measured.onBatterOfHeightFt);
    expect(lo).toBeCloseTo(rec.measured.bottomFt, 2);
    expect(hi).toBeCloseTo(rec.measured.topFt, 2);
    expect((hi - lo) * 12).toBeCloseTo(rec.measured.heightIn, 1);
  });

  it('★ records that v1s zone has no size, which is the finding', () => {
    expect(rec.why).toMatch(/It is not a wrong size; it has no size/);
    expect(rec.theUmpireAsksTheTRAJECTORY).toMatch(/BECAUSE IT BROKE/);
  });
});

describe('sim.plateDiscipline', () => {
  const rec = M.sim.plateDiscipline;

  it('is a well-formed record and claims no rate at all', () => {
    wellFormed(rec, { reference: 'derived', status: 'awaiting-measurement' });
    // ★ STILL `awaiting-measurement` AFTER THE HARNESS RAN, and the reason is
    // the point: the harness measured OURS, not the reference class. `measured`
    // is where an external reading goes, and there is no published
    // plate-discipline data for four-to-eight-year-olds to put in it.
    expect(rec.measured).toBeNull();
    expect(rec.partialReading.n).toBe(0);
    expect(rec.partialReading.why).toMatch(/AFTER PR 8's harness ran/);
    expect(rec.whatWouldClose).toMatch(/closed the OURS column, not the record/);
  });

  it('★ corrects its own two-strike argument with a measurement', () => {
    // The record ARGUES that protection cuts strikeouts. PR 9 measured the curve
    // and it turns: our shipped value is past its own optimum. A record that
    // states a mechanism has to carry the measurement that qualifies it.
    expect(rec.theProtectionCurveIsNotMonotonic).toMatch(/WRONG SIDE/);
    expect(rec.theProtectionCurveIsNotMonotonic).toMatch(/44\.4 \/ 40\.4 \/ 42\.5 \/ 45\.1 \/ 47\.4/);
    // And it must not quietly "fix" it — PR 9 shipped the swing plane alone.
    // ★ AND PR 10 ACTED ON IT — jointly, not by walking the constant to its own
    // minimum, because 0.25 alone puts the walk rate outside its band.
    expect(rec.theProtectionCurveIsNotMonotonic).toMatch(/PR 10 moved it to 0\.35/);
    expect(rec.theProtectionCurveIsNotMonotonic).toMatch(/rather than walked to\s+its own minimum/);
    expect(ATBAT.TWO_STRIKE_PROTECT_FT).toBe(0.35);
  });

  it('★ records the strikeout rate the geometry fix exposed, and names the dial', () => {
    // 43% of plate appearances ending in a K is wrong for this age group by any
    // reading. The record has to say so, say which constant it lands on, and say
    // that PR 8 did not touch it — the same standing gameShape's BABIP has.
    expect(rec.whatTheHARNESSEXPOSED).toMatch(/UNDERCUT_FROM_JUDGE/);
    // ★ PR 9 WAS SCOPED TO OWN THIS AND MEASURED THE REASON NOT TO. The record
    // has to carry that, or the deferral reads as a slip rather than a finding.
    expect(rec.whatTheHARNESSEXPOSED).toMatch(/measured the reason not to\s+fix it alone/);
    expect(rec.whatTheHARNESSEXPOSED).toMatch(/17\.3%/);
    expect(rec.ours.value.strikeoutPct).toBeLessThan(0.22);
    // And that the OLD, comfortable-looking number was the broken one.
    expect(rec.whatTheHARNESSEXPOSED).toMatch(/arithmetic over a clamp/);
    expect(M.sim.contactGeometry.status).toBe('conformed');
  });

  it('★ pins the one thing that IS asserted: the noise is sized against the window', () => {
    // The bounded-support failure, in numbers rather than prose.
    const [worstFt, bestFt] = rec.ours.value.judgeFt;
    const [worstFrac, bestFrac] = rec.ours.value.judgeFrac;
    expect(plateJudgementFt(1)).toBeCloseTo(worstFt, 6);
    expect(plateJudgementFt(10)).toBeCloseTo(bestFt, 6);
    expect(swingTimingSigmaFrac(1)).toBeCloseTo(worstFrac, 6);
    expect(swingTimingSigmaFrac(10)).toBeCloseTo(bestFrac, 6);
    // A miss needs CONTACT_WINDOW_FRAC of error, and `Rng.bell` stops at 3.
    expect(BAT.CONTACT_WINDOW_FRAC / worstFrac, 'the worst eye must be able to miss').toBeLessThan(3);
    expect(BAT.CONTACT_WINDOW_FRAC / bestFrac, 'and so must the best').toBeLessThan(3);
    expect(rec.theBoundedNoiseFailedSilently).toMatch(/ZERO swinging strikes/);
  });

  it('★ has no chase rate and no whiff rate to tune', () => {
    // The design claim, checked against the constants that exist.
    for (const k of Object.keys(ATBAT)) {
      expect(/CHASE|WHIFF|MISS_RATE/.test(k), `ATBAT.${k} looks like an outcome knob`).toBe(false);
    }
    expect(rec.why).toMatch(/ONE ERROR, TWO BEHAVIOURS/);
  });
});

describe('sim.foulBalls', () => {
  const rec = M.sim.foulBalls;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'derived', status: 'conformed' });
    expect(rec.measured.n).toBeGreaterThan(1000);
  });

  it('★ records that isFair had NO CALLER, which is the finding', () => {
    expect(rec.why).toMatch(/NOTHING CALLED IT/);
    expect(rec.theRuleIsTHESHORTVERSION).toMatch(/deliberately the short version/);
    // And that PR 6's records were re-run rather than left describing old code.
    expect(rec.whatItMoved).toMatch(/re-run/);
    expect(M.sim.gapBallOutcome.reMeasuredAt).toMatch(/PR 7/);
  });
});

describe('sim.gameShape', () => {
  const rec = M.sim.gameShape;

  it('is a NOTE, because it is reported rather than met', () => {
    wellFormed(rec, { reference: 'derived', status: 'note' });
    expect(rec.why).toMatch(/TO BE READ, NOT TO BE MET/);
    // The warning it answers to, quoted from the category it lives in.
    expect(M.sim.note).toMatch(/four-to-eight/);
  });

  it('★ keeps the reading it superseded, because the old one was a different sim', () => {
    // Not a bigger sample — a sample taken over broken geometry. Both are kept.
    // ★ TWO SUPERSESSIONS NOW, AND ALL THREE READINGS ARE KEPT. Each was taken
    // over a different sim: the first with a bat that clamped instead of
    // missing, the second with no swing plane, this one with both fixed.
    expect(rec.measured.n).toBeGreaterThanOrEqual(50_000);
    expect(rec.supersedes.reading.n).toBeGreaterThanOrEqual(50_000);
    expect(rec.supersedes.why).toMatch(/THE FIFTH READING/);
    // The chain still reaches the original 1,166-PA reading, four deep.
    let node = rec.supersedes;
    let depth = 0;
    while (node?.andBefore) {
      node = node.andBefore;
      depth++;
    }
    expect(depth, 'four supersessions deep').toBe(3);
    expect(node.reading.n).toBe(1166);
    // PR 9 lowered BABIP without touching the defence.
    expect(rec.measured.babip).toBeLessThan(rec.supersedes.reading.babip);
  });

  it('★ names BABIP as the number that is wrong, rather than burying it', () => {
    expect(rec.measured.babip).toBeGreaterThan(0.5);
    // ★ AND IT MUST DISCLAIM THE IMPROVEMENT IT DID NOT EARN. PR 9 moved BABIP
    // .713 -> .678 by changing the batted-ball MIX, not the defence.
    // ★ PR 10 TRIED EVERY APPROVED LEVER AND REPORTS THE SHORTFALL rather than
    // reaching for a fifth. That is the thing the record has to carry.
    // ★ AND THE RECORD MUST NAME THE NEW ONE TOO. PR 12's steal frequency is
    // the arm band's third consequence, and burying it would be the failure the
    // `whatIsNot` field exists to prevent.
    expect(rec.whatIsNot).toMatch(/whyBABIPDIDNOTREACHITSTARGET/);
    expect(rec.whatIsNot).toMatch(/sim\.tagUp/);
    expect(rec.whatIsNot).toMatch(/THIRD consequence/);
    expect(rec.whatIsNot).toMatch(/sim\.stealRace/);
    expect(rec.measured.stealAttemptsPerGame).toBeGreaterThan(5);
    // And points at the records that explain it rather than at a dial.
    expect(rec.whatIsNot).toMatch(/sim\.throwSpeed/);
    expect(rec.whatIsNot).toMatch(/sim\.catchRadius/);
    expect(M.sim.throwSpeed.status).toBe('awaiting-measurement');
  });

  it('★ keeps its own numbers self-consistent, and says where the real check lives', () => {
    // ★ THIS FILE DOES NOT PLAY A GAME, and that is a scope decision rather than
    // a performance dodge. Its job, per its own header, is to reconcile records
    // against the constants the code carries "by RECOMPUTING each figure from
    // the imports". Whether a game produces strikeouts, walks, fouls, hits and
    // runs is a claim about the SIM, and `game.test.ts` already asserts exactly
    // that — playing a second game here duplicated it, and cost the one
    // assertion in this file that could not finish inside vitest's default under
    // the parallel suite's contention.
    //
    // What belongs here is that the record's own arithmetic holds.
    const m = rec.measured;
    expect(m.strikeoutPct + m.walkPct + m.ballsInPlayPct, 'K + BB + BIP should be most of a PA')
      .toBeGreaterThan(95);
    expect(m.strikeoutPct + m.walkPct + m.ballsInPlayPct).toBeLessThanOrEqual(100);
    expect(m.babip).toBeGreaterThan(0);
    expect(m.babip).toBeLessThanOrEqual(1);
    expect(m.pitchesPerPlateAppearance).toBeGreaterThan(1);
    expect(rec.performanceNote, 'and the cost of getting here is on the record').toMatch(
      /1\.7s per game to 0\.14s/
    );
  });
});

describe('sim.lineupArm', () => {
  const rec = M.sim.lineupArm;

  it('is a well-formed record', () => {
    wellFormed(rec, { reference: 'derived', status: 'conformed' });
    expect(rec.v1IsUNTOUCHED).toMatch(/v1's bundle path/);
  });

  it('★ recomputes the arm demand from the field, and closes PR 6s finding', () => {
    expect(throwDemandFt('SS')).toBeCloseTo(rec.measured.ssToFirstFt, 1);
    expect(throwDemandFt('LF'), 'the outfield throws furthest').toBeGreaterThan(throwDemandFt('SS'));
    const ids = ROSTER.slice(0, 9).map((c) => c.id);
    const v1SS = Object.entries(autoAssign(ids).positions).find(([, p]) => p === 'SS')[0];
    const v2SS = Object.entries(planDefence(ids, getCharacter).positions).find(([, p]) => p === 'SS')[0];
    expect(maxThrowFt(getCharacter(v1SS).stats.pitching)).toBeCloseTo(rec.measured.v1ShortstopRangeFt, 0);
    expect(maxThrowFt(getCharacter(v2SS).stats.pitching)).toBeCloseTo(rec.measured.v2ShortstopRangeFt, 0);
    // ★ And it clears the throw it has to make, which v1's did not once the
    // fielder had moved off his post to get the ball.
    expect(maxThrowFt(getCharacter(v2SS).stats.pitching)).toBeGreaterThan(throwDemandFt('SS'));
    expect(rec.whyNotTheBestArm).toMatch(/the mound takes the best arm/);
    // The record it discharges.
    expect(M.sim.gapBallOutcome.theArmAtShort).toMatch(/v2's own lineup planner is PR 7's/);
  });
});

describe('sim.contactGeometry', () => {
  const rec = M.sim.contactGeometry;

  it('is a well-formed record and earns its n=1 high confidence', () => {
    wellFormed(rec, { reference: 'physics', status: 'conformed' });
    // The sim category's exemption: a geometric identity is not a sample, but a
    // record may only claim it while NAMING its source.
    expect(rec.measured.n).toBe(1);
    expect(rec.measured.confidence).toBe('high');
    expect(rec.source).toBeTruthy();
    expect(rec.theGeometry).toMatch(/intersection condition/);
  });

  it('★ recomputes the separation from the constants, rather than reading it back', () => {
    const centreSep = BALL_RADIUS_FT + BAT.BARREL_RADIUS_FT;
    expect(centreSep).toBeCloseTo(rec.measured.centreSepFt, 3);
    expect(centreSep * 12).toBeCloseTo(rec.measured.centreSepIn, 2);
    expect(centreSep / ATBAT.UNDERCUT_FROM_JUDGE).toBeCloseTo(rec.measured.missBeyondJudgeErrorFt, 3);
  });

  it('★ recomputes how much of each kid\'s read used to saturate', () => {
    // The claim that made it worth fixing: a contact-1 kid saturated beyond
    // 0.74 sigma, so 46% of his swings became vertical pop-ups instead of
    // whiffs. Recomputed from `plateJudgementFt`, not read back.
    const centreSep = BALL_RADIUS_FT + BAT.BARREL_RADIUS_FT;
    for (const [stat, sigmas] of Object.entries(rec.measured.sigmaToSaturateByContactStat)) {
      const got = centreSep / ATBAT.UNDERCUT_FROM_JUDGE / plateJudgementFt(Number(stat));
      expect(got, `contact ${stat}`).toBeCloseTo(sigmas, 2);
    }
    // And `Rng.bell` is bounded at 3, so anything under 3 sigma really did occur.
    expect(rec.measured.sigmaToSaturateByContactStat['1']).toBeLessThan(3);
  });

  it('★ holds: no swing resolves to a batted ball at the vertical', () => {
    const centreSep = BALL_RADIUS_FT + BAT.BARREL_RADIUS_FT;
    const ordinary = ROSTER.find((k) => k.ability === 'none');
    for (const u of [centreSep * 1.001, centreSep * 4, -centreSep * 4]) {
      const r = resolveSwing(
        {
          timingErrorSec: 0,
          undercutFt: u,
          batter: ordinary,
          travelSec: 1.2,
          pitchSpeedFts: 35,
        },
        makeRng('geom').fork(String(u))
      );
      expect(r.kind, `undercut ${u}`).toBe('miss');
    }
  });

  it('★ says what the fix cost, rather than only what it bought', () => {
    expect(rec.whatItMoved).toMatch(/WRONG SHAPE FOR A WRONG RATE/);
    expect(rec.howItHid).toMatch(/Every TOTAL stayed plausible/);
    expect(rec.theOneCaseTheCLAMPSURVIVES).toMatch(/never_strikes_out/);
  });
});

describe('sim.battedBallSplit', () => {
  const rec = M.sim.battedBallSplit;

  it('claims no band, and quarantines the MLB one it is not claiming', () => {
    wellFormed(rec, { reference: 'baseball', status: 'awaiting-measurement' });
    expect(rec.measured).toBeNull();
    expect(rec.partialReading.n).toBe(0);
    expect(rec.partialReading.why).toMatch(/QUARANTINED/);
    // The bin edges are borrowed too, and the record has to say so — changing
    // them changes the split without changing the sim.
    expect(rec.partialReading.andTheBINEDGESAREBORROWEDTOO).toMatch(/Nothing about them is physics/);
  });

  it('★ binds the cuts to the record, rather than to themselves', () => {
    // ★ THE FIRST VERSION OF THIS TEST WAS TAUTOLOGICAL and the gate sweep
    // caught it: `classifyLaunch(LAUNCH_CUTS.ground - 0.001) === 'ground'` is
    // true for ANY value of LAUNCH_CUTS, so moving 10/25/50 to 25/40/60 changed
    // the split and the assertion never noticed. The record has to carry the
    // numbers for the comparison to mean anything.
    const cuts = rec.ours.value.launchCutsDeg;
    expect(LAUNCH_CUTS.ground).toBe(cuts.ground);
    expect(LAUNCH_CUTS.line).toBe(cuts.line);
    expect(LAUNCH_CUTS.fly).toBe(cuts.fly);
    // And the classifier still honours them at the boundary.
    expect(classifyLaunch(cuts.ground - 0.001)).toBe('ground');
    expect(classifyLaunch(cuts.line)).toBe('fly');
    expect(classifyLaunch(cuts.fly)).toBe('popup');
  });

  it('keeps our split a split', () => {
    const v = rec.ours.value;
    expect(v.ground + v.line + v.fly + v.popup).toBeCloseTo(1, 2);
    // Ground-heavier than the adult game, which is the only comparison drawn.
    expect(v.ground).toBeGreaterThan(rec.partialReading.mlbSplitForScale.ground);
  });

  it('★ refuses a hard-hit rate, and says why rather than omitting it silently', () => {
    expect(rec.thereIsNoHardHitRate).toMatch(/95mph/);
    expect(rec.thereIsNoHardHitRate).toMatch(/zero for every kid forever/);
    // The exit velocity that makes it meaningless, recomputed.
    expect(ftsToMph(batSpeedFts(10))).toBeLessThan(95);
    expect(rec.ours.value.exitVelocityP90Mph).toBeLessThan(95);
  });

  it('★ records the foul-to-fair ratio as a finding for PR 9', () => {
    const { foulBalls, fairBalls } = rec.ours.value;
    expect(foulBalls / fairBalls).toBeGreaterThan(3);
    expect(rec.theFOULTOFAIRRATIOISAFINDING).toMatch(/TWO_STRIKE_PROTECT_FT/);
    expect(rec.theFOULTOFAIRRATIOISAFINDING).toMatch(/DELIBERATELY DID NOT FIX IT/);
    expect(rec.theFOULTOFAIRRATIOISAFINDING).toMatch(/PR 10/);
  });
});

describe('sim.harnessMethod', () => {
  const rec = M.sim.harnessMethod;

  it('is a NOTE describing an instrument', () => {
    wellFormed(rec, { reference: 'derived', status: 'note' });
    expect(rec.measured.plateAppearances).toBeGreaterThanOrEqual(50_000);
  });

  it("★ keeps rng.ts's promise, and the cost that made it affordable", () => {
    // "50k plate appearances across 8 seeds" is why the sim uses sfc32.
    expect(rec.measured.seeds).toBe(8);
    expect(rec.measured.fullRunSec).toBeLessThan(113);
    expect(rec.costDiscipline).toMatch(/remove the waste, then state a budget/);
  });

  it('★ names the seeding trap it had to avoid', () => {
    // Forking one root per RUN would measure one game 874 times.
    expect(rec.everyGameGetsItsOwnROOT).toMatch(/byte-identical games/);
    expect(rec.theROSTERROTATES).toMatch(/twelve of the thirty never bat/);
  });

  it('★ lists what the harness cannot see, which is the ratchet guard', () => {
    expect(rec.why).toMatch(/A RATCHET, NOT A GATE/);
    expect(Array.isArray(rec.whatItCannotSee)).toBe(true);
    expect(rec.whatItCannotSee.length).toBeGreaterThanOrEqual(4);
    expect(rec.theASSERTIONSWITHTEETH).toMatch(/Ordering, not levels/);
    // PR 10 added the defensive twin, and the finding that it must be controlled.
    expect(rec.theASSERTIONSWITHTEETH).toMatch(/better-FIELDING defence/);
    expect(rec.anORDERINGTESTMUSTCONTROLFORTHEROSTER).toMatch(/0\.721 against 0\.699/);
    expect(rec.anORDERINGTESTMUSTCONTROLFORTHEROSTER).toMatch(/TOOK THREE TRIES/);
    expect(rec.anORDERINGTESTMUSTCONTROLFORTHEROSTER).toMatch(/deriving a\s+seed FROM the variable/);
  });

  it('★ pins the slice against the full run, since they share one aggregator', () => {
    expect(rec.theSLICEAGREESWITHTHERUN).toMatch(/one aggregator/);
    expect(rec.measured.sliceGames).toBeLessThan(rec.measured.games);
  });
});

describe('sim.swingPlane', () => {
  const rec = M.sim.swingPlane;

  it('claims no band, and quarantines the adult one it is not claiming', () => {
    wellFormed(rec, { reference: 'baseball', status: 'awaiting-measurement' });
    expect(rec.measured).toBeNull();
    expect(rec.partialReading.n).toBe(1);
    expect(rec.partialReading.why).toMatch(/QUARANTINED ON THE sim.batSpeed PRECEDENT/);
    expect(rec.partialReading.why).toMatch(/NOBODY HAS PUT A BAT SENSOR ON A FOUR-YEAR-OLD/);
  });

  it('★ ours sits inside the published adult band, which is the only claim made for it', () => {
    const [lo, hi] = rec.partialReading.adultBandDeg;
    expect(BAT.ATTACK_ANGLE_DEG).toBeGreaterThanOrEqual(lo);
    expect(BAT.ATTACK_ANGLE_DEG).toBeLessThanOrEqual(hi);
    expect(rec.ours.value.attackAngleDeg).toBe(BAT.ATTACK_ANGLE_DEG);
  });

  it('★ recomputes the pitch descent it says the attack angle is NOT', () => {
    // The tempting derivation — swing along the plane of the pitch — and the
    // measurement that rejects it. Recomputed from the sim, not read back.
    const seen = [];
    for (const kind of Object.keys(PITCHES))
      for (const arm of [3, 6, 9]) {
        const { state } = flyToPlate(
          releasePitch({ kind, pitchingStat: arm, aimHeightFt: 2.5, aimLateralFt: 0 })
        );
        const horiz = Math.hypot(state.v.x, state.v.z);
        seen.push((Math.atan2(-state.v.y, horiz) * 180) / Math.PI);
      }
    const [lo, hi] = rec.ours.value.pitchDescentAtPlateDeg;
    expect(Math.min(...seen)).toBeCloseTo(lo, 0);
    expect(Math.max(...seen)).toBeCloseTo(hi, 0);
    // And it is nothing like the attack angle — which is the point.
    expect(Math.min(...seen)).toBeGreaterThan(BAT.ATTACK_ANGLE_DEG * 2);
    expect(rec.itIsNOTThePitchDescentAngle).toMatch(/property of the SWING/);
  });

  it('★ makes the launch distribution stop being zero-mean', () => {
    // The defect, reproduced: a symmetric undercut through `asin` alone gives a
    // mean of zero, and every kid swings dead level.
    const ordinary = ROSTER.find((k) => k.ability === 'none');
    const swing = (u, plate) =>
      resolveSwing(
        { timingErrorSec: 0, undercutFt: u, batter: ordinary, travelSec: 1.2, pitchSpeedFts: 35, plate },
        makeRng('plane').fork(String(u))
      );
    const sep = BALL_RADIUS_FT + BAT.BARREL_RADIUS_FT;
    // ★ THE GRID MUST BE EXACTLY SYMMETRIC. `asin` is odd, so a symmetric sweep
    // cancels to exactly zero and the claim is arithmetic rather than
    // statistical — but a `u += step` loop does not land symmetrically and
    // leaves a spurious -0.83 degrees, which reads as a real bias.
    const meanOver = (plate) => {
      const a = [];
      for (let i = -50; i <= 50; i++) {
        const r = swing((sep * 0.99 * i) / 50, plate);
        if (r.kind === 'contact') a.push(r.launch.launchAngleDeg);
      }
      return a.reduce((x, y) => x + y, 0) / a.length;
    };
    // With no plane the symmetric sweep averages to zero, exactly.
    expect(meanOver({ ...resolvePlate(), attackAngleDeg: 0 })).toBeCloseTo(0, 6);
    // With one it averages to the plane.
    expect(meanOver(undefined)).toBeCloseTo(BAT.ATTACK_ANGLE_DEG, 6);
  });

  it('★ says what it cost as well as what it bought', () => {
    expect(rec.theONENUMBERTHATGOTWORSE).toMatch(/Pop-ups/);
    // Attributed to a specific pending dial, with the measurement behind it.
    expect(rec.theONENUMBERTHATGOTWORSE).toMatch(/UNDERCUT_FROM_JUDGE/);
    expect(rec.theONENUMBERTHATGOTWORSE).toMatch(/PR 10/);
    expect(rec.whatItMoved.babip[1]).toBeLessThan(rec.whatItMoved.babip[0]);
    expect(rec.whatItMoved.note).toMatch(/claims no credit/);
  });
});

describe('sim.retuneTargets', () => {
  const rec = M.sim.retuneTargets;

  it('is a NOTE that states design targets, not conformance', () => {
    wellFormed(rec, { reference: 'derived', status: 'note' });
    expect(rec.why).toMatch(/DESIGN TARGETS/);
    expect(rec.why).toMatch(/NOT CONFORMANCE TO A MEASUREMENT NOBODY TOOK/);
    expect(M.sim.note).toMatch(/four-to-eight/);
  });

  it('★ was written BEFORE the sweep, which is what makes it a target', () => {
    expect(rec.whyWrittenFIRST).toMatch(/NOT A TARGET, IT IS A DESCRIPTION/);
  });

  it('★ records which targets PR 9 hit and which it deliberately left', () => {
    const a = rec.measured.after_pr9;
    const t = rec.measured.targets;
    // The two it hit, checked against the target box rather than restated.
    for (const k of a.hit) {
      const [lo, hi] = t[k];
      expect(a[k], `${k} claimed hit`).toBeGreaterThanOrEqual(lo);
      expect(a[k], `${k} claimed hit`).toBeLessThanOrEqual(hi);
    }
    // The three it missed must really still be outside.
    for (const k of a.missed) {
      const [lo, hi] = t[k];
      expect(a[k] < lo || a[k] > hi, `${k} claimed missed`).toBe(true);
    }
  });

  it('★ carries the finding that resized the PR: strikeouts are load-bearing', () => {
    expect(rec.whyTheStrikeoutRateDidNotMoveHere).toMatch(/LOAD-BEARING/);
    expect(rec.whyTheStrikeoutRateDidNotMoveHere).toMatch(/4\.90 TO 15\.35/);
    // Under-determined: the plate targets admit solutions that wreck the game.
    expect(rec.whyTheStrikeoutRateDidNotMoveHere).toMatch(/under-determined/);
  });

  it('★ keeps ordering as the real gate, above any of the numbers', () => {
    expect(rec.theGATEISORDERING).toMatch(/NOT ANY OF THE NUMBERS ABOVE/);
    expect(rec.theGATEISORDERING).toMatch(/the retune is wrong and not the assertion/);
  });

  it('does not claim BABIP as its own', () => {
    expect(rec.whatIsNOTATARGETHERE).toMatch(/belongs to the DEFENCE/);
  });
});

describe('sim.chaserLeash', () => {
  const rec = M.sim.chaserLeash;

  it('is a well-formed record of a structural fix', () => {
    wellFormed(rec, { reference: 'derived', status: 'conformed' });
    expect(rec.why).toMatch(/NO TUNING CONSTANT COULD HAVE REACHED IT/);
  });

  it('★ recomputes the ball that exposed it — the SS really was in range', () => {
    // The claim: a 51mph grounder passes 9.8ft from the shortstop's post while
    // settling 205ft away, so the settle-keyed leash excluded him.
    const tr = traceLooseBall(
      launch({ exitVelocityFts: mphToFts(51), launchAngleDeg: 5, sprayDeg: -20, spinRpm: 800, heightFt: 2.5 }),
      VENUE_GEOMETRY.park,
      { horizonSec: DEFENSE.CHASE_HORIZON_SEC, samples: Math.round(DEFENSE.CHASE_HORIZON_SEC / DEFENSE.CHASE_STEP_SEC) }
    );
    expect(distFromHome(tr.settle)).toBeGreaterThan(190);
    // His post is far outside his own leash of that settle point.
    expect(dist(FIELD_POSITIONS.SS, tr.settle)).toBeGreaterThan(DEFENSE.LEASH_FT.SS);
    // But the ball passes close to him early.
    const near = Math.min(...tr.samples.map((s) => dist(FIELD_POSITIONS.SS, s.p)));
    expect(near).toBeLessThan(12);
  });

  it('★ holds: infielders take the grounders, and the pitcher takes the middle', () => {
    // The property the fix has to buy, and the one the ORIGINAL leash existed to
    // protect — the pitcher must not poach everything.
    const tally = {};
    let n = 0;
    for (let sprayDeg = -42; sprayDeg <= 42; sprayDeg += 6) {
      for (const ev of [45, 62, 80]) {
        const tr = traceLooseBall(
          launch({ exitVelocityFts: ev, launchAngleDeg: -3, sprayDeg, spinRpm: -400, heightFt: 2.5 }),
          VENUE_GEOMETRY.park,
          { horizonSec: DEFENSE.CHASE_HORIZON_SEC, samples: Math.round(DEFENSE.CHASE_HORIZON_SEC / DEFENSE.CHASE_STEP_SEC) }
        );
        const fs = Object.entries(autoAssign(ROSTER.slice(0, 9).map((c) => c.id)).positions).map(
          ([id, pos]) => makeFielder(getCharacter(id), pos, { nowSec: 0 })
        );
        const pos = fs[electChaser({ fielders: fs, trace: tr, inAir: false }).index].position;
        tally[pos] = (tally[pos] ?? 0) + 1;
        n++;
      }
    }
    const infield = ['P', '1B', '2B', 'SS', '3B'].reduce((a, p) => a + (tally[p] ?? 0), 0);
    expect(infield / n, 'infielders must chase most ground balls').toBeGreaterThan(0.7);
    // And the outfield must not, which is what was broken.
    const outfield = ['LF', 'CF', 'RF'].reduce((a, p) => a + (tally[p] ?? 0), 0);
    expect(outfield / n).toBeLessThan(0.3);
    expect(rec.measured.whoChasesAGrounderBefore.outfieldPct).toBeGreaterThan(60);
  });

  it('★ says why the first step looked like a failure until this landed', () => {
    expect(rec.whyTHEFIRSTSTEPBOUGHTALMOSTNOTHINGUNTILTHIS).toMatch(/were not IN the election/);
    expect(rec.measured.groundBallHitPct[1]).toBeLessThan(rec.measured.groundBallHitPct[0]);
    expect(rec.measured.babip[1]).toBeLessThan(rec.measured.babip[0]);
  });
});

describe('sim.firstStep', () => {
  const rec = M.sim.firstStep;

  it('claims no band and says the split-step is unmeasured for this age', () => {
    wellFormed(rec, { reference: 'baseball', status: 'awaiting-measurement' });
    expect(rec.measured).toBeNull();
    expect(rec.partialReading.why).toMatch(/not for four-to-eight-year-olds/);
  });

  it('★ is a STATE, not an acceleration — the one-kid-speed rule still holds', () => {
    expect(rec.itIsASTATENOTANACCELERATION).toMatch(/exactly one kid speed/);
    for (const c of ROSTER) {
      expect(makeFielder(c, 'SS').accelFtS2).toBe(makeRunner(c, 1).accelFtS2);
    }
  });

  it('★ is a FRACTION of top speed, recomputed from the constant', () => {
    expect(rec.ours.value).toBe(DEFENSE.FIRST_STEP_FRAC);
    expect(DEFENSE.FIRST_STEP_FRAC).toBeGreaterThan(0);
    for (const c of ROSTER) {
      const f = makeFielder(c, 'CF');
      expect(f.speedFts).toBeCloseTo(f.topFts * DEFENSE.FIRST_STEP_FRAC, 9);
    }
    expect(rec.aFRACTIONNEVERANABSOLUTE).toMatch(/7\.4pp to 12\.6/);
  });

  it('★ records that it bought almost nothing alone, which is the finding', () => {
    expect(rec.whatItBOUGHTALONE).toMatch(/81\.4% to 83\.5%/);
    expect(rec.whatItBOUGHTALONE).toMatch(/cannot help/);
  });
});

describe('sim.dropRate', () => {
  const rec = M.sim.dropRate;

  it('is a well-formed record for a constant that had none', () => {
    wellFormed(rec, { reference: 'baseball', status: 'awaiting-measurement' });
    expect(rec.measured).toBeNull();
    expect(rec.why).toMatch(/IT HAD NO RECORD AT ALL/);
  });

  it('★ records that it is NOT a lever, which is what stops it being reached for', () => {
    expect(rec.whatItIsWORTH).toMatch(/it is not a lever/i);
    expect(rec.whatItIsWORTH).toMatch(/within noise/);
    expect(rec.ours.value.dropBase).toBe(DEFENSE.DROP_BASE);
  });
});

describe('sim.stealRace', () => {
  const rec = M.sim.stealRace;

  it('is a NOTE that reports a level it does not defend', () => {
    wellFormed(rec, { reference: 'derived', status: 'note' });
    expect(rec.why).toMatch(/v1 ROLLS A PROBABILITY; v2 RUNS THE RACE/);
  });

  it('★ recomputes the arm gate that makes half of all steals free', () => {
    const need = dist(FIELD_POSITIONS.C, SECOND);
    expect(Math.round(need)).toBe(rec.measured.catcherToSecondFt);
    const reach = ROSTER.filter((c) => maxThrowFt(c.stats.pitching) >= need).length;
    expect(`${reach}/30`).toBe(rec.measured.kidsWhoseArmReachesSecond);
    // Which is the whole reason the frequency is what it is.
    expect(rec.theFREQUENCYISTHEARMBANDAGAIN).toMatch(/THIRD CONSEQUENCE/);
    expect(rec.theFREQUENCYISTHEARMBANDAGAIN).toMatch(/Recorded, not fitted/);
  });

  it('★ recomputes the emergent slow-pitch bonus', () => {
    // v1 hard-codes +0.12 for a changeup. Here the advantage IS the difference
    // in flight time, exactly, because the catcher cannot start until the ball
    // reaches him.
    const runner = ROSTER.reduce((b, c) => (c.stats.speed > b.stats.speed ? c : b));
    const catcher = ROSTER.reduce((b, c) => (c.stats.pitching > b.stats.pitching ? c : b));
    const at = (t) => projectedMarginSec({ runner, catcher, to: 2, pitchTravelSec: t });
    expect(at(1.33) - at(1.02)).toBeCloseTo(0.31, 9);
  });

  it('★ says the lead is unmeasured and load-bearing', () => {
    expect(rec.theLEADISUNMEASURED).toMatch(/nobody has measured/);
    expect(rec.ours.value.leadFt).toBe(RUN.LEAD_FT);
    expect(RUN.LEAD_FT).toBeGreaterThan(0);
  });

  it('★ has no frequency knob, and says the limit is situational', () => {
    expect(rec.theLIMITISSITUATIONALNOTPROBABILISTIC).toMatch(/decision model/i);
    for (const k of Object.keys(RUN)) {
      expect(/RATE|CHANCE|PROB|ATTEMPT|SUCCESS/.test(k), `RUN.${k}`).toBe(false);
    }
  });
});

describe('sim.tagUp', () => {
  const rec = M.sim.tagUp;

  it('is a well-formed record of a discharged deferral', () => {
    wellFormed(rec, { reference: 'derived', status: 'conformed' });
    expect(rec.why).toMatch(/wrong for the same reason/);
  });

  it('★ records the rules bug the tag-up work exposed', () => {
    // A caught fly must retire the batter however long it hung — a rule that
    // cannot be expressed positionally, which is how it was expressed.
    expect(rec.theBATTERWASIDENTIFIEDBYBASE).toMatch(/ZERO OUTS/);
    expect(rec.theBATTERWASIDENTIFIEDBYBASE).toMatch(/cannot be expressed positionally/);
  });

  it('★ recomputes that nobody can throw home, which is why a sac fly is free', () => {
    const canReachHome = ROSTER.filter((c) => maxThrowFt(c.stats.pitching) >= 180).length;
    expect(canReachHome).toBe(0);
    expect(rec.aSACFLYISAUTOMATICANDTHATISTHEARMTALKING).toMatch(/0 OF 30/);
    expect(rec.aSACFLYISAUTOMATICANDTHATISTHEARMTALKING).toMatch(/RECORDED rather than designed around/);
    expect(rec.measured.babip[1]).toBeLessThan(rec.measured.babip[0]);
    // And the branch that is written but cannot yet fire is NAMED, not silent.
    expect(rec.theDOUBLEOFFISWRITTENBUTUNREACHABLE).toMatch(/ZERO times over 72 catches/);
    expect(rec.theDOUBLEOFFISWRITTENBUTUNREACHABLE).toMatch(/PINNED AT ZERO/);
  });
});

describe('render.v1BundleInvariant', () => {
  const rec = M.render.v1BundleInvariant;

  it('is a NOTE recording why a project-wide rule changed', () => {
    expect(rec.category).toBe('render');
    expect(rec.status).toBe('note');
    expect(rec.why).toMatch(/THE HASH WAS A PROXY AND IT EXPIRED/);
  });

  it('★ keeps all three attempts to preserve it, not just the conclusion', () => {
    // A rule this old should not be retired on an assertion. Each attempt is
    // recorded with what it actually produced.
    expect(rec.measured.attemptsToPreserveIt).toHaveLength(3);
    expect(rec.measured.attemptsToPreserveIt.join(' ')).toMatch(/1907\.91kB/);
    expect(rec.theDECISIVEFINDING).toMatch(/NEVER A FINGERPRINT OF v1's SOURCE/);
  });

  it('★ names what carries the guarantee now, and it is automatic', () => {
    expect(rec.whatCARRIESITNOW).toHaveLength(3);
    const all = rec.whatCARRIESITNOW.join(' ');
    expect(all).toMatch(/v1 has no path to v2/);
    expect(all).toMatch(/in CI/);
    // And AGENTS.md must actually say so, rather than the record saying it does.
    const agents = readFileSync(join(here, '..', '..', 'AGENTS.md'), 'utf8');
    expect(agents).toMatch(/v1 has no path to v2/);
    expect(agents).not.toMatch(/a v2 change that alters `dist\/assets\/main-\*\.js`\nis a bug/);
  });

  it('★ says the bundle moving is evidence rather than damage', () => {
    expect(rec.theBUNDLEMOVINGISEVIDENCE).toMatch(/the architecture is real/);
    expect(rec.whyNotDuplicateInSource).toMatch(/own baseball's RULES/);
  });
});

describe('sim.fieldingInput', () => {
  const rec = M.sim.fieldingInput;

  it('is a NOTE that measured before deciding, rather than porting', () => {
    wellFormed(rec, { reference: 'derived', status: 'note' });
    expect(rec.why).toMatch(/v2's SITUATION IS THE OPPOSITE/);
    expect(rec.whatPR14DIDNOTDO).toMatch(/No assist was added/);
  });

  it('★ recomputes the reach the whole finding turns on', () => {
    expect(reachFt()).toBeCloseTo(rec.measured.reachFt, 6);
    // v1's assist was measured against a 39px reach; ours is a third of that in
    // real terms, which is why the constant could not be carried over.
    expect(M.sim.catchRadius.measured.reachFt).toBe(rec.measured.reachFt);
  });

  it('★ records that steering is load-bearing, which v1 could not say', () => {
    const c = rec.measured.caughtByAimError;
    expect(c.perpendicular).toBe('0/27');
    // Perfect aim must equal the CPU — the input is neither decorative nor a
    // handicap, which is the pair of claims that makes it a real verb.
    expect(c.perfectAim).toBe(c.cpuNoInput);
    expect(rec.theFINDING).toMatch(/v1's PROBLEM INVERTED/);
  });

  it('★ flags the tolerance rather than burying it', () => {
    // Three feet of aim error is a miss because three feet is the reach. That
    // is the number an assist would be sized against, and PR 14 did not add one.
    expect(rec.theTOLERANCEISTHEREACH).toMatch(/three feet IS the reach/);
    expect(rec.theTOLERANCEISTHEREACH).toMatch(/SIZED FROM THIS TABLE/);
    expect(rec.whatWouldClose).toMatch(/child actually playing it/);
  });
});

describe('sim.humanSwing', () => {
  const rec = M.sim.humanSwing;

  it('is a NOTE that measures a person, and claims no rate', () => {
    wellFormed(rec, { reference: 'derived', status: 'note' });
    expect(rec.measured.n).toBeGreaterThanOrEqual(3000);
    expect(rec.whatWouldClose).toMatch(/four-to-eight-year-old/);
  });

  it('★ recomputes the aim tolerance from the bat, not from the record', () => {
    // ★ THE TOLERANCE IS A REAL DIMENSION AND THIS IS WHAT PROVES IT. If the
    // half-width were a tuning constant somebody could move it and the record
    // would still read true; deriving it from the ball and the barrel means the
    // record fails the moment either changes.
    const half = BALL_RADIUS_FT + BAT.BARREL_RADIUS_FT;
    expect(rec.measured.aimToleranceFt.halfWidth).toBeCloseTo(half, 3);
    expect(rec.measured.aimToleranceFt.halfWidthIn).toBeCloseTo(half * 12, 2);

    // And the model must actually MISS past it, in both directions — PR 8's
    // clamp bug stated as a requirement rather than as prose.
    const batter = ROSTER.find((c) => c.stats.contact === 5) ?? ROSTER[0];
    const swing = (undercutFt) =>
      resolveSwing(
        { timingErrorSec: 0, undercutFt, batter, travelSec: 1.17, pitchSpeedFts: 60 },
        makeRng('tol')
      ).kind;
    expect(swing(half * 1.05)).toBe('miss');
    expect(swing(-half * 1.05)).toBe('miss');
    expect(swing(0)).not.toBe('miss');
  });

  it('★ keeps the timing window a FRACTION of the flight, which is what pace.swingWindows demands', () => {
    // The record's edge is quoted as both a duration and a fraction; they have
    // to agree with the flight it was measured on, or the number is decorative.
    const w = rec.measured.timingWindowSec;
    expect(w.edgeSec / rec.measured.pitchTravelSec.p50).toBeCloseTo(w.edgeAsFractionOfFlight, 2);

    // ★ AND THE WINDOW MUST SCALE WITH THE FLIGHT, not sit at a fixed ms — the
    // v1 failure `pace.swingWindows` records, where a 380ms window ended up
    // wider than a 270ms flight.
    //
    // ★ IT HAS TO STRADDLE THE EDGE, AND ON A SHORT FLIGHT, OR IT HAS NO TEETH.
    // The gate sweep caught the first version doing neither: it sampled 5% and
    // 12% of the flight, both comfortably INSIDE the window, so replacing
    // `travelSec` with a hardcoded 1.17 changed no verdict and the test passed
    // over the very defect it names. That is `pace.swingWindows`'s own warning —
    // "hardcode the window and only long flights still pass" — arriving in
    // person. Sampling just inside and just outside the edge is what bites: a
    // fixed window is 1.46x too generous on a 0.8s flight, so the swing that
    // must miss connects instead.
    const batter = ROSTER.find((c) => c.stats.contact === 5) ?? ROSTER[0];
    const at = (travelSec, frac) =>
      resolveSwing(
        { timingErrorSec: travelSec * frac, undercutFt: 0, batter, travelSec, pitchSpeedFts: 60 },
        makeRng('frac')
      ).kind;
    const edge = BAT.CONTACT_WINDOW_FRAC;
    for (const travelSec of [0.8, 1.17, 1.6]) {
      expect(at(travelSec, edge * 0.9), `inside the window at ${travelSec}s`).not.toBe('miss');
      expect(at(travelSec, edge * 1.1), `outside the window at ${travelSec}s`).toBe('miss');
    }
  });

  it('★ pins the swing tail above the measured window edge', () => {
    // Below the edge, the late half of the window is unreachable in the view
    // and the game only ever punishes being early.
    const view = readFileSync(join(here, '../../src/v2/spike/PlayView.ts'), 'utf8');
    const tail = Number(view.match(/const SWING_TAIL_SEC = ([\d.]+)/)?.[1]);
    expect(tail).toBe(rec.ours.SWING_TAIL_SEC);
    expect(tail).toBeGreaterThan(rec.measured.timingWindowSec.edgeSec);
  });
});

describe('render.pitchFraming', () => {
  const rec = M.render.pitchFraming;

  it('is a KNOWN-DRIFT that pins the eye it moved to', () => {
    wellFormed(rec, { reference: 'derived', status: 'known-drift', category: 'render' });
    expect(rec.theDRIFT).toMatch(/the framing is not good/i);
    expect(rec.theDRIFT).toMatch(/only a raycast can see it/);
  });

  it('★ binds the offset to the rig, and keeps it above the measured threshold', () => {
    // ★ THE RECORD CARRIES THE NUMBERS, per sim.battedBallSplit's tautology
    // lesson: asserting "the eye is offset" is true of any offset, including
    // the 7.0 that was measured to still lose the low inside corner.
    expect(RIGS.PITCH.eye).toEqual(rec.ours['RIGS.PITCH.eye']);
    const blocked = rec.measured.blockedZonePointsByEye;
    expect(blocked[`[${RIGS.PITCH.eye.join(',')}]`], 'the shipped eye must be the clear one').toBe(
      '0/7'
    );
    expect(blocked['[7,8.2,-18]'], 'and 7.0 must still be recorded as blocked').toBe('1/7');
    // A centred rig is the thing this record exists to say cannot work.
    expect(blocked['[0,8.2,-18]']).toBe('7/7');
    expect(RIGS.PITCH.eye[0]).toBeGreaterThan(7);
  });
});
