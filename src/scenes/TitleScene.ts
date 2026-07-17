// ---------------------------------------------------------------------------
// The front door. Big logo, a row of kids waving, one giant PLAY button.
// Also hosts the dev-only pick-rate overlay (press D) while developing.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { makeButton } from '../ui/Button';
import { makeMuteButton } from '../ui/MuteButton';
import { mountPickRateOverlay } from '../dev/PickRateOverlay';
import { mountArtGallery } from '../dev/ArtGallery';
import * as audio from '../systems/audio';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;

    // Grassy ground strip.
    this.add.rectangle(cx, GAME_HEIGHT - 90, GAME_WIDTH, 180, COLORS.grass).setOrigin(0.5);

    // Logo
    this.add
      .text(cx, 120, 'RECESS SPORTS', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '84px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setStroke('#14202e', 12)
      .setShadow(0, 6, '#14202e', 0, true, true);

    this.add
      .text(cx, 190, 'Draft your team. Play ball.', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '28px',
        color: '#14202e',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // A friendly line-up of six kids near the bottom, gently bobbing.
    const showcase = ['big_lou', 'turbo', 'nostrike', 'wheelchair_ace', 'diva', 'ace_kid'];
    const spacing = GAME_WIDTH / (showcase.length + 1);
    showcase.forEach((id, i) => {
      const kid = this.add.image(spacing * (i + 1), GAME_HEIGHT - 150, id).setOrigin(0.5, 1);
      kid.setScale(150 / kid.height);
      this.tweens.add({
        targets: kid,
        y: kid.y - 12,
        duration: 700 + i * 90,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    });

    makeButton(this, {
      x: cx,
      y: 320,
      label: 'PLAY',
      icon: '⚾',
      width: 320,
      height: 110,
      onClick: () => {
        // First user gesture — unlock audio for the whole session.
        audio.unlock();
        audio.pop();
        this.scene.start('Draft');
      },
    });

    makeMuteButton(this, GAME_WIDTH - 40, 40);

    // Dev-only: press D to inspect the "voting machine" tallies.
    if (import.meta.env.DEV) {
      this.add
        .text(GAME_WIDTH - 12, GAME_HEIGHT - 8, 'dev: D = pick rates · G = art gallery', {
          fontFamily: 'monospace',
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
