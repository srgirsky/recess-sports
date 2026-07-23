/**
 * Deterministic field-texture kit shared by the wide field (GameScene's
 * drawField) and the behind-plate rig (BattingView's drawBackdrop): dirt
 * mottle, worn chalk, grass flecks, and the shared tone helpers.
 *
 * HARD RULE: everything here is RNG-free. Create-time Math.random would shift
 * the seeded goldlog stream (scripts/goldlog.browser.js), so all jitter is
 * index-hash math — the same args always emit the exact same draw ops.
 * Render-side only, like projection.ts: never import from systems/.
 */

/** The Graphics ops the kit needs — Phaser's Graphics satisfies this
 *  structurally, and tests can pass a recording stub without Phaser. */
export interface TexGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillEllipse(x: number, y: number, width: number, height: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
}

interface Pt {
  x: number;
  y: number;
}

/** Shadow tone for a 0xrrggbb int: mix toward cool navy (matches CharacterArt). */
export function shadeInt(color: number, f: number): number {
  const mix = (c: number, to: number) => Math.round(c * (1 - f) + to * f);
  const r = mix((color >> 16) & 255, 0x2c);
  const g = mix((color >> 8) & 255, 0x3e);
  const b = mix(color & 255, 0x66);
  return (r << 16) | (g << 8) | b;
}

/** Highlight tone for a 0xrrggbb int: mix toward warm near-white. */
export function lightenInt(color: number, f: number): number {
  const mix = (c: number, to: number) => Math.round(c * (1 - f) + to * f);
  const r = mix((color >> 16) & 255, 0xff);
  const g = mix((color >> 8) & 255, 0xfa);
  const b = mix(color & 255, 0xe8);
  return (r << 16) | (g << 8) | b;
}

/** Deterministic 0..1 from an integer index (the kit's stand-in for rng). */
export function hash01(i: number, seed = 0): number {
  const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const GOLDEN_ANGLE = 2.399963229728653; // radians — even spiral, never gridded

/**
 * Dirt/asphalt mottle inside an ellipse: golden-angle spiral placement keeps
 * the dots evenly spread AND inside the bounds with no clipping needed.
 */
export function speckleEllipse(
  g: TexGraphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colors: number[],
  count: number,
  alpha = 0.35,
  seed = 0
): void {
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt((i + 0.5) / count) * 0.92; // stay just inside the rim
    const th = i * GOLDEN_ANGLE + seed;
    const x = cx + Math.cos(th) * r * rx;
    const y = cy + Math.sin(th) * r * ry;
    const s = 1.6 + hash01(i, seed) * 2.2;
    g.fillStyle(colors[i % colors.length], alpha);
    g.fillEllipse(x, y, s * 2, s * 1.2); // flattened dots read as ground
  }
}

/**
 * Mottle inside a convex quad (perimeter order a→b→c→d, edges a-b and d-c
 * opposite): bilinear interpolation of two hashes stays inside for any
 * convex quad — projected basepath bands, the infield diamond.
 */
export function speckleQuad(
  g: TexGraphics,
  quad: readonly [Pt, Pt, Pt, Pt],
  colors: number[],
  count: number,
  alpha = 0.35,
  seed = 0
): void {
  const [a, b, c, d] = quad;
  for (let i = 0; i < count; i++) {
    const u = 0.06 + hash01(i * 2 + 1, seed) * 0.88;
    const v = 0.06 + hash01(i * 2 + 2, seed + 1) * 0.88;
    const tx = a.x + (b.x - a.x) * u;
    const ty = a.y + (b.y - a.y) * u;
    const bx = d.x + (c.x - d.x) * u;
    const by = d.y + (c.y - d.y) * u;
    const s = 1.6 + hash01(i, seed) * 2.2;
    g.fillStyle(colors[i % colors.length], alpha);
    g.fillEllipse(tx + (bx - tx) * v, ty + (by - ty) * v, s * 2, s * 1.2);
  }
}

/**
 * Mottle a strip that follows a y-of-x curve (the warning track hugging the
 * fence arc): dots between yAt(x)+topOff and yAt(x)+botOff across x0..x1.
 */
export function speckleStrip(
  g: TexGraphics,
  yAt: (x: number) => number,
  x0: number,
  x1: number,
  topOff: number,
  botOff: number,
  colors: number[],
  count: number,
  alpha = 0.4,
  seed = 0
): void {
  for (let i = 0; i < count; i++) {
    const x = x0 + (x1 - x0) * ((i + 0.5) / count);
    const y = yAt(x) + topOff + (botOff - topOff) * hash01(i, seed);
    const s = 1.4 + hash01(i + 47, seed) * 1.8;
    g.fillStyle(colors[i % colors.length], alpha);
    g.fillEllipse(x, y, s * 2, s);
  }
}

/**
 * Worn chalk: the line drawn as near-touching dashes with hash-varied alpha
 * and width, so it reads hand-limed instead of vector-crisp.
 */
export function chalkLine(
  g: TexGraphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  baseAlpha = 0.8,
  seed = 0
): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const dashes = Math.max(3, Math.round(len / 14));
  // A faint continuous underlay keeps the line reading as ONE chalk stripe;
  // the varied dashes on top provide the hand-limed wear.
  g.lineStyle(width * 0.8, 0xffffff, baseAlpha * 0.45);
  g.lineBetween(x1, y1, x2, y2);
  for (let i = 0; i < dashes; i++) {
    const t0 = i / dashes;
    const t1 = (i + 0.85) / dashes;
    const a = baseAlpha * (0.55 + hash01(i, seed) * 0.45);
    const w = width * (0.7 + hash01(i + 31, seed) * 0.55);
    g.lineStyle(w, 0xffffff, a);
    g.lineBetween(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0, x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1);
  }
}

/** Worn chalk rectangle: four chalkLines with distinct seeds per side. */
export function chalkRect(
  g: TexGraphics,
  x: number,
  y: number,
  w: number,
  h: number,
  width: number,
  baseAlpha = 0.8,
  seed = 0
): void {
  chalkLine(g, x, y, x + w, y, width, baseAlpha, seed);
  chalkLine(g, x + w, y, x + w, y + h, width, baseAlpha, seed + 1);
  chalkLine(g, x + w, y + h, x, y + h, width, baseAlpha, seed + 2);
  chalkLine(g, x, y + h, x, y, width, baseAlpha, seed + 3);
}

/** Grass tone flecks: short light/dark ticks scattered over a rect band. */
export function grassFlecks(
  g: TexGraphics,
  x: number,
  y: number,
  w: number,
  h: number,
  light: number,
  dark: number,
  count: number,
  seed = 0
): void {
  for (let i = 0; i < count; i++) {
    const fx = x + hash01(i * 2 + 1, seed) * w;
    const fy = y + hash01(i * 2 + 2, seed + 5) * h;
    g.lineStyle(2, i % 2 === 0 ? light : dark, 0.5);
    g.lineBetween(fx, fy, fx + 2, fy - 3);
  }
}
