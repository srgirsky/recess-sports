// ---------------------------------------------------------------------------
// Win/lose screen. Crowns an MVP kid from your roster and offers a rematch.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { getCharacter } from '../data/characters';
import { makeButton } from '../ui/Button';
import { makeMuteButton } from '../ui/MuteButton';
import { confetti } from '../ui/effects';
import { heading, ribbon, panel, FONT } from '../ui/theme';
import { squashHop } from '../ui/anim';
import * as audio from '../systems/audio';

interface ResultData {
  playerScore: number;
  aiScore: number;
  playerTeam: string[];
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data: ResultData): void {
    const cx = GAME_WIDTH / 2;
    const won = data.playerScore > data.aiScore;
    const tied = data.playerScore === data.aiScore;

    // Themed background.
    const bg = this.add.graphics();
    if (won) bg.fillGradientStyle(0x5bbf5a, 0x5bbf5a, 0x9be08a, 0x9be08a, 1);
    else bg.fillGradientStyle(0x5fb0ea, 0x5fb0ea, 0xa8dcf6, 0xa8dcf6, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const headline = tied ? 'TIE GAME!' : won ? 'YOU WIN!' : 'GOOD GAME!';
    heading(this, cx, 70, headline, 70);

    // Celebrate.
    if (won) {
      confetti(this);
      audio.cheer();
      audio.say('You win!');
    } else {
      audio.say(tied ? 'Tie game!' : 'Good game!');
    }
    makeMuteButton(this, GAME_WIDTH - 40, 40);

    ribbon(this, cx, 132, `YOU ${data.playerScore}   —   ${data.aiScore} CPU`, {
      fill: COLORS.ink,
      fontSize: 30,
    });

    // MVP = highest overall kid on your team, presented on a card.
    const mvp = [...data.playerTeam]
      .map(getCharacter)
      .reduce((best, c) => (overall(c) > overall(best) ? c : best));

    panel(this, cx, 352, 300, 360, { fill: COLORS.cream, strokeWidth: 6 });
    heading(this, cx, 214, '🏆 TEAM MVP 🏆', 24, '#ffce3a');
    const mvpImg = this.add.image(cx, 246, mvp.id).setOrigin(0.5, 0);
    mvpImg.setScale(176 / mvpImg.height);
    // Celebratory hop on a loop.
    squashHop(this, mvpImg, { height: 22 });
    this.time.addEvent({ delay: 1500, loop: true, callback: () => squashHop(this, mvpImg, { height: 22 }) });
    this.add
      .text(cx, 452, mvp.name, { fontFamily: FONT, fontSize: '28px', color: '#14202e', fontStyle: '700' })
      .setOrigin(0.5);
    this.add
      .text(cx, 490, mvp.tagline, { fontFamily: FONT, fontSize: '17px', color: '#3a4654', align: 'center', wordWrap: { width: 270 } })
      .setOrigin(0.5);

    makeButton(this, {
      x: cx - 175,
      y: GAME_HEIGHT - 52,
      label: 'NEW TEAM',
      icon: '🔄',
      width: 300,
      height: 82,
      onClick: () => this.scene.start('Draft'),
    });
    makeButton(this, {
      x: cx + 175,
      y: GAME_HEIGHT - 52,
      label: 'HOME',
      icon: '🏠',
      width: 250,
      height: 82,
      onClick: () => this.scene.start('Title'),
    });
  }
}

function overall(c: ReturnType<typeof getCharacter>): number {
  return c.stats.contact + c.stats.power + c.stats.speed + c.stats.pitching;
}
