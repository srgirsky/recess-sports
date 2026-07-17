// ---------------------------------------------------------------------------
// A draft-pool card. Portrait up top (the kids are the point!), a name bar at
// the bottom, and a compact 4-bar "equalizer" showing the stats at a glance so
// a 6-year-old can spot "tall red bar = strong" without reading. Layout is
// derived from the passed cardW/cardH so it scales to any card size.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import type { Character } from '../data/types';
import { COLORS } from '../config';

export interface CharacterCard extends Phaser.GameObjects.Container {
  setCardEnabled(on: boolean): void;
  character: Character;
}

const STAT_BARS: Array<{ key: keyof Character['stats']; color: number }> = [
  { key: 'contact', color: 0x3fae6b }, // green
  { key: 'power', color: 0xe8524a }, // red
  { key: 'speed', color: 0x3a7ad9 }, // blue
  { key: 'pitching', color: 0xffce3a }, // gold
];

export function makeCharacterCard(
  scene: Phaser.Scene,
  char: Character,
  x: number,
  y: number,
  onClick: (char: Character) => void,
  cardW = 150,
  cardH = 210
): CharacterCard {
  const container = scene.add.container(x, y) as CharacterCard;
  container.character = char;

  const pad = 5;
  const nameBarH = Math.max(24, cardH * 0.2);
  const eqH = cardH * 0.16;

  const bg = scene.add.rectangle(0, 0, cardW, cardH, COLORS.cream).setOrigin(0.5);
  bg.setStrokeStyle(3, COLORS.ink);
  container.add(bg);

  // --- Portrait (top) ------------------------------------------------------
  const portrait = scene.add.image(0, -cardH / 2 + pad, char.id).setOrigin(0.5, 0);
  const portraitH = cardH - nameBarH - eqH - pad * 2;
  portrait.setScale(portraitH / portrait.height);
  container.add(portrait);

  // --- Stat equalizer (just above the name bar) ---------------------------
  const eqBottom = cardH / 2 - nameBarH - 3;
  const innerW = cardW - pad * 2;
  const slot = innerW / STAT_BARS.length;
  STAT_BARS.forEach((stat, i) => {
    const cx = -cardW / 2 + pad + slot * i + slot / 2;
    // faint full-height track, then the value fill on top
    container.add(scene.add.rectangle(cx, eqBottom, slot - 3, eqH, 0xd8cdb5).setOrigin(0.5, 1));
    const h = (char.stats[stat.key] / 10) * eqH;
    container.add(scene.add.rectangle(cx, eqBottom, slot - 3, h, stat.color).setOrigin(0.5, 1));
  });

  // --- Name bar (bottom) ---------------------------------------------------
  const nameBar = scene.add
    .rectangle(0, cardH / 2 - nameBarH / 2, cardW, nameBarH, COLORS.ink)
    .setOrigin(0.5);
  container.add(nameBar);
  const name = scene.add
    .text(0, cardH / 2 - nameBarH / 2, char.name, {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: cardW < 110 ? '12px' : '16px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: cardW - 6 },
    })
    .setOrigin(0.5);
  container.add(name);

  container.setSize(cardW, cardH);
  container.setInteractive({ useHandCursor: true });

  let enabled = true;
  container.setCardEnabled = (on: boolean) => {
    enabled = on;
    container.setAlpha(on ? 1 : 0.32);
    if (on) container.setInteractive({ useHandCursor: true });
    else container.disableInteractive();
  };

  container.on('pointerover', () => {
    if (enabled) scene.tweens.add({ targets: container, scale: 1.06, duration: 90 });
  });
  container.on('pointerout', () => {
    scene.tweens.add({ targets: container, scale: 1, duration: 90 });
  });
  container.on('pointerup', () => {
    if (enabled) onClick(char);
  });

  return container;
}
