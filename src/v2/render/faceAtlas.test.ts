// ---------------------------------------------------------------------------
// The face atlas, and the doc it mirrors.
//
// `faceAtlas.ts` is the source; `docs/v2/asset-contract.md` §4 is what the
// artist paints against. A modeller reads the markdown's cell order and lays
// out a 512px grid from it; the engine reads the array. If those two ever
// disagree the failure is silent and expensive: 30 delivered models, every one
// of them showing the wrong expression, and nothing in the pipeline able to say
// so — a wrong face reads as a style choice.
//
// Same move as `clips.test.ts` makes for the clip library.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ENGINE_CELLS,
  FACE_CELLS,
  FACE_CELL_SIZE,
  FACE_GRID,
  faceCellUv,
  restingCell,
} from './faceAtlas';
import { ROSTER } from '../../data/characters';
import { FACE_ISLAND, makeToonMaterial } from './materials/toon';
import { Texture } from 'three';

const here = dirname(fileURLToPath(import.meta.url));
const contract = readFileSync(
  join(here, '..', '..', '..', 'docs', 'v2', 'asset-contract.md'),
  'utf8'
);

/** The `face_atlas` row of §4's texture table, as the artist reads it. */
function cellsFromContract(): string[] {
  const row = contract.split('\n').find((l) => l.includes('`face_atlas`'));
  if (!row) throw new Error('asset-contract.md no longer has a `face_atlas` row');
  const list = /cells in this order:([^|]+)/.exec(row);
  if (!list) throw new Error('the `face_atlas` row no longer states a cell order');
  return list[1]
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
}

describe('the atlas layout', () => {
  it('is a 4x4 grid of quarter-sized cells', () => {
    expect(FACE_GRID).toBe(4);
    expect(FACE_CELL_SIZE).toBe(0.25);
    expect(FACE_CELLS).toHaveLength(FACE_GRID * FACE_GRID);
    expect(new Set(FACE_CELLS).size).toBe(FACE_CELLS.length);
  });

  it('matches the cell order printed in the asset contract', () => {
    const stated = cellsFromContract();
    // The doc names 12 and then says "+4 spare"; the code names all 16, because
    // an unaddressable cell is one the first new expression cannot use.
    const named = stated.filter((s) => !/spare/.test(s));
    expect(named).toEqual([...FACE_CELLS].slice(0, named.length));

    const spare = /\+(\d+) spare/.exec(stated[stated.length - 1] ?? '');
    expect(spare, 'the contract no longer states a spare count').not.toBeNull();
    expect(named.length + Number(spare![1])).toBe(FACE_CELLS.length);
  });
});

describe('cell UVs', () => {
  it('puts cell 0 at the TOP-left, not the bottom-left', () => {
    // The contract's order is reading order on an image; UV v runs upward. Get
    // this backwards and every kid wears the expression three rows away, which
    // is not a crash and does not look like a bug.
    expect(faceCellUv('neutral')).toEqual([0, 0.75, 0.25, 0.25]);
    expect(faceCellUv(FACE_CELLS.length - 1)).toEqual([0.75, 0, 0.25, 0.25]);
  });

  it('walks left-to-right then down', () => {
    expect(faceCellUv('grin')).toEqual([0.25, 0.75, 0.25, 0.25]);
    expect(faceCellUv('upset')).toEqual([0, 0.5, 0.25, 0.25]); // index 4 -> row 1, col 0
  });

  it('tiles the whole texture exactly once', () => {
    const seen = new Set<string>();
    for (let i = 0; i < FACE_CELLS.length; i++) {
      const [u, v, su, sv] = faceCellUv(i);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(u + su).toBeLessThanOrEqual(1);
      expect(v + sv).toBeLessThanOrEqual(1);
      seen.add(`${u},${v}`);
    }
    expect(seen.size).toBe(FACE_CELLS.length);
  });

  it('refuses a cell that does not exist', () => {
    expect(() => faceCellUv(FACE_CELLS.length)).toThrow(/no cell/);
    expect(() => faceCellUv(-1)).toThrow(/no cell/);
    expect(() => faceCellUv(1.5)).toThrow(/no cell/);
    expect(() => faceCellUv('smug' as never)).toThrow(/no cell/);
  });
});

describe('the shader agrees with the atlas', () => {
  it('states the same face island the contract does', () => {
    const row = contract.split('\n').find((l) => l.includes('`M_Body`'));
    expect(row, 'asset-contract.md no longer has an M_Body row').toBeDefined();
    // "Face UVs must occupy their own island covering UV [0..0.5, 0.5..1]."
    const m = /\[([\d.]+)\.\.([\d.]+), ([\d.]+)\.\.([\d.]+)\]/.exec(row!);
    expect(m, 'the M_Body row no longer states a UV island').not.toBeNull();
    expect([FACE_ISLAND.u0, FACE_ISLAND.u1, FACE_ISLAND.v0, FACE_ISLAND.v1]).toEqual(
      m!.slice(1, 5).map(Number)
    );
  });

  it('defaults an undriven face to the resting cell', () => {
    // toon.ts duplicates the resting cell as GLSL-side literals so `materials/`
    // depends on nothing above it. This is the pin that keeps the copy honest.
    const map = new Texture();
    const mat = makeToonMaterial({ map, faceAtlas: new Texture() });
    const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: '#include <common>\n#include <map_fragment>\n#include <opaque_fragment>', vertexShader: '' };
    mat.onBeforeCompile?.(shader as never, null as never);
    expect(shader.uniforms.uFaceCell.value).toEqual(faceCellUv('neutral'));
  });

  it('refuses a face atlas with no albedo, rather than rendering a black face', () => {
    // three names its UV varying after the map that needs it (`vMapUv`), so
    // with no albedo there is no varying to test the island against.
    expect(() => makeToonMaterial({ faceAtlas: new Texture() })).toThrow(/needs map/);
  });

  it('does not share a program cache slot between a face and a jersey', () => {
    const withFace = makeToonMaterial({ map: new Texture(), faceAtlas: new Texture() });
    const without = makeToonMaterial({ map: new Texture() });
    expect(withFace.customProgramCacheKey!()).not.toBe(without.customProgramCacheKey!());
  });
});

describe('the v1 expression vocabulary maps onto the atlas', () => {
  it('gives every kid on the roster a resting cell', () => {
    // The point of the mapping: 30 characters have a face the day the first
    // model lands, with no content re-authoring.
    for (const c of ROSTER) {
      const cell = restingCell(c.visual.expression);
      expect(FACE_CELLS, `${c.id} maps to a cell that is not in the atlas`).toContain(cell);
    }
  });

  it('defaults to the resting cell when a kid states no expression', () => {
    expect(restingCell(undefined)).toBe(restingCell('happy'));
    expect(restingCell(undefined)).toBe('neutral');
  });

  it('never rests a kid on an engine-driven cell', () => {
    // blink/wink/sleepy/angry are triggered by gameplay. A character whose
    // RESTING face is `blink` has their eyes shut for the whole game.
    for (const c of ROSTER) {
      expect(ENGINE_CELLS, `${c.id} rests on an engine cell`).not.toContain(
        restingCell(c.visual.expression)
      );
    }
  });
});
