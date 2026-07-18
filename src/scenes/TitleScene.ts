// ---------------------------------------------------------------------------
// The front door. Branded logo lockup, bunting, a bobbing mascot lineup on a
// grassy strip, and one giant PLAY button — all choreographed: bunting drops
// in, the logo slams down, the kids RUN in from the sides, and PLAY pulses.
// Ambient life keeps it moving (drifting clouds, random kid hops).
// Hosts dev overlays (D / G).
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, ANIM } from '../config';
import { makeButton } from '../ui/Button';
import { makeMuteButton } from '../ui/MuteButton';
import { heading, ribbon, FONT, OUTLINE } from '../ui/theme';
import { idleBob, runIn, pulse, enterFrom, squashHop } from '../ui/anim';
import { screenShake } from '../ui/effects';
import { mountPickRateOverlay } from '../dev/PickRateOverlay';
import { mountArtGallery } from '../dev/ArtGallery';
import * as audio from '../systems/audio';

export class TitleScene extends Phaser.Scene {
  private showcaseKids: Phaser.GameObjects.Image[] = [];
  private kidIdles = new Map<Phaser.GameObjects.Image, Phaser.Tweens.Tween>();

  constructor() {
    super('Title');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    this.showcaseKids = [];
    this.kidIdles.clear();
    this.cameras.main.fadeIn(250, 0x6c, 0xc0, 0xf5);

    // Sky gradient + grass band (static backdrop).
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x6cc0f5, 0x6cc0f5, 0xc7ecff, 0xc7ecff, 1);
    sky.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    const sunGlow = this.add.circle(824, 120, 60, 0xfff2b0, 0.5);
    this.add.circle(824, 120, 40, 0xffe066, 1);
    this.tweens.add({ targets: sunGlow, scale: 1.18, alpha: 0.32, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.driftCloud(140, 100, 0.9, 42000);
    this.driftCloud(520, 70, 0.7, 56000);
    this.driftCloud(760, 170, 0.55, 48000);
    this.add.rectangle(cx, GAME_HEIGHT - 70, GAME_WIDTH, 200, COLORS.grass).setOrigin(0.5);
    this.add.rectangle(cx, GAME_HEIGHT - 168, GAME_WIDTH, 8, 0x4aa84a).setOrigin(0.5);

    // Festive bunting drops in from above, left to right. Drawn with Graphics —
    // Phaser Triangle shapes misplace their fill, so pennants are hand-drawn.
    const bunt = [COLORS.red, 0xffffff, 0x3f86e0, COLORS.gold];
    for (let x = 24; x < GAME_WIDTH; x += 56) {
      const pennant = this.add.graphics({ x, y: 0 }).setAlpha(0.95);
      pennant.fillStyle(bunt[Math.floor(x / 56) % bunt.length], 1);
      pennant.fillTriangle(-20, 0, 20, 0, 0, 26);
      pennant.lineStyle(3, OUTLINE, 1);
      pennant.strokeTriangle(-20, 0, 20, 0, 0, 26);
      enterFrom(this, pennant, { dy: -44, delay: (x / 56) * 16, dur: 340, ease: 'Bounce.out' });
    }

    // Logo lockup: two lines SLAM in (big -> settle), then the tagline pops.
    const line1 = heading(this, cx, 132, 'RECESS', 96).setShadow(0, 6, '#14202e', 0, true, true);
    const line2 = heading(this, cx, 218, 'SPORTS', 96).setShadow(0, 6, '#14202e', 0, true, true);
    this.slamIn(line1, 120, () => screenShake(this, 3, 120));
    this.slamIn(line2, 320, () => screenShake(this, 4, 140));
    const tag = ribbon(this, cx, 290, 'Draft your team. Play ball.', {
      fill: COLORS.red,
      fontSize: 26,
      padX: 30,
    });
    tag.setScale(0);
    this.tweens.add({ targets: tag, scale: 1, delay: 560, duration: 260, ease: 'Back.out' });

    // The kids RUN in from alternating sides onto the grass, then idle-bob.
    const showcase = ['big_lou', 'turbo', 'nostrike', 'wheelchair_ace', 'diva', 'ace_kid'];
    const spacing = GAME_WIDTH / (showcase.length + 1);
    showcase.forEach((id, i) => {
      const kid = this.add.image(spacing * (i + 1), GAME_HEIGHT - 40, id).setOrigin(0.5, 1);
      kid.setScale(138 / kid.height);
      this.showcaseKids.push(kid);
      const fromLeft = i % 2 === 0;
      runIn(this, kid, {
        fromX: fromLeft ? -80 : GAME_WIDTH + 80,
        delay: 260 + i * ANIM.TITLE_KID_STAGGER_MS,
        onArrive: () => {
          this.kidIdles.set(kid, idleBob(this, kid, { amp: 12, dur: 700 + i * 90 }));
        },
      });
    });

    // Every so often a random kid does a happy hop — the screen never sits still.
    this.time.addEvent({
      delay: ANIM.AMBIENT_HOP_EVERY_MS,
      loop: true,
      callback: () => this.ambientHop(),
    });

    // PLAY pops in early (fast to start!) and pulses so it's unmissable.
    const play = makeButton(this, {
      x: cx,
      y: 380,
      label: 'PLAY',
      icon: '⚾',
      width: 320,
      height: 110,
      color: COLORS.gold,
      onClick: () => {
        audio.unlock();
        audio.pop();
        this.cameras.main.fadeOut(220, 0x6c, 0xc0, 0xf5);
        this.time.delayedCall(240, () => this.scene.start('Draft'));
      },
    });
    play.setScale(0);
    this.tweens.add({
      targets: play,
      scale: 1,
      delay: 620,
      duration: 280,
      ease: 'Back.out',
      onComplete: () => pulse(this, play, { scale: 1.045, dur: 520 }),
    });

    makeMuteButton(this, GAME_WIDTH - 40, 44);

    // Dev-only overlays.
    if (import.meta.env.DEV) {
      this.add
        .text(GAME_WIDTH - 12, GAME_HEIGHT - 8, 'dev: D = pick rates · G = art gallery', {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#14202e',
        })
        .setOrigin(1, 1)
        .setAlpha(0.5);
      mountPickRateOverlay(this);
      mountArtGallery(this);
    }
  }

  /** Logo line: drop from huge + transparent to full size with a thump. */
  private slamIn(target: Phaser.GameObjects.Text, delay: number, onLand?: () => void): void {
    target.setScale(2.4).setAlpha(0);
    this.tweens.add({
      targets: target,
      scale: 1,
      alpha: 1,
      delay,
      duration: 240,
      ease: 'Quad.in',
      onComplete: () => {
        onLand?.();
        // A tiny settle bounce after the slam.
        this.tweens.add({ targets: target, scale: { from: 0.94, to: 1 }, duration: 140, ease: 'Back.out' });
      },
    });
  }

  /** A soft two-lobe cloud that drifts across the sky forever. */
  private driftCloud(x: number, y: number, scale: number, loopMs: number): void {
    const c = this.add.container(x, y).setScale(scale).setAlpha(0.9);
    c.add(this.add.circle(0, 0, 20, 0xffffff));
    c.add(this.add.circle(24, 4, 26, 0xffffff));
    c.add(this.add.circle(52, 0, 18, 0xffffff));
    c.add(this.add.ellipse(26, 14, 80, 24, 0xffffff));
    // Drift right, wrap around to the left, forever. Duration scales with the
    // remaining distance so the speed stays constant across the wrap.
    const drift = () => {
      const dist = GAME_WIDTH + 120 - c.x;
      this.tweens.add({
        targets: c,
        x: GAME_WIDTH + 120,
        duration: (dist / (GAME_WIDTH + 240)) * loopMs,
        ease: 'Linear',
        onComplete: () => {
          c.x = -120;
          drift();
        },
      });
    };
    drift();
  }

  /** Pick a random arrived kid and give it a joyful hop (pausing its idle bob). */
  private ambientHop(): void {
    if (this.showcaseKids.length === 0) return;
    const kid = this.showcaseKids[Math.floor(Math.random() * this.showcaseKids.length)];
    const idle = this.kidIdles.get(kid);
    if (!idle) return; // still running in
    idle.stop();
    this.kidIdles.delete(kid);
    kid.y = GAME_HEIGHT - 40; // reset from wherever the bob left it
    squashHop(this, kid, {
      height: 30,
      onDone: () => {
        this.kidIdles.set(kid, idleBob(this, kid, { amp: 12, dur: 750 }));
      },
    });
  }
}
