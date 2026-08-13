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

import {
  AnimationClip,
  Euler,
  type Interpolant,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import { CLIPS, FPS, type ClipSpec } from './clips';
import { SKELETON, bindWorld } from './skeleton';

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
 * How many times per frame the ground solve samples a clip.
 *
 * ★ SAMPLING THE KEYS IS NOT ENOUGH. The mixer SLERPS between them, and the
 * composed world Y of a toe is not monotone along that arc — solving on keys
 * alone left `pitch_stride` dipping 0.029ft under the field between two keys
 * that were both exactly on it. Four samples a frame is 120Hz against a 30fps
 * library, which drives the residual to float32 storage precision.
 */
const GROUND_SUBSAMPLES = 4;

/** How far below the field a bone may sit: float32 track storage, not slack. */
export const GROUND_EPSILON_FT = 1e-4;

/**
 * The lowest world Y any bone reaches, given each bone's rotation and the hips'
 * position — the pose forward-kinematically resolved.
 *
 * The bind pose's answer is 0: `skeleton.test.ts` § "stands the rig on the
 * floor" asserts the toes sit exactly there, and its comment already says why it
 * matters — "a rig whose toes float or sink is a rig every foot-plant in the
 * library is authored wrong on". This asks that same question of a POSED
 * skeleton, which is the half nothing was asking.
 *
 * All bones, not just the toes: a prone dive is held up by a forearm, and a rule
 * that only watched the feet would let a chest through the grass.
 */
function lowestBoneY(rot: Map<string, Quaternion>, hips: Vector3): number {
  const worldPos = new Map<string, Vector3>();
  const worldRot = new Map<string, Quaternion>();
  let lowest = Infinity;

  for (const b of SKELETON) {
    const local = b.name === 'Hips' ? hips.clone() : new Vector3(b.pos[0], b.pos[1], b.pos[2]);
    const parentPos = b.parent ? worldPos.get(b.parent)! : new Vector3();
    const parentRot = b.parent ? worldRot.get(b.parent)! : new Quaternion();

    const at = local.applyQuaternion(parentRot).add(parentPos);
    worldPos.set(b.name, at);
    worldRot.set(b.name, parentRot.clone().multiply(rot.get(b.name) ?? new Quaternion()));
    // ★ EVERY BONE EXCEPT `Root`, WHICH IS THE FLOOR ITSELF. It sits at the
    // origin by definition and is never keyed, so counting it pins the solve at
    // zero for every clip in the library — the offset comes out 0, the test goes
    // green, and nothing moves. That is exactly what happened on the first
    // attempt. Excluding it is not a tolerance: in the bind pose the
    // next-lowest bones are the two toes, at exactly 0.
    if (b.name !== 'Root') lowest = Math.min(lowest, at.y);
  }
  return lowest;
}

/**
 * The lowest the assembled tracks ever put a bone, sampled through the clip's
 * OWN interpolants.
 *
 * ★ THROUGH THE INTERPOLANTS, not through the keys, for the same reason
 * `bridge.ts` draws the pitch through the sim's integrator rather than lerping
 * release to crossing: the thing being measured has to be the thing that will
 * actually play.
 *
 * `InterpolantFactoryMethodLinear` rather than `createInterpolant`, which three
 * assigns at runtime and does not declare in its types. They are the same object
 * here — nothing in this file calls `setInterpolation`, so LINEAR is what every
 * track already resolves to — and naming it makes the assumption the header
 * states ("LINEAR (slerp) only") checkable instead of implicit. On a quaternion
 * track the linear factory is the SLERP one, which is the whole point.
 */
function lowestOverClip(tracks: readonly (QuaternionKeyframeTrack | VectorKeyframeTrack)[], frames: number): number {
  const spin = new Map<string, Interpolant>();
  let hipsTrack: Interpolant | null = null;
  for (const t of tracks) {
    const [bone, path] = t.name.split('.');
    if (path === 'quaternion') spin.set(bone, t.InterpolantFactoryMethodLinear());
    else if (t.name === 'Hips.position') hipsTrack = t.InterpolantFactoryMethodLinear();
  }

  const rot = new Map<string, Quaternion>();
  const hips = new Vector3();
  let lowest = Infinity;
  const steps = frames * GROUND_SUBSAMPLES;
  for (let i = 0; i <= steps; i++) {
    const t = i / GROUND_SUBSAMPLES / FPS;
    rot.clear();
    for (const [bone, interp] of spin) {
      const v = interp.evaluate(t);
      rot.set(bone, new Quaternion(v[0], v[1], v[2], v[3]));
    }
    if (hipsTrack) {
      const v = hipsTrack.evaluate(t);
      hips.set(v[0], v[1], v[2]);
    } else {
      hips.set(0, HIPS_BIND_Y, 0);
    }
    lowest = Math.min(lowest, lowestBoneY(rot, hips));
  }
  return lowest;
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

  // ★ ALWAYS A HIPS TRACK, not only when a key authored one. The ground offset
  // lives on it, and a clip that authored no `hips` is exactly the case that
  // needed it most — `field_ready` authors none and floated the furthest.
  const hipsValues: number[] = [];
  for (const k of keys) {
    const [x, y, z] = k.hips ?? [0, 0, 0];
    hipsValues.push(x, HIPS_BIND_Y + y, z);
  }
  const hipsTrack = new VectorKeyframeTrack('Hips.position', times, hipsValues);
  tracks.push(hipsTrack);

  // ★ A CLIP IS AUTHORED FREELY AND THEN SET DOWN ON THE GROUND.
  //
  // Every pose in this file is written as joint angles, and bending a knee
  // without also dropping the hips does not lower a kid — it LIFTS HIS FEET.
  // Nothing measured that, so the whole fielding family levitated: `field_ready`
  // held both toes 0.48ft (12% of body height) off the grass, and every pose
  // derived from it — `field_scoop`, `catch_low`, `catch_chest`, `catch_jump`,
  // `throw_quick` — inherited the float. `bat_stance` and the three swings off
  // it hovered 0.08ft. The hand-authored `hips` drops on `dive`, `getup` and
  // `slide` had the opposite sign problem and buried a toe 1.14ft UNDER the
  // field.
  //
  // ★ AND IT COST MORE THAN A LOOK. `render.pitchFraming` recorded the PITCH
  // camera as unable to see its own strike zone and blamed a catcher who is
  // "close and TALL" — 6.43 drawn feet, which is his STANDING height. He was
  // tall because his crouch levitated him instead of lowering him: a framing
  // record describing an animation bug.
  //
  // The correction is ONE rigid Y translation for the whole clip, solved rather
  // than picked. Being rigid is what makes it safe — the vertical motion the
  // author wrote is preserved EXACTLY, so a run keeps its flight phase and
  // `catch_jump` keeps its apex. Planting per KEY would have glued the lower
  // foot down and deleted both. A clip already on the ground solves to zero and
  // is untouched.
  const lift = -lowestOverClip(tracks, spec.frames);
  for (let i = 1; i < hipsValues.length; i += 3) hipsValues[i] += lift;
  hipsTrack.values = new Float32Array(hipsValues);

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
      // Elbow flexion is +Y left / -Y right once the arm hangs: the mirrored
      // opposite signs bent every elbow BACKWARDS (hands behind the hip line,
      // verified forward-kinematically: hand z = -0.38 with the old signs).
      lf: [0, 12, 0],
      rf: [0, -12, 0],
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
      lf: [0, 58, 0],
      ra: [s * armDrive, 0, -72],
      rf: [0, -58, 0],
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
      lf: [0, 34, 0],
      rf: [0, -34, 0],
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

// --- Junebug pilot takes ----------------------------------------------------
//
// These are the first first-party performance pass, not generic schedule
// stand-ins. They stay in this module because `build()` is the one contract-
// aware track assembler and ground solver; a second animation builder would be
// a second interpretation of the same rig. The character delivery exporter
// writes only these names to `anims_nostrike_v1.glb`, so every other kid and
// every other clip continues to use the shared library.

// ⚠️ NO Z-ROLL ON THE UPPER LEGS. This pose carried `lu: [2, 0, 8]` and
// `ru: [-2, 0, -8]`, authored when the rig ran both legs straight down from the
// hip: an 8-degree adduction read as a relaxed stance back then. The rig now
// carries the concept's own 6.75-degree splay (`render.leg-stance` in
// scripts/measures.json), and against it that roll is a 57% CLOSURE — FK on the
// delivered clip measured the ankles at 0.325ft against the bind pose's 0.756,
// which put the thighs and calves into one fused mass and failed rubric 3.12 in
// idle while the bind pose and the run both passed.
//
// It is worth knowing how it hid: 3.12's AUTO half is `measure:fidelity`, which
// reads the BIND-pose front render, and that render was and is correct. Only a
// reviewer looking at the idle still could see it. If the splay is ever
// re-tuned, sweep the signature poses for leg z-terms first.
const JUNEBUG_IDLE_POSE: Pose = {
  hp: [-2, -4, 0], sp: [-2, -2, 0], s2: [-3, -4, 0], nk: [2, 0, 0], hd: [1, 7, -1],
  la: [-3, 0, 72], lf: [0, 15, 0], ra: [-3, 0, -72], rf: [0, -15, 0],
  lu: [2, 0, 0], ru: [-2, 0, 0],
};

const JUNEBUG_STANCE_POSE: Pose = shift(BAT_STANCE_POSE, {
  hp: [5, -4, 0], sp: [3, -5, 0], s2: [2, -8, 0], hd: [-2, 7, -2],
  lu: [8, 0, 1], ll: [-5, 0, 0], ru: [-3, 0, -1], rl: [4, 0, 0],
  la: [-4, 0, 3], lf: [0, -5, 0], ra: [-6, 0, -5], rf: [0, 6, 0],
});

const JUNEBUG_CONTACT_END: Pose = shift(JUNEBUG_STANCE_POSE, {
  hp: [0, 78, 0], sp: [0, 54, 0], s2: [0, 74, 0], hd: [2, -18, 0],
  ra: [38, 0, 86], rf: [0, -28, 0], la: [30, 0, -68], lf: [0, 24, 0],
  lu: [-10, 0, 0], ru: [8, 0, 0], rt: [0, 0, 52],
});

function junebugIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: JUNEBUG_IDLE_POSE },
    { f: 14, pose: shift(JUNEBUG_IDLE_POSE, { sp: [0.7, 0, 0], s2: [0.8, 0, 0], hd: [-0.5, -1.5, 0] }), hips: [0, 0.008, 0] },
    // She checks once, then goes still again. Confidence comes from economy.
    { f: 28, pose: shift(JUNEBUG_IDLE_POSE, { hd: [0, -7, 0], nk: [0, -3, 0], ra: [0, 0, 2] }) },
    { f: 39, pose: shift(JUNEBUG_IDLE_POSE, { hd: [0, -7, 0], nk: [0, -3, 0], ra: [0, 0, 2] }) },
    { f: 49, pose: shift(JUNEBUG_IDLE_POSE, { sp: [0.5, 0, 0], s2: [0.6, 0, 0], hd: [-0.3, -1, 0] }), hips: [0, 0.006, 0] },
    { f: spec.frames, pose: JUNEBUG_IDLE_POSE },
  ]);
}

// ★ THE ARM SWING IS SHALLOWER THAN IT LOOKS ON THE PAGE, and that is worth
// stating because the authored numbers lie about it. These poses are Euler XYZ
// applied in order, and the arm carries a 70-degree Z abduction, so most of a
// large X term becomes TWIST about the arm's own axis rather than a
// forward-and-back swing. The first version authored +/-41 on X and measured
// only 33 degrees of actual swing at the shoulder — and its forearm never moved
// at all, 62 degrees of elbow held flat through every key. Round 5 read the
// result exactly right ("a stiff hinged read, not a run's arm action") off a
// PASS frame, where near-vertical arms are correct and the missing thing is
// everything either side of it.
//
// So the shoulder drives harder AND the elbow pumps: the arm that is forward
// closes to 78, the arm going back opens to 40. Measure this the way the defect
// was found — extract the X swing from the built quaternion track, do not read
// it off the degrees below.
function junebugRun(spec: ClipSpec): AnimationClip {
  const reachA: Pose = {
    hp: [7, 0, 0], sp: [6, -3, 0], s2: [5, 5, 0], hd: [-9, 2, 0],
    lu: [-46, 0, 5], ll: [-12, 0, 0], lt: [18, 0, 0],
    ru: [48, 0, -5], rl: [-76, 0, 0], rt: [9, 0, 0],
    la: [64, 0, 70], lf: [0, 78, 0], ra: [-58, 0, -70], rf: [0, -40, 0],
  };
  const passA: Pose = {
    hp: [9, 0, 0], sp: [7, 4, 0], s2: [6, -5, 0], hd: [-10, -1, 0],
    lu: [4, 0, 4], ll: [-42, 0, 0], lt: [8, 0, 0],
    ru: [2, 0, -4], rl: [-24, 0, 0], rt: [20, 0, 0],
    la: [6, 0, 70], lf: [0, 58, 0], ra: [-5, 0, -70], rf: [0, -58, 0],
  };
  const reachB: Pose = {
    hp: [7, 0, 0], sp: [6, 3, 0], s2: [5, -5, 0], hd: [-9, -2, 0],
    lu: [48, 0, 5], ll: [-76, 0, 0], lt: [9, 0, 0],
    ru: [-46, 0, -5], rl: [-12, 0, 0], rt: [18, 0, 0],
    la: [-58, 0, 70], lf: [0, 40, 0], ra: [64, 0, -70], rf: [0, -78, 0],
  };
  const passB = shift(passA, {
    sp: [0, -8, 0], s2: [0, 10, 0], lu: [-2, 0, 0], ru: [2, 0, 0],
    la: [-11, 0, 0], ra: [11, 0, 0], lf: [0, -6, 0], rf: [0, 6, 0],
  });
  // ★ PHASED SO THE REACH LANDS AT 25% AND 75%, which is `runCycle`'s own
  // convention (its `sin(p)` peaks a quarter of the way through). It used to
  // start ON a reach, so the two run cycles in this file disagreed about where
  // in the loop their extremes were — and a single still captured at a fixed
  // frame therefore caught one at full stretch and the other mid-pass. That is
  // not cosmetic: `capture-character-evidence.mjs` photographs one frame of
  // this loop as the deformation evidence a reviewer scores 3.11 from, and a
  // pass frame shows arms hanging straight because that is what a pass IS.
  // Same poses, same ground contacts, rotated six frames.
  return build(spec, [
    { f: 0, pose: passA, hips: [0, 0.085, 0] },
    { f: 3, pose: shift(reachB, { hp: [-2, 0, 0] }), hips: [0, 0.035, 0] },
    { f: 6, pose: reachB },
    { f: 9, pose: shift(passB, { hp: [-2, 0, 0] }), hips: [0, 0.045, 0] },
    { f: 12, pose: passB, hips: [0, 0.085, 0] },
    { f: 15, pose: shift(reachA, { hp: [-2, 0, 0] }), hips: [0, 0.035, 0] },
    { f: 18, pose: reachA },
    { f: 21, pose: shift(passA, { hp: [-2, 0, 0] }), hips: [0, 0.045, 0] },
    { f: spec.frames, pose: passA, hips: [0, 0.085, 0] },
  ]);
}

function junebugBatStance(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: JUNEBUG_STANCE_POSE },
    { f: 13, pose: shift(JUNEBUG_STANCE_POSE, { s2: [0, -2, 0], ra: [-2, 0, -3], hd: [0, 1, 0] }), hips: [0, -0.012, 0] },
    { f: 24, pose: shift(JUNEBUG_STANCE_POSE, { s2: [0, -4, 0], ra: [-4, 0, -5], rf: [0, 5, 0], hd: [0, -2, 0] }), hips: [0, -0.018, 0] },
    // The waggle stops here: she has decided.
    { f: 36, pose: shift(JUNEBUG_STANCE_POSE, { s2: [0, -4, 0], ra: [-4, 0, -5], rf: [0, 5, 0], hd: [0, -2, 0] }), hips: [0, -0.018, 0] },
    { f: 49, pose: shift(JUNEBUG_STANCE_POSE, { s2: [0, -1, 0], ra: [-1, 0, -2] }), hips: [0, -0.007, 0] },
    { f: spec.frames, pose: JUNEBUG_STANCE_POSE },
  ]);
}

function junebugSwingContact(spec: ClipSpec): AnimationClip {
  const loaded = shift(JUNEBUG_STANCE_POSE, {
    hp: [0, -10, 0], sp: [0, -5, 0], s2: [0, -18, 0],
    ra: [-10, 0, -13], la: [-5, 0, 6], lu: [-8, 0, 0], hd: [0, 4, 0],
  });
  return build(spec, [
    { f: 0, pose: loaded },
    { f: 3, pose: shift(loaded, { hp: [0, 3, 0], s2: [0, 3, 0], hd: [0, -2, 0] }) },
    { f: 5, pose: shift(loaded, { hp: [0, 12, 0], sp: [0, 7, 0], s2: [0, 10, 0], ra: [4, 0, 8], la: [2, 0, -5] }) },
    { f: 6, pose: shift(loaded, { hp: [0, 31, 0], sp: [0, 21, 0], s2: [0, 28, 0], ra: [15, 0, 28], la: [11, 0, -20], rt: [0, 0, 23] }) },
    // Contact: the widest hand sweep is centred on 6 -> 8, making frame 7
    // the derived bat marker rather than merely a number in the brief.
    { f: 7, pose: shift(loaded, { hp: [0, 48, 0], sp: [0, 33, 0], s2: [0, 44, 0], ra: [25, 0, 49], la: [18, 0, -37], rt: [0, 0, 37] }) },
    { f: 8, pose: shift(loaded, { hp: [0, 65, 0], sp: [0, 45, 0], s2: [0, 60, 0], ra: [35, 0, 70], la: [25, 0, -54], rt: [0, 0, 51] }) },
    { f: 12, pose: shift(JUNEBUG_CONTACT_END, { hp: [0, -5, 0], sp: [0, -4, 0], s2: [0, -5, 0] }) },
    { f: spec.frames - 1, pose: JUNEBUG_CONTACT_END },
  ]);
}

function junebugSwingFollow(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: JUNEBUG_CONTACT_END },
    { f: 5, pose: shift(JUNEBUG_CONTACT_END, { hp: [0, 7, 0], s2: [0, 5, 0], hd: [-2, -4, 0], ra: [-4, 0, -8] }) },
    { f: 10, pose: shift(JUNEBUG_CONTACT_END, { hp: [0, -8, 0], sp: [0, -8, 0], s2: [0, -11, 0], ra: [-12, 0, -24], la: [-8, 0, 18] }) },
    // One small shoulder release carries the satisfaction; no victory dance.
    { f: 15, pose: shift(JUNEBUG_STANCE_POSE, { s2: [-5, 0, -2], hd: [1, -5, 0], ra: [-4, 0, -3] }) },
    { f: 20, pose: shift(JUNEBUG_STANCE_POSE, { s2: [-2, 0, -1], hd: [0, -2, 0] }) },
    { f: spec.frames - 1, pose: JUNEBUG_STANCE_POSE },
  ]);
}

/**
 * Junebug squares her jersey collar, scuffs her back foot into place, then
 * becomes completely still again. The action is practical rather than
 * decorative: every adjustment prepares the next pitch.
 */
function junebugIdleFidget(spec: ClipSpec): AnimationClip {
  const check = shift(JUNEBUG_IDLE_POSE, {
    hd: [-4, -7, -2], nk: [2, -3, 0], s2: [2, -3, 0],
    ra: [-100, 0, -28], rf: [0, 104, 0], la: [2, 0, -2],
  });
  const plant = shift(JUNEBUG_IDLE_POSE, {
    hp: [4, -5, 0], sp: [2, -3, 0], hd: [-3, 4, 0],
    ru: [-6, 0, -2], rl: [8, 0, 0], rt: [-6, 0, 0],
    la: [-2, 0, 1], ra: [1, 0, -1],
  });
  return build(spec, [
    { f: 0, pose: JUNEBUG_IDLE_POSE },
    { f: 12, pose: shift(check, { ra: [8, 0, 0], rf: [0, -8, 0] }) },
    { f: 22, pose: check },
    { f: 31, pose: check },
    { f: 43, pose: shift(JUNEBUG_IDLE_POSE, { hd: [-1, -3, 0], ra: [-18, 0, 12], rf: [0, 18, 0] }) },
    { f: 56, pose: plant, hips: [0, 0.035, 0] },
    { f: 65, pose: shift(plant, { ru: [9, 0, 0], rl: [-12, 0, 0], rt: [9, 0, 0], hd: [1, -3, 0] }) },
    { f: 76, pose: shift(JUNEBUG_IDLE_POSE, { hd: [0, -2, 0] }) },
    { f: spec.frames - 1, pose: JUNEBUG_IDLE_POSE },
  ]);
}

/**
 * A fierce win without a broad victory dance: compact load, one clean jump,
 * one fist, then the tiny shoulder release from her direction sheet.
 */
function junebugCheerFierce(spec: ClipSpec): AnimationClip {
  const load = shift(JUNEBUG_IDLE_POSE, {
    hp: [20, 0, 0], sp: [8, 0, 0], s2: [6, 0, 0], hd: [-20, 0, 0],
    lu: [34, 0, 4], ll: [-48, 0, 0], ru: [34, 0, -4], rl: [-48, 0, 0],
    la: [24, 0, -24], lf: [0, 42, 0], ra: [18, 0, 28], rf: [0, -48, 0],
  });
  const punch = shift(JUNEBUG_IDLE_POSE, {
    hp: [-8, 0, 0], sp: [-5, 0, 0], s2: [-8, 0, 0], hd: [-12, 0, -2],
    la: [-128, 0, 30], lf: [0, -38, 0], ra: [-72, 0, -28], rf: [0, 92, 0],
    lu: [-22, 0, 4], ll: [36, 0, 0], ru: [-18, 0, -4], rl: [30, 0, 0],
  });
  return build(spec, [
    { f: 0, pose: JUNEBUG_IDLE_POSE },
    { f: 5, pose: load, hips: [0, 0.03, 0] },
    { f: 11, pose: punch, hips: [0, 0.64, 0] },
    { f: 15, pose: shift(punch, { la: [12, 0, -8], hd: [-2, 0, 0] }), hips: [0, 0.42, 0] },
    { f: 19, pose: shift(load, { hp: [-4, 0, 0], la: [-42, 0, 30], ra: [-30, 0, -24] }), hips: [0, 0.02, 0] },
    { f: 24, pose: shift(JUNEBUG_IDLE_POSE, { s2: [-5, 0, -2], hd: [1, -5, 0], ra: [-4, 0, -3] }) },
    { f: 28, pose: shift(JUNEBUG_IDLE_POSE, { s2: [-2, 0, -1], hd: [0, -2, 0] }) },
    { f: spec.frames - 1, pose: JUNEBUG_IDLE_POSE },
  ]);
}

/** Recoil, one planted stomp, and a visible breath back under control. */
function junebugUpsetFierce(spec: ClipSpec): AnimationClip {
  const recoil = shift(JUNEBUG_IDLE_POSE, {
    hp: [-9, 0, 0], sp: [-8, 0, 0], s2: [-10, 0, 0], hd: [12, -5, 0],
    la: [20, 0, -16], lf: [0, 34, 0], ra: [20, 0, 16], rf: [0, -34, 0],
  });
  const lift = shift(JUNEBUG_IDLE_POSE, {
    hp: [12, 0, 0], sp: [8, 0, 0], hd: [-18, 0, 0],
    ru: [-44, 0, -4], rl: [68, 0, 0], rt: [-16, 0, 0],
    la: [8, 0, -10], lf: [0, 22, 0], ra: [8, 0, 10], rf: [0, -22, 0],
  });
  const planted = shift(JUNEBUG_IDLE_POSE, {
    hp: [28, 0, 0], sp: [16, 0, 0], s2: [11, 0, 0], hd: [-26, 0, 0],
    lu: [35, 0, 5], ll: [-49, 0, 0], ru: [37, 0, -5], rl: [-52, 0, 0],
    la: [18, 0, -18], lf: [0, 36, 0], ra: [18, 0, 18], rf: [0, -36, 0],
  });
  return build(spec, [
    { f: 0, pose: JUNEBUG_IDLE_POSE },
    { f: 6, pose: recoil, hips: [0, 0.08, 0] },
    { f: 13, pose: lift, hips: [0, 0.12, 0] },
    { f: 18, pose: planted, hips: [0, 0.025, 0] },
    { f: 24, pose: shift(planted, { hd: [10, 0, 0], s2: [-4, 0, 0] }) },
    { f: 31, pose: shift(JUNEBUG_IDLE_POSE, { hp: [7, 0, 0], sp: [5, 0, 0], s2: [4, 0, 0], hd: [16, 0, 0] }) },
    { f: 38, pose: shift(JUNEBUG_IDLE_POSE, { sp: [2, 0, 0], s2: [2, 0, 0], hd: [6, 0, 0] }) },
    { f: spec.frames - 1, pose: JUNEBUG_IDLE_POSE },
  ]);
}

// --- Big Talk Theo takes ---------------------------------------------------
//
// Theo leads with his chest and lets each idea run one beat too long. His
// partial delivery carries the five high-frequency baseball clips plus the
// complete priority set from the performance packet.

// The same leg z-roll Junebug's idle carried (see the note there) was authored
// into all five signature idles when the rig ran its legs straight down. FK over
// the delivered clips measured what it costs now that the rig splays: Theo -60%,
// Big Lou -56%, Tank -68%, Mimi -55% of bind-pose ankle separation, every one of
// them a fused-leg mass in idle against a turnaround that draws the stance wide
// (Theo's own drawn leg centreline is the widest on the roster at 0.398ft).
// Removed on all of them together, because they are one defect.
const THEO_IDLE_POSE: Pose = {
  hp: [-5, -8, 0], sp: [-6, -8, 0], s2: [-8, -10, 0], nk: [2, 5, 0], hd: [-3, 13, 2],
  la: [-8, 0, 65], lf: [0, -24, 0], ra: [-8, 0, -65], rf: [0, 24, 0],
  lu: [-3, 0, 0], ru: [3, 0, 0],
};

const THEO_STANCE_POSE: Pose = shift(BAT_STANCE_POSE, {
  hp: [-3, -7, 0], sp: [-4, -8, 0], s2: [-5, -11, 0], hd: [-2, 12, 3],
  la: [-8, 0, 8], lf: [0, -8, 0], ra: [-8, 0, -8], rf: [0, 10, 0],
  lu: [2, 0, 2], ru: [-2, 0, -2],
});

const THEO_CONTACT_END: Pose = shift(THEO_STANCE_POSE, {
  hp: [0, 83, 0], sp: [0, 58, 0], s2: [0, 78, 0], hd: [-3, -21, -2],
  ra: [41, 0, 90], rf: [0, -30, 0], la: [33, 0, -71], lf: [0, 27, 0],
  lu: [-9, 0, 0], ru: [9, 0, 0], rt: [0, 0, 55],
});

function theoIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: THEO_IDLE_POSE },
    { f: 15, pose: shift(THEO_IDLE_POSE, { sp: [2, 0, 0], s2: [3, 0, 0], hd: [-1, -5, 0] }), hips: [0, 0.015, 0] },
    { f: 28, pose: shift(THEO_IDLE_POSE, { hd: [0, -17, -2], ra: [-12, 0, 18], rf: [0, -22, 0] }) },
    { f: 38, pose: shift(THEO_IDLE_POSE, { hd: [0, 14, 2], la: [-8, 0, -10], lf: [0, 15, 0] }) },
    { f: 49, pose: shift(THEO_IDLE_POSE, { sp: [1, 0, 0], s2: [2, 0, 0] }), hips: [0, 0.01, 0] },
    { f: spec.frames, pose: THEO_IDLE_POSE },
  ]);
}

function theoBatStance(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: THEO_STANCE_POSE },
    { f: 12, pose: shift(THEO_STANCE_POSE, { s2: [0, -5, 0], ra: [-5, 0, -8], hd: [0, 5, 0] }), hips: [0, -0.02, 0] },
    { f: 25, pose: shift(THEO_STANCE_POSE, { s2: [0, 7, 0], ra: [5, 0, 10], hd: [0, -12, 0] }), hips: [0, 0.018, 0] },
    { f: 38, pose: shift(THEO_STANCE_POSE, { s2: [0, -7, 0], ra: [-6, 0, -11], hd: [0, 11, 0] }), hips: [0, -0.022, 0] },
    { f: 50, pose: shift(THEO_STANCE_POSE, { s2: [0, 3, 0], ra: [2, 0, 5], hd: [0, -4, 0] }) },
    { f: spec.frames, pose: THEO_STANCE_POSE },
  ]);
}

function theoSwingContact(spec: ClipSpec): AnimationClip {
  const loaded = shift(THEO_STANCE_POSE, { hp: [0, -12, 0], s2: [0, -20, 0], ra: [-11, 0, -15], la: [-6, 0, 7], hd: [0, 7, 0] });
  return build(spec, [
    { f: 0, pose: loaded },
    { f: 3, pose: shift(loaded, { hp: [0, 4, 0], s2: [0, 4, 0] }) },
    { f: 5, pose: shift(loaded, { hp: [0, 14, 0], sp: [0, 8, 0], s2: [0, 12, 0], ra: [5, 0, 10], la: [3, 0, -6] }) },
    { f: 6, pose: shift(loaded, { hp: [0, 34, 0], sp: [0, 23, 0], s2: [0, 30, 0], ra: [17, 0, 31], la: [12, 0, -22], rt: [0, 0, 25] }) },
    { f: 7, pose: shift(loaded, { hp: [0, 52, 0], sp: [0, 36, 0], s2: [0, 48, 0], ra: [28, 0, 54], la: [20, 0, -40], rt: [0, 0, 40] }) },
    { f: 8, pose: shift(loaded, { hp: [0, 70, 0], sp: [0, 49, 0], s2: [0, 65, 0], ra: [39, 0, 76], la: [28, 0, -58], rt: [0, 0, 54] }) },
    { f: 12, pose: shift(THEO_CONTACT_END, { hp: [0, -5, 0], s2: [0, -6, 0] }) },
    { f: spec.frames - 1, pose: THEO_CONTACT_END },
  ]);
}

function theoSwingFollow(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: THEO_CONTACT_END },
    { f: 6, pose: shift(THEO_CONTACT_END, { hp: [0, 9, 0], s2: [0, 7, 0], hd: [-3, -8, 0] }) },
    { f: 12, pose: shift(THEO_STANCE_POSE, { hp: [-8, 10, 0], sp: [-6, 8, 0], s2: [-8, 12, 0], hd: [-5, -22, 4], ra: [-22, 0, -35], la: [-14, 0, 25] }) },
    // He admires the imaginary homer before remembering the next pitch.
    { f: 18, pose: shift(THEO_STANCE_POSE, { hp: [-5, -4, 0], hd: [-2, -15, 2], ra: [-8, 0, -12] }) },
    { f: spec.frames - 1, pose: THEO_STANCE_POSE },
  ]);
}

function theoIdleFidget(spec: ClipSpec): AnimationClip {
  const call = shift(THEO_IDLE_POSE, {
    hp: [-5, -7, 0], sp: [-5, -8, 0], s2: [-7, -12, 0], hd: [-4, -15, 4],
    ra: [-82, 0, -22], rf: [0, 112, 0], la: [-24, 0, 32], lf: [0, -48, 0],
  });
  return build(spec, [
    { f: 0, pose: THEO_IDLE_POSE },
    { f: 12, pose: shift(call, { ra: [18, 0, -12], rf: [0, -18, 0] }) },
    { f: 23, pose: call },
    { f: 34, pose: shift(call, { hd: [0, 30, -3], ra: [-8, 0, 8], rf: [0, 10, 0] }) },
    { f: 46, pose: shift(THEO_IDLE_POSE, { hp: [-8, 0, 0], sp: [-8, 0, 0], s2: [-9, 0, 0], hd: [-5, 10, 2] }) },
    { f: 61, pose: shift(THEO_IDLE_POSE, { hd: [0, -12, 0], la: [-16, 0, 18], lf: [0, -25, 0] }) },
    { f: 75, pose: THEO_IDLE_POSE },
    { f: spec.frames - 1, pose: THEO_IDLE_POSE },
  ]);
}

function theoPoseCard(spec: ClipSpec): AnimationClip {
  const hero = shift(THEO_IDLE_POSE, {
    hp: [-3, -9, 0], sp: [-4, -10, 0], s2: [-6, -13, 0], hd: [-3, 17, 4],
    la: [-42, 0, 45], lf: [0, -72, 0], ra: [-118, 0, -24], rf: [0, 88, 0],
    ru: [-5, 0, -5], rl: [-12, 0, 0],
  });
  return build(spec, [{ f: 0, pose: hero }, { f: 1, pose: hero }]);
}

function theoCheerGoofy(spec: ClipSpec): AnimationClip {
  const point = shift(THEO_IDLE_POSE, { hp: [-10, -4, 0], s2: [-12, -8, 0], hd: [-8, -22, 6], la: [-86, 0, 22], lf: [0, -106, 0], ra: [-26, 0, -50], rf: [0, 70, 0] });
  const wobble = shift(THEO_IDLE_POSE, { hp: [28, 0, 15], sp: [18, 0, 10], hd: [15, 22, -10], la: [-20, 0, 76], ra: [-70, 0, -34], lu: [26, 0, 8], ll: [-42, 0, 0], ru: [-18, 0, -8], rl: [30, 0, 0] });
  return build(spec, [
    { f: 0, pose: THEO_IDLE_POSE },
    { f: 7, pose: point, hips: [0, 0.08, 0] },
    { f: 13, pose: shift(point, { la: [-34, 0, -10], hd: [-2, 10, 0] }), hips: [0, 0.48, 0] },
    { f: 18, pose: wobble, hips: [0.12, 0.04, 0] },
    { f: 24, pose: shift(THEO_IDLE_POSE, { hp: [-8, 0, 0], hd: [-5, -15, 3] }) },
    { f: spec.frames - 1, pose: THEO_IDLE_POSE },
  ]);
}

function theoUpsetGoofy(spec: ClipSpec): AnimationClip {
  const disbelief = shift(THEO_IDLE_POSE, { hp: [10, 0, 0], sp: [12, 0, 0], s2: [10, 0, 0], hd: [22, -18, 10], la: [-15, 0, 82], lf: [0, -68, 0], ra: [-15, 0, -82], rf: [0, 68, 0] });
  return build(spec, [
    { f: 0, pose: THEO_IDLE_POSE },
    { f: 7, pose: disbelief, hips: [0, 0.08, 0] },
    { f: 15, pose: shift(disbelief, { hd: [-8, 34, -18], hp: [8, 0, -12] }), hips: [-0.08, 0.03, 0] },
    { f: 24, pose: shift(THEO_IDLE_POSE, { hp: [18, 0, 0], sp: [12, 0, 0], hd: [25, 0, 0], la: [12, 0, 72], ra: [12, 0, -72] }) },
    { f: 34, pose: shift(THEO_IDLE_POSE, { hd: [4, -9, 2] }) },
    { f: spec.frames - 1, pose: THEO_IDLE_POSE },
  ]);
}

// --- Zoom Ramirez takes ---------------------------------------------------
//
// Zoom's chair remains root-space equipment owned by the simulation. His
// authored locomotion therefore comes from hands, shoulders and torso rather
// than a standing run cycle or animation-driven chair travel.

const ZOOM_IDLE_POSE: Pose = {
  hp: [-3, -3, 0], sp: [-2, -4, 0], s2: [-4, -6, 0], nk: [1, 4, 0], hd: [-2, 9, 1],
  la: [18, 0, 54], lf: [0, -58, 0], ra: [18, 0, -54], rf: [0, 58, 0],
};

const ZOOM_FIELD_POSE: Pose = shift(ZOOM_IDLE_POSE, {
  hp: [8, 0, 0], sp: [8, 0, 0], s2: [7, 0, 0], hd: [-10, -8, 0],
  la: [22, 0, -14], lf: [0, 20, 0], ra: [22, 0, 14], rf: [0, -20, 0],
});

const ZOOM_STANCE_POSE: Pose = shift(BAT_STANCE_POSE, {
  hp: [-2, -5, 0], sp: [-2, -7, 0], s2: [-3, -8, 0], hd: [-1, 10, 1],
  lu: [0, 0, 0], ll: [0, 0, 0], lt: [0, 0, 0],
  ru: [0, 0, 0], rl: [0, 0, 0], rt: [0, 0, 0],
});

const ZOOM_CONTACT_END: Pose = shift(ZOOM_STANCE_POSE, {
  hp: [0, 70, 0], sp: [0, 53, 0], s2: [0, 72, 0], hd: [-2, -18, -1],
  ra: [35, 0, 82], rf: [0, -28, 0], la: [29, 0, -66], lf: [0, 25, 0],
});

function zoomIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: ZOOM_IDLE_POSE },
    { f: 16, pose: shift(ZOOM_IDLE_POSE, { sp: [2, 0, 0], s2: [3, 0, 0], hd: [-1, -5, 0], la: [3, 0, -3], ra: [3, 0, 3] }) },
    { f: 31, pose: shift(ZOOM_IDLE_POSE, { hd: [0, 12, -1], lf: [0, 5, 0], rf: [0, -5, 0] }) },
    { f: 45, pose: shift(ZOOM_IDLE_POSE, { sp: [1, 0, 0], s2: [2, 0, 0], hd: [0, -6, 0] }) },
    { f: spec.frames, pose: ZOOM_IDLE_POSE },
  ]);
}

function zoomRun(spec: ClipSpec): AnimationClip {
  const pushLeft = shift(ZOOM_FIELD_POSE, {
    hp: [1, -10, -3], sp: [2, -9, -3], s2: [3, -8, -2], hd: [1, 7, 1],
    la: [35, 0, -16], lf: [0, 42, 0], ra: [-18, 0, 20], rf: [0, -34, 0],
  });
  const pushRight = shift(ZOOM_FIELD_POSE, {
    hp: [1, 10, 3], sp: [2, 9, 3], s2: [3, 8, 2], hd: [1, -7, -1],
    la: [-18, 0, -20], lf: [0, 34, 0], ra: [35, 0, 16], rf: [0, -42, 0],
  });
  return build(spec, [
    { f: 0, pose: pushLeft },
    { f: 6, pose: ZOOM_FIELD_POSE },
    { f: 12, pose: pushRight },
    { f: 18, pose: ZOOM_FIELD_POSE },
    { f: spec.frames, pose: pushLeft },
  ]);
}

function zoomBatStance(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: ZOOM_STANCE_POSE },
    { f: 15, pose: shift(ZOOM_STANCE_POSE, { s2: [0, -5, 0], hd: [0, 4, 0], la: [-3, 0, 4], ra: [-3, 0, -4] }) },
    { f: 30, pose: shift(ZOOM_STANCE_POSE, { s2: [0, 6, 0], hd: [0, -8, 0], la: [4, 0, -5], ra: [4, 0, 5] }) },
    { f: 45, pose: shift(ZOOM_STANCE_POSE, { s2: [0, -4, 0], hd: [0, 6, 0] }) },
    { f: spec.frames, pose: ZOOM_STANCE_POSE },
  ]);
}

function zoomSwingContact(spec: ClipSpec): AnimationClip {
  const loaded = shift(ZOOM_STANCE_POSE, { hp: [0, -11, 0], sp: [0, -8, 0], s2: [0, -18, 0], ra: [-10, 0, -14], la: [-5, 0, 7], hd: [0, 6, 0] });
  return build(spec, [
    { f: 0, pose: loaded },
    { f: 3, pose: shift(loaded, { hp: [0, 4, 0], s2: [0, 5, 0] }) },
    { f: 5, pose: shift(loaded, { hp: [0, 14, 0], sp: [0, 9, 0], s2: [0, 13, 0], ra: [5, 0, 10], la: [3, 0, -6] }) },
    { f: 6, pose: shift(loaded, { hp: [0, 31, 0], sp: [0, 22, 0], s2: [0, 29, 0], ra: [16, 0, 29], la: [12, 0, -21] }) },
    { f: 7, pose: shift(loaded, { hp: [0, 48, 0], sp: [0, 35, 0], s2: [0, 46, 0], ra: [27, 0, 51], la: [20, 0, -38] }) },
    { f: 8, pose: shift(loaded, { hp: [0, 64, 0], sp: [0, 47, 0], s2: [0, 62, 0], ra: [37, 0, 72], la: [27, 0, -55] }) },
    { f: 12, pose: shift(ZOOM_CONTACT_END, { hp: [0, -5, 0], s2: [0, -6, 0] }) },
    { f: spec.frames - 1, pose: ZOOM_CONTACT_END },
  ]);
}

function zoomSwingFollow(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: ZOOM_CONTACT_END },
    { f: 6, pose: shift(ZOOM_CONTACT_END, { hp: [0, 8, 0], s2: [0, 6, 0], hd: [-2, -7, 0] }) },
    { f: 12, pose: shift(ZOOM_STANCE_POSE, { hp: [-5, 8, 0], sp: [-4, 7, 0], s2: [-6, 10, 0], hd: [-4, -17, 3], ra: [-18, 0, -30], la: [-12, 0, 22] }) },
    { f: 18, pose: shift(ZOOM_STANCE_POSE, { hd: [-2, -12, 2], ra: [-6, 0, -9] }) },
    { f: spec.frames - 1, pose: ZOOM_STANCE_POSE },
  ]);
}

function zoomFieldReady(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: ZOOM_FIELD_POSE },
    { f: 10, pose: shift(ZOOM_FIELD_POSE, { sp: [2, -4, 0], s2: [3, -5, 0], hd: [-2, 6, 0], la: [4, 0, -5], ra: [4, 0, 5] }) },
    { f: 20, pose: shift(ZOOM_FIELD_POSE, { sp: [3, 4, 0], s2: [4, 5, 0], hd: [-3, -8, 0], la: [6, 0, 7], ra: [6, 0, -7] }) },
    { f: 30, pose: shift(ZOOM_FIELD_POSE, { sp: [1, -3, 0], s2: [2, -4, 0], hd: [-1, 5, 0] }) },
    { f: spec.frames, pose: ZOOM_FIELD_POSE },
  ]);
}

function zoomIdleFidget(spec: ClipSpec): AnimationClip {
  const pivot = shift(ZOOM_IDLE_POSE, {
    hp: [0, -18, -3], sp: [2, -14, -2], s2: [3, -12, -2], hd: [-4, 24, 4],
    la: [28, 0, -14], lf: [0, 32, 0], ra: [-24, 0, 16], rf: [0, -38, 0],
  });
  return build(spec, [
    { f: 0, pose: ZOOM_IDLE_POSE },
    { f: 8, pose: pivot },
    { f: 16, pose: shift(pivot, { hp: [0, 22, 5], sp: [0, 18, 4], hd: [0, -35, -6], la: [-40, 0, 20], ra: [38, 0, -18] }) },
    { f: 27, pose: shift(ZOOM_IDLE_POSE, { hd: [-3, -17, 3], s2: [-2, -6, 0], ra: [-10, 0, 12] }) },
    { f: 43, pose: shift(ZOOM_IDLE_POSE, { hd: [-1, 9, -1] }) },
    { f: spec.frames - 1, pose: ZOOM_IDLE_POSE },
  ]);
}

function zoomCheerCool(spec: ClipSpec): AnimationClip {
  const quickTurn = shift(ZOOM_IDLE_POSE, { hp: [-2, 20, 3], sp: [-3, 16, 2], s2: [-5, 14, 2], hd: [-5, -25, 4], la: [-42, 0, 16], lf: [0, -36, 0], ra: [24, 0, -18], rf: [0, 42, 0] });
  const secret = shift(ZOOM_IDLE_POSE, { hp: [-4, -8, -2], sp: [-3, -6, -1], s2: [-5, -7, -1], hd: [-6, 18, 4], la: [-24, 0, 28], lf: [0, -44, 0], ra: [-78, 0, -18], rf: [0, 92, 0] });
  return build(spec, [
    { f: 0, pose: ZOOM_IDLE_POSE },
    { f: 6, pose: quickTurn },
    { f: 12, pose: shift(quickTurn, { hp: [0, -12, -3], hd: [-2, 19, 2], la: [18, 0, -8], ra: [-20, 0, 10] }) },
    { f: 20, pose: secret },
    { f: 28, pose: shift(ZOOM_IDLE_POSE, { hd: [-3, 16, 3], s2: [-2, -4, 0] }) },
    { f: spec.frames - 1, pose: ZOOM_IDLE_POSE },
  ]);
}

function zoomUpsetCool(spec: ClipSpec): AnimationClip {
  const check = shift(ZOOM_IDLE_POSE, { hp: [4, 9, 1], sp: [6, 7, 1], s2: [5, 6, 1], hd: [14, -18, -3], la: [12, 0, 12], lf: [0, -18, 0], ra: [12, 0, -12], rf: [0, 18, 0] });
  return build(spec, [
    { f: 0, pose: ZOOM_IDLE_POSE },
    { f: 7, pose: check },
    { f: 15, pose: shift(check, { hp: [0, -18, -3], hd: [-5, 34, 5], la: [-28, 0, 20], ra: [30, 0, -18] }) },
    { f: 24, pose: shift(ZOOM_IDLE_POSE, { hp: [5, 0, 0], sp: [5, 0, 0], hd: [12, -8, -2], la: [10, 0, 8], ra: [10, 0, -8] }) },
    { f: 32, pose: shift(ZOOM_IDLE_POSE, { hd: [-2, 12, 2] }) },
    { f: spec.frames - 1, pose: ZOOM_IDLE_POSE },
  ]);
}

// --- Big Lou takes --------------------------------------------------------
//
// Lou gathers slowly, then lets the stored turn escape all at once. His head
// trails the bat and his feet do the recovery work; the joke is his delighted
// surprise at the power, never his body or intelligence.

const LOU_IDLE_POSE: Pose = {
  hp: [6, -3, 0], sp: [5, -2, 0], s2: [8, -3, 0], nk: [-2, 2, 0], hd: [-4, 7, 1],
  la: [8, 0, 67], lf: [0, -18, 0], ra: [8, 0, -67], rf: [0, 18, 0],
  lu: [5, 0, 0], ll: [-7, 0, 0], ru: [5, 0, 0], rl: [-7, 0, 0],
};

const LOU_STANCE_POSE: Pose = shift(BAT_STANCE_POSE, {
  hp: [10, -7, 0], sp: [8, -6, 0], s2: [11, -8, 0], hd: [-2, 10, 2],
  la: [-2, 0, 7], lf: [0, -6, 0], ra: [-2, 0, -7], rf: [0, 7, 0],
  lu: [6, 0, 3], ll: [-8, 0, 0], ru: [6, 0, -3], rl: [-8, 0, 0],
});

const LOU_CONTACT_END: Pose = shift(LOU_STANCE_POSE, {
  hp: [0, 91, 0], sp: [0, 62, 0], s2: [0, 85, 0], hd: [6, -30, -2],
  ra: [44, 0, 96], rf: [0, -34, 0], la: [36, 0, -77], lf: [0, 30, 0],
  lu: [-12, 0, 2], ll: [15, 0, 0], ru: [10, 0, -4], rl: [-13, 0, 0], rt: [0, 0, 58],
});

function louIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: LOU_IDLE_POSE },
    { f: 17, pose: shift(LOU_IDLE_POSE, { hp: [2, 0, 0], sp: [2, 0, 0], s2: [3, 0, 0], hd: [-1, -3, 0] }), hips: [0, -0.015, 0] },
    { f: 31, pose: shift(LOU_IDLE_POSE, { hd: [1, 11, 0], ra: [-3, 0, 4] }) },
    { f: 46, pose: shift(LOU_IDLE_POSE, { hp: [1, 0, 0], sp: [1, 0, 0], s2: [2, 0, 0], hd: [0, -4, 0] }) },
    { f: spec.frames, pose: LOU_IDLE_POSE },
  ]);
}

function louBatStance(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: LOU_STANCE_POSE },
    { f: 15, pose: shift(LOU_STANCE_POSE, { hp: [0, -5, 0], s2: [0, -8, 0], ra: [-5, 0, -9], hd: [0, 4, 0] }), hips: [0, -0.035, 0] },
    { f: 31, pose: shift(LOU_STANCE_POSE, { hp: [0, -9, 0], sp: [0, -5, 0], s2: [0, -13, 0], ra: [-8, 0, -13], hd: [0, 7, 0] }), hips: [0, -0.06, 0] },
    { f: 45, pose: shift(LOU_STANCE_POSE, { hp: [0, -4, 0], s2: [0, -6, 0], ra: [-3, 0, -6] }), hips: [0, -0.025, 0] },
    { f: spec.frames, pose: LOU_STANCE_POSE },
  ]);
}

function louSwingContact(spec: ClipSpec): AnimationClip {
  const loaded = shift(LOU_STANCE_POSE, {
    hp: [0, -18, 0], sp: [0, -10, 0], s2: [0, -25, 0], hd: [-2, 12, 0],
    ra: [-15, 0, -20], la: [-8, 0, 10], lu: [8, 0, 0], ru: [8, 0, 0],
  });
  return build(spec, [
    { f: 0, pose: loaded },
    { f: 3, pose: shift(loaded, { hp: [0, 3, 0], s2: [0, 4, 0], hd: [0, 2, 0] }) },
    { f: 5, pose: shift(loaded, { hp: [0, 12, 0], sp: [0, 7, 0], s2: [0, 11, 0], ra: [5, 0, 10], la: [3, 0, -7], hd: [0, -3, 0] }) },
    { f: 6, pose: shift(loaded, { hp: [0, 35, 0], sp: [0, 24, 0], s2: [0, 32, 0], ra: [18, 0, 34], la: [13, 0, -25], hd: [0, -7, 0] }) },
    // The hand sweep peaks around frame 7 while Lou's gaze is still catching
    // up to the torso. The marker therefore remains derived, not declared.
    { f: 7, pose: shift(loaded, { hp: [0, 56, 0], sp: [0, 39, 0], s2: [0, 52, 0], ra: [31, 0, 59], la: [23, 0, -44], hd: [0, -11, 0] }) },
    { f: 8, pose: shift(loaded, { hp: [0, 76, 0], sp: [0, 54, 0], s2: [0, 72, 0], ra: [43, 0, 84], la: [32, 0, -63], hd: [0, -17, 0] }) },
    { f: 12, pose: shift(LOU_CONTACT_END, { hp: [0, -7, 0], s2: [0, -8, 0], hd: [0, 8, 0] }) },
    { f: spec.frames - 1, pose: LOU_CONTACT_END },
  ]);
}

function louSwingFollow(spec: ClipSpec): AnimationClip {
  const scrambleA = shift(LOU_CONTACT_END, {
    hp: [0, 15, 0], s2: [0, 12, 0], hd: [3, -8, 0],
    lu: [22, 0, 2], ll: [-34, 0, 0], ru: [-18, 0, -4], rl: [29, 0, 0],
  });
  const scrambleB = shift(LOU_STANCE_POSE, {
    hp: [8, 20, 0], sp: [6, 13, 0], s2: [8, 18, 0], hd: [-5, -25, 3],
    lu: [-20, 0, 3], ll: [30, 0, 0], ru: [18, 0, -3], rl: [-27, 0, 0],
    ra: [-20, 0, -34], la: [-14, 0, 25],
  });
  return build(spec, [
    { f: 0, pose: LOU_CONTACT_END },
    { f: 5, pose: scrambleA, hips: [0.07, 0.04, 0] },
    { f: 10, pose: scrambleB, hips: [-0.09, 0.025, 0] },
    { f: 15, pose: shift(LOU_STANCE_POSE, { hp: [5, 3, 0], s2: [4, 4, 0], hd: [-3, -18, 2], ra: [-9, 0, -14] }) },
    { f: 20, pose: shift(LOU_STANCE_POSE, { hd: [-1, -8, 1] }) },
    { f: spec.frames - 1, pose: LOU_STANCE_POSE },
  ]);
}

function louPoseCard(spec: ClipSpec): AnimationClip {
  const hero = shift(LOU_IDLE_POSE, {
    hp: [-5, -8, 0], sp: [-4, -7, 0], s2: [-7, -10, 0], hd: [-4, 14, 3],
    la: [-38, 0, 47], lf: [0, -68, 0], ra: [-104, 0, -25], rf: [0, 80, 0],
    lu: [3, 0, 4], ll: [-5, 0, 0], ru: [-2, 0, -4], rl: [4, 0, 0],
  });
  return build(spec, [{ f: 0, pose: hero }, { f: 1, pose: hero }]);
}

function louIdleFidget(spec: ClipSpec): AnimationClip {
  const squareShirt = shift(LOU_IDLE_POSE, {
    hp: [7, 0, 0], sp: [4, 0, 0], hd: [8, -12, 3],
    la: [-72, 0, 34], lf: [0, -68, 0], ra: [-72, 0, -34], rf: [0, 68, 0],
  });
  return build(spec, [
    { f: 0, pose: LOU_IDLE_POSE },
    { f: 12, pose: squareShirt },
    { f: 24, pose: shift(squareShirt, { hd: [-4, 24, -5], la: [-8, 0, 4], ra: [-8, 0, -4] }) },
    { f: 38, pose: shift(LOU_IDLE_POSE, { hp: [4, -5, 0], s2: [4, -5, 0], hd: [-6, -15, 4], ra: [-20, 0, 16] }) },
    { f: 53, pose: shift(LOU_IDLE_POSE, { hd: [-2, 9, -2] }) },
    { f: spec.frames - 1, pose: LOU_IDLE_POSE },
  ]);
}

function louCheerGoofy(spec: ClipSpec): AnimationClip {
  const surprise = shift(LOU_IDLE_POSE, {
    hp: [-18, -3, 0], sp: [-13, -2, 0], s2: [-16, -4, 0], hd: [-22, 0, 0],
    la: [-72, 0, 50], lf: [0, -50, 0], ra: [-72, 0, -50], rf: [0, 50, 0],
  });
  const delight = shift(LOU_IDLE_POSE, {
    hp: [-7, 8, 0], sp: [-6, 6, 0], s2: [-9, 8, 0], hd: [-10, -17, 6],
    la: [-128, 0, 34], lf: [0, -35, 0], ra: [-128, 0, -34], rf: [0, 35, 0],
  });
  return build(spec, [
    { f: 0, pose: LOU_IDLE_POSE },
    { f: 7, pose: surprise, hips: [0, 0.1, 0] },
    { f: 14, pose: shift(surprise, { hp: [8, 0, 0], hd: [12, 0, 0], la: [-18, 0, 8], ra: [-18, 0, -8] }), hips: [0, 0.36, 0] },
    { f: 21, pose: delight, hips: [0, 0.08, 0] },
    { f: 30, pose: shift(LOU_IDLE_POSE, { hd: [-5, -15, 4], s2: [-3, -4, 0] }) },
    { f: spec.frames - 1, pose: LOU_IDLE_POSE },
  ]);
}

function louUpsetGoofy(spec: ClipSpec): AnimationClip {
  const where = shift(LOU_IDLE_POSE, {
    hp: [12, 0, 0], sp: [9, 0, 0], hd: [-18, 0, 0],
    la: [-45, 0, 57], lf: [0, -45, 0], ra: [-45, 0, -57], rf: [0, 45, 0],
  });
  return build(spec, [
    { f: 0, pose: LOU_IDLE_POSE },
    { f: 8, pose: where },
    { f: 16, pose: shift(where, { hd: [4, -28, 7], hp: [3, 0, 0], la: [12, 0, -10], ra: [12, 0, 10] }) },
    { f: 25, pose: shift(LOU_IDLE_POSE, { hp: [15, 0, 0], sp: [11, 0, 0], hd: [20, 0, 0], la: [-8, 0, 74], ra: [-8, 0, -74] }) },
    { f: 36, pose: shift(LOU_IDLE_POSE, { hd: [-2, -9, 2] }) },
    { f: spec.frames - 1, pose: LOU_IDLE_POSE },
  ]);
}

// --- Tank takes -----------------------------------------------------------
// Tank spends as little motion as possible, then commits the whole low, wide
// frame. Slow anticipations and heavy settles carry power without aggression.

// ★ HIS SLOUCH USED TO HIDE HIS FACE. The pose pitched hips 12, spine 8 and
// spine2 11 — 31 degrees of cumulative forward lean, against Junebug's -7 — and
// at that angle the review camera sees the top of his head. Rubric 3.14 is
// scored from the four `tank-runtime-face-*.png` stills and every one of them
// was a photograph of his scalp; 3.5 and 6.1 ask the same question at hero and
// draft-card size.
//
// This is the round-7 finding on Junebug repeating with a different cause: a
// SIGNATURE idle authored to carry personality, breaking a rubric item that no
// measured metric watches. Her fix removed an 8-degree leg roll from all five
// idles; this one keeps the slouch and halves it. 14 degrees still reads as
// heavy and relaxed — the direction is "power outside, snacky calm inside", and
// the anti-caricature note says sleepy must not become dim — while leaving the
// face where a camera at chest height can see it. The knees keep their bend.
const TANK_IDLE_POSE: Pose = {
  hp: [6, 0, 0], sp: [3, 0, 0], s2: [5, 0, 0], hd: [-4, 3, 0],
  la: [12, 0, 72], lf: [0, -12, 0], ra: [12, 0, -72], rf: [0, 12, 0],
  lu: [12, 0, 0], ll: [-18, 0, 0], ru: [12, 0, 0], rl: [-18, 0, 0],
};
const TANK_STANCE_POSE: Pose = shift(BAT_STANCE_POSE, {
  hp: [17, -10, 0], sp: [12, -7, 0], s2: [16, -12, 0], hd: [5, 7, 0],
  lu: [10, 0, 4], ll: [-15, 0, 0], ru: [10, 0, -4], rl: [-15, 0, 0],
});
const TANK_CONTACT_END: Pose = shift(TANK_STANCE_POSE, {
  hp: [0, 96, 0], sp: [0, 68, 0], s2: [0, 91, 0], hd: [8, -34, 0],
  ra: [47, 0, 100], la: [39, 0, -80], rt: [0, 0, 62],
});

function tankSwingContact(spec: ClipSpec): AnimationClip {
  const load = shift(TANK_STANCE_POSE, { hp: [0, -22, 0], s2: [0, -29, 0], ra: [-17, 0, -22], hd: [0, 12, 0] });
  return build(spec, [
    { f: 0, pose: load },
    { f: 4, pose: shift(load, { hp: [0, 4, 0], s2: [0, 5, 0] }) },
    { f: 6, pose: shift(load, { hp: [0, 38, 0], sp: [0, 27, 0], s2: [0, 35, 0], ra: [20, 0, 38], la: [15, 0, -28] }) },
    { f: 7, pose: shift(load, { hp: [0, 61, 0], sp: [0, 43, 0], s2: [0, 57, 0], ra: [34, 0, 65], la: [25, 0, -48] }) },
    { f: 8, pose: shift(load, { hp: [0, 83, 0], sp: [0, 59, 0], s2: [0, 79, 0], ra: [48, 0, 92], la: [35, 0, -68] }) },
    { f: 13, pose: TANK_CONTACT_END },
    { f: spec.frames - 1, pose: TANK_CONTACT_END },
  ]);
}

function tankSwingFollow(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: TANK_CONTACT_END },
    { f: 7, pose: shift(TANK_CONTACT_END, { hp: [8, 9, 0], s2: [6, 8, 0], hd: [4, -9, 0] }) },
    { f: 14, pose: shift(TANK_STANCE_POSE, { hp: [17, 4, 0], sp: [12, 3, 0], hd: [12, -16, 0], ra: [-14, 0, -24] }), hips: [0, -0.08, 0] },
    { f: 20, pose: shift(TANK_STANCE_POSE, { hp: [8, 0, 0], hd: [6, -6, 0] }) },
    { f: spec.frames - 1, pose: TANK_STANCE_POSE },
  ]);
}

function tankIdleFidget(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: TANK_IDLE_POSE },
    { f: 18, pose: shift(TANK_IDLE_POSE, { hp: [8, 0, 0], sp: [5, 0, 0], hd: [10, -14, 0], ra: [-82, 0, -34], rf: [0, 84, 0] }) },
    { f: 34, pose: shift(TANK_IDLE_POSE, { hp: [18, 0, 0], sp: [12, 0, 0], hd: [18, 12, 0], ra: [-50, 0, -50], rf: [0, 54, 0] }), hips: [0, -0.12, 0] },
    { f: 55, pose: shift(TANK_IDLE_POSE, { hp: [14, 0, 0], hd: [8, -7, 0] }) },
    { f: spec.frames - 1, pose: TANK_IDLE_POSE },
  ]);
}

// --- Mimi Mash takes ------------------------------------------------------
// Mimi attacks every pose with both feet. Quick ignition, whole-torso intent
// and one elastic rebound keep the size joyful instead of angry.

const MIMI_IDLE_POSE: Pose = {
  hp: [9, -5, 0], sp: [5, -4, 0], s2: [8, -7, 0], hd: [-5, 7, 0],
  la: [7, 0, 62], lf: [0, -9, 0], ra: [7, 0, -62], rf: [0, 9, 0],
  lu: [11, 0, 0], ll: [-16, 0, 0], ru: [11, 0, 0], rl: [-16, 0, 0],
};
const MIMI_STANCE_POSE: Pose = shift(BAT_STANCE_POSE, {
  hp: [21, -15, 0], sp: [15, -11, 0], s2: [20, -18, 0], hd: [-7, 14, 0],
  la: [-8, 0, 10], ra: [-12, 0, -15],
  lu: [14, 0, 6], ll: [-20, 0, 0], ru: [14, 0, -6], rl: [-20, 0, 0],
});
const MIMI_CONTACT_END: Pose = shift(MIMI_STANCE_POSE, {
  hp: [0, 107, 0], sp: [0, 79, 0], s2: [0, 102, 0], hd: [3, -42, -3],
  ra: [52, 0, 108], rf: [0, -31, 0], la: [43, 0, -88], lf: [0, 27, 0],
  rt: [0, 0, 69], lu: [-9, 0, 2], ll: [12, 0, 0], ru: [9, 0, -3], rl: [-13, 0, 0],
});

function mimiSwingContact(spec: ClipSpec): AnimationClip {
  const load = shift(MIMI_STANCE_POSE, {
    hp: [0, -25, 0], sp: [0, -16, 0], s2: [0, -31, 0], hd: [-3, 17, 0],
    ra: [-19, 0, -25], la: [-11, 0, 14], lu: [7, 0, 0], ru: [7, 0, 0],
  });
  return build(spec, [
    { f: 0, pose: load },
    { f: 2, pose: shift(load, { hp: [0, -4, 0], s2: [0, -6, 0], hd: [0, 4, 0] }), hips: [0, -0.06, 0] },
    { f: 5, pose: shift(load, { hp: [0, 17, 0], sp: [0, 12, 0], s2: [0, 16, 0], ra: [9, 0, 18], la: [7, 0, -13] }) },
    { f: 6, pose: shift(load, { hp: [0, 43, 0], sp: [0, 31, 0], s2: [0, 40, 0], ra: [25, 0, 47], la: [18, 0, -35], hd: [0, -8, 0] }) },
    { f: 7, pose: shift(load, { hp: [0, 69, 0], sp: [0, 50, 0], s2: [0, 65, 0], ra: [41, 0, 76], la: [30, 0, -57], hd: [0, -15, 0] }) },
    { f: 8, pose: shift(load, { hp: [0, 94, 0], sp: [0, 69, 0], s2: [0, 90, 0], ra: [57, 0, 105], la: [42, 0, -79], hd: [0, -23, 0] }), hips: [0.04, 0.06, 0] },
    { f: 12, pose: shift(MIMI_CONTACT_END, { hp: [0, 8, 0], s2: [0, 7, 0], hd: [0, -7, 0] }), hips: [0.09, 0.09, 0] },
    { f: spec.frames - 1, pose: MIMI_CONTACT_END },
  ]);
}

function mimiSwingFollow(spec: ClipSpec): AnimationClip {
  const pulledAround = shift(MIMI_CONTACT_END, {
    hp: [0, 18, 0], sp: [0, 13, 0], s2: [0, 17, 0], hd: [4, -12, 3],
    lu: [20, 0, 2], ll: [-29, 0, 0], ru: [-16, 0, -3], rl: [25, 0, 0],
  });
  return build(spec, [
    { f: 0, pose: MIMI_CONTACT_END },
    { f: 4, pose: pulledAround, hips: [0.12, 0.14, 0] },
    { f: 8, pose: shift(pulledAround, { hp: [8, -13, 0], s2: [7, -11, 0], hd: [-9, 22, -4], lu: [-28, 0, 0], ru: [24, 0, 0] }), hips: [-0.09, -0.04, 0] },
    { f: 13, pose: shift(MIMI_STANCE_POSE, { hp: [8, 9, 0], s2: [6, 8, 0], hd: [-5, -18, 3], ra: [-15, 0, -24] }), hips: [0.03, 0.08, 0] },
    { f: 18, pose: shift(MIMI_STANCE_POSE, { hp: [-3, 0, 0], s2: [-2, 0, 0], hd: [2, 8, -1] }) },
    { f: spec.frames - 1, pose: MIMI_STANCE_POSE },
  ]);
}

function mimiIdleFidget(spec: ClipSpec): AnimationClip {
  const pointFence = shift(MIMI_IDLE_POSE, {
    hp: [10, 18, 0], sp: [8, 14, 0], s2: [12, 21, 0], hd: [-9, -28, 5],
    la: [-72, 0, 42], lf: [0, -48, 0], ra: [-112, 0, -49], rf: [0, 14, 0],
    lu: [8, 0, 4], ll: [-12, 0, 0], ru: [18, 0, -4], rl: [-27, 0, 0],
  });
  return build(spec, [
    { f: 0, pose: MIMI_IDLE_POSE },
    { f: 8, pose: shift(MIMI_IDLE_POSE, { hp: [10, -8, 0], s2: [8, -11, 0], hd: [5, 12, 0] }), hips: [0, -0.1, 0] },
    { f: 15, pose: pointFence, hips: [0.08, 0.1, 0] },
    { f: 24, pose: shift(pointFence, { hp: [-8, 0, 0], s2: [-7, 0, 0], hd: [8, 0, 0] }), hips: [-0.04, -0.04, 0] },
    { f: 36, pose: shift(MIMI_IDLE_POSE, { hp: [5, 3, 0], s2: [4, 4, 0], hd: [-4, -12, 3] }) },
    { f: 51, pose: shift(MIMI_IDLE_POSE, { hp: [-2, 0, 0], hd: [2, 7, -2] }) },
    { f: spec.frames - 1, pose: MIMI_IDLE_POSE },
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

type ReactionStyle = 'cool' | 'fierce' | 'goofy' | 'tender';
type ReactionBeat = [Pose, Pose, Key['hips']?, Key['hips']?];

/** Two authored accents are enough for a stand-in to carry a distinct read. */
function directedReaction(spec: ClipSpec, won: boolean, style: ReactionStyle): AnimationClip {
  let beat: ReactionBeat;
  if (won) {
    if (style === 'cool') beat = [
      { hd: [8, 10, 0], ra: [-90, 0, -28], rf: [0, 100, 0] },
      { hd: [-10, 12, 0], ra: [-55, 0, -18], rf: [0, 65, 0] },
    ];
    else if (style === 'fierce') beat = [
      { hp: [-10, 0, 0], hd: [-14, 0, 0], la: [-170, 0, 18], ra: [-170, 0, -18], lu: [-24, 0, 8], ru: [-24, 0, -8] },
      { hp: [18, 0, 0], la: [-110, 0, 28], ra: [-110, 0, -28], ll: [-44, 0, 0], rl: [-44, 0, 0] },
      [0, 0.72, 0], [0, -0.2, 0],
    ];
    else if (style === 'goofy') beat = [
      { hp: [8, 22, 10], hd: [10, -18, 12], la: [-120, 0, 34], ra: [22, 0, -54], ll: [52, 0, 0] },
      { hp: [-12, -28, -10], hd: [-12, 24, -10], la: [26, 0, 54], ra: [-142, 0, -30], rl: [58, 0, 0] },
      [0, 0.32, 0], [0, 0.44, 0],
    ];
    else beat = [
      { hd: [7, 8, 0], la: [-72, 0, 44], lf: [0, -82, 0], ra: [-72, 0, -44], rf: [0, 82, 0] },
      { hd: [-6, -8, 0], la: [-118, 0, 28], lf: [0, -42, 0], ra: [-72, 0, -48], rf: [0, 76, 0] },
    ];
  } else {
    if (style === 'cool') beat = [
      { hd: [5, -26, 0], ls: [0, 0, 12], rs: [0, 0, -12], la: [-28, 0, 54], ra: [-28, 0, -54] },
      { hd: [10, 28, 0], la: [-10, 0, 64], ra: [-10, 0, -64] },
    ];
    else if (style === 'fierce') beat = [
      { hp: [-8, 0, 0], hd: [-12, 0, 0], la: [24, 0, 50], ra: [24, 0, -50], lu: [-42, 0, 10], ll: [66, 0, 0] },
      { hp: [30, 0, 0], hd: [26, 0, 0], lu: [30, 0, 10], ll: [-46, 0, 0] },
      [0, 0.22, 0], [0, -0.25, 0],
    ];
    else if (style === 'goofy') beat = [
      { hd: [-12, -22, 8], la: [-74, 0, 44], lf: [0, -62, 0], ra: [-74, 0, -44], rf: [0, 62, 0] },
      { hp: [28, 0, 0], sp: [18, 0, 0], hd: [16, 0, 0], la: [-12, 0, 62], ra: [-12, 0, -62] },
    ];
    else beat = [
      { hd: [18, 0, 0], la: [-112, 0, 30], lf: [0, -94, 0], ra: [-112, 0, -30], rf: [0, 94, 0] },
      { hd: [28, -12, 0], la: [-74, 0, 48], lf: [0, -66, 0], ra: [-112, 0, -28], rf: [0, 88, 0] },
    ];
  }
  return build(spec, [
    { f: 0, pose: {} },
    { f: Math.round(spec.frames * 0.28), pose: beat[0], hips: beat[2] },
    { f: Math.round(spec.frames * 0.62), pose: beat[1], hips: beat[3] },
    { f: spec.frames - 1, pose: {} },
  ]);
}

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
  // Failure-only browser fallbacks reuse the broad beats. The first-party GLB
  // gets the richer directed keys through buildDirectedReactionClips below.
  cheer_cool: (s) => BUILDERS.cheer(s),
  cheer_fierce: (s) => BUILDERS.cheer(s),
  cheer_goofy: (s) => BUILDERS.cheer(s),
  cheer_tender: (s) => BUILDERS.cheer(s),
  upset: (s) =>
    build(s, [
      { f: 0, pose: BAT_STANCE_POSE },
      { f: 10, pose: { hp: [0, -14, 0], s2: [8, -10, 0], hd: [22, -18, 0], la: [-6, 0, 66], ra: [-6, 0, -66] } },
      { f: 26, pose: { hp: [10, 0, 0], sp: [14, 0, 0], s2: [10, 0, 0], hd: [30, 0, 0], la: [8, 0, 70], ra: [8, 0, -70], lu: [12, 0, 10], ru: [12, 0, -10] } },
      { f: 44, pose: { hp: [12, 0, 0], sp: [16, 0, 0], hd: [34, 0, 0], la: [10, 0, 72], ra: [10, 0, -72] } },
      { f: s.frames - 1, pose: { hp: [6, 0, 0], sp: [8, 0, 0], hd: [18, 0, 0], la: [4, 0, 68], ra: [4, 0, -68] } },
    ]),
  upset_cool: (s) => BUILDERS.upset(s),
  upset_fierce: (s) => BUILDERS.upset(s),
  upset_goofy: (s) => BUILDERS.upset(s),
  upset_tender: (s) => BUILDERS.upset(s),
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

/** Richer first-party reaction takes for the exported runtime GLB. */
export function buildDirectedReactionClips(): AnimationClip[] {
  const directions: readonly [string, boolean, ReactionStyle][] = [
    ['cheer_cool', true, 'cool'], ['cheer_fierce', true, 'fierce'],
    ['cheer_goofy', true, 'goofy'], ['cheer_tender', true, 'tender'],
    ['upset_cool', false, 'cool'], ['upset_fierce', false, 'fierce'],
    ['upset_goofy', false, 'goofy'], ['upset_tender', false, 'tender'],
  ];
  return directions.map(([name, won, style]) => {
    const spec = CLIPS.find((candidate) => candidate.name === name)!;
    return directedReaction(spec as ClipSpec, won, style);
  });
}

/** Junebug's signed-off first character pass, exported as a partial delivery. */
export function buildJunebugPilotClips(): AnimationClip[] {
  const builders: Readonly<Record<string, (spec: ClipSpec) => AnimationClip>> = {
    idle: junebugIdle,
    idle_fidget: junebugIdleFidget,
    run: junebugRun,
    bat_stance: junebugBatStance,
    swing_contact: junebugSwingContact,
    swing_follow: junebugSwingFollow,
    cheer_fierce: junebugCheerFierce,
    upset_fierce: junebugUpsetFierce,
  };
  return Object.entries(builders).map(([name, make]) => {
    const spec = CLIPS.find((candidate) => candidate.name === name);
    if (!spec) throw new Error(`Junebug pilot names unknown contract clip "${name}"`);
    return make(spec as ClipSpec);
  });
}

/** Theo's signed-off character pass, exported as a partial delivery. */
export function buildTheoPilotClips(): AnimationClip[] {
  const builders: Readonly<Record<string, (spec: ClipSpec) => AnimationClip>> = {
    idle: theoIdle,
    idle_fidget: theoIdleFidget,
    run: (spec) => runCycle(spec, 16, 50, 48),
    bat_stance: theoBatStance,
    swing_contact: theoSwingContact,
    swing_follow: theoSwingFollow,
    pose_card: theoPoseCard,
    cheer_goofy: theoCheerGoofy,
    upset_goofy: theoUpsetGoofy,
  };
  return Object.entries(builders).map(([name, make]) => {
    const spec = CLIPS.find((candidate) => candidate.name === name);
    if (!spec) throw new Error(`Theo pilot names unknown contract clip "${name}"`);
    return make(spec as ClipSpec);
  });
}

/** Zoom's signed-off seated-athlete pass, exported as a partial delivery. */
export function buildZoomPilotClips(): AnimationClip[] {
  const builders: Readonly<Record<string, (spec: ClipSpec) => AnimationClip>> = {
    idle: zoomIdle,
    idle_fidget: zoomIdleFidget,
    run: zoomRun,
    bat_stance: zoomBatStance,
    swing_contact: zoomSwingContact,
    swing_follow: zoomSwingFollow,
    field_ready: zoomFieldReady,
    cheer_cool: zoomCheerCool,
    upset_cool: zoomUpsetCool,
  };
  return Object.entries(builders).map(([name, make]) => {
    const spec = CLIPS.find((candidate) => candidate.name === name);
    if (!spec) throw new Error(`Zoom pilot names unknown contract clip "${name}"`);
    return make(spec as ClipSpec);
  });
}

/** Big Lou's complete Batch 1 pass, exported as a partial delivery. */
export function buildBigLouPilotClips(): AnimationClip[] {
  const builders: Readonly<Record<string, (spec: ClipSpec) => AnimationClip>> = {
    idle: louIdle,
    idle_fidget: louIdleFidget,
    run: (spec) => runCycle(spec, 10, 38, 36),
    bat_stance: louBatStance,
    swing_contact: louSwingContact,
    swing_follow: louSwingFollow,
    pose_card: louPoseCard,
    cheer_goofy: louCheerGoofy,
    upset_goofy: louUpsetGoofy,
  };
  return Object.entries(builders).map(([name, make]) => {
    const spec = CLIPS.find((candidate) => candidate.name === name);
    if (!spec) throw new Error(`Big Lou pass names unknown contract clip "${name}"`);
    return make(spec as ClipSpec);
  });
}

/** Tank's complete Batch 1 pass, exported as a partial delivery. */
export function buildTankPilotClips(): AnimationClip[] {
  const builders: Readonly<Record<string, (spec: ClipSpec) => AnimationClip>> = {
    idle: (spec) => breathe(spec, TANK_IDLE_POSE, 0.7),
    idle_fidget: tankIdleFidget,
    run: (spec) => runCycle(spec, 7, 34, 32),
    bat_stance: (spec) => breathe(spec, TANK_STANCE_POSE, 0.75),
    swing_contact: tankSwingContact,
    swing_follow: tankSwingFollow,
    cheer_fierce: (spec) => directedReaction(spec, true, 'fierce'),
    upset_fierce: (spec) => directedReaction(spec, false, 'fierce'),
  };
  return Object.entries(builders).map(([name, make]) => {
    const spec = CLIPS.find((candidate) => candidate.name === name);
    if (!spec) throw new Error(`Tank pass names unknown contract clip "${name}"`);
    return make(spec as ClipSpec);
  });
}

/** Mimi Mash's complete Batch 1 pass, exported as a partial delivery. */
export function buildMimiMashPilotClips(): AnimationClip[] {
  const builders: Readonly<Record<string, (spec: ClipSpec) => AnimationClip>> = {
    idle: (spec) => breathe(spec, MIMI_IDLE_POSE, 1.2),
    idle_fidget: mimiIdleFidget,
    run: (spec) => runCycle(spec, 15, 48, 46),
    bat_stance: (spec) => breathe(spec, MIMI_STANCE_POSE, 1.15),
    swing_contact: mimiSwingContact,
    swing_follow: mimiSwingFollow,
    cheer_fierce: (spec) => directedReaction(spec, true, 'fierce'),
    upset_fierce: (spec) => directedReaction(spec, false, 'fierce'),
  };
  return Object.entries(builders).map(([name, make]) => {
    const spec = CLIPS.find((candidate) => candidate.name === name);
    if (!spec) throw new Error(`Mimi Mash pass names unknown contract clip "${name}"`);
    return make(spec as ClipSpec);
  });
}
