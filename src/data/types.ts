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
  /** Per-kid hair geometry (mass, back-layer drop, part side, extra strands)
   *  on top of the `hair` style. Clamped in CharacterArt's buildHairSpec.
   *  Omitted = the style's base silhouette. */
  hairSpec?: HairSpec;
  /** Personal street clothes worn during the draft (the ':sc' texture
   *  variant). Jerseys stay the base look everywhere else. Omitted = the kid
   *  renders their jersey even in street mode. */
  outfit?: Outfit;
  /** The one thing the roster says you would know this kid by from across a
   *  store — drawn in EVERY wardrobe (street and jersey) and every pose that
   *  shows it. Optional and orthogonal to `hair`/`accessory`, so a renderer
   *  that does not know a signature yet (v2's proxy and sculpts) is unchanged
   *  and simply draws the kid without it. */
  signature?: Signature;
}

/** The World 1 cast's signature looks (docs/world1/kids-roster-v0.7.md).
 *  - `hijab`: Fatou's sport hijab — replaces the hair.
 *  - `patka`: Guri's patka with its topknot — replaces the hair.
 *  - `slidingHelmet`: June's too-big batting helmet, and her bat choked up.
 *  - `catcherGear`: Sonny's chest protector, shin guards and skull cap.
 *  - `tzitzit`: Ezra's tassels below the hem.
 *  - `bigBat`: Mars's bat, visibly too big for anyone. */
export type Signature = 'hijab' | 'patka' | 'slidingHelmet' | 'catcherGear' | 'tzitzit' | 'bigBat';

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

/**
 * Per-kid hair geometry, the twin of BodySpec/FaceSpec.
 *
 * Hair was the ONE feature axis with no spec object, which is why six kids
 * sharing `short` rendered a byte-identical path and read as the same kid. All
 * four fields are CLAMPED in buildHairSpec — a content typo must never push a
 * mohawk tip or a pigtail out of the viewBox.
 */
export interface HairSpec {
  /** Overall mass, scaled about the head centre. Clamped 0.88–1.1. */
  volume?: number;
  /** Back-layer drop (ponytail / pigtails / long / bun). Clamped 0.8–1.25. */
  length?: number;
  /** Part side: −1 hard left, +1 hard right, 0 centred. Clamped −1–1. */
  part?: number;
  /** Extra strand clumps beyond the base set. Clamped 0–3, integer. */
  wisps?: number;
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
  | 'unhittable_pitch' // As a pitcher, shifts the batter's timing band down one.
  | 'crazy_bunt'; // Signature 🤪 CRAZY BUNT swing card (SWING_TYPES.CRAZY_BUNT).

/**
 * A kid's signature BEHAVIOUR in the classic game — the habit or flaw the cast
 * sheet gives them, as something that happens on the field. Data here; every
 * rule and number lives in `systems/quirks.ts` and `config.QUIRKS`. Separate
 * from `AbilityId` on purpose: abilities are read by both games, and a quirk
 * is v1's until v2 builds its own.
 */
export type Quirk =
  | 'never_swings' // Winnie: takes every pitch, behind the smallest zone around.
  | 'green_light' // Zaya: steals when she feels like it. Nobody calls it.
  | 'wild_arm' // Kwame: pure gas, no idea where it goes.
  | 'wobble' // Dev: nobody knows where the wobble ends up, him included.
  | 'wrong_base' // Roya: maximum velocity, at the wrong bag.
  | 'clutch_behind' // Nora: ordinary until her team is losing.
  | 'clutch_risp' // Marcus: the archetype's own rule — in scoring position, tied or behind.
  | 'clutch_runners' // Yui: only good with somebody on base.
  | 'moonshot' // Mars: perfect timing and it is gone, whatever the pitcher threw.
  | 'foul_back' // Josie: fouls them straight back at the pitcher.
  | 'same_spot'; // Hattie: the same soft single to the same spot.

/**
 * The ten archetypes of the World 1 cast sheet (`docs/world1/kids-roster-v0.7.md`).
 * Content today; the sim mechanics each one implies arrive behind flags.
 */
export type Archetype =
  | 'speedster'
  | 'slugger'
  | 'fireballer'
  | 'wall'
  | 'knuckler'
  | 'table-setter'
  | 'junkballer'
  | 'pest'
  | 'clutch'
  | 'cannon';

export interface Character {
  /** Stable key — used as the texture key AND the localStorage pick-tally key.
   *  It names a SLOT, not a kid: the cast was re-cast in place in 2026-11 and
   *  every kid kept the id of the slot it took over (see `recast`). */
  id: string;
  name: string;
  /** Optional iconic glyph for our minimal-reading, icon-forward UI. */
  emoji?: string;
  /** One-line kid-friendly flavor ("Never misses.", "Calls her shot. Usually wrong."). */
  tagline: string;
  /** Cast-sheet archetype. */
  archetype?: Archetype;
  /** Cast-sheet tier: 1 carries a custom rig, screen time and the first toy
   *  line; 2 shares the modular rig. Pick-rate data can promote a 2. */
  tier?: 1 | 2;
  /** Who held this slot before the 2026-11 re-cast, and whether the delivered
   *  v2 sculpt is still a credible stand-in for the new kid. When it is not,
   *  `CharacterFactory` draws the proxy until a sculpt against the new sheet
   *  lands — a boy's body is not a stand-in for a girl. */
  recast?: { was: string; modelCarries: boolean };
  /** Drives voice selection only (curated-voice sublist + pitch band) — not art. */
  voiceGender: 'boy' | 'girl';
  stats: Stats;
  visual: VisualParams;
  ability: AbilityId;
  /** This kid's signature behaviour in the classic game (`systems/quirks.ts`). */
  quirk?: Quirk;
  /** Says nothing during a game — field chatter never picks this kid. */
  silentInGame?: boolean;
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
