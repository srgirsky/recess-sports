// Batting orientation diagnostic, not visual approval. The benchmark's batter
// faced the catcher while prop-existence and generic hand-distance tests passed.
// Sweep delivered roster takes through the production factory/director and use
// the live bridge's actual plate transform. Head +Z is a direction proxy; hand
// bones cannot establish finger contact. --check reports the known backward-
// facing defect without waiving it or claiming other poses have been reviewed.
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
 browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.cancelAnimationFrame=()=>{};});
 await page.goto(`http://localhost:${port}/v2/?play=1&seed=art-benchmark&venue=park`,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__spike?.refs?.kids?.size>0);
 const data=await page.evaluate(async()=>{
  const {Vector3}=await import('/node_modules/three/build/three.module.js');
  const {ROSTER}=await import('/src/data/characters.ts');
  const {createCharacter}=await import('/src/v2/render/CharacterFactory.ts');
  const s=window.__spike;s.setControlMode('watch');s.devStepFixedClock(0);s.devPaint(1);
  const frame=s.scoreboard();const actual=s.refs.kids.get(frame.batterId).root;
  const placement={x:actual.position.x,z:actual.position.z,yaw:actual.rotation.y};const results=[];
  for(const c of ROSTER){
   const {view,source}=await createCharacter(c);
   await s.prepareCharacterPerformance(c.id);
   const dir=s.directorFor(c,view);
   if(source!=='model')throw Error(`${c.id}: expected delivered model, got ${source}`);
   view.setPosition(placement.x,placement.z);view.setFacing(placement.yaw);
   for(const time of [0,.5,1]){
    dir.seek('bat_stance',time);view.root.updateMatrixWorld(true);
    const bone=n=>view.bones.find(b=>b.name===n);
    const at=n=>bone(n).getWorldPosition(new Vector3());
    const head=bone('Head');const headAt=at('Head');
    const forward=head.localToWorld(new Vector3(0,0,1)).sub(headAt).normalize();
    const {MOUND}=await import('/src/v2/sim/field.ts');
    const pitcher=new Vector3(MOUND.x,headAt.y,MOUND.z).sub(headAt).normalize();
    const lh=at('LeftHand'),rh=at('RightHand'),grip=at('Prop_BatGrip');
    const anchor=bone('Prop_BatGrip');const axis=anchor.localToWorld(new Vector3(0,1,0)).sub(grip).normalize();
    const offset=lh.clone().sub(grip);const along=offset.dot(axis);
    const radial=offset.clone().addScaledVector(axis,-along).length();
    results.push({id:c.id,name:c.name,source,clipSource:dir.sourceFor('bat_stance'),time,headTowardPitcher:forward.dot(pitcher),headForward:forward.toArray(),handsDistanceWorldFt:lh.distanceTo(rh),offHandToBatAxisWorldFt:radial,offHandAlongBatWorldFt:along});
   }
   dir.dispose();view.dispose();
  }
  return {placement,actualBatter:frame.batterId,diagnostic:'Delivered models and GameView directorFor; bat_stance sampled at 0, 0.5 and 1 seconds. Head local +Z direction is an orientation proxy, not eye tracking. Hand bones do not establish finger contact.',results};
 });
 data.sourceHash=sourceDigest(root);data.capturedAt=new Date().toISOString();
 if(errors.length)throw Error(errors.join('\n'));
 writeFileSync(`${out}/probe.json`,JSON.stringify(data,null,2));
 console.log(JSON.stringify({samples:data.results.length,models:[...new Set(data.results.map(r=>r.source))],allAway:data.results.every(r=>r.headTowardPitcher<0),range:[Math.min(...data.results.map(r=>r.headTowardPitcher)),Math.max(...data.results.map(r=>r.headTowardPitcher))],junebug:data.results.filter(r=>r.id==='nostrike')},null,2));
 if(process.argv.includes('--check')&&data.results.some(r=>r.headTowardPitcher<0))process.exitCode=1;
}finally{await browser?.close();server.kill();}
