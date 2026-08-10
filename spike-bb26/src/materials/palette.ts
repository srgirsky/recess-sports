// OWNER: materials agent. THE single color authority (ARCHITECTURE.md § Ownership):
// this is the only file in the spike that may contain hex values. Every color is
// eyedropped-by-judgment from the steam-02 / frame-080 anchors: saturated spring
// green grass with soft mow bands, warm tan dirt, cream chalk, candy-bright house
// paint, deep foliage greens, cream sticker HUD. Other subsystems get these via
// ctx.get('materials').rawColor(key) / .color(key) — never by importing this file
// (import type of PaletteKey is fine).
//
// The sky/light block reproduces render/colors.ts verbatim — render inits before
// materials exists on the bus, so those constants were born there; this file now
// holds the authoritative copies for render to claim lazily (its note invites it).
// If a sky value must change, change it HERE and tell the render owner.

// ---- sky & light (claimed from render/colors.ts — keep in sync until render consumes ctx) ----
export const SKY_ZENITH = '#1a6fe0'; // deep saturated afternoon blue
export const SKY_MID = '#3d9dee';
export const SKY_HORIZON = '#c9ecf9'; // pale cyan haze; every fog cites this
export const CLOUD_LIT = '#ffffff';
export const CLOUD_SHADE = '#c9d9ec';
export const HAZE_BAND = '#e8f7fd';
export const SUN_WARM = '#ffedc2'; // late-afternoon key light
export const FILL_COOL = '#bdd9ff';
export const HEMI_SKY = '#9fd4ff';
export const HEMI_GROUND = '#6da65a'; // grass bounce

// ---- ground ----
export const GRASS_LIGHT = '#87d34a'; // mow band, lit
export const GRASS_DARK = '#64b132'; // mow band, against the nap
export const GRASS_DEEP = '#55a02c'; // blotch shadow / tuft dark stroke
export const GRASS_TUFT = '#97dd55'; // tuft light stroke
export const GRASS_WORN = '#c2cc66'; // straw-pale worn patch
export const DANDELION = '#f2d43d';
export const CLOVER_WHITE = '#f2f0dd';
export const DIRT_TAN = '#c9975a'; // mound / basepath body
export const DIRT_DARK = '#b3814a';
export const DIRT_DAMP = '#a5713c';
export const DIRT_LIGHT = '#e2b476';
export const CHALK_CREAM = '#f8f5ea'; // hand-limed lines, bases
export const CHALK_SHADOW = '#d8d2bc';

// ---- backyard scenery ----
export const FENCE_TAN = '#d9a95e'; // privacy-fence planks
export const FENCE_GAP = '#8a6234'; // shadow between planks
export const WOOD_SHED = '#e0c07c'; // pale shed siding wood
export const WOOD_TRIM = '#f0e2b8'; // cream trim boards
export const WOOD_DARK = '#7d5433'; // trunks, phone poles, weathered rails
export const HOUSE_BLUE = '#4468cc';
export const HOUSE_CREAM = '#f0d98e';
export const HOUSE_RED = '#cc4a3a';
export const HOUSE_TEAL = '#3fa89a';
export const ROOF_BLUE = '#4a78cc';
export const ROOF_SLATE = '#4a5570';
export const ROOF_RED = '#a83c30';
export const ROOF_SHED_GREEN = '#8fc571';
export const ROOF_MOSS = '#c2b94a'; // yellow moss flecks on shingle
export const FOLIAGE_DEEP = '#2f7d26';
export const FOLIAGE_MID = '#469b31';
export const FOLIAGE_LIGHT = '#63b943';
export const HEDGE_DEEP = '#276b1f';
export const HEDGE_MID = '#3a8629';
export const HEDGE_LIGHT = '#4f9e33';
export const METAL_TRUCK = '#8ca3c4'; // junk-truck box slate blue
export const METAL_RUST = '#8f5a2e';
export const ROPE_CREAM = '#e8dbb8';

// ---- bunting / cloth ----
export const BUNT_RED = '#e05038';
export const BUNT_YELLOW = '#f2c53d';
export const BUNT_BLUE = '#3f6fd8';
export const BUNT_WHITE = '#f8f5ea';
export const BUNT_TEAL = '#3fb8a8';
export const BUNT_PINK = '#e878a8';

// ---- kids (characters owner: skin/hair/jersey come from here) ----
export const SKIN_PALE = '#f2c9a2';
export const SKIN_PEACH = '#eab88a';
export const SKIN_TAN = '#cf9668';
export const SKIN_BROWN = '#9c6b42';
export const SKIN_DEEP = '#6e4a2e';
export const HAIR_BLACK = '#2a2320';
export const HAIR_BROWN = '#6e4a2e';
export const HAIR_ORANGE = '#d86e28'; // the steam-02 redhead
export const HAIR_BLONDE = '#e8c05a';
export const JERSEY_RED = '#d84838';
export const JERSEY_BLUE = '#3f6fd8';
export const JERSEY_GREEN = '#3f9e4a';
export const JERSEY_ORANGE = '#e8873a';
export const JERSEY_PURPLE = '#8a5ac0';
export const JERSEY_TEAL = '#2fa8a0';
export const JERSEY_CREAM = '#f5efdc';
export const JERSEY_NAVY = '#2c3a68';
export const CAP_GREEN = '#3a8a5c'; // steam-02 batter's cap
export const BAT_WOOD = '#d8a55e';
export const BALL_WHITE = '#f5f2e6';
export const BALL_STITCH = '#d84838';
export const GLOVE_BROWN = '#9c6231';

// ---- HUD sticker language (ui owner) ----
export const HUD_CREAM = '#f7f0dc'; // every sticker field
export const HUD_INK = '#2c2c34'; // outline / text ink
export const HUD_RED = '#d84838';
export const HUD_BLUE = '#3f6fd8';
export const HUD_GREEN = '#3f9e4a';
export const HUD_PURPLE = '#8a5ac0'; // pitch cards (RIGHT HOOK / LEFT HOOK)
export const HUD_YELLOW = '#f2c53d';
export const HUD_ORANGE = '#e8873a'; // JUICE carton / straw
export const HUD_SHADOW = '#1e2230'; // drop-shadow tint (use at low alpha)

/** Keyed lookup for ctx consumers: ctx.get('materials').rawColor('grassLight'). */
export const PALETTE = {
  skyZenith: SKY_ZENITH,
  skyMid: SKY_MID,
  skyHorizon: SKY_HORIZON,
  cloudLit: CLOUD_LIT,
  cloudShade: CLOUD_SHADE,
  hazeBand: HAZE_BAND,
  sunWarm: SUN_WARM,
  fillCool: FILL_COOL,
  hemiSky: HEMI_SKY,
  hemiGround: HEMI_GROUND,
  grassLight: GRASS_LIGHT,
  grassDark: GRASS_DARK,
  grassDeep: GRASS_DEEP,
  grassTuft: GRASS_TUFT,
  grassWorn: GRASS_WORN,
  dandelion: DANDELION,
  cloverWhite: CLOVER_WHITE,
  dirtTan: DIRT_TAN,
  dirtDark: DIRT_DARK,
  dirtDamp: DIRT_DAMP,
  dirtLight: DIRT_LIGHT,
  chalkCream: CHALK_CREAM,
  chalkShadow: CHALK_SHADOW,
  fenceTan: FENCE_TAN,
  fenceGap: FENCE_GAP,
  woodShed: WOOD_SHED,
  woodTrim: WOOD_TRIM,
  woodDark: WOOD_DARK,
  houseBlue: HOUSE_BLUE,
  houseCream: HOUSE_CREAM,
  houseRed: HOUSE_RED,
  houseTeal: HOUSE_TEAL,
  roofBlue: ROOF_BLUE,
  roofSlate: ROOF_SLATE,
  roofRed: ROOF_RED,
  roofShedGreen: ROOF_SHED_GREEN,
  roofMoss: ROOF_MOSS,
  foliageDeep: FOLIAGE_DEEP,
  foliageMid: FOLIAGE_MID,
  foliageLight: FOLIAGE_LIGHT,
  hedgeDeep: HEDGE_DEEP,
  hedgeMid: HEDGE_MID,
  hedgeLight: HEDGE_LIGHT,
  metalTruck: METAL_TRUCK,
  metalRust: METAL_RUST,
  ropeCream: ROPE_CREAM,
  buntRed: BUNT_RED,
  buntYellow: BUNT_YELLOW,
  buntBlue: BUNT_BLUE,
  buntWhite: BUNT_WHITE,
  buntTeal: BUNT_TEAL,
  buntPink: BUNT_PINK,
  skinPale: SKIN_PALE,
  skinPeach: SKIN_PEACH,
  skinTan: SKIN_TAN,
  skinBrown: SKIN_BROWN,
  skinDeep: SKIN_DEEP,
  hairBlack: HAIR_BLACK,
  hairBrown: HAIR_BROWN,
  hairOrange: HAIR_ORANGE,
  hairBlonde: HAIR_BLONDE,
  jerseyRed: JERSEY_RED,
  jerseyBlue: JERSEY_BLUE,
  jerseyGreen: JERSEY_GREEN,
  jerseyOrange: JERSEY_ORANGE,
  jerseyPurple: JERSEY_PURPLE,
  jerseyTeal: JERSEY_TEAL,
  jerseyCream: JERSEY_CREAM,
  jerseyNavy: JERSEY_NAVY,
  capGreen: CAP_GREEN,
  batWood: BAT_WOOD,
  ballWhite: BALL_WHITE,
  ballStitch: BALL_STITCH,
  gloveBrown: GLOVE_BROWN,
  hudCream: HUD_CREAM,
  hudInk: HUD_INK,
  hudRed: HUD_RED,
  hudBlue: HUD_BLUE,
  hudGreen: HUD_GREEN,
  hudPurple: HUD_PURPLE,
  hudYellow: HUD_YELLOW,
  hudOrange: HUD_ORANGE,
  hudShadow: HUD_SHADOW,
} as const;

export type PaletteKey = keyof typeof PALETTE;
