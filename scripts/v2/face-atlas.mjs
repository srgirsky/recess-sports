// ---------------------------------------------------------------------------
// Per-character 4x4 expression atlas for generated roster models.
//
// The runtime contract is texture-based expression, not morph targets. These
// atlases turn the face geometry already authored in `VisualParams` into that
// contract: spacing, eye style, nose, mouth width, cheeks and freckles all
// survive the move from v1's SVG character art into the v2 model.
//
// Kept dependency-free so `npm run export:roster-kid` stays a deterministic
// content build. The tiny PNG writer is intentionally narrow: RGBA8, filter 0.
// ---------------------------------------------------------------------------

import { deflateSync } from 'node:zlib';

const SIZE = 512;
const CELL = SIZE / 4;
const INK = [38, 45, 59, 255];
const WHITE = [255, 250, 235, 255];
const MOUTH = [103, 39, 51, 255];
const TONGUE = [244, 117, 132, 255];
const CHEEK = [244, 131, 143, 112];
const FRECKLE = [113, 67, 55, 190];

const EXPRESSIONS = [
  'neutral',
  'grin',
  'determined',
  'worried',
  'upset',
  'surprised',
  'blink',
  'wink',
  'sleepy',
  'angry',
  'tongue',
  'cheer',
  'neutral',
  'neutral',
  'neutral',
  'neutral',
];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function canvas() {
  return new Uint8Array(SIZE * SIZE * 4);
}

function blend(pixels, x, y, color, coverage = 1) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || coverage <= 0) return;
  const i = (Math.floor(y) * SIZE + Math.floor(x)) * 4;
  const sa = (color[3] / 255) * clamp(coverage, 0, 1);
  const da = pixels[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  for (let c = 0; c < 3; c++) {
    pixels[i + c] = Math.round((color[c] * sa + pixels[i + c] * da * (1 - sa)) / oa);
  }
  pixels[i + 3] = Math.round(oa * 255);
}

function disc(pixels, cx, cy, r, color, sx = 1, sy = 1) {
  const rx = r * sx;
  const ry = r * sy;
  const x0 = Math.floor(cx - rx - 1);
  const x1 = Math.ceil(cx + rx + 1);
  const y0 = Math.floor(cy - ry - 1);
  const y1 = Math.ceil(cy + ry + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      blend(pixels, x, y, color, clamp((1.04 - d) * Math.min(rx, ry), 0, 1));
    }
  }
}

function line(pixels, x0, y0, x1, y1, width, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const pad = width / 2 + 1;
  for (let y = Math.floor(Math.min(y0, y1) - pad); y <= Math.ceil(Math.max(y0, y1) + pad); y++) {
    for (let x = Math.floor(Math.min(x0, x1) - pad); x <= Math.ceil(Math.max(x0, x1) + pad); x++) {
      const t = clamp(((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / len2, 0, 1);
      const px = x0 + t * dx;
      const py = y0 + t * dy;
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      blend(pixels, x, y, color, clamp(width / 2 + 0.75 - d, 0, 1));
    }
  }
}

function arc(pixels, cx, cy, rx, ry, start, end, width, color) {
  const steps = Math.max(10, Math.ceil(Math.abs(end - start) * Math.max(rx, ry) / 2));
  let px = cx + Math.cos(start) * rx;
  let py = cy + Math.sin(start) * ry;
  for (let i = 1; i <= steps; i++) {
    const a = start + ((end - start) * i) / steps;
    const nx = cx + Math.cos(a) * rx;
    const ny = cy + Math.sin(a) * ry;
    line(pixels, px, py, nx, ny, width, color);
    px = nx;
    py = ny;
  }
}

function drawEyes(pixels, spec, expression, ox, oy) {
  const gap = clamp(spec.eyeGap ?? 18, 13, 24) * 0.62;
  const scale = clamp(spec.eyeSize ?? 1, 0.75, 1.3);
  const style = spec.eyeStyle ?? 'classic';
  const y = oy + 77;
  const blink = expression === 'blink';
  const wink = expression === 'wink';
  const sleepy = expression === 'sleepy' || style === 'sleepy';

  for (const side of [-1, 1]) {
    const x = ox + 32 + side * gap;
    const closed = blink || (wink && side === 1);
    if (closed) {
      arc(pixels, x, y, 6.5 * scale, 3.2 * scale, 0.12, Math.PI - 0.12, 3.2, INK);
      continue;
    }
    if (style === 'button') {
      disc(pixels, x, y, 5.4 * scale, INK);
      disc(pixels, x - 1.7 * scale, y - 1.8 * scale, 1.25 * scale, WHITE);
      continue;
    }
    disc(pixels, x, y, 6.8 * scale, WHITE, 0.82, sleepy ? 0.52 : 1.08);
    disc(pixels, x + side * 0.7, y + (sleepy ? 1.2 : 0.5), 3.0 * scale, INK);
    disc(pixels, x - 0.6, y - 1.0, 0.85 * scale, WHITE);
    if (sleepy) line(pixels, x - 5.5 * scale, y - 2.1, x + 5.5 * scale, y - 2.1, 2.5, INK);
  }
}

function drawBrows(pixels, spec, expression, ox, oy) {
  const gap = clamp(spec.eyeGap ?? 18, 13, 24) * 0.62;
  for (const side of [-1, 1]) {
    const x = ox + 32 + side * gap;
    let innerY = oy + 61;
    let outerY = oy + 63;
    if (expression === 'determined' || expression === 'angry') {
      innerY = oy + 65;
      outerY = oy + 58;
    } else if (expression === 'worried' || expression === 'upset') {
      innerY = oy + 58;
      outerY = oy + 65;
    } else if (expression === 'surprised') {
      innerY = outerY = oy + 55;
    }
    const innerX = x - side * 5.5;
    const outerX = x + side * 5.5;
    line(pixels, innerX, innerY, outerX, outerY, expression === 'angry' ? 4.2 : 3.2, INK);
  }
}

function drawNose(pixels, spec, ox, oy) {
  const x = ox + 32;
  const y = oy + 91;
  switch (spec.nose ?? 'arc') {
    case 'dot':
      disc(pixels, x, y, 2.1, FRECKLE);
      break;
    case 'wedge':
      line(pixels, x - 2, y - 5, x + 4, y + 2, 2.4, FRECKLE);
      line(pixels, x + 4, y + 2, x - 1, y + 3, 2.4, FRECKLE);
      break;
    default:
      arc(pixels, x, y, 4.5, 3.2, 0.1, Math.PI * 0.9, 2.0, FRECKLE);
      break;
  }
}

function drawMouth(pixels, spec, expression, ox, oy) {
  const x = ox + 32;
  // Stay off the sphere's lower UV pole. At y=106 the mouth wrapped under the
  // chin and an open surprise mouth collapsed into a dark horizontal sliver
  // in the hero camera.
  const y = oy + 96;
  const w = clamp(spec.mouthW ?? 1, 0.75, 1.25);
  switch (expression) {
    case 'grin':
      disc(pixels, x, y - 1, 10 * w, MOUTH, 1, 0.58);
      disc(pixels, x, y - 4, 7.5 * w, WHITE, 1, 0.34);
      break;
    case 'cheer':
      disc(pixels, x, y - 1, 9.5 * w, MOUTH, 1, 0.92);
      disc(pixels, x, y - 5, 6.3 * w, WHITE, 1, 0.35);
      break;
    case 'tongue':
      disc(pixels, x, y - 1, 9 * w, MOUTH, 1, 0.75);
      disc(pixels, x, y + 3, 5.6 * w, TONGUE, 1, 0.52);
      line(pixels, x, y + 1, x, y + 6, 1.2, MOUTH);
      break;
    case 'surprised':
      disc(pixels, x, y - 2, 6.2 * w, MOUTH, 0.82, 1.12);
      break;
    case 'worried':
    case 'upset':
      arc(pixels, x, y + 5, 8 * w, 5, Math.PI * 1.12, Math.PI * 1.88, 3.0, MOUTH);
      break;
    case 'angry':
    case 'determined':
      line(pixels, x - 7 * w, y, x + 7 * w, y - 1, 3.0, MOUTH);
      break;
    default:
      arc(pixels, x, y - 4, 8 * w, 6, 0.12, Math.PI - 0.12, 3.0, MOUTH);
      break;
  }
}

function drawCheeksAndFreckles(pixels, character, ox, oy) {
  const face = character.visual.face ?? {};
  const cheeks = clamp(face.cheeks ?? 0, 0, 1.4);
  if (cheeks > 0) {
    disc(pixels, ox + 12, oy + 96, 6.5, [...CHEEK.slice(0, 3), Math.round(CHEEK[3] * (cheeks / 1.4))], 1.25, 0.55);
    disc(pixels, ox + 52, oy + 96, 6.5, [...CHEEK.slice(0, 3), Math.round(CHEEK[3] * (cheeks / 1.4))], 1.25, 0.55);
  }
  if (character.visual.freckles) {
    for (const [x, y] of [[21, 92], [26, 94], [38, 94], [43, 92], [17, 95], [47, 95]]) {
      disc(pixels, ox + x, oy + y, 1.15, FRECKLE);
    }
  }
}

function drawCell(pixels, character, expression, col, row) {
  const ox = col * CELL;
  const oy = row * CELL;
  const spec = character.visual.face ?? {};
  drawCheeksAndFreckles(pixels, character, ox, oy);
  drawEyes(pixels, spec, expression, ox, oy);
  drawBrows(pixels, spec, expression, ox, oy);
  drawNose(pixels, spec, ox, oy);
  drawMouth(pixels, spec, expression, ox, oy);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const scan = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    scan[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(scan, row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scan, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function makeFaceAtlasPng(character) {
  const pixels = canvas();
  for (let i = 0; i < EXPRESSIONS.length; i++) {
    // `faceCellUv` addresses rows in UV order (bottom to top); PNG rows are
    // stored top to bottom and glTF uploads them without three's usual flip.
    // Store logical row 0 at the physical bottom so the contract's top-left
    // `neutral` cell is the one the runtime actually samples.
    drawCell(pixels, character, EXPRESSIONS[i], i % 4, 3 - Math.floor(i / 4));
  }
  // glTF uploads image rows without three's ordinary texture flip. Sphere UVs
  // therefore see each painted cell upside-down unless the cell itself is
  // flipped here. Flip *within* each cell so the documented top-left cell
  // order remains unchanged.
  const rowBytes = CELL * 4;
  for (let cellRow = 0; cellRow < 4; cellRow++) {
    for (let cellCol = 0; cellCol < 4; cellCol++) {
      for (let y = 0; y < CELL / 2; y++) {
        const top = ((cellRow * CELL + y) * SIZE + cellCol * CELL) * 4;
        const bottom = ((cellRow * CELL + (CELL - 1 - y)) * SIZE + cellCol * CELL) * 4;
        const saved = pixels.slice(top, top + rowBytes);
        pixels.copyWithin(top, bottom, bottom + rowBytes);
        pixels.set(saved, bottom);
      }
    }
  }
  return encodePng(SIZE, SIZE, pixels);
}

export function makeWhitePng() {
  return encodePng(2, 2, new Uint8Array(2 * 2 * 4).fill(255));
}
