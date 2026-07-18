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

// --- Live plays (interactive fielding & baserunning) -----------------------

/**
 * Tunables for the real-time ball-in-play sim (systems/liveplay.ts). All px
 * values are screen-space (the fixed 960x640 canvas); speeds are px/second.
 */
export const LIVE = {
  /** Contact → launch distribution (systems/atbat.ts resolveContact). */
  LAUNCH: {
    /** Quality above this on a fly ball clears the fence (home run). */
    HR_Q: 1.18,
    /** Keep landings this fraction inside the foul lines (0 = on the line). */
    SPRAY_MARGIN: 0.1,
    /** Grounder settle distance from home (px): BASE + q * SCALE. */
    GROUNDER_DIST: { BASE: 120, SCALE: 240 },
    /** Liner / fly landing distance from home (px): BASE + q * SCALE. */
    LINER_DIST: { BASE: 170, SCALE: 220 },
    FLY_DIST: { BASE: 190, SCALE: 240 },
    /** Air time ranges (ms) — deeper ball = longer hang within the range. */
    LINER_HANG_MS: { MIN: 380, MAX: 560 },
    FLY_HANG_MS: { MIN: 950, MAX: 1400 },
    /** Initial grounder roll speed (px/s); decelerates to stop at the settle point. */
    GROUNDER_SPEED: { MIN: 300, MAX: 430 },
  },
  /** Player-steered fielder speed (px/s). */
  FIELDER_SPEED: 210,
  /** How close (px) a fielder must be to grab the ball. */
  CATCH_RADIUS: 34,
  PICKUP_RADIUS: 28,
  /** An airborne ball is catchable in this last fraction of its flight. */
  CATCHABLE_TAIL: 0.4,
  /** Hold-to-charge time (ms) for a full-power throw. */
  THROW_METER_MS: 900,
  /** Throw flight speed (px/s) at zero / full charge. */
  THROW_SPEED_MIN: 340,
  THROW_SPEED_MAX: 820,
  /** Idle-kid rescue: sim throws by itself after holding the ball this long. */
  AUTO_THROW_MS: 2600,
  /** Runner speed (px/s) at speed stat 5; each stat point is ±6%. */
  RUNNER_SPEED: 175,
  /** Distance ball→next base above which a CPU runner risks the extra base. */
  CPU_RUNNER_GREED_DIST: 210,
  /** A loose ball nobody has picked up for this long → CPU runners just go. */
  CPU_RUNNER_PATIENCE_MS: 1200,
  /** Hard cap: any live play resolves by now (stragglers settle safe behind). */
  MAX_PLAY_MS: 9000,
};

export type Difficulty = 'easy' | 'hard';

/** Forgiveness knobs. EASY is the default — HARD is real stakes. */
export const DIFFICULTY: Record<
  Difficulty,
  {
    /** CPU fielder chase speed (× FIELDER_SPEED). */
    cpuFielderSpeedMult: number;
    /** Delay before the CPU fielder starts chasing the ball. */
    cpuReactionMs: number;
    /** How long the CPU holds the ball before throwing. */
    cpuThrowDelayMs: number;
    /** CPU throw flight speed (× THROW_SPEED_MAX). */
    cpuThrowSpeedMult: number;
    /** Up to this many ms of wobble added to a CPU throw's arrival. */
    cpuThrowErrorMs: number;
    /** Player catch/pickup radius multiplier (bigger = easier grabs). */
    reachMult: number;
    /** Player runners' speed (× RUNNER_SPEED). */
    playerRunSpeedMult: number;
    /** CPU runners' speed (× RUNNER_SPEED). */
    cpuRunSpeedMult: number;
  }
> = {
  easy: {
    cpuFielderSpeedMult: 0.62,
    cpuReactionMs: 550,
    cpuThrowDelayMs: 500,
    cpuThrowSpeedMult: 0.62,
    cpuThrowErrorMs: 320,
    reachMult: 1.6,
    playerRunSpeedMult: 1.15,
    cpuRunSpeedMult: 0.8,
  },
  hard: {
    cpuFielderSpeedMult: 1.0,
    cpuReactionMs: 160,
    cpuThrowDelayMs: 220,
    cpuThrowSpeedMult: 1.0,
    cpuThrowErrorMs: 40,
    reachMult: 1.0,
    playerRunSpeedMult: 1.0,
    cpuRunSpeedMult: 1.05,
  },
};

/** Character-animation timing/feel. */
export const ANIM = {
  SWING_MS: 120, // how fast the bat whips through the swing
  WINDUP_MS: 260, // pitcher lean-back before the release
  RUN_BOB: 7, // pixels a runner bounces while running
  IDLE_BOB: 5, // pixels the idle "breathing" bob rises
  RUN_FRAME_MS: 110, // run-cycle frame swap (run1 <-> run2 textures)
  // Schoolyard (title + draft) choreography.
  AMBIENT_HOP_EVERY_MS: 2600, // a random waiting kid hops ("pick me!") this often
  STREAM_STAGGER_MS: 70, // delay between kids bursting out of the doors
  STREAM_RUN_MS: 700, // one leg of a kid's run from the doors to the wall
  CPU_SCAN_HOP_MS: 170, // CPU "?" spotlight hop while it pretends to decide
  CHEER_WAVE_STAGGER_MS: 80, // delay between kids joining the cheer wave
};
