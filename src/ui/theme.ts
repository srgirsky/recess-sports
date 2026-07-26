// ---------------------------------------------------------------------------
// The shared UI kit. One place for the fonts, colors, corner radius, and the
// rounded-outlined-with-shadow "panel" look — so every screen matches.
//
// Phaser's Rectangle can't round corners, so panels/buttons/chips are drawn
// with Graphics (fillRoundedRect / strokeRoundedRect) via these helpers.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { COLORS } from '../config';
import { tagUi } from './layout';

/** Playful rounded font (self-hosted); falls back gracefully if it hasn't loaded. */
export const FONT = "'Fredoka', 'Arial Black', Arial, sans-serif";

export const OUTLINE = 0x26333f; // matches the character-art outline
export const OUTLINE_HEX = '#26333f';
export const RADIUS = 18;

/** How far the drop shadow sits below the shape it belongs to. */
export const SHADOW_OFFSET = 7;

/**
 * The true footprint of a drawn panel: the stroke straddles the edge (half of it
 * lands OUTSIDE) and the shadow hangs below. Layout and the overlap audit both
 * need this, and neither should have to rediscover it.
 */
function panelFootprint(
  w: number,
  h: number,
  strokeWidth: number,
  shadow: boolean
): { ox: number; oy: number; w: number; h: number } {
  const bleed = strokeWidth / 2;
  const top = -h / 2 - bleed;
  const bottom = h / 2 + Math.max(bleed, shadow ? SHADOW_OFFSET : 0);
  return { ox: 0, oy: (top + bottom) / 2, w: w + strokeWidth, h: bottom - top };
}

/**
 * Shrink a label's font until it fits `avail`, flooring at `minFontSize`.
 * Returns overflow:true when even the floor didn't fit, so the caller can flag
 * it rather than clipping silently. Shrinking reuses the Text's existing canvas
 * texture — no second UUID(), so this consumes no rng.
 */
function fitLabel(
  label: Phaser.GameObjects.Text,
  fontSize: number,
  avail: number,
  minFontSize: number
): { fontSize: number; overflow: boolean } {
  if (avail <= 0 || label.width <= avail) return { fontSize, overflow: false };
  let fs = fontSize;
  for (let i = 0; i < 6 && label.width > avail && fs > minFontSize; i++) {
    const guess = Math.floor((fs * avail) / label.width);
    fs = Math.max(minFontSize, guess < fs ? guess : fs - 1);
    label.setFontSize(fs);
  }
  return { fontSize: fs, overflow: label.width > avail };
}

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
    g.fillRoundedRect(left, top + SHADOW_OFFSET, w, h, radius);
  }
  g.fillStyle(fill, fillAlpha);
  g.fillRoundedRect(left, top, w, h, radius);
  if (strokeWidth > 0) {
    g.lineStyle(strokeWidth, stroke, 1);
    g.strokeRoundedRect(left, top, w, h, radius);
  }
  c.add(g);
  c.setSize(w, h);
  return tagUi(c, { role: 'panel', ...panelFootprint(w, h, strokeWidth, shadow) });
}

/** A bold heading on a colored ribbon/banner. Returns a container. */
export function ribbon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts: {
    fill?: number;
    textColor?: string;
    fontSize?: number;
    padX?: number;
    /** Total width budget; the font shrinks to fit rather than running off-screen. */
    maxW?: number;
    minFontSize?: number;
  } = {}
): Phaser.GameObjects.Container {
  const { fill = COLORS.red, textColor = '#ffffff', padX = 40, maxW, minFontSize = 16 } = opts;
  let fontSize = opts.fontSize ?? 40;
  const label = scene.add
    .text(0, 0, text, {
      fontFamily: FONT,
      fontSize: `${fontSize}px`,
      color: textColor,
      fontStyle: '700',
    })
    .setOrigin(0.5);
  let overflow = false;
  if (maxW != null) {
    // Budget out the panel stroke (5) and the label's own outline (6), both of
    // which land outside the width `label.width` reports at this point.
    const fitted = fitLabel(label, fontSize, maxW - padX * 2 - 11, minFontSize);
    fontSize = fitted.fontSize;
    overflow = fitted.overflow;
  }
  const w = label.width + padX * 2;
  const h = fontSize + 26;
  const c = panel(scene, x, y, w, h, { fill, radius: h / 2, strokeWidth: 5 });
  label.setStroke(OUTLINE_HEX, 6);
  c.add(label);
  return tagUi(c, {
    role: 'ribbon',
    ...panelFootprint(w, h, 5, true),
    label: text,
    overflow,
  });
}

/** A small rounded status chip. Returns a container; update text via the returned ref. */
export function pill(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts: {
    fill?: number;
    textColor?: string;
    fontSize?: number;
    minW?: number;
    /** Total width budget; the font shrinks to fit rather than pushing neighbours. */
    maxW?: number;
    minFontSize?: number;
  } = {}
): { container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text; setText: (t: string, fill?: number) => void } {
  const { fill = COLORS.gold, textColor = '#14202e', minW = 0, maxW, minFontSize = 13 } = opts;
  const baseFontSize = opts.fontSize ?? 22;
  const label = scene.add
    .text(0, 0, text, { fontFamily: FONT, fontSize: `${baseFontSize}px`, color: textColor, fontStyle: '600' })
    .setOrigin(0.5);

  // One shared fitter, so setText() can never escape the budget the pill was
  // built with — the drift that let measured text outgrow its assumed slot.
  const fit = (): { w: number; h: number; overflow: boolean } => {
    label.setFontSize(baseFontSize);
    let fontSize = baseFontSize;
    let overflow = false;
    if (maxW != null) {
      const fitted = fitLabel(label, baseFontSize, maxW - 32 - 4, minFontSize);
      fontSize = fitted.fontSize;
      overflow = fitted.overflow;
    }
    return { w: Math.max(minW, label.width + 32), h: fontSize + 18, overflow };
  };

  const first = fit();
  const c = panel(scene, x, y, first.w, first.h, {
    fill,
    radius: first.h / 2,
    strokeWidth: 4,
    shadow: true,
    shadowAlpha: 0.15,
  });
  c.add(label);
  tagUi(c, {
    role: 'pill',
    ...panelFootprint(first.w, first.h, 4, true),
    label: text,
    overflow: first.overflow,
  });

  const setText = (t: string, newFill?: number) => {
    label.setText(t);
    // Redraw the panel graphics to fit the new text width.
    const gfx = c.getAt(0) as Phaser.GameObjects.Graphics;
    const { w: nw, h: nh, overflow } = fit();
    gfx.clear();
    gfx.fillStyle(OUTLINE, 0.15);
    gfx.fillRoundedRect(-nw / 2, -nh / 2 + SHADOW_OFFSET, nw, nh, nh / 2);
    gfx.fillStyle(newFill ?? fill, 1);
    gfx.fillRoundedRect(-nw / 2, -nh / 2, nw, nh, nh / 2);
    gfx.lineStyle(4, OUTLINE, 1);
    gfx.strokeRoundedRect(-nw / 2, -nh / 2, nw, nh, nh / 2);
    c.setSize(nw, nh);
    // Re-publish the footprint: a re-labelled pill that keeps its old measured
    // size is exactly how a row silently starts overlapping again.
    tagUi(c, { role: 'pill', ...panelFootprint(nw, nh, 4, true), label: t, overflow });
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
  color = '#ffffff',
  opts: { maxW?: number; minFontSize?: number } = {}
): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, text, { fontFamily: FONT, fontSize: `${fontSize}px`, color, fontStyle: '700', align: 'center' })
    .setOrigin(0.5)
    .setStroke(OUTLINE_HEX, Math.max(6, fontSize / 6));
  let overflow = false;
  if (opts.maxW != null) {
    // Stroke is applied first on purpose: Phaser folds strokeThickness into
    // Text.width, so fitting against a stroked label measures what you see.
    const fitted = fitLabel(t, fontSize, opts.maxW, opts.minFontSize ?? 16);
    if (fitted.fontSize !== fontSize) t.setStroke(OUTLINE_HEX, Math.max(6, fitted.fontSize / 6));
    fontSize = fitted.fontSize;
    overflow = fitted.overflow;
  }
  return tagUi(t, {
    role: 'heading',
    ox: 0,
    oy: 0,
    // Width comes from Phaser, which folds strokeThickness in.
    w: t.width,
    // Height is the INK, not the line box. Text.height carries font
    // line-height padding well past the glyphs — enough that two headings a
    // comfortable distance apart still report overlapping boxes. Clamped by
    // the real height so it can never over-report.
    h: Math.min(t.height, fontSize + Math.max(6, fontSize / 6)),
    label: text,
    overflow,
  });
}
