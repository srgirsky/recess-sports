import { describe, it, expect } from 'vitest';
import {
  median,
  mad,
  summarize,
  confidence,
  findSpike,
  affinity,
  validateWithFifthPoint,
  medianColor,
  patchFlatness,
  ratioToAnchor,
  simConstantFromRatio,
  ourLegRealMs,
  realMsForSimMs,
  linkTracks,
  trackMotion,
} from './lib.js';

describe('robust statistics', () => {
  it('median and MAD ignore a single wild outlier', () => {
    const clean = [100, 102, 98, 101, 99];
    const withOutlier = [...clean, 9999];
    // A mean would move ~1650; the median barely budges.
    expect(median(clean)).toBe(100);
    expect(Math.abs(median(withOutlier) - 100)).toBeLessThan(2);
    expect(mad(clean)).toBeLessThan(3);
  });
});

describe('summarize', () => {
  it('floors spread at one frame period for time measurements', () => {
    // Three samples that happen to land on the same frame. The instrument
    // cannot resolve better than a frame, so claiming spread 0 would overstate
    // precision -- exactly the false confidence this project exists to kill.
    const st = summarize([250, 250, 250], { unit: 'ms', framePeriodMs: 33.37 });
    expect(st.spread).toBeCloseTo(33.37, 1);
    expect(st.median).toBe(250);
    expect(st.n).toBe(3);
  });

  it('keeps the real spread when it exceeds the frame period', () => {
    const st = summarize([200, 300, 250], { unit: 'ms', framePeriodMs: 33.37 });
    expect(st.spread).toBe(100);
  });

  it('does not floor non-time units', () => {
    const st = summarize([5, 5, 5], { unit: 'px', framePeriodMs: 33.37 });
    expect(st.spread).toBe(0);
  });
});

describe('confidence', () => {
  it('is derived from n and spread, not asserted', () => {
    expect(confidence({ n: 6, median: 3000, spread: 300 })).toBe('high');
    expect(confidence({ n: 3, median: 3000, spread: 800 })).toBe('med');
    expect(confidence({ n: 2, median: 3000, spread: 1500 })).toBe('low');
    expect(confidence({ n: 0 })).toBe('estimate');
  });

  it('caps at low when the frame period was guessed, however tight it looks', () => {
    // Tight AND wrong is the dangerous case: a wrong frame period biases every
    // sample identically, so consistency proves nothing.
    const tight = { n: 8, median: 3000, spread: 60 };
    expect(confidence(tight)).toBe('high');
    expect(confidence(tight, { framePeriodAssumed: true })).toBe('low');
  });
});

describe('findSpike', () => {
  const series = [
    { t: 0.0, mad: 0.4 },
    { t: 0.1, mad: 0.5 },
    { t: 0.2, mad: 0.3 },
    { t: 0.3, mad: 22.0 }, // onset
    { t: 0.4, mad: 40.0 }, // peak
    { t: 0.5, mad: 18.0 },
  ];

  it('finds the ONSET frame with the robust threshold', () => {
    const hit = findSpike(series, { mode: 'first' });
    expect(hit.t).toBeCloseTo(0.3);
    expect(hit.index).toBe(3);
  });

  it('finds the PEAK frame in max mode', () => {
    expect(findSpike(series, { mode: 'max' }).t).toBeCloseTo(0.4);
  });

  it('still fires on a series so quiet that MAD collapses to zero', () => {
    const quiet = [
      { t: 0, mad: 0 },
      { t: 1, mad: 0 },
      { t: 2, mad: 0 },
      { t: 3, mad: 50 },
    ];
    expect(findSpike(quiet, { mode: 'first' }).t).toBe(3);
  });

  it('returns null when nothing clears the threshold', () => {
    expect(findSpike([{ t: 0, mad: 1 }, { t: 1, mad: 1 }], { mode: 'first' })).toBeNull();
  });
});

describe('the affinity test', () => {
  // Our own diamond, from src/systems/geometry.ts.
  const ours = {
    home: { x: 480, y: 500 },
    first: { x: 618, y: 385 },
    second: { x: 480, y: 270 },
    third: { x: 342, y: 385 },
  };

  it('passes our diamond: it is an affine squash of a real square', () => {
    const a = affinity(ours);
    expect(a.diagonalMidpointGap).toBe(0);
    expect(a.isAffine).toBe(true);
  });

  it('recovers FOUL_SLOPE = 1.2 from our own base positions', () => {
    const a = affinity(ours);
    expect(a.slopeCombined).toBeCloseTo(1.2, 3);
    expect(a.slopeLeft).toBeCloseTo(1.2, 3);
    expect(a.slopeRight).toBeCloseTo(1.2, 3);
    expect(a.slopeAsymmetryPct).toBe(0);
    // All four legs equal -> the diamond is regular even though squashed.
    expect(a.legSpreadPct).toBeCloseTo(0, 6);
    expect(a.meanLeg).toBeCloseTo(179.62, 1);
  });

  it('REJECTS a genuinely perspective-projected square', () => {
    // Project a unit square through a real perspective divide: points further
    // away (larger v) compress toward the horizon. This is precisely the case
    // that would invalidate projection.ts's `y: p.y` identity.
    const k = 0.6;
    const proj = (u, v) => {
      const w = 1 + k * v; // perspective divide grows with depth
      return { x: 300 + ((u - 0.5) * 400) / w, y: 400 - (v * 300) / w };
    };
    const persp = {
      home: proj(0, 0),
      first: proj(1, 0),
      second: proj(1, 1),
      third: proj(0, 1),
    };
    const a = affinity(persp);
    expect(a.isAffine).toBe(false);
    expect(a.diagonalMidpointGap).toBeGreaterThan(3);
  });

  it('flags left/right asymmetry that a combined slope would hide', () => {
    // A skewed quad whose two foul lines genuinely differ. The combined slope
    // averages them into a plausible-looking single number; the per-side
    // report is what exposes that no single FOUL_SLOPE can model it.
    const skew = {
      home: { x: 480, y: 500 },
      first: { x: 700, y: 385 },
      second: { x: 480, y: 270 },
      third: { x: 400, y: 385 },
    };
    const a = affinity(skew);
    expect(a.slopeRight).toBeGreaterThan(a.slopeLeft * 2);
    expect(a.slopeAsymmetryPct).toBeGreaterThan(50);
  });
});

describe('fifth-point validation', () => {
  const ours = {
    home: { x: 480, y: 500 },
    first: { x: 618, y: 385 },
    third: { x: 342, y: 385 },
  };

  it('predicts our mound within a couple of px of the real MOUND', () => {
    // A 4-point fit is exact by construction, so only a point we did NOT fit
    // can tell us the transform is real. geometry.ts puts MOUND at (480,388).
    const v = validateWithFifthPoint({ ...ours, observed: { x: 480, y: 388 } });
    expect(v.predicted.x).toBeCloseTo(480, 1);
    expect(v.residual).toBeLessThan(4);
    expect(v.trustworthy).toBe(true);
  });

  it('rejects a rubber that sits where no consistent projection would put it', () => {
    const v = validateWithFifthPoint({ ...ours, observed: { x: 480, y: 300 } });
    expect(v.trustworthy).toBe(false);
  });
});

describe('colour sampling', () => {
  const flatPatch = (r, g, b, n = 64) =>
    Uint8Array.from({ length: n * 4 }, (_, i) => [r, g, b, 255][i % 4]);

  it('takes the per-channel median, shrugging off intruding outliers', () => {
    const px = Array.from(flatPatch(90, 190, 90, 40));
    // A chalk line and a ball stray into the region -- a mean would drag toward white.
    for (let i = 0; i < 8; i++) px[i] = 255;
    const c = medianColor(Uint8Array.from(px));
    expect(c.g).toBe(190);
    expect(c.hex).toBe('#5abe5a');
  });

  it('detects that a patch is NOT flat (a filter/scaler is still on)', () => {
    const graded = Uint8Array.from({ length: 64 * 4 }, (_, i) =>
      i % 4 === 3 ? 255 : 80 + Math.floor(i / 4)
    );
    expect(patchFlatness(graded).isFlat).toBe(false);
    expect(patchFlatness(flatPatch(90, 190, 90)).isFlat).toBe(true);
  });
});

describe('conversion to our units', () => {
  // Live values from src/config.ts on the tempo branch.
  const TEMPO = 0.6;
  const BASEPATH_PX = 179.62;
  const RUNNER_SPEED = 85;

  it('reproduces our real home->1B time', () => {
    const leg = ourLegRealMs({ basepathPx: BASEPATH_PX, speedPxPerSec: RUNNER_SPEED, tempo: TEMPO });
    expect(leg).toBeCloseTo(3522, 0);
  });

  it('DOCUMENTS THE DEFECT: our flies hang far too long relative to the run', () => {
    // BB2001 measured: home->1B 3.0s, deep fly hang 2.0s.
    const bbRatio = ratioToAnchor(2000, 3000);
    expect(bbRatio).toBeCloseTo(0.667, 3);

    const ourLeg = ourLegRealMs({
      basepathPx: BASEPATH_PX,
      speedPxPerSec: RUNNER_SPEED,
      tempo: TEMPO,
    });
    // FLY_HANG_MS is SIM-time; real seconds = value / tau. Conflating the two
    // clocks is exactly how the notes came to call this row "matched".
    const ourFlyRealMin = realMsForSimMs(2000, TEMPO);
    const ourFlyRealMax = realMsForSimMs(2900, TEMPO);
    expect(ourFlyRealMin).toBeCloseTo(3333, 0);
    expect(ourFlyRealMax).toBeCloseTo(4833, 0);

    const ourRatioMin = ourFlyRealMin / ourLeg;
    const ourRatioMax = ourFlyRealMax / ourLeg;
    expect(ourRatioMin).toBeGreaterThan(bbRatio * 1.4); // >=40% too long
    expect(ourRatioMax).toBeGreaterThan(bbRatio * 2.0); // >=100% too long at the top
  });

  it('solves the sim-time constant that WOULD match BB', () => {
    const ourLeg = ourLegRealMs({
      basepathPx: BASEPATH_PX,
      speedPxPerSec: RUNNER_SPEED,
      tempo: TEMPO,
    });
    const target = simConstantFromRatio({
      ratioToAnchor: 2000 / 3000,
      ourAnchorRealMs: ourLeg,
      tempo: TEMPO,
    });
    // ~1409 sim-ms against today's 2000 -- the size of the correction waiting
    // on n>=6 measured flies. Deliberately NOT baked from this n=1 sample.
    expect(target).toBeGreaterThan(1300);
    expect(target).toBeLessThan(1500);
  });

  it('ratios are invariant to tempo, which is the whole point', () => {
    const at = (tempo) => {
      const leg = ourLegRealMs({ basepathPx: BASEPATH_PX, speedPxPerSec: RUNNER_SPEED, tempo });
      return realMsForSimMs(2000, tempo) / leg;
    };
    // tau cancels: changing TEMPO cannot change a ratio, which is why
    // measurement sets ratios and TEMPO stays a free product decision.
    expect(at(0.6)).toBeCloseTo(at(1.0), 9);
    expect(at(0.6)).toBeCloseTo(at(0.35), 9);
  });
});

describe('track linking — separating a ball from eleven kids', () => {
  // A synthetic live play: one ball on a real parabola, plus "fielders" that
  // drift and jitter the way limbs do. Ground truth is authored, so the test
  // asserts the ball is found AND that nothing else is mistaken for it.
  const BALL = (i) => ({ x: 40 + 7 * i, y: 300 - 22 * i + 1.1 * i * i });
  const FIELDER = (i, seed) => ({
    // Slow drift with a wobble -- fast enough to be "moving", never ballistic.
    x: 200 + seed * 60 + 1.2 * i + 6 * Math.sin(i * 0.9 + seed),
    y: 250 + seed * 20 + 0.8 * i + 6 * Math.cos(i * 1.1 + seed),
  });
  const N = 20;
  const scene = () =>
    Array.from({ length: N }, (_, i) => [
      BALL(i),
      ...Array.from({ length: 4 }, (_, s) => FIELDER(i, s)),
    ]);

  it('recovers one unbroken track per moving object', () => {
    const tracks = linkTracks(scene(), { maxJump: 40, maxGap: 3, minLen: 5 });
    expect(tracks).toHaveLength(5);
    for (const t of tracks) expect(t.pts).toHaveLength(N);
  });

  it('picks out the ball by its parabola, not by being fastest', () => {
    const tracks = linkTracks(scene(), { maxJump: 40, maxGap: 3, minLen: 5 });
    const scored = tracks.map((t) => ({ t, m: trackMotion(t) }));
    const ballistic = scored.filter((s) => s.m.ballistic);

    // Exactly one, and it is the one that starts where the ball starts.
    expect(ballistic).toHaveLength(1);
    expect(ballistic[0].t.pts[0].x).toBeCloseTo(BALL(0).x, 5);

    // And the fit recovers the authored vertical acceleration (2 * 1.1).
    expect(ballistic[0].m.accelY).toBeCloseTo(2.2, 1);
    expect(ballistic[0].m.resid).toBeLessThan(0.01);

    // The fielders are rejected on SHAPE, not on speed -- assert at least one
    // of them was moving fast enough to pass a naive speed-only filter, so the
    // test would fail if `ballistic` degenerated into "the quickest thing".
    const rejected = scored.filter((s) => !s.m.ballistic);
    expect(rejected.some((s) => s.m.speed >= 2.5)).toBe(true);
  });

  it('coasts a track across an occlusion instead of ending it', () => {
    // THE FAILURE THIS PREVENTS. A ball crossing a fence, a base or a white
    // uniform stops differing from the background for a few frames. If the
    // linker ended the track there, the ball would appear to "land" every time
    // it passed something pale -- a wrong hang time that looks perfectly clean.
    const frames = scene().map((pts, i) => (i >= 8 && i <= 10 ? pts.slice(1) : pts));
    const tracks = linkTracks(frames, { maxJump: 40, maxGap: 3, minLen: 5 });
    const ball = tracks.map((t) => ({ t, m: trackMotion(t) })).filter((s) => s.m.ballistic);

    expect(ball).toHaveLength(1);
    // One track spanning the whole flight, with the gap simply missing from it.
    expect(ball[0].m.i0).toBe(0);
    expect(ball[0].m.i1).toBe(N - 1);
    expect(ball[0].t.pts).toHaveLength(N - 3);
  });

  it('does end a track when the gap is longer than the allowance', () => {
    // The other half of the same rule: coasting must not be unlimited, or two
    // unrelated objects get welded into one implausible track.
    const frames = scene().map((pts, i) => (i >= 8 && i <= 13 ? pts.slice(1) : pts));
    const tracks = linkTracks(frames, { maxJump: 40, maxGap: 3, minLen: 3 });
    const starts = tracks.map((t) => t.i0).sort((a, b) => a - b);
    expect(starts).toContain(0);
    expect(starts).toContain(14);
  });

  it('reports why a track failed rather than just failing it', () => {
    // A short, slow, straight drift: fails on speed and span, and the caller
    // can see which. A bare boolean would make a mis-tuned threshold invisible.
    const drift = Array.from({ length: 10 }, (_, i) => [{ x: 100 + 0.4 * i, y: 100 }]);
    const [t] = linkTracks(drift, { minLen: 5 });
    const m = trackMotion(t);
    expect(m.ballistic).toBe(false);
    expect(m.speed).toBeLessThan(2.5);
    expect(m.span).toBeLessThan(40);
    expect(m.resid).toBeLessThan(6);      // it IS smooth -- just going nowhere
  });
});
