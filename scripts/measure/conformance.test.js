// ---------------------------------------------------------------------------
// BB2001 conformance — the gate that keeps measurements from going stale.
//
// The failure this project exists to fix was never a hard one to spot. A note
// claimed a 234px basepath; the real number is hypot(138,115) = 179.6. Nobody
// checked, so for months the game ran ~40% faster than the game it was copying.
// The measurement was wrong once. The DAMAGE came from nothing ever comparing
// it against the code again.
//
// So this file is not really a test of the numbers. It is a test of the LINK
// between scripts/measures.json and the constants those measurements are about.
// Every record names a constant; this reads both sides and asserts they still
// stand in the relationship the record claims. Change either one without the
// other and the suite goes red.
//
// PURE BY DESIGN. No ffmpeg, no video, no 43GB capture -- it reads a JSON file
// and imports TypeScript constants, so it runs everywhere `npm test` runs. A
// gate that only fires on the one machine with the footage on it is not a gate.
//
// The three statuses (defined in measures.json's own `statuses` block) exist
// because "measured" and "matching" are different questions, and collapsing
// them is how a to-do list turns into folklore:
//
//   conformed            BB measured, ours inside the band. Assert it stays.
//   known-drift          BB measured, ours outside it. Assert the drift is
//                        still the recorded SIZE -- so it cannot quietly grow,
//                        and cannot be half-fixed without someone editing the
//                        record and saying so.
//   awaiting-measurement BB not measured yet. Make NO claim about BB; just pin
//                        our current value so a Backyard-critical constant
//                        cannot drift while the reference work is outstanding.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LIVE, FLOW, MODES } from '../../src/config.ts';
import { HOME, FIRST, FOUL_SLOPE } from '../../src/systems/geometry.ts';
import { affinity, ourLegRealMs, ratioToAnchor, round } from './lib.js';

const here = dirname(fileURLToPath(import.meta.url));
const M = JSON.parse(readFileSync(join(here, '..', 'measures.json'), 'utf8'));

/** Our basepath, computed from the real constants rather than restated. */
const BASEPATH_PX = Math.hypot(FIRST.x - HOME.x, HOME.y - FIRST.y);

/**
 * Our home->1B time in real milliseconds, from the actual constants.
 *
 * Deliberately unrounded and derived, not typed: a record that restates a
 * number can agree with a stale copy of it forever.
 */
function ourHomeToFirstMs(mode = 'main') {
  return ourLegRealMs({
    basepathPx: BASEPATH_PX,
    speedPxPerSec: LIVE.RUNNER_SPEED * MODES[mode].live.playerRunSpeedMult,
    // No tempo dial exists in src/ -- GameScene steps the sim on Phaser's raw
    // delta -- so sim-ms and real-ms are the same thing. Stated explicitly so
    // that introducing a tempo dial later breaks HERE, loudly, instead of
    // silently invalidating every ratio in measures.json.
    tempo: 1,
  });
}

describe('measures.json — record hygiene', () => {
  it('gives every record a status the schema knows about', () => {
    // `category` is what marks a record. The `sources` block carries an `id`
    // too but is provenance, not measurement -- keying off `id` swept it in.
    const known = Object.keys(M.statuses);
    for (const [group, records] of Object.entries(M)) {
      if (typeof records !== 'object' || records === null || Array.isArray(records)) continue;
      for (const [name, rec] of Object.entries(records)) {
        if (typeof rec !== 'object' || rec === null || !rec.category) continue;
        expect(known, `${group}.${name} has status "${rec.status}"`).toContain(rec.status);
      }
    }
  });

  it('never reports a confidence that n cannot support', () => {
    // lib.js's rule: confidence is DERIVED, never asserted. An operator who
    // types 'high' has told us nothing. This catches the reverse mistake --
    // a record hand-labelled 'high' on a single sample.
    const walk = (o) => {
      for (const v of Object.values(o)) {
        if (!v || typeof v !== 'object') continue;
        if (v.id && v.confidence === 'high' && typeof v.n === 'number') {
          expect(v.n, `${v.id} claims high confidence on n=${v.n}`).toBeGreaterThanOrEqual(2);
        }
        walk(v);
      }
    };
    walk(M);
  });

  it('makes every awaiting-measurement record name the constant it is waiting on', () => {
    // The point of the status: pending work stays a list, not a rumour.
    const pending = [];
    const walk = (o) => {
      for (const v of Object.values(o)) {
        if (!v || typeof v !== 'object') continue;
        if (v.id && v.status === 'awaiting-measurement') {
          pending.push(v.id);
          const named = v.ours?.constant || v.ours?.constants || v.informs;
          expect(named, `${v.id} must name the constant it informs`).toBeTruthy();
        }
        walk(v);
      }
    };
    walk(M);
    // Not an accident, and not zero: this is the outstanding reference work.
    expect(pending.length).toBeGreaterThan(0);
  });
});

describe('geometry — known drifts stay exactly as big as recorded', () => {
  it('FOUL_SLOPE is still 3.2% shallower than BB, no more and no less', () => {
    const rec = M.geometry.foulSlope;
    expect(rec.status).toBe('known-drift');
    expect(FOUL_SLOPE).toBe(rec.ours.value);

    const drift = ((FOUL_SLOPE - rec.measured) / rec.measured) * 100;
    expect(round(drift, 2)).toBeCloseTo(rec.driftPct, 1);

    // And the drift is real rather than noise: BB's two independent sources
    // agree far more tightly than we differ from them. If a future measurement
    // widened that spread past the gap, this record would no longer be a drift
    // at all and should be re-examined -- so assert the ordering holds.
    expect(Math.abs(FOUL_SLOPE - rec.measured)).toBeGreaterThan(rec.spread);
  });

  it('our projection is still exactly affine while BB is decisively not', () => {
    const rec = M.geometry.projectionType;
    expect(rec.status).toBe('known-drift');

    // Compute OUR diamond's affinity from the real base constants. This is the
    // load-bearing one: if someone adds vertical foreshortening to the field,
    // this flips and forces the record to be updated with the new reality.
    const ours = affinity({
      home: HOME,
      first: FIRST,
      second: { x: HOME.x, y: HOME.y - 2 * (HOME.y - FIRST.y) },
      third: { x: HOME.x - (FIRST.x - HOME.x), y: FIRST.y },
    });
    expect(ours.isAffine).toBe(true);
    expect(ours.diagonalMidpointGap).toBe(rec.ours.diagonalMidpointGapPx);

    // BB's side: both independent measurements must still clear the threshold,
    // or the verdict this drift is defined against no longer holds.
    expect(rec.measurements.length).toBeGreaterThanOrEqual(2);
    for (const m of rec.measurements) {
      expect(m.diagonalMidpointGapPx, `${m.source} must clear the affine threshold`).toBeGreaterThan(
        rec.affineThresholdPx
      );
    }
  });
});

describe('pace — pinned until BB is actually measured', () => {
  it('home->1B is unchanged, and the record does not pretend BB is known', () => {
    const rec = M.pace.homeToFirst;
    expect(rec.status).toBe('awaiting-measurement');
    // No BB value may be asserted while the only reading is superseded.
    expect(rec.measured).toBeNull();
    expect(rec.n).toBe(0);
    expect(rec.priorReading.superseded).toBe(true);

    expect(round(BASEPATH_PX, 2)).toBeCloseTo(rec.ours.basepathPx, 1);
    expect(LIVE.RUNNER_SPEED).toBe(rec.ours.runnerSpeedPxPerSec);
    expect(Math.round(ourHomeToFirstMs('main'))).toBe(rec.ours.realMs);
  });

  it('fly hang is unchanged, and its ratio to the anchor is what the record says', () => {
    // The ratio is the durable form -- absolute hang times are meaningless
    // across two games with different field scales -- so the ratio is what
    // gets pinned, not the raw milliseconds.
    const rec = M.pace.flyHang;
    expect(rec.status).toBe('awaiting-measurement');
    expect(LIVE.LAUNCH.FLY_HANG_MS.MIN).toBe(rec.ours.value.MIN);
    expect(LIVE.LAUNCH.FLY_HANG_MS.MAX).toBe(rec.ours.value.MAX);

    const anchor = ourHomeToFirstMs('main');
    expect(round(ratioToAnchor(LIVE.LAUNCH.FLY_HANG_MS.MIN, anchor), 3)).toBeCloseTo(rec.ours.ratioToAnchor[0], 2);
    expect(round(ratioToAnchor(LIVE.LAUNCH.FLY_HANG_MS.MAX, anchor), 3)).toBeCloseTo(rec.ours.ratioToAnchor[1], 2);
  });

  it('between-pitch is unchanged', () => {
    const rec = M.pace.betweenPitch;
    expect(rec.status).toBe('awaiting-measurement');
    expect(FLOW.BETWEEN_PITCH_MS).toBe(rec.ours.value);
  });
});

describe('instrument — the capture facts the pace pass will rely on', () => {
  it('keeps the precision floor at the DISTINCT frame rate, not the container rate', () => {
    // The single easiest way to produce confident garbage from this capture is
    // to time against the 60fps the container advertises. The record must keep
    // saying otherwise, and by a wide margin.
    const r = M.instrument.frameRate;
    expect(r.containerFps).toBe(60);
    expect(r.effectiveFramePeriodMs).toBeGreaterThan(1000 / r.containerFps * 2);
    expect(r.distinctFps).toBeLessThan(r.containerFps / 2);
  });

  it('measures only inside the confirmed game segments', () => {
    const segs = M.instrument.gameSegments.segments;
    const games = segs.filter((s) => s.kind === 'game');
    for (const t of M.instrument.playIndex.playStarts) {
      const inside = games.some((s) => t >= s.t0 && t < s.t1);
      expect(inside, `play at t=${t} must fall inside a confirmed game segment`).toBe(true);
    }
  });

  it('separates game from non-game with no overlap between the classes', () => {
    // A classifier whose classes touch is a classifier that will misfile
    // something eventually. This one has a wide gap; assert it stays wide.
    const s = M.instrument.gameSegments.separation;
    expect(s.gameScoreRange[0]).toBeGreaterThan(s.otherScoreRange[1] + 0.5);
    expect(s.unknownSamples).toBe(0);
  });
});
