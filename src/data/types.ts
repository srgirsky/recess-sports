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
}

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
  | 'surprised';

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
  stats: Stats;
  visual: VisualParams;
  ability: AbilityId;
}

/** The two 9-kid rosters, handed from the Draft scene to the Game scene. */
export interface TeamState {
  playerTeam: string[]; // character ids, in batting order
  aiTeam: string[];
}
