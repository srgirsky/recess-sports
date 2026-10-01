// Bunting has a preparation, a held receiving pose, and a recovery. Share the
// envelope so the barrel hand changes shape while it slides, not before it.
import { clipSpec, FPS } from './clips';
const ease = (value: number) => { const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t); };
/** The bunt holds its receiving pose until this frame, then recovers. */
export const BUNT_RECOVERY_FRAME = 24;
export function buntAmount(timeSec: number): number {
  const frame=timeSec*FPS;
  return ease(frame/20)*(1-ease((frame-BUNT_RECOVERY_FRAME)/(clipSpec('bunt').frames-1-BUNT_RECOVERY_FRAME)));
}
export const BUNT_HAND_SLIDE_FT = .8;
