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
