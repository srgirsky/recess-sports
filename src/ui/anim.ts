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
      if (!img.active) {
        // The sprite died with the cycle still running — stop, don't crash.
        timer.remove();
        return;
      }
      frame = frame === 1 ? 2 : 1;
      img.setTexture(poseKey(id, frame === 1 ? 'run1' : 'run2'));
    },
  });
  return {
    stop(restoreStand = true) {
      timer.remove();
      if (restoreStand && img.active) img.setTexture(poseKey(id, 'stand'));
    },
  };
}

/**
 * One-shot reaction: swap a sprite to a reaction pose (upset/nervous/cheer),
 * hold it, then restore whatever texture it wore before. Guards on
 * `img.active` like runCycle so a sprite dying mid-hold can't crash the loop.
 * Returns a handle to cancel early (e.g. the next pitch starts sooner).
 */
export function reactPose(
  scene: Phaser.Scene,
  img: Phaser.GameObjects.Image,
  id: string,
  pose: 'upset' | 'nervous' | 'dodge' | 'cheer' | 'catch' | 'throw' | 'dive',
  opts: { holdMs?: number; restoreTo?: string } = {}
): { cancel(restore?: boolean): void } {
  if (!img.active) return { cancel() {} };
  const prev = opts.restoreTo ?? img.texture.key;
  img.setTexture(poseKey(id, pose));
  const timer = scene.time.delayedCall(opts.holdMs ?? ANIM.REACT_HOLD_MS, () => {
    if (img.active) img.setTexture(prev);
  });
  return {
    cancel(restore = true) {
      timer.remove(false);
      if (restore && img.active) img.setTexture(prev);
    },
  };
}

/**
 * One-shot multi-frame pose stepping (the swing: load → contact →
 * follow-through). Steps carry FULL texture keys so callers choose the tier
 * (poseKey vs heroKey) and variant themselves. Every callback guards on
 * `img.active` like runCycle. `cancel(false)` just clears the timers;
 * `cancel()` also re-applies `restoreTo` immediately. Presentation only —
 * never gate game state on these timers.
 */
export function poseSequence(
  scene: Phaser.Scene,
  img: Phaser.GameObjects.Image,
  steps: Array<{ key: string; atMs: number }>,
  opts: { restoreTo?: string; restoreAtMs?: number; onRestore?: () => void } = {}
): { cancel(restore?: boolean): void } {
  if (!img.active) return { cancel() {} };
  const timers = steps.map((s) =>
    scene.time.delayedCall(s.atMs, () => {
      if (img.active) img.setTexture(s.key);
    })
  );
  const { restoreTo, restoreAtMs, onRestore } = opts;
  if (restoreTo !== undefined && restoreAtMs !== undefined) {
    timers.push(
      scene.time.delayedCall(restoreAtMs, () => {
        if (!img.active) return;
        img.setTexture(restoreTo);
        onRestore?.();
      })
    );
  }
  return {
    cancel(restore = true) {
      for (const t of timers) t.remove(false);
      if (restore && restoreTo !== undefined && img.active) img.setTexture(restoreTo);
    },
  };
}

/**
 * The batter's idle tic: an occasional little bat waggle (a quick angle
 * shimmy). Returns the timer — remove it before swinging or hiding, and pair
 * with killTweensOf(target) so a mid-waggle tween can't strand an angle.
 */
export function batWaggle(
  scene: Phaser.Scene,
  target: Obj,
  opts: { everyMs?: number; amp?: number } = {}
): Phaser.Time.TimerEvent {
  return scene.time.addEvent({
    delay: opts.everyMs ?? ANIM.WAGGLE_EVERY_MS,
    loop: true,
    callback: () => {
      const t = target as unknown as { active: boolean; angle: number };
      if (!t.active) return;
      scene.tweens.add({
        targets: target,
        angle: t.angle + (opts.amp ?? ANIM.WAGGLE_AMP),
        duration: 95,
        yoyo: true,
        repeat: 3,
        ease: 'Sine.inOut',
      });
    },
  });
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
