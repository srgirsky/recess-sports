// A release marker alone previously accepted a sleeve twisting about its own
// axis. Check the actual elbow/hand arc, and the live possession-to-release seam.
import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { applyFrame, type SceneRefs } from './bridge';
import type { LiveFrame } from '../sim/game';
import { AnimationDirector } from './AnimationDirector';
import { ProxyCharacter } from './ProxyCharacter';
import { buildProceduralClips } from './proceduralClips';
import { clipSpec, FPS } from './clips';
import { throwPreparationCue } from './actionCues';
import { ROSTER, getCharacter } from '../../data/characters';
import { autoAssign } from '../../systems/lineup';
import { beginPlay, plannedThrow, stepPlay } from '../sim/play';
import { VENUE_GEOMETRY } from '../sim/field';
import { makeRng } from '../sim/rng';

describe('overhand throwing',()=>{
  it('raises the elbow, cocks the hand, extends forward and follows through',()=>{
    const kid=new ProxyCharacter(ROSTER[0].visual);
    const dir=new AnimationDirector(kid.mesh,{clips:buildProceduralClips()});
    const bone=(name:string)=>kid.bones.find(b=>b.name===name)!;
    const at=(name:string)=>bone('Spine2').worldToLocal(bone(name).getWorldPosition(new Vector3()));
    for(const clip of ['throw_overhand','throw_quick'] as const){
      const release=clipSpec(clip).marker!.frame;
      dir.seek(clip,release*.55/FPS);kid.root.updateMatrixWorld(true);
      const shoulder=at('RightArm'),elbow=at('RightForeArm'),cocked=at('RightHand');
      expect(elbow.y-shoulder.y).toBeGreaterThan(.12);
      expect(cocked.y-shoulder.y).toBeGreaterThan(.5);
      expect(cocked.z-shoulder.z).toBeLessThan(0);
      dir.seek(clip,release/FPS);kid.root.updateMatrixWorld(true);
      const hand=at('RightHand'),upper=at('RightForeArm').sub(at('RightArm')).normalize();
      const fore=hand.clone().sub(at('RightForeArm')).normalize();
      expect(upper.dot(fore)).toBeGreaterThan(.95);
      expect(hand.z-at('RightArm').z).toBeGreaterThan(.7);
      expect(hand.y-at('RightArm').y).toBeGreaterThan(.3);
      dir.seek(clip,(release+(clipSpec(clip).frames-release)*.55)/FPS);kid.root.updateMatrixWorld(true);
      expect(at('RightHand').y).toBeLessThan(hand.y-.4);
    }
    dir.dispose();kid.dispose();
  });

  it('holds preparation without releasing and resumes at the real release marker',()=>{
    const kid=new ProxyCharacter(ROSTER[0].visual),dir=new AnimationDirector(kid.mesh,{clips:buildProceduralClips()});
    dir.prepareThrow(.2);dir.update(2);
    expect(dir.action!.time).toBeCloseTo(.2);
    expect(dir.action!.paused).toBe(true);
    dir.playToMarker('throw_overhand',0);
    expect(dir.action!.time).toBeCloseTo(11/FPS);
    expect(dir.action!.paused).toBe(false);
    dir.update(.1);expect(dir.action!.time).toBeGreaterThan(11/FPS);
    dir.prepareThrow(.2);dir.cancelThrowPreparation();
    expect(dir.playing).toBe('field_ready');
    dir.dispose();kid.dispose();
  });

  it('shows preparation before a real live throw without changing sim state',()=>{
    const s=beginPlay({launch:{exitVelocityFts:45,launchAngleDeg:-2,sprayDeg:0,spinRpm:-400,heightFt:2.5},
      batter:ROSTER[0],runners:[],defence:autoAssign(ROSTER.slice(0,9).map(c=>c.id)).positions,
      lookup:getCharacter,outs:0,geo:VENUE_GEOMETRY.park},makeRng('throw-choreography'));
    const refs: SceneRefs={kids:new Map(),directors:new Map(),ball:new Object3D()};
    for(const f of s.fielders){
      const kid=new ProxyCharacter(getCharacter(f.charId)!.visual);
      refs.kids.set(f.charId,kid);refs.directors.set(f.charId,new AnimationDirector(kid.mesh,{clips:buildProceduralClips()}));
    }
    let prepared=false,released=false,lastTime=0;
    for(let n=0;n<3600 && s.phase==='live';n++){
      stepPlay(s,1/60);
      const before=JSON.stringify(s);
      plannedThrow(s);
      const cue=throwPreparationCue(s);
      if(cue)refs.directors.get(cue.characterId)!.prepareThrow(cue.timeSec);
      const release=s.events.find(e=>e.t==='throw'||e.t==='relay');
      if(release && 'fielder' in release)refs.directors.get(release.fielder)!.playToMarker('throw_overhand',0);
      // A slow paint may arrive after the one-tick release event was consumed.
      applyFrame(refs,{phase:'live',play:release ? {...s,events:[]} : s} as LiveFrame,1/60);
      expect(JSON.stringify(s)).toBe(before);
      if(cue?.at){
        prepared=true;lastTime=cue.timeSec;expect(lastTime).toBeLessThan(11/FPS);
        const kid=refs.kids.get(cue.characterId)!;
        const palm=kid.bones.find(b=>b.name==='RightHand')!.localToWorld(new Vector3(.12,-.04,0));
        expect(refs.ball.position.distanceTo(palm)).toBeLessThan(1e-6);
      }
      if(release && 'fielder' in release){
        released=true;expect(prepared).toBe(true);expect(lastTime).toBeGreaterThan(8/FPS);
        const palm=refs.kids.get(release.fielder)!.bones.find(b=>b.name==='RightHand')!.localToWorld(new Vector3(.12,-.04,0));
        expect(refs.ball.position.distanceTo(palm)).toBeLessThan(1e-6);
        break;
      }
    }
    expect(released).toBe(true);
    for(const d of refs.directors.values())d.dispose();
    for(const kid of refs.kids.values())kid.dispose();
  });
});
