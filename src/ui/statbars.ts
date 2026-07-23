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

export interface StatDotOpts {
  x: number; // left edge of the icon column (container-local)
  y: number; // TOP of the first row
  radius?: number; // dot radius (default 6)
  pitch?: number; // horizontal spacing between dots (default 22)
  row?: number; // vertical spacing between rows (default 26)
}

/**
 * Draw the stats as BB2001-style "skill ratings": one row per stat — the emoji
 * icon, then 10 dots filled in the stat's color up to its value. Same stat
 * order/colors/icons as `drawStatBars` (shared `STAT_BARS`). Round dots are
 * fine as plain circles (only rounded RECTS + triangles need Graphics).
 */
export function drawStatDots(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  stats: Stats,
  opts: StatDotOpts
): Phaser.GameObjects.GameObject[] {
  const added: Phaser.GameObjects.GameObject[] = [];
  const r = opts.radius ?? 6;
  const pitch = opts.pitch ?? 22;
  const row = opts.row ?? 26;
  const dot0 = opts.x + 34; // first dot sits right of the icon column
  STAT_BARS.forEach((stat, i) => {
    const cy = opts.y + row * i + r;
    const icon = scene.add
      .text(opts.x, cy, stat.icon, { fontSize: `${Math.round(r * 3)}px` })
      .setOrigin(0, 0.5);
    container.add(icon);
    added.push(icon);
    const val = stats[stat.key];
    for (let d = 0; d < 10; d++) {
      const dot = scene.add.circle(dot0 + d * pitch, cy, r, d < val ? stat.color : 0xd8cdb5);
      container.add(dot);
      added.push(dot);
    }
  });
  return added;
}
