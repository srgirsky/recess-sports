// ---------------------------------------------------------------------------
// A draft-pool card: rounded + outlined with a soft shadow, a team-color header
// strip, the portrait, a stat "equalizer," and a name plate. The team color and
// the mascot make each card read as a distinct kid at a glance (they're the
// product — the draft is a voting machine). Layout scales to the passed size.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import type { Character } from '../data/types';
import { COLORS } from '../config';
import { UNIFORM_COLORS } from '../art/palette';
import { FONT, OUTLINE } from './theme';

export interface CharacterCard extends Phaser.GameObjects.Container {
  setCardEnabled(on: boolean): void;
  character: Character;
}

const STAT_BARS: Array<{ key: keyof Character['stats']; color: number }> = [
  { key: 'contact', color: 0x3fae6b },
  { key: 'power', color: 0xe8524a },
  { key: 'speed', color: 0x3a7ad9 },
  { key: 'pitching', color: 0xffce3a },
];

function jersey(char: Character): number {
  const hex = UNIFORM_COLORS[char.visual.uniform]?.jersey ?? '#888888';
  return parseInt(hex.slice(1), 16);
}

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

  const pad = 6;
  const radius = Math.min(16, cardW * 0.14);
  const headerH = cardH * 0.16;
  const nameBarH = Math.max(22, cardH * 0.18);
  const eqH = cardH * 0.15;
  const left = -cardW / 2;
  const top = -cardH / 2;
  const teamColor = jersey(char);

  // Rounded card with shadow + team-color header, drawn once via Graphics.
  const g = scene.add.graphics();
  g.fillStyle(OUTLINE, 0.22);
  g.fillRoundedRect(left, top + 5, cardW, cardH, radius);
  g.fillStyle(COLORS.cream, 1);
  g.fillRoundedRect(left, top, cardW, cardH, radius);
  // Team header strip (top rounded only) — draw as a rounded rect clipped by overdraw.
  g.fillStyle(teamColor, 1);
  g.fillRoundedRect(left, top, cardW, headerH + radius, { tl: radius, tr: radius, bl: 0, br: 0 });
  g.fillRect(left, top + headerH, cardW, 2);
  g.lineStyle(4, OUTLINE, 1);
  g.strokeRoundedRect(left, top, cardW, cardH, radius);
  container.add(g);

  // Portrait (overlapping the header a touch).
  const portrait = scene.add.image(0, top + headerH * 0.5, char.id).setOrigin(0.5, 0);
  const portraitH = cardH - nameBarH - eqH - headerH * 0.5 - pad;
  portrait.setScale(portraitH / portrait.height);
  container.add(portrait);

  // Stat equalizer (just above the name plate).
  const eqBottom = cardH / 2 - nameBarH - 4;
  const innerW = cardW - pad * 2;
  const slot = innerW / STAT_BARS.length;
  STAT_BARS.forEach((stat, i) => {
    const cx = left + pad + slot * i + slot / 2;
    container.add(scene.add.rectangle(cx, eqBottom, slot - 4, eqH, 0xd8cdb5).setOrigin(0.5, 1));
    const hh = (char.stats[stat.key] / 10) * eqH;
    container.add(scene.add.rectangle(cx, eqBottom, slot - 4, hh, stat.color).setOrigin(0.5, 1));
  });

  // Name plate (rounded bottom bar).
  const plate = scene.add.graphics();
  plate.fillStyle(OUTLINE, 1);
  plate.fillRoundedRect(left + 3, cardH / 2 - nameBarH - 1, cardW - 6, nameBarH - 2, { tl: 8, tr: 8, bl: radius - 3, br: radius - 3 });
  container.add(plate);
  const name = scene.add
    .text(0, cardH / 2 - nameBarH / 2 - 1, char.name, {
      fontFamily: FONT,
      fontSize: cardW < 110 ? '12px' : '15px',
      color: '#ffffff',
      fontStyle: '600',
      align: 'center',
      wordWrap: { width: cardW - 8 },
    })
    .setOrigin(0.5);
  container.add(name);

  container.setSize(cardW, cardH);
  container.setInteractive({ useHandCursor: true });

  let enabled = true;
  container.setCardEnabled = (on: boolean) => {
    enabled = on;
    container.setAlpha(on ? 1 : 0.34);
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
