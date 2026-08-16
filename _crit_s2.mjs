import sharp from 'sharp';
const D='/Users/sethgirsky/Documents/Project/Recess Sports/docs/v2/concepts/';
async function load(f){const {data,info}=await sharp(D+f).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {data,w:info.width,h:info.height,ch:info.channels};}
const px=(im,x,y)=>{const i=(y*im.w+x)*im.ch;return [im.data[i],im.data[i+1],im.data[i+2],im.data[i+3]];};
for(const f of ['tank-turnaround.png','tank-front-review.png','tank-profile-review.png','tank-front-apose-review.png','tank-profile-apose-review.png']){
  const im=await load(f);console.log(f,im.w,im.h,im.ch,'corner',px(im,2,2));
}
