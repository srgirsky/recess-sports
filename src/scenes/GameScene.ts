// ---------------------------------------------------------------------------
// The game. Player bats the top of each inning with the pitch-and-swing loop;
// the opponent's bottom half is auto-simulated so we only build ONE interactive
// batting surface. Two innings, then off to the Result screen.
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
  INNINGS,
  TEAM_SIZE,
  SHAKE,
  RUNNER_TWEEN_MS,
  SHOW_TIMING_RING,
} from '../config';
import type { Character, TeamState } from '../data/types';
import { getCharacter } from '../data/characters';
import { UNIFORM_COLORS } from '../art/palette';
import { bandFromError, resolveSwing, type SwingBand } from '../systems/atbat';
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
import { FONT } from '../ui/theme';

type Phase = 'pitching' | 'resolving' | 'auto' | 'ended';

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

function jerseyColor(char: Character): number {
  const hex = UNIFORM_COLORS[char.visual.uniform]?.jersey ?? '#ffffff';
  return parseInt(hex.slice(1), 16);
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

  // baserunners currently on the diamond, keyed by base (1-3)
  private runners = new Map<number, Phaser.GameObjects.Arc>();

  // display objects
  private batterSprite?: Phaser.GameObjects.Image;
  private pitcherSprite?: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private inningText!: Phaser.GameObjects.Text;
  private outsText!: Phaser.GameObjects.Text;
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
    this.baseMarks = [];
    this.runners = new Map();
  }

  create(): void {
    this.aiPitcher = bestPitcher(this.aiTeam);
    this.playerPitcher = bestPitcher(this.playerTeam);
    recordGamePlayed();

    this.drawField();
    this.drawHud();
    this.bindSwingInput();
    makeMuteButton(this, GAME_WIDTH - 30, 68);

    this.pitcherSprite = this.add.image(MOUND.x, MOUND.y, this.aiPitcher.id).setOrigin(0.5, 1);
    this.pitcherSprite.setScale(110 / this.pitcherSprite.height);

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
    // Bunting triangles hanging off the cap.
    const bunt = [0xeb5a52, 0xffffff, 0x3f86e0];
    for (let x = 20; x < W; x += 60) {
      this.add
        .triangle(x, 193, 0, 0, 40, 0, 20, 22, bunt[(x / 60) % bunt.length])
        .setOrigin(0.5, 0)
        .setAlpha(0.9);
    }

    // --- Grass mowing stripes (subtle) ---
    for (let x = 0; x < W; x += 96) {
      if (((x / 96) & 1) === 0)
        this.add.rectangle(x + 48, (HORIZON + GAME_HEIGHT) / 2, 96, GAME_HEIGHT - HORIZON, COLORS.grassDark, 0.35).setOrigin(0.5);
    }

    // --- Infield dirt diamond ---
    const cx = (FIRST.x + THIRD.x) / 2;
    const cy = (SECOND.y + HOME.y) / 2;
    this.add
      .polygon(cx, cy, [0, HOME.y - cy, FIRST.x - cx, 0, 0, SECOND.y - cy, THIRD.x - cx, 0], COLORS.dirt)
      .setOrigin(0.5)
      .setStrokeStyle(3, 0xb87a3f);
    // Grass "cutout" in the middle of the infield for that manicured look.
    this.add
      .polygon(cx, cy + 6, [0, 58, 78, 0, 0, -58, -78, 0], COLORS.grass)
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
      .polygon(HOME.x, HOME.y + 6, [-13, -8, 13, -8, 13, 4, 0, 14, -13, 4], COLORS.white)
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
      .text(GAME_WIDTH - 70, 20, '', {
        fontFamily: FONT,
        fontSize: '26px',
        color: '#ffffff',
      })
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
    this.inningText.setText(`${halfLabel} Inning ${this.inning}/${INNINGS}`);
    const outs = this.halfState ? this.halfState.outs : 0;
    this.outsText.setText(`Outs: ${'●'.repeat(outs)}${'○'.repeat(3 - outs)}`);
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
      this.flashAnnounce(`Inning ${this.inning}\nYOU'RE UP!`, COLORS.gold);
      if (this.firstPitchOfGame) audio.say('Play ball!');
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
    this.firstPitchOfGame = false;
    audio.pitchWoosh();

    // Timing ring: a white ring shrinks to meet the gold target ring exactly
    // when the ball reaches the plate — swing when they line up.
    if (SHOW_TIMING_RING) {
      this.ringTarget = this.add.circle(HOME.x, HOME.y - 26, 30).setStrokeStyle(4, COLORS.gold).setDepth(15);
      this.ringShrink = this.add.circle(HOME.x, HOME.y - 26, 30).setStrokeStyle(5, COLORS.white).setDepth(16);
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
    this.ball = this.add.circle(MOUND.x, MOUND.y - 36, 10, COLORS.white).setDepth(20);
    this.ball.setStrokeStyle(2, COLORS.ink);

    this.tweens.add({
      targets: this.ball,
      x: HOME.x,
      y: HOME.y - 26,
      scale: { from: 0.7, to: 1.7 },
      duration: PITCH_TRAVEL_MS,
      ease: 'Sine.in',
      onComplete: () => {
        if (!this.swung && this.phase === 'pitching') this.resolvePlayerSwing('miss', true);
      },
    });
    this.tweens.add({
      targets: this.ballShadow,
      x: HOME.x,
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
      floatingText(this, HOME.x, HOME.y - 60, 'STRIKE!', COLORS.red, 30);
      this.applyAndContinue({ kind: 'strike', bases: 0, description: 'Strike! (took it)' });
      return;
    }

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

  private applyAndContinue(result: {
    kind: 'hit' | 'out' | 'strike' | 'foul';
    bases: number;
    description: string;
  }): void {
    const prevBatter = this.batter;
    const applied = applyAtBat(this.halfState, result);
    this.halfState = applied.state;
    if (applied.runsScored > 0) this.playerScore += applied.runsScored;

    // Baserunning animation, driven by the reducer's movement list.
    let runDelay = 0;
    if (result.kind === 'hit') {
      runDelay = this.animateBaserunning(applied.movements, jerseyColor(prevBatter));
      this.fadeOutBatter();
    }

    if (applied.runsScored > 0) {
      audio.cheer();
      if (result.bases >= 4) audio.say('Home run!');
    }

    const color =
      result.kind === 'hit' ? COLORS.gold : result.kind === 'foul' ? COLORS.white : COLORS.red;
    let msg = result.description;
    if (applied.runsScored > 0)
      msg += `\n+${applied.runsScored} RUN${applied.runsScored > 1 ? 'S' : ''}!`;
    this.flashAnnounce(msg, color);
    this.refreshHud();

    const baseDelay = result.kind === 'hit' ? Math.max(1000, runDelay + 350) : 850;
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
  /** Move runner tokens per the reducer's movements. Returns the animation duration. */
  private animateBaserunning(movements: RunnerMove[], color: number): number {
    const next = new Map<number, Phaser.GameObjects.Arc>();
    let maxBases = 0;

    for (const m of movements) {
      maxBases = Math.max(maxBases, m.toBase - m.fromBase);
      // Grab the token: the batter (fromBase 0) gets a fresh one at home.
      let token = m.fromBase === 0 ? this.makeRunner(color) : this.runners.get(m.fromBase);
      if (!token) token = this.makeRunner(color); // safety
      this.runners.delete(m.fromBase);

      // Waypoints: each base from fromBase+1 up to toBase.
      const legs: Array<{ x: number; y: number; duration: number; ease: string }> = [];
      for (let b = m.fromBase + 1; b <= m.toBase; b++) {
        const p = basePos(b);
        legs.push({ x: p.x, y: p.y, duration: RUNNER_TWEEN_MS, ease: 'Sine.inOut' });
      }

      const scored = m.toBase >= 4;
      if (legs.length > 0) {
        this.tweens.chain({
          targets: token,
          tweens: legs,
          onComplete: () => {
            if (scored) {
              burst(this, HOME.x, HOME.y - 20, COLORS.gold, 14);
              token!.destroy();
            }
          },
        });
      }
      if (!scored) next.set(m.toBase, token);
    }

    this.runners = next;
    return maxBases * RUNNER_TWEEN_MS;
  }

  private makeRunner(color: number): Phaser.GameObjects.Arc {
    const r = this.add.circle(HOME.x, HOME.y - 6, 15, color).setStrokeStyle(3, COLORS.white).setDepth(40);
    return r;
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

    if (result.kind === 'hit') audio.crack();
    if (applied.runsScored > 0) audio.cheer();

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
    this.batterSprite = this.add.image(HOME.x - 70, HOME.y + 6, char.id).setOrigin(0.5, 1).setDepth(28);
    const s = 150 / this.batterSprite.height;
    this.batterSprite.setScale(s).setFlipX(true);
    this.tweens.add({
      targets: this.batterSprite,
      scale: { from: s * 1.15, to: s },
      duration: 200,
      ease: 'Back.out',
    });
  }

  private fadeOutBatter(): void {
    if (!this.batterSprite) return;
    const s = this.batterSprite;
    this.batterSprite = undefined;
    this.tweens.add({ targets: s, alpha: 0, duration: 300, onComplete: () => s.destroy() });
  }

  private animateSwing(): void {
    if (!this.batterSprite) return;
    this.tweens.add({
      targets: this.batterSprite,
      angle: { from: -10, to: 14 },
      duration: 110,
      yoyo: true,
    });
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

/** Auto-sim swing quality, weighted by the batter's contact stat. */
function autoBand(contact: number): SwingBand {
  const r = Math.random() + (contact - 5) * 0.035;
  if (r > 0.86) return 'perfect';
  if (r > 0.58) return 'good';
  if (r > 0.3) return 'weak';
  return 'miss';
}
