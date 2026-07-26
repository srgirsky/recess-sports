// ---------------------------------------------------------------------------
// Synthetic ground-truth validation for the measurement instrument.
//
// Every clip here is generated so that WE ALREADY KNOW THE ANSWER, and the test
// asserts the pipeline recovers it. That is the entire point: an unvalidated
// measuring instrument produces confident garbage, and confident garbage is
// exactly what started this project (a basepath number nobody checked, trusted
// for months, that left the game ~40% too fast).
//
// If these fail, no number measured from real footage can be believed.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  probe,
  readFrames,
  distinctFrameRate,
  diffSeries,
  samplePatch,
  contactSheet,
  findCuts,
  detectGameRect,
  blitScore,
  gameSegments,
  temporalMedian,
  foregroundBlobs,
  clockFidelity,
  pitchFidelity,
  hasFfmpeg,
} from './video.js';
import { findSpike, medianColor, patchFlatness } from './lib.js';

const FFMPEG_OK = hasFfmpeg();
const d = FFMPEG_OK ? describe : describe.skip;

let dir;
beforeAll(() => {
  if (FFMPEG_OK) dir = mkdtempSync(join(tmpdir(), 'bbmeasure-'));
});
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function ff(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error('ffmpeg gen failed: ' + r.stderr.toString().slice(-400));
}

// Lossless ffv1 in mkv — the same format the real capture guide specifies, so
// these tests exercise the actual decode path rather than a friendlier one.
const LOSSLESS = ['-c:v', 'ffv1', '-level', '3'];

d('probe', () => {
  it('reports raster and container rate', () => {
    const f = join(dir, 'probe.mkv');
    ff(['-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=1:r=30', ...LOSSLESS, f]);
    const p = probe(f);
    expect(p.width).toBe(320);
    expect(p.height).toBe(240);
    expect(p.containerFps).toBeCloseTo(30, 1);
    expect(p.containerFramePeriodMs).toBeCloseTo(33.33, 1);
  });
});

d('distinctFrameRate — the duplicate-frame trap', () => {
  it('reports 15 distinct fps for a 60fps file whose content updates at 15', () => {
    // THE CRITICAL CASE. A 60fps capture of a game rendering at 15fps holds
    // four identical frames per update. Trusting the container rate here would
    // claim 4x the timing precision we actually have, and every constant
    // derived from it would inherit that false confidence.
    const f = join(dir, 'dup.mkv');
    ff([
      '-f', 'lavfi',
      '-i', 'testsrc=s=320x240:d=2:r=15',
      '-vf', 'fps=60',
      '-r', '60',
      ...LOSSLESS, f,
    ]);

    const p = probe(f);
    expect(p.containerFps).toBeCloseTo(60, 0);

    const r = distinctFrameRate(f, { startSec: 0.2, count: 60, scale: 2 });
    expect(r.containerFps).toBeCloseTo(60, 0);
    expect(r.distinctFps).toBeGreaterThan(12);
    expect(r.distinctFps).toBeLessThan(18);
    // ~4 container frames per real update.
    expect(r.dupFactor).toBeGreaterThan(3);
    expect(r.dupFactor).toBeLessThan(5);
    // The period measurement should use is the DISTINCT one (~66ms), not 16.7.
    expect(r.effectiveFramePeriodMs).toBeGreaterThan(50);
  });

  it('reports no duplication when every frame is genuinely new', () => {
    const f = join(dir, 'nodup.mkv');
    ff(['-f', 'lavfi', '-i', 'testsrc=s=320x240:d=2:r=30', ...LOSSLESS, f]);
    const r = distinctFrameRate(f, { startSec: 0.2, count: 40, scale: 2 });
    expect(r.dupFactor).toBeLessThan(1.3);
    expect(r.distinctFps).toBeGreaterThan(25);
  });
});

d('diffSeries — event onset and motion tracking', () => {
  // Ground truth by construction: black for 1.0s, then a white box appears and
  // moves left-to-right. 30fps, so the onset belongs on the frame at t=1.0.
  const ONSET = 1.0;
  let clip;

  beforeAll(() => {
    clip = join(dir, 'onset.mkv');
    // Uses `overlay`, NOT `drawbox`. drawbox evaluates its x/y expressions once
    // at init, so a `t`-dependent position silently renders a static box --
    // verified empirically (0 bright pixels at every timestamp). overlay
    // re-evaluates per frame, which is what a moving-object fixture needs.
    ff([
      '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=2:r=30',
      '-f', 'lavfi', '-i', 'color=c=white:s=16x16:d=2:r=30',
      '-filter_complex',
      `[0][1]overlay=x='if(gte(t\\,${ONSET})\\, 20+(t-${ONSET})*200\\, -50)':y=100`,
      ...LOSSLESS, clip,
    ]);
  });

  it('puts the onset on the correct frame, within one frame period', () => {
    const r = diffSeries(clip, { startSec: 0.6, count: 30, scale: 1 });
    const hit = findSpike(r.series, { mode: 'first' });
    expect(hit).not.toBeNull();
    // Allow +-1 frame: that is the instrument's real resolution, and claiming
    // better would be exactly the overstatement lib.js floors against.
    expect(Math.abs(hit.t - ONSET)).toBeLessThanOrEqual(r.framePeriodMs / 1000 + 1e-6);
  });

  it('tracks the box moving left to right via the centroid', () => {
    const r = diffSeries(clip, { startSec: 1.05, count: 20, scale: 1 });
    const track = r.series.filter((s) => s.cx != null);
    expect(track.length).toBeGreaterThan(8);
    // Monotone rightward travel is the ground truth we drew.
    expect(track[track.length - 1].cx).toBeGreaterThan(track[0].cx + 40);
    // And it should stay on the row we drew it on (y=100..116).
    const ys = track.map((s) => s.cy);
    expect(Math.min(...ys)).toBeGreaterThan(80);
    expect(Math.max(...ys)).toBeLessThan(140);
  });

  it('recovers the drawn speed of 200 px/s from the centroid track', () => {
    // The real conversion this instrument exists to perform: pixels per second
    // out of a motion track. We drew exactly 200 px/s.
    const r = diffSeries(clip, { startSec: 1.1, count: 20, scale: 1 });
    const track = r.series.filter((s) => s.cx != null);
    const first = track[0];
    const last = track[track.length - 1];
    const pxPerSec = (last.cx - first.cx) / (last.t - first.t);
    expect(pxPerSec).toBeGreaterThan(160);
    expect(pxPerSec).toBeLessThan(240);
  });

  it('finds nothing in a totally static clip', () => {
    const f = join(dir, 'static.mkv');
    ff(['-f', 'lavfi', '-i', 'color=c=#204060:s=160x120:d=1:r=30', ...LOSSLESS, f]);
    const r = diffSeries(f, { startSec: 0.1, count: 12, scale: 1 });
    expect(r.series.every((s) => s.mad < 1)).toBe(true);
    expect(findSpike(r.series, { mode: 'first' })).toBeNull();
  });
});

d('samplePatch — colour recovery and its measured ceiling', () => {
  it('recovers a flat field to within the YUV round-trip error, and calls it flat', () => {
    // Ground truth #5abe5a = (90,190,90). Through a LOSSLESS ffv1 clip this
    // comes back as (88,189,89): off by 2, entirely from the YUV<->RGB
    // conversion, since nothing here is lossy. That is the accuracy ceiling of
    // video as a colour source and it is the reason exact palette values must
    // come from a raw-framebuffer screenshot instead.
    const f = join(dir, 'flat.mkv');
    ff(['-f', 'lavfi', '-i', 'color=c=0x5abe5a:s=128x96:d=1:r=15', ...LOSSLESS, f]);
    const { pixels } = samplePatch(f, { atSec: 0.2, rect: { x: 20, y: 20, w: 40, h: 30 } });
    const c = medianColor(pixels, { stride: 3 });

    expect(Math.abs(c.r - 0x5a)).toBeLessThanOrEqual(2);
    expect(Math.abs(c.g - 0xbe)).toBeLessThanOrEqual(2);
    expect(Math.abs(c.b - 0x5a)).toBeLessThanOrEqual(2);
    // Still perfectly flat: the conversion shifts the whole field together
    // rather than adding noise, so flatness detection stays reliable.
    expect(patchFlatness(pixels, { stride: 3 }).isFlat).toBe(true);
  });

  it('flags a gradient as NOT flat, so a filtered source cannot pass unnoticed', () => {
    // x0/y0/x1/y1 are pinned deliberately. Left unset, the `gradients` source
    // RANDOMISES its direction per invocation, and a direction that ran nearly
    // perpendicular to the sample region produced a near-uniform patch -- this
    // test failed roughly 1 run in 3 before the endpoints were fixed. A
    // non-deterministic fixture in a validation suite is worse than none: it
    // teaches you to ignore the gate.
    const f = join(dir, 'grad.mkv');
    ff([
      '-f', 'lavfi',
      '-i',
      'gradients=s=128x96:d=1:r=15:c0=0x000000:c1=0xffffff:x0=0:y0=0:x1=127:y1=95:nb_colors=2',
      ...LOSSLESS, f,
    ]);
    const { pixels } = samplePatch(f, { atSec: 0.2, rect: { x: 0, y: 0, w: 120, h: 90 } });
    const flat = patchFlatness(pixels, { stride: 3 });
    expect(flat.isFlat).toBe(false);
    // Black-to-white across the patch: the range should be unmistakable, not
    // marginal, or the assertion is riding on the threshold rather than testing it.
    expect(flat.range).toBeGreaterThan(100);
  });
});

d('readFrames', () => {
  it('decodes the requested number of frames at the requested geometry', () => {
    const f = join(dir, 'frames.mkv');
    ff(['-f', 'lavfi', '-i', 'testsrc=s=320x240:d=1:r=30', ...LOSSLESS, f]);
    const r = readFrames(f, { startSec: 0.1, count: 5, scale: 2 });
    expect(r.frames.length).toBe(5);
    expect(r.width).toBe(160);
    expect(r.height).toBe(120);
    expect(r.frames[0].length).toBe(160 * 120 * 3);
  });
});

d('findCuts — the play indexer', () => {
  it('finds hard cuts at the times they were authored', () => {
    // Ground truth by construction: three 1s scenes concatenated, so cuts
    // belong at t=1 and t=2. This mimics the thing that makes the real index
    // work — BB cuts instantly from the pitching view to the wide field view
    // when a ball is put in play, with no transition effect.
    const a = join(dir, 'sc-a.mkv'), b = join(dir, 'sc-b.mkv'), c = join(dir, 'sc-c.mkv');
    const cat = join(dir, 'cuts.mkv');
    ff(['-f', 'lavfi', '-i', 'color=c=0x1020a0:s=320x240:d=1:r=30', ...LOSSLESS, a]);
    ff(['-f', 'lavfi', '-i', 'color=c=0xd0c020:s=320x240:d=1:r=30', ...LOSSLESS, b]);
    ff(['-f', 'lavfi', '-i', 'color=c=0x20a040:s=320x240:d=1:r=30', ...LOSSLESS, c]);
    const list = join(dir, 'list.txt');
    writeFileSync(list, [a, b, c].map((f) => `file '${f}'`).join('\n'));
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', cat]);

    const r = findCuts(cat, { threshold: 0.3 });
    expect(r.count).toBeGreaterThanOrEqual(2);
    // Each authored boundary should have a detected cut within a frame or two.
    for (const expected of [1.0, 2.0]) {
      const nearest = Math.min(...r.cuts.map((t) => Math.abs(t - expected)));
      expect(nearest).toBeLessThan(0.1);
    }
  });

  it('reports NO cuts for continuous motion with no view change', () => {
    // The failure mode that would make the index useless: if ordinary movement
    // registered as a cut, every play would be buried in false positives.
    const f = join(dir, 'nocut.mkv');
    ff(['-f', 'lavfi', '-i', 'testsrc=s=320x240:d=3:r=30', ...LOSSLESS, f]);
    expect(findCuts(f, { threshold: 0.3 }).count).toBe(0);
  });

  it('MISSES a cut confined to part of the frame, and finds it once cropped', () => {
    // The bug that made the real play index useless, reproduced at small scale.
    // ffmpeg's `scene` metric is frame-GLOBAL: when the game owns only part of
    // the capture, a full hard cut scores its share of the frame rather than
    // ~1.0. Here a 96x72 region of a 320x240 frame repaints -- 9% coverage --
    // so the score lands near 0.09 and the default 0.3 threshold sails past it.
    // On the real 3024x1964 desktop capture the game covers 45.3%, halving
    // every cut score; findCuts reported 5 cuts in 450 seconds of footage full
    // of them. Cropping to the game rect first is the whole fix.
    const a = join(dir, 'pc-a.mkv');
    const b = join(dir, 'pc-b.mkv');
    const cat = join(dir, 'pc.mkv');
    const box = (colour, out) =>
      ff([
        '-f', 'lavfi', '-i', 'color=c=0x404058:s=320x240:d=1:r=30',
        '-f', 'lavfi', '-i', `color=c=${colour}:s=96x72:d=1:r=30`,
        '-filter_complex', '[0][1]overlay=x=40:y=30',
        ...LOSSLESS, out,
      ]);
    box('0xe01010', a);
    box('0x10e030', b);
    const list = join(dir, 'pc-list.txt');
    writeFileSync(list, [a, b].map((f) => `file '${f}'`).join('\n'));
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', cat]);

    const rect = { x: 40, y: 30, w: 96, h: 72 };
    expect(findCuts(cat, { threshold: 0.3 }).count).toBe(0);

    const cropped = findCuts(cat, { threshold: 0.3, crop: rect });
    expect(cropped.count).toBeGreaterThanOrEqual(1);
    expect(Math.min(...cropped.cuts.map((t) => Math.abs(t - 1.0)))).toBeLessThan(0.1);
  });

  it('stops reading at durationSec instead of running past it', () => {
    // `select` drops frames but keeps their timestamps, so a `-t` placed on the
    // OUTPUT never sees the pts it is waiting for and ffmpeg keeps decoding.
    // Real cost measured on the session capture: asking for 330s decoded 451s.
    // Three scenes at 1s each; a 1.5s window must not report the t=2 cut.
    const parts = ['0x101040', '0xd0d020', '0x20a0d0'].map((c, i) => {
      const f = join(dir, `dur-${i}.mkv`);
      ff(['-f', 'lavfi', '-i', `color=c=${c}:s=320x240:d=1:r=30`, ...LOSSLESS, f]);
      return f;
    });
    const cat = join(dir, 'dur.mkv');
    const list = join(dir, 'dur-list.txt');
    writeFileSync(list, parts.map((f) => `file '${f}'`).join('\n'));
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', cat]);

    const r = findCuts(cat, { threshold: 0.3, durationSec: 1.5 });
    expect(r.cuts.some((t) => Math.abs(t - 1.0) < 0.1)).toBe(true);
    expect(r.cuts.every((t) => t < 1.6)).toBe(true);
  });

  it('offsets reported times when seeking in with startSec', () => {
    const a = join(dir, 'o-a.mkv'), b = join(dir, 'o-b.mkv'), cat = join(dir, 'off.mkv');
    ff(['-f', 'lavfi', '-i', 'color=c=0x101010:s=320x240:d=2:r=30', ...LOSSLESS, a]);
    ff(['-f', 'lavfi', '-i', 'color=c=0xe0e0e0:s=320x240:d=2:r=30', ...LOSSLESS, b]);
    const list = join(dir, 'list2.txt');
    writeFileSync(list, [a, b].map((f) => `file '${f}'`).join('\n'));
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', cat]);
    // Cut is authored at t=2. Seeking in at 1s must still report ~2, not ~1.
    const r = findCuts(cat, { threshold: 0.3, startSec: 1 });
    expect(r.count).toBeGreaterThanOrEqual(1);
    expect(Math.min(...r.cuts.map((t) => Math.abs(t - 2.0)))).toBeLessThan(0.15);
  });
});

d('contactSheet', () => {
  it('writes a tiled sheet and returns a tile->timestamp map', () => {
    const f = join(dir, 'sheet-src.mkv');
    const out = join(dir, 'sheet.png');
    ff(['-f', 'lavfi', '-i', 'testsrc=s=320x240:d=2:r=30', ...LOSSLESS, f]);
    const s = contactSheet(f, { startSec: 0.5, count: 8, cols: 4, scale: 2, out });
    expect(existsSync(out)).toBe(true);
    expect(s.tiles.length).toBe(8);
    expect(s.rows).toBe(2);
    // The map is what makes a tile re-derivable without burnt-in labels.
    expect(s.tiles[0].t).toBeCloseTo(0.5, 3);
    expect(s.tiles[4].t).toBeCloseTo(0.5 + 4 / 30, 3);
  });

  it('spaces tiles by stepFrames so one sheet can span a whole play', () => {
    // Consecutive frames off a 60fps capture cover a third of a second -- a
    // sheet of them shows one instant six times. Thinning is what makes a sheet
    // a play summary instead of a stutter.
    const f = join(dir, 'sheet-step.mkv');
    const out = join(dir, 'sheet-step.png');
    ff(['-f', 'lavfi', '-i', 'testsrc=s=320x240:d=4:r=30', ...LOSSLESS, f]);
    const s = contactSheet(f, { startSec: 0, count: 6, cols: 3, scale: 2, stepFrames: 15, out });
    expect(existsSync(out)).toBe(true);
    expect(s.tiles[1].t).toBeCloseTo(0.5, 3);
    expect(s.tiles[5].t).toBeCloseTo(2.5, 3);
  });
});

// ---------------------------------------------------------------------------
// Screen-capture support: the game is a rectangle on a desktop, not the frame.
// ---------------------------------------------------------------------------

/** A 3x nearest-neighbour blit of `srcW x srcH` detail, in yuv422p like the real
 *  capture -- so the chroma subsampling that breaks COLUMN triples is actually
 *  exercised rather than assumed away. */
function blitClip(out, { srcW = 64, srcH = 48, scale = 3, dur = 1, rate = 30 }) {
  ff([
    '-f', 'lavfi', '-i', `testsrc=s=${srcW}x${srcH}:d=${dur}:r=${rate}`,
    '-vf', `scale=${srcW * scale}:${srcH * scale}:flags=neighbor`,
    '-pix_fmt', 'yuv422p', ...LOSSLESS, out,
  ]);
}

d('detectGameRect — finding the emulator window on a desktop', () => {
  it('recovers the rect of the only region that repaints at a cut', () => {
    // Ground truth: a 100x60 box at (60,40) inside a 320x240 frame flips colour
    // at t=1 while everything around it holds still. Looking for "the non-black
    // region" would fail here by design -- the surround is deliberately NOT
    // black, exactly like the real capture's wallpaper.
    const a = join(dir, 'gr-a.mkv');
    const b = join(dir, 'gr-b.mkv');
    const cat = join(dir, 'gr.mkv');
    const box = (colour, out) =>
      ff([
        '-f', 'lavfi', '-i', 'color=c=0x404058:s=320x240:d=1:r=30',
        '-f', 'lavfi', '-i', `color=c=${colour}:s=100x60:d=1:r=30`,
        '-filter_complex', '[0][1]overlay=x=60:y=40',
        ...LOSSLESS, out,
      ]);
    box('0xd02020', a);
    box('0x20d040', b);
    const list = join(dir, 'gr-list.txt');
    writeFileSync(list, [a, b].map((f) => `file '${f}'`).join('\n'));
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', cat]);

    const r = detectGameRect(cat, { atSec: 0.8, count: 16, scale: 1 });
    expect(r).not.toBeNull();
    expect(r.x).toBeCloseTo(60, -1);
    expect(r.y).toBeCloseTo(40, -1);
    expect(r.w).toBeCloseTo(100, -1);
    expect(r.h).toBeCloseTo(60, -1);
    // The number that decides findCuts' threshold: 100*60 / 320*240 = 7.8%.
    expect(r.frameCoverage).toBeCloseTo(0.078, 2);
  });
});

d('blitScore — the content-blind emulator fingerprint', () => {
  /** Hand-built RGB buffer, `scale`-upscaled from a per-row-varying pattern. */
  function upscaled(w, h, scale) {
    const buf = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      const src = Math.floor(y / scale);
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 3;
        buf[p] = (src * 37 + x * 11) & 0xff;
        buf[p + 1] = (src * 91) & 0xff;
        buf[p + 2] = (x * 7) & 0xff;
      }
    }
    return buf;
  }

  it('scores a clean 3x blit at 1.0', () => {
    const s = blitScore(upscaled(90, 90, 3), 90, 90, { scale: 3, colStride: 1 });
    expect(s.score).toBe(1);
    expect(s.tested).toBeGreaterThan(100);
  });

  it('scores native-resolution detail far below the threshold', () => {
    const s = blitScore(upscaled(90, 90, 1), 90, 90, { scale: 3, colStride: 1 });
    expect(s.score).toBeLessThan(0.2);
  });

  it('refuses to judge a flat region instead of scoring it 1.0', () => {
    // THE TRAP. Every row-triple in a solid-colour window matches trivially, so
    // a naive score would call a blank desktop window "the emulator". Samples
    // with no vertical variation must contribute no evidence at all.
    const s = blitScore(Buffer.alloc(90 * 90 * 3, 0x40), 90, 90, { scale: 3, colStride: 1 });
    expect(s.tested).toBe(0);
    expect(Number.isNaN(s.score)).toBe(true);
  });

  it('survives yuv422p, which is what the real capture is stored as', () => {
    // 4:2:2 subsamples chroma HORIZONTALLY, so column triples break at block
    // boundaries but row triples are untouched. This asserts that reasoning
    // against a real encode rather than trusting it.
    const f = join(dir, 'blit422.mkv');
    blitClip(f, { srcW: 64, srcH: 48, scale: 3, dur: 1 });
    const { frames, width, height } = readFrames(f, { startSec: 0.5, count: 1 });
    expect(blitScore(frames[0], width, height, { scale: 3, colStride: 3 }).score).toBeGreaterThan(0.98);
  });
});

d('gameSegments — the content-blind segment map', () => {
  it('separates emulator material from native-resolution material', () => {
    // Half a clip is a 3x blit of a small buffer (the emulator), half is the
    // same generator at native size (anything else). The classifier never sees
    // what either half DEPICTS -- only whether it is an integer upscale.
    const a = join(dir, 'seg-a.mkv');
    const b = join(dir, 'seg-b.mkv');
    const cat = join(dir, 'seg.mkv');
    blitClip(a, { srcW: 64, srcH: 48, scale: 3, dur: 2 });
    ff([
      '-f', 'lavfi', '-i', 'testsrc=s=192x144:d=2:r=30',
      '-pix_fmt', 'yuv422p', ...LOSSLESS, b,
    ]);
    const list = join(dir, 'seg-list.txt');
    writeFileSync(list, [a, b].map((f) => `file '${f}'`).join('\n'));
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', cat]);

    const r = gameSegments(cat, {
      rect: { x: 0, y: 0, w: 192, h: 144 },
      scale: 3,
      stepSec: 0.5,
      endSec: 3.9,
      colStride: 3,
      minTested: 50,
    });

    const at = (t) => r.samples.find((s) => Math.abs(s.t - t) < 0.01);
    expect(at(0.5).kind).toBe('game');
    expect(at(1.5).kind).toBe('game');
    expect(at(2.5).kind).toBe('other');
    expect(at(3.5).kind).toBe('other');

    // And it collapses to two runs with the boundary at the join.
    const kinds = r.segments.map((s) => s.kind);
    expect(kinds).toEqual(['game', 'other']);
    expect(r.segments[0].t1).toBeCloseTo(2.0, 1);
  });
});

d('temporalMedian + foregroundBlobs — finding what MOVED, not what is white', () => {
  // THE CASE THAT BLOCKED THE PACE PASS TWICE. Colour-based ball detection dies
  // in a venue with a white fence, a crowd and chalk lines: measured on the real
  // session2 capture that search returned 25-30 near-white candidates per frame
  // with the ball indistinguishable among them. So this clip is built to be
  // hostile in exactly that way -- a busy STATIC background full of bright
  // clutter, plus two movers of very different sizes -- and the tests assert the
  // clutter falls away and only the movers survive.
  //
  // The frames are painted PIXEL BY PIXEL in JS rather than by ffmpeg filters,
  // so the ground truth is not merely known, it is authored: every box position
  // below is an exact integer we can assert against. (An earlier version drove
  // this with `drawbox` time expressions and silently drew nothing at all --
  // `t` is thickness there, not time. A ground-truth test that generates the
  // wrong ground truth is worse than no test, so this path avoids ffmpeg's
  // expression semantics entirely.)

  const W = 240, H = 180, N = 60, FPS = 30;
  const BALL = 6, KID_W = 24, KID_H = 36;
  const BALL_X0 = 20, BALL_VX = 160 / FPS;   // px per frame
  const KID_X0 = 150, KID_VX = -40 / FPS;
  const KID_TOP = H - 10 - KID_H;
  const ballX = (n) => Math.round(BALL_X0 + n * BALL_VX);

  let clip;
  beforeAll(() => {
    const box = (buf, x, y, w, h, [r, g, b]) => {
      for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) {
        for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) {
          const q = (j * W + i) * 3;
          buf[q] = r; buf[q + 1] = g; buf[q + 2] = b;
        }
      }
    };
    const chunks = [];
    for (let n = 0; n < N; n++) {
      const f = Buffer.alloc(W * H * 3);
      box(f, 0, 0, W, H, [47, 122, 42]);                 // grass
      box(f, 0, 10, W, 14, [255, 255, 255]);             // "fence"
      box(f, 30, 40, 2, H - 40, [255, 255, 255]);        // "chalk"
      box(f, 200, 40, 2, H - 40, [255, 255, 255]);
      box(f, 60, 0, 8, 8, [240, 240, 224]);              // "crowd"
      box(f, 140, 2, 8, 8, [232, 232, 240]);
      box(f, ballX(n), 118, BALL, BALL, [255, 255, 255]);
      box(f, Math.round(KID_X0 + n * KID_VX), KID_TOP, KID_W, KID_H, [32, 64, 192]);
      chunks.push(f);
    }
    clip = join(dir, 'fg.mkv');
    const r = spawnSync('ffmpeg', [
      '-v', 'error', '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS),
      '-i', '-', ...LOSSLESS, clip,
    ], { input: Buffer.concat(chunks), maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error('ffmpeg gen failed: ' + r.stderr.toString().slice(-400));
  });

  const bg = () => temporalMedian(clip, { startSec: 0, count: 20, sampleEvery: 3 });

  it('medians the static clutter into the background and the movers out of it', () => {
    const { background, width, height, samples } = bg();
    expect(samples).toBe(20);
    expect(width).toBe(W);
    expect(height).toBe(H);

    const at = (x, y) => {
      const q = (y * width + x) * 3;
      return [background[q], background[q + 1], background[q + 2]];
    };
    // The static fence survives.
    expect(at(120, 16)[0]).toBeGreaterThan(200);
    // And the grass UNDER the ball's flight path survives too, because the ball
    // was only ever there for an instant. This is the assertion a MEAN
    // background would fail: it would leave a bright smear along y=121.
    const [r, g, b] = at(120, 121);
    expect(g).toBeGreaterThan(r + 20);
    expect(g).toBeGreaterThan(b + 20);
  });

  it('returns exactly the two movers, sized right, with sprite-origin feet', () => {
    const { background, width, height } = bg();
    const { frames } = readFrames(clip, { startSec: 1.0, count: 1 });
    const blobs = foregroundBlobs(frames[0], background, width, height, { threshold: 40, minPx: 4 });

    // Two movers and NOTHING else -- no fence, no chalk, no crowd.
    expect(blobs).toHaveLength(2);
    const [kid, ball] = blobs;              // sorted by pixel count, descending
    expect(kid.bw).toBe(KID_W);
    expect(kid.bh).toBe(KID_H);
    expect(ball.bw).toBe(BALL);
    expect(ball.bh).toBe(BALL);

    // SPRITE ORIGIN, the whole reason fx/fy exist. The kid's feet are at
    // H-10-1; his centroid is ~17px higher, at his middle. Measuring progress
    // along a ground axis from the centroid is what biased the first runner
    // tracker (recorded as pace.trackerLessons).
    expect(kid.fy).toBe(H - 11);
    expect(kid.y).toBeLessThan(kid.fy - 15);

    // The ball is exactly where frame 30 drew it.
    expect(ball.fx).toBe(ballX(30) + (BALL - 1) / 2);
  });

  it('separates ball from kid by span alone, with no colour knowledge', () => {
    // The size filter is what finds the ball without ever asking its colour --
    // the property that survives a change of venue, which colour did not.
    const { background, width, height } = bg();
    const { frames } = readFrames(clip, { startSec: 1.0, count: 1 });

    const small = foregroundBlobs(frames[0], background, width, height, { threshold: 40, minPx: 4, maxSpan: 12 });
    expect(small).toHaveLength(1);
    expect(small[0].bw).toBe(BALL);

    const big = foregroundBlobs(frames[0], background, width, height, { threshold: 40, minPx: 4, minSpan: 20 });
    expect(big).toHaveLength(1);
    expect(big[0].bh).toBe(KID_H);
  });

  it('confines the search to an roi', () => {
    const { background, width, height } = bg();
    const { frames } = readFrames(clip, { startSec: 1.0, count: 1 });
    // A band containing only the ball's flight line.
    const blobs = foregroundBlobs(frames[0], background, width, height, {
      threshold: 40, minPx: 4, roi: { x: 0, y: 112, w: W, h: 16 },
    });
    expect(blobs).toHaveLength(1);
    expect(blobs[0].bh).toBe(BALL);
  });

  it('tracks the ball across frames at the speed it was drawn', () => {
    // End to end: the thing every hang/throw measurement actually needs is a
    // ball POSITION SERIES, so assert one comes back linear at the authored
    // velocity rather than merely that a blob exists in one frame.
    const { background, width, height } = bg();
    const track = [];
    // Sampled over n=6..30, i.e. ball x ~52..180. Deliberately stopping short
    // of x=200: see the blind-spot test below.
    for (let n = 6; n <= 30; n += 6) {
      const { frames } = readFrames(clip, { startSec: n / FPS, count: 1 });
      const [b] = foregroundBlobs(frames[0], background, width, height, { threshold: 40, minPx: 4, maxSpan: 12 });
      track.push({ n, x: b.fx });
    }
    expect(track).toHaveLength(5);
    for (const t of track) expect(t.x).toBeCloseTo(ballX(t.n) + (BALL - 1) / 2, 0);

    // And the series is linear at the authored velocity, which is the property
    // a hang or throw measurement actually leans on.
    const dx = track.slice(1).map((t, i) => t.x - track[i].x);
    for (const step of dx) expect(step).toBeCloseTo(6 * BALL_VX, 0);
  });

  it('is eaten into where a white ball crosses a white line — a real limit, not a bug', () => {
    // Background subtraction detects DIFFERENCE, so wherever the ball's colour
    // equals what is behind it, those pixels are not detected. The clip's chalk
    // line at x=200 is white, and the white ball crossing it loses the columns
    // that overlap.
    //
    // Measured here: 36px intact -> 24px at worst. NOT to zero, because a 6px
    // ball cannot be fully hidden behind a 2px line -- which is exactly why this
    // is asserted rather than assumed. The failure mode is partial and silent.
    //
    // It matters because the blob's CENTROID shifts when it is eaten
    // asymmetrically, so a position series wobbles at every same-coloured
    // crossing while still looking perfectly healthy. On real footage the same
    // trap is a ball over the fence, a base, or a white uniform. Mitigation:
    // prefer bbox edges over centroids near known light features, and never
    // treat a track thinning or ending as an event by itself.
    const { background, width, height } = bg();
    const worst = [];
    for (let n = 30; n <= 38; n++) {
      const { frames } = readFrames(clip, { startSec: n / FPS, count: 1 });
      const [b] = foregroundBlobs(frames[0], background, width, height, { threshold: 40, minPx: 1, maxSpan: 12 });
      if (b) worst.push(b.n);
    }
    expect(Math.max(...worst)).toBe(BALL * BALL);            // clean frames are intact
    expect(Math.min(...worst)).toBeLessThan(BALL * BALL);    // and some are not
  });
});

d('clockFidelity — is the RECORDING real-time?', () => {
  // A source that updates R times per second, muxed to 60fps, is a stopwatch
  // digit ticking at R Hz. We know R, so we know the answer.
  function ticking(name, rate, dur) {
    const f = join(dir, name);
    ff(['-f', 'lavfi', '-i', `testsrc=s=64x64:d=${dur}:r=${rate}`, '-vf', 'fps=60', '-r', '60', ...LOSSLESS, f]);
    return f;
  }

  it('reports timeScale 1 when the digit ticks once per captured second', () => {
    const f = ticking('clock-1hz.mkv', 1, 10);
    const r = clockFidelity(f, { durationSec: 8, ticksPerSec: 1 });
    expect(r.observedTicksPerSec).toBeCloseTo(1, 1);
    expect(r.timeScale).toBeCloseTo(1, 1);
    expect(r.verdict).toBe('faithful');
  });

  it('detects a COMPRESSED capture — the failure that makes events look faster', () => {
    // The whole reason this function exists. A digit that really ticks at 1Hz
    // but shows up ticking twice per captured second means one captured second
    // holds two real seconds, so every duration read off the file is half true.
    const f = ticking('clock-2hz.mkv', 2, 10);
    const r = clockFidelity(f, { durationSec: 8, ticksPerSec: 1 });
    expect(r.timeScale).toBeCloseTo(2, 1);
    expect(r.verdict).toBe('compressed');
  });

  it('reports inconclusive rather than a wild ratio when the crop misses the clock', () => {
    // A static crop must never be read as "infinitely stretched time".
    const f = join(dir, 'clock-static.mkv');
    ff(['-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=6:r=60', ...LOSSLESS, f]);
    const r = clockFidelity(f, { durationSec: 5, ticksPerSec: 1 });
    expect(r.ticks).toBe(0);
    expect(r.verdict).toBe('inconclusive');
  });
});

d('pitchFidelity — a one-sided gate: rejects, never certifies', () => {
  function stepped(name, rate, dur) {
    const f = join(dir, name);
    ff(['-f', 'lavfi', '-i', `testsrc=s=96x96:d=${dur}:r=${rate}`, '-vf', 'fps=60', '-r', '60', ...LOSSLESS, f]);
    return f;
  }

  it('bounds the drawn steps of an animation from above', () => {
    // 20fps over 1s = 20 distinct images, whatever the container says.
    const f = stepped('pitch-smooth.mkv', 20, 2);
    const r = pitchFidelity(f, { startSec: 0.1, durationSec: 1, minSteps: 10 });
    expect(r.maxSteps).toBeGreaterThanOrEqual(18);
    expect(r.maxSteps).toBeLessThanOrEqual(22);
    expect(r.rushed).toBe(false);
  });

  it('REJECTS a corridor too static to hold a real flight', () => {
    // The rejection the gate exists for: if even the upper bound is single
    // digits, no flight was drawn there and no duration may be read off it.
    // A failure means "discard the capture", never "scale the number".
    const f = stepped('pitch-rushed.mkv', 10, 2);
    const r = pitchFidelity(f, { startSec: 0.1, durationSec: 0.5, minSteps: 10 });
    expect(r.maxSteps).toBeLessThan(10);
    expect(r.rushed).toBe(true);
    expect(r.verdict).toMatch(/rejected/);
  });

  it('does not claim a pass is a certification', () => {
    // The bound is loose — the pitcher's arm and BB's target shadow animate in
    // the same corridor. session2 passes this gate at 9-13 steps and is still
    // not measurable, so the wording must not imply otherwise.
    const f = stepped('pitch-pass.mkv', 20, 2);
    const r = pitchFidelity(f, { startSec: 0.1, durationSec: 1, minSteps: 10 });
    expect(r.rushed).toBe(false);
    expect(r.verdict).toMatch(/NOT a certification/);
  });

  it('implies the authored flight from step count and the game render rate', () => {
    // 20 steps authored for a 22fps renderer is a ~900ms flight, regardless of
    // how fast the capture actually played them.
    const f = stepped('pitch-implied.mkv', 20, 2);
    const r = pitchFidelity(f, { startSec: 0.1, durationSec: 1, renderFps: 22 });
    expect(r.impliedFlightMs).toBeGreaterThan(750);
    expect(r.impliedFlightMs).toBeLessThan(1050);
  });

  it('honours crop, so the corridor can be isolated from the rest of the frame', () => {
    // Cropping is what keeps the bound as tight as it can be: a static region
    // reports no steps even while the full frame is animating.
    const f = stepped('pitch-crop.mkv', 20, 2);
    const whole = pitchFidelity(f, { startSec: 0.1, durationSec: 1 });
    const corner = pitchFidelity(f, { startSec: 0.1, durationSec: 1, crop: { x: 0, y: 0, w: 8, h: 8 } });
    expect(whole.maxSteps).toBeGreaterThan(corner.maxSteps);
  });
});
