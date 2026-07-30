// ---------------------------------------------------------------------------
// ★ PROCEDURAL STAND-INS — the same argument as `ProxyCharacter`, for motion.
//
// The proxy exists so no engineering is ever blocked on a character model.
// These exist so none is ever blocked on a CLIP, and they buy something more
// valuable than that: the animation spec gets exercised BEFORE it is paid for.
// Every clip name in `clips.ts` resolves to real motion today, so the director,
// the marker time-warp, the blend graph, the loop-seam check and the 40px
// thumbnail review all run against something — and if a clip turns out to be
// unexpressible on the canonical skeleton, that is discovered now rather than
// in a delivery.
//
// They are crude ON PURPOSE. Sine-driven gaits and a handful of posed keys; no
// overlap, no settle, no personality. Judging the LOOK from these would be a
// mistake. What they are correct about is TIMING and CONTRACT:
//
//   * loops close their seam exactly (phase 1.0 keys the same pose as 0.0),
//   * marker clips peak the relevant hand ON their marker frame — which is the
//     property `validate-models` derives a delivered marker from, so the
//     placeholder library passes the same gate the real one will,
//   * `Root` is never keyed, and body travel matches `bodyTravelFt`.
//
// Every clip is authored on the 4.0ft reference rig in feet and radians.
// ---------------------------------------------------------------------------

import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three';
import { CLIPS, FPS, type ClipSpec } from './clips';
import { bindWorld } from './skeleton';

const D = Math.PI / 180;

/** Bone aliases, so a pose fits on one line. */
const BONE = {
  hp: 'Hips',
  sp: 'Spine',
  s1: 'Spine1',
  s2: 'Spine2',
  nk: 'Neck',
  hd: 'Head',
  ls: 'LeftShoulder',
  la: 'LeftArm',
  lf: 'LeftForeArm',
  lh: 'LeftHand',
  rs: 'RightShoulder',
  ra: 'RightArm',
  rf: 'RightForeArm',
  rh: 'RightHand',
  lu: 'LeftUpLeg',
  ll: 'LeftLeg',
  lt: 'LeftFoot',
  ru: 'RightUpLeg',
  rl: 'RightLeg',
  rt: 'RightFoot',
} as const;

type Alias = keyof typeof BONE;
/** Euler XYZ in DEGREES — the unit a human can read and edit. */
type Pose = Partial<Record<Alias, [number, number, number]>>;

interface Key {
  /** Frame index at 30fps. */
  f: number;
  pose: Pose;
  /** Horizontal offset of the Hips from bind, in feet: [x, y, z]. */
  hips?: [number, number, number];
}

// --- Track assembly ---------------------------------------------------------

const HIPS_BIND_Y = bindWorld().get('Hips')![1];

function quat(e: [number, number, number]): [number, number, number, number] {
  const q = new Quaternion().setFromEuler(new Euler(e[0] * D, e[1] * D, e[2] * D, 'XYZ'));
  return [q.x, q.y, q.z, q.w];
}

/**
 * Build a clip from keyframes.
 *
 * Every bone mentioned in ANY key gets a track sampled at EVERY key time —
 * three interpolates per track, so a bone keyed at only some times would hold
 * its last value across the others and drift out of the intended pose.
 */
function build(spec: ClipSpec, keys: Key[]): AnimationClip {
  const aliases = new Set<Alias>();
  for (const k of keys) for (const a of Object.keys(k.pose) as Alias[]) aliases.add(a);

  const times = keys.map((k) => k.f / FPS);
  const tracks: (QuaternionKeyframeTrack | VectorKeyframeTrack)[] = [];

  for (const a of aliases) {
    const values: number[] = [];
    for (const k of keys) values.push(...quat(k.pose[a] ?? [0, 0, 0]));
    // LINEAR (slerp) only. three rejects spline interpolation on a quaternion
    // track — `setInterpolation(InterpolateSmooth)` logs "unsupported
    // interpolation for quaternion keyframe track" and silently falls back, so
    // asking for it bought nothing but console noise. It is also what glTF
    // itself uses for rotations unless CUBICSPLINE is authored, so the
    // placeholder library now matches how a delivery will be sampled.
    tracks.push(new QuaternionKeyframeTrack(`${BONE[a]}.quaternion`, times, values));
  }

  if (keys.some((k) => k.hips)) {
    const values: number[] = [];
    for (const k of keys) {
      const [x, y, z] = k.hips ?? [0, 0, 0];
      values.push(x, HIPS_BIND_Y + y, z);
    }
    tracks.push(new VectorKeyframeTrack('Hips.position', times, values));
  }

  const clip = new AnimationClip(spec.name, spec.frames / FPS, tracks);
  clip.resetDuration();
  // Never shorter than the spec says: an empty tail would end a one-shot early
  // and blend to its settle clip ahead of time.
  clip.duration = spec.frames / FPS;
  return clip;
}

/**
 * A looping cycle: `pose(phase)` sampled every frame, INCLUDING phase 1.0 so
 * the last key is byte-identical to the first. That exactness is the whole
 * point — a seam that is merely close pops once per stride, forever.
 */
function cycle(spec: ClipSpec, at: (phase: number) => Pose, hips?: (phase: number) => [number, number, number]): AnimationClip {
  const keys: Key[] = [];
  for (let f = 0; f <= spec.frames; f++) {
    const phase = (f % spec.frames) / spec.frames;
    keys.push({ f, pose: at(phase), hips: hips?.(phase) });
  }
  return build(spec, keys);
}

const TAU = Math.PI * 2;
const sin = (phase: number, offset = 0) => Math.sin((phase + offset) * TAU);

// --- The clips ---------------------------------------------------------------

/** Breathing, weight on the back foot. Alive, not fidgety. */
function idle(spec: ClipSpec): AnimationClip {
  return cycle(spec, (p) => {
    const b = sin(p) * 1.4;
    return {
      sp: [b * 0.6, 0, 0],
      s2: [b * 0.5, 0, 0],
      nk: [-b * 0.4, 0, 0],
      hd: [-b * 0.3, sin(p, 0.25) * 1.2, 0],
      la: [0, 0, 74 + b],
      ra: [0, 0, -74 - b],
      lf: [0, -12, 0],
      rf: [0, 12, 0],
    };
  });
}

/** A run cycle. Reach -> pass -> crossover -> pass, with a forward lean. */
function runCycle(spec: ClipSpec, lean: number, reach: number, armDrive: number): AnimationClip {
  return cycle(spec, (p) => {
    const s = sin(p);
    const o = sin(p, 0.5);
    // Two bounces per cycle — the body rises on each push-off.
    const bob = Math.abs(sin(p, 0.25)) * 3;
    return {
      hp: [lean * 0.4 - bob * 0.2, 0, 0],
      sp: [lean * 0.35, s * 3, 0],
      s2: [lean * 0.3, -s * 5, 0],
      hd: [-lean * 0.5, 0, 0],
      lu: [s * reach, 0, 3],
      ll: [-Math.max(0, -s) * reach * 1.5 - 12, 0, 0],
      lt: [Math.max(0, s) * 18, 0, 0],
      ru: [o * reach, 0, -3],
      rl: [-Math.max(0, -o) * reach * 1.5 - 12, 0, 0],
      rt: [Math.max(0, o) * 18, 0, 0],
      la: [o * armDrive, 0, 72],
      lf: [0, -58, 0],
      ra: [s * armDrive, 0, -72],
      rf: [0, 58, 0],
    };
  });
}

/** Backpedalling: the run's leg phase reversed, torso upright and open. */
function jogBack(spec: ClipSpec): AnimationClip {
  return cycle(spec, (p) => {
    const s = sin(-p);
    const o = sin(-p, 0.5);
    return {
      hp: [-4, 0, 0],
      s2: [-6, s * 4, 0],
      hd: [6, 0, 0],
      lu: [s * 26, 0, 5],
      ll: [-Math.max(0, s) * 30 - 16, 0, 0],
      ru: [o * 26, 0, -5],
      rl: [-Math.max(0, o) * 30 - 16, 0, 0],
      la: [o * 22, 0, 66],
      ra: [s * 22, 0, -66],
    };
  });
}

/** Lateral shuffle, staying square to the plate. `dir` is -1 left, +1 right. */
function shuffle(spec: ClipSpec, dir: number): AnimationClip {
  return cycle(spec, (p) => {
    const s = sin(p);
    return {
      hp: [10, 0, s * 3 * dir],
      s2: [4, 0, 0],
      lu: [26 + s * 12 * dir, 0, 10],
      ll: [-34, 0, 0],
      ru: [26 - s * 12 * dir, 0, -10],
      rl: [-34, 0, 0],
      la: [-20, 0, 58],
      ra: [-20, 0, -58],
      lf: [0, -34, 0],
      rf: [0, 34, 0],
    };
  });
}

/** A confident walk-up. Slower cadence, straighter legs, chest out. */
function walkOn(spec: ClipSpec): AnimationClip {
  return cycle(spec, (p) => {
    const s = sin(p);
    const o = sin(p, 0.5);
    return {
      hp: [-2, 0, 0],
      s2: [-4, -s * 6, 0],
      hd: [2, s * 3, 0],
      lu: [s * 24, 0, 2],
      ll: [-Math.max(0, -s) * 26 - 4, 0, 0],
      lt: [Math.max(0, s) * 12, 0, 0],
      ru: [o * 24, 0, -2],
      rl: [-Math.max(0, -o) * 26 - 4, 0, 0],
      rt: [Math.max(0, o) * 12, 0, 0],
      la: [o * 18, 0, 76],
      ra: [s * 18, 0, -76],
    };
  });
}

/** Waiting for the pitch: bat up and back, small waggle, weight loaded. */
const BAT_STANCE_POSE: Pose = {
  hp: [0, -26, 0],
  sp: [6, -10, 0],
  s2: [4, -12, 0],
  hd: [0, 40, 0],
  lu: [6, 0, 12],
  ll: [-16, 0, 0],
  ru: [8, 0, -12],
  rl: [-18, 0, 0],
  la: [-52, 0, 38],
  lf: [0, -84, 0],
  ra: [-64, 0, -26],
  rf: [0, 78, 0],
};

const FIELD_READY_POSE: Pose = {
  hp: [26, 0, 0],
  sp: [10, 0, 0],
  s2: [6, 0, 0],
  hd: [-32, 0, 0],
  lu: [48, 0, 14],
  ll: [-62, 0, 0],
  lt: [18, 0, 0],
  ru: [48, 0, -14],
  rl: [-62, 0, 0],
  rt: [18, 0, 0],
  la: [-44, 0, 52],
  lf: [0, -62, 0],
  ra: [-30, 0, -48],
  rf: [0, 54, 0],
};

/** A held pose with a small breathing loop on top. */
function breathe(spec: ClipSpec, base: Pose, amount = 1.2): AnimationClip {
  return cycle(spec, (p) => {
    const b = sin(p) * amount;
    const out: Pose = {};
    for (const [k, v] of Object.entries(base) as [Alias, [number, number, number]][]) {
      out[k] = [v[0] + b * 0.4, v[1] + b * 0.5, v[2]];
    }
    return out;
  });
}

function shift(pose: Pose, delta: Pose): Pose {
  const out: Pose = { ...pose };
  for (const [k, v] of Object.entries(delta) as [Alias, [number, number, number]][]) {
    const base = pose[k] ?? [0, 0, 0];
    out[k] = [base[0] + v[0], base[1] + v[1], base[2] + v[2]];
  }
  return out;
}

/**
 * The swing. Contact is frame 7 and the bat hand's speed PEAKS there, because
 * the largest angular sweep is centred on 6->8 — which is what the validator
 * reads a marker off, and what makes the placeholder pass the same gate a
 * delivered clip will.
 */
function swingContact(spec: ClipSpec): AnimationClip {
  const loaded = shift(BAT_STANCE_POSE, { s2: [0, -16, 0], ra: [-8, 0, -10], hp: [0, -8, 0] });
  return build(spec, [
    { f: 0, pose: loaded },
    { f: 3, pose: shift(loaded, { hp: [0, 6, 0], s2: [0, 6, 0], ru: [0, 0, -6] }) },
    { f: 6, pose: shift(loaded, { hp: [0, 30, 0], sp: [0, 20, 0], s2: [0, 26, 0], ra: [14, 0, 24], la: [10, 0, -18], rt: [0, 0, 26] }) },
    // Contact.
    { f: 7, pose: shift(loaded, { hp: [0, 44, 0], sp: [0, 30, 0], s2: [0, 40, 0], ra: [22, 0, 44], la: [16, 0, -34], rt: [0, 0, 34] }) },
    { f: 8, pose: shift(loaded, { hp: [0, 58, 0], sp: [0, 40, 0], s2: [0, 54, 0], ra: [30, 0, 64], la: [22, 0, -50], rt: [0, 0, 42] }) },
    { f: 12, pose: shift(loaded, { hp: [0, 70, 0], sp: [0, 48, 0], s2: [0, 66, 0], ra: [34, 0, 78], la: [26, 0, -60], rt: [0, 0, 48] }) },
    { f: 17, pose: shift(loaded, { hp: [0, 76, 0], sp: [0, 52, 0], s2: [0, 72, 0], ra: [36, 0, 84], la: [28, 0, -66], rt: [0, 0, 50] }) },
  ]);
}

/**
 * Release is frame 4 and frame 11 respectively; same peak-speed rule as the
 * swing. `arm` is the euler the throwing arm whips through.
 */
function releaseClip(spec: ClipSpec, wind: Pose, pre: Pose, post: Pose, settle: Pose): AnimationClip {
  const f = spec.marker!.frame;
  return build(spec, [
    { f: 0, pose: wind },
    { f: Math.max(1, f - 1), pose: pre },
    { f, pose: shift(pre, diff(pre, post, 0.5)) },
    { f: f + 1, pose: post },
    { f: spec.frames - 1, pose: settle },
  ]);
}

function diff(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as Alias[]);
  for (const key of keys) {
    const av = a[key] ?? [0, 0, 0];
    const bv = b[key] ?? [0, 0, 0];
    out[key] = [(bv[0] - av[0]) * k, (bv[1] - av[1]) * k, (bv[2] - av[2]) * k];
  }
  return out;
}

/**
 * A catch. The marker is FULL EXTENSION — the instant the glove is furthest
 * from the body — because that is where the ball meets it, and because that is
 * the quantity the validator can find in a delivered file. (Peak hand SPEED,
 * which is the right derivation for a throw, is wrong here: on a leaping catch
 * the fastest the glove ever moves is during the take-off.)
 *
 * So the frames after the marker must gather the ball IN, never reach further.
 */
function catchClip(spec: ClipSpec, reach: Pose, extra: Key[] = []): AnimationClip {
  const f = spec.marker!.frame;
  const ready = FIELD_READY_POSE;
  const half = shift(ready, diff(ready, reach, 0.35));
  const gather = shift(reach, diff(reach, ready, 0.18));
  return build(spec, [
    { f: 0, pose: ready },
    { f: Math.max(1, f - 2), pose: half },
    { f, pose: reach },
    { f: f + 2, pose: gather },
    ...extra,
    { f: spec.frames - 1, pose: shift(ready, { la: [-10, 0, 0], ra: [-6, 0, 0] }) },
  ]);
}

/**
 * Face down, arms gathered under the chest. Shared by the end of a dive, the
 * end of a slide and the start of `getup`, so the three blend into each other
 * without a pop — which is the `returnsTo` chain doing its job.
 */
const PRONE_POSE: Pose = {
  hp: [-8, 0, 0],
  sp: [-10, 0, 0],
  s2: [-6, 0, 0],
  hd: [-14, 0, 0],
  la: [26, 0, 58],
  lf: [0, -74, 0],
  ra: [26, 0, -58],
  rf: [0, 74, 0],
  lu: [-14, 0, 8],
  ll: [-24, 0, 0],
  ru: [-14, 0, -8],
  rl: [-24, 0, 0],
};

/**
 * A dive. `Root` never moves; the HIPS travel `bodyTravelFt` laterally, which
 * is the reach the sim grants for the dive window — the two numbers are the
 * same number on purpose (see BODY_TRAVEL in clips.ts).
 */
function dive(spec: ClipSpec, dir: number): AnimationClip {
  const travel = spec.bodyTravelFt!;
  const f = spec.marker!.frame;
  // The GLOVE hand is always the left one (`Prop_GloveAnchor` hangs off it), so
  // both dives extend the left arm — the right-hand dive is a backhand. Only
  // the body roll and the travel direction flip.
  const air: Pose = {
    hp: [10, 0, 74 * dir],
    sp: [-6, 0, 10 * dir],
    s2: [-4, 0, 8 * dir],
    hd: [-16, 0, -20 * dir],
    la: [-24, 0, 4],
    lf: [0, -8, 0],
    ra: [-40, 0, -96],
    rf: [0, 30, 0],
    lu: [-16, 0, 10],
    ru: [-16, 0, -10],
    ll: [-30, 0, 0],
    rl: [-30, 0, 0],
  };
  // Full extension has to be UNIQUE to the marker frame, or "where is the
  // glove furthest from the body" has two answers and the marker is ambiguous.
  const reaching = shift(FIELD_READY_POSE, diff(FIELD_READY_POSE, air, 0.7));
  const gather = shift(air, diff(air, FIELD_READY_POSE, 0.2));
  return build(spec, [
    { f: 0, pose: FIELD_READY_POSE, hips: [0, 0, 0] },
    { f: 5, pose: shift(FIELD_READY_POSE, { hp: [10, 0, 20 * dir], lu: [-14, 0, 0], ru: [-14, 0, 0] }), hips: [travel * 0.06 * dir, -0.18, 0] },
    { f: f - 2, pose: reaching, hips: [travel * 0.42 * dir, 0.35, 0] },
    // Full extension, glove on the ball.
    { f, pose: air, hips: [travel * 0.8 * dir, 0.3, 0] },
    { f: f + 4, pose: shift(gather, { hd: [10, 0, 0] }), hips: [travel * dir, -0.55, 0] },
    // Prone, glove TUCKED IN. Not just style: full extension is what defines
    // the catch frame, so a prone pose that leaves the arm outstretched is a
    // second answer to "where is the glove furthest from the body" and makes
    // the marker unfindable. It landed on frame 44.
    { f: 30, pose: PRONE_POSE, hips: [travel * dir, -1.25, 0.1] },
    { f: spec.frames - 1, pose: shift(PRONE_POSE, { hd: [-6, 0, 0] }), hips: [travel * dir, -1.3, 0.12] },
  ]);
}

/** Prone -> standing. Sell the effort: a push, a stagger, then upright. */
function getup(spec: ClipSpec): AnimationClip {
  // Opens on the SAME pose a dive and a slide end on, so the settle chain
  // dive -> getup -> field_ready has nothing to pop across.
  const prone = PRONE_POSE;
  return build(spec, [
    { f: 0, pose: prone, hips: [0, -1.3, 0.12] },
    { f: 10, pose: shift(prone, { hp: [30, 0, 0], la: [-30, 0, 0], ra: [-30, 0, 0] }), hips: [0, -1.0, 0.2] },
    { f: 22, pose: { hp: [42, 0, 0], sp: [10, 0, 0], lu: [64, 0, 12], ll: [-90, 0, 0], ru: [50, 0, -12], rl: [-70, 0, 0], la: [-20, 0, 50], ra: [-20, 0, -50] }, hips: [0, -0.5, 0.3] },
    { f: 32, pose: shift(FIELD_READY_POSE, { hp: [-10, 0, 0], hd: [10, 0, 0] }), hips: [0, 0.06, 0.1] },
    { f: spec.frames - 1, pose: FIELD_READY_POSE, hips: [0, 0, 0] },
  ]);
}

/**
 * The slide. Body DOWN, legs OUT, and horizontal travel kept under
 * `bodyTravelFt` — the runner's ground track down the basepath belongs to the
 * sim, and a slide that also travels forward arrives at a base early.
 */
function slide(spec: ClipSpec): AnimationClip {
  const travel = spec.bodyTravelFt!;
  const down: Pose = {
    hp: [-52, 0, 0],
    sp: [-14, 0, 0],
    s2: [-10, 0, 0],
    hd: [26, 0, 0],
    lu: [72, 0, 8],
    ll: [-16, 0, 0],
    ru: [30, 0, -8],
    rl: [-96, 0, 0],
    la: [-40, 0, 74],
    ra: [-40, 0, -74],
  };
  return build(spec, [
    { f: 0, pose: { hp: [8, 0, 0], lu: [30, 0, 6], ll: [-40, 0, 0], ru: [-20, 0, -6], la: [10, 0, 60], ra: [10, 0, -60] }, hips: [0, 0, 0] },
    { f: 6, pose: shift(down, { hp: [16, 0, 0] }), hips: [0, -0.55, travel * 0.5] },
    { f: 14, pose: down, hips: [0, -1.15, travel * 0.9] },
    { f: 28, pose: shift(down, { hd: [-8, 0, 0], la: [20, 0, 0], ra: [20, 0, 0] }), hips: [0, -1.2, travel] },
    { f: spec.frames - 1, pose: shift(down, { hd: [-14, 0, 0], la: [26, 0, 0], ra: [26, 0, 0], lu: [-20, 0, 0], ru: [10, 0, 0] }), hips: [0, -1.25, travel] },
  ]);
}

// --- The library -------------------------------------------------------------

const BUILDERS: Record<string, (spec: ClipSpec) => AnimationClip> = {
  idle,
  idle_fidget: (s) =>
    build(s, [
      { f: 0, pose: {} },
      { f: 20, pose: { ra: [-96, 0, -30], rf: [0, 96, 0], hd: [-8, 0, 6], s2: [3, 0, 0] } },
      { f: 34, pose: { ra: [-104, 0, -24], rf: [0, 108, 0], hd: [-10, 0, 8] } },
      { f: 52, pose: { ra: [-90, 0, -36], rf: [0, 88, 0], hd: [-6, 0, 4], ru: [-8, 0, 0] } },
      { f: 68, pose: { ru: [-18, 0, 0], rl: [26, 0, 0], hp: [0, -6, 0], s2: [2, -4, 0] } },
      { f: s.frames - 1, pose: {} },
    ]),
  run: (s) => runCycle(s, 12, 44, 42),
  run_fast: (s) => runCycle(s, 20, 54, 54),
  trot: (s) => runCycle(s, 4, 28, 24),
  jog_back: jogBack,
  shuffle_left: (s) => shuffle(s, -1),
  shuffle_right: (s) => shuffle(s, 1),

  bat_stance: (s) => breathe(s, BAT_STANCE_POSE, 2.2),
  bat_load: (s) =>
    build(s, [
      { f: 0, pose: BAT_STANCE_POSE },
      { f: 7, pose: shift(BAT_STANCE_POSE, { s2: [0, -14, 0], ra: [-10, 0, -12], lu: [-8, 0, 0], hp: [0, -6, 0] }) },
      { f: s.frames - 1, pose: shift(BAT_STANCE_POSE, { s2: [0, -16, 0], ra: [-8, 0, -10], hp: [0, -8, 0] }) },
    ]),
  swing_contact: swingContact,
  swing_follow: (s) => {
    const end = shift(BAT_STANCE_POSE, { hp: [0, 76, 0], sp: [0, 52, 0], s2: [0, 72, 0], ra: [36, 0, 84], la: [28, 0, -66] });
    return build(s, [
      { f: 0, pose: end },
      { f: 8, pose: shift(end, { hp: [0, 14, 0], s2: [0, 10, 0], ra: [-10, 0, -20], la: [-6, 0, 16] }) },
      { f: s.frames - 1, pose: BAT_STANCE_POSE },
    ]);
  },
  swing_whiff: (s) => {
    const over = shift(BAT_STANCE_POSE, { hp: [0, 128, 0], sp: [0, 60, 0], s2: [0, 96, 0], ra: [40, 0, 96], la: [34, 0, -78], lu: [-24, 0, 0], hd: [12, 0, 0] });
    return build(s, [
      { f: 0, pose: shift(BAT_STANCE_POSE, { s2: [0, -16, 0] }) },
      { f: 7, pose: shift(BAT_STANCE_POSE, { hp: [0, 50, 0], s2: [0, 46, 0], ra: [26, 0, 52] }) },
      { f: 12, pose: over },
      { f: 20, pose: shift(over, { hp: [0, 16, 0], hd: [-10, 0, 0], lu: [10, 0, 0] }) },
      { f: s.frames - 1, pose: BAT_STANCE_POSE },
    ]);
  },
  bunt: (s) =>
    build(s, [
      { f: 0, pose: BAT_STANCE_POSE },
      { f: 8, pose: { hp: [14, 34, 0], sp: [10, 0, 0], hd: [0, 8, 0], lu: [26, 0, 12], ll: [-38, 0, 0], ru: [26, 0, -12], rl: [-38, 0, 0], la: [-70, 0, 30], lf: [0, -40, 0], ra: [-60, 0, -34], rf: [0, 36, 0] } },
      { f: 16, pose: { hp: [16, 36, 0], sp: [12, 0, 0], hd: [0, 6, 0], lu: [28, 0, 12], ll: [-40, 0, 0], ru: [28, 0, -12], rl: [-40, 0, 0], la: [-72, 0, 28], lf: [0, -38, 0], ra: [-62, 0, -32], rf: [0, 34, 0] } },
      { f: s.frames - 1, pose: BAT_STANCE_POSE },
    ]),

  pitch_windup: (s) =>
    build(s, [
      { f: 0, pose: { hp: [0, -8, 0], la: [-16, 0, 62], ra: [-16, 0, -62] } },
      { f: 12, pose: { hp: [0, -22, 0], s2: [-8, -10, 0], hd: [-6, -14, 0], lu: [-96, 0, 14], ll: [104, 0, 0], la: [-40, 0, 40], ra: [-30, 0, -48] } },
      { f: 22, pose: { hp: [-4, -30, 0], s2: [-12, -16, 0], hd: [-8, -18, 0], lu: [-110, 0, 16], ll: [118, 0, 0], la: [-70, 0, 32], ra: [-24, 0, -54] } },
      { f: s.frames - 1, pose: { hp: [-2, -28, 0], s2: [-10, -14, 0], lu: [-104, 0, 16], ll: [112, 0, 0], la: [-64, 0, 34], ra: [-28, 0, -52] } },
    ]),
  pitch_stride: (s) =>
    build(s, [
      { f: 0, pose: { hp: [-2, -28, 0], lu: [-104, 0, 16], ll: [112, 0, 0], la: [-64, 0, 34], ra: [-28, 0, -52] } },
      { f: 7, pose: { hp: [8, -14, 0], sp: [6, 0, 0], lu: [-34, 0, 12], ll: [30, 0, 0], ru: [16, 0, -10], la: [-40, 0, 44], ra: [-96, 0, -30] } },
      { f: s.frames - 1, pose: { hp: [12, -6, 0], sp: [10, 0, 0], lu: [26, 0, 10], ll: [-20, 0, 0], ru: [-14, 0, -8], la: [-20, 0, 52], ra: [-140, 0, -18] } },
    ]),
  pitch_release: (s) =>
    releaseClip(
      s,
      { hp: [12, -6, 0], sp: [10, 0, 0], lu: [26, 0, 10], ll: [-20, 0, 0], la: [-20, 0, 52], ra: [-140, 0, -18] },
      { hp: [14, -2, 0], sp: [12, 0, 0], lu: [28, 0, 10], ll: [-22, 0, 0], la: [-10, 0, 54], ra: [-152, 0, -10] },
      { hp: [18, 10, 0], sp: [20, 0, 0], lu: [30, 0, 10], ll: [-24, 0, 0], la: [4, 0, 56], ra: [-40, 0, -6] },
      { hp: [24, 14, 0], sp: [24, 0, 0], hd: [-14, 0, 0], lu: [34, 0, 12], ll: [-30, 0, 0], ru: [-20, 0, -10], la: [-24, 0, 50], ra: [26, 0, -40] }
    ),

  field_ready: (s) => breathe(s, FIELD_READY_POSE, 2.6),
  field_scoop: (s) =>
    catchClip(s, {
      hp: [46, 0, 0],
      sp: [16, 0, 0],
      hd: [-42, 0, 0],
      lu: [76, 0, 16],
      ll: [-92, 0, 0],
      ru: [64, 0, -16],
      rl: [-84, 0, 0],
      la: [-88, 0, 26],
      lf: [0, -30, 0],
      ra: [-78, 0, -24],
      rf: [0, 28, 0],
    }),
  catch_high: (s) =>
    catchClip(s, {
      hp: [-6, 0, 0],
      sp: [-8, 0, 0],
      hd: [-30, 0, 0],
      la: [-166, 0, 24],
      lf: [0, -16, 0],
      ra: [-120, 0, -40],
      lu: [-8, 0, 8],
      ru: [-8, 0, -8],
    }),
  catch_chest: (s) =>
    catchClip(s, {
      hp: [12, 0, 0],
      sp: [4, 0, 0],
      hd: [-14, 0, 0],
      la: [-96, 0, 30],
      lf: [0, -40, 0],
      ra: [-72, 0, -36],
      rf: [0, 34, 0],
      lu: [22, 0, 12],
      ll: [-34, 0, 0],
      ru: [22, 0, -12],
      rl: [-34, 0, 0],
    }),
  catch_low: (s) =>
    catchClip(s, {
      hp: [52, 0, 0],
      sp: [18, 0, 0],
      hd: [-46, 0, 0],
      lu: [86, 0, 18],
      ll: [-104, 0, 0],
      ru: [70, 0, -18],
      rl: [-96, 0, 0],
      la: [-80, 0, 22],
      lf: [0, -26, 0],
      ra: [-66, 0, -22],
    }),
  catch_jump: (s) => {
    const f = s.marker!.frame;
    const up: Pose = { hp: [-10, 0, 0], sp: [-10, 0, 0], hd: [-36, 0, 0], la: [-172, 0, 20], ra: [-130, 0, -34], lu: [-30, 0, 8], ll: [50, 0, 0], ru: [-24, 0, -8], rl: [40, 0, 0] };
    // The glove must be UNIQUELY furthest from the body on frame `f`, or the
    // marker is ambiguous — the rise and the reach have to peak together.
    const rising = shift(FIELD_READY_POSE, diff(FIELD_READY_POSE, up, 0.6));
    const gather = shift(up, diff(up, FIELD_READY_POSE, 0.2));
    return build(s, [
      { f: 0, pose: FIELD_READY_POSE, hips: [0, 0, 0] },
      { f: 5, pose: shift(FIELD_READY_POSE, { hp: [16, 0, 0], lu: [22, 0, 0], ru: [22, 0, 0], la: [40, 0, 0], ra: [40, 0, 0] }), hips: [0, -0.35, 0] },
      { f: f - 3, pose: rising, hips: [0, 1.5, 0] },
      { f, pose: up, hips: [0, 2.1, 0] },
      { f: f + 4, pose: gather, hips: [0, 1.7, 0] },
      { f: 24, pose: shift(FIELD_READY_POSE, { hp: [18, 0, 0], lu: [16, 0, 0], ru: [16, 0, 0] }), hips: [0, -0.3, 0] },
      { f: s.frames - 1, pose: FIELD_READY_POSE, hips: [0, 0, 0] },
    ]);
  },
  dive_left: (s) => dive(s, -1),
  dive_right: (s) => dive(s, 1),
  getup,
  throw_overhand: (s) =>
    releaseClip(
      s,
      { hp: [4, -30, 0], sp: [0, -18, 0], hd: [0, 22, 0], ra: [-30, 0, -58], rf: [0, 60, 0], la: [-60, 0, 40], lu: [14, 0, 10], ru: [-10, 0, -10] },
      { hp: [8, -18, 0], sp: [4, -10, 0], hd: [0, 14, 0], ra: [-150, 0, -16], rf: [0, 30, 0], la: [-40, 0, 48], lu: [24, 0, 10], ru: [-16, 0, -10] },
      { hp: [12, 24, 0], sp: [16, 16, 0], hd: [-8, -6, 0], ra: [-30, 0, -4], rf: [0, 10, 0], la: [-16, 0, 44], lu: [30, 0, 10], ru: [-22, 0, -10] },
      { hp: [18, 30, 0], sp: [22, 20, 0], hd: [-12, -10, 0], ra: [30, 0, -34], rf: [0, 24, 0], la: [-30, 0, 46], lu: [36, 0, 12], ru: [-26, 0, -12] }
    ),
  throw_quick: (s) =>
    build(s, [
      { f: 0, pose: FIELD_READY_POSE },
      { f: 4, pose: shift(FIELD_READY_POSE, { ra: [-100, 0, -30], rf: [0, 62, 0], s2: [0, -14, 0] }) },
      { f: 7, pose: shift(FIELD_READY_POSE, { ra: [-30, 0, -8], rf: [0, 14, 0], s2: [0, 16, 0], hp: [0, 12, 0] }) },
      { f: s.frames - 1, pose: shift(FIELD_READY_POSE, { ra: [20, 0, -34], s2: [0, 10, 0] }) },
    ]),

  slide,

  cheer: (s) =>
    build(s, [
      { f: 0, pose: {} },
      { f: 6, pose: { hp: [22, 0, 0], lu: [34, 0, 10], ll: [-52, 0, 0], ru: [34, 0, -10], rl: [-52, 0, 0], la: [30, 0, 40], ra: [30, 0, -40] } },
      { f: 14, pose: { hp: [-8, 0, 0], hd: [-16, 0, 0], la: [-172, 0, 16], ra: [-172, 0, -16], lu: [-26, 0, 8], ll: [46, 0, 0], ru: [-26, 0, -8], rl: [46, 0, 0] } },
      { f: 24, pose: { hp: [-6, 0, 0], hd: [-12, 0, 0], la: [-166, 0, 22], ra: [-166, 0, -22], lu: [-10, 0, 8], ru: [-10, 0, -8] } },
      { f: 32, pose: { hp: [14, 0, 0], hd: [-6, 0, 0], la: [-150, 0, 26], ra: [-150, 0, -26], lu: [22, 0, 10], ll: [-30, 0, 0], ru: [22, 0, -10], rl: [-30, 0, 0] } },
      { f: s.frames - 1, pose: {} },
    ]),
  upset: (s) =>
    build(s, [
      { f: 0, pose: BAT_STANCE_POSE },
      { f: 10, pose: { hp: [0, -14, 0], s2: [8, -10, 0], hd: [22, -18, 0], la: [-6, 0, 66], ra: [-6, 0, -66] } },
      { f: 26, pose: { hp: [10, 0, 0], sp: [14, 0, 0], s2: [10, 0, 0], hd: [30, 0, 0], la: [8, 0, 70], ra: [8, 0, -70], lu: [12, 0, 10], ru: [12, 0, -10] } },
      { f: 44, pose: { hp: [12, 0, 0], sp: [16, 0, 0], hd: [34, 0, 0], la: [10, 0, 72], ra: [10, 0, -72] } },
      { f: s.frames - 1, pose: { hp: [6, 0, 0], sp: [8, 0, 0], hd: [18, 0, 0], la: [4, 0, 68], ra: [4, 0, -68] } },
    ]),
  nervous: (s) =>
    cycle(s, (p) => {
      const sway = sin(p) * 5;
      const look = sin(p, 0.33) * 16;
      return {
        hp: [4, sway, 0],
        sp: [4, sway * 0.4, 0],
        s2: [2, -sway * 0.5, 0],
        hd: [-4, look, sin(p, 0.11) * 3],
        la: [-14, 0, 60 + sway],
        lf: [0, -46, 0],
        ra: [-14, 0, -60 - sway],
        rf: [0, 46, 0],
        lu: [4 + sway * 0.6, 0, 10],
        ru: [4 - sway * 0.6, 0, -10],
      };
    }),
  dodge: (s) =>
    build(s, [
      { f: 0, pose: BAT_STANCE_POSE },
      // Fast in...
      { f: 4, pose: shift(BAT_STANCE_POSE, { hp: [-26, 0, 0], sp: [-16, 0, 0], s2: [-14, 0, 0], hd: [-24, -30, 0], la: [-30, 0, 26], ra: [-20, 0, -30], lu: [-16, 0, 0] }) },
      { f: 8, pose: shift(BAT_STANCE_POSE, { hp: [-30, 0, 0], sp: [-18, 0, 0], hd: [-28, -34, 0], la: [-34, 0, 24], ra: [-24, 0, -28] }) },
      // ...slow recover.
      { f: 18, pose: shift(BAT_STANCE_POSE, { hp: [-10, 0, 0], hd: [-8, -12, 0] }) },
      { f: s.frames - 1, pose: BAT_STANCE_POSE },
    ]),

  walk_on: walkOn,
  pose_card: (s) => {
    // The held hero pose, keyed twice. Chest out, bat on the shoulder.
    const hero: Pose = {
      hp: [0, -14, 0],
      sp: [-6, -8, 0],
      s2: [-4, -10, 0],
      hd: [-4, 16, 0],
      la: [-30, 0, 46],
      lf: [0, -70, 0],
      ra: [-116, 0, -22],
      rf: [0, 86, 0],
      lu: [2, 0, 12],
      ru: [-4, 0, -14],
      rl: [-10, 0, 0],
    };
    return build(s, [
      { f: 0, pose: hero },
      { f: 1, pose: hero },
    ]);
  },
};

/**
 * Build the whole placeholder library. Every name in `clips.ts` is covered —
 * a missing one would be a silent fallback to `idle` in the director, i.e. a
 * clip nobody ever notices is not being reviewed.
 */
export function buildProceduralClips(): AnimationClip[] {
  return CLIPS.map((spec) => {
    const make = BUILDERS[spec.name];
    if (!make) throw new Error(`No procedural stand-in for "${spec.name}"`);
    return make(spec as ClipSpec);
  });
}
