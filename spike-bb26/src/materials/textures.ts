// OWNER: materials agent. Every canvas-generated texture in the spike. Each
// builder takes its own SubRng (see noise.ts — derivation makes call order
// irrelevant) and returns { canvas, tileFt }: tileFt is the world size in FEET
// one repeat of the texture covers, which is what setWorldRepeat() consumes.
// All builders are wrap-safe: per-pixel noise uses integer-frequency tileable
// vnoise/fbm, and 2D-context stamps near an edge are re-stamped across it.
//
// Anchor notes driving each look (steam-02 / frame-080):
//   grass — soft mow bands ~8 ft wide, blotchy saturation, tuft strokes,
//           dandelions and pale worn patches; reads painterly, never flat.
//   dirt  — warm tan, clumpy, light speckle; chalk — a hand-limed WOBBLY line
//           with crumbly edges, density gaps and over-spray dust.
//   wood  — per-plank hue jitter + grain + knots; siding — clapboard laps with
//           a hard shadow under each course; roof — staggered shingle tabs.
//   bunting — triangle pennants on a rope, candy palette, per-flag lean.
//   foliage — clustered leaf blobs, lit upper-left, deep shadow base.

import { type SubRng, vnoise, fbm, clamp01, hexToRgb, mixRgb, shadeRgb, rgbCss, shadeCss } from './noise';
import * as P from './palette';

export type Tex = { canvas: HTMLCanvasElement; tileFt: [number, number] };

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  return [c, g];
}

/** Run a stamp at (x,y) and again across any edge it straddles — keeps tiles seamless. */
function stampWrapped(w: number, h: number, x: number, y: number, r: number, draw: (sx: number, sy: number) => void): void {
  const xs = [x];
  const ys = [y];
  if (x < r) xs.push(x + w);
  if (x > w - r) xs.push(x - w);
  if (y < r) ys.push(y + h);
  if (y > h - r) ys.push(y - h);
  for (const sx of xs) for (const sy of ys) draw(sx, sy);
}

// ---------------------------------------------------------------- grass ----

/** 1024², tiles 48 ft — six 8 ft mow bands with wobbled edges. */
export function buildGrass(rng: SubRng): Tex {
  const S = 1024;
  const BANDS = 6;
  const [canvas, g] = makeCanvas(S, S);
  const light = hexToRgb(P.GRASS_LIGHT);
  const dark = hexToRgb(P.GRASS_DARK);
  const saltBand = rng.int(0, 1 << 30);
  const saltBlotch = rng.int(0, 1 << 30);
  const saltFine = rng.int(0, 1 << 30);
  const phase = rng.range(0, Math.PI * 2);

  const img = g.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      // Mow band: parity of a wobbled band coordinate, soft ~1 ft transition.
      const p = u * BANDS + 0.10 * Math.sin(v * Math.PI * 4 + phase) + 0.22 * (vnoise(u, v, 5, saltBand) - 0.5);
      const wave = Math.sin(Math.PI * p);
      const s = clamp01(0.5 + wave / 0.55);
      let [r, gr, b] = mixRgb(dark, light, s);
      // Painterly blotches + fine speckle.
      const blotch = fbm(u, v, 5, 3, saltBlotch) - 0.5;
      const fine = vnoise(u, v, 128, saltFine) - 0.5;
      const k = 1 + blotch * 0.16 + fine * 0.12;
      // Blotch highs drift warm/yellow, lows drift cool — sun-dried lawn.
      r = r * k * (1 + blotch * 0.06);
      gr = gr * k;
      b = b * k * (1 - blotch * 0.10);
      const i = (y * S + x) * 4;
      d[i] = Math.min(255, r);
      d[i + 1] = Math.min(255, gr);
      d[i + 2] = Math.min(255, b);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // Worn straw patches (under the ImageData pass would be lost — stamp over, low alpha).
  for (let i = 0; i < 9; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(40, 95);
    stampWrapped(S, S, x, y, r, (sx, sy) => {
      const grad = g.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, shadeCss(P.GRASS_WORN, 1, rng.range(0.10, 0.18)));
      grad.addColorStop(1, shadeCss(P.GRASS_WORN, 1, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(sx, sy, r, r * rng.range(0.55, 0.8), rng.range(0, Math.PI), 0, Math.PI * 2);
      g.fill();
    });
  }

  // Tuft strokes: short leaning blades, light and dark passes.
  const blade = (style: string, count: number): void => {
    g.strokeStyle = style;
    g.lineWidth = 1.4;
    g.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const h = rng.range(4, 9);
      const lean = rng.range(-3, 3);
      stampWrapped(S, S, x, y, 12, (sx, sy) => {
        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo(sx + lean * 0.3, sy - h * 0.6, sx + lean, sy - h);
        g.stroke();
      });
    }
  };
  blade(shadeCss(P.GRASS_TUFT, 1, 0.30), 1900);
  blade(shadeCss(P.GRASS_DEEP, 1, 0.28), 1700);

  // Dandelions + clover dots.
  for (let i = 0; i < 34; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    stampWrapped(S, S, x, y, 4, (sx, sy) => {
      g.fillStyle = shadeCss(P.DANDELION, 1, 0.9);
      g.beginPath();
      g.arc(sx, sy, rng.range(1.4, 2.4), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = shadeCss(P.DANDELION, 1.35, 0.9);
      g.beginPath();
      g.arc(sx - 0.5, sy - 0.5, 0.8, 0, Math.PI * 2);
      g.fill();
    });
  }
  for (let i = 0; i < 22; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    stampWrapped(S, S, x, y, 3, (sx, sy) => {
      g.fillStyle = shadeCss(P.CLOVER_WHITE, 1, 0.55);
      g.beginPath();
      g.arc(sx, sy, rng.range(0.8, 1.5), 0, Math.PI * 2);
      g.fill();
    });
  }

  return { canvas, tileFt: [48, 48] };
}

// ----------------------------------------------------------------- dirt ----

/** 512², tiles 16 ft — warm clumpy infield tan. */
export function buildDirt(rng: SubRng): Tex {
  const S = 512;
  const [canvas, g] = makeCanvas(S, S);
  const tan = hexToRgb(P.DIRT_TAN);
  const darkC = hexToRgb(P.DIRT_DARK);
  const saltClump = rng.int(0, 1 << 30);
  const saltFine = rng.int(0, 1 << 30);

  const img = g.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const clump = fbm(u, v, 6, 3, saltClump);
      const fine = vnoise(u, v, 96, saltFine) - 0.5;
      let [r, gr, b] = mixRgb(darkC, tan, clamp01(0.25 + clump * 0.9));
      const k = 1 + fine * 0.18;
      r *= k;
      gr *= k;
      b *= k;
      const i = (y * S + x) * 4;
      d[i] = Math.min(255, r);
      d[i + 1] = Math.min(255, gr);
      d[i + 2] = Math.min(255, b);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // Damp blotches, then pebble speckle light/dark.
  for (let i = 0; i < 7; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(24, 60);
    stampWrapped(S, S, x, y, r, (sx, sy) => {
      const grad = g.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, shadeCss(P.DIRT_DAMP, 1, 0.16));
      grad.addColorStop(1, shadeCss(P.DIRT_DAMP, 1, 0));
      g.fillStyle = grad;
      g.fillRect(sx - r, sy - r, r * 2, r * 2);
    });
  }
  for (let i = 0; i < 260; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const pr = rng.range(0.6, 2.2);
    const c = rng.next() < 0.5 ? P.DIRT_DAMP : P.DIRT_LIGHT;
    stampWrapped(S, S, x, y, 3, (sx, sy) => {
      g.fillStyle = shadeCss(c, rng.range(0.9, 1.1), 0.6);
      g.beginPath();
      g.arc(sx, sy, pr, 0, Math.PI * 2);
      g.fill();
    });
  }

  return { canvas, tileFt: [16, 16] };
}

// ---------------------------------------------------------------- chalk ----

/**
 * 1024×128 transparent strip, tiles 24 ft along its length. A wobbly hand-limed
 * line ~0.6 ft wide lives in a 2 ft-tall strip with crumble, gaps and dust.
 * Map onto a long thin plane (u along the line) with a transparent material.
 */
export function buildChalkLine(rng: SubRng): Tex {
  const W = 1024;
  const H = 128;
  const [canvas, g] = makeCanvas(W, H);
  const cream = hexToRgb(P.CHALK_CREAM);
  const ph1 = rng.range(0, Math.PI * 2);
  const ph2 = rng.range(0, Math.PI * 2);
  const ph3 = rng.range(0, Math.PI * 2);
  const phw = rng.range(0, Math.PI * 2);
  const saltGap = rng.int(0, 1 << 30);
  const saltCrumb = rng.int(0, 1 << 30);

  const img = g.createImageData(W, H);
  const d = img.data;
  for (let x = 0; x < W; x++) {
    const u = x / W;
    const tw = Math.PI * 2;
    // Integer x-frequencies keep the wobble periodic — the strip tiles end to end.
    const center = H / 2 + 8 * Math.sin(u * tw + ph1) + 4.5 * Math.sin(u * tw * 3 + ph2) + 2.5 * Math.sin(u * tw * 7 + ph3);
    const halfW = Math.max(8, 19 + 6 * Math.sin(u * tw * 2 + phw) + 8 * (vnoise(u, 0.5, 8, saltGap) - 0.5));
    const gap = vnoise(u, 0.25, 12, saltGap); // slow density variation
    for (let y = 0; y < H; y++) {
      const dist = Math.abs(y - center);
      let a = clamp01((halfW - dist) / (halfW * 0.45));
      const crumb = 0.78 + 0.22 * vnoise(x / W, y / H, 64, saltCrumb);
      a *= crumb;
      if (gap < 0.22) a *= 0.35; // worn-through stretch
      const i = (y * W + x) * 4;
      d[i] = cream[0];
      d[i + 1] = cream[1];
      d[i + 2] = cream[2];
      d[i + 3] = Math.round(clamp01(a) * 255);
    }
  }
  g.putImageData(img, 0, 0);

  // Over-spray: chalk dust specks drifting off the edges.
  for (let i = 0; i < 240; i++) {
    const x = rng.range(0, W);
    const y = H / 2 + rng.range(-1, 1) * rng.range(14, 34);
    stampWrapped(W, H, x, y, 3, (sx, sy) => {
      g.fillStyle = rgbCss(cream, rng.range(0.25, 0.65));
      g.beginPath();
      g.arc(sx, sy, rng.range(0.5, 1.6), 0, Math.PI * 2);
      g.fill();
    });
  }

  return { canvas, tileFt: [24, 2] };
}

/** 256² opaque chalk/canvas surface (bases, plate) — cream with light grime. */
export function buildChalkBase(rng: SubRng): Tex {
  const S = 256;
  const [canvas, g] = makeCanvas(S, S);
  g.fillStyle = P.CHALK_CREAM;
  g.fillRect(0, 0, S, S);
  const saltG = rng.int(0, 1 << 30);
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = fbm(x / S, y / S, 8, 2, saltG) - 0.5;
      const k = 1 + n * 0.08;
      const i = (y * S + x) * 4;
      d[i] *= k;
      d[i + 1] *= k;
      d[i + 2] *= k;
    }
  }
  g.putImageData(img, 0, 0);
  // Dirt scuffs.
  for (let i = 0; i < 14; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(6, 22);
    stampWrapped(S, S, x, y, r, (sx, sy) => {
      const grad = g.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, shadeCss(P.DIRT_TAN, 1, 0.12));
      grad.addColorStop(1, shadeCss(P.DIRT_TAN, 1, 0));
      g.fillStyle = grad;
      g.fillRect(sx - r, sy - r, r * 2, r * 2);
    });
  }
  return { canvas, tileFt: [3, 3] };
}

// ----------------------------------------------------------------- wood ----

export type WoodOpts = {
  base: string; // hex
  plankCount?: number; // vertical planks per 512px tile (default 9)
  weather?: number; // 0..1 gray weathering streaks
  gapColor?: string;
};

/** 512², tiles 8 ft — vertical planks with hue jitter, grain, knots. */
export function buildWood(rng: SubRng, opts: WoodOpts): Tex {
  const S = 512;
  const [canvas, g] = makeCanvas(S, S);
  const planks = opts.plankCount ?? 9;
  const pw = S / planks;
  const base = hexToRgb(opts.base);
  const weather = opts.weather ?? 0.15;

  for (let p = 0; p < planks; p++) {
    const x0 = p * pw;
    // Per-plank tone: lightness jitter + drift toward a browner cousin.
    const jitter = rng.range(0.8, 1.12);
    const brown = mixRgb(base, hexToRgb(P.WOOD_DARK), rng.range(0, 0.3));
    g.fillStyle = rgbCss(shadeRgb(brown, jitter));
    g.fillRect(x0, 0, pw + 1, S);

    // Grain: wavy vertical strokes.
    const grains = rng.int(7, 13);
    g.lineWidth = 1.2;
    for (let i = 0; i < grains; i++) {
      const gx = x0 + rng.range(3, pw - 3);
      const amp = rng.range(1, 3.5);
      const ph = rng.range(0, Math.PI * 2);
      g.strokeStyle = rgbCss(shadeRgb(brown, rng.range(0.72, 0.9)), rng.range(0.12, 0.26));
      g.beginPath();
      g.moveTo(gx, 0);
      for (let y = 0; y <= S; y += 16) g.lineTo(gx + amp * Math.sin((y / S) * Math.PI * 2 + ph), y);
      g.stroke();
    }

    // Knot(s).
    if (rng.next() < 0.38) {
      const kx = x0 + rng.range(pw * 0.25, pw * 0.75);
      const ky = rng.range(40, S - 40);
      const kr = rng.range(3, 7);
      const grad = g.createRadialGradient(kx, ky, 0.5, kx, ky, kr);
      grad.addColorStop(0, rgbCss(shadeRgb(brown, 0.45)));
      grad.addColorStop(0.7, rgbCss(shadeRgb(brown, 0.7), 0.8));
      grad.addColorStop(1, rgbCss(shadeRgb(brown, 1), 0));
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(kx, ky, kr * 1.3, kr, rng.range(-0.4, 0.4), 0, Math.PI * 2);
      g.fill();
    }

    // Plank gap: dark seam on the left edge, thin highlight beside it.
    g.fillStyle = shadeCss(opts.gapColor ?? P.FENCE_GAP, 0.8, 0.85);
    g.fillRect(x0 - 2, 0, 4, S);
    g.fillStyle = rgbCss(shadeRgb(brown, 1.22), 0.45);
    g.fillRect(x0 + 2, 0, 2, S);
  }

  // Weathering: pale gray vertical streaks fading downward.
  const streaks = Math.round(weather * 26);
  for (let i = 0; i < streaks; i++) {
    const x = rng.range(0, S);
    const w = rng.range(3, 10);
    const grad = g.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, `rgba(210,208,198,${0.16 * weather + 0.04})`);
    grad.addColorStop(1, 'rgba(210,208,198,0)');
    g.fillStyle = grad;
    stampWrapped(S, S, x, S / 2, w, (sx) => g.fillRect(sx - w / 2, 0, w, S));
  }

  return { canvas, tileFt: [8, 8] };
}

// --------------------------------------------------------------- siding ----

/** 512², tiles 8 ft — clapboard courses with a hard lap shadow. */
export function buildSiding(rng: SubRng, baseHex: string): Tex {
  const S = 512;
  const ROWS = 12;
  const rh = S / ROWS;
  const [canvas, g] = makeCanvas(S, S);
  const base = hexToRgb(baseHex);

  for (let rI = 0; rI < ROWS; rI++) {
    const y0 = rI * rh;
    const tone = shadeRgb(base, rng.range(0.95, 1.05));
    g.fillStyle = rgbCss(tone);
    g.fillRect(0, y0, S, rh + 1);

    // Board gradient: each course slightly darker toward its lower lip.
    const grad = g.createLinearGradient(0, y0, 0, y0 + rh);
    grad.addColorStop(0, rgbCss(shadeRgb(tone, 1.06), 0.5));
    grad.addColorStop(0.8, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.10)');
    g.fillStyle = grad;
    g.fillRect(0, y0, S, rh);

    // Lap shadow under the course above — the one strong line siding needs.
    g.fillStyle = 'rgba(20,26,40,0.22)';
    g.fillRect(0, y0, S, 3);
    g.fillStyle = rgbCss(shadeRgb(tone, 1.12), 0.35);
    g.fillRect(0, y0 + 3, S, 1);

    // Rare, faint butt joints — boards are long; frequent joints read as brick.
    if (rI % 3 === 0) {
      const joint = ((rI * 197) % 4) * (S / 4) + rng.range(-14, 14);
      g.fillStyle = 'rgba(20,26,40,0.09)';
      g.fillRect(((joint % S) + S) % S, y0 + 3, 1, rh - 3);
    }

    // Faint horizontal grain.
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = rgbCss(shadeRgb(tone, 0.9), 0.10);
      g.lineWidth = 1;
      const gy = y0 + rng.range(6, rh - 3);
      g.beginPath();
      g.moveTo(0, gy);
      g.lineTo(S, gy);
      g.stroke();
    }
  }

  return { canvas, tileFt: [8, 8] };
}

// ----------------------------------------------------------------- roof ----

/** 512², tiles 10 ft — shingle courses, staggered tabs, optional moss. */
export function buildRoof(rng: SubRng, baseHex: string, moss: boolean): Tex {
  const S = 512;
  const ROWS = 10;
  const rh = S / ROWS;
  const TAB = 64;
  const [canvas, g] = makeCanvas(S, S);
  const base = hexToRgb(baseHex);

  for (let rI = 0; rI < ROWS; rI++) {
    const y0 = rI * rh;
    g.fillStyle = rgbCss(shadeRgb(base, rng.range(0.94, 1.05)));
    g.fillRect(0, y0, S, rh + 1);

    // Per-shingle tone within the course.
    const offset = rI % 2 === 0 ? 0 : TAB / 2;
    for (let t = -1; t < S / TAB + 1; t++) {
      const x0 = t * TAB + offset;
      g.fillStyle = rgbCss(shadeRgb(base, rng.range(0.94, 1.06)), 0.4);
      g.fillRect(x0, y0, TAB, rh);
      // Tab notch — short and faint, or the roof reads as a brick wall.
      g.fillStyle = 'rgba(16,20,32,0.20)';
      g.fillRect(((x0 % S) + S) % S, y0 + rh * 0.45, 1.5, rh * 0.55);
    }

    // Course shadow.
    g.fillStyle = 'rgba(16,20,32,0.38)';
    g.fillRect(0, y0, S, 5);
    g.fillStyle = rgbCss(shadeRgb(base, 1.14), 0.4);
    g.fillRect(0, y0 + 5, S, 1.5);
  }

  if (moss) {
    for (let i = 0; i < 120; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const c = rng.next() < 0.6 ? P.ROOF_MOSS : P.ROOF_SHED_GREEN;
      stampWrapped(S, S, x, y, 4, (sx, sy) => {
        g.fillStyle = shadeCss(c, rng.range(0.85, 1.1), rng.range(0.4, 0.8));
        g.beginPath();
        g.ellipse(sx, sy, rng.range(1.5, 4), rng.range(1, 2.5), rng.range(0, Math.PI), 0, Math.PI * 2);
        g.fill();
      });
    }
  }

  return { canvas, tileFt: [10, 10] };
}

// --------------------------------------------------------------- bunting ----

/** 1024×128 transparent, tiles ~14 ft — pennant triangles on a rope. */
export function buildBunting(rng: SubRng): Tex {
  const W = 1024;
  const H = 128;
  const FLAGS = 16;
  const fw = W / FLAGS;
  const [canvas, g] = makeCanvas(W, H);
  const colors = [P.BUNT_RED, P.BUNT_YELLOW, P.BUNT_BLUE, P.BUNT_WHITE, P.BUNT_TEAL, P.BUNT_PINK];

  // Rope with a gentle periodic ripple.
  const ph = rng.range(0, Math.PI * 2);
  const ropeY = (x: number): number => 12 + 2.5 * Math.sin((x / W) * Math.PI * 2 * 2 + ph);
  g.strokeStyle = P.ROPE_CREAM;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, ropeY(0));
  for (let x = 0; x <= W; x += 16) g.lineTo(x, ropeY(x));
  g.stroke();
  g.strokeStyle = shadeCss(P.ROPE_CREAM, 0.75, 0.6);
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(0, ropeY(0) + 1.5);
  for (let x = 0; x <= W; x += 16) g.lineTo(x, ropeY(x) + 1.5);
  g.stroke();

  for (let f = 0; f < FLAGS; f++) {
    const x0 = f * fw;
    const c = colors[f % colors.length];
    const lean = rng.range(-6, 6);
    const drop = rng.range(88, 104);
    const ax = x0 + 5;
    const bx = x0 + fw - 5;
    const tipX = x0 + fw / 2 + lean;
    const ay = ropeY(ax) + 2;
    const by = ropeY(bx) + 2;

    // Cloth body with a lit-top gradient.
    const grad = g.createLinearGradient(0, ay, 0, drop);
    grad.addColorStop(0, shadeCss(c, 1.08));
    grad.addColorStop(1, shadeCss(c, 0.86));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.lineTo(tipX, drop);
    g.closePath();
    g.fill();

    // Fold: darker sliver down one half.
    g.fillStyle = shadeCss(c, 0.78, 0.5);
    g.beginPath();
    g.moveTo(x0 + fw / 2 - 2, (ay + by) / 2);
    g.lineTo(bx, by);
    g.lineTo(tipX, drop);
    g.closePath();
    g.fill();

    // Soft outline keeps flags reading against any backdrop.
    g.strokeStyle = 'rgba(30,34,48,0.25)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.lineTo(tipX, drop);
    g.closePath();
    g.stroke();
  }

  return { canvas, tileFt: [14, 1.75] };
}

// --------------------------------------------------------------- foliage ----

export type FoliageTone = 'tree' | 'hedge';

/** 512², tiles 12 ft — clustered cartoon leaf blobs, lit upper-left. */
export function buildFoliage(rng: SubRng, tone: FoliageTone): Tex {
  const S = 512;
  const [canvas, g] = makeCanvas(S, S);
  const deep = tone === 'tree' ? P.FOLIAGE_DEEP : P.HEDGE_DEEP;
  const mid = tone === 'tree' ? P.FOLIAGE_MID : P.HEDGE_MID;
  const light = tone === 'tree' ? P.FOLIAGE_LIGHT : P.HEDGE_LIGHT;
  const rMin = tone === 'tree' ? 14 : 9;
  const rMax = tone === 'tree' ? 30 : 18;
  const count = tone === 'tree' ? 240 : 380;

  g.fillStyle = deep;
  g.fillRect(0, 0, S, S);

  // Leaf masses grow in CLUSTERS — uniform scatter reads as polka dots. All
  // cluster BODIES paint first, then all highlights: interleaving lets a later
  // cluster's dark canopy bury an earlier cluster's lit shoulder, which left
  // one glowing patch on an otherwise dark tile in iter004.
  const clusters = tone === 'tree' ? 14 : 24;
  const gauss = () => (rng.next() + rng.next() + rng.next()) / 3 - 0.5; // soft center bias
  const centers: [number, number, number][] = [];
  for (let c = 0; c < clusters; c++) {
    centers.push([rng.range(0, S), rng.range(0, S), rng.range(S / 9, S / 5.5)]);
  }
  const blobs = Math.round(count / clusters);
  for (const [cx, cy, cr] of centers) {
    for (let i = 0; i < blobs; i++) {
      const x = cx + gauss() * cr * 2.4;
      const y = cy + gauss() * cr * 2.4;
      const r = rng.range(rMin, rMax);
      const squash = rng.range(0.75, 0.95);
      stampWrapped(S, S, x, y, r + 4, (sx, sy) => {
        g.fillStyle = shadeCss(deep, rng.range(0.85, 1.0));
        g.beginPath();
        g.ellipse(sx + 2, sy + 4, r, r * squash, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = shadeCss(mid, rng.range(0.9, 1.08));
        g.beginPath();
        g.ellipse(sx, sy, r * 0.92, r * squash * 0.92, 0, 0, Math.PI * 2);
        g.fill();
      });
    }
  }
  for (const [cx, cy, cr] of centers) {
    // Highlights: smaller blobs hugging this cluster's upper-left shoulder.
    for (let i = 0; i < blobs * 0.7; i++) {
      const x = cx - cr * 0.35 + gauss() * cr * 1.4;
      const y = cy - cr * 0.4 + gauss() * cr * 1.4;
      const r = rng.range(rMin * 0.35, rMax * 0.45);
      stampWrapped(S, S, x, y, r + 3, (sx, sy) => {
        g.fillStyle = shadeCss(light, rng.range(0.95, 1.12), 0.85);
        g.beginPath();
        g.ellipse(sx, sy, r, r * 0.85, rng.range(-0.3, 0.3), 0, Math.PI * 2);
        g.fill();
      });
    }
    // Leaf-tip sparkle on the lit shoulder.
    for (let i = 0; i < 8; i++) {
      const x = cx - cr * 0.4 + gauss() * cr;
      const y = cy - cr * 0.45 + gauss() * cr;
      stampWrapped(S, S, x, y, 3, (sx, sy) => {
        g.fillStyle = shadeCss(light, 1.25, 0.55);
        g.beginPath();
        g.arc(sx, sy, rng.range(0.8, 1.8), 0, Math.PI * 2);
        g.fill();
      });
    }
  }

  return { canvas, tileFt: [12, 12] };
}

// ----------------------------------------------------------------- metal ----

/** 512², tiles 10 ft — painted panel metal with scratches, rivets, rust. */
export function buildMetal(rng: SubRng, baseHex: string): Tex {
  const S = 512;
  const [canvas, g] = makeCanvas(S, S);
  const base = hexToRgb(baseHex);
  g.fillStyle = rgbCss(base);
  g.fillRect(0, 0, S, S);

  // Broad vertical brush variation.
  for (let i = 0; i < 40; i++) {
    const x = rng.range(0, S);
    const w = rng.range(8, 34);
    const k = rng.range(0.92, 1.08);
    stampWrapped(S, S, x, S / 2, w, (sx) => {
      g.fillStyle = rgbCss(shadeRgb(base, k), 0.18);
      g.fillRect(sx - w / 2, 0, w, S);
    });
  }

  // Panel seams + rivet rows.
  for (let px = 0; px < S; px += 128) {
    g.fillStyle = 'rgba(20,26,40,0.30)';
    g.fillRect(px, 0, 2, S);
    g.fillStyle = rgbCss(shadeRgb(base, 1.2), 0.4);
    g.fillRect(px + 2, 0, 1.5, S);
    for (let ry = 16; ry < S; ry += 48) {
      g.fillStyle = 'rgba(20,26,40,0.35)';
      g.beginPath();
      g.arc(px + 9, ry, 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = rgbCss(shadeRgb(base, 1.25), 0.6);
      g.beginPath();
      g.arc(px + 8.4, ry - 0.6, 1, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Scratches.
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const len = rng.range(10, 50);
    const ang = rng.range(-0.4, 0.4) + (rng.next() < 0.5 ? 0 : Math.PI / 2);
    stampWrapped(S, S, x, y, len, (sx, sy) => {
      g.strokeStyle = rgbCss(shadeRgb(base, 1.3), rng.range(0.2, 0.4));
      g.lineWidth = rng.range(0.7, 1.4);
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      g.stroke();
    });
  }

  // Rust: flecks with drip streaks, densest in the lower third.
  for (let i = 0; i < 60; i++) {
    const x = rng.range(0, S);
    const y = S - rng.range(0, S) * rng.next(); // biased downward
    const r = rng.range(1, 4);
    stampWrapped(S, S, x, y, r + 12, (sx, sy) => {
      g.fillStyle = shadeCss(P.METAL_RUST, rng.range(0.85, 1.15), rng.range(0.4, 0.75));
      g.beginPath();
      g.ellipse(sx, sy, r, r * 0.8, 0, 0, Math.PI * 2);
      g.fill();
      if (rng.next() < 0.5) {
        const grad = g.createLinearGradient(0, sy, 0, sy + r * 6);
        grad.addColorStop(0, shadeCss(P.METAL_RUST, 1, 0.35));
        grad.addColorStop(1, shadeCss(P.METAL_RUST, 1, 0));
        g.fillStyle = grad;
        g.fillRect(sx - r * 0.4, sy, r * 0.8, r * 6);
      }
    });
  }

  return { canvas, tileFt: [10, 10] };
}
