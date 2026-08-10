// OWNER: materials agent. Registers ctx 'materials' — the palette authority and
// the canvas-texture factory every other subsystem builds its look from.
//
//   rawColor(key) / color(key)  — palette lookup ('#hex' passes through)
//   grass() dirt() chalkLine() chalk() wood() shedWood() siding() roof()
//   bunting() foliage() metal() — cached-texture MeshLambertMaterials; helpers
//   taking opts accept { worldSize: [wFt, hFt] } to pin the texture repeat to a
//   mesh's real footprint (each texture knows its own tileFt — see textures.ts).
//   setWorldRepeat(mat, wFt, hFt) — same, after the fact.
//   canvasFor(name) — the raw HTMLCanvasElement (ui may toDataURL it for HUD).
//
// Determinism: ONE draw from ctx.get('rng') seeds the whole subsystem; every
// texture builds from a name-derived sub-rng (noise.ts), so lazy building can
// never reorder anyone's random stream. Textures are cached by key; materials
// returned are fresh unless the same cache key + repeat is requested, so
// consumers may tweak a returned material freely.
//
// TEMPORARY: while 'field' is still an empty stub at scene:ready, a swatch
// board (swatches.ts) is floated in front of the pitching camera so captures
// verify the textures. It self-retires when the field pass registers.

import * as THREE from 'three';
import type { Ctx } from '../core/ctx';
import type { Rng } from '../core/rng';
import { PALETTE, type PaletteKey } from './palette';
import { subRng } from './noise';
import {
  type Tex,
  buildGrass,
  buildDirt,
  buildChalkLine,
  buildChalkBase,
  buildWood,
  buildSiding,
  buildRoof,
  buildBunting,
  buildFoliage,
  buildMetal,
  type FoliageTone,
} from './textures';
import { makeSwatchBoard, type Swatch } from './swatches';

export type MatOpts = { worldSize?: [number, number] };

export type MaterialsApi = {
  palette: typeof PALETTE;
  rawColor(key: string): string;
  color(key: string): THREE.Color;
  grass(opts?: MatOpts): THREE.MeshLambertMaterial;
  dirt(opts?: MatOpts): THREE.MeshLambertMaterial;
  /** Transparent wobbly hand-chalked line strip — u runs along the line. */
  chalkLine(opts?: MatOpts): THREE.MeshLambertMaterial;
  /** Opaque scuffed chalk/canvas (bases, plate). */
  chalk(opts?: MatOpts): THREE.MeshLambertMaterial;
  /** Vertical plank wood; color is a palette key or '#hex' (default fenceTan). */
  wood(color?: string, opts?: MatOpts & { weather?: number }): THREE.MeshLambertMaterial;
  shedWood(opts?: MatOpts): THREE.MeshLambertMaterial;
  /** Clapboard house siding (default houseBlue). */
  siding(color?: string, opts?: MatOpts): THREE.MeshLambertMaterial;
  /** Shingle roof (default roofBlue); moss adds yellow-green flecks. */
  roof(color?: string, opts?: MatOpts & { moss?: boolean }): THREE.MeshLambertMaterial;
  /** Transparent pennant-garland strip — u along the rope. */
  bunting(opts?: MatOpts): THREE.MeshLambertMaterial;
  foliage(tone?: FoliageTone, opts?: MatOpts): THREE.MeshLambertMaterial;
  /** Painted panel metal (default metalTruck). */
  metal(color?: string, opts?: MatOpts): THREE.MeshLambertMaterial;
  /** Pin an existing textured material's repeat to a world footprint in feet. */
  setWorldRepeat(mat: THREE.Material, wFt: number, hFt: number): void;
  canvasFor(name: string): HTMLCanvasElement | undefined;
};

export function init(ctx: Ctx): void {
  const baseSeed = Math.floor(ctx.get<Rng>('rng').next() * 2 ** 31);
  const maxAniso = (() => {
    try {
      return ctx.get<{ renderer: THREE.WebGLRenderer }>('render').renderer.capabilities.getMaxAnisotropy();
    } catch {
      return 1;
    }
  })();

  const texCache = new Map<string, Tex & { texture: THREE.CanvasTexture }>();

  const resolve = (c: string | undefined, fallback: PaletteKey): string => {
    if (!c) return PALETTE[fallback];
    if (c.startsWith('#')) return c;
    const hex = (PALETTE as Record<string, string>)[c];
    if (!hex) throw new Error(`materials: unknown palette key '${c}'`);
    return hex;
  };

  const getTex = (key: string, build: () => Tex): Tex & { texture: THREE.CanvasTexture } => {
    let t = texCache.get(key);
    if (!t) {
      const built = build();
      const texture = new THREE.CanvasTexture(built.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, maxAniso);
      t = { ...built, texture };
      texCache.set(key, t);
    }
    return t;
  };

  const material = (
    key: string,
    build: () => Tex,
    opts?: MatOpts,
    extra?: THREE.MeshLambertMaterialParameters,
  ): THREE.MeshLambertMaterial => {
    const t = getTex(key, build);
    let map: THREE.Texture = t.texture;
    if (opts?.worldSize) {
      map = t.texture.clone(); // clones share the uploaded image, cheap
      map.repeat.set(opts.worldSize[0] / t.tileFt[0], opts.worldSize[1] / t.tileFt[1]);
      map.userData.tileFt = t.tileFt;
    } else {
      map.userData.tileFt = t.tileFt;
    }
    return new THREE.MeshLambertMaterial({ map, ...extra });
  };

  const transparentExtra: THREE.MeshLambertMaterialParameters = {
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  };

  const api: MaterialsApi = {
    palette: PALETTE,
    rawColor: (key) => resolve(key, 'hudInk'),
    color: (key) => new THREE.Color(resolve(key, 'hudInk')),
    grass: (opts) => material('grass', () => buildGrass(subRng(baseSeed, 'grass')), opts),
    dirt: (opts) => material('dirt', () => buildDirt(subRng(baseSeed, 'dirt')), opts),
    chalkLine: (opts) => material('chalkLine', () => buildChalkLine(subRng(baseSeed, 'chalkLine')), opts, transparentExtra),
    chalk: (opts) => material('chalkBase', () => buildChalkBase(subRng(baseSeed, 'chalkBase')), opts),
    wood: (color, opts) => {
      const hex = resolve(color, 'fenceTan');
      const key = `wood-${hex}-${opts?.weather ?? ''}`;
      return material(key, () => buildWood(subRng(baseSeed, key), { base: hex, weather: opts?.weather }), opts);
    },
    shedWood: (opts) =>
      material(
        'shedWood',
        () => buildWood(subRng(baseSeed, 'shedWood'), { base: PALETTE.woodShed, plankCount: 7, weather: 0.3 }),
        opts,
      ),
    siding: (color, opts) => {
      const hex = resolve(color, 'houseBlue');
      const key = `siding-${hex}`;
      return material(key, () => buildSiding(subRng(baseSeed, key), hex), opts);
    },
    roof: (color, opts) => {
      const hex = resolve(color, 'roofBlue');
      const key = `roof-${hex}-${opts?.moss ? 'moss' : ''}`;
      return material(key, () => buildRoof(subRng(baseSeed, key), hex, opts?.moss ?? false), opts);
    },
    bunting: (opts) => material('bunting', () => buildBunting(subRng(baseSeed, 'bunting')), opts, transparentExtra),
    foliage: (tone = 'tree', opts) =>
      material(`foliage-${tone}`, () => buildFoliage(subRng(baseSeed, `foliage-${tone}`), tone), opts),
    metal: (color, opts) => {
      const hex = resolve(color, 'metalTruck');
      const key = `metal-${hex}`;
      return material(key, () => buildMetal(subRng(baseSeed, key), hex), opts);
    },
    setWorldRepeat: (mat, wFt, hFt) => {
      const map = (mat as THREE.MeshLambertMaterial).map;
      const tile = map?.userData.tileFt as [number, number] | undefined;
      if (map && tile) map.repeat.set(wFt / tile[0], hFt / tile[1]);
    },
    canvasFor: (name) => texCache.get(name)?.canvas,
  };

  ctx.set('materials', api);

  // Self-retiring swatch board (see header). Checked at scene:ready, after all
  // subsystems have registered.
  ctx.on('scene:ready', () => {
    const fieldEmpty = !ctx.has('field') || Object.keys(ctx.get<object>('field') ?? {}).length === 0;
    if (!fieldEmpty) return;
    const swatches: Swatch[] = [
      { label: 'grass', material: api.grass({ worldSize: [26, 26] }) }, // 3+ mow bands visible
      { label: 'dirt', material: api.dirt({ worldSize: [6, 6] }) },
      { label: 'fence wood', material: api.wood(undefined, { worldSize: [4, 4] }) },
      { label: 'shed wood', material: api.shedWood({ worldSize: [4, 4] }) },
      { label: 'siding blue', material: api.siding('houseBlue', { worldSize: [4, 4] }) },
      { label: 'siding cream', material: api.siding('houseCream', { worldSize: [4, 4] }) },
      { label: 'roof moss', material: api.roof('roofBlue', { moss: true, worldSize: [5, 5] }) },
      { label: 'foliage', material: api.foliage('tree', { worldSize: [6, 6] }) },
      { label: 'hedge', material: api.foliage('hedge', { worldSize: [5, 5] }) },
      { label: 'metal', material: api.metal(undefined, { worldSize: [5, 5] }) },
      { label: 'chalk base', material: api.chalk({ worldSize: [3, 3] }) },
      { label: 'roof red', material: api.roof('roofRed', { worldSize: [5, 5] }) },
      // Strips read better wide: chalk line + bunting on their own row.
      { label: 'chalk line', material: api.chalkLine({ worldSize: [10, 2] }), aspect: 5.2 },
      { label: 'bunting', material: api.bunting({ worldSize: [8, 1.75] }), aspect: 5.2 },
    ];
    const scene = ctx.get<{ scene: THREE.Scene }>('render').scene;
    scene.add(makeSwatchBoard(swatches, [4.9, 6.0, -12.2]));
  });
}
