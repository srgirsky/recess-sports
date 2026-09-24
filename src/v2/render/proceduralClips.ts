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
  Matrix4,
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
// ★ `abduct` IS HOW FAR THE ARMS HANG FROM THE BODY, in degrees off the T-pose
// horizontal, and it is a parameter because one kid's torso is not another's.
// 72 (18 degrees of abduction) is what every clip used and it stays the default,
// so passing nothing changes nothing. Tank needs more: the rig shares one
// shoulder position across all thirty kids and his belly is the widest on the
// roster, so at 72 his upper arm is inside his own tee and the run still showed
// "a bare forearm exiting the middle of the belly like a peg".
function runCycle(
  spec: ClipSpec,
  lean: number,
  reach: number,
  armDrive: number,
  abduct = 72,
  elbow = 58,
  // ★ A CONSTANT ELBOW IS A HINGE, NOT AN ARM. `elbow` never varied across the
  // cycle, so the forearm held one angle for the whole run and the limb read as
  // a single straight taper — an independent review scored 3.11 on exactly that
  // and could not find an elbow in the silhouette at all.
  //
  // It is worst on Tank because he runs the shallowest bend on the roster (30
  // against 58) to keep his forearm off a belly 0.55ft deep, so he has both the
  // least bend AND no change in it. Extra flex when the arm is TRAILING costs
  // nothing there — the belly is only in the way at the front of the swing —
  // so the elbow can articulate without the hand crossing the torso.
  //
  // Defaults to 0, so every other kid's run is byte-identical.
  elbowSwing = 0,
): AnimationClip {
  return cycle(spec, (p) => {
    const s = sin(p);
    const o = sin(p, 0.5);
    // Positive knee X folds the heel behind the thigh. Delay peak flexion
    // until recovery: a negative knee angle made the old gait kick forward.
    // Two bounces per cycle — the body rises on each push-off.
    const bob = Math.abs(sin(p, 0.25)) * 3;
    return {
      hp: [lean * 0.4 - bob * 0.2, 0, 0],
      sp: [lean * 0.35, s * 3, 0],
      s2: [lean * 0.3, -s * 5, 0],
      hd: [-lean * 0.5, 0, 0],
      lu: [s * reach, 0, 3],
      ll: [12 + Math.max(0, sin(p, -.12)) * reach * 1.8, 0, 0],
      lt: [-Math.max(0, s) * 25, 0, 0],
      ru: [o * reach, 0, -3],
      rl: [12 + Math.max(0, sin(p, .38)) * reach * 1.8, 0, 0],
      rt: [-Math.max(0, o) * 25, 0, 0],
      la: [o * armDrive, 0, abduct],
      lf: [0, elbow + Math.max(0, -o) * elbowSwing, 0],
      ra: [s * armDrive, 0, -abduct],
      rf: [0, -(elbow + Math.max(0, -s) * elbowSwing), 0],
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
    const step = (1 - Math.cos(2*Math.PI*p))/2;
    const lead = dir < 0;
    return {
      hp: [5, 0, 0], s2: [4, 0, 0], hd: [-9,0,0],
      // Open the leading leg sideways, then bring the trailing foot in.
      // Knees stay flexed and feet never cross; the sim owns net travel.
      lu: [-22, 0, -(lead ? 5+25*step : 5+14*step)],
      ll: [40 + (lead ? 10 : -8)*Math.sin(2*Math.PI*p), 0, 0], lt: [-18,0,0],
      ru: [-22, 0, lead ? 5+14*step : 5+25*step],
      rl: [40 + (lead ? -8 : 10)*Math.sin(2*Math.PI*p), 0, 0], rt: [-18,0,0],
      la: [0,0,58], ra: [0,0,-58], lf: [0,55,0], rf: [0,-55,0],
    };
  }, p => [dir*.08*Math.sin(2*Math.PI*p),0,0]);
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

/**
 * Waiting for the pitch: both hands on the bat, barrel up over the shoulder.
 *
 * ★ THE ARMS ARE A GRIP NOW, AND THE NUMBERS ARE SOLVED, NOT STYLED. The
 * original stance held the hands 1.8ft apart at hip height — authored before
 * any bat existed, so nothing could see that the two hands never met. Once
 * `props.attachBatProp` hung a real bat on `Prop_BatGrip` (re-audit #1), the
 * gap was the first thing on screen. These arm and wrist values are solved by
 * FK against three targets: both hands within ~0.2ft on the grip, the knob at
 * waist height on the back side, and the barrel at ~60° elevation clearing
 * the (chibi, ~30%-of-height) head silhouette. Re-tune by re-solving, not by
 * nudging: a 10-degree arm edit moves the off hand clean off the bat.
 *
 * ★ THE WRIST (`rh`) CARRIES THE BAT'S AIM. The bat hangs off the right
 * hand, so every batting clip keys `rh` to steer the barrel — see
 * `SWING_WRIST` below. Arm terms stay CONSTANT through a swing; the torso
 * yaw supplies the power and the wrist lays the barrel through the zone.
 */
const BAT_STANCE_POSE: Pose = {
  hp: [0, -26, 0],
  sp: [6, -10, 0],
  s2: [4, -12, 0],
  hd: [0, 40, 0],
  lu: [-8, 0, -4],
  ll: [18, 0, 0],
  lt: [-9, 0, 0],
  ru: [-6, 0, 4],
  rl: [16, 0, 0],
  rt: [-9, 0, 0],
  la: [-165, 160, -15],
  lf: [-40, 0, 0],
  ra: [-45, 60, 45],
  rf: [0, 0, -110],
  rh: [9, 6, 66],
};

/**
 * Wrist deltas (against the stance's own `rh`) that steer the barrel through
 * a swing: loaded up-back → laid level through the zone at contact → wrapped
 * over the lead shoulder. Solved so the bat's +Y axis hits each phase's
 * target direction under that phase's torso yaw; shared by the roster swing
 * and every character take, so re-solving one phase re-aims everybody.
 */
const SWING_WRIST: Readonly<Record<string, [number, number, number]>> = {
  load: [-11, -7, 6],
  early: [-7, -5, -6],
  launch: [87, -13, -72],
  contact: [-156, -39, -56],
  through: [-73, -30, -29],
  wrap: [-15, -8, -30],
  end: [56, 8, -44],
  bunt: [66, -5, -65],
};

const FIELD_READY_POSE: Pose = {
  hp: [26, 0, 0],
  sp: [10, 0, 0],
  s2: [6, 0, 0],
  hd: [-32, 0, 0],
  lu: [-55, 0, -6],
  ll: [88, 0, 0],
  lt: [-28, 0, 0],
  ru: [-55, 0, 6],
  rl: [88, 0, 0],
  rt: [-28, 0, 0],
  la: [-40, 46, 46],
  lf: [0, 38, 0],
  ra: [-30, -46, -42],
  rf: [0, -32, 0],
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

// Pure pose construction: top-level character-only calls may be tree-shaken
// from the runtime fallback library. The exporters still use those poses.
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
 *
 * The arms never leave the grip: the torso yaw is the power and the
 * `SWING_WRIST` keys lay the barrel level through the zone (re-audit #1's
 * "the bat never comes down" — the old arm-delta sweep kept the barrel
 * vertical straight through the contact frame).
 */
function swingContact(spec: ClipSpec): AnimationClip {
  const loaded = shift(BAT_STANCE_POSE, { s2: [0, -16, 0], hp: [0, -8, 0], rh: SWING_WRIST.load });
  return build(spec, [
    { f: 0, pose: loaded },
    { f: 3, pose: shift(BAT_STANCE_POSE, { hp: [0, -2, 0], s2: [0, -10, 0], rh: SWING_WRIST.early }) },
    { f: 6, pose: shift(BAT_STANCE_POSE, { hp: [0, 22, 0], sp: [0, 20, 0], s2: [0, 10, 0], rt: [0, 0, 26], rh: SWING_WRIST.launch }) },
    // Contact: barrel level, pointing across the front of the plate.
    { f: 7, pose: shift(BAT_STANCE_POSE, { hp: [0, 36, 0], sp: [0, 30, 0], s2: [0, 24, 0], rt: [0, 0, 34], rh: SWING_WRIST.contact }) },
    { f: 8, pose: shift(BAT_STANCE_POSE, { hp: [0, 50, 0], sp: [0, 40, 0], s2: [0, 38, 0], rt: [0, 0, 42], rh: SWING_WRIST.through }) },
    { f: 12, pose: shift(BAT_STANCE_POSE, { hp: [0, 62, 0], sp: [0, 48, 0], s2: [0, 50, 0], rt: [0, 0, 48], rh: SWING_WRIST.wrap }) },
    { f: 17, pose: shift(BAT_STANCE_POSE, { hp: [0, 68, 0], sp: [0, 52, 0], s2: [0, 56, 0], rt: [0, 0, 50], rh: SWING_WRIST.end }) },
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

// Arm terms stay on the shared grip (see BAT_STANCE_POSE) — personality lives
// in the torso, head, legs and the WRIST, which is what actually waggles a bat.
const JUNEBUG_STANCE_POSE: Pose = /* @__PURE__ */ shift(BAT_STANCE_POSE, {
  hp: [5, -4, 0], sp: [3, -5, 0], s2: [2, -8, 0], hd: [-2, 7, -2],
  lu: [8, 0, 1], ll: [-5, 0, 0], ru: [-3, 0, -1], rl: [4, 0, 0],
});

const JUNEBUG_CONTACT_END: Pose = /* @__PURE__ */ shift(JUNEBUG_STANCE_POSE, {
  hp: [0, 78, 0], sp: [0, 54, 0], s2: [0, 74, 0], hd: [2, -18, 0],
  lu: [-10, 0, 0], ru: [8, 0, 0], rt: [0, 0, 52],
  rh: SWING_WRIST.end,
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
    lu: [-46, 0, 5], ll: [12, 0, 0], lt: [18, 0, 0],
    ru: [48, 0, -5], rl: [76, 0, 0], rt: [9, 0, 0],
    la: [64, 0, 70], lf: [0, 78, 0], ra: [-58, 0, -70], rf: [0, -40, 0],
  };
  const passA: Pose = {
    hp: [9, 0, 0], sp: [7, 4, 0], s2: [6, -5, 0], hd: [-10, -1, 0],
    lu: [4, 0, 4], ll: [42, 0, 0], lt: [8, 0, 0],
    ru: [2, 0, -4], rl: [24, 0, 0], rt: [20, 0, 0],
    la: [6, 0, 70], lf: [0, 58, 0], ra: [-5, 0, -70], rf: [0, -58, 0],
  };
  const reachB: Pose = {
    hp: [7, 0, 0], sp: [6, 3, 0], s2: [5, -5, 0], hd: [-9, -2, 0],
    lu: [48, 0, 5], ll: [76, 0, 0], lt: [9, 0, 0],
    ru: [-46, 0, -5], rl: [12, 0, 0], rt: [18, 0, 0],
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
    { f: 13, pose: shift(JUNEBUG_STANCE_POSE, { s2: [0, -2, 0], rh: [-2, 0, -3], hd: [0, 1, 0] }), hips: [0, -0.012, 0] },
    { f: 24, pose: shift(JUNEBUG_STANCE_POSE, { s2: [0, -4, 0], rh: [-5, 0, -6], hd: [0, -2, 0] }), hips: [0, -0.018, 0] },
    // The waggle stops here: she has decided.
    { f: 36, pose: shift(JUNEBUG_STANCE_POSE, { s2: [0, -4, 0], rh: [-5, 0, -6], hd: [0, -2, 0] }), hips: [0, -0.018, 0] },
    { f: 49, pose: shift(JUNEBUG_STANCE_POSE, { s2: [0, -1, 0], rh: [-1, 0, -2] }), hips: [0, -0.007, 0] },
    { f: spec.frames, pose: JUNEBUG_STANCE_POSE },
  ]);
}

function junebugSwingContact(spec: ClipSpec): AnimationClip {
  const loaded = shift(JUNEBUG_STANCE_POSE, {
    hp: [0, -10, 0], sp: [0, -5, 0], s2: [0, -18, 0],
    lu: [-8, 0, 0], hd: [0, 4, 0], rh: SWING_WRIST.load,
  });
  return build(spec, [
    { f: 0, pose: loaded },
    { f: 3, pose: shift(JUNEBUG_STANCE_POSE, { hp: [0, -7, 0], s2: [0, -15, 0], hd: [0, 2, 0], rh: SWING_WRIST.early }) },
    { f: 5, pose: shift(JUNEBUG_STANCE_POSE, { hp: [0, 2, 0], sp: [0, 2, 0], s2: [0, -8, 0], rh: SWING_WRIST.early }) },
    { f: 6, pose: shift(JUNEBUG_STANCE_POSE, { hp: [0, 14, 0], sp: [0, 12, 0], s2: [0, 4, 0], rt: [0, 0, 23], rh: SWING_WRIST.launch }) },
    // Contact: the widest hand sweep is centred on 6 -> 8, making frame 7
    // the derived bat marker rather than merely a number in the brief. With
    // the arms pinned to the grip, the torso arc alone must ACCELERATE into
    // frame 8 — the central-difference speed at 7 reads p(8)-p(6).
    { f: 7, pose: shift(JUNEBUG_STANCE_POSE, { hp: [0, 34, 0], sp: [0, 26, 0], s2: [0, 24, 0], rt: [0, 0, 37], rh: SWING_WRIST.contact }) },
    { f: 8, pose: shift(JUNEBUG_STANCE_POSE, { hp: [0, 62, 0], sp: [0, 44, 0], s2: [0, 48, 0], rt: [0, 0, 51], rh: SWING_WRIST.through }) },
    { f: 12, pose: shift(JUNEBUG_CONTACT_END, { hp: [0, -5, 0], sp: [0, -4, 0], s2: [0, -5, 0] }) },
    { f: spec.frames - 1, pose: JUNEBUG_CONTACT_END },
  ]);
}

function junebugSwingFollow(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: JUNEBUG_CONTACT_END },
    { f: 5, pose: shift(JUNEBUG_CONTACT_END, { hp: [0, 7, 0], s2: [0, 5, 0], hd: [-2, -4, 0] }) },
    { f: 10, pose: shift(JUNEBUG_CONTACT_END, { hp: [0, -8, 0], sp: [0, -8, 0], s2: [0, -11, 0], rh: [-30, -5, 5] }) },
    // One small shoulder release carries the satisfaction; no victory dance.
    { f: 15, pose: shift(JUNEBUG_STANCE_POSE, { s2: [-5, 0, -2], hd: [1, -5, 0], rh: [-4, 0, -3] }) },
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
  la: [0, 0, 72], lf: [0, 18, 0], ra: [0, 0, -72], rf: [0, -18, 0],
  lu: [-3, 0, 0], ru: [3, 0, 0],
};

const THEO_STANCE_POSE: Pose = /* @__PURE__ */ shift(BAT_STANCE_POSE, {
  hp: [-3, -7, 0], sp: [-4, -8, 0], s2: [-5, -11, 0], hd: [-2, 12, 3],
  lu: [2, 0, 2], ru: [-2, 0, -2],
});

const THEO_CONTACT_END: Pose = /* @__PURE__ */ shift(THEO_STANCE_POSE, {
  hp: [0, 83, 0], sp: [0, 58, 0], s2: [0, 78, 0], hd: [-3, -21, -2],
  lu: [-9, 0, 0], ru: [9, 0, 0], rt: [0, 0, 55],
  rh: SWING_WRIST.end,
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
    { f: 12, pose: shift(THEO_STANCE_POSE, { s2: [0, -5, 0], rh: [-6, 0, -8], hd: [0, 5, 0] }), hips: [0, -0.02, 0] },
    { f: 25, pose: shift(THEO_STANCE_POSE, { s2: [0, 7, 0], rh: [6, 0, 10], hd: [0, -12, 0] }), hips: [0, 0.018, 0] },
    { f: 38, pose: shift(THEO_STANCE_POSE, { s2: [0, -7, 0], rh: [-7, 0, -11], hd: [0, 11, 0] }), hips: [0, -0.022, 0] },
    { f: 50, pose: shift(THEO_STANCE_POSE, { s2: [0, 3, 0], rh: [3, 0, 5], hd: [0, -4, 0] }) },
    { f: spec.frames, pose: THEO_STANCE_POSE },
  ]);
}

function theoSwingContact(spec: ClipSpec): AnimationClip {
  const loaded = shift(THEO_STANCE_POSE, { hp: [0, -12, 0], s2: [0, -20, 0], hd: [0, 7, 0], rh: SWING_WRIST.load });
  return build(spec, [
    { f: 0, pose: loaded },
    { f: 3, pose: shift(THEO_STANCE_POSE, { hp: [0, -8, 0], s2: [0, -16, 0], hd: [0, 7, 0], rh: SWING_WRIST.early }) },
    { f: 5, pose: shift(THEO_STANCE_POSE, { hp: [0, 2, 0], sp: [0, 8, 0], s2: [0, -8, 0], rh: SWING_WRIST.early }) },
    { f: 6, pose: shift(THEO_STANCE_POSE, { hp: [0, 14, 0], sp: [0, 16, 0], s2: [0, 4, 0], rt: [0, 0, 25], rh: SWING_WRIST.launch }) },
    { f: 7, pose: shift(THEO_STANCE_POSE, { hp: [0, 36, 0], sp: [0, 32, 0], s2: [0, 24, 0], rt: [0, 0, 40], rh: SWING_WRIST.contact }) },
    { f: 8, pose: shift(THEO_STANCE_POSE, { hp: [0, 64, 0], sp: [0, 52, 0], s2: [0, 50, 0], rt: [0, 0, 54], rh: SWING_WRIST.through }) },
    { f: 12, pose: shift(THEO_CONTACT_END, { hp: [0, -5, 0], s2: [0, -6, 0] }) },
    { f: spec.frames - 1, pose: THEO_CONTACT_END },
  ]);
}

function theoSwingFollow(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: THEO_CONTACT_END },
    { f: 6, pose: shift(THEO_CONTACT_END, { hp: [0, 9, 0], s2: [0, 7, 0], hd: [-3, -8, 0] }) },
    { f: 12, pose: shift(THEO_STANCE_POSE, { hp: [-8, 10, 0], sp: [-6, 8, 0], s2: [-8, 12, 0], hd: [-5, -22, 4], rh: [-25, 0, -20] }) },
    // He admires the imaginary homer before remembering the next pitch.
    { f: 18, pose: shift(THEO_STANCE_POSE, { hp: [-5, -4, 0], hd: [-2, -15, 2], rh: [-8, 0, -12] }) },
    { f: spec.frames - 1, pose: THEO_STANCE_POSE },
  ]);
}

// Absolute arm poses: adding gestures to an already rotated idle folded the
// sleeve over the face. Palms-down bind; mirrored Y flexion reaches FORWARD.
function theoIdleFidget(spec: ClipSpec): AnimationClip {
  const wave: Pose = { ...THEO_IDLE_POSE, ra: [0, -12, 18], rf: [0, -75, 0], rh: [0, 0, -8] };
  return build(spec, [
    { f: 0, pose: THEO_IDLE_POSE },
    { f: 18, pose: wave },
    { f: 30, pose: { ...wave, rh: [0, 0, 12], hd: [-3, -8, 2] } },
    { f: 42, pose: wave },
    { f: 62, pose: THEO_IDLE_POSE },
    { f: spec.frames - 1, pose: THEO_IDLE_POSE },
  ]);
}

function theoPoseCard(spec: ClipSpec): AnimationClip {
  const hero: Pose = { ...THEO_IDLE_POSE,
    la: [0, 0, 70], lf: [0, 20, 0],
    ra: [0, -12, -42], rf: [0, -65, 0], rh: [0, 0, 0],
  };
  return build(spec, [{ f: 0, pose: hero }, { f: 1, pose: hero }]);
}

function theoCheerGoofy(spec: ClipSpec): AnimationClip {
  const cheer: Pose = { ...THEO_IDLE_POSE, hd: [-6, 10, 0],
    la: [0, 0, -25], lf: [0, 65, 0], ra: [0, 0, 25], rf: [0, -65, 0] };
  return build(spec, [
    { f: 0, pose: THEO_IDLE_POSE },
    { f: 8, pose: cheer, hips: [0, .08, 0] },
    { f: 14, pose: { ...cheer, hd: [-4, -12, 0] }, hips: [0, .25, 0] },
    { f: 22, pose: cheer },
    { f: spec.frames - 1, pose: THEO_IDLE_POSE },
  ]);
}

function theoUpsetGoofy(spec: ClipSpec): AnimationClip {
  // Absolute shoulders keep the shrug outside the jacket. Adding 82 degrees
  // to the lowered idle arms folded both upper arms across the torso.
  const disbelief: Pose = {
    ...shift(THEO_IDLE_POSE, { hp: [10, 0, 0], sp: [12, 0, 0], s2: [10, 0, 0], hd: [22, -18, 10] }),
    la: [0, 0, 35], lf: [0, 70, 0], ra: [0, 0, -35], rf: [0, -70, 0],
  };
  const slump: Pose = {
    ...shift(THEO_IDLE_POSE, { hp: [18, 0, 0], sp: [12, 0, 0], hd: [25, 0, 0] }),
    la: [0, 0, 65], lf: [0, 25, 0], ra: [0, 0, -65], rf: [0, -25, 0],
  };
  return build(spec, [
    { f: 0, pose: THEO_IDLE_POSE },
    { f: 7, pose: disbelief, hips: [0, 0.08, 0] },
    { f: 15, pose: shift(disbelief, { hd: [-8, 34, -18], hp: [8, 0, -12] }), hips: [-0.08, 0.03, 0] },
    { f: 24, pose: slump },
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

const ZOOM_FIELD_POSE: Pose = /* @__PURE__ */ shift(ZOOM_IDLE_POSE, {
  hp: [8, 0, 0], sp: [8, 0, 0], s2: [7, 0, 0], hd: [-10, -8, 0],
  la: [22, 0, -14], lf: [0, 20, 0], ra: [22, 0, 14], rf: [0, -20, 0],
});

const ZOOM_STANCE_POSE: Pose = {
  ...shift(BAT_STANCE_POSE, {
    hp: [-2, -5, 0], sp: [-2, -7, 0], s2: [-3, -8, 0], hd: [-1, 10, 1],
  }),
  // OVERRIDDEN to bind, not shifted by zero — `shift` adds, so a zero delta
  // kept the standing stance's leg pose and bent his seated sculpt's legs.
  lu: [0, 0, 0], ll: [0, 0, 0], lt: [0, 0, 0],
  ru: [0, 0, 0], rl: [0, 0, 0], rt: [0, 0, 0],
};

const ZOOM_CONTACT_END: Pose = /* @__PURE__ */ shift(ZOOM_STANCE_POSE, {
  hp: [0, 70, 0], sp: [0, 53, 0], s2: [0, 72, 0], hd: [-2, -18, -1],
  rh: SWING_WRIST.end,
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
    { f: 15, pose: shift(ZOOM_STANCE_POSE, { s2: [0, -5, 0], hd: [0, 4, 0], rh: [-4, 0, -4] }) },
    { f: 30, pose: shift(ZOOM_STANCE_POSE, { s2: [0, 6, 0], hd: [0, -8, 0], rh: [5, 0, 5] }) },
    { f: 45, pose: shift(ZOOM_STANCE_POSE, { s2: [0, -4, 0], hd: [0, 6, 0] }) },
    { f: spec.frames, pose: ZOOM_STANCE_POSE },
  ]);
}

function zoomSwingContact(spec: ClipSpec): AnimationClip {
  const loaded = shift(ZOOM_STANCE_POSE, { hp: [0, -11, 0], sp: [0, -8, 0], s2: [0, -18, 0], hd: [0, 6, 0], rh: SWING_WRIST.load });
  return build(spec, [
    { f: 0, pose: loaded },
    { f: 3, pose: shift(ZOOM_STANCE_POSE, { hp: [0, -7, 0], sp: [0, -8, 0], s2: [0, -13, 0], rh: SWING_WRIST.early }) },
    { f: 5, pose: shift(ZOOM_STANCE_POSE, { hp: [0, 3, 0], sp: [0, 1, 0], s2: [0, -5, 0], rh: SWING_WRIST.early }) },
    { f: 6, pose: shift(ZOOM_STANCE_POSE, { hp: [0, 20, 0], sp: [0, 14, 0], s2: [0, 11, 0], rh: SWING_WRIST.launch }) },
    { f: 7, pose: shift(ZOOM_STANCE_POSE, { hp: [0, 37, 0], sp: [0, 27, 0], s2: [0, 28, 0], rh: SWING_WRIST.contact }) },
    { f: 8, pose: shift(ZOOM_STANCE_POSE, { hp: [0, 53, 0], sp: [0, 39, 0], s2: [0, 44, 0], rh: SWING_WRIST.through }) },
    { f: 12, pose: shift(ZOOM_CONTACT_END, { hp: [0, -5, 0], s2: [0, -6, 0] }) },
    { f: spec.frames - 1, pose: ZOOM_CONTACT_END },
  ]);
}

function zoomSwingFollow(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: ZOOM_CONTACT_END },
    { f: 6, pose: shift(ZOOM_CONTACT_END, { hp: [0, 8, 0], s2: [0, 6, 0], hd: [-2, -7, 0] }) },
    { f: 12, pose: shift(ZOOM_STANCE_POSE, { hp: [-5, 8, 0], sp: [-4, 7, 0], s2: [-6, 10, 0], hd: [-4, -17, 3], rh: [-20, 0, -18] }) },
    { f: 18, pose: shift(ZOOM_STANCE_POSE, { hd: [-2, -12, 2], rh: [-6, 0, -9] }) },
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

const LOU_STANCE_POSE: Pose = /* @__PURE__ */ shift(BAT_STANCE_POSE, {
  hp: [10, -7, 0], sp: [8, -6, 0], s2: [11, -8, 0], hd: [-2, 10, 2],
  lu: [6, 0, 3], ll: [-8, 0, 0], ru: [6, 0, -3], rl: [-8, 0, 0],
});

const LOU_CONTACT_END: Pose = /* @__PURE__ */ shift(LOU_STANCE_POSE, {
  hp: [0, 91, 0], sp: [0, 62, 0], s2: [0, 85, 0], hd: [6, -30, -2],
  lu: [-12, 0, 2], ll: [15, 0, 0], ru: [10, 0, -4], rl: [-13, 0, 0], rt: [0, 0, 58],
  rh: SWING_WRIST.end,
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
    { f: 15, pose: shift(LOU_STANCE_POSE, { hp: [0, -5, 0], s2: [0, -8, 0], rh: [-6, 0, -9], hd: [0, 4, 0] }), hips: [0, -0.035, 0] },
    { f: 31, pose: shift(LOU_STANCE_POSE, { hp: [0, -9, 0], sp: [0, -5, 0], s2: [0, -13, 0], rh: [-9, 0, -13], hd: [0, 7, 0] }), hips: [0, -0.06, 0] },
    { f: 45, pose: shift(LOU_STANCE_POSE, { hp: [0, -4, 0], s2: [0, -6, 0], rh: [-4, 0, -6] }), hips: [0, -0.025, 0] },
    { f: spec.frames, pose: LOU_STANCE_POSE },
  ]);
}

function louSwingContact(spec: ClipSpec): AnimationClip {
  const loaded = shift(LOU_STANCE_POSE, {
    hp: [0, -18, 0], sp: [0, -10, 0], s2: [0, -25, 0], hd: [-2, 12, 0],
    lu: [8, 0, 0], ru: [8, 0, 0], rh: SWING_WRIST.load,
  });
  return build(spec, [
    { f: 0, pose: loaded },
    { f: 3, pose: shift(LOU_STANCE_POSE, { hp: [0, -15, 0], sp: [0, -10, 0], s2: [0, -21, 0], hd: [-2, 14, 0], rh: SWING_WRIST.early }) },
    { f: 5, pose: shift(LOU_STANCE_POSE, { hp: [0, -6, 0], sp: [0, -3, 0], s2: [0, -14, 0], hd: [-2, 9, 0], rh: SWING_WRIST.early }) },
    { f: 6, pose: shift(LOU_STANCE_POSE, { hp: [0, 17, 0], sp: [0, 14, 0], s2: [0, 7, 0], hd: [-2, 5, 0], rh: SWING_WRIST.launch }) },
    // The hand sweep peaks around frame 7 while Lou's gaze is still catching
    // up to the torso. The marker therefore remains derived, not declared.
    { f: 7, pose: shift(LOU_STANCE_POSE, { hp: [0, 38, 0], sp: [0, 29, 0], s2: [0, 27, 0], hd: [-2, 1, 0], rh: SWING_WRIST.contact }) },
    { f: 8, pose: shift(LOU_STANCE_POSE, { hp: [0, 58, 0], sp: [0, 44, 0], s2: [0, 47, 0], hd: [-2, -5, 0], rh: SWING_WRIST.through }) },
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
    rh: [-22, 0, -25],
  });
  return build(spec, [
    { f: 0, pose: LOU_CONTACT_END },
    { f: 5, pose: scrambleA, hips: [0.07, 0.04, 0] },
    { f: 10, pose: scrambleB, hips: [-0.09, 0.025, 0] },
    { f: 15, pose: shift(LOU_STANCE_POSE, { hp: [5, 3, 0], s2: [4, 4, 0], hd: [-3, -18, 2], rh: [-10, 0, -14] }) },
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
// ★ TANK'S ARMS HANG WIDER THAN EVERY OTHER KID'S, BECAUSE HIS BELLY IS WIDER.
//
// The rig fixes the shoulder at |x| 0.400ft for all thirty (`LeftShoulder`
// -0.165 plus `LeftArm` -0.235) with 0.965ft from shoulder to wrist, and that
// is shared and must stay shared. At the 18 degrees of abduction this pose used
// to hold (z 72, i.e. 72 degrees off the T-pose horizontal), the wrist lands at
// x 0.698 — comfortably inside a tee that his own concept draws 0.62 to 0.88
// wide. An independent review found the consequence: no shoulder, no sleeve, no
// upper arm, "a single bare forearm exiting the middle of the belly like a peg".
//
// ⚠️ AND EVERY MEASURED METRIC STAYED GREEN THROUGH IT, because the fidelity
// board renders the BIND pose, where the arms are horizontal and clear the
// torso by construction. The character was armless only in the poses nothing
// measured. That is the same shape of failure as the mirrored arms this file's
// round-4 note records, and it is why the runtime stills exist.
//
// ★ AND THE UPPER ARM AND THE FOREARM WANT DIFFERENT ANGLES, WHICH IS WHY THIS
// IS TWO NUMBERS AND NOT ONE.
//
// The traced target is the FOREARM: his concept's bare arm centres on 0.778 to
// 0.793ft from the centreline all the way down z 1.46-1.70, and
// `0.400 + 0.965·sin(23°) = 0.78` at z 1.58. A single 25-degree abduction hits
// that and buries the SLEEVE, because the tee is much wider higher up. Worked
// out against the torso table: at 25 degrees the sleeve's outer surface reaches
// 0.747 where the tee is 0.818, and the arm does not clear the garment until
// 0.70ft down the limb — past the elbow. An independent review saw exactly that
// and wrote "the tee has no sleeve; the arm exits the side wall at elbow
// height".
//
// At 40 degrees the sleeve clears (0.826 against 0.802) and the cuff is on the
// outside of the silhouette where the concept draws it. So the upper arm goes
// out to 40 and the forearm angles back in by 20, which lands the hand where it
// was traced. That is also what a heavy kid's arm does — the bulk pushes the
// upper arm out and the forearm returns under it — and it is what the drawing
// shows.
const TANK_IDLE_POSE: Pose = {
  hp: [6, 0, 0], sp: [3, 0, 0], s2: [5, 0, 0], hd: [-4, 3, 0],
  la: [12, 0, 50], lf: [0, -12, 20], ra: [12, 0, -50], rf: [0, 12, -20],
  lu: [12, 0, 0], ll: [-18, 0, 0], ru: [12, 0, 0], rl: [-18, 0, 0],
};
const TANK_STANCE_POSE: Pose = /* @__PURE__ */ shift(BAT_STANCE_POSE, {
  hp: [17, -10, 0], sp: [12, -7, 0], s2: [16, -12, 0], hd: [5, 7, 0],
  lu: [10, 0, 4], ll: [-15, 0, 0], ru: [10, 0, -4], rl: [-15, 0, 0],
});
// (An earlier pass here lowered mimed arm sweeps that put a fist through his
// skull at contact — that whole class went away when the arms became the
// shared grip: they no longer move during a swing, so there is nothing to
// sweep through the head. The torso still twists his 96 degrees.)
const TANK_CONTACT_END: Pose = /* @__PURE__ */ shift(TANK_STANCE_POSE, {
  hp: [0, 96, 0], sp: [0, 68, 0], s2: [0, 91, 0], hd: [8, -18, 0],
  rt: [0, 0, 62],
  rh: SWING_WRIST.end,
});

function tankSwingContact(spec: ClipSpec): AnimationClip {
  const load = shift(TANK_STANCE_POSE, { hp: [0, -22, 0], s2: [0, -29, 0], hd: [0, 12, 0], rh: SWING_WRIST.load });
  return build(spec, [
    { f: 0, pose: load },
    { f: 4, pose: shift(TANK_STANCE_POSE, { hp: [0, -18, 0], s2: [0, -24, 0], hd: [0, 12, 0], rh: SWING_WRIST.early }) },
    { f: 6, pose: shift(TANK_STANCE_POSE, { hp: [0, 16, 0], sp: [0, 27, 0], s2: [0, 6, 0], hd: [0, 8, 0], rh: SWING_WRIST.launch }) },
    { f: 7, pose: shift(TANK_STANCE_POSE, { hp: [0, 39, 0], sp: [0, 43, 0], s2: [0, 28, 0], hd: [0, 4, 0], rh: SWING_WRIST.contact }) },
    { f: 8, pose: shift(TANK_STANCE_POSE, { hp: [0, 61, 0], sp: [0, 59, 0], s2: [0, 50, 0], hd: [0, 0, 0], rh: SWING_WRIST.through }) },
    { f: 13, pose: TANK_CONTACT_END },
    { f: spec.frames - 1, pose: TANK_CONTACT_END },
  ]);
}

function tankSwingFollow(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: TANK_CONTACT_END },
    { f: 7, pose: shift(TANK_CONTACT_END, { hp: [8, 9, 0], s2: [6, 8, 0], hd: [4, -9, 0] }) },
    { f: 14, pose: shift(TANK_STANCE_POSE, { hp: [17, 4, 0], sp: [12, 3, 0], hd: [12, -16, 0], rh: [-15, 0, -20] }), hips: [0, -0.08, 0] },
    { f: 20, pose: shift(TANK_STANCE_POSE, { hp: [8, 0, 0], hd: [6, -6, 0] }) },
    { f: spec.frames - 1, pose: TANK_STANCE_POSE },
  ]);
}

// ★ HE HAS TO LOOK UP AT SOME POINT, and until he did, rubric 3.14 had no
// evidence at all. Its four named stills — `tank-runtime-face-*.png` — are
// captured off the idle clip, and a plain `breathe` cycle never turns the head,
// so all four came back as the same rear-3/4 photograph of his scalp with only
// the button label different. The independent review marked 3.14 UNVERIFIABLE
// for exactly that reason.
//
// Junebug's idle already solved this and the solution is a BEAT rather than a
// pose: "she checks once, then goes still again". Tank gets the same beat at
// his own tempo — he is `calm`, so the turn is slower, held longer and smaller,
// and he takes a breath rather than snapping back. The head yaw is negative
// because that is the direction Junebug's own check turns.
function tankIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: TANK_IDLE_POSE },
    { f: 16, pose: shift(TANK_IDLE_POSE, { sp: [0.6, 0, 0], s2: [0.7, 0, 0] }), hips: [0, 0.007, 0] },
    // The look. Slower into it than Junebug and held nearly twice as long.
    { f: 30, pose: shift(TANK_IDLE_POSE, { hd: [-2, -20, 0], nk: [-1, -8, 0] }) },
    { f: 46, pose: shift(TANK_IDLE_POSE, { hd: [-2, -20, 0], nk: [-1, -8, 0] }) },
    { f: 54, pose: shift(TANK_IDLE_POSE, { hd: [-1, -9, 0], nk: [0, -4, 0] }), hips: [0, 0.005, 0] },
    { f: spec.frames, pose: TANK_IDLE_POSE },
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
const MIMI_STANCE_POSE: Pose = /* @__PURE__ */ shift(BAT_STANCE_POSE, {
  hp: [21, -15, 0], sp: [15, -11, 0], s2: [20, -18, 0], hd: [-7, 14, 0],
  lu: [14, 0, 6], ll: [-20, 0, 0], ru: [14, 0, -6], rl: [-20, 0, 0],
});
const MIMI_CONTACT_END: Pose = /* @__PURE__ */ shift(MIMI_STANCE_POSE, {
  hp: [0, 107, 0], sp: [0, 79, 0], s2: [0, 102, 0], hd: [3, -42, -3],
  rt: [0, 0, 69], lu: [-9, 0, 2], ll: [12, 0, 0], ru: [9, 0, -3], rl: [-13, 0, 0],
  rh: SWING_WRIST.end,
});

function mimiSwingContact(spec: ClipSpec): AnimationClip {
  const load = shift(MIMI_STANCE_POSE, {
    hp: [0, -25, 0], sp: [0, -16, 0], s2: [0, -31, 0], hd: [-3, 17, 0],
    lu: [7, 0, 0], ru: [7, 0, 0], rh: SWING_WRIST.load,
  });
  return build(spec, [
    { f: 0, pose: load },
    { f: 2, pose: shift(MIMI_STANCE_POSE, { hp: [0, -29, 0], s2: [0, -37, 0], hd: [-3, 21, 0], rh: SWING_WRIST.load }), hips: [0, -0.06, 0] },
    { f: 5, pose: shift(MIMI_STANCE_POSE, { hp: [0, -8, 0], sp: [0, -4, 0], s2: [0, -15, 0], hd: [-3, 17, 0], rh: SWING_WRIST.early }) },
    { f: 6, pose: shift(MIMI_STANCE_POSE, { hp: [0, 8, 0], sp: [0, 8, 0], s2: [0, 0, 0], hd: [-3, 9, 0], rh: SWING_WRIST.launch }) },
    { f: 7, pose: shift(MIMI_STANCE_POSE, { hp: [0, 36, 0], sp: [0, 28, 0], s2: [0, 28, 0], hd: [-3, 2, 0], rh: SWING_WRIST.contact }) },
    { f: 8, pose: shift(MIMI_STANCE_POSE, { hp: [0, 72, 0], sp: [0, 56, 0], s2: [0, 62, 0], hd: [-3, -6, 0], rh: SWING_WRIST.through }), hips: [0.04, 0.06, 0] },
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
    { f: 13, pose: shift(MIMI_STANCE_POSE, { hp: [8, 9, 0], s2: [6, 8, 0], hd: [-5, -18, 3], rh: [-16, 0, -20] }), hips: [0.03, 0.08, 0] },
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

// The arm's bind axis is X: rotating only X twists the sleeve, it cannot
// lift the elbow. Build an orthogonal shoulder frame from the upper-arm
// direction and the elbow's bend plane, then flex around local -Y.
function throwingArm(direction: [number, number, number], bendToward: [number, number, number], bend: number): Pose {
  const x = new Vector3(...direction).normalize();
  const z = new Vector3(...bendToward).addScaledVector(x, -new Vector3(...bendToward).dot(x)).normalize();
  const y = new Vector3().crossVectors(z, x).normalize();
  const e = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z), 'XYZ');
  return { ra: [e.x/D,e.y/D,e.z/D], rf: [0,-bend,0], rh: [0,0,0] };
}

// A balanced gather -> stride -> high three-quarter delivery. Shared seam
// poses prevent the three pitch clips from disagreeing about the elbow/leg.
// Visual reference: Little League, Mark Melancon on Honing a Pitching Delivery
// (2016 magazine, p44), plus East County Little League Stride Foot Drill
// (pitching drills, p4). Angles are authoring, not measured biomechanics.
const PITCH_SET: Pose = {hp:[0,-18,0],sp:[0,-12,0],hd:[0,30,0],
  la:[0,0,62],lf:[0,100,0],...throwingArm([.8,-.5,.1],[0,0,1],95)};
const PITCH_BALANCE: Pose = {...PITCH_SET,hp:[0,-28,0],hd:[0,40,0],
  lu:[-92,0,-6],ll:[112,0,0],lt:[-20,0,0]};
const PITCH_COIL: Pose = {...PITCH_SET,lu:[-35,0,-5],ll:[30,0,0],lt:[0,0,0],
  ru:[20,0,5],rl:[15,0,0],rt:[-20,0,0],
  ...throwingArm([.85,.4,-.2],[0,1,-.5],100)};

/** Pitch-specific foot plants: support on the rear foot during the gather,
 * reach forward into a front-foot plant BEFORE arm acceleration, then let the
 * rear foot recover. These are authored ankle targets, not a per-frame lift
 * of whichever bone happens to be lowest. The same timeline spans all three
 * clips so their hips and feet agree at both joins. */
function pitchFootwork(clip: AnimationClip, startFrame: number): AnimationClip {
  const hipRotation = clip.tracks.find(t => t.name === 'Hips.quaternion')!
    .InterpolantFactoryMethodLinear();
  const smooth = (n: number) => { const t=Math.max(0,Math.min(1,n)); return t*t*(3-2*t); };
  const trajectory = (frame: number, points: [number,number,number,number][]) => {
    for (let i=1;i<points.length;i++) if(frame<=points[i][0]) {
      const a=points[i-1],b=points[i];
      return new Vector3(a[1],a[2],a[3]).lerp(new Vector3(b[1],b[2],b[3]),smooth((frame-a[0])/(b[0]-a[0])));
    }
    const p=points[points.length-1]; return new Vector3(p[1],p[2],p[3]);
  };
  const bind = new Map(SKELETON.map(b=>[b.name,new Vector3(...b.pos)]));
  const times:number[]=[], positions:number[]=[], rotations=new Map<string,number[]>();
  for(const side of ['Left','Right'])for(const part of ['UpLeg','Leg','Foot'])rotations.set(side+part,[]);
  for(let f=0;f<=clip.duration*FPS+.001;f++) {
    const t=f/FPS,frame=startFrame+f;times.push(t);
    const hips=trajectory(frame,[[0,0,1.64,0],[22,.12,1.61,0],[30,.10,1.58,.12],[42,0,1.42,.38],[46,-.02,1.40,.52],[54,-.05,1.40,.66]]);
    positions.push(...hips.toArray());
    const h=new Quaternion().fromArray(hipRotation.evaluate(t));
    for(const side of ['Left','Right']) {
      const foot=side==='Left'
        ? trajectory(frame,[[0,-.386,.095,0],[22,-.30,1.05,.32],[30,-.30,.9,.42],[42,-.33,.095,1],[54,-.33,.095,1]])
        : trajectory(frame,[[0,.386,.095,0],[46,.386,.095,0],[54,.32,.35,.08]]);
      const upperBind=bind.get(side+'Leg')!,lowerBind=bind.get(side+'Foot')!;
      const shoulder=bind.get(side+'UpLeg')!.clone().applyQuaternion(h).add(hips);
      const delta=foot.clone().sub(shoulder),direction=delta.clone().normalize();
      const l1=upperBind.length(),l2=lowerBind.length(),d=Math.min(delta.length(),l1+l2-1e-6);
      const along=(l1*l1-l2*l2+d*d)/(2*d);
      const bend=new Vector3(0,0,1).addScaledVector(direction,-direction.z).normalize();
      const knee=shoulder.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
      const upper=new Quaternion().setFromUnitVectors(upperBind.clone().normalize(),knee.clone().sub(shoulder).normalize());
      const lower=new Quaternion().setFromUnitVectors(lowerBind.clone().normalize(),foot.clone().sub(knee).normalize());
      rotations.get(side+'UpLeg')!.push(...h.clone().invert().multiply(upper).toArray());
      rotations.get(side+'Leg')!.push(...upper.clone().invert().multiply(lower).toArray());
      rotations.get(side+'Foot')!.push(...lower.clone().invert().toArray());
    }
  }
  clip.tracks=clip.tracks.filter(t=>t.name!=='Hips.position'&&!rotations.has(t.name.split('.')[0]));
  clip.tracks.push(new VectorKeyframeTrack('Hips.position',times,positions));
  for(const [name,values] of rotations)clip.tracks.push(new QuaternionKeyframeTrack(name+'.quaternion',times,values));
  // Re-apply the standard rigid ground solve after replacing the legs. SLERP
  // between 30fps keys can dip slightly below an exact authored ankle plant.
  const lift = -lowestOverClip(clip.tracks as (QuaternionKeyframeTrack | VectorKeyframeTrack)[], clip.duration*FPS);
  const hipsTrack = clip.tracks.find(t=>t.name==='Hips.position')!;
  for(let i=1;i<hipsTrack.values.length;i+=3)hipsTrack.values[i]+=lift;
  return clip;
}

function overhandThrow(spec: ClipSpec): AnimationClip {
  const body: Pose = { hp:[0,-18,0],sp:[0,-12,0],hd:[0,30,0],
    la:[0,0,62],lf:[0,85,0], lu:[-8,0,0],ru:[8,0,0] };
  const pose = (arm: Pose, torso: Pose = {}): Pose => ({...body,...torso,...arm});
  const keys: Key[] = [
    {f:0,pose:pose(throwingArm([.8,-.5,.1],[0,1,-.2],85))},
    {f:4,pose:pose(throwingArm([.9,.15,-.3],[0,1,-.5],95))},
    {f:6,pose:pose(throwingArm([.85,.4,-.2],[0,1,-.5],100))},
    {f:9,pose:pose(throwingArm([.75,.55,.15],[0,.9,.2],80),{hp:[3,-8,0],sp:[0,-4,0],hd:[0,12,0]})},
    {f:11,pose:pose(throwingArm([.35,.6,.72],[0,-.6,1],12),{hp:[6,10,0],sp:[6,8,0],hd:[-5,-18,0]})},
    {f:17,pose:pose(throwingArm([.15,-.1,1],[0,-1,0],22),{hp:[10,20,0],sp:[8,12,0],hd:[-8,-25,0]})},
    {f:25,pose:pose(throwingArm([.35,-.8,.4],[0,0,1],35),{hp:[8,22,0],sp:[5,10,0],hd:[-6,-25,0]})},
    {f:35,pose:FIELD_READY_POSE},
  ];
  const release = spec.marker!.frame;
  return build(spec, keys.map(key=>({...key,f:Math.round(key.f<=11 ? key.f*release/11 : release+(key.f-11)*(spec.frames-1-release)/24)})));
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
/**
 * ★ A CATCH STARTS COILED, NOT FROM THE READY REACH. `FIELD_READY_POSE`
 * holds the hands forward at mitt height (the 2026-08 squat re-author), so a
 * catch keyed straight off it barely EXTENDS — and the validator derives the
 * marker from full glove extension, which then lands on whatever frame noise
 * says is furthest. Tucking the hands to the chest for a catch's first and
 * last keys restores a real coil → explode → gather arc, and puts the
 * extension peak back on the authored marker frame. `catch_jump` keys it
 * directly for the same reason.
 */
const CATCH_BASE_POSE: Pose = /* @__PURE__ */ shift(FIELD_READY_POSE, {
  la: [0, -30, 0],
  lf: [0, -20, 0],
  ra: [0, 30, 0],
  rf: [0, 18, 0],
});

function catchClip(spec: ClipSpec, reach: Pose, extra: Key[] = []): AnimationClip {
  const f = spec.marker!.frame;
  const ready = CATCH_BASE_POSE;
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
  // Launch and land from the tucked CATCH_BASE_POSE — the ready pose's own
  // forward hands would rival the dive's extension (the catch-family rule).
  const reaching = shift(CATCH_BASE_POSE, diff(CATCH_BASE_POSE, air, 0.7));
  const gather = shift(air, diff(air, CATCH_BASE_POSE, 0.5));
  return build(spec, [
    { f: 0, pose: CATCH_BASE_POSE, hips: [0, 0, 0] },
    { f: 5, pose: shift(CATCH_BASE_POSE, { hp: [10, 0, 20 * dir], lu: [-14, 0, 0], ru: [-14, 0, 0] }), hips: [travel * 0.06 * dir, -0.18, 0] },
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

/**
 * ★ NO KEY MAY LEAVE THE ARMS AT BIND. `build()` fills an unkeyed alias with
 * `[0,0,0]` — the T-pose — and the mixer blends any bone the incoming clip
 * does not track back toward its REST pose during a crossfade. Either way the
 * kid throws his arms straight out sideways. That was re-audit #3's "kids
 * snap to T-pose during play": every fidget, cheer and upset started and
 * ended at `pose: {}`, so the whole park periodically hit the bind pose while
 * looking wired. Author reaction/fidget keys through `withArms`, which fills
 * whatever the key does not say with the idle hang; a gate in
 * `AnimationDirector.test.ts` fails any clip whose arm track touches bind.
 */
const NEUTRAL_ARMS: Pose = { la: [0, 0, 74], lf: [0, 12, 0], ra: [0, 0, -74], rf: [0, -12, 0] };
const withArms = (pose: Pose): Pose => ({ ...NEUTRAL_ARMS, ...pose });

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
    { f: 0, pose: withArms({}) },
    { f: Math.round(spec.frames * 0.28), pose: withArms(beat[0]), hips: beat[2] },
    { f: Math.round(spec.frames * 0.62), pose: withArms(beat[1]), hips: beat[3] },
    { f: spec.frames - 1, pose: withArms({}) },
  ]);
}

const BUILDERS: Record<string, (spec: ClipSpec) => AnimationClip> = {
  idle,
  idle_fidget: (s) =>
    build(s, [
      { f: 0, pose: withArms({}) },
      { f: 20, pose: withArms({ ra: [-96, 0, -30], rf: [0, 96, 0], hd: [-8, 0, 6], s2: [3, 0, 0] }) },
      { f: 34, pose: withArms({ ra: [-104, 0, -24], rf: [0, 108, 0], hd: [-10, 0, 8] }) },
      { f: 52, pose: withArms({ ra: [-90, 0, -36], rf: [0, 88, 0], hd: [-6, 0, 4], ru: [-8, 0, 0] }) },
      { f: 68, pose: withArms({ ru: [-18, 0, 0], rl: [26, 0, 0], hp: [0, -6, 0], s2: [2, -4, 0] }) },
      { f: s.frames - 1, pose: withArms({}) },
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
      { f: 7, pose: shift(BAT_STANCE_POSE, { s2: [0, -14, 0], lu: [-8, 0, 0], hp: [0, -6, 0], rh: SWING_WRIST.load }) },
      { f: s.frames - 1, pose: shift(BAT_STANCE_POSE, { s2: [0, -16, 0], hp: [0, -8, 0], rh: SWING_WRIST.load }) },
    ]),
  swing_contact: swingContact,
  swing_follow: (s) => {
    const end = shift(BAT_STANCE_POSE, { hp: [0, 68, 0], sp: [0, 52, 0], s2: [0, 56, 0], rh: SWING_WRIST.end });
    return build(s, [
      { f: 0, pose: end },
      { f: 8, pose: shift(BAT_STANCE_POSE, { hp: [0, 40, 0], sp: [0, 30, 0], s2: [0, 32, 0], rh: SWING_WRIST.wrap }) },
      { f: s.frames - 1, pose: BAT_STANCE_POSE },
    ]);
  },
  swing_whiff: (s) => {
    const over = shift(BAT_STANCE_POSE, { hp: [0, 100, 0], sp: [0, 60, 0], s2: [0, 80, 0], lu: [-24, 0, 0], hd: [12, 0, 0], rh: SWING_WRIST.wrap });
    return build(s, [
      { f: 0, pose: shift(BAT_STANCE_POSE, { s2: [0, -16, 0], rh: SWING_WRIST.load }) },
      { f: 7, pose: shift(BAT_STANCE_POSE, { hp: [0, 40, 0], sp: [0, 32, 0], s2: [0, 30, 0], rh: SWING_WRIST.contact }) },
      { f: 12, pose: over },
      { f: 20, pose: shift(over, { hp: [0, 16, 0], hd: [-10, 0, 0], lu: [10, 0, 0], rh: [30, 5, -7] }) },
      { f: s.frames - 1, pose: BAT_STANCE_POSE },
    ]);
  },
  bunt: (s) => {
    // Squared around: torso opens to the pitcher and the wrist lays the bat
    // level across the front — the hands never leave the grip.
    const square = shift(BAT_STANCE_POSE, {
      hp: [14, 26, 0], sp: [10, 10, 0], s2: [6, 12, 0], hd: [0, -32, 0],
      lu: [20, 0, 0], ll: [-22, 0, 0], ru: [18, 0, 0], rl: [-20, 0, 0],
      rh: SWING_WRIST.bunt,
    });
    return build(s, [
      { f: 0, pose: BAT_STANCE_POSE },
      { f: 8, pose: square },
      { f: 16, pose: shift(square, { hp: [2, 2, 0], hd: [0, -2, 0] }) },
      { f: s.frames - 1, pose: BAT_STANCE_POSE },
    ]);
  },

  pitch_windup: (s) => pitchFootwork(build(s, [
    {f:0,pose:PITCH_SET},
    {f:12,pose:{...PITCH_BALANCE,lu:[-65,0,-6],ll:[85,0,0]}},
    {f:22,pose:PITCH_BALANCE},
    {f:s.frames,pose:PITCH_BALANCE},
  ]),0),
  pitch_stride: (s) => pitchFootwork(build(s, [
    {f:0,pose:PITCH_BALANCE},
    {f:6,pose:{...PITCH_COIL,lu:[-45,0,-8],ll:[65,0,0],
      ...throwingArm([.9,.15,-.3],[0,1,-.5],95)}},
    {f:s.frames,pose:PITCH_COIL},
  ]),30),
  pitch_release: (s) => pitchFootwork(build(s,[
    {f:0,pose:PITCH_COIL},
    {f:2,pose:{...PITCH_COIL,hp:[3,-8,0],sp:[0,-4,0],hd:[-3,12,0],
      ...throwingArm([.75,.55,-.2],[0,1,-.7],110)}},
    {f:4,pose:{...PITCH_COIL,hp:[6,10,0],sp:[6,8,0],hd:[-12,-18,0],
      ...throwingArm([.15,.88,.45],[0,-.6,1],12)}},
    {f:9,pose:{...PITCH_COIL,hp:[18,20,0],sp:[12,12,0],hd:[-25,-25,0],
      ...throwingArm([.15,-.1,1],[0,-1,0],22)}},
    {f:s.frames-1,pose:{...PITCH_COIL,hp:[22,22,0],sp:[10,10,0],hd:[-28,-25,0],
      ru:[32,0,0],rl:[65,0,0],...throwingArm([.35,-.8,.4],[0,0,1],35)}},
  ]),42),

  field_ready: (s) => breathe(s, FIELD_READY_POSE, 2.6),
  field_scoop: (s) =>
    catchClip(s, {
      hp: [46, 0, 0],
      sp: [16, 0, 0],
      hd: [-42, 0, 0],
      lu: [-58, 0, 8],
      ll: [100, 0, 0],
      lt: [-42, 0, 0],
      ru: [-50, 0, -8],
      rl: [92, 0, 0],
      rt: [-38, 0, 0],
      la: [-88, 34, 20],
      lf: [0, 6, 0],
      ra: [-78, -20, -24],
      rf: [0, -18, 0],
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
      la: [-96, 30, 22],
      lf: [0, 4, 0],
      ra: [-72, -16, -36],
      rf: [0, -20, 0],
      lu: [-16, 0, -6],
      ll: [30, 0, 0],
      lt: [-14, 0, 0],
      ru: [-16, 0, 6],
      rl: [30, 0, 0],
      rt: [-14, 0, 0],
    }),
  catch_low: (s) =>
    catchClip(s, {
      hp: [52, 0, 0],
      sp: [18, 0, 0],
      hd: [-46, 0, 0],
      lu: [-62, 0, 8],
      ll: [106, 0, 0],
      lt: [-46, 0, 0],
      ru: [-54, 0, -8],
      rl: [98, 0, 0],
      rt: [-42, 0, 0],
      la: [-80, 38, 18],
      lf: [0, 8, 0],
      ra: [-66, -18, -22],
      rf: [0, -16, 0],
    }),
  catch_jump: (s) => {
    const f = s.marker!.frame;
    const up: Pose = { hp: [-10, 0, 0], sp: [-10, 0, 0], hd: [-36, 0, 0], la: [-172, 0, 34], ra: [-130, 0, -34], lu: [-30, 0, 8], ll: [50, 0, 0], ru: [-24, 0, -8], rl: [40, 0, 0] };
    // The glove must be UNIQUELY furthest from the body on frame `f`, or the
    // marker is ambiguous — the rise and the reach have to peak together. The
    // gather tucks HALFWAY home for that reason: a 20% tuck left the reach on
    // a 1.72–1.74ft plateau for eight frames and the derived marker walked it.
    const rising = shift(CATCH_BASE_POSE, diff(CATCH_BASE_POSE, up, 0.45));
    const gather = shift(up, diff(up, CATCH_BASE_POSE, 0.5));
    return build(s, [
      { f: 0, pose: CATCH_BASE_POSE, hips: [0, 0, 0] },
      { f: 5, pose: shift(CATCH_BASE_POSE, { hp: [16, 0, 0], lu: [22, 0, 0], ru: [22, 0, 0], la: [40, 0, 0], ra: [40, 0, 0] }), hips: [0, -0.35, 0] },
      { f: f - 3, pose: rising, hips: [0, 1.5, 0] },
      { f, pose: up, hips: [0, 2.1, 0] },
      { f: f + 4, pose: gather, hips: [0, 1.7, 0] },
      { f: 24, pose: shift(CATCH_BASE_POSE, { hp: [18, 0, 0], lu: [16, 0, 0], ru: [16, 0, 0] }), hips: [0, -0.3, 0] },
      { f: s.frames - 1, pose: CATCH_BASE_POSE, hips: [0, 0, 0] },
    ]);
  },
  dive_left: (s) => dive(s, -1),
  dive_right: (s) => dive(s, 1),
  getup,
  throw_overhand: overhandThrow,
  throw_quick: overhandThrow,

  slide,

  cheer: (s) =>
    build(s, [
      { f: 0, pose: withArms({}) },
      { f: 6, pose: withArms({ hp: [22, 0, 0], lu: [34, 0, 10], ll: [-52, 0, 0], ru: [34, 0, -10], rl: [-52, 0, 0], la: [30, 0, 40], ra: [30, 0, -40] }) },
      { f: 14, pose: withArms({ hp: [-8, 0, 0], hd: [-16, 0, 0], la: [-172, 0, 16], ra: [-172, 0, -16], lu: [-26, 0, 8], ll: [46, 0, 0], ru: [-26, 0, -8], rl: [46, 0, 0] }) },
      { f: 24, pose: withArms({ hp: [-6, 0, 0], hd: [-12, 0, 0], la: [-166, 0, 22], ra: [-166, 0, -22], lu: [-10, 0, 8], ru: [-10, 0, -8] }) },
      { f: 32, pose: withArms({ hp: [14, 0, 0], hd: [-6, 0, 0], la: [-150, 0, 26], ra: [-150, 0, -26], lu: [22, 0, 10], ll: [-30, 0, 0], ru: [22, 0, -10], rl: [-30, 0, 0] }) },
      { f: s.frames - 1, pose: withArms({}) },
    ]),
  // Failure-only browser fallbacks reuse the broad beats. The first-party GLB
  // gets the richer directed keys through buildDirectedReactionClips below.
  cheer_cool: (s) => BUILDERS.cheer(s),
  cheer_fierce: (s) => BUILDERS.cheer(s),
  cheer_goofy: (s) => BUILDERS.cheer(s),
  cheer_tender: (s) => BUILDERS.cheer(s),
  upset: (s) =>
    build(s, [
      // Not the bat stance: the pitcher plays this too, and with the stance
      // now a two-hand grip a batless kid miming it reads wrong.
      { f: 0, pose: withArms({ hp: [0, -8, 0], s2: [6, -6, 0], hd: [12, -8, 0] }) },
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
      { f: 4, pose: shift(BAT_STANCE_POSE, { hp: [-26, 0, 0], sp: [-16, 0, 0], s2: [-14, 0, 0], hd: [-24, -30, 0], lu: [-16, 0, 0], rh: SWING_WRIST.load }) },
      { f: 8, pose: shift(BAT_STANCE_POSE, { hp: [-30, 0, 0], sp: [-18, 0, 0], hd: [-28, -34, 0], rh: SWING_WRIST.load }) },
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

/** Theo's reference candidate; visual approval remains pending. */
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

/**
 * ★ ZOOM'S DELIVERED TAKE COVERS EVERY CLIP NAME, because a fallback IS the
 * bug for him. His model is sculpted seated over bind-pose legs — the nine
 * bespoke clips above zero every leg channel for exactly that reason — so any
 * shared clip reaching him through the character → shared → procedural
 * precedence animates legs his mesh does not have standing skin for: he rose
 * out of his own chair to pitch, walked on upright through the frame, and a
 * leg-swinging clip tore the seated silhouette apart (2026-08-24 review).
 *
 * The derivation keeps the shared clip's torso, arms and head — timing,
 * markers and loop closure ride along untouched — strips the six leg-bone
 * tracks so the sculpted tuck stays authoritative, and pins the hips to bind
 * height while preserving authored X/Z travel (a dive still covers its
 * `bodyTravelFt`; a jump no longer launches a seated kid into the air).
 */
const SEATED_STRIPPED_BONES = new Set([
  'LeftUpLeg.quaternion',
  'LeftLeg.quaternion',
  'LeftFoot.quaternion',
  'RightUpLeg.quaternion',
  'RightLeg.quaternion',
  'RightFoot.quaternion',
]);

function seatedVariant(shared: AnimationClip): AnimationClip {
  const clip = shared.clone();
  clip.tracks = clip.tracks.filter((track) => !SEATED_STRIPPED_BONES.has(track.name));
  for (const track of clip.tracks) {
    if (track.name !== 'Hips.position') continue;
    const values = Float32Array.from(track.values);
    for (let i = 1; i < values.length; i += 3) values[i] = HIPS_BIND_Y;
    track.values = values;
  }
  return clip;
}

export function buildZoomSeatedLibrary(): AnimationClip[] {
  const bespoke = buildZoomPilotClips();
  const covered = new Set(bespoke.map((clip) => clip.name));
  const shared = buildProceduralClips();
  const derived = shared.filter((clip) => !covered.has(clip.name)).map(seatedVariant);
  return [...bespoke, ...derived];
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
    idle: tankIdle,
    idle_fidget: tankIdleFidget,
    // Wider and with less drive than the roster default: 52 is 38 degrees of
    // abduction, which is what it takes to get his upper arm and shoulder out
    // of his own tee, and a smaller `armDrive` keeps the swing from throwing
    // the hand across his belly.
    // ⚠️ PARTIAL, AND SAYING SO. This recovers the shoulder and upper arm — the
    // review's "bare forearm exiting the middle of the belly like a peg" is
    // gone — but the FOREARM still crosses the belly at the top of the swing.
    // That one is not an abduction problem and cannot be fixed here: the elbow
    // bend (`lf` 58 degrees, shared by every kid's run) carries the hand
    // forward, and his torso is 0.55ft deep at the belly against a 0.965ft arm.
    // ★ AND THE ELBOW IS THE OTHER HALF, which is why `runCycle` now takes it.
    // The shared 58-degree bend is sized for a normal torso; abducting the
    // shoulder rotates the elbow's own bend axis outward with it, so on a wide
    // kid a deep bend carries the hand ACROSS the belly rather than alongside
    // it. Tank runs a shallower 30, which keeps the forearm outboard. Both
    // parameters default to the roster's values, so no other kid moves.
    // ★ AND THE FLEX IS THE REST OF IT. 30 degrees held for the whole cycle is
    // a bent stick; 30 rising to 64 as the arm trails puts an elbow in the
    // silhouette without ever carrying the hand across the belly, because the
    // extra bend happens behind him.
    run: (spec) => runCycle(spec, 7, 34, 24, 52, 30, 34),
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

// --- Batch 2: Turbo, Sprout, Zippy -------------------------------------------
// The roster's second acting batch, in the brief's order after the pilots and
// Batch 1 (`docs/v2/character-performance-brief.md`). Same discipline as Tank
// and Mimi: personality in the torso, head, legs and timing; arms stay on the
// shared grip wherever a bat is held; every key derives from the kid's own
// idle pose so no arm ever falls to bind.

// Turbo: "already on second base". Forward diagonals — nose-first, weight on
// the balls of the feet — and he never quite reaches stillness.
const TURBO_IDLE_POSE: Pose = {
  hp: [12, -3, 0], sp: [6, -2, 0], s2: [7, -4, 0], hd: [-6, 9, 2],
  la: [4, 0, 64], lf: [0, -14, 0], ra: [4, 0, -64], rf: [0, 14, 0],
  lu: [6, 0, 0], ll: [-10, 0, 0], ru: [6, 0, 0], rl: [-10, 0, 0],
};
const TURBO_STANCE_POSE: Pose = /* @__PURE__ */ shift(BAT_STANCE_POSE, {
  hp: [12, -6, 0], sp: [8, -4, 0], s2: [6, -6, 0], hd: [-4, 8, 0],
  lu: [6, 0, 2], ll: [-8, 0, 0], ru: [-4, 0, -2], rl: [6, 0, 0],
});

/** Weight changes on the balls of the feet, a glance each way, no rest. */
function turboIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: TURBO_IDLE_POSE },
    { f: 10, pose: shift(TURBO_IDLE_POSE, { hp: [0, 4, 2], s2: [0, 2, 0] }), hips: [0.03, 0.012, 0] },
    { f: 20, pose: shift(TURBO_IDLE_POSE, { hp: [0, -4, -2], s2: [0, -2, 0] }), hips: [-0.03, 0.012, 0] },
    { f: 30, pose: shift(TURBO_IDLE_POSE, { hd: [-2, -16, 0], nk: [0, -4, 0] }), hips: [0.02, 0.008, 0] },
    { f: 40, pose: shift(TURBO_IDLE_POSE, { hd: [-2, 14, 0], nk: [0, 4, 0] }), hips: [-0.02, 0.008, 0] },
    { f: 50, pose: shift(TURBO_IDLE_POSE, { s2: [1, 0, 0] }), hips: [0, 0.015, 0] },
    { f: spec.frames, pose: TURBO_IDLE_POSE },
  ]);
}

/** A joke interrupts the pose; the stop is two tiny recovery steps, never a
 * planted hero landing. */
function turboIdleFidget(spec: ClipSpec): AnimationClip {
  // Deltas against the idle: the right arm comes up and out to point (to
  // about -110 raised, -40 abducted), and the laugh brings both arms a
  // little forward and out while the torso folds.
  const point = shift(TURBO_IDLE_POSE, {
    hp: [6, 14, 0], s2: [4, 10, 0], hd: [-8, -24, 6],
    ra: [-114, 0, 24], rf: [0, 46, 0], la: [4, 0, -4],
  });
  const laugh = shift(TURBO_IDLE_POSE, {
    hp: [12, 0, 0], s2: [8, 0, 0], hd: [12, 0, 0],
    la: [-34, 0, -14], lf: [0, -26, 0], ra: [-34, 0, 14], rf: [0, 26, 0],
  });
  return build(spec, [
    { f: 0, pose: TURBO_IDLE_POSE },
    { f: 12, pose: point },
    { f: 24, pose: shift(point, { hd: [0, -4, 0], rf: [0, 10, 0] }) },
    { f: 34, pose: laugh, hips: [0, -0.03, 0] },
    { f: 44, pose: shift(laugh, { hp: [-4, 0, 0], hd: [-6, 0, 0] }), hips: [0, 0.02, 0] },
    { f: 52, pose: shift(TURBO_IDLE_POSE, { lu: [-16, 0, 0], ll: [10, 0, 0], hp: [4, 6, 0] }), hips: [0.08, 0.03, 0] },
    { f: 62, pose: shift(TURBO_IDLE_POSE, { ru: [-14, 0, 0], rl: [10, 0, 0], hp: [4, -6, 0] }), hips: [0, 0.03, 0] },
    { f: 76, pose: shift(TURBO_IDLE_POSE, { hd: [-2, 4, 0] }), hips: [0.01, 0.01, 0] },
    { f: spec.frames - 1, pose: TURBO_IDLE_POSE },
  ]);
}

/** Turbo's complete Batch 2 pass, exported as a partial delivery. */
export function buildTurboPilotClips(): AnimationClip[] {
  const builders: Readonly<Record<string, (spec: ClipSpec) => AnimationClip>> = {
    idle: turboIdle,
    idle_fidget: turboIdleFidget,
    // More lean and reach than the roster: the silhouette a step ahead of its shadow.
    run: (spec) => runCycle(spec, 20, 54, 50),
    bat_stance: (spec) => breathe(spec, TURBO_STANCE_POSE, 1.5),
    cheer_goofy: (spec) => directedReaction(spec, true, 'goofy'),
    upset_goofy: (spec) => directedReaction(spec, false, 'goofy'),
  };
  return Object.entries(builders).map(([name, make]) => {
    const spec = CLIPS.find((candidate) => candidate.name === name);
    if (!spec) throw new Error(`Turbo pass names unknown contract clip "${name}"`);
    return make(spec as ClipSpec);
  });
}

// Sprout: "tiny, quick, sneaky bunts". Compressed until surprise pops him
// into full extension; the signature fidget is a dirt-scrape that becomes an
// accidental practice bunt stance.
const SPROUT_IDLE_POSE: Pose = {
  hp: [6, 0, 0], sp: [8, 0, 0], s2: [10, 0, 0], hd: [-6, -10, 4],
  ls: [0, 0, 8], rs: [0, 0, -8],
  la: [-6, 0, 66], lf: [0, -26, 0], ra: [-6, 0, -66], rf: [0, 26, 0],
  lu: [8, 0, 4], ll: [-14, 0, 0], ru: [8, 0, -4], rl: [-14, 0, 0],
};
const SPROUT_POP_POSE: Pose = /* @__PURE__ */ shift(SPROUT_IDLE_POSE, {
  hp: [-10, 0, 0], sp: [-12, 0, 0], s2: [-16, 0, 0], hd: [-6, 16, -6],
  la: [-34, 0, -6], ra: [-34, 0, 6], lu: [-8, 0, 0], ll: [8, 0, 0], ru: [-8, 0, 0], rl: [8, 0, 0],
});

/** Compressed, still — then the pop, then back down with a look at the dirt. */
function sproutIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: SPROUT_IDLE_POSE },
    { f: 20, pose: shift(SPROUT_IDLE_POSE, { s2: [1, 0, 0] }), hips: [0, 0.006, 0] },
    { f: 26, pose: SPROUT_POP_POSE, hips: [0, 0.04, 0] },
    { f: 34, pose: shift(SPROUT_POP_POSE, { hd: [0, -4, 0] }), hips: [0, 0.035, 0] },
    { f: 44, pose: shift(SPROUT_IDLE_POSE, { hd: [16, 2, -4] }) },
    { f: spec.frames, pose: SPROUT_IDLE_POSE },
  ]);
}

/** The shared nervous sway, inside Sprout's compressed frame. */
function sproutNervous(spec: ClipSpec): AnimationClip {
  return cycle(spec, (p) => {
    const sway = sin(p) * 4;
    const look = sin(p, 0.33) * 12;
    return shift(SPROUT_IDLE_POSE, {
      hp: [4, sway * 0.6, 0], sp: [0, sway * 0.3, 0], s2: [0, -sway * 0.4, 0],
      hd: [-2, look, sin(p, 0.11) * 3],
      la: [-14, 0, -8 + sway], lf: [0, -34, 0], ra: [-14, 0, 8 - sway], rf: [0, 34, 0],
      lu: [sway * 0.4, 0, 6], ru: [-sway * 0.4, 0, -6],
    });
  });
}

/** He looks at the dirt, scrapes it twice with the right foot, and comes up
 * squared away in a bunt stance he did not mean to take. Then remembers
 * himself. */
function sproutIdleFidget(spec: ClipSpec): AnimationClip {
  const lookDown = shift(SPROUT_IDLE_POSE, { hd: [18, -6, 0], hp: [10, 0, 0] });
  const scrape = shift(lookDown, { ru: [-14, 0, -4], rl: [6, 0, 0], rt: [-12, 0, 0] });
  const scrapeBack = shift(lookDown, { ru: [10, 0, -4], rt: [8, 0, 0] });
  const bunt = shift(SPROUT_IDLE_POSE, {
    hp: [4, -10, 0], sp: [-4, -4, 0], s2: [-6, -6, 0], hd: [-2, 16, 0],
    la: [-64, 0, -26], lf: [0, -44, 0], ra: [-64, 0, 26], rf: [0, 44, 0],
    lu: [-6, 0, 0], ll: [6, 0, 0], ru: [-6, 0, 0], rl: [6, 0, 0],
  });
  const embarrassed = shift(SPROUT_IDLE_POSE, { hd: [14, -12, 4], s2: [4, 0, 0] });
  return build(spec, [
    { f: 0, pose: SPROUT_IDLE_POSE },
    { f: 14, pose: lookDown },
    { f: 24, pose: scrape, hips: [0, 0, -0.02] },
    { f: 34, pose: scrapeBack },
    { f: 44, pose: scrape, hips: [0, 0, -0.02] },
    { f: 56, pose: bunt, hips: [0, 0.03, 0] },
    { f: 68, pose: shift(bunt, { hd: [2, -3, 0] }), hips: [0, 0.03, 0] },
    { f: 78, pose: embarrassed },
    { f: spec.frames - 1, pose: SPROUT_IDLE_POSE },
  ]);
}

/** Two hops: the first a full-extension pop from a crouch, the second smaller. */
function sproutCheer(spec: ClipSpec): AnimationClip {
  const crouch = shift(SPROUT_IDLE_POSE, { hp: [14, 0, 0], s2: [14, 0, 0], lu: [12, 0, 0], ll: [-22, 0, 0], ru: [12, 0, 0], rl: [-22, 0, 0] });
  // Arms to about -130 raised and 36 abducted — the read the goofy beat's
  // raised arm gets — rather than flung out level.
  const pop = shift(SPROUT_IDLE_POSE, {
    hp: [-16, 0, 0], sp: [-8, 0, 0], s2: [-16, 0, 0], hd: [-10, 10, -4],
    la: [-124, 0, -30], lf: [0, 6, 0], ra: [-124, 0, 30], rf: [0, -6, 0],
    lu: [-28, 0, 4], ll: [44, 0, 0], ru: [-28, 0, -4], rl: [44, 0, 0],
  });
  return build(spec, [
    { f: 0, pose: SPROUT_IDLE_POSE },
    { f: 6, pose: crouch, hips: [0, -0.06, 0] },
    { f: 14, pose: pop, hips: [0, 0.5, 0] },
    { f: 22, pose: shift(pop, { hp: [28, 0, 0], la: [12, 0, 6], ra: [12, 0, -6], lu: [40, 0, 0], ru: [40, 0, 0], ll: [-66, 0, 0], rl: [-66, 0, 0] }), hips: [0, -0.04, 0] },
    { f: 30, pose: shift(pop, { la: [10, 0, 20], ra: [10, 0, -20] }), hips: [0, 0.15, 0] },
    { f: 38, pose: shift(SPROUT_IDLE_POSE, { hp: [-4, 0, 0], hd: [-8, 8, -4], la: [-20, 0, 0], ra: [-20, 0, 0] }) },
    { f: spec.frames - 1, pose: SPROUT_IDLE_POSE },
  ]);
}

/** He folds smaller, hides, then peeks. */
function sproutUpset(spec: ClipSpec): AnimationClip {
  const hide = shift(SPROUT_IDLE_POSE, {
    hp: [18, 0, 0], sp: [10, 0, 0], s2: [14, 0, 0], hd: [26, 0, 0],
    la: [4, 0, 4], ra: [4, 0, -4], lu: [10, 0, 6], ll: [-18, 0, 0], ru: [10, 0, -6], rl: [-18, 0, 0],
  });
  return build(spec, [
    { f: 0, pose: SPROUT_IDLE_POSE },
    { f: 10, pose: shift(SPROUT_IDLE_POSE, { hd: [16, -10, 0], hp: [12, 0, 0], s2: [12, 0, 0] }) },
    { f: 26, pose: hide, hips: [0, -0.05, 0] },
    { f: 42, pose: shift(hide, { hd: [-16, -16, 4] }), hips: [0, -0.04, 0] },
    { f: spec.frames - 1, pose: shift(SPROUT_IDLE_POSE, { hd: [8, -4, 0] }) },
  ]);
}

/** Sprout's complete Batch 2 pass, exported as a partial delivery. */
export function buildSproutPilotClips(): AnimationClip[] {
  const builders: Readonly<Record<string, (spec: ClipSpec) => AnimationClip>> = {
    idle: sproutIdle,
    idle_fidget: sproutIdleFidget,
    nervous: sproutNervous,
    // Short, quick strides: a small kid at a high cadence.
    run: (spec) => runCycle(spec, 12, 40, 44),
    cheer: sproutCheer,
    upset: sproutUpset,
  };
  return Object.entries(builders).map(([name, make]) => {
    const spec = CLIPS.find((candidate) => candidate.name === name);
    if (!spec) throw new Error(`Sprout pass names unknown contract clip "${name}"`);
    return make(spec as ClipSpec);
  });
}

// Zippy Kwan: "runs before she hits". She begins moving before the thought
// finishes: a bouncing rhythm on the toes, the head lagging every turn, and a
// win take that exits on a playful challenge.
const ZIPPY_IDLE_POSE: Pose = {
  hp: [8, 0, 0], sp: [4, 0, 0], s2: [6, -3, 0], hd: [-4, 6, -3],
  la: [10, 0, 64], lf: [0, -24, 0], ra: [10, 0, -64], rf: [0, 24, 0],
  lu: [4, 0, 2], ll: [-8, 0, 0], ru: [4, 0, -2], rl: [-8, 0, 0],
};
const ZIPPY_FIELD_POSE: Pose = /* @__PURE__ */ shift(FIELD_READY_POSE, {
  hp: [-4, 0, 0], hd: [-4, 0, 0], lu: [6, 0, 0], ru: [6, 0, 0], ll: [-10, 0, 0], rl: [-10, 0, 0],
});

/** A bounce on the toes; the body turns first and the head catches up. */
function zippyIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: ZIPPY_IDLE_POSE },
    { f: 8, pose: shift(ZIPPY_IDLE_POSE, { hd: [-2, -6, 0] }), hips: [0, 0.03, 0] },
    { f: 16, pose: shift(ZIPPY_IDLE_POSE, { hp: [0, 10, 0], s2: [0, 6, 0] }) },
    { f: 22, pose: shift(ZIPPY_IDLE_POSE, { hp: [0, 10, 0], s2: [0, 6, 0], hd: [-2, 12, -4] }), hips: [0, 0.03, 0] },
    { f: 32, pose: shift(ZIPPY_IDLE_POSE, { hp: [0, -8, 0], s2: [0, -5, 0], hd: [-2, 8, -3] }) },
    { f: 38, pose: shift(ZIPPY_IDLE_POSE, { hp: [0, -8, 0], s2: [0, -5, 0], hd: [-2, -10, 2] }), hips: [0, 0.03, 0] },
    { f: 48, pose: shift(ZIPPY_IDLE_POSE, { hd: [-1, -4, 0] }), hips: [0, 0.015, 0] },
    { f: spec.frames, pose: ZIPPY_IDLE_POSE },
  ]);
}

/** A springier, shallower crouch that bounces rather than settles. */
function zippyFieldReady(spec: ClipSpec): AnimationClip {
  return cycle(
    spec,
    (p) => shift(ZIPPY_FIELD_POSE, { hp: [sin(p) * 3, 0, 0], hd: [-sin(p) * 2, sin(p, 0.5) * 10, 0] }),
    (p) => [0, Math.abs(sin(p)) * 0.04, 0]
  );
}

/** A false start: she leans, takes two strides in place, checks herself with
 * two small hops, and looks back as if nothing happened. */
function zippyIdleFidget(spec: ClipSpec): AnimationClip {
  const lean = shift(ZIPPY_IDLE_POSE, { hp: [16, 0, 0], hd: [-10, -16, 0] });
  // Running form, as `runCycle` has it: the arm opposite the forward leg
  // swings forward (negative X), the other back — and modest, it is a false
  // start from a standstill, not a sprint.
  const strideA = shift(ZIPPY_IDLE_POSE, {
    hp: [14, 0, 0], lu: [-40, 0, 4], ll: [40, 0, 0], ru: [20, 0, -4], rl: [-10, 0, 0],
    la: [10, 0, 0], lf: [0, -8, 0], ra: [-16, 0, 0], rf: [0, 16, 0],
  });
  const strideB = shift(ZIPPY_IDLE_POSE, {
    hp: [14, 0, 0], ru: [-40, 0, -4], rl: [40, 0, 0], lu: [20, 0, 4], ll: [-10, 0, 0],
    ra: [10, 0, 0], rf: [0, 8, 0], la: [-16, 0, 0], lf: [0, -16, 0],
  });
  return build(spec, [
    { f: 0, pose: ZIPPY_IDLE_POSE },
    { f: 10, pose: lean },
    { f: 18, pose: strideA, hips: [0, 0.05, 0.06] },
    { f: 26, pose: strideB, hips: [0, 0.05, 0.12] },
    { f: 34, pose: shift(ZIPPY_IDLE_POSE, { hp: [6, 0, 0], ll: [-16, 0, 0], rl: [-16, 0, 0] }), hips: [0, 0.08, 0.12] },
    { f: 40, pose: shift(ZIPPY_IDLE_POSE, { hp: [6, 0, 0] }), hips: [0, 0.06, 0.12] },
    { f: 48, pose: shift(ZIPPY_IDLE_POSE, { hd: [-4, 20, 0], hp: [4, 6, 0] }), hips: [0, 0, 0.12] },
    { f: 62, pose: shift(ZIPPY_IDLE_POSE, { hd: [-2, 10, 0] }), hips: [0, 0.02, 0.06] },
    { f: 74, pose: shift(ZIPPY_IDLE_POSE, { hd: [-2, 2, 0] }), hips: [0, 0.01, 0] },
    { f: spec.frames - 1, pose: ZIPPY_IDLE_POSE },
  ]);
}

/** A jump, and the exit is a point at the other bench: try and catch me. */
function zippyCheer(spec: ClipSpec): AnimationClip {
  const jump = shift(ZIPPY_IDLE_POSE, {
    hp: [-10, 0, 0], hd: [-10, 0, 0],
    la: [-170, 0, -40], lf: [0, 0, 0], ra: [-170, 0, 40], rf: [0, 0, 0],
    lu: [-24, 0, 6], ll: [36, 0, 0], ru: [-24, 0, -6], rl: [36, 0, 0],
  });
  const challenge = shift(ZIPPY_IDLE_POSE, {
    hp: [6, -18, 0], s2: [2, -8, 0], hd: [-6, 22, 4],
    ra: [-106, 0, 34], rf: [0, 20, 0], la: [10, 0, -2], lf: [0, -50, 0],
    lu: [-4, 0, 2], ru: [8, 0, -2],
  });
  return build(spec, [
    { f: 0, pose: ZIPPY_IDLE_POSE },
    { f: 8, pose: shift(ZIPPY_IDLE_POSE, { hp: [12, 0, 0], lu: [10, 0, 0], ll: [-18, 0, 0], ru: [10, 0, 0], rl: [-18, 0, 0] }), hips: [0, -0.05, 0] },
    { f: 14, pose: jump, hips: [0, 0.45, 0] },
    { f: 22, pose: shift(ZIPPY_IDLE_POSE, { hp: [10, 0, 0], la: [-40, 0, 0], ra: [-40, 0, 0], ll: [-14, 0, 0], rl: [-14, 0, 0] }), hips: [0, -0.03, 0] },
    { f: 30, pose: challenge },
    { f: 38, pose: shift(challenge, { hd: [2, 22, 4], rf: [0, 6, 0] }) },
    { f: spec.frames - 1, pose: shift(ZIPPY_IDLE_POSE, { hd: [-4, 10, 0] }) },
  ]);
}

/** Head down, one quick shake, and she is already over it. */
function zippyUpset(spec: ClipSpec): AnimationClip {
  const down = shift(ZIPPY_IDLE_POSE, { hd: [20, 0, 0], hp: [10, 0, 0], s2: [8, 0, 0] });
  return build(spec, [
    { f: 0, pose: ZIPPY_IDLE_POSE },
    { f: 8, pose: down },
    { f: 18, pose: shift(down, { hd: [-4, -18, 0] }) },
    { f: 26, pose: shift(down, { hd: [-4, 18, 0] }) },
    { f: 34, pose: shift(down, { hd: [-2, -12, 0] }) },
    { f: 44, pose: shift(ZIPPY_IDLE_POSE, { hp: [4, 0, 0], hd: [-2, 4, 0] }), hips: [0, 0.02, 0] },
    { f: spec.frames - 1, pose: ZIPPY_IDLE_POSE },
  ]);
}

/** Zippy's complete Batch 2 pass, exported as a partial delivery. */
export function buildZippyPilotClips(): AnimationClip[] {
  const builders: Readonly<Record<string, (spec: ClipSpec) => AnimationClip>> = {
    idle: zippyIdle,
    idle_fidget: zippyIdleFidget,
    field_ready: zippyFieldReady,
    // Long light legs at a quick cadence: a longer reach than the roster.
    run: (spec) => runCycle(spec, 16, 56, 50),
    cheer: zippyCheer,
    upset: zippyUpset,
  };
  return Object.entries(builders).map(([name, make]) => {
    const spec = CLIPS.find((candidate) => candidate.name === name);
    if (!spec) throw new Error(`Zippy pass names unknown contract clip "${name}"`);
    return make(spec as ClipSpec);
  });
}

// --- Batches 3 and 4: Ace, Penny, Dex, Lefty, Smokey, Bend-It ---------------
// The brief's next six, one PR: four gloves with four different temperaments,
// a contained swagger and a bashful curve-drawer. Same discipline as Batch 2.

/** A glove kid's authored ready loop: the shared crouch, shifted, breathing. */
function readyLoop(spec: ClipSpec, delta: Pose, amount: number, bounceFt = 0): AnimationClip {
  const base = shift(FIELD_READY_POSE, delta);
  return cycle(
    spec,
    (p) => shift(base, { hp: [sin(p) * amount * 0.4, 0, 0], s2: [sin(p) * amount * 0.3, 0, 0], hd: [-sin(p) * amount * 0.3, 0, 0] }),
    bounceFt > 0 ? (p) => [0, Math.abs(sin(p)) * bounceFt, 0] : undefined
  );
}

/** A clip that only names a pose, held: the card beat is two frames. */
function heldPose(spec: ClipSpec, pose: Pose, hips?: Key['hips']): AnimationClip {
  return build(spec, [
    { f: 0, pose, hips },
    { f: spec.frames - 1, pose, hips },
  ]);
}

// Ace: economical, square, settled. The card beat is a quiet check of the
// glove and the field, never a stare at the lens.
const ACE_IDLE_POSE: Pose = {
  hp: [4, 0, 0], sp: [3, 0, 0], s2: [3, -2, 0], hd: [-2, 4, 0],
  la: [2, 0, 68], lf: [0, -16, 0], ra: [2, 0, -68], rf: [0, 16, 0],
  lu: [4, 0, 2], ll: [-8, 0, 0], ru: [4, 0, -2], rl: [-8, 0, 0],
};
function aceIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: ACE_IDLE_POSE },
    { f: 18, pose: shift(ACE_IDLE_POSE, { sp: [0.6, 0, 0], s2: [0.6, 0, 0] }), hips: [0, 0.006, 0] },
    // One settle of the weight, square, and back. Nothing else moves.
    { f: 30, pose: shift(ACE_IDLE_POSE, { hp: [0, 3, 1] }), hips: [0.02, 0, 0] },
    { f: 46, pose: shift(ACE_IDLE_POSE, { hp: [0, 3, 1] }), hips: [0.02, 0, 0] },
    { f: spec.frames, pose: ACE_IDLE_POSE },
  ]);
}
function aceIdleFidget(spec: ClipSpec): AnimationClip {
  // The glove comes up, he looks into it, taps it once, then reads the field
  // left to right and settles square.
  const gloveUp = shift(ACE_IDLE_POSE, { hd: [12, -12, 0], la: [-52, 0, -14], lf: [0, -66, 0] });
  const tap = shift(gloveUp, { ra: [-58, 0, 22], rf: [0, 68, 0], s2: [2, -4, 0] });
  return build(spec, [
    { f: 0, pose: ACE_IDLE_POSE },
    { f: 14, pose: gloveUp },
    { f: 22, pose: tap },
    { f: 28, pose: shift(gloveUp, { ra: [-20, 0, 8], rf: [0, 30, 0] }) },
    { f: 40, pose: shift(ACE_IDLE_POSE, { hd: [-3, -22, 0], nk: [0, -6, 0] }) },
    { f: 56, pose: shift(ACE_IDLE_POSE, { hd: [-3, 20, 0], nk: [0, 6, 0] }) },
    { f: 72, pose: shift(ACE_IDLE_POSE, { hd: [-1, 4, 0] }) },
    { f: spec.frames - 1, pose: ACE_IDLE_POSE },
  ]);
}
/** Ace's Batch 3 pass, exported as a partial delivery. */
export function buildAcePilotClips(): AnimationClip[] {
  return buildNamed('Ace', {
    idle: aceIdle,
    idle_fidget: aceIdleFidget,
    field_ready: (spec) => readyLoop(spec, { hp: [-2, 0, 0] }, 2.2),
    run: (spec) => runCycle(spec, 12, 48, 44),
    cheer_cool: (spec) => directedReaction(spec, true, 'cool'),
    upset_cool: (spec) => directedReaction(spec, false, 'cool'),
  });
}

// Penny Pockets: steady and prepared. She checks a pocket, catches with two
// hands, and celebrates outward rather than up.
const PENNY_IDLE_POSE: Pose = {
  hp: [5, 0, 0], sp: [4, 0, 0], s2: [4, 0, 0], hd: [-3, 5, 1],
  la: [4, 0, 66], lf: [0, -20, 0], ra: [4, 0, -66], rf: [0, 20, 0],
  lu: [5, 0, 3], ll: [-9, 0, 0], ru: [5, 0, -3], rl: [-9, 0, 0],
};
function pennyIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: PENNY_IDLE_POSE },
    { f: 16, pose: shift(PENNY_IDLE_POSE, { sp: [0.8, 0, 0], s2: [0.8, 0, 0] }), hips: [0, 0.008, 0] },
    // A warm look to the side — checking on a teammate, not the crowd.
    { f: 30, pose: shift(PENNY_IDLE_POSE, { hd: [-2, 16, 3], nk: [0, 5, 0] }) },
    { f: 42, pose: shift(PENNY_IDLE_POSE, { hd: [-2, 16, 3], nk: [0, 5, 0] }) },
    { f: 52, pose: shift(PENNY_IDLE_POSE, { hd: [-1, 6, 1] }), hips: [0, 0.005, 0] },
    { f: spec.frames, pose: PENNY_IDLE_POSE },
  ]);
}
function pennyIdleFidget(spec: ClipSpec): AnimationClip {
  // The pocket check: right hand to the hip pocket, two pats, a look down to
  // confirm, and back to ready.
  const pocket = shift(PENNY_IDLE_POSE, { hd: [14, -12, 0], ra: [-14, 0, 22], rf: [0, 52, 0], s2: [3, -3, 0] });
  return build(spec, [
    { f: 0, pose: PENNY_IDLE_POSE },
    { f: 14, pose: pocket },
    { f: 22, pose: shift(pocket, { ra: [4, 0, 0], rf: [0, -6, 0] }) },
    { f: 30, pose: pocket },
    { f: 38, pose: shift(pocket, { ra: [4, 0, 0], rf: [0, -6, 0] }) },
    { f: 52, pose: shift(PENNY_IDLE_POSE, { hd: [8, -6, 0], ra: [-6, 0, 10], rf: [0, 30, 0] }) },
    { f: 70, pose: shift(PENNY_IDLE_POSE, { hd: [-2, 2, 0] }) },
    { f: spec.frames - 1, pose: PENNY_IDLE_POSE },
  ]);
}
/** Penny's Batch 3 pass, exported as a partial delivery. */
export function buildPennyPilotClips(): AnimationClip[] {
  return buildNamed('Penny', {
    idle: pennyIdle,
    idle_fidget: pennyIdleFidget,
    // Two hands: the arms sit a little closer to centre than the roster crouch.
    field_ready: (spec) => readyLoop(spec, { la: [0, -8, 0], ra: [0, 8, 0] }, 2.4),
    run: (spec) => runCycle(spec, 14, 48, 46),
    cheer_tender: (spec) => directedReaction(spec, true, 'tender'),
    upset_tender: (spec) => directedReaction(spec, false, 'tender'),
  });
}

// Dex: the cast's still point. Weight changes nearly invisible; the hero
// beat is one glove tap and direct eye contact.
const DEX_IDLE_POSE: Pose = {
  hp: [3, 0, 0], sp: [2, 0, 0], s2: [2, 0, 0], hd: [-1, 0, 0],
  la: [1, 0, 70], lf: [0, -12, 0], ra: [1, 0, -70], rf: [0, 12, 0],
  lu: [3, 0, 2], ll: [-6, 0, 0], ru: [3, 0, -2], rl: [-6, 0, 0],
};
function dexIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: DEX_IDLE_POSE },
    { f: 30, pose: shift(DEX_IDLE_POSE, { sp: [0.5, 0, 0], s2: [0.5, 0, 0] }), hips: [0, 0.004, 0] },
    { f: spec.frames, pose: DEX_IDLE_POSE },
  ]);
}
function dexIdleFidget(spec: ClipSpec): AnimationClip {
  // Glove up, one tap, then the head comes up level: eye contact, held.
  const gloveUp = shift(DEX_IDLE_POSE, { hd: [8, -8, 0], la: [-48, 0, -12], lf: [0, -70, 0] });
  const tap = shift(gloveUp, { ra: [-54, 0, 16], rf: [0, 74, 0] });
  return build(spec, [
    { f: 0, pose: DEX_IDLE_POSE },
    { f: 18, pose: gloveUp },
    { f: 26, pose: tap },
    { f: 32, pose: shift(gloveUp, { ra: [-10, 0, 4], rf: [0, 20, 0] }) },
    { f: 44, pose: shift(DEX_IDLE_POSE, { hd: [-4, 0, 0] }) },
    { f: 74, pose: shift(DEX_IDLE_POSE, { hd: [-4, 0, 0] }) },
    { f: spec.frames - 1, pose: DEX_IDLE_POSE },
  ]);
}
/** Dex's Batch 3 pass, exported as a partial delivery. */
export function buildDexPilotClips(): AnimationClip[] {
  return buildNamed('Dex', {
    idle: dexIdle,
    idle_fidget: dexIdleFidget,
    field_ready: (spec) => readyLoop(spec, {}, 1.6),
    run: (spec) => runCycle(spec, 10, 46, 42),
    cheer_cool: (spec) => directedReaction(spec, true, 'cool'),
    upset_cool: (spec) => directedReaction(spec, false, 'cool'),
  });
}

// Lefty Lu: she thinks in arcs. The idle is a slow loop through the spine,
// and even a shrug traces a controlled curve.
const LEFTY_IDLE_POSE: Pose = {
  hp: [5, 0, 0], sp: [4, 0, 0], s2: [4, -3, 0], hd: [-3, 6, -2],
  la: [3, 0, 66], lf: [0, -22, 0], ra: [3, 0, -66], rf: [0, 22, 0],
  lu: [5, 0, 2], ll: [-9, 0, 0], ru: [5, 0, -2], rl: [-9, 0, 0],
};
function leftyIdle(spec: ClipSpec): AnimationClip {
  // A loop, not a sway: the hips lead, the chest follows a quarter behind,
  // the head a quarter behind that.
  return cycle(spec, (p) => shift(LEFTY_IDLE_POSE, {
    hp: [sin(p) * 1.5, sin(p) * 5, sin(p, 0.25) * 2],
    s2: [sin(p, 0.25) * 1.5, -sin(p, 0.25) * 4, 0],
    hd: [sin(p, 0.5) * 2, sin(p, 0.5) * 6, -sin(p, 0.5) * 3],
  }));
}
function leftyIdleFidget(spec: ClipSpec): AnimationClip {
  // The shrug: shoulders rise on a curve, the torso sweeps one way and back,
  // the glove hand finishes on a delayed arc.
  const up = shift(LEFTY_IDLE_POSE, { ls: [0, 0, -16], rs: [0, 0, 16], s2: [2, 10, 0], hd: [-4, -8, 6], la: [-12, 0, -10], ra: [-12, 0, 10] });
  return build(spec, [
    { f: 0, pose: LEFTY_IDLE_POSE },
    { f: 16, pose: up },
    { f: 30, pose: shift(up, { s2: [0, -18, 0], hd: [0, 16, -10], la: [-14, 0, -6], lf: [0, -30, 0] }) },
    { f: 44, pose: shift(LEFTY_IDLE_POSE, { ls: [0, 0, -6], rs: [0, 0, 6], s2: [0, 4, 0], la: [-30, 0, -10], lf: [0, -44, 0] }) },
    { f: 60, pose: shift(LEFTY_IDLE_POSE, { la: [-16, 0, -4], lf: [0, -20, 0], hd: [-2, 4, -2] }) },
    { f: spec.frames - 1, pose: LEFTY_IDLE_POSE },
  ]);
}
/** Lefty Lu's Batch 4 pass, exported as a partial delivery. */
export function buildLeftyPilotClips(): AnimationClip[] {
  return buildNamed('Lefty Lu', {
    idle: leftyIdle,
    idle_fidget: leftyIdleFidget,
    field_ready: (spec) => cycle(spec, (p) => shift(FIELD_READY_POSE, { hp: [sin(p) * 1.2, sin(p) * 4, 0], s2: [0, -sin(p, 0.25) * 3, 0], hd: [-sin(p) * 1, sin(p, 0.5) * 6, 0] })),
    run: (spec) => runCycle(spec, 14, 50, 48),
    cheer_fierce: (spec) => directedReaction(spec, true, 'fierce'),
    upset_fierce: (spec) => directedReaction(spec, false, 'fierce'),
  });
}

// Smokey: all energy contained until release. The card is weight on the
// planted leg and a level stare; the fidget coils and snaps.
const SMOKEY_IDLE_POSE: Pose = {
  hp: [6, -4, 2], sp: [4, -3, 0], s2: [5, -4, 0], hd: [-3, 8, 0],
  la: [3, 0, 66], lf: [0, -22, 0], ra: [3, 0, -66], rf: [0, 22, 0],
  lu: [5, 0, 3], ll: [-10, 0, 0], ru: [3, 0, -3], rl: [-6, 0, 0],
};
const SMOKEY_CARD_POSE: Pose = /* @__PURE__ */ shift(SMOKEY_IDLE_POSE, {
  hp: [0, -10, 3], s2: [0, -6, 0], hd: [-2, 14, 0],
  la: [-6, 0, -4], lf: [0, -26, 0], ra: [-34, 0, 8], rf: [0, 62, 0],
  lu: [4, 0, 0], ll: [-6, 0, 0], ru: [-4, 0, 0], rl: [4, 0, 0],
});
function smokeyIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: SMOKEY_IDLE_POSE },
    { f: 12, pose: shift(SMOKEY_IDLE_POSE, { sp: [0.8, 0, 0], s2: [0.8, 0, 0] }), hips: [0, 0.006, 0] },
    // Contained: the only visible thing is a slow, small coil and release.
    { f: 26, pose: shift(SMOKEY_IDLE_POSE, { hp: [0, -6, 0], s2: [0, -4, 0], hd: [0, 6, 0] }) },
    { f: 36, pose: shift(SMOKEY_IDLE_POSE, { hp: [0, -6, 0], s2: [0, -4, 0], hd: [0, 6, 0] }) },
    { f: 44, pose: shift(SMOKEY_IDLE_POSE, { hp: [0, 3, 0], hd: [0, -2, 0] }) },
    { f: spec.frames, pose: SMOKEY_IDLE_POSE },
  ]);
}
function smokeyIdleFidget(spec: ClipSpec): AnimationClip {
  // Coil into the planted leg, hold the tension, snap through, exhale hard.
  const coil = shift(SMOKEY_IDLE_POSE, { hp: [4, -16, 4], sp: [2, -8, 0], s2: [2, -10, 0], hd: [-4, 18, 0], ra: [-20, 0, 6], rf: [0, 40, 0], lu: [4, 0, 0], ll: [-8, 0, 0] });
  const snap = shift(SMOKEY_IDLE_POSE, { hp: [2, 12, -2], sp: [0, 8, 0], s2: [0, 10, 0], hd: [-2, -10, 0], ra: [-40, 0, 12], rf: [0, 20, 0] });
  return build(spec, [
    { f: 0, pose: SMOKEY_IDLE_POSE },
    { f: 16, pose: coil, hips: [0.05, -0.02, 0] },
    { f: 36, pose: shift(coil, { hp: [0, -2, 0] }), hips: [0.06, -0.025, 0] },
    { f: 41, pose: snap, hips: [-0.03, 0.01, 0] },
    { f: 52, pose: shift(SMOKEY_IDLE_POSE, { hp: [8, 0, 0], s2: [6, 0, 0], hd: [10, 0, 0] }) },
    { f: 66, pose: shift(SMOKEY_IDLE_POSE, { hp: [3, 0, 0], hd: [4, 0, 0] }) },
    { f: spec.frames - 1, pose: SMOKEY_IDLE_POSE },
  ]);
}
/** Smokey's Batch 4 pass, exported as a partial delivery. */
export function buildSmokeyPilotClips(): AnimationClip[] {
  return buildNamed('Smokey', {
    idle: smokeyIdle,
    idle_fidget: smokeyIdleFidget,
    pose_card: (spec) => heldPose(spec, SMOKEY_CARD_POSE, [0.05, 0, 0]),
    run: (spec) => runCycle(spec, 16, 50, 52),
    cheer_fierce: (spec) => directedReaction(spec, true, 'fierce'),
    upset_fierce: (spec) => directedReaction(spec, false, 'fierce'),
  });
}

// Bend-It: his body follows the path he imagines for the ball. Gestures draw
// curves, balances recover through side steps, the goofy win is discovery.
const BENDIT_IDLE_POSE: Pose = {
  hp: [5, 2, 0], sp: [4, 0, 0], s2: [5, 2, 0], hd: [-4, -6, 3],
  la: [2, 0, 66], lf: [0, -20, 0], ra: [2, 0, -66], rf: [0, 20, 0],
  lu: [5, 0, 4], ll: [-9, 0, 0], ru: [5, 0, -4], rl: [-9, 0, 0],
};
function benditIdle(spec: ClipSpec): AnimationClip {
  // The right hand traces the curve he is imagining, small, then drops.
  return build(spec, [
    { f: 0, pose: BENDIT_IDLE_POSE },
    { f: 14, pose: shift(BENDIT_IDLE_POSE, { ra: [-30, 0, 4], rf: [0, 30, 0], hd: [-2, -12, 2] }) },
    { f: 26, pose: shift(BENDIT_IDLE_POSE, { ra: [-56, 0, 16], rf: [0, 44, 0], hd: [-6, 4, -2], s2: [0, 6, 0] }) },
    { f: 38, pose: shift(BENDIT_IDLE_POSE, { ra: [-40, 0, 26], rf: [0, 22, 0], hd: [-4, 14, -4], s2: [0, 8, 0] }) },
    { f: 50, pose: shift(BENDIT_IDLE_POSE, { ra: [-10, 0, 8], rf: [0, 10, 0], hd: [-2, 2, 0] }) },
    { f: spec.frames, pose: BENDIT_IDLE_POSE },
  ]);
}
function benditNervous(spec: ClipSpec): AnimationClip {
  return cycle(spec, (p) => {
    const sway = sin(p) * 5;
    const look = sin(p, 0.33) * 14;
    return shift(BENDIT_IDLE_POSE, {
      hp: [0, sway, 0], sp: [0, sway * 0.4, 0], s2: [0, -sway * 0.5, 0],
      hd: [0, look, sin(p, 0.11) * 5],
      la: [-12, 0, -6 + sway], lf: [0, -26, 0], ra: [-12, 0, 6 - sway], rf: [0, 26, 0],
      lu: [sway * 0.5, 0, 6], ru: [-sway * 0.5, 0, -6],
    });
  });
}
function benditIdleFidget(spec: ClipSpec): AnimationClip {
  // A balance that goes wrong and recovers through an unexpected side step.
  const lean = shift(BENDIT_IDLE_POSE, { hp: [2, 0, 10], s2: [0, 0, 6], hd: [-2, -8, -8], la: [-40, 0, -20], lf: [0, -30, 0] });
  const step = shift(BENDIT_IDLE_POSE, { hp: [2, 0, -4], lu: [4, 0, 22], ll: [-14, 0, 0], hd: [-4, 10, 4], la: [-20, 0, -30], ra: [-20, 0, 30] });
  return build(spec, [
    { f: 0, pose: BENDIT_IDLE_POSE },
    { f: 16, pose: lean, hips: [0.04, 0, 0] },
    { f: 28, pose: shift(lean, { hp: [0, 0, 6], hd: [0, 0, -4] }), hips: [0.09, -0.01, 0] },
    { f: 36, pose: step, hips: [0.16, 0.03, 0] },
    { f: 46, pose: shift(BENDIT_IDLE_POSE, { lu: [2, 0, 10], hd: [-4, 6, 2] }), hips: [0.14, 0, 0] },
    { f: 62, pose: shift(BENDIT_IDLE_POSE, { hd: [-2, -4, 0] }), hips: [0.07, 0, 0] },
    { f: 78, pose: BENDIT_IDLE_POSE, hips: [0.02, 0, 0] },
    { f: spec.frames - 1, pose: BENDIT_IDLE_POSE },
  ]);
}
/** Bend-It's Batch 4 pass, exported as a partial delivery. */
export function buildBendItPilotClips(): AnimationClip[] {
  return buildNamed('Bend-It', {
    idle: benditIdle,
    idle_fidget: benditIdleFidget,
    nervous: benditNervous,
    run: (spec) => runCycle(spec, 13, 46, 44),
    cheer_goofy: (spec) => directedReaction(spec, true, 'goofy'),
    upset_goofy: (spec) => directedReaction(spec, false, 'goofy'),
  });
}

/** Resolve a kid's named builders against the contract, as every pass does. */
function buildNamed(
  who: string,
  builders: Readonly<Record<string, (spec: ClipSpec) => AnimationClip>>
): AnimationClip[] {
  return Object.entries(builders).map(([name, make]) => {
    const spec = CLIPS.find((candidate) => candidate.name === name);
    if (!spec) throw new Error(`${who} pass names unknown contract clip "${name}"`);
    return make(spec as ClipSpec);
  });
}

// --- Batches 5 and 6: Noodle, Bubbles, Sniffles, The Professor, Dazzle, Grizz --

// Noodle: effort visible before outcome. He rehearses a pose, checks whether
// it worked, then commits too hard; recoveries are earnest and rebuilt.
const NOODLE_IDLE_POSE: Pose = {
  hp: [6, 0, 0], sp: [6, 0, 0], s2: [8, 0, 0], hd: [-5, -4, 2],
  la: [-4, 0, 66], lf: [0, -24, 0], ra: [-4, 0, -66], rf: [0, 24, 0],
  lu: [7, 0, 4], ll: [-12, 0, 0], ru: [7, 0, -4], rl: [-12, 0, 0],
};
function noodleIdle(spec: ClipSpec): AnimationClip {
  // A rehearsal: he tries a taller version of himself, checks, and deflates.
  const taller = shift(NOODLE_IDLE_POSE, { hp: [-8, 0, 0], sp: [-6, 0, 0], s2: [-10, 0, 0], hd: [-2, 0, 0] });
  return build(spec, [
    { f: 0, pose: NOODLE_IDLE_POSE },
    { f: 14, pose: taller, hips: [0, 0.03, 0] },
    { f: 24, pose: shift(taller, { hd: [4, -14, 0] }), hips: [0, 0.03, 0] },
    { f: 34, pose: shift(taller, { hd: [4, 12, 0] }), hips: [0, 0.028, 0] },
    { f: 46, pose: shift(NOODLE_IDLE_POSE, { hd: [4, 0, 0], s2: [2, 0, 0] }) },
    { f: spec.frames, pose: NOODLE_IDLE_POSE },
  ]);
}
function noodleNervous(spec: ClipSpec): AnimationClip {
  return cycle(spec, (p) => {
    const sway = sin(p) * 5;
    const look = sin(p, 0.33) * 14;
    return shift(NOODLE_IDLE_POSE, {
      hp: [0, sway, 0], sp: [0, sway * 0.4, 0], s2: [0, -sway * 0.5, 0],
      hd: [0, look, sin(p, 0.11) * 3],
      la: [-10, 0, -6 + sway], lf: [0, -22, 0], ra: [-10, 0, 6 - sway], rf: [0, 22, 0],
      lu: [sway * 0.5, 0, 6], ru: [-sway * 0.5, 0, -6],
    });
  });
}
function noodleIdleFidget(spec: ClipSpec): AnimationClip {
  // Rehearse a hero stance, check it, commit too hard, wobble, rebuild.
  const rehearse = shift(NOODLE_IDLE_POSE, { hp: [-6, -10, 0], s2: [-6, -6, 0], hd: [-4, 12, 0], la: [-10, 0, -8], lf: [0, -50, 0], ra: [-30, 0, 10], rf: [0, 50, 0] });
  const tooHard = shift(rehearse, { hp: [-8, -8, 4], s2: [-8, -6, 0], hd: [-6, 8, -4], ra: [-30, 0, 6], lu: [-6, 0, 0], ru: [8, 0, 0] });
  return build(spec, [
    { f: 0, pose: NOODLE_IDLE_POSE },
    { f: 16, pose: rehearse, hips: [0, 0.01, 0] },
    { f: 26, pose: shift(rehearse, { hd: [6, -10, 0] }) },
    { f: 36, pose: tooHard, hips: [0.06, 0.02, 0] },
    { f: 44, pose: shift(tooHard, { hp: [4, 0, -8], hd: [4, 0, 6] }), hips: [0.1, 0, 0] },
    { f: 56, pose: shift(NOODLE_IDLE_POSE, { hp: [2, 0, -3], hd: [2, -6, 0] }), hips: [0.05, 0, 0] },
    { f: 72, pose: shift(NOODLE_IDLE_POSE, { hd: [-2, 2, 0] }), hips: [0.01, 0, 0] },
    { f: spec.frames - 1, pose: NOODLE_IDLE_POSE },
  ]);
}
/** Noodle's Batch 5 pass, exported as a partial delivery. */
export function buildNoodlePilotClips(): AnimationClip[] {
  return buildNamed('Noodle', {
    idle: noodleIdle,
    idle_fidget: noodleIdleFidget,
    nervous: noodleNervous,
    run: (spec) => runCycle(spec, 14, 50, 46),
    cheer_tender: (spec) => directedReaction(spec, true, 'tender'),
    upset_tender: (spec) => directedReaction(spec, false, 'tender'),
  });
}

// Bubbles: she rebounds from every contact as if the ground is friendly.
// Holds are short, turns float through the shoulders.
const BUBBLES_IDLE_POSE: Pose = {
  hp: [4, 0, 0], sp: [2, 0, 0], s2: [3, -2, 0], hd: [-4, 8, -3],
  la: [6, 0, 62], lf: [0, -28, 0], ra: [6, 0, -62], rf: [0, 28, 0],
  lu: [4, 0, 3], ll: [-8, 0, 0], ru: [4, 0, -3], rl: [-8, 0, 0],
};
const BUBBLES_CARD_POSE: Pose = /* @__PURE__ */ shift(BUBBLES_IDLE_POSE, {
  hp: [0, 14, -4], s2: [0, 10, 0], hd: [-4, -18, 6],
  la: [-20, 0, -8], lf: [0, -60, 0], ra: [-70, 0, 20], rf: [0, 40, 0],
  lu: [-4, 0, 0], ll: [6, 0, 0], ru: [6, 0, 0], rl: [-8, 0, 0],
});
function bubblesIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: BUBBLES_IDLE_POSE },
    { f: 8, pose: shift(BUBBLES_IDLE_POSE, { s2: [-1, 3, 0], ls: [0, 0, -4], rs: [0, 0, 4] }), hips: [0, 0.035, 0] },
    { f: 16, pose: shift(BUBBLES_IDLE_POSE, { hp: [0, 8, 0], s2: [0, 6, 0] }) },
    { f: 24, pose: shift(BUBBLES_IDLE_POSE, { hp: [0, 8, 0], s2: [0, 6, 0], hd: [-2, 12, -4] }), hips: [0, 0.035, 0] },
    { f: 34, pose: shift(BUBBLES_IDLE_POSE, { hp: [0, -6, 0], s2: [0, -5, 0], hd: [-2, 4, -2] }) },
    { f: 42, pose: shift(BUBBLES_IDLE_POSE, { hp: [0, -6, 0], s2: [0, -5, 0], hd: [-3, -8, 3] }), hips: [0, 0.035, 0] },
    { f: 52, pose: shift(BUBBLES_IDLE_POSE, { hd: [-2, 0, 0] }), hips: [0, 0.018, 0] },
    { f: spec.frames, pose: BUBBLES_IDLE_POSE },
  ]);
}
function bubblesIdleFidget(spec: ClipSpec): AnimationClip {
  // A bounce, a wave to somebody, another bounce, and she finds one more
  // person to wave at on the other side.
  const wave = shift(BUBBLES_IDLE_POSE, { hd: [-4, -20, 6], s2: [0, -8, 0], ra: [-120, 0, 24], rf: [0, 50, 0] });
  const waveOther = shift(BUBBLES_IDLE_POSE, { hd: [-4, 22, -6], s2: [0, 8, 0], la: [-120, 0, -24], lf: [0, -50, 0] });
  return build(spec, [
    { f: 0, pose: BUBBLES_IDLE_POSE },
    { f: 8, pose: shift(BUBBLES_IDLE_POSE, { ll: [-14, 0, 0], rl: [-14, 0, 0] }), hips: [0, -0.03, 0] },
    { f: 14, pose: wave, hips: [0, 0.12, 0] },
    { f: 22, pose: shift(wave, { rf: [0, -14, 0], hd: [0, -2, 0] }) },
    { f: 30, pose: shift(wave, { rf: [0, 10, 0] }) },
    { f: 40, pose: shift(BUBBLES_IDLE_POSE, { ll: [-14, 0, 0], rl: [-14, 0, 0] }), hips: [0, -0.03, 0] },
    { f: 46, pose: waveOther, hips: [0, 0.12, 0] },
    { f: 54, pose: shift(waveOther, { lf: [0, 14, 0] }) },
    { f: 62, pose: shift(waveOther, { lf: [0, -10, 0] }) },
    { f: 76, pose: shift(BUBBLES_IDLE_POSE, { hd: [-2, 4, 0] }), hips: [0, 0.02, 0] },
    { f: spec.frames - 1, pose: BUBBLES_IDLE_POSE },
  ]);
}
function bubblesCheer(spec: ClipSpec): AnimationClip {
  const up = shift(BUBBLES_IDLE_POSE, {
    hp: [-8, 0, 0], hd: [-8, 0, 0], la: [-126, 0, -30], ra: [-126, 0, 30],
    lu: [-20, 0, 6], ll: [30, 0, 0], ru: [-20, 0, -6], rl: [30, 0, 0],
  });
  const include = shift(BUBBLES_IDLE_POSE, { hp: [0, 20, 0], s2: [0, 10, 0], hd: [-4, -24, 6], la: [-90, 0, -40], lf: [0, -30, 0], ra: [-30, 0, 10] });
  return build(spec, [
    { f: 0, pose: BUBBLES_IDLE_POSE },
    { f: 6, pose: shift(BUBBLES_IDLE_POSE, { hp: [10, 0, 0], ll: [-18, 0, 0], rl: [-18, 0, 0] }), hips: [0, -0.05, 0] },
    { f: 13, pose: up, hips: [0, 0.4, 0] },
    { f: 21, pose: shift(BUBBLES_IDLE_POSE, { hp: [8, 0, 0], la: [-40, 0, 0], ra: [-40, 0, 0], ll: [-14, 0, 0], rl: [-14, 0, 0] }), hips: [0, -0.03, 0] },
    { f: 30, pose: include, hips: [0, 0.03, 0] },
    { f: 38, pose: shift(include, { hp: [0, -30, 0], s2: [0, -14, 0], hd: [0, 40, -10], la: [60, 0, 0], ra: [-60, 0, -30], rf: [0, 30, 0] }), hips: [0, 0.03, 0] },
    { f: spec.frames - 1, pose: shift(BUBBLES_IDLE_POSE, { hd: [-4, 8, -2] }) },
  ]);
}
function bubblesUpset(spec: ClipSpec): AnimationClip {
  const sag = shift(BUBBLES_IDLE_POSE, { hp: [10, 0, 0], s2: [10, 0, 0], hd: [18, 0, 0], ls: [0, 0, 6], rs: [0, 0, -6] });
  return build(spec, [
    { f: 0, pose: BUBBLES_IDLE_POSE },
    { f: 10, pose: sag, hips: [0, -0.03, 0] },
    { f: 24, pose: shift(sag, { hd: [4, -12, 0] }), hips: [0, -0.035, 0] },
    // The rebound: even this is over quickly.
    { f: 38, pose: shift(BUBBLES_IDLE_POSE, { hp: [-2, 0, 0], hd: [-6, 6, -2] }), hips: [0, 0.05, 0] },
    { f: 48, pose: shift(BUBBLES_IDLE_POSE, { hd: [-2, 2, 0] }), hips: [0, 0.01, 0] },
    { f: spec.frames - 1, pose: BUBBLES_IDLE_POSE },
  ]);
}
/** Bubbles' Batch 5 pass, exported as a partial delivery. */
export function buildBubblesPilotClips(): AnimationClip[] {
  return buildNamed('Bubbles', {
    idle: bubblesIdle,
    idle_fidget: bubblesIdleFidget,
    pose_card: (spec) => heldPose(spec, BUBBLES_CARD_POSE, [0, 0.01, 0]),
    run: (spec) => runCycle(spec, 15, 50, 48),
    cheer: bubblesCheer,
    upset: bubblesUpset,
  });
}

// Sniffles: he braces for sneezes that may not arrive. The signature fidget
// is a nose scrunch and an aborted reach for the pocket.
const SNIFFLES_IDLE_POSE: Pose = {
  hp: [7, 0, 0], sp: [7, 0, 0], s2: [8, 0, 0], hd: [2, -5, 3],
  ls: [0, 0, 6], rs: [0, 0, -6],
  la: [-8, 0, 64], lf: [0, -30, 0], ra: [-8, 0, -64], rf: [0, 30, 0],
  lu: [7, 0, 4], ll: [-12, 0, 0], ru: [7, 0, -4], rl: [-12, 0, 0],
};
function snifflesIdle(spec: ClipSpec): AnimationClip {
  // The brace: head back a touch, a held breath, and nothing comes.
  return build(spec, [
    { f: 0, pose: SNIFFLES_IDLE_POSE },
    { f: 18, pose: shift(SNIFFLES_IDLE_POSE, { sp: [0.8, 0, 0], s2: [0.8, 0, 0] }), hips: [0, 0.006, 0] },
    { f: 28, pose: shift(SNIFFLES_IDLE_POSE, { hd: [-10, 0, 0], nk: [-3, 0, 0], s2: [-4, 0, 0], ls: [0, 0, -4], rs: [0, 0, 4] }) },
    { f: 38, pose: shift(SNIFFLES_IDLE_POSE, { hd: [-10, 0, 0], nk: [-3, 0, 0], s2: [-4, 0, 0], ls: [0, 0, -4], rs: [0, 0, 4] }) },
    { f: 48, pose: shift(SNIFFLES_IDLE_POSE, { hd: [4, -2, 0], s2: [2, 0, 0] }) },
    { f: spec.frames, pose: SNIFFLES_IDLE_POSE },
  ]);
}
function snifflesNervous(spec: ClipSpec): AnimationClip {
  return cycle(spec, (p) => {
    const sway = sin(p) * 4;
    const look = sin(p, 0.33) * 10;
    return shift(SNIFFLES_IDLE_POSE, {
      hp: [0, sway, 0], sp: [0, sway * 0.4, 0], s2: [0, -sway * 0.5, 0],
      hd: [0, look, sin(p, 0.11) * 3],
      la: [-8, 0, -4 + sway], lf: [0, -20, 0], ra: [-8, 0, 4 - sway], rf: [0, 20, 0],
      lu: [sway * 0.4, 0, 6], ru: [-sway * 0.4, 0, -6],
    });
  });
}
function snifflesIdleFidget(spec: ClipSpec): AnimationClip {
  // Nose scrunch (head tips back, shoulders up), a reach toward the pocket
  // that stops halfway, and a sheepish settle.
  const scrunch = shift(SNIFFLES_IDLE_POSE, { hd: [-14, 4, 4], nk: [-4, 0, 0], ls: [0, 0, -10], rs: [0, 0, 10], s2: [-4, 0, 0] });
  const reach = shift(SNIFFLES_IDLE_POSE, { hd: [10, -8, 0], ra: [-24, 0, 18], rf: [0, 44, 0], s2: [4, -4, 0] });
  return build(spec, [
    { f: 0, pose: SNIFFLES_IDLE_POSE },
    { f: 12, pose: scrunch },
    { f: 22, pose: shift(scrunch, { hd: [-4, 0, 0] }) },
    { f: 30, pose: shift(SNIFFLES_IDLE_POSE, { hd: [6, 0, 0], s2: [3, 0, 0] }) },
    { f: 42, pose: reach },
    { f: 50, pose: shift(reach, { ra: [8, 0, -6], rf: [0, -16, 0] }) },
    { f: 62, pose: shift(SNIFFLES_IDLE_POSE, { hd: [6, -10, 2], s2: [3, 0, 0] }) },
    { f: 78, pose: shift(SNIFFLES_IDLE_POSE, { hd: [2, -2, 0] }) },
    { f: spec.frames - 1, pose: SNIFFLES_IDLE_POSE },
  ]);
}
/** Sniffles' Batch 5 pass, exported as a partial delivery. */
export function buildSnifflesPilotClips(): AnimationClip[] {
  return buildNamed('Sniffles', {
    idle: snifflesIdle,
    idle_fidget: snifflesIdleFidget,
    nervous: snifflesNervous,
    run: (spec) => runCycle(spec, 12, 46, 42),
    cheer_tender: (spec) => directedReaction(spec, true, 'tender'),
    upset_tender: (spec) => directedReaction(spec, false, 'tender'),
  });
}

// The Professor: observes before acting, annotates afterward. One invisible
// calculation before the card beat.
const PROF_IDLE_POSE: Pose = {
  hp: [3, 0, 0], sp: [3, 0, 0], s2: [4, 0, 0], hd: [-2, 2, 0],
  la: [0, 0, 70], lf: [0, -14, 0], ra: [0, 0, -70], rf: [0, 14, 0],
  lu: [3, 0, 2], ll: [-6, 0, 0], ru: [3, 0, -2], rl: [-6, 0, 0],
};
function profIdle(spec: ClipSpec): AnimationClip {
  // Observation: the head tracks something across the field, slowly, and
  // nods once when the calculation lands.
  return build(spec, [
    { f: 0, pose: PROF_IDLE_POSE },
    { f: 16, pose: shift(PROF_IDLE_POSE, { hd: [-2, -12, 0], nk: [0, -4, 0] }) },
    { f: 34, pose: shift(PROF_IDLE_POSE, { hd: [-2, 10, 0], nk: [0, 4, 0] }) },
    { f: 42, pose: shift(PROF_IDLE_POSE, { hd: [6, 8, 0] }) },
    { f: 50, pose: shift(PROF_IDLE_POSE, { hd: [-2, 4, 0] }) },
    { f: spec.frames, pose: PROF_IDLE_POSE },
  ]);
}
function profIdleFidget(spec: ClipSpec): AnimationClip {
  // The annotation: a finger raised, a point at where the ball would go, and
  // a small nod — the invisible calculation.
  const finger = shift(PROF_IDLE_POSE, { hd: [-6, 6, 0], ra: [-70, 0, 8], rf: [0, 110, 0], s2: [-2, 0, 0] });
  const point = shift(PROF_IDLE_POSE, { hd: [-8, -22, 0], nk: [0, -6, 0], s2: [0, -10, 0], ra: [-96, 0, 26], rf: [0, 30, 0] });
  return build(spec, [
    { f: 0, pose: PROF_IDLE_POSE },
    { f: 16, pose: finger },
    { f: 30, pose: shift(finger, { hd: [2, 0, 0] }) },
    { f: 42, pose: point },
    { f: 56, pose: shift(point, { hd: [4, 0, 0] }) },
    { f: 68, pose: shift(PROF_IDLE_POSE, { hd: [4, 2, 0], ra: [-20, 0, 6], rf: [0, 30, 0] }) },
    { f: spec.frames - 1, pose: PROF_IDLE_POSE },
  ]);
}
/** The Professor's Batch 6 pass, exported as a partial delivery. */
export function buildProfPilotClips(): AnimationClip[] {
  return buildNamed('The Professor', {
    idle: profIdle,
    idle_fidget: profIdleFidget,
    field_ready: (spec) => readyLoop(spec, { hd: [-2, 0, 0] }, 1.4),
    run: (spec) => runCycle(spec, 10, 46, 42),
    cheer_cool: (spec) => directedReaction(spec, true, 'cool'),
    upset_cool: (spec) => directedReaction(spec, false, 'cool'),
  });
}

// Dazzle: she always knows where the camera would be. Turns finish on a
// clean three-quarter; a missed beat protects dignity before showing hurt.
const DIVA_IDLE_POSE: Pose = {
  hp: [3, -8, 2], sp: [2, -4, 0], s2: [2, -6, 0], hd: [-4, 12, -3],
  la: [4, 0, 66], lf: [0, -22, 0], ra: [4, 0, -66], rf: [0, 22, 0],
  lu: [4, 0, 4], ll: [-8, 0, 0], ru: [2, 0, -2], rl: [-4, 0, 0],
};
const DIVA_CARD_POSE: Pose = /* @__PURE__ */ shift(DIVA_IDLE_POSE, {
  hp: [0, -22, 4], s2: [0, -10, 0], hd: [-4, 26, -4],
  la: [-8, 0, -6], lf: [0, -62, 0], ra: [-12, 0, 6], rf: [0, 44, 0],
  lu: [-2, 0, 2], ll: [4, 0, 0], ru: [6, 0, -2], rl: [-6, 0, 0],
});
function divaIdle(spec: ClipSpec): AnimationClip {
  // The turn to three-quarter, finished and held, then released.
  return build(spec, [
    { f: 0, pose: DIVA_IDLE_POSE },
    { f: 16, pose: shift(DIVA_IDLE_POSE, { hp: [0, -10, 2], s2: [0, -4, 0], hd: [0, 8, -2] }), hips: [0.01, 0.006, 0] },
    { f: 24, pose: shift(DIVA_IDLE_POSE, { hp: [0, -10, 2], s2: [0, -4, 0], hd: [-2, 12, -3] }), hips: [0.01, 0.006, 0] },
    { f: 40, pose: shift(DIVA_IDLE_POSE, { hp: [0, -10, 2], s2: [0, -4, 0], hd: [-2, 12, -3] }), hips: [0.01, 0.006, 0] },
    { f: 52, pose: shift(DIVA_IDLE_POSE, { hp: [0, -2, 0], hd: [0, 2, 0] }) },
    { f: spec.frames, pose: DIVA_IDLE_POSE },
  ]);
}
function divaIdleFidget(spec: ClipSpec): AnimationClip {
  // Hair back with the left hand, a clean three-quarter turn, and the kiss —
  // tossed after the pose has already been struck.
  const hair = shift(DIVA_IDLE_POSE, { hd: [-8, 14, -6], la: [-100, 0, -6], lf: [0, -120, 0] });
  const kiss = shift(DIVA_CARD_POSE, { ra: [-70, 0, 10], rf: [0, 96, 0], hd: [-2, 24, -2] });
  return build(spec, [
    { f: 0, pose: DIVA_IDLE_POSE },
    { f: 14, pose: hair },
    { f: 24, pose: shift(hair, { la: [10, 0, 0], lf: [0, 20, 0], hd: [0, -4, 0] }) },
    { f: 36, pose: DIVA_CARD_POSE, hips: [0.02, 0.01, 0] },
    { f: 48, pose: kiss, hips: [0.02, 0.01, 0] },
    { f: 56, pose: shift(kiss, { ra: [-20, 0, 20], rf: [0, -40, 0] }), hips: [0.02, 0.01, 0] },
    { f: 72, pose: shift(DIVA_IDLE_POSE, { hd: [-2, 6, -1] }) },
    { f: spec.frames - 1, pose: DIVA_IDLE_POSE },
  ]);
}
/** Dazzle's Batch 6 pass, exported as a partial delivery. */
export function buildDivaPilotClips(): AnimationClip[] {
  return buildNamed('Dazzle', {
    idle: divaIdle,
    idle_fidget: divaIdleFidget,
    pose_card: (spec) => heldPose(spec, DIVA_CARD_POSE, [0.02, 0.01, 0]),
    run: (spec) => runCycle(spec, 13, 48, 46),
    cheer_fierce: (spec) => directedReaction(spec, true, 'fierce'),
    upset_fierce: (spec) => directedReaction(spec, false, 'fierce'),
  });
}

// Grizz: gravity wins until baseball interrupts it. The idle nearly naps,
// and the upset is mostly the inconvenience of having to react.
const GRIZZ_IDLE_POSE: Pose = {
  hp: [8, 0, 0], sp: [8, 0, 0], s2: [10, 0, 0], hd: [8, -3, 2],
  ls: [0, 0, 4], rs: [0, 0, -4],
  la: [0, 0, 70], lf: [0, -10, 0], ra: [0, 0, -70], rf: [0, 10, 0],
  lu: [8, 0, 4], ll: [-14, 0, 0], ru: [8, 0, -4], rl: [-14, 0, 0],
};
function grizzIdle(spec: ClipSpec): AnimationClip {
  // The nod: head sinks, catches itself, sinks again.
  return build(spec, [
    { f: 0, pose: GRIZZ_IDLE_POSE },
    { f: 20, pose: shift(GRIZZ_IDLE_POSE, { hd: [8, 0, 0], nk: [3, 0, 0], s2: [2, 0, 0] }), hips: [0, -0.01, 0] },
    { f: 26, pose: shift(GRIZZ_IDLE_POSE, { hd: [-4, 2, 0], nk: [-1, 0, 0], s2: [-1, 0, 0] }), hips: [0, 0.006, 0] },
    { f: 44, pose: shift(GRIZZ_IDLE_POSE, { hd: [6, -2, 1], nk: [2, 0, 0], s2: [2, 0, 0] }), hips: [0, -0.008, 0] },
    { f: spec.frames, pose: GRIZZ_IDLE_POSE },
  ]);
}
function grizzNervous(spec: ClipSpec): AnimationClip {
  return cycle(spec, (p) => {
    const sway = sin(p) * 3;
    const look = sin(p, 0.33) * 8;
    return shift(GRIZZ_IDLE_POSE, {
      hp: [0, sway, 0], sp: [0, sway * 0.3, 0], s2: [0, -sway * 0.4, 0],
      hd: [0, look, sin(p, 0.11) * 2],
      la: [-6, 0, -2 + sway], lf: [0, -14, 0], ra: [-6, 0, 2 - sway], rf: [0, 14, 0],
      lu: [sway * 0.3, 0, 6], ru: [-sway * 0.3, 0, -6],
    });
  });
}
function grizzIdleFidget(spec: ClipSpec): AnimationClip {
  // Gravity wins: a sag, a stretch that is one enormous slow uncoiling —
  // arms up, chest open, head back — and then back down into the slouch.
  const sag = shift(GRIZZ_IDLE_POSE, { hp: [4, 0, 0], s2: [4, 0, 0], hd: [6, 0, 0] });
  const stretch = shift(GRIZZ_IDLE_POSE, {
    hp: [-14, 0, 0], sp: [-10, 0, 0], s2: [-16, 0, 0], hd: [-18, 0, 0], nk: [-4, 0, 0],
    ls: [0, 0, -6], rs: [0, 0, 6],
    la: [-150, 0, -36], lf: [0, 20, 0], ra: [-150, 0, 36], rf: [0, -20, 0],
    lu: [-6, 0, 0], ll: [6, 0, 0], ru: [-6, 0, 0], rl: [6, 0, 0],
  });
  return build(spec, [
    { f: 0, pose: GRIZZ_IDLE_POSE },
    { f: 16, pose: sag, hips: [0, -0.02, 0] },
    { f: 44, pose: stretch, hips: [0, 0.05, 0] },
    { f: 56, pose: shift(stretch, { hd: [4, 6, 0], la: [10, 0, 4], ra: [10, 0, -4] }), hips: [0, 0.05, 0] },
    { f: 74, pose: shift(GRIZZ_IDLE_POSE, { hp: [2, 0, 0], hd: [2, 0, 0] }), hips: [0, -0.005, 0] },
    { f: spec.frames - 1, pose: GRIZZ_IDLE_POSE },
  ]);
}
/** Grizz's Batch 6 pass, exported as a partial delivery. */
export function buildGrizzPilotClips(): AnimationClip[] {
  return buildNamed('Grizz', {
    idle: grizzIdle,
    idle_fidget: grizzIdleFidget,
    nervous: grizzNervous,
    // Heavy: less lean, a shorter reach, more drive from the arms.
    run: (spec) => runCycle(spec, 8, 40, 50),
    cheer_cool: (spec) => directedReaction(spec, true, 'cool'),
    upset_cool: (spec) => directedReaction(spec, false, 'cool'),
  });
}

// --- Batches 7 and 8: the last nine ------------------------------------------
// Flash, Cricket, Moose, Peaches, Gizmo, Clover, Rocket, Chip and Boomer.

/** A sunny kid's cheer: a crouch, one hop with the arms up, and a settle
 * that keeps the smile — the broad read, sized to the kid's own idle. */
function sunnyCheer(spec: ClipSpec, idle: Pose, hopFt = 0.35): AnimationClip {
  const crouch = shift(idle, { hp: [10, 0, 0], lu: [10, 0, 0], ll: [-18, 0, 0], ru: [10, 0, 0], rl: [-18, 0, 0] });
  const up = shift(idle, {
    hp: [-8, 0, 0], hd: [-8, 0, 0], la: [-126, 0, -30], ra: [-126, 0, 30],
    lu: [-20, 0, 6], ll: [30, 0, 0], ru: [-20, 0, -6], rl: [30, 0, 0],
  });
  return build(spec, [
    { f: 0, pose: idle },
    { f: 7, pose: crouch, hips: [0, -0.05, 0] },
    { f: 14, pose: up, hips: [0, hopFt, 0] },
    { f: 22, pose: shift(idle, { hp: [8, 0, 0], la: [-50, 0, 0], ra: [-50, 0, 0], ll: [-14, 0, 0], rl: [-14, 0, 0] }), hips: [0, -0.03, 0] },
    { f: 30, pose: shift(idle, { hp: [-4, 0, 0], hd: [-6, 8, -3], la: [-70, 0, -10], lf: [0, -40, 0], ra: [-30, 0, 6] }), hips: [0, 0.02, 0] },
    { f: 38, pose: shift(idle, { hd: [-4, 6, -2], la: [-20, 0, -4], lf: [0, -20, 0] }) },
    { f: spec.frames - 1, pose: idle },
  ]);
}
/** A sunny kid's upset: a sag, a look down, a shoulder shrug, and a
 * recovery that does not stay down long. */
function sunnyUpset(spec: ClipSpec, idle: Pose): AnimationClip {
  const sag = shift(idle, { hp: [10, 0, 0], s2: [10, 0, 0], hd: [18, 0, 0] });
  return build(spec, [
    { f: 0, pose: idle },
    { f: 10, pose: sag, hips: [0, -0.03, 0] },
    { f: 24, pose: shift(sag, { hd: [4, -12, 0], ls: [0, 0, -8], rs: [0, 0, 8], la: [-12, 0, -8], ra: [-12, 0, 8] }), hips: [0, -0.03, 0] },
    { f: 38, pose: shift(sag, { hd: [2, 8, 0] }), hips: [0, -0.02, 0] },
    { f: 50, pose: shift(idle, { hd: [4, 0, 0] }) },
    { f: spec.frames - 1, pose: idle },
  ]);
}

// Flash Gordon Jr.: his hands are faster than the rest of him. Bat actions
// snap around a clear hold; locomotion stays smooth so speed reads as control.
const FLASH_IDLE_POSE: Pose = {
  hp: [6, -2, 0], sp: [4, -2, 0], s2: [5, -3, 0], hd: [-4, 6, 0],
  la: [2, 0, 66], lf: [0, -22, 0], ra: [2, 0, -66], rf: [0, 22, 0],
  lu: [5, 0, 2], ll: [-9, 0, 0], ru: [5, 0, -2], rl: [-9, 0, 0],
};
const FLASH_STANCE_POSE: Pose = /* @__PURE__ */ shift(BAT_STANCE_POSE, {
  hp: [8, -4, 0], sp: [5, -3, 0], s2: [4, -5, 0], hd: [-3, 6, 0],
  lu: [5, 0, 2], ll: [-6, 0, 0], ru: [-3, 0, -2], rl: [4, 0, 0],
});
function flashIdle(spec: ClipSpec): AnimationClip {
  // Still — then the hands flick, twice, fast, and he is still again.
  const flick = shift(FLASH_IDLE_POSE, { lf: [0, -30, 0], rf: [0, 30, 0], lh: [0, 0, -20], rh: [0, 0, 20] });
  return build(spec, [
    { f: 0, pose: FLASH_IDLE_POSE },
    { f: 22, pose: shift(FLASH_IDLE_POSE, { sp: [0.6, 0, 0] }), hips: [0, 0.005, 0] },
    { f: 25, pose: flick },
    { f: 28, pose: FLASH_IDLE_POSE },
    { f: 31, pose: flick },
    { f: 35, pose: shift(FLASH_IDLE_POSE, { hd: [-2, 4, 0] }) },
    { f: spec.frames, pose: FLASH_IDLE_POSE },
  ]);
}
function flashBatStance(spec: ClipSpec): AnimationClip {
  // The hold is the point: a snap of the wrists, then absolutely still.
  return build(spec, [
    { f: 0, pose: FLASH_STANCE_POSE },
    { f: 10, pose: shift(FLASH_STANCE_POSE, { rh: [-8, 0, -12], s2: [0, -2, 0] }), hips: [0, -0.01, 0] },
    { f: 13, pose: shift(FLASH_STANCE_POSE, { rh: [2, 0, 3] }) },
    { f: 16, pose: FLASH_STANCE_POSE },
    { f: 44, pose: shift(FLASH_STANCE_POSE, { s2: [0, -1, 0] }), hips: [0, -0.006, 0] },
    { f: spec.frames, pose: FLASH_STANCE_POSE },
  ]);
}
function flashIdleFidget(spec: ClipSpec): AnimationClip {
  // Proving it: a hand comes up, flips over twice, snaps shut, and he grins
  // at whoever was watching.
  const handUp = shift(FLASH_IDLE_POSE, { ra: [-70, 0, 12], rf: [0, 96, 0], hd: [4, -10, 0] });
  return build(spec, [
    { f: 0, pose: FLASH_IDLE_POSE },
    { f: 12, pose: handUp },
    { f: 16, pose: shift(handUp, { rh: [0, 0, 60] }) },
    { f: 20, pose: shift(handUp, { rh: [0, 0, -60] }) },
    { f: 24, pose: shift(handUp, { rh: [0, 0, 60] }) },
    { f: 28, pose: shift(handUp, { rh: [0, 0, 0], rf: [0, 10, 0] }) },
    { f: 40, pose: shift(FLASH_IDLE_POSE, { hd: [-6, 18, -3], ra: [-20, 0, 6], rf: [0, 30, 0] }) },
    { f: 56, pose: shift(FLASH_IDLE_POSE, { hd: [-4, 10, -2] }) },
    { f: spec.frames - 1, pose: FLASH_IDLE_POSE },
  ]);
}
/** Flash's Batch 7 pass, exported as a partial delivery. */
export function buildFlashPilotClips(): AnimationClip[] {
  return buildNamed('Flash', {
    idle: flashIdle,
    idle_fidget: flashIdleFidget,
    bat_stance: flashBatStance,
    run: (spec) => runCycle(spec, 16, 52, 48),
    cheer_fierce: (spec) => directedReaction(spec, true, 'fierce'),
    upset_fierce: (spec) => directedReaction(spec, false, 'fierce'),
  });
}

// Cricket: energy stored in every crouch, released vertically. One contained
// bounce accidentally becomes three, then a proud attempt at stillness.
const CRICKET_IDLE_POSE: Pose = {
  hp: [8, 0, 0], sp: [6, 0, 0], s2: [6, 0, 0], hd: [-6, -4, 3],
  la: [-4, 0, 66], lf: [0, -30, 0], ra: [-4, 0, -66], rf: [0, 30, 0],
  lu: [10, 0, 4], ll: [-18, 0, 0], ru: [10, 0, -4], rl: [-18, 0, 0],
};
function cricketIdle(spec: ClipSpec): AnimationClip {
  const deeper = shift(CRICKET_IDLE_POSE, { hp: [4, 0, 0], lu: [6, 0, 0], ll: [-10, 0, 0], ru: [6, 0, 0], rl: [-10, 0, 0] });
  return build(spec, [
    { f: 0, pose: CRICKET_IDLE_POSE },
    { f: 20, pose: deeper, hips: [0, -0.04, 0] },
    { f: 30, pose: deeper, hips: [0, -0.045, 0] },
    // The release, small: she catches it before it becomes a bounce.
    { f: 36, pose: shift(CRICKET_IDLE_POSE, { hp: [-4, 0, 0], hd: [-4, 0, 0] }), hips: [0, 0.05, 0] },
    { f: 44, pose: shift(CRICKET_IDLE_POSE, { hd: [-2, 6, 0] }), hips: [0, 0.01, 0] },
    { f: spec.frames, pose: CRICKET_IDLE_POSE },
  ]);
}
function cricketNervous(spec: ClipSpec): AnimationClip {
  return cycle(spec, (p) => {
    const sway = sin(p) * 4;
    const look = sin(p, 0.33) * 12;
    return shift(CRICKET_IDLE_POSE, {
      hp: [0, sway, 0], sp: [0, sway * 0.4, 0], s2: [0, -sway * 0.5, 0],
      hd: [0, look, sin(p, 0.11) * 4],
      la: [-10, 0, -6 + sway], ra: [-10, 0, 6 - sway],
      lu: [sway * 0.5, 0, 6], ru: [-sway * 0.5, 0, -6],
    });
  }, (p) => [0, Math.abs(sin(p, 0.5)) * 0.02, 0]);
}
function cricketIdleFidget(spec: ClipSpec): AnimationClip {
  const crouch = shift(CRICKET_IDLE_POSE, { hp: [6, 0, 0], lu: [8, 0, 0], ll: [-14, 0, 0], ru: [8, 0, 0], rl: [-14, 0, 0] });
  const air = shift(CRICKET_IDLE_POSE, { hp: [-6, 0, 0], hd: [-6, 0, 0], lu: [-10, 0, 0], ll: [16, 0, 0], ru: [-10, 0, 0], rl: [16, 0, 0], la: [-20, 0, -6], ra: [-20, 0, 6] });
  const still = shift(CRICKET_IDLE_POSE, { hp: [-6, 0, 0], sp: [-4, 0, 0], s2: [-6, 0, 0], hd: [-2, 0, 0], lu: [-6, 0, 0], ll: [10, 0, 0], ru: [-6, 0, 0], rl: [10, 0, 0] });
  return build(spec, [
    { f: 0, pose: CRICKET_IDLE_POSE },
    { f: 10, pose: crouch, hips: [0, -0.06, 0] },
    { f: 16, pose: air, hips: [0, 0.3, 0] },
    { f: 22, pose: crouch, hips: [0, -0.04, 0] },
    { f: 27, pose: air, hips: [0, 0.22, 0] },
    { f: 33, pose: crouch, hips: [0, -0.03, 0] },
    { f: 38, pose: air, hips: [0, 0.14, 0] },
    { f: 46, pose: shift(crouch, { hd: [4, 0, 0] }), hips: [0, -0.02, 0] },
    // The proud attempt at stillness: tall, chin up, and it holds.
    { f: 58, pose: still, hips: [0, 0.02, 0] },
    { f: 78, pose: shift(still, { hd: [-2, 6, -2] }), hips: [0, 0.02, 0] },
    { f: spec.frames - 1, pose: CRICKET_IDLE_POSE },
  ]);
}
/** Cricket's Batch 7 pass, exported as a partial delivery. */
export function buildCricketPilotClips(): AnimationClip[] {
  return buildNamed('Cricket', {
    idle: cricketIdle,
    idle_fidget: cricketIdleFidget,
    nervous: cricketNervous,
    run: (spec) => runCycle(spec, 14, 46, 48),
    cheer_goofy: (spec) => directedReaction(spec, true, 'goofy'),
    upset_goofy: (spec) => directedReaction(spec, false, 'goofy'),
  });
}

// Moose: he moves toward teammates, not the camera. Even frustration turns
// into checking whether someone else is okay.
const MOOSE_IDLE_POSE: Pose = {
  hp: [5, 0, 0], sp: [4, 0, 0], s2: [5, 0, 0], hd: [-2, 10, 0],
  la: [0, 0, 70], lf: [0, -12, 0], ra: [0, 0, -70], rf: [0, 12, 0],
  lu: [5, 0, 5], ll: [-10, 0, 0], ru: [5, 0, -5], rl: [-10, 0, 0],
};
function mooseIdle(spec: ClipSpec): AnimationClip {
  return build(spec, [
    { f: 0, pose: MOOSE_IDLE_POSE },
    { f: 18, pose: shift(MOOSE_IDLE_POSE, { sp: [0.8, 0, 0], s2: [0.8, 0, 0] }), hips: [0, 0.007, 0] },
    // A look toward a teammate, a nod, and back.
    { f: 30, pose: shift(MOOSE_IDLE_POSE, { hd: [-2, 14, 2], nk: [0, 5, 0], hp: [0, 4, 0] }) },
    { f: 38, pose: shift(MOOSE_IDLE_POSE, { hd: [6, 14, 2], nk: [0, 5, 0], hp: [0, 4, 0] }) },
    { f: 50, pose: shift(MOOSE_IDLE_POSE, { hd: [-1, 4, 0] }) },
    { f: spec.frames, pose: MOOSE_IDLE_POSE },
  ]);
}
function mooseIdleFidget(spec: ClipSpec): AnimationClip {
  // A wave-over to a teammate, then a thumbs up held until they see it.
  const wave = shift(MOOSE_IDLE_POSE, { hd: [-4, 26, 4], hp: [0, 10, 0], s2: [0, 8, 0], ra: [-96, 0, 22], rf: [0, 60, 0] });
  const thumb = shift(MOOSE_IDLE_POSE, { hd: [-4, 24, 3], hp: [0, 8, 0], s2: [0, 6, 0], ra: [-56, 0, 14], rf: [0, 84, 0], rh: [0, 0, 30] });
  return build(spec, [
    { f: 0, pose: MOOSE_IDLE_POSE },
    { f: 14, pose: wave },
    { f: 22, pose: shift(wave, { rf: [0, -20, 0], ra: [0, 0, 6] }) },
    { f: 30, pose: wave },
    { f: 42, pose: thumb },
    { f: 60, pose: shift(thumb, { hd: [-2, 0, 0] }) },
    { f: 76, pose: shift(MOOSE_IDLE_POSE, { hd: [-2, 8, 1] }) },
    { f: spec.frames - 1, pose: MOOSE_IDLE_POSE },
  ]);
}
/** Moose's Batch 7 pass, exported as a partial delivery. */
export function buildMoosePilotClips(): AnimationClip[] {
  return buildNamed('Moose', {
    idle: mooseIdle,
    idle_fidget: mooseIdleFidget,
    field_ready: (spec) => readyLoop(spec, { hp: [2, 0, 0], la: [0, -6, 0], ra: [0, 6, 0] }, 2.4),
    run: (spec) => runCycle(spec, 10, 44, 46),
    cheer_tender: (spec) => directedReaction(spec, true, 'tender'),
    upset_tender: (spec) => directedReaction(spec, false, 'tender'),
  });
}

// Peaches: smooth and generous timing. The hero pose lets the smile arrive
// after the body settles.
const PEACHES_IDLE_POSE: Pose = {
  hp: [4, 0, 0], sp: [3, 0, 0], s2: [3, -2, 0], hd: [-3, 6, 1],
  la: [3, 0, 68], lf: [0, -18, 0], ra: [3, 0, -68], rf: [0, 18, 0],
  lu: [4, 0, 3], ll: [-8, 0, 0], ru: [4, 0, -3], rl: [-8, 0, 0],
};
const PEACHES_STANCE_POSE: Pose = /* @__PURE__ */ shift(BAT_STANCE_POSE, {
  hp: [4, -3, 0], sp: [3, -3, 0], s2: [2, -5, 0], hd: [-2, 5, 0],
  lu: [4, 0, 1], ll: [-4, 0, 0], ru: [-2, 0, -1], rl: [3, 0, 0],
});
function peachesIdle(spec: ClipSpec): AnimationClip {
  // The quiet breath, and the smile arriving after the body settles.
  return build(spec, [
    { f: 0, pose: PEACHES_IDLE_POSE },
    { f: 20, pose: shift(PEACHES_IDLE_POSE, { sp: [-1.5, 0, 0], s2: [-2, 0, 0], hd: [-1, 0, 0] }), hips: [0, 0.012, 0] },
    { f: 34, pose: shift(PEACHES_IDLE_POSE, { sp: [0.5, 0, 0] }), hips: [0, 0.002, 0] },
    { f: 42, pose: shift(PEACHES_IDLE_POSE, { hd: [-2, 8, 3] }) },
    { f: 52, pose: shift(PEACHES_IDLE_POSE, { hd: [-2, 8, 3] }) },
    { f: spec.frames, pose: PEACHES_IDLE_POSE },
  ]);
}
function peachesIdleFidget(spec: ClipSpec): AnimationClip {
  // A slow roll of the shoulders, one at a time, and a settle with the
  // head tilted toward the team.
  const leftUp = shift(PEACHES_IDLE_POSE, { ls: [0, 0, -14], s2: [0, 6, 0], hd: [-2, -6, 4] });
  const rightUp = shift(PEACHES_IDLE_POSE, { rs: [0, 0, 14], s2: [0, -6, 0], hd: [-2, 6, -4] });
  return build(spec, [
    { f: 0, pose: PEACHES_IDLE_POSE },
    { f: 16, pose: leftUp },
    { f: 30, pose: shift(PEACHES_IDLE_POSE, { s2: [0, 2, 0] }) },
    { f: 44, pose: rightUp },
    { f: 58, pose: shift(PEACHES_IDLE_POSE, { s2: [0, -2, 0] }) },
    { f: 72, pose: shift(PEACHES_IDLE_POSE, { hd: [-2, 10, 4] }) },
    { f: spec.frames - 1, pose: PEACHES_IDLE_POSE },
  ]);
}
/** Peaches' Batch 7 pass, exported as a partial delivery. */
export function buildPeachesPilotClips(): AnimationClip[] {
  return buildNamed('Peaches', {
    idle: peachesIdle,
    idle_fidget: peachesIdleFidget,
    bat_stance: (spec) => breathe(spec, PEACHES_STANCE_POSE, 1.0),
    run: (spec) => runCycle(spec, 13, 48, 44),
    cheer: (spec) => sunnyCheer(spec, PEACHES_IDLE_POSE, 0.25),
    upset: (spec) => sunnyUpset(spec, PEACHES_IDLE_POSE),
  });
}

// Gizmo: he tests mechanisms even while waiting. The hero pose presents one
// improvement.
const GIZMO_IDLE_POSE: Pose = {
  hp: [5, -3, 0], sp: [4, -2, 0], s2: [5, -3, 0], hd: [2, 6, 0],
  la: [-8, 0, 62], lf: [0, -40, 0], ra: [-8, 0, -62], rf: [0, 40, 0],
  lu: [4, 0, 2], ll: [-8, 0, 0], ru: [4, 0, -2], rl: [-8, 0, 0],
};
const GIZMO_CARD_POSE: Pose = /* @__PURE__ */ shift(GIZMO_IDLE_POSE, {
  hp: [0, -12, 2], s2: [0, -6, 0], hd: [-6, 14, -2],
  ra: [-62, 0, 10], rf: [0, 30, 0], rh: [0, 0, -70], la: [4, 0, 4], lf: [0, 6, 0],
  lu: [-2, 0, 0], ll: [4, 0, 0], ru: [4, 0, 0], rl: [-4, 0, 0],
});
function gizmoIdle(spec: ClipSpec): AnimationClip {
  // Hands at the belt, working at something; a look down at it; a nod.
  return build(spec, [
    { f: 0, pose: GIZMO_IDLE_POSE },
    { f: 12, pose: shift(GIZMO_IDLE_POSE, { rh: [0, 0, 24], lh: [0, 0, -24], hd: [8, 2, 0] }) },
    { f: 22, pose: shift(GIZMO_IDLE_POSE, { rh: [0, 0, -20], lh: [0, 0, 20], hd: [8, -2, 0] }) },
    { f: 32, pose: shift(GIZMO_IDLE_POSE, { rh: [0, 0, 20], lh: [0, 0, -20], hd: [10, 0, 0] }) },
    { f: 44, pose: shift(GIZMO_IDLE_POSE, { hd: [-4, 4, 0] }) },
    { f: spec.frames, pose: GIZMO_IDLE_POSE },
  ]);
}
function gizmoIdleFidget(spec: ClipSpec): AnimationClip {
  // He checks the glove strap, tightens it, tests the hinge twice, and
  // presents the result to nobody in particular.
  const strap = shift(GIZMO_IDLE_POSE, { hd: [14, -8, 0], la: [-40, 0, -6], lf: [0, -30, 0], ra: [-46, 0, 14], rf: [0, 34, 0] });
  const present = shift(GIZMO_IDLE_POSE, { hd: [-4, 10, -2], la: [-60, 0, -14], lf: [0, -20, 0], lh: [0, 0, 60], ra: [4, 0, 4] });
  return build(spec, [
    { f: 0, pose: GIZMO_IDLE_POSE },
    { f: 14, pose: strap },
    { f: 22, pose: shift(strap, { ra: [6, 0, 0], rf: [0, 14, 0] }) },
    { f: 30, pose: shift(strap, { lf: [0, 16, 0] }) },
    { f: 36, pose: shift(strap, { lf: [0, -10, 0] }) },
    { f: 42, pose: shift(strap, { lf: [0, 16, 0] }) },
    { f: 56, pose: present },
    { f: 70, pose: shift(present, { hd: [2, 0, 0] }) },
    { f: spec.frames - 1, pose: GIZMO_IDLE_POSE },
  ]);
}
/** Gizmo's Batch 8 pass, exported as a partial delivery. */
export function buildGizmoPilotClips(): AnimationClip[] {
  return buildNamed('Gizmo', {
    idle: gizmoIdle,
    idle_fidget: gizmoIdleFidget,
    pose_card: (spec) => heldPose(spec, GIZMO_CARD_POSE, [0.01, 0, 0]),
    run: (spec) => runCycle(spec, 14, 48, 46),
    cheer_cool: (spec) => directedReaction(spec, true, 'cool'),
    upset_cool: (spec) => directedReaction(spec, false, 'cool'),
  });
}

// Clover: good outcomes happen around her before she notices. Amused
// gratitude rather than claiming control.
const CLOVER_IDLE_POSE: Pose = {
  hp: [3, 2, 0], sp: [2, 0, 0], s2: [2, 2, 0], hd: [-3, -4, 4],
  la: [2, 0, 68], lf: [0, -16, 0], ra: [2, 0, -68], rf: [0, 16, 0],
  lu: [3, 0, 3], ll: [-6, 0, 0], ru: [3, 0, -3], rl: [-6, 0, 0],
};
const CLOVER_CARD_POSE: Pose = /* @__PURE__ */ shift(CLOVER_IDLE_POSE, {
  hp: [0, 10, -2], s2: [0, 6, 0], hd: [-4, -12, 8],
  ra: [-10, 0, 6], rf: [0, 60, 0], la: [-6, 0, -4], lf: [0, -20, 0],
  lu: [2, 0, 0], ll: [-4, 0, 0], ru: [-2, 0, 0], rl: [2, 0, 0],
});
function cloverIdle(spec: ClipSpec): AnimationClip {
  // Something happens off to the side; she notices late, and is amused.
  return build(spec, [
    { f: 0, pose: CLOVER_IDLE_POSE },
    { f: 20, pose: shift(CLOVER_IDLE_POSE, { sp: [0.6, 0, 0] }), hips: [0, 0.006, 0] },
    { f: 34, pose: shift(CLOVER_IDLE_POSE, { hd: [-2, -18, 6], nk: [0, -5, 0] }) },
    { f: 42, pose: shift(CLOVER_IDLE_POSE, { hd: [-4, -18, 8], nk: [0, -5, 0], s2: [0, -3, 0] }) },
    { f: 52, pose: shift(CLOVER_IDLE_POSE, { hd: [-2, -6, 4] }) },
    { f: spec.frames, pose: CLOVER_IDLE_POSE },
  ]);
}
function cloverIdleFidget(spec: ClipSpec): AnimationClip {
  // A late soft reach for something that was already handled, a look at
  // the empty hand, and a shrug of amused gratitude.
  const reach = shift(CLOVER_IDLE_POSE, { hd: [-4, -14, 4], ra: [-60, 0, 14], rf: [0, 20, 0], hp: [4, -6, 0] });
  const look = shift(CLOVER_IDLE_POSE, { hd: [12, -4, 0], ra: [-56, 0, 10], rf: [0, 70, 0] });
  const shrug = shift(CLOVER_IDLE_POSE, { ls: [0, 0, -12], rs: [0, 0, 12], la: [-12, 0, -10], lf: [0, -40, 0], ra: [-12, 0, 10], rf: [0, 40, 0], hd: [-4, 4, 6] });
  return build(spec, [
    { f: 0, pose: CLOVER_IDLE_POSE },
    { f: 18, pose: reach },
    { f: 28, pose: shift(reach, { ra: [-6, 0, 0] }) },
    { f: 42, pose: look },
    { f: 56, pose: shrug },
    { f: 66, pose: shift(shrug, { hd: [0, 0, -2] }) },
    { f: 78, pose: shift(CLOVER_IDLE_POSE, { hd: [-2, 0, 3] }) },
    { f: spec.frames - 1, pose: CLOVER_IDLE_POSE },
  ]);
}
/** Clover's Batch 8 pass, exported as a partial delivery. */
export function buildCloverPilotClips(): AnimationClip[] {
  return buildNamed('Clover', {
    idle: cloverIdle,
    idle_fidget: cloverIdleFidget,
    pose_card: (spec) => heldPose(spec, CLOVER_CARD_POSE, [0, 0, 0]),
    run: (spec) => runCycle(spec, 12, 46, 44),
    cheer: (spec) => sunnyCheer(spec, CLOVER_IDLE_POSE, 0.2),
    upset: (spec) => sunnyUpset(spec, CLOVER_IDLE_POSE),
  });
}

// Rocket Rosa: every start has a visible countdown in the knees and one
// decisive release; stops finish in a compact ready stance.
const ROCKET_IDLE_POSE: Pose = {
  hp: [8, 0, 0], sp: [4, 0, 0], s2: [5, 0, 0], hd: [-6, 4, 0],
  la: [-6, 0, 64], lf: [0, -30, 0], ra: [-6, 0, -64], rf: [0, 30, 0],
  lu: [8, 0, 3], ll: [-14, 0, 0], ru: [8, 0, -3], rl: [-14, 0, 0],
};
function rocketIdle(spec: ClipSpec): AnimationClip {
  // The countdown: three small dips of the knees, each a little deeper.
  const dip = (d: number): Pose => shift(ROCKET_IDLE_POSE, { hp: [d * 0.5, 0, 0], lu: [d, 0, 0], ll: [-d * 1.6, 0, 0], ru: [d, 0, 0], rl: [-d * 1.6, 0, 0] });
  return build(spec, [
    { f: 0, pose: ROCKET_IDLE_POSE },
    { f: 12, pose: dip(3), hips: [0, -0.015, 0] },
    { f: 20, pose: ROCKET_IDLE_POSE },
    { f: 30, pose: dip(5), hips: [0, -0.025, 0] },
    { f: 38, pose: ROCKET_IDLE_POSE },
    { f: 48, pose: dip(7), hips: [0, -0.035, 0] },
    { f: spec.frames, pose: ROCKET_IDLE_POSE },
  ]);
}
function rocketIdleFidget(spec: ClipSpec): AnimationClip {
  // Countdown, one decisive release — a lunge step that stops on a dime —
  // and back to the compact ready.
  const loaded = shift(ROCKET_IDLE_POSE, { hp: [10, 0, 0], s2: [4, 0, 0], hd: [-8, 0, 0], lu: [10, 0, 0], ll: [-22, 0, 0], ru: [10, 0, 0], rl: [-22, 0, 0], la: [10, 0, 0], ra: [-30, 0, 0] });
  const lunge = shift(ROCKET_IDLE_POSE, { hp: [16, 0, 0], hd: [-12, 0, 0], lu: [-36, 0, 2], ll: [30, 0, 0], ru: [24, 0, -2], rl: [-6, 0, 0], la: [30, 0, 0], ra: [-40, 0, 0], rf: [0, 20, 0] });
  const compact = shift(ROCKET_IDLE_POSE, { hp: [6, 0, 0], lu: [6, 0, 0], ll: [-12, 0, 0], ru: [6, 0, 0], rl: [-12, 0, 0] });
  return build(spec, [
    { f: 0, pose: ROCKET_IDLE_POSE },
    { f: 12, pose: shift(loaded, { lu: [-4, 0, 0], ll: [6, 0, 0], ru: [-4, 0, 0], rl: [6, 0, 0] }), hips: [0, -0.02, 0] },
    { f: 22, pose: loaded, hips: [0, -0.05, 0] },
    { f: 30, pose: shift(loaded, { hp: [2, 0, 0] }), hips: [0, -0.06, 0] },
    { f: 36, pose: lunge, hips: [0, 0.03, 0.14] },
    { f: 44, pose: compact, hips: [0, -0.01, 0.16] },
    { f: 62, pose: shift(compact, { hd: [-2, 8, 0] }), hips: [0, -0.01, 0.16] },
    { f: 78, pose: shift(ROCKET_IDLE_POSE, { hd: [-2, 2, 0] }), hips: [0, 0, 0.08] },
    { f: spec.frames - 1, pose: ROCKET_IDLE_POSE },
  ]);
}
/** Rocket Rosa's Batch 8 pass, exported as a partial delivery. */
export function buildRocketPilotClips(): AnimationClip[] {
  return buildNamed('Rocket Rosa', {
    idle: rocketIdle,
    idle_fidget: rocketIdleFidget,
    field_ready: (spec) => readyLoop(spec, { hp: [2, 0, 0] }, 2.8, 0.03),
    run: (spec) => runCycle(spec, 18, 56, 52),
    cheer_fierce: (spec) => directedReaction(spec, true, 'fierce'),
    upset_fierce: (spec) => directedReaction(spec, false, 'fierce'),
  });
}

// Chip: many tiny adjustments and one clean decision. Feet patter under an
// otherwise calm glove; the win ends by making room for the next play.
const CHIP_IDLE_POSE: Pose = {
  hp: [6, 0, 0], sp: [4, 0, 0], s2: [4, 0, 0], hd: [-4, 4, 0],
  la: [-2, 0, 66], lf: [0, -24, 0], ra: [-2, 0, -66], rf: [0, 24, 0],
  lu: [6, 0, 3], ll: [-10, 0, 0], ru: [6, 0, -3], rl: [-10, 0, 0],
};
function chipIdle(spec: ClipSpec): AnimationClip {
  // The patter: tiny alternating weight shifts, fast, under a calm top.
  return cycle(
    spec,
    (p) => shift(CHIP_IDLE_POSE, {
      lu: [sin(p * 4) * 3, 0, 0], ll: [-sin(p * 4) * 3, 0, 0],
      ru: [-sin(p * 4) * 3, 0, 0], rl: [sin(p * 4) * 3, 0, 0],
      hd: [0, sin(p) * 4, 0],
    }),
    (p) => [sin(p * 4) * 0.015, Math.abs(sin(p * 4)) * 0.008, 0]
  );
}
function chipFieldReady(spec: ClipSpec): AnimationClip {
  const base = shift(FIELD_READY_POSE, { hp: [-2, 0, 0] });
  return cycle(
    spec,
    (p) => shift(base, { lu: [sin(p * 3) * 2, 0, 0], ru: [-sin(p * 3) * 2, 0, 0], hd: [0, sin(p) * 5, 0] }),
    (p) => [sin(p * 3) * 0.012, Math.abs(sin(p * 3)) * 0.012, 0]
  );
}
function chipIdleFidget(spec: ClipSpec): AnimationClip {
  // Two hops into a ready pose — the one clean decision — a hold, and then
  // he steps aside to make room.
  const ready = shift(CHIP_IDLE_POSE, { hp: [12, 0, 0], hd: [-8, 0, 0], lu: [-10, 0, 4], ll: [22, 0, 0], ru: [-10, 0, -4], rl: [22, 0, 0], la: [-30, 0, -8], lf: [0, -40, 0], ra: [-30, 0, 8], rf: [0, 40, 0] });
  return build(spec, [
    { f: 0, pose: CHIP_IDLE_POSE },
    { f: 8, pose: shift(CHIP_IDLE_POSE, { ll: [-14, 0, 0], rl: [-14, 0, 0] }), hips: [0, -0.03, 0] },
    { f: 14, pose: shift(CHIP_IDLE_POSE, { hp: [4, 0, 0] }), hips: [0, 0.12, 0] },
    { f: 20, pose: shift(CHIP_IDLE_POSE, { ll: [-14, 0, 0], rl: [-14, 0, 0] }), hips: [0, -0.03, 0] },
    { f: 26, pose: shift(CHIP_IDLE_POSE, { hp: [6, 0, 0] }), hips: [0, 0.12, 0] },
    { f: 32, pose: ready, hips: [0, -0.02, 0] },
    { f: 52, pose: shift(ready, { hd: [0, 6, 0] }), hips: [0, -0.02, 0] },
    { f: 64, pose: shift(CHIP_IDLE_POSE, { hp: [2, 0, 6], lu: [2, 0, 16], ll: [-8, 0, 0], hd: [-2, 10, 2] }), hips: [0.12, 0.01, 0] },
    { f: 76, pose: shift(CHIP_IDLE_POSE, { hd: [-2, 6, 0] }), hips: [0.14, 0, 0] },
    { f: spec.frames - 1, pose: CHIP_IDLE_POSE, hips: [0.14, 0, 0] },
  ]);
}
/** Chip's Batch 8 pass, exported as a partial delivery. */
export function buildChipPilotClips(): AnimationClip[] {
  return buildNamed('Chip', {
    idle: chipIdle,
    idle_fidget: chipIdleFidget,
    field_ready: chipFieldReady,
    run: (spec) => runCycle(spec, 15, 50, 48),
    cheer: (spec) => sunnyCheer(spec, CHIP_IDLE_POSE, 0.3),
    upset: (spec) => sunnyUpset(spec, CHIP_IDLE_POSE),
  });
}

// Boomer: he broadcasts through the whole skeleton. Even a whisper uses
// giant mime; the settle includes a sheepish check that everyone survived
// the volume.
const BOOMER_IDLE_POSE: Pose = {
  hp: [4, 0, 0], sp: [2, 0, 0], s2: [2, 0, 0], hd: [-6, 4, 0],
  ls: [0, 0, -4], rs: [0, 0, 4],
  la: [-6, 0, 60], lf: [0, -26, 0], ra: [-6, 0, -60], rf: [0, 26, 0],
  lu: [4, 0, 6], ll: [-8, 0, 0], ru: [4, 0, -6], rl: [-8, 0, 0],
};
const BOOMER_CARD_POSE: Pose = /* @__PURE__ */ shift(BOOMER_IDLE_POSE, {
  hp: [-4, -8, 0], s2: [-4, -4, 0], hd: [-8, 12, 0],
  la: [-90, 0, -50], lf: [0, -20, 0], ra: [-90, 0, 50], rf: [0, 20, 0],
  lu: [-4, 0, 6], ll: [6, 0, 0], ru: [-4, 0, -6], rl: [6, 0, 0],
});
function boomerIdle(spec: ClipSpec): AnimationClip {
  // Big breathing, and the arms take part in it.
  return build(spec, [
    { f: 0, pose: BOOMER_IDLE_POSE },
    { f: 18, pose: shift(BOOMER_IDLE_POSE, { sp: [-3, 0, 0], s2: [-4, 0, 0], ls: [0, 0, -4], rs: [0, 0, 4], la: [-6, 0, -6], ra: [-6, 0, 6], hd: [-2, 0, 0] }), hips: [0, 0.02, 0] },
    { f: 34, pose: shift(BOOMER_IDLE_POSE, { sp: [2, 0, 0], s2: [2, 0, 0], hd: [2, 0, 0] }), hips: [0, -0.005, 0] },
    { f: 44, pose: shift(BOOMER_IDLE_POSE, { hd: [-4, -14, 0], nk: [0, -4, 0] }) },
    { f: 52, pose: shift(BOOMER_IDLE_POSE, { hd: [-4, 12, 0], nk: [0, 4, 0] }) },
    { f: spec.frames, pose: BOOMER_IDLE_POSE },
  ]);
}
function boomerIdleFidget(spec: ClipSpec): AnimationClip {
  // The whisper: hand cupped to the mouth, the other arm flung wide — and
  // then the sheepish check, both arms down, small.
  const whisper = shift(BOOMER_IDLE_POSE, { hd: [2, -20, 4], s2: [0, -10, 0], ra: [-96, 0, 6], rf: [0, 118, 0], la: [-80, 0, -60], lf: [0, -10, 0] });
  const sheepish = shift(BOOMER_IDLE_POSE, { hp: [6, 0, 0], s2: [6, 0, 0], hd: [8, 16, -4], ls: [0, 0, 6], rs: [0, 0, -6], la: [4, 0, 6], ra: [4, 0, -6] });
  return build(spec, [
    { f: 0, pose: BOOMER_IDLE_POSE },
    { f: 14, pose: whisper, hips: [0.03, 0, 0] },
    { f: 22, pose: shift(whisper, { hd: [0, -4, 0], la: [-10, 0, -6] }), hips: [0.03, 0, 0] },
    { f: 30, pose: shift(whisper, { hd: [0, 4, 0], la: [6, 0, 4] }), hips: [0.03, 0, 0] },
    { f: 38, pose: whisper, hips: [0.03, 0, 0] },
    { f: 52, pose: sheepish },
    { f: 62, pose: shift(sheepish, { hd: [0, -30, 4] }) },
    { f: 74, pose: shift(BOOMER_IDLE_POSE, { hd: [2, 0, 0] }) },
    { f: spec.frames - 1, pose: BOOMER_IDLE_POSE },
  ]);
}
/** Boomer's Batch 8 pass, exported as a partial delivery. */
export function buildBoomerPilotClips(): AnimationClip[] {
  return buildNamed('Boomer', {
    idle: boomerIdle,
    idle_fidget: boomerIdleFidget,
    pose_card: (spec) => heldPose(spec, BOOMER_CARD_POSE, [0, 0.01, 0]),
    run: (spec) => runCycle(spec, 16, 52, 52),
    cheer_goofy: (spec) => directedReaction(spec, true, 'goofy'),
    upset_goofy: (spec) => directedReaction(spec, false, 'goofy'),
  });
}
