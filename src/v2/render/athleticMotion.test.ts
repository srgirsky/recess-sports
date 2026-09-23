// Visual review exposed forward-folding knees and a shuffle that only walked
// in place. Measure the posed limbs, not the sign or names of authored keys.
import {describe,it,expect} from 'vitest';
import {Vector3} from 'three';
import {ProxyCharacter} from './ProxyCharacter';
import {AnimationDirector} from './AnimationDirector';
import {buildProceduralClips,buildJunebugPilotClips} from './proceduralClips';
import {clipSpec,FPS} from './clips';
import {ROSTER} from '../../data/characters';

function fixture(junebug=false){
  const kid=new ProxyCharacter(ROSTER[0].visual);
  const director=new AnimationDirector(kid.mesh,{clips:buildProceduralClips(),performanceClips:junebug?buildJunebugPilotClips():[]});
  const bone=(name:string)=>kid.bones.find(b=>b.name===name)!;
  const at=(name:string)=>bone('Root').worldToLocal(bone(name).getWorldPosition(new Vector3()));
  return {director,bone,at,done:()=>{director.dispose();kid.dispose();}};
}
describe('athletic motion',()=>{
  it.each([false,true])('folds recovering heels behind the knee (Junebug %s)',junebug=>{
    const f=fixture(junebug);
    for(const clip of ['run','run_fast','trot'] as const){
      let recovery=0;
      for(let frame=0;frame<clipSpec(clip).frames;frame++){
        f.director.seek(clip,frame/FPS);
        for(const side of ['Left','Right']){
          const foot=f.bone(side+'UpLeg').worldToLocal(f.bone(side+'Foot').getWorldPosition(new Vector3()));
          // +Z is forward. A flexed lower leg must recover toward -Z.
          expect(foot.z,`${clip}:${frame} ${side}`).toBeLessThan(.001);
          recovery=Math.max(recovery,-foot.z);
        }
      }
      expect(recovery,clip).toBeGreaterThan(.3);
    }
    f.done();
  });
  it.each(['shuffle_left','shuffle_right'] as const)('%s moves mainly sideways without crossing the feet',clip=>{
    const f=fixture(),feet=[[],[]] as Vector3[][];
    for(let frame=0;frame<clipSpec(clip).frames;frame++){
      f.director.seek(clip,frame/FPS);
      const left=f.at('LeftFoot'),right=f.at('RightFoot');
      expect(left.x).toBeLessThan(right.x);
      feet[0].push(left);feet[1].push(right);
    }
    for(const samples of feet){
      const range=(axis:'x'|'z')=>Math.max(...samples.map(p=>p[axis]))-Math.min(...samples.map(p=>p[axis]));
      expect(range('x')).toBeGreaterThan(.2);
      expect(range('x')).toBeGreaterThan(range('z'));
    }
    f.done();
  });
  it('gathers, raises the throwing arm, releases high and follows through',()=>{
    const f=fixture();
    f.director.seek('pitch_windup',22/FPS);
    expect(f.at('LeftLeg').y).toBeGreaterThan(f.at('LeftUpLeg').y);
    f.director.seek('pitch_stride',11/FPS);
    expect(f.at('RightForeArm').y-f.at('RightArm').y).toBeGreaterThan(.15);
    expect(f.at('RightHand').y-f.at('RightArm').y).toBeGreaterThan(.5);
    f.director.seek('pitch_release',clipSpec('pitch_release').marker!.frame/FPS);
    const released=f.at('RightHand');
    expect(released.y-f.at('RightArm').y).toBeGreaterThan(.6);
    expect(released.z-f.at('RightArm').z).toBeGreaterThan(.4);
    const upper=f.at('RightForeArm').sub(f.at('RightArm')).normalize();
    expect(upper.dot(released.clone().sub(f.at('RightForeArm')).normalize())).toBeGreaterThan(.95);
    f.director.seek('pitch_release',11/FPS);
    expect(f.at('RightHand').y).toBeLessThan(released.y-.7);
    f.done();
  });
});
