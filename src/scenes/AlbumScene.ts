// ---------------------------------------------------------------------------
// The sticker album: one slot per roster kid. Never-drafted kids are dark
// silhouettes; drafted kids get their sticker; kids you've WON with get a
// gold foil ring; season trophies stack a 🏆 count. Tap a sticker and the kid
// says their name. Pure collection joy — and a second voting signal.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { ROSTER } from '../data/characters';
import { getAlbum } from '../systems/album';
import { makeButton } from '../ui/Button';
import { ribbon, FONT } from '../ui/theme';
import { popIn } from '../ui/anim';
import * as audio from '../systems/audio';
import { kidVoice } from '../systems/voices';

export class AlbumScene extends Phaser.Scene {
  constructor() {
    super('Album');
  }

  create(): void {
    const album = getAlbum();

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x8f5a3a, 0x8f5a3a, 0xb27a52, 0xb27a52, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // Stitched page.
    bg.fillStyle(0xfff4de, 0.92);
    bg.fillRoundedRect(40, 84, GAME_WIDTH - 80, GAME_HEIGHT - 170, 18);

    ribbon(this, GAME_WIDTH / 2, 48, '📔 STICKER ALBUM');

    const cols = 8;
    const cellW = (GAME_WIDTH - 130) / cols;
    ROSTER.forEach((char, i) => {
      const x = 90 + (i % cols) * cellW;
      const y = 150 + Math.floor(i / cols) * 118;
      const drafted = (album.drafted[char.id] ?? 0) > 0;
      const foiled = (album.wonWith[char.id] ?? 0) > 0;
      const trophies = album.trophies[char.id] ?? 0;

      const slot = this.add.container(x, y);
      if (foiled) {
        const foil = this.add.circle(0, 0, 46, COLORS.gold, 0.28).setStrokeStyle(5, COLORS.gold, 1);
        slot.add(foil);
      }
      const img = this.add.image(0, 4, char.id).setOrigin(0.5, 0.55);
      img.setScale(76 / img.height);
      if (!drafted) img.setTintFill(0x3a3128).setAlpha(0.45); // silhouette
      slot.add(img);
      if (drafted) {
        const name = this.add
          .text(0, 50, char.name.split(' ')[0], { fontFamily: FONT, fontSize: '13px', color: '#14202e' })
          .setOrigin(0.5);
        slot.add(name);
      }
      if (trophies > 0) {
        const t = this.add
          .text(30, -34, trophies > 1 ? `🏆x${trophies}` : '🏆', { fontSize: '17px' })
          .setOrigin(0.5);
        slot.add(t);
      }
      if (drafted) {
        slot.setInteractive(new Phaser.Geom.Rectangle(-42, -46, 84, 104), Phaser.Geom.Rectangle.Contains);
        slot.on('pointerdown', () => {
          audio.pop();
          audio.say(char.name, kidVoice(char), 'flush');
          popIn(this, slot, 1);
        });
      }
      popIn(this, slot, 1);
    });

    makeButton(this, {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT - 46,
      label: 'DONE',
      icon: '✅',
      width: 220,
      height: 70,
      onClick: () => this.scene.start('Schoolyard', { straightToDraft: false }),
    });
  }
}
