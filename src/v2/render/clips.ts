// ---------------------------------------------------------------------------
// ★ THE ANIMATION CONTRACT, IN CODE. PURE — no `three` import, same rule as
// `cameraCues.ts`, so every timing decision here is unit-testable without a
// renderer.
//
// All 30 characters bind to ONE skeleton and play THESE clips. That is what
// makes animation a single fixed cost instead of a per-character cost, and it
// is the whole economic argument for `skeleton.ts` being rigid.
//
// This table is the SOURCE. `docs/v2/animation-brief.md` (artist-facing) and
// `docs/v2/asset-contract.md` (validator-facing) are MIRRORS of it, and
// `clips.test.ts` parses both and fails if either drifts — the same
// source -> record -> constant discipline `scripts/measure/conformance.test.js`
// applies to the feel constants. Before this file existed, the clip list lived
// only as two markdown tables that nothing reconciled.
//
// Three fields here were missing from the brief entirely, and each one is a
// bug the engine would otherwise have shipped:
//
//   authoredSpeedFts  A locomotion clip is played at `simSpeed / authored`.
//                     The brief said "2.5 strides/sec at 1x speed" and never
//                     said what 1x is in ft/s, so there was no number to
//                     divide by and feet would have skated at every speed.
//   bodyTravelFt      Dives and slides displace the BODY while `Root` stays
//                     put. Nobody said how far. The sim grants dive reach in
//                     real feet; if the clip reaches further than the sim
//                     does, the glove closes on a ball the sim scored a miss.
//   returnsTo         "No popping between clips" was an acceptance criterion
//                     with no rule attached. Naming the neutral each one-shot
//                     settles into turns it into a graph the director can walk
//                     and a test can check.
// ---------------------------------------------------------------------------

/** The library is authored at 30fps. Marker frames are frame indexes at 30fps. */
export const FPS = 30;

export type ClipGroup =
  | 'locomotion'
  | 'batting'
  | 'pitching'
  | 'fielding'
  | 'baserunning'
  | 'reaction'
  | 'frontend';

/** Physical instants a clip must hit on an exact frame. */
export type MarkerName = 'CONTACT' | 'RELEASE' | 'CATCH';

export interface ClipSpec {
  name: string;
  group: ClipGroup;
  /** Target length at 30fps. The validator allows +-20%; markers do not move. */
  frames: number;
  loop: boolean;
  /**
   * The frame a physical event happens on. The director time-warps the clip so
   * this frame lands on the simulated instant — which is what makes animation
   * structurally unable to drift out of sync with the physics.
   */
  marker?: { name: MarkerName; frame: number };
  /** Crossfade INTO this clip, ms. */
  blendMs: number;
  /**
   * Ground speed, ft/s, at which this clip reads correctly at 1.0x playback.
   * Locomotion only. The director sets rate = simSpeed / authoredSpeedFts.
   */
  authoredSpeedFts?: number;
  /**
   * Maximum horizontal displacement of `Hips` from its frame-0 position, ft,
   * while `Root` stays at the origin. See BODY_TRAVEL below — this is a
   * gameplay quantity, not a stylistic one.
   */
  bodyTravelFt?: number;
  /** Where a one-shot settles. Loops have none. */
  returnsTo?: string;
}

/**
 * ★ WHY `run` IS ANCHORED TO 14.29 ft/s AND WHAT IT COSTS.
 *
 * DERIVED, not measured. `pace.homeToFirst` is the one hard pace measurement in
 * the project: BB2001 runs home to first in 4200ms (n=3, conformed), which over
 * a real 60ft basepath is 60/4.2 = **14.29 ft/s** (9.7 mph). That is the speed a
 * full-effort run must read correctly at, because it is the speed the game runs
 * at.
 *
 * The brief's own numbers then say something worth knowing. A 24-frame cycle at
 * 30fps is 1.25 cycles/s, i.e. 2.5 FOOTFALLS per second — which is exactly the
 * "2.5 strides/sec" the brief asked for, so "stride" meant a single step and the
 * ambiguity is settled by the frame count rather than by argument. But 14.29
 * ft/s at 2.5 footfalls/s needs a **5.71 ft step**, which on the 4.0ft reference
 * kid is 1.43x their own height — longer than an elite adult sprinter's step
 * relative to height.
 *
 * That is deliberately left as-is, and stated rather than silently fixed: the
 * brief asks for cartoon spacing and "everything slightly too much effort", and
 * a reaching, over-committed stride is that look. It is recorded so that if the
 * proxy reads as skating, the fix is a SHORTER CYCLE (18 frames -> 3.3 footfalls
 * /s -> a 4.3ft step) and not a slower game — the game's speed is the measured
 * quantity here and the cadence is the free one.
 */
export const RUN_SPEED_FTS = 14.29;

/**
 * ★ WHAT `bodyTravelFt` IS FOR, and why `slide` is near zero while a dive is not.
 *
 * The sim owns every character's ground position, always. A clip that displaces
 * the body is therefore ADDING to a position the sim already decided, and the
 * two cases pull opposite ways:
 *
 *   A DIVE is reach. The sim stops the fielder and grants a catch-radius bonus
 *   for the dive window; the clip's lateral travel is what makes that bonus
 *   visible. Clip travel and sim bonus must be the SAME NUMBER or the glove
 *   closes on a ball that was scored a miss (or misses one that was scored a
 *   catch) — v1's render/sim disagreement bug class, imported wholesale.
 *
 *   A SLIDE is not. The runner's ground track down the basepath is sim-owned
 *   and already moving; a clip that also travels forward makes the runner
 *   outrun their own position and arrive at a base they are not at yet. So the
 *   slide's body goes DOWN and the legs go OUT, and its horizontal travel must
 *   stay near zero.
 *
 * The validator MEASURES the delivered clip's `Hips` displacement against this
 * rather than taking the animator's word for it.
 */
export const BODY_TRAVEL_TOLERANCE_FT = 0.35;

/**
 * The literal table. Kept `as const` only long enough to derive `AnimName`
 * from it — a union of the actual names is worth having, because it makes a
 * typo in a `play()` call a compile error rather than a silent fall back to
 * `idle`. `CLIPS` below re-exports it as `ClipSpec[]`, since the const-narrowed
 * union hides every optional field from anything that iterates it.
 */
const CLIP_TABLE = [
  // --- Idle & locomotion ---------------------------------------------------
  { name: 'idle', group: 'locomotion', frames: 60, loop: true, blendMs: 220 },
  { name: 'idle_fidget', group: 'locomotion', frames: 90, loop: false, blendMs: 220, returnsTo: 'idle' },
  { name: 'run', group: 'locomotion', frames: 24, loop: true, blendMs: 150, authoredSpeedFts: RUN_SPEED_FTS },
  { name: 'run_fast', group: 'locomotion', frames: 20, loop: true, blendMs: 150, authoredSpeedFts: 17.9 },
  { name: 'trot', group: 'locomotion', frames: 30, loop: true, blendMs: 200, authoredSpeedFts: 7.1 },
  { name: 'jog_back', group: 'locomotion', frames: 24, loop: true, blendMs: 150, authoredSpeedFts: 8.6 },
  { name: 'shuffle_left', group: 'locomotion', frames: 20, loop: true, blendMs: 150, authoredSpeedFts: 7.2 },
  { name: 'shuffle_right', group: 'locomotion', frames: 20, loop: true, blendMs: 150, authoredSpeedFts: 7.2 },

  // --- Batting -------------------------------------------------------------
  { name: 'bat_stance', group: 'batting', frames: 60, loop: true, blendMs: 200 },
  { name: 'bat_load', group: 'batting', frames: 12, loop: false, blendMs: 90, returnsTo: 'bat_stance' },
  {
    name: 'swing_contact',
    group: 'batting',
    frames: 18,
    loop: false,
    marker: { name: 'CONTACT', frame: 7 },
    blendMs: 50,
    returnsTo: 'swing_follow',
  },
  { name: 'swing_follow', group: 'batting', frames: 24, loop: false, blendMs: 60, returnsTo: 'bat_stance' },
  { name: 'swing_whiff', group: 'batting', frames: 30, loop: false, blendMs: 60, returnsTo: 'bat_stance' },
  { name: 'bunt', group: 'batting', frames: 24, loop: false, blendMs: 90, returnsTo: 'bat_stance' },

  // --- Pitching ------------------------------------------------------------
  { name: 'pitch_windup', group: 'pitching', frames: 30, loop: false, blendMs: 150, returnsTo: 'pitch_stride' },
  { name: 'pitch_stride', group: 'pitching', frames: 12, loop: false, blendMs: 60, returnsTo: 'pitch_release' },
  {
    name: 'pitch_release',
    group: 'pitching',
    frames: 12,
    loop: false,
    marker: { name: 'RELEASE', frame: 4 },
    blendMs: 50,
    returnsTo: 'field_ready',
  },

  // --- Fielding ------------------------------------------------------------
  { name: 'field_ready', group: 'fielding', frames: 40, loop: true, blendMs: 200 },
  {
    name: 'field_scoop',
    group: 'fielding',
    frames: 20,
    loop: false,
    marker: { name: 'CATCH', frame: 9 },
    blendMs: 80,
    returnsTo: 'field_ready',
  },
  {
    name: 'catch_high',
    group: 'fielding',
    frames: 20,
    loop: false,
    marker: { name: 'CATCH', frame: 8 },
    blendMs: 80,
    returnsTo: 'field_ready',
  },
  {
    name: 'catch_chest',
    group: 'fielding',
    frames: 20,
    loop: false,
    marker: { name: 'CATCH', frame: 8 },
    blendMs: 80,
    returnsTo: 'field_ready',
  },
  {
    name: 'catch_low',
    group: 'fielding',
    frames: 20,
    loop: false,
    marker: { name: 'CATCH', frame: 9 },
    blendMs: 80,
    returnsTo: 'field_ready',
  },
  {
    name: 'catch_jump',
    group: 'fielding',
    frames: 30,
    loop: false,
    marker: { name: 'CATCH', frame: 13 },
    blendMs: 80,
    bodyTravelFt: 0,
    returnsTo: 'field_ready',
  },
  {
    name: 'dive_left',
    group: 'fielding',
    frames: 45,
    loop: false,
    marker: { name: 'CATCH', frame: 18 },
    blendMs: 60,
    bodyTravelFt: 3.0,
    returnsTo: 'getup',
  },
  {
    name: 'dive_right',
    group: 'fielding',
    frames: 45,
    loop: false,
    marker: { name: 'CATCH', frame: 18 },
    blendMs: 60,
    bodyTravelFt: 3.0,
    returnsTo: 'getup',
  },
  { name: 'getup', group: 'fielding', frames: 40, loop: false, blendMs: 120, bodyTravelFt: 0.4, returnsTo: 'field_ready' },
  {
    name: 'throw_overhand',
    group: 'fielding',
    frames: 24,
    loop: false,
    marker: { name: 'RELEASE', frame: 11 },
    blendMs: 80,
    returnsTo: 'field_ready',
  },
  { name: 'throw_quick', group: 'fielding', frames: 14, loop: false, blendMs: 50, returnsTo: 'field_ready' },

  // --- Baserunning ---------------------------------------------------------
  { name: 'slide', group: 'baserunning', frames: 40, loop: false, blendMs: 60, bodyTravelFt: 0.4, returnsTo: 'getup' },

  // --- Reactions — the personality set ------------------------------------
  { name: 'cheer', group: 'reaction', frames: 45, loop: false, blendMs: 120, returnsTo: 'idle' },
  { name: 'cheer_cool', group: 'reaction', frames: 36, loop: false, blendMs: 120, returnsTo: 'idle' },
  { name: 'cheer_fierce', group: 'reaction', frames: 32, loop: false, blendMs: 80, returnsTo: 'idle' },
  { name: 'cheer_goofy', group: 'reaction', frames: 54, loop: false, blendMs: 100, returnsTo: 'idle' },
  { name: 'cheer_tender', group: 'reaction', frames: 45, loop: false, blendMs: 140, returnsTo: 'idle' },
  { name: 'upset', group: 'reaction', frames: 60, loop: false, blendMs: 150, returnsTo: 'idle' },
  { name: 'upset_cool', group: 'reaction', frames: 40, loop: false, blendMs: 150, returnsTo: 'idle' },
  { name: 'upset_fierce', group: 'reaction', frames: 45, loop: false, blendMs: 90, returnsTo: 'idle' },
  { name: 'upset_goofy', group: 'reaction', frames: 50, loop: false, blendMs: 120, returnsTo: 'idle' },
  { name: 'upset_tender', group: 'reaction', frames: 65, loop: false, blendMs: 180, returnsTo: 'idle' },
  { name: 'nervous', group: 'reaction', frames: 60, loop: true, blendMs: 200 },
  { name: 'dodge', group: 'reaction', frames: 24, loop: false, blendMs: 40, returnsTo: 'bat_stance' },

  // --- Front-end -----------------------------------------------------------
  { name: 'walk_on', group: 'frontend', frames: 30, loop: true, blendMs: 200, authoredSpeedFts: 4.4 },
  // Two IDENTICAL keyframes, not one. A single-keyframe glTF animation has a
  // duration of zero, which `AnimationClip.resetDuration` and every mixer
  // treat as a degenerate case; two frames make it an ordinary held clip.
  { name: 'pose_card', group: 'frontend', frames: 2, loop: false, blendMs: 0 },
] as const satisfies readonly ClipSpec[];


export type AnimName = (typeof CLIP_TABLE)[number]['name'];

export const CLIPS: readonly ClipSpec[] = CLIP_TABLE;

export const CLIP_NAMES: readonly AnimName[] = CLIP_TABLE.map((c) => c.name);

export const CLIP_BY_NAME: Readonly<Record<string, ClipSpec>> = Object.freeze(
  Object.fromEntries(CLIP_TABLE.map((c) => [c.name, c as ClipSpec]))
);

export function clipSpec(name: string): ClipSpec {
  const spec = CLIP_BY_NAME[name];
  if (!spec) throw new Error(`Unknown clip: ${name}`);
  return spec;
}

/**
 * Whether a kid visibly holds the bat during this clip.
 *
 * Derived from the table rather than enumerated: every batting-group clip, plus
 * anything that settles back into `bat_stance` — the settle graph already says
 * "this clip happens at the plate", and a batter bailing out of a dodge keeps
 * his bat. `AnimationDirector` applies this on every play, so a batter turned
 * runner drops the bat the moment locomotion takes over.
 */
export function holdsBat(name: string): boolean {
  const spec = clipSpec(name);
  return spec.group === 'batting' || spec.returnsTo === 'bat_stance';
}

// --- Timing -----------------------------------------------------------------

export function framesToSec(frames: number): number {
  return frames / FPS;
}

export function clipDurationMs(name: string): number {
  return (clipSpec(name).frames / FPS) * 1000;
}

/** Seconds from the start of a clip to its marker. Throws if it has none. */
export function markerLeadSec(name: string): number {
  const spec = clipSpec(name);
  if (!spec.marker) throw new Error(`${name} carries no marker frame`);
  return spec.marker.frame / FPS;
}

/**
 * ★ THE WARP RANGE, and why it is NOT the 0.6x-1.4x the brief states for loops.
 *
 * A marker clip is played at whatever rate lands its marker frame on the
 * simulated instant, so its rate is decided by the physics, not by taste.
 * `swing_contact`'s marker is 7 frames in — 233ms — and a batter who swings
 * 120ms before the ball arrives needs the clip compressed ~1.9x. Clamping at
 * 1.4x would not slow the swing down; it would put the bat through the ball
 * 100ms late, which is the exact desync the marker mechanism exists to prevent.
 *
 * So marker clips get a wider band and it is stated in the brief separately
 * from the loop band. Outside it the director clamps and the animation is
 * knowingly a frame or two off — better than unbounded, and it only happens on
 * inputs the sim itself calls a very late swing.
 */
export const WARP_MIN_RATE = 0.5;
export const WARP_MAX_RATE = 2.5;

/**
 * Playback rate that lands `clip`'s marker on an event `secUntilEvent` away.
 * Clamped, and it reports the clamp so the caller can decide to snap instead.
 */
export function warpRateFor(name: string, secUntilEvent: number): { rate: number; clamped: boolean } {
  const lead = markerLeadSec(name);
  if (!(secUntilEvent > 0)) return { rate: WARP_MAX_RATE, clamped: true };
  const ideal = lead / secUntilEvent;
  const rate = Math.min(WARP_MAX_RATE, Math.max(WARP_MIN_RATE, ideal));
  return { rate, clamped: rate !== ideal };
}

/** The band a LOOPING clip must stay legible across (the brief's own figure). */
export const LOOP_MIN_RATE = 0.6;
export const LOOP_MAX_RATE = 1.4;

/**
 * Playback rate for a locomotion clip at a given ground speed. Feet stop
 * skating exactly when this ratio is honoured, which is why every locomotion
 * clip is required to carry `authoredSpeedFts`.
 */
export function locomotionRateFor(name: string, ftPerSec: number): number {
  const authored = clipSpec(name).authoredSpeedFts;
  if (!authored) throw new Error(`${name} is not a locomotion clip`);
  return Math.max(0, ftPerSec) / authored;
}

/**
 * Pick the locomotion clip whose authored speed is closest to what the sim is
 * doing, so the rate stays inside the 0.6x-1.4x band wherever a clip exists to
 * cover the speed. Walking, trotting and sprinting are different MOTIONS, not
 * one motion at three rates — playing `run` at 0.3x reads as slow motion, not
 * as a walk.
 */
export function pickLocomotion(ftPerSec: number): AnimName {
  const candidates = CLIP_TABLE.filter(
    (c): c is Extract<(typeof CLIP_TABLE)[number], { authoredSpeedFts: number }> =>
      'authoredSpeedFts' in c && c.name !== 'jog_back' && !c.name.startsWith('shuffle')
  );

  // The authored speeds are laid out so their 0.6x-1.4x bands OVERLAP, and in
  // an overlap the tie-break is "whose rate is nearest 1.0", not "whose speed
  // is nearest" — at 10 ft/s the trot is marginally closer in speed but has to
  // be cranked to 1.41x, while the run sits comfortably at 0.70x. Picking on
  // proximity alone pushed a clip out of its own legibility band.
  let best: (typeof candidates)[number] | undefined;
  let bestErr = Infinity;
  for (const c of candidates) {
    const rate = Math.max(ftPerSec, 0) / c.authoredSpeedFts!;
    if (rate < LOOP_MIN_RATE || rate > LOOP_MAX_RATE) continue;
    const err = Math.abs(Math.log(rate));
    if (err < bestErr) {
      bestErr = err;
      best = c;
    }
  }
  if (best) return best.name;

  // Outside every band (a dead stop, or something faster than any kid can
  // run): fall back to the closest in log space and let the caller clamp.
  let fallback = candidates[0];
  let fallbackErr = Infinity;
  for (const c of candidates) {
    const err = Math.abs(Math.log(Math.max(ftPerSec, 0.1) / c.authoredSpeedFts!));
    if (err < fallbackErr) {
      fallbackErr = err;
      fallback = c;
    }
  }
  return fallback.name;
}
