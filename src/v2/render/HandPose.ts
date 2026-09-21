// Independent cartoon digits for reference hands with root and distal hinges.
// The canonical bind is palms down: fingers spread in X/Z and curl toward -Y.
// Legacy mitten rigs are left to their authored clips. AnimationDirector owns
// application/restoration, including seeks, so preview and gameplay agree.
import { Euler, Object3D, Quaternion, Vector3, type SkinnedMesh } from 'three';
import { buntAmount } from './buntPose';
import { clipSpec, FPS, holdsBat, type AnimName } from './clips';
const Z = new Vector3(0, 0, 1), Y = new Vector3(0, 1, 0), X = new Vector3(1, 0, 0);
const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
export class HandPose {
  private bones = new Map<string, Object3D>();
  private original = new Map<Object3D, Quaternion>();
  private displayed = new Map<Object3D, Quaternion>();
  constructor(mesh: Object3D) {
    for (const b of (mesh as SkinnedMesh).skeleton?.bones ?? []) this.bones.set(b.name, b);
  }
  restore(): void {
    for (const [b,q] of this.original) b.quaternion.copy(q);
    this.original.clear();
  }
  private supports(side: string): boolean {
    return ['Middle1','Ring1','Index2','Curl2'].every(n=>this.bones.has(`${side}Hand${n}`));
  }
  /** Reference rig only. Flexion and forearm roll are separate DOFs; old
   * generated poses could extend the elbow backwards or swivel it sideways.
   * These are conservative cartoon authoring limits, not clinical measurements.
   * Batting uses its hand-target solve and is checked separately. */
  constrainArms(clip: AnimName): void {
    if (holdsBat(clip)) return;
    for (const [side, sign] of [['Left',-1],['Right',1]] as const) {
      if (!this.supports(side)) continue;
      const fore = this.bones.get(`${side}ForeArm`)!;
      const q = fore.quaternion.clone();
      this.original.set(fore,q);
      const twist = new Quaternion(q.x,0,0,q.w).normalize();
      // q and -q are the same rotation. Keep roll extraction in one hemisphere
      // so an interpolated sign change cannot become a 360-degree wrist flip.
      if (twist.w<0) twist.set(-twist.x,0,0,-twist.w);
      const swing = q.clone().multiply(twist.clone().invert());
      const bend = Math.min(145*Math.PI/180,2*Math.atan2(Math.hypot(swing.y,swing.z),Math.abs(swing.w)));
      const roll = clamp(2*Math.atan2(twist.x,twist.w),75*Math.PI/180);
      fore.quaternion.setFromAxisAngle(Y,-sign*bend).multiply(new Quaternion().setFromAxisAngle(X,roll));
      const hand = this.bones.get(`${side}Hand`)!;
      this.original.set(hand,hand.quaternion.clone());
      const wrist = new Euler().setFromQuaternion(hand.quaternion,'XYZ');
      wrist.set(clamp(wrist.x,Math.PI/2),clamp(wrist.y,50*Math.PI/180),clamp(wrist.z,50*Math.PI/180));
      hand.quaternion.setFromEuler(wrist);
    }
  }
  apply(clip: AnimName, dtSec = Infinity, timeSec = 0): void {
    for (const [side, sign] of [['Left',-1],['Right',1]] as const) {
      if (!this.supports(side)) continue;
      const bat = holdsBat(clip);
      const bunt = clip === 'bunt' && side === 'Right' ? buntAmount(timeSec) : 0;
      const batCurl = (closed: number, cradle: number) => closed+(cradle-closed)*bunt;
      const point = clip === 'pose_card' && side === 'Right';
      const ball = side === 'Right' && (clip.startsWith('pitch_') || clip.startsWith('throw_'));
      const marker=clipSpec(clip).marker;
      const ballGrip=ball && marker?.name==='RELEASE'
        ? 1-Math.max(0,Math.min(1,(timeSec-marker.frame/FPS+.04)/.12)) : 1;
      const holding=(closed: number, relaxed: number)=>relaxed+(closed-relaxed)*ballGrip;
      for (const [finger, curl] of [
        ['Index1', bat ? batCurl(1.3,.9) : point ? 0 : ball ? holding(.65,.12) : .12],
        ['Middle1', bat ? batCurl(1.3,1.65) : point ? 1.8 : ball ? holding(.8,.22) : .22],
        ['Ring1', bat ? batCurl(1.3,1.65) : point ? 1.8 : ball ? holding(.8,.22) : .22],
        ['Index2', bat ? batCurl(1.5,1.1) : point ? 0 : ball ? holding(.9,.16) : .16],
        ['Curl2', bat ? batCurl(1.5,1.6) : point ? 1.6 : ball ? holding(1,.25) : .25],
        ['Thumb1', bat ? batCurl(.8,.5) : point ? .9 : ball ? holding(.5,.08) : .08],
      ] as const) {
        const bone = this.bones.get(`${side}Hand${finger}`);
        if (!bone) continue;
        if (!this.original.has(bone)) this.original.set(bone,bone.quaternion.clone());
        bone.quaternion.setFromAxisAngle(finger === 'Thumb1' ? Y : Z, sign * curl * (finger === 'Thumb1' ? 1 : -1));
        if (finger === 'Thumb1') bone.quaternion.multiply(new Quaternion().setFromAxisAngle(X,bat ? 1 : point ? .9 : ball ? holding(.6,.1) : .1));
        const previous=this.displayed.get(bone);
        if (previous && Number.isFinite(dtSec)) {
          const target=bone.quaternion.clone();
          bone.quaternion.copy(previous).slerp(target,1-Math.exp(-Math.max(0,dtSec)/.08));
        }
        this.displayed.set(bone,bone.quaternion.clone());
      }
    }
  }
}
