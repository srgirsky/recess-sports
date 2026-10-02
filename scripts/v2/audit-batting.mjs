// The old orientation and wrist-distance checks passed an implausible grip.
// Sweep six batting actions on every delivered model IN the mirrored gameplay
// scene. --check rejects backward heads, detached palm anchors, missed contact
// markers, reference-hand wrist folds/roll jumps (and any inside the 3-degree
// margin), a top elbow shut at contact,
// a lead elbow tucked across the chest, a palm inside the torso around contact, a dropped pelvis, caved knees or a
// sunken head during the swing, and shaft intersections.
// Reference hands are sampled at 120Hz to catch inter-frame flips.
// Passing is not visual approval:
// finger enclosure, near misses by the barrel radius and transitions still
// require still/motion review. Results name exact character, clip and frame.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { sourceDigest } from './art-review.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=resolve(root,'.art-review/batting-diagnostic');
const port=Number(process.env.BATTING_AUDIT_PORT??5191);
mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--port',String(port),'--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{server.kill();reject(Error('Vite start timed out'));},30000);
 server.stdout.on('data',d=>{if(String(d).includes('ready in')){clearTimeout(timer);resolve();}});
 server.once('error',e=>{clearTimeout(timer);reject(e);});
 server.once('exit',code=>{clearTimeout(timer);reject(Error(`Vite exited: ${code}`));});
});
import {writeFileSync} from 'node:fs';
// BATTING_AUDIT_IDS=a,b narrows a diagnostic run; the gate always sweeps all 30.
const only=(process.env.BATTING_AUDIT_IDS??'').split(',').filter(Boolean);
if(only.length&&process.argv.includes('--check'))throw Error('--check audits the whole roster; unset BATTING_AUDIT_IDS');
let browser;
try {
 const hash=sourceDigest(root);
 browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.cancelAnimationFrame=()=>{};});
 await page.goto(`http://localhost:${port}/v2/?play=1&seed=art-benchmark&venue=park`,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__spike?.refs?.kids?.size>0);
 const data=await page.evaluate(async only=>{
  const {Vector3,Raycaster,Quaternion,BufferGeometry,BufferAttribute,Mesh,MeshBasicMaterial,DoubleSide}=await import('/node_modules/three/build/three.module.js');
  const {ROSTER}=await import('/src/data/characters.ts');
  const {createCharacter}=await import('/src/v2/render/CharacterFactory.ts');
  const {buntAmount,BUNT_HAND_SLIDE_FT}=await import('/src/v2/render/buntPose.ts');
  const {battingPlacement}=await import('/src/v2/render/battingPose.ts');
  const {BAT_SWEET_SPOT_FT}=await import('/src/v2/render/props.ts');
  const {clipSpec,FPS}=await import('/src/v2/render/clips.ts');
  const {MOUND}=await import('/src/v2/sim/field.ts');
  const {RIGS}=await import('/src/v2/render/cameraCues.ts');
  const s=window.__spike;s.setControlMode('watch');s.devStepFixedClock(0);s.devPaint(1);
  const results=[];
  for(const c of ROSTER.filter(c=>!only.length||only.includes(c.id))){
   const {view,source}=await createCharacter(c,{noProxyLevel:true});
   await s.prepareCharacterPerformance(c.id);
   const dir=s.directorFor(c,view);
   if(source!=='model')throw Error(`${c.id}: expected delivered model, got ${source}`);
   const referenceHands=view.bones.some(b=>b.name==='RightHandIndex2');
   const rightPalmOffset=view.bones.find(b=>b.name==='Prop_BatGrip').position.clone().add(new Vector3(.03,-.05,0));
   const box=battingPlacement(view.root.scale.x,dir.battingPose.seated);
   view.setPosition(box.x,box.z);view.setFacing(box.facing);s.scene.add(view.root);
   s.scene.updateMatrixWorld(true);
   // The swing is solved against the pitch height, so one fixed target hid a
   // top arm that snapped between quarter-frames at 1.6ft. Sweep the low,
   // middle and high strike-zone heights, plus the review page's own default.
   // ★ THE LEAD ARM STAYS OUTSIDE THE CHEST AT READY. Every gate here scored
   // bones and palms while the wide kids' lead sleeves ran through their own
   // tees in the stance the plate camera holds longest (ART-011; read from PITCH
   // as Moose's arm sunk in his hoodie and Tank's and Grizz's missing lead arm).
   // A lead-arm vertex is inside when rays in at least four of six axis
   // directions cross the torso-only triangles an odd number of times.
   const skinned=[];view.root.traverse(o=>{if(o.isSkinnedMesh&&!o.userData.isOutline)skinned.push(o);});
   const body=skinned.sort((a,b)=>b.geometry.attributes.position.count-a.geometry.attributes.position.count)[0];
   const leadInside=(()=>{
    const g=body.geometry,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,count=g.attributes.position.count,names=body.skeleton.bones.map(b=>b.name);
    const part=v=>{const w={};for(let j=0;j<4;j++){const n=names[si.getComponent(v,j)];w[n]=(w[n]??0)+sw.getComponent(v,j);}
     const [n,x]=Object.entries(w).sort((a,b)=>b[1]-a[1])[0];
     // A clean majority, so the shoulder seam blending into the chest is not counted.
     if(/^Left(ForeArm|Hand)/.test(n)&&x>.7||n==='LeftArm'&&x>.85)return 'lead';
     return /^Spine|^Hips$/.test(n)?'torso':null;};
    const parts=Array.from({length:count},(_,v)=>part(v)),lead=parts.flatMap((p,v)=>p==='lead'?[v]:[]);
    const index=g.index?g.index.array:Array.from({length:count},(_,i)=>i),torso=[];
    for(let i=0;i<index.length;i+=3)if(parts[index[i]]==='torso'&&parts[index[i+1]]==='torso'&&parts[index[i+2]]==='torso')torso.push(index[i],index[i+1],index[i+2]);
    const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(d=>new Vector3(...d));
    return ()=>{
     const P=new Float32Array(count*3),v3=new Vector3();
     for(let v=0;v<count;v++){body.getVertexPosition(v,v3);v3.applyMatrix4(body.matrixWorld);P[v*3]=v3.x;P[v*3+1]=v3.y;P[v*3+2]=v3.z;}
     const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(P,3));geometry.setIndex(torso);
     const shell=new Mesh(geometry,new MeshBasicMaterial({side:DoubleSide})),probe=new Raycaster();
     const inside=lead.filter(v=>{const o=new Vector3(P[v*3],P[v*3+1],P[v*3+2]);
      return dirs.filter(d=>{probe.set(o,d);return probe.intersectObject(shell).length%2===1;}).length>=4;}).length;
     geometry.dispose();return inside/lead.length;
    };
   })();
   let stanceHipsY=null,stanceNeck=null;
   for(const [clip,aim] of [['bat_stance',2.4],['bat_load',2.4],...['swing_contact','swing_follow','swing_whiff'].flatMap(c=>[1.6,2.4,3.1,null].map(h=>[c,h])),['bunt',2.4]]){
    dir.battingPose.contact=aim===null?null:s.scene.localToWorld(new Vector3(0,aim,0));
    const previous=new Map();
    for(let frame=0;frame<clipSpec(clip).frames;frame+=view.bones.some(b=>b.name==='RightHandIndex2')?.25:1){
     dir.seek(clip,frame/FPS);s.scene.updateMatrixWorld(true);
     const bone=n=>view.bones.find(b=>b.name===n);
     const at=n=>bone(n).getWorldPosition(new Vector3());
     const headAt=at('Head');
     const forward=bone('Head').localToWorld(new Vector3(0,0,1)).sub(headAt).normalize();
     const pitcher=s.scene.localToWorld(new Vector3(MOUND.x,0,MOUND.z));pitcher.y=headAt.y;
     const anchor=bone('Prop_BatGrip');
     const lowerPalm=anchor.localToWorld(new Vector3(0,-.18,0));
     const tip=anchor.localToWorld(new Vector3(0,BAT_SWEET_SPOT_FT,0));
     const origin=anchor.localToWorld(new Vector3(0,.3,0));
     // A centreline hit is a candidate, not a clearance certificate. The
     // instrument cannot see near misses by the barrel radius or finger shape.
     const ray=new Raycaster(origin,tip.clone().sub(origin).normalize(),0,1.55*view.root.scale.x);
     const topPalm=bone('RightHand').localToWorld(rightPalmOffset.clone());
     const topSlide=clip==='bunt'&&referenceHands?BUNT_HAND_SLIDE_FT*buntAmount(frame/FPS):0;
     const topTarget=anchor.localToWorld(new Vector3(0,topSlide,0));
     const allHits=ray.intersectObject(view.mesh,true).filter(h=>h.object.visible);
     // A bunt deliberately places the barrel hand on the formerly empty shaft.
     // Exempt only triangles weighted to that hand, close to its contact point;
     // sleeves, torso, face and any distant hand intersections still fail.
     const supportHits=allHits.filter(hit=>{
      if(clip!=='bunt'||!referenceHands||topSlide<.1||hit.point.distanceTo(topPalm)>.2*view.root.scale.x)return false;
      const mesh=hit.object,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
      if(!hit.face||!indices||!weights||!mesh.skeleton)return false;
      return [hit.face.a,hit.face.b,hit.face.c].every(v=>{
       let sum=0;for(let j=0;j<4;j++)if(mesh.skeleton.bones[indices.getComponent(v,j)].name.startsWith('RightHand'))sum+=weights.getComponent(v,j);
       return sum>.5;
      });
     });
     const hits=allHits.filter(hit=>!supportHits.includes(hit));
     const wristBends = bone('RightHandIndex2') ? ['Right','Left'].map(side => {
      const q=bone(side+'Hand').quaternion;
      return Math.acos(Math.max(-1,Math.min(1,new Vector3(1,0,0).applyQuaternion(q).x)))*180/Math.PI;
     }) : [];
     const wristTwists = bone('RightHandIndex2') ? ['Right','Left'].map(side => {
      const q=bone(side+'Hand').quaternion;
      return 2*Math.atan2(Math.abs(q.x),Math.abs(q.w))*180/Math.PI;
     }) : [];
     const armSteps = bone('RightHandIndex2') ? ['RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand'].map(name => {
      const q=bone(name).quaternion;
      const step=previous.has(name)?q.angleTo(previous.get(name))*180/Math.PI:0;
      previous.set(name,q.clone());return step;
     }) : [];
     // The top arm's shape at the marker, in the chest's own frame: a pose
     // with every palm on the handle still shipped a 29-69 degree elbow.
     const chest=bone('Spine2'),inverse=chest.getWorldQuaternion(new Quaternion()).invert(),centre=at('Spine2');
     const local=n=>at(n).sub(centre).applyQuaternion(inverse).divideScalar(view.root.scale.x);
     const elbowShape=side=>{const sh=local(side+'Arm'),el=local(side+'ForeArm'),wr=local(side+'Hand');
      // Out: the elbow's sideways position as a share of its shoulder's (1 = under
      // the shoulder, 0 = the chest's midline, below 0 = across the chest).
      // Upright: the forearm's angle from vertical, in world, degrees.
      const fore=at(side+'Hand').sub(at(side+'ForeArm'));
      return {deg:sh.clone().sub(el).angleTo(wr.clone().sub(el))*180/Math.PI,dropFt:sh.y-el.y,out:el.x/sh.x,foreFromVerticalDeg:Math.acos(Math.abs(fore.y)/fore.length())*180/Math.PI};};
     // A whiff shares the contact sweep (`battingPose.ts`), so it is read at the same frame.
     const marker=(clip==='swing_contact'||clip==='swing_whiff')&&frame===clipSpec('swing_contact').marker.frame&&referenceHands;
     // ★ A PALM INSIDE THE BELLY passed every gate here: the shaft ray starts
     // inside the mesh, where front faces cannot be hit, and elbow angles score
     // bones rather than what shows. Cast IN from outside, toward the torso axis
     // at the palm's height, ignoring arm and hand triangles; the first hit is
     // the body's outer surface. Big Lou's knob palm sat 0.48ft deep on `main`.
     const aroundContact=(clip==='swing_contact'||clip==='swing_whiff')&&frame>=5&&frame<=9&&referenceHands;
     const palmTorsoClearFt=aroundContact?Math.min(...[topPalm,lowerPalm].map(palm=>{
      const hipsAt=at('Hips'),chest=at('Spine1');
      const t=(palm.y-hipsAt.y)/Math.max(1e-3,chest.y-hipsAt.y),axis=hipsAt.clone().lerp(chest,t);
      const out=palm.clone().sub(axis);out.y=0;const reach=out.length();if(reach<1e-4)return -1;out.normalize();
      const far=4*view.root.scale.x,probe=new Raycaster(axis.clone().addScaledVector(out,far),out.clone().negate(),0,2*far);
      const body=probe.intersectObject(view.mesh,true).find(hit=>{
       if(!hit.object.visible||!hit.face)return false;
       const mesh=hit.object,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
       if(!indices||!mesh.skeleton)return true;
       let limb=0;for(const v of [hit.face.a,hit.face.b,hit.face.c])for(let j=0;j<4;j++)if(/Arm|Hand|Prop/.test(mesh.skeleton.bones[indices.getComponent(v,j)].name))limb+=weights.getComponent(v,j);
       return limb<1.5;
      });
      return body?(reach-(far-body.distance))/view.root.scale.x:Infinity;
     })):null;
     // ★ LEGS AND NECK PAY FOR WHAT THE ARMS CANNOT REACH. Every gate above
     // passed while Big Lou's pelvis slid 0.4ft over planted feet and his knees
     // caved together, and while Zoom's head sank between raised shoulders.
     // Measured against the kid's own bat_stance: the pelvis drop, each knee's
     // offset from its hip-to-foot line toward the other HIP (valgus: across the
     // pelvis, so a rear knee driving at the pitcher is not counted), and the
     // head's height over the shoulders.
     const rig=bone('Root'),inRig=n=>rig.worldToLocal(at(n)).divideScalar(1);
     const shoulderY=(inRig('LeftArm').y+inRig('RightArm').y)/2,neck=inRig('Head').y-shoulderY;
     if(clip==='bat_stance'&&frame===0){stanceHipsY=inRig('Hips').y;stanceNeck=neck;}
     const swing=clip.startsWith('swing_');
     const valgusFt=swing?Math.max(...[['Left','Right'],['Right','Left']].map(([side,other])=>{
      const hip=inRig(side+'UpLeg'),foot=inRig(side+'Foot'),knee=inRig(side+'Leg'),line=foot.clone().sub(hip).normalize();
      const off=knee.clone().sub(hip);off.addScaledVector(line,-off.dot(line));
      const toward=inRig(other+'UpLeg').sub(hip);toward.addScaledVector(line,-toward.dot(line));
      return toward.lengthSq()>1e-8?off.dot(toward.normalize()):0;
     })):null;
     // ★ A WHIFF IS WATCHED FROM BEHIND. Contact cuts to the live camera, but
     // a missed swing finishes in PITCH, which sits behind the batter: the old
     // lead-side wrap hid the bat behind his torso. Rays from the PITCH eye to
     // points along the bat, ignoring the hand's own skin.
     const pitchBatVisible=clip==='swing_whiff'&&frame>=10&&referenceHands?(()=>{
      const eye=new Vector3(...RIGS.PITCH.eye);
      const pts=[.6,.9,1.2,BAT_SWEET_SPOT_FT].map(t=>anchor.localToWorld(new Vector3(0,t,0)));
      return pts.filter(p=>{const d=p.clone().sub(eye),L=d.length();return !new Raycaster(eye,d.normalize(),0,L-.05).intersectObject(view.mesh,true).some(hit=>{
       if(!hit.object.visible||!hit.face)return false;
       const mesh=hit.object,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
       if(!indices||!mesh.skeleton)return true;
       let hand=0;for(const v of [hit.face.a,hit.face.b,hit.face.c])for(let j=0;j<4;j++)if(/Hand/.test(mesh.skeleton.bones[indices.getComponent(v,j)].name))hand+=weights.getComponent(v,j);
       return hand<1.5;});}).length/pts.length;})():null;
     // The held stance (both ends of its loop) and the loaded hands.
     const readyLeadInside=referenceHands&&!dir.battingPose.seated&&(clip==='bat_stance'&&(frame===0||frame===30)||clip==='bat_load'&&frame===11)?leadInside():null;
     results.push({id:c.id,clip,aim,frame,pitchBatVisible,readyLeadInside,clipSource:dir.sourceFor(clip),seated:dir.battingPose.seated,
      // Seen from the pitcher (across rig Z) the knees must keep the hips' order:
      // with the pelvis open and the knees aimed at the plate, they crossed.
      kneeOrder:swing&&Math.abs(inRig('RightUpLeg').z-inRig('LeftUpLeg').z)>.05?(inRig('RightLeg').z-inRig('LeftLeg').z)/(inRig('RightUpLeg').z-inRig('LeftUpLeg').z):null,
      hipDropFt:swing?stanceHipsY-inRig('Hips').y:null,valgusFt,neckRatio:swing?neck/stanceNeck:null,
      markerElbows:marker?{top:elbowShape('Right'),lead:elbowShape('Left')}:null,palmTorsoClearFt,
      buntLeadOut:clip==='bunt'&&frame===20&&referenceHands?elbowShape('Left').out:null,
      topElbowDropFt:aroundContact?elbowShape('Right').dropFt:null,
      headTowardPitcher:forward.dot(pitcher.sub(headAt).normalize()),
      supportHandGapFt:referenceHands?topPalm.distanceTo(topTarget)/view.root.scale.x:0,
      supportHandHits:supportHits.length,
      palmGapFt:at('Prop_GloveAnchor').distanceTo(lowerPalm)/view.root.scale.x,
      contactGapFt:clip==='swing_contact'&&aim!==null&&frame===clipSpec(clip).marker.frame?tip.distanceTo(dir.battingPose.contact):null,
      wristBendsDeg:wristBends,wristTwistsDeg:wristTwists,armStepsDeg:armSteps,shaftHits:hits.length});
    }
   }
   s.scene.remove(view.root);dir.dispose();view.dispose();
  }
  return {diagnostic:'Delivered models, production director, actual mirrored gameplay scene. Every authored frame of six batting clips, 120Hz for reference hands; 1.6/2.4/3.1ft targets plus the review default for the swings. Palm anchors and shaft centreline intersections are diagnostics, not finger contact or visual approval.',results};
 },only);
 if(sourceDigest(root)!==hash)throw Error('Source changed during audit; rerun.');
 data.sourceHash=hash;data.capturedAt=new Date().toISOString();
 if(errors.length)throw Error(errors.join('\n'));
 writeFileSync(`${out}/probe.json`,JSON.stringify(data,null,2));
 // All thirty reference rigs produce more values than a JS argument list can hold.
 const max=values=>values.reduce((largest,value)=>Math.max(largest,value),0);
 // A shut top elbow at contact passed every palm, wrist and step gate: all 30
 // kids shipped 58-69 degrees at the review default and 29-65 at 3.1ft. The
 // high pitch keeps a lower floor; met there the elbow rises with the hands.
 const shutElbow=r=>r.markerElbows&&r.markerElbows.top.deg<(r.aim===3.1?65:80);
 // Floors set between this pose and the pre-#257 one (hips 0.57ft down, knees
 // 0.41ft caved and crossed at every height, a head at -0.37).
 // The lead arm at contact: an elbow tucked across the chest with the forearm
 // hanging vertical to the knob read as a stub (0.19 and 33 degrees at best on
 // the square grip). Seated, the lead arm reaches differently and is exempt.
 // Level with the shoulder, the lead upper arm points out of its front: a
 // short sleeve seen end-on reads as a ball (it sat 0.04ft above on #259).
 // A letters-high ball may carry it level with the shoulder, never above. A low
 // one may not: Big Lou's sat 0.007ft below at 1.6ft, an arm pointing straight
 // out of the shoulder while the trunk leans to the ball (fails on 4ed5ca0).
 const wingedLead=r=>r.markerElbows&&!r.seated&&(r.markerElbows.lead.out<.3||r.markerElbows.lead.foreFromVerticalDeg<25
  ||r.markerElbows.lead.dropFt<(r.aim===3.1?0:.05));
 // ★ THE HELD BUNT KEEPS ITS KNOB ELBOW IN. Turned 55 degrees, the held knob
 // elbow sat at 2.06x its shoulder's distance from the chest's midline on every
 // standing kid: a chicken wing from PITCH. Squared and scheduled it is 0.17 at
 // worst. Seated, Zoom keeps the old bunt (see SEATED_BUNT_GRIP) and is exempt.
 const wingedBunt=r=>r.buntLeadOut!==null&&!r.seated&&r.buntLeadOut>.6;
 // At ready, at most 8% of the lead arm's vertices inside the torso (bind pose
 // reads 0-4%: the shoulder seam). On 603da62 Big Lou, Tank, Nostrike, Grizz,
 // Boomer and Moose read 0.11-0.28. Big Lou is the widest kid and one arm rests
 // into his belly whichever way the hands go (0.11, both arms): his cap may only
 // shrink. Measured on the lead arm, the one that crosses the chest.
 const READY_LEAD_INSIDE=.08,READY_LEAD_INSIDE_CAP={big_lou:.13};
 const sunkLead=r=>r.readyLeadInside!==null&&r.readyLeadInside>(READY_LEAD_INSIDE_CAP[r.id]??READY_LEAD_INSIDE);
 const slumped=r=>r.hipDropFt>.45||r.valgusFt>.1||(r.kneeOrder!==null&&r.kneeOrder<.1)||(r.neckRatio!==null&&r.neckRatio<.6);
 const bad=data.results.filter(r=>sunkLead(r)||wingedLead(r)||wingedBunt(r)||slumped(r)||r.palmTorsoClearFt<0||shutElbow(r)||r.headTowardPitcher<0||r.supportHandGapFt>.02||r.palmGapFt>.02||r.contactGapFt>.1||r.wristBendsDeg.some(bend=>bend>40)||r.wristTwistsDeg.some(twist=>twist>25)||r.armStepsDeg.some(step=>step>25));
 // ★ THE GATES HOLD 3 DEGREES OF MARGIN (the 120% bar, docs/research/
 // backyard-2026-reference.md). A pose at 24.2 degrees per quarter-frame passes
 // a 25-degree gate and fails the next model delivery. Arm steps stop at 22 and
 // wrist folds at 37; the 25/40 lines above stay the mechanical definition.
 // Broken once on 4ed5ca0: Sprout's lead forearm stepped 24.2 at the 3.1ft
 // contact frame and Zoom's lead wrist folded 38.3 at 1.6ft.
 const ARM_STEP_MARGIN_DEG=22,WRIST_BEND_MARGIN_DEG=37;
 const thin=data.results.filter(r=>!bad.includes(r)&&(r.armStepsDeg.some(step=>step>ARM_STEP_MARGIN_DEG)||r.wristBendsDeg.some(bend=>bend>WRIST_BEND_MARGIN_DEG)));
 const intersections=data.results.filter(r=>r.shaftHits>0);
 // Every kid's whiff finish must show most of the bat to the PITCH camera.
 // Broken once on the lead-side wrap: no kid reached half (Bubbles, Diva and
 // Grizz showed none of it, the best 0.49). The raised finish shows 0.87-0.96.
 const WHIFF_FINISH_VISIBLE=.8;
 const finishVisibility=Object.entries(data.results.filter(r=>r.pitchBatVisible!==null).reduce((by,r)=>((by[r.id]??=[]).push(r.pitchBatVisible),by),{}))
  .map(([id,v])=>({id,visible:v.reduce((a,b)=>a+b,0)/v.length}));
 const hiddenFinish=finishVisibility.filter(k=>k.visible<WHIFF_FINISH_VISIBLE);
 const sunk=data.results.filter(sunkLead);
 if(sunk.length)console.error(`${sunk.length} ready samples sink the lead arm into the torso (${[...new Set(sunk.map(r=>r.id))].join(', ')}). Move the ready hands clear in battingPose.ts (WIDE_READY_SHIFT, torsoGirth); do not raise this line.`);
 if(hiddenFinish.length)console.error(`${hiddenFinish.length} kids finish a whiff with the bat mostly hidden from PITCH (below ${WHIFF_FINISH_VISIBLE}). Move the finish into view in battingPose.ts (FINISH_AXIS, FINISH_RISE); do not lower this line.`);
 const min=values=>values.reduce((least,value)=>Math.min(least,value),Infinity);
 const aims=[...new Set(data.results.map(r=>r.aim))];
 const markerElbows=Object.fromEntries(aims.map(aim=>{
  const at=data.results.filter(r=>r.aim===aim&&r.markerElbows);
  const steps=data.results.filter(r=>r.aim===aim&&r.clip.startsWith('swing_')).flatMap(r=>r.armStepsDeg);
  return [String(aim??'review'),at.length?{topDegMin:min(at.map(r=>r.markerElbows.top.deg)),topDegMax:max(at.map(r=>r.markerElbows.top.deg)),topDropFtMin:min(at.map(r=>r.markerElbows.top.dropFt)),leadDegMin:min(at.map(r=>r.markerElbows.lead.deg)),maxSwingArmStepDeg:max(steps)}:null];
 }));
 const bones=['RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand'];
 const marginFailures=thin.slice(0,20).map(r=>({id:r.id,clip:r.clip,aim:r.aim,frame:r.frame,
  steps:r.armStepsDeg.map((step,i)=>step>ARM_STEP_MARGIN_DEG?`${bones[i]} ${step.toFixed(1)}`:null).filter(Boolean),
  wrists:r.wristBendsDeg.map((bend,i)=>bend>WRIST_BEND_MARGIN_DEG?`${i?'Left':'Right'}Hand ${bend.toFixed(1)}`:null).filter(Boolean)}));
 if(thin.length)console.error(`${thin.length} samples inside the 3-degree margin (arm step > ${ARM_STEP_MARGIN_DEG}, wrist fold > ${WRIST_BEND_MARGIN_DEG}). Fix the pose in battingPose.ts; do not relax these lines — they are the approved bar.`);
 console.log(JSON.stringify({samples:data.results.length,mechanicalFailures:bad.length,marginFailureCount:thin.length,marginFailures,minWhiffFinishVisible:finishVisibility.reduce((m,k)=>Math.min(m,k.visible),1),hiddenFinish,shaftIntersectionCandidates:intersections.length,affected:[...new Set(intersections.map(r=>r.id))],markerElbows,maxArmStepDeg:max(data.results.flatMap(r=>r.armStepsDeg)),maxWristTwistDeg:max(data.results.flatMap(r=>r.wristTwistsDeg)),maxWristBendDeg:max(data.results.flatMap(r=>r.wristBendsDeg)),maxPalmGapFt:max(data.results.map(r=>r.palmGapFt)),maxHipDropFt:max(data.results.map(r=>r.hipDropFt??0)),maxValgusFt:max(data.results.map(r=>r.valgusFt??0)),minKneeOrder:min(data.results.filter(r=>r.kneeOrder!==null).map(r=>r.kneeOrder)),minNeckRatio:min(data.results.filter(r=>r.neckRatio!==null).map(r=>r.neckRatio)),maxReadyLeadInside:max(data.results.map(r=>r.readyLeadInside??0)),minPalmTorsoClearFt:min(data.results.filter(r=>r.palmTorsoClearFt!==null).map(r=>r.palmTorsoClearFt)),failures:bad.slice(0,20)},null,2));
 if(process.argv.includes('--check')&&(bad.length||thin.length||hiddenFinish.length||intersections.length))process.exitCode=1;
}finally{await browser?.close();server.kill();}
