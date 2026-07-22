// ---------------------------------------------------------------------------
// Core data model for Recess Sports.
// These are plain TypeScript types — no Phaser here. Think of them as your
// "models": the shape of a character, a team, an at-bat result.
// ---------------------------------------------------------------------------

/** Every stat is 1-10. Higher is better. */
export interface Stats {
  /** Avoids strikeouts / makes contact. */
  contact: number;
  /** Turns hits into extra bases (doubles, homers). */
  power: number;
  /** Baserunning — steals the occasional extra base and beats out weak grounders. */
  speed: number;
  /** Only matters when this kid is the one pitching. Doubles as the throwing arm. */
  pitching: number;
  /** The glove: range on defense and how rarely this kid drops/bobbles the ball. */
  fielding: number;
}

/** Visual knobs the character-drawing code reads to make each kid look distinct. */
export interface VisualParams {
  skin: number; // index into palette.SKIN_TONES
  hair: HairStyle;
  hairColor: number; // index into palette.HAIR_COLORS
  uniform: number; // index into palette.UNIFORM_COLORS
  accessory: Accessory;
  /** Face personality. Defaults to 'happy' when omitted. */
  expression?: Expression;
  /** Body shape. Defaults to 'normal'. */
  bodyType?: BodyType;
  /** Little dusting of freckles across the nose. */
  freckles?: boolean;
  /** Batting-stance variant (undefined = the standard stance). Same texture
   *  count — it reshapes the bat/windup poses, it doesn't add poses. */
  stance?: BattingStance;
  /** Per-kid body geometry overrides on top of the bodyType preset. Every
   *  field optional; omitted fields fall back to the preset. Values are
   *  clamped in CharacterArt's buildBodySpec so a content typo can't clip
   *  the viewBox or break pose choreography. */
  body?: BodySpec;
  /** Per-kid face geometry (eye spacing/size/style, nose, mouth width,
   *  cheek blush). Omitted = today's default face layout. */
  face?: FaceSpec;
  /** Personal street clothes worn during the draft (the ':sc' texture
   *  variant). Jerseys stay the base look everywhere else. Omitted = the kid
   *  renders their jersey even in street mode. */
  outfit?: Outfit;
}

/** A street outfit: top garment kind + STREET_COLORS indexes + bottoms. */
export interface Outfit {
  kind: OutfitKind;
  /** STREET_COLORS index for the top garment. */
  top: number;
  /** STREET_COLORS index for the bottoms (shorts/skirt); jeans/overalls are
   *  always denim. Defaults to a neutral. */
  bottom?: number;
  /** Bottom garment for tee/stripeTee/hoodie/jacket kids (default 'shorts').
   *  Dress kids get a skirt, overalls kids get denim, automatically. */
  bottoms?: 'shorts' | 'jeans';
}

export type OutfitKind = 'tee' | 'stripeTee' | 'hoodie' | 'overalls' | 'dress' | 'jacket';

/** Silhouette-level body knobs. Defaults reproduce the bodyType preset. */
export interface BodySpec {
  /** Overall height scale, anchored at the GROUND line (feet stay planted).
   *  Clamped to 0.82–1.0 — kids only shrink, nothing can clip the top. */
  height?: number;
  /** Torso/shoulder half-width in viewBox px (preset: 46 normal / 54 chunky /
   *  38 small). Clamped 36–56 so cheer hands stay inside the viewBox. */
  shoulderW?: number;
  /** Extra hip width per side (px). Positive = pear, negative = V-taper. */
  hipW?: number;
  /** 0–1 lower-torso bow — rounds the belly line of the jersey. */
  belly?: number;
  /** Head lift in px (positive = longer neck, negative = no-neck). */
  neck?: number;
  /** Head-group scale (skull + face + hair + hat together). Clamped
   *  0.9–1.08 — the mohawk tip already grazes the viewBox top. */
  headW?: number;
  headH?: number;
}

/** Face-geometry knobs consumed by CharacterArt's face()/accessory(). */
export interface FaceSpec {
  /** Eye offset from face center (eyes at 100±gap; default 18). Glasses
   *  lenses follow it. Clamped 13–24. */
  eyeGap?: number;
  /** Eye size multiplier (default 1). Clamped 0.75–1.3. */
  eyeSize?: number;
  /** 'classic' sclera eyes (default), 'button' dark toy eyes, 'sleepy'
   *  heavy-lidded classic. */
  eyeStyle?: EyeStyle;
  /** Nose variant: 'arc' (default squiggle), 'dot' button, 'wedge' big kid-nose. */
  nose?: NoseStyle;
  /** Mouth width multiplier (default 1) — applied as a scaleX wrapper so the
   *  mouth path strings themselves never change. Clamped 0.75–1.25. */
  mouthW?: number;
  /** Cheek-blush intensity (default 1; 0 = none). Clamped 0–1.4. */
  cheeks?: number;
}

export type EyeStyle = 'classic' | 'button' | 'sleepy';
export type NoseStyle = 'arc' | 'dot' | 'wedge';

export type BattingStance = 'open' | 'crouch' | 'high';

export type HairStyle =
  | 'short'
  | 'curly'
  | 'ponytail'
  | 'buzz'
  | 'mohawk'
  | 'bald'
  | 'afro'
  | 'pigtails'
  | 'spiky'
  | 'bun'
  | 'long';

export type Expression =
  | 'happy'
  | 'grin'
  | 'cool'
  | 'determined'
  | 'goofy'
  | 'surprised'
  // Reaction expressions — not used as resting faces in ROSTER; they're baked
  // into the reaction poses ('upset'/'nervous') and big-moment art.
  | 'upset'
  | 'nervous'
  | 'celebrate';

export type BodyType = 'normal' | 'chunky' | 'small';

export type Accessory = 'none' | 'cap' | 'headband' | 'glasses' | 'wheelchair';

/**
 * Ability hooks. The at-bat resolver checks these instead of special-casing
 * specific characters, so the 3 signature kids stay clean and data-driven.
 */
export type AbilityId =
  | 'none'
  | 'never_strikes_out' // Misses become weak contact — this kid never whiffs.
  | 'calls_shot' // Pure flavor: a speech bubble prediction that is always wrong.
  | 'unhittable_pitch'; // As a pitcher, shifts the batter's timing band down one.

export interface Character {
  /** Stable key — used as the texture key AND the localStorage pick-tally key. */
  id: string;
  name: string;
  /** Optional iconic glyph for our minimal-reading, icon-forward UI. */
  emoji?: string;
  /** One-line kid-friendly flavor ("Never misses.", "Calls his shot. Always wrong."). */
  tagline: string;
  /** Drives voice selection only (curated-voice sublist + pitch band) — not art. */
  voiceGender: 'boy' | 'girl';
  stats: Stats;
  visual: VisualParams;
  ability: AbilityId;
  /** First-person excited line this kid shouts when drafted (spoken in their derived voice). */
  draftLine?: string;
  /** Signature field-chatter lines (first person). Generic pools cover kids without them. */
  chatterLines?: string[];
}

/** The two 9-kid rosters, handed from the Draft scene to the Game scene. */
export interface TeamState {
  playerTeam: string[]; // character ids, in batting order
  aiTeam: string[];
}
