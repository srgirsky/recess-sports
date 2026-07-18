// ---------------------------------------------------------------------------
// Reusable character-animation helpers — small Phaser tweens that add life to
// the flat-mascot sprites (breathing, hops, entrances). No game logic here.
// Each returns the tween so callers can stop it (e.g. pause idle during a swing).
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { ANIM } from '../config';

type Obj = Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;

/** Gentle "breathing" bob loop. Sprites use origin-bottom, so we bob y up a touch. */
export function idleBob(
  scene: Phaser.Scene,
  target: Obj,
  opts: { amp?: number; dur?: number; delay?: number } = {}
): Phaser.Tweens.Tween {
  const amp = opts.amp ?? ANIM.IDLE_BOB;
  const baseY = (target as unknown as { y: number }).y;
  return scene.tweens.add({
    targets: target,
    y: baseY - amp,
    duration: opts.dur ?? 900,
    delay: opts.delay ?? 0,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.inOut',
  });
}

/** A celebratory jump with a little squash → stretch → land settle. */
export function squashHop(
  scene: Phaser.Scene,
  target: Obj,
  opts: { height?: number; baseScaleY?: number; baseScaleX?: number } = {}
): void {
  const t = target as unknown as { y: number; scaleX: number; scaleY: number };
  const height = opts.height ?? 26;
  const y0 = t.y;
  const sx = opts.baseScaleX ?? t.scaleX;
  const sy = opts.baseScaleY ?? t.scaleY;
  scene.tweens.chain({
    targets: target,
    tweens: [
      { scaleY: sy * 0.86, scaleX: sx * 1.1, duration: 80, ease: 'Quad.out' }, // anticipate
      { y: y0 - height, scaleY: sy * 1.08, scaleX: sx * 0.95, duration: 170, ease: 'Quad.out' }, // up
      { y: y0, scaleY: sy, scaleX: sx, duration: 150, ease: 'Quad.in' }, // land
      { scaleY: sy * 0.9, scaleX: sx * 1.06, duration: 70, yoyo: true, ease: 'Quad.out' }, // squish
    ],
  });
}

/** Pop in from small with a little overshoot. */
export function popIn(scene: Phaser.Scene, target: Obj, toScale: number): void {
  const t = target as unknown as { scaleX: number; scaleY: number };
  t.scaleX = toScale * 0.6;
  t.scaleY = toScale * 0.6;
  scene.tweens.add({
    targets: target,
    scaleX: toScale,
    scaleY: toScale,
    duration: 220,
    ease: 'Back.out',
  });
}
