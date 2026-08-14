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
//
// ★ THE FACE ATLAS SURVIVED BLENDER AND DIED HERE, AND IT WAS AN ORDERING BUG.
//
// Kept because it cost many rounds and because the way it was NARROWED is the
// reusable part. The symptom: every kid's eyes rendered as two solid dark blobs
// at runtime, deleting most of what a face does at hero scale.
//
// The asset was never the problem, and establishing that was real work:
//   · the atlas embedded in `kid_tank.glb` is byte-identical to
//     `assets/v2/source/tank-face-atlas.png` — 0 differing pixels;
//   · the atlas itself carries the sclera at rgb(255, 250, 240);
//   · Blender renders the SAME GLB with the sclera plainly there — the
//     brightest neutral pixel in `tank-front-review.png`'s eye band is
//     rgb(214, 212, 210);
//   · the runtime rendered that band with a brightest neutral of
//     rgb(121, 109, 97), which is skin.
//
// ★ WHAT IT ACTUALLY WAS. The composite was injected after `<map_fragment>`,
// and `meshtoon.glsl.js` runs `<color_fragment>` on the very next line — which
// is `diffuseColor *= vColor`. So the atlas was mixed in and then multiplied by
// the identity palette underneath it. White × skin = skin, exactly. See the
// injection site below.
//
// ★ AND WHY THE NARROWING POINTED AT THE RAMP AND THE LIGHT RIG, WRONGLY. The
// decisive A/B found that saturated ink survived while white converged on skin,
// and that was read as a filmic shoulder — a plausible story that cost a whole
// tone-mapping experiment. But white converging on skin EXACTLY is not a
// shoulder, it is a multiply: a shoulder compresses everything and this
// preserved magenta and green untouched. An identity is a much stronger clue
// than a compression, and it was in hand the whole time.
//
// ⚠️ THE RAMP IS EXONERATED — do not spend a round on it. `toonRamp`'s top step
// is exactly 1.0, so a fully-lit white texel is multiplied by 1.0 and reaches
// the plateau intact. Nothing in the ramp can darken it.
//
// Still true, and worth not re-testing: the atlas content, the exporter, the
// embedded texture, mipmap filtering (pixel-identical) and iris geometry were
// all eliminated. ACES was a true negative FOR THIS DEFECT — though it is a
// real defect of its own for pale garment colour, which is a separate matter.
//
// This fix re-rendered every character, so approved Junebug's board hash moved
// and she was demoted to `candidate` pending re-approval on the better board;
// see `assets/v2/source/character-fidelity.json`.
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
  /**
   * The 4x4 expression atlas (asset contract §4). `M_Body` only.
   *
   * Requires `map`: the atlas replaces the albedo inside the face UV island,
   * and without an albedo three defines no UV varying to test against.
   */
  faceAtlas?: Texture | null;
}

/**
 * ★ The face UV island, from the asset contract §4: "Face UVs must occupy their
 * own island covering UV [0..0.5, 0.5..1]."
 *
 * That rule is what makes an expression a uniform write. The face owns a known
 * rectangle of the body's UV space, so the shader can tell "this fragment is
 * face" from the UV alone — no second mesh, no submaterial, no morph target,
 * and no per-character shader.
 */
export const FACE_ISLAND = { u0: 0.0, v0: 0.5, u1: 0.5, v1: 1.0 } as const;

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
  const faceAtlas = opts.faceAtlas ?? null;

  if (faceAtlas && !opts.map) {
    // Refuse rather than render a black face. three names its UV varying after
    // the map that needs it (`vMapUv`), so with no albedo there is nothing to
    // test the island against — and the failure would be a compile error deep
    // in a generated shader rather than this sentence.
    throw new Error(
      'makeToonMaterial: faceAtlas needs map — the atlas replaces the albedo inside the face UV island'
    );
  }

  if (rimStrength > 0 || faceAtlas) {
    mat.onBeforeCompile = (shader) => {
      if (faceAtlas) {
        shader.uniforms.uFaceAtlas = { value: faceAtlas };
        // xy = cell offset, zw = cell size. `faceAtlas.ts` computes it; the
        // default is the resting cell, so an un-driven face is not a blank one.
        shader.uniforms.uFaceCell = {
          value: (mat.userData.faceCell as [number, number, number, number] | undefined) ?? faceCellDefault(),
        };

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
             uniform sampler2D uFaceAtlas;
             uniform vec4 uFaceCell;`
          )
          // ★ AFTER <color_fragment>, NOT AFTER <map_fragment>, AND THAT WAS THE
          // WHOLE BUG. `meshtoon.glsl.js` runs the two on consecutive lines:
          //
          //     #include <map_fragment>     diffuseColor *= texture2D( map, … )
          //     #include <color_fragment>   diffuseColor *= vColor
          //
          // Every authored `M_Body` runs `vertexColors = true` —
          // `CharacterModel.collapseVertexPalette` merges the whole kid onto
          // this material and puts the identity palette in `COLOR_0` — and
          // `COLOR_0` is a normalised VEC4, so that second line takes the
          // `USE_COLOR_ALPHA` branch and it is a MULTIPLY.
          //
          // Composited one chunk earlier, the atlas was mixed in and then
          // multiplied by the skin underneath it: white × skin = skin, EXACTLY.
          // That identity is why a face rendered with no eye whites, and why
          // the live A/B that painted an opaque white block over the eye found
          // it indistinguishable from skin while magenta stayed magenta and
          // green stayed green — a saturated texel times skin is still a
          // saturated texel, and only white maps onto its multiplier.
          //
          // Blender's board mixes the vertex colour WITH the atlas and stops
          // (`render-fidelity-views.py`'s `ShaderNodeMix`). This is that graph.
          // `Field.ts` already hooks the same chunk for the same reason.
          //
          // Safe without a palette: <color_fragment> expands to NOTHING when
          // `USE_COLOR`/`USE_COLOR_ALPHA` are undefined, and this block never
          // mentions `vColor`, so a proxy or a delivery with no `COLOR_0`
          // compiles exactly as before. `faceAtlas.test.ts` asserts that rather
          // than trusting this sentence.
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
             {
               // The face owns UV [0..0.5, 0.5..1] by contract (§4).
               vec2 island = ( vMapUv - vec2( ${FACE_ISLAND.u0.toFixed(1)}, ${FACE_ISLAND.v0.toFixed(1)} ) )
                           / vec2( ${(FACE_ISLAND.u1 - FACE_ISLAND.u0).toFixed(1)}, ${(FACE_ISLAND.v1 - FACE_ISLAND.v0).toFixed(1)} );
               if ( all( greaterThanEqual( island, vec2( 0.0 ) ) ) && all( lessThanEqual( island, vec2( 1.0 ) ) ) ) {
                 // NOT sRGBTransferEOTF'd, for the same reason <map_fragment>
                 // does not decode its own sample: the texture is uploaded as
                 // SRGB8_ALPHA8 and the SAMPLER decodes it. Decoding again in
                 // the shader would wash every face out.
                 vec2 faceUv = uFaceCell.xy + island * uFaceCell.zw;
                 // GLTFLoader keeps embedded textures at flipY=false, while
                 // faceCellUv is deliberately expressed in ordinary bottom-
                 // origin atlas coordinates. Cross that boundary exactly once
                 // here; otherwise every expression is upside down in its cell.
                 faceUv.y = 1.0 - faceUv.y;
                 vec4 faceTexel = texture2D( uFaceAtlas, faceUv );
                 // Alpha lets a cell leave skin showing through — an expression
                 // is eyes and a mouth, not a repaint of the whole head.
                 diffuseColor.rgb = mix( diffuseColor.rgb, faceTexel.rgb, faceTexel.a );
               }
             }`
          );
      }

      if (rimStrength > 0) {
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
      }

      // The one handle on the compiled program. Without it `setFaceCell` would
      // have nothing to write to: `onBeforeCompile`'s `shader` is not reachable
      // from the material afterwards.
      mat.userData.shader = shader;
    };
    // Materials that compile differently must not share a program cache slot —
    // and a face material and a jersey material differ by a whole texture read.
    mat.customProgramCacheKey = () =>
      `toon-rim-${rimStrength}-${rimColor.getHex()}-face-${faceAtlas ? faceAtlas.uuid : 'none'}`;
  }

  mat.userData.emissiveGlow = opts.emissiveGlow === true;
  mat.userData.hasFaceAtlas = faceAtlas !== null;
  return mat;
}

/** The resting cell's UV transform, as a plain tuple (no three import here). */
function faceCellDefault(): [number, number, number, number] {
  // Top-left cell = `neutral`. Duplicated as literals rather than imported so
  // `materials/` keeps its one-way dependency on nothing above it; the value is
  // pinned against `faceAtlas.faceCellUv('neutral')` by a test.
  return [0, 0.75, 0.25, 0.25];
}

/**
 * Point a body material at an expression cell.
 *
 * A no-op on a material with no atlas (a proxy, or a model delivered without
 * the optional `face_atlas` map) — callers should not have to ask, and an
 * expression that silently does nothing is the correct behaviour for a kid who
 * has no face to change.
 */
export function setFaceCell(
  material: MeshToonMaterial,
  cell: readonly [number, number, number, number]
): void {
  // CharacterModel sets the resting face before the first render compiles the
  // shader. Persist it on the material as well as updating a live uniform, or
  // every kid boots with neutral and only later reactions work.
  material.userData.faceCell = [...cell];
  const shader = material.userData.shader as { uniforms?: Record<string, { value: unknown }> } | undefined;
  const uniform = shader?.uniforms?.uFaceCell;
  if (uniform) uniform.value = [...cell];
}
