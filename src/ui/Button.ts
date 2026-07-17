// ---------------------------------------------------------------------------
// A big, friendly, touch-first button. Icon + label, chunky hit area, a little
// press animation. Reused on Title / Result / Draft.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { COLORS } from '../config';

export interface ButtonOpts {
  x: number;
  y: number;
  label: string;
  icon?: string; // emoji
  width?: number;
  height?: number;
  color?: number;
  onClick: () => void;
}

export function makeButton(scene: Phaser.Scene, opts: ButtonOpts): Phaser.GameObjects.Container {
  const w = opts.width ?? 300;
  const h = opts.height ?? 96;
  const color = opts.color ?? COLORS.gold;

  const container = scene.add.container(opts.x, opts.y);

  const shadow = scene.add.rectangle(0, 8, w, h, COLORS.ink, 0.25).setOrigin(0.5);
  shadow.setStrokeStyle(0);
  const bg = scene.add.rectangle(0, 0, w, h, color).setOrigin(0.5);
  bg.setStrokeStyle(6, COLORS.white);

  const text = scene.add
    .text(0, 0, `${opts.icon ? opts.icon + '  ' : ''}${opts.label}`, {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '40px',
      color: '#14202e',
      fontStyle: 'bold',
    })
    .setOrigin(0.5);

  container.add([shadow, bg, text]);
  container.setSize(w, h);
  container.setInteractive({ useHandCursor: true });

  container.on('pointerdown', () => {
    scene.tweens.add({ targets: container, scale: 0.94, duration: 60 });
  });
  container.on('pointerup', () => {
    scene.tweens.add({ targets: container, scale: 1, duration: 90, ease: 'Back.out' });
    opts.onClick();
  });
  container.on('pointerout', () => {
    scene.tweens.add({ targets: container, scale: 1, duration: 90 });
  });

  return container;
}
