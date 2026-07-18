// ---------------------------------------------------------------------------
// Central tuning knobs. When something needs to "feel" different — swing timing,
// game length, colors — change it HERE, not buried in a scene. This is the file
// you'll edit most while dialing in the fun.
// ---------------------------------------------------------------------------

/** The game's internal resolution. Phaser's Scale.FIT scales this to any screen. */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 640;

export const COLORS = {
  sky: 0x4aa5e0,
  grass: 0x5bbf5a,
  grassDark: 0x4aa84a,
  dirt: 0xc98a4b,
  ink: 0x14202e, // near-black text/outlines
  cream: 0xfff4de,
  gold: 0xffce3a,
  red: 0xe8524a,
  white: 0xffffff,
};

/** How long a pitch takes to travel from the mound to the plate (ms). */
export const PITCH_TRAVEL_MS = 950;

/**
 * Swing timing windows, in ms of error from the ideal contact moment.
 * error < PERFECT -> Perfect; < GOOD -> Good; < CONTACT -> Weak; else -> Miss.
 * Widen these to make the game easier (younger kids), tighten to make it harder.
 */
export const TIMING = {
  PERFECT: 55,
  GOOD: 130,
  CONTACT: 230,
};

/**
 * Pitch timing windows (ms error from the sweet spot) for the player's defense
 * half. Same idea as TIMING but for the mound: beyond WEAK the throw is WILD.
 */
export const PITCH_TIMING = {
  PERFECT: 70,
  GOOD: 150,
  WEAK: 260,
};

/** How long the mound ring shrinks before the sweet-spot moment (ms). */
export const PITCH_METER_MS = 1000;

/** Grace after the sweet spot before we auto-throw for an idle kid (no soft-lock). */
export const PITCH_AUTO_THROW_MS = 600;

/** Ball flight time in the CPU half — faster than the player's, keeps it snappy. */
export const CPU_PITCH_TRAVEL_MS = 500;

/** Pause between CPU-half pitches (ms). */
export const CPU_STEP_DELAY_MS = 700;

/**
 * Chance the AI pitcher throws a visibly wild pitch at the player (a "don't
 * swing!" ball). Better pitching stat = fewer wild ones.
 */
export const WILD_PITCH_CHANCE = {
  BASE: 0.16,
  PER_PITCHING: 0.015, // chance -= (pitching - 5) * this
};

/** Game length for the vertical slice. Two innings = four half-innings. */
export const INNINGS = 2;

/** Bonus innings allowed on a tie. After this many, the tie stands. */
export const MAX_EXTRA_INNINGS = 1;

/** How long the AI "thinks" before making a draft pick, so kids see it happen. */
export const AI_PICK_DELAY_MS = 750;

export const TEAM_SIZE = 9;

// --- Juice & feel ----------------------------------------------------------

/** Screen-shake intensity (pixels) per hit type. Bigger hit = bigger shake. */
export const SHAKE = {
  single: 3,
  double: 5,
  triple: 8,
  homer: 13,
};

/** How long a runner takes to jog ONE base (ms). Post-hit pacing derives from this. */
export const RUNNER_TWEEN_MS = 460;

/** Show the contracting timing ring at the plate (swing-timing teaching aid). */
export const SHOW_TIMING_RING = true;

/** Master volume for the code-synthesized sound effects (0-1). */
export const AUDIO = {
  masterVolume: 0.35,
};

/** Character-animation timing/feel. */
export const ANIM = {
  SWING_MS: 120, // how fast the bat whips through the swing
  WINDUP_MS: 260, // pitcher lean-back before the release
  RUN_BOB: 7, // pixels a runner bounces while running
  IDLE_BOB: 5, // pixels the idle "breathing" bob rises
  // Intro (Title) choreography.
  TITLE_KID_RUN_MS: 460, // each showcase kid's run-in from off-screen
  TITLE_KID_STAGGER_MS: 110, // delay between kids joining the line-up
  AMBIENT_HOP_EVERY_MS: 2600, // a random showcase kid hops this often
  // Draft choreography.
  DEAL_STAGGER_MS: 18, // per-card delay while the grid deals in
  DEAL_POP_MS: 210, // one card's deal-in pop
  CPU_SCAN_HOP_MS: 170, // CPU "spotlight" hop while it pretends to decide
  FLY_TO_BENCH_MS: 340, // drafted kid's flight from card to dugout bench
};
