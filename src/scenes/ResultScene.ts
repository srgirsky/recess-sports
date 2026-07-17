// ---------------------------------------------------------------------------
// Win/lose screen. Crowns an MVP kid from your roster and offers a rematch.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { getCharacter } from '../data/characters';
import { makeButton } from '../ui/Button';
import { makeMuteButton } from '../ui/MuteButton';
import { confetti } from '../ui/effects';
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

    this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, won ? COLORS.grass : COLORS.sky);

    const headline = tied ? 'TIE GAME!' : won ? 'YOU WIN! 🏆' : 'GOOD GAME!';
    this.add
      .text(cx, 110, headline, {
        fontFamily: 'Arial Black, Arial',
        fontSize: '80px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setStroke('#14202e', 12);

    // Celebrate.
    if (won) {
      confetti(this);
      audio.cheer();
      audio.say('You win!');
    } else {
      audio.say(tied ? 'Tie game!' : 'Good game!');
    }
    makeMuteButton(this, GAME_WIDTH - 40, 40);

    this.add
      .text(cx, 190, `YOU ${data.playerScore}   —   ${data.aiScore} CPU`, {
        fontFamily: 'Arial Black, Arial',
        fontSize: '40px',
        color: '#14202e',
      })
      .setOrigin(0.5);

    // MVP = highest overall kid on your team (a friendly little spotlight).
    const mvp = [...data.playerTeam]
      .map(getCharacter)
      .reduce((best, c) => (overall(c) > overall(best) ? c : best));

    this.add
      .text(cx, 270, 'TEAM MVP', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '26px',
        color: '#ffce3a',
      })
      .setOrigin(0.5)
      .setStroke('#14202e', 6);

    const mvpImg = this.add.image(cx, 300, mvp.id).setOrigin(0.5, 0);
    mvpImg.setScale(200 / mvpImg.height);
    this.tweens.add({
      targets: mvpImg,
      y: mvpImg.y - 10,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.add
      .text(cx, 520, `${mvp.name} — ${mvp.tagline}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        color: '#14202e',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    makeButton(this, {
      x: cx - 180,
      y: GAME_HEIGHT - 60,
      label: 'NEW TEAM',
      icon: '🔄',
      width: 300,
      onClick: () => this.scene.start('Draft'),
    });
    makeButton(this, {
      x: cx + 180,
      y: GAME_HEIGHT - 60,
      label: 'HOME',
      icon: '🏠',
      width: 250,
      onClick: () => this.scene.start('Title'),
    });
  }
}

function overall(c: ReturnType<typeof getCharacter>): number {
  return c.stats.contact + c.stats.power + c.stats.speed + c.stats.pitching;
}
