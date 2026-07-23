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
 */
export function readFrames(path, { startSec = 0, count = 1, scale = 1, info = null } = {}) {
  const meta = info || probe(path);
  const w = Math.max(1, Math.floor(meta.width / scale));
  const h = Math.max(1, Math.floor(meta.height / scale));

  const args = ['-v', 'error', '-ss', String(startSec), '-i', path, '-frames:v', String(count)];
  if (scale !== 1) args.push('-vf', `scale=${w}:${h}:flags=neighbor`);
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');

  const buf = run(FFMPEG, args).stdout;
  const frameBytes = w * h * 3;
  const n = Math.floor(buf.length / frameBytes);
  const frames = [];
  for (let i = 0; i < n; i++) frames.push(buf.subarray(i * frameBytes, (i + 1) * frameBytes));
  return { frames, width: w, height: h, frameBytes, meta };
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
export function diffSeries(path, { startSec = 0, count = 30, roi = null, scale = 1, threshold = 12, sub = 1 } = {}) {
  const { frames, width, height, meta } = readFrames(path, { startSec, count, scale });
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
      // Centroid back in FULL-resolution source pixels, so tracks are
      // comparable across different `scale` settings.
      cx: sw ? Math.round((sx / sw) * scale) : null,
      cy: sw ? Math.round((sy / sw) * scale) : null,
    });
    prev = cur;
  }

  return { series, roi: r, width, height, fps, framePeriodMs: 1000 / fps, startSec, scale };
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
export function samplePatch(path, { atSec = 0, rect = null } = {}) {
  const { frames, width, height } = readFrames(path, { startSec: atSec, count: 1, scale: 1 });
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
 * Tile N consecutive frames into one PNG so a human can judge many frames from
 * a single look instead of one screenshot per frame.
 *
 * Deliberately UNLABELLED: burning timestamps in needs drawtext and a font
 * path, which is a portability failure waiting to happen on someone else's
 * machine. The index->timestamp map is returned instead, and reading tiles
 * left-to-right, top-to-bottom against it is unambiguous.
 */
export function contactSheet(path, { startSec = 0, count = 16, cols = 4, scale = 2, out }) {
  if (!out) throw new Error('contactSheet requires an `out` path');
  const info = probe(path);
  const w = Math.floor(info.width / scale);
  const h = Math.floor(info.height / scale);

  // `tile` consumes cols*rows input frames and emits ONE image, so the output
  // frame count is 1 -- asking for `count` here makes the image2 muxer try to
  // write frames it will never receive and fail with EINVAL.
  run(FFMPEG, [
    '-v', 'error', '-y',
    '-ss', String(startSec),
    '-i', path,
    '-vf', `scale=${w}:${h}:flags=neighbor,tile=${cols}x${Math.ceil(count / cols)}`,
    '-frames:v', '1',
    out,
  ]);

  const fps = info.containerFps;
  const tiles = Array.from({ length: count }, (_, i) => ({
    tile: i,
    row: Math.floor(i / cols),
    col: i % cols,
    t: Math.round((startSec + i / fps) * 10000) / 10000,
  }));
  return { out, cols, rows: Math.ceil(count / cols), tileW: w, tileH: h, tiles, fps };
}
