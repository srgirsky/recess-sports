// ---------------------------------------------------------------------------
// Synthetic ground truth for the exact-colour instrument.
//
// The whole value of screenshot.js is a claim: "these numbers are the game's
// actual pixels, not approximations." That claim is only worth anything if the
// instrument REFUSES when it isn't true. So most of what follows is not "does
// it read correctly" but "does it fail loudly when the source is filtered,
// mis-scaled, or otherwise no longer pixel-exact".
//
// A silent degradation here would be indistinguishable from a correct read and
// would poison the palette records permanently.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readScreenshot, verifyBlit, patch, pixelAt } from './screenshot.js';
import { readFrames, hasFfmpeg } from './video.js';
import { medianColor } from './lib.js';

const FFMPEG_OK = hasFfmpeg();
const d = FFMPEG_OK ? describe : describe.skip;

let dir;
beforeAll(() => {
  if (FFMPEG_OK) dir = mkdtempSync(join(tmpdir(), 'bbshot-'));
});
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function ff(args, input) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 28, input });
  if (r.status !== 0) throw new Error('ffmpeg gen failed: ' + r.stderr.toString().slice(-400));
}

/** Feed ffmpeg raw bytes on stdin, for fixtures whose exact values matter. */
function ffPipe(input, args) {
  ff(args, input);
}

// A tiny stand-in for the 640x480 framebuffer: small enough to keep the tests
// fast, structured enough that filtering visibly changes it.
const NATIVE = { width: 64, height: 48 };

/**
 * Build a fake ScummVM screenshot: `NATIVE` detail, upscaled `scale`x with the
 * given flags, padded with black to a larger window — the real shape of the
 * artifact, including the surround that has to be found and stripped.
 */
function shot(out, { scale = 3, flags = 'neighbor', pad = { w: 300, h: 220 } } = {}) {
  const w = NATIVE.width * scale;
  const h = NATIVE.height * scale;
  ff([
    '-f', 'lavfi', '-i', `testsrc=s=${NATIVE.width}x${NATIVE.height}:d=1:r=1`,
    '-vf', `scale=${w}:${h}:flags=${flags},pad=${pad.w}:${pad.h}:(ow-iw)/2:(oh-ih)/2:black`,
    '-frames:v', '1', out,
  ]);
}

d('readScreenshot — recovering the native framebuffer', () => {
  it('finds the window inside the letterbox and reports the integer scale', () => {
    const f = join(dir, 'ok.png');
    shot(f, { scale: 3 });
    const img = readScreenshot(f, { native: NATIVE });
    expect(img.scale).toBe(3);
    expect(img.width).toBe(NATIVE.width);
    expect(img.height).toBe(NATIVE.height);
    expect(img.rect.w).toBe(NATIVE.width * 3);
    // Centred by `pad`: (300-192)/2 = 54, (220-144)/2 = 38.
    expect(img.rect.x).toBe(54);
    expect(img.rect.y).toBe(38);
  });

  it('recovers the ORIGINAL pixels exactly, not approximately', () => {
    // The load-bearing assertion of this whole file. Decimating the blit must
    // reproduce the pre-upscale image bit-for-bit -- not close, identical.
    const src = join(dir, 'src.png');
    const up = join(dir, 'up.png');
    ff(['-f', 'lavfi', '-i', `testsrc=s=${NATIVE.width}x${NATIVE.height}:d=1:r=1`, '-frames:v', '1', src]);
    shot(up, { scale: 3 });

    const truth = readFrames(src, { count: 1 }).frames[0];
    const img = readScreenshot(up, { native: NATIVE });

    let mismatches = 0;
    for (let i = 0; i < NATIVE.width * NATIVE.height * 3; i++) {
      if (img.pixels[i] !== truth[i]) mismatches++;
    }
    expect(mismatches).toBe(0);
  });

  it('works at a different integer scale without being told', () => {
    const f = join(dir, 'x2.png');
    shot(f, { scale: 2 });
    expect(readScreenshot(f, { native: NATIVE }).scale).toBe(2);
  });
});

d('readScreenshot — the refusals', () => {
  it('THROWS on a filtered blit rather than returning blended colour', () => {
    // The failure this instrument exists to catch. A bilinear upscale looks
    // completely normal and every colour sampled from it is a blend of
    // neighbours -- exactly the silent corruption that would make a palette
    // record confidently wrong.
    const f = join(dir, 'filtered.png');
    shot(f, { scale: 3, flags: 'bilinear' });
    expect(() => readScreenshot(f, { native: NATIVE })).toThrow(/FILTERED/);
  });

  it('THROWS on a non-integer scale', () => {
    // What aspect-ratio correction does: pixel correspondence is gone, so
    // there is no such thing as "the original pixel" to recover.
    const f = join(dir, 'noninteger.png');
    ff([
      '-f', 'lavfi', '-i', `testsrc=s=${NATIVE.width}x${NATIVE.height}:d=1:r=1`,
      '-vf', `scale=${Math.round(NATIVE.width * 2.5)}:${Math.round(NATIVE.height * 2.5)}:flags=neighbor,pad=300:220:(ow-iw)/2:(oh-ih)/2:black`,
      '-frames:v', '1', f,
    ]);
    expect(() => readScreenshot(f, { native: NATIVE })).toThrow(/integer scale/);
  });

  it('THROWS on an all-black image instead of returning a rect of nothing', () => {
    const f = join(dir, 'black.png');
    ff(['-f', 'lavfi', '-i', 'color=c=black:s=300x220:d=1:r=1', '-frames:v', '1', f]);
    expect(() => readScreenshot(f, { native: NATIVE })).toThrow(/entirely dark/);
  });

  it('TOLERATES a few native-resolution overlay pixels, and reports where they are', () => {
    // ScummVM draws its OSD toast and the mouse cursor at native resolution on
    // top of the scaled game. Those legitimately break the block pattern, so
    // the gate must not be an all-or-nothing equality check -- but the
    // offenders have to be reported, or a caller would unknowingly sample a
    // colour out of the cursor.
    const f = join(dir, 'overlay.png');
    const w = NATIVE.width * 3;
    const h = NATIVE.height * 3;
    ff([
      '-f', 'lavfi', '-i', `testsrc=s=${NATIVE.width}x${NATIVE.height}:d=1:r=1`,
      '-vf',
      `scale=${w}:${h}:flags=neighbor,drawbox=x=10:y=10:w=7:h=5:color=white@1:t=fill,` +
        `pad=300:220:(ow-iw)/2:(oh-ih)/2:black`,
      '-frames:v', '1', f,
    ]);
    const img = readScreenshot(f, { native: NATIVE });
    expect(img.impureBlocks.length).toBeGreaterThan(0);
    expect(img.exactFraction).toBeGreaterThan(0.95);
    // Reported in NATIVE coords, near the box drawn at 10,10 of the scaled image.
    const near = img.impureBlocks.filter((b) => b.x <= 8 && b.y <= 8);
    expect(near.length).toBeGreaterThan(0);
  });
});

d('verifyBlit / patch / pixelAt', () => {
  it('scores a clean blit at 1.0 and a filtered one far below', () => {
    const clean = join(dir, 'vb-clean.png');
    const soft = join(dir, 'vb-soft.png');
    shot(clean, { scale: 3 });
    shot(soft, { scale: 3, flags: 'bicubic' });
    const rect = { x: 54, y: 38, w: NATIVE.width * 3, h: NATIVE.height * 3 };
    const a = readFrames(clean, { count: 1 });
    const b = readFrames(soft, { count: 1 });
    expect(verifyBlit(a.frames[0], a.width, rect, 3).exactFraction).toBe(1);
    // A bicubic upscale of `testsrc` still leaves ~54% of blocks uniform --
    // interpolation only shows up where the image has detail, and large flat
    // areas survive it untouched. So "most blocks are clean" is NOT evidence a
    // source is unfiltered, and the gate is deliberately set where a genuine
    // blit (1.0) and a filtered one cannot be confused: anything that misses
    // 5% of blocks is rejected.
    expect(verifyBlit(b.frames[0], b.width, rect, 3).exactFraction).toBeLessThan(0.95);
  });

  it('reads an exact flat colour back through patch + medianColor', () => {
    // The end-to-end promise: a colour the game drew comes back as that EXACT
    // colour, with none of video.js's +-2 YUV round-trip error.
    //
    // The ground truth is authored here as RAW RGB BYTES and piped in, rather
    // than described to ffmpeg as `color=c=0x5abe5a`. That was learned twice:
    // the lavfi `color` source negotiates yuv420p and the conversion into PNG
    // returned #58bd59 (off by 2,1,1); adding `format=rgb24` narrowed it to
    // #5abe5b (off by 1 in blue) but did not close it. Both times the error was
    // in the FIXTURE, injected before the code under test ever ran -- an
    // instrument working perfectly would have looked broken. When a test exists
    // to prove exactness, the expected value must not travel through anything
    // capable of rounding it.
    const f = join(dir, 'flatshot.png');
    const raw = Buffer.alloc(NATIVE.width * NATIVE.height * 3);
    for (let i = 0; i < raw.length; i += 3) {
      raw[i] = 0x5a;
      raw[i + 1] = 0xbe;
      raw[i + 2] = 0x5a;
    }
    ffPipe(raw, [
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${NATIVE.width}x${NATIVE.height}`, '-i', '-',
      '-vf', `scale=${NATIVE.width * 3}:${NATIVE.height * 3}:flags=neighbor,pad=300:220:(ow-iw)/2:(oh-ih)/2:black`,
      '-frames:v', '1', f,
    ]);
    const img = readScreenshot(f, { native: NATIVE });
    const c = medianColor(patch(img, { x: 8, y: 8, w: 20, h: 12 }), { stride: 3 });
    expect(c.hex).toBe('#5abe5a');
    expect(pixelAt(img, 30, 30)).toEqual({ r: 0x5a, g: 0xbe, b: 0x5a });
  });
});
