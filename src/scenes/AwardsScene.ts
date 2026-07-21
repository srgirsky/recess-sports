// ---------------------------------------------------------------------------
// End-of-week awards ceremony: a podium of the season's stat leaders (from
// the ACCUMULATED week stats — not the exhibition MVP), spoken intros, cheer
// poses, confetti, trophies into the sticker album. DONE closes the season.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { getSeason, clearSeason, wonPennant } from '../systems/season';
import { computeAwards } from '../systems/awards';
import { statLine } from '../systems/stats';
import { recordTrophy } from '../systems/album';
import { getCharacter } from '../data/characters';
import { poseKey } from '../art/textureFactory';
import { makeButton } from '../ui/Button';
import { ribbon, heading, panel, FONT } from '../ui/theme';
import { confetti } from '../ui/effects';
import { squashHop } from '../ui/anim';
import * as audio from '../systems/audio';
import { commentatorProfile, kidVoice } from '../systems/voices';

export class AwardsScene extends Phaser.Scene {
  constructor() {
    super('Awards');
  }

  create(): void {
    const season = getSeason();
    if (!season) {
      this.scene.start('Schoolyard', { straightToDraft: false });
      return;
    }
    const pennant = wonPennant(season);
    const awards = computeAwards(season.stats, season.playerTeam);

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x3a6b8f, 0x3a6b8f, 0x77a8c9, 0x77a8c9, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ribbon(this, GAME_WIDTH / 2, 54, pennant ? '🏆 PENNANT WINNERS! 🏆' : '⭐ AWARDS DAY ⭐', {
      fill: pennant ? COLORS.gold : COLORS.red,
    });
    confetti(this, pennant ? 120 : 60);
    audio.say(
      pennant ? 'You won the pennant! Unbelievable week!' : 'What a week of recess baseball!',
      commentatorProfile('A'),
      'flush'
    );

    const defs: Array<{ id: string | null; label: string; icon: string }> = [
      { id: awards.mvp, label: 'WEEK MVP', icon: '🏆' },
      { id: awards.homerKing, label: 'HOMER KING', icon: '💣' },
      { id: awards.strikeoutKing, label: 'K MACHINE', icon: '🔥' },
    ];
    const winners = defs.filter((d): d is { id: string; label: string; icon: string } => !!d.id);

    winners.forEach((d, i) => {
      const x = GAME_WIDTH / 2 + (i - (winners.length - 1) / 2) * 270;
      const char = getCharacter(d.id);
      panel(this, x, 330, 240, 320, { fill: COLORS.cream, strokeWidth: 5 });
      heading(this, x, 202, `${d.icon} ${d.label}`, 20, '#ffce3a');
      const img = this.add.image(x, 232, poseKey(d.id, 'cheer')).setOrigin(0.5, 0);
      img.setScale(160 / img.height);
      this.time.addEvent({
        delay: 1400 + i * 300,
        loop: true,
        callback: () => squashHop(this, img, { height: 18 }),
      });
      this.add
        .text(x, 420, char.name, { fontFamily: FONT, fontSize: '22px', color: '#14202e', fontStyle: '700' })
        .setOrigin(0.5);
      this.add
        .text(x, 452, statLine(season.stats[d.id]), {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#3a4654',
        })
        .setOrigin(0.5);
      recordTrophy(d.id);
      this.time.delayedCall(900 + i * 1400, () => {
        audio.say(`${char.name}!`, kidVoice(char), 'queue');
      });
    });

    makeButton(this, {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT - 70,
      label: 'DONE',
      icon: '✅',
      width: 260,
      height: 82,
      onClick: () => {
        clearSeason();
        this.scene.start('Schoolyard', { straightToDraft: false });
      },
    });
  }
}
