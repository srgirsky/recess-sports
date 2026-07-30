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

export function buildSky(topHex = 0x3f8fd4, bottomHex = 0xcfe9f7, radius = 900): Mesh {
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
