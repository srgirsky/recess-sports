// ---------------------------------------------------------------------------
// ★ A palette that ships brighter than it was authored is a different palette.
//
// Junebug's first delivered GLB wore pale beige skin and a pink shirt while
// her sculpt script declared warm brown (#B96835) and deep crimson (#A9282C).
// Nothing was wrong with any single stage: the sculpt wrote its sRGB hex
// fractions into Blender's FLOAT_COLOR `_RECESS_COLOR` attribute, which is a
// LINEAR-space layer; the exporter faithfully promoted those numbers to glTF
// COLOR_0, which is linear by spec; and the runtime faithfully displayed them
// — about one stop too bright, because 0xB9 (0.725) as a linear value
// display-encodes to ~0.87. Every viewer in the chain agreed and every one of
// them was showing the wrong colour. Only comparing the SHIPPED file's
// colours against the AUTHORED swatches can see this class of bug.
//
// So this gate reads each authored character's sculpt script, extracts the
// declared `rgba("RRGGBB")` swatches, decodes the shipped GLB's COLOR_0
// (normalized u8, linear) back to sRGB, and requires agreement BOTH WAYS:
// every shipped vertex colour must sit on a declared swatch, and every
// declared swatch must survive into the shipped file. One direction alone
// passes when the file is all white.
//
// Broken deliberately while writing the gate: run against the pre-fix
// kid_nostrike.glb it reported "shipped #cf966d nearest authored #b96835" —
// the exact wash the fidelity board showed. Tolerance is ±8/255 per sRGB
// channel: u8 quantization in linear space costs up to ~3 counts after
// re-encoding near black. Two swatches closer together than the tolerance
// (WHITE and SOLE sit 5 counts apart) are harmless — the test asks whether a
// colour sits on the palette, never which swatch it is.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { readAccessor, readGlb } from './glb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');

// Characters whose sculpt script authors COLOR_0 through `_RECESS_COLOR`.
// Add a row when a new sculpt adopts the pattern; there are no stale slots.
const SCULPTED = {
  nostrike: 'scripts/v2/blender/sculpt-junebug-source.py',
};

const TOLERANCE = 8 / 255;

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

function hexToRgb(hex) {
  return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
}

function rgbToHex(rgb) {
  return `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

function declaredSwatches(scriptPath) {
  const source = readFileSync(join(repo, scriptPath), 'utf8');
  const swatches = new Set();
  for (const match of source.matchAll(/rgba\("([0-9A-Fa-f]{6})"\)/g)) {
    swatches.add(match[1].toLowerCase());
  }
  return [...swatches].map(hexToRgb);
}

function shippedColours(id) {
  const gltf = readGlb(join(repo, 'public', 'v2', 'models', `kid_${id}.glb`));
  const seen = new Map();
  for (const mesh of gltf.json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessorIndex = primitive.attributes?.COLOR_0;
      if (accessorIndex === undefined) continue;
      const accessor = gltf.json.accessors[accessorIndex];
      const parts = accessor.type === 'VEC4' ? 4 : 3;
      const scale = accessor.componentType === 5121 ? 255 : accessor.componentType === 5123 ? 65535 : 1;
      const values = readAccessor(gltf, accessorIndex);
      for (let at = 0; at < values.length; at += parts) {
        const rgb = [values[at], values[at + 1], values[at + 2]].map((v) => linearToSrgb(v / scale));
        seen.set(rgbToHex(rgb), rgb);
      }
    }
  }
  return [...seen.values()];
}

function distance(a, b) {
  return Math.max(...a.map((value, channel) => Math.abs(value - b[channel])));
}

function nearest(colour, pool) {
  let best = null;
  for (const candidate of pool) {
    const gap = distance(colour, candidate);
    if (!best || gap < best.gap) best = { candidate, gap };
  }
  return best;
}

describe('authored palette survives into the shipped GLB', () => {
  for (const [id, scriptPath] of Object.entries(SCULPTED)) {
    const model = join(repo, 'public', 'v2', 'models', `kid_${id}.glb`);

    it(`${id}: sculpt script and runtime model both exist`, () => {
      expect(existsSync(join(repo, scriptPath))).toBe(true);
      expect(existsSync(model)).toBe(true);
    });

    it(`${id}: every shipped vertex colour is a declared swatch`, () => {
      const swatches = declaredSwatches(scriptPath);
      const offPalette = shippedColours(id)
        .map((colour) => ({ colour, ...nearest(colour, swatches) }))
        .filter((entry) => entry.gap > TOLERANCE)
        .map((entry) => `shipped ${rgbToHex(entry.colour)} nearest authored ${rgbToHex(entry.candidate)}`);
      expect(offPalette).toEqual([]);
    });

    it(`${id}: every declared swatch survives into the shipped file`, () => {
      const shipped = shippedColours(id);
      const lost = declaredSwatches(scriptPath)
        .map((swatch) => ({ swatch, ...nearest(swatch, shipped) }))
        .filter((entry) => entry.gap > TOLERANCE)
        .map((entry) => `authored ${rgbToHex(entry.swatch)} shipped nearest ${rgbToHex(entry.candidate)}`);
      expect(lost).toEqual([]);
    });
  }
});
