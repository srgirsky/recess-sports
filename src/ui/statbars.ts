// ---------------------------------------------------------------------------
// The stat "equalizer" — four color-coded vertical bars with icon labels.
// Icon-forward (no reading needed): 🏏 contact · 💪 power · ⚡ speed · ⚾ arm · 🧤 glove.
// Extracted from the old draft card so any screen can show a kid's stats.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import type { Stats } from '../data/types';

export const STAT_BARS: Array<{ key: keyof Stats; color: number; icon: string }> = [
  { key: 'contact', color: 0x3fae6b, icon: '🏏' },
  { key: 'power', color: 0xe8524a, icon: '💪' },
  { key: 'speed', color: 0x3a7ad9, icon: '⚡' },
  { key: 'pitching', color: 0xffce3a, icon: '⚾' },
  { key: 'fielding', color: 0x9b6dd6, icon: '🧤' },
];

export interface StatBarOpts {
  x: number; // left edge of the bar group (container-local)
  y: number; // BOTTOM of the bars
  width: number; // total width of the group
  height: number; // max bar height
  icons?: boolean; // show the emoji labels under the bars (default true)
}

/** Draw the equalizer into `container`. Returns the objects it added. */
export function drawStatBars(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  stats: Stats,
  opts: StatBarOpts
): Phaser.GameObjects.GameObject[] {
  const added: Phaser.GameObjects.GameObject[] = [];
  const slot = opts.width / STAT_BARS.length;
  STAT_BARS.forEach((stat, i) => {
    const cx = opts.x + slot * i + slot / 2;
    const track = scene.add
      .rectangle(cx, opts.y, slot - 8, opts.height, 0xd8cdb5)
      .setOrigin(0.5, 1);
    const fill = scene.add
      .rectangle(cx, opts.y, slot - 8, (stats[stat.key] / 10) * opts.height, stat.color)
      .setOrigin(0.5, 1);
    container.add(track);
    container.add(fill);
    added.push(track, fill);
    if (opts.icons !== false) {
      const icon = scene.add
        .text(cx, opts.y + 6, stat.icon, { fontSize: `${Math.round(slot * 0.34)}px` })
        .setOrigin(0.5, 0);
      container.add(icon);
      added.push(icon);
    }
  });
  return added;
}
