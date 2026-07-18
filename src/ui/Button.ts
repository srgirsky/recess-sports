// ---------------------------------------------------------------------------
// A big, friendly, touch-first button — chunky rounded shape with a bold
// outline and a 3D "bottom lip" that presses down on tap. Reused everywhere.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { COLORS } from '../config';
import { FONT, OUTLINE, OUTLINE_HEX, RADIUS } from './theme';

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

/** Darken a hex color number by fraction f. */
function darken(color: number, f: number): number {
  const r = Math.round(((color >> 16) & 255) * (1 - f));
  const g = Math.round(((color >> 8) & 255) * (1 - f));
  const b = Math.round((color & 255) * (1 - f));
  return (r << 16) | (g << 8) | b;
}

export function makeButton(scene: Phaser.Scene, opts: ButtonOpts): Phaser.GameObjects.Container {
  const w = opts.width ?? 300;
  const h = opts.height ?? 96;
  const color = opts.color ?? COLORS.gold;
  const lip = 8; // 3D bottom-edge depth

  const container = scene.add.container(opts.x, opts.y);

  const g = scene.add.graphics();
  const draw = (pressed: number) => {
    g.clear();
    const top = -h / 2 + pressed;
    // Bottom lip (darker) sits below and doesn't move.
    g.fillStyle(darken(color, 0.35), 1);
    g.fillRoundedRect(-w / 2, -h / 2 + lip, w, h, RADIUS);
    g.lineStyle(5, OUTLINE, 1);
    g.strokeRoundedRect(-w / 2, -h / 2 + lip, w, h, RADIUS);
    // Face (moves down when pressed).
    g.fillStyle(color, 1);
    g.fillRoundedRect(-w / 2, top, w, h, RADIUS);
    g.lineStyle(5, OUTLINE, 1);
    g.strokeRoundedRect(-w / 2, top, w, h, RADIUS);
    // Glossy highlight.
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(-w / 2 + 10, top + 8, w - 20, h * 0.34, RADIUS * 0.7);
  };
  draw(0);

  const text = scene.add
    .text(0, 0, `${opts.icon ? opts.icon + '  ' : ''}${opts.label}`, {
      fontFamily: FONT,
      fontSize: `${Math.round(h * 0.42)}px`,
      color: '#ffffff',
      fontStyle: '700',
    })
    .setOrigin(0.5)
    .setStroke(OUTLINE_HEX, 6);

  container.add([g, text]);
  container.setSize(w, h + lip);
  container.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h + lip),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  });

  const press = () => {
    draw(lip);
    text.setY(lip);
  };
  const release = () => {
    draw(0);
    text.setY(0);
  };

  container.on('pointerdown', press);
  container.on('pointerup', () => {
    release();
    opts.onClick();
  });
  container.on('pointerout', release);

  return container;
}
