// ---------------------------------------------------------------------------
// The draft scouting readouts — a reusable Backyard-style baseball card and a
// small hover "stat tag". Both take a Character and coordinates and know
// nothing about the draft, so Lineup/Album can reuse them later.
//
//  • playerCard  — the click-tier card: framed portrait, name + emoji, tagline,
//    a signature-ability chip (the 3 special kids + the 🤪 bunt kid), and the
//    stats as 1-10 dot ratings. Buttons (PICK/✕) are the caller's job.
//  • statTag     — the hover-tier tag: emoji + name + a mini equalizer, with a
//    little pointer aimed at the kid. Built ONCE and re-targeted per hover.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, DRAFT } from '../config';
import type { Character, AbilityId } from '../data/types';
import { poseKey } from '../art/textureFactory';
import { panel, pill, FONT, OUTLINE } from './theme';
import { drawStatBars, drawStatDots } from './statbars';

/** Display labels for the signature abilities (a card concern, not data). */
const ABILITY_LABEL: Partial<Record<AbilityId, string>> = {
  never_strikes_out: '🎯 NEVER MISSES',
  calls_shot: '🗣️ CALLS HIS SHOT',
  unhittable_pitch: '🌀 CRAZY PITCH',
  crazy_bunt: '🤪 CRAZY BUNT',
};

/**
 * The big baseball card, centered at (x, y). Returns a Container; the caller
 * adds PICK/✕ buttons in the right column and owns depth.
 */
export function playerCard(
  scene: Phaser.Scene,
  char: Character,
  x: number,
  y: number
): Phaser.GameObjects.Container {
  const W = DRAFT.CARD_W;
  const H = DRAFT.CARD_H;
  const card = panel(scene, x, y, W, H, { fill: COLORS.cream, strokeWidth: 6 });

  // Left column: a framed portrait (the BB2001 "photo" look).
  const frameX = -W / 2 + 96;
  const frame = panel(scene, frameX, 0, 150, H - 26, { fill: 0xbfe0f5, strokeWidth: 4, radius: 12 });
  card.add(frame);
  const portrait = scene.add.image(frameX, H / 2 - 20, poseKey(char.id, 'stand')).setOrigin(0.5, 1);
  portrait.setScale(190 / portrait.height);
  card.add(portrait);

  // Right region: name + emoji, tagline, optional ability chip, dot ratings.
  const textX = frameX + 96; // left edge of the name/tagline/dots column
  const name = scene.add
    .text(textX, -H / 2 + 24, char.name, { fontFamily: FONT, fontSize: '28px', color: '#14202e', fontStyle: '700' })
    .setOrigin(0, 0.5);
  card.add(name);
  if (char.emoji) {
    const badge = scene.add.text(W / 2 - 92, -H / 2 + 26, char.emoji, { fontSize: '30px' }).setOrigin(0.5);
    card.add(badge);
  }
  const tag = scene.add
    .text(textX, -H / 2 + 52, char.tagline, {
      fontFamily: FONT,
      fontSize: '15px',
      color: '#3a4654',
      wordWrap: { width: 300 },
    })
    .setOrigin(0, 0);
  card.add(tag);

  const label = ABILITY_LABEL[char.ability];
  if (label) {
    const chip = pill(scene, textX + 96, -28, label, { fill: COLORS.gold, fontSize: 16, minW: 180 });
    card.add(chip.container);
  }
  // No chip → shift the block up so ordinary kids don't get a hole in the card.
  drawStatDots(scene, card, char.stats, {
    x: textX,
    y: label ? 6 : -14,
    radius: DRAFT.DOT_R,
    pitch: DRAFT.DOT_PITCH,
    row: DRAFT.DOT_ROW,
  });

  return card;
}

/**
 * The hover tag. Built once; call show()/hide() as the pointer moves. `show`
 * takes the POINT the tag should sit above (the kid's head).
 */
export function statTag(scene: Phaser.Scene): {
  container: Phaser.GameObjects.Container;
  show(char: Character, x: number, y: number): void;
  hide(): void;
} {
  const W = DRAFT.TAG_W;
  const H = DRAFT.TAG_H;
  const container = scene.add.container(0, 0).setVisible(false);

  const body = panel(scene, 0, 0, W, H, { fill: COLORS.cream, strokeWidth: 4, radius: 14 });
  container.add(body);
  // Downward pointer aimed at the kid (Graphics — add.triangle is unreliable).
  const arrow = scene.add.graphics();
  arrow.fillStyle(COLORS.cream, 1);
  arrow.fillTriangle(-9, H / 2 - 1, 9, H / 2 - 1, 0, H / 2 + 11);
  arrow.lineStyle(4, OUTLINE, 1);
  arrow.lineBetween(-9, H / 2 - 1, 0, H / 2 + 11);
  arrow.lineBetween(9, H / 2 - 1, 0, H / 2 + 11);
  container.add(arrow);

  const label = scene.add
    .text(0, -H / 2 + 16, '', { fontFamily: FONT, fontSize: '18px', color: '#14202e', fontStyle: '700' })
    .setOrigin(0.5);
  container.add(label);

  // Reusable mini-equalizer slot; redrawn per show().
  let bars: Phaser.GameObjects.GameObject[] = [];

  const show = (char: Character, x: number, y: number): void => {
    label.setText(`${char.emoji ? char.emoji + ' ' : ''}${char.name}`);
    bars.forEach((o) => o.destroy());
    bars = drawStatBars(scene, container, char.stats, { x: -72, y: 24, width: 144, height: 18 });
    // Clamp x so end-of-row tags stay on screen; sit the pointer TAG_GAP above y.
    const cx = Phaser.Math.Clamp(x, W / 2 + 6, GAME_WIDTH - W / 2 - 6);
    container.setPosition(cx, y - DRAFT.TAG_GAP - (H / 2 + 11));
    container.setVisible(true);
  };
  const hide = (): void => {
    container.setVisible(false);
  };

  return { container, show, hide };
}
