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
import { probe, readFrames, distinctFrameRate, diffSeries, samplePatch, contactSheet, findCuts, hasFfmpeg } from './video.js';
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
});
