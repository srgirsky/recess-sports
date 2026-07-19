// ---------------------------------------------------------------------------
// buildCharacterSVG(visual, pose) -> an SVG document string.
//
// Modern flat-mascot style: bold consistent outline, soft cell-shading (a
// derived darker shade, not gradients), rounded friendly proportions, and real
// expressions. Still just string templating — 30 distinct kids from parameters,
// zero image files. Fixed 200x260 viewBox so every kid aligns identically.
//
// POSES: 'stand' (front view, the default/base texture), 'run1'/'run2' (a
// side-view two-frame run cycle, drawn facing RIGHT — flip the sprite for
// leftward travel), and 'cheer' (front view, arms up). Every pose bottoms out
// on the same GROUND line so texture swaps under setOrigin(0.5, 1) never make
// the feet pop. Side poses use the classic small-sprite "¾ cheat": the front
// head (all 11 hairstyles + 6 expressions reused verbatim) rides a side-view
// body, shifted and tilted toward travel.
// ---------------------------------------------------------------------------

import type { VisualParams, HairStyle, Expression, BodyType } from '../data/types';
import { SKIN_TONES, HAIR_COLORS, UNIFORM_COLORS } from './palette';

export type Pose = 'stand' | 'run1' | 'run2' | 'cheer' | 'bat' | 'windup' | 'ready' | 'slide';
export const POSES: Pose[] = ['stand', 'run1', 'run2', 'cheer', 'bat', 'windup', 'ready', 'slide'];

const VIEW_W = 200;
const VIEW_H = 260;

/**
 * PROTOTYPE FLAG — soft-3D "Trash Truck" style. true = lineless matte-CG
 * look: shape outlines vanish (SW 0), limbs get a tinted self-colored edge
 * instead of navy ink, facial features render in warm brown, eyes shrink to
 * dark button eyes with one key-light spec, and the whole palette is muted
 * via soften(). false = the original bold-outline flat-mascot style.
 * Flip + reload (or re-run the G gallery) to compare. If we adopt this for
 * real: bake the palette into palette.ts, restyle the field to match, and
 * update CLAUDE.md/docs.
 */
export const SOFT3D = true;

const OUT = '#26333f'; // outline color (classic style)
const SW = SOFT3D ? 0 : 5; // outline width — 0 removes shape outlines wholesale
/** Facial-feature ink: warm brown reads "rendered", navy reads "drawn". */
const INK = SOFT3D ? '#4a3a2e' : OUT;

/** Lowest ink line for every pose (shoe soles / wheel bottoms). Keep sacred. */
const GROUND = 248;

const HEAD = { cx: 100, cy: 82, r: 50 };

const PANTS = '#f2ede2'; // baseball-pant cream
const SOLE = '#d8d3c8';
const SHOE_EDGE = SOFT3D ? '#c8c1b2' : OUT;
const SHOE_SW = SOFT3D ? 3 : 4;
/** Wheelchair metal in soft mode: cool gray instead of navy ink. */
const METAL_DK = SOFT3D ? '#3c4650' : OUT;

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

/**
 * Soft-3D palette pass: pulls a color ~22% toward its own luminance (matte,
 * desaturated) with a slight warm bias — the muted sage/cream/wheat range of
 * the Trash Truck poster instead of candy saturation. Hex in, hex out.
 */
function soften(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const mix = (c: number, warm: number) => clamp(c + (l - c) * 0.22 + warm);
  return '#' + ((mix(r, 6) << 16) | (mix(g, 2) << 8) | mix(b, -5)).toString(16).padStart(6, '0');
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
  halfW: number; // torso half-width
  headR: number;
  scale: number;
}
function bodyMetrics(t: BodyType | undefined): Body {
  switch (t) {
    case 'chunky':
      return { halfW: 54, headR: 50, scale: 1 };
    case 'small':
      return { halfW: 38, headR: 45, scale: 0.94 };
    default:
      return { halfW: 46, headR: 50, scale: 1 };
  }
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
  S: string; // standard outline attributes
  usesChair: boolean;
}

/**
 * The <defs> block for one character document: soft airbrushed gradients
 * derived from the kid's own palette. Light stop sits toward the upper-left
 * (the key light), dark stop lower-right — same convention as every layered
 * shade in this file. Ids are per-document (each pose is its own SVG).
 */
function gradientDefs(skin: string, hairColor: string, jersey: string): string {
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
  // Soft mode leans harder on the gradients — with no outlines they carry
  // ALL the form, so both the light and dark stops push further.
  return SOFT3D
    ? `<defs>
    ${radial('skinG', skin, 0.36, 0.3)}
    ${radial('hairG', hairColor, 0.26, 0.34)}
    ${radial('hairDkG', darken(hairColor, 0.22), 0.24, 0.3)}
    ${linear('jerseyG', jersey, 0.38, 0.36)}
    ${linear('pantsG', PANTS, 0.3, 0.24)}
  </defs>`
    : `<defs>
    ${radial('skinG', skin, 0.28, 0.22)}
    ${radial('hairG', hairColor, 0.18, 0.28)}
    ${radial('hairDkG', darken(hairColor, 0.22), 0.18, 0.24)}
    ${linear('jerseyG', jersey, 0.3, 0.3)}
    ${linear('pantsG', PANTS, 0.25, 0.18)}
  </defs>`;
}

// --- Face ------------------------------------------------------------------

function eye(x: number, y: number, open = 1, look = 0): string {
  if (SOFT3D) {
    // Small wide-set button eyes (the Trash Truck read): dark warm oval, no
    // sclera, one key-light spec toward the upper-left. Charm from restraint.
    const ry = 7.5 * open;
    const px = x + look * 2;
    return `
    <ellipse cx="${px}" cy="${y + 1}" rx="6" ry="${ry}" fill="#3a2d24"/>
    <circle cx="${px - 2}" cy="${y + 1 - ry * 0.35}" r="1.9" fill="#fff8ec" opacity="0.95"/>`;
  }
  const rx = 9;
  const ry = 11 * open;
  const px = x + look * 3;
  return `
    <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#ffffff" stroke="${OUT}" stroke-width="3"/>
    <circle cx="${px}" cy="${y + ry * 0.25}" r="5.5" fill="#1b2833"/>
    <circle cx="${px + 2}" cy="${y + ry * 0.25 - 3}" r="2" fill="#ffffff"/>`;
}

function wink(x: number, y: number): string {
  return `<path d="M ${x - 9} ${y} q 9 8 18 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
}

function brows(expr: Expression, lx: number, rx: number, y: number): string {
  const b = (x: number, tilt: number) =>
    `<path d="M ${x - 9} ${y + tilt} q 9 -5 18 ${-tilt}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
  switch (expr) {
    case 'determined':
      return b(lx, 6) + `<path d="M ${rx - 9} ${y - 6} q 9 5 18 6" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    case 'cool':
      return b(lx, 0) + b(rx, -5); // one raised
    case 'surprised':
      return b(lx, -6) + b(rx, -6); // both high
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
    default: // happy
      return `<path d="M 82 ${y - 2} q 18 20 36 0" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;
  }
}

/** look shifts the pupils sideways (run poses look toward travel). */
function face(v: VisualParams, look = 0): string {
  const expr = v.expression ?? 'happy';
  const eyeY = 82;
  const open = expr === 'determined' ? 0.7 : expr === 'surprised' ? 1.25 : 1;
  const gaze = expr === 'cool' ? 0.4 : look;
  const leftEye = eye(82, eyeY, open, gaze);
  const rightEye = expr === 'goofy' ? wink(118, eyeY) : eye(118, eyeY, open, gaze);
  const cheeks = `
    <circle cx="70" cy="98" r="8" fill="#ff9d9d" opacity="0.65"/>
    <circle cx="130" cy="98" r="8" fill="#ff9d9d" opacity="0.65"/>`;
  const nose = `<path d="M 97 94 q 3 4 6 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  const freckles = v.freckles
    ? `<g fill="${INK}" opacity="0.5">
         <circle cx="78" cy="96" r="1.6"/><circle cx="85" cy="99" r="1.6"/>
         <circle cx="115" cy="99" r="1.6"/><circle cx="122" cy="96" r="1.6"/></g>`
    : '';
  return `
    ${brows(expr, 82, 118, 64)}
    ${leftEye}
    ${rightEye}
    ${cheeks}
    ${nose}
    ${freckles}
    ${mouth(expr)}`;
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

// --- Accessories -----------------------------------------------------------

function accessory(v: VisualParams): string {
  const uniRaw = UNIFORM_COLORS[v.uniform] ?? UNIFORM_COLORS[0];
  const uni = SOFT3D ? { jersey: soften(uniRaw.jersey), trim: soften(uniRaw.trim) } : uniRaw;
  const S = `stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round"`;
  switch (v.accessory) {
    case 'cap':
      return `
        <path d="M 52 70 a48 42 0 0 1 96 0 q -48 -20 -96 0 Z" fill="url(#jerseyG)" ${S}/>
        <path d="M 96 40 q 6 -6 10 0 l 0 6 q -5 3 -10 0 Z" fill="${uni.trim}" stroke="${SOFT3D ? darken(uni.trim, 0.3) : OUT}" stroke-width="3"/>
        <path d="M 138 66 q 26 2 30 14 q -4 8 -14 8 q -8 -14 -22 -14 Z" fill="${darken(uni.jersey, 0.12)}" ${S}/>`;
    case 'headband':
      return `<path d="M 52 62 q 48 -16 96 0 l 0 12 q -48 -16 -96 0 Z" fill="${uni.trim}" stroke="${uni.jersey}" stroke-width="4"/>`;
    case 'glasses':
      return `
        <g fill="#bfe6ff" fill-opacity="0.5" stroke="${OUT}" stroke-width="4">
          <circle cx="82" cy="82" r="15"/><circle cx="118" cy="82" r="15"/>
          <path d="M 97 82 h 6" stroke-linecap="round"/></g>`;
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
  // Soft mode: the under-stroke becomes a dark tint of the limb's OWN color
  // (a soft occlusion edge — how lineless CG separates shapes), not navy ink.
  const edge = SOFT3D ? darken(color, 0.3) : OUT;
  const edgeW = SOFT3D ? w + 4 : w + SW * 1.6;
  return `
    <path d="${d}" fill="none" stroke="${edge}" stroke-width="${edgeW}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(-2 -2.5)" opacity="0.4">
      <path d="${d}" fill="none" stroke="${lighten(color, 0.5)}" stroke-width="${Math.max(3, w * 0.28)}" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
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
 * The whole head: neck, face circle, ears (with inner arcs), under-chin shade,
 * face, front hair, and accessory. Reused verbatim by every pose.
 * (Back hair is layered separately, behind the body.)
 */
function headGroup(c: Ctx, v: VisualParams, hFront: string, look = 0): string {
  return `
    <rect x="90" y="120" width="20" height="22" rx="8" fill="${c.gSkin}" ${c.S}/>
    <rect x="90" y="120" width="20" height="8" rx="4" fill="${c.skinDk}" stroke="none"/>
    <circle cx="${HEAD.cx}" cy="${HEAD.cy}" r="${c.m.headR}" fill="${c.gSkin}" ${c.S}/>
    <ellipse cx="52" cy="86" rx="9" ry="11" fill="${c.gSkin}" ${c.S}/>
    <ellipse cx="148" cy="86" rx="9" ry="11" fill="${c.gSkin}" ${c.S}/>
    <path d="M 50 83 q 3 4 0 7" fill="none" stroke="${SOFT3D ? c.skinDk : OUT}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M 150 83 q -3 4 0 7" fill="none" stroke="${SOFT3D ? c.skinDk : OUT}" stroke-width="2.5" stroke-linecap="round"/>
    <clipPath id="hc"><circle cx="${HEAD.cx}" cy="${HEAD.cy}" r="${c.m.headR}"/></clipPath>
    <ellipse cx="100" cy="${HEAD.cy + c.m.headR}" rx="${c.m.headR}" ry="24" fill="${c.skinDk}" opacity="0.35" clip-path="url(#hc)"/>
    ${face(v, look)}
    ${hFront}
    ${accessory(v)}`;
}

// --- Front poses (stand / cheer) --------------------------------------------

/** Baseball pants + trim stripe + sock band + real sneakers. */
function legsFront(c: Ctx): string {
  const legHalf = c.m.halfW * 0.42;
  const leg = (x: number, stripeLeft: boolean) => `
    <rect x="${x - 10}" y="200" width="20" height="28" rx="9" fill="${c.gPants}" ${c.S}/>
    <rect x="${stripeLeft ? x - 10 : x + 7}" y="203" width="3" height="22" fill="${c.trim}"/>
    <rect x="${x - 9}" y="222" width="18" height="12" rx="4" fill="${c.trim}" stroke="${SOFT3D ? darken(c.trim, 0.25) : OUT}" stroke-width="3"/>
    ${frontShoe(x)}`;
  return leg(100 - legHalf, true) + leg(100 + legHalf, false);
}

/** Torso: rounded jersey with a darker hem, collar trim, and a cel-shade side. */
function torsoFront(c: Ctx): string {
  const { halfW } = c.m;
  const shoulderY = 150;
  const hipY = 208;
  const torsoPath = `M ${100 - halfW} ${shoulderY}
             q 0 -14 14 -16 q ${halfW - 14} -6 ${2 * (halfW - 14)} 0 q 14 2 14 16
             l 4 ${hipY - shoulderY}
             q ${-halfW} 12 ${-2 * halfW} 0 Z`;
  return `
    <path d="${torsoPath}" fill="${c.gJersey}" ${c.S}/>
    <path d="M ${100 - halfW + 2} ${hipY - 14} q ${halfW - 2} 12 ${2 * (halfW - 2)} 0 l 2 12 q ${-(halfW - 2)} 12 ${-2 * (halfW - 2)} 0 Z" fill="${c.jerseyDk}"/>
    <path d="M 84 ${shoulderY - 6} q 16 14 32 0" fill="none" stroke="${c.trim}" stroke-width="6" stroke-linecap="round"/>`;
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
      <circle cx="${handX}" cy="${shoulderY + 40}" r="10" fill="${c.gSkin}" ${c.S}/>`;
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
      <circle cx="${handX}" cy="${shoulderY - 66}" r="10" fill="${c.gSkin}" ${c.S}/>`;
  };
  return arm(-1) + arm(1);
}

/** Front-view wheelchair: a big wheel on each side of the seated kid, seat + footrest. */
function wheelchairFront(): string {
  const rim = SOFT3D ? '#59636e' : '#2c3a47';
  const wheel = (cx: number) => `
    <circle cx="${cx}" cy="214" r="33" fill="#e9eef2" stroke="${SOFT3D ? '#59636e' : OUT}" stroke-width="${SOFT3D ? 5 : 6}"/>
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
  return `
    <g transform="translate(0 ${dropY}) rotate(8 100 180)">
      <rect x="${100 - w / 2}" y="146" width="${w}" height="60" rx="${Math.round(w * 0.36)}" fill="${c.gJersey}" ${c.S}/>
      <rect x="${100 - w / 2 + 3}" y="192" width="${w - 6}" height="11" rx="5" fill="${c.jerseyDk}"/>
      <path d="M ${100 - 10} 150 q 12 10 24 2" fill="none" stroke="${c.trim}" stroke-width="5" stroke-linecap="round"/>
    </g>`;
}

/** Side-view running legs. frame 1 = full extension, frame 2 = crossover. */
function legsRun(c: Ctx, frame: 1 | 2): string {
  const pantsDk = darken(PANTS, 0.16);
  const w = Math.max(14, Math.round(c.m.halfW * 0.34));
  if (frame === 1) {
    // Far leg trails (heel kicked up), near leg drives forward.
    return `
      ${capsule('M 94 198 Q 72 212 58 220', pantsDk, w)}
      ${sideShoe(52, 222, -32)}
      ${capsule('M 98 200 Q 124 206 138 226', PANTS, w)}
      ${sideShoe(142, 234, 18)}`;
  }
  // Crossover: far leg swings forward-low, near knee gathers under the body.
  return `
    ${capsule('M 94 198 Q 114 208 126 228', pantsDk, w)}
    ${sideShoe(130, 236, 10)}
    ${capsule('M 98 200 Q 112 220 100 234', PANTS, w)}
    ${sideShoe(104, 242, -6)}`;
}

/** Side-view pumping arms (opposite phase to the legs), split into layers.
 *  Hands stay at chest height or lower — near the chin they read as mittens. */
function armsRun(c: Ctx, frame: 1 | 2): { far: string; near: string } {
  const farJersey = darken(c.jerseyDk, 0.1);
  const farSkin = darken(c.skin, 0.1);
  const w = 13;
  if (frame === 1) {
    // Far arm drives forward at chest height, near arm swings back-down.
    return {
      far: `
        ${capsule('M 100 154 Q 112 164 120 170', farJersey, w)}
        ${capsule('M 120 170 Q 130 170 136 166', farSkin, w - 2)}
        <circle cx="139" cy="165" r="9" fill="${farSkin}" ${c.S}/>`,
      near: `
        ${capsule('M 102 154 Q 90 166 82 176', c.jerseyDk, w)}
        ${capsule('M 82 176 Q 74 184 72 192', c.skin, w - 2)}
        <circle cx="71" cy="195" r="9" fill="${c.gSkin}" ${c.S}/>`,
    };
  }
  return {
    far: `
      ${capsule('M 100 154 Q 88 164 80 172', farJersey, w)}
      ${capsule('M 80 172 Q 74 180 72 186', farSkin, w - 2)}
      <circle cx="71" cy="189" r="9" fill="${farSkin}" ${c.S}/>`,
    near: `
      ${capsule('M 102 154 Q 114 166 122 172', c.jerseyDk, w)}
      ${capsule('M 122 172 Q 132 172 138 168', c.skin, w - 2)}
      <circle cx="141" cy="167" r="9" fill="${c.gSkin}" ${c.S}/>`,
  };
}

/**
 * Side-view wheelchair push (Zoom Ramirez at speed): one big side wheel with
 * handrim, front caster, seat frame, legs bent to the footplate. frame 1 =
 * arm reaching the top of the handrim, frame 2 = end of the push stroke.
 */
function wheelchairSide(c: Ctx, frame: 1 | 2): { behind: string; front: string } {
  const rim = SOFT3D ? '#59636e' : '#2c3a47';
  const wheelBottom = GROUND - 2;
  const wcy = wheelBottom - 34;
  const w = 13;
  const arm =
    frame === 1
      ? `
        ${capsule(`M 102 152 Q 116 166 120 178`, c.jerseyDk, w)}
        ${capsule(`M 120 178 Q 122 186 118 192`, c.skin, w - 2)}
        <circle cx="117" cy="195" r="9" fill="${c.gSkin}" ${c.S}/>`
      : `
        ${capsule(`M 102 152 Q 96 170 88 182`, c.jerseyDk, w)}
        ${capsule(`M 88 182 Q 82 192 78 200`, c.skin, w - 2)}
        <circle cx="76" cy="203" r="9" fill="${c.gSkin}" ${c.S}/>`;
  const ticks =
    frame === 2
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
      <circle cx="92" cy="${wcy}" r="34" fill="#e9eef2" fill-opacity="0.55" stroke="${SOFT3D ? '#59636e' : OUT}" stroke-width="${SOFT3D ? 5 : 6}"/>
      <circle cx="92" cy="${wcy}" r="24" fill="none" stroke="${rim}" stroke-width="4"/>
      <circle cx="92" cy="${wcy}" r="6" fill="${METAL_DK}"/>
      <g stroke="${rim}" stroke-width="3">
        <line x1="92" y1="${wcy - 22}" x2="92" y2="${wcy + 22}"/>
        <line x1="${92 - 22}" y1="${wcy}" x2="${92 + 22}" y2="${wcy}"/>
        <line x1="${92 - 16}" y1="${wcy - 16}" x2="${92 + 16}" y2="${wcy + 16}"/>
        <line x1="${92 - 16}" y1="${wcy + 16}" x2="${92 + 16}" y2="${wcy - 16}"/>
      </g>
      <circle cx="146" cy="${GROUND - 9}" r="9" fill="#e9eef2" stroke="${SOFT3D ? '#59636e' : OUT}" stroke-width="4"/>
      ${arm}`,
  };
}

// --- Gameplay poses (bat / windup / ready / slide) ---------------------------

const BAT_WOOD = '#d39a5c';

/** The bat itself: barrel + handle + knob along a line, rotated at the grip. */
function batProp(gx: number, gy: number, deg: number): string {
  const edge = SOFT3D ? darken(BAT_WOOD, 0.35) : OUT;
  const ew = SOFT3D ? 3 : 4;
  return `
    <g transform="translate(${gx} ${gy}) rotate(${deg})">
      <rect x="-7" y="-96" width="14" height="52" rx="7" fill="${BAT_WOOD}" stroke="${edge}" stroke-width="${ew}"/>
      <rect x="-4.5" y="-91" width="4" height="42" rx="2" fill="${lighten(BAT_WOOD, 0.4)}" opacity="0.6"/>
      <rect x="-5" y="-48" width="10" height="48" rx="5" fill="${darken(BAT_WOOD, 0.12)}" stroke="${edge}" stroke-width="${ew}"/>
      <circle cx="0" cy="0" r="6" fill="${SOFT3D ? darken(BAT_WOOD, 0.45) : OUT}"/>
    </g>`;
}

/**
 * Batting stance, side view facing RIGHT (toward the pitch): wide planted
 * legs, side torso leaned into the plate, both hands gripping a bat cocked
 * up over the back shoulder. The bat pose IS the batter — no runtime prop.
 */
function poseBat(c: Ctx, v: VisualParams, hFront: string): string {
  const w = Math.max(14, Math.round(c.m.halfW * 0.34));
  const pantsDk = darken(PANTS, 0.16);
  // Wide stance: back leg (far) planted, front leg open toward the pitch.
  const legs = `
    ${capsule('M 92 198 Q 74 214 64 228', pantsDk, w)}
    ${sideShoe(58, 240, -8)}
    ${capsule('M 102 200 Q 122 214 132 228', PANTS, w)}
    ${sideShoe(136, 240, 6)}`;
  // Both arms reach up-back to the grip.
  const grip = { x: 76, y: 148 };
  const arms = `
    ${capsule(`M 96 158 Q 84 156 ${grip.x} ${grip.y + 4}`, darken(c.jerseyDk, 0.1), 13)}
    <circle cx="${grip.x - 2}" cy="${grip.y + 2}" r="9" fill="${darken(c.skin, 0.1)}" ${c.S}/>
    ${capsule(`M 104 160 Q 92 158 ${grip.x + 6} ${grip.y + 10}`, c.jerseyDk, 13)}
    <circle cx="${grip.x + 4}" cy="${grip.y + 10}" r="9" fill="${c.gSkin}" ${c.S}/>`;
  const head = `
    <g transform="translate(6 2) rotate(3 ${HEAD.cx} ${HEAD.cy})">
      ${headGroup(c, v, hFront, 0.8)}
    </g>`;
  if (c.usesChair) {
    const chair = wheelchairSide(c, 1);
    return `${batProp(grip.x, grip.y, -36)}${chair.behind}${torsoSide(c, 2)}${chair.front}${arms}${head}`;
  }
  return `${batProp(grip.x, grip.y, -36)}${legs}${torsoSide(c, 0)}${arms}${head}`;
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
    <circle cx="${100 + halfW + 5}" cy="${shoulderY - 70}" r="10" fill="${c.gSkin}" ${c.S}/>
    <circle cx="${100 + halfW + 5}" cy="${shoulderY - 70}" r="7" fill="#ffffff" stroke="${SOFT3D ? '#cfc9bd' : OUT}" stroke-width="2.5"/>`;
  const gloveArm = `
    ${capsule(`M ${100 - halfW + 6} ${shoulderY + 4} Q ${100 - halfW - 6} ${shoulderY + 14} ${100 - halfW + 4} ${shoulderY + 26}`, c.jerseyDk, 15)}
    <ellipse cx="${100 - halfW + 10}" cy="${shoulderY + 32}" rx="14" ry="12" fill="#a9743f" ${c.S}/>
    <path d="M ${100 - halfW + 2} ${shoulderY + 26} q 8 -6 16 0" fill="none" stroke="${SOFT3D ? darken('#a9743f', 0.3) : OUT}" stroke-width="3"/>`;
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
        <circle cx="${hx}" cy="${shoulderY + 46}" r="11" fill="${c.gSkin}" ${c.S}/>`;
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
function poseSlide(c: Ctx, v: VisualParams, hFront: string): string {
  const pantsDk = darken(PANTS, 0.16);
  const w = Math.max(14, Math.round(c.m.halfW * 0.34));
  if (c.usesChair) {
    // A wheelchair slide is just Zoom at full tilt — reuse the speed pose.
    const chair = wheelchairSide(c, 2);
    const head = `
      <g transform="translate(10 3) rotate(5 ${HEAD.cx} ${HEAD.cy})">
        ${headGroup(c, v, hFront, 0.8)}
      </g>`;
    return `${chair.behind}${torsoSide(c, 2)}${chair.front}${head}`;
  }
  const dust = `
    <g fill="#e0d5c0" stroke="${OUT}" stroke-width="${SOFT3D ? 0 : 3}" opacity="0.85">
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
    <circle cx="45" cy="${GROUND - 20}" r="9" fill="${c.gSkin}" ${c.S}/>
    ${capsule(`M 74 ${GROUND - 70} Q 92 ${GROUND - 88} 104 ${GROUND - 100}`, c.jerseyDk, 13)}
    <circle cx="108" cy="${GROUND - 105}" r="9" fill="${c.gSkin}" ${c.S}/>`;
  // Head sits up out of the lean, chin toward the bag.
  const head = `
    <g transform="translate(-32 84) scale(0.92) rotate(-10 ${HEAD.cx} ${HEAD.cy})">
      ${headGroup(c, v, hFront, 0.8)}
    </g>`;
  return `${dust}${torso}${legs}${arms}${head}`;
}

// --- Assembly --------------------------------------------------------------

export function buildCharacterSVG(v: VisualParams, pose: Pose = 'stand'): string {
  // Soft mode mutes every palette color before anything derives from it, so
  // all the darken/lighten/gradient math stays in the matte range too.
  const mute = (hex: string) => (SOFT3D ? soften(hex) : hex);
  const skin = mute(SKIN_TONES[v.skin] ?? SKIN_TONES[0]);
  const skinDk = darken(skin, 0.12);
  const hairColor = mute(HAIR_COLORS[v.hairColor] ?? HAIR_COLORS[0]);
  const uniRaw = UNIFORM_COLORS[v.uniform] ?? UNIFORM_COLORS[0];
  const uni = { jersey: mute(uniRaw.jersey), trim: mute(uniRaw.trim) };
  const c: Ctx = {
    skin,
    skinDk,
    jersey: uni.jersey,
    jerseyDk: darken(uni.jersey, 0.14),
    trim: uni.trim,
    gSkin: 'url(#skinG)',
    gJersey: 'url(#jerseyG)',
    gPants: 'url(#pantsG)',
    m: bodyMetrics(v.bodyType),
    S: `stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round"`,
    usesChair: v.accessory === 'wheelchair',
  };
  const h = hair(v.hair, 'url(#hairG)', 'url(#hairDkG)');
  const shoulderY = 150;

  // Chest number badge (front poses only — a side view showing it reads wrong).
  const number = `<circle cx="100" cy="${shoulderY + 26}" r="13" fill="${uni.trim}" opacity="0.9"/>`;

  let layers: string;
  if (pose === 'bat') {
    layers = poseBat(c, v, h.back + h.front);
  } else if (pose === 'windup') {
    layers = `${h.back}${poseWindup(c, v, h.front)}`;
  } else if (pose === 'ready') {
    layers = `${h.back}${poseReady(c, v, h.front)}`;
  } else if (pose === 'slide') {
    layers = poseSlide(c, v, h.back + h.front);
  } else if (pose === 'run1' || pose === 'run2') {
    const frame: 1 | 2 = pose === 'run1' ? 1 : 2;
    const dropY = frame === 2 ? 3 : 0; // gallop bounce
    // Head shifted + tilted toward travel; pupils lead the motion.
    const head = `
      <g transform="translate(10 ${dropY}) rotate(5 ${HEAD.cx} ${HEAD.cy})">
        ${headGroup(c, v, h.front, 0.8)}
      </g>`;
    if (c.usesChair) {
      const chair = wheelchairSide(c, frame);
      layers = `${h.back}${chair.behind}${torsoSide(c, 2)}${chair.front}${head}`;
    } else {
      const arms = armsRun(c, frame);
      layers = `${h.back}${arms.far}${legsRun(c, frame)}${torsoSide(c, dropY)}${arms.near}${head}`;
    }
  } else {
    // Same back-to-front order as always: chair → back hair → legs → torso …
    const arms = pose === 'cheer' ? armsCheer(c) : armsStand(c);
    layers = c.usesChair
      ? `${wheelchairFront()}${h.back}${torsoFront(c)}${arms}${number}${headGroup(c, v, h.front)}`
      : `${h.back}${legsFront(c)}${torsoFront(c)}${arms}${number}${headGroup(c, v, h.front)}`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}">
  ${gradientDefs(skin, hairColor, uni.jersey)}
  <g paint-order="stroke" transform="translate(100 130) scale(${c.m.scale}) translate(-100 -130)">
    ${layers}
  </g>
</svg>`;
}
