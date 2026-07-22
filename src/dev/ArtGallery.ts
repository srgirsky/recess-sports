// ---------------------------------------------------------------------------
// DEV-ONLY. Press G to see all 30 kids at once — the iteration surface for art
// work. While open: P cycles the pose (stand → run1 → run2 → cheer), A toggles
// a live two-frame run animation. Press G again to close. Gated behind
// import.meta.env.DEV so it never ships.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { ROSTER } from '../data/characters';
import { POSES, type Pose } from '../art/CharacterArt';
import { poseKey, queueStreetTextures } from '../art/textureFactory';
import { RUN_FRAMES } from '../ui/anim';

export function mountArtGallery(scene: Phaser.Scene): void {
  let panel: Phaser.GameObjects.Container | undefined;
  let poseIdx = 0;
  let animate = false;
  let animTimer: Phaser.Time.TimerEvent | undefined;
  let images: Phaser.GameObjects.Image[] = [];
  let header: Phaser.GameObjects.Text | undefined;

  const applyPose = (pose: Pose): void => {
    images.forEach((img, i) => img.setTexture(poseKey(ROSTER[i].id, pose)));
    header?.setText(
      `ART GALLERY — pose: ${animate ? 'RUN (animated)' : pose}  (G close · P pose · A animate)`
    );
  };

  const stopAnim = (): void => {
    animTimer?.remove();
    animTimer = undefined;
  };

  const render = (): Phaser.GameObjects.Container => {
    const c = scene.add.container(0, 0).setDepth(1200);
    images = [];
    c.add(
      scene.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x2b3a48, 0.98)
        .setOrigin(0.5)
    );
    header = scene.add
      .text(GAME_WIDTH / 2, 8, '', { fontFamily: 'monospace', fontSize: '18px', color: '#ffce3a' })
      .setOrigin(0.5, 0);
    c.add(header);

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
      images.push(img);
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
    applyPose(POSES[poseIdx]);
    return c;
  };

  scene.input.keyboard?.on('keydown-G', () => {
    if (panel) {
      stopAnim();
      animate = false;
      panel.destroy();
      panel = undefined;
      images = [];
      header = undefined;
    } else {
      // The Schoolyard arms the ':sc' street variant, but Boot only bakes the
      // 4 draft poses — lazily bake the rest so P can cycle every pose in
      // street clothes. Idempotent; opens once the loader settles.
      queueStreetTextures(scene, ROSTER, POSES);
      if (scene.load.list.size > 0) {
        scene.load.once('complete', () => {
          if (!panel) panel = render();
        });
        scene.load.start();
      } else {
        panel = render();
      }
    }
  });

  scene.input.keyboard?.on('keydown-P', () => {
    if (!panel) return;
    stopAnim();
    animate = false;
    poseIdx = (poseIdx + 1) % POSES.length;
    applyPose(POSES[poseIdx]);
  });

  scene.input.keyboard?.on('keydown-A', () => {
    if (!panel) return;
    animate = !animate;
    stopAnim();
    if (animate) {
      let i = 0;
      applyPose(RUN_FRAMES[0]);
      animTimer = scene.time.addEvent({
        delay: 80,
        loop: true,
        callback: () => {
          i = (i + 1) % RUN_FRAMES.length;
          applyPose(RUN_FRAMES[i]);
        },
      });
    } else {
      applyPose(POSES[poseIdx]);
    }
  });
}
