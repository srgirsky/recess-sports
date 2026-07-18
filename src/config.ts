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

/** Game length for the vertical slice. Two innings = four half-innings. */
export const INNINGS = 2;

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
};
