// ---------------------------------------------------------------------------
// Pause overlay. Launched on top of a paused GameScene (which keeps rendering
// but stops updating), so the frozen field shows through the scrim. This scene
// exclusively owns resume input while the game is frozen.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { makeButton } from '../ui/Button';
import { makeMuteButton } from '../ui/MuteButton';
import { heading, panel } from '../ui/theme';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Scrim: dims the frozen field and eats stray taps. Deliberately does NOT
    // resume on tap — the big PLAY button is the kid-safe way back.
    this.add
      .rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, COLORS.ink, 0.55)
      .setInteractive();

    panel(this, cx, cy, 420, 400);
    heading(this, cx, cy - 132, '⏸ PAUSED', 48);

    makeButton(this, {
      x: cx,
      y: cy - 20,
      label: 'PLAY',
      icon: '▶️',
      width: 320,
      height: 96,
      onClick: () => this.resumeGame(),
    });
    makeButton(this, {
      x: cx,
      y: cy + 105,
      label: 'HOME',
      icon: '🏠',
      width: 250,
      height: 76,
      color: COLORS.red,
      onClick: () => this.quit(),
    });

    // Pausing-to-mute is a top parent move — offer it right here.
    makeMuteButton(this, GAME_WIDTH - 40, 40);

    // Same keys that opened the menu close it. Guard key-repeat or a held key
    // would bounce pause <-> resume.
    const resumeKey = (e: KeyboardEvent) => {
      if (!e.repeat) this.resumeGame();
    };
    this.input.keyboard?.on('keydown-ESC', resumeKey);
    this.input.keyboard?.on('keydown-P', resumeKey);
  }

  private resumeGame(): void {
    this.scene.resume('Game');
    this.scene.stop();
  }

  private quit(): void {
    // scene.start only stops the caller — stop the paused GameScene explicitly
    // so its shutdown cleanup runs. Explicit data: Phaser reuses the previous
    // start()'s data when none is passed (see ResultScene's HOME button).
    this.scene.stop('Game');
    this.scene.start('Schoolyard', { straightToDraft: false });
  }
}
