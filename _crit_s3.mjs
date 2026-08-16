import sharp from 'sharp';
const D='docs/v2/concepts/';
async function load(f){const {data,info}=await sharp(D+f).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {data,w:info.width,h:info.height,ch:info.channels};}
const px=(im,x,y)=>{const i=(y*im.w+x)*im.ch;return [im.data[i],im.data[i+1],im.data[i+2],im.data[i+3]];};
const im=await load('tank-turnaround.png');
const bg=[239,224,206];
const isBG=p=>Math.abs(p[0]-bg[0])<16&&Math.abs(p[1]-bg[1])<16&&Math.abs(p[2]-bg[2])<16;
const cols=[];
for(let x=0;x<im.w;x++){let n=0;for(let y=0;y<im.h;y++){if(!isBG(px(im,x,y)))n++;}cols.push(n);}
const th=im.h*0.06;
let runs=[],s=null;
for(let x=0;x<im.w;x++){if(cols[x]>th){if(s===null)s=x;}else{if(s!==null){runs.push([s,x-1]);s=null;}}}
if(s!==null)runs.push([s,im.w-1]);
console.log('column runs:',JSON.stringify(runs.filter(r=>r[1]-r[0]>40)));
