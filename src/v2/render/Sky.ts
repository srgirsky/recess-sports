// ---------------------------------------------------------------------------
// Sky dome. Render-side only.
//
// An inverted sphere with a two-stop vertical gradient, rendered on the BackSide
// with depth-write off so it never occludes anything and never needs sorting.
// Cheaper than a cubemap, needs no texture download, and the two stops are just
// colours — which means a venue (or a night game) restyles it for free.
// ---------------------------------------------------------------------------

import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform vec3  uTop;
uniform vec3  uBottom;
uniform float uRadius;
varying vec3  vWorld;
void main() {
  // Bias the blend so the horizon band sits low and the sky reads open — a
  // linear ramp puts the transition halfway up and looks like a backdrop.
  float t = clamp( vWorld.y / ( uRadius * 0.55 ), 0.0, 1.0 );
  gl_FragColor = vec4( mix( uBottom, uTop, pow( t, 0.65 ) ), 1.0 );
  #include <colorspace_fragment>
}
`;

/**
 * The daytime palette, exported because FOG MUST MATCH THE HORIZON — aerial
 * haze is the horizon colour thickening with distance, so a fog authored apart
 * from the sky splits into a visible seam at the fence line. Every `new Fog`
 * cites `SKY_HORIZON` instead of restating it.
 *
 * Vivid on purpose (BB2026's sky band is a saturated cyan-blue; the first
 * values here read gray-lavender in every screenshot) — see
 * `docs/research/backyard-2026-reference.md` item 2.
 */
export const SKY_TOP = 0x3d92e0;
export const SKY_HORIZON = 0xb9e4fa;
/** The evening palette. The horizon is the brand's own cool-shadow tone
 *  (`SHADE_COOL` in materials/toon.ts) — night IS the shadow mix, full-frame,
 *  which is what keeps the toon art reading as one piece after dark. */
export const NIGHT_TOP = 0x101c34;
export const NIGHT_HORIZON = 0x2c3e66;

/**
 * The dome's radius, in feet. Exported because THE CAMERA'S FAR PLANE MUST
 * REACH PAST IT from wherever a rig stands: a far plane equal to the radius
 * clips the dome's far side for any eye that is not at the origin, and what
 * shows through the clip is the WebGL clear colour — a flat black wedge on
 * the horizon behind CF from the FIELD and DEEP rigs (2026-09-01, the
 * presentation smoke's fielded beat). `cameraCues.CAMERA_FAR_FT` cites this.
 */
export const SKY_RADIUS_FT = 900;

export function buildSky(topHex = SKY_TOP, bottomHex = SKY_HORIZON, radius = SKY_RADIUS_FT): Mesh {
  const geom = new SphereGeometry(radius, 24, 16);
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTop: { value: new Color(topHex) },
      uBottom: { value: new Color(bottomHex) },
      uRadius: { value: radius },
    },
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new Mesh(geom, mat);
  mesh.name = 'sky';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return mesh;
}
