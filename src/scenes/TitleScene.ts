// ---------------------------------------------------------------------------
// The front door. Branded logo lockup, bunting, a bobbing mascot lineup on a
// grassy strip, and one giant PLAY button. Hosts dev overlays (D / G).
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { makeButton } from '../ui/Button';
import { makeMuteButton } from '../ui/MuteButton';
import { heading, ribbon, FONT, OUTLINE } from '../ui/theme';
import { idleBob } from '../ui/anim';
import { mountPickRateOverlay } from '../dev/PickRateOverlay';
import { mountArtGallery } from '../dev/ArtGallery';
import * as audio from '../systems/audio';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;

    // Sky gradient + grass band.
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x6cc0f5, 0x6cc0f5, 0xc7ecff, 0xc7ecff, 1);
    sky.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.add.circle(824, 120, 60, 0xfff2b0, 0.5);
    this.add.circle(824, 120, 40, 0xffe066, 1);
    this.add.rectangle(cx, GAME_HEIGHT - 70, GAME_WIDTH, 200, COLORS.grass).setOrigin(0.5);
    this.add.rectangle(cx, GAME_HEIGHT - 168, GAME_WIDTH, 8, 0x4aa84a).setOrigin(0.5);

    // Festive bunting across the top.
    const bunt = [COLORS.red, 0xffffff, 0x3f86e0, COLORS.gold];
    for (let x = 24; x < GAME_WIDTH; x += 56) {
      this.add
        .triangle(x, 0, 0, 0, 40, 0, 20, 26, bunt[(x / 56) % bunt.length])
        .setOrigin(0.5, 0)
        .setStrokeStyle(3, OUTLINE)
        .setAlpha(0.95);
    }

    // Logo lockup.
    heading(this, cx, 132, 'RECESS', 96).setShadow(0, 6, '#14202e', 0, true, true);
    heading(this, cx, 218, 'SPORTS', 96).setShadow(0, 6, '#14202e', 0, true, true);
    ribbon(this, cx, 290, 'Draft your team. Play ball.', {
      fill: COLORS.red,
      fontSize: 26,
      padX: 30,
    });

    // A friendly line-up of six kids near the bottom, gently bobbing.
    const showcase = ['big_lou', 'turbo', 'nostrike', 'wheelchair_ace', 'diva', 'ace_kid'];
    const spacing = GAME_WIDTH / (showcase.length + 1);
    showcase.forEach((id, i) => {
      const kid = this.add.image(spacing * (i + 1), GAME_HEIGHT - 40, id).setOrigin(0.5, 1);
      kid.setScale(138 / kid.height);
      idleBob(this, kid, { amp: 12, dur: 700 + i * 90 });
    });

    makeButton(this, {
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
        this.scene.start('Draft');
      },
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
}
