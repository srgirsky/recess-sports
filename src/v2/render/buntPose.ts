// Bunting has a preparation, a held receiving pose, and a recovery. Share the
// envelope so the barrel hand changes shape while it slides, not before it.
import { clipSpec, FPS } from './clips';
const ease = (value: number) => { const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t); };
export function buntAmount(timeSec: number): number {
  const frame=timeSec*FPS;
  return ease(frame/15)*(1-ease((frame-24)/(clipSpec('bunt').frames-1-24)));
}
export const BUNT_HAND_SLIDE_FT = .8;
