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
import {
  LIVE, FLOW, MODES, PITCH_SPEED, PITCHES, TIMING,
  PITCH_TRAVEL_MS, CPU_PITCH_TRAVEL_MS,
} from '../../src/config.ts';
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

  it('never lets a partial reading masquerade as a measurement', () => {
    // The n<3 convention: 1-2 clean samples are recorded honestly in a
    // `partialReading` block, but the record keeps saying BB is unmeasured.
    // Collapsing the two is how an n=1 becomes a drift the test then enforces
    // forever -- which is the original 234px-basepath mistake, mechanised.
    const walk = (o) => {
      for (const v of Object.values(o)) {
        if (!v || typeof v !== 'object') continue;
        if (v.id && v.partialReading) {
          expect(v.status, `${v.id} has a partialReading, so it cannot claim to be measured`).toBe(
            'awaiting-measurement'
          );
          expect(v.measured, `${v.id} must leave measured null while only partial`).toBeNull();
          expect(v.partialReading.confidence, `${v.id} partial readings are low-confidence by definition`).toBe('low');
        }
        walk(v);
      }
    };
    walk(M);
  });
});

describe('config.ts — no claiming a measurement that nothing backs', () => {
  it('makes every "Backyard-measured" comment name a constant some record informs', () => {
    // THE LOOPHOLE THIS CLOSES. measures.json is gated, but a comment in
    // config.ts is not -- and two of them asserted BB measurements that no
    // record had ever carried: PITCH_SPEED ("Backyard-measured. Real BB2001
    // flights span ~250ms to ~700ms") and FLOW.UMP_CALL_DELAY_MS ("the
    // BB2001-measured beat"). Both rested on superseded n=1 readings. A reader
    // has no way to tell those apart from a measurement with an audit trail,
    // which is the whole problem this project exists to fix.
    //
    // So: if the source says a number came from Backyard, a record must own it.
    // The record is allowed to say "awaiting-measurement" -- being honest about
    // not knowing is fine, silently implying you do is not.
    //
    // Deliberately scoped to "-measured". "Backyard-paced" appears on several
    // constants as a STYLE claim, not a measurement claim, and gating that
    // would make this test noise.
    const src = readFileSync(join(here, '..', '..', 'src', 'config.ts'), 'utf8');

    // Every constant any record points at, however it phrases it.
    const claimed = new Set();
    const walk = (o) => {
      for (const v of Object.values(o)) {
        if (!v || typeof v !== 'object') continue;
        if (v.id) {
          const names = [v.informs, v.ours?.constant, ...(v.ours?.constants ?? [])].filter(Boolean);
          for (const nm of names) for (const tok of String(nm).match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? []) claimed.add(tok);
        }
        walk(v);
      }
    };
    walk(M);

    const re = /(Backyard|BB2001)-measured/g;
    const unbacked = [];
    let m;
    let found = 0;
    while ((m = re.exec(src))) {
      found++;
      // The constant a claim is about is the next one DECLARED after it.
      const after = src.slice(m.index);
      const decl = after.match(/\b([A-Z][A-Z0-9_]{2,})\b\s*[:=]/);
      if (!decl) { unbacked.push(`(no constant found after "${m[0]}" at index ${m.index})`); continue; }
      if (!claimed.has(decl[1])) unbacked.push(decl[1]);
    }

    // The test is worthless if the regex silently stops matching anything.
    expect(found, 'expected config.ts to still contain Backyard-measurement claims').toBeGreaterThan(0);
    expect(unbacked, 'these config.ts comments claim a BB measurement no record informs').toEqual([]);
  });
});

describe('geometry — known drifts stay exactly as big as recorded', () => {
  it('FOUL_SLOPE sits inside BB’s per-venue band', () => {
    // This one REVERSED on 2026-07-24. It was a known-drift asserting that our
    // 1.2 was 3.2% shallower than a single BB value of 1.24, and that the gap
    // was 14x the spread between two agreeing sources. A third venue measured
    // 1.1974, which does not widen an error bar -- it says the quantity is
    // per-venue and was never one number. The assertion has to change shape
    // with the finding: band membership, not drift size.
    const rec = M.geometry.foulSlope;
    expect(rec.status).toBe('conformed');
    expect(FOUL_SLOPE).toBe(rec.ours.value);

    const slopes = rec.measurements.map((m) => m.combined);
    expect(slopes.length).toBeGreaterThanOrEqual(3);
    expect(rec.band).toEqual([Math.min(...slopes), Math.max(...slopes)]);
    expect(FOUL_SLOPE).toBeGreaterThanOrEqual(rec.band[0]);
    expect(FOUL_SLOPE).toBeLessThanOrEqual(rec.band[1]);

    // The reversal must stay legible: a superseded record keeps the reading it
    // replaced, so nobody re-derives the old conclusion from the new numbers.
    expect(rec.supersedes.was.status).toBe('known-drift');

    // And the finding that justified the reversal must hold: variation BETWEEN
    // venues has to exceed the worst left/right asymmetry WITHIN one, or the
    // spread really is noise and this should go back to being a drift.
    const asym = Math.max(...rec.measurements.map((m) => m.asymmetryPct ?? 0));
    const between = ((rec.band[1] - rec.band[0]) / rec.band[0]) * 100;
    expect(between).toBeGreaterThan(asym * 2);
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

describe('pace — measured, retuned, and now conformed', () => {
  it('home->1B matches BB, and stays the anchor everything else hangs off', () => {
    // Was a 49.7% known-drift until the 2026-07-24 retune moved RUNNER_SPEED
    // 85 -> 42.8. Both sides stay DERIVED: BB's from the record's own samples,
    // ours from the real constants, so a stale copy of either cannot agree with
    // the other by accident.
    const rec = M.pace.homeToFirst;
    expect(rec.status).toBe('conformed');

    expect(round(BASEPATH_PX, 2)).toBeCloseTo(rec.ours.basepathPx, 1);
    expect(LIVE.RUNNER_SPEED).toBe(rec.ours.runnerSpeedPxPerSec);
    expect(Math.round(ourHomeToFirstMs('main'))).toBe(rec.ours.realMs);

    // Inside BB's measured spread is the bar -- not equality, which would be a
    // false precision on an n=3 median with a 261ms spread.
    expect(Math.abs(ourHomeToFirstMs('main') - rec.measured)).toBeLessThan(rec.spread);
    expect(rec.samples).toHaveLength(rec.n);
  });

  it('fly hang matches BB at both ends of the range, as a ratio', () => {
    // The ratio is the durable form -- absolute hang times are meaningless
    // across two games with different field scales. Both ends are checked
    // separately because FLY_HANG_MS is a RANGE and they were drifting by very
    // different amounts (38% vs 14%) before the retune.
    const rec = M.pace.flyHang;
    expect(rec.status).toBe('conformed');
    expect(LIVE.LAUNCH.FLY_HANG_MS.MIN).toBe(rec.ours.value.MIN);
    expect(LIVE.LAUNCH.FLY_HANG_MS.MAX).toBe(rec.ours.value.MAX);

    const anchor = ourHomeToFirstMs('main');
    const ourMin = ratioToAnchor(LIVE.LAUNCH.FLY_HANG_MS.MIN, anchor);
    const ourMax = ratioToAnchor(LIVE.LAUNCH.FLY_HANG_MS.MAX, anchor);

    const anchorBB = M.pace.homeToFirst.measured;
    const bbMin = Math.min(...rec.samples.map((x) => x.ms)) / anchorBB;
    const bbMax = Math.max(...rec.samples.map((x) => x.ms)) / anchorBB;
    expect(round(bbMin, 3)).toBeCloseTo(rec.measured.ratioToAnchor.min, 2);
    expect(round(bbMax, 3)).toBeCloseTo(rec.measured.ratioToAnchor.max, 2);

    expect(Math.abs(ourMin / bbMin - 1)).toBeLessThan(0.02);
    expect(Math.abs(ourMax / bbMax - 1)).toBeLessThan(0.02);
    expect(rec.samples).toHaveLength(rec.n);
  });

  it('keeps the retune trap on the record even though the retune has happened', () => {
    // The most useful thing the measurement pass learned, and the easiest to
    // lose now that it has been acted on: at BB's anchor the OLD fly range sat
    // BELOW BB's, so slowing the runner without lengthening the flies would have
    // made them too SHORT. Assert the record still carries the warning and the
    // arithmetic that produced it, so a future reader cannot conclude from the
    // conformed status that flies were simply left alone.
    const rec = M.pace.flyHang;
    const anchorBB = M.pace.homeToFirst.measured;
    const OLD = { MIN: 2000, MAX: 2900 };
    expect(OLD.MIN / anchorBB).toBeLessThan(rec.measured.ratioToAnchor.min);
    expect(OLD.MAX / anchorBB).toBeLessThan(rec.measured.ratioToAnchor.max);
    expect(rec.retuneWarning).toBeTruthy();
    // And the fix went UP, not down -- the counterintuitive part.
    expect(LIVE.LAUNCH.FLY_HANG_MS.MIN).toBeGreaterThan(OLD.MIN);
    expect(LIVE.LAUNCH.FLY_HANG_MS.MAX).toBeGreaterThan(OLD.MAX);
  });

  it('between-pitch matches BB, and is still correctly PROPORTIONED', () => {
    const rec = M.pace.betweenPitch;
    expect(rec.status).toBe('conformed');
    expect(FLOW.BETWEEN_PITCH_MS).toBe(rec.ours.value);
    expect(Math.abs(FLOW.BETWEEN_PITCH_MS - rec.measured)).toBeLessThanOrEqual(rec.spread);
    expect(rec.samples).toHaveLength(rec.n);

    // This one was ALREADY correctly proportioned before the retune (0.591 vs
    // 0.607) and wrong only in absolute tempo, which is why it needed no
    // separate judgement call. Assert the proportion survived the move.
    const oursRatio = ratioToAnchor(FLOW.BETWEEN_PITCH_MS, ourHomeToFirstMs('main'));
    const bbRatio = rec.measured / M.pace.homeToFirst.measured;
    expect(Math.abs(oursRatio / bbRatio - 1)).toBeLessThan(0.05);
  });

  it('makes every still-unmeasured record name the work that would close it', () => {
    // An awaiting-measurement record that stops saying WHY decays into folklore
    // ("we never measured that") within one handover. Deliberately generic
    // rather than a hand-listed pair: as metrics get measured the list shrinks
    // by itself, and a NEW unmeasured record inherits the requirement instead
    // of slipping in unannotated.
    const pending = [];
    const walk = (o) => {
      for (const v of Object.values(o)) {
        if (!v || typeof v !== 'object') continue;
        if (v.id && v.status === 'awaiting-measurement') {
          pending.push(v.id);
          const says =
            v.whatWouldWork || v.blocked?.whatWouldWork || v.partialReading?.why ||
            v.session2Attempt?.whatWouldWork || v.pass2Attempt?.whatWouldWork || v.nNote;
          expect(says, `${v.id} must record what would close it`).toBeTruthy();
        }
        walk(v);
      }
    };
    walk(M);
    expect(pending.length).toBeGreaterThan(0);
  });
});

describe('pitch corridor — matched to BB, and timing can never go free again', () => {
  const armMult = (stat) =>
    Math.min(PITCH_SPEED.ARM_MULT.MAX, Math.max(PITCH_SPEED.ARM_MULT.MIN,
      PITCH_SPEED.ARM_MULT.BASE - PITCH_SPEED.ARM_MULT.PER_STAT * stat));
  const travel = (base, kind, stat) => (base / PITCHES[kind].speedMult) * armMult(stat);

  it('our fastball matches BB’s measured 270ms', () => {
    const rec = M.pace.pitchCorridor;
    expect(rec.status).toBe('conformed');

    // Both sides derived: ours from the real formula, BB's from its own samples.
    const ours = (stat) => travel(PITCH_SPEED.MAIN_BASE_MS, 'fastball', stat);
    expect(Math.round(ours(5))).toBe(rec.ours.fastballMs.stat5);

    const lasers = rec.samples.filter((x) => x.kind.startsWith('laser')).map((x) => x.ms);
    const bbFast = lasers.sort((a, b) => a - b)[Math.floor(lasers.length / 2)];
    expect(bbFast).toBe(rec.measured.fastballMs);
    expect(Math.abs(ours(5) - bbFast)).toBeLessThan(rec.measured.fastballSpread);

    // And our corridor now BRACKETS BB's lasers instead of sitting entirely
    // above them, which was the old finding.
    expect(ours(10)).toBeLessThan(Math.min(...lasers));
    expect(ours(1)).toBeGreaterThan(Math.max(...lasers));
  });

  it('never lets a timing window swallow the whole flight', () => {
    // THE STRUCTURAL GUARD, and the reason the windows had to move at all. If
    // CONTACT ever reaches the FASTEST possible travelMs, a tap at the instant
    // of release scores contact and timing stops being a skill. This outlives
    // any future retune of either number -- it is about the relationship.
    const kinds = Object.keys(PITCHES);
    const worst = (base) => Math.min(...kinds.map((k) => travel(base, k, 10)));

    expect(MODES.main.swingTiming.CONTACT).toBeLessThan(worst(PITCH_SPEED.MAIN_BASE_MS));
    expect(MODES.main.swingTiming.CONTACT).toBeLessThan(worst(PITCH_SPEED.MAIN_CPU_BASE_MS));
    // Kid mode always throws the fastball (no pitch selection).
    expect(TIMING.CONTACT).toBeLessThan(travel(PITCH_TRAVEL_MS, 'fastball', 10));
    expect(TIMING.CONTACT).toBeLessThan(travel(CPU_PITCH_TRAVEL_MS, 'fastball', 10));
  });

  it('keeps a lob range alive so slow pitches still read as slow', () => {
    // BB's readability trick: fastballs are lasers, off-speed arcs. If FROM_MS
    // sits above every possible travelMs the cue dies silently.
    const slowest = travel(PITCH_SPEED.MAIN_BASE_MS, 'changeup', 1);
    const fastest = travel(PITCH_SPEED.MAIN_BASE_MS, 'fastball', 10);
    expect(PITCH_SPEED.LOB.FROM_MS).toBeLessThan(slowest);
    expect(PITCH_SPEED.LOB.FROM_MS).toBeGreaterThan(fastest);
  });

  it('records the pitch clock, and keeps BOTH walk-backs about it visible', () => {
    const cad = M.pace.pitchCadence;
    expect(cad.status).toBe('conformed');
    expect(FLOW.PITCH_CLOCK_MS).toBe(cad.ours.value);
    // This record has been corrected twice, and the value of the record is the
    // trail, not the current answer. Overwriting either correction with the
    // other would hide the more instructive of the two mistakes.
    expect(Array.isArray(cad.supersedes)).toBe(true);
    expect(cad.supersedes).toHaveLength(2);
    expect(cad.supersedes[0].was).toMatch(/DOES NOT USE A TIMER/); // there IS a clock
    expect(cad.supersedes[1].was).toMatch(/BATTING-side/); // ...on the mound, not the plate
    for (const c of cad.supersedes) expect(c.lesson).toBeTruthy();
    expect(cad.measured.bbClockExists).toBe(true);
    // Our clock must sit below every gap BB was observed to allow, or we would
    // be claiming to be more patient than the game we measured.
    for (const g of cad.measured.bbGapsSec) expect(FLOW.PITCH_CLOCK_MS).toBeLessThan(g * 1000 + 1);
  });
});

describe('defense — pinned until BB is actually measured', () => {
  it('holds the CPU defense constants that RUNNER_SPEED is coupled to', () => {
    // These are the constants the pace retune cannot be derived without, and
    // they are exactly where a "reasonable-looking" guess would do the most
    // damage: halving RUNNER_SPEED doubles the time the defense has, so leaving
    // these untouched hands it every close play. Pin them so a retune has to
    // change them DELIBERATELY, and so this record notices when it happens.
    expect(MODES.main.live.cpuReactionMs).toBe(M.defense.cpuReaction.ours.value);
    expect(MODES.kid.live.cpuReactionMs).toBe(M.defense.cpuReaction.ours.kidValue);
    expect(MODES.main.live.cpuThrowDelayMs).toBe(M.defense.cpuThrowDelay.ours.value);
    expect(MODES.kid.live.cpuThrowDelayMs).toBe(M.defense.cpuThrowDelay.ours.kidValue);
    expect(LIVE.THROW_SPEED_MIN).toBe(M.defense.throwSpeed.ours.min);
    expect(LIVE.THROW_SPEED_MAX).toBe(M.defense.throwSpeed.ours.max);
    expect(MODES.main.live.cpuThrowSpeedMult).toBe(M.defense.throwSpeed.ours.cpuMult);
  });

  it('makes no claim about BB for any of them', () => {
    // The whole point of the status. defense.cpuReaction carries a 5-sample
    // partialReading that LOOKS like a measurement; the hygiene test elsewhere
    // already forbids it coexisting with a non-null `measured`, and this asserts
    // the same thing locally where a reader of this block will see it.
    for (const rec of [M.defense.cpuReaction, M.defense.cpuThrowDelay, M.defense.throwSpeed]) {
      expect(rec.status).toBe('awaiting-measurement');
      expect(rec.measured).toBeNull();
      expect(rec.n).toBe(0);
    }
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

  it('keeps session2’s precision floor at its MEASURED value, not the assumed one', () => {
    // Session2 entered the pace pass on an assumed ~33ms floor and measured
    // ~50ms. Feeding summarize the assumed value would have claimed ~1.4x the
    // precision that exists -- a right reading with a wrong error bar, which is
    // the same class of failure as the 234px basepath. Assert the record keeps
    // the measured floor and that it is consistent with its own samples.
    const s = M.instrument.frameRate.session2;
    const worst = Math.min(...s.distinctFpsSamples);
    expect(s.effectiveFramePeriodMs).toBeGreaterThanOrEqual(1000 / s.distinctFpsMedian - 6);
    expect(s.effectiveFramePeriodMs).toBeLessThanOrEqual(1000 / worst);
    // And the anchor must actually have been summarized against it.
    expect(M.pace.homeToFirst.framePeriodMs).toBe(s.effectiveFramePeriodMs);
    expect(M.pace.homeToFirst.spread).toBeGreaterThanOrEqual(s.effectiveFramePeriodMs);
  });

  it('rejects the emulator-stretch explanation before trusting any duration', () => {
    // Session2's ~4.2s anchor was almost exactly explainable as a frame-locked
    // game rendered at ~22 of an intended ~30fps (22/30 = 0.73 vs 3.0/4.2 =
    // 0.71). The record has to keep the test that rejected it, because the
    // coincidence is good enough to re-convince the next reader.
    const c = M.instrument.clockValidity;
    expect(c.verdict).toMatch(/REAL TIME/);
    expect(c.result.length).toBeGreaterThanOrEqual(4);

    // The decisive observation: under frame-locking the fastest-rendering run
    // must have the SHORTEST wall clock. Assert it still does not.
    const fastest = c.result.reduce((a, b) => (b.distinctFps > a.distinctFps ? b : a));
    const longest = c.result.reduce((a, b) => (b.legMs > a.legMs ? b : a));
    expect(fastest.play).toBe(longest.play);
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
