// ---------------------------------------------------------------------------
// The game. BOTH halves are interactive with the same one-button timing input:
// the player bats the top of each inning (swing when the ring closes) and
// PITCHES the bottom (throw when the mound ring closes — a good throw drags the
// CPU batter's swing down). Walks, walk-offs, and one bonus inning on a tie.
//
// This scene owns all the "juice": ball tracking, a timing ring, contact pops,
// screen shake, ball flight, animated baserunning, and sound. The RULES still
// live in the pure systems/ reducers — this scene just plays back what they say.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  COLORS,
  PITCH_TRAVEL_MS,
  PITCH_METER_MS,
  PITCH_AUTO_THROW_MS,
  CPU_PITCH_TRAVEL_MS,
  CPU_STEP_DELAY_MS,
  INNINGS,
  MAX_EXTRA_INNINGS,
  TEAM_SIZE,
  SHAKE,
  RUNNER_TWEEN_MS,
  SHOW_TIMING_RING,
  ANIM,
} from '../config';
import type { Character, TeamState } from '../data/types';
import { getCharacter } from '../data/characters';
import {
  bandFromError,
  resolveSwing,
  type SwingBand,
  type AtBatResult,
} from '../systems/atbat';
import {
  pitchBandFromError,
  resolveCpuPitch,
  rollAiWildPitch,
  wildSwingBand,
  type PitchBand,
  type CpuPitchPlan,
} from '../systems/pitch';
import { shouldSkipBottom, isWalkOff, decideAfterHalf } from '../systems/gameflow';
import {
  newHalfInning,
  applyAtBat,
  isHalfOver,
  type HalfInningState,
  type RunnerMove,
} from '../systems/inning';
import { recordGamePlayed } from '../systems/picklog';
import * as audio from '../systems/audio';
import { screenShake, burst, floatingText } from '../ui/effects';
import { makeMuteButton } from '../ui/MuteButton';
import { FONT, OUTLINE } from '../ui/theme';
import { idleBob, squashHop, groundShadow, runCycle } from '../ui/anim';

/** 'pitching' = ball is inbound, swing now. 'aiming' = you're on the mound, throw now. */
type Phase = 'pitching' | 'resolving' | 'aiming' | 'ended';

const BALL_GREEN = 0x57d977; // "good eye" green for called balls

const BAT_REST = -42; // resting angle (bat on the shoulder)
const BAT_SWING = 66; // follow-through angle
const RUNNER_H = 66; // runner sprite height

// Field geometry — a clean diamond seen from behind home plate.
const HOME = { x: 480, y: 500 };
const FIRST = { x: 662, y: 358 };
const SECOND = { x: 480, y: 216 };
const THIRD = { x: 298, y: 358 };
const MOUND = { x: 480, y: 356 };

/** Position for a base index: 0 & 4 = home, 1/2/3 = the bases. */
function basePos(idx: number): { x: number; y: number } {
  switch (idx) {
    case 1:
      return FIRST;
    case 2:
      return SECOND;
    case 3:
      return THIRD;
    default:
      return HOME; // 0 (batter) and 4 (scored)
  }
}

export class GameScene extends Phaser.Scene {
  private playerTeam!: string[];
  private aiTeam!: string[];
  private aiPitcher!: Character;
  private playerPitcher!: Character;

  private inning = 1;
  private half: 'top' | 'bottom' = 'top';
  private playerScore = 0;
  private aiScore = 0;
  private playerLineup = 0;
  private aiLineup = 0;
  private firstPitchOfGame = true;
  private firstDefenseOfGame = true;

  private halfState!: HalfInningState;
  private phase: Phase = 'resolving';

  // per-pitch visuals
  private ball?: Phaser.GameObjects.Arc;
  private ballShadow?: Phaser.GameObjects.Ellipse;
  private ringShrink?: Phaser.GameObjects.Arc;
  private ringTarget?: Phaser.GameObjects.Arc;
  private trailTimer?: Phaser.Time.TimerEvent;
  private pitchStart = 0;
  private swung = false;
  private batter!: Character;
  private pitchIsWild = false;

  // defense half (the player pitches)
  private cpuBatter!: Character;
  private meterStart = 0;
  private threw = false;
  private autoThrowTimer?: Phaser.Time.TimerEvent;

  // baserunners currently on the diamond, keyed by base (1-3) — each is the kid
  private runners = new Map<number, Phaser.GameObjects.Container>();

  // display objects
  private batterSprite?: Phaser.GameObjects.Image;
  private batterScale = 1;
  private batterIdle?: Phaser.Tweens.Tween;
  private bat?: Phaser.GameObjects.Container;
  private pitcherSprite?: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private inningText!: Phaser.GameObjects.Text;
  private outsText!: Phaser.GameObjects.Text;
  private ballsPips!: Phaser.GameObjects.Text;
  private strikesPips!: Phaser.GameObjects.Text;
  private announce!: Phaser.GameObjects.Text;
  private announceBg!: Phaser.GameObjects.Rectangle;
  private baseMarks: Phaser.GameObjects.Rectangle[] = [];
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
    this.firstPitchOfGame = true;
    this.firstDefenseOfGame = true;
    this.baseMarks = [];
    this.runners = new Map();
    this.pitchIsWild = false;
    this.threw = false;
    this.autoThrowTimer = undefined;
  }

  create(): void {
    this.aiPitcher = bestPitcher(this.aiTeam);
    this.playerPitcher = bestPitcher(this.playerTeam);
    recordGamePlayed();
    this.cameras.main.fadeIn(250, 0x5b, 0xbf, 0x5a);

    this.drawField();
    this.drawHud();
    this.bindSwingInput();
    makeMuteButton(this, GAME_WIDTH - 30, 68);

    this.pitcherSprite = this.add.image(MOUND.x, MOUND.y, this.aiPitcher.id).setOrigin(0.5, 1);
    this.pitcherSprite.setScale(110 / this.pitcherSprite.height);
    idleBob(this, this.pitcherSprite, { amp: 4, dur: 1100 }); // gentle breathing (y); wind-up uses angle
    this.setMoundPitcher(this.aiPitcher);

    this.startHalf();
  }

  // --- Field & HUD ---------------------------------------------------------
  private drawField(): void {
    const W = GAME_WIDTH;
    const HORIZON = 210; // grass starts here; sky/crowd/fence above

    // Base grass fill (prevents any gaps behind everything else).
    this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, COLORS.grass);

    // --- Sky (gradient) ---
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x8fd0ff, 0x8fd0ff, 0xd4efff, 0xd4efff, 1);
    sky.fillRect(0, 68, W, HORIZON - 68);
    // Sun + soft glow, top-right.
    this.add.circle(858, 108, 46, 0xfff2b0, 0.5);
    this.add.circle(858, 108, 30, 0xffe066, 1);
    // A couple of clouds.
    this.cloud(150, 110);
    this.cloud(520, 96);

    // --- Stands + crowd ---
    this.add.rectangle(W / 2, 168, W, 44, 0x5b6a7a).setOrigin(0.5);
    const crowdColors = [0xeb5a52, 0x3f86e0, 0x43b56f, 0x9161d0, 0xff924a, 0xf5c542, 0xffffff, 0x2fb4ac];
    for (let i = 0; i < 110; i++) {
      const x = Math.random() * W;
      const y = 150 + Math.random() * 32;
      this.add.circle(x, y, 4 + Math.random() * 2, crowdColors[(Math.random() * crowdColors.length) | 0]);
    }

    // --- Outfield fence (wall + padded cap + bunting) ---
    this.add.rectangle(W / 2, 200, W, 26, 0x2f9e73).setOrigin(0.5); // green wall
    this.add.rectangle(W / 2, 189, W, 8, COLORS.gold).setOrigin(0.5); // yellow cap
    // Bunting triangles hanging off the cap (Graphics — Triangle shapes are
    // unreliable about fills, and the old fractional index passed undefined).
    const bunt = [0xeb5a52, 0xffffff, 0x3f86e0];
    for (let x = 20; x < W; x += 60) {
      const pennant = this.add.graphics({ x, y: 193 }).setAlpha(0.9);
      pennant.fillStyle(bunt[Math.floor(x / 60) % bunt.length], 1);
      pennant.fillTriangle(-20, 0, 20, 0, 0, 22);
    }

    // --- Grass mowing stripes (subtle) ---
    for (let x = 0; x < W; x += 96) {
      if (((x / 96) & 1) === 0)
        this.add.rectangle(x + 48, (HORIZON + GAME_HEIGHT) / 2, 96, GAME_HEIGHT - HORIZON, COLORS.grassDark, 0.35).setOrigin(0.5);
    }

    // --- Infield dirt diamond ---
    // NOTE: Phaser polygon points must be 0-based (no negatives) — negative
    // coords get double-shifted by the display origin and land off-field.
    const cx = (FIRST.x + THIRD.x) / 2;
    const cy = (SECOND.y + HOME.y) / 2;
    const dw = FIRST.x - THIRD.x; // diamond bounds
    const dh = HOME.y - SECOND.y;
    this.add
      .polygon(cx, cy, [dw / 2, 0, dw, dh / 2, dw / 2, dh, 0, dh / 2], COLORS.dirt)
      .setOrigin(0.5)
      .setStrokeStyle(3, 0xb87a3f);
    // Grass "cutout" in the middle of the infield for that manicured look.
    this.add
      .polygon(cx, cy + 6, [78, 0, 156, 58, 78, 116, 0, 58], COLORS.grass)
      .setOrigin(0.5);

    // --- Foul lines (home out past the corners) ---
    const lines = this.add.graphics();
    lines.lineStyle(4, 0xffffff, 0.85);
    lines.lineBetween(HOME.x, HOME.y, 828, HORIZON);
    lines.lineBetween(HOME.x, HOME.y, 132, HORIZON);

    // Base paths.
    const paths = this.add.graphics();
    paths.lineStyle(5, 0xe9d9bf, 0.6);
    paths.strokePoints(
      [HOME, FIRST, SECOND, THIRD, HOME].map((p) => new Phaser.Math.Vector2(p.x, p.y)),
      true
    );

    // --- Pitcher's mound + rubber ---
    this.add.ellipse(MOUND.x, MOUND.y + 4, 92, 60, COLORS.dirt).setStrokeStyle(3, 0xb87a3f);
    this.add.rectangle(MOUND.x, MOUND.y, 26, 8, COLORS.white).setStrokeStyle(2, 0x9a9a9a);

    // --- Home plate (pentagon) ---
    this.add
      .polygon(HOME.x, HOME.y + 6, [0, 0, 26, 0, 26, 12, 13, 22, 0, 12], COLORS.white)
      .setStrokeStyle(3, COLORS.ink)
      .setOrigin(0.5);
    // Batter's boxes.
    const box = this.add.graphics();
    box.lineStyle(3, 0xffffff, 0.7);
    box.strokeRect(HOME.x - 58, HOME.y - 20, 26, 52);
    box.strokeRect(HOME.x + 32, HOME.y - 20, 26, 52);

    // --- Base plates (white squares, lit gold when occupied) ---
    [FIRST, SECOND, THIRD].forEach((p, i) => {
      const plate = this.add
        .rectangle(p.x, p.y, 22, 22, COLORS.white)
        .setStrokeStyle(3, COLORS.ink)
        .setAngle(45);
      this.baseMarks[i] = plate;
    });
  }

  /** A simple two-lobe cloud. */
  private cloud(x: number, y: number): void {
    this.add.circle(x, y, 20, 0xffffff);
    this.add.circle(x + 24, y + 4, 26, 0xffffff);
    this.add.circle(x + 52, y, 18, 0xffffff);
    this.add.ellipse(x + 26, y + 14, 80, 24, 0xffffff);
  }

  private drawHud(): void {
    this.add.rectangle(GAME_WIDTH / 2, 34, GAME_WIDTH, 68, COLORS.ink, 0.82).setOrigin(0.5);
    this.scoreText = this.add
      .text(24, 20, '', { fontFamily: FONT, fontSize: '30px', color: '#ffffff' })
      .setOrigin(0, 0);
    this.inningText = this.add
      .text(GAME_WIDTH / 2, 20, '', {
        fontFamily: FONT,
        fontSize: '26px',
        color: '#ffce3a',
      })
      .setOrigin(0.5, 0);
    this.outsText = this.add
      .text(GAME_WIDTH - 70, 14, '', {
        fontFamily: FONT,
        fontSize: '26px',
        color: '#ffffff',
      })
      .setOrigin(1, 0);
    // Ball/strike count as wordless pips: green = balls, red = strikes.
    this.strikesPips = this.add
      .text(GAME_WIDTH - 70, 44, '', { fontFamily: FONT, fontSize: '17px', color: '#ff7a70' })
      .setOrigin(1, 0);
    this.ballsPips = this.add
      .text(GAME_WIDTH - 126, 44, '', { fontFamily: FONT, fontSize: '17px', color: '#57d977' })
      .setOrigin(1, 0);

    // Announcer lives in its own band below the HUD so it never sits on a sprite.
    this.announceBg = this.add
      .rectangle(GAME_WIDTH / 2, 108, 640, 62, COLORS.ink, 0.55)
      .setOrigin(0.5)
      .setDepth(90)
      .setAlpha(0);
    this.announce = this.add
      .text(GAME_WIDTH / 2, 108, '', {
        fontFamily: FONT,
        fontSize: '38px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setStroke('#14202e', 7)
      .setDepth(91);

    this.batterLabel = this.add
      .text(HOME.x, HOME.y + 34, '', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5)
      .setStroke('#14202e', 5)
      .setDepth(30);

    this.refreshHud();
  }

  private refreshHud(): void {
    this.scoreText.setText(`YOU ${this.playerScore}   —   ${this.aiScore} CPU`);
    const halfLabel = this.half === 'top' ? '▲' : '▼';
    this.inningText.setText(
      this.inning > INNINGS
        ? `${halfLabel} BONUS INNING`
        : `${halfLabel} Inning ${this.inning}/${INNINGS}`
    );
    const outs = this.halfState ? this.halfState.outs : 0;
    this.outsText.setText(`Outs: ${'●'.repeat(outs)}${'○'.repeat(3 - outs)}`);
    const balls = this.halfState ? this.halfState.count.balls : 0;
    const strikes = this.halfState ? this.halfState.count.strikes : 0;
    this.ballsPips.setText(`${'●'.repeat(balls)}${'○'.repeat(3 - balls)}`);
    this.strikesPips.setText(`${'●'.repeat(strikes)}${'○'.repeat(2 - strikes)}`);
    for (let i = 0; i < 3; i++) {
      const lit = this.halfState?.bases[i];
      this.baseMarks[i]?.setFillStyle(lit ? COLORS.gold : COLORS.white);
    }
  }

  // --- Half-inning orchestration ------------------------------------------
  private startHalf(): void {
    this.halfState = newHalfInning();
    this.clearRunners();
    this.refreshHud();
    if (this.half === 'top') {
      this.setMoundPitcher(this.aiPitcher);
      this.flashAnnounce(`Inning ${this.inning}\nYOU'RE UP!`, COLORS.gold);
      if (this.firstPitchOfGame) audio.say('Play ball!');
      this.time.delayedCall(1100, () => this.nextPlayerBatter());
    } else {
      this.setMoundPitcher(this.playerPitcher);
      this.flashAnnounce('YOU PITCH!\nGET 3 OUTS', COLORS.gold);
      if (this.firstDefenseOfGame) {
        audio.say('You pitch! Throw when the ring closes!');
        this.firstDefenseOfGame = false;
      }
      this.time.delayedCall(1100, () => this.nextCpuBatter());
    }
  }

  /** Put a kid on the mound (the AI's ace in the top, YOUR ace in the bottom). */
  private setMoundPitcher(char: Character): void {
    const p = this.pitcherSprite;
    if (!p || p.texture.key === char.id) return;
    p.setTexture(char.id);
    p.setScale(110 / p.height);
  }

  private endHalf(): void {
    // Home (CPU) already leads after the top of the final inning: their
    // at-bats can't change anything, so the game just ends.
    if (
      this.half === 'top' &&
      shouldSkipBottom(this.inning, INNINGS, this.aiScore, this.playerScore)
    ) {
      this.flashAnnounce('GAME OVER!', COLORS.red, 900);
      this.time.delayedCall(1000, () => this.gameOver());
      return;
    }

    const next = decideAfterHalf(
      this.inning,
      this.half,
      INNINGS,
      this.playerScore,
      this.aiScore,
      MAX_EXTRA_INNINGS
    );
    if (next.done) {
      this.gameOver();
      return;
    }
    this.inning = next.inning;
    this.half = next.half;
    if (next.extra) {
      this.flashAnnounce('TIE GAME!\nBONUS INNING!', COLORS.gold, 1100);
      audio.say('Bonus inning!');
      this.time.delayedCall(1300, () => this.startHalf());
    } else {
      this.startHalf();
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

    if (this.batter.ability === 'calls_shot') {
      this.flashAnnounce('"HOME RUN,\nCALLED IT!"', COLORS.white, 900);
      this.time.delayedCall(950, () => this.throwPitch());
    } else {
      this.throwPitch();
    }
  }

  private throwPitch(): void {
    // Wind up first, then release. Input is ignored until the ball is live.
    this.phase = 'resolving';
    this.pitcherWindup();
    this.time.delayedCall(ANIM.WINDUP_MS, () => this.launchPitch());
  }

  private pitcherWindup(): void {
    const p = this.pitcherSprite;
    if (!p) return;
    // Only touches angle/scaleY, so it coexists with the idle y-bob.
    this.tweens.chain({
      targets: p,
      tweens: [
        { angle: -13, scaleY: p.scaleX * 1.05, duration: ANIM.WINDUP_MS * 0.55, ease: 'Quad.out' },
        { angle: 11, scaleY: p.scaleX * 0.97, duration: ANIM.WINDUP_MS * 0.45, ease: 'Quad.in' },
        { angle: 0, scaleY: p.scaleX, duration: 220, ease: 'Sine.out' },
      ],
    });
  }

  private launchPitch(): void {
    this.phase = 'pitching';
    this.swung = false;
    this.pitchStart = this.time.now;
    this.firstPitchOfGame = false;
    // Sometimes the AI throws a WILD one — telegraphed in red, visibly off the
    // plate. Don't swing at those! Taking it earns a ball (4 = walk).
    this.pitchIsWild = rollAiWildPitch(this.aiPitcher, () => Math.random());
    const wild = this.pitchIsWild;
    const plateX = wild ? HOME.x + (Math.random() < 0.5 ? -48 : 48) : HOME.x;
    audio.pitchWoosh();

    // Timing ring: a white ring shrinks to meet the gold target ring exactly
    // when the ball reaches the plate — swing when they line up. On a wild
    // pitch the shrink ring turns red: the "let it go" cue.
    if (SHOW_TIMING_RING) {
      this.ringTarget = this.add.circle(HOME.x, HOME.y - 26, 30).setStrokeStyle(4, COLORS.gold).setDepth(15);
      this.ringShrink = this.add
        .circle(HOME.x, HOME.y - 26, 30)
        .setStrokeStyle(5, wild ? COLORS.red : COLORS.white)
        .setDepth(16);
      this.ringShrink.setScale(3.6);
      this.tweens.add({
        targets: this.ringShrink,
        scale: 1,
        duration: PITCH_TRAVEL_MS,
        ease: 'Sine.in',
      });
    }

    // Ball + a shadow that grows as it nears the plate (depth cue).
    this.ballShadow = this.add.ellipse(MOUND.x, MOUND.y + 6, 18, 7, COLORS.ink, 0.3).setDepth(14);
    this.ball = this.add
      .circle(MOUND.x, MOUND.y - 36, 10, wild ? 0xffd6d0 : COLORS.white)
      .setDepth(20);
    this.ball.setStrokeStyle(2, wild ? COLORS.red : COLORS.ink);

    this.tweens.add({
      targets: this.ball,
      x: plateX,
      y: HOME.y - 26,
      scale: { from: 0.7, to: 1.7 },
      duration: PITCH_TRAVEL_MS,
      ease: wild ? 'Sine.inOut' : 'Sine.in',
      onComplete: () => {
        if (!this.swung && this.phase === 'pitching') this.resolvePlayerSwing('miss', true);
      },
    });
    this.tweens.add({
      targets: this.ballShadow,
      x: plateX,
      y: HOME.y + 8,
      scaleX: 2,
      scaleY: 2,
      duration: PITCH_TRAVEL_MS,
      ease: 'Sine.in',
    });

    // A faint fading trail behind the ball.
    this.trailTimer = this.time.addEvent({
      delay: 45,
      loop: true,
      callback: () => {
        if (!this.ball) return;
        const dot = this.add
          .circle(this.ball.x, this.ball.y, 6 * this.ball.scale, COLORS.white, 0.4)
          .setDepth(19);
        this.tweens.add({ targets: dot, alpha: 0, duration: 220, onComplete: () => dot.destroy() });
      },
    });
  }

  private clearPitchVisuals(): void {
    this.trailTimer?.remove();
    this.trailTimer = undefined;
    this.ball?.destroy();
    this.ball = undefined;
    this.ballShadow?.destroy();
    this.ballShadow = undefined;
    this.ringShrink?.destroy();
    this.ringShrink = undefined;
    this.ringTarget?.destroy();
    this.ringTarget = undefined;
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
    this.clearPitchVisuals();

    if (took) {
      if (this.pitchIsWild) {
        // Good eye! Letting a wild one go is a ball.
        floatingText(this, HOME.x, HOME.y - 60, 'BALL!', BALL_GREEN, 30);
        this.applyAndContinue({ kind: 'ball', bases: 0, description: 'Ball! Good eye!' });
      } else {
        floatingText(this, HOME.x, HOME.y - 60, 'STRIKE!', COLORS.red, 30);
        this.applyAndContinue({ kind: 'strike', bases: 0, description: 'Strike! (took it)' });
      }
      return;
    }

    // Chasing a wild pitch caps the swing — the telegraph is the lesson.
    if (this.pitchIsWild) band = wildSwingBand(band);

    this.animateSwing();
    this.showBandFeedback(band);

    const result = resolveSwing(band, this.batter, this.aiPitcher, () => Math.random());
    if (result.kind === 'hit') {
      audio.crack();
      this.flyHitBall(result.bases);
      screenShake(this, shakeFor(result.bases));
    } else if (result.kind === 'strike') {
      audio.whiff();
    } else if (result.kind === 'foul') {
      audio.crack();
    }
    this.applyAndContinue(result);
  }

  private applyAndContinue(result: AtBatResult): void {
    const prevBatter = this.batter;
    const applied = applyAtBat(this.halfState, result);
    this.halfState = applied.state;
    if (applied.runsScored > 0) this.playerScore += applied.runsScored;

    const walked = result.kind === 'ball' && applied.batterDone;

    // Baserunning animation, driven by the reducer's movement list (hit or walk).
    let runDelay = 0;
    if (applied.movements.length > 0) {
      runDelay = this.animateBaserunning(applied.movements, prevBatter);
      this.fadeOutBatter();
    }

    if (applied.runsScored > 0) {
      audio.cheer();
      if (result.bases >= 4) audio.say('Home run!');
    }
    if (walked) audio.say('Take your base!');

    const color =
      result.kind === 'hit'
        ? COLORS.gold
        : result.kind === 'ball'
          ? BALL_GREEN
          : result.kind === 'foul'
            ? COLORS.white
            : COLORS.red;
    let msg = walked ? 'WALK!' : result.description;
    if (applied.runsScored > 0)
      msg += `\n+${applied.runsScored} RUN${applied.runsScored > 1 ? 'S' : ''}!`;
    this.flashAnnounce(msg, color);
    this.refreshHud();

    const baseDelay = applied.movements.length > 0 ? Math.max(1000, runDelay + 350) : 850;
    this.time.delayedCall(baseDelay, () => {
      if (applied.batterDone) this.playerLineup += 1;
      if (isHalfOver(this.halfState)) {
        this.endHalf();
      } else if (applied.batterDone) {
        this.nextPlayerBatter();
      } else {
        this.throwPitch();
      }
    });
  }

  // --- Animated baserunning -----------------------------------------------
  /** Move the kids around the bases per the reducer's movements. Returns the duration. */
  private animateBaserunning(movements: RunnerMove[], batter: Character): number {
    const next = new Map<number, Phaser.GameObjects.Container>();
    let maxBases = 0;

    for (const m of movements) {
      maxBases = Math.max(maxBases, m.toBase - m.fromBase);
      // The batter (fromBase 0) gets a fresh runner at home; others already exist.
      let token = m.fromBase === 0 ? this.makeRunner(batter) : this.runners.get(m.fromBase);
      if (!token) token = this.makeRunner(batter); // safety
      this.runners.delete(m.fromBase);
      const img = token.getAt(1) as Phaser.GameObjects.Image; // [0]=shadow, [1]=kid
      const runnerId = token.getData('id') as string;

      // Each leg flips the sprite to face its direction of travel.
      const legs: Array<{
        x: number;
        y: number;
        duration: number;
        ease: string;
        onStart?: () => void;
      }> = [];
      let fromP = basePos(m.fromBase);
      for (let b = m.fromBase + 1; b <= m.toBase; b++) {
        const p = basePos(b);
        const facesLeft = p.x < fromP.x;
        legs.push({
          x: p.x,
          y: p.y,
          duration: RUNNER_TWEEN_MS,
          ease: 'Sine.inOut',
          onStart: () => img.setFlipX(facesLeft),
        });
        fromP = p;
      }

      const scored = m.toBase >= 4;
      if (legs.length > 0) {
        // Real run frames + a small bob while the container travels.
        const cycle = runCycle(this, img, runnerId);
        const bounce = this.tweens.add({
          targets: img,
          y: -3,
          duration: RUNNER_TWEEN_MS / 2,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
        this.tweens.chain({
          targets: token,
          tweens: legs,
          onComplete: () => {
            cycle.stop(true);
            bounce.stop();
            img.y = 0;
            img.setFlipX(false);
            if (scored) {
              squashHop(this, img, { height: 20 });
              burst(this, HOME.x, HOME.y - 20, COLORS.gold, 14);
              this.time.delayedCall(520, () => token!.destroy());
            } else {
              this.tweens.add({ targets: img, scaleY: img.scaleY * 0.85, yoyo: true, duration: 90 });
            }
          },
        });
      }
      if (!scored) next.set(m.toBase, token);
    }

    this.runners = next;
    return maxBases * RUNNER_TWEEN_MS;
  }

  /** A baserunner = the actual kid (over a ground shadow), in a container. */
  private makeRunner(char: Character): Phaser.GameObjects.Container {
    const c = this.add.container(HOME.x, HOME.y - 6).setDepth(40);
    const shadow = groundShadow(this, 0, 4, 36);
    const img = this.add.image(0, 0, char.id).setOrigin(0.5, 0.92);
    img.setScale(RUNNER_H / img.height);
    c.add([shadow, img]);
    c.setData('id', char.id);
    return c;
  }

  private clearRunners(): void {
    this.runners.forEach((t) => t.destroy());
    this.runners.clear();
  }

  /** Arc the hit ball out toward the outfield; distance scales with the hit. */
  private flyHitBall(bases: number): void {
    const targets: Record<number, { x: number; y: number }> = {
      1: { x: 380 + Math.random() * 200, y: 250 },
      2: { x: Math.random() < 0.5 ? 320 : 640, y: 170 },
      3: { x: Math.random() < 0.5 ? 300 : 660, y: 120 },
      4: { x: 360 + Math.random() * 240, y: -70 },
    };
    const dest = targets[bases] ?? targets[1];
    const hitBall = this.add.circle(HOME.x, HOME.y - 26, 11, COLORS.white).setStrokeStyle(2, COLORS.ink).setDepth(25);
    this.tweens.add({
      targets: hitBall,
      x: dest.x,
      y: dest.y,
      scale: 0.4,
      duration: 700,
      ease: 'Sine.out',
      onComplete: () => hitBall.destroy(),
    });
  }

  // --- Opponent half (YOU pitch — same one-button timing, on the mound) ----
  private nextCpuBatter(): void {
    if (isHalfOver(this.halfState)) {
      this.endHalf();
      return;
    }
    this.cpuBatter = getCharacter(this.aiTeam[this.aiLineup % TEAM_SIZE]);
    this.showBatter(this.cpuBatter, true); // jogs in from the dugout
    this.batterLabel.setText(this.cpuBatter.name);
    this.time.delayedCall(520, () => this.startPitchMeter());
  }

  /**
   * The mound ring: shrinks onto the target over PITCH_METER_MS — press right
   * when it closes for a perfect pitch. An idle kid never stalls the game: a
   * fallback auto-throw fires shortly after the moment (late = weak/wild).
   */
  private startPitchMeter(): void {
    this.phase = 'aiming';
    this.threw = false;
    this.meterStart = this.time.now;
    this.ringTarget = this.add
      .circle(MOUND.x, MOUND.y - 46, 26)
      .setStrokeStyle(4, COLORS.gold)
      .setDepth(15);
    this.ringShrink = this.add
      .circle(MOUND.x, MOUND.y - 46, 26)
      .setStrokeStyle(5, COLORS.white)
      .setDepth(16);
    this.ringShrink.setScale(3.2);
    this.tweens.add({
      targets: this.ringShrink,
      scale: 1,
      duration: PITCH_METER_MS,
      ease: 'Sine.in',
    });
    this.autoThrowTimer = this.time.delayedCall(PITCH_METER_MS + PITCH_AUTO_THROW_MS, () =>
      this.onThrow()
    );
  }

  private onThrow(): void {
    if (this.phase !== 'aiming' || this.threw) return;
    this.threw = true;
    const error = this.time.now - this.meterStart - PITCH_METER_MS;
    this.resolvePlayerPitch(pitchBandFromError(error));
  }

  /** Public for the same headless/dev driving as resolvePlayerSwing. */
  resolvePlayerPitch(band: PitchBand): void {
    this.phase = 'resolving';
    this.autoThrowTimer?.remove();
    this.autoThrowTimer = undefined;
    this.clearPitchVisuals();
    this.showPitchFeedback(band);
    this.pitcherWindup();

    // The CPU batter's plan is pure logic; the scene just acts it out.
    const plan = resolveCpuPitch(band, this.playerPitcher, this.cpuBatter, () => Math.random());
    this.time.delayedCall(ANIM.WINDUP_MS, () => this.launchCpuPitch(band, plan));
  }

  /** Fast ball flight mound -> plate; wild pitches fly red and off-target. */
  private launchCpuPitch(band: PitchBand, plan: CpuPitchPlan): void {
    audio.pitchWoosh();
    const wild = band === 'wild';
    const plateX = plan.isBall ? HOME.x + (Math.random() < 0.5 ? -48 : 48) : HOME.x;
    const ball = this.add
      .circle(MOUND.x, MOUND.y - 36, 9, wild ? 0xffd6d0 : COLORS.white)
      .setStrokeStyle(2, wild ? COLORS.red : COLORS.ink)
      .setDepth(20);
    this.tweens.add({
      targets: ball,
      x: plateX,
      y: HOME.y - 26,
      scale: { from: 0.7, to: 1.5 },
      duration: CPU_PITCH_TRAVEL_MS,
      ease: 'Sine.in',
      onComplete: () => {
        ball.destroy();
        this.settleCpuPitch(plan);
      },
    });
  }

  private settleCpuPitch(plan: CpuPitchPlan): void {
    if (!plan.cpuSwings) {
      if (plan.isBall) {
        floatingText(this, HOME.x, HOME.y - 60, 'BALL!', BALL_GREEN, 28);
        this.applyCpuResult({ kind: 'ball', bases: 0, description: 'Ball!' });
      } else {
        floatingText(this, HOME.x, HOME.y - 60, 'STRIKE!', COLORS.gold, 28);
        audio.whiff();
        this.applyCpuResult({ kind: 'strike', bases: 0, description: 'Strike! Looking!' });
      }
      return;
    }

    this.animateSwing();
    const result = resolveSwing(plan.cpuBand, this.cpuBatter, this.playerPitcher, () =>
      Math.random()
    );
    if (result.kind === 'hit') {
      audio.crack();
      this.flyHitBall(result.bases);
      screenShake(this, shakeFor(result.bases));
    } else if (result.kind === 'strike') {
      audio.whiff();
    } else if (result.kind === 'foul') {
      audio.crack();
    }
    this.applyCpuResult(result);
  }

  private applyCpuResult(result: AtBatResult): void {
    const prevBatter = this.cpuBatter;
    const applied = applyAtBat(this.halfState, result);
    this.halfState = applied.state;
    if (applied.runsScored > 0) this.aiScore += applied.runsScored;

    const walked = result.kind === 'ball' && applied.batterDone;

    let runDelay = 0;
    if (applied.movements.length > 0) {
      runDelay = this.animateBaserunning(applied.movements, prevBatter);
      this.fadeOutBatter();
    }

    if (applied.runsScored > 0) audio.cheer();

    const color =
      result.kind === 'hit'
        ? COLORS.gold
        : result.kind === 'ball'
          ? BALL_GREEN
          : result.kind === 'out' || result.kind === 'strike'
            ? COLORS.gold // an out for THEM is good news for you
            : COLORS.white;
    let msg = walked
      ? `${prevBatter.name} walks!`
      : `${prevBatter.name}: ${result.description}`;
    if (applied.runsScored > 0)
      msg += `\n+${applied.runsScored} FOR CPU`;
    this.flashAnnounce(msg, color, 600);
    this.refreshHud();

    // Walk-off: the CPU just took the lead in the bottom of the final inning.
    if (isWalkOff(this.inning, INNINGS, this.half, this.aiScore, this.playerScore)) {
      this.phase = 'ended';
      this.flashAnnounce('WALK-OFF!\nCPU WINS!', COLORS.red, 1300);
      this.time.delayedCall(Math.max(1400, runDelay + 500), () => this.gameOver());
      return;
    }

    const delay = Math.max(CPU_STEP_DELAY_MS, runDelay + 350);
    this.time.delayedCall(delay, () => {
      if (applied.batterDone) this.aiLineup += 1;
      if (isHalfOver(this.halfState)) {
        this.endHalf();
      } else if (applied.batterDone) {
        this.nextCpuBatter();
      } else {
        this.startPitchMeter();
      }
    });
  }

  private showPitchFeedback(band: PitchBand): void {
    const map: Record<PitchBand, { label: string; color: number }> = {
      perfect: { label: 'PERFECT!', color: COLORS.gold },
      good: { label: 'GOOD!', color: 0x3fae6b },
      weak: { label: 'ok', color: 0xff8c42 },
      wild: { label: 'WILD!', color: COLORS.red },
    };
    const f = map[band];
    floatingText(this, MOUND.x, MOUND.y - 90, f.label, f.color, band === 'perfect' ? 36 : 30);
  }

  // --- Little visual helpers ----------------------------------------------
  private showBatter(char: Character, walkIn = false): void {
    this.batterIdle?.stop();
    this.batterSprite?.destroy();
    this.bat?.destroy();

    const targetX = HOME.x - 70;
    const spr = this.add
      .image(walkIn ? GAME_WIDTH + 50 : targetX, HOME.y + 6, char.id)
      .setOrigin(0.5, 1)
      .setDepth(28);
    const s = 150 / spr.height;
    spr.setScale(s).setFlipX(true);
    this.batterSprite = spr;
    this.batterScale = s;

    if (walkIn) {
      // Jog to the plate with real run frames (facing left = flipX stays on).
      const cycle = runCycle(this, spr, char.id);
      this.tweens.add({
        targets: spr,
        x: targetX,
        duration: 460,
        ease: 'Sine.out',
        onComplete: () => {
          cycle.stop(true);
          if (this.batterSprite !== spr) return;
          spr.setFlipX(true);
          this.createBat(HOME.x - 50, HOME.y - 66);
          this.startBatterIdle(spr, s);
        },
      });
      return;
    }

    this.createBat(HOME.x - 50, HOME.y - 66);
    // Entrance, then a gentle "breathing" idle (scaleY only, so a swing can
    // still tilt/step the body without fighting it).
    this.tweens.add({
      targets: spr,
      scaleX: { from: s * 1.15, to: s },
      scaleY: { from: s * 1.15, to: s },
      duration: 200,
      ease: 'Back.out',
      onComplete: () => this.startBatterIdle(spr, s),
    });
  }

  private startBatterIdle(spr: Phaser.GameObjects.Image, s: number): void {
    if (this.batterSprite !== spr) return;
    this.batterIdle = this.tweens.add({
      targets: spr,
      scaleY: s * 1.04,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  /** A bat pivoted at the batter's hands, resting on the shoulder. */
  private createBat(px: number, py: number): void {
    const bat = this.add.container(px, py).setDepth(29);
    const g = this.add.graphics();
    g.fillStyle(0xd39a5c, 1);
    g.lineStyle(3.5, OUTLINE, 1);
    g.fillRoundedRect(-8, -84, 16, 46, 8); // barrel
    g.strokeRoundedRect(-8, -84, 16, 46, 8);
    g.fillRoundedRect(-5, -46, 10, 48, 5); // handle
    g.strokeRoundedRect(-5, -46, 10, 48, 5);
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(0, 0, 5); // knob at the grip
    bat.add(g);
    bat.setAngle(BAT_REST);
    this.bat = bat;
  }

  private fadeOutBatter(): void {
    this.batterIdle?.stop();
    // Fade the bat (not destroy) so the swing tween still reads while it leaves.
    const bat = this.bat;
    this.bat = undefined;
    if (bat) this.tweens.add({ targets: bat, alpha: 0, duration: 280, delay: 90, onComplete: () => bat.destroy() });
    if (!this.batterSprite) return;
    const s = this.batterSprite;
    this.batterSprite = undefined;
    this.tweens.add({ targets: s, alpha: 0, y: s.y - 8, duration: 300, delay: 90, onComplete: () => s.destroy() });
  }

  private animateSwing(): void {
    this.batterIdle?.stop();
    if (this.bat) {
      this.tweens.add({ targets: this.bat, angle: BAT_SWING, duration: ANIM.SWING_MS, yoyo: true, ease: 'Quad.out' });
    }
    const spr = this.batterSprite;
    if (spr) {
      spr.setScale(this.batterScale); // clear any mid-breath scale
      this.tweens.add({ targets: spr, angle: 9, duration: ANIM.SWING_MS, yoyo: true, ease: 'Quad.out' });
      this.tweens.add({ targets: spr, x: spr.x + 7, duration: ANIM.SWING_MS, yoyo: true, ease: 'Quad.out' });
    }
  }

  private showBandFeedback(band: SwingBand): void {
    const map: Record<SwingBand, { label: string; color: number }> = {
      perfect: { label: 'PERFECT!', color: COLORS.gold },
      good: { label: 'GOOD!', color: 0x3fae6b },
      weak: { label: 'ok', color: 0xff8c42 },
      miss: { label: 'MISS!', color: COLORS.red },
    };
    const f = map[band];
    floatingText(this, HOME.x, HOME.y - 70, f.label, f.color, band === 'perfect' ? 40 : 32);
  }

  private flashAnnounce(text: string, color: number, hold = 700): void {
    this.announce.setText(text);
    this.announce.setColor('#' + color.toString(16).padStart(6, '0'));
    this.announce.setScale(0.6);
    this.announce.setAlpha(1);
    this.announceBg.setAlpha(0.55);
    this.tweens.add({ targets: this.announce, scale: 1, duration: 180, ease: 'Back.out' });
    this.tweens.add({ targets: [this.announce, this.announceBg], alpha: 0, delay: hold, duration: 250 });
  }

  /** ONE button, routed by phase: batting -> swing, on the mound -> throw. */
  private bindSwingInput(): void {
    const press = () => {
      if (this.phase === 'pitching') this.onSwing();
      else if (this.phase === 'aiming') this.onThrow();
    };
    this.input.on('pointerdown', press);
    this.input.keyboard?.on('keydown-SPACE', press);
  }
}

// --- helpers ---------------------------------------------------------------

function bestPitcher(teamIds: string[]): Character {
  return teamIds
    .map(getCharacter)
    .reduce((best, c) => (c.stats.pitching > best.stats.pitching ? c : best));
}

function shakeFor(bases: number): number {
  switch (bases) {
    case 4:
      return SHAKE.homer;
    case 3:
      return SHAKE.triple;
    case 2:
      return SHAKE.double;
    default:
      return SHAKE.single;
  }
}
