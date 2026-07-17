// ---------------------------------------------------------------------------
// buildCharacterSVG(visual) -> an SVG document string.
//
// A kid is drawn from a fixed set of layered flat shapes; the colors and a few
// shapes come from VisualParams, which is how 30 kids look different with zero
// image files. It's just string templating — a very Django-dev-friendly job.
//
// Fixed 200x260 viewBox so every kid is the same size and centers identically.
// ---------------------------------------------------------------------------

import type { VisualParams, HairStyle } from '../data/types';
import { SKIN_TONES, SKIN_SHADOW, HAIR_COLORS, UNIFORM_COLORS } from './palette';

const VIEW_W = 200;
const VIEW_H = 260;

const HEAD_CX = 100;
const HEAD_CY = 78;
const HEAD_R = 46;

/** Draw the hair for a given style, filled with the given color. */
function hair(style: HairStyle, color: string): string {
  switch (style) {
    case 'bald':
      return '';
    case 'buzz':
      // A thin skullcap hugging the top of the head.
      return `<path d="M56 70 a44 44 0 0 1 88 0 q-44 -22 -88 0 Z" fill="${color}"/>`;
    case 'short':
      return `<path d="M52 74 a48 48 0 0 1 96 0 q-10 -30 -48 -30 q-38 0 -48 30 Z" fill="${color}"/>`;
    case 'curly':
      return `
        <g fill="${color}">
          <circle cx="62" cy="58" r="17"/>
          <circle cx="82" cy="44" r="18"/>
          <circle cx="104" cy="40" r="19"/>
          <circle cx="126" cy="46" r="17"/>
          <circle cx="140" cy="60" r="15"/>
        </g>`;
    case 'ponytail':
      return `
        <g fill="${color}">
          <path d="M52 74 a48 48 0 0 1 96 0 q-10 -32 -48 -32 q-38 0 -48 32 Z"/>
          <path d="M146 62 q34 6 30 46 q-4 26 -22 30 q16 -30 -14 -66 Z"/>
        </g>`;
    case 'mohawk':
      return `<path d="M92 20 q8 -12 16 0 l4 44 q-12 8 -24 0 Z" fill="${color}"/>`;
  }
}

/** Optional accessory overlay (helmet, headband, glasses). Wheelchair handled separately. */
function accessoryOverlay(visual: VisualParams): string {
  const trim = UNIFORM_COLORS[visual.uniform].trim;
  const jersey = UNIFORM_COLORS[visual.uniform].jersey;
  switch (visual.accessory) {
    case 'cap':
      // A batting helmet in team colors covering the crown.
      return `
        <g>
          <path d="M54 72 a46 40 0 0 1 92 0 q-46 -18 -92 0 Z" fill="${jersey}"/>
          <path d="M54 72 q46 -18 92 0 l18 6 q4 8 -6 10 l-104 0 q-6 -6 0 -16 Z" fill="${jersey}"/>
          <rect x="86" y="30" width="28" height="10" rx="5" fill="${trim}"/>
        </g>`;
    case 'headband':
      return `<rect x="54" y="60" width="92" height="12" rx="6" fill="${trim}" stroke="${jersey}" stroke-width="3"/>`;
    case 'glasses':
      return `
        <g fill="none" stroke="#14202e" stroke-width="4">
          <circle cx="82" cy="84" r="14" fill="#ffffff" fill-opacity="0.35"/>
          <circle cx="118" cy="84" r="14" fill="#ffffff" fill-opacity="0.35"/>
          <line x1="96" y1="84" x2="104" y2="84"/>
        </g>`;
    default:
      return '';
  }
}

/** The wheelchair replaces the legs entirely. Drawn behind the body. */
function wheelchair(): string {
  return `
    <g>
      <circle cx="70" cy="212" r="34" fill="none" stroke="#2c3742" stroke-width="7"/>
      <circle cx="70" cy="212" r="6" fill="#2c3742"/>
      <circle cx="150" cy="220" r="16" fill="none" stroke="#2c3742" stroke-width="6"/>
      <line x1="70" y1="178" x2="70" y2="150" stroke="#2c3742" stroke-width="7"/>
      <line x1="70" y1="150" x2="120" y2="150" stroke="#2c3742" stroke-width="7"/>
    </g>`;
}

export function buildCharacterSVG(v: VisualParams): string {
  const skin = SKIN_TONES[v.skin] ?? SKIN_TONES[0];
  const skinShade = SKIN_SHADOW[v.skin] ?? SKIN_SHADOW[0];
  const hairColor = HAIR_COLORS[v.hairColor] ?? HAIR_COLORS[0];
  const uni = UNIFORM_COLORS[v.uniform] ?? UNIFORM_COLORS[0];
  const usesChair = v.accessory === 'wheelchair';

  // Legs are drawn only when the kid isn't in a wheelchair.
  const legs = usesChair
    ? ''
    : `
      <rect x="82" y="196" width="14" height="46" rx="7" fill="#3a4654"/>
      <rect x="104" y="196" width="14" height="46" rx="7" fill="#3a4654"/>
      <ellipse cx="86" cy="246" rx="16" ry="9" fill="#14202e"/>
      <ellipse cx="114" cy="246" rx="16" ry="9" fill="#14202e"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}">
  ${usesChair ? wheelchair() : ''}
  ${legs}

  <!-- torso / jersey -->
  <path d="M64 148 q36 -18 72 0 l6 56 q-42 16 -84 0 Z" fill="${uni.jersey}"/>
  <rect x="60" y="150" width="80" height="12" rx="6" fill="${uni.trim}"/>

  <!-- arms -->
  <rect x="48" y="150" width="16" height="52" rx="8" fill="${uni.jersey}"/>
  <rect x="136" y="150" width="16" height="52" rx="8" fill="${uni.jersey}"/>
  <circle cx="56" cy="206" r="9" fill="${skin}"/>
  <circle cx="144" cy="206" r="9" fill="${skin}"/>

  <!-- neck -->
  <rect x="90" y="118" width="20" height="24" rx="8" fill="${skinShade}"/>

  <!-- head -->
  <circle cx="${HEAD_CX}" cy="${HEAD_CY}" r="${HEAD_R}" fill="${skin}"/>
  <!-- ears -->
  <circle cx="56" cy="82" r="9" fill="${skin}"/>
  <circle cx="144" cy="82" r="9" fill="${skin}"/>

  <!-- face: eyes + smile -->
  <circle cx="84" cy="84" r="6" fill="#14202e"/>
  <circle cx="116" cy="84" r="6" fill="#14202e"/>
  <circle cx="86" cy="82" r="2" fill="#ffffff"/>
  <circle cx="118" cy="82" r="2" fill="#ffffff"/>
  <path d="M82 102 q18 16 36 0" fill="none" stroke="#14202e" stroke-width="4" stroke-linecap="round"/>
  <circle cx="70" cy="98" r="7" fill="#ff9e9e" fill-opacity="0.6"/>
  <circle cx="130" cy="98" r="7" fill="#ff9e9e" fill-opacity="0.6"/>

  ${hair(v.hair, hairColor)}
  ${accessoryOverlay(v)}
</svg>`;
}
