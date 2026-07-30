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
export const PITCH_TRAVEL_MS = 1600;

/**
 * Swing timing windows, in ms of error from the ideal contact moment.
 * error < PERFECT -> Perfect; < GOOD -> Good; < CONTACT -> Weak; else -> Miss.
 * Widen these to make the game easier (younger kids), tighten to make it harder.
 */
/**
 * Swing timing windows (ms of error from the ball's arrival). KID + TEE read
 * these; CLASSIC overrides via MODES.main.swingTiming.
 *
 * DERIVED, NOT MEASURED, and it cannot be otherwise: a timing window is an
 * internal tolerance with no on-screen representation, so no amount of BB2001
 * footage can reveal theirs. What they must track is the FLIGHT, which is
 * measured (pace.pitchCorridor) -- a window is only meaningful as a fraction of
 * the pitch it forgives.
 *
 * Set at ~24% of the flight they judge: CONTACT 384 against kid's 1600ms.
 * CLASSIC runs WIDER (488 / 1227ms = 40%) on purpose — there the batting
 * cursor is the skill, so timing is the more forgiving half.
 * A window that approaches the flight time means a tap at the instant of release
 * still connects and timing stops being a skill; one far below human jitter
 * (~50-100ms) means it is a coin flip. 35% sits between those.
 *
 * These were 30/63/111 until 2026-07-26, scaled by 0.371 to chase a pitch
 * corridor that turned out to be ~5x too fast -- so they inherited that error
 * and moved back up with it. First dial to reach for if batting plays wrong.
 */
export const TIMING = {
  PERFECT: 104,
  GOOD: 218,
  CONTACT: 384,
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
export const CPU_PITCH_TRAVEL_MS = 1250;

/**
 * The CLASSIC pitch corridor — Backyard-measured against a real clock. A BB2001
 * HEAT flight is ~1230ms (pace.pitchCorridor); the older "~250ms to ~700ms"
 * figures in docs/research/backyard-2001-video-notes.md are SUPERSEDED — they
 * timed only the tail of the flight. This block lands a kid-fair
 * version of that band, and (like BB) scales flight speed with the pitcher's
 * arm: drafting a good arm makes pitches genuinely faster, and the fatigue
 * sag makes tired arms lob. KID MODE NEVER READS THIS BLOCK — its pitches
 * keep PITCH_TRAVEL_MS / CPU_PITCH_TRAVEL_MS above (systems/mode.ts
 * getPitchBaseMs is the one resolver).
 */
export const PITCH_SPEED = {
  /** CLASSIC base travel (ms): human batting / human pitching halves. */
  // MEASURED AGAINST A REAL CLOCK (pace.pitchCorridor, 2026-07-26). A HEAT pitch
  // in BB2001, read frame-by-frame against a millisecond stopwatch captured in
  // the SAME frame as the game: release 12:58.87 -> plate 13:00.10, a flight of
  // **1230ms**. 1350 / fastball speedMult 1.1 = 1227ms at an average arm.
  //
  // That is ~5x slower than the 297 shipped before. Every earlier reading -- BB
  // 270ms, the YouTube 250ms, and two of our own at 180-200ms -- made the SAME
  // mistake: BB's ball is ~5px and is lost in the grass for the first two-thirds
  // of its flight, so "release" was marked at the first frame the ball could be
  // SPOTTED, which is late by construction. Magnify >=2x before judging any
  // frame; that single habit is the whole difference (pace.trackerLessons).
  //
  // n=1 at this rigour, corroborated by session2 (>=750ms, a lower bound off the
  // target-shadow onset). Filed as partialReading -- NOT conformed.
  MAIN_BASE_MS: 1350,
  MAIN_CPU_BASE_MS: 1180,
  /**
   * Arm term: travel × clamp(BASE − PER_STAT × pitching), so a better arm
   * throws genuinely faster. At MAIN_BASE_MS 1350 that is stat 10 → 0.75
   * (fastball 920ms) and stat 1 → 1.20 (fastball 1473ms).
   * Clamped so a content typo can't make a pitch untimeable.
   *
   * These ms figures are DERIVED — restate them whenever MAIN_BASE_MS moves.
   * (They read "≈ 545ms / ≈ 875ms" until 2026-07-25, stale by 2.7x, which made
   * the config look as though something downstream were scaling the speed.)
   */
  ARM_MULT: { BASE: 1.25, PER_STAT: 0.05, MIN: 0.7, MAX: 1.25 },
  /**
   * Render-only "rainbow": pitches slower than FROM_MS arc visibly (px of
   * lob height per ms over the threshold, capped). BB's speed range doubles
   * as a SHAPE range — fast pitches are lasers, slow ones are lobs you track
   * the whole way. Never touches swing-timing math or the sim.
   */
  // FROM_MS moves WITH the corridor or the cue dies silently: set too low every
  // pitch arcs, too high none do. At 1430 the fastball (1227ms) stays flat and
  // off-speed (changeup ~1875ms) arcs -- BB's laser-vs-lob split.
  LOB: { FROM_MS: 1430, PER_MS: 0.12, MAX_PX: 110 },
};

/**
 * Between-moments pacing (ms). Every "wait before the next thing" beat lives
 * HERE, not hardcoded in GameScene delayedCalls. Invariant: a banner's hold
 * time must be <= the FLOW beat that follows it, so calls are always readable
 * before the next pitch fires.
 */
export const FLOW = {
  /** Ball/strike/foul settled -> next pitch (player batting half).
   *  MEASURED (pace.betweenPitch): BB takes 2550ms from the ball arriving to the
   *  pitcher having it back (n=3). Ours was already correctly PROPORTIONED to
   *  the anchor (0.591 vs BB's 0.607) and wrong only in absolute tempo. */
  BETWEEN_PITCH_MS: 2550,
  /** Floor after any at-bat that moved runners (walk/hit fold-in). */
  AFTER_PLAY_MS: 2981,
  /** Extra pad after the baserunning animation finishes. */
  RUN_SETTLE_PAD_MS: 994,
  /** Live play resolved -> next batter steps in. */
  AFTER_LIVE_PLAY_MS: 3179,
  /** New batter announced -> the first pitch (player half). */
  NEW_BATTER_MS: 1490,
  /** CPU batter jogs in -> your pitch turn begins. */
  CPU_NEW_BATTER_MS: 1689,
  /** Between CPU-half pitches. */
  CPU_STEP_MS: 2186,
  /** Half-start banner -> first batter. */
  HALF_START_MS: 2782,
  /** Ball arrival -> the ump's call pops (the BB2001-measured beat). The
   *  call's total life (this + its internal hold + fade, Scoreboard.umpCall)
   *  must stay ≤ the shortest beat that follows it (CPU_STEP_MS). */
  UMP_CALL_DELAY_MS: 200,
  /** Default flashAnnounce hold. */
  BANNER_HOLD_MS: 2186,
  /** Big-moment banners: STRIKEOUT / WALK / runs scored / walk-off. */
  BIG_BANNER_HOLD_MS: 3179,
  /**
   * THE MOUND IDLE CLOCK. You are pitching and dithering over the card menu;
   * this is how long before the game picks for you (fastball, down the middle)
   * so play cannot stall. BB's clock is on this side too -- long enough that
   * normal play never reaches it (pace.pitchCadence).
   *
   * ⚠️ Load-bearing for two-device play: launchPitchMain's netWaitFor('pitchPlan')
   * relies on this firing to guarantee liveness, and the whole mound turn
   * (this + PITCH_METER_MS + PITCH_AUTO_THROW_MS) must stay under
   * NET.ACTION_TIMEOUT_MS or the remote gives up first. A test asserts it.
   */
  PITCH_CLOCK_MS: 10000,
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

export type PitchKind =
  | 'fastball'
  | 'changeup'
  | 'curve'
  | 'screwball'
  | 'crazy'
  | 'fireball'
  | 'freezeball';

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
  fastball: { speedMult: 1.1, breakX: 0, breakY: 0, wobble: 0, deception: 0.12, label: '💨 FAST' },
  changeup: { speedMult: 0.72, breakX: 0, breakY: 16, wobble: 0, deception: 0.5, label: '🐢 SLOW' },
  curve: { speedMult: 0.92, breakX: -40, breakY: 16, wobble: 0, deception: 0.35, label: '🌙 CURVE' },
  screwball: { speedMult: 0.95, breakX: 38, breakY: 8, wobble: 0, deception: 0.35, label: '🌀 SCREW' },
  // The juice-meter specials (systems/juice.ts SpendKinds; never in the CPU's
  // base rotation — availablePitches keeps them out of chooseCpuPitch's draw).
  crazy: { speedMult: 0.88, breakX: 52, breakY: -10, wobble: 26, deception: 0.75, label: '⚡ CRAZY' },
  fireball: { speedMult: 1.35, breakX: 0, breakY: -6, wobble: 0, deception: 0.55, label: '🔥 FIREBALL' },
  // Freezeball's terror is the mid-flight FREEZE (PITCH_FX.FREEZE time-remap),
  // not the break: a slow floater that stops dead, hangs, then finishes.
  freezeball: { speedMult: 0.55, breakX: 0, breakY: 20, wobble: 0, deception: 0.85, label: '🧊 FREEZE' },
};

/**
 * Special-pitch flight dressing (render-only, scenes/ui/PitchFx.ts — RNG-FREE
 * so goldlog/net stay deterministic) + the freezeball time-remap, which IS
 * gameplay-visible: flightProgress (systems/pitchkind.ts) holds the ball
 * spatially frozen for t ∈ [HOLD_START, HOLD_END] of the flight and still
 * arrives exactly at travelMs, so swing timing math never changes.
 */
export const PITCH_FX = {
  /** Trail-particle spawn cadence for the per-kind flight effects. */
  TRAIL_EVERY_MS: 40,
  FREEZE: { HOLD_START: 0.45, HOLD_END: 0.75 },
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
  BATTER: { X: 300, Y: 576, H: 318 }, // Backyard-sized: ~45% of playfield height
  /** The fielding team's catcher, crouched and cropped by the scoreboard strip
   *  (head + shoulders in frame; feet well below it). */
  CATCHER: { X: 556, Y: 648, H: 230 },
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
  /** A TAKEN pitch's ball rests at its crossing spot with a grey aura until
   *  the next windup — BB2001's lingering pitch-location feedback. */
  REST_BALL: { R: 8, AURA_R: 15, AURA_ALPHA: 0.28 },
  /** The rig pitcher's between-pitch idle: tossing the ball up and catching
   *  it (BB2001's mound idle). Render-only, stops on windup. */
  TOSS: { AMP: 24, MS: 640 },
  /**
   * The between-pitch ceremony: the ball rests where it crossed, the catcher
   * throws it back, the pitcher gets set. BB plays this every pitch and lets
   * you skip it.
   *
   * These do NOT add time. pace.betweenPitch measured BB's "ball arrives ->
   * pitcher has it back" at 2550ms and FLOW.BETWEEN_PITCH_MS already waits that
   * long -- this fills the window instead of leaving it empty. A test asserts
   * HOLD + RETURN + SET stays inside FLOW.BETWEEN_PITCH_MS.
   */
  CEREMONY: { HOLD_MS: 600, RETURN_MS: 800, SET_MS: 400 },
  /** Inside-pitch dodge (BB2001: the batter leans out of the way mid-flight).
   *  Fires when the pitch will cross ≥ X_BEYOND px past the zone's batter-side
   *  edge, at AT_FRAC of the flight. Deterministic off plan.actual — no rng. */
  DODGE: { X_BEYOND: 22, AT_FRAC: 0.55, HOLD_MS: 500 },
  /** The white-flash punch on the hard cut between views. */
  CUT_FLASH_MS: 60,
  /** The contact frame: how long the rig holds at bat-meets-ball before the
   *  cut to the wide field. Pure presentation — the live sim starts after it. */
  HIT_PAUSE_MS: 90,
  /** Pitch-ball scale ramp — it grows as it flies at the camera. */
  BALL: { SCALE_FROM: 0.5, SCALE_TO: 2.2 },
  /** Kid-mode timing-ring radius on the frontal zone. */
  RING_R: 40,
};

/**
 * Screen-anchored HUD geometry (UI camera) — the whole layout in one place,
 * Backyard-style: the scoreboard is a bottom STRIP (team rows + at-bat count +
 * mini-diamond), action cards stack on the right edge, juice tops the left.
 * Every screen-anchored element claims its lane here so overlaps are a config
 * review, not a scavenger hunt.
 */
export const HUD = {
  /** The bottom scoreboard strip (both modes). Rig ground furniture (plate,
   *  boxes, batter feet) sits ABOVE STRIP.TOP — see BattingView.drawBackdrop. */
  STRIP: { TOP: 568, CY: 604, W: 952, H: 64 },
  /** Right-edge pitch/swing card stacks (CLASSIC only, EdgeCards.ts). */
  CARDS: { X: 864, W: 168, H: 52, GAP: 60, TOP_Y: 148 },
  /** ⚡ juice meter, top-left. */
  JUICE: { ICON_X: 22, ICON_Y: 36, BAR_X: 48, BAR_Y: 28, BAR_W: 128, BAR_H: 16, READY_X: 110, READY_Y: 60 },
  /** Spend/relief/power column, bottom-left, above the strip. */
  SPEND_COL: { X: 116, ROW1_Y: 528, ROW_GAP: 46 },
  /** 💨 STEAL! chips, bottom-right above the strip's mini-diamond. */
  STEAL: { X: 848, STEAL2_Y: 530, STEAL3_Y: 494, GOING_Y: 470 },
  /** Announcer banner band, top-center. */
  ANNOUNCER: { CY: 72, W: 640, H: 62 },
  /** Corner buttons (top-right, clear of the card stacks below them). */
  CORNER: { MUTE_X: 930, PAUSE_X: 882, Y: 34 },
};

/**
 * Render-side effect knobs for the live play (GameScene). All presentation —
 * nothing here feeds the sim.
 */
export const FX = {
  /** Streak dots behind an airborne hit ball. */
  HIT_TRAIL_EVERY_MS: 40, // spawn cadence while the ball flies
  HIT_TRAIL_LIFE_MS: 240, // how long each dot lingers
  HIT_TRAIL_MIN_H: 0.1, // no trail below this arc height (grounders stay clean)
  /** BB2001-style motion streak behind the stealing runner's dash. */
  STEAL_TRAIL: { EVERY_MS: 26, R: 8, LIFE_MS: 300 },
  /** The chalk ring that marks where a fly ball lands. */
  LAND_RING_MS: 550,
  /** 📼 instant replay (great live plays re-run in slow motion). */
  REPLAY: {
    SPEED: 0.55, // playback rate vs real time
    MAX_FRAMES: 1320, // snapshot cap (~22s at 60fps — covers MAX_PLAY_MS's 21862)
  },
  /** The home-run show (scenes/ui/Spectacle.ts). */
  HOMER: {
    FLIGHT_MS: 800, // gold ball's flight from plate to over-the-fence
    TRAIL_EVERY_MS: 36, // star-trail spawn cadence behind it
    CONFETTI: 70, // confetti pieces
    FLASHBULBS: 14, // crowd camera flashes
  },
  /** Backyard-style live-play steering read (scenes/ui/LivePlayView.ts):
   *  the glowing capsule from YOUR fielder to the ball, the landing-preview
   *  ring while a hit hangs in the air, and the chevron over the chaser. */
  LIVE_MARKER: {
    CAPSULE_W: 9, // px at the plate; depth-scaled at the capsule midpoint
    CAPSULE_ALPHA: 0.5,
    CAPSULE_SEGMENTS: 3, // alpha-stepped glow falloff toward the ball end
    RING_R: 34, // landing-preview ring radius (big Backyard-X read)
    RING_PULSE_SCALE: 1.35,
    RING_PULSE_MS: 480,
    CHEVRON_H: 14, // gold arrow over the controlled fielder
    /** BB2001-style name bubble trailing the controlled fielder: per-frame
     *  lerp fraction (the lag IS the charm) + offset below the kid's feet. */
    NAME: { LAG: 0.16, DY: 30 },
    CHEVRON_BOB: 5,
  },
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

/**
 * Draft scouting UI (the Schoolyard wall). Two tiers, Backyard-style:
 * HOVER a kid → a small floating name + mini-equalizer tag rides above them;
 * TAP a kid → the full baseball card (portrait, dot ratings, ability chip,
 * PICK). Layout/feel knobs only — the readouts themselves live in
 * ui/PlayerCard.ts + ui/statbars.ts.
 */
export const DRAFT = {
  HOVER_HIDE_MS: 90, // grace before the hover tag hides — kills slide-across strobe
  TAG_W: 176, // hover-tag size
  TAG_H: 78,
  TAG_GAP: 14, // gap between the tag's pointer and the kid's head
  CARD_W: 664, // baseball-card size
  CARD_H: 250,
  CARD_Y: 502, // card center y
  DOT_R: 6, // skill-rating dot radius
  DOT_PITCH: 22, // spacing between dots in a row
  DOT_ROW: 26, // vertical pitch between rating rows
};

/** How long a runner takes to jog ONE base (ms). Post-hit pacing derives from this. */
export const RUNNER_TWEEN_MS = 894;

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
  /** The two kid commentators (a milk crate behind the backstop). Pip stays
   *  un-gendered (voiceIdx 0 on the mixed list = the best child voice). */
  COMMENTATORS: {
    A: { pitch: 1.35, rate: 1.08, voiceIdx: 0 }, // Pip — hyped little kid
    B: { pitch: 1.05, rate: 0.92, voiceIdx: 1, voiceGender: 'boy' as const }, // Rocco — deadpan older kid
  },
  /** Chance a big call (priority 2) becomes a two-line A/B exchange. */
  EXCHANGE_CHANCE: 0.45,
  /**
   * Curated voice ranking (pure rankVoices in systems/voices.ts). The browser's
   * voice inventory is scored by childlike suitability so speakers land on
   * genuinely younger/less-robotic base voices instead of the default adult one.
   */
  PICK: {
    /** Name-pattern tiers, best first. \bana\b = Edge's "Microsoft Ana Online
     *  (Natural)", a real child voice; Junior is macOS's boy voice. */
    TIERS: [
      /child|kid|junior|\bana\b/i,
      /online.*natural|neural/i, // Edge neural voices
      /^google/i, // Chrome's Google voices
      /samantha|karen|moira|tessa|zira|aria|jenny/i, // younger-leaning system voices
    ],
    /** Small score bonus for these langs (kids' game targets US/UK English). */
    PREFERRED_LANGS: ['en-US', 'en_US', 'en-GB', 'en_GB'],
    /** Deep/novelty voices that must never speak for a kid. */
    AVOID:
      /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|grandma|grandpa|ralph|fred|rocko\b/i,
    /** Curated list size — voiceIdx spreads speakers across these. */
    TOP_N: 4,
    /** Name-based gender classification (SpeechSynthesisVoice has no gender
     *  API). GIRL is tested first; a name matching neither stays mixed-list-only
     *  (e.g. "Google US English"). AVOID runs first, so Fred/Ralph never get here. */
    GENDER: {
      GIRL: /samantha|karen|moira|tessa|fiona|victoria|kate\b|susan|allison|ava\b|zira|aria|jenny|michelle|\bana\b|sonia|libby|natasha|zoe|emma|olivia|catherine|female|woman|girl/i,
      BOY: /daniel|junior|david|mark\b|alex\b|george|oliver|thomas|arthur|\bguy\b|ryan|william|james|christopher|eric\b|aaron|nathan|\bmale\b|\bman\b|boy/i,
    },
  },
  /** Per-utterance humanizing jitter (±), applied in audio.ts speakNow. */
  JITTER: { PITCH: 0.05, RATE: 0.04 },
  /** Derived per-character voices: hash(id) picks within these ranges. */
  KID: {
    PITCH_MIN: 1.05,
    PITCH_MAX: 1.45,
    RATE_MIN: 0.9,
    RATE_MAX: 1.12,
    /** Gender pitch bands (inside PITCH_MIN..MAX): the hash roll lands in the
     *  kid's band and the expression nudge clamps to it. Bands overlap so it
     *  never sounds cartoonishly binary — and they carry the differentiation
     *  when a browser has no gender-marked voices (empty gendered sublist). */
    GENDER_PITCH: {
      boy: { MIN: 1.05, MAX: 1.28 },
      girl: { MIN: 1.2, MAX: 1.45 },
    },
    /** Expression nudges (added after the hash roll, then clamped to the ranges). */
    NUDGE: {
      happy: { pitch: 0, rate: 0 },
      grin: { pitch: 0.04, rate: 0.02 },
      cool: { pitch: -0.12, rate: -0.05 },
      determined: { pitch: -0.06, rate: 0 },
      goofy: { pitch: 0.1, rate: 0.06 },
      surprised: { pitch: 0.1, rate: 0.04 },
      // Reaction expressions — never a kid's RESTING face in ROSTER, but the
      // Expression type is total so the voice table covers them too.
      upset: { pitch: -0.08, rate: -0.06 },
      nervous: { pitch: 0.06, rate: 0.08 },
      celebrate: { pitch: 0.12, rate: 0.06 },
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
    /** Air time ranges (ms) — deeper ball = longer hang within the range.
     *  FLY_HANG_MS is MEASURED (pace.flyHang): BB's flies hang 2875-5075ms
     *  (n=4, read off BB's landing-preview disc). Note this went UP, not down:
     *  the long-assumed "our flies hang too long" defect was really "our run is
     *  too fast", and fixing RUNNER_SPEED alone would have left flies too SHORT.
     *  LINER_HANG_MS is NOT measured — derived by preserving its old ratio to
     *  the fly range (0.325 / 0.310). */
    LINER_HANG_MS: { MIN: 934, MAX: 1573 },
    FLY_HANG_MS: { MIN: 2875, MAX: 5075 },
    /** Initial grounder roll speed (px/s); decelerates to stop at the settle
     *  point. NOT measured — scaled 1/1.987 with RUNNER_SPEED so a grounder
     *  still beats/loses to a runner the way it used to. */
    GROUNDER_SPEED: { MIN: 81, MAX: 121 },
  },
  /**
   * What a landed ball does next (systems/liveplay.ts). Flies and liners
   * take diminishing hops, then roll out; anything hopping or rolling that
   * reaches the wall caroms back into play. Fully deterministic — no rng —
   * so kid-mode sims stay byte-identical.
   */
  BOUNCE: {
    /** Diminishing hops after a fly/liner lands. */
    HOPS: 2,
    /** Speed / height / duration retained per hop. */
    RESTITUTION: 0.5,
    /** Landing ground-speed fraction carried into the first hop, per type. */
    KEEP: { fly: 0.35, liner: 0.5 },
    /** First hop duration (ms) and height cue (0..1, renderer scale).
     *  Duration scaled 1.987x with the pace retune; the height cue is a
     *  renderer fraction and does not scale. */
    FIRST_HOP_MS: 676,
    FIRST_HOP_H: 0.45,
    /** Post-hop speed (px/s) → decel-roll settle distance (v * this, px).
     *  SECONDS, so it scales 1.987x WITH the pace retune: ball speeds halved,
     *  and leaving this alone would have halved every settle distance and moved
     *  where balls come to rest. Geometry is unchanged; only time is. */
    ROLLOUT_S: 0.954,
    /** Carom: speed retained bouncing off the fence. */
    WALL_REST: 0.55,
    /** A hopping ball is grabbable only below this height (short-hop scoop). */
    PICKUP_MAX_H: 0.4,
  },
  /**
   * Fielder speed as a multiple of RUNNER_SPEED. Fielders and baserunners are
   * THE SAME KIDS, so this is 1.0 — a kid does not get faster by putting a glove
   * on. DERIVED, not measured (see scripts/measures.json `defense.fielderSpeed`
   * for what would close it); conformance.test.js pins the relationship, because
   * an object literal can't express it in source.
   *
   * This constant exists because its absence went unnoticed through the whole
   * history of the fielding race. FIELDER_SPEED sat at 210 through FIVE
   * consecutive runner slowdowns (175 -> 150 -> 117 -> 106 -> 85), so the ratio
   * crept 1.20x -> 2.47x; the 2026-07-24 pace retune then
   * scaled BOTH by 1/1.987 and faithfully preserved it. Every time the defense
   * couldn't get outs the fix was "slow the runners", never "check the fielder" —
   * and nothing caught it because this was the ONE pace constant with no record
   * and no pin. Never set FIELDER_SPEED without setting this too.
   */
  FIELDER_RUN_RATIO: 1.0,
  /** Player-steered fielder speed (px/s) = RUNNER_SPEED * FIELDER_RUN_RATIO. */
  FIELDER_SPEED: 42.8,
  /**
   * Fielding assist (mode-tied: kid = auto, main = magnet). These are the BASE
   * values; CLASSIC scales all three per difficulty via
   * `DIFFICULTY_TIERS[d].fielding` (see there for why, and for the effective
   * numbers). Read them off `LiveParams`, never straight from here — the sim
   * must see the tier-scaled values.
   */
  ASSIST: {
    /** Magnet: how much steering is bent toward the ball (0 = pure manual). */
    MAGNET_BLEND: 0.5,
    /** A pointer that hasn't moved (and isn't down) this long stops steering. */
    POINTER_STALE_MS: 300,
    /** CLASSIC magnet: with the ball loose and nobody steering for this long,
     *  the chaser ambles after it by themselves. Kid mode's 'auto' assist has
     *  always done this; without it, lifting the pointer in CLASSIC froze the
     *  fielder and the play ran out the clock. */
    IDLE_TAKEOVER_MS: 1200,
    /** ...at this fraction of full speed. Deliberately slower than steering,
     *  so letting go is never the better way to play. */
    IDLE_SPEED_MULT: 0.6,
  },
  /**
   * Who chases a loose ball (systems/fielding.ts `electChaser`). A ball in the
   * AIR goes to whoever is nearest its landing spot. A ball on the GROUND goes
   * to whoever can CUT IT OFF soonest — but only among fielders whose LEASH
   * covers where it will finally settle.
   *
   * The leash is the whole trick. Ranking purely by "who reaches the ball
   * first" hands every grounder to the pitcher: a grounder starts at HOME and
   * rolls outward, so P (112px from the plate) is nearest its early path at
   * every spray angle. Gating on the SETTLE point instead encodes what a real
   * defense does — the pitcher fields balls hit at him, he does not chase one
   * into right field.
   */
  CHASE: {
    /** Path samples used to find the cut-off point. */
    SAMPLES: 24,
    /** Never predict further ahead than this (sanity cap, ms). */
    HORIZON_MS: 8000,
    /** A fielder still "cuts it off" arriving this much AFTER the ball.
     *  First lever if the defense reads too good: lower = fewer cut-offs. */
    CUTOFF_GRACE_MS: 120,
    /**
     * How much sooner another kid must get the ball before he takes it off the
     * fielder whose ZONE it settles in. Without this a third baseman charges
     * across in front of the shortstop for a ball rolling right at him — true
     * on the clock, wrong on a ball field.
     *
     * Measured window is 257-523ms: below 257 the 3B-poaches-SS case comes
     * back, above 523 the second baseman stops cutting off the grounder that
     * started all this and it dribbles out to right. 400 sits mid-window.
     */
    CUT_AHEAD_MS: 400,
    /**
     * Max distance (px) from a fielder's POST to the ball's SETTLE point for
     * them to be a candidate. P/C = 90 separates a real comebacker (dies
     * 49-80px from the mound) from a ball that merely rolls past it (settles
     * 122px+ away). Corners hold their bags, the middle has range, the
     * outfield backs up everything.
     */
    LEASH: { P: 90, C: 90, '1B': 170, '3B': 170, '2B': 250, SS: 250, LF: 9999, CF: 9999, RF: 9999 },
    /** Hysteresis: a challenger must beat the incumbent by this much... */
    SWITCH_MARGIN_MS: 350,
    /** ...no two handovers closer together than this... */
    SWITCH_COOLDOWN_MS: 500,
    /** ...and a chaser already this close to the ball keeps the job, full
     *  stop. This is what protects the kid the player is steering. */
    KEEP_RADIUS: 60,
    /** A throw's receiver is the base's cover fielder only if this near the
     *  bag — otherwise the nearest kid takes it (no cross-field teleports). */
    COVER_MAX_PX: 140,
  },
  /** How close (px) a fielder must be to grab the ball. */
  CATCH_RADIUS: 34,
  PICKUP_RADIUS: 28,
  /** An airborne ball is catchable in this last fraction of its flight. */
  CATCHABLE_TAIL: 0.4,
  /** Hold-to-charge time (ms) for a full-power throw. Short, Backyard-style:
   *  once you've fielded it, the out is about picking the base, not the charge. */
  THROW_METER_MS: 450,
  /** Throw flight speed (px/s) at zero / full charge.
   *  NOT MEASURED — scaled 1/1.987 with RUNNER_SPEED. defense.throwSpeed is
   *  still awaiting-measurement: the clean target (catcher→2B on a steal) turned
   *  out not to exist in the capture, because both steals were uncontested. */
  THROW_SPEED_MIN: 277,
  THROW_SPEED_MAX: 413,
  /** Idle-kid rescue: sim throws by itself after holding the ball this long.
   *  NOT measured — scaled with RUNNER_SPEED. */
  AUTO_THROW_MS: 5167,
  /**
   * ★ THE CUTOFF RELAY (CPU defense, CLASSIC only) — what makes a ball that
   * reaches the outfield a HIT instead of an out at first.
   *
   * OBSERVED IN BB2001, not inferred (bb01-capture-session2, park venue):
   * an infield grounder is fielded and thrown to first for the out (~4.5s
   * play), but a ball that lands on the outfield grass is relayed
   * outfielder -> cutoff man near second -> pitcher while the batter runs to
   * THIRD. 17.3s play, OUTS never changes. BB never ATTEMPTS a throw to first
   * from the outfield — it does not try and lose the race, it does not try.
   *
   * Why a relay and not just a slower throw: throw DISTANCE provably cannot
   * discriminate on our field. A coin-flip on a routine grounder would need an
   * 806px throw to first; the longest that exists anywhere is 418px, and the
   * whole field's distance spread (256-1012ms) is smaller than the margin we
   * are trying to erase. See measures.json defense.relay.
   */
  RELAY: {
    /**
     * Secure the ball at or beyond this depth (x the basepath leg) and the CPU
     * relays instead of throwing at a bag. Bracketed by the SECOND-BASE BAG
     * (1.280 — an infielder standing on second still has a play) and the CF
     * POST (1.492 — a true outfielder on his own spot must relay). 1.39 is the
     * midpoint, ~20px of margin either side. Measured from the CARRIER, so an
     * infielder who chased into the gap relays too — he has no play either.
     */
    DEPTH_LEGS: 1.39,
    /** The cutoff sets up at SECOND-BASE depth on the ball's own line — where
     *  BB's cutoff man stands. Derived: dist(HOME, SECOND) / basepath leg. */
    CUTOFF_DEPTH_LEGS: 1.2804,
    /** The infinite-relay guard: OF -> cutoff -> pitcher, then stop. */
    MAX_LEGS: 2,
    /** The cutoff man counts as in position within this radius. */
    SET_RADIUS: 24,
    /** ...but the outfielder never waits longer than this for him. A HARD cap,
     *  not a hope: without it a fumbling cutoff hangs the play to MAX_PLAY_MS. */
    SET_WAIT_MAX_MS: 1500,
    /**
     * Extra hold per relay leg on top of cpuThrowDelayMs. NOT MEASURED — 0.
     *
     * At 0, a gap ball is a reliable DOUBLE and a ball to the WALL is a triple
     * (the outfielder's longer chase pushes delivery past the runner's next
     * checkpoint) — which is exactly the play filmed in BB. Forcing triples on
     * routine gap balls too would need ~1963ms here, and inventing that is the
     * category of unmeasured compensation this project keeps unwinding.
     */
    GATHER_MS: 0,
  },
  /** Runner speed (px/s) at speed stat 5; each stat point is ±6%.
   *  MEASURED (pace.homeToFirst): BB2001 runs home→1B in 4200ms (n=3), and
   *  179.63px / 4.200s = 42.8px/s. We ran this leg in HALF BB's time until
   *  2026-07-24. THIS IS THE ANCHOR — every other pace constant below is either
   *  measured against it or scaled by the same 1.987x factor, so changing it
   *  alone will desynchronise the rest. See scripts/measures.json.
   *  FIELDER_SPEED rides this directly via FIELDER_RUN_RATIO — move one, move
   *  both, or the fielding race silently drifts (it did, for five slowdowns). */
  RUNNER_SPEED: 42.8,
  /** Distance ball→next base above which a CPU runner risks the extra base. */
  CPU_RUNNER_GREED_DIST: 180,
  /** A loose ball nobody has picked up for this long → CPU runners just go. */
  CPU_RUNNER_PATIENCE_MS: 2981,
  /** Hard cap: any live play resolves by now (stragglers settle safe behind).
   *  NOT measured — scaled with RUNNER_SPEED. Sized for ~4.2s legs and fly
   *  hangs up to ~5.1s, so it must stay well clear of both. */
  MAX_PLAY_MS: 21862,
  /** The dive verb (CLASSIC defense): tap mid-chase for a reach burst. */
  DIVE: {
    REACH_BONUS: 30, // px added to catch/pickup reach during the window
    WINDOW_MS: 340, // how long the lunge lasts
    WHIFF_MS: 800, // face-down-in-the-grass freeze after an empty dive
    TAP_MAX_MS: 180, // press shorter than this = dive tap; longer = steering hold
  },
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
  /** What each spend costs (systems/juice.ts `SpendKind`). */
  COSTS: {
    powerSwing: 55,
    crazyPitch: 55,
    fireball: 60, // 🔥 blazing special pitch — extra fast, flame trail
    freezeball: 60, // 🧊 special pitch that freezes mid-flight, wrecking timing
    turboLegs: 40, // 💨 next offensive live play: everyone runs faster
    goldenGlove: 40, // 🧤 next defensive live play: sure hands + strong magnet
    rallyCap: 70, // 🧢 rest of the batting half: wider swing windows
  },
  /** 💨 turboLegs: runner-speed multiplier for the armed play. */
  TURBO_SPEED_MULT: 1.35,
  /** 🧤 goldenGlove: magnet-assist blend + catch-reach bonus for the armed play. */
  GLOVE_BLEND: 0.85,
  GLOVE_REACH_BONUS: 8,
  /** 🧢 rallyCap: extra swing-window forgiveness (ms) while it's on. */
  RALLY_FORGIVE_MS: 190,
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

/** Pass-and-play 2P (one device, the batting player holds it). */
export const PASSPLAY = {
  /** Ignore taps on the handoff splash for this long (no accidental blow-through). */
  SPLASH_GUARD_MS: 600,
};

/** Two-device play over WebRTC (src/net/*; PeerJS free cloud broker). */
export const NET = {
  /** Bumped on any wire-format change; hello handshake rejects mismatches. */
  PROTOCOL_VERSION: 6, // v6: the LiveEvent union gained {t:'relay'} (the cutoff relay)
  /** liveFrame + liveInput pointer stream rate (full ReplayFrames, no deltas). */
  FRAME_HZ: 20,
  /** "Looking for your friend… 🔍" window before the no-blame GOOD GAME. */
  RECONNECT_MS: 30000,
  /** Keepalive send cadence — ridden on the Phaser clock (pumpable in tests). */
  HEARTBEAT_MS: 2000,
  /** No traffic for this long → treat the channel as softly disconnected. */
  STALE_MS: 6000,
  /** A remote pitch/swing never arrives → CPU fallback + soft disconnect. */
  ACTION_TIMEOUT_MS: 15000,
  /** Unacked draftPick retransmit cadence — Phaser clock, pumpable. */
  DRAFT_RESEND_MS: 1500,
  /** Room-code alphabet: 16 emoji = one hex digit each (PeerJS ids must be
   *  alphanumeric — the wire id is 'recess-' + hex; emoji are UI-only). */
  CODE_EMOJI: ['🐶', '🐱', '🦊', '🐸', '🐢', '🦄', '🐝', '🐠', '🍎', '🍌', '🍕', '🌟', '⚽', '🎈', '🚗', '🌈'],
  /** Emoji per room code. */
  CODE_LEN: 4,
};

/** Recess Week — the 5-game season (systems/season.ts). */
export const SEASON = {
  GAMES: 5, // Monday through Friday
  PENNANT_WINS: 3, // win this many and the pennant is yours
};

/** CPU difficulty ramp (CLASSIC; systems/difficulty.ts). */
export const DIFFICULTY = {
  PER_GAME: 0.34, // ramp level gained per game played
  MAX_LEVEL: 3, // hard cap — a ramp, not a wall
  ARM_PER_LEVEL: 0.7, // CPU pitcher stat bonus per level (tighter pitches)
  CONTACT_PER_LEVEL: 0.7, // CPU batter contact bonus per level
};

/**
 * The player-facing difficulty ladder (BB2001's TEE-BALL / EASY / MEDIUM / HARD)
 * mapped over our two internal feature sets. TEE-BALL and EASY resolve to the
 * forgiving KID feature set (tee-ball additionally sits the ball on a tee — a
 * slow soft lob so timing is trivial); MEDIUM and HARD use the full CLASSIC set,
 * with HARD seeding the CPU ramp a couple levels up front. `GameMode` stays the
 * internal switch — difficulty is the label on top of it. See systems/mode.ts.
 *
 * The tier also varies YOUR DEFENSE, not just the CPU: `fielding` scales the
 * CLASSIC magnet assist, so MEDIUM steers for you noticeably less than it used
 * to and HARD is close to fully manual.
 */
export type DifficultyLevel = 'teeball' | 'easy' | 'medium' | 'hard';

export const DIFFICULTY_TIERS: Record<
  DifficultyLevel,
  {
    mode: GameMode;
    baseRamp: number;
    tee: boolean;
    icon: string;
    label: string;
    /**
     * CLASSIC fielding assist, scaled per tier — multipliers onto `LIVE.ASSIST`,
     * resolved into `LiveParams` by systems/mode.ts. The kid tiers are 1x
     * no-ops: kid mode takes the 'auto' branch and never reads any of these,
     * but the table stays complete so nothing has to special-case a mode.
     *
     * DERIVED, NOT MEASURED. Assist strength has no on-screen representation,
     * so it can never be read off BB2001 footage (same argument as the swing
     * windows — see scripts/measures.json `feel.fieldingAssist`). These are
     * feel dials; tune them by playing, not by conforming to a record.
     *
     * Effective values against the LIVE.ASSIST bases (0.5 / 1200ms / 0.6):
     *   teeball, easy  blend 0.5 (inert)  1200ms  0.6
     *   medium         blend 0.30         1200ms  0.6
     *   hard           blend 0.125        1920ms  0.42
     *
     * Why `idle*` moves with the magnet on HARD: the amble is only fair while
     * it stays worse than steering, and that is a RELATIVE claim. Drop the
     * magnet to 0.125 and a full-speed bad steer no longer beats a 0.6-speed
     * straight line at the landing spot — doing nothing would quietly become
     * the optimal defense. Scaling the takeover later and slower keeps
     * LIVE.ASSIST's "letting go is never the better way to play" true.
     */
    fielding: { magnetMult: number; idleDelayMult: number; idleSpeedMult: number };
  }
> = {
  teeball: {
    mode: 'kid', baseRamp: 0, tee: true, icon: '🏌️', label: 'TEE-BALL',
    fielding: { magnetMult: 1, idleDelayMult: 1, idleSpeedMult: 1 },
  },
  easy: {
    mode: 'kid', baseRamp: 0, tee: false, icon: '🙂', label: 'EASY',
    fielding: { magnetMult: 1, idleDelayMult: 1, idleSpeedMult: 1 },
  },
  medium: {
    mode: 'main', baseRamp: 0, tee: false, icon: '⚾', label: 'MEDIUM',
    fielding: { magnetMult: 0.6, idleDelayMult: 1, idleSpeedMult: 1 },
  },
  hard: {
    mode: 'main', baseRamp: 2, tee: false, icon: '🔥', label: 'HARD',
    fielding: { magnetMult: 0.25, idleDelayMult: 1.6, idleSpeedMult: 0.7 },
  },
};

/** Tee-ball: the pitch is a slow, high soft lob so any timing makes contact. */
export const TEE_PITCH_MS = 2400;

/** Pitcher fatigue (CLASSIC, `features.fatigue`; systems/fatigue.ts). */
export const FATIGUE = {
  DRAIN_PITCH: 0.03, // stamina per ordinary pitch (~33 pitches to empty)
  DRAIN_CRAZY: 0.09, // the crazy pitch costs triple
  TIRED_AT: 0.45, // below this: sweat tell + the stat starts sagging
  MAX_STAT_LOSS: 4, // pitching-stat points lost at empty
  CPU_RELIEF_AT: 0.15, // the CPU calls its own bullpen here
};

/**
 * Pre-pitch swing types (CLASSIC, `features.swingChoice`). NORMAL is absent —
 * it's the unmodified baseline. Applied in systems/atbat.ts.
 */
export const SWING_TYPES = {
  // Deltas move WITH the pitch corridor (PITCH_SPEED): a forgiveness window is
  // only meaningful as a fraction of the flight it forgives. Rescaled 2026-07-26
  // when the corridor was re-measured against a real clock (297 -> 1350).
  /** 🛡 SAFE: choke up — wider timing windows, softer contact. */
  SAFE: { FORGIVE_MS: 76, Q_ADJ: -0.3 },
  /** 💪 BIG: sell out — weak contact becomes a whiff, solid contact is crushed. */
  BIG: { NARROW_MS: 59, Q_ADJ: 0.22, TYPE_BIAS: 0.35 },
  /** 🤏 BUNT: easy to get bat on it; the ball dies in front of the plate. */
  BUNT: { FORGIVE_MS: 104, DIST_CAP: 115, Q_ADJ: -0.5, SPRAY_MIN: 0.34, SPRAY_MAX: 0.66 },
  /** 🤪 CRAZY BUNT (signature card, ability 'crazy_bunt' — BB2001's Tony D.
   *  special): trivially easy contact, but the ball SQUIRTS hard down
   *  whichever line the swing leans toward — a chaos tool, not a sacrifice.
   *  Spray snaps to the extremes (no rng draw — goldlog/net safe). */
  CRAZY_BUNT: { FORGIVE_MS: 128, DIST_CAP: 205, Q_ADJ: -0.15, SPRAY_LO: 0.16, SPRAY_HI: 0.84 },
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
  SAC_WINDOW_MS: 2782,
  /** A kid who just caught a fly needs this long to gather before throwing —
   *  the beat that makes sac flies from third a real race. Scaled with
   *  RUNNER_SPEED (slower legs need a longer beat to keep the race winnable). */
  CATCH_GATHER_MS: 2186,
  /** A runner who just touched a bag holds it this long before the CPU policy
   *  can send them again. `moveRunners` finishes a leg and the policy runs
   *  later in the SAME tick, so without this a runner re-launches with zero
   *  frames on the base. Human sends and tag-up queues are exempt. */
  BASE_DWELL_MS: 400,
  /** The CPU panic rule can't turn the same runner around again this soon —
   *  each direction gets a real commitment, so a rundown reads as a rundown
   *  instead of a stutter. Player holds and tag-up reverses are exempt. */
  REVERSE_COOLDOWN_MS: 600,
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
  /** Tap mid-chase to dive: a reach burst, with a face-full-of-grass whiff. */
  dive: boolean;
  /** Pitcher stamina drain + relief swaps. */
  fatigue: boolean;
  /** 📼 instant replay of great live plays. */
  replay: boolean;
  /** Pre-pitch swing-type chips at the plate (safe / big / bunt). */
  swingChoice: boolean;
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
  /**
   * Fielding assist: 'auto' = the fielder plays itself when the pointer is
   * idle (steering overrides); 'magnet' = steering is blended toward the
   * ball's landing spot by LIVE.ASSIST.MAGNET_BLEND.
   */
  fielderAssist: 'auto' | 'magnet';
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
      // Must equal playerRunSpeedMult: that is what holds LIVE.FIELDER_RUN_RATIO
      // on the side the human BATS. Kid mode was accidentally the only branch
      // near 1.0x before 2026-07-28 (0.62 * 106 = 65.7 against a 55.6px/s runner)
      // — the old 0.62 was compensating for a FIELDER_SPEED that was 2.48x too
      // high, so correcting the base means this goes UP, not down. Absolute kid
      // CPU fielder speed barely moves: 65.7 -> 55.6px/s.
      cpuFielderSpeedMult: 1.3,
      cpuReactionMs: 1093,
      cpuThrowDelayMs: 993,
      cpuThrowSpeedMult: 0.62,
      cpuThrowErrorMs: 320,
      reachMult: 1.6,
      playerRunSpeedMult: 1.3,
      cpuRunSpeedMult: 0.8,
      playerErrorMult: 0, // kid mode: your kids never drop it
      cpuErrorMult: 0,
      manualBaserunning: false,
      fielderAssist: 'auto', // hands off? the kid fields it themself
    },
    features: {
      pitchSelection: false,
      battingCursor: false,
      manualBaserunning: false,
      errors: false,
      steals: false,
      juice: false,
      dive: false,
      swingChoice: false,
      fatigue: false,
      replay: false,
    },
  },
  main: {
    // Old HARD, softened a touch — main mode is still for kids.
    live: {
      /** Must equal playerRunSpeedMult — see the kid-mode note above. */
      cpuFielderSpeedMult: 1.0,
      // NOT MEASURED — scaled 1.987x with RUNNER_SPEED. Halving runner speed
      // doubles the time the defense has, so leaving these alone would hand it
      // every close play. defense.cpuReaction holds a 5-sample partialReading
      // (~1050ms) that was deliberately not promoted: a displacement threshold
      // cannot separate a decision delay from an acceleration ramp. These are
      // the most likely values to need feel iteration.
      cpuReactionMs: 835,
      cpuThrowDelayMs: 1192,
      cpuThrowSpeedMult: 1.0,
      cpuThrowErrorMs: 80,
      reachMult: 1.15,
      playerRunSpeedMult: 1.0,
      cpuRunSpeedMult: 0.95,
      playerErrorMult: 1,
      cpuErrorMult: 1,
      manualBaserunning: true,
      fielderAssist: 'magnet', // you steer; the game leans you toward the ball
    },
    // Widened ~35% with the Backyard-paced pitch corridor (PITCH_SPEED): the
    // flight got ~40% shorter, the reaction window shouldn't have.
    swingTiming: { PERFECT: 156, GOOD: 307, CONTACT: 488 },
    // Flags flip to true as each Backyard-style mechanic lands.
    features: {
      pitchSelection: true,
      battingCursor: true,
      manualBaserunning: true,
      errors: true,
      steals: true,
      juice: true,
      dive: true,
      swingChoice: true,
      fatigue: true,
      replay: true,
    },
  },
};

/** Character-animation timing/feel. */
export const ANIM = {
  SWING_MS: 120, // how fast the bat whips through the swing
  SWING_CONTACT_FRAC: 0.35, // when the swingMid contact frame lands inside SWING_MS (hit-pause catches it)
  SWING_FOLLOW_MS: 420, // how long the follow-through frame holds before restoring the stance
  SWING_WHIFF_EXTRA_MS: 260, // extra follow-through hold on a whiff (sells the over-swing)
  // MEASURED (pace.pitchWindup): BB2001's delivery runs ~770ms from the first
  // motion to release. Ours was 380ms -- half the telegraph, which is part of
  // why the pitch arrived unannounced. The two windup frames now hold ~400ms
  // each; if that reads stiff, add intermediate poses (poseSequence already
  // takes an arbitrary frame list) rather than shortening this back.
  WINDUP_MS: 800,
  RUN_BOB: 7, // pixels a runner bounces while running
  IDLE_BOB: 5, // pixels the idle "breathing" bob rises
  RUN_FRAME_MS: 60, // run-cycle frame swap (4-frame reach→pass→crossover→pass gait, ~240ms/cycle)
  REACT_HOLD_MS: 950, // how long a one-shot reaction pose (upset/nervous/cheer) holds before restoring
  ACTION_HOLD_MS: 420, // quicker hold for in-play action poses (throw release, glove-up catch)
  WAGGLE_EVERY_MS: 2700, // idle bat-waggle tic cadence at the plate
  WAGGLE_AMP: 2.5, // waggle swing, degrees
  // Schoolyard (title + draft) choreography.
  AMBIENT_HOP_EVERY_MS: 2600, // a random waiting kid hops ("pick me!") this often
  CUTSCENE_ZOOM: 2.0, // door close-up zoom while the bell rings
  CUTSCENE_ZOOM_HOLD_MS: 700, // how long the camera lingers on the doors
  CUTSCENE_ZOOMOUT_MS: 1100, // camera pull-back from the doors to the full yard
  SKY_SCROLL_FACTOR: 0.85, // sky-layer parallax lag during the cutscene pan (building stays 1)
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
  DOOR_CLEAR_R: 26, // launch SPAWN POINT must be this clear before the next kid launches
  LANE_SPREAD: 14, // ± exit-lane x offset at the door
  SPEED: 0.27, // base run speed, px/ms
  SPEED_JITTER: 0.25, // ± fraction of SPEED per kid
  // Full-size separation radius (px); scales down near the door. minDist 38
  // matches the ~34-38px drawn body width — smaller radii let kids at "legal"
  // separation still visibly overlap. NOT higher: the wall-gap corridor
  // (104px - 2×GAP_MARGIN = 76px) is exactly two-abreast at minDist 38.
  RADIUS: 19,
  SEP_ITERATIONS: 5, // positional-relaxation passes per tick (funnel needs the extra passes)
  ARRIVE_R: 5, // arrival snap distance
  GAP_MARGIN: 14, // keep-off distance from the wall-gap posts
  STAIR_HALF_W: 38, // x clamp around the door while on the steps
  MAX_DT_MS: 50, // per-tick dt clamp (tab refocus / frame hitches)
  MAX_RUN_MS: 6000, // no-soft-lock guard: force-settle any kid running longer
  STAIR_HOP_H: 6, // render-side hop amplitude on the steps
  RUN_BOB_H: 4, // render-side bob amplitude crossing the yard
  RUN_BOB_HZ: 7, // render-side bob frequency
  AIR_SHADOW_SHRINK: 0.3, // how much the ground shadow shrinks at the top of a stair hop
  STAIR_SQUASH: 0.15, // landing squash (fraction of scaleY) when a kid hits a step
  SQUASH_MS: 90, // how long the landing squash takes to decay
};
