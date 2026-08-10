// OWNER: materials agent. Deterministic noise + per-texture sub-rng derivation.
//
// Determinism story: at init we draw exactly ONE number from ctx.get('rng') —
// the materials base seed. Every texture then gets its own sub-rng derived from
// hash(baseSeed, textureName), so texture generation is (a) fully reproduced by
// ?seed=, and (b) IMMUNE to consumer call order — a lazily built variant draws
// nothing from the shared stream, so later passes adding/removing texture calls
// can never shuffle anyone else's randomness. The mulberry32 body mirrors
// core/rng.ts (value-importing core/ from a subsystem dir is forbidden); it is
// not a second randomness SOURCE — it is seeded exclusively from ctx rng.

export type SubRng = {
  next(): number; // [0, 1)
  range(min: number, max: number): number;
  int(min: number, max: number): number; // inclusive
  pick<T>(items: readonly T[]): T;
};

/** FNV-1a over the name, folded with the base seed. */
function hashName(baseSeed: number, name: string): number {
  let h = 0x811c9dc5 ^ baseSeed;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function subRng(baseSeed: number, name: string): SubRng {
  let a = hashName(baseSeed, name);
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor((max - min + 1) * next()),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

function ihash(x: number, y: number, salt: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 951274213)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Tileable value noise: u,v in [0,1), freq an INTEGER — the lattice wraps at
 * freq, so the resulting field is seamless however the texture repeats.
 */
export function vnoise(u: number, v: number, freq: number, salt: number): number {
  const x = u * freq;
  const y = v * freq;
  let x0 = Math.floor(x);
  let y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  x0 = ((x0 % freq) + freq) % freq;
  y0 = ((y0 % freq) + freq) % freq;
  const x1 = (x0 + 1) % freq;
  const y1 = (y0 + 1) % freq;
  const a = ihash(x0, y0, salt);
  const b = ihash(x1, y0, salt);
  const c = ihash(x0, y1, salt);
  const d = ihash(x1, y1, salt);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Seamless fractal sum of vnoise octaves, normalized to ~[0,1]. */
export function fbm(u: number, v: number, freq: number, octaves: number, salt: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(u, v, f, salt + i * 131);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Lighten (k>1) / darken (k<1) toward white/black, in 0-255 space. */
export function shadeRgb(c: Rgb, k: number): Rgb {
  if (k >= 1) {
    const t = Math.min(k - 1, 1);
    return [c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t];
  }
  return [c[0] * k, c[1] * k, c[2] * k];
}

export function rgbCss(c: Rgb, alpha = 1): string {
  const r = Math.round(clamp01(c[0] / 255) * 255);
  const g = Math.round(clamp01(c[1] / 255) * 255);
  const b = Math.round(clamp01(c[2] / 255) * 255);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** Shade a hex color and return CSS — the one-liner every stamp pass wants. */
export function shadeCss(hex: string, k: number, alpha = 1): string {
  return rgbCss(shadeRgb(hexToRgb(hex), k), alpha);
}
