// ---------------------------------------------------------------------------
// The 3D field. Render-side only — reads sim/field.ts, never writes it.
//
// Two surfaces, split by what each is good at:
//
//   TURF is one mesh with a procedural grass shader. Because it is keyed
//   on WORLD position, the mow bands converge under a real perspective camera
//   for free — v1 had to hand-build converging trapezoids through its affine
//   projection and could never get the far end right.
//
//   The INFIELD OVERLAY is a canvas texture drawn by the SHARED, already
//   deterministic `art/fieldTexture.ts` kit: speckled dirt and worn hand-limed
//   chalk. It draws DIRT ONLY and erases itself where grass belongs, so the
//   infield grass IS the turf shader. Largest piece of v1 art surviving the
//   engine change unmodified, determinism test included.
//
// Chalk beyond the infield square is real geometry rather than texture,
// because a foul line that runs 185ft to the pole would be 2px wide in any
// texture we can afford, and a fuzzy foul line is the one thing on this field
// a 6-year-old actually uses to judge fair from foul.
// ---------------------------------------------------------------------------

import {
  BoxGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshToonMaterial,
  PlaneGeometry,
  Vector2,
} from 'three';
import {
  BACKSTOP_Z,
  FIRST,
  HOME,
  MOUND,
  MOUND_DIST,
  SECOND,
  THIRD,
  type FieldGeometry,
  type Vec2,
  fenceDistAt,
  pointAt,
} from '../sim/field';
import { CanvasTexGraphics, makeFieldCanvas, toTexture } from './canvasTex';
import { chalkLine, chalkRect, hash01, lightenInt, shadeInt, speckleEllipse } from '../../art/fieldTexture';
import { GROUND_STEPS, makeToonMaterial } from './materials/toon';
import type { OutlineRegistry } from './materials/outline';
import { attachOutline } from './materials/outline';

// --- The venue's look (the v2 heir to v1's `data/venues.ts` `look` block) ----

export interface VenueLook {
  grass: number;
  grassDark: number;
  dirt: number;
  fence: number;
  fenceTrim: number;
  mowPattern: 'stripes' | 'checker' | 'tufts' | 'court';
}

export const VENUE_LOOKS: Record<string, VenueLook> = {
  park: {
    grass: 0x5bbf5a,
    grassDark: 0x4aa84a,
    dirt: 0xc98a4b,
    fence: 0x2e7d4f,
    fenceTrim: 0xffce3a,
    mowPattern: 'checker',
  },
  sandlot: {
    grass: 0x71b356,
    grassDark: 0x60a24a,
    dirt: 0xb97f45,
    fence: 0x8a5a33,
    fenceTrim: 0x6d4426,
    mowPattern: 'tufts',
  },
  blacktop: {
    grass: 0x4a4f5a,
    grassDark: 0x42474f,
    dirt: 0x5a606c,
    fence: 0x9aa4ad,
    fenceTrim: 0x7b8790,
    mowPattern: 'court',
  },
};

// --- Real dimensions, in feet -----------------------------------------------

const BASE_SIZE = 15 / 12; // a 15-inch bag
const BASE_THICK = 3 / 12;
const PLATE_W = 17 / 12;
const MOUND_RADIUS = 5; // Little League: a 10ft circle
const MOUND_HEIGHT = 6 / 12;
const CHALK_W = 4 / 12;

/** How far the infield overlay texture reaches, ft. */
const OVERLAY_HALF = 75;
const OVERLAY_MIN_Z = -25;
const OVERLAY_MAX_Z = 125;

/** Layer heights — small, distinct, and ordered so nothing z-fights. */
const Y_TURF = 0;
const Y_OVERLAY = 0.02;
const Y_CHALK = 0.03;
const Y_BASE = 0.04;

export interface FieldBuild {
  root: Group;
  /** Everything a shadow may fall on. */
  receivers: Mesh[];
  dispose(): void;
}

export function buildField(
  geo: FieldGeometry,
  look: VenueLook,
  outlines: OutlineRegistry,
  opts: { anisotropy?: number } = {}
): FieldBuild {
  const root = new Group();
  root.name = 'venue';
  const disposers: Array<() => void> = [];

  // ---- Turf ---------------------------------------------------------------
  const turf = buildTurf(look);
  turf.position.y = Y_TURF;
  turf.receiveShadow = true;
  root.add(turf);
  disposers.push(() => turf.geometry.dispose());

  // ---- Infield overlay (the shared fieldTexture kit) ----------------------
  const overlay = buildInfieldOverlay(look, opts.anisotropy ?? 4);
  overlay.position.set(0, Y_OVERLAY, (OVERLAY_MIN_Z + OVERLAY_MAX_Z) / 2);
  overlay.receiveShadow = true;
  root.add(overlay);
  disposers.push(() => {
    overlay.geometry.dispose();
    (overlay.material as MeshToonMaterial).map?.dispose();
  });

  // ---- Foul lines out to the poles (geometry, not texture) ---------------
  for (const side of [-1, 1] as const) {
    const line = buildFoulLine(geo, side);
    root.add(line);
    disposers.push(() => line.geometry.dispose());
  }

  // ---- The mound dome ----------------------------------------------------
  const mound = buildMound(look);
  mound.position.set(MOUND.x, Y_TURF, MOUND.z);
  mound.receiveShadow = true;
  mound.castShadow = true;
  root.add(mound);
  disposers.push(() => mound.geometry.dispose());

  // ---- Bases + plate -----------------------------------------------------
  for (const p of [FIRST, SECOND, THIRD]) {
    const bag = buildBase();
    bag.position.set(p.x, Y_BASE + BASE_THICK / 2, p.z);
    root.add(bag);
    attachOutline(bag, outlines);
    disposers.push(() => bag.geometry.dispose());
  }
  const plate = buildHomePlate();
  plate.position.set(HOME.x, Y_BASE, HOME.z);
  root.add(plate);
  attachOutline(plate, outlines);
  disposers.push(() => plate.geometry.dispose());

  const receivers = [turf, overlay, mound];

  return {
    root,
    receivers,
    dispose() {
      for (const d of disposers) d();
    },
  };
}

// --- Turf -------------------------------------------------------------------

/**
 * One plane; the mow pattern is computed per-FRAGMENT from world position.
 *
 * ★ Not vertex colours. A mow stripe is a hard edge, and a vertex-colour
 * checker interpolates that edge across a whole cell — at any triangle density
 * we can afford it reads as a soft quilt rather than cut grass. Getting a crisp
 * edge from vertex colours would need a segment size far smaller than the
 * stripe (~1ft => 600k triangles for this plane, three times the entire
 * triangle budget). In the fragment shader it is exact, free, and the plane
 * stays 128 triangles.
 *
 * Because the pattern is keyed on WORLD position, the stripes converge under
 * the perspective camera automatically. v1 had to hand-build converging
 * trapezoids through its affine projection and could never get the far end
 * right — this is one of the places 3D simply deletes a category of work.
 */
function buildTurf(look: VenueLook): Mesh {
  const W = 560;
  const D = 400;

  const geom = new PlaneGeometry(W, D, 8, 8);
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, 0, D / 2 - 80); // home sits 80ft from the near edge

  const mat = makeToonMaterial({
    color: 0xffffff,
    rimStrength: 0,
    // 8 steps, not 4 — see GROUND_STEPS. A flat plane under a 4-step ramp is
    // ONE flat lighting value across 560ft, which is most of why cheap 3D
    // ground reads as vinyl matting.
    gradientSteps: GROUND_STEPS,
  });

  const light = new Color(look.grass).convertSRGBToLinear();
  // The venue's `grassDark` is the ART palette's SHADOW tone — a ~35% step,
  // correct for a flat 2D fill and far too strong for turf variation. Pull it
  // most of the way back; the visible contrast now comes from sheen and noise,
  // not from two different greens.
  const dark = new Color(look.grass).lerp(new Color(look.grassDark), 0.3).convertSRGBToLinear();
  const mode = { stripes: 0, checker: 1, tufts: 2, court: 3 }[look.mowPattern];

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLight = { value: light };
    shader.uniforms.uDark = { value: dark };
    shader.uniforms.uMode = { value: mode };
    shader.uniforms.uCell = { value: 17 }; // ft — a real mower width

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWorldPos;
         uniform vec3  uLight;
         uniform vec3  uDark;
         uniform float uMode;
         uniform float uCell;

         float h21( vec2 p ) {
           return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
         }
         // Smooth value noise. Real turf varies at several scales at once and
         // a single frequency always reads as a pattern rather than as ground.
         float vnoise( vec2 p ) {
           vec2 i = floor( p ), f = fract( p );
           vec2 u = f * f * ( 3.0 - 2.0 * f );
           return mix( mix( h21( i ),                h21( i + vec2( 1.0, 0.0 ) ), u.x ),
                       mix( h21( i + vec2( 0.0, 1.0 ) ), h21( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
         }
         float fbm( vec2 p ) {
           float v = 0.0, a = 0.5;
           for ( int i = 0; i < 4; i++ ) { v += a * vnoise( p ); p *= 2.03; a *= 0.5; }
           return v;
         }

         /**
          * ★ A mow stripe is VIEW-DEPENDENT, not painted on.
          *
          * Mowing bends the blades; a band bent toward you scatters light back
          * and reads bright, a band bent away reads dark. Which is why real
          * stripes SWAP as you walk around a field, and why a fixed albedo
          * checker — however well tuned — always reads as a printed mat. This
          * returns a signed sheen from the dot of the view direction with the
          * band's lean direction.
          */
         float mowSheen( vec2 wxz, vec2 dir, float cell, vec2 viewXZ ) {
           float band = sin( dot( wxz, dir ) / cell * 3.14159265 );
           // Soft, not stepped: a mower leaves a blended edge a foot or two wide.
           float lean = smoothstep( -0.5, 0.5, band ) * 2.0 - 1.0;
           return dot( viewXZ, dir ) * lean;
         }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           vec2  wxz  = vWorldPos.xz;
           vec3  toCam = cameraPosition - vWorldPos;
           float dist  = length( toCam );
           vec2  viewXZ = normalize( toCam.xz + vec2( 1e-5 ) );

           // --- Mow sheen -------------------------------------------------
           float sheen;
           if ( uMode < 0.5 ) {
             sheen = mowSheen( wxz, vec2( 0.0, 1.0 ), uCell, viewXZ );
           } else if ( uMode < 1.5 ) {
             // A checkerboard is two perpendicular mowing passes, so it is two
             // sheen terms — not one albedo XOR.
             sheen = 0.5 * ( mowSheen( wxz, vec2( 0.0, 1.0 ), uCell, viewXZ )
                           + mowSheen( wxz, vec2( 1.0, 0.0 ), uCell, viewXZ ) );
           } else if ( uMode < 2.5 ) {
             sheen = ( fbm( wxz * 0.09 ) - 0.5 ) * 1.2;   // shaggy, unmown
           } else {
             sheen = 0.0;                                  // asphalt
           }

           // --- Multi-scale colour ----------------------------------------
           // NOTE: 'patch' is a RESERVED WORD in GLSL ES and will not compile.
           float broad  = fbm( wxz * 0.016 );   // ~60ft: sun, wear, watering
           float mottle = fbm( wxz * 0.13 );    // ~8ft: clumping
           float grain  = vnoise( wxz * 2.4 );  // ~5in: blade texture

           // Fade the finest octave out with distance or it aliases into
           // crawling noise on the outfield — the classic detail-shimmer.
           float grainFade = 1.0 - smoothstep( 70.0, 220.0, dist );

           vec3 turf = mix( uDark, uLight, 0.42 + broad * 0.58 );
           turf *= 1.0 + ( mottle - 0.5 ) * 0.18;
           turf *= 1.0 + ( grain  - 0.5 ) * 0.16 * grainFade;
           turf *= 1.0 + sheen * 0.22;

           // Sun-bleached patches go yellower, not just lighter — a pure
           // value change reads as a lighting artefact rather than as grass.
           turf = mix( turf, turf * vec3( 1.07, 1.0, 0.82 ),
                       smoothstep( 0.58, 0.92, broad ) * 0.55 );

           diffuseColor.rgb *= turf;
         }`
      )
      // Perturb the NORMAL as well as the colour. With 8 ramp steps this makes
      // the terminator itself wander gently, so the plane stops being one flat
      // lighting value and starts reading as ground that is not perfectly
      // level. Subtle on purpose: too much and turf reads as rock.
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
         {
           vec2 np = vWorldPos.xz * 0.06;
           float nx = vnoise( np ) - vnoise( np + vec2( 0.35, 0.0 ) );
           float nz = vnoise( np ) - vnoise( np + vec2( 0.0, 0.35 ) );
           normal = normalize( normal + vec3( nx, 0.0, nz ) * 0.55 );
         }`
      );
  };
  mat.customProgramCacheKey = () => `turf-${mode}`;

  const mesh = new Mesh(geom, mat);
  mesh.name = 'turf';
  return mesh;
}

// --- The infield overlay ----------------------------------------------------

function buildInfieldOverlay(look: VenueLook, anisotropy: number): Mesh {
  const span = OVERLAY_HALF * 2;
  const tex = makeFieldCanvas({
    size: 2048,
    minX: -OVERLAY_HALF,
    maxX: OVERLAY_HALF,
    minZ: OVERLAY_MIN_Z,
    maxZ: OVERLAY_MAX_Z,
  });
  drawInfield(tex.g, tex.toPx, tex.ftToPx, look);

  const geom = new PlaneGeometry(span, OVERLAY_MAX_Z - OVERLAY_MIN_Z);
  geom.rotateX(-Math.PI / 2);

  const mat = makeToonMaterial({
    color: 0xffffff,
    map: toTexture(tex.canvas, anisotropy),
    rimStrength: 0,
    transparent: true,
  });
  mat.depthWrite = false;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;

  const mesh = new Mesh(geom, mat);
  mesh.name = 'infieldOverlay';
  return mesh;
}

/**
 * Draw the infield into the canvas, in FEET, via the shared kit.
 *
 * Note every call here is either a kit function or a plain fill — there is no
 * `Math.random` anywhere, which is what keeps the field byte-identical run to
 * run and lets the UI audit diff screenshots.
 */
function drawInfield(
  g: CanvasTexGraphics,
  toPx: (x: number, z: number) => { x: number; y: number },
  ftToPx: (ft: number) => number,
  look: VenueLook
): void {
  const dirt = look.dirt;
  const dirtLo = shadeInt(dirt, 0.22);
  const dirtHi = lightenInt(dirt, 0.18);

  // ---- The infield dirt -------------------------------------------------
  // A skinned infield is bounded by the grass-line ARC (centred on the mound,
  // groundskeeping-standard) and CLIPPED BY THE FOUL LINES. Both halves
  // matter: an arc centred on home with no clip spills a huge brown fan out
  // into foul ground on both sides and reads as a beach, not a diamond.
  const home = toPx(HOME.x, HOME.z);
  const mound = toPx(MOUND.x, MOUND.z);
  const grassLineR = ftToPx(62);

  g.raw.save();
  // Clip to fair territory: the wedge between the two 45° foul lines, plus a
  // little apron behind the plate so the catcher's dirt isn't sliced off.
  const far = ftToPx(400);
  g.raw.beginPath();
  g.raw.moveTo(toPx(0, -18).x, toPx(0, -18).y);
  g.raw.lineTo(home.x - far, home.y - far);
  g.raw.lineTo(home.x + far, home.y - far);
  g.raw.closePath();
  g.raw.clip();

  // ★ The grass line is IRREGULAR. A perfect circle reads as clip-art the
  // instant you see it — no groundskeeper on earth produces one, and the eye
  // knows. Wobble the radius with the same index-hash the rest of the kit uses
  // (still no Math.random, so the field stays byte-identical run to run).
  g.fillStyle(dirt, 1);
  g.raw.beginPath();
  const STEPS = 180;
  for (let i = 0; i <= STEPS; i++) {
    const th = (i / STEPS) * Math.PI * 2;
    const wobble =
      1 +
      (hash01(i % STEPS, 5) - 0.5) * 0.012 + // per-step nibble
      Math.sin(th * 3.1 + 0.7) * 0.018 + // slow lobes
      Math.sin(th * 7.3 + 2.1) * 0.009;
    const r = grassLineR * wobble;
    const x = mound.x + Math.cos(th) * r;
    const y = mound.y + Math.sin(th) * r;
    if (i === 0) g.raw.moveTo(x, y);
    else g.raw.lineTo(x, y);
  }
  g.raw.closePath();
  g.raw.fill();

  speckleEllipse(g, mound.x, mound.y, grassLineR * 0.92, grassLineR * 0.92, [dirtLo, dirtHi], 900, 0.3, 11);

  // Large-scale blotching: watered, raked and worn areas. Without this the
  // dirt is one flat orange shape, which is the same failure as flat grass.
  for (let i = 0; i < 34; i++) {
    const th = hash01(i * 3 + 1, 21) * Math.PI * 2;
    const rr = Math.sqrt(hash01(i * 3 + 2, 22)) * grassLineR * 0.95;
    const size = grassLineR * (0.10 + hash01(i * 3 + 3, 23) * 0.20);
    g.fillStyle(i % 2 === 0 ? dirtHi : dirtLo, 0.16);
    g.fillEllipse(mound.x + Math.cos(th) * rr, mound.y + Math.sin(th) * rr, size * 2.4, size * 1.5);
  }

  // Scatter dirt OUT past the line so the boundary is a transition, not a cut.
  for (let i = 0; i < 260; i++) {
    const th = hash01(i * 2 + 1, 31) * Math.PI * 2;
    const rr = grassLineR * (1.0 + hash01(i * 2 + 2, 32) * 0.055);
    const s = 1.5 + hash01(i, 33) * 3.2;
    g.fillStyle(dirtLo, 0.3 + hash01(i, 34) * 0.28);
    g.fillEllipse(mound.x + Math.cos(th) * rr, mound.y + Math.sin(th) * rr, s * 2.2, s * 1.3);
  }
  g.raw.restore();

  // ---- The infield grass: a HOLE, never painted --------------------------
  //
  // ★ This overlay draws DIRT ONLY, and erases itself where grass belongs.
  //
  // The first version painted the infield grass as a flat green polygon. It
  // was the single most artificial thing in the frame, and for a structural
  // reason rather than a tuning one: it put canvas-painted grass — one flat
  // fill, hard geometric edges, its own shade of green — directly against the
  // turf SHADER's multi-octave, view-dependent grass. Two different materials
  // pretending to be the same lawn never reconcile, however carefully the
  // colours are matched.
  //
  // Erasing instead means the infield grass IS the outfield grass: same noise,
  // same mow sheen, same everything, automatically and forever.
  g.raw.globalCompositeOperation = 'destination-out';
  g.fillStyle(0x000000, 1);
  const inset = 12; // ft inside the basepath lines
  const corners = [
    toPx(HOME.x, HOME.z + inset * 1.5),
    toPx(FIRST.x - inset, FIRST.z),
    toPx(SECOND.x, SECOND.z - inset * 0.6),
    toPx(THIRD.x + inset, THIRD.z),
  ];
  // Wobble the cut so the grass line is MOWN rather than laser-cut.
  //
  // Smooth harmonics, not per-vertex hash. Independent random offsets per
  // vertex zigzag between neighbours and read as a torn edge — the opposite of
  // the intent. A mower wanders slowly: low-frequency sine terms with an
  // incommensurate ratio give a wandering line that never repeats.
  g.raw.beginPath();
  const SEGS = 40;
  for (let c = 0; c < 4; c++) {
    const a = corners[c];
    const b = corners[(c + 1) % 4];
    const phase = c * 1.7;
    for (let s = 0; s <= SEGS; s++) {
      const t = s / SEGS;
      const nx = -(b.y - a.y);
      const ny = b.x - a.x;
      const nl = Math.hypot(nx, ny) || 1;
      const w =
        (Math.sin(t * 5.1 + phase) * 0.6 + Math.sin(t * 11.7 + phase * 2.3) * 0.28) * ftToPx(0.55);
      const x = a.x + (b.x - a.x) * t + (nx / nl) * w;
      const y = a.y + (b.y - a.y) * t + (ny / nl) * w;
      if (c === 0 && s === 0) g.raw.moveTo(x, y);
      else g.raw.lineTo(x, y);
    }
  }
  g.raw.closePath();
  g.raw.fill();
  g.raw.globalCompositeOperation = 'source-over';

  // ---- Worn basepaths ----------------------------------------------------
  const pathW = ftToPx(5.5);
  const legs: Array<[Vec2, Vec2]> = [
    [HOME, FIRST],
    [FIRST, SECOND],
    [SECOND, THIRD],
    [THIRD, HOME],
  ];
  for (const [a, b] of legs) {
    const pa = toPx(a.x, a.z);
    const pb = toPx(b.x, b.z);
    g.lineStyle(pathW, dirt, 1);
    g.lineBetween(pa.x, pa.y, pb.x, pb.y);
    g.lineStyle(pathW * 0.55, dirtLo, 0.35);
    g.lineBetween(pa.x, pa.y, pb.x, pb.y);
  }

  // ---- Dirt circles biting into the grass at every bag -------------------
  for (const b of [FIRST, SECOND, THIRD]) {
    const p = toPx(b.x, b.z);
    const r = ftToPx(6.5);
    g.fillCircle(p.x, p.y, r, dirt, 1);
    speckleEllipse(g, p.x, p.y, r * 0.9, r * 0.9, [dirtLo, dirtHi], 130, 0.32, b.x + 17);
  }

  // ---- The mound circle --------------------------------------------------
  const m = toPx(MOUND.x, MOUND.z);
  const mr = ftToPx(MOUND_RADIUS);
  g.fillCircle(m.x, m.y, mr, dirt, 1);
  // Lit as a dome from the UPPER LEFT, matching the 3D key light exactly.
  g.fillStyle(lightenInt(dirt, 0.2), 0.55);
  g.fillEllipse(m.x - mr * 0.28, m.y - mr * 0.28, mr * 1.05, mr * 1.05);
  g.fillStyle(shadeInt(dirt, 0.25), 0.4);
  g.fillEllipse(m.x + mr * 0.32, m.y + mr * 0.3, mr * 0.9, mr * 0.9);
  speckleEllipse(g, m.x, m.y, mr * 0.85, mr * 0.85, [dirtLo, dirtHi], 160, 0.3, 29);

  // The rubber.
  g.fillStyle(0xf4f1ea, 0.95);
  g.fillEllipse(m.x, m.y, ftToPx(2), ftToPx(0.5));

  // ---- Home plate circle + batter's boxes --------------------------------
  g.fillCircle(home.x, home.y, ftToPx(13), dirt, 1);
  speckleEllipse(g, home.x, home.y, ftToPx(12), ftToPx(12), [dirtLo, dirtHi], 240, 0.3, 41);

  // Boxes: 4ft x 6ft, 6in off the plate on each side. Worn chalk from the kit.
  const boxW = ftToPx(4);
  const boxH = ftToPx(6);
  const off = ftToPx(0.5) + ftToPx(PLATE_W / 2);
  chalkRect(g, home.x - off - boxW, home.y - boxH * 0.55, boxW, boxH, ftToPx(CHALK_W), 0.85, 3);
  chalkRect(g, home.x + off, home.y - boxH * 0.55, boxW, boxH, ftToPx(CHALK_W), 0.85, 9);

  // ---- The chalk foul lines, from home to the overlay edge ---------------
  // (Beyond the edge they continue as geometry — see buildFoulLine.)
  for (const side of [-1, 1] as const) {
    const end = pointAt(side * 45, 105);
    const pe = toPx(end.x, end.z);
    chalkLine(g, home.x, home.y, pe.x, pe.y, ftToPx(CHALK_W), 0.9, side > 0 ? 13 : 23);
  }
}

// --- Foul lines beyond the overlay -----------------------------------------

function buildFoulLine(geo: FieldGeometry, side: -1 | 1): Mesh {
  const from = 100;
  const to = fenceDistAt(geo, side * 45);
  const len = to - from;
  const geom = new BoxGeometry(CHALK_W, 0.02, len);
  const mat = makeToonMaterial({ color: 0xfffdf5, rimStrength: 0 });
  const mesh = new Mesh(geom, mat);
  const mid = pointAt(side * 45, from + len / 2);
  mesh.position.set(mid.x, Y_CHALK, mid.z);
  mesh.rotation.y = side * -Math.PI / 4;
  mesh.name = `foulLine${side > 0 ? 'R' : 'L'}`;
  mesh.receiveShadow = false;
  return mesh;
}

// --- Props ------------------------------------------------------------------

function buildMound(look: VenueLook): Mesh {
  // A lathe profile: flat top, sloped shoulder. Real LL mound geometry, and it
  // catches the key light as a dome rather than reading as a flat disc.
  const pts: Vector2[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = MOUND_RADIUS * t;
    // Flat inner third, then ease down to zero at the rim.
    const h = t < 0.35 ? MOUND_HEIGHT : MOUND_HEIGHT * (1 - Math.pow((t - 0.35) / 0.65, 1.6));
    pts.push(new Vector2(r, h));
  }
  pts.push(new Vector2(MOUND_RADIUS, 0));
  const geom = new LatheGeometry(pts, 28);
  const mat = makeToonMaterial({ color: look.dirt, rimStrength: 0.1 });
  const mesh = new Mesh(geom, mat);
  mesh.name = 'mound';
  return mesh;
}

function buildBase(): Mesh {
  const geom = new BoxGeometry(BASE_SIZE, BASE_THICK, BASE_SIZE);
  const mat = makeToonMaterial({ color: 0xfdfbf4, rimStrength: 0.2 });
  const mesh = new Mesh(geom, mat);
  mesh.name = 'base';
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

function buildHomePlate(): Mesh {
  // The real five-sided plate. A box would read as a fourth base from the
  // batting camera, which is the one camera that looks straight at it.
  const geom = new CircleGeometry(PLATE_W * 0.62, 5);
  geom.rotateX(-Math.PI / 2);
  geom.rotateY(Math.PI);
  const mat = makeToonMaterial({ color: 0xfdfbf4, rimStrength: 0.2, transparent: false });
  mat.side = DoubleSide;
  const mesh = new Mesh(geom, mat);
  mesh.name = 'homePlate';
  return mesh;
}

export { BACKSTOP_Z, MOUND_DIST };
