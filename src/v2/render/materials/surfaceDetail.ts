// ---------------------------------------------------------------------------
// Surface detail for the neighbourhood, REAL look only. Render-side only.
//
// The neighbourhood is ONE merged mesh with a colour per vertex and no UVs: a
// house wall is a flat rectangle of one colour, a tree a flat-coloured blob.
// Under the toon look that was the point. Under the real one it is the single
// thing that still says "toy" in every frame, because nothing built by people
// or grown is one colour edge to edge.
//
// There are no UVs to hang a texture on and adding them would mean touching
// every builder, so the detail is PROCEDURAL and keyed on what the fragment
// already knows — its world position, its world normal and its own colour:
//
//   upright + not green  -> a wall:  lapped siding, a shadow under each board
//   pitched + not green  -> a roof:  shingle courses, staggered
//   green                -> foliage: clumps of lighter and darker leaf
//   everything           -> a darker foot where it meets the ground, and a
//                           little low-frequency weathering
//
// "Green" is read from the colour because the mesh carries nothing else. It is
// a heuristic and it is allowed to be wrong: a green house gets leaf mottling
// instead of boards, which still reads as paint rather than as plastic.
//
// Every line pattern is faded by its own screen-space derivative, so a course
// narrower than a pixel dissolves into its mean value instead of shimmering —
// the same rule the park's plank wall follows (Fence.ts).
// ---------------------------------------------------------------------------

import type { MeshToonMaterial } from 'three';

const VERT_DECL = /* glsl */ `
varying vec3 vSdPos;
varying vec3 vSdNormal;`;

const VERT_BODY = /* glsl */ `
  vSdPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
  vSdNormal = normalize( mat3( modelMatrix ) * normal );`;

const FRAG_DECL = /* glsl */ `
varying vec3 vSdPos;
varying vec3 vSdNormal;
float sdHash( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}
float sdNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( sdHash( i ), sdHash( i + vec2( 1.0, 0.0 ) ), f.x ),
    mix( sdHash( i + vec2( 0.0, 1.0 ) ), sdHash( i + vec2( 1.0, 1.0 ) ), f.x ),
    f.y );
}`;

const FRAG_BODY = /* glsl */ `
  {
    vec3 sdC = diffuseColor.rgb;
    float sdUp = vSdNormal.y;
    // Along-the-wall coordinate: whichever horizontal axis the face runs in.
    float sdAlong = abs( vSdNormal.x ) > abs( vSdNormal.z ) ? vSdPos.z : vSdPos.x;

    float sdLeafy = smoothstep( 0.50, 0.70, ( sdC.g - max( sdC.r, sdC.b ) ) / max( sdC.g, 0.001 ) );
    float sdBuilt = 1.0 - sdLeafy;
    float sdWall = sdBuilt * ( 1.0 - smoothstep( 0.15, 0.40, abs( sdUp ) ) );
    float sdRoof = sdBuilt * smoothstep( 0.25, 0.50, sdUp ) * ( 1.0 - smoothstep( 0.90, 0.97, sdUp ) );

    // ---- Siding: a board every 0.6ft, each lapping the one below. ---------
    float sdBoard = vSdPos.y / 0.6;
    float sdBf = fract( sdBoard );
    float sdBw = fwidth( sdBoard );
    float sdLap = 1.0 - smoothstep( 0.0, 0.14 + sdBw, sdBf );      // shadow under the lap
    float sdTilt = sdBf * 0.07;                                     // the board leans into light
    float sdTone = ( sdHash( vec2( floor( sdBoard ), floor( sdAlong / 7.0 ) ) ) - 0.5 ) * 0.07;
    float sdSiding = 1.0 - sdLap * 0.26 + sdTilt + sdTone;
    sdSiding = mix( sdSiding, 0.99, smoothstep( 0.35, 1.1, sdBw ) );
    sdC *= mix( 1.0, sdSiding, sdWall );

    // ---- Shingles: courses up the slope, every other one offset. ----------
    float sdCourse = vSdPos.y / 0.42;
    float sdRow = floor( sdCourse );
    float sdCf = fract( sdCourse );
    float sdCw = fwidth( sdCourse );
    float sdTab = sdAlong / 0.9 + mod( sdRow, 2.0 ) * 0.5;
    float sdTf = fract( sdTab );
    float sdTw = fwidth( sdTab );
    float sdCourseLine = 1.0 - smoothstep( 0.0, 0.16 + sdCw, sdCf );
    float sdTabLine = 1.0 - smoothstep( 0.0, 0.06 + sdTw, min( sdTf, 1.0 - sdTf ) );
    float sdTabTone = ( sdHash( vec2( floor( sdTab ), sdRow ) ) - 0.5 ) * 0.16;
    float sdShingle = 1.0 - sdCourseLine * 0.30 - sdTabLine * 0.16 + sdTabTone;
    sdShingle = mix( sdShingle, 0.94, smoothstep( 0.35, 1.1, max( sdCw, sdTw ) ) );
    sdC *= mix( 1.0, sdShingle, sdRoof );

    // ---- Foliage: clumps, and a darker underside. --------------------------
    vec2 sdLp = vSdPos.xz + vSdPos.y * vec2( 0.61, 0.37 );
    float sdClump = sdNoise( sdLp * 0.55 ) * 0.55 + sdNoise( sdLp * 1.9 ) * 0.30 + sdNoise( sdLp * 6.5 ) * 0.15;
    float sdLeaf = 0.70 + sdClump * 0.62;
    sdLeaf *= mix( 0.74, 1.06, smoothstep( -0.5, 0.7, sdUp ) );
    // Warm the lit clumps a touch: sun through leaves is yellow-green.
    vec3 sdLeafTint = mix( vec3( 0.92, 1.0, 1.04 ), vec3( 1.07, 1.03, 0.86 ), sdClump );
    sdC = mix( sdC, sdC * sdLeaf * sdLeafTint, sdLeafy );

    // ---- Everything: weathering, and a darker foot at the ground. ----------
    float sdWeather = sdNoise( vec2( sdAlong * 0.31, vSdPos.y * 0.23 ) ) - 0.5;
    sdC *= 1.0 + sdWeather * 0.10 * sdBuilt;
    float sdFoot = smoothstep( 0.0, 3.2, vSdPos.y );
    sdC *= mix( 0.74, 1.0, mix( 1.0, sdFoot, 1.0 - smoothstep( 0.5, 0.9, sdUp ) ) );

    diffuseColor.rgb = sdC;
  }`;

/**
 * Chain the neighbourhood detail onto a toon material's own compile hook.
 * Call AFTER `makeToonMaterial`; the toon hook runs first, as in Fence.ts.
 */
export function addSurfaceDetail(mat: MeshToonMaterial): void {
  const toonCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    toonCompile.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${FRAG_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${FRAG_BODY}`);
  };
  const toonKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => `${toonKey.call(mat)}-surface-detail`;
}
