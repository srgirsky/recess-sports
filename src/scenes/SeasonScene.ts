// ---------------------------------------------------------------------------
// The Recess Week hub: a chalkboard standings screen. Five weekday slots show
// each rival's logo and the result (big chalk W/L/T); the record tallies at
// the top; under them, the whole league's table (systems/league.ts — the
// rivals play each other too). NEXT GAME rolls into the Lineup screen for that
// day's matchup. When Friday is in the books, a top-two finish earns Saturday's
// CHAMPIONSHIP (BB2001's season ends in a title game); after that, or on
// missing the cut, the button becomes the awards ceremony.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { getSeason, isWeekOver, wins, WEEKDAYS, type SeasonState } from '../systems/season';
import { standings, finalOpponent, finalPending, YOU, type StandingsRow } from '../systems/league';
import { TEAM_LOGOS, teamName } from '../systems/team';
import { UNIFORM_COLORS } from '../art/palette';
import { clearTeamVariant } from '../art/textureFactory';
import { makeButton } from '../ui/Button';
import { ribbon, heading, FONT } from '../ui/theme';
import { enterFrom } from '../ui/anim';
import * as audio from '../systems/audio';
import { commentatorProfile } from '../systems/voices';
import { mountLayoutOverlay } from '../dev/LayoutOverlay';

export class SeasonScene extends Phaser.Scene {
  constructor() {
    super('Season');
  }

  create(): void {
    if (import.meta.env.DEV) mountLayoutOverlay(this);
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

    // maxW: the team name is unbounded. "THE PURPLE ALL-STARS" is the longest
    // of the 56 colour x logo combinations and already reaches 883 of 960.
    ribbon(this, GAME_WIDTH / 2, 54, `🏆 RECESS WEEK — ${teamName(season.identity)}`, {
      maxW: 880,
      minFontSize: 26,
    });
    const w = wins(season);
    const l = season.results.filter((r) => r === 'L').length;
    const t = season.results.filter((r) => r === 'T').length;
    heading(this, GAME_WIDTH / 2, 116, `${w} W  ·  ${l} L${t ? `  ·  ${t} T` : ''}`, 30, '#fff4de');

    // The five weekdays.
    WEEKDAYS.forEach((day, i) => {
      const x = 130 + i * 175;
      const y = 246;
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

    this.drawTable(season);

    // The week's stat board, once there is a stat to show.
    if (season.results.length > 0) {
      makeButton(this, {
        x: GAME_WIDTH - 118,
        y: GAME_HEIGHT - 78,
        label: 'STATS',
        icon: '📊',
        width: 170,
        height: 66,
        color: COLORS.cream,
        onClick: () => this.scene.start('Leaders'),
      });
    }

    if (finalPending(season)) {
      makeButton(this, {
        x: GAME_WIDTH / 2,
        y: GAME_HEIGHT - 88,
        label: 'CHAMPIONSHIP!',
        icon: '🏆',
        width: 360,
        height: 92,
        onClick: () => this.playFinal(),
      });
      audio.say('You made the championship! Saturday, winner takes all!', commentatorProfile('A'), 'queue');
    } else if (isWeekOver(season)) {
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

  /**
   * The league table: six teams in two chalk columns, best first, the
   * player's row in gold. The header says what the table is FOR this week —
   * the top-two cut, Saturday's matchup, or how Saturday went.
   */
  private drawTable(season: SeasonState): void {
    const rows = standings(season);
    const opp = finalOpponent(season);
    const name = (team: number) => teamName(team === YOU ? season.identity : season.rivals[team]);
    const f = season.final;
    const header = f
      ? f.result === 'W'
        ? '🏆 CHAMPIONS OF RECESS! 🏆'
        : f.result === 'T'
          ? '🤝 CO-CHAMPIONS! WHAT A FINAL!'
          : `🥈 RUNNERS-UP — ${name(f.opponent)} WON IT`
      : opp !== null
        ? `🏆 SATURDAY: YOU vs ${name(opp)}`
        : isWeekOver(season)
          ? 'SO CLOSE! TOP 2 PLAY THE FINAL'
          : '📋 THE LEAGUE — TOP 2 PLAY SATURDAY';
    heading(this, GAME_WIDTH / 2, 372, header, 22, '#ffce3a', { maxW: 880, minFontSize: 15 });

    const colX = [GAME_WIDTH / 2 - 222, GAME_WIDTH / 2 + 222];
    rows.forEach((r, i) => this.drawRow(r, i, colX[Math.floor(i / 3)], 410 + (i % 3) * 34, name(r.team), season));
  }

  private drawRow(r: StandingsRow, rank: number, cx: number, y: number, label: string, season: SeasonState): void {
    const W = 410;
    const you = r.team === YOU;
    const left = cx - W / 2;
    if (you || rank < 2) {
      const band = this.add.graphics();
      band.fillStyle(you ? 0xffce3a : 0xfff4de, you ? 0.3 : 0.1);
      band.fillRoundedRect(left, y - 15, W, 30, 8);
    }
    const ident = you ? season.identity : season.rivals[r.team];
    const jersey = parseInt(UNIFORM_COLORS[ident.color].jersey.slice(1), 16);
    const chalk = (x: number, text: string, origin: number, size = 18) =>
      this.add
        .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color: you ? '#ffce3a' : '#fff4de', fontStyle: '700' })
        .setOrigin(origin, 0.5);
    chalk(left + 12, `${rank + 1}`, 0);
    this.add.circle(left + 46, y, 13, jersey, 1).setStrokeStyle(2, COLORS.ink, 1);
    this.add.text(left + 46, y, TEAM_LOGOS[ident.logo].icon, { fontSize: '15px' }).setOrigin(0.5);
    const n = chalk(left + 68, label, 0, 17);
    const record = chalk(left + W - 12, `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`, 1);
    // An unbounded team name shrinks to its lane instead of running into the record.
    const lane = W - 68 - record.width - 24;
    if (n.width > lane) n.setScale(lane / n.width);
  }

  private playFinal(): void {
    const season = getSeason();
    const opp = season ? finalOpponent(season) : null;
    if (!season || opp === null) return;
    audio.pop();
    this.scene.start('Lineup', {
      playerTeam: season.playerTeam,
      aiTeam: season.rivalTeams[opp],
      seasonGame: true,
      seasonFinal: true,
    });
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
