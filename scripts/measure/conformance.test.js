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
  PITCH_TRAVEL_MS, CPU_PITCH_TRAVEL_MS, GAME_HEIGHT, HUD,
  DIFFICULTY_TIERS,
} from '../../src/config.ts';
import { HOME, FIRST, FOUL_SLOPE, FIELD_BOTTOM_Y } from '../../src/systems/geometry.ts';
import { BAT_STANCE_GEOMETRY } from '../../src/art/CharacterArt.ts';
import { project, ZOOM } from '../../src/art/projection.ts';
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
    // delta -- so sim-ms and real-ms are the same thing.
    //
    // This literal 1 does NOT defend that. It was commented as if it did
    // ("introducing a tempo dial later breaks HERE, loudly"), but a tempo
    // scalar in config.ts changes what the game DOES and changes nothing this
    // computes: test-merging PR #17 put real home->1B at 6995ms while this
    // went on asserting 4197, with all 449 tests green. The guard that
    // actually fires is scripts/simclock.lint.test.js -- if a tempo dial is
    // ever wanted, that file's header says what has to happen here first.
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

  it('makes every record say WHAT it answers to', () => {
    // ★ `conformed` used to mean exactly one thing: "matches BB2001 footage".
    // The v2 sim brings records whose reference is published physics, records
    // whose reference is real baseball's statistics, and records that are pure
    // arithmetic against our own constants -- three incompatible standards
    // wearing the same word. Left implicit, the failure is specific and awful:
    // somebody eventually "conforms" a game for four-to-eight-year-olds to
    // MLB's strikeout rate, and every gate in this file agrees with them.
    //
    // Enforced HERE, in the category-gated walk, on purpose. It is the only one
    // that visits every record exactly once, and being gated on `category` it
    // skips the `sources` block -- the other four walks key on `.id` and DO
    // descend into sources, so asserting there would fail on provenance.
    const REFERENCES = ['bb2001', 'baseball', 'physics', 'derived'];
    let seen = 0;
    for (const [group, records] of Object.entries(M)) {
      if (typeof records !== 'object' || records === null || Array.isArray(records)) continue;
      for (const [name, rec] of Object.entries(records)) {
        if (typeof rec !== 'object' || rec === null || !rec.category) continue;
        seen++;
        expect(
          REFERENCES,
          `${group}.${name} must declare what it answers to (reference: ${REFERENCES.join(' | ')})`
        ).toContain(rec.reference);
      }
    }
    expect(seen, 'the record walk matched nothing — the gate would be vacuous').toBeGreaterThan(0);
  });

  it('never reports a confidence that n cannot support', () => {
    // lib.js's rule: confidence is DERIVED, never asserted. An operator who
    // types 'high' has told us nothing. This catches the reverse mistake --
    // a record hand-labelled 'high' on a single sample.
    //
    // ★ ONE NARROW EXEMPTION, and it is why `reference` had to exist. The rule
    // is about SAMPLING: n is how many times we measured, and 'high on n=1' is
    // how pace.pitchCorridor's withdrawn 270ms happened. A `reference:
    // 'physics'` record is not a measurement at all -- it is a CITATION of a
    // rulebook, a standard atmosphere, or a peer-reviewed fit. Its
    // trustworthiness comes from the source, and "n" for it is close to
    // meaningless (Official Baseball Rules 3.01 was not sampled twice).
    //
    // The exemption is paid for: such a record must NAME its provenance. That
    // keeps the escape hatch from being "call it physics and claim anything" --
    // it has to point at a `sources` block a reader can go and check.
    const walk = (o) => {
      for (const v of Object.values(o)) {
        if (!v || typeof v !== 'object') continue;
        if (v.id && v.confidence === 'high' && typeof v.n === 'number') {
          if (v.reference === 'physics') {
            expect(
              v.source,
              `${v.id} claims high confidence as a physics citation but names no source`
            ).toBeTruthy();
          } else {
            expect(v.n, `${v.id} claims high confidence on n=${v.n}`).toBeGreaterThanOrEqual(2);
          }
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

  it('the drawn diamond is still exactly as far off BB’s size as recorded', () => {
    // DERIVED end to end: the basepath is measured off what art/projection.ts
    // actually draws, not off a number typed into the record. Change ZOOM and
    // this goes red until someone re-states the drift and says why.
    const rec = M.geometry.fieldScale;
    expect(rec.status).toBe('known-drift');
    expect(ZOOM).toBe(rec.ours.value);

    const h = project(HOME);
    const f = project(FIRST);
    const drawn = Math.hypot(f.x - h.x, f.y - h.y);
    expect(round(drawn, 1)).toBe(rec.ours.basepathScreenPx);

    const pct = (drawn / GAME_HEIGHT) * 100;
    expect(round(pct, 1)).toBe(rec.ours.pctOfFrameHeight);
    // BB's side stays derived from its own samples too.
    const bbs = rec.measurements.map((m) => m.pctOfFrameHeight);
    expect(rec.band).toEqual([Math.min(...bbs), Math.max(...bbs)]);
    expect(pct).toBeLessThan(rec.band[0]); // still a drift, not yet conformed
    expect(round(((pct - rec.measured) / rec.measured) * 100, 1)).toBe(rec.driftPct);

    // The four constraints the zoom is pinned by. These are what make the
    // remaining gap structural rather than a dial nobody turned.
    expect(project({ x: 480, y: FIELD_BOTTOM_Y }).y).toBeLessThanOrEqual(GAME_HEIGHT);
    expect(project({ x: 480, y: 540 }).y).toBeLessThan(HUD.STRIP.TOP);
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

describe('art — the batting stance stays inside BB’s measured bands', () => {
  it('grip height, bat length and tip-vs-crown all sit in BB’s bands', () => {
    // DERIVED from the real pose constants, never restated: a record that
    // copies a number can agree with a stale copy of it forever. Edit the pose
    // without editing the record and this goes red -- which is the entire point,
    // because the comment this replaced ASSERTED the pose was Backyard-shaped
    // and nothing ever checked.
    const rec = M.art.battingStance;
    expect(rec.status).toBe('conformed');
    expect(rec.measurements).toHaveLength(rec.n);

    const g = BAT_STANCE_GEOMETRY;
    const s = g.stances.front.normal;
    const len = g.baseLen * g.scale;
    const rad = (Math.abs(s.deg) * Math.PI) / 180;

    const ours = {
      gripHeightFrac: (g.ground - s.y) / g.bodyH,
      batLenFrac: len / g.bodyH,
      tipAboveHeadFrac: (g.crownY - (s.y - len * Math.cos(rad))) / g.bodyH,
      gripDxFrac: (s.x - 100) / g.bodyH,
    };

    for (const [k, [lo, hi]] of Object.entries(rec.bands)) {
      expect(round(ours[k], 3), `${k} drifted out of BB's band`).toBeGreaterThanOrEqual(lo);
      expect(round(ours[k], 3), `${k} drifted out of BB's band`).toBeLessThanOrEqual(hi);
      expect(round(ours[k], 3), `${k} no longer matches what the record says we render`).toBe(
        rec.ours[k]
      );
    }

    // Each band must actually be the span of the samples -- otherwise a band
    // could be widened to admit a drift without anyone re-measuring.
    for (const k of Object.keys(rec.bands)) {
      const v = rec.measurements.map((m) => m[k]);
      expect(rec.bands[k], `${k}'s band is not the sample span`).toEqual([
        Math.min(...v),
        Math.max(...v),
      ]);
    }

    // The tight one, called out on its own: BB never lets the bat rise above
    // the crown, and neither may we. This is the invariant the old pose broke.
    expect(ours.tipAboveHeadFrac).toBeLessThanOrEqual(0);
    expect(rec.was.tipAboveHeadFrac).toBeGreaterThan(0);
  });

  it('every stance variant keeps its bat tip under the crown', () => {
    // The record pins front.normal only, deliberately -- the variants are
    // spread on purpose. But the ONE invariant applies to all of them, in both
    // views, or a kid with an unlucky stance grows a bat through their hat.
    const g = BAT_STANCE_GEOMETRY;
    const len = g.baseLen * g.scale;
    for (const view of ['front', 'rear']) {
      for (const [name, s] of Object.entries(g.stances[view])) {
        const drop = name === 'crouch' ? 9 : 0;
        const tipY = s.y + drop - len * Math.cos((Math.abs(s.deg) * Math.PI) / 180);
        expect(tipY, `${view}.${name} bat tip pokes above the crown`).toBeGreaterThanOrEqual(
          g.crownY + drop
        );
      }
    }
  });

  it('nothing but the hands covers the bat — BB never puts the head on it', () => {
    // art.batOcclusion. The stance conformed on all four battingStance
    // fractions and STILL read wrong, because the quantity it was wrong on was
    // never measured: what is allowed in FRONT of the bat. BB's occluded run
    // is contiguous, sits between 0.204 and 0.681 of body height, and is the
    // hands on the handle; above it the bat is unbroken to the tip.
    const rec = M.art.batOcclusion;
    expect(rec.status).toBe('conformed');
    expect(rec.measurements).toHaveLength(rec.n);
    expect(rec.headCrossesBat).toBe(false);

    // The band must be the span of the samples, so it cannot be widened to
    // admit a drift without re-measuring.
    const los = rec.measurements.map((m) => m.occludedBandFrac[0]);
    const his = rec.measurements.map((m) => m.occludedBandFrac[1]);
    expect(rec.bands.occludedBandFrac).toEqual([Math.min(...los), Math.max(...his)]);

    // Ours, DERIVED: the perpendicular distance from the skull centre to each
    // stance's bat axis, over the skull's half-width. >= 1 means the head is
    // clear of the barrel. The skull here is the default 50 the record quotes;
    // art.test.ts runs the same check per kid against their real head size.
    const g = BAT_STANCE_GEOMETRY;
    const skull = g.head.r;
    for (const view of ['front', 'rear']) {
      const shift = g.headShift[view];
      for (const [name, s] of Object.entries(g.stances[view])) {
        const rad = (s.deg * Math.PI) / 180;
        const dx = Math.sin(rad);
        const dy = -Math.cos(rad);
        const vx = g.head.cx + shift.x - s.x;
        const vy = g.head.cy + shift.y - (s.y + (name === 'crouch' ? 9 : 0));
        const ours = round(Math.abs(vx * dy - vy * dx) / skull, 3);
        expect(ours, `${view}.${name}: the head crosses the bat`).toBeGreaterThanOrEqual(1);
        expect(
          ours,
          `${view}.${name} no longer matches what the record says we render`
        ).toBe(rec.ours.axisClearanceRatio[`${view}.${name}`]);
      }
    }
    // The rear view is what broke, and the record has to remember how badly.
    expect(rec.was.minAxisClearanceRatio).toBeLessThan(1);
    expect(rec.ours.minAxisClearanceRatio).toBeGreaterThanOrEqual(1);
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

describe('pitch corridor — withdrawn, and timing can never go free again', () => {
  const armMult = (stat) =>
    Math.min(PITCH_SPEED.ARM_MULT.MAX, Math.max(PITCH_SPEED.ARM_MULT.MIN,
      PITCH_SPEED.ARM_MULT.BASE - PITCH_SPEED.ARM_MULT.PER_STAT * stat));
  const travel = (base, kind, stat) => (base / PITCHES[kind].speedMult) * armMult(stat);

  it('pins OUR fastball and claims nothing about BB', () => {
    // This assertion used to read "our fastball matches BB's measured 270ms".
    // It doesn't any more, and the reason is the whole point of this file: the
    // 270 was read off a capture that cannot show the release frame for the
    // pitch type being measured, so conforming to it asserted a parity nobody
    // had established. Under awaiting-measurement the contract inverts — the
    // test pins our snapshot so it cannot drift unnoticed, and makes no claim
    // about BB at all until a gated capture exists.
    const rec = M.pace.pitchCorridor;
    expect(rec.status).toBe('awaiting-measurement');
    expect(rec.measured, 'no BB value may be asserted while withdrawn').toBeNull();

    const ours = (stat) => travel(PITCH_SPEED.MAIN_BASE_MS, 'fastball', stat);
    expect(Math.round(ours(5))).toBe(rec.ours.fastballMs.stat5);
    expect(Math.round(ours(10))).toBe(rec.ours.fastballMs.stat10);
    expect(Math.round(ours(1))).toBe(rec.ours.fastballMs.stat1);
  });

  it('keeps the withdrawal auditable instead of quietly deleting it', () => {
    // A withdrawn measurement that leaves no trail is how the same mistake gets
    // made twice. The old value, its old status, and why it fell must survive.
    const rec = M.pace.pitchCorridor;
    expect(rec.whyWithdrawn).toBeTruthy();
    expect(rec.supersedes.was.status).toBe('conformed');
    expect(rec.supersedes.was.measured.fastballMs).toBe(270);
    // The six withdrawn samples survive in `supersedes` -- deleting them would
    // erase the worked example of the error that produced them.
    expect(rec.supersedes.withdrawnSamples.length).toBe(6);
    // And whatever currently stands in their place is still only partial.
    expect(rec.partialReading.confidence).toBe('low');
    expect(rec.partialReading.n).toBeLessThan(3);
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

  it('keeps fielders and baserunners the same kids', () => {
    // The gap this block existed to prevent, in the one constant it had missed.
    // FIELDER_SPEED was the ONLY pace constant with no record and no pin, and it
    // sat at 210px/s through five consecutive runner slowdowns while the ratio
    // crept 1.20x -> 2.47x. See measures.json defense.fielderSpeed `history`.
    const rec = M.defense.fielderSpeed.ours;
    expect(LIVE.FIELDER_RUN_RATIO).toBe(rec.ratio);
    expect(LIVE.FIELDER_SPEED).toBe(rec.fielderSpeed);
    expect(MODES.main.live.cpuFielderSpeedMult).toBe(rec.cpuMult_main);
    expect(MODES.kid.live.cpuFielderSpeedMult).toBe(rec.cpuMult_kid);

    // The relationship config.ts cannot express (an object literal can't
    // self-reference), asserted here instead. This is what makes the two
    // constants move together — the whole failure was that they didn't.
    expect(LIVE.FIELDER_SPEED).toBeCloseTo(LIVE.RUNNER_SPEED * LIVE.FIELDER_RUN_RATIO, 6);

    // ...and the same claim on the side the human BATS. A CPU fielder chases a
    // runner who has already been scaled by playerRunSpeedMult, so the mults
    // must match or the ratio holds on only one half of the game. Kid mode's
    // old 0.62 failed exactly this while looking deliberate.
    for (const mode of ['kid', 'main']) {
      expect(
        MODES[mode].live.cpuFielderSpeedMult,
        `${mode}: cpuFielderSpeedMult must equal playerRunSpeedMult`
      ).toBe(MODES[mode].live.playerRunSpeedMult);
    }

    // Sanity band from the record, so a future retune can't quietly re-open it.
    const ratio = LIVE.FIELDER_SPEED / LIVE.RUNNER_SPEED;
    expect(ratio).toBeGreaterThanOrEqual(0.9);
    expect(ratio).toBeLessThanOrEqual(1.4);
  });

  it('holds the per-difficulty fielding assist ladder', () => {
    // The flat 0.5 blend caught flies FOR the player (5.3px off the landing
    // spot after steering perpendicular all flight, inside a 39px reach). The
    // tier multipliers are what make defense a skill again, so a retune has to
    // move the record too.
    const a = M.defense.fieldingAssist.ours;
    expect(LIVE.ASSIST.MAGNET_BLEND).toBe(a.base.magnetBlend);
    expect(LIVE.ASSIST.IDLE_TAKEOVER_MS).toBe(a.base.idleTakeoverMs);
    expect(LIVE.ASSIST.IDLE_SPEED_MULT).toBe(a.base.idleSpeedMult);
    for (const tier of Object.keys(a.magnetMult)) {
      expect(DIFFICULTY_TIERS[tier].fielding.magnetMult).toBe(a.magnetMult[tier]);
      expect(DIFFICULTY_TIERS[tier].fielding.idleDelayMult).toBe(a.idleDelayMult[tier]);
      expect(DIFFICULTY_TIERS[tier].fielding.idleSpeedMult).toBe(a.idleSpeedMult[tier]);
    }
    // The invariant the record spells out, asserted rather than described:
    // the amble must stay worse than steering at every tier.
    for (const tier of Object.keys(DIFFICULTY_TIERS)) {
      expect(LIVE.ASSIST.IDLE_SPEED_MULT * DIFFICULTY_TIERS[tier].fielding.idleSpeedMult).toBeLessThan(1);
    }
  });

  it('makes no claim about BB for any of them', () => {
    // The whole point of the status. defense.cpuReaction carries a 5-sample
    // partialReading that LOOKS like a measurement; the hygiene test elsewhere
    // already forbids it coexisting with a non-null `measured`, and this asserts
    // the same thing locally where a reader of this block will see it.
    for (const rec of [M.defense.cpuReaction, M.defense.cpuThrowDelay, M.defense.throwSpeed, M.defense.fieldingAssist, M.defense.fielderSpeed]) {
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
