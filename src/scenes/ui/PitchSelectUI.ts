// ---------------------------------------------------------------------------
// Main-mode mound UI: pick a pitch (pill row) and tap a strike-zone cell to
// aim it. Pure view — it reports {kind, target} and GameScene does the rest.
// Also exports the strike-zone overlay both halves draw while a pitch flies.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, PLATE_ZONE, PITCHES, type PitchKind } from '../../config';
import { HOME } from '../../systems/geometry';
import type { PlateLoc } from '../../systems/pitchkind';
import { availablePitches } from '../../systems/pitchkind';
import { pill, FONT, OUTLINE } from '../../ui/theme';
import * as audio from '../../systems/audio';

/** Screen position of a plate-coord point. */
export function plateToScreen(p: PlateLoc): { x: number; y: number } {
  return { x: HOME.x + p.x, y: HOME.y + PLATE_ZONE.CY + p.y };
}

/**
 * The strike-zone window: rounded outline + faint 3x3 grid, drawn at the
 * plate. Destroy it with the rest of the pitch visuals.
 */
export function zoneOutline(scene: Phaser.Scene, alpha = 0.75): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(13).setAlpha(alpha);
  const { W, H } = PLATE_ZONE;
  const c = plateToScreen({ x: 0, y: 0 });
  g.lineStyle(3, COLORS.white, 0.9);
  g.strokeRoundedRect(c.x - W / 2, c.y - H / 2, W, H, 8);
  g.lineStyle(1.5, COLORS.white, 0.35);
  for (const f of [-1 / 6, 1 / 6]) {
    g.lineBetween(c.x + W * f * 2, c.y - H / 2, c.x + W * f * 2, c.y + H / 2);
    g.lineBetween(c.x - W / 2, c.y + H * f * 2, c.x + W / 2, c.y + H * f * 2);
  }
  return g;
}

export interface PitchSelect {
  destroy(): void;
}

/**
 * Show the pill row + tappable 3x3 zone grid. Fastball starts selected; a
 * grid tap confirms and fires onDone once. Caller destroys any leftovers.
 */
export function showPitchSelect(
  scene: Phaser.Scene,
  opts: {
    allowCrazy: boolean;
    onDone: (kind: PitchKind, target: PlateLoc) => void;
    /** Pin screen-anchored chrome (prompt + pill row) to the UI camera. The
     *  zone grid stays in WORLD space on purpose: the batting close-up zooms
     *  it into a bigger tap target. */
    pin?: (go: Phaser.GameObjects.GameObject) => void;
  }
): PitchSelect {
  const objs: Phaser.GameObjects.GameObject[] = [];
  let selected: PitchKind = 'fastball';
  let done = false;

  // --- Prompt ---------------------------------------------------------------
  const prompt = scene.add
    .text(GAME_WIDTH / 2, 148, 'PICK A PITCH, TAP THE ZONE!', {
      fontFamily: FONT,
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#26333f',
      strokeThickness: 6,
      fontStyle: '700',
    })
    .setOrigin(0.5)
    .setDepth(90);
  opts.pin?.(prompt);
  objs.push(prompt);

  // --- Pitch pills ----------------------------------------------------------
  const kinds = availablePitches(opts.allowCrazy);
  const pills: Array<{ kind: PitchKind; c: Phaser.GameObjects.Container }> = [];
  const spacing = 172;
  const rowX = GAME_WIDTH / 2 - ((kinds.length - 1) * spacing) / 2;
  const styleAll = () => {
    for (const p of pills) {
      const sel = p.kind === selected;
      p.c.setAlpha(sel ? 1 : 0.6);
      p.c.setScale(sel ? 1 : 0.88);
    }
  };
  kinds.forEach((kind, i) => {
    const { container } = pill(scene, rowX + i * spacing, 600, PITCHES[kind].label, {
      fill: COLORS.cream,
      fontSize: 20,
      minW: 156,
    });
    container.setDepth(90);
    opts.pin?.(container);
    container.setInteractive(new Phaser.Geom.Rectangle(-80, -22, 160, 44), Phaser.Geom.Rectangle.Contains);
    container.on('pointerdown', () => {
      selected = kind;
      audio.pop();
      styleAll();
    });
    pills.push({ kind, c: container });
    objs.push(container);
  });
  styleAll();

  // --- Zone grid ------------------------------------------------------------
  objs.push(zoneOutline(scene, 0.9));
  const { W, H } = PLATE_ZONE;
  const cellW = W / 3;
  const cellH = H / 3;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const target: PlateLoc = { x: (col - 1) * cellW, y: (row - 1) * cellH };
      const c = plateToScreen(target);
      const cell = scene.add
        .rectangle(c.x, c.y, cellW - 3, cellH - 3, COLORS.gold, 0.12)
        .setDepth(89)
        .setInteractive();
      cell.on('pointerover', () => cell.setFillStyle(COLORS.gold, 0.4));
      cell.on('pointerout', () => cell.setFillStyle(COLORS.gold, 0.12));
      cell.on('pointerdown', () => {
        if (done) return;
        done = true;
        audio.pop();
        // A quick confirm flash on the chosen cell, then hand over.
        const flash = scene.add
          .rectangle(c.x, c.y, cellW - 3, cellH - 3, COLORS.gold, 0.7)
          .setDepth(91)
          .setStrokeStyle(3, OUTLINE);
        objs.push(flash);
        scene.tweens.add({ targets: flash, alpha: 0, duration: 260 });
        opts.onDone(selected, target);
      });
      objs.push(cell);
    }
  }

  return {
    destroy() {
      for (const o of objs) o.destroy();
      objs.length = 0;
    },
  };
}
