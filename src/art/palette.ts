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

/**
 * Street-clothes hues for the draft-wall outfits (VisualParams.outfit.top /
 * .bottom index here). Distinct from UNIFORM_COLORS so personal clothes never
 * read as a team jersey.
 */
export const STREET_COLORS = [
  '#e85d4a', // tomato
  '#f2a33c', // marigold
  '#f7d154', // sunshine
  '#7bc26a', // grass
  '#4aa3df', // sky
  '#8f7ae5', // grape
  '#e57fb1', // bubblegum
  '#4ecdc4', // seafoam
  '#f0ede2', // chalk white
  '#5b6d84', // slate
  '#a97c50', // acorn brown
  '#93b7e8', // powder blue
];

/** Denim for jeans / overall bibs (fixed — not a palette pick). */
export const DENIM = '#5273b8';

export const SKIN_TONE_COUNT = SKIN_TONES.length;
export const HAIR_COLOR_COUNT = HAIR_COLORS.length;
export const UNIFORM_COUNT = UNIFORM_COLORS.length;
export const STREET_COLOR_COUNT = STREET_COLORS.length;
