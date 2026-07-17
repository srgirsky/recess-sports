// ---------------------------------------------------------------------------
// DEV-ONLY. Press D to see the "voting machine" tally: which kids you've been
// drafting most. This is the early read on which characters become toys/shows.
// Gated behind import.meta.env.DEV in TitleScene so it never ships publicly.
// Press R (while open) to reset the tally.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { readPickRates, getGamesPlayed, resetPicks } from '../systems/picklog';

export function mountPickRateOverlay(scene: Phaser.Scene): void {
  let panel: Phaser.GameObjects.Container | undefined;

  const render = (): Phaser.GameObjects.Container => {
    const c = scene.add.container(0, 0).setDepth(1000);
    c.add(
      scene.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.ink, 0.92)
        .setOrigin(0.5)
    );

    const rates = readPickRates();
    const lines = rates
      .map(
        (r, i) =>
          `${String(i + 1).padStart(2)}. ${r.name.padEnd(18)} ${String(r.count).padStart(3)}  ${(
            r.rate * 100
          )
            .toFixed(1)
            .padStart(5)}%`
      )
      .join('\n');

    c.add(
      scene.add
        .text(GAME_WIDTH / 2, 30, `PICK RATES  (games: ${getGamesPlayed()})`, {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: '#ffce3a',
        })
        .setOrigin(0.5, 0)
    );
    // Two columns so all 30 fit.
    const half = Math.ceil(rates.length / 2);
    const colText = (arr: string[], x: number) =>
      scene.add.text(x, 78, arr.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
        lineSpacing: 6,
      });
    const allLines = lines.split('\n');
    c.add(colText(allLines.slice(0, half), 60));
    c.add(colText(allLines.slice(half), GAME_WIDTH / 2 + 20));

    c.add(
      scene.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'D: close    R: reset tally', {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#8fa3b8',
        })
        .setOrigin(0.5, 1)
    );
    return c;
  };

  scene.input.keyboard?.on('keydown-D', () => {
    if (panel) {
      panel.destroy();
      panel = undefined;
    } else {
      panel = render();
    }
  });

  scene.input.keyboard?.on('keydown-R', () => {
    if (!panel) return;
    resetPicks();
    panel.destroy();
    panel = render();
  });
}
