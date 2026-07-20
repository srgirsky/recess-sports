// ---------------------------------------------------------------------------
// The pinned scoreboard strip: score, inning, and a labeled B / S / OUT count
// with a pulse whenever a pip changes — plus the HUD-anchored umpire call
// (BALL! / STRIKE! / FOUL!) that pops next to the count so kids always see
// WHY the pips moved. View-only: GameScene feeds it state via refresh(); it
// never decides anything. Everything renders on the UI camera (never zooms).
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, COLORS } from '../../config';
import { panel, pill, heading, FONT } from '../../ui/theme';

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
}

export interface Scoreboard {
  /** Redraw the strip; pulses whichever of B/S/OUT grew since the last call. */
  refresh(s: ScoreboardState): void;
  /** Umpire call anchored by the count panel: 'BALL!', 'STRIKE!', 'FOUL!'. */
  umpCall(text: string, color: number): void;
  destroy(): void;
}

const BALLS_MAX = 3;
const STRIKES_MAX = 2;
const OUTS_MAX = 3;

const pips = (lit: number, max: number) => ('● '.repeat(lit) + '○ '.repeat(max - lit)).trim();

export function createScoreboard(
  scene: Phaser.Scene,
  pin: <T extends Phaser.GameObjects.GameObject>(o: T) => T
): Scoreboard {
  // --- Score panel (left): YOU 0 — 0 CPU -----------------------------------
  const scorePanel = panel(scene, 122, 38, 218, 56, { fill: COLORS.cream });
  scorePanel.setDepth(90);
  const small = (x: number, txt: string, color: string) =>
    scene.add
      .text(x, 0, txt, { fontFamily: FONT, fontSize: '15px', color, fontStyle: '700' })
      .setOrigin(0.5);
  const big = (x: number) =>
    scene.add
      .text(x, 0, '0', { fontFamily: FONT, fontSize: '30px', color: '#14202e', fontStyle: '700' })
      .setOrigin(0.5);
  const playerScoreText = big(-34);
  const aiScoreText = big(34);
  scorePanel.add([
    small(-78, 'YOU', '#3f7d2c'),
    playerScoreText,
    scene.add
      .text(0, 0, '—', { fontFamily: FONT, fontSize: '22px', color: '#8a94a0' })
      .setOrigin(0.5),
    aiScoreText,
    small(78, 'CPU', '#c0392b'),
  ]);
  pin(scorePanel);

  // --- Inning pill (center) -------------------------------------------------
  const inningPill = pill(scene, GAME_WIDTH / 2, 36, '▲ INNING 1 of 2', {
    fill: COLORS.gold,
    fontSize: 20,
    minW: 200,
  });
  inningPill.container.setDepth(90);
  pin(inningPill.container);

  // --- Count panel (right): B / S / OUT rows --------------------------------
  const countPanel = panel(scene, 838, 42, 226, 76, { fill: COLORS.ink, fillAlpha: 0.88 });
  countPanel.setDepth(90);
  const row = (y: number, labelTxt: string, color: string, max: number) => {
    const c = scene.add.container(0, y);
    const label = scene.add
      .text(-64, 0, labelTxt, { fontFamily: FONT, fontSize: '18px', color, fontStyle: '700' })
      .setOrigin(1, 0.5);
    const dots = scene.add
      .text(-48, 0, pips(0, max), { fontFamily: FONT, fontSize: '17px', color })
      .setOrigin(0, 0.5);
    c.add([label, dots]);
    countPanel.add(c);
    return { c, dots };
  };
  const ballsRow = row(-22, 'B', '#57d977', BALLS_MAX);
  const strikesRow = row(0, 'S', '#ff7a70', STRIKES_MAX);
  const outsRow = row(22, 'OUT', '#ffffff', OUTS_MAX);
  pin(countPanel);

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
      playerScoreText.setText(String(s.playerScore));
      aiScoreText.setText(String(s.aiScore));
      const half = s.half === 'top' ? '▲' : '▼';
      inningPill.setText(
        s.bonus ? `${half} BONUS INNING!` : `${half} INNING ${s.inning} of ${s.innings}`
      );
      ballsRow.dots.setText(pips(s.balls, BALLS_MAX));
      strikesRow.dots.setText(pips(s.strikes, STRIKES_MAX));
      outsRow.dots.setText(pips(s.outs, OUTS_MAX));
      // Pulse only on a NEW pip — a reset (next batter) shouldn't shout.
      if (s.balls > prev.balls) pulse(ballsRow.c);
      if (s.strikes > prev.strikes) pulse(strikesRow.c);
      if (s.outs > prev.outs) pulse(outsRow.c);
      prev = { balls: s.balls, strikes: s.strikes, outs: s.outs };
    },

    umpCall(text: string, color: number): void {
      call?.destroy();
      const t = heading(scene, 838, 106, text, 32, '#' + color.toString(16).padStart(6, '0'));
      t.setDepth(95).setScale(0.5);
      pin(t);
      call = t;
      scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.out' });
      scene.tweens.add({
        targets: t,
        y: 92,
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
      scorePanel.destroy();
      inningPill.container.destroy();
      countPanel.destroy();
    },
  };
}
