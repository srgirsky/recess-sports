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
import { commentatorProfile } from '../systems/voices';
import { recordAlbumGame } from '../systems/album';
import { teamName, type TeamIdentity } from '../systems/team';

interface ResultData {
  playerScore: number;
  aiScore: number;
  playerTeam: string[];
  aiTeam?: string[];
  /** Season games route back to the week, not the draft. */
  seasonGame?: boolean;
  /** Pass-and-play/net: team-named headline, both albums credited. */
  matchType?: 'solo' | 'passplay' | 'net';
  awayIdentity?: TeamIdentity;
  homeIdentity?: TeamIdentity;
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

    // Pass-and-play names the winner; solo keeps the classic YOU framing.
    const passplay = data.matchType === 'passplay';
    const winnerIdentity = won ? data.awayIdentity : data.homeIdentity;
    const headline = tied
      ? 'TIE GAME!'
      : passplay && winnerIdentity
        ? `${teamName(winnerIdentity)} WIN!`
        : won
          ? 'YOU WIN!'
          : 'GOOD GAME!';
    heading(this, cx, 70, headline, passplay ? 52 : 70);

    // Celebrate.
    if (won || (passplay && !tied)) {
      confetti(this);
      audio.cheer();
      audio.say(
        passplay && winnerIdentity ? `${teamName(winnerIdentity)} win!` : 'You win!',
        commentatorProfile('A'),
        'flush'
      );
    } else {
      audio.say(tied ? 'Tie game!' : 'Good game!', commentatorProfile('A'), 'flush');
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

    // Every finished game feeds the sticker album (drafted / won-with).
    // Pass-and-play: both squads used this device — the household album
    // credits both, foil to the winning nine.
    recordAlbumGame(data.playerTeam, won);
    if (data.matchType === 'passplay' && data.aiTeam) {
      recordAlbumGame(data.aiTeam, !won && !tied);
    }

    if (data.seasonGame) {
      // Season games return to the week's chalkboard, not the draft.
      makeButton(this, {
        x: cx,
        y: GAME_HEIGHT - 52,
        label: 'BACK TO THE WEEK',
        icon: '🏆',
        width: 380,
        height: 82,
        onClick: () => this.scene.start('Season'),
      });
      return;
    }

    makeButton(this, {
      x: cx - 175,
      y: GAME_HEIGHT - 52,
      label: 'NEW TEAM',
      icon: '🔄',
      width: 300,
      height: 82,
      onClick: () => this.scene.start('Schoolyard', { straightToDraft: true }),
    });
    makeButton(this, {
      x: cx + 175,
      y: GAME_HEIGHT - 52,
      label: 'HOME',
      icon: '🏠',
      width: 250,
      height: 82,
      // Explicit data: Phaser reuses the previous start()'s data when none is
      // passed, which would carry straightToDraft over from NEW TEAM.
      onClick: () => this.scene.start('Schoolyard', { straightToDraft: false }),
    });
  }
}

function overall(c: ReturnType<typeof getCharacter>): number {
  return c.stats.contact + c.stats.power + c.stats.speed + c.stats.pitching;
}
