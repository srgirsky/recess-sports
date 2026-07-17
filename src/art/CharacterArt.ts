// ---------------------------------------------------------------------------
// buildCharacterSVG(visual) -> an SVG document string.
//
// Modern flat-mascot style: bold consistent outline, soft cell-shading (a
// derived darker shade, not gradients), rounded friendly proportions, and real
// expressions. Still just string templating — 30 distinct kids from parameters,
// zero image files. Fixed 200x260 viewBox so every kid aligns identically.
// ---------------------------------------------------------------------------

import type { VisualParams, HairStyle, Expression, BodyType } from '../data/types';
import { SKIN_TONES, HAIR_COLORS, UNIFORM_COLORS } from './palette';

const VIEW_W = 200;
const VIEW_H = 260;
const OUT = '#26333f'; // outline color
const SW = 5; // outline width

const HEAD = { cx: 100, cy: 82, r: 50 };

/** Darken a #rrggbb hex by fraction f (0-1). */
function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - f));
  const g = Math.round(((n >> 8) & 255) * (1 - f));
  const b = Math.round((n & 255) * (1 - f));
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

// --- Face ------------------------------------------------------------------

function eye(x: number, y: number, open = 1, look = 0): string {
  const rx = 9;
  const ry = 11 * open;
  const px = x + look * 3;
  return `
    <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#ffffff" stroke="${OUT}" stroke-width="3"/>
    <circle cx="${px}" cy="${y + ry * 0.25}" r="5.5" fill="#1b2833"/>
    <circle cx="${px + 2}" cy="${y + ry * 0.25 - 3}" r="2" fill="#ffffff"/>`;
}

function wink(x: number, y: number): string {
  return `<path d="M ${x - 9} ${y} q 9 8 18 0" fill="none" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/>`;
}

function brows(expr: Expression, lx: number, rx: number, y: number): string {
  const b = (x: number, tilt: number) =>
    `<path d="M ${x - 9} ${y + tilt} q 9 -5 18 ${-tilt}" fill="none" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/>`;
  switch (expr) {
    case 'determined':
      return b(lx, 6) + `<path d="M ${rx - 9} ${y - 6} q 9 5 18 6" fill="none" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/>`;
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
        <path d="M 78 ${y - 2} q 22 26 44 0 q -22 8 -44 0 Z" fill="#7a2b2b" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M 80 ${y - 1} q 20 6 40 0 l -2 6 q -18 5 -36 0 Z" fill="#ffffff"/>`;
    case 'surprised':
      return `<ellipse cx="100" cy="${y + 2}" rx="10" ry="12" fill="#7a2b2b" stroke="${OUT}" stroke-width="3"/>`;
    case 'cool':
      return `<path d="M 84 ${y} q 20 12 34 -2" fill="none" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/>`;
    case 'determined':
      return `<path d="M 84 ${y + 2} q 16 -4 32 0" fill="none" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/>`;
    case 'goofy':
      return `
        <path d="M 80 ${y - 2} q 20 22 40 0 q -20 6 -40 0 Z" fill="#7a2b2b" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M 96 ${y + 6} q 8 12 16 0 q -8 -4 -16 0 Z" fill="#e8746f"/>`;
    default: // happy
      return `<path d="M 82 ${y - 2} q 18 20 36 0" fill="none" stroke="${OUT}" stroke-width="4.5" stroke-linecap="round"/>`;
  }
}

function face(v: VisualParams): string {
  const expr = v.expression ?? 'happy';
  const eyeY = 82;
  const open = expr === 'determined' ? 0.7 : expr === 'surprised' ? 1.25 : 1;
  const leftEye = eye(82, eyeY, open, expr === 'cool' ? 0.4 : 0);
  const rightEye = expr === 'goofy' ? wink(118, eyeY) : eye(118, eyeY, open, expr === 'cool' ? 0.4 : 0);
  const cheeks = `
    <circle cx="70" cy="98" r="8" fill="#ff9d9d" opacity="0.65"/>
    <circle cx="130" cy="98" r="8" fill="#ff9d9d" opacity="0.65"/>`;
  const nose = `<path d="M 97 94 q 3 4 6 0" fill="none" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>`;
  const freckles = v.freckles
    ? `<g fill="${OUT}" opacity="0.5">
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

/** Hair split into a back layer (behind head) and front layer (on top). */
function hair(style: HairStyle, color: string): { back: string; front: string } {
  const dk = darken(color, 0.22);
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
  const uni = UNIFORM_COLORS[v.uniform] ?? UNIFORM_COLORS[0];
  const S = `stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round"`;
  switch (v.accessory) {
    case 'cap':
      return `
        <path d="M 52 70 a48 42 0 0 1 96 0 q -48 -20 -96 0 Z" fill="${uni.jersey}" ${S}/>
        <path d="M 96 40 q 6 -6 10 0 l 0 6 q -5 3 -10 0 Z" fill="${uni.trim}" stroke="${OUT}" stroke-width="3"/>
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

/** Front-view wheelchair: a big wheel on each side of the seated kid, seat + footrest. */
function wheelchair(): string {
  const rim = '#2c3a47';
  const wheel = (cx: number) => `
    <circle cx="${cx}" cy="214" r="33" fill="#e9eef2" stroke="${OUT}" stroke-width="6"/>
    <circle cx="${cx}" cy="214" r="20" fill="none" stroke="${rim}" stroke-width="4"/>
    <circle cx="${cx}" cy="214" r="6" fill="${OUT}"/>
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
    <rect x="84" y="228" width="32" height="9" rx="4" fill="${OUT}"/>`;
}

// --- Assembly --------------------------------------------------------------

export function buildCharacterSVG(v: VisualParams): string {
  const skin = SKIN_TONES[v.skin] ?? SKIN_TONES[0];
  const skinDk = darken(skin, 0.12);
  const hairColor = HAIR_COLORS[v.hairColor] ?? HAIR_COLORS[0];
  const uni = UNIFORM_COLORS[v.uniform] ?? UNIFORM_COLORS[0];
  const jerseyDk = darken(uni.jersey, 0.14);
  const m = bodyMetrics(v.bodyType);
  const usesChair = v.accessory === 'wheelchair';
  const h = hair(v.hair, hairColor);
  const S = `stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round"`;

  const shoulderY = 150;
  const hipY = 208;
  const legTop = hipY - 4;
  const legBottom = 236;
  const legHalf = m.halfW * 0.42;

  const legs = usesChair
    ? ''
    : `
      <rect x="${100 - legHalf - 9}" y="${legTop}" width="18" height="${legBottom - legTop}" rx="9" fill="#3c4a58" ${S}/>
      <rect x="${100 + legHalf - 9}" y="${legTop}" width="18" height="${legBottom - legTop}" rx="9" fill="#3c4a58" ${S}/>
      <ellipse cx="${100 - legHalf}" cy="${legBottom + 4}" rx="17" ry="10" fill="#20303c" ${S}/>
      <ellipse cx="${100 + legHalf}" cy="${legBottom + 4}" rx="17" ry="10" fill="#20303c" ${S}/>`;

  // Torso: rounded jersey with a darker hem + collar trim.
  const torso = `
    <path d="M ${100 - m.halfW} ${shoulderY}
             q 0 -14 14 -16 q ${m.halfW - 14} -6 ${2 * (m.halfW - 14)} 0 q 14 2 14 16
             l 4 ${hipY - shoulderY}
             q ${-m.halfW} 12 ${-2 * m.halfW} 0 Z"
          fill="${uni.jersey}" ${S}/>
    <path d="M ${100 - m.halfW + 2} ${hipY - 14} q ${m.halfW - 2} 12 ${2 * (m.halfW - 2)} 0 l 2 12 q ${-(m.halfW - 2)} 12 ${-2 * (m.halfW - 2)} 0 Z" fill="${jerseyDk}"/>
    <path d="M 84 ${shoulderY - 6} q 16 14 32 0" fill="none" stroke="${uni.trim}" stroke-width="6" stroke-linecap="round"/>`;

  // Sleeves + hands.
  const arms = `
    <path d="M ${100 - m.halfW + 4} ${shoulderY + 2} q -22 4 -24 30 q 10 8 22 2 q 2 -18 8 -26 Z" fill="${jerseyDk}" ${S}/>
    <path d="M ${100 + m.halfW - 4} ${shoulderY + 2} q 22 4 24 30 q -10 8 -22 2 q -2 -18 -8 -26 Z" fill="${jerseyDk}" ${S}/>
    <circle cx="${100 - m.halfW - 12}" cy="${shoulderY + 38}" r="11" fill="${skin}" ${S}/>
    <circle cx="${100 + m.halfW + 12}" cy="${shoulderY + 38}" r="11" fill="${skin}" ${S}/>`;

  // Chest number.
  const number = `<circle cx="100" cy="${shoulderY + 26}" r="13" fill="${uni.trim}" opacity="0.9"/>`;

  const headTop = `
    <rect x="90" y="120" width="20" height="22" rx="8" fill="${skinDk}" ${S}/>
    <circle cx="${HEAD.cx}" cy="${HEAD.cy}" r="${m.headR}" fill="${skin}" ${S}/>
    <ellipse cx="52" cy="86" rx="9" ry="11" fill="${skin}" ${S}/>
    <ellipse cx="148" cy="86" rx="9" ry="11" fill="${skin}" ${S}/>
    <clipPath id="hc"><circle cx="${HEAD.cx}" cy="${HEAD.cy}" r="${m.headR}"/></clipPath>
    <ellipse cx="100" cy="${HEAD.cy + m.headR}" rx="${m.headR}" ry="24" fill="${skinDk}" opacity="0.45" clip-path="url(#hc)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}">
  <g paint-order="stroke" transform="translate(100 130) scale(${m.scale}) translate(-100 -130)">
    ${usesChair ? wheelchair() : ''}
    ${h.back}
    ${legs}
    ${torso}
    ${arms}
    ${number}
    ${headTop}
    ${face(v)}
    ${h.front}
    ${accessory(v)}
  </g>
</svg>`;
}
