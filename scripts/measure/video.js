// ---------------------------------------------------------------------------
// BB2001 measurement — the I/O layer (ffmpeg/ffprobe).
//
// The other half of the instrument. lib.js is pure math with no I/O; this file
// is the part that touches files and shells out. Everything here returns plain
// numbers/arrays that lib.js then reduces, so the two stay independently
// testable.
//
// SOURCE-AGNOSTIC BY DESIGN. It ingests frames, not a game — a YouTube capture,
// a lossless local recording, or a synthetic clip all enter the same way. That
// is deliberate: the measurement source is a policy question that has changed
// twice already, and none of it should reach this layer.
//
// Two things this file refuses to do, because both are how measurement lies:
//
//  1. It never assumes a frame rate. The container rate and the DISTINCT-frame
//     rate are reported separately, because a 60fps capture of a game rendering
//     at 15fps is three-quarters duplicate frames. Trusting the container there
//     would quietly claim 4x the timing precision we actually have.
//
//  2. It never returns a measurement without the frame period that produced it,
//     so lib.js can floor the error bars at one frame. Every timestamp carries
//     +-1 frame of quantization whether or not anyone accounts for it.
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';

const FFMPEG = 'ffmpeg';
const FFPROBE = 'ffprobe';

/**
 * Build the `crop=w:h:x:y` filter, or null for no crop.
 *
 * WHY EVERY ENTRY POINT TAKES A CROP. A local capture is a recording of a
 * SCREEN, not of a game: the emulator window occupies some rectangle and the
 * desktop occupies the rest. Measured on the real session capture, the game
 * fills 1920x1440 of a 3024x1964 frame -- 45.3% of the pixels. That fraction
 * silently ruins the two things this file exists to do:
 *
 *   - ffmpeg's `scene` metric is frame-GLOBAL, so a full hard cut scores ~0.45
 *     instead of ~1.0. The default 0.3 threshold then demands more than twice a
 *     real cut, and findCuts reported 5 cuts across 450 seconds of a capture
 *     that visibly contains dozens of plays.
 *   - every coordinate comes back in desktop pixels, which are not the game's
 *     pixels and are not comparable to anything in scripts/measures.json.
 *
 * Cropping first fixes both, and it means the pipeline only ever DECODES the
 * emulator window -- whatever else was on the desktop is never read.
 */
function cropFilter(crop) {
  if (!crop) return null;
  return `crop=${Math.round(crop.w)}:${Math.round(crop.h)}:${Math.round(crop.x)}:${Math.round(crop.y)}`;
}

/** Compose crop -> scale into one -vf argument list (either may be absent). */
function filterChain({ crop, w, h, scale }) {
  const chain = [];
  const c = cropFilter(crop);
  if (c) chain.push(c);
  // NEAREST always: any smoothing filter invents intermediate colours, and this
  // same path feeds colour sampling.
  if (scale !== 1) chain.push(`scale=${w}:${h}:flags=neighbor`);
  return chain.length ? ['-vf', chain.join(',')] : [];
}

/** Is ffmpeg available? Tests skip rather than fail when it isn't. */
export function hasFfmpeg() {
  try {
    return spawnSync(FFPROBE, ['-version'], { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
}

function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { maxBuffer: 1 << 30, ...opts });
  if (r.error) throw new Error(`${bin} failed to start: ${r.error.message}`);
  if (r.status !== 0) {
    const err = (r.stderr || Buffer.alloc(0)).toString().trim().split('\n').slice(-4).join('\n');
    throw new Error(`${bin} exited ${r.status}\n  args: ${args.join(' ')}\n  ${err}`);
  }
  return r;
}

/**
 * Container-level facts. `containerFps` is what the file CLAIMS; whether the
 * content actually changes that often is a separate question — see
 * distinctFrameRate, and do not conflate them.
 */
export function probe(path) {
  const r = run(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,pix_fmt,nb_frames,duration',
    '-show_entries', 'format=duration',
    '-of', 'json',
    path,
  ], { encoding: 'utf8' });

  const j = JSON.parse(r.stdout);
  const s = (j.streams && j.streams[0]) || {};
  const ratio = (v) => {
    if (!v || v === '0/0') return NaN;
    const [n, d] = String(v).split('/').map(Number);
    return d ? n / d : NaN;
  };
  const containerFps = ratio(s.r_frame_rate);
  const duration = Number(s.duration) || Number(j.format?.duration) || NaN;

  return {
    width: Number(s.width),
    height: Number(s.height),
    pixFmt: s.pix_fmt,
    containerFps,
    avgFps: ratio(s.avg_frame_rate),
    containerFramePeriodMs: Number.isFinite(containerFps) ? 1000 / containerFps : NaN,
    duration,
    nbFrames: Number(s.nb_frames) || null,
  };
}

/**
 * Decode `count` consecutive frames starting at `startSec` as raw RGB24.
 *
 * `-ss` goes BEFORE `-i` so ffmpeg seeks by keyframe then decodes forward,
 * which is both fast and accurate on modern builds. Frames come back as one
 * flat buffer and are sliced by geometry — no PNG round-trip, which would cost
 * time and (with the wrong flags) risk a colour transform we'd then measure.
 *
 * `scale` divides both dimensions using NEAREST-neighbour: any smoothing filter
 * would invent intermediate colours, and this same path feeds colour sampling.
 *
 * `crop` (see cropFilter) is applied BEFORE the scale, so the returned width and
 * height describe the cropped region and every coordinate downstream is in that
 * region's own pixel space -- game pixels, not desktop pixels.
 */
export function readFrames(path, { startSec = 0, count = 1, scale = 1, crop = null, info = null } = {}) {
  const meta = info || probe(path);
  const srcW = crop ? Math.round(crop.w) : meta.width;
  const srcH = crop ? Math.round(crop.h) : meta.height;
  const w = Math.max(1, Math.floor(srcW / scale));
  const h = Math.max(1, Math.floor(srcH / scale));

  const args = ['-v', 'error', '-ss', String(startSec), '-i', path, '-frames:v', String(count)];
  args.push(...filterChain({ crop, w, h, scale }));
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');

  const buf = run(FFMPEG, args).stdout;
  const frameBytes = w * h * 3;
  const n = Math.floor(buf.length / frameBytes);
  const frames = [];
  for (let i = 0; i < n; i++) frames.push(buf.subarray(i * frameBytes, (i + 1) * frameBytes));
  return { frames, width: w, height: h, frameBytes, meta, crop };
}

/** Exact-equality frame comparison, cheap enough to run over a whole window. */
function framesIdentical(a, b) {
  return a.length === b.length && a.equals(b);
}

/**
 * How often does the PICTURE actually change?
 *
 * The single most important guard in this file. A capture encoded at 60fps
 * whose source renders at 15 contains 4 identical frames per update; timing
 * anything against the container rate would overstate our resolution 4x and
 * every derived constant would inherit that false precision.
 *
 * Measure over a HIGH-MOTION window — a still menu legitimately has no distinct
 * frames and would report a nonsense rate.
 */
export function distinctFrameRate(path, { startSec = 0, count = 60, scale = 4 } = {}) {
  const { frames, meta } = readFrames(path, { startSec, count, scale });
  if (frames.length < 2) {
    return { distinctFps: NaN, containerFps: meta.containerFps, samples: frames.length };
  }

  let changes = 0;
  const runLengths = [];
  let runLen = 1;
  for (let i = 1; i < frames.length; i++) {
    if (framesIdentical(frames[i], frames[i - 1])) {
      runLen++;
    } else {
      changes++;
      runLengths.push(runLen);
      runLen = 1;
    }
  }
  runLengths.push(runLen);

  const spanSec = (frames.length - 1) / meta.containerFps;
  const distinctFps = spanSec > 0 ? changes / spanSec : NaN;
  // Duplication factor is the honest headline: 1 means every frame is new.
  const dupFactor = distinctFps > 0 ? meta.containerFps / distinctFps : Infinity;

  return {
    containerFps: meta.containerFps,
    distinctFps: Number.isFinite(distinctFps) ? Math.round(distinctFps * 100) / 100 : NaN,
    dupFactor: Number.isFinite(dupFactor) ? Math.round(dupFactor * 100) / 100 : Infinity,
    changes,
    samples: frames.length,
    // The frame period measurement should actually use. Falls back to the
    // container rate when the window was too static to judge.
    effectiveFramePeriodMs: distinctFps > 0 ? 1000 / distinctFps : 1000 / meta.containerFps,
    medianRunLength: runLengths.sort((a, b) => a - b)[Math.floor(runLengths.length / 2)],
  };
}

/** Clamp a region of interest to the frame and default it to the whole frame. */
function normRoi(roi, w, h) {
  if (!roi) return { x: 0, y: 0, w, h };
  const x = Math.max(0, Math.min(w - 1, Math.round(roi.x)));
  const y = Math.max(0, Math.min(h - 1, Math.round(roi.y)));
  return {
    x,
    y,
    w: Math.max(1, Math.min(w - x, Math.round(roi.w))),
    h: Math.max(1, Math.min(h - y, Math.round(roi.h))),
  };
}

/**
 * Per-frame mean-absolute-difference over a region, plus an intensity-weighted
 * centroid of what moved.
 *
 * The centroid is the real payload. A MAD series says *when* something changed;
 * the centroid says *where*, which is what turns "eyeball the frame the ball
 * crosses the plate" into "read the x/y track and difference it". Weighting by
 * change intensity keeps a bright fast ball from being dragged toward a large
 * dim background shimmer.
 *
 * Feed the result to lib.js `findSpike` for onset/peak detection.
 */
export function diffSeries(path, { startSec = 0, count = 30, roi = null, scale = 1, crop = null, threshold = 12, sub = 1 } = {}) {
  const { frames, width, height, meta } = readFrames(path, { startSec, count, scale, crop });
  const r = normRoi(roi, width, height);
  const fps = meta.containerFps;
  const series = [];
  let prev = null;

  for (let f = 0; f < frames.length; f++) {
    const cur = frames[f];
    let sum = 0;
    let n = 0;
    let maxd = 0;
    let hit = 0;
    let sx = 0;
    let sy = 0;
    let sw = 0;

    if (prev) {
      for (let y = r.y; y < r.y + r.h; y += sub) {
        for (let x = r.x; x < r.x + r.w; x += sub) {
          const p = (y * width + x) * 3;
          const e =
            (Math.abs(cur[p] - prev[p]) +
              Math.abs(cur[p + 1] - prev[p + 1]) +
              Math.abs(cur[p + 2] - prev[p + 2])) /
            3;
          sum += e;
          n++;
          if (e > maxd) maxd = e;
          if (e > threshold) {
            hit++;
            sx += x * e;
            sy += y * e;
            sw += e;
          }
        }
      }
    }

    series.push({
      i: f,
      // Time of this frame in the SOURCE, so a spike index maps straight back
      // to a timestamp someone else can re-check.
      t: Math.round((startSec + f / fps) * 10000) / 10000,
      mad: n ? Math.round((sum / n) * 1000) / 1000 : 0,
      maxd: Math.round(maxd),
      changed: n ? Math.round((hit / n) * 10000) / 10000 : 0,
      // Centroid back in FULL-resolution pixels, so tracks are comparable
      // across different `scale` settings. With a crop in play these are
      // CROPPED-frame coordinates -- i.e. game pixels, which is the space every
      // record in scripts/measures.json is written in.
      cx: sw ? Math.round((sx / sw) * scale) : null,
      cy: sw ? Math.round((sy / sw) * scale) : null,
    });
    prev = cur;
  }

  return { series, roi: r, width, height, fps, framePeriodMs: 1000 / fps, startSec, scale, crop };
}

/**
 * Pixels of a rectangular patch at one timestamp, as flat RGB — feed to lib.js
 * `medianColor` / `patchFlatness`.
 *
 * Scale is forced to 1 and no filter is applied: a resampled pixel is a blend
 * of its neighbours, and a blend is not a colour the game ever drew.
 *
 * COLOUR ACCURACY CEILING -- measured, not assumed (see video.test.js):
 * feeding a known flat #5abe5a through a LOSSLESS ffv1 clip and reading it
 * back gives 88/189/89 via the normal YUV path (off by 2) and 90/190/91 even
 * through a forced-RGB path (off by 1). The error is the YUV<->RGB conversion
 * inherent to video as a medium, NOT the codec and NOT this pipeline -- it
 * survives lossless encoding.
 *
 * So: video colour is good to about +-2 per channel. Fine for identifying a
 * hue or checking a palette relationship; NOT a source of exact palette values.
 * Exact values need a raw-framebuffer screenshot (ScummVM's screenshot key
 * writes the 640x480 buffer straight out, bypassing YUV entirely) -- which is
 * why docs/research/bb2001-capture-setup.md splits colour and timing onto
 * different instruments. A real YouTube capture is worse still: 4:2:0 chroma
 * subsampling throws away three-quarters of the colour resolution before any
 * of this.
 */
export function samplePatch(path, { atSec = 0, rect = null, crop = null } = {}) {
  const { frames, width, height } = readFrames(path, { startSec: atSec, count: 1, scale: 1, crop });
  if (!frames.length) throw new Error(`no frame decoded at t=${atSec} in ${path}`);
  const r = normRoi(rect, width, height);
  const out = new Uint8Array(r.w * r.h * 3);
  let o = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const p = (y * width + x) * 3;
      out[o++] = frames[0][p];
      out[o++] = frames[0][p + 1];
      out[o++] = frames[0][p + 2];
    }
  }
  return { pixels: out, rect: r, stride: 3 };
}

/**
 * Find hard view cuts — and therefore, in this game, the PLAYS.
 *
 * This is the tool that makes a long capture tractable. Backyard Baseball cuts
 * INSTANTLY from the behind-plate pitching view to the wide field view the
 * moment a ball is put in play (frame-measured: no transition effect at all).
 * So a scene-cut list IS a play index: "here are the 40 plays and when they
 * start", instead of scrubbing 47 minutes hoping to stumble on a fly ball.
 *
 * Uses ffmpeg's own `scene` metric rather than a hand-rolled frame differ —
 * it is battle-tested, runs at decode speed, and needs no frame buffering.
 * `showinfo` reports on STDERR even on success, so this deliberately does not
 * use run() (which only surfaces stderr on failure).
 *
 * `threshold` is the scene score 0..1. ~0.3 catches hard cuts while ignoring
 * ordinary motion; lower it to catch softer transitions, raise it if ordinary
 * play is registering as cuts. Tune against a known clip, don't guess.
 *
 * PASS A CROP FOR ANY SCREEN CAPTURE. The scene metric is computed over the
 * WHOLE frame, so letterboxing or desktop around the game divides every score
 * by the game's share of the frame. On the real session capture (45.3%
 * coverage) an uncropped run at the default threshold found 5 cuts in 450
 * seconds; the game rect is what should be scored, not the desktop it sits on.
 * `scale` additionally downsamples before scoring -- cuts are a whole-frame
 * event, so a quarter-size image detects them just as well and far faster.
 */
export function findCuts(path, { threshold = 0.3, startSec = 0, durationSec = null, crop = null, scale = 1 } = {}) {
  const args = ['-hide_banner'];
  // -ss BEFORE -i seeks by keyframe (fast). Output timestamps then restart near
  // zero, so startSec is added back below — getting this wrong silently shifts
  // every reported time by the seek offset.
  if (startSec) args.push('-ss', String(startSec));
  // -t goes BEFORE -i so it bounds the INPUT read. As an output option it
  // bounds output timestamps instead, and `select` drops frames while keeping
  // their original pts -- so ffmpeg reads far past the requested window looking
  // for output it will never produce. Measured: a `durationSec: 330` request
  // decoded to 451s. On a 43GB source that is minutes of wasted decode, and
  // worse, it reads material the caller deliberately excluded.
  if (durationSec) args.push('-t', String(durationSec));
  args.push('-i', path);
  const info = crop || scale !== 1 ? probe(path) : null;
  const srcW = crop ? Math.round(crop.w) : info?.width;
  const srcH = crop ? Math.round(crop.h) : info?.height;
  const pre = filterChain({
    crop,
    scale,
    w: Math.max(1, Math.floor(srcW / scale)),
    h: Math.max(1, Math.floor(srcH / scale)),
  });
  // filterChain returns ['-vf', chain]; the select/showinfo pair has to join
  // that same chain, not become a second -vf (ffmpeg keeps only the last one).
  const chain = pre.length ? `${pre[1]},` : '';
  args.push('-vf', `${chain}select='gt(scene,${threshold})',showinfo`, '-an', '-f', 'null', '-');

  const r = spawnSync(FFMPEG, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`ffmpeg failed to start: ${r.error.message}`);
  const stderr = r.stderr || '';
  if (r.status !== 0) {
    throw new Error(`ffmpeg exited ${r.status}\n  ${stderr.trim().split('\n').slice(-4).join('\n')}`);
  }
  const cuts = [...stderr.matchAll(/pts_time:([0-9.]+)/g)]
    .map((m) => Math.round((Number(m[1]) + startSec) * 1000) / 1000)
    .filter((t) => Number.isFinite(t));

  return {
    threshold,
    cuts,
    count: cuts.length,
    // Gaps between cuts are how long each view segment lasted. In this game a
    // short wide segment is a quick out; a long one is a ball in the gap.
    gaps: cuts.slice(1).map((t, i) => Math.round((t - cuts[i]) * 1000) / 1000),
  };
}

/**
 * Tile N consecutive frames into one PNG so a human can judge many frames from
 * a single look instead of one screenshot per frame.
 *
 * Deliberately UNLABELLED: burning timestamps in needs drawtext and a font
 * path, which is a portability failure waiting to happen on someone else's
 * machine. The index->timestamp map is returned instead, and reading tiles
 * left-to-right, top-to-bottom against it is unambiguous.
 */
export function contactSheet(path, { startSec = 0, count = 16, cols = 4, scale = 2, crop = null, stepFrames = 1, out }) {
  if (!out) throw new Error('contactSheet requires an `out` path');
  const info = probe(path);
  const srcW = crop ? Math.round(crop.w) : info.width;
  const srcH = crop ? Math.round(crop.h) : info.height;
  const w = Math.floor(srcW / scale);
  const h = Math.floor(srcH / scale);

  const chain = [];
  if (crop) chain.push(cropFilter(crop));
  // Thinning BEFORE the scale keeps the decode cheap. A sheet of consecutive
  // frames off a 60fps capture spans a third of a second and shows one moment
  // six times over; `stepFrames` is what makes a sheet cover a whole play.
  if (stepFrames > 1) chain.push(`select='not(mod(n\\,${Math.round(stepFrames)}))'`);
  chain.push(`scale=${w}:${h}:flags=neighbor`);
  chain.push(`tile=${cols}x${Math.ceil(count / cols)}`);

  // `tile` consumes cols*rows input frames and emits ONE image, so the output
  // frame count is 1 -- asking for `count` here makes the image2 muxer try to
  // write frames it will never receive and fail with EINVAL.
  run(FFMPEG, [
    '-v', 'error', '-y',
    '-ss', String(startSec),
    '-i', path,
    '-vf', chain.join(','),
    // select drops frames, so vsync must not try to restore the original
    // cadence by duplicating them back in -- that would make every tile
    // identical to its neighbour and quietly undo the thinning.
    '-fps_mode', 'passthrough',
    '-frames:v', '1',
    out,
  ]);

  const fps = info.containerFps;
  const tiles = Array.from({ length: count }, (_, i) => ({
    tile: i,
    row: Math.floor(i / cols),
    col: i % cols,
    t: Math.round((startSec + (i * stepFrames) / fps) * 10000) / 10000,
  }));
  return { out, cols, rows: Math.ceil(count / cols), tileW: w, tileH: h, tiles, fps, stepFrames };
}

/**
 * Where is the emulator window in this screen capture?
 *
 * Derived from a HARD CUT rather than from colour. Looking for "the non-black
 * region" fails the moment the desktop behind the window isn't black (it wasn't
 * -- the real capture's surround is wallpaper). But at an instant view change
 * the game repaints EVERY pixel it owns and nothing outside it moves, so the
 * bounding box of the largest inter-frame change is exactly the window.
 *
 * Give it a timestamp where a cut is known to occur. It returns the rect plus
 * the fraction of the frame the game occupies -- which is the number that
 * decides findCuts' threshold, so it is reported rather than left implicit.
 */
export function detectGameRect(path, { atSec = 0, count = 12, scale = 2, threshold = 60 } = {}) {
  const { frames, width, height, meta } = readFrames(path, { startSec: atSec, count, scale });
  let best = null;

  for (let i = 1; i < frames.length; i++) {
    const cur = frames[i];
    const prev = frames[i - 1];
    let x0 = width;
    let x1 = -1;
    let y0 = height;
    let y1 = -1;
    let n = 0;
    for (let p = 0, q = 0; p < width * height; p++, q += 3) {
      const e =
        Math.abs(cur[q] - prev[q]) + Math.abs(cur[q + 1] - prev[q + 1]) + Math.abs(cur[q + 2] - prev[q + 2]);
      if (e <= threshold) continue;
      n++;
      const x = p % width;
      const y = (p / width) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (n && (!best || n > best.changed)) {
      best = {
        x: x0 * scale,
        y: y0 * scale,
        w: (x1 - x0 + 1) * scale,
        h: (y1 - y0 + 1) * scale,
        changed: n,
        atSec: Math.round((atSec + i / meta.containerFps) * 10000) / 10000,
      };
    }
  }
  if (!best) return null;

  const frameArea = meta.width * meta.height;
  return {
    ...best,
    aspect: Math.round((best.w / best.h) * 1000) / 1000,
    // The scene metric is frame-global, so this fraction is the factor every
    // uncropped cut score is divided by. See cropFilter.
    frameCoverage: Math.round(((best.w * best.h) / frameArea) * 10000) / 10000,
  };
}

/**
 * Does this frame look like an INTEGER NEAREST-NEIGHBOUR UPSCALE?
 *
 * The structural fingerprint of an emulator: ScummVM blits a 640x480 buffer at
 * an integer factor, so inside its window every group of `scale` consecutive
 * rows is pixel-identical. Native desktop content is not built that way.
 *
 * Rows, deliberately, not columns. The capture is yuv422p, which subsamples
 * chroma HORIZONTALLY -- the 2-pixel chroma window does not align with a 3-pixel
 * block, so exact column equality breaks at block boundaries. Vertical
 * resolution is untouched by 4:2:2, so row triples survive the round trip
 * exactly.
 *
 * The subtle part: only samples where the image actually VARIES vertically are
 * counted. A flat region trivially passes the row-triple test, so a solid-colour
 * desktop window would score a perfect 1.0 and be mistaken for the game.
 * Scoring only the varying samples means flat content contributes no evidence
 * either way -- and when a frame yields too few of them, the honest answer is
 * `unknown`, not a guess.
 */
export function blitScore(frame, width, height, { scale = 3, colStride = 7 } = {}) {
  let tested = 0;
  let matched = 0;
  const groups = Math.floor(height / scale) - 1;

  for (let g = 0; g < groups; g++) {
    const y = g * scale;
    for (let x = 0; x < width; x += colStride) {
      const p = (y * width + x) * 3;
      const nxt = ((y + scale) * width + x) * 3;
      // Same colour as the next group down => no vertical variation here, so
      // this sample cannot distinguish a blit from anything else. Skip it.
      if (frame[p] === frame[nxt] && frame[p + 1] === frame[nxt + 1] && frame[p + 2] === frame[nxt + 2]) {
        continue;
      }
      tested++;
      let ok = true;
      for (let d = 1; d < scale && ok; d++) {
        const q = ((y + d) * width + x) * 3;
        ok = frame[q] === frame[p] && frame[q + 1] === frame[p + 1] && frame[q + 2] === frame[p + 2];
      }
      if (ok) matched++;
    }
  }

  return { score: tested ? matched / tested : NaN, tested, matched };
}

/**
 * Split a long capture into runs of "the emulator is on screen" and "something
 * else is".
 *
 * WHY THIS EXISTS, and why it works the way it does. A screen-capture session
 * is not all game: there is setup at the front, and there can be ordinary
 * desktop use in the middle. Measurement must not wander into that material.
 * The obvious approach -- look at the frames and see what they are -- means
 * reading someone's screen.
 *
 * blitScore avoids that entirely. It answers "is this an integer upscale of a
 * small framebuffer?" from PIXEL STRUCTURE ALONE. It never needs to know what
 * the frame depicts, and because the read is cropped to the emulator rect, the
 * rest of the desktop is not even decoded. The result is a segment map that can
 * be reviewed and confirmed before anything is measured.
 *
 * `unknown` samples (too flat to judge -- a fade, a black screen) inherit the
 * previous known classification rather than cutting a run in half.
 */
export function gameSegments(
  path,
  { rect, scale = 3, stepSec = 2, startSec = 0, endSec = null, minScore = 0.9, colStride = 7, minTested = 200, onSample = null } = {}
) {
  if (!rect) throw new Error('gameSegments requires a `rect` (see detectGameRect)');
  const meta = probe(path);
  const stop = endSec == null ? meta.duration : Math.min(endSec, meta.duration);
  const samples = [];

  for (let t = startSec; t < stop; t += stepSec) {
    const { frames, width, height } = readFrames(path, { startSec: t, count: 1, crop: rect, info: meta });
    if (!frames.length) break;
    const s = blitScore(frames[0], width, height, { scale, colStride });
    const kind = !Number.isFinite(s.score) || s.tested < minTested ? 'unknown' : s.score >= minScore ? 'game' : 'other';
    const sample = { t: Math.round(t * 1000) / 1000, kind, score: Number.isFinite(s.score) ? Math.round(s.score * 1000) / 1000 : null, tested: s.tested };
    samples.push(sample);
    if (onSample) onSample(sample);
  }

  // Carry the last known kind across `unknown` gaps, then run-length encode.
  let last = null;
  for (const s of samples) {
    if (s.kind === 'unknown') s.resolved = last ?? 'unknown';
    else s.resolved = last = s.kind;
  }

  const segments = [];
  for (const s of samples) {
    const tail = segments[segments.length - 1];
    if (tail && tail.kind === s.resolved) tail.t1 = s.t + stepSec;
    else segments.push({ kind: s.resolved, t0: s.t, t1: s.t + stepSec });
  }
  for (const seg of segments) {
    seg.t1 = Math.round(Math.min(seg.t1, stop) * 1000) / 1000;
    seg.durationSec = Math.round((seg.t1 - seg.t0) * 1000) / 1000;
  }

  return { segments, samples, rect, stepSec, minScore, duration: meta.duration };
}
