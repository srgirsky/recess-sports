// ---------------------------------------------------------------------------
// The shared UI kit. One place for the fonts, colors, corner radius, and the
// rounded-outlined-with-shadow "panel" look — so every screen matches.
//
// Phaser's Rectangle can't round corners, so panels/buttons/chips are drawn
// with Graphics (fillRoundedRect / strokeRoundedRect) via these helpers.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { COLORS } from '../config';

/** Playful rounded font (self-hosted); falls back gracefully if it hasn't loaded. */
export const FONT = "'Fredoka', 'Arial Black', Arial, sans-serif";

export const OUTLINE = 0x26333f; // matches the character-art outline
export const OUTLINE_HEX = '#26333f';
export const RADIUS = 18;

export interface PanelOpts {
  fill?: number;
  fillAlpha?: number;
  stroke?: number;
  strokeWidth?: number;
  radius?: number;
  shadow?: boolean;
  shadowAlpha?: number;
}

/**
 * A rounded, outlined, drop-shadowed panel. Returns a Container positioned at
 * (x,y); add children to it. w/h are the panel size (origin center).
 */
export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PanelOpts = {}
): Phaser.GameObjects.Container {
  const {
    fill = COLORS.cream,
    fillAlpha = 1,
    stroke = OUTLINE,
    strokeWidth = 5,
    radius = RADIUS,
    shadow = true,
    shadowAlpha = 0.2,
  } = opts;

  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const left = -w / 2;
  const top = -h / 2;
  if (shadow) {
    g.fillStyle(OUTLINE, shadowAlpha);
    g.fillRoundedRect(left, top + 7, w, h, radius);
  }
  g.fillStyle(fill, fillAlpha);
  g.fillRoundedRect(left, top, w, h, radius);
  if (strokeWidth > 0) {
    g.lineStyle(strokeWidth, stroke, 1);
    g.strokeRoundedRect(left, top, w, h, radius);
  }
  c.add(g);
  c.setSize(w, h);
  return c;
}

/** A bold heading on a colored ribbon/banner. Returns a container. */
export function ribbon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts: { fill?: number; textColor?: string; fontSize?: number; padX?: number } = {}
): Phaser.GameObjects.Container {
  const { fill = COLORS.red, textColor = '#ffffff', fontSize = 40, padX = 40 } = opts;
  const label = scene.add
    .text(0, 0, text, {
      fontFamily: FONT,
      fontSize: `${fontSize}px`,
      color: textColor,
      fontStyle: '700',
    })
    .setOrigin(0.5);
  const w = label.width + padX * 2;
  const h = fontSize + 26;
  const c = panel(scene, x, y, w, h, { fill, radius: h / 2, strokeWidth: 5 });
  label.setStroke(OUTLINE_HEX, 6);
  c.add(label);
  return c;
}

/** A small rounded status chip. Returns a container; update text via the returned ref. */
export function pill(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts: { fill?: number; textColor?: string; fontSize?: number; minW?: number } = {}
): { container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text; setText: (t: string, fill?: number) => void } {
  const { fill = COLORS.gold, textColor = '#14202e', fontSize = 22, minW = 0 } = opts;
  const label = scene.add
    .text(0, 0, text, { fontFamily: FONT, fontSize: `${fontSize}px`, color: textColor, fontStyle: '600' })
    .setOrigin(0.5);
  const h = fontSize + 18;
  const w = Math.max(minW, label.width + 32);
  const c = panel(scene, x, y, w, h, { fill, radius: h / 2, strokeWidth: 4, shadow: true, shadowAlpha: 0.15 });
  c.add(label);
  const setText = (t: string, newFill?: number) => {
    label.setText(t);
    // Redraw the panel graphics to fit the new text width.
    const gfx = c.getAt(0) as Phaser.GameObjects.Graphics;
    const nw = Math.max(minW, label.width + 32);
    gfx.clear();
    gfx.fillStyle(OUTLINE, 0.15);
    gfx.fillRoundedRect(-nw / 2, -h / 2 + 5, nw, h, h / 2);
    gfx.fillStyle(newFill ?? fill, 1);
    gfx.fillRoundedRect(-nw / 2, -h / 2, nw, h, h / 2);
    gfx.lineStyle(4, OUTLINE, 1);
    gfx.strokeRoundedRect(-nw / 2, -h / 2, nw, h, h / 2);
    c.setSize(nw, h);
  };
  return { container: c, label, setText };
}

/** Heading text (no ribbon) in the brand font with the mascot outline. */
export function heading(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  fontSize = 40,
  color = '#ffffff'
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, { fontFamily: FONT, fontSize: `${fontSize}px`, color, fontStyle: '700', align: 'center' })
    .setOrigin(0.5)
    .setStroke(OUTLINE_HEX, Math.max(6, fontSize / 6));
}
