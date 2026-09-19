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
import { bindWorld } from './skeleton';
const BIND = bindWorld();

const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const READY_AXIS = new Vector3(.65, .45, .8).normalize();
const FOLLOW_AXIS = new Vector3(-.8, .6, .2).normalize();
const CONTACT_FRAME = clipSpec('swing_contact').marker!.frame;
const FOLLOW_SEC = framesToSec(clipSpec('swing_follow').frames);
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Side-on box placement in the render's exaggerated reference feet. */
export function battingPlacement(scale: number) {
  return { x: -(BAT_SWEET_SPOT_FT + .55) * scale, z: -.15 * scale, facing: Math.PI / 2 };
}

/** Join the sim's centre-of-plate origin without teleporting out of the box. */
export function battingRunOut(scale: number, distanceFt: number) {
  const box = battingPlacement(scale);
  const remaining = 1 - smooth(distanceFt / 10);
  return { x: box.x * remaining, z: box.z * remaining };
}

export class BattingPose {
  private bones = new Map<string, Object3D>();
  private original = new Map<Object3D, Quaternion>();
  private positions = new Map<Object3D, Vector3>();
  private rig: Object3D | undefined;
  contact: Vector3 | null = null;

  private readonly seated: boolean;

  constructor(mesh: Object3D, seated = false) {
    this.seated = seated;
    for (const bone of (mesh as SkinnedMesh).skeleton?.bones ?? []) this.bones.set(bone.name, bone);
    this.rig = this.bones.get('Root');
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

  private arm(side: 'Left' | 'Right', palm: Vector3, rotation: Quaternion): void {
    const upper = this.bones.get(`${side}Arm`)!;
    const lower = this.bones.get(`${side}ForeArm`)!;
    const hand = this.bones.get(`${side}Hand`)!;
    const sign = side === 'Right' ? 1 : -1;
    const wrist = palm.clone().sub(this.palmOffset(side).applyQuaternion(rotation));
    this.solve(upper, lower, hand, wrist, new Vector3(sign * .25, -1, 0));
    this.set(hand, rotation);
  }

  private palmOffset(side: string): Vector3 {
    return this.bones.get(side === 'Right' ? 'Prop_BatGrip' : 'Prop_GloveAnchor')!.position.clone();
  }

  private solve(upper: Object3D, lower: Object3D, end: Object3D, target: Vector3, hint: Vector3): void {
    const shoulder = this.at(upper);
    const to = target.clone().sub(shoulder);
    const l1 = lower.position.length(), l2 = end.position.length();
    const d = Math.max(1e-5, Math.min(to.length(), l1 + l2 - 1e-5));
    const direction = to.normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const bend = hint.clone().addScaledVector(direction, -hint.dot(direction)).normalize();
    const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
    this.set(upper, new Quaternion().setFromUnitVectors(lower.position.clone().normalize(), elbow.clone().sub(shoulder).normalize()));
    this.set(lower, new Quaternion().setFromUnitVectors(end.position.clone().normalize(), target.clone().sub(elbow).normalize()));
  }

  apply(name: AnimName, time: number): void {
    if (!this.rig || !this.bones.has('LeftHand') || !this.bones.has('RightHand')) return;
    this.rig.updateWorldMatrix(true, true);
    const spine = this.bones.get('Spine2')!;
    const hips = this.bones.get('Hips')!;
    const sweep = name === 'swing_contact' || name === 'swing_whiff' ? smooth((time * FPS - 3) / 8)
      : name === 'swing_follow' ? 1 - smooth(time / FOLLOW_SEC) : 0;
    const desiredHeading = (-20 - 140 * sweep) * Math.PI / 180;
    const chestForward = Z.clone().applyQuaternion(this.rotation(spine));
    const correction = desiredHeading - Math.atan2(chestForward.x, chestForward.z);
    this.set(hips, new Quaternion().setFromAxisAngle(Y, correction).multiply(this.rotation(hips)));
    const gripHeight = 2.3;
    const ready = new Vector3(.4, gripHeight - .08, .42);
    let grip = ready.clone();
    let axis = READY_AXIS.clone();
    const contact = this.contact ? this.rig.worldToLocal(this.contact.clone()).addScaledVector(Z, -BAT_SWEET_SPOT_FT) : new Vector3(-.15, gripHeight - .45, .55);
    const wind = ready.clone().add(new Vector3(.07, .04, -.06));
    const through = contact.clone().multiplyScalar(2).sub(wind);
    through.y = wind.y;
    through.z = -.3;
    if (name === 'swing_contact' || name === 'swing_whiff') {
      const f = time * FPS;
      // Contact is the MIDDLE of the fastest sweep, not a stop between two
      // eases. Both halves share one curve, so hand speed peaks at frame 7.
      const sweep = smooth((f - CONTACT_FRAME + 2) / 4);
      grip.copy(wind).lerp(through, sweep);
      if (f <= CONTACT_FRAME) {
        grip.y = wind.y + (contact.y - wind.y) * smooth(f / CONTACT_FRAME);
        grip.z = wind.z + (contact.z - wind.z) * smooth(f / CONTACT_FRAME);
      } else {
        const recover = smooth((f - CONTACT_FRAME) / 6);
        grip.y = contact.y + (through.y - contact.y) * recover;
        grip.z = contact.z + (through.z - contact.z) * recover;
      }
      if (f <= CONTACT_FRAME) axis.lerp(Z, smooth((f - 3) / 4)).normalize();
      else axis.copy(Z).lerp(FOLLOW_AXIS.clone(), smooth((f - CONTACT_FRAME) / 4)).normalize();
    } else if (name === 'bat_load') {
      grip.lerp(wind, Math.sin(Math.PI * time / framesToSec(clipSpec(name).frames)));
    } else if (name === 'bunt') {
      const t = smooth(Math.sin(Math.PI * time / framesToSec(clipSpec(name).frames)));
      grip.lerp(contact, t); axis.lerp(Z, t).normalize();
    } else if (name === 'swing_follow') {
      const t = smooth(time / FOLLOW_SEC);
      grip.copy(through).lerp(ready, t);
      // Recover around the front, not through the chest/head. A direct lerp
      // between opposite shoulder poses points the barrel through the skull.
      grip.z += .5 * Math.sin(Math.PI * t);
      const around = new Vector3(0, .1, 1).normalize();
      if (t < .5) axis.copy(FOLLOW_AXIS).lerp(around, t * 2).normalize();
      else axis.copy(around).lerp(READY_AXIS, t * 2 - 1).normalize();
    }
    // Plant the batting feet while the pelvis turns; lower/shift the body
    // only as far as the two hands need to reach the handle. Zoom's seated
    // clips retain their seat and leg transforms.
    const handRotation = new Quaternion().setFromUnitVectors(Y, axis);
    {
      const handTargets = ['Left', 'Right'].map(side => {
        const right = side === 'Right';
        const rotation = right ? handRotation : handRotation.clone().multiply(new Quaternion().setFromAxisAngle(Y, Math.PI));
        const palm = grip.clone().addScaledVector(axis, right ? 0 : -.18);
        const wrist = palm.sub(this.palmOffset(side).applyQuaternion(rotation));
        const shoulder = this.at(this.bones.get(`${side}Arm`)!);
        const length = this.bones.get(`${side}ForeArm`)!.position.length() + this.bones.get(`${side}Hand`)!.position.length();
        return { wrist, shoulder, length };
      });
      if (this.seated) {
        // Rotate the trunk toward unreachable wrists instead of translating
        // the seat. Recompute shoulders after each small reach correction.
        const waist = this.bones.get('Spine')!;
        for (let pass = 0; pass < 20; pass++) {
          for (let i = 0; i < handTargets.length; i++) {
            const { wrist, length } = handTargets[i];
            const shoulder = this.at(this.bones.get(i === 0 ? 'LeftArm' : 'RightArm')!);
            const delta = wrist.clone().sub(shoulder);
            const excess = delta.length() - length * .985;
            if (excess <= 0) continue;
            const pivot = this.at(waist);
            const from = shoulder.clone().sub(pivot);
            const to = from.clone().add(delta.setLength(excess));
            const correction = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
            this.set(waist, correction.multiply(this.rotation(waist)));
          }
        }
      } else {
        // Alternating projections put BOTH wrists within reach. Averaging two
        // independent corrections leaves the shorter arm detached on follow-through.
        const feet = ['Left', 'Right'].map(side => ({
          wrist: new Vector3(...BIND.get(`${side}Foot`)!),
          shoulder: this.at(this.bones.get(`${side}UpLeg`)!),
          length: this.bones.get(`${side}Leg`)!.position.length() + this.bones.get(`${side}Foot`)!.position.length(),
        }));
        const shift = new Vector3();
        for (let pass = 0; pass < 20; pass++) {
          for (const { wrist, shoulder, length } of [...handTargets, ...feet]) {
            const delta = wrist.clone().sub(shoulder).sub(shift);
            const excess = delta.length() - length * .985;
            if (excess > 0) shift.add(delta.setLength(excess));
          }
        }
        this.positions.set(hips, hips.position.clone());
        hips.position.add(shift);
        this.rig.updateWorldMatrix(true, true);
        for (const side of ['Left', 'Right']) {
          const foot = this.bones.get(`${side}Foot`)!;
          const target = new Vector3(...BIND.get(`${side}Foot`)!);
          this.solve(this.bones.get(`${side}UpLeg`)!, this.bones.get(`${side}Leg`)!, foot, target, new Vector3(0, 0, 1));
          this.set(foot, new Quaternion());
        }
      }
    }
    this.arm('Right', grip, handRotation);
    const lowerPalm = grip.clone().addScaledVector(axis, -.18);
    this.arm('Left', lowerPalm, handRotation.clone().multiply(new Quaternion().setFromAxisAngle(Y, Math.PI)));
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
    if (head) this.set(head, new Quaternion().setFromAxisAngle(Y, -Math.PI / 2));
    this.rig.updateWorldMatrix(true, true);
  }
}
