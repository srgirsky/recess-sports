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
 * The CLASSIC pitch corridor — Backyard-measured. Real BB2001 flights span
 * ~250ms (pro arm) to ~700ms (weakest kid arm) — see
 * docs/research/backyard-2001-video-notes.md. This block lands a kid-fair
 * version of that band, and (like BB) scales flight speed with the pitcher's
 * arm: drafting a good arm makes pitches genuinely faster, and the fatigue
 * sag makes tired arms lob. KID MODE NEVER READS THIS BLOCK — its pitches
 * keep PITCH_TRAVEL_MS / CPU_PITCH_TRAVEL_MS above (systems/mode.ts
 * getPitchBaseMs is the one resolver).
 */
export const PITCH_SPEED = {
  /** CLASSIC base travel (ms): human batting / human pitching halves. */
  MAIN_BASE_MS: 800,
  MAIN_CPU_BASE_MS: 700,
  /**
   * Arm term: travel × clamp(BASE − PER_STAT × pitching). Stat 10 → 0.75
   * (fastball ≈ 545ms), stat 1 → 1.20 (fastball ≈ 875ms) — the Backyard band.
   * Clamped so a content typo can't make a pitch untimeable.
   */
  ARM_MULT: { BASE: 1.25, PER_STAT: 0.05, MIN: 0.7, MAX: 1.25 },
  /**
   * Render-only "rainbow": pitches slower than FROM_MS arc visibly (px of
   * lob height per ms over the threshold, capped). BB's speed range doubles
   * as a SHAPE range — fast pitches are lasers, slow ones are lobs you track
   * the whole way. Never touches swing-timing math or the sim.
   */
  LOB: { FROM_MS: 850, PER_MS: 0.12, MAX_PX: 110 },
};

/**
 * LIVE-SIM tempo scalar for CLASSIC (main) mode — the knob for "the running &
 * fielding feel too fast/slow." Applied as `delta * TEMPO` into stepLivePlay,
 * so it uniformly slows EVERYTHING the sim owns — fielders, runners, thrown
 * balls, and the CPU reaction/throw delays — together. Because it scales them
 * all at once, every bang-bang RATIO is preserved (a force play stays a force
 * play, just in slow motion); that's why this is the right lever and cutting
 * RUNNER_SPEED alone is NOT (it would break the force-out balance the CPU
 * defense is tuned around).
 *
 * CALIBRATION (measured, not remembered): the basepath is ~180px
 * (hypot(138,115) from HOME→FIRST in geometry.ts), so at RUNNER_SPEED 85 a raw
 * (TEMPO 1.0) home→1B is ~2.1s — the value the sim was ORIGINALLY tuned to,
 * under the mistaken belief that 2.1s was the Backyard pace. Frame-measured
 * BB2001 is actually ~3.0s (docs/research/backyard-2001-video-notes.md), so the
 * raw sim runs ~40% too fast. TEMPO 0.60 → home→1B ~3.5s, deliberately a touch
 * SLOWER than the video (little kids, short attention, want to read the play).
 *
 * Kid mode keeps its own floaty constants and is NOT scaled by this.
 *
 * NOTE: the goldlog does NOT gate this. Verified empirically — TEMPO 1.0 → 0.6
 * leaves BOTH fingerprints byte-identical, because the log records state
 * TRANSITIONS (inning/half/phase/score/outs/count), never timestamps: uniform
 * dt scaling preserves every outcome, just slower. That is a nice confirmation
 * the lever is ratio-safe, but it also means **no existing test can catch a
 * pace regression here** — the conformance gate in src/data/bb2001.test.ts is
 * the only thing that will. Re-run the goldlog anyway when touching this (a
 * changed fingerprint would mean you altered outcomes, not just pace).
 */
export const TEMPO = 0.6;

/**
 * PITCH-FLIGHT tempo scalar (CLASSIC main) — SEPARATE from TEMPO on purpose.
 * Pitch flight is a different problem than running: a mid-arm fastball is
 * already ~900ms here (slower than the video's 700ms slowest lob), and pitches
 * feel "fast" because the ball is a LASER — invisible until the last third of
 * flight — not because the clock is short. Slowing the clock more just makes a
 * floaty rainbow (crosses the LOB threshold) without buying read time; the real
 * pitch-readability fix is render-side (show/track the ball earlier). So this
 * stays MILD. Divides into getPitchBaseMs's main branch (lower = slower flight).
 */
export const PITCH_TEMPO = 0.8;

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
  /** Ball arrival -> the ump's call pops (the BB2001-measured beat). The
   *  call's total life (this + its internal hold + fade, Scoreboard.umpCall)
   *  must stay ≤ the shortest beat that follows it (CPU_STEP_MS). */
  UMP_CALL_DELAY_MS: 200,
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
    MAX_FRAMES: 900, // snapshot cap (~15s of play at 60fps — covers MAX_PLAY_MS)
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
     *  Backyard-paced: flies hang long enough to settle under the landing ring. */
    LINER_HANG_MS: { MIN: 650, MAX: 900 },
    FLY_HANG_MS: { MIN: 2000, MAX: 2900 },
    /** Initial grounder roll speed (px/s); decelerates to stop at the settle point. */
    GROUNDER_SPEED: { MIN: 160, MAX: 240 },
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
    /** First hop duration (ms) and height cue (0..1, renderer scale). */
    FIRST_HOP_MS: 340,
    FIRST_HOP_H: 0.45,
    /** Post-hop speed (px/s) → decel-roll settle distance (v * this, px). */
    ROLLOUT_S: 0.48,
    /** Carom: speed retained bouncing off the fence. */
    WALL_REST: 0.55,
    /** A hopping ball is grabbable only below this height (short-hop scoop). */
    PICKUP_MAX_H: 0.4,
  },
  /** Player-steered fielder speed (px/s). */
  FIELDER_SPEED: 210,
  /** Fielding assist (mode-tied: kid = auto, main = magnet). */
  ASSIST: {
    /** Magnet: how much steering is bent toward the ball (0 = pure manual). */
    MAGNET_BLEND: 0.5,
    /** A pointer that hasn't moved (and isn't down) this long stops steering. */
    POINTER_STALE_MS: 300,
  },
  /** How close (px) a fielder must be to grab the ball. */
  CATCH_RADIUS: 34,
  PICKUP_RADIUS: 28,
  /** An airborne ball is catchable in this last fraction of its flight. */
  CATCHABLE_TAIL: 0.4,
  /** Hold-to-charge time (ms) for a full-power throw. Short, Backyard-style:
   *  once you've fielded it, the out is about picking the base, not the charge. */
  THROW_METER_MS: 450,
  /** Throw flight speed (px/s) at zero / full charge. */
  THROW_SPEED_MIN: 550,
  THROW_SPEED_MAX: 820,
  /** Idle-kid rescue: sim throws by itself after holding the ball this long. */
  AUTO_THROW_MS: 2600,
  /** Runner speed (px/s) at speed stat 5; each stat point is ±6%.
   *  Scaled with the base-leg length (~180px legs) so a leg takes ~2.1s —
   *  Backyard-paced: slow enough that there's real time to read the ball,
   *  field it, and pick a base, while a good jump still wins the extra-base
   *  bang-bang plays. */
  RUNNER_SPEED: 85,
  /** Distance ball→next base above which a CPU runner risks the extra base. */
  CPU_RUNNER_GREED_DIST: 180,
  /** A loose ball nobody has picked up for this long → CPU runners just go. */
  CPU_RUNNER_PATIENCE_MS: 1500,
  /** Hard cap: any live play resolves by now (stragglers settle safe behind).
   *  Sized for the slower Backyard pace (~2.1s legs + ~3s fly hangs). */
  MAX_PLAY_MS: 11000,
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
  RALLY_FORGIVE_MS: 55,
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
  PROTOCOL_VERSION: 4, // v4: Backyard pitch corridor — timing windows differ from v3 builds
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
  // Deltas scaled up with the Backyard-paced pitch corridor (PITCH_SPEED) —
  // absolute ms mean more against a ~40% shorter flight.
  /** 🛡 SAFE: choke up — wider timing windows, softer contact. */
  SAFE: { FORGIVE_MS: 60, Q_ADJ: -0.3 },
  /** 💪 BIG: sell out — weak contact becomes a whiff, solid contact is crushed. */
  BIG: { NARROW_MS: 45, Q_ADJ: 0.22, TYPE_BIAS: 0.35 },
  /** 🤏 BUNT: easy to get bat on it; the ball dies in front of the plate. */
  BUNT: { FORGIVE_MS: 80, DIST_CAP: 115, Q_ADJ: -0.5, SPRAY_MIN: 0.34, SPRAY_MAX: 0.66 },
  /** 🤪 CRAZY BUNT (signature card, ability 'crazy_bunt' — BB2001's Tony D.
   *  special): trivially easy contact, but the ball SQUIRTS hard down
   *  whichever line the swing leans toward — a chaos tool, not a sacrifice.
   *  Spray snaps to the extremes (no rng draw — goldlog/net safe). */
  CRAZY_BUNT: { FORGIVE_MS: 100, DIST_CAP: 205, Q_ADJ: -0.15, SPRAY_LO: 0.16, SPRAY_HI: 0.84 },
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
   *  the beat that makes sac flies from third a real race. Scaled with
   *  RUNNER_SPEED (slower legs need a longer beat to keep the race winnable). */
  CATCH_GATHER_MS: 1100,
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
      cpuFielderSpeedMult: 1.0,
      // Reaction/throw delays scale with the Backyard pace (RUNNER_SPEED):
      // slower runners need a more deliberate CPU defense or offense is crushed.
      cpuReactionMs: 420,
      cpuThrowDelayMs: 600,
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
    swingTiming: { PERFECT: 120, GOOD: 240, CONTACT: 380 },
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
  WINDUP_MS: 380, // pitcher lean-back before the release (the "here it comes" telegraph)
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
