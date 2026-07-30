// ---------------------------------------------------------------------------
// The toon material. Render-side only.
//
// Two ingredients make the "toy-brand" read rather than "3D with a filter":
//   1. A hard, stepped light terminator (a 4-step gradient ramp) with zero
//      specular — so a head reads as a moulded plastic sphere, not a render.
//   2. A rim term, warm on the key side, that lifts a character off the grass.
//
// The warm-key / cool-shadow mix is deliberately the SAME mix v1's art uses
// (`src/art/fieldTexture.ts`'s lightenInt/shadeInt, and CharacterArt's GRAD
// stops): one upper-left warm key light, cool navy-mixed shadow. That
// continuity is why the 3D characters sit on the 2D-derived field texture
// without looking pasted on.
// ---------------------------------------------------------------------------

import {
  Color,
  DataTexture,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
  type Texture,
  UnsignedByteType,
} from 'three';

/** How many lighting steps the ramp quantises to. 4 is the toy-brand look;
 *  3 reads as cel-animation, 6+ starts to read as ordinary smooth shading. */
export const TOON_STEPS = 4;

/**
 * Steps for GROUND surfaces.
 *
 * ★ Not 4. A hard 4-step terminator is what makes a CURVED object read as
 * moulded plastic — it needs curvature to fall across. A large flat plane has
 * exactly one surface normal, so a 4-step ramp gives its entire 560ft expanse a
 * single flat lighting value and every scrap of variation has to come from
 * albedo. That is most of why flat-shaded ground reads as vinyl matting.
 *
 * 8 steps lets gentle shading gradients survive (including the normal
 * perturbation the turf shader adds) while still reading as stylised rather
 * than photoreal.
 */
export const GROUND_STEPS = 8;

const rampCache = new Map<number, DataTexture>();

/**
 * A stepped gradient ramp, built once per step count and shared.
 *
 * NearestFilter is load-bearing — with LinearFilter the steps blur back into a
 * smooth gradient and the whole look collapses.
 */
export function toonRamp(steps = TOON_STEPS): DataTexture {
  const cached = rampCache.get(steps);
  if (cached) return cached;

  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    // Bias the ramp so the lit plateau is wide and the terminator falls late:
    // a chibi character is mostly lit, with one confident shadow side.
    const t = (i + 1) / steps;
    const v = Math.round(255 * (0.34 + 0.66 * t * t));
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, steps, 1, RGBAFormat, UnsignedByteType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  rampCache.set(steps, tex);
  return tex;
}

export interface ToonOptions {
  color?: Color | number | string;
  map?: Texture | null;
  /** Rim light colour. Defaults to the warm key. */
  rimColor?: Color | number | string;
  /** 0 disables the rim. ~0.25 is the house value. */
  rimStrength?: number;
  /** Rim falloff exponent. Higher = tighter rim. */
  rimPower?: number;
  transparent?: boolean;
  opacity?: number;
  /** Lighting steps. Defaults to TOON_STEPS (4); ground uses GROUND_STEPS (8). */
  gradientSteps?: number;
  /** Marks the material for the selective-bloom pass on the `high` perf tier. */
  emissiveGlow?: boolean;
}

/** The warm key highlight (matches art/fieldTexture.ts `lightenInt`'s target). */
export const KEY_WARM = 0xfffae8;
/** The cool navy shadow (matches art/fieldTexture.ts `shadeInt`'s target). */
export const SHADE_COOL = 0x2c3e66;

/**
 * A toon material with a rim term injected.
 *
 * The rim is added via `onBeforeCompile` rather than a custom ShaderMaterial
 * so the material keeps three's whole built-in pipeline for free: skinning,
 * shadow receiving, fog, tone mapping, instancing. A hand-rolled
 * ShaderMaterial would have to re-implement every one of those.
 */
export function makeToonMaterial(opts: ToonOptions = {}): MeshToonMaterial {
  const mat = new MeshToonMaterial({
    color: new Color(opts.color ?? 0xffffff),
    map: opts.map ?? null,
    gradientMap: toonRamp(opts.gradientSteps ?? TOON_STEPS),
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });

  const rimStrength = opts.rimStrength ?? 0.25;
  const rimColor = new Color(opts.rimColor ?? KEY_WARM);

  if (rimStrength > 0) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRimColor = { value: rimColor };
      shader.uniforms.uRimStrength = { value: rimStrength };
      shader.uniforms.uRimPower = { value: opts.rimPower ?? 3.0 };

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform vec3  uRimColor;
           uniform float uRimStrength;
           uniform float uRimPower;`
        )
        // Inject after the lighting has resolved but before tone mapping, so
        // the rim reads as light rather than as a decal.
        .replace(
          '#include <opaque_fragment>',
          `{
             vec3 rimN = normalize( normal );
             vec3 rimV = normalize( vViewPosition );
             float rim = pow( 1.0 - saturate( dot( rimN, rimV ) ), uRimPower );
             outgoingLight += uRimColor * rim * uRimStrength;
           }
           #include <opaque_fragment>`
        );
    };
    // Materials that compile differently must not share a program cache slot.
    mat.customProgramCacheKey = () => `toon-rim-${rimStrength}-${rimColor.getHex()}`;
  }

  mat.userData.emissiveGlow = opts.emissiveGlow === true;
  return mat;
}
