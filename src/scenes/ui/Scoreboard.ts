// ---------------------------------------------------------------------------
// The pinned scoreboard STRIP along the bottom of the screen, Backyard-style:
// team rows (logo + name + score, with a ▶ on the side at bat), the AT BAT
// block (batter name + game stat line + labeled B/S/OUT pips that pulse when
// one grows), the inning, and a mini-diamond showing the base state — plus
// the HUD-anchored umpire call (BALL! / STRIKE! / FOUL!) that pops just above
// the strip so kids always see WHY the pips moved. View-only: GameScene feeds
// it state via refresh()/setBatter(); it never decides anything. Everything
// renders on the UI camera (never zooms). Geometry lives in config.HUD.STRIP.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, COLORS, HUD } from '../../config';
import { panel, heading, FONT } from '../../ui/theme';

export interface ScoreboardState {
  playerScore: number;
  aiScore: number;
  inning: number;
  innings: number;
  half: 'top' | 'bottom';
  bonus: boolean;
  balls: number;
  strikes: number;
  outs: number;
  /** Occupied bases [1B, 2B, 3B] — lights the mini-diamond dots. */
  bases: [boolean, boolean, boolean];
}

export interface Scoreboard {
  /** Redraw the strip; pulses whichever of B/S/OUT grew since the last call. */
  refresh(s: ScoreboardState): void;
  /** The AT BAT block: who's up + their game line ('' hides the line). */
  setBatter(name: string, statLine: string): void;
  /** Umpire call anchored above the strip: 'BALL!', 'STRIKE!', 'FOUL!'. */
  umpCall(text: string, color: number): void;
  destroy(): void;
}

const BALLS_MAX = 3;
const STRIKES_MAX = 2;
const OUTS_MAX = 3;

const pips = (lit: number, max: number) => ('● '.repeat(lit) + '○ '.repeat(max - lit)).trim();

/** Optional per-seat labels (team logo/name + tint). Falls back to YOU/CPU. */
export interface SeatLabels {
  away: { label: string; name: string; color: string };
  home: { label: string; name: string; color: string };
}

export function createScoreboard(
  scene: Phaser.Scene,
  pin: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  labels?: SeatLabels
): Scoreboard {
  const { CY, W, H } = HUD.STRIP;
  // All children live in the strip container's LOCAL space: x -W/2..W/2,
  // y -H/2..H/2 around the strip center (GAME_WIDTH/2, CY).
  const strip = panel(scene, GAME_WIDTH / 2, CY, W, H, { fill: COLORS.ink, fillAlpha: 0.92 });
  strip.setDepth(90);

  const deco = scene.add.graphics();
  // Gold trim along the top edge — the strip reads as one framed board.
  deco.lineStyle(3, COLORS.gold, 0.9);
  deco.lineBetween(-W / 2 + 10, -H / 2, W / 2 - 10, -H / 2);
  // Block dividers.
  deco.lineStyle(2, 0x3a4a5a, 1);
  deco.lineBetween(-184, -24, -184, 24);
  deco.lineBetween(184, -24, 184, 24);
  strip.add(deco);

  // --- Left: the two team rows (away on top — they bat first) ---------------
  const teamRow = (rowY: number, label: string, name: string, color: string) => {
    const turn = scene.add
      .text(-462, rowY, '▶', { fontFamily: FONT, fontSize: '12px', color: '#ffce3a' })
      .setOrigin(0.5)
      .setVisible(false);
    const logo = scene.add.text(-448, rowY, label, { fontSize: '18px' }).setOrigin(0.5);
    const nameText = scene.add
      .text(-428, rowY, name, { fontFamily: FONT, fontSize: '15px', color, fontStyle: '700' })
      .setOrigin(0, 0.5);
    const score = scene.add
      .text(-208, rowY, '0', { fontFamily: FONT, fontSize: '24px', color: '#ffffff', fontStyle: '700' })
      .setOrigin(1, 0.5);
    strip.add([turn, logo, nameText, score]);
    return { turn, score };
  };
  const awayRow = teamRow(-16, labels?.away.label ?? '⚾', labels?.away.name ?? 'YOU', labels?.away.color ?? '#7ec96a');
  const homeRow = teamRow(16, labels?.home.label ?? '🤖', labels?.home.name ?? 'CPU', labels?.home.color ?? '#ff8a7a');

  // --- Center: AT BAT — batter + line + labeled count pips ------------------
  const batterName = scene.add
    .text(0, -19, '', { fontFamily: FONT, fontSize: '19px', color: '#fff6e0', fontStyle: '700' })
    .setOrigin(0.5);
  const batterLine = scene.add
    .text(0, 0, '', { fontFamily: FONT, fontSize: '13px', color: '#cfd8e0' })
    .setOrigin(0.5);
  strip.add([batterName, batterLine]);

  const pipGroup = (labelX: number, labelTxt: string, color: string, max: number) => {
    const c = scene.add.container(0, 22);
    const label = scene.add
      .text(labelX, 0, labelTxt, { fontFamily: FONT, fontSize: '15px', color, fontStyle: '700' })
      .setOrigin(1, 0.5);
    const dots = scene.add
      .text(labelX + 8, 0, pips(0, max), { fontFamily: FONT, fontSize: '14px', color })
      .setOrigin(0, 0.5);
    c.add([label, dots]);
    strip.add(c);
    return { c, dots };
  };
  const ballsRow = pipGroup(-114, 'B', '#57d977', BALLS_MAX);
  const strikesRow = pipGroup(-18, 'S', '#ff7a70', STRIKES_MAX);
  const outsRow = pipGroup(76, 'OUT', '#ffffff', OUTS_MAX);

  // --- Right: inning + the mini-diamond base state --------------------------
  const inningText = scene.add
    .text(244, 0, '▲ INN 1/2', { fontFamily: FONT, fontSize: '16px', color: '#ffce3a', fontStyle: '700' })
    .setOrigin(0.5);
  strip.add(inningText);

  const diamond = scene.add.container(404, 0);
  const pts = [
    new Phaser.Geom.Point(0, 24), // home
    new Phaser.Geom.Point(22, 1), // first
    new Phaser.Geom.Point(0, -22), // second
    new Phaser.Geom.Point(-22, 1), // third
  ];
  const dg = scene.add.graphics();
  dg.lineStyle(2.5, 0xffffff, 0.55);
  dg.strokePoints(pts, true, true);
  diamond.add(dg);
  diamond.add(scene.add.circle(0, 24, 3.5, 0xffffff, 0.9));
  const baseDots = [pts[1], pts[2], pts[3]].map((p) => {
    const dot = scene.add.circle(p.x, p.y, 5.5, 0xffffff, 0.85).setStrokeStyle(2, COLORS.ink);
    diamond.add(dot);
    return dot;
  });
  strip.add(diamond);

  pin(strip);

  const pulse = (target: Phaser.GameObjects.Container) => {
    target.setScale(1);
    scene.tweens.add({
      targets: target,
      scale: 1.3,
      duration: 130,
      yoyo: true,
      ease: 'Quad.out',
    });
  };

  let prev = { balls: 0, strikes: 0, outs: 0 };
  let call: Phaser.GameObjects.Text | undefined;

  return {
    refresh(s: ScoreboardState): void {
      awayRow.score.setText(String(s.playerScore));
      homeRow.score.setText(String(s.aiScore));
      awayRow.turn.setVisible(s.half === 'top');
      homeRow.turn.setVisible(s.half === 'bottom');
      const half = s.half === 'top' ? '▲' : '▼';
      inningText.setText(s.bonus ? `${half} BONUS!` : `${half} INN ${s.inning}/${s.innings}`);
      ballsRow.dots.setText(pips(s.balls, BALLS_MAX));
      strikesRow.dots.setText(pips(s.strikes, STRIKES_MAX));
      outsRow.dots.setText(pips(s.outs, OUTS_MAX));
      // Pulse only on a NEW pip — a reset (next batter) shouldn't shout.
      if (s.balls > prev.balls) pulse(ballsRow.c);
      if (s.strikes > prev.strikes) pulse(strikesRow.c);
      if (s.outs > prev.outs) pulse(outsRow.c);
      prev = { balls: s.balls, strikes: s.strikes, outs: s.outs };
      s.bases.forEach((lit, i) =>
        baseDots[i].setFillStyle(lit ? COLORS.gold : 0xffffff, lit ? 1 : 0.85)
      );
    },

    setBatter(name: string, statLine: string): void {
      batterName.setText(name);
      batterLine.setText(statLine);
    },

    umpCall(text: string, color: number): void {
      call?.destroy();
      const t = heading(scene, GAME_WIDTH / 2, HUD.STRIP.TOP - 26, text, 32, '#' + color.toString(16).padStart(6, '0'));
      t.setDepth(95).setScale(0.5);
      pin(t);
      call = t;
      scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.out' });
      scene.tweens.add({
        targets: t,
        y: HUD.STRIP.TOP - 40,
        alpha: 0,
        delay: 700,
        duration: 350,
        onComplete: () => {
          if (call === t) call = undefined;
          t.destroy();
        },
      });
    },

    destroy(): void {
      call?.destroy();
      strip.destroy();
    },
  };
}
