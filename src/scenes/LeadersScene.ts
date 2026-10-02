// ---------------------------------------------------------------------------
// The week's stat board: every kid on the Recess Week team with their
// accumulated line (from SeasonState.stats — the same ledger the awards read),
// and each column's leader lit gold. BB2001 kept season leaders beside its
// standings; this is that page for v1. Read-only; BACK returns to the hub.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { getSeason } from '../systems/season';
import { EMPTY_LINE, type KidStats } from '../systems/stats';
import { teamName } from '../systems/team';
import { getCharacter } from '../data/characters';
import { makeButton } from '../ui/Button';
import { ribbon, panel, FONT } from '../ui/theme';
import { mountLayoutOverlay } from '../dev/LayoutOverlay';

/** Columns left to right; each column's best line is lit gold unless `noLead`. */
const COLS: Array<{ head: string; val: (s: KidStats) => number; show?: (s: KidStats) => string; noLead?: boolean }> = [
  { head: 'AB', val: (s) => s.ab, noLead: true }, // a count of turns, not a feat
  { head: 'H', val: (s) => s.h },
  // A kid's batting average, ".333" style — the number on the back of a card.
  {
    head: 'AVG',
    val: (s) => (s.ab > 0 ? s.h / s.ab : -1),
    show: (s) => (s.ab > 0 ? (s.h / s.ab).toFixed(3).replace(/^0/, '') : '—'),
  },
  { head: 'HR', val: (s) => s.hr },
  { head: 'R', val: (s) => s.r },
  { head: 'K', val: (s) => s.k },
];

export class LeadersScene extends Phaser.Scene {
  constructor() {
    super('Leaders');
  }

  create(): void {
    if (import.meta.env.DEV) mountLayoutOverlay(this);
    const season = getSeason();
    if (!season) {
      this.scene.start('Schoolyard', { straightToDraft: false });
      return;
    }

    const bg = this.add.graphics();
    bg.fillStyle(0x2c4b3c, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.lineStyle(10, 0x8a6a48, 1);
    bg.strokeRect(5, 5, GAME_WIDTH - 10, GAME_HEIGHT - 10);

    ribbon(this, GAME_WIDTH / 2, 54, `📊 WEEK STATS — ${teamName(season.identity)}`, { maxW: 880, minFontSize: 24 });

    const X = GAME_WIDTH / 2;
    const W = 760;
    const TOP = 104;
    const H = 400;
    panel(this, X, TOP + H / 2, W, H, { fill: COLORS.cream, strokeWidth: 6 });

    const lines = season.playerTeam.map((id) => season.stats[id] ?? EMPTY_LINE);
    // Each column's best value. A column where the whole team ties has no
    // leader to point at, so it lights nobody.
    const best = COLS.map((c) => {
      const vals = lines.map(c.val);
      const top = Math.max(...vals);
      return c.noLead || vals.every((v) => v === top) ? Infinity : top;
    });

    const left = X - W / 2 + 30;
    const nameW = 230;
    const colW = (W - 60 - nameW) / COLS.length;
    const colX = (i: number) => left + nameW + colW * (i + 0.5);
    const headY = TOP + 32;
    const rowH = 38;
    const style = (size: number, color: string, bold = false) => ({
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? '700' : 'normal',
    });

    COLS.forEach((c, i) => this.add.text(colX(i), headY, c.head, style(18, '#5a6676', true)).setOrigin(0.5));
    const rule = this.add.graphics();
    rule.lineStyle(2, 0xc9bfa6, 1);
    rule.lineBetween(left, headY + 16, X + W / 2 - 30, headY + 16);

    season.playerTeam.forEach((id, r) => {
      const y = headY + 16 + rowH * (r + 0.5) + 2;
      const line = lines[r];
      const name = this.add.text(left, y, getCharacter(id).name, style(20, '#14202e', true)).setOrigin(0, 0.5);
      if (name.width > nameW - 10) name.setScale((nameW - 10) / name.width);
      COLS.forEach((c, i) => {
        const v = c.val(line);
        const lead = v > 0 && v === best[i];
        const text = c.show ? c.show(line) : String(v);
        if (lead) {
          const chip = this.add.graphics();
          chip.fillStyle(0xffce3a, 0.55);
          chip.fillRoundedRect(colX(i) - colW / 2 + 6, y - rowH / 2 + 5, colW - 12, rowH - 10, 8);
        }
        this.add
          .text(colX(i), y, text, style(20, v > 0 ? '#14202e' : '#a3a9b0', lead))
          .setOrigin(0.5);
      });
    });

    makeButton(this, {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT - 70,
      label: 'BACK',
      icon: '🏆',
      width: 260,
      height: 82,
      onClick: () => this.scene.start('Season'),
    });
  }
}
