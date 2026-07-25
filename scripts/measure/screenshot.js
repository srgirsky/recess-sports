// ---------------------------------------------------------------------------
// BB2001 measurement — the EXACT-COLOUR source.
//
// video.js documents its own ceiling: video colour is good to about +-2 per
// channel because YUV<->RGB conversion is inherent to the medium and survives
// lossless encoding. That is fine for identifying a hue, useless for recording
// a palette. This file is the other instrument.
//
// docs/research/bb2001-capture-setup.md predicted that ScummVM's screenshot key
// would write the raw 640x480 framebuffer, bypassing display scaling entirely.
// It does not. What it actually writes is a capture of the SCALED WINDOW --
// 2984x1712 in the real session, with the game occupying 1920x1440 of it.
//
// The prediction was wrong and the conclusion still holds, which is why this
// file exists rather than a correction to the doc alone: the window blit is an
// exact INTEGER NEAREST-NEIGHBOUR upscale, so every source pixel survives as an
// identical NxN block and decimating the blocks recovers the original
// framebuffer bit-for-bit. Verified across the session's screenshots: of 6,348
// sampled 3x3 blocks, the only non-uniform ones were the ScummVM "Saved
// screenshot" toast and the mouse cursor, both drawn at native resolution.
//
// THE INVARIANT THIS FILE DEFENDS. Everything above is true only while no
// filter is enabled. Turn on a scaler or linear filtering and the blit stops
// being nearest-neighbour, every colour becomes a blend of its neighbours, and
// nothing here would look any different -- it would just quietly return wrong
// numbers. So the blit is VERIFIED on every read and a failure THROWS. A
// measurement instrument that degrades silently is worse than none.
// ---------------------------------------------------------------------------

import { readFrames } from './video.js';

/** Is this pixel part of the surround rather than the window? */
function isDark(f, i, limit) {
  return f[i] <= limit && f[i + 1] <= limit && f[i + 2] <= limit;
}

/**
 * Bounding box of everything that isn't the letterbox surround.
 *
 * Only usable on a screenshot, where ScummVM pads its window with black. It is
 * NOT how the game rect is found in the video capture -- there the surround is
 * desktop wallpaper, and video.js `detectGameRect` locates the window from a
 * hard cut instead. Two sources, two different correct methods.
 */
function contentRect(frame, width, height, { darkLimit = 8 } = {}) {
  let x0 = width;
  let x1 = -1;
  let y0 = height;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isDark(frame, (y * width + x) * 3, darkLimit)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Check the rect really is an integer nearest-neighbour blit at `scale`, and
 * report every block that isn't.
 *
 * The offenders are returned rather than merely counted, because on a real
 * screenshot some of them are legitimate: ScummVM's OSD toast and the mouse
 * cursor are drawn at native resolution ON TOP of the scaled game, so they
 * genuinely break the pattern without meaning the scaler is on. A caller that
 * knows where they are can exclude those regions; a caller that just gets a
 * boolean cannot.
 */
export function verifyBlit(frame, width, rect, scale, { blockStride = 1 } = {}) {
  const cols = Math.floor(rect.w / scale);
  const rows = Math.floor(rect.h / scale);
  const offenders = [];
  let blocks = 0;

  for (let by = 0; by < rows; by += blockStride) {
    for (let bx = 0; bx < cols; bx += blockStride) {
      const ox = rect.x + bx * scale;
      const oy = rect.y + by * scale;
      const base = (oy * width + ox) * 3;
      blocks++;
      let maxDev = 0;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const q = ((oy + dy) * width + ox + dx) * 3;
          maxDev = Math.max(
            maxDev,
            Math.abs(frame[q] - frame[base]),
            Math.abs(frame[q + 1] - frame[base + 1]),
            Math.abs(frame[q + 2] - frame[base + 2])
          );
        }
      }
      if (maxDev > 0) offenders.push({ x: bx, y: by, maxDev });
    }
  }

  return { blocks, offenders, exactFraction: blocks ? 1 - offenders.length / blocks : 0 };
}

/**
 * Read a ScummVM screenshot back to its NATIVE framebuffer resolution.
 *
 * Returns flat RGB, ready for lib.js `medianColor` / `patchFlatness`, plus the
 * offending blocks so overlay regions can be masked.
 *
 * `maxImpureFraction` is the gate. A handful of native-resolution overlay
 * pixels is expected; a filtered source would fail nearly every block. The
 * default sits far above the former and far below the latter, so it cannot be
 * passed by accident in either direction.
 */
export function readScreenshot(
  pngPath,
  { native = { width: 640, height: 480 }, maxImpureFraction = 0.05, blockStride = 1 } = {}
) {
  const { frames, width, height } = readFrames(pngPath, { count: 1 });
  if (!frames.length) throw new Error(`no image decoded from ${pngPath}`);
  const frame = frames[0];

  const rect = contentRect(frame, width, height);
  if (!rect) throw new Error(`${pngPath}: image is entirely dark -- no window content found`);

  const sx = rect.w / native.width;
  const sy = rect.h / native.height;
  if (sx !== sy || !Number.isInteger(sx)) {
    throw new Error(
      `${pngPath}: window is ${rect.w}x${rect.h}, which is not an integer scale of ` +
        `${native.width}x${native.height} (got ${sx}x by ${sy}y). Aspect-ratio correction or a ` +
        `non-integer window size destroys pixel correspondence -- recapture with 1x graphics mode.`
    );
  }
  const scale = sx;

  const check = verifyBlit(frame, width, rect, scale, { blockStride });
  const impure = 1 - check.exactFraction;
  if (impure > maxImpureFraction) {
    throw new Error(
      `${pngPath}: ${(impure * 100).toFixed(1)}% of ${scale}x${scale} blocks are not uniform ` +
        `(limit ${(maxImpureFraction * 100).toFixed(1)}%). The blit is being FILTERED, so every ` +
        `colour read from this image would be a blend of its neighbours. Turn off the scaler and ` +
        `linear filtering in ScummVM's graphics options and recapture.`
    );
  }

  // Decimate at each block's CENTRE. Any pixel in a uniform block would do, but
  // the centre is the one furthest from a neighbouring block -- so if a future
  // capture is very slightly filtered in a way that slips under the gate, the
  // centre is the least-contaminated sample available.
  const off = Math.floor(scale / 2);
  const out = new Uint8Array(native.width * native.height * 3);
  let o = 0;
  for (let y = 0; y < native.height; y++) {
    for (let x = 0; x < native.width; x++) {
      const p = ((rect.y + y * scale + off) * width + rect.x + x * scale + off) * 3;
      out[o++] = frame[p];
      out[o++] = frame[p + 1];
      out[o++] = frame[p + 2];
    }
  }

  return {
    pixels: out,
    width: native.width,
    height: native.height,
    stride: 3,
    rect,
    scale,
    // Native-resolution overlays (OSD toast, mouse cursor) in NATIVE coords, so
    // callers can keep sample regions away from them.
    impureBlocks: check.offenders,
    exactFraction: check.exactFraction,
  };
}

/** Flat RGB patch out of a native-resolution image, for lib.js colour helpers. */
export function patch(img, { x, y, w, h }) {
  const out = new Uint8Array(w * h * 3);
  let o = 0;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const p = (yy * img.width + xx) * 3;
      out[o++] = img.pixels[p];
      out[o++] = img.pixels[p + 1];
      out[o++] = img.pixels[p + 2];
    }
  }
  return out;
}

/** One pixel, as {r,g,b}. */
export function pixelAt(img, x, y) {
  const p = (y * img.width + x) * 3;
  return { r: img.pixels[p], g: img.pixels[p + 1], b: img.pixels[p + 2] };
}
