// ---------------------------------------------------------------------------
// Color palettes the character art draws from. Hex strings (they go straight
// into SVG fills). Index into these arrays via VisualParams. The art code
// derives its own darker "shadow" shades at draw time, so we only list bases.
// ---------------------------------------------------------------------------

export const SKIN_TONES = [
  '#ffdbac',
  '#f5c99a',
  '#e0ac7e',
  '#c68a5e',
  '#a06a44',
  '#7a4a2b',
];

/** Kept for backwards-compat; the art code now derives shading itself. */
export const SKIN_SHADOW = SKIN_TONES.map((c) => c);

export const HAIR_COLORS = [
  '#3b2412', // dark brown
  '#5a3418', // brown
  '#96602f', // light brown
  '#1a1a1a', // black
  '#e0b552', // blonde
  '#c0492f', // auburn/red
  '#2b2b2b', // soft black
];

export const UNIFORM_COLORS = [
  { jersey: '#eb5a52', trim: '#ffffff' }, // red
  { jersey: '#3f86e0', trim: '#ffe066' }, // blue / gold
  { jersey: '#43b56f', trim: '#ffffff' }, // green
  { jersey: '#9161d0', trim: '#ffd54a' }, // purple
  { jersey: '#ff924a', trim: '#2a2a2a' }, // orange
  { jersey: '#2fb4ac', trim: '#fff4de' }, // teal
  { jersey: '#f5c542', trim: '#3a2a10' }, // sunny yellow
];

export const SKIN_TONE_COUNT = SKIN_TONES.length;
export const HAIR_COLOR_COUNT = HAIR_COLORS.length;
export const UNIFORM_COUNT = UNIFORM_COLORS.length;
