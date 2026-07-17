// ---------------------------------------------------------------------------
// The game. Player bats the top of each inning with the pitch-and-swing loop;
// the opponent's bottom half is auto-simulated so we only build ONE interactive
// batting surface. Two innings, then off to the Result screen.
//
// This is the one scene that leans on update()-style timing, but we keep it to
// tweens + timers rather than a manual per-frame loop, which is easier to read.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  COLORS,
  PITCH_TRAVEL_MS,
  INNINGS,
  TEAM_SIZE,
} from '../config';
import type { Character, TeamState } from '../data/types';
import { getCharacter } from '../data/characters';
import { bandFromError, resolveSwing, type SwingBand } from '../systems/atbat';
import {
  newHalfInning,
  applyAtBat,
  isHalfOver,
  type HalfInningState,
} from '../systems/inning';
import { recordGamePlayed } from '../systems/picklog';

type Phase = 'pitching' | 'resolving' | 'auto' | 'ended';

const MOUND = { x: 480, y: 250 };
const PLATE = { x: 480, y: 478 };

export class GameScene extends Phaser.Scene {
  private playerTeam!: string[];
  private aiTeam!: string[];
  private aiPitcher!: Character; // pitches to the player
  private playerPitcher!: Character; // pitches during the auto-sim

  private inning = 1;
  private half: 'top' | 'bottom' = 'top';
  private playerScore = 0;
  private aiScore = 0;
  private playerLineup = 0;
  private aiLineup = 0;

  private halfState!: HalfInningState;
  private phase: Phase = 'resolving';

  // per-pitch state
  private ball?: Phaser.GameObjects.Arc;
  private pitchStart = 0;
  private swung = false;
  private batter!: Character;

  // display objects
  private batterSprite?: Phaser.GameObjects.Image;
  private pitcherSprite?: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private inningText!: Phaser.GameObjects.Text;
  private outsText!: Phaser.GameObjects.Text;
  private announce!: Phaser.GameObjects.Text;
  private baseMarks: Phaser.GameObjects.Polygon[] = [];
  private batterLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Game');
  }

  init(data: TeamState): void {
    this.playerTeam = data.playerTeam;
    this.aiTeam = data.aiTeam;
    this.inning = 1;
    this.half = 'top';
    this.playerScore = 0;
    this.aiScore = 0;
    this.playerLineup = 0;
    this.aiLineup = 0;
    this.phase = 'resolving';
    this.baseMarks = [];
  }

  create(): void {
    this.aiPitcher = bestPitcher(this.aiTeam);
    this.playerPitcher = bestPitcher(this.playerTeam);
    recordGamePlayed();

    this.drawField();
    this.drawHud();
    this.bindSwingInput();

    this.pitcherSprite = this.add.image(MOUND.x, MOUND.y, this.aiPitcher.id).setOrigin(0.5, 1);
    this.pitcherSprite.setScale(120 / this.pitcherSprite.height);

    this.startHalf();
  }

  // --- Field & HUD ---------------------------------------------------------
  private drawField(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.grass);
    // Infield dirt diamond
    this.add
      .polygon(
        480,
        360,
        [0, -150, 170, 0, 0, 150, -170, 0],
        COLORS.dirt
      )
      .setOrigin(0.5);

    // Base markers (home, first, second, third), lit when occupied.
    const basePts = [
      { x: 480, y: 500 }, // home (not used as an occupancy light)
      { x: 632, y: 360 }, // first
      { x: 480, y: 218 }, // second
      { x: 328, y: 360 }, // third
    ];
    basePts.forEach((p, i) => {
      const diamond = this.add
        .polygon(p.x, p.y, [0, -14, 14, 0, 0, 14, -14, 0], i === 0 ? COLORS.white : COLORS.cream)
        .setStrokeStyle(3, COLORS.ink)
        .setOrigin(0.5);
      if (i > 0) this.baseMarks[i - 1] = diamond; // index 0..2 => first/second/third
    });
  }

  private drawHud(): void {
    this.add.rectangle(GAME_WIDTH / 2, 34, GAME_WIDTH, 68, COLORS.ink, 0.82).setOrigin(0.5);
    this.scoreText = this.add
      .text(24, 20, '', { fontFamily: 'Arial Black, Arial', fontSize: '30px', color: '#ffffff' })
      .setOrigin(0, 0);
    this.inningText = this.add
      .text(GAME_WIDTH / 2, 20, '', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '26px',
        color: '#ffce3a',
      })
      .setOrigin(0.5, 0);
    this.outsText = this.add
      .text(GAME_WIDTH - 24, 20, '', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '26px',
        color: '#ffffff',
      })
      .setOrigin(1, 0);

    this.announce = this.add
      .text(GAME_WIDTH / 2, 150, '', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '44px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setStroke('#14202e', 8);

    this.batterLabel = this.add
      .text(PLATE.x - 120, PLATE.y + 14, '', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(1, 0.5)
      .setStroke('#14202e', 5);

    this.refreshHud();
  }

  private refreshHud(): void {
    this.scoreText.setText(`YOU ${this.playerScore}   —   ${this.aiScore} CPU`);
    const halfLabel = this.half === 'top' ? '▲' : '▼';
    this.inningText.setText(`${halfLabel} Inning ${this.inning}/${INNINGS}`);
    const outs = this.halfState ? this.halfState.outs : 0;
    this.outsText.setText(`Outs: ${'●'.repeat(outs)}${'○'.repeat(3 - outs)}`);
    for (let i = 0; i < 3; i++) {
      const lit = this.halfState?.bases[i];
      this.baseMarks[i]?.setFillStyle(lit ? COLORS.gold : COLORS.cream);
    }
  }

  // --- Half-inning orchestration ------------------------------------------
  private startHalf(): void {
    this.halfState = newHalfInning();
    this.refreshHud();
    if (this.half === 'top') {
      this.flashAnnounce(`Inning ${this.inning}\nYOU'RE UP!`, COLORS.gold);
      this.time.delayedCall(1100, () => this.nextPlayerBatter());
    } else {
      this.flashAnnounce('OTHER TEAM\nBATTING', COLORS.red);
      this.phase = 'auto';
      this.time.delayedCall(1100, () => this.autoSimStep());
    }
  }

  private endHalf(): void {
    if (this.half === 'top') {
      this.half = 'bottom';
      this.startHalf();
    } else {
      this.inning += 1;
      if (this.inning > INNINGS) {
        this.gameOver();
      } else {
        this.half = 'top';
        this.startHalf();
      }
    }
  }

  private gameOver(): void {
    this.phase = 'ended';
    this.time.delayedCall(400, () => {
      this.scene.start('Result', {
        playerScore: this.playerScore,
        aiScore: this.aiScore,
        playerTeam: this.playerTeam,
      });
    });
  }

  // --- Player at-bats (interactive) ---------------------------------------
  private nextPlayerBatter(): void {
    if (isHalfOver(this.halfState)) {
      this.endHalf();
      return;
    }
    this.batter = getCharacter(this.playerTeam[this.playerLineup % TEAM_SIZE]);
    this.showBatter(this.batter);
    this.batterLabel.setText(this.batter.name);

    // "Calls his shot" flavor: a confident (always wrong) prediction.
    if (this.batter.ability === 'calls_shot') {
      this.flashAnnounce('"HOME RUN,\nCALLED IT!"', COLORS.white, 900);
      this.time.delayedCall(950, () => this.throwPitch());
    } else {
      this.throwPitch();
    }
  }

  private throwPitch(): void {
    this.phase = 'pitching';
    this.swung = false;
    this.pitchStart = this.time.now;

    this.ball?.destroy();
    this.ball = this.add.circle(MOUND.x, MOUND.y - 40, 9, COLORS.white).setDepth(20);
    this.ball.setStrokeStyle(2, COLORS.ink);

    this.tweens.add({
      targets: this.ball,
      x: PLATE.x,
      y: PLATE.y - 30,
      scale: { from: 0.7, to: 1.5 },
      duration: PITCH_TRAVEL_MS,
      ease: 'Sine.in',
      onComplete: () => {
        // Ball reached the plate with no swing -> a called strike ("a take").
        if (!this.swung && this.phase === 'pitching') {
          this.resolvePlayerSwing('miss', /* took */ true);
        }
      },
    });
  }

  private onSwing(): void {
    if (this.phase !== 'pitching' || this.swung) return;
    this.swung = true;
    const error = this.time.now - this.pitchStart - PITCH_TRAVEL_MS;
    const band = bandFromError(error);
    this.resolvePlayerSwing(band, false);
  }

  private resolvePlayerSwing(band: SwingBand, took: boolean): void {
    this.phase = 'resolving';
    this.ball?.destroy();
    this.ball = undefined;

    if (took) {
      // Treat as a called strike outcome fed through the rules.
      this.applyAndContinue({ kind: 'strike', bases: 0, description: 'Strike! (took it)' }, true);
      return;
    }

    const result = resolveSwing(band, this.batter, this.aiPitcher, () => Math.random());
    this.animateSwing();
    this.applyAndContinue(result, true);
  }

  private applyAndContinue(
    result: { kind: 'hit' | 'out' | 'strike' | 'foul'; bases: number; description: string },
    interactive: boolean
  ): void {
    const applied = applyAtBat(this.halfState, result);
    this.halfState = applied.state;

    if (interactive) {
      if (applied.runsScored > 0) this.playerScore += applied.runsScored;
    } else {
      if (applied.runsScored > 0) this.aiScore += applied.runsScored;
    }

    const color =
      result.kind === 'hit' ? COLORS.gold : result.kind === 'foul' ? COLORS.white : COLORS.red;
    let msg = result.description;
    if (applied.runsScored > 0) msg += `\n+${applied.runsScored} RUN${applied.runsScored > 1 ? 'S' : ''}!`;
    this.flashAnnounce(msg, color);
    this.refreshHud();

    if (!interactive) return; // auto-sim handles its own pacing

    const delay = result.kind === 'hit' ? 1100 : 850;
    this.time.delayedCall(delay, () => {
      if (applied.batterDone) this.playerLineup += 1;
      if (isHalfOver(this.halfState)) {
        this.endHalf();
      } else if (applied.batterDone) {
        this.nextPlayerBatter();
      } else {
        this.throwPitch(); // same batter (foul, or a non-terminal strike)
      }
    });
  }

  // --- Opponent half (auto-simulated on a timer) --------------------------
  private autoSimStep(): void {
    if (isHalfOver(this.halfState)) {
      this.endHalf();
      return;
    }
    const batter = getCharacter(this.aiTeam[this.aiLineup % TEAM_SIZE]);
    const band = autoBand(batter.stats.contact);
    const result = resolveSwing(band, batter, this.playerPitcher, () => Math.random());
    const applied = applyAtBat(this.halfState, result);
    this.halfState = applied.state;
    if (applied.runsScored > 0) this.aiScore += applied.runsScored;

    const color = result.kind === 'hit' ? COLORS.gold : COLORS.red;
    let msg = `${batter.name}: ${result.description}`;
    if (applied.runsScored > 0) msg += `  (+${applied.runsScored})`;
    this.flashAnnounce(msg, color, 500);
    this.refreshHud();

    if (applied.batterDone) this.aiLineup += 1;
    this.time.delayedCall(650, () => this.autoSimStep());
  }

  // --- Little visual helpers ----------------------------------------------
  private showBatter(char: Character): void {
    this.batterSprite?.destroy();
    this.batterSprite = this.add.image(PLATE.x - 66, PLATE.y, char.id).setOrigin(0.5, 1);
    this.batterSprite.setScale(150 / this.batterSprite.height);
    this.batterSprite.setFlipX(true); // face the mound
    this.tweens.add({
      targets: this.batterSprite,
      scale: { from: (150 / this.batterSprite.height) * 1.15, to: 150 / this.batterSprite.height },
      duration: 200,
      ease: 'Back.out',
    });
  }

  private animateSwing(): void {
    if (!this.batterSprite) return;
    this.tweens.add({
      targets: this.batterSprite,
      angle: { from: -8, to: 12 },
      duration: 120,
      yoyo: true,
    });
  }

  private flashAnnounce(text: string, color: number, hold = 700): void {
    this.announce.setText(text);
    this.announce.setColor('#' + color.toString(16).padStart(6, '0'));
    this.announce.setScale(0.6);
    this.announce.setAlpha(1);
    this.tweens.add({
      targets: this.announce,
      scale: 1,
      duration: 180,
      ease: 'Back.out',
    });
    this.tweens.add({
      targets: this.announce,
      alpha: 0,
      delay: hold,
      duration: 250,
    });
  }

  private bindSwingInput(): void {
    this.input.on('pointerdown', () => this.onSwing());
    this.input.keyboard?.on('keydown-SPACE', () => this.onSwing());
  }
}

// --- helpers ---------------------------------------------------------------

function bestPitcher(teamIds: string[]): Character {
  return teamIds
    .map(getCharacter)
    .reduce((best, c) => (c.stats.pitching > best.stats.pitching ? c : best));
}

/** Auto-sim swing quality, weighted by the batter's contact stat. */
function autoBand(contact: number): SwingBand {
  const r = Math.random() + (contact - 5) * 0.035;
  if (r > 0.86) return 'perfect';
  if (r > 0.58) return 'good';
  if (r > 0.3) return 'weak';
  return 'miss';
}
