// ---------------------------------------------------------------------------
// buildCharacterSVG(visual, pose) -> an SVG document string.
//
// HYBRID toy-brand style: a crisp navy contour around every silhouette shape
// (the Backyard-Baseball precision that survives sprite-size rendering) with
// soft gradient volume inside it and warm-brown interior facial ink. Still
// just string templating — 30 distinct kids from parameters, zero image
// files. Fixed 200x260 viewBox so every kid aligns identically.
//
// POSES: 'stand' (front view, the default/base texture), 'run1'/'run2' (a
// side-view two-frame run cycle, drawn facing RIGHT — flip the sprite for
// leftward travel), 'cheer' (front view, arms up), the gameplay set
// (bat/windup/ready/slide + the rear-view rig pair + the SWING frames
// swingMid/swingFollow and their rear twins, stepped as a load → contact →
// follow-through sequence by anim.poseSequence), and the REACTION pair
// 'upset'/'nervous' (front stands with a baked reaction face that overrides
// the kid's resting expression; swapped in one-shot via anim.reactPose).
// Every pose bottoms out on the same GROUND line so texture swaps under
// setOrigin(0.5, 1) never make the feet pop. Side poses use the classic
// small-sprite "¾ cheat": the front head (all hairstyles + expressions reused
// verbatim) rides a side-view body, shifted and tilted toward travel.
// ---------------------------------------------------------------------------

import type {
  VisualParams,
  HairStyle,
  Expression,
  BodyType,
  FaceSpec,
  OutfitKind,
} from '../data/types';
import { SKIN_TONES, HAIR_COLORS, UNIFORM_COLORS, STREET_COLORS, DENIM } from './palette';

export type Pose =
  | 'stand'
  | 'run1'
  | 'run2'
  | 'run3'
  | 'run4'
  | 'cheer'
  | 'bat'
  | 'windup'
  | 'windup2'
  | 'ready'
  | 'slide'
  | 'batRear'
  | 'catchRear'
  | 'upset'
  | 'nervous'
  | 'dodge'
  | 'throw'
  | 'catch'
  | 'dive'
  | 'swingLoad'
  | 'swingMid'
  | 'swingFollow'
  | 'swingLoadRear'
  | 'swingMidRear'
  | 'swingFollowRear';
export const POSES: Pose[] = [
  'stand',
  'run1',
  'run2',
  'run3',
  'run4',
  'cheer',
  'bat',
  'windup',
  'windup2',
  'ready',
  'slide',
  'batRear',
  'catchRear',
  'upset',
  'nervous',
  'dodge',
  'throw',
  'catch',
  'dive',
  'swingLoad',
  'swingMid',
  'swingFollow',
  'swingLoadRear',
  'swingMidRear',
  'swingFollowRear',
];

const VIEW_W = 200;
const VIEW_H = 260;

const OUT = '#26333f'; // contour ink — every silhouette shape wears it
const SW = 4; // contour width: reads at sprite size without going coloring-book
/** Interior facial-feature ink: warm brown reads "rendered", navy reads "drawn". */
const INK = '#4a3a2e';

/** Lowest ink line for every pose (shoe soles / wheel bottoms). Keep sacred. */
const GROUND = 248;

const HEAD = { cx: 100, cy: 82, r: 50 };

const PANTS = '#f2ede2'; // baseball-pant cream
const SOLE = '#d8d3c8';
const SHOE_EDGE = OUT;
const SHOE_SW = 4;
const METAL_DK = OUT;

/**
 * Shadow tone for a #rrggbb hex: mixes toward a cool navy instead of straight
 * black — hue-shifted shadows are what makes flat shapes read as lit volume.
 */
function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number, to: number) => Math.round(c * (1 - f) + to * f);
  const r = mix((n >> 16) & 255, 0x2c);
  const g = mix((n >> 8) & 255, 0x3e);
  const b = mix(n & 255, 0x66);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** Highlight tone: mixes toward a warm near-white (the key light is warm). */
function lighten(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number, to: number) => Math.round(c * (1 - f) + to * f);
  const r = mix((n >> 16) & 255, 0xff);
  const g = mix((n >> 8) & 255, 0xfa);
  const b = mix(n & 255, 0xe8);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

interface Body {
  halfW: number; // torso/shoulder half-width
  headR: number;
  scale: number; // overall height, anchored at GROUND
  hipW: number; // extra hip width per side
  belly: number; // 0-1 lower-torso bow
  neck: number; // head lift px
  headW: number; // head-group scale (skull+face+hair+hat together)
  headH: number;
}

function bodyPreset(t: BodyType | undefined): { halfW: number; headR: number; scale: number } {
  switch (t) {
    case 'chunky':
      return { halfW: 54, headR: 50, scale: 1 };
    case 'small':
      return { halfW: 38, headR: 45, scale: 0.94 };
    default:
      return { halfW: 46, headR: 50, scale: 1 };
  }
}

const clampN = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Resolve a kid's full body geometry: bodyType picks the preset, then the
 * optional per-kid BodySpec overrides individual fields. Every override is
 * CLAMPED — a content typo in characters.ts must never clip the viewBox
 * (height ≤ 1 keeps the mohawk tip inside; shoulderW ≤ 56 keeps cheer hands
 * inside; headW/H ≤ 1.08 keeps hats/hair off the edges).
 */
function buildBodySpec(v: VisualParams): Body {
  const p = bodyPreset(v.bodyType);
  const b = v.body ?? {};
  return {
    halfW: clampN(b.shoulderW ?? p.halfW, 36, 56),
    headR: p.headR,
    scale: clampN(b.height ?? p.scale, 0.82, 1),
    hipW: clampN(b.hipW ?? 0, -6, 10),
    belly: clampN(b.belly ?? 0, 0, 1),
    neck: clampN(b.neck ?? 0, -4, 6),
    headW: clampN(b.headW ?? 1, 0.9, 1.08),
    headH: clampN(b.headH ?? 1, 0.9, 1.08),
  };
}

/**
 * What the kid is wearing. 'jersey' reproduces the classic uniform exactly;
 * the street kinds render personal clothes (the draft-wall ':sc' variant).
 * jerseyG/pantsG gradient ids are KEPT but fed the wardrobe's colors, so
 * every existing gradient reference works in both modes unchanged.
 */
interface Wardrobe {
  kind: 'jersey' | OutfitKind;
  bottomKind: 'pants' | 'shorts' | 'jeans' | 'skirt';
  top: string;
  topDk: string;
  trim: string;
  bottom: string;
  bottomDk: string;
}

function buildWardrobe(
  v: VisualParams,
  uni: { jersey: string; trim: string },
  street: boolean
): Wardrobe {
  if (!street || !v.outfit) {
    return {
      kind: 'jersey',
      bottomKind: 'pants',
      top: uni.jersey,
      topDk: darken(uni.jersey, 0.14),
      trim: uni.trim,
      bottom: PANTS,
      bottomDk: darken(PANTS, 0.16),
    };
  }
  const o = v.outfit;
  const top = STREET_COLORS[o.top] ?? STREET_COLORS[0];
  const bottomKind =
    o.kind === 'dress' ? 'skirt'
    : o.kind === 'overalls' ? 'jeans'
    : (o.bottoms ?? 'shorts');
  const bottom = bottomKind === 'jeans' ? DENIM : (STREET_COLORS[o.bottom ?? 9] ?? STREET_COLORS[9]);
  return {
    kind: o.kind,
    bottomKind,
    top,
    topDk: darken(top, 0.14),
    trim: lighten(top, 0.55),
    bottom,
    bottomDk: darken(bottom, 0.16),
  };
}

/** Everything the pose builders need, computed once per document. */
interface Ctx {
  skin: string;
  skinDk: string;
  jersey: string;
  jerseyDk: string;
  trim: string;
  /** Gradient fill refs ('url(#...)') — the toy-brand volume pass. */
  gSkin: string;
  gJersey: string;
  gPants: string;
  m: Body;
  /** The wardrobe: 'jersey' everywhere except the street-clothes variant. */
  w: Wardrobe;
  S: string; // standard outline attributes
  usesChair: boolean;
  /** Team logo emoji baked into the chest/back badge (team-uniform variants). */
  logo?: string;
}

/** The chest/back badge: trim circle, plus the team logo when one is set. */
function badge(c: Ctx, cx: number, cy: number, r: number): string {
  const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c.trim}" opacity="0.9"/>`;
  if (!c.logo) return circle;
  // Emoji must go in as XML numeric entities — raw astral-plane characters
  // get mangled by the base64 data-URI decode path (utf8 read as latin-1).
  const logoXml = [...c.logo]
    .map((ch) => `&#x${ch.codePointAt(0)!.toString(16)};`)
    .join('');
  return (
    circle +
    `<text x="${cx}" y="${cy + r * 0.55}" font-size="${Math.round(r * 1.5)}" text-anchor="middle">${logoXml}</text>`
  );
}

/**
 * The <defs> block for one character document: soft airbrushed gradients
 * derived from the kid's own palette. Light stop sits toward the upper-left
 * (the key light), dark stop lower-right — same convention as every layered
 * shade in this file. Ids are per-document (each pose is its own SVG).
 */
function gradientDefs(skin: string, hairColor: string, top: string, bottom: string): string {
  const radial = (id: string, base: string, lite: number, dark: number) => `
    <radialGradient id="${id}" cx="0.36" cy="0.3" r="0.9">
      <stop offset="0" stop-color="${lighten(base, lite)}"/>
      <stop offset="0.55" stop-color="${base}"/>
      <stop offset="1" stop-color="${darken(base, dark)}"/>
    </radialGradient>`;
  const linear = (id: string, base: string, lite: number, dark: number) => `
    <linearGradient id="${id}" x1="0.1" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="${lighten(base, lite)}"/>
      <stop offset="0.45" stop-color="${base}"/>
      <stop offset="1" stop-color="${darken(base, dark)}"/>
    </linearGradient>`;
  return `<defs>
    ${radial('skinG', skin, GRAD.SKIN_LITE, GRAD.SKIN_DARK)}
    ${radial('hairG', hairColor, GRAD.HAIR_LITE, GRAD.HAIR_DARK)}
    ${radial('hairDkG', darken(hairColor, 0.22), GRAD.HAIRDK_LITE, GRAD.HAIRDK_DARK)}
    ${linear('jerseyG', top, GRAD.JERSEY_LITE, GRAD.JERSEY_DARK)}
    ${linear('pantsG', bottom, GRAD.PANTS_LITE, GRAD.PANTS_DARK)}
  </defs>`;
}

/**
 * Gradient stop strengths. With contours restored the gradients no longer
 * carry all the form, so these sit between the old lineless-prototype values
 * and the flat classic ones. Tune here (one line each) via the G gallery.
 */
const GRAD = {
  SKIN_LITE: 0.34,
  SKIN_DARK: 0.28,
  HAIR_LITE: 0.24,
  HAIR_DARK: 0.32,
  HAIRDK_LITE: 0.22,
  HAIRDK_DARK: 0.28,
  JERSEY_LITE: 0.36,
  JERSEY_DARK: 0.34,
  PANTS_LITE: 0.28,
  PANTS_DARK: 0.22,
};

// --- Face ------------------------------------------------------------------

/**
 * Alternate button eye (kept from the lineless prototype): dark warm oval, no
 * sclera, one key-light spec. Unused by default — Phase 3's FaceSpec.eyeStyle
 * promotes it to a per-kid variety axis.
 */
export function buttonEye(x: number, y: number, open = 1, look = 0, size = 1): string {
  const ry = 7.5 * open * size;
  const px = x + look * 2;
  return `
    <ellipse cx="${px}" cy="${y + 1}" rx="${6 * size}" ry="${ry}" fill="#3a2d24"/>
    <circle cx="${px - 2 * size}" cy="${y + 1 - ry * 0.35}" r="${1.9 * size}" fill="#fff8ec" opacity="0.95"/>`;
}

function eye(x: number, y: number, open = 1, look = 0, size = 1): string {
  const rx = 9 * size;
  const ry = 11 * open * size;
  const px = x + look * 3;
  return `
    <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#ffffff" stroke="${OUT}" stroke-width="3"/>
    <circle cx="${px}" cy="${y + ry * 0.25}" r="${5.5 * size}" fill="#1b2833"/>
    <circle cx="${px + 2}" cy="${y + ry * 0.25 - 3}" r="${2 * size}" fill="#ffffff"/>`;
}

/** Heavy-lidded classic eye: half-open with a straight lid line over the top. */
function sleepyEye(x: number, y: number, open = 1, look = 0, size = 1): string {
  const lidY = y - 4 * open * size;
  return `
    ${eye(x, y, open * 0.55, look, size)}
    <path d="M ${x - 9 * size} ${lidY} h ${18 * size}" fill="none" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>`;
}

function wink(x: number, y: number): string {
  return `<path d="M ${x - 9} ${y} q 9 8 18 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
}

function brows(expr: Expression, lx: number, rx: number, y: number): string {
  const b = (x: number, tilt: number) =>
    `<path d="M ${x - 9} ${y + tilt} q 9 -5 18 ${-tilt}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
  const stroke = `fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"`;
  switch (expr) {
    case 'determined':
      return b(lx, 6) + `<path d="M ${rx - 9} ${y - 6} q 9 5 18 6" ${stroke}/>`;
    case 'cool':
      return b(lx, 0) + b(rx, -5); // one raised
    case 'surprised':
    case 'celebrate':
      return b(lx, -6) + b(rx, -6); // both high
    case 'upset':
      // Sad knit: inner ends pull up toward the center.
      return (
        `<path d="M ${lx - 9} ${y + 7} q 10 -2 18 -8" ${stroke}/>` +
        `<path d="M ${rx - 9} ${y - 1} q 8 6 18 8" ${stroke}/>`
      );
    case 'nervous':
      // Worried: both raised with a gentle inner-up tilt.
      return (
        `<path d="M ${lx - 9} ${y + 2} q 10 -8 18 -6" ${stroke}/>` +
        `<path d="M ${rx - 9} ${y - 4} q 8 2 18 6" ${stroke}/>`
      );
    default:
      return '';
  }
}

function mouth(expr: Expression): string {
  const y = 108;
  switch (expr) {
    case 'grin':
      return `
        <path d="M 78 ${y - 2} q 22 26 44 0 q -22 8 -44 0 Z" fill="#7a2b2b" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M 80 ${y - 1} q 20 6 40 0 l -2 6 q -18 5 -36 0 Z" fill="#ffffff"/>`;
    case 'surprised':
      return `<ellipse cx="100" cy="${y + 2}" rx="10" ry="12" fill="#7a2b2b" stroke="${INK}" stroke-width="3"/>`;
    case 'cool':
      return `<path d="M 84 ${y} q 20 12 34 -2" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    case 'determined':
      return `<path d="M 84 ${y + 2} q 16 -4 32 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    case 'goofy':
      return `
        <path d="M 80 ${y - 2} q 20 22 40 0 q -20 6 -40 0 Z" fill="#7a2b2b" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M 96 ${y + 6} q 8 12 16 0 q -8 -4 -16 0 Z" fill="#e8746f"/>`;
    case 'upset':
      // Frown: the happy arc, flipped.
      return `<path d="M 82 ${y + 8} q 18 -16 36 0" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;
    case 'nervous':
      // Wobbly worry line.
      return `<path d="M 82 ${y + 2} q 6 -7 12 0 q 6 7 12 0 q 6 -7 12 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    case 'celebrate':
      // Full-joy open mouth: teeth up top, tongue below.
      return `
        <path d="M 78 ${y - 4} q 22 30 44 0 q -22 10 -44 0 Z" fill="#7a2b2b" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M 82 ${y - 2} q 18 7 36 0 l -2 6 q -16 5 -32 0 Z" fill="#ffffff"/>
        <path d="M 92 ${y + 13} q 8 9 16 0 q -8 -5 -16 0 Z" fill="#e8746f"/>`;
    default: // happy
      return `<path d="M 82 ${y - 2} q 18 20 36 0" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;
  }
}

/** The three nose variants. 'arc' is the classic squiggle; 'wedge' is the
 *  big Backyard-style kid nose (needs the skin shadow tone from Ctx). */
function nosePath(style: 'arc' | 'dot' | 'wedge', skinDk: string): string {
  switch (style) {
    case 'dot':
      return `<circle cx="100" cy="95" r="3.2" fill="${INK}" opacity="0.85"/>`;
    case 'wedge':
      return `<path d="M 100 85 q 6 7 5 12 q -5 4 -10 0 q -1 -5 5 -12 Z" fill="${skinDk}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
    default:
      return `<path d="M 97 94 q 3 4 6 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  }
}

/** look shifts the pupils sideways (run poses look toward travel).
 *  Face geometry (eye gap/size/style, nose, mouth width, cheeks) comes from
 *  the kid's optional FaceSpec; defaults reproduce the classic layout. */
function face(v: VisualParams, look = 0, skinDk = '#c98d68'): string {
  const expr = v.expression ?? 'happy';
  const f: FaceSpec = v.face ?? {};
  const gap = clampN(f.eyeGap ?? 18, 13, 24);
  const size = clampN(f.eyeSize ?? 1, 0.75, 1.3);
  const mouthW = clampN(f.mouthW ?? 1, 0.75, 1.25);
  const cheekI = clampN(f.cheeks ?? 1, 0, 1.4);
  const lx = 100 - gap;
  const rx = 100 + gap;
  const eyeY = 82;
  const open =
    expr === 'determined' ? 0.7
    : expr === 'surprised' ? 1.25
    : expr === 'upset' ? 0.8
    : expr === 'nervous' ? 1.15
    : 1;
  const gaze = expr === 'cool' ? 0.4 : look;
  const drawEye =
    f.eyeStyle === 'button' ? buttonEye
    : f.eyeStyle === 'sleepy' ? sleepyEye
    : eye;
  const leftEye = drawEye(lx, eyeY, open, gaze, size);
  const rightEye = expr === 'goofy' ? wink(rx, eyeY) : drawEye(rx, eyeY, open, gaze, size);
  const cheeks =
    cheekI <= 0
      ? ''
      : `
    <circle cx="${100 - (gap + 12)}" cy="98" r="${8 * (0.7 + 0.3 * cheekI)}" fill="#ff9d9d" opacity="${0.65 * Math.min(1, cheekI)}"/>
    <circle cx="${100 + (gap + 12)}" cy="98" r="${8 * (0.7 + 0.3 * cheekI)}" fill="#ff9d9d" opacity="${0.65 * Math.min(1, cheekI)}"/>`;
  const nose = nosePath(f.nose ?? 'arc', skinDk);
  const freckles = v.freckles
    ? `<g fill="${INK}" opacity="0.5">
         <circle cx="78" cy="96" r="1.6"/><circle cx="85" cy="99" r="1.6"/>
         <circle cx="115" cy="99" r="1.6"/><circle cx="122" cy="96" r="1.6"/></g>`
    : '';
  const mouthSvg =
    mouthW === 1
      ? mouth(expr)
      : `<g transform="translate(${100 * (1 - mouthW)} 0) scale(${mouthW} 1)">${mouth(expr)}</g>`;
  return `
    ${brows(expr, lx, rx, 64)}
    ${leftEye}
    ${rightEye}
    ${cheeks}
    ${nose}
    ${freckles}
    ${mouthSvg}`;
}

// --- Hair ------------------------------------------------------------------

/**
 * Hair split into a back layer (behind head) and front layer (on top).
 * Takes pre-computed fill strings (gradient refs) — deriving shades from a
 * 'url(#...)' here would NaN, so the caller supplies both.
 */
function hair(style: HairStyle, color: string, dk: string): { back: string; front: string } {
  const S = `stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round"`;
  const top = (d: string, fill = color) => `<path d="${d}" fill="${fill}" ${S}/>`;
  switch (style) {
    case 'bald':
      return { back: '', front: '' };
    case 'buzz':
      return { back: '', front: top('M 54 74 a46 46 0 0 1 92 0 q -46 -20 -92 0 Z', dk) };
    case 'short':
      return { back: '', front: top('M 50 78 a50 50 0 0 1 100 0 q -8 -34 -50 -34 q -42 0 -50 34 Z') };
    case 'spiky':
      return {
        back: '',
        front: top(
          'M 52 78 l 6 -26 l 10 20 l 8 -30 l 10 26 l 12 -32 l 12 32 l 10 -26 l 8 30 l 10 -20 l 6 26 q -50 -20 -100 0 Z'
        ),
      };
    case 'curly':
      return {
        back: '',
        front: `<g fill="${color}" ${S}>
          <circle cx="60" cy="60" r="17"/><circle cx="80" cy="46" r="18"/>
          <circle cx="100" cy="42" r="19"/><circle cx="120" cy="46" r="18"/>
          <circle cx="140" cy="60" r="17"/></g>`,
      };
    case 'afro':
      return {
        back: top('M 100 22 a56 52 0 0 1 0 104 a56 52 0 0 1 0 -104 Z'),
        front: '',
      };
    case 'mohawk':
      return { back: '', front: top('M 88 18 q 12 -14 24 0 l 4 46 q -16 8 -32 0 Z') };
    case 'ponytail':
      return {
        back: top('M 140 66 q 40 8 34 52 q -6 30 -26 34 q 18 -34 -16 -74 Z'),
        front: top('M 50 80 a50 50 0 0 1 100 0 q -8 -36 -50 -36 q -42 0 -50 36 Z'),
      };
    case 'pigtails':
      return {
        back:
          top('M 52 74 q -30 6 -26 40 q 4 22 22 24 q -14 -30 12 -56 Z') +
          top('M 148 74 q 30 6 26 40 q -4 22 -22 24 q 14 -30 -12 -56 Z'),
        front: top('M 50 78 a50 50 0 0 1 100 0 q -8 -34 -50 -34 q -42 0 -50 34 Z'),
      };
    case 'bun':
      return {
        back: `<circle cx="100" cy="30" r="16" fill="${color}" ${S}/>`,
        front: top('M 52 78 a48 48 0 0 1 96 0 q -8 -32 -48 -32 q -40 0 -48 32 Z'),
      };
    case 'long':
      return {
        back: top('M 48 70 q -8 60 6 96 l 92 0 q 14 -36 6 -96 q -14 30 -52 30 q -38 0 -58 -30 Z'),
        front: top('M 50 80 a50 50 0 0 1 100 0 q -8 -36 -50 -36 q -42 0 -50 36 Z'),
      };
  }
}

/**
 * Back-of-head hair for the rear-view poses (behind-home-plate rig). A nape
 * dome covers the crown down past the ears; styles add their own silhouette
 * on top (spikes, puffs, tail...). NO face renders under these — the rear
 * poses skip face() entirely. Same pre-computed-fill rule as hair().
 */
function hairRear(style: HairStyle, color: string, dk: string): string {
  const S = `stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round"`;
  const top = (d: string, fill = color) => `<path d="${d}" fill="${fill}" ${S}/>`;
  // Crown-to-nape dome: covers the whole back of the head, skin nape below.
  const dome = top('M 50 80 a 50 50 0 0 1 100 0 l 0 16 q -50 28 -100 0 Z');
  switch (style) {
    case 'bald':
      return '';
    case 'buzz':
      return top('M 54 80 a 46 46 0 0 1 92 0 l 0 10 q -46 22 -92 0 Z', dk);
    case 'short':
      return dome;
    case 'spiky':
      // The front spike silhouette rides the dome — spikes read from any side.
      return (
        dome +
        top(
          'M 52 78 l 6 -26 l 10 20 l 8 -30 l 10 26 l 12 -32 l 12 32 l 10 -26 l 8 30 l 10 -20 l 6 26 q -50 -20 -100 0 Z'
        )
      );
    case 'curly':
      return (
        dome +
        `<g fill="${color}" ${S}>
          <circle cx="60" cy="60" r="17"/><circle cx="80" cy="46" r="18"/>
          <circle cx="100" cy="42" r="19"/><circle cx="120" cy="46" r="18"/>
          <circle cx="140" cy="60" r="17"/></g>`
      );
    case 'afro':
      return top('M 100 22 a56 52 0 0 1 0 104 a56 52 0 0 1 0 -104 Z');
    case 'mohawk':
      // Shaved sides from behind: no dome, just the stripe down the back.
      return top('M 88 18 q 12 -14 24 0 l 2 100 q -14 10 -28 0 Z');
    case 'ponytail':
      // Tail hangs down the center of the back, over the jersey.
      return dome + top('M 88 106 q -8 34 2 58 q 10 8 20 0 q 10 -24 0 -58 Z', dk);
    case 'pigtails':
      return (
        dome +
        top('M 52 74 q -30 6 -26 40 q 4 22 22 24 q -14 -30 12 -56 Z') +
        top('M 148 74 q 30 6 26 40 q -4 22 -22 24 q 14 -30 -12 -56 Z')
      );
    case 'bun':
      return dome + `<circle cx="100" cy="30" r="16" fill="${color}" ${S}/>`;
    case 'long':
      // Full drape: crown over the top, hair falling past the shoulders.
      return top('M 48 70 q -8 60 6 96 l 92 0 q 14 -36 6 -96 q -2 -40 -52 -40 q -50 0 -52 40 Z');
  }
}

// --- Accessories -----------------------------------------------------------

function accessory(v: VisualParams): string {
  const uni = UNIFORM_COLORS[v.uniform] ?? UNIFORM_COLORS[0];
  const S = `stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round"`;
  switch (v.accessory) {
    case 'cap':
      return `
        <path d="M 52 70 a48 42 0 0 1 96 0 q -48 -20 -96 0 Z" fill="url(#jerseyG)" ${S}/>
        <path d="M 96 40 q 6 -6 10 0 l 0 6 q -5 3 -10 0 Z" fill="${uni.trim}" stroke="${OUT}" stroke-width="3"/>
        <path d="M 138 66 q 26 2 30 14 q -4 8 -14 8 q -8 -14 -22 -14 Z" fill="${darken(uni.jersey, 0.12)}" ${S}/>`;
    case 'headband':
      return `<path d="M 52 62 q 48 -16 96 0 l 0 12 q -48 -16 -96 0 Z" fill="${uni.trim}" stroke="${uni.jersey}" stroke-width="4"/>`;
    case 'glasses': {
      // Lenses track the kid's eye gap so wide/narrow-set eyes stay framed.
      const gap = clampN(v.face?.eyeGap ?? 18, 13, 24);
      return `
        <g fill="#bfe6ff" fill-opacity="0.5" stroke="${OUT}" stroke-width="4">
          <circle cx="${100 - gap}" cy="82" r="15"/><circle cx="${100 + gap}" cy="82" r="15"/>
          <path d="M ${100 - gap + 15} 82 h ${Math.max(0, 2 * gap - 30)}" stroke-linecap="round"/></g>`;
    }
    default:
      return '';
  }
}

// --- Shared pieces ---------------------------------------------------------

/**
 * A capsule limb: one open path stroked three times — outline underneath,
 * color on top, then a thin highlight nudged toward the upper-left key light
 * so the limb reads as a cylinder. One quadratic control point gives free
 * knees/elbows.
 */
function capsule(d: string, color: string, w: number): string {
  const edge = OUT;
  const edgeW = w + SW * 1.6;
  return `
    <path d="${d}" fill="none" stroke="${edge}" stroke-width="${edgeW}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(-2 -2.5)" opacity="0.4">
      <path d="${d}" fill="none" stroke="${lighten(color, 0.5)}" stroke-width="${Math.max(3, w * 0.28)}" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
}

/** Round to 0.1 — keeps emitted trig coords short and the NaN test honest. */
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * A chunky rounded fist: palm block + thumb bump + two knuckle hints. At
 * deg 0 the fingers point +x with the thumb edge up; `flip` mirrors the
 * thumb to the other edge (for the opposite hand) without changing where
 * the fingers aim. Fill follows the limb convention: gradient skin near,
 * flat darkened skin on the far side.
 */
function fist(
  c: Ctx,
  x: number,
  y: number,
  deg: number,
  opts: { far?: boolean; s?: number; flip?: boolean } = {}
): string {
  const s = opts.s ?? 1;
  const fill = opts.far ? darken(c.skin, 0.1) : c.gSkin;
  const mirror = opts.flip ? ' scale(-1 1)' : '';
  return `
    <g transform="translate(${r1(x)} ${r1(y)})${mirror} rotate(${r1(deg)}) scale(${s})">
      <rect x="-9" y="-8" width="18" height="16" rx="6.5" fill="${fill}" ${c.S}/>
      <ellipse cx="-4" cy="-8" rx="5" ry="4" fill="${fill}" ${c.S}/>
      <path d="M 3 -5 q 3 2.5 0 5 M 3 1 q 3 2.5 0 5" fill="none" stroke="${OUT}" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>
    </g>`;
}

/**
 * An open hand, fingers spread: three finger scallops + a thumb, with the
 * palm drawn LAST so the digits read as one mitt emerging from it. deg 0 =
 * fingers pointing +x, thumb edge up; `flip` mirrors like fist().
 * For cheers, ready scoops, balance arms, and throw releases.
 */
function openHand(
  c: Ctx,
  x: number,
  y: number,
  deg: number,
  opts: { far?: boolean; s?: number; flip?: boolean } = {}
): string {
  const s = opts.s ?? 1;
  const fill = opts.far ? darken(c.skin, 0.1) : c.gSkin;
  const mirror = opts.flip ? ' scale(-1 1)' : '';
  return `
    <g transform="translate(${r1(x)} ${r1(y)})${mirror} rotate(${r1(deg)}) scale(${s})">
      <ellipse cx="-5" cy="-8" rx="4" ry="5.5" transform="rotate(-32 -5 -8)" fill="${fill}" ${c.S}/>
      <ellipse cx="7" cy="-6" rx="5.5" ry="3.2" transform="rotate(-22 7 -6)" fill="${fill}" ${c.S}/>
      <ellipse cx="9" cy="0" rx="6" ry="3.2" fill="${fill}" ${c.S}/>
      <ellipse cx="7" cy="6" rx="5.5" ry="3.2" transform="rotate(22 7 6)" fill="${fill}" ${c.S}/>
      <ellipse cx="-1" cy="0" rx="8" ry="9" fill="${fill}" ${c.S}/>
    </g>`;
}

/**
 * The two fist anchor points on a bat handle. batProp convention: the grip
 * origin (gx, gy) is the knob, the barrel runs "up" at deg 0, so a point t
 * px up the handle sits at (gx + t·sin, gy − t·cos). Top hand = far, bottom
 * hand = near (matches the far/near fill split both bat poses already use).
 * `batScale` follows a foreshortened (scaled) batProp so the fists stay ON
 * the shrunken handle.
 */
function gripPoints(
  gx: number,
  gy: number,
  batDeg: number,
  batScale = 1
): { far: { x: number; y: number }; near: { x: number; y: number } } {
  const rad = (batDeg * Math.PI) / 180;
  const at = (t: number) => ({ x: r1(gx + t * Math.sin(rad)), y: r1(gy - t * Math.cos(rad)) });
  return { far: at(17 * batScale), near: at(4 * batScale) };
}

/**
 * The top (far) fist of a two-hand grip: mirrored so its thumb wraps the
 * OPPOSITE handle edge from the bottom hand, slightly smaller and rotated a
 * touch past square. fist()'s flip mirrors AFTER the rotation (final aim =
 * 180 − deg), so the angle is passed pre-mirrored: 180 − (batDeg + 84).
 */
function gripFistFar(c: Ctx, p: { x: number; y: number }, batDeg: number): string {
  return fist(c, p.x, p.y, 96 - batDeg, { far: true, flip: true, s: 0.92 });
}

/**
 * The bottom (near) fist of a two-hand grip: natural thumb side, a touch
 * bigger and rotated a touch shy of square. The opposed thumbs plus the small
 * rotation/size split make the stacked hands read as TWO fists, not one blob.
 */
function gripFistNear(c: Ctx, p: { x: number; y: number }, batDeg: number): string {
  return fist(c, p.x, p.y, batDeg + 94, { s: 0.98 });
}

/** A front-view sneaker whose sole sits exactly on GROUND. */
function frontShoe(x: number): string {
  return `
    <rect x="${x - 16}" y="${GROUND - 14}" width="32" height="14" rx="7" fill="#ffffff" stroke="${SHOE_EDGE}" stroke-width="${SHOE_SW}"/>
    <rect x="${x - 13}" y="${GROUND - 5}" width="26" height="5" rx="2.5" fill="${SOLE}"/>`;
}

/** A side-view sneaker, toe pointing along +x, rotated by `deg`. */
function sideShoe(x: number, y: number, deg: number): string {
  return `
    <g transform="translate(${x} ${y}) rotate(${deg})">
      <rect x="-10" y="-12" width="28" height="13" rx="6.5" fill="#ffffff" stroke="${SHOE_EDGE}" stroke-width="${SHOE_SW}"/>
      <rect x="-7" y="-4" width="22" height="4" rx="2" fill="${SOLE}"/>
    </g>`;
}

/**
 * The per-kid head transform: neck lift + head-group scale about the head
 * center. Emitted INSIDE headGroup/headRearGroup, so every pose's own head
 * transform (slide/dive/bat tilts) composes with it — zero pose edits.
 */
function headXform(c: Ctx): string {
  return `translate(0 ${-c.m.neck}) translate(${HEAD.cx} ${HEAD.cy}) scale(${c.m.headW} ${c.m.headH}) translate(${-HEAD.cx} ${-HEAD.cy})`;
}

/**
 * Back hair that layers BEHIND the body (outside headGroup) must wear the
 * SAME head transform, or afros/drapes drift off a scaled/lifted head. Apply
 * this at every `h.back` concatenation point.
 */
function wrapHeadBack(c: Ctx, hBack: string): string {
  if (!hBack) return '';
  return `<g transform="${headXform(c)}">${hBack}</g>`;
}

/**
 * The whole head: neck, face circle, ears (with inner arcs), under-chin shade,
 * face, front hair, and accessory. Reused verbatim by every pose.
 * (Back hair is layered separately, behind the body — see wrapHeadBack.)
 * The neck rects stay OUTSIDE the head transform so the head scales/lifts
 * while the neck keeps meeting the collar.
 */
function headGroup(c: Ctx, v: VisualParams, hFront: string, look = 0): string {
  return `
    <rect x="90" y="${120 - c.m.neck}" width="20" height="${22 + c.m.neck}" rx="8" fill="${c.gSkin}" ${c.S}/>
    <rect x="90" y="${120 - c.m.neck}" width="20" height="8" rx="4" fill="${c.skinDk}" stroke="none"/>
    <g transform="${headXform(c)}">
    <circle cx="${HEAD.cx}" cy="${HEAD.cy}" r="${c.m.headR}" fill="${c.gSkin}" ${c.S}/>
    <ellipse cx="52" cy="86" rx="9" ry="11" fill="${c.gSkin}" ${c.S}/>
    <ellipse cx="148" cy="86" rx="9" ry="11" fill="${c.gSkin}" ${c.S}/>
    <path d="M 50 83 q 3 4 0 7" fill="none" stroke="${OUT}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M 150 83 q -3 4 0 7" fill="none" stroke="${OUT}" stroke-width="2.5" stroke-linecap="round"/>
    <clipPath id="hc"><circle cx="${HEAD.cx}" cy="${HEAD.cy}" r="${c.m.headR}"/></clipPath>
    <ellipse cx="100" cy="${HEAD.cy + c.m.headR}" rx="${c.m.headR}" ry="24" fill="${c.skinDk}" opacity="0.35" clip-path="url(#hc)"/>
    ${face(v, look, c.skinDk)}
    ${hFront}
    ${accessory(v)}
    </g>`;
}

/** Rear accessory variants: cap = dome only (brim faces away), headband =
 *  the same symmetric band, glasses = temple arms hooking the ears. */
function accessoryRear(v: VisualParams): string {
  const uni = UNIFORM_COLORS[v.uniform] ?? UNIFORM_COLORS[0];
  const S = `stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round"`;
  switch (v.accessory) {
    case 'cap':
      return `
        <path d="M 52 70 a48 42 0 0 1 96 0 l 0 8 q -48 18 -96 0 Z" fill="url(#jerseyG)" ${S}/>
        <circle cx="100" cy="34" r="5" fill="${uni.trim}" stroke="${OUT}" stroke-width="3"/>`;
    case 'headband':
      return `<path d="M 52 62 q 48 -16 96 0 l 0 12 q -48 -16 -96 0 Z" fill="${uni.trim}" stroke="${uni.jersey}" stroke-width="4"/>`;
    case 'glasses':
      return `
        <g fill="none" stroke="${OUT}" stroke-width="4" stroke-linecap="round">
          <path d="M 54 80 l 12 3"/><path d="M 146 80 l -12 3"/></g>`;
    default:
      return '';
  }
}

/**
 * The head seen from BEHIND: neck, skull in gSkin, both ears, an under-crown
 * shade for volume, rear hair, rear accessory. NO face() — that's the point.
 * `profile` turns it a quarter toward the pitcher (screen-right): the far ear
 * disappears behind the turn and a cheek/nose bump, brow, and one eye peek
 * past the right silhouette edge — the Backyard "you can see them watching
 * the pitch" cheat. No face() colors, so the rear-no-face invariant holds.
 */
function headRearGroup(c: Ctx, v: VisualParams, hRear: string, profile = false): string {
  const farEar = profile ? '' : `<ellipse cx="148" cy="86" rx="9" ry="11" fill="${c.gSkin}" ${c.S}/>`;
  const profileHint = profile
    ? `
    <path d="M 147 82 q 16 8 8 20 q -5 8 -14 5 Z" fill="${c.gSkin}" ${c.S}/>
    <path d="M 131 79 q 9 -3 14 1" fill="none" stroke="${OUT}" stroke-width="3.5" stroke-linecap="round"/>
    <ellipse cx="140" cy="89" rx="4.5" ry="6" fill="#4a3628" stroke="none"/>`
    : '';
  return `
    <rect x="90" y="${120 - c.m.neck}" width="20" height="${22 + c.m.neck}" rx="8" fill="${c.gSkin}" ${c.S}/>
    <rect x="90" y="${120 - c.m.neck}" width="20" height="8" rx="4" fill="${c.skinDk}" stroke="none"/>
    <g transform="${headXform(c)}">
    <circle cx="${HEAD.cx}" cy="${HEAD.cy}" r="${c.m.headR}" fill="${c.gSkin}" ${c.S}/>
    <ellipse cx="52" cy="86" rx="9" ry="11" fill="${c.gSkin}" ${c.S}/>
    ${farEar}
    <clipPath id="hcr"><circle cx="${HEAD.cx}" cy="${HEAD.cy}" r="${c.m.headR}"/></clipPath>
    <ellipse cx="100" cy="${HEAD.cy + c.m.headR}" rx="${c.m.headR}" ry="24" fill="${c.skinDk}" opacity="0.35" clip-path="url(#hcr)"/>
    ${hRear}
    ${profileHint}
    ${accessoryRear(v)}
    </g>`;
}

/** Jersey back for the rear-view poses: the front torso shapes minus the
 *  collar trim, plus a big back-number badge in the team's trim color. */
function torsoRear(c: Ctx): string {
  const { halfW, hipW, belly } = c.m;
  const shoulderY = 150;
  const hipY = 208;
  const bow = 12 + belly * 12;
  const torsoPath = `M ${100 - halfW} ${shoulderY}
             q 0 -14 14 -16 q ${halfW - 14} -6 ${2 * (halfW - 14)} 0 q 14 2 14 16
             l ${4 + hipW} ${hipY - shoulderY}
             q ${-(halfW + hipW)} ${bow} ${-2 * (halfW + hipW)} 0 Z`;
  return `
    <path d="${torsoPath}" fill="${c.gJersey}" ${c.S}/>
    <path d="M ${100 - (halfW + hipW) + 2} ${hipY - 14} q ${halfW + hipW - 2} ${bow} ${2 * (halfW + hipW - 2)} 0 l 2 12 q ${-(halfW + hipW - 2)} ${bow} ${-2 * (halfW + hipW - 2)} 0 Z" fill="${c.jerseyDk}"/>
    ${badge(c, 100, shoulderY + 28, 16)}`;
}

// --- Front poses (stand / cheer) --------------------------------------------

/** Front legs by wardrobe: baseball pants (trim stripe + sock band), street
 *  shorts (skin shins + white socks), jeans, or bare legs under a skirt. */
function legsFront(c: Ctx): string {
  const legHalf = c.m.halfW * 0.42;
  const kind = c.w.bottomKind;
  if (kind === 'shorts') {
    const leg = (x: number) => `
    <rect x="${x - 11}" y="200" width="22" height="17" rx="8" fill="${c.gPants}" ${c.S}/>
    ${capsule(`M ${x} 214 Q ${x} 222 ${x} 231`, c.skin, 12)}
    <rect x="${x - 8}" y="227" width="16" height="8" rx="4" fill="#ffffff" stroke="${OUT}" stroke-width="3"/>
    ${frontShoe(x)}`;
    return leg(100 - legHalf) + leg(100 + legHalf);
  }
  if (kind === 'skirt') {
    const leg = (x: number) => `
    ${capsule(`M ${x} 206 Q ${x} 220 ${x} 231`, c.skin, 13)}
    <rect x="${x - 8}" y="227" width="16" height="8" rx="4" fill="#ffffff" stroke="${OUT}" stroke-width="3"/>
    ${frontShoe(x)}`;
    return leg(100 - legHalf) + leg(100 + legHalf);
  }
  if (kind === 'jeans') {
    const leg = (x: number) => `
    <rect x="${x - 10}" y="200" width="20" height="30" rx="9" fill="${c.gPants}" ${c.S}/>
    ${frontShoe(x)}`;
    return leg(100 - legHalf) + leg(100 + legHalf);
  }
  const leg = (x: number, stripeLeft: boolean) => `
    <rect x="${x - 10}" y="200" width="20" height="28" rx="9" fill="${c.gPants}" ${c.S}/>
    <rect x="${stripeLeft ? x - 10 : x + 7}" y="203" width="3" height="22" fill="${c.trim}"/>
    <rect x="${x - 9}" y="222" width="18" height="12" rx="4" fill="${c.trim}" stroke="${OUT}" stroke-width="3"/>
    ${frontShoe(x)}`;
  return leg(100 - legHalf, true) + leg(100 + legHalf, false);
}

/** Torso: rounded jersey with a darker hem, collar trim, and a cel-shade side.
 *  hipW widens the hip line per side (pear/taper); belly bows the bottom. */
function torsoFront(c: Ctx): string {
  const { halfW, hipW, belly } = c.m;
  const shoulderY = 150;
  const hipY = 208;
  const bow = 12 + belly * 12;
  const torsoPath = `M ${100 - halfW} ${shoulderY}
             q 0 -14 14 -16 q ${halfW - 14} -6 ${2 * (halfW - 14)} 0 q 14 2 14 16
             l ${4 + hipW} ${hipY - shoulderY}
             q ${-(halfW + hipW)} ${bow} ${-2 * (halfW + hipW)} 0 Z`;
  return `
    <path d="${torsoPath}" fill="${c.gJersey}" ${c.S}/>
    <path d="M ${100 - (halfW + hipW) + 2} ${hipY - 14} q ${halfW + hipW - 2} ${bow} ${2 * (halfW + hipW - 2)} 0 l 2 12 q ${-(halfW + hipW - 2)} ${bow} ${-2 * (halfW + hipW - 2)} 0 Z" fill="${c.jerseyDk}"/>
    ${garmentFront(c, torsoPath, shoulderY, hipY)}`;
}

/** Front-torso garment detail per wardrobe kind. Jersey = the classic collar
 *  trim; street kinds add their signature read (stripes, bib, pocket...). */
function garmentFront(c: Ctx, torsoPath: string, shoulderY: number, hipY: number): string {
  const { halfW } = c.m;
  switch (c.w.kind) {
    case 'jersey':
      return `<path d="M 84 ${shoulderY - 6} q 16 14 32 0" fill="none" stroke="${c.trim}" stroke-width="6" stroke-linecap="round"/>`;
    case 'stripeTee':
      return `
    <clipPath id="tc"><path d="${torsoPath}"/></clipPath>
    <g clip-path="url(#tc)" fill="${c.w.trim}" opacity="0.9">
      <rect x="${100 - halfW - 12}" y="${shoulderY + 8}" width="${2 * halfW + 24}" height="9"/>
      <rect x="${100 - halfW - 12}" y="${shoulderY + 28}" width="${2 * halfW + 24}" height="9"/>
    </g>`;
    case 'hoodie':
      return `
    <path d="M 78 ${shoulderY - 4} q 22 16 44 0 q -4 12 -22 12 q -18 0 -22 -12 Z" fill="${c.w.topDk}" ${c.S}/>
    <path d="M ${100 - halfW * 0.5} ${hipY - 26} h ${halfW} l -5 16 h ${-halfW + 10} Z" fill="${c.w.topDk}" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>
    <line x1="94" y1="${shoulderY + 6}" x2="93" y2="${shoulderY + 18}" stroke="${c.w.trim}" stroke-width="3" stroke-linecap="round"/>
    <line x1="106" y1="${shoulderY + 6}" x2="107" y2="${shoulderY + 18}" stroke="${c.w.trim}" stroke-width="3" stroke-linecap="round"/>`;
    case 'overalls':
      return `
    <rect x="${100 - halfW * 0.45}" y="${shoulderY + 14}" width="${halfW * 0.9}" height="${hipY - shoulderY - 18}" rx="6" fill="${DENIM}" stroke="${OUT}" stroke-width="3.5"/>
    <line x1="${100 - halfW * 0.42}" y1="${shoulderY + 16}" x2="${100 - halfW + 6}" y2="${shoulderY - 8}" stroke="${DENIM}" stroke-width="8" stroke-linecap="round"/>
    <line x1="${100 + halfW * 0.42}" y1="${shoulderY + 16}" x2="${100 + halfW - 6}" y2="${shoulderY - 8}" stroke="${DENIM}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="${100 - halfW * 0.34}" cy="${shoulderY + 20}" r="2.6" fill="#f5d76e"/>
    <circle cx="${100 + halfW * 0.34}" cy="${shoulderY + 20}" r="2.6" fill="#f5d76e"/>`;
    case 'dress':
      return `
    <path d="M ${100 - halfW - 2} ${hipY - 10} L ${100 + halfW + 2} ${hipY - 10} L ${100 + halfW + 12} ${hipY + 16} Q 100 ${hipY + 26} ${100 - halfW - 12} ${hipY + 16} Z" fill="${c.gJersey}" ${c.S}/>
    <path d="M ${100 - halfW - 8} ${hipY + 12} Q 100 ${hipY + 21} ${100 + halfW + 8} ${hipY + 12}" fill="none" stroke="${c.w.trim}" stroke-width="4" stroke-linecap="round"/>`;
    case 'jacket':
      return `
    <line x1="100" y1="${shoulderY - 8}" x2="100" y2="${hipY - 4}" stroke="${c.w.topDk}" stroke-width="4"/>
    <path d="M 86 ${shoulderY - 8} l 12 12 M 114 ${shoulderY - 8} l -12 12" fill="none" stroke="${c.w.topDk}" stroke-width="5" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

/** Sleeve caps + skin forearms + hands, hanging naturally. */
function armsStand(c: Ctx): string {
  const { halfW } = c.m;
  const shoulderY = 150;
  const arm = (side: 1 | -1) => {
    const sx = 100 + side * (halfW - 4);
    const elbowX = 100 + side * (halfW + 9);
    const handX = 100 + side * (halfW + 12);
    return `
      <path d="M ${sx} ${shoulderY + 2} q ${side * 18} 4 ${side * 20} 22 q ${-side * 8} 7 ${-side * 18} 3 q ${side * 2} -14 ${-side * 2} -25 Z" fill="${c.jerseyDk}" ${c.S}/>
      ${capsule(`M ${elbowX} ${shoulderY + 22} Q ${handX} ${shoulderY + 30} ${handX} ${shoulderY + 38}`, c.skin, 13)}
      ${fist(c, handX, shoulderY + 42, 90, { flip: side === 1 })}`;
  };
  return arm(-1) + arm(1);
}

/** Both arms up in a wide happy V (draft celebrations, big moments). */
function armsCheer(c: Ctx): string {
  const { halfW } = c.m;
  const shoulderY = 150;
  const arm = (side: 1 | -1) => {
    const sx = 100 + side * (halfW - 6);
    const elbowX = 100 + side * (halfW + 20);
    const handX = 100 + side * (halfW + 30);
    return `
      ${capsule(`M ${sx} ${shoulderY + 2} Q ${elbowX - side * 4} ${shoulderY - 12} ${elbowX} ${shoulderY - 28}`, c.jerseyDk, 15)}
      ${capsule(`M ${elbowX} ${shoulderY - 28} Q ${handX} ${shoulderY - 48} ${handX} ${shoulderY - 62}`, c.skin, 13)}
      ${openHand(c, handX, shoulderY - 68, -90, { flip: side === 1 })}`;
  };
  return arm(-1) + arm(1);
}

/** Front-view wheelchair: a big wheel on each side of the seated kid, seat + footrest. */
function wheelchairFront(): string {
  const rim = '#2c3a47';
  const wheel = (cx: number) => `
    <circle cx="${cx}" cy="214" r="33" fill="#e9eef2" stroke="${OUT}" stroke-width="6"/>
    <circle cx="${cx}" cy="214" r="20" fill="none" stroke="${rim}" stroke-width="4"/>
    <circle cx="${cx}" cy="214" r="6" fill="${METAL_DK}"/>
    <g stroke="${rim}" stroke-width="3">
      <line x1="${cx}" y1="194" x2="${cx}" y2="234"/>
      <line x1="${cx - 20}" y1="214" x2="${cx + 20}" y2="214"/>
      <line x1="${cx - 14}" y1="200" x2="${cx + 14}" y2="228"/>
      <line x1="${cx - 14}" y1="228" x2="${cx + 14}" y2="200"/>
    </g>`;
  return `
    ${wheel(46)}
    ${wheel(154)}
    <!-- seat + footrest -->
    <path d="M 60 206 h 80 l -8 18 h -64 Z" fill="#3f86e0" stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round"/>
    <rect x="84" y="228" width="32" height="9" rx="4" fill="${METAL_DK}"/>`;
}

// --- Side poses (run1 / run2) -----------------------------------------------

/** Side-view torso: a leaned capsule jersey with a hem band and half collar. */
function torsoSide(c: Ctx, dropY: number): string {
  const w = Math.round(c.m.halfW * 1.1);
  // Street dress: a little skirt flare swings off the hem in the run cycle.
  const flare =
    c.w.kind === 'dress'
      ? `<path d="M ${100 - w / 2 - 6} 198 L ${100 + w / 2 + 4} 200 L ${100 + w / 2 + 8} 214 Q 100 222 ${100 - w / 2 - 12} 212 Z" fill="${c.gJersey}" ${c.S}/>`
      : '';
  const collar =
    c.w.kind === 'jersey'
      ? `<path d="M ${100 - 10} 150 q 12 10 24 2" fill="none" stroke="${c.trim}" stroke-width="5" stroke-linecap="round"/>`
      : '';
  return `
    <g transform="translate(0 ${dropY}) rotate(8 100 180)">
      <rect x="${100 - w / 2}" y="146" width="${w}" height="60" rx="${Math.round(w * 0.36)}" fill="${c.gJersey}" ${c.S}/>
      <rect x="${100 - w / 2 + 3}" y="192" width="${w - 6}" height="11" rx="5" fill="${c.jerseyDk}"/>
      ${flare}
      ${collar}
    </g>`;
}

/**
 * Split a one-segment quadratic path ('M x y Q cx cy x y') at parameter t
 * (de Casteljau) — lets street shorts end mid-thigh on the run-cycle legs
 * without redrawing the choreography.
 */
function quadSplit(d: string, t: number): { prefix: string; suffix: string } {
  const m = d.match(/M\s*(-?[\d.]+)\s+(-?[\d.]+)\s*Q\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
  if (!m) return { prefix: d, suffix: d };
  const [x0, y0, cx, cy, x1, y1] = m.slice(1).map(Number);
  const lp = (a: number, b: number) => a + (b - a) * t;
  const r = (n: number) => Math.round(n * 10) / 10;
  const ax = lp(x0, cx);
  const ay = lp(y0, cy);
  const bx = lp(cx, x1);
  const by = lp(cy, y1);
  const mx = lp(ax, bx);
  const my = lp(ay, by);
  return {
    prefix: `M ${x0} ${y0} Q ${r(ax)} ${r(ay)} ${r(mx)} ${r(my)}`,
    suffix: `M ${r(mx)} ${r(my)} Q ${r(bx)} ${r(by)} ${x1} ${y1}`,
  };
}

/** The gait order the run cycle steps through: reach → pass → crossover → pass. */
export type RunFrame = 1 | 2 | 3 | 4;

/** Side-view running legs. frame 1 = full extension (reach), frame 2 =
 *  crossover; frames 3/4 are the PASS in-betweens (legs gathered under the
 *  body mid-swap — the frames that make the gait read as running, not a flip).
 *  Every path stays a single-segment quadratic (quadSplit parses exactly that
 *  to cut street shorts at mid-thigh). Wardrobe-aware: pants/jeans run
 *  full-length in the bottom color; shorts end mid-thigh with a skin shin;
 *  a skirt means bare legs (flare on torso). */
function legsRun(c: Ctx, frame: RunFrame): string {
  const w = Math.max(14, Math.round(c.m.halfW * 0.34));
  const FRAMES = {
    1: [
      { d: 'M 94 198 Q 72 212 58 220', far: true, shoe: sideShoe(52, 222, -32) },
      { d: 'M 98 200 Q 124 206 138 226', far: false, shoe: sideShoe(142, 234, 18) },
    ],
    2: [
      { d: 'M 94 198 Q 114 208 126 228', far: true, shoe: sideShoe(130, 236, 10) },
      { d: 'M 98 200 Q 112 220 100 234', far: false, shoe: sideShoe(104, 242, -6) },
    ],
    // Pass after the reach: far leg swings forward under the hip while the
    // near leg pushes off behind.
    3: [
      { d: 'M 94 198 Q 96 214 98 230', far: true, shoe: sideShoe(102, 238, 4) },
      { d: 'M 98 200 Q 92 216 84 232', far: false, shoe: sideShoe(82, 240, -18) },
    ],
    // Mirror-phase pass after the crossover: far leg pushes off behind, near
    // leg swings forward under.
    4: [
      { d: 'M 94 198 Q 86 214 78 230', far: true, shoe: sideShoe(76, 238, -16) },
      { d: 'M 98 200 Q 104 218 106 234', far: false, shoe: sideShoe(110, 242, 6) },
    ],
  } as const;
  const legs = FRAMES[frame];
  const kind = c.w.bottomKind;
  return legs
    .map(({ d, far, shoe }) => {
      const bottomCol = far ? c.w.bottomDk : c.w.bottom;
      const skinCol = far ? darken(c.skin, 0.1) : c.skin;
      if (kind === 'shorts') {
        const s = quadSplit(d, 0.5);
        return `${capsule(s.suffix, skinCol, w - 3)}${capsule(s.prefix, bottomCol, w)}${shoe}`;
      }
      if (kind === 'skirt') {
        return `${capsule(d, skinCol, w - 2)}${shoe}`;
      }
      return `${capsule(d, bottomCol, w)}${shoe}`;
    })
    .join('');
}

/** Side-view pumping arms (opposite phase to the legs), split into layers.
 *  Frames 3/4 are the transitional half-swings matching the leg pass frames.
 *  Hands stay at chest height or lower — near the chin they read as mittens. */
function armsRun(c: Ctx, frame: RunFrame): { far: string; near: string } {
  const farJersey = darken(c.jerseyDk, 0.1);
  const farSkin = darken(c.skin, 0.1);
  const w = 13;
  if (frame === 1) {
    // Far arm drives forward at chest height, near arm swings back-down.
    return {
      far: `
        ${capsule('M 100 154 Q 112 164 120 170', farJersey, w)}
        ${capsule('M 120 170 Q 130 170 136 166', farSkin, w - 2)}
        ${fist(c, 140, 164, -30, { far: true, s: 0.95 })}`,
      near: `
        ${capsule('M 102 154 Q 90 166 82 176', c.jerseyDk, w)}
        ${capsule('M 82 176 Q 74 184 72 192', c.skin, w - 2)}
        ${fist(c, 71, 195, 105, { s: 0.95 })}`,
    };
  }
  if (frame === 2) {
    return {
      far: `
        ${capsule('M 100 154 Q 88 164 80 172', farJersey, w)}
        ${capsule('M 80 172 Q 74 180 72 186', farSkin, w - 2)}
        ${fist(c, 71, 190, 110, { far: true, s: 0.95 })}`,
      near: `
        ${capsule('M 102 154 Q 114 166 122 172', c.jerseyDk, w)}
        ${capsule('M 122 172 Q 132 172 138 168', c.skin, w - 2)}
        ${fist(c, 142, 166, -30, { s: 0.95 })}`,
    };
  }
  if (frame === 3) {
    // Coming off the reach: far arm pulling back to the waist, near arm
    // swinging forward past the hip.
    return {
      far: `
        ${capsule('M 100 154 Q 106 162 110 170', farJersey, w)}
        ${capsule('M 110 170 Q 116 172 122 172', farSkin, w - 2)}
        ${fist(c, 126, 172, -10, { far: true, s: 0.95 })}`,
      near: `
        ${capsule('M 102 154 Q 94 164 88 172', c.jerseyDk, w)}
        ${capsule('M 88 172 Q 82 178 78 184', c.skin, w - 2)}
        ${fist(c, 76, 187, 100, { s: 0.95 })}`,
    };
  }
  // Frame 4: mirror phase of 3.
  return {
    far: `
      ${capsule('M 100 154 Q 94 162 88 170', farJersey, w)}
      ${capsule('M 88 170 Q 82 176 79 182', farSkin, w - 2)}
      ${fist(c, 77, 185, 105, { far: true, s: 0.95 })}`,
    near: `
      ${capsule('M 102 154 Q 108 164 114 170', c.jerseyDk, w)}
      ${capsule('M 114 170 Q 120 172 126 172', c.skin, w - 2)}
      ${fist(c, 130, 172, -12, { s: 0.95 })}`,
  };
}

/**
 * Side-view wheelchair push (Zoom Ramirez at speed): one big side wheel with
 * handrim, front caster, seat frame, legs bent to the footplate. Four push
 * phases matching the run gait order (1 → 3 → 2 → 4): 1 = arm reaching the
 * top of the handrim, 3 = mid push, 2 = end of the push stroke, 4 = recovery
 * lifting back to the top. The spoke group rotates 22.5° per gait step so the
 * wheel visibly turns.
 */
function wheelchairSide(c: Ctx, frame: RunFrame): { behind: string; front: string } {
  const rim = '#2c3a47';
  const wheelBottom = GROUND - 2;
  const wcy = wheelBottom - 34;
  const w = 13;
  const ARMS = {
    1: `
        ${capsule(`M 102 152 Q 116 166 120 178`, c.jerseyDk, w)}
        ${capsule(`M 120 178 Q 122 186 118 192`, c.skin, w - 2)}
        ${fist(c, 117, 195, 55, { s: 0.95 })}`,
    3: `
        ${capsule(`M 102 152 Q 106 168 104 182`, c.jerseyDk, w)}
        ${capsule(`M 104 182 Q 102 192 98 198`, c.skin, w - 2)}
        ${fist(c, 96, 201, 90, { s: 0.95 })}`,
    2: `
        ${capsule(`M 102 152 Q 96 170 88 182`, c.jerseyDk, w)}
        ${capsule(`M 88 182 Q 82 192 78 200`, c.skin, w - 2)}
        ${fist(c, 76, 203, 120, { s: 0.95 })}`,
    4: `
        ${capsule(`M 102 152 Q 112 160 118 168`, c.jerseyDk, w)}
        ${capsule(`M 118 168 Q 122 176 122 184`, c.skin, w - 2)}
        ${fist(c, 122, 187, 70, { s: 0.95 })}`,
  } as const;
  const arm = ARMS[frame];
  // Spoke rotation per gait step (order 1 → 3 → 2 → 4).
  const SPOKE_ROT = { 1: 0, 3: 22.5, 2: 45, 4: 67.5 } as const;
  const spokeRot = SPOKE_ROT[frame];
  const ticks =
    frame === 2 || frame === 3
      ? `<g stroke="${rim}" stroke-width="3" stroke-linecap="round" opacity="0.55">
          <line x1="48" y1="196" x2="36" y2="192"/>
          <line x1="46" y1="212" x2="32" y2="212"/>
          <line x1="48" y1="228" x2="36" y2="232"/>
        </g>`
      : '';
  return {
    // Seat, legs, footplate — behind the torso.
    behind: `
      ${ticks}
      <rect x="62" y="164" width="12" height="40" rx="5" fill="#3f86e0" ${c.S}/>
      <rect x="66" y="196" width="62" height="12" rx="5" fill="#3f86e0" ${c.S}/>
      ${capsule('M 88 198 Q 112 200 126 208', PANTS, w)}
      ${capsule('M 126 208 Q 136 214 140 222', PANTS, w - 1)}
      ${sideShoe(142, 230, 6)}
      <rect x="130" y="228" width="26" height="8" rx="4" fill="${METAL_DK}"/>`,
    // The near-side big wheel, handrim, caster, and pushing arm — in front,
    // the way a side-on wheelchair actually reads.
    front: `
      <circle cx="92" cy="${wcy}" r="34" fill="#e9eef2" fill-opacity="0.55" stroke="${OUT}" stroke-width="6"/>
      <circle cx="92" cy="${wcy}" r="24" fill="none" stroke="${rim}" stroke-width="4"/>
      <circle cx="92" cy="${wcy}" r="6" fill="${METAL_DK}"/>
      <g stroke="${rim}" stroke-width="3" transform="rotate(${spokeRot} 92 ${wcy})">
        <line x1="92" y1="${wcy - 22}" x2="92" y2="${wcy + 22}"/>
        <line x1="${92 - 22}" y1="${wcy}" x2="${92 + 22}" y2="${wcy}"/>
        <line x1="${92 - 16}" y1="${wcy - 16}" x2="${92 + 16}" y2="${wcy + 16}"/>
        <line x1="${92 - 16}" y1="${wcy + 16}" x2="${92 + 16}" y2="${wcy - 16}"/>
      </g>
      <circle cx="146" cy="${GROUND - 9}" r="9" fill="#e9eef2" stroke="${OUT}" stroke-width="4"/>
      ${arm}`,
  };
}

// --- Gameplay poses (bat / windup / ready / slide) ---------------------------

const BAT_WOOD = '#d39a5c';

/**
 * The bat itself: ONE tapered silhouette (fat rounded barrel → curved taper →
 * thin handle) plus a flared knob ellipse, rotated at the grip. Real-bat
 * proportions — barrel ≈2.6× the handle, knob wider than the handle — are
 * what make the prop read as a bat instead of a uniform rod.
 */
function batProp(gx: number, gy: number, deg: number): string {
  const edge = OUT;
  const ew = 4;
  return `
    <g transform="translate(${gx} ${gy}) rotate(${deg})">
      <path d="M -3.5 -6 L -3.5 -44 C -9 -50 -9 -56 -9 -62 L -9 -88 Q -9 -96 0 -96 Q 9 -96 9 -88 L 9 -62 C 9 -56 9 -50 3.5 -44 L 3.5 -6 Z" fill="${BAT_WOOD}" stroke="${edge}" stroke-width="${ew}" stroke-linejoin="round"/>
      <rect x="-6" y="-90" width="3.5" height="26" rx="1.75" fill="${lighten(BAT_WOOD, 0.4)}" opacity="0.6" stroke="none"/>
      <rect x="-3.5" y="-42" width="7" height="6" fill="${darken(BAT_WOOD, 0.28)}" stroke="none"/>
      <ellipse cx="0" cy="-3" rx="6.5" ry="4" fill="${darken(BAT_WOOD, 0.2)}" stroke="${edge}" stroke-width="${ew}"/>
    </g>`;
}

/**
 * batProp scaled about the grip: the one way to draw a longer/foreshortened
 * bat (the stance frames run 1.3 — Backyard bats are ~70% of body height —
 * while swing frames shrink toward the camera). gripPoints takes the same
 * scale so fists stay ON the resized handle.
 */
function batAt(gx: number, gy: number, deg: number, s = 1): string {
  if (s === 1) return batProp(gx, gy, deg);
  return `
    <g transform="translate(${gx} ${gy}) scale(${s}) translate(${-gx} ${-gy})">
      ${batProp(gx, gy, deg)}
    </g>`;
}

/** How much longer the resting/load bats run than the base prop. */
const BAT_STANCE_SCALE = 1.3;

/**
 * Batting stance, side view facing RIGHT (toward the pitch): wide planted
 * legs, side torso leaned into the plate, both hands stacked at CHEST height
 * with the long barrel rising past the cap beside the head — the Backyard
 * high-cocked silhouette. The bat pose IS the batter — no runtime prop.
 */
function poseBat(c: Ctx, v: VisualParams, hFront: string): string {
  const w = Math.max(14, Math.round(c.m.halfW * 0.34));
  const pantsDk = darken(PANTS, 0.16);
  // Stance variant: reshape grip height / bat angle / body drop per kid.
  const stance = v.stance;
  const drop = stance === 'crouch' ? 9 : 0;
  const spread = stance === 'open' ? 10 : 0;
  // Wide stance: back leg (far) planted, front leg open toward the pitch.
  const legs = `
    ${capsule(`M 92 198 Q ${74 - spread / 2} 214 ${64 - spread} 228`, pantsDk, w)}
    ${sideShoe(58 - spread, 240, -8)}
    ${capsule(`M 102 200 Q ${122 + spread / 2} 214 ${132 + spread} 228`, PANTS, w)}
    ${sideShoe(136 + spread, 240, 6)}`;
  // Hands stacked HIGH beside the back shoulder (chest/chin height), barrel
  // near-vertical rising past the cap on the head's left — the giant chibi
  // head means the bat rides BESIDE the silhouette, never across it.
  const grip = {
    x: stance === 'high' ? 48 : stance === 'open' ? 54 : 50,
    y: (stance === 'high' ? 134 : stance === 'crouch' ? 148 : 140) + drop,
  };
  const batDeg = stance === 'high' ? -2 : stance === 'open' ? -14 : -6;
  // Far/near arm split (like armsRun): the far arm folds at a REAL elbow —
  // jersey upper arm down-back, skin forearm folding UP to the high grip (the
  // bent back elbow is most of what makes a batting load read as loaded). The
  // near arm crosses in front with a slighter bend; hands stacked on the handle.
  const gp = gripPoints(grip.x, grip.y, batDeg, BAT_STANCE_SCALE);
  const elbow = { x: 74, y: 162 + drop };
  const armFar = `
    ${capsule(`M 98 ${152 + drop} Q 86 ${160 + drop} ${elbow.x} ${elbow.y}`, darken(c.jerseyDk, 0.1), 13)}
    ${capsule(`M ${elbow.x} ${elbow.y} Q 54 ${144 + drop} ${gp.far.x} ${gp.far.y}`, darken(c.skin, 0.1), 11)}
    ${gripFistFar(c, gp.far, batDeg)}`;
  const armNear = `
    ${capsule(`M 104 ${154 + drop} Q 92 ${158 + drop} 84 ${156 + drop}`, c.jerseyDk, 13)}
    ${capsule(`M 84 ${156 + drop} Q 66 ${146 + drop} ${gp.near.x} ${gp.near.y}`, c.skin, 11)}
    ${gripFistNear(c, gp.near, batDeg)}`;
  const head = `
    <g transform="translate(6 ${2 + drop}) rotate(3 ${HEAD.cx} ${HEAD.cy})">
      ${headGroup(c, v, hFront, 0.8)}
    </g>`;
  const bat = batAt(grip.x, grip.y, batDeg, BAT_STANCE_SCALE);
  if (c.usesChair) {
    const chair = wheelchairSide(c, 1);
    return `${bat}${armFar}${chair.behind}${torsoSide(c, 2)}${chair.front}${armNear}${head}`;
  }
  return `${bat}${armFar}${legs}${torsoSide(c, drop)}${armNear}${head}`;
}

/**
 * Swing load, side view facing RIGHT — the in-between before contact: hands
 * pushed back and up, bat more vertical, lead leg striding toward the pitch,
 * torso coiled back. Like the other swing frames it converges to ONE geometry
 * (the per-kid stance variants shape only the resting `bat` pose).
 */
function poseSwingLoad(c: Ctx, v: VisualParams, hFront: string): string {
  const w = Math.max(14, Math.round(c.m.halfW * 0.34));
  const pantsDk = darken(PANTS, 0.16);
  // Coil from the high stance: hands push a touch further back-up, the
  // barrel tips a few degrees more, the lead leg strides.
  const grip = { x: 46, y: 134 };
  const batDeg = -12;
  const legs = `
    ${capsule(`M 92 198 Q 74 214 64 228`, pantsDk, w)}
    ${sideShoe(58, 240, -8)}
    ${capsule(`M 102 200 Q 126 210 142 224`, PANTS, w)}
    ${sideShoe(148, 236, 10)}`;
  const gp = gripPoints(grip.x, grip.y, batDeg, BAT_STANCE_SCALE);
  const armFar = `
    ${capsule(`M 98 152 Q 84 158 70 158`, darken(c.jerseyDk, 0.1), 13)}
    ${capsule(`M 70 158 Q 48 138 ${gp.far.x} ${gp.far.y}`, darken(c.skin, 0.1), 11)}
    ${gripFistFar(c, gp.far, batDeg)}`;
  const armNear = `
    ${capsule(`M 104 154 Q 88 156 80 152`, c.jerseyDk, 13)}
    ${capsule(`M 80 152 Q 60 140 ${gp.near.x} ${gp.near.y}`, c.skin, 11)}
    ${gripFistNear(c, gp.near, batDeg)}`;
  // Coiled back: the torso counter-rotates away from the pitch.
  const torso = `<g transform="rotate(-4 100 185)">${torsoSide(c, 0)}</g>`;
  const head = `
    <g transform="translate(4 2) rotate(2 ${HEAD.cx} ${HEAD.cy})">
      ${headGroup(c, v, hFront, 0.8)}
    </g>`;
  const bat = batAt(grip.x, grip.y, batDeg, BAT_STANCE_SCALE);
  if (c.usesChair) {
    const chair = wheelchairSide(c, 1);
    return `${bat}${armFar}${chair.behind}${torsoSide(c, 2)}${chair.front}${armNear}${head}`;
  }
  return `${bat}${armFar}${legs}${torso}${armNear}${head}`;
}

/**
 * Mid-swing contact frame, side view facing RIGHT: hips opened, back heel
 * up on the toe, both arms extended, barrel level through the zone. The bat
 * is FORESHORTENED (scaled about the grip) so the level barrel reads as
 * swung out over the plate without leaving the viewBox; a white swoosh arc
 * trails the barrel path. Swing frames converge to ONE geometry — the
 * per-kid stance variants (open/crouch/high) shape only the load pose.
 */
function poseSwingMid(c: Ctx, v: VisualParams, hFront: string): string {
  const w = Math.max(14, Math.round(c.m.halfW * 0.34));
  const pantsDk = darken(PANTS, 0.16);
  const grip = { x: 118, y: 170 };
  const batDeg = 100;
  const batScale = 0.8; // foreshortened vs the 1.3 stance bat, but still long
  const bat = batAt(grip.x, grip.y, batDeg, batScale);
  const swoosh = `
    <g fill="none" stroke="#ffffff" stroke-linecap="round">
      <path d="M 30 90 A 90 90 0 0 1 180 168" stroke-width="7" opacity="0.3"/>
      <path d="M 44 100 A 74 74 0 0 1 168 162" stroke-width="3.5" opacity="0.5"/>
    </g>`;
  const gp = gripPoints(grip.x, grip.y, batDeg, batScale);
  const armFar = `
    ${capsule(`M 98 150 Q 108 158 ${gp.far.x} ${gp.far.y}`, darken(c.jerseyDk, 0.1), 13)}
    ${gripFistFar(c, gp.far, batDeg)}`;
  const armNear = `
    ${capsule(`M 104 152 Q 112 162 ${gp.near.x} ${gp.near.y}`, c.jerseyDk, 13)}
    ${gripFistNear(c, gp.near, batDeg)}`;
  // Front leg braced straight; back leg pivoted up on its toe (toe stays on
  // the ground line — heel lifts, like a real weight transfer).
  const legs = `
    ${capsule('M 92 198 Q 76 214 68 230', pantsDk, w)}
    ${sideShoe(66, 236, 34)}
    ${capsule('M 102 200 Q 124 212 134 228', PANTS, w)}
    ${sideShoe(138, 240, 5)}`;
  const torso = `<g transform="rotate(6 100 190)">${torsoSide(c, 2)}</g>`;
  const head = `
    <g transform="translate(8 2) rotate(4 ${HEAD.cx} ${HEAD.cy})">
      ${headGroup(c, v, hFront, 0.8)}
    </g>`;
  if (c.usesChair) {
    const chair = wheelchairSide(c, 1);
    return `${swoosh}${bat}${armFar}${chair.behind}${torsoSide(c, 2)}${chair.front}${armNear}${head}`;
  }
  return `${swoosh}${bat}${armFar}${legs}${torso}${armNear}${head}`;
}

/**
 * Follow-through, side view facing RIGHT: weight fully on the front leg,
 * back toe dragging, hands finishing high in front of the lead shoulder,
 * barrel wrapped up-back over the shoulders, chin up watching the ball fly.
 */
function poseSwingFollow(c: Ctx, v: VisualParams, hFront: string): string {
  const w = Math.max(14, Math.round(c.m.halfW * 0.34));
  const pantsDk = darken(PANTS, 0.16);
  // Nearly-horizontal wrap IN FRONT of the jersey: the bat layers over the
  // torso (below the chin) so the finish reads as wrapped around the lead
  // shoulder instead of skewering the body — see the concat order below.
  const grip = { x: 110, y: 146 };
  const batDeg = -80;
  const bat = batProp(grip.x, grip.y, batDeg);
  const gp = gripPoints(grip.x, grip.y, batDeg);
  const armFar = `
    ${capsule(`M 96 150 Q 98 138 ${gp.far.x} ${gp.far.y}`, darken(c.jerseyDk, 0.1), 13)}
    ${gripFistFar(c, gp.far, batDeg)}`;
  const armNear = `
    ${capsule(`M 106 152 Q 112 144 ${gp.near.x} ${gp.near.y}`, c.jerseyDk, 13)}
    ${gripFistNear(c, gp.near, batDeg)}`;
  const legs = `
    ${capsule('M 90 198 Q 72 212 60 228', pantsDk, w)}
    ${sideShoe(56, 236, 38)}
    ${capsule('M 104 200 Q 126 212 132 228', PANTS, w)}
    ${sideShoe(136, 240, 4)}`;
  // torsoSide bakes an 8° forward lean — the -10 wrap nets a slight BACK
  // lean, chest tall, watching the flight.
  const torso = `<g transform="rotate(-10 100 185)">${torsoSide(c, 0)}</g>`;
  const head = `
    <g transform="translate(6 -2) rotate(-8 ${HEAD.cx} ${HEAD.cy})">
      ${headGroup(c, v, hFront, 0.8)}
    </g>`;
  if (c.usesChair) {
    const chair = wheelchairSide(c, 1);
    return `${armFar}${chair.behind}${torsoSide(c, 0)}${bat}${chair.front}${armNear}${head}`;
  }
  return `${armFar}${legs}${torso}${bat}${armNear}${head}`;
}

/**
 * Pitching wind-up, front view (the mound faces the plate): throwing arm
 * coiled high overhead, glove arm tucked, front knee lifted mid-windup.
 */
function poseWindup(c: Ctx, v: VisualParams, hFront: string): string {
  const { halfW } = c.m;
  const shoulderY = 150;
  const legHalf = halfW * 0.42;
  // Planted leg straight; the other knee pumps up (shoe hangs mid-air).
  const legs = `
    <rect x="${100 + legHalf - 10}" y="200" width="20" height="28" rx="9" fill="${PANTS}" ${c.S}/>
    ${frontShoe(100 + legHalf)}
    ${capsule(`M ${100 - legHalf} 204 Q ${100 - legHalf - 12} 200 ${100 - legHalf - 14} 212`, PANTS, 16)}
    ${sideShoe(100 - legHalf - 22, 224, -18)}`;
  const throwArm = `
    ${capsule(`M ${100 + halfW - 6} ${shoulderY + 2} Q ${100 + halfW + 18} ${shoulderY - 16} ${100 + halfW + 22} ${shoulderY - 40}`, c.jerseyDk, 15)}
    ${capsule(`M ${100 + halfW + 22} ${shoulderY - 40} Q ${100 + halfW + 18} ${shoulderY - 58} ${100 + halfW + 8} ${shoulderY - 66}`, c.skin, 13)}
    ${fist(c, 100 + halfW + 5, shoulderY - 70, -60)}
    <circle cx="${100 + halfW + 9}" cy="${shoulderY - 76}" r="7" fill="#ffffff" stroke="${OUT}" stroke-width="2.5"/>`;
  const gloveArm = `
    ${capsule(`M ${100 - halfW + 6} ${shoulderY + 4} Q ${100 - halfW - 6} ${shoulderY + 14} ${100 - halfW + 4} ${shoulderY + 26}`, c.jerseyDk, 15)}
    ${mitt(100 - halfW + 10, shoulderY + 32)}`;
  if (c.usesChair) {
    return `${wheelchairFront()}${torsoFront(c)}${throwArm}${gloveArm}${headGroup(c, v, hFront)}`;
  }
  return `${legs}${torsoFront(c)}${throwArm}${gloveArm}${headGroup(c, v, hFront)}`;
}

/**
 * Wind-up stride/plant, front view — the in-between after the leg lift: the
 * stride foot has landed low-forward ON the ground, the throwing arm is at
 * the top of its arc, the glove arm extends toward the plate. Stepped after
 * `windup` at the moment the lean tween reverses.
 */
function poseWindup2(c: Ctx, v: VisualParams, hFront: string): string {
  const { halfW } = c.m;
  const shoulderY = 150;
  const legHalf = halfW * 0.42;
  // Planted back leg stays; the lifted knee has extended into the stride —
  // the front foot lands low-forward with its sole near the ground line.
  const legs = `
    <rect x="${100 + legHalf - 10}" y="200" width="20" height="28" rx="9" fill="${PANTS}" ${c.S}/>
    ${frontShoe(100 + legHalf)}
    ${capsule(`M ${100 - legHalf} 204 Q ${100 - legHalf - 14} 216 ${100 - legHalf - 24} 230`, PANTS, 16)}
    ${sideShoe(100 - legHalf - 30, GROUND - 2, -6)}`;
  // Throwing arm at the top of the arc, ball cocked behind the head.
  const throwArm = `
    ${capsule(`M ${100 + halfW - 6} ${shoulderY + 2} Q ${100 + halfW + 12} ${shoulderY - 22} ${100 + halfW + 8} ${shoulderY - 48}`, c.jerseyDk, 15)}
    ${capsule(`M ${100 + halfW + 8} ${shoulderY - 48} Q ${100 + halfW + 2} ${shoulderY - 62} ${100 + halfW - 8} ${shoulderY - 70}`, c.skin, 13)}
    ${fist(c, 100 + halfW - 12, shoulderY - 73, -85)}
    <circle cx="${100 + halfW - 10}" cy="${shoulderY - 81}" r="7" fill="#ffffff" stroke="${OUT}" stroke-width="2.5"/>`;
  // Glove arm extended front toward the plate, leading the stride.
  const gloveArm = `
    ${capsule(`M ${100 - halfW + 6} ${shoulderY + 4} Q ${100 - halfW - 12} ${shoulderY + 6} ${100 - halfW - 20} ${shoulderY + 2}`, c.jerseyDk, 15)}
    ${mitt(100 - halfW - 26, shoulderY + 2)}`;
  if (c.usesChair) {
    return `${wheelchairFront()}${torsoFront(c)}${throwArm}${gloveArm}${headGroup(c, v, hFront)}`;
  }
  return `${legs}${torsoFront(c)}${throwArm}${gloveArm}${headGroup(c, v, hFront)}`;
}

/**
 * Fielding-ready crouch, front view: everything drops, feet plant wide, knees
 * bow out, arms hang open-forward ready to scoop. Shoes stay ON the ground.
 */
function poseReady(c: Ctx, v: VisualParams, hFront: string): string {
  const { halfW } = c.m;
  const drop = 14;
  const legHalf = halfW * 0.62;
  const legs = (['l', 'r'] as const)
    .map((side) => {
      const s = side === 'l' ? -1 : 1;
      const x = 100 + s * legHalf;
      return `
        ${capsule(`M ${100 + s * (halfW * 0.35)} ${206 + drop} Q ${x + s * 8} ${212 + drop} ${x} ${GROUND - 12}`, PANTS, 17)}
        ${frontShoe(x)}`;
    })
    .join('');
  const shoulderY = 150 + drop;
  const arms = (['l', 'r'] as const)
    .map((side) => {
      const s = side === 'l' ? -1 : 1;
      const sx = 100 + s * (halfW - 4);
      const hx = 100 + s * (halfW + 14);
      return `
        ${capsule(`M ${sx} ${shoulderY + 4} Q ${hx - s * 2} ${shoulderY + 22} ${hx} ${shoulderY + 40}`, c.jerseyDk, 15)}
        ${openHand(c, hx, shoulderY + 47, 90, { s: 1.1, flip: s === 1 })}`;
    })
    .join('');
  const body = `
    <g transform="translate(0 ${drop})">
      ${torsoFront(c)}
    </g>`;
  const head = `
    <g transform="translate(0 ${drop})">
      ${headGroup(c, v, hFront)}
    </g>`;
  if (c.usesChair) {
    // Zoom's "ready" = leaning forward over the wheels, hands wide on the rims.
    return `${wheelchairFront()}${body}${arms}${head}`;
  }
  return `${legs}${body}${arms}${head}`;
}

/**
 * Slide, side view facing RIGHT: laid way back, legs out along the dirt, lead
 * arm thrown up, dust kicked behind. Everything hugs the ground line.
 */
function poseSlide(c: Ctx, v: VisualParams, hBack: string, hFront: string): string {
  const pantsDk = darken(PANTS, 0.16);
  const w = Math.max(14, Math.round(c.m.halfW * 0.34));
  if (c.usesChair) {
    // A wheelchair slide is just Zoom at full tilt — reuse the speed pose.
    const chair = wheelchairSide(c, 2);
    const head = `
      <g transform="translate(10 3) rotate(5 ${HEAD.cx} ${HEAD.cy})">
        ${wrapHeadBack(c, hBack)}${headGroup(c, v, hFront, 0.8)}
      </g>`;
    return `${chair.behind}${torsoSide(c, 2)}${chair.front}${head}`;
  }
  const dust = `
    <g fill="#e0d5c0" stroke="${OUT}" stroke-width="3" opacity="0.85">
      <circle cx="30" cy="${GROUND - 14}" r="12"/>
      <circle cx="46" cy="${GROUND - 26}" r="9"/>
      <circle cx="24" cy="${GROUND - 32}" r="7"/>
    </g>`;
  // Torso laid back at ~40°, hips near the ground around x 84.
  const torso = `
    <g transform="rotate(-42 84 ${GROUND - 34})">
      <rect x="${84 - Math.round(c.m.halfW * 0.55)}" y="${GROUND - 92}" width="${Math.round(c.m.halfW * 1.1)}" height="60" rx="${Math.round(c.m.halfW * 0.4)}" fill="${c.jersey}" ${c.S}/>
    </g>`;
  // Legs shoot forward: lead leg straight to the bag, trail leg tucked under.
  const legs = `
    ${capsule(`M 92 ${GROUND - 30} Q 122 ${GROUND - 26} 150 ${GROUND - 18}`, PANTS, w)}
    ${sideShoe(158, GROUND - 6, 4)}
    ${capsule(`M 88 ${GROUND - 28} Q 106 ${GROUND - 12} 96 ${GROUND - 6}`, pantsDk, w - 2)}
    ${sideShoe(100, GROUND, -4)}`;
  // Trailing arm plants on the dirt; lead arm punches high for balance.
  const arms = `
    ${capsule(`M 66 ${GROUND - 62} Q 52 ${GROUND - 44} 46 ${GROUND - 26}`, c.jerseyDk, 13)}
    ${openHand(c, 45, GROUND - 18, 130, { s: 0.95 })}
    ${capsule(`M 74 ${GROUND - 70} Q 92 ${GROUND - 88} 104 ${GROUND - 100}`, c.jerseyDk, 13)}
    ${fist(c, 109, GROUND - 106, -45, { s: 0.95 })}`;
  // Head sits up out of the lean, chin toward the bag. Back hair rides INSIDE
  // the head transform (behind the skull) — the head has moved a long way
  // from the default anchor, so origin-anchored back hair would float loose.
  const head = `
    <g transform="translate(-32 84) scale(0.92) rotate(-10 ${HEAD.cx} ${HEAD.cy})">
      ${wrapHeadBack(c, hBack)}${headGroup(c, v, hFront, 0.8)}
    </g>`;
  return `${dust}${torso}${legs}${arms}${head}`;
}

// --- Reaction poses (upset / nervous) ---------------------------------------

/**
 * Struck-out slump, front view: shoulders drop, head hangs with a sad face,
 * arms dangle limp, a scuff of kicked dirt by the front shoe. The baked face
 * overrides the kid's resting expression — that's the whole point of the pose.
 */
function poseUpset(c: Ctx, v: VisualParams, hFront: string): string {
  const vv: VisualParams = { ...v, expression: 'upset' };
  const { halfW } = c.m;
  const drop = 8;
  const shoulderY = 150 + drop;
  const badge = `<circle cx="100" cy="${shoulderY + 26}" r="13" fill="${c.trim}" opacity="0.9"/>`;
  // Limp arms: nearly straight down, hands inside the shoulder line.
  const arm = (side: 1 | -1) => {
    const handX = 100 + side * (halfW + 2);
    return `
      ${capsule(`M ${100 + side * (halfW - 6)} ${shoulderY + 2} Q ${100 + side * (halfW + 7)} ${shoulderY + 22} ${handX} ${shoulderY + 44}`, c.jerseyDk, 15)}
      ${fist(c, handX, shoulderY + 52, 90, { flip: side === 1 })}`;
  };
  const torso = `<g transform="translate(0 ${drop})">${torsoFront(c)}</g>`;
  const head = `
    <g transform="translate(0 ${drop + 8}) rotate(-6 ${HEAD.cx} ${HEAD.cy})">
      ${headGroup(c, vv, hFront)}
    </g>`;
  const scuff = `
    <g fill="#e0d5c0" opacity="0.75">
      <circle cx="146" cy="${GROUND - 8}" r="7"/>
      <circle cx="157" cy="${GROUND - 13}" r="4.5"/>
    </g>`;
  if (c.usesChair) {
    return `${wheelchairFront()}${torso}${arm(-1)}${arm(1)}${badge}${head}`;
  }
  return `${legsFront(c)}${scuff}${torso}${arm(-1)}${arm(1)}${badge}${head}`;
}

/**
 * Nervous fidget, front view: hands wring together at the belly, worried face,
 * a sweat bead at the temple. Bases-loaded body language.
 */
function poseNervous(c: Ctx, v: VisualParams, hFront: string): string {
  const vv: VisualParams = { ...v, expression: 'nervous' };
  const { halfW } = c.m;
  const shoulderY = 150;
  const badge = `<circle cx="100" cy="${shoulderY + 26}" r="13" fill="${c.trim}" opacity="0.9"/>`;
  // Both hands meet low-center, slightly overlapping — the wring.
  const arm = (side: 1 | -1) => `
    ${capsule(`M ${100 + side * (halfW - 6)} ${shoulderY + 2} Q ${100 + side * (halfW - 2)} ${shoulderY + 26} ${100 + side * 8} ${shoulderY + 40}`, c.jerseyDk, 15)}
    ${fist(c, 100 + side * 7, shoulderY + 44, side === -1 ? 20 : 160)}`;
  const sweat = `
    <path d="M 154 52 q 8 12 1 17 q -9 -3 -5 -15 Z" fill="#9fd8f5" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>`;
  const head = `
    <g transform="rotate(3 ${HEAD.cx} ${HEAD.cy})">
      ${headGroup(c, vv, hFront)}
      ${sweat}
    </g>`;
  if (c.usesChair) {
    return `${wheelchairFront()}${torsoFront(c)}${arm(-1)}${arm(1)}${badge}${head}`;
  }
  return `${legsFront(c)}${torsoFront(c)}${arm(-1)}${arm(1)}${badge}${head}`;
}

/**
 * Inside-pitch dodge, front view: the whole upper body leans hard AWAY from
 * the plate (screen-left — the rig batter stands on the 3B side with the zone
 * to their right), both hands fling up toward the incoming ball, worried
 * baked face. The lean moves the head a long way, so back hair rides INSIDE
 * the lean+head transform (the slide/dive rule), never at the origin anchor.
 */
function poseDodge(c: Ctx, v: VisualParams, hBack: string, hFront: string): string {
  const vv: VisualParams = { ...v, expression: 'nervous' };
  const { halfW } = c.m;
  const shoulderY = 150;
  const badge = `<circle cx="100" cy="${shoulderY + 26}" r="13" fill="${c.trim}" opacity="0.9"/>`;
  // Shield arms: both fling up toward the plate side (screen-right), open
  // hands turned at the ball.
  const nearArm = `
    ${capsule(`M ${100 + (halfW - 6)} ${shoulderY + 2} Q ${100 + halfW + 12} ${shoulderY - 16} ${100 + halfW + 20} ${shoulderY - 36}`, c.jerseyDk, 15)}
    ${openHand(c, 100 + halfW + 24, shoulderY - 44, 40)}`;
  const farArm = `
    ${capsule(`M ${100 - (halfW - 8)} ${shoulderY + 4} Q ${100 + 2} ${shoulderY - 8} ${100 + 20} ${shoulderY - 22}`, c.jerseyDk, 14)}
    ${openHand(c, 100 + 26, shoulderY - 28, 60, { s: 0.9 })}`;
  // The lean pivots at the hips; the head tips further and tucks slightly.
  const upper = `
    <g transform="rotate(-14 100 ${GROUND - 46})">
      ${torsoFront(c)}
      ${farArm}${nearArm}${badge}
      <g transform="translate(-6 2) rotate(-8 ${HEAD.cx} ${HEAD.cy})">
        ${wrapHeadBack(c, hBack)}${headGroup(c, vv, hFront)}
      </g>
    </g>`;
  if (c.usesChair) {
    return `${wheelchairFront()}${upper}`;
  }
  return `${legsFront(c)}${upper}`;
}

// --- Action poses (throw / catch / dive) ------------------------------------

const MITT = '#a9743f';

/** The fielder's mitt: ellipse + seam, at (x, y), scaled a touch by `s`. */
function mitt(x: number, y: number, s = 1): string {
  return `
    <ellipse cx="${x}" cy="${y}" rx="${14 * s}" ry="${12 * s}" fill="${MITT}" stroke="${OUT}" stroke-width="3"/>
    <path d="M ${x - 8 * s} ${y - 6 * s} q ${8 * s} -6 ${16 * s} 0" fill="none" stroke="${OUT}" stroke-width="3"/>`;
}

/**
 * Mid-throw, side view facing RIGHT (flipX for leftward throws): lunged
 * stride, torso leaned in, throwing arm whipped forward at release. NO baked
 * ball — the live sim's ball is already flying when this pose shows.
 */
function poseThrow(c: Ctx, v: VisualParams, hFront: string): string {
  const w = Math.max(14, Math.round(c.m.halfW * 0.34));
  const pantsDk = darken(PANTS, 0.16);
  const legs = `
    ${capsule('M 92 198 Q 70 214 54 230', pantsDk, w)}
    ${sideShoe(48, 242, -26)}
    ${capsule('M 102 200 Q 126 210 138 228', PANTS, w)}
    ${sideShoe(144, 240, 8)}`;
  // Glove arm trails behind-low; throw arm extends forward-high, hand open.
  const gloveArm = `
    ${capsule('M 94 154 Q 78 166 68 178', darken(c.jerseyDk, 0.1), 13)}
    ${mitt(64, 186, 0.9)}`;
  const throwArm = `
    ${capsule('M 106 152 Q 128 136 146 126', c.jerseyDk, 14)}
    ${capsule('M 146 126 Q 158 120 166 116', c.skin, 12)}
    ${openHand(c, 172, 112, -25, { s: 0.95 })}`;
  const head = `
    <g transform="translate(8 4) rotate(7 ${HEAD.cx} ${HEAD.cy})">
      ${headGroup(c, v, hFront, 0.8)}
    </g>`;
  if (c.usesChair) {
    const chair = wheelchairSide(c, 2);
    return `${gloveArm}${chair.behind}${torsoSide(c, 2)}${chair.front}${throwArm}${head}`;
  }
  return `${gloveArm}${legs}${torsoSide(c, 0)}${throwArm}${head}`;
}

/**
 * Glove-up catch, front view: planted feet, mitt stretched high beside the
 * head, balance arm half out, chin tipped up toward the ball.
 */
function poseCatch(c: Ctx, v: VisualParams, hFront: string): string {
  const { halfW } = c.m;
  const shoulderY = 150;
  const badge = `<circle cx="100" cy="${shoulderY + 26}" r="13" fill="${c.trim}" opacity="0.9"/>`;
  const gx = 100 - halfW - 10;
  // Drawn AFTER the head: a glove reaching high must read in FRONT of the
  // hair, or the mitt vanishes behind the dome.
  const gloveArm = `
    ${capsule(`M ${100 - halfW + 6} ${shoulderY + 2} Q ${gx - 6} ${shoulderY - 28} ${gx - 2} ${shoulderY - 58}`, c.jerseyDk, 15)}
    ${capsule(`M ${gx - 2} ${shoulderY - 58} Q ${gx - 1} ${shoulderY - 70} ${gx + 1} ${shoulderY - 80}`, c.skin, 13)}
    ${mitt(gx + 2, shoulderY - 93, 1.15)}`;
  const balanceArm = `
    ${capsule(`M ${100 + halfW - 6} ${shoulderY + 2} Q ${100 + halfW + 12} ${shoulderY - 8} ${100 + halfW + 18} ${shoulderY - 22}`, c.jerseyDk, 15)}
    ${openHand(c, 100 + halfW + 21, shoulderY - 29, -45)}`;
  const head = `
    <g transform="rotate(-6 ${HEAD.cx} ${HEAD.cy})">
      ${headGroup(c, v, hFront, -0.4)}
    </g>`;
  if (c.usesChair) {
    return `${wheelchairFront()}${torsoFront(c)}${balanceArm}${badge}${head}${gloveArm}`;
  }
  return `${legsFront(c)}${torsoFront(c)}${balanceArm}${badge}${head}${gloveArm}`;
}

/**
 * Full-layout dive, side view facing RIGHT: airborne and horizontal just off
 * the grass, mitt arm leading, legs trailing, dust kicked behind. The
 * wheelchair kid gets a lean-and-reach instead — full tilt, arm stretched.
 */
function poseDive(c: Ctx, v: VisualParams, hBack: string, hFront: string): string {
  const w = Math.max(13, Math.round(c.m.halfW * 0.3));
  const pantsDk = darken(PANTS, 0.16);
  if (c.usesChair) {
    const chair = wheelchairSide(c, 2);
    const reach = `
      ${capsule('M 104 150 Q 132 140 154 134', c.jerseyDk, 14)}
      ${capsule('M 154 134 Q 166 132 174 132', c.skin, 12)}
      ${mitt(184, 132, 1)}`;
    const head = `
      <g transform="translate(12 6) rotate(9 ${HEAD.cx} ${HEAD.cy})">
        ${wrapHeadBack(c, hBack)}${headGroup(c, v, hFront, 0.8)}
      </g>`;
    return `${chair.behind}${torsoSide(c, 4)}${chair.front}${reach}${head}`;
  }
  const dust = `
    <g fill="#e0d5c0" opacity="0.85">
      <circle cx="26" cy="${GROUND - 12}" r="11"/>
      <circle cx="42" cy="${GROUND - 24}" r="8"/>
      <circle cx="20" cy="${GROUND - 30}" r="6"/>
    </g>`;
  // Prone torso: a horizontal jersey capsule floating just off the ground.
  const torso = `
    <rect x="60" y="${GROUND - 62}" width="${Math.round(c.m.halfW * 1.6)}" height="38" rx="17" fill="${c.gJersey}" ${c.S}/>
    <rect x="64" y="${GROUND - 34}" width="${Math.round(c.m.halfW * 1.6) - 8}" height="9" rx="4" fill="${c.jerseyDk}"/>`;
  // Legs trail back-up; toes point away from the reach.
  const legs = `
    ${capsule(`M 70 ${GROUND - 46} Q 50 ${GROUND - 56} 36 ${GROUND - 62}`, pantsDk, w)}
    ${sideShoe(26, GROUND - 58, -155)}
    ${capsule(`M 72 ${GROUND - 38} Q 54 ${GROUND - 38} 40 ${GROUND - 32}`, PANTS, w)}
    ${sideShoe(30, GROUND - 26, -175)}`;
  // Far arm reaches low under the chin; near arm leads with the mitt.
  const armFar = `
    ${capsule(`M 122 ${GROUND - 46} Q 140 ${GROUND - 40} 154 ${GROUND - 36}`, darken(c.jerseyDk, 0.1), 12)}
    ${openHand(c, 160, GROUND - 34, 10, { far: true, s: 0.85 })}`;
  const armNear = `
    ${capsule(`M 124 ${GROUND - 56} Q 148 ${GROUND - 60} 166 ${GROUND - 60}`, c.jerseyDk, 13)}
    ${mitt(182, GROUND - 60, 1)}`;
  // Head up-forward out of the prone torso, chin toward the ball. Back hair
  // rides inside the transform — see poseSlide.
  const head = `
    <g transform="translate(32 100) scale(0.88) rotate(9 ${HEAD.cx} ${HEAD.cy})">
      ${wrapHeadBack(c, hBack)}${headGroup(c, v, hFront, 0.8)}
    </g>`;
  return `${dust}${legs}${torso}${armFar}${head}${armNear}`;
}

// --- Rear poses (batRear / catchRear — the behind-home-plate rig) -----------

/**
 * Batting stance seen from BEHIND (the rig's foreground batter): wide planted
 * legs, jersey back with the number, both hands up to a grip on the right,
 * bat cocked up over the right shoulder, head turned away toward the pitcher.
 */
function poseBatRear(c: Ctx, v: VisualParams, hRear: string): string {
  const { halfW } = c.m;
  // Stance variant mirrors poseBat: grip height + bat angle + crouch drop.
  const stance = v.stance;
  const drop = stance === 'crouch' ? 9 : 0;
  // Hands stacked HIGH beside the right shoulder (chest/chin height), barrel
  // near-vertical rising past the cap on the head's right — the Backyard
  // silhouette. Drawn first: the bat's inner edge tucks behind the big head.
  const grip = {
    x: stance === 'high' ? 152 : stance === 'open' ? 146 : 150,
    y: (stance === 'high' ? 134 : stance === 'crouch' ? 148 : 140) + drop,
  };
  const batDeg = stance === 'high' ? 2 : stance === 'open' ? 14 : 6;
  const bat = batAt(grip.x, grip.y, batDeg, BAT_STANCE_SCALE);
  // Both arms reach from the shoulder line (y≈150) across the jersey back UP
  // to the high grip. The far (left) arm folds at a real elbow — jersey upper
  // arm across the back, skin forearm rising to the grip — mirroring
  // poseBat's loaded back elbow; two fists wrap the handle above the knob.
  const shL = 100 - (halfW - 6);
  const shR = 100 + (halfW - 6);
  const gp = gripPoints(grip.x, grip.y, batDeg, BAT_STANCE_SCALE);
  const elbow = { x: 128, y: 160 + drop };
  const arms = `
    ${capsule(`M ${shL} 152 Q ${shL + 20} ${166 + drop} ${elbow.x} ${elbow.y}`, darken(c.jerseyDk, 0.1), 13)}
    ${capsule(`M ${elbow.x} ${elbow.y} Q ${elbow.x + 18} ${elbow.y - 14} ${gp.far.x} ${gp.far.y}`, darken(c.skin, 0.1), 11)}
    ${gripFistFar(c, gp.far, batDeg)}
    ${capsule(`M ${shR} 152 Q ${grip.x - 10} 150 ${gp.near.x} ${gp.near.y}`, c.jerseyDk, 13)}
    ${gripFistNear(c, gp.near, batDeg)}`;
  // Head turned a quarter toward the pitch: profile cheek/eye on the right.
  const head = `
    <g transform="translate(3 0) rotate(5 ${HEAD.cx} ${HEAD.cy})">
      ${headRearGroup(c, v, hRear, true)}
    </g>`;
  if (c.usesChair) {
    // Rear view of the chair ≈ front geometry (two wheels flanking the seat).
    return `${bat}${wheelchairFront()}${torsoRear(c)}${arms}${head}`;
  }
  const legHalf = halfW * 0.75;
  const legs = (['l', 'r'] as const)
    .map((side) => {
      const s = side === 'l' ? -1 : 1;
      const x = 100 + s * legHalf;
      return `
        ${capsule(`M ${100 + s * (halfW * 0.35)} 206 Q ${x + s * 6} 214 ${x} ${GROUND - 12}`, PANTS, 16)}
        ${frontShoe(x)}`;
    })
    .join('');
  const torso = `<g transform="rotate(3 100 180)">${torsoRear(c)}</g>`;
  return `${bat}${legs}${torso}${arms}${head}`;
}

/**
 * Swing load from BEHIND (the rig batter) — the in-between before contact:
 * hands pushed back-up beside the right shoulder, bat more vertical, lead
 * (left) leg striding, torso coiled toward the right. Converged geometry like
 * the other swing frames. Rear = no face.
 */
function poseSwingLoadRear(c: Ctx, v: VisualParams, hRear: string): string {
  const { halfW } = c.m;
  // Coil from the high stance: hands push back-up, barrel tips a few degrees.
  const grip = { x: 154, y: 134 };
  const batDeg = 12;
  const bat = batAt(grip.x, grip.y, batDeg, BAT_STANCE_SCALE);
  const shL = 100 - (halfW - 6);
  const shR = 100 + (halfW - 6);
  const gp = gripPoints(grip.x, grip.y, batDeg, BAT_STANCE_SCALE);
  const elbow = { x: 130, y: 158 };
  const arms = `
    ${capsule(`M ${shL} 152 Q ${shL + 22} 166 ${elbow.x} ${elbow.y}`, darken(c.jerseyDk, 0.1), 13)}
    ${capsule(`M ${elbow.x} ${elbow.y} Q ${elbow.x + 20} ${elbow.y - 14} ${gp.far.x} ${gp.far.y}`, darken(c.skin, 0.1), 11)}
    ${gripFistFar(c, gp.far, batDeg)}
    ${capsule(`M ${shR} 152 Q 136 148 ${gp.near.x} ${gp.near.y}`, c.jerseyDk, 13)}
    ${gripFistNear(c, gp.near, batDeg)}`;
  const head = `
    <g transform="translate(4 0) rotate(7 ${HEAD.cx} ${HEAD.cy})">
      ${headRearGroup(c, v, hRear, true)}
    </g>`;
  if (c.usesChair) {
    return `${bat}${wheelchairFront()}${torsoRear(c)}${arms}${head}`;
  }
  const legHalf = halfW * 0.75;
  const legs = (['l', 'r'] as const)
    .map((side) => {
      const s = side === 'l' ? -1 : 1;
      // Lead (left) foot striding a touch wider than the stance.
      const x = s === -1 ? 100 - legHalf - 6 : 100 + legHalf;
      return `
        ${capsule(`M ${100 + s * (halfW * 0.35)} 206 Q ${x + s * 6} 214 ${x} ${GROUND - 12}`, PANTS, 16)}
        ${frontShoe(x)}`;
    })
    .join('');
  const torso = `<g transform="rotate(5 100 180)">${torsoRear(c)}</g>`;
  return `${bat}${legs}${torso}${arms}${head}`;
}

/**
 * Mid-swing contact frame from BEHIND (the rig batter): hips opened, barrel
 * driven level across the zone toward screen-left, foreshortened like
 * poseSwingMid, swoosh trailing from the load position. Rear = no face.
 */
function poseSwingMidRear(c: Ctx, v: VisualParams, hRear: string): string {
  const { halfW } = c.m;
  const grip = { x: 84, y: 168 };
  const batDeg = -100;
  const batScale = 0.8; // foreshortened vs the 1.3 stance bat, but still long
  const bat = batAt(grip.x, grip.y, batDeg, batScale);
  const swoosh = `
    <g fill="none" stroke="#ffffff" stroke-linecap="round">
      <path d="M 170 90 A 90 90 0 0 0 20 168" stroke-width="7" opacity="0.3"/>
      <path d="M 156 100 A 74 74 0 0 0 32 162" stroke-width="3.5" opacity="0.5"/>
    </g>`;
  const shL = 100 - (halfW - 6);
  const shR = 100 + (halfW - 6);
  const gp = gripPoints(grip.x, grip.y, batDeg, batScale);
  const arms = `
    ${capsule(`M ${shR} 152 Q 108 162 ${gp.far.x} ${gp.far.y}`, darken(c.jerseyDk, 0.1), 13)}
    ${gripFistFar(c, gp.far, batDeg)}
    ${capsule(`M ${shL} 152 Q 88 162 ${gp.near.x} ${gp.near.y}`, c.jerseyDk, 13)}
    ${gripFistNear(c, gp.near, batDeg)}`;
  const head = `
    <g transform="translate(-3 0) rotate(-5 ${HEAD.cx} ${HEAD.cy})">
      ${headRearGroup(c, v, hRear)}
    </g>`;
  if (c.usesChair) {
    return `${swoosh}${bat}${wheelchairFront()}${torsoRear(c)}${arms}${head}`;
  }
  const legHalf = halfW * 0.75;
  const legs = (['l', 'r'] as const)
    .map((side) => {
      const s = side === 'l' ? -1 : 1;
      // Left (lead) foot braced a touch wider — the weight went that way.
      const x = s === -1 ? 100 - legHalf - 6 : 100 + legHalf;
      return `
        ${capsule(`M ${100 + s * (halfW * 0.35)} 206 Q ${x + s * 6} 214 ${x} ${GROUND - 12}`, PANTS, 16)}
        ${frontShoe(x)}`;
    })
    .join('');
  const torso = `<g transform="rotate(-6 100 180)">${torsoRear(c)}</g>`;
  return `${swoosh}${bat}${legs}${torso}${arms}${head}`;
}

/**
 * Follow-through from BEHIND: hands finishing high on the lead side, barrel
 * wrapped up over the left shoulder pointing up-left, weight on the left
 * leg with the right toe dragging. Rear = no face.
 */
function poseSwingFollowRear(c: Ctx, v: VisualParams, hRear: string): string {
  const { halfW } = c.m;
  const grip = { x: 90, y: 140 };
  const batDeg = -55;
  // The bat layers in FRONT of the jersey back (between torso and the near
  // arm) so the finish wraps around the lead shoulder instead of vanishing
  // behind the body — mirrors poseSwingFollow's concat order.
  const bat = batProp(grip.x, grip.y, batDeg);
  const shL = 100 - (halfW - 6);
  const shR = 100 + (halfW - 6);
  const gp = gripPoints(grip.x, grip.y, batDeg);
  const armFar = `
    ${capsule(`M ${shR} 152 Q 104 144 ${gp.far.x} ${gp.far.y}`, darken(c.jerseyDk, 0.1), 13)}
    ${gripFistFar(c, gp.far, batDeg)}`;
  const armNear = `
    ${capsule(`M ${shL} 152 Q 88 148 ${gp.near.x} ${gp.near.y}`, c.jerseyDk, 13)}
    ${gripFistNear(c, gp.near, batDeg)}`;
  const head = `
    <g transform="translate(2 -2) rotate(-8 ${HEAD.cx} ${HEAD.cy})">
      ${headRearGroup(c, v, hRear)}
    </g>`;
  if (c.usesChair) {
    return `${armFar}${wheelchairFront()}${torsoRear(c)}${bat}${armNear}${head}`;
  }
  const legHalf = halfW * 0.75;
  const legL = `
    ${capsule(`M ${100 - halfW * 0.35} 206 Q ${100 - legHalf - 4} 214 ${100 - legHalf} ${GROUND - 12}`, PANTS, 16)}
    ${frontShoe(100 - legHalf)}`;
  const legR = `
    ${capsule(`M ${100 + halfW * 0.35} 206 Q ${100 + legHalf + 2} 216 ${100 + legHalf + 8} ${GROUND - 16}`, PANTS, 15)}
    ${sideShoe(100 + legHalf + 10, GROUND - 12, 30)}`;
  const torso = `<g transform="rotate(-4 100 180)">${torsoRear(c)}</g>`;
  return `${armFar}${legL}${legR}${torso}${bat}${armNear}${head}`;
}

/**
 * Catcher's crouch seen from BEHIND (the rig's bottom-of-frame kid): deep
 * squat, shoes planted wide ON the ground line, squashed jersey back, head
 * dropped onto the shoulders, elbows out.
 */
function poseCatchRear(c: Ctx, v: VisualParams, hRear: string): string {
  const { halfW } = c.m;
  const drop = 54;
  const head = `
    <g transform="translate(0 ${drop})">
      ${headRearGroup(c, v, hRear)}
    </g>`;
  const elbows = `
    ${capsule(`M ${100 - halfW + 2} 196 Q ${100 - halfW - 12} 202 ${100 - halfW - 15} 214`, c.jerseyDk, 13)}
    ${capsule(`M ${100 + halfW - 2} 196 Q ${100 + halfW + 12} 202 ${100 + halfW + 15} 214`, c.jerseyDk, 13)}`;
  // Squashed jersey back + hem + number, hips near the heels.
  const w = Math.round(halfW * 2.1);
  const torso = `
    <rect x="${100 - w / 2}" y="170" width="${w}" height="58" rx="24" fill="${c.gJersey}" ${c.S}/>
    <rect x="${100 - w / 2 + 5}" y="214" width="${w - 10}" height="10" rx="5" fill="${c.jerseyDk}"/>
    ${badge(c, 100, 200, 14)}`;
  if (c.usesChair) {
    // Seated behind the plate: the chair IS the crouch.
    return `${wheelchairFront()}${torso}${elbows}${head}`;
  }
  const legHalf = halfW * 0.66;
  const legs = (['l', 'r'] as const)
    .map((side) => {
      const s = side === 'l' ? -1 : 1;
      const x = 100 + s * legHalf;
      return `
        ${capsule(`M ${x - s * 3} ${GROUND - 36} Q ${x} ${GROUND - 24} ${x} ${GROUND - 10}`, PANTS, 15)}
        ${frontShoe(x)}`;
    })
    .join('');
  return `${legs}${torso}${elbows}${head}`;
}

// --- Assembly --------------------------------------------------------------

export function buildCharacterSVG(
  v: VisualParams,
  pose: Pose = 'stand',
  team?: { uniform?: number; logo?: string },
  opts?: { street?: boolean }
): string {
  // Team-uniform variant: swap the jersey palette (and stamp the logo badge)
  // without touching the kid's own VisualParams.
  if (team?.uniform !== undefined) v = { ...v, uniform: team.uniform };
  const skin = SKIN_TONES[v.skin] ?? SKIN_TONES[0];
  const skinDk = darken(skin, 0.12);
  const hairColor = HAIR_COLORS[v.hairColor] ?? HAIR_COLORS[0];
  const uni = UNIFORM_COLORS[v.uniform] ?? UNIFORM_COLORS[0];
  const w = buildWardrobe(v, uni, !!opts?.street);
  const c: Ctx = {
    skin,
    skinDk,
    jersey: w.top,
    jerseyDk: w.topDk,
    trim: w.trim,
    gSkin: 'url(#skinG)',
    gJersey: 'url(#jerseyG)',
    gPants: 'url(#pantsG)',
    m: buildBodySpec(v),
    w,
    S: `stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round"`,
    usesChair: v.accessory === 'wheelchair',
    logo: team?.logo,
  };
  const h = hair(v.hair, 'url(#hairG)', 'url(#hairDkG)');
  const shoulderY = 150;

  // Chest number badge (front jersey poses only — street clothes have none).
  const number = w.kind === 'jersey' ? badge(c, 100, shoulderY + 26, 13) : '';

  let layers: string;
  if (
    pose === 'batRear' ||
    pose === 'catchRear' ||
    pose === 'swingLoadRear' ||
    pose === 'swingMidRear' ||
    pose === 'swingFollowRear'
  ) {
    // Rear poses use the back-of-head hair set; the front set is ignored.
    const hr = hairRear(v.hair, 'url(#hairG)', 'url(#hairDkG)');
    layers =
      pose === 'batRear'
        ? poseBatRear(c, v, hr)
        : pose === 'catchRear'
          ? poseCatchRear(c, v, hr)
          : pose === 'swingLoadRear'
            ? poseSwingLoadRear(c, v, hr)
            : pose === 'swingMidRear'
              ? poseSwingMidRear(c, v, hr)
              : poseSwingFollowRear(c, v, hr);
  } else if (pose === 'bat') {
    // Back hair goes BEHIND the body (like the run poses) — concatenating it
    // into the head group draws afros/long drapes OVER the face. It wears the
    // kid's head transform via wrapHeadBack so it tracks head scale/lift.
    layers = `${wrapHeadBack(c, h.back)}${poseBat(c, v, h.front)}`;
  } else if (pose === 'windup') {
    layers = `${wrapHeadBack(c, h.back)}${poseWindup(c, v, h.front)}`;
  } else if (pose === 'windup2') {
    layers = `${wrapHeadBack(c, h.back)}${poseWindup2(c, v, h.front)}`;
  } else if (pose === 'ready') {
    layers = `${wrapHeadBack(c, h.back)}${poseReady(c, v, h.front)}`;
  } else if (pose === 'slide') {
    layers = poseSlide(c, v, h.back, h.front);
  } else if (pose === 'upset') {
    layers = `${wrapHeadBack(c, h.back)}${poseUpset(c, v, h.front)}`;
  } else if (pose === 'nervous') {
    layers = `${wrapHeadBack(c, h.back)}${poseNervous(c, v, h.front)}`;
  } else if (pose === 'dodge') {
    layers = poseDodge(c, v, h.back, h.front); // hBack rides inside the lean
  } else if (pose === 'throw') {
    layers = `${wrapHeadBack(c, h.back)}${poseThrow(c, v, h.front)}`;
  } else if (pose === 'catch') {
    layers = `${wrapHeadBack(c, h.back)}${poseCatch(c, v, h.front)}`;
  } else if (pose === 'dive') {
    layers = poseDive(c, v, h.back, h.front);
  } else if (pose === 'swingLoad') {
    layers = `${wrapHeadBack(c, h.back)}${poseSwingLoad(c, v, h.front)}`;
  } else if (pose === 'swingMid') {
    layers = `${wrapHeadBack(c, h.back)}${poseSwingMid(c, v, h.front)}`;
  } else if (pose === 'swingFollow') {
    layers = `${wrapHeadBack(c, h.back)}${poseSwingFollow(c, v, h.front)}`;
  } else if (pose === 'run1' || pose === 'run2' || pose === 'run3' || pose === 'run4') {
    const frame: RunFrame = pose === 'run1' ? 1 : pose === 'run2' ? 2 : pose === 'run3' ? 3 : 4;
    const dropY = { 1: 0, 2: 3, 3: 1, 4: 1 }[frame]; // gallop bounce (passes sit between)
    // Head shifted + tilted toward travel; pupils lead the motion.
    const head = `
      <g transform="translate(10 ${dropY}) rotate(5 ${HEAD.cx} ${HEAD.cy})">
        ${headGroup(c, v, h.front, 0.8)}
      </g>`;
    if (c.usesChair) {
      const chair = wheelchairSide(c, frame);
      layers = `${wrapHeadBack(c, h.back)}${chair.behind}${torsoSide(c, 2)}${chair.front}${head}`;
    } else {
      const arms = armsRun(c, frame);
      layers = `${wrapHeadBack(c, h.back)}${arms.far}${legsRun(c, frame)}${torsoSide(c, dropY)}${arms.near}${head}`;
    }
  } else {
    // Same back-to-front order as always: chair → back hair → legs → torso …
    const arms = pose === 'cheer' ? armsCheer(c) : armsStand(c);
    layers = c.usesChair
      ? `${wheelchairFront()}${wrapHeadBack(c, h.back)}${torsoFront(c)}${arms}${number}${headGroup(c, v, h.front)}`
      : `${wrapHeadBack(c, h.back)}${legsFront(c)}${torsoFront(c)}${arms}${number}${headGroup(c, v, h.front)}`;
  }

  // Height scale is anchored at GROUND so feet stay planted on the sacred
  // ground line — shorter kids' heads drop, their shoes never float.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}">
  ${gradientDefs(skin, hairColor, w.top, w.bottom)}
  <g paint-order="stroke" transform="translate(100 ${GROUND}) scale(${c.m.scale}) translate(-100 -${GROUND})">
    ${layers}
  </g>
</svg>`;
}
