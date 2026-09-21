// The draft review passed while all fingers shared one pivot and the mesh used
// the wrong palm plane. Check the DELIVERED reference, including digit volume:
// a prototype grouped tilted rings by X and collapsed them into thin lines.
// These are construction prerequisites; close-ups and full motion remain gates.
import { describe, it, expect } from 'vitest';
import { readGlb, readAccessor } from './glb.mjs';
import { checkSkeleton, makeReport } from './modelRules.mjs';
import * as spec from '../../src/v2/render/skeleton';
const path='public/v2/models/kid_calls_shot.glb';
describe('Theo reference hands',()=>{
  it('faces fingertip caps outward instead of exposing the dark outline hull',()=>{
    const g=readGlb(path);let caps=0;
    for(const m of g.json.meshes.filter(m=>m.name?.includes('LOD0')))for(const prim of m.primitives){
      const p=readAccessor(g,prim.attributes.POSITION),ix=readAccessor(g,prim.indices);
      for(let i=0;i<ix.length;i+=3){
        const v=ix.slice(i,i+3).map(j=>p.slice(j*3,j*3+3));
        for(const sign of [-1,1]){
          // End rings of all three sculpted digits; the longer side strips
          // have a proximal vertex and are intentionally excluded.
          if(!v.every(a=>sign*a[0]>1.638&&a[2]<.055&&a[2]>-.105))continue;
          const a=v[1].map((x,k)=>x-v[0][k]),b=v[2].map((x,k)=>x-v[0][k]);
          expect(sign*(a[1]*b[2]-a[2]*b[1]),'inward fingertip cap; reverse its winding').toBeGreaterThan(0);
          caps++;
        }
      }
    }
    expect(caps).toBeGreaterThanOrEqual(30);
  });
  it('ships separate fingers with volume and blended roots on both hands',()=>{
    const g=readGlb(path), names=g.json.skins[0].joints.map(i=>g.json.nodes[i].name);
    for(const side of ['Left','Right'])for(const digit of ['Index1','Middle1','Ring1']){
      const points=[],roots=[];
      for(const m of g.json.meshes.filter(m=>m.name?.includes('LOD0')))for(const prim of m.primitives){
        const a=prim.attributes,p=readAccessor(g,a.POSITION),j=readAccessor(g,a.JOINTS_0),w=readAccessor(g,a.WEIGHTS_0);
        const div=g.json.accessors[a.WEIGHTS_0].normalized?255:1;
        for(let v=0;v<p.length/3;v++){
          let finger=0,hand=0;
          for(let k=0;k<4;k++){const n=names[j[v*4+k]];if(n===side+'Hand'+digit)finger+=w[v*4+k]/div;if(n===side+'Hand')hand+=w[v*4+k]/div;}
          if(finger>.1)points.push(p.slice(v*3,v*3+3));
          if(finger>.1&&hand>.1)roots.push(v);
        }
      }
      expect(points.length,side+digit+' missing sculpted digit').toBeGreaterThan(10);
      expect(roots.length,side+digit+' rigid root will separate from palm').toBeGreaterThan(2);
      const span=axis=>Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]));
      expect(span(1),side+digit+' collapsed thickness').toBeGreaterThan(.025);
      expect(span(2),side+digit+' collapsed width').toBeGreaterThan(.025);
    }
  });
  it('keeps the 42-bone cap even when all optional names are legal',()=>{
    const g=readGlb(path);
    for(const name of spec.OPTIONAL_BONES.filter(n=>n.startsWith('Hair_')||n.startsWith('Accessory_'))){
      const i=g.json.nodes.length;g.json.nodes.push({name,translation:[0,0,0]});g.json.skins[0].joints.push(i);
    }
    const report=makeReport();checkSkeleton(g,spec,report);
    expect(report.items.some(i=>i.rule==='bones.max'&&i.severity==='fail')).toBe(true);
  });
  it('rejects a distal joint parented to the wrist instead of its finger',()=>{
    const g=readGlb(path),nodes=g.json.nodes;
    const tip=nodes.findIndex(n=>n.name==='RightHandIndex2');
    for(const n of nodes)if(n.children)n.children=n.children.filter(i=>i!==tip);
    nodes.find(n=>n.name==='RightHand').children.push(tip);
    const report=makeReport();checkSkeleton(g,spec,report);
    expect(report.items.some(i=>i.rule==='bones.fingerParent'&&i.severity==='fail')).toBe(true);
  });
});
