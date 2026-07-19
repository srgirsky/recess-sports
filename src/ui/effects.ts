// ---------------------------------------------------------------------------
// Reusable visual "juice" — the little bursts, shakes, and pops that make
// actions feel satisfying. No game logic lives here; scenes call these to
// react to things that already happened.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { COLORS } from '../config';

/** Shake the camera. `intensity` is roughly pixels of movement. */
export function screenShake(scene: Phaser.Scene, intensity: number, duration = 250): void {
  if (intensity <= 0) return;
  // Phaser's shake takes a 0-1ish magnitude relative to the view size.
  scene.cameras.main.shake(duration, intensity / 900);
}

/** A quick radial spray of little squares (a contact/celebration spark). */
export function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  count = 12
): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 40 + Math.random() * 55;
    const size = 6 + Math.random() * 6;
    const p = scene.add.rectangle(x, y, size, size, color).setDepth(60);
    p.setAngle(Math.random() * 360);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      angle: p.angle + 180,
      alpha: 0,
      scale: 0.2,
      duration: 480 + Math.random() * 220,
      ease: 'Cubic.out',
      onComplete: () => p.destroy(),
    });
  }
}

/** A word that pops in, floats up, and fades — "PERFECT!", "+2 RUNS!", etc.
 *  Returns the text so screen-anchored callers can pin it to a UI camera. */
export function floatingText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: number,
  size = 34
): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, text, {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: `${size}px`,
      color: '#' + color.toString(16).padStart(6, '0'),
      fontStyle: 'bold',
      align: 'center',
    })
    .setOrigin(0.5)
    .setStroke('#14202e', 6)
    .setDepth(70)
    .setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.out' });
  scene.tweens.add({
    targets: t,
    y: y - 60,
    alpha: 0,
    delay: 520,
    duration: 420,
    ease: 'Cubic.in',
    onComplete: () => t.destroy(),
  });
  return t;
}

/** Confetti raining from the top — for wins and big moments. */
export function confetti(scene: Phaser.Scene, count = 80): void {
  const colors = [COLORS.gold, COLORS.red, 0x3a7ad9, 0x3fae6b, 0x8e57c9, COLORS.white];
  const w = scene.scale.width;
  const h = scene.scale.height;
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const size = 8 + Math.random() * 8;
    const c = scene.add
      .rectangle(x, -20 - Math.random() * 200, size, size * 0.6, colors[i % colors.length])
      .setDepth(80)
      .setAngle(Math.random() * 360);
    scene.tweens.add({
      targets: c,
      y: h + 40,
      x: x + (Math.random() - 0.5) * 160,
      angle: c.angle + (Math.random() > 0.5 ? 360 : -360),
      duration: 2200 + Math.random() * 1800,
      delay: Math.random() * 600,
      ease: 'Cubic.in',
      onComplete: () => c.destroy(),
    });
  }
}
