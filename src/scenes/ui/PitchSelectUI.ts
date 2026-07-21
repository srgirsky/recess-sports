// ---------------------------------------------------------------------------
// Main-mode mound UI: pick a pitch (pill row) and tap a strike-zone cell to
// aim it. Pure view — it reports {kind, target} and GameScene does the rest.
// Also exports the strike-zone overlay both halves draw while a pitch flies.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, PLATE_ZONE, PLATE_VIEW, PITCHES, type PitchKind } from '../../config';
import type { PlateLoc } from '../../systems/pitchkind';
import { availablePitches } from '../../systems/pitchkind';
import { plateToScreen } from '../../art/plateView';
import { pill, FONT, OUTLINE } from '../../ui/theme';
import * as audio from '../../systems/audio';

/**
 * The strike-zone window: rounded outline + faint 3x3 grid, floating on the
 * behind-plate rig (art/plateView maps plate coords to it, ZONE.SCALE-sized).
 * Destroy it with the rest of the pitch visuals.
 */
export function zoneOutline(scene: Phaser.Scene, alpha = 0.75): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(PLATE_VIEW.DEPTH + 2).setAlpha(alpha);
  const W = PLATE_ZONE.W * PLATE_VIEW.ZONE.SCALE;
  const H = PLATE_ZONE.H * PLATE_VIEW.ZONE.SCALE;
  const c = plateToScreen({ x: 0, y: 0 });
  g.lineStyle(3, COLORS.white, 0.9);
  g.strokeRoundedRect(c.x - W / 2, c.y - H / 2, W, H, 10);
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
     *  zone grid stays in WORLD space: the frontal plate mapping already makes
     *  it a big tap target, and the camera never zooms anyway. */
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
  // Targets stay PLATE-coord (what resolvePitchLocation consumes); only the
  // drawn cell size is screen-scaled by the frontal mapping.
  const cellW = W / 3;
  const cellH = H / 3;
  const drawW = cellW * PLATE_VIEW.ZONE.SCALE - 4;
  const drawH = cellH * PLATE_VIEW.ZONE.SCALE - 4;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const target: PlateLoc = { x: (col - 1) * cellW, y: (row - 1) * cellH };
      const c = plateToScreen(target);
      const cell = scene.add
        .rectangle(c.x, c.y, drawW, drawH, COLORS.gold, 0.12)
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
          .rectangle(c.x, c.y, drawW, drawH, COLORS.gold, 0.7)
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
