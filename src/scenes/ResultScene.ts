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
import { row } from '../ui/layout';
import { squashHop } from '../ui/anim';
import * as audio from '../systems/audio';
import { commentatorProfile } from '../systems/voices';
import { recordAlbumGame } from '../systems/album';
import { teamName, type TeamIdentity } from '../systems/team';
import { dropSession } from '../net/peer';

/** The bottom button row. A makeButton's box runs to y + h/2 + lip + stroke/2. */
const BUTTON_H = 78;
const BUTTON_Y = GAME_HEIGHT - 58;

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

    // Pass-and-play/net names the winner; solo keeps the classic YOU framing.
    const passplay = data.matchType === 'passplay' || data.matchType === 'net';
    const winnerIdentity = won ? data.awayIdentity : data.homeIdentity;
    const headline = tied
      ? 'TIE GAME!'
      : passplay && winnerIdentity
        ? `${teamName(winnerIdentity)} WIN!`
        : won
          ? 'YOU WIN!'
          : 'GOOD GAME!';
    // maxW: a team-named headline is unbounded — "THE PURPLE ALL-STARS WIN!"
    // is the worst of the 56 combinations and runs the full width at 52px.
    heading(this, cx, 46, headline, passplay ? 48 : 62, '#ffffff', { maxW: 900, minFontSize: 34 });

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

    ribbon(this, cx, 122, `YOU ${data.playerScore}   —   ${data.aiScore} CPU`, {
      fill: COLORS.ink,
      fontSize: 30,
      maxW: 880,
    });

    // MVP = highest overall kid on your team, presented on a card.
    const mvp = [...data.playerTeam]
      .map(getCharacter)
      .reduce((best, c) => (overall(c) > overall(best) ? c : best));

    // The card sits 8px higher than it used to: the old stack put the button
    // row's bottom edge at y 639 of a 640-tall canvas, so both buttons were
    // visibly clipped by the frame.
    panel(this, cx, 344, 300, 360, { fill: COLORS.cream, strokeWidth: 6 });
    heading(this, cx, 206, '🏆 TEAM MVP 🏆', 24, '#ffce3a');
    const mvpImg = this.add.image(cx, 238, mvp.id).setOrigin(0.5, 0);
    mvpImg.setScale(176 / mvpImg.height);
    // Celebratory hop on a loop.
    squashHop(this, mvpImg, { height: 22 });
    this.time.addEvent({ delay: 1500, loop: true, callback: () => squashHop(this, mvpImg, { height: 22 }) });
    this.add
      .text(cx, 444, mvp.name, { fontFamily: FONT, fontSize: '28px', color: '#14202e', fontStyle: '700' })
      .setOrigin(0.5);
    this.add
      .text(cx, 482, mvp.tagline, { fontFamily: FONT, fontSize: '17px', color: '#3a4654', align: 'center', wordWrap: { width: 270 } })
      .setOrigin(0.5);

    // Every finished game feeds the sticker album (drafted / won-with).
    // Pass-and-play/net: both squads played in this household's game — the
    // album credits both, foil to the winning nine.
    recordAlbumGame(data.playerTeam, won);
    if (passplay && data.aiTeam) {
      recordAlbumGame(data.aiTeam, !won && !tied);
    }

    if (data.matchType === 'net') {
      // No rematch in v1 — one button, no blame, session closed.
      makeButton(this, {
        x: cx,
        y: GAME_HEIGHT - 52,
        label: 'GOOD GAME!',
        icon: '🏠',
        width: 340,
        height: 82,
        onClick: () => {
          dropSession();
          this.scene.start('Schoolyard', { straightToDraft: false });
        },
      });
      return;
    }

    if (data.seasonGame) {
      // Season games return to the week's chalkboard, not the draft.
      makeButton(this, {
        x: cx,
        y: BUTTON_Y,
        label: 'BACK TO THE WEEK',
        icon: '🏆',
        width: 380,
        height: BUTTON_H,
        onClick: () => this.scene.start('Season'),
      });
      return;
    }

    const newTeam = makeButton(this, {
      x: cx,
      y: BUTTON_Y,
      label: 'NEW TEAM',
      icon: '🔄',
      width: 300,
      height: BUTTON_H,
      onClick: () => this.scene.start('Schoolyard', { straightToDraft: true }),
    });
    const home = makeButton(this, {
      x: cx,
      y: BUTTON_Y,
      label: 'HOME',
      icon: '🏠',
      width: 250,
      height: BUTTON_H,
      // Explicit data: Phaser reuses the previous start()'s data when none is
      // passed, which would carry straightToDraft over from NEW TEAM.
      onClick: () => this.scene.start('Schoolyard', { straightToDraft: false }),
    });
    // The two buttons are different widths, so the old fixed cx±175 offsets put
    // the pair's true centre 25px right of the screen's. row() measures.
    row([newTeam, home], { centerX: cx, y: BUTTON_Y + 4, gap: 40 });
  }
}

function overall(c: ReturnType<typeof getCharacter>): number {
  return c.stats.contact + c.stats.power + c.stats.speed + c.stats.pitching;
}
