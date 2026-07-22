// ---------------------------------------------------------------------------
// Main-mode mound UI: pick a pitch from the Backyard-style card stack on the
// right edge, then tap a strike-zone cell to aim it. Pure view — it reports
// {kind, target} and GameScene does the rest (juice spends for special cards
// are validated scene-side; this UI only knows affordable vs locked).
// Also exports the strike-zone overlay both halves draw while a pitch flies.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, PLATE_ZONE, PLATE_VIEW, PITCHES, type PitchKind } from '../../config';
import type { PlateLoc } from '../../systems/pitchkind';
import { availablePitches } from '../../systems/pitchkind';
import { plateToScreen } from '../../art/plateView';
import { FONT, OUTLINE } from '../../ui/theme';
import { makeCardStack, type CardDef } from './EdgeCards';
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

/** A juice-gated special pitch entry for the card stack. */
export interface SpecialPitchOption {
  kind: PitchKind;
  /** Can the fielding seat afford it right now? Locked card otherwise. */
  affordable: boolean;
  /** Juice cost, shown as the card's badge. */
  cost: number;
}

/** Card label = the PITCHES label minus its leading emoji (the icon slot). */
const cardParts = (kind: PitchKind): { icon: string; label: string } => {
  const [icon, ...rest] = PITCHES[kind].label.split(' ');
  return { icon, label: rest.join(' ') };
};

/**
 * Show the right-edge pitch card stack + tappable 3x3 zone grid. Fastball
 * starts selected; a grid tap confirms and fires onDone once. Caller destroys
 * any leftovers.
 */
export function showPitchSelect(
  scene: Phaser.Scene,
  opts: {
    /** Juice specials to append below the base cards (locked when broke). */
    specials: SpecialPitchOption[];
    onDone: (kind: PitchKind, target: PlateLoc) => void;
    /** Pin screen-anchored chrome (prompt + card stack) to the UI camera. The
     *  zone grid stays in WORLD space: the frontal plate mapping already makes
     *  it a big tap target, and the camera never zooms anyway. */
    pin: <T extends Phaser.GameObjects.GameObject>(go: T) => T;
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
  opts.pin(prompt);
  objs.push(prompt);

  // --- Pitch cards (right edge, base group + specials group) ---------------
  const cards: CardDef[] = availablePitches(false).map((kind) => ({
    id: kind,
    ...cardParts(kind),
  }));
  opts.specials.forEach((sp, i) => {
    cards.push({
      id: sp.kind,
      ...cardParts(sp.kind),
      sub: `⚡${sp.cost}`,
      locked: !sp.affordable,
      gapBefore: i === 0,
    });
  });
  const stack = makeCardStack(scene, {
    cards,
    selectedId: selected,
    onSelect: (id) => {
      selected = id as PitchKind;
      audio.pop();
    },
    pin: opts.pin,
  });

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
      stack.destroy();
      for (const o of objs) o.destroy();
      objs.length = 0;
    },
  };
}
