// ---------------------------------------------------------------------------
// The color palettes the character art draws from. Kept as hex strings because
// they go straight into SVG fills. Index into these arrays via VisualParams.
// ---------------------------------------------------------------------------

export const SKIN_TONES = [
  '#ffd9b3',
  '#f1c27d',
  '#e0ac69',
  '#c68642',
  '#8d5524',
];

/** A slightly darker shade of each skin tone for simple flat shading. */
export const SKIN_SHADOW = [
  '#eec092',
  '#dcab63',
  '#c8944f',
  '#a86d34',
  '#6f4119',
];

export const HAIR_COLORS = [
  '#2b1b0e', // dark brown
  '#4a2c14', // brown
  '#8a5a2b', // light brown
  '#111111', // black
  '#c99a3b', // blonde
  '#b23a2a', // red/auburn
];

export const UNIFORM_COLORS = [
  { jersey: '#e8524a', trim: '#ffffff' }, // red
  { jersey: '#3a7ad9', trim: '#ffde59' }, // blue/gold
  { jersey: '#3fae6b', trim: '#ffffff' }, // green
  { jersey: '#8e57c9', trim: '#ffce3a' }, // purple
  { jersey: '#ff8c42', trim: '#14202e' }, // orange
  { jersey: '#2ba8a1', trim: '#fff4de' }, // teal
];

export const SKIN_TONE_COUNT = SKIN_TONES.length;
export const HAIR_COLOR_COUNT = HAIR_COLORS.length;
export const UNIFORM_COUNT = UNIFORM_COLORS.length;
