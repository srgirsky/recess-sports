// ---------------------------------------------------------------------------
// DEV-ONLY. Press G on the Title to see all 30 kids at once — the iteration
// surface for art work. Press G again to close. Gated behind import.meta.env.DEV
// in TitleScene so it never ships.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { ROSTER } from '../data/characters';

export function mountArtGallery(scene: Phaser.Scene): void {
  let panel: Phaser.GameObjects.Container | undefined;

  const render = (): Phaser.GameObjects.Container => {
    const c = scene.add.container(0, 0).setDepth(1200);
    c.add(
      scene.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x2b3a48, 0.98)
        .setOrigin(0.5)
    );
    c.add(
      scene.add
        .text(GAME_WIDTH / 2, 8, 'ART GALLERY — all 30 kids  (G to close)', {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#ffce3a',
        })
        .setOrigin(0.5, 0)
    );

    const cols = 8;
    const cellW = GAME_WIDTH / cols;
    const cellH = 150;
    const startY = 46;
    ROSTER.forEach((char, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW + cellW / 2;
      const y = startY + row * cellH + cellH / 2;
      const img = scene.add.image(x, y - 12, char.id).setOrigin(0.5);
      img.setScale(120 / img.height);
      c.add(img);
      c.add(
        scene.add
          .text(x, y + 56, char.name, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: cellW - 6 },
          })
          .setOrigin(0.5, 0)
      );
    });
    return c;
  };

  scene.input.keyboard?.on('keydown-G', () => {
    if (panel) {
      panel.destroy();
      panel = undefined;
    } else {
      panel = render();
    }
  });
}
