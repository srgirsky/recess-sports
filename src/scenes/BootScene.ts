// ---------------------------------------------------------------------------
// BootScene runs first. Its whole job: turn all 30 character SVGs into textures
// ONCE, show a loading bar while that happens, then hand off to the Title.
//
// preload() queues the loads; Phaser runs them; create() fires when they're done.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { ROSTER } from '../data/characters';
import { queueRosterTextures } from '../art/textureFactory';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  private bootStart = 0;

  preload(): void {
    this.bootStart = performance.now();
    // Simple loading bar so the wait never looks broken.
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.add
      .text(cx, cy - 60, 'RECESS SPORTS', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '48px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const barW = 420;
    const border = this.add
      .rectangle(cx, cy + 20, barW, 32, COLORS.ink, 0)
      .setStrokeStyle(4, COLORS.white)
      .setOrigin(0.5);
    const fill = this.add
      .rectangle(border.x - barW / 2 + 4, cy + 20, 1, 22, COLORS.gold)
      .setOrigin(0, 0.5);

    this.load.on('progress', (p: number) => {
      fill.width = (barW - 8) * p;
    });

    // Queue every kid's art as a texture keyed by character id.
    queueRosterTextures(this, ROSTER);
  }

  create(): void {
    if (import.meta.env.DEV) {
      // Budget: <2s desktop. If this creeps, render non-stand poses at 2x.
      console.log(`[boot] textures ready in ${Math.round(performance.now() - this.bootStart)}ms`);
    }
    // Wait for the brand font so text renders in Fredoka, not the fallback.
    // Race against a short timeout so a slow/blocked font never hangs boot.
    const fontReady = document.fonts
      ? document.fonts.load('600 40px Fredoka').then(() => document.fonts.ready)
      : Promise.resolve();
    const timeout = new Promise((r) => this.time.delayedCall(2500, r));
    Promise.race([fontReady, timeout]).then(() => this.scene.start('Schoolyard'));
  }
}
