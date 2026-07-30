// ---------------------------------------------------------------------------
// Canvas2D adapter for the SHARED field-texture kit. Render-side only.
//
// `src/art/fieldTexture.ts` declares its drawing surface as a structural
// interface (`TexGraphics`: fillStyle / fillEllipse / lineStyle / lineBetween)
// rather than importing Phaser. Phaser's Graphics happened to satisfy it; so
// does a 15-line Canvas2D shim. That is the entire reason v1's speckled dirt,
// hand-limed chalk and grass flecks — and their determinism test — survive the
// engine change untouched.
//
// The kit is RNG-free by contract (index-hash jitter only), so the same field
// draws identically every time, which is what lets the v2 UI audit take
// pixel-stable screenshots.
// ---------------------------------------------------------------------------

import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from 'three';
import type { TexGraphics } from '../../art/fieldTexture';

function css(color: number, alpha: number): string {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Wraps a 2D context in the kit's drawing interface. */
export class CanvasTexGraphics implements TexGraphics {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  fillStyle(color: number, alpha = 1): this {
    this.ctx.fillStyle = css(color, alpha);
    return this;
  }

  fillEllipse(x: number, y: number, width: number, height: number): this {
    // Phaser's fillEllipse takes width/height, Canvas2D takes radii.
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, Math.max(0.01, width / 2), Math.max(0.01, height / 2), 0, 0, Math.PI * 2);
    this.ctx.fill();
    return this;
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.ctx.lineWidth = Math.max(0.01, width);
    this.ctx.strokeStyle = css(color, alpha);
    this.ctx.lineCap = 'round';
    return this;
  }

  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    return this;
  }

  // --- Extras the kit doesn't cover, used directly by Field.ts ---

  get raw(): CanvasRenderingContext2D {
    return this.ctx;
  }

  fillPolygon(pts: readonly { x: number; y: number }[], color: number, alpha = 1): void {
    if (pts.length < 3) return;
    this.ctx.fillStyle = css(color, alpha);
    this.ctx.beginPath();
    this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.ctx.lineTo(pts[i].x, pts[i].y);
    this.ctx.closePath();
    this.ctx.fill();
  }

  fillCircle(x: number, y: number, r: number, color: number, alpha = 1): void {
    this.fillStyle(color, alpha);
    this.fillEllipse(x, y, r * 2, r * 2);
  }
}

export interface DrawnTexture {
  canvas: HTMLCanvasElement;
  g: CanvasTexGraphics;
  /** Feet -> texture pixels. */
  ftToPx: (ft: number) => number;
  /** Field (x, z) in feet -> texture pixel coordinates. */
  toPx: (x: number, z: number) => { x: number; y: number };
}

/**
 * Allocate a square canvas covering a field region in FEET, with a
 * feet->pixels mapping. Note +Z (centre field) maps to DECREASING canvas y,
 * so the texture reads as a plan view with home at the bottom — which is how
 * every chalk diagram of a ballpark is drawn, and how the numbers in this file
 * stay checkable by eye.
 */
export function makeFieldCanvas(opts: {
  size: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}): DrawnTexture {
  const canvas = document.createElement('canvas');
  canvas.width = opts.size;
  canvas.height = opts.size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable — cannot build the field texture');

  const spanX = opts.maxX - opts.minX;
  const spanZ = opts.maxZ - opts.minZ;
  const sx = opts.size / spanX;
  const sz = opts.size / spanZ;

  return {
    canvas,
    g: new CanvasTexGraphics(ctx),
    ftToPx: (ft) => ft * sx,
    toPx: (x, z) => ({ x: (x - opts.minX) * sx, y: opts.size - (z - opts.minZ) * sz }),
  };
}

export function toTexture(canvas: HTMLCanvasElement, anisotropy = 4): Texture {
  const tex = new CanvasTexture(canvas);
  // ★ flipY = false. The ground planes are PlaneGeometry rotated -90° about X,
  // which maps the plane's +V to world -Z (toward home). three's default
  // flipY = true then sends the canvas's TOP row to world -Z — putting centre
  // field at the plate and the batter's boxes out by second base. Turning it
  // off lets `makeFieldCanvas` stay an honest plan view (home at the bottom,
  // centre field at the top) that can be checked by eye.
  tex.flipY = false;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.minFilter = LinearFilter; // no mipmaps: the plane is near-flat to camera
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
