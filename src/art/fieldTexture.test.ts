import { describe, it, expect } from 'vitest';
import {
  hash01,
  shadeInt,
  lightenInt,
  speckleEllipse,
  speckleQuad,
  speckleStrip,
  chalkLine,
  chalkRect,
  grassFlecks,
  type TexGraphics,
} from './fieldTexture';

/** Records every op so two runs can be compared byte-for-byte. */
function recorder(): TexGraphics & { ops: unknown[][] } {
  const ops: unknown[][] = [];
  return {
    ops,
    fillStyle: (...a: unknown[]) => ops.push(['fillStyle', ...a]),
    fillEllipse: (...a: unknown[]) => ops.push(['fillEllipse', ...a]),
    lineStyle: (...a: unknown[]) => ops.push(['lineStyle', ...a]),
    lineBetween: (...a: unknown[]) => ops.push(['lineBetween', ...a]),
  };
}

describe('hash01', () => {
  it('stays in [0,1) and is stable for the same inputs', () => {
    for (let i = 0; i < 500; i++) {
      const v = hash01(i, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(hash01(i, 3)).toBe(v);
    }
  });

  it('varies with index and seed', () => {
    expect(hash01(1)).not.toBe(hash01(2));
    expect(hash01(1, 0)).not.toBe(hash01(1, 1));
  });
});

describe('tone helpers', () => {
  it('shadeInt cools toward navy, lightenInt warms toward white', () => {
    expect(shadeInt(0xffffff, 1)).toBe(0x2c3e66);
    expect(lightenInt(0x000000, 1)).toBe(0xfffae8);
    expect(shadeInt(0x88aa66, 0)).toBe(0x88aa66);
  });
});

// The regression net against someone adding Math.random later: every helper
// must emit an IDENTICAL op sequence for identical args (goldlog invariant).
describe('determinism (RNG-free draw ops)', () => {
  const runs: Array<[string, (g: TexGraphics) => void]> = [
    ['speckleEllipse', (g) => speckleEllipse(g, 480, 390, 90, 40, [0x885522, 0xaa7744], 60, 0.4, 2)],
    [
      'speckleQuad',
      (g) =>
        speckleQuad(g, [{ x: 0, y: 0 }, { x: 100, y: 10 }, { x: 90, y: 80 }, { x: 5, y: 70 }], [0x885522], 40, 0.3, 1),
    ],
    ['speckleStrip', (g) => speckleStrip(g, (x) => 200 - x * 0.01, 0, 960, 2, 16, [0x885522], 80, 0.4, 4)],
    ['chalkLine', (g) => chalkLine(g, 480, 500, 40, 210, 4, 0.85, 1)],
    ['chalkRect', (g) => chalkRect(g, 300, 500, 130, 68, 3, 0.7, 2)],
    ['grassFlecks', (g) => grassFlecks(g, 0, 300, 960, 130, 0xaadd88, 0x557744, 60, 3)],
  ];

  for (const [name, draw] of runs) {
    it(`${name} emits identical ops on repeat runs`, () => {
      const a = recorder();
      const b = recorder();
      draw(a);
      draw(b);
      expect(a.ops.length).toBeGreaterThan(0);
      expect(a.ops).toEqual(b.ops);
    });
  }
});

describe('bounds', () => {
  it('speckleEllipse keeps every dot inside the ellipse', () => {
    const g = recorder();
    speckleEllipse(g, 100, 50, 80, 30, [0x111111], 200, 0.4, 7);
    for (const op of g.ops) {
      if (op[0] !== 'fillEllipse') continue;
      const [, x, y] = op as [string, number, number];
      const nx = (x - 100) / 80;
      const ny = (y - 50) / 30;
      expect(nx * nx + ny * ny).toBeLessThanOrEqual(1);
    }
  });

  it('speckleQuad keeps every dot inside the quad bbox', () => {
    const g = recorder();
    const quad = [{ x: 10, y: 20 }, { x: 110, y: 25 }, { x: 100, y: 90 }, { x: 15, y: 85 }] as const;
    speckleQuad(g, quad, [0x111111], 120, 0.3, 5);
    for (const op of g.ops) {
      if (op[0] !== 'fillEllipse') continue;
      const [, x, y] = op as [string, number, number];
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(110);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y).toBeLessThanOrEqual(90);
    }
  });
});
