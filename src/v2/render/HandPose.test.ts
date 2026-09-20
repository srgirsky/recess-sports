// Reference hands once passed bone tests while fingers shared one rigid pivot.
// These checks cover the runtime seams: a pointing index stays open, distal
// joints actually curl, crossfades do not snap, and seeks/restores cannot drift.
import { describe, it, expect } from 'vitest';
import { Bone, Quaternion, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { HandPose } from './HandPose';
import { SKELETON } from './skeleton';
import { BattingPose } from './battingPose';
import { clipSpec, FPS } from './clips';

function rig(reference=true) {
  const bones=new Map<string,Bone>();
  for(const spec of SKELETON){const b=new Bone();b.name=spec.name;b.position.set(...spec.pos);bones.set(b.name,b);if(spec.parent)bones.get(spec.parent)!.add(b);}
  if(reference)for(const [side,sign] of [['Left',-1],['Right',1]] as const){
    for(const [name,parent,pos] of [
      ['Middle1','', [sign*.165,0,-.026]],['Ring1','',[sign*.165,0,-.076]],
      ['Index2','Index1',[sign*.06,0,0]],['Curl2','Middle1',[sign*.06,0,0]],
    ] as const){const b=new Bone();b.name=side+'Hand'+name;b.position.set(pos[0],pos[1],pos[2]);bones.get(side+'Hand'+parent)!.add(b);bones.set(b.name,b);}
  }
  const mesh=new SkinnedMesh();mesh.add(bones.get('Root')!);mesh.skeleton=new Skeleton([...bones.values()]);mesh.updateMatrixWorld(true);
  return {mesh,bones,pose:new HandPose(mesh)};
}

describe('reference hand behavior',()=>{
  it('opens the throwing fingers across the authored release marker',()=>{
    const {bones,pose}=rig(),finger=bones.get('RightHandIndex2')!;
    for(const clip of ['pitch_release','throw_overhand'] as const){
      const release=clipSpec(clip).marker!.frame/FPS;
      pose.restore();pose.apply(clip,Infinity,release-.1);const closed=finger.quaternion.clone();
      pose.restore();pose.apply(clip,Infinity,release+.1);const open=finger.quaternion.clone();
      expect(open.angleTo(new Quaternion())).toBeLessThan(.2);
      expect(closed.angleTo(open)).toBeGreaterThan(.7);
      pose.restore();pose.apply(clip,Infinity,release+.1);expect(finger.quaternion.angleTo(open)).toBeLessThan(1e-7);
    }
  });
  it('leaves legacy authored hands untouched',()=>{
    const {bones,pose}=rig(false),b=bones.get('RightHandIndex1')!;
    b.quaternion.setFromAxisAngle(new Vector3(0,1,0),.4);const old=b.quaternion.clone();
    pose.constrainArms('run');pose.apply('swing_contact');expect(b.quaternion.angleTo(old)).toBeLessThan(1e-7);
  });
  it('points with an extended index while both other fingers fold at two joints',()=>{
    const {bones,pose}=rig();pose.apply('pose_card');
    for(const name of ['Index1','Index2'])expect(bones.get('RightHand'+name)!.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-7);
    for(const name of ['Middle1','Ring1','Curl2'])expect(bones.get('RightHand'+name)!.quaternion.angleTo(new Quaternion())).toBeGreaterThan(1);
    expect(bones.get('RightHandMiddle1')!.quaternion.angleTo(bones.get('RightHandRing1')!.quaternion)).toBeLessThan(1e-7);
  });
  it('blends hand changes and makes explicit seeks independent of history',()=>{
    const {bones,pose}=rig(),b=bones.get('RightHandIndex1')!;
    pose.apply('idle');const idle=b.quaternion.clone();pose.restore();pose.apply('bat_stance',1/60);
    expect(b.quaternion.angleTo(idle)).toBeGreaterThan(.01);expect(b.quaternion.angleTo(idle)).toBeLessThan(.3);
    for(let n=0;n<90;n++){pose.restore();pose.apply('bat_stance',1/60);}
    const settled=b.quaternion.clone();pose.restore();pose.apply('bat_stance');expect(b.quaternion.angleTo(settled)).toBeLessThan(1e-6);
    pose.restore();pose.apply('pose_card');pose.restore();pose.apply('bat_stance');expect(b.quaternion.angleTo(settled)).toBeLessThan(1e-6);
    pose.restore();expect(b.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-7);
  });
  it('bends both elbows forward with a finite hinge and restores the authored pose',()=>{
    const {bones,pose}=rig();
    for(const side of ['Left','Right'])bones.get(side+'ForeArm')!.quaternion.setFromAxisAngle(new Vector3(0,0,1),Math.PI);
    const original=bones.get('RightForeArm')!.quaternion.clone();pose.constrainArms('run');
    for(const [side,sign] of [['Left',-1],['Right',1]] as const){
      const q=bones.get(side+'ForeArm')!.quaternion;
      expect(new Vector3(sign,0,0).applyQuaternion(q).z).toBeGreaterThan(.5);
      expect(q.angleTo(new Quaternion())).toBeLessThan(2.54);
    }
    pose.restore();expect(bones.get('RightForeArm')!.quaternion.angleTo(original)).toBeLessThan(1e-7);
  });
  it('puts the handle across the palm, keeps both grips together, and restores attachment transforms',()=>{
    const {mesh,bones}=rig(),bat=new BattingPose(mesh);
    const anchor=bones.get('Prop_BatGrip')!, old=anchor.position.clone();
    bat.apply('bat_stance',0);mesh.updateMatrixWorld(true);
    const hand=bones.get('RightHand')!;
    const shaft=anchor.localToWorld(new Vector3(0,1,0));hand.worldToLocal(shaft);
    expect(Math.abs(shaft.z)).toBeGreaterThan(.95);
    const lower=anchor.localToWorld(new Vector3(0,-.18,0));
    expect(lower.distanceTo(bones.get('Prop_GloveAnchor')!.getWorldPosition(new Vector3()))).toBeLessThan(.001);
    expect(anchor.position.y).toBeLessThan(0);
    bat.restore();expect(anchor.position.distanceTo(old)).toBeLessThan(1e-7);expect(anchor.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-7);
  });
});
