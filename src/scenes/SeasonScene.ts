// ---------------------------------------------------------------------------
// The Recess Week hub: a chalkboard standings screen. Five weekday slots show
// each rival's logo and the result (big chalk W/L/T); the record tallies at
// the top; NEXT GAME rolls into the Lineup screen for that day's matchup.
// When Friday's game is in the books, the button becomes the awards ceremony.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { getSeason, isWeekOver, wins, WEEKDAYS, type SeasonState } from '../systems/season';
import { TEAM_LOGOS, teamName } from '../systems/team';
import { UNIFORM_COLORS } from '../art/palette';
import { clearTeamVariant } from '../art/textureFactory';
import { makeButton } from '../ui/Button';
import { ribbon, heading, FONT } from '../ui/theme';
import { enterFrom } from '../ui/anim';
import * as audio from '../systems/audio';
import { commentatorProfile } from '../systems/voices';

export class SeasonScene extends Phaser.Scene {
  constructor() {
    super('Season');
  }

  create(): void {
    // The week hub (and the Awards podium behind it) is a jersey-era surface;
    // clear any lingering draft street-clothes variant from the title path.
    clearTeamVariant();
    const season = getSeason();
    if (!season) {
      this.scene.start('Schoolyard', { straightToDraft: false });
      return;
    }

    // Chalkboard.
    const bg = this.add.graphics();
    bg.fillStyle(0x2c4b3c, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.lineStyle(10, 0x8a6a48, 1);
    bg.strokeRect(5, 5, GAME_WIDTH - 10, GAME_HEIGHT - 10);

    ribbon(this, GAME_WIDTH / 2, 54, `🏆 RECESS WEEK — ${teamName(season.identity)}`);
    const w = wins(season);
    const l = season.results.filter((r) => r === 'L').length;
    const t = season.results.filter((r) => r === 'T').length;
    heading(this, GAME_WIDTH / 2, 116, `${w} W  ·  ${l} L${t ? `  ·  ${t} T` : ''}`, 30, '#fff4de');

    // The five weekdays.
    WEEKDAYS.forEach((day, i) => {
      const x = 130 + i * 175;
      const y = 300;
      const rival = season.rivals[i];
      const played = i < season.results.length;
      const isNext = i === season.gameIndex && !isWeekOver(season);

      const slot = this.add.container(x, y);
      const dayTxt = this.add
        .text(0, -104, day, { fontFamily: FONT, fontSize: '22px', color: '#cfe3d6', fontStyle: 'bold' })
        .setOrigin(0.5);
      const jersey = parseInt(UNIFORM_COLORS[rival.color].jersey.slice(1), 16);
      const face = this.add.circle(0, -30, 44, jersey, played ? 0.55 : 1).setStrokeStyle(4, isNext ? COLORS.gold : COLORS.ink, 1);
      const logo = this.add
        .text(0, -30, TEAM_LOGOS[rival.logo].icon, { fontSize: '38px' })
        .setOrigin(0.5)
        .setAlpha(played ? 0.65 : 1);
      slot.add([dayTxt, face, logo]);
      if (played) {
        const r = season.results[i];
        const mark = this.add
          .text(0, 62, r, {
            fontFamily: FONT,
            fontSize: '64px',
            fontStyle: 'bold',
            color: r === 'W' ? '#7fe08a' : r === 'L' ? '#ff8a80' : '#fff4de',
          })
          .setOrigin(0.5)
          .setStroke('#14202e', 6);
        slot.add(mark);
      } else if (isNext) {
        const ball = this.add.text(0, 62, '⚾', { fontSize: '44px' }).setOrigin(0.5);
        this.tweens.add({ targets: ball, y: 50, duration: 480, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        slot.add(ball);
      }
      enterFrom(this, slot, { dy: 26, delay: i * 90 });
    });

    if (isWeekOver(season)) {
      makeButton(this, {
        x: GAME_WIDTH / 2,
        y: GAME_HEIGHT - 88,
        label: 'AWARDS!',
        icon: '🏆',
        width: 320,
        height: 92,
        onClick: () => this.scene.start('Awards'),
      });
      audio.say('What a week! Time for the awards!', commentatorProfile('A'), 'queue');
    } else {
      makeButton(this, {
        x: GAME_WIDTH / 2,
        y: GAME_HEIGHT - 88,
        label: `PLAY ${WEEKDAYS[season.gameIndex]}!`,
        icon: '⚾',
        width: 320,
        height: 92,
        onClick: () => this.nextGame(season),
      });
      makeButton(this, {
        x: 118,
        y: GAME_HEIGHT - 78,
        label: 'QUIT',
        icon: '🏠',
        width: 170,
        height: 66,
        color: COLORS.cream,
        onClick: () => this.scene.start('Schoolyard', { straightToDraft: false }),
      });
    }
  }

  private nextGame(season: SeasonState): void {
    audio.pop();
    this.scene.start('Lineup', {
      playerTeam: season.playerTeam,
      aiTeam: season.rivalTeams[season.gameIndex],
      seasonGame: true,
    });
  }
}
