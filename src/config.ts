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
export const PITCH_TRAVEL_MS = 1250;

/**
 * Swing timing windows, in ms of error from the ideal contact moment.
 * error < PERFECT -> Perfect; < GOOD -> Good; < CONTACT -> Weak; else -> Miss.
 * Widen these to make the game easier (younger kids), tighten to make it harder.
 */
export const TIMING = {
  PERFECT: 80,
  GOOD: 170,
  CONTACT: 300,
};

/**
 * Pitch timing windows (ms error from the sweet spot) for the player's defense
 * half. Same idea as TIMING but for the mound: beyond WEAK the throw is WILD.
 */
export const PITCH_TIMING = {
  PERFECT: 90,
  GOOD: 180,
  WEAK: 300,
};

/** How long the mound ring shrinks before the sweet-spot moment (ms). */
export const PITCH_METER_MS = 1200;

/** Grace after the sweet spot before we auto-throw for an idle kid (no soft-lock). */
export const PITCH_AUTO_THROW_MS = 700;

/** Ball flight time in the CPU half — faster than the player's, keeps it snappy. */
export const CPU_PITCH_TRAVEL_MS = 750;

/**
 * Between-moments pacing (ms). Every "wait before the next thing" beat lives
 * HERE, not hardcoded in GameScene delayedCalls. Invariant: a banner's hold
 * time must be <= the FLOW beat that follows it, so calls are always readable
 * before the next pitch fires.
 */
export const FLOW = {
  /** Ball/strike/foul settled -> next pitch (player batting half). */
  BETWEEN_PITCH_MS: 1250,
  /** Floor after any at-bat that moved runners (walk/hit fold-in). */
  AFTER_PLAY_MS: 1500,
  /** Extra pad after the baserunning animation finishes. */
  RUN_SETTLE_PAD_MS: 500,
  /** Live play resolved -> next batter steps in. */
  AFTER_LIVE_PLAY_MS: 1600,
  /** New batter announced -> the first pitch (player half). */
  NEW_BATTER_MS: 750,
  /** CPU batter jogs in -> your pitch turn begins. */
  CPU_NEW_BATTER_MS: 850,
  /** Between CPU-half pitches. */
  CPU_STEP_MS: 1100,
  /** Half-start banner -> first batter. */
  HALF_START_MS: 1400,
  /** Default flashAnnounce hold. */
  BANNER_HOLD_MS: 1100,
  /** Big-moment banners: STRIKEOUT / WALK / runs scored / walk-off. */
  BIG_BANNER_HOLD_MS: 1600,
};

/**
 * Chance the AI pitcher throws a visibly wild pitch at the player (a "don't
 * swing!" ball). Better pitching stat = fewer wild ones.
 */
export const WILD_PITCH_CHANCE = {
  BASE: 0.16,
  PER_PITCHING: 0.015, // chance -= (pitching - 5) * this
};

// --- Pitch selection & aiming (main mode) ----------------------------------

/**
 * The strike-zone window at the plate, in "plate coords": px offsets from the
 * zone center, which sits at (HOME.x, HOME.y + CY) on screen. Shared by pitch
 * aiming, the ball's flight, and (later) the batting cursor.
 */
export const PLATE_ZONE = {
  W: 96,
  H: 100,
  /** Zone center's y offset from HOME (the ball has always crossed at -26). */
  CY: -26,
};

export type PitchKind = 'fastball' | 'changeup' | 'curve' | 'screwball' | 'crazy';

export interface PitchDef {
  /** Flight speed (× the half's base travel time — higher = faster). */
  speedMult: number;
  /** Flight bend at its widest, plate-coord px (x: + = toward 1B side). */
  breakX: number;
  breakY: number;
  /** Extra flutter in the flight path (px) — the crazy pitch lives on this. */
  wobble: number;
  /** How hard the pitch is to read: drags CPU swings down, tempts chases. */
  deception: number;
  /** Kid-readable button label. */
  label: string;
}

export const PITCHES: Record<PitchKind, PitchDef> = {
  fastball: { speedMult: 1.1, breakX: 0, breakY: 0, wobble: 0, deception: 0.12, label: '🔥 FAST' },
  changeup: { speedMult: 0.72, breakX: 0, breakY: 16, wobble: 0, deception: 0.5, label: '🐢 SLOW' },
  curve: { speedMult: 0.92, breakX: -40, breakY: 16, wobble: 0, deception: 0.35, label: '🌙 CURVE' },
  screwball: { speedMult: 0.95, breakX: 38, breakY: 8, wobble: 0, deception: 0.35, label: '🌀 SCREW' },
  // Juice-meter special (locked until the juice system lands).
  crazy: { speedMult: 0.88, breakX: 52, breakY: -10, wobble: 26, deception: 0.75, label: '⚡ CRAZY' },
};

/** The main-mode batting cursor (plate-coord px). */
export const CURSOR = {
  /** Cursor within this of the ball keeps the full timing band. */
  SWEET_R: 24,
  /** Beyond SWEET_R but within this costs one band; past it = whiff. */
  CONTACT_R: 50,
  /** How far past the zone edge the cursor can roam (× zone half-size). */
  RANGE_MULT: 1.6,
};

/** How far a thrown pitch misses its aim point (plate-coord px). */
export const PITCH_SCATTER = {
  /** Even a perfect throw wanders this much. */
  BASE: 6,
  /** Extra scatter per ms of meter error. */
  PER_ERROR_MS: 0.16,
  /** Extra scatter per pitching-stat point below 5. */
  PER_STAT_BELOW: 4.5,
  MAX: 72,
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

/**
 * The behind-home-plate pitch view (the TV/umpire angle): a full-screen rig
 * (scenes/ui/BattingView.ts) shown for every pitch — batter big in the
 * foreground seen from behind, pitcher small in the distance facing you, the
 * ball flying AT the camera. Hard cut back to the wide 3/4 field on contact.
 * The main camera never pans/zooms; HUD chrome lives on the UI camera.
 */
export const PLATE_VIEW = {
  /** Rig container depth. Pitch-era visuals (zone, rings, cursor, ball) sit at
   *  DEPTH+2..+8; anything below DEPTH silently vanishes under the backdrop. */
  DEPTH: 50,
  /** Frontal strike zone: screen anchor of the zone center + plate-px scale
   *  (PLATE_ZONE 96x100 -> ~173x180 on screen). */
  ZONE: { CX: 480, CY: 390, SCALE: 1.8 },
  /** The distant pitcher, facing the camera. RELEASE_DY = ball release point
   *  above their feet. */
  PITCHER: { X: 480, Y: 318, H: 104, RELEASE_DY: 56 },
  /** The rear-view batter, big in the foreground (RHB = screen-left, the 3B
   *  side — same side as the world batter, so the cut has continuity). */
  BATTER: { X: 300, Y: 624, H: 288 },
  /** The fielding team's catcher, crouched and cropped by the frame bottom
   *  (head + shoulders in frame; feet well below it). */
  CATCHER: { X: 556, Y: 696, H: 230 },
  /** The 7 non-battery defenders in the behind-home view, so the close view
   *  shows the same defense as the wide field. From a camera at home plate,
   *  3B/SS/LF sit screen-LEFT and 1B/2B/RF screen-RIGHT (matching the
   *  backdrop's foul lines). Corners nearest (biggest), middle infield
   *  deeper, outfield smallest with feet just under the horizon. */
  FIELDERS: {
    '1B': { X: 792, Y: 330, H: 94 },
    '3B': { X: 168, Y: 330, H: 94 },
    '2B': { X: 604, Y: 304, H: 76 },
    SS: { X: 356, Y: 304, H: 76 },
    LF: { X: 264, Y: 299, H: 60 }, // OF sit nearer the center than the corners
    CF: { X: 522, Y: 297, H: 56 }, // (deeper = compressed toward the vanishing
    RF: { X: 696, Y: 299, H: 60 }, //  point); offsets keep everyone un-stacked
  } as Record<string, { X: number; Y: number; H: number }>,
  /** Where the ground meets the backdrop fence. */
  HORIZON_Y: 292,
  /** The white-flash punch on the hard cut between views. */
  CUT_FLASH_MS: 60,
  /** Pitch-ball scale ramp — it grows as it flies at the camera. */
  BALL: { SCALE_FROM: 0.5, SCALE_TO: 2.2 },
  /** Kid-mode timing-ring radius on the frontal zone. */
  RING_R: 40,
};

/**
 * Kid sprite heights (px). Backyard-style chunky: big enough that faces,
 * hair, and freckles read at a glance. Field sprites still shrink with depth
 * via art/projection's depthScale.
 */
export const KID_SIZE = {
  /** Batting-stance sprite at the plate (also shown in the camera close-up). */
  BATTER_H: 164,
  /** The kid on the mound. */
  PITCHER_H: 124,
  /** The 8 non-pitcher fielders (at depth 0; projection shrinks with depth). */
  FIELDER_H: 82,
  /** Baserunner tokens. */
  RUNNER_H: 82,
  /** Schoolyard draft wall: back row (on the curb) / front row. */
  WALL_BACK_H: 88,
  WALL_FRONT_H: 98,
};

/** How long a runner takes to jog ONE base (ms). Post-hit pacing derives from this. */
export const RUNNER_TWEEN_MS = 450;

/** Show the contracting timing ring at the plate (swing-timing teaching aid). */
export const SHOW_TIMING_RING = true;

/** Master volume for the code-synthesized sound effects (0-1). */
export const AUDIO = {
  masterVolume: 0.35,
};

/**
 * SpeechSynthesis voices: the two booth kids, the 30 derived character voices,
 * the speech queue, and field-chatter cadence. NOTE: speech does NOT pass
 * through AUDIO.masterVolume — VOLUME below is the only speech volume knob.
 */
export const VOICE = {
  /** The two kid commentators (a milk crate behind the backstop). */
  COMMENTATORS: {
    A: { pitch: 1.55, rate: 1.12, voiceIdx: 0 }, // Pip — hyped little kid
    B: { pitch: 1.0, rate: 0.95, voiceIdx: 1 }, // Rocco — deadpan older kid
  },
  /** Chance a big call (priority 2) becomes a two-line A/B exchange. */
  EXCHANGE_CHANCE: 0.45,
  /** Derived per-character voices: hash(id) picks within these ranges. */
  KID: {
    PITCH_MIN: 1.15,
    PITCH_MAX: 1.7,
    RATE_MIN: 0.95,
    RATE_MAX: 1.15,
    /** Expression nudges (added after the hash roll, then clamped to the ranges). */
    NUDGE: {
      happy: { pitch: 0, rate: 0 },
      grin: { pitch: 0.04, rate: 0.02 },
      cool: { pitch: -0.12, rate: -0.05 },
      determined: { pitch: -0.06, rate: 0 },
      goofy: { pitch: 0.1, rate: 0.06 },
      surprised: { pitch: 0.1, rate: 0.04 },
    },
  },
  /** Speech queue: pending cap + watchdog duration estimate (onend is flaky). */
  QUEUE: { MAX_PENDING: 2, EST_BASE_MS: 450, EST_MS_PER_CHAR: 65 },
  /** Field chatter cadence (systems/chatter.ts). */
  CHATTER: { COOLDOWN_MS: 8000, CHANCE: 0.55 },
  /** Utterance volume (0-1). */
  VOLUME: 1,
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
    LINER_HANG_MS: { MIN: 500, MAX: 700 },
    FLY_HANG_MS: { MIN: 1200, MAX: 1700 },
    /** Initial grounder roll speed (px/s); decelerates to stop at the settle point. */
    GROUNDER_SPEED: { MIN: 240, MAX: 350 },
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
  THROW_SPEED_MIN: 380,
  THROW_SPEED_MAX: 820,
  /** Idle-kid rescue: sim throws by itself after holding the ball this long. */
  AUTO_THROW_MS: 2600,
  /** Runner speed (px/s) at speed stat 5; each stat point is ±6%.
   *  Scaled with the base-leg length (~180px legs) so a leg takes ~1.5s. */
  RUNNER_SPEED: 117,
  /** Distance ball→next base above which a CPU runner risks the extra base. */
  CPU_RUNNER_GREED_DIST: 165,
  /** A loose ball nobody has picked up for this long → CPU runners just go. */
  CPU_RUNNER_PATIENCE_MS: 1500,
  /** Hard cap: any live play resolves by now (stragglers settle safe behind). */
  MAX_PLAY_MS: 9000,
};

/**
 * Error model (main mode): drops, bobbles, and wild throws, driven by each
 * kid's glove (fielding stat) and arm (pitching stat). All chances are scaled
 * by the mode's error multiplier — kid mode runs at 0.
 */
export const ERRORS = {
  /** Drop chance on a fly catch at glove 5. Each glove point is ±PER_GLOVE. */
  DROP_BASE: 0.14,
  PER_GLOVE: 0.02,
  /** Grounder bobbles are this fraction of the drop chance. */
  BOBBLE_FACTOR: 0.5,
  /** Wild-throw chance at arm 5. Each arm point is ±PER_ARM. */
  WILD_BASE: 0.1,
  PER_ARM: 0.015,
  /** Extra wild chance when the throw meter is maxed (overthrowing it). */
  OVERCHARGE_PENALTY: 0.08,
  /** After a drop/bobble the kid is flustered this long (can't re-grab). */
  FUMBLE_MS: 650,
  /** A wild throw sails this far past the bag before dying. */
  OVERSHOOT_PX: 64,
};

/**
 * The juice meter (main mode): great plays charge it; spend it on a POWER
 * SWING at the plate or the CRAZY pitch on the mound.
 */
export const JUICE = {
  MAX: 100,
  POWER_SWING_COST: 55,
  CRAZY_PITCH_COST: 55,
  GAINS: {
    perfectSwing: 12,
    hit: 10,
    homer: 30,
    runScored: 12,
    strikeoutThrown: 18,
    cleanCatch: 10,
    doublePlay: 30,
    steal: 20,
  },
  /** Power swing: the timing band steps up one and quality gets this bonus. */
  POWER_Q_BONUS: 0.3,
  /** calls_shot + power swing: contact quality can't roll below this — just
   *  over LIVE.LAUNCH.HR_Q, so the called shot FINALLY clears the fence. */
  CALLED_SHOT_Q_FLOOR: 1.2,
};

/** Full-baserunning rules (main mode). */
export const RUN2 = {
  /** Ball-carrier within this of an off-bag runner = tag, you're out. */
  TAG_RADIUS: 26,
  /** A runner within this of a bag counts as standing ON it (untaggable). */
  SAFE_RADIUS: 14,
  /** A CPU runner turns back when the carrier is ahead and this close. */
  CPU_PANIC_DIST: 100,
  /** After a caught fly the play stays open this long for tag-up sends. */
  SAC_WINDOW_MS: 1400,
  /** A kid who just caught a fly needs this long to gather before throwing —
   *  the beat that makes sac flies from third a real race. */
  CATCH_GATHER_MS: 700,
};

/**
 * The two ways to play. KID is the original one-button game with a forgiving
 * live sim; MAIN (the default) is the full Backyard-Baseball-style experience —
 * its extra mechanics arrive behind the `features` flags below.
 */
export type GameMode = 'kid' | 'main';

/** Which main-mode mechanics are switched on. Kid mode keeps these all false. */
export interface ModeFeatures {
  /** Pick a pitch type + aim it into the strike zone on the mound. */
  pitchSelection: boolean;
  /** Positionable swing cursor over the plate (aim + timing at bat). */
  battingCursor: boolean;
  /** Per-runner send/hold, tag-ups, rundowns. */
  manualBaserunning: boolean;
  /** Drops / wild throws driven by fielder stats. */
  errors: boolean;
  /** Steals and leadoffs. */
  steals: boolean;
  /** Juice meter: power swings & crazy pitches. */
  juice: boolean;
}

/** Per-mode live-sim multipliers (the old EASY/HARD forgiveness knobs). */
export interface ModeLiveTuning {
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
  /** Scale on the PLAYER team's drop/wild-throw chances (0 = never errs). */
  playerErrorMult: number;
  /** Scale on the CPU team's error chances. */
  cpuErrorMult: number;
  /** Full baserunning rules: tag-ups, doubling off, tags/rundowns, per-runner control. */
  manualBaserunning: boolean;
}

export const MODES: Record<
  GameMode,
  {
    live: ModeLiveTuning;
    features: ModeFeatures;
    /** Optional swing-timing override (main mode: cursor aim adds difficulty,
     *  so the windows widen a touch vs the kid-mode TIMING). */
    swingTiming?: typeof TIMING;
  }
> = {
  kid: {
    live: {
      cpuFielderSpeedMult: 0.62,
      cpuReactionMs: 550,
      cpuThrowDelayMs: 500,
      cpuThrowSpeedMult: 0.62,
      cpuThrowErrorMs: 320,
      reachMult: 1.6,
      playerRunSpeedMult: 1.3,
      cpuRunSpeedMult: 0.8,
      playerErrorMult: 0, // kid mode: your kids never drop it
      cpuErrorMult: 0,
      manualBaserunning: false,
    },
    features: {
      pitchSelection: false,
      battingCursor: false,
      manualBaserunning: false,
      errors: false,
      steals: false,
      juice: false,
    },
  },
  main: {
    // Old HARD, softened a touch — main mode is still for kids.
    live: {
      cpuFielderSpeedMult: 1.0,
      cpuReactionMs: 320,
      cpuThrowDelayMs: 300,
      cpuThrowSpeedMult: 1.0,
      cpuThrowErrorMs: 80,
      reachMult: 1.15,
      playerRunSpeedMult: 1.0,
      cpuRunSpeedMult: 0.95,
      playerErrorMult: 1,
      cpuErrorMult: 1,
      manualBaserunning: true,
    },
    swingTiming: { PERFECT: 90, GOOD: 180, CONTACT: 300 },
    // Flags flip to true as each Backyard-style mechanic lands.
    features: {
      pitchSelection: true,
      battingCursor: true,
      manualBaserunning: true,
      errors: true,
      steals: true,
      juice: true,
    },
  },
};

/** Character-animation timing/feel. */
export const ANIM = {
  SWING_MS: 120, // how fast the bat whips through the swing
  WINDUP_MS: 380, // pitcher lean-back before the release (the "here it comes" telegraph)
  RUN_BOB: 7, // pixels a runner bounces while running
  IDLE_BOB: 5, // pixels the idle "breathing" bob rises
  RUN_FRAME_MS: 110, // run-cycle frame swap (run1 <-> run2 textures)
  // Schoolyard (title + draft) choreography.
  AMBIENT_HOP_EVERY_MS: 2600, // a random waiting kid hops ("pick me!") this often
  CUTSCENE_ZOOM: 2.0, // door close-up zoom while the bell rings
  CUTSCENE_ZOOM_HOLD_MS: 700, // how long the camera lingers on the doors
  CUTSCENE_ZOOMOUT_MS: 1100, // camera pull-back from the doors to the full yard
  CPU_SCAN_HOP_MS: 170, // CPU "?" spotlight hop while it pretends to decide
  CHEER_WAVE_STAGGER_MS: 80, // delay between kids joining the cheer wave
  AUTO_PICK_STEP_MS: 260, // delay between successive AUTO-draft picks launching
  AUTO_PICK_RUN_SPEED: 3, // walk-speed multiplier while auto-drafting (kids sprint)
};

/**
 * Recess stream-out crowd sim (systems/crowd.ts, stepped from
 * SchoolyardScene.update). Movement/separation knobs are sim-side;
 * the *_HOP/_BOB knobs are render-side flourish only.
 */
export const CROWD = {
  STAGGER_MS: 70, // nominal delay between door launches
  STAGGER_JITTER_MS: 30, // ± jitter on each kid's launch time
  DOOR_CLEAR_R: 20, // door mouth must be this clear before the next kid launches
  LANE_SPREAD: 14, // ± exit-lane x offset at the door
  SPEED: 0.27, // base run speed, px/ms
  SPEED_JITTER: 0.25, // ± fraction of SPEED per kid
  RADIUS: 15, // full-size separation radius (px); scales down near the door
  SEP_ITERATIONS: 3, // positional-relaxation passes per tick
  ARRIVE_R: 5, // arrival snap distance
  GAP_MARGIN: 14, // keep-off distance from the wall-gap posts
  STAIR_HALF_W: 38, // x clamp around the door while on the steps
  MAX_DT_MS: 50, // per-tick dt clamp (tab refocus / frame hitches)
  MAX_RUN_MS: 6000, // no-soft-lock guard: force-settle any kid running longer
  STAIR_HOP_H: 6, // render-side hop amplitude on the steps
  RUN_BOB_H: 4, // render-side bob amplitude crossing the yard
  RUN_BOB_HZ: 7, // render-side bob frequency
};
