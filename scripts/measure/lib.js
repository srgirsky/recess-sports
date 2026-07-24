// ---------------------------------------------------------------------------
// BB2001 measurement — the PURE math layer.
//
// No ffmpeg, no filesystem, no I/O: everything here is data in -> numbers out,
// so it is unit-tested (lib.test.js) and runs under `npm test` with the rest of
// the suite. The I/O half lives in video.js.
//
// Why this file exists at all: every "Backyard feel" constant in src/config.ts
// was tuned against remembered impressions, and the one number we wrote down
// was wrong -- docs/research/backyard-2001-video-notes.md claimed a ~234px
// basepath when it is actually hypot(138,115) = 179.6px, which made home->1B
// ~40% faster than the game we were copying. The antidote is measurements that
// carry their own error bars and refuse to overstate themselves.
//
// THE ORGANIZING PRINCIPLE, which every function here serves:
//
//   Measurement fixes dimensionless RATIOS against one anchor (home->1B time).
//   TEMPO is the single absolute dial and is a product decision, not a
//   measurement.
//
// Ratios are why this survives BB being 640x480 and us being 960x640: the
// pixel scale cancels, the frame rate cancels, and TEMPO cancels. Absolute
// pixel speeds copied across resolutions would be meaningless.
// ---------------------------------------------------------------------------

/** Sorted copy. Every statistic here is order-based (robust), never a mean. */
function sorted(xs) {
  return [...xs].sort((a, b) => a - b);
}

export function median(xs) {
  if (!xs.length) return NaN;
  const s = sorted(xs);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/**
 * Median absolute deviation. The robust stand-in for standard deviation: one
 * mistimed frame in a sample of six would drag an SD badly, but barely moves
 * a MAD. Used for spike thresholds so no hand-tuned constant is needed.
 */
export function mad(xs) {
  if (!xs.length) return NaN;
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

/**
 * Summarize repeated samples of one metric.
 *
 * `spread` is the full range (max-min), NOT an IQR: n is going to be 3-10, and
 * an interquartile range on n=4 is theatre.
 *
 * THE IMPORTANT PART -- `spread` is FLOORED at one frame period for time
 * measurements. Every timestamp we read carries +-1 frame of quantization, so
 * a 250ms measurement off a 30fps source is inherently +-13%. Reporting a
 * tighter spread than the instrument can resolve is a lie of precision, and
 * this is exactly the kind of false confidence that produced the bad basepath
 * number in the first place.
 */
export function summarize(samples, { unit = 'ms', framePeriodMs = 0 } = {}) {
  const xs = samples.filter((x) => Number.isFinite(x));
  const n = xs.length;
  if (!n) return { median: NaN, spread: NaN, n: 0, min: NaN, max: NaN };
  const s = sorted(xs);
  let spread = s[n - 1] - s[0];
  if (unit === 'ms' && framePeriodMs > 0) spread = Math.max(spread, framePeriodMs);
  return {
    median: round(median(xs), 1),
    spread: round(spread, 1),
    n,
    min: round(s[0], 1),
    max: round(s[n - 1], 1),
  };
}

/**
 * Confidence is DERIVED, never asserted. An operator who types 'high' has told
 * us nothing; n and spread have. Anything measured against a guessed frame
 * period is capped at 'low' no matter how tight it looks, because a wrong
 * frame period biases every sample the same way -- tight AND wrong.
 */
export function confidence(st, { framePeriodAssumed = false } = {}) {
  if (!st.n) return 'estimate';
  if (framePeriodAssumed) return 'low';
  const rel = st.median > 0 ? st.spread / st.median : Infinity;
  if (st.n >= 6 && rel <= 0.15) return 'high';
  if (st.n >= 3 && rel <= 0.3) return 'med';
  return 'low';
}

/**
 * Find the event frame in a difference series.
 *
 * 'first' = earliest frame whose value clears median + k*MAD -- the onset of
 * motion (a ball leaving a hand, a runner starting). 'max' = the single
 * biggest change (an impact, a cut). Robust threshold means this works on a
 * quiet series and a noisy one without retuning k.
 */
export function findSpike(series, { mode = 'first', k = 3, key = 'mad' } = {}) {
  const vals = series.map((s) => s[key]);
  if (!vals.length) return null;
  if (mode === 'max') {
    const i = vals.indexOf(Math.max(...vals));
    return { ...series[i], index: i, threshold: null };
  }
  // Estimate the QUIET baseline from the lower half of the series, not the
  // whole of it. A ball in flight is "the event" for many consecutive frames,
  // and once the event occupies a large fraction of the samples it contaminates
  // the overall median -- the threshold rises above the onset and findSpike
  // silently returns the PEAK instead. Taking the low half keeps the baseline
  // anchored in genuinely quiet frames however long the event runs.
  const low = sorted(vals).slice(0, Math.max(1, Math.ceil(vals.length / 2)));
  const m = median(low);
  const d = mad(low);
  // MAD collapses to 0 on a perfectly static baseline; fall back to a fraction
  // of the peak so a single sharp event is still detectable.
  const scale = d > 1e-9 ? d : Math.max(...vals) / 6 || 1e-9;
  const threshold = m + k * scale;
  const i = vals.findIndex((v) => v > threshold);
  return i < 0 ? null : { ...series[i], index: i, threshold: round(threshold, 4) };
}

/**
 * THE AFFINITY TEST -- the highest information-per-minute measurement in this
 * project, and the gate on the biggest structural risk.
 *
 * Our renderer (src/art/projection.ts) maps `y: p.y` -- a pure horizontal
 * pinch with NO vertical foreshortening. If BB2001 uses true perspective,
 * that identity is structurally wrong and matching it would ripple into
 * geometry.ts, clampToField's convexity argument, and the whole sim.
 *
 * The test: a baseball diamond is a SQUARE, so its four bases are the corners
 * of a square. Under any AFFINE map the diagonals of a parallelogram bisect
 * each other, so the two diagonal midpoints coincide. Under a PERSPECTIVE map
 * they do not -- the far half compresses and the 1B-3B midpoint sits below the
 * home-2B midpoint. One subtraction answers it.
 *
 * Reports the two foul-line slopes SEPARATELY as well as combined: if left and
 * right disagree materially then no single FOUL_SLOPE can describe BB's view
 * at all, which a summed-only form would hide.
 *
 * Points are {x, y} in source pixels, y increasing downward (image convention).
 */
export function affinity({ home, first, second, third }) {
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const m1 = mid(home, second); // home -> 2B diagonal
  const m2 = mid(first, third); // 1B -> 3B diagonal
  const dM = dist(m1, m2);

  const legs = {
    homeFirst: dist(home, first),
    firstSecond: dist(first, second),
    secondThird: dist(second, third),
    thirdHome: dist(third, home),
  };
  const legVals = Object.values(legs);
  const meanLeg = legVals.reduce((a, b) => a + b, 0) / legVals.length;

  // Per-side foul-line slope: horizontal run per unit of depth, from home.
  const slopeRight = Math.abs(first.x - home.x) / Math.abs(home.y - first.y);
  const slopeLeft = Math.abs(third.x - home.x) / Math.abs(home.y - third.y);
  const slopeCombined =
    (Math.abs(first.x - home.x) + Math.abs(third.x - home.x)) /
    (Math.abs(home.y - first.y) + Math.abs(home.y - third.y));

  return {
    diagonalMidpointGap: round(dM, 2),
    gapPctOfLeg: round((dM / meanLeg) * 100, 2),
    // The verdict. 3px on a 640x480 source is ~0.5% of frame width and about
    // the precision of picking a base centre by eye.
    isAffine: dM <= 3,
    slopeLeft: round(slopeLeft, 4),
    slopeRight: round(slopeRight, 4),
    slopeCombined: round(slopeCombined, 4),
    // Materially different left/right => a single FOUL_SLOPE cannot model it.
    slopeAsymmetryPct: round((Math.abs(slopeLeft - slopeRight) / slopeCombined) * 100, 2),
    legs: mapVals(legs, (v) => round(v, 2)),
    legSpreadPct: round(((Math.max(...legVals) - Math.min(...legVals)) / meanLeg) * 100, 2),
    meanLeg: round(meanLeg, 2),
  };
}

/**
 * Validate a reconstruction with a fifth point BB didn't get a vote on.
 *
 * A 4-point fit is exact by construction -- four correspondences always
 * produce a transform, so "it fit perfectly" proves nothing. BB's field may
 * well be a hand-drawn background that obeys no consistent projection, and the
 * only way to find out is to predict a point we didn't fit and see if we're
 * right. The pitching rubber sits at (0.4753, 0.4753) in unit-square diamond
 * coords (60.5ft of 127.28ft along the home->2B diagonal).
 *
 * Residual > ~4px => the field is hand-authored; abandon coordinate
 * reconstruction and match the silhouette instead.
 */
export function validateWithFifthPoint({ home, first, third, observed, uv = [0.4753, 0.4753] }) {
  const [u, v] = uv;
  // Affine basis: home + u*(first-home) + v*(third-home).
  const predicted = {
    x: home.x + u * (first.x - home.x) + v * (third.x - home.x),
    y: home.y + u * (first.y - home.y) + v * (third.y - home.y),
  };
  const residual = Math.hypot(predicted.x - observed.x, predicted.y - observed.y);
  return {
    predicted: { x: round(predicted.x, 2), y: round(predicted.y, 2) },
    observed,
    residual: round(residual, 2),
    trustworthy: residual <= 4,
  };
}

/**
 * Per-channel MEDIAN of a flat colour patch.
 *
 * Median, not mean: the ball, chalk lines and sprite edges that stray into a
 * sample region are exactly the outliers a mean would smear into the answer.
 * `pixels` is flat RGBA (or RGB) as from getImageData / a raw frame.
 */
export function medianColor(pixels, { stride = 4 } = {}) {
  const r = [];
  const g = [];
  const b = [];
  for (let i = 0; i + 2 < pixels.length; i += stride) {
    r.push(pixels[i]);
    g.push(pixels[i + 1]);
    b.push(pixels[i + 2]);
  }
  const R = Math.round(median(r));
  const G = Math.round(median(g));
  const B = Math.round(median(b));
  return { r: R, g: G, b: B, hex: rgbToHex(R, G, B), n: r.length };
}

/** Flatness check: a patch that isn't flat isn't a colour sample, it's a mix. */
export function patchFlatness(pixels, { stride = 4 } = {}) {
  const lum = [];
  for (let i = 0; i + 2 < pixels.length; i += stride) {
    lum.push((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3);
  }
  const m = median(lum);
  return {
    madLuminance: round(mad(lum), 2),
    range: round(Math.max(...lum) - Math.min(...lum), 2),
    // A genuinely flat 8-bit region of an unfiltered 640x480 render should sit
    // near zero. Anything above this means a scaler/filter is still on, and
    // every colour taken from this source would be wrong.
    isFlat: mad(lum) <= 2,
    medianLuminance: round(m, 2),
  };
}

// --- Conversion to our units ------------------------------------------------

/**
 * The whole point. A measured BB duration becomes a ratio against the BB
 * anchor (home->1B), and that ratio then sets our constant. TEMPO, pixel
 * scale, and frame rate all cancel -- which is why this cannot be poisoned by
 * BB being a different resolution than us.
 */
export function ratioToAnchor(measuredMs, anchorMs) {
  return measuredMs / anchorMs;
}

/**
 * Sim time <-> real time.
 *
 * CORRECTION (2026-07-23). This comment used to assert that liveplay.ts
 * accumulates `s.elapsed += dtMs` on a TEMPO-scaled delta. It does not.
 * GameScene passes Phaser's raw frame `delta` straight into stepLivePlay, and
 * `grep -rn tempo src/` is empty -- there is no tempo dial anywhere in the
 * codebase. So TAU IS 1 TODAY and both of these are the identity function.
 *
 * They are kept, and every converter still routes through them, because the
 * moment a tempo dial is introduced every ratio in measures.json silently
 * becomes wrong unless the conversion is already threaded. conformance.test.js
 * passes `tempo: 1` explicitly for the same reason: adding a dial breaks the
 * test loudly instead of invalidating the records quietly.
 *
 * The defect the old comment blamed on clock confusion is real and survives the
 * correction, because it was always a RATIO claim: our flies hang 42-106%
 * longer relative to the home->1B run than BB's do. Both sides of a ratio scale
 * with tau, so tau cancels and the finding is untouched.
 */
export function simMsForRealMs(realMs, tempo) {
  return realMs * tempo;
}

export function realMsForSimMs(simMs, tempo) {
  return simMs / tempo;
}

/**
 * Solve a LIVE.* sim-time constant from a measured BB ratio.
 *
 *   target_real = ratio * our_anchor_real      (match BB's proportion)
 *   target_sim  = target_real * tau            (back into sim time)
 */
export function simConstantFromRatio({ ratioToAnchor: ratio, ourAnchorRealMs, tempo }) {
  return round(simMsForRealMs(ratio * ourAnchorRealMs, tempo), 0);
}

/**
 * Real-world milliseconds for one leg of our basepath at a given speed/tempo.
 *
 * Deliberately UNROUNDED. This feeds ratio math, and a ratio built from two
 * rounded operands is no longer tempo-invariant -- the invariance is the one
 * property that makes this whole approach immune to TEMPO and to BB being a
 * different resolution, so it must not be quantized away for cosmetics. Round
 * at the point of display, never in the math. (A test asserts the invariance.)
 */
export function ourLegRealMs({ basepathPx, speedPxPerSec, tempo }) {
  return (basepathPx / (speedPxPerSec * tempo)) * 1000;
}

// --- helpers ---------------------------------------------------------------

function round(x, dp) {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

function mapVals(o, f) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

export { round };
