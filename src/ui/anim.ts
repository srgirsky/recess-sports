// ---------------------------------------------------------------------------
// Reusable character-animation helpers — small Phaser tweens that add life to
// the flat-mascot sprites (breathing, hops, entrances). No game logic here.
// Each returns the tween so callers can stop it (e.g. pause idle during a swing).
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { ANIM } from '../config';
import { poseKey } from '../art/textureFactory';

type Obj = Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;

/**
 * A soft ground shadow under a character. Kept as a separate runtime object
 * (not baked into the SVG) so it stays put during hops and run frames.
 */
export function groundShadow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number
): Phaser.GameObjects.Ellipse {
  return scene.add.ellipse(x, y, width, width * 0.28, 0x26333f, 0.18);
}

/**
 * Flip a sprite between its run1/run2 pose textures — the two-frame run cycle.
 * Textures share dimensions, so the sprite's scale stays valid.
 * `stop(true)` restores the stand texture.
 */
export function runCycle(
  scene: Phaser.Scene,
  img: Phaser.GameObjects.Image,
  id: string,
  opts: { frameMs?: number } = {}
): { stop(restoreStand?: boolean): void } {
  let frame: 1 | 2 = 1;
  img.setTexture(poseKey(id, 'run1'));
  const timer = scene.time.addEvent({
    delay: opts.frameMs ?? ANIM.RUN_FRAME_MS,
    loop: true,
    callback: () => {
      frame = frame === 1 ? 2 : 1;
      img.setTexture(poseKey(id, frame === 1 ? 'run1' : 'run2'));
    },
  });
  return {
    stop(restoreStand = true) {
      timer.remove();
      if (restoreStand && img.active) img.setTexture(id);
    },
  };
}

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
  opts: { height?: number; baseScaleY?: number; baseScaleX?: number; onDone?: () => void } = {}
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
    onComplete: opts.onDone,
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

/**
 * Entrance: the target is already at its final spot — offset it by (dx, dy)
 * and tween it home with a little overshoot. Great for staggered UI reveals.
 */
export function enterFrom(
  scene: Phaser.Scene,
  target: Obj,
  opts: { dx?: number; dy?: number; delay?: number; dur?: number; ease?: string; fade?: boolean } = {}
): Phaser.Tweens.Tween {
  const t = target as unknown as { x: number; y: number; alpha: number };
  const toX = t.x;
  const toY = t.y;
  t.x = toX + (opts.dx ?? 0);
  t.y = toY + (opts.dy ?? 0);
  const fromAlpha = t.alpha;
  if (opts.fade !== false) t.alpha = 0;
  return scene.tweens.add({
    targets: target,
    x: toX,
    y: toY,
    alpha: fromAlpha,
    delay: opts.delay ?? 0,
    duration: opts.dur ?? 320,
    ease: opts.ease ?? 'Back.out',
  });
}

/** Looping "look at me" pulse for the one thing we want a kid to press next. */
export function pulse(
  scene: Phaser.Scene,
  target: Obj,
  opts: { scale?: number; dur?: number } = {}
): Phaser.Tweens.Tween {
  const t = target as unknown as { scaleX: number; scaleY: number };
  return scene.tweens.add({
    targets: target,
    scaleX: t.scaleX * (opts.scale ?? 1.05),
    scaleY: t.scaleY * (opts.scale ?? 1.05),
    duration: opts.dur ?? 460,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.inOut',
  });
}

/**
 * A kid runs in from off-screen to their current spot: horizontal dash with a
 * run-bob and a lean, then a happy landing squash. Calls `onArrive` (e.g. to
 * start an idle bob) after the landing.
 */
export function runIn(
  scene: Phaser.Scene,
  target: Obj,
  opts: { fromX: number; delay?: number; dur?: number; onArrive?: () => void } = { fromX: -80 }
): void {
  const t = target as unknown as { x: number; y: number; angle: number; alpha: number };
  const toX = t.x;
  const baseY = t.y;
  t.x = opts.fromX;
  t.alpha = 0;
  const lean = opts.fromX < toX ? 7 : -7; // lean into the direction of travel
  const dur = opts.dur ?? ANIM.TITLE_KID_RUN_MS;

  // Run-bob while traveling (stopped on arrival).
  const bob = scene.tweens.add({
    targets: target,
    y: baseY - ANIM.RUN_BOB,
    duration: 90,
    delay: opts.delay ?? 0,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.inOut',
  });
  scene.tweens.add({
    targets: target,
    x: toX,
    alpha: 1,
    angle: lean,
    delay: opts.delay ?? 0,
    duration: dur,
    ease: 'Sine.out',
    onComplete: () => {
      bob.stop();
      t.y = baseY;
      scene.tweens.add({ targets: target, angle: 0, duration: 120, ease: 'Sine.out' });
      squashHop(scene, target, { height: 14 });
      opts.onArrive?.();
    },
  });
}
