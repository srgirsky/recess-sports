// ---------------------------------------------------------------------------
// Spectacle — the big-moment effects director. Home runs and juice spends
// deserve screen-filling theater, not a floatingText; this module owns those
// set pieces so GameScene just names the moment. View-only: nothing here
// touches game state or the live sim, and nothing is sim-owned (tweens are
// fine — these are chrome, not play objects).
//
// Depths: everything lives at 60-66 — above the behind-plate rig (PLATE_VIEW
// .DEPTH = 50) so spends read in the close view, below floatingText (70) and
// confetti (80) so words still top the fireworks.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { COLORS, FX, GAME_WIDTH, GAME_HEIGHT } from '../../config';
import { burst, confetti } from '../../ui/effects';

/** A full-screen color wash that flashes and fades — the "something BIG" cue. */
function wash(scene: Phaser.Scene, color: number, alpha: number): void {
  const w = scene.add
    .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, color, alpha)
    .setDepth(63);
  scene.tweens.add({ targets: w, alpha: 0, duration: 450, ease: 'Quad.out', onComplete: () => w.destroy() });
}

/** Sun-rays exploding out of a point (the power-up "charged" burst). */
function rays(scene: Phaser.Scene, cx: number, cy: number, color: number): void {
  for (let i = 0; i < 10; i++) {
    const r = scene.add
      .rectangle(cx, cy, 240, 9, color, 0.55)
      .setDepth(64)
      .setOrigin(0, 0.5)
      .setRotation((Math.PI * 2 * i) / 10 + Math.random() * 0.2);
    scene.tweens.add({
      targets: r,
      scaleX: 1.9,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.out',
      onComplete: () => r.destroy(),
    });
  }
}

/** Staggered firework shells: a ring shockwave + a colored spray each. */
function fireworks(scene: Phaser.Scene, x: number, y: number): void {
  const shells = [COLORS.gold, 0xe8524a, 0x4aa5e0];
  shells.forEach((color, i) => {
    scene.time.delayedCall(i * 170, () => {
      const px = x + (i - 1) * 95 + (Math.random() - 0.5) * 40;
      const py = y - 8 + (Math.random() - 0.5) * 50;
      burst(scene, px, py, color, 18);
      const ring = scene.add.circle(px, py, 9).setStrokeStyle(4, color, 0.9).setDepth(61);
      scene.tweens.add({
        targets: ring,
        scale: 6,
        alpha: 0,
        duration: 520,
        ease: 'Quad.out',
        onComplete: () => ring.destroy(),
      });
    });
  });
}

/** Camera flashbulbs popping in the stands band while the crowd goes nuts. */
function flashbulbs(scene: Phaser.Scene, count: number): void {
  for (let i = 0; i < count; i++) {
    scene.time.delayedCall(Math.random() * 1200, () => {
      const s = scene.add
        .circle(Math.random() * GAME_WIDTH, 40 + Math.random() * 130, 3, 0xffffff, 1)
        .setDepth(60);
      scene.tweens.add({
        targets: s,
        scale: { from: 0.5, to: 2.4 },
        alpha: 0,
        duration: 260,
        onComplete: () => s.destroy(),
      });
    });
  }
}

/**
 * The home-run show, played on the WIDE field: a gold star-trailed ball soars
 * from the plate over the fence, fireworks pop where it cleared, flashbulbs
 * twinkle in the stands, confetti rains. The caller cuts to the wide view
 * first and keeps owning the banner/announcer/score beats.
 */
export function homerSpectacle(
  scene: Phaser.Scene,
  from: { x: number; y: number },
  dest: { x: number; y: number }
): void {
  const H = FX.HOMER;
  const ball = scene.add
    .circle(from.x, from.y, 12, COLORS.gold)
    .setStrokeStyle(3, COLORS.white)
    .setDepth(62);
  const trail = scene.time.addEvent({
    delay: H.TRAIL_EVERY_MS,
    loop: true,
    callback: () => {
      if (!ball.active) return;
      const star = scene.add.star(ball.x, ball.y, 5, 3.5, 8, COLORS.gold, 0.9).setDepth(61);
      scene.tweens.add({
        targets: star,
        alpha: 0,
        scale: 0.3,
        angle: 140,
        duration: 420,
        onComplete: () => star.destroy(),
      });
    },
  });
  scene.tweens.add({
    targets: ball,
    x: dest.x,
    y: dest.y,
    scale: 0.45,
    duration: H.FLIGHT_MS,
    ease: 'Sine.out',
    onComplete: () => {
      trail.remove();
      ball.destroy();
      // Shells go up right about where it left the yard.
      fireworks(scene, dest.x, Math.max(dest.y, 120));
    },
  });
  flashbulbs(scene, H.FLASHBULBS);
  confetti(scene, H.CONFETTI);
}

/** Arming the 💥 power swing: gold wash + sun-ray burst + a swelling ring. */
export function powerSwingFx(scene: Phaser.Scene, cx: number, cy: number, color = COLORS.gold): void {
  wash(scene, color, 0.22);
  rays(scene, cx, cy, color);
  const ring = scene.add.circle(cx, cy, 20).setStrokeStyle(6, color, 0.9).setDepth(64);
  scene.tweens.add({
    targets: ring,
    scale: 5,
    alpha: 0,
    duration: 430,
    ease: 'Quad.out',
    onComplete: () => ring.destroy(),
  });
}

/** The ⚡ crazy pitch: electric purple wash + crackling bolts off the mound. */
export function crazyPitchFx(scene: Phaser.Scene, cx: number, cy: number): void {
  wash(scene, 0x8e57c9, 0.2);
  for (let i = 0; i < 5; i++) {
    scene.time.delayedCall(i * 70, () => {
      const g = scene.add.graphics().setDepth(64);
      g.lineStyle(4, i % 2 ? COLORS.gold : 0xd9c2ff, 1);
      let x = cx + (Math.random() - 0.5) * 120;
      let y = cy - 70;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (Math.random() - 0.5) * 44;
        y += 26;
        g.lineTo(x, y);
      }
      g.strokePath();
      scene.tweens.add({ targets: g, alpha: 0, duration: 240, onComplete: () => g.destroy() });
    });
  }
}
