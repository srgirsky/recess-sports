// The old orientation and wrist-distance checks passed an implausible grip.
// Sweep six batting actions on every delivered model IN the mirrored gameplay
// scene. --check rejects backward heads, detached palm anchors, missed contact
// markers and shaft centreline intersections. Passing is not visual approval:
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
let browser;
try {
 const hash=sourceDigest(root);
 browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.cancelAnimationFrame=()=>{};});
 await page.goto(`http://localhost:${port}/v2/?play=1&seed=art-benchmark&venue=park`,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__spike?.refs?.kids?.size>0);
 const data=await page.evaluate(async()=>{
  const {Vector3,Raycaster}=await import('/node_modules/three/build/three.module.js');
  const {ROSTER}=await import('/src/data/characters.ts');
  const {createCharacter}=await import('/src/v2/render/CharacterFactory.ts');
  const {battingPlacement}=await import('/src/v2/render/battingPose.ts');
  const {BAT_SWEET_SPOT_FT}=await import('/src/v2/render/props.ts');
  const {clipSpec,FPS}=await import('/src/v2/render/clips.ts');
  const {MOUND}=await import('/src/v2/sim/field.ts');
  const s=window.__spike;s.setControlMode('watch');s.devStepFixedClock(0);s.devPaint(1);
  const results=[];
  for(const c of ROSTER){
   const {view,source}=await createCharacter(c,{noProxyLevel:true});
   await s.prepareCharacterPerformance(c.id);
   const dir=s.directorFor(c,view);
   if(source!=='model')throw Error(`${c.id}: expected delivered model, got ${source}`);
   const box=battingPlacement(view.root.scale.x);
   view.setPosition(box.x,box.z);view.setFacing(box.facing);s.scene.add(view.root);
   s.scene.updateMatrixWorld(true);
   dir.battingPose.contact=s.scene.localToWorld(new Vector3(0,2.4,0));
   for(const clip of ['bat_stance','bat_load','swing_contact','swing_follow','swing_whiff','bunt']){
    for(let frame=0;frame<clipSpec(clip).frames;frame++){
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
     const hits=ray.intersectObject(view.mesh,true).filter(h=>h.object.visible);
     results.push({id:c.id,clip,frame,clipSource:dir.sourceFor(clip),
      headTowardPitcher:forward.dot(pitcher.sub(headAt).normalize()),
      palmGapFt:at('Prop_GloveAnchor').distanceTo(lowerPalm)/view.root.scale.x,
      contactGapFt:clip==='swing_contact'&&frame===clipSpec(clip).marker.frame?tip.distanceTo(dir.battingPose.contact):null,
      shaftHits:hits.length});
    }
   }
   s.scene.remove(view.root);dir.dispose();view.dispose();
  }
  return {diagnostic:'Delivered models, production director, actual mirrored gameplay scene. Every authored frame of six batting clips; fixed 2.4ft target. Palm anchors and shaft centreline intersections are diagnostics, not finger contact or visual approval.',results};
 });
 if(sourceDigest(root)!==hash)throw Error('Source changed during audit; rerun.');
 data.sourceHash=hash;data.capturedAt=new Date().toISOString();
 if(errors.length)throw Error(errors.join('\n'));
 writeFileSync(`${out}/probe.json`,JSON.stringify(data,null,2));
 const bad=data.results.filter(r=>r.headTowardPitcher<0||r.palmGapFt>.02||r.contactGapFt>.1);
 const intersections=data.results.filter(r=>r.shaftHits>0);
 console.log(JSON.stringify({samples:data.results.length,mechanicalFailures:bad.length,shaftIntersectionCandidates:intersections.length,affected:[...new Set(intersections.map(r=>r.id))],maxPalmGapFt:Math.max(...data.results.map(r=>r.palmGapFt)),failures:bad.slice(0,20)},null,2));
 if(process.argv.includes('--check')&&(bad.length||intersections.length))process.exitCode=1;
}finally{await browser?.close();server.kill();}
