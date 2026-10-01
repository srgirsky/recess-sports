// ---------------------------------------------------------------------------
// Mechanical batting constraints, applied by AnimationDirector after the clip.
// A nearby pair of hand bones is not a grip: the support palm must remain on
// the handle as the wrist turns. Resolve both arms to a single handle frame,
// curl the delivered finger bones, and keep the head looking toward the pitch.
// These are render poses only; neither ball physics nor outcomes are changed.
// The clip supplies body character; planted feet support the constrained swing.
// ---------------------------------------------------------------------------
import { Matrix4, Object3D, Quaternion, Vector3, type SkinnedMesh } from 'three';
import { FPS, clipSpec, framesToSec, type AnimName } from './clips';
import { BAT_SWEET_SPOT_FT } from './props';
import { buntAmount, BUNT_HAND_SLIDE_FT, BUNT_RECOVERY_FRAME } from './buntPose';
import { bindWorld } from './skeleton';
const BIND = bindWorld();

const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);
const REFERENCE_READY_AXIS = new Vector3(.28, .94, .2).normalize();
const STANCE_AXIS = new Vector3(-.3,1,.3).normalize();
const STANCE_GRIP = new Vector3(.35,2.5,.6);
const READY_AXIS = new Vector3(.65, .45, .8).normalize();
const FOLLOW_AXIS = new Vector3(-.8, .6, .2).normalize();
/**
 * ★ THE SWING FINISHES WHERE THE CAMERA CAN SEE IT. The lead-side wrap
 * (`through`, FOLLOW_AXIS) ends at chest height on the pitcher's side of the
 * body, and the PITCH camera sits behind the batter: from frame 10 a whiff's
 * bat was mostly hidden for every kid (none reached half; `audit:batting`,
 * `pitchBatVisible`). From frame 9 the hands rise
 * toward the catcher's side and the bat turns up and back over the shoulder.
 * The pose was searched, not picked: of 1728 finishes on six kids (seated Zoom
 * among them), this one kept every wrist under 20 degrees, put no shaft
 * through a body and stayed fully in view.
 */
const FINISH_AXIS = new Vector3(.1, .5, -.3).normalize();
/** The finish's hands, relative to the lead-side wrap (`through`). */
const FINISH_RISE = new Vector3(.5, .3, -.4);
const FINISH_RISE_FROM_FRAME = 9;
/**
 * Slow enough that the hands stay fastest through the ball: risen by frame
 * 13, their speed peaked at frame 11 and the derived CONTACT marker moved
 * there (`AnimationDirector.test.ts`).
 */
const FINISH_RISE_TO_FRAME = 17;
/** Follow-through frames spent coming back down from the finish. */
const FINISH_RETURN_FRAMES = 6;
/** Turn unit vector `from` toward `to` by `w`, on the sphere. */
const turnToward = (from: Vector3, to: Vector3, w: number) =>
  from.clone().applyQuaternion(new Quaternion().slerp(new Quaternion().setFromUnitVectors(from, to), w));
const CONTACT_FRAME = clipSpec('swing_contact').marker!.frame;
const FOLLOW_SEC = framesToSec(clipSpec('swing_follow').frames);
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/**
 * ★ CONTACT IS MET OUT IN FRONT. The batter stands this far behind the pitch
 * line's contact point (rig feet, toward the catcher). At the old 0.15 the top
 * grip sat 0.03-0.07ft ahead of the shoulders and the top elbow shut to
 * 58-69 degrees on all 30 delivered models — critics saw a foreshortened
 * forearm with an angular elbow. Out here it slots at 88-117 degrees
 * (`audit:batting`, the review default and the 2.4ft pitch).
 */
export const CONTACT_OUT_FRONT_FT = .6;
/**
 * Seated, the same pitch sits nearer the lap and a chair cannot step back, so
 * reaching 0.6ft out front folded Zoom over the plate. Nearer, and the shoulder
 * lag still opens his top elbow past 100 degrees.
 */
export const SEATED_CONTACT_OUT_FRONT_FT = .45;
export const contactOutFront = (seated: boolean) => seated ? SEATED_CONTACT_OUT_FRONT_FT : CONTACT_OUT_FRONT_FT;
/** The review page's pitch when none is thrown: 2.4ft at the 1.6 reference scale. */
const REVIEW_CONTACT_HEIGHT_FT = 1.5;
/**
 * Low pitches are met with the barrel, not the hands: below this grip height
 * the bat tilts down (to MAX_BARREL_TILT) and the hands stay near the chest,
 * which asks the trunk and pelvis for less reach. Steeper, and the top arm
 * steps past 25 degrees at launch on Big Lou's low pitch (`audit:batting`).
 */
const SLOT_HAND_HEIGHT_FT = 1.8;
const MAX_BARREL_TILT = .2;
/**
 * Seated, the same pitch is nearer the lap and the trunk can only fold down to
 * it: the hands stay higher and the barrel may tilt further. Much higher and
 * the knob wrist folds past 40 degrees. The seated kid never steps back, so
 * this is also what keeps his hands off the chair.
 */
const SEATED_SLOT_HAND_HEIGHT_FT = 1.6;
const SEATED_MAX_BARREL_TILT = .45;
/**
 * High pitches are met with the hands a touch ahead of the barrel (ramped in
 * over rig 1.5-2.1ft). Square, the knob wrist folds to 39 degrees against the
 * 40-degree gate; at 0.1 and above the lead forearm steps past 25 degrees
 * just after contact on several delivered models (`audit:batting`).
 */
const HIGH_PITCH_LAG = .05;

/**
 * ★ THE SWING'S HAND PATH: wind -> contact -> a fixed, reachable finish, one C1
 * Hermite curve per component, still at both ends. The old path lerped toward
 * a finish mirrored through contact (2*contact - wind), so meeting the ball out
 * front doubled the hand travel, pushed the finish out of reach and flipped the
 * arms between quarter-frames. The hands DROP from frame 1 but only DRIVE
 * forward from 1.5: moving forward earlier carries the still-upright bat
 * through hair hanging beside the neck.
 */
const SWING_DROP_FRAME = 1;
const SWING_DRIVE_FRAME = 1.5;
const SWING_FINISH_FRAME = 13;
/** Hand velocity at contact, as a fraction of the wind-to-finish chord per frame. */
const CONTACT_HAND_VELOCITY = .25;
/**
 * The hands WHIP through contact: a little behind the curve at frame 6, a
 * little ahead at frame 8, on it at 5, 7 and 9. A curve that must turn round
 * the lead side right after an out-front contact is otherwise fastest before
 * or after the ball, and the CONTACT marker is derived from peak hand speed
 * (`AnimationDirector.test.ts`, `modelRules.mjs`) — it read frame 9.
 */
const CONTACT_WHIP_FT = .1;
/** The barrel lays back toward the catcher as the hands launch (frames 1-5). */
const BAT_LAY_BACK = .5;
/**
 * Swing reach, as a fraction of the arm. At the old 0.985 the straightening
 * lead arm arrived fully extended and only a folded knob wrist held the
 * handle (61-75 degrees); a little slack lets the hips carry the hands.
 */
const SWING_REACH = .92;
/**
 * How strongly the grip search prefers the elbow hint. The swing needs the
 * pull: at the bunt's 0.2 the lead grip roll wanders across a flat basin while
 * the arm straightens and the forearm steps 25-34 degrees per quarter-frame.
 */
const SWING_ELBOW_PREFERENCE = 1.5;
const BUNT_ELBOW_PREFERENCE = .2;

function hermite(p0: Vector3, m0: Vector3, p1: Vector3, m1: Vector3, u: number): Vector3 {
  const u2 = u * u, u3 = u2 * u;
  return p0.clone().multiplyScalar(2*u3 - 3*u2 + 1).addScaledVector(m0, u3 - 2*u2 + u)
    .addScaledVector(p1, 3*u2 - 2*u3).addScaledVector(m1, u3 - u2);
}

/** The hands at frame `f` of a swing. */
function swingHands(wind: Vector3, contact: Vector3, through: Vector3, f: number, drop = SWING_DROP_FRAME): Vector3 {
  const velocity = through.clone().sub(wind).multiplyScalar(CONTACT_HAND_VELOCITY);
  const along = (launch: number) => {
    if (f <= launch) return wind.clone();
    if (f >= SWING_FINISH_FRAME) return through.clone();
    const still = new Vector3();
    const [p0, m0, p1, m1, from, to] = f <= CONTACT_FRAME
      ? [wind, still, contact, velocity, launch, CONTACT_FRAME]
      : [contact, velocity, through, still, CONTACT_FRAME, SWING_FINISH_FRAME];
    const span = to - from;
    return hermite(p0, m0.clone().multiplyScalar(span), p1, m1.clone().multiplyScalar(span), (f - from) / span);
  };
  const hands = along(drop).setX(along(SWING_DRIVE_FRAME).x);
  const u = (f - CONTACT_FRAME) / 2;
  if (Math.abs(u) < 1) hands.x -= CONTACT_WHIP_FT * Math.sin(Math.PI * u) * Math.cos(Math.PI * u / 2) ** 2;
  return hands;
}

/** The bat at contact for a sweet spot at `height` (rig feet): square, tilted
 * down under low pitches and lagging behind the hands on high ones. */
function contactBatAxis(height: number, seated: boolean): Vector3 {
  const drop = Math.max(-1, Math.min(1, ((seated ? SEATED_SLOT_HAND_HEIGHT_FT : SLOT_HAND_HEIGHT_FT) - height) / BAT_SWEET_SPOT_FT));
  const tilt = Math.max(0, Math.min(seated ? SEATED_MAX_BARREL_TILT : MAX_BARREL_TILT, Math.asin(drop)));
  const lag = HIGH_PITCH_LAG * smooth((height - REVIEW_CONTACT_HEIGHT_FT) / .6);
  return new Vector3(Math.sin(lag) * Math.cos(tilt), -Math.sin(tilt), Math.cos(lag) * Math.cos(tilt));
}

/** Side-on box placement in the render's exaggerated reference feet. */
export function battingPlacement(scale: number, seated = false) {
  return { x: -(BAT_SWEET_SPOT_FT + .55) * scale, z: -contactOutFront(seated) * scale, facing: Math.PI / 2 };
}

/** Join the sim's centre-of-plate origin without teleporting out of the box. */
export function battingRunOut(scale: number, distanceFt: number, seated = false) {
  const box = battingPlacement(scale, seated);
  const remaining = 1 - smooth(distanceFt / 10);
  return { x: box.x * remaining, z: box.z * remaining };
}

/**
 * The seated trunk turns toward the wrists instead of shifting the hips, and
 * above this elbow weight the knob-arm search switches branches mid-bunt — a
 * 42-degree step at 0.25-frame sampling (`audit:batting --check`); jump-free
 * at 30, which leaves the seated elbow at shoulder height rather than below.
 */
const SEATED_ELBOW_WEIGHT = 30;

/**
 * The held bunt, in the rig frame (the chest turns toward -X). Out in front at
 * a relaxed reach so both elbows open past 100 degrees and hang below the
 * shoulders, standing and seated. Nearer the midline the knob wrist can only
 * stay straight with its elbow up; farther out a standing kid's hips follow
 * the hands instead. The barrel rises ~15 degrees — the quiet-bat gate in
 * `HandPose.test.ts` caps it, and a steeper bat buys no lower elbow.
 */
const BUNT_GRIP = new Vector3(-.9, 1.95, -.4);
const BUNT_AXIS = new Vector3(0, .28, 1).normalize();

/**
 * ★ THE ELBOWS COME UP AS THE BAT COMES BACK. Held down through the recovery
 * as firmly as through the catch, the knob elbow stayed pinned while the
 * returning bat folded its wrist from 17 to 34 degrees; at the wrist's wall the
 * elbow then rose 0.14ft in a quarter-frame (a 22.5-degree step, Zippy, Penny,
 * Bubbles, Clover) and the grip later flipped basins outright. Receiving the
 * ball is what needs the low elbow, so the hold eases out over this many
 * frames of the recovery, ahead of the wall.
 */
const BUNT_ELBOW_RELEASE_FRAMES = 4;
/**
 * How far below the shoulder the bunt's elbows are free. A deeper margin buys
 * no lower held elbow at BUNT_GRIP and costs continuity: at 0.30ft the seated
 * knob forearm steps 42 degrees between quarter-frames, past the 25-degree
 * gate (`HandPose.test.ts`, `audit:batting --check`).
 */
const BUNT_ELBOW_MARGIN_FT = .25;

/**
 * ★ HANDS STAY OUTSIDE THE BELLY. Contact out front put a wide kid's palms
 * inside his own torso — Big Lou's knob palm 0.33ft deep, the bat growing out
 * of his stomach — where no gate looked: the bat ray starts inside the mesh
 * and elbow angles score bones, not what shows. (`main` was deeper still, the
 * hands merely hidden at the hip.) Each kid's torso is measured once, in 0.1ft
 * bands of height; where a palm would sit closer than this to its surface the
 * standing body steps STRAIGHT BACK from the hands, which the ball has fixed.
 * Pushed radially, the body also slid off the plate and the straightening lead
 * arm jumped 29 degrees between quarter-frames (`audit:batting`, Big Lou). With
 * the trunk taking the reach (TRUNK_REACH_RAD) the pelvis no longer chases the
 * hands into the belly, and this is a small residual correction.
 */
const PALM_CLEARANCE_FT = .1;
/** How far each foot pivots with the opening hips: the rear on its ball, the lead a little. */
const REAR_FOOT_PIVOT = .6;
const LEAD_FOOT_PIVOT = .2;
/**
 * ★ THE BAT IS FASTEST THROUGH THE BALL. The barrel eased to a stop at contact
 * and away from it (2.6 degrees per half-frame at the ball, 25 either side), so
 * the follow-through read as a snap out of a stall. It now arrives at this
 * slope and leaves at the matching angular speed. Much steeper and the lead
 * forearm rolls past 25 degrees per quarter-frame on a high pitch (Sprout).
 */
const BAT_WHIP = 1.75;
/**
 * Seated, the hands start down only from this frame, once they are past the
 * knees: dropping from frame 1 laid Zoom's palms on his thighs before contact.
 */
const SEATED_SWING_DROP_FRAME = 4;
/**
 * ★ THE LEAD HAND HOLDS THE BAT DIAGONALLY. The palm model held every handle
 * at right angles to the forearm; with the bat pointing at the plate, a
 * straight lead wrist could only aim the forearm straight up, and the lead
 * elbow rode up in front of the chest: a vertical stub above the hands from
 * one side, an upper arm across the chest from another (independent review,
 * Tank, Grizz, Junebug, Lefty, Boomer). A real lead grip runs across the
 * fingers from index to heel, so the handle crosses the palm at this angle
 * and the lead arm runs back to its shoulder. It comes in from this frame to
 * contact; earlier, the low-pitch launch folds the knob wrist past 40 degrees.
 * The seated grip keeps the square hold: his reach flipped the lead arm.
 */
const LEAD_GRIP_DIAGONAL = -.6;
/**
 * Below these contact heights (rig feet) the diagonal eases toward LOW: the
 * low pitch already tilts the barrel down, and the two together fold the knob
 * wrist past 40 degrees. At -.4 everywhere the lead elbow stayed level with the
 * shoulder, so the lead upper arm pointed straight out of the front of it: seen
 * down the sleeve, a short sleeve read as a ball with a thin arm stuck in its
 * front (Flash, Smokey, Bendy Bao), and a high pitch foreshortened the whole
 * arm into a stub at the collar (independent review).
 */
const LEAD_GRIP_DIAGONAL_LOW = -.5;
const LEAD_GRIP_LOW_FT = 1.1;
const LEAD_GRIP_FULL_FT = 1.4;
const LEAD_GRIP_FROM_FRAME = 4.5;
/**
 * Above these heights, reached only by the smallest kids' letters-high pitches,
 * the diagonal eases back to HIGH: at the full angle their lead forearm jumped
 * 27-35 degrees onto the contact frame (Sprout, Cricket, Chip, Turbo).
 */
const LEAD_GRIP_DIAGONAL_HIGH = -.52;
const LEAD_GRIP_EASE_FT = 1.95;
const LEAD_GRIP_TOP_FT = 2.15;
/**
 * ★ THE DIAGONAL GIVES WHERE THE WRIST CANNOT. With only the grip roll to
 * search, some frames had no roll at all that kept the lead wrist under its
 * wall: 38.2 degrees was the minimum over the whole circle (Zoom at a low
 * contact, the standing roster's low follow-through). The lead grip's
 * diagonal may therefore move up to this far from its authored value, at a
 * per-radian price set above the ordinary wrist term's pull (at most ~9.5 per
 * radian under the wall) and below the wall's: the grip holds its authored
 * angle everywhere the wrist can afford it and gives only against the wall.
 */
/** The lead grip roll left at the wrist joint, as a share, soft-capped in radians. */
const LEAD_WRIST_ROLL_SHARE = .35;
const LEAD_WRIST_ROLL_CAP = 16 * Math.PI / 180;
const LEAD_GRIP_GIVE_RAD = .35;
const LEAD_GRIP_GIVE_COST = 15;
/** 0 -> 1 over t in [0, 1], still at 0 and arriving at slope `k` (<= 3). */
const into = (t: number, k: number) => { const u = Math.max(0, Math.min(1, t)); return (k - 2) * u ** 3 + (3 - k) * u * u; };
const HEAD_FOLLOW = .5;
/** Still inside the 18-degree look-at-the-pitcher gate (`battingPose.test.ts`). */
const HEAD_FOLLOW_MAX = 15 * Math.PI / 180;
/**
 * ★ REACH WITH THE TRUNK, NOT THE PELVIS. Out-front hands are further from the
 * shoulders than a kid's short arms reach. Made up by sliding the pelvis over
 * planted feet, the hips dropped and the knees caved (an independent review
 * saw Big Lou's legs scissor); the bend is soft-capped at this many radians,
 * spread over three spine joints, and only the rest moves the pelvis.
 */
const TRUNK_REACH_RAD = 1;
/**
 * The shoulders trail the hips through contact. Square to the pitcher, the lead
 * shoulder sat so far from out-front hands that the body had to lunge to them.
 */
const SHOULDER_LAG_RAD = .2;
const TORSO_BAND_FT = .1;
type TorsoBand = { forward: number; back: number; side: number };

/** Hips-to-chest extents per height band, in the Hips bone's bind frame. */
function measureTorso(mesh: Object3D): Map<number, TorsoBand> | null {
  const skinned = mesh as SkinnedMesh;
  const position = skinned.geometry?.attributes?.position, index = skinned.geometry?.attributes?.skinIndex;
  const weight = skinned.geometry?.attributes?.skinWeight, skeleton = skinned.skeleton;
  if (!position || !index || !weight || !skeleton) return null;
  const hips = skeleton.bones.findIndex(bone => bone.name === 'Hips');
  if (hips < 0) return null;
  const torso = skeleton.bones.map(bone => /^(Hips|Spine|Spine1|Spine2)$/.test(bone.name));
  const toHips = new Matrix4().multiplyMatrices(skeleton.boneInverses[hips], skinned.bindMatrix);
  const bands = new Map<number, TorsoBand>(), v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    let w = 0;
    for (let j = 0; j < 4; j++) if (torso[index.getComponent(i, j)]) w += weight.getComponent(i, j);
    if (w < .5) continue;
    v.fromBufferAttribute(position, i).applyMatrix4(toHips);
    const key = Math.round(v.y / TORSO_BAND_FT), band = bands.get(key) ?? { forward: 0, back: 0, side: 0 };
    band.forward = Math.max(band.forward, v.z); band.back = Math.max(band.back, -v.z); band.side = Math.max(band.side, Math.abs(v.x));
    bands.set(key, band);
  }
  if (!bands.size) return null;
  // A band with no vertex of its own (a sparse belly ring) takes its
  // neighbours' blend, so the lookup never falls through a gap.
  const keys = [...bands.keys()].sort((x, y) => x - y);
  for (let key = keys[0] + 1; key < keys[keys.length - 1]; key++) {
    if (bands.has(key)) continue;
    const below = keys.filter(k => k < key).pop()!, above = keys.find(k => k > key)!;
    const t = (key - below) / (above - below), lo = bands.get(below)!, hi = bands.get(above)!;
    bands.set(key, { forward: lo.forward + (hi.forward - lo.forward) * t, back: lo.back + (hi.back - lo.back) * t, side: lo.side + (hi.side - lo.side) * t });
  }
  return bands;
}

/** How far to move the torso back (hips frame) to clear a palm at `rel`. */
function torsoClearance(bands: Map<number, TorsoBand>, rel: Vector3): Vector3 | null {
  const at = rel.y / TORSO_BAND_FT, lo = Math.floor(at), t = at - lo;
  const a = bands.get(lo), b = bands.get(lo + 1);
  if (!a || !b) return null;
  const mix = (k: keyof TorsoBand) => a[k] + (b[k] - a[k]) * t + PALM_CLEARANCE_FT;
  const across = rel.x / mix('side'), along = rel.z / (rel.z >= 0 ? mix('forward') : mix('back'));
  const inside = across * across + along * along;
  if (inside >= 1) return null;
  const depth = rel.z >= 0 ? mix('forward') : mix('back');
  return new Vector3(0, 0, Math.sign(rel.z || 1) * depth * Math.sqrt(1 - across * across) - rel.z);
}

/** Inside the reference wrist's 40-degree fold gate, with a margin. */
const WRIST_LIMIT_RAD = 34 * Math.PI / 180;

export class BattingPose {
  private bones = new Map<string, Object3D>();
  private original = new Map<Object3D, Quaternion>();
  private positions = new Map<Object3D, Vector3>();
  private rig: Object3D | undefined;
  private displayedRotations = new Map<Object3D, Quaternion>();
  private displayedPositions = new Map<Object3D, Vector3>();
  private exiting: { duration: number; elapsed: number } | null = null;

  beginExit(duration: number): void {
    this.exiting = duration > 0 && this.displayedRotations.size ? { duration, elapsed: 0 } : null;
  }

  cancelExit(): void { this.exiting = null; }

  /** Fade the last constrained pose into the live clip, not into its old
   * unconstrained take. Otherwise the post-mixer torso correction vanishes
   * in one frame even while the AnimationMixer is correctly crossfading. */
  fadeOut(dt: number): void {
    if (!this.exiting) return;
    this.exiting.elapsed += Math.max(0, dt);
    const t = smooth(this.exiting.elapsed / this.exiting.duration);
    for (const [bone, from] of this.displayedRotations) {
      this.original.set(bone, bone.quaternion.clone());
      const target = bone.quaternion.clone();
      const sign = bone.name.startsWith('Right') ? 1 : -1;
      // Releasing a cross-body grip directly toward a lowered idle arm
      // sweeps through the shirt. Travel through an outboard release pose.
      const clearance = /^(Left|Right)Arm$/.test(bone.name)
        ? new Quaternion().setFromAxisAngle(Z, -sign * .55)
        : /^(Left|Right)ForeArm$/.test(bone.name)
          ? new Quaternion().setFromAxisAngle(Y, -sign * .4) : null;
      bone.quaternion.copy(clearance
        ? t < .5 ? from.clone().slerp(clearance, smooth(t*2))
          : clearance.slerp(target, smooth(t*2-1))
        : from.clone().slerp(target, t));
    }
    for (const [bone, from] of this.displayedPositions) {
      this.positions.set(bone, bone.position.clone());
      bone.position.copy(from.clone().lerp(bone.position, t));
    }
    if (t >= 1) this.exiting = null;
  }

  contact: Vector3 | null = null;

  readonly seated: boolean;
  private readyWeight = 0;
  /** How far into the bunt's receiving pose this frame is, 0..1. */
  private buntWeight = 0;
  /** How far the bunt has let its elbows up this frame, 0..1. */
  private elbowRelease = 0;
  /** How much of the lead hand's diagonal grip this frame holds, 0..1. */
  private gripTilt = 0;
  /** The contact sweet spot's height this frame (rig feet). */
  private sweetHeight = 0;
  private readonly stanceGrip: Vector3;
  private readonly torso: Map<number, TorsoBand> | null;

  constructor(mesh: Object3D, seated = false, readyDepth = STANCE_GRIP.z) {
    this.seated = seated;
    this.stanceGrip = STANCE_GRIP.clone().setZ(readyDepth);
    for (const bone of (mesh as SkinnedMesh).skeleton?.bones ?? []) this.bones.set(bone.name, bone);
    this.rig = this.bones.get('Root');
    this.torso = seated ? null : measureTorso(mesh);
  }

  restore(): void {
    for (const [bone, rotation] of this.original) bone.quaternion.copy(rotation);
    this.original.clear();
    for (const [bone, position] of this.positions) bone.position.copy(position);
    this.positions.clear();
  }

  private at(bone: Object3D): Vector3 {
    return this.rig!.worldToLocal(bone.getWorldPosition(new Vector3()));
  }

  private rotation(bone: Object3D): Quaternion {
    // Work relative to the rig. The gameplay scene has a negative X scale;
    // world quaternion decomposition cannot represent that reflection.
    const matrix = new Matrix4().copy(this.rig!.matrixWorld).invert().multiply(bone.matrixWorld);
    const q = new Quaternion();
    matrix.decompose(new Vector3(), q, new Vector3());
    return q;
  }

  private set(bone: Object3D, world: Quaternion): void {
    if (!this.original.has(bone)) this.original.set(bone, bone.quaternion.clone());
    const parent = this.rotation(bone.parent!);
    bone.quaternion.copy(parent.invert().multiply(world));
    bone.updateWorldMatrix(false, true);
  }

  private arm(side: 'Left' | 'Right', palm: Vector3, rotation: Quaternion, followClearance = 0, bunt = 0): void {
    const upper = this.bones.get(`${side}Arm`)!;
    const lower = this.bones.get(`${side}ForeArm`)!;
    const hand = this.bones.get(`${side}Hand`)!;
    const sign = side === 'Right' ? 1 : -1;
    let wrist = palm.clone().sub(this.palmOffset(side).applyQuaternion(rotation));
    // Keep the elbows outboard and in front of the chest as it turns. A
    // straight-down world-space hint tucked wide kids' upper arms into their
    // shirts, even though the two palms still reached the handle exactly.
    const clearanceGain=this.bones.has('RightHandIndex2')?.5:.25;
    const elbowHint = new Vector3(sign * .8, (-.4 - .6*this.readyWeight) - 1.5*bunt, .5 + clearanceGain * followClearance)
      .applyQuaternion(this.rotation(this.bones.get('Spine2')!));
    if (this.bones.has('RightHandIndex2')) {
      const result = this.gripSolution(side, palm, Z.clone().applyQuaternion(rotation), elbowHint, true);
      rotation = result.rotation;
      wrist = result.wrist;
      elbowHint.copy(result.bend);
    }
    this.solve(upper, lower, hand, wrist, elbowHint, sign);
    if (this.bones.has('RightHandIndex2')) {
      // Pronation belongs along the forearm, not at the wrist. Share the
      // remaining roll without changing either the elbow or grip position.
      const relative = this.rotation(lower).invert().multiply(rotation);
      if (relative.w < 0) relative.set(-relative.x, -relative.y, -relative.z, -relative.w);
      const roll = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, 2 * Math.atan2(relative.x, relative.w)));
      // ★ THE WRIST END CARRIES PART OF THE PRONATION, as the radius turns
      // most at its distal end. Taken wholly by the forearm bone, the lead
      // grip's roll turned ~60 degrees in about a frame as the diagonal came in
      // under the whipping bat — a 21.8-degree twist inside a 24.2-degree
      // quarter-frame step (Sprout, 3.1ft). The wrist's share is soft-capped
      // well inside the 25-degree wrist-twist gate.
      const atWrist = side === 'Left' ? LEAD_WRIST_ROLL_CAP * Math.tanh(LEAD_WRIST_ROLL_SHARE * roll / LEAD_WRIST_ROLL_CAP) : 0;
      this.set(lower, this.rotation(lower).multiply(new Quaternion().setFromAxisAngle(X, roll - atWrist)));
      // Keep a sane sleeve roll for the swing, then release that correction
      // during the bunt. Each arm's frame puts its pole where that arm never
      // goes. The lead arm stays world-upright (pole: hanging straight down).
      // The top arm slots UNDER its shoulder, where the upright frame spun the
      // sleeve 40-50 degrees per quarter-frame, so it takes the least twist
      // from the bind pose instead (pole: pointing across the chest).
      const lowerRotation = this.rotation(lower);
      const upperX = X.clone().applyQuaternion(upper.quaternion);
      const upperZ = upperX.clone().cross(Y.clone().addScaledVector(Z,-bunt));
      if (upperZ.lengthSq() < 1e-8) upperZ.copy(Z).addScaledVector(upperX,-upperX.dot(Z));
      upperZ.normalize();
      const neutral = side === 'Right' ? new Quaternion().setFromUnitVectors(X, upperX)
        : new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(upperX,upperZ.clone().cross(upperX),upperZ));
      this.set(upper,this.rotation(upper.parent!).multiply(neutral)
        .slerp(this.rotation(upper),smooth(Math.min(1,bunt*6))));
      this.set(lower,lowerRotation);
    }
    this.set(hand, rotation);
  }

  /** Solve grip roll and elbow swivel together. Locking either first can
   * put the palm on the handle with its wrist folded back over the sleeve. */
  private gripSolution(side: 'Left' | 'Right', palm: Vector3, z: Vector3, hint: Vector3, give = false) {
    const sign = side === 'Right' ? 1 : -1;
    const shoulder = this.at(this.bones.get(`${side}Arm`)!);
    const l1 = this.bones.get(`${side}ForeArm`)!.position.length();
    const l2 = this.bones.get(`${side}Hand`)!.position.length();
    const base = palm.clone().sub(shoulder).multiplyScalar(sign);
    base.addScaledVector(z, -base.dot(z));
    if (base.lengthSq() < 1e-8) base.copy(X).addScaledVector(z,-z.dot(X));
    base.normalize();
    const elbowPreference = SWING_ELBOW_PREFERENCE + (BUNT_ELBOW_PREFERENCE - SWING_ELBOW_PREFERENCE) * smooth(Math.min(1, this.buntWeight * 6));
    const diagonal = side === 'Left' ? (LEAD_GRIP_DIAGONAL_LOW + (LEAD_GRIP_DIAGONAL - LEAD_GRIP_DIAGONAL_LOW) * smooth((this.sweetHeight - LEAD_GRIP_LOW_FT) / (LEAD_GRIP_FULL_FT - LEAD_GRIP_LOW_FT)) + (LEAD_GRIP_DIAGONAL_HIGH - LEAD_GRIP_DIAGONAL) * smooth((this.sweetHeight - LEAD_GRIP_EASE_FT) / (LEAD_GRIP_TOP_FT - LEAD_GRIP_EASE_FT))) * this.gripTilt : 0;
    const evaluate = (angle: number, give = 0, hold = this.buntWeight) => {
      const x = base.clone().applyAxisAngle(z, angle);
      const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, z.clone().cross(x), z));
      if (diagonal || give) rotation.multiply(new Quaternion().setFromAxisAngle(Y, diagonal + give));
      const palmX = X.clone().applyQuaternion(rotation);
      const wrist = palm.clone().sub(this.palmOffset(side).applyQuaternion(rotation));
      const to = wrist.clone().sub(shoulder);
      const reach = Math.max(0, to.length() - l1 - l2);
      const d = Math.max(1e-5, Math.min(to.length(), l1 + l2 - 1e-5));
      const direction = to.normalize();
      const along = (l1*l1 - l2*l2 + d*d)/(2*d);
      const centre = shoulder.clone().addScaledVector(direction, along);
      const radius = Math.sqrt(Math.max(0, l1*l1 - along*along));
      const preferred = hint.clone().addScaledVector(direction, -hint.dot(direction)).normalize();
      const bend = wrist.clone().addScaledVector(palmX, -sign*l2).sub(centre);
      bend.addScaledVector(direction, -bend.dot(direction));
      // A small elbow preference resolves near-straight wrists smoothly and
      // keeps elbows on the outside of the shirt instead of behind the body.
      bend.addScaledVector(preferred, .035).normalize();
      const elbow = centre.clone().addScaledVector(bend, radius);
      const forearm = wrist.clone().sub(elbow).normalize().multiplyScalar(sign);
      const wristBend = Math.acos(Math.max(-1, Math.min(1, forearm.dot(palmX))));
      const normal = bend.clone().cross(direction).multiplyScalar(sign).normalize();
      const lower = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(forearm, normal.clone().cross(forearm), normal));
      const relative = lower.invert().multiply(rotation);
      if (relative.w < 0) relative.set(-relative.x,-relative.y,-relative.z,-relative.w);
      const roll = Math.abs(2*Math.atan2(relative.x,relative.w));
      // ★ A BUNT RECEIVES THE BALL WITH THE ELBOWS DOWN. With the bat level
      // across the chest the knob hand can only keep a straight wrist by
      // folding its forearm vertical and lifting the elbow beside the face —
      // measured on all 30 delivered models at the held frame (0.50-0.59ft
      // above the shoulder). Past the shoulder line minus a margin the elbow
      // is charged, and the wrist's 40-degree limit (`HandPose.test.ts`)
      // becomes a wall rather than a preference, so the search buys the
      // lowest elbow the wrist can afford instead of trading one for the other.
      // The margin only works with the bat held out in front (see `apply`):
      // with the hands at the chest there is no low elbow the wrist affords.
      const elbowRise = Math.max(0, elbow.y - (shoulder.y - BUNT_ELBOW_MARGIN_FT));
      // The wrist limit is a wall in every batting clip, not only the bunt: a
      // seated low pitch otherwise folded Zoom's knob wrist past 40 degrees.
      const wristOver = Math.max(0, wristBend - WRIST_LIMIT_RAD);
      const score = 8*wristBend*wristBend + elbowPreference*(1-bend.dot(preferred)) + .03*roll*roll + 100*reach*reach + 40*Math.max(0,roll-Math.PI/2)**2
        + hold*(this.seated ? SEATED_ELBOW_WEIGHT : 60)*elbowRise*elbowRise + 400*wristOver*wristOver
        + LEAD_GRIP_GIVE_COST*Math.abs(give);
      return {rotation, wrist, bend, score, angle, give};
    };
    const step = Math.PI / 18;
    const search = (hold: number) => {
      let found = evaluate(0, 0, hold);
      for (let i=1;i<36;i++) { const trial=evaluate(i*step, 0, hold); if(trial.score<found.score)found=trial; }
      for (let width=step/2;width> .0001;width/=2) {
        const left=evaluate(found.angle-width, 0, hold),right=evaluate(found.angle+width, 0, hold);
        if(left.score<found.score)found=left;
        if(right.score<found.score)found=right;
      }
      return found;
    };
    let best = search(this.elbowRelease >= 1 ? 0 : this.buntWeight);
    if (this.elbowRelease > 0 && this.elbowRelease < 1) {
      // ★ Two grips, blended — never one grip that jumps between them. Held
      // down, the knob elbow's best grip folds the wrist; released, its best
      // grip lifts the elbow. Their costs cross during the release, and a
      // single search leaps from one to the other in a quarter-frame (58
      // degrees, Zippy). Each is solved from scratch, so this stays a pure
      // function of time and a replay's seek lands on the same pose.
      const free = search(0), w = this.elbowRelease;
      const rotation = best.rotation.clone().slerp(free.rotation, w);
      best = { ...best, rotation, wrist: palm.clone().sub(this.palmOffset(side).applyQuaternion(rotation)),
        bend: best.bend.clone().lerp(free.bend, w).normalize() };
    }
    // The bunt's knob wrist rides its wall through the whole held pose, where
    // a free diagonal flipped end to end between quarter-frames (69 degrees).
    const giveBand = side === 'Left' && give ? LEAD_GRIP_GIVE_RAD * (1 - smooth(Math.min(1, this.buntWeight * 6))) : 0;
    if (giveBand > 0) {
      // Then let the diagonal give, from the roll already found, so the
      // search never leaves the basin it would otherwise have chosen.
      for (let width=giveBand/2, turn=step/4; width> .0001; width/=2, turn/=2) {
        for (let tries=0; tries<8; tries++) {
          let moved = false;
          for (const [angle, give] of [[best.angle, best.give+width], [best.angle, best.give-width], [best.angle+turn, best.give], [best.angle-turn, best.give]]) {
            if (Math.abs(give) > giveBand + 1e-9) continue;
            const trial = evaluate(angle, give);
            if (trial.score < best.score) { best = trial; moved = true; }
          }
          if (!moved) break;
        }
      }
    }
    return best;
  }

  private gripRotation(side: 'Left' | 'Right', palm: Vector3, axis: Vector3): Quaternion {
    const sign = side === 'Right' ? 1 : -1;
    const hint = new Vector3(sign*.8,-.4-.6*this.readyWeight,.5).applyQuaternion(this.rotation(this.bones.get('Spine2')!));
    // The reference palms share the handle direction. Handedness already
    // lives in the arm's X axis; mirroring Z as well reverses the top grip
    // and makes the solver pull its elbow across the chest/neck.
    return this.gripSolution(side, palm, axis.clone().negate(), hint).rotation;
  }

  private palmOffset(side: string): Vector3 {
    return this.bones.get(side === 'Right' ? 'Prop_BatGrip' : 'Prop_GloveAnchor')!.position.clone();
  }

  private solve(upper: Object3D, lower: Object3D, end: Object3D, target: Vector3, hint: Vector3, armSign?: number): void {
    const shoulder = this.at(upper);
    const to = target.clone().sub(shoulder);
    const l1 = lower.position.length(), l2 = end.position.length();
    const d = Math.max(1e-5, Math.min(to.length(), l1 + l2 - 1e-5));
    const direction = to.normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const bend = hint.clone().addScaledVector(direction, -hint.dot(direction)).normalize();
    const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
    if (armSign !== undefined) {
      // Both segments share one elbow plane. Independently choosing each
      // shortest-arc quaternion gets the wrist to the right point but gives
      // the two segments different rolls: a blended sleeve then corkscrews
      // at the elbow. Position-only grip tests cannot see that twist.
      const z = bend.clone().cross(direction).multiplyScalar(armSign).normalize();
      const orient = (aim: Vector3) => {
        const x = aim.normalize().multiplyScalar(armSign);
        const y = z.clone().cross(x).normalize();
        return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
      };
      this.set(upper, orient(elbow.clone().sub(shoulder)));
      this.set(lower, orient(target.clone().sub(elbow)));
    } else {
      this.set(upper, new Quaternion().setFromUnitVectors(lower.position.clone().normalize(), elbow.clone().sub(shoulder).normalize()));
      this.set(lower, new Quaternion().setFromUnitVectors(end.position.clone().normalize(), target.clone().sub(elbow).normalize()));
    }
  }

  apply(name: AnimName, time: number): void {
    this.cancelExit();
    if (!this.rig || !this.bones.has('LeftHand') || !this.bones.has('RightHand')) return;
    this.rig.updateWorldMatrix(true, true);
    const spine = this.bones.get('Spine2')!;
    const hips = this.bones.get('Hips')!;
    const sweep = name === 'swing_contact' || name === 'swing_whiff' ? smooth((time * FPS - 3) / 8)
      : name === 'swing_follow' ? 1 - smooth(time / FOLLOW_SEC) : 0;
    const referenceHands = this.bones.has('RightHandIndex2');
    const bunt = name === 'bunt' && referenceHands ? buntAmount(time) : 0;
    this.buntWeight = bunt;
    this.elbowRelease = name === 'bunt' && referenceHands ? smooth((time * FPS - BUNT_RECOVERY_FRAME) / BUNT_ELBOW_RELEASE_FRAMES) : 0;
    this.gripTilt = this.seated ? 0 : name === 'swing_contact' || name === 'swing_whiff' ? smooth((time * FPS - LEAD_GRIP_FROM_FRAME) / (CONTACT_FRAME - LEAD_GRIP_FROM_FRAME))
      : name === 'swing_follow' ? 1 - smooth(time / FOLLOW_SEC / .6) : 0;
    this.readyWeight = !referenceHands ? 0
      : name === 'swing_contact' || name === 'swing_whiff' ? 1-smooth(time*FPS/3)
      : name === 'swing_follow' ? smooth((time/FOLLOW_SEC-.7)/.3)
      : name === 'bunt' ? 1-bunt : 1;
    const desiredHeading = (-20 - 140 * sweep - 55 * bunt + 35*this.readyWeight) * Math.PI / 180;
    // The old actor clips include large torso rolls. A grip solved against
    // those shoulders can be reachable yet require a folded wrist. Establish
    // an upright batting frame before solving reach; the swing supplies yaw.
    if (referenceHands) {
      for (const name of ['Hips', 'Spine', 'Spine1', 'Spine2']) {
        const bone = this.bones.get(name)!;
        this.set(bone, new Quaternion());
      }
    }
    const chestForward = Z.clone().applyQuaternion(this.rotation(spine));
    const correction = desiredHeading - Math.atan2(chestForward.x, chestForward.z);
    this.set(hips, new Quaternion().setFromAxisAngle(Y, correction).multiply(this.rotation(hips)));
    if ((name === 'swing_contact' || name === 'swing_whiff') && referenceHands) {
      const lag = SHOULDER_LAG_RAD * Math.sin(Math.PI * Math.max(0, Math.min(1, (time * FPS - 3) / 8)));
      const part = new Quaternion().setFromAxisAngle(Y, lag / 3);
      for (const joint of ['Spine', 'Spine1', 'Spine2']) this.set(this.bones.get(joint)!, part.clone().multiply(this.rotation(this.bones.get(joint)!)));
    }
    if (bunt > 0) this.set(spine,this.rotation(spine).slerp(new Quaternion().setFromAxisAngle(Y,desiredHeading),bunt));
    const gripHeight = 2.3;
    const ready = new Vector3(.4, gripHeight - .08, .42);
    let grip = ready.clone();
    const readyAxis = this.bones.has('RightHandIndex2') ? REFERENCE_READY_AXIS : READY_AXIS;
    let axis = readyAxis.clone();
    const sweetSpot = this.contact ? this.rig.worldToLocal(this.contact.clone())
      : new Vector3(-contactOutFront(this.seated), REVIEW_CONTACT_HEIGHT_FT, .55 + BAT_SWEET_SPOT_FT);
    const contactAxis = contactBatAxis(sweetSpot.y, this.seated);
    this.sweetHeight = sweetSpot.y;
    const contact = sweetSpot.clone().addScaledVector(contactAxis, -BAT_SWEET_SPOT_FT);
    const wind = ready.clone().add(new Vector3(.07, .04, -.06));
    // A fixed finish round the lead side, reachable whatever the pitch.
    const through = new Vector3(-.77, wind.y, -.3);
    if (name === 'swing_contact' || name === 'swing_whiff') {
      const f = time * FPS;
      // Contact is the MIDDLE of the fastest sweep, not a stop between two
      // eases: both halves share one tangent and the whip peaks it at frame 7.
      grip.copy(swingHands(wind, contact, through, f, this.seated ? SEATED_SWING_DROP_FRAME : SWING_DROP_FRAME));
      const rise = smooth((f - FINISH_RISE_FROM_FRAME) / (FINISH_RISE_TO_FRAME - FINISH_RISE_FROM_FRAME));
      grip.addScaledVector(FINISH_RISE, rise);
      if (f <= CONTACT_FRAME) {
        axis.lerp(contactAxis, into((f - 3) / 4, BAT_WHIP));
        axis.addScaledVector(X, BAT_LAY_BACK * Math.sin(Math.PI * Math.max(0, Math.min(1, (f - 1) / 4)))).normalize();
      }
      else {
        // Leave contact at the angular speed it arrived with.
        const across = (from: Vector3, to: Vector3) => to.clone().sub(from).addScaledVector(from, -to.clone().sub(from).dot(from)).length();
        const outWhip = Math.min(3, BAT_WHIP * across(contactAxis, contactAxis.clone().sub(readyAxis).add(contactAxis)) / Math.max(1e-3, across(contactAxis, FOLLOW_AXIS)));
        axis.copy(contactAxis).lerp(FOLLOW_AXIS.clone(), 1 - into(1 - (f - CONTACT_FRAME) / 4, outWhip)).normalize();
        axis.copy(turnToward(axis, FINISH_AXIS, smooth((f - FINISH_RISE_FROM_FRAME) / (FINISH_RISE_TO_FRAME - FINISH_RISE_FROM_FRAME))));
      }
    } else if (name === 'bat_load') {
      grip.lerp(wind, Math.sin(Math.PI * time / framesToSec(clipSpec(name).frames)));
    } else if (name === 'bunt') {
      const t = smooth(Math.sin(Math.PI * time / framesToSec(clipSpec(name).frames)));
      if (referenceHands) {
        // Receive the pitch with a quiet bat held OUT IN FRONT. The top hand
        // travels up the taper; the bottom hand stays near the knob. At a
        // chest-close grip (0.24ft ahead of the shoulder) both arms had to
        // fold to 60-70 degrees and the knob elbow escaped sideways, level
        // with the shoulder — and seated, above it with a vertical forearm,
        // because a chair cannot step the trunk back. See BUNT_GRIP.
        grip.copy(this.stanceGrip).lerp(BUNT_GRIP, bunt);
        // Clear the shoulder first, then bring the bat into the receiving pose.
        grip.z += (.4 + .25*(1-bunt)**4)*Math.sin(Math.PI*bunt);
        axis.copy(STANCE_AXIS).lerp(BUNT_AXIS, smooth(bunt+.1*Math.sin(Math.PI*bunt))).normalize();
      } else { grip.lerp(contact, t); axis.lerp(contactAxis, t).normalize(); }
    } else if (name === 'swing_follow') {
      // Come down from the finish the way the swing rose into it, then
      // recover as before. Recovering straight from the high finish took the
      // bat across the face (shaft hits on all six kids sampled).
      const frame = time * FPS;
      const held = 1 - smooth(frame / FINISH_RETURN_FRAMES);
      const t = smooth((frame - FINISH_RETURN_FRAMES * .5) / (clipSpec(name).frames - FINISH_RETURN_FRAMES * .5));
      grip.copy(through).lerp(ready, t);
      // Recover around the front, not through the chest/head. A direct lerp
      // between opposite shoulder poses points the barrel through the skull.
      grip.z += .5 * Math.sin(Math.PI * t);
      grip.addScaledVector(FINISH_RISE, held);
      const around = new Vector3(0, this.bones.has('RightHandIndex2') ? .65 : .1, 1).normalize();
      if (t < .5) axis.copy(FOLLOW_AXIS).lerp(around, t * 2).normalize();
      else axis.copy(around).lerp(readyAxis, t * 2 - 1).normalize();
      axis.copy(turnToward(axis, FINISH_AXIS, held));
    }
    // A ready grip belongs beside the rear shoulder with the front elbow
    // below it. Blend out before contact so the established swing/bunt grip
    // paths retain their clearances, then return along the same approach.
    if (name !== 'bunt') {
      grip.lerp(this.stanceGrip,this.readyWeight);
      // Pass in front of long hair while lowering and recovering the bat.
      // The arc vanishes at ready and contact, preserving both endpoints.
      if (referenceHands) grip.z += .15 * Math.sin(Math.PI*this.readyWeight);
      axis.lerp(STANCE_AXIS,this.readyWeight).normalize();
    }
    // Plant the batting feet while the pelvis turns; lower/shift the body
    // only as far as the two hands need to reach the handle. Zoom's seated
    // clips retain their seat and leg transforms.
    const batRotation = new Quaternion().setFromUnitVectors(Y, axis);
    const handRotation = batRotation.clone();
    // Reference palms lie in X/Z. The handle crosses the palm along Z,
    // perpendicular to finger curl; legacy forward-facing mittens used Y.
    if (referenceHands) {
      // Seat the handle against the palm surface, not through its centre.
      for (const name of ['Prop_BatGrip','Prop_GloveAnchor']) {
        const anchor=this.bones.get(name)!;
        this.positions.set(anchor,anchor.position.clone());
        anchor.position.y=-.05;
        anchor.position.x+=name==='Prop_BatGrip'?.03:-.03;
      }
    }
    const upperPalm = grip.clone().addScaledVector(axis, BUNT_HAND_SLIDE_FT*bunt);
    const rightRotation = referenceHands ? this.gripRotation('Right', upperPalm, axis) : handRotation;
    const lowerPalm = grip.clone().addScaledVector(axis, -.18);
    const leftRotation = referenceHands ? this.gripRotation('Left', lowerPalm, axis)
      : handRotation.clone().multiply(new Quaternion().setFromAxisAngle(Y, Math.PI));
    {
      const handTargets = ['Left', 'Right'].map(side => {
        const right = side === 'Right';
        const rotation = right ? rightRotation : leftRotation;
        const palm = (right ? upperPalm : lowerPalm).clone();
        const wrist = palm.sub(this.palmOffset(side).applyQuaternion(rotation));
        const shoulder = this.at(this.bones.get(`${side}Arm`)!);
        const length = this.bones.get(`${side}ForeArm`)!.position.length() + this.bones.get(`${side}Hand`)!.position.length();
        // Leave room for the palm frame to turn as the upper hand slides.
        // A fully extended reach can flip the elbow plane between samples.
        return { wrist, shoulder, length: length*(1-.06*bunt) };
      });
      // The bunt keeps its own tuned reach (see BUNT_GRIP).
      const handSlack = SWING_REACH + (.985 - SWING_REACH) * smooth(Math.min(1, bunt * 6));
      if (this.seated) {
        // Rotate the trunk toward unreachable wrists instead of translating
        // the seat. Recompute shoulders after each small reach correction.
        const waist = this.bones.get('Spine')!;
        for (let pass = 0; pass < 20; pass++) {
          for (let i = 0; i < handTargets.length; i++) {
            const { wrist, length } = handTargets[i];
            const shoulder = this.at(this.bones.get(i === 0 ? 'LeftArm' : 'RightArm')!);
            const delta = wrist.clone().sub(shoulder);
            const excess = delta.length() - length * handSlack;
            if (excess <= 0) continue;
            const pivot = this.at(waist);
            const from = shoulder.clone().sub(pivot);
            const to = from.clone().add(delta.setLength(excess));
            let correction = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
            {
              // ★ Bend forward and turn, never lean SIDEWAYS: the side-bend
              // raised Zoom's rear shoulder beside his cheek on a low pitch
              // (independent review). Drop the roll about the chest's facing.
              const facing = Z.clone().applyQuaternion(this.rotation(this.bones.get('Spine2')!)).setY(0).normalize();
              const along = facing.dot(new Vector3(correction.x, correction.y, correction.z));
              const roll = new Quaternion(facing.x * along, facing.y * along, facing.z * along, correction.w).normalize();
              correction = correction.multiply(roll.invert());
            }
            this.set(waist, correction.multiply(this.rotation(waist)));
          }
        }
      } else {
        // Reach with the trunk first (TRUNK_REACH_RAD). Solve the whole bend at the waist, then
        // keep a soft-capped share of it spread over the three spine joints.
        // Capping pass by pass let the budget land on either hand by turns,
        // and the lead arm moved in bursts between samples.
        {
          const waist = this.bones.get('Spine')!, rest = this.rotation(waist);
          const total = new Quaternion();
          for (let pass = 0; pass < 20; pass++) {
            for (let i = 0; i < handTargets.length; i++) {
              const { wrist, length } = handTargets[i];
              const shoulder = this.at(this.bones.get(i === 0 ? 'LeftArm' : 'RightArm')!);
              const delta = wrist.clone().sub(shoulder);
              const excess = delta.length() - length * handSlack;
              if (excess <= 0) continue;
              const pivot = this.at(waist);
              const from = shoulder.clone().sub(pivot);
              const to = from.clone().add(delta.setLength(excess));
              const correction = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
              total.premultiply(correction);
              this.set(waist, correction.multiply(this.rotation(waist)));
            }
          }
          this.set(waist, rest);
          const angle = 2 * Math.acos(Math.min(1, Math.abs(total.w)));
          if (angle > 1e-6) {
            const kept = TRUNK_REACH_RAD * Math.tanh(angle / TRUNK_REACH_RAD) * (1 - bunt);
            const part = new Quaternion().slerp(total, kept / angle / 3);
            for (const name of ['Spine', 'Spine1', 'Spine2']) {
              const joint = this.bones.get(name)!;
              this.set(joint, part.clone().multiply(this.rotation(joint)));
            }
          }
          handTargets.forEach((target, i) => target.shoulder = this.at(this.bones.get(i === 0 ? 'LeftArm' : 'RightArm')!));
        }
        // Alternating projections put BOTH wrists within reach. Averaging two
        // independent corrections leaves the shorter arm detached on follow-through.
        const footRotation = new Quaternion().setFromAxisAngle(Y,-55*Math.PI/180*bunt);
        const feet = ['Left', 'Right'].map(side => ({
          wrist: new Vector3(...BIND.get(`${side}Foot`)!).applyQuaternion(footRotation),
          shoulder: this.at(this.bones.get(`${side}UpLeg`)!),
          length: this.bones.get(`${side}Leg`)!.position.length() + this.bones.get(`${side}Foot`)!.position.length(),
        }));
        const shift = new Vector3(0,-.16*bunt,0);
        const pelvis = this.at(hips), turn = this.rotation(hips), unturn = turn.clone().invert();
        const release = 1 - smooth(Math.min(1, bunt * 6));
        for (let pass = 0; pass < 20; pass++) {
          if (this.torso && release > 0) for (const palm of [upperPalm, lowerPalm]) {
            const clear = torsoClearance(this.torso, palm.clone().sub(pelvis).sub(shift).applyQuaternion(unturn));
            if (clear) shift.addScaledVector(clear.applyQuaternion(turn), -release);
          }
          for (const { wrist, shoulder, length, slack } of [
            ...handTargets.map(h => ({ ...h, slack: handSlack })), ...feet.map(foot => ({ ...foot, slack: .985 }))]) {
            const delta = wrist.clone().sub(shoulder).sub(shift);
            const excess = delta.length() - length * slack;
            if (excess > 0) shift.add(delta.setLength(excess));
          }
        }
        this.positions.set(hips, hips.position.clone());
        hips.position.add(shift);
        this.rig.updateWorldMatrix(true, true);
        // ★ THE KNEES FOLLOW THE HIPS. Aimed at the plate while the pelvis
        // turned to the pitcher, both knees folded toward the stance line
        // between hip joints now spread across it, and from the pitcher they
        // crossed (knock-kneed at every height; an independent review). Each
        // knee points where the pelvis faces, and the rear foot pivots on its
        // ball as the hips open ("squash the bug"), the lead foot a little.
        const facing = Z.clone().applyQuaternion(this.rotation(hips)); facing.y = 0; facing.normalize();
        const opened = Math.atan2(facing.x, facing.z);
        for (const side of ['Left', 'Right']) {
          const foot = this.bones.get(`${side}Foot`)!;
          const target = new Vector3(...BIND.get(`${side}Foot`)!).applyQuaternion(footRotation);
          const knee = facing;
          this.solve(this.bones.get(`${side}UpLeg`)!, this.bones.get(`${side}Leg`)!, foot, target, knee);
          const pivot = new Quaternion().setFromAxisAngle(Y, opened * (side === 'Right' ? REAR_FOOT_PIVOT : LEAD_FOOT_PIVOT) * (1 - bunt));
          this.set(foot, pivot.multiply(footRotation));
        }
      }
    }
    // The driving elbow briefly moves forward as the bat passes after contact.
    // Applying this to both arms pulls the support sleeve into the shaft;
    // taper to zero before recovery so ready/contact/follow joins stay fixed.
    // Verified over every batting frame on all 30 delivered models.
    const followClearance = name === 'swing_contact' || name === 'swing_whiff'
      ? Math.sin(Math.PI * smooth((time * FPS - CONTACT_FRAME) / 6)) : 0;
    this.arm('Right', upperPalm, rightRotation, followClearance,bunt);
    this.arm('Left', lowerPalm, leftRotation,0,bunt);
    if (referenceHands) {
      const anchor = this.bones.get('Prop_BatGrip')!;
      this.set(anchor,batRotation);
      // Bat origin remains at the regular handle location as the right palm
      // slides up it. Moving the palm must not move the bat along with it.
      anchor.position.addScaledVector(axis.clone().applyQuaternion(this.rotation(this.bones.get('RightHand')!).invert()),-BUNT_HAND_SLIDE_FT*bunt);
    }
    for (const side of ['Left', 'Right']) {
      const sign = side === 'Right' ? 1 : -1;
      for (const [suffix, angle] of [['Index1', 1.65], ['Thumb1', -.65]] as const) {
        const bone = this.bones.get(`${side}Hand${suffix}`);
        if (!bone) continue;
        if (!this.original.has(bone)) this.original.set(bone, bone.quaternion.clone());
        bone.quaternion.setFromAxisAngle(Y, sign * angle);
      }
    }
    const head = this.bones.get('Head');
    if (head) {
      // Look down at the ball with part of the chest's lean. Held level while
      // the trunk bends, the head sank between raised shoulders and the neck
      // vanished (independent review, Zoom).
      const chest = Z.clone().applyQuaternion(this.rotation(this.bones.get('Spine2')!));
      const lean = Math.max(0, Math.asin(Math.max(-1, Math.min(1, -chest.y))));
      this.set(head, new Quaternion().setFromAxisAngle(Y, -Math.PI / 2).multiply(new Quaternion().setFromAxisAngle(X, Math.min(HEAD_FOLLOW_MAX, HEAD_FOLLOW * lean))));
    }
    this.rig.updateWorldMatrix(true, true);
    this.displayedRotations = new Map([...this.original.keys()].map(b => [b, b.quaternion.clone()]));
    this.displayedPositions = new Map([...this.positions.keys()].map(b => [b, b.position.clone()]));
  }
}
