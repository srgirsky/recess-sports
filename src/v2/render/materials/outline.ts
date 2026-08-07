// ---------------------------------------------------------------------------
// The outline. Render-side only.
//
// INVERTED HULL, not a post-process edge pass. The reasons, in order:
//
//   1. Cost. One extra draw call per outlined object, versus a full-screen
//      normal+depth prepass plus an edge-detect pass. On the A10 tablet in the
//      perf budget that difference is the whole margin.
//   2. Skinning comes free. The hull reuses three's skinning chunks, so a
//      SkinnedMesh outlines correctly with no extra work. A screen-space pass
//      has to reconstruct normals for skinned geometry.
//   3. Per-object control. The artist can taper an outline into a fingertip
//      via the vertex-colour alpha channel (see the asset contract's `mask`
//      G channel). A screen-space filter treats every edge identically, which
//      is exactly what makes cheap toon renders read as "3D with a filter"
//      rather than as toy-brand art.
//
// SCREEN-CONSTANT WIDTH is the other half. If the hull is offset by a fixed
// world distance, the outline thins to nothing on a distant outfielder and
// balloons on the batter. Offsetting in clip space by `w` cancels the
// perspective divide, so every character carries the same 2-2.5px contour no
// matter how deep they stand — which is what v1's flat art got for free and
// what a naive 3D port loses first.
// ---------------------------------------------------------------------------

import { BackSide, Color, Mesh, Object3D, ShaderMaterial, SkinnedMesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The character-art contour colour. Shared with the CSS `--outline` token. */
export const OUTLINE_COLOR = 0x26333f;

/** Outline width in CSS pixels. Tablets get a slightly thinner line so the
 *  contour doesn't swallow a small character at 1.5x DPR. */
export const OUTLINE_PX_DESKTOP = 2.5;
export const OUTLINE_PX_TABLET = 2.0;

const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>

uniform float uWidthPx;
uniform float uViewportPx;

#ifdef USE_OUTLINE_VCOL
  attribute vec4 color;
#endif

void main() {
  // Normal, through the skin matrix when this is a SkinnedMesh.
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>

  // Position, through the same skin matrix.
  #include <begin_vertex>
  #include <skinning_vertex>

  vec3 viewNormal = normalize( normalMatrix * objectNormal );
  vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
  vec4 clip       = projectionMatrix * mvPosition;

  // Project the normal to NDC and step along it. Multiplying by clip.w undoes
  // the perspective divide, making the offset constant in SCREEN pixels.
  vec3 ndcNormal = normalize( ( projectionMatrix * vec4( viewNormal, 0.0 ) ).xyz );

  float w = uWidthPx;
  #ifdef USE_OUTLINE_VCOL
    // Vertex-colour alpha tapers the contour (asset contract: mask.G).
    w *= color.a;
  #endif

  clip.xy += ndcNormal.xy * ( w * 2.0 / uViewportPx ) * clip.w;
  gl_Position = clip;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4( uColor, 1.0 );
  #include <colorspace_fragment>
}
`;

export interface OutlineOptions {
  color?: number;
  /** Width in CSS pixels. */
  widthPx?: number;
  /** Read vertex-colour alpha to modulate width (needs a `color` attribute). */
  useVertexTaper?: boolean;
}

/**
 * The hull material. `uViewportPx` must be kept in sync with the drawing
 * buffer height — `OutlineRegistry.setViewportHeight` does that centrally so
 * no call site can forget and quietly ship a resolution-dependent outline.
 */
export function makeOutlineMaterial(opts: OutlineOptions = {}): ShaderMaterial {
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uColor: { value: new Color(opts.color ?? OUTLINE_COLOR) },
      uWidthPx: { value: opts.widthPx ?? OUTLINE_PX_DESKTOP },
      uViewportPx: { value: 1080 },
    },
    side: BackSide, // the inversion: we see only the backfaces, as a shell
    fog: false,
  });
  if (opts.useVertexTaper) mat.defines.USE_OUTLINE_VCOL = '';
  return mat;
}

/**
 * Tracks every outline material so viewport height (and therefore outline
 * width) stays correct across resizes and dynamic-resolution changes.
 */
export class OutlineRegistry {
  private mats: ShaderMaterial[] = [];
  private heightPx = 1080;
  private widthPx = OUTLINE_PX_DESKTOP;

  create(opts: OutlineOptions = {}): ShaderMaterial {
    const mat = makeOutlineMaterial({ widthPx: this.widthPx, ...opts });
    mat.uniforms.uViewportPx.value = this.heightPx;
    this.mats.push(mat);
    return mat;
  }

  /** Call on resize AND whenever dynamic resolution changes the render scale. */
  setViewportHeight(px: number): void {
    this.heightPx = px;
    for (const m of this.mats) m.uniforms.uViewportPx.value = px;
  }

  setWidth(px: number): void {
    this.widthPx = px;
    for (const m of this.mats) m.uniforms.uWidthPx.value = px;
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    this.mats.length = 0;
  }
}

/**
 * Build the hull for a mesh: same geometry, backside shell material.
 *
 * ★ THE HULL IS A SIBLING, NEVER A CHILD — and for a SkinnedMesh that is a
 * correctness requirement, not a preference.
 *
 * A SkinnedMesh's vertices are posed by the skeleton's bone matrices and then
 * by its own `matrixWorld`. Parent a skinned hull UNDER the skinned mesh and
 * it inherits that already-posed world matrix and then applies the skinning a
 * second time — the shell explodes to many times the character's size and
 * swallows them whole. (Observed: every kid on the field rendered as a solid
 * navy blob.) Adding the hull alongside the mesh, under the same parent, means
 * both get exactly the same world transform and the same bone matrices, once.
 *
 * A plain Mesh would tolerate being a child, but it uses the same path here so
 * there is only one rule to remember.
 */
export function attachOutline(
  mesh: Mesh | SkinnedMesh,
  registry: OutlineRegistry,
  opts: OutlineOptions = {}
): Mesh {
  const material = registry.create(opts);
  let hull: Mesh;

  if ((mesh as SkinnedMesh).isSkinnedMesh) {
    const src = mesh as SkinnedMesh;
    const skinned = new SkinnedMesh(src.geometry, material);
    // Share the SAME skeleton object, so the hull can never lag a frame
    // behind the character it is outlining.
    skinned.bind(src.skeleton, src.bindMatrix);
    hull = skinned;
  } else {
    hull = new Mesh(mesh.geometry, material);
  }

  hull.name = `${mesh.name || 'mesh'}__outline`;
  hull.castShadow = false;
  hull.receiveShadow = false;
  // The hull must not be picked, or counted as geometry by anything walking
  // the scene for gameplay purposes.
  hull.userData.isOutline = true;
  hull.raycast = () => {};

  const parent = mesh.parent;
  if (!parent) {
    throw new Error(
      'attachOutline: the mesh must already be in the scene graph — the hull is added as its SIBLING'
    );
  }
  hull.position.copy(mesh.position);
  hull.quaternion.copy(mesh.quaternion);
  hull.scale.copy(mesh.scale);
  parent.add(hull);
  return hull;
}

/**
 * One hull around several compatible skinned primitives.
 *
 * Material slots need separate colour draws, but their inner outline shells
 * are completely hidden. Generated roster models share a skeleton, transform
 * and attribute layout, so their geometries can be merged for the contour
 * without changing the delivery's four-slot contract. Returns null for a
 * general artist delivery that is not merge-compatible; callers then use the
 * ordinary per-mesh path.
 */
export function attachMergedOutline(
  meshes: readonly SkinnedMesh[],
  parent: Object3D,
  registry: OutlineRegistry,
  opts: OutlineOptions = {}
): SkinnedMesh | null {
  if (meshes.length < 2) return null;
  const first = meshes[0];
  if (
    meshes.some(
      (mesh) =>
        mesh.skeleton !== first.skeleton ||
        !mesh.position.equals(first.position) ||
        !mesh.quaternion.equals(first.quaternion) ||
        !mesh.scale.equals(first.scale)
    )
  ) {
    return null;
  }

  const copies = meshes.map((mesh) => mesh.geometry.clone());
  const geometry = mergeGeometries(copies, false);
  for (const copy of copies) copy.dispose();
  if (!geometry) return null;

  const hull = new SkinnedMesh(geometry, registry.create(opts));
  hull.bind(first.skeleton, first.bindMatrix);
  hull.name = `${parent.name || 'mesh'}__outline`;
  hull.position.copy(first.position);
  hull.quaternion.copy(first.quaternion);
  hull.scale.copy(first.scale);
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.userData.isOutline = true;
  hull.raycast = () => {};
  parent.add(hull);
  return hull;
}
