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
  resolveContact,
  resolveContactAimed,
  type Launch,
  type SwingBand,
  type AtBatResult,
} from '../systems/atbat';
import {
  pitchBandFromError,
  resolveCpuPitch,
  resolveCpuPitchLocated,
  rollAiWildPitch,
  wildSwingBand,
  type PitchBand,
  type CpuPitchPlan,
} from '../systems/pitch';
import {
  chooseCpuPitch,
  resolvePitchLocation,
  ballCurveAt,
  type PitchPlan,
  type PlateLoc,
} from '../systems/pitchkind';
import { showPitchSelect, zoneOutline, plateToScreen, type PitchSelect } from './ui/PitchSelectUI';
import { shouldSkipBottom, isWalkOff, decideAfterHalf } from '../systems/gameflow';
import {
  newHalfInning,
  applyAtBat,
  applyLivePlay,
  applySteal,
  isHalfOver,
  type HalfInningState,
  type RunnerMove,
} from '../systems/inning';
import { rollSteal, cpuWantsSteal } from '../systems/steal';
import {
  newJuice,
  juiceGain,
  addJuice,
  canSpend,
  spend,
  cpuWantsSpend,
  type JuiceState,
  type JuiceEventKind,
} from '../systems/juice';
import {
  HOME,
  FIRST,
  SECOND,
  THIRD,
  MOUND,
  basePos,
  dist,
  fencePointAt,
  FIELD_POSITIONS,
  type FieldGeometry,
  type PositionId,
  type Vec,
} from '../systems/geometry';
import { getVenue, getFieldGeometry } from '../systems/venue';
import type { VenueDef } from '../data/venues';
import {
  startLivePlay,
  stepLivePlay,
  finishLivePlay,
  chooseThrowTarget,
  type LivePlayState,
  type LiveInputs,
} from '../systems/liveplay';
import { getMode, getFeatures, getSwingTiming, resolveLiveParams, type LiveParams } from '../systems/mode';
import { LIVE, CURSOR, PLATE_ZONE, type GameMode, type ModeFeatures, type PitchKind } from '../config';
import { recordGamePlayed } from '../systems/picklog';
import * as audio from '../systems/audio';
import { screenShake, burst, floatingText } from '../ui/effects';
import { makeMuteButton } from '../ui/MuteButton';
import { FONT, pill } from '../ui/theme';
import { idleBob, squashHop, groundShadow, runCycle } from '../ui/anim';
import { poseKey } from '../art/textureFactory';
import { Announcer, type AnnounceKind } from '../systems/announcer';

/**
 * 'pitching' = ball is inbound, swing now. 'aiming' = you're on the mound,
 * throw now. 'fielding' = live play, you steer the glowing fielder.
 * 'running' = live play, tap to send your runners.
 */
type Phase = 'pitching' | 'resolving' | 'aiming' | 'fielding' | 'running' | 'ended';

const POSITION_ORDER: PositionId[] = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];

/** One on-screen kid the live play can move (fielder or runner). */
interface LiveSprite {
  container: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  charId: string;
  cycle: { stop(restoreStand?: boolean): void } | null;
  lastX: number;
}

const BALL_GREEN = 0x57d977; // "good eye" green for called balls

const RUNNER_H = 66; // runner sprite height

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
  /** Flight time of the pitch currently inbound (varies by kind in main mode). */
  private pitchTravelMs = PITCH_TRAVEL_MS;
  /** The located pitch coming at the player (main mode; public for dev/tests). */
  pitchPlan?: PitchPlan;
  private zoneGfx?: Phaser.GameObjects.Graphics;
  /** Main-mode batting cursor reticle (follows the pointer over the plate). */
  private swingCursor?: Phaser.GameObjects.Container;

  // defense half (the player pitches)
  private cpuBatter!: Character;
  private meterStart = 0;
  private threw = false;
  private autoThrowTimer?: Phaser.Time.TimerEvent;
  /** Main mode: the pitch kind + aim chosen before the meter starts. */
  private selectedPitch?: { kind: PitchKind; target: PlateLoc };
  private pitchSelect?: PitchSelect;
  /** Main mode: the base a player steal was armed from this pitch. */
  private armedSteal?: 1 | 2;
  private stealChips: Phaser.GameObjects.Container[] = [];
  /** Main mode: a CPU runner is stealing on the current pitch. */
  private cpuStealFrom?: 1 | 2;
  // Juice meters (main mode): charge on great plays, spend on power moves.
  private playerJuice: JuiceState = newJuice();
  private cpuJuice: JuiceState = newJuice();
  private armedPower = false;
  private powerBtn?: Phaser.GameObjects.Container;
  private juiceGfx?: Phaser.GameObjects.Graphics;
  private announcer = new Announcer();

  /** Play-by-play: pick a line for the moment and say it (rate-limited). */
  private callIt(kind: AnnounceKind, ctx: { name?: string } = {}, priority: 1 | 2 = 1): void {
    const line = this.announcer.line(kind, this.time.now, ctx, priority);
    if (line) audio.say(line);
  }

  // baserunners currently on the diamond, keyed by base (1-3) — each is the kid
  private runners = new Map<number, Phaser.GameObjects.Container>();

  // --- live play (interactive fielding / running) ---
  private liveParams!: LiveParams;
  private venue!: VenueDef;
  private geo!: FieldGeometry;
  private mode!: GameMode;
  /** Which main-mode mechanics are on (public: read by controls & dev drivers). */
  features!: ModeFeatures;
  private livePlay?: LivePlayState;
  /** Defensive assignment for the current half, sim order (index 0 = P). */
  private fieldAssignment: Array<{ position: PositionId; charId: string }> = [];
  private fielderSprites: LiveSprite[] = []; // parallel to fieldAssignment
  private liveRunnerSprites = new Map<string, LiveSprite>();
  private liveBall?: Phaser.GameObjects.Arc;
  private liveBallShadow?: Phaser.GameObjects.Ellipse;
  private activeMarker?: Phaser.GameObjects.Ellipse;
  private baseRings: Phaser.GameObjects.Arc[] = [];
  private chargeMeter?: Phaser.GameObjects.Graphics;
  private goBanner?: Phaser.GameObjects.Container;
  private lastPointer: Vec = { ...MOUND };
  private charging = false;
  private chargeStart = 0;
  private chargeBase: 1 | 2 | 3 | 4 = 1;
  private pendingThrow?: { base: 1 | 2 | 3 | 4; power: number };
  private pendingRun = false;
  /** Main-mode per-runner taps, consumed by the next sim tick. */
  private pendingSend?: string;
  private pendingHold?: string;
  private firstFieldPlay = true;
  private firstRunPlay = true;

  // display objects
  private batterSprite?: Phaser.GameObjects.Image;
  private batterScale = 1;
  private batterIdle?: Phaser.Tweens.Tween;
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
    this.livePlay = undefined;
    this.pitchPlan = undefined;
    this.pitchTravelMs = PITCH_TRAVEL_MS;
    this.selectedPitch = undefined;
    this.pitchSelect = undefined;
    this.zoneGfx = undefined;
    this.armedSteal = undefined;
    this.cpuStealFrom = undefined;
    this.stealChips = [];
    this.fieldAssignment = [];
    this.fielderSprites = [];
    this.liveRunnerSprites = new Map();
    this.baseRings = [];
    this.charging = false;
    this.pendingThrow = undefined;
    this.pendingRun = false;
    this.pendingSend = undefined;
    this.pendingHold = undefined;
    this.firstFieldPlay = true;
    this.firstRunPlay = true;
  }

  create(): void {
    this.aiPitcher = bestPitcher(this.aiTeam);
    this.playerPitcher = bestPitcher(this.playerTeam);
    this.mode = getMode();
    this.features = getFeatures(this.mode);
    this.liveParams = resolveLiveParams(this.mode);
    this.venue = getVenue();
    this.geo = getFieldGeometry(this.venue);
    recordGamePlayed();
    this.cameras.main.fadeIn(250, 0x5b, 0xbf, 0x5a);

    this.playerJuice = newJuice();
    this.cpuJuice = newJuice();
    this.armedPower = false;

    this.drawField();
    this.drawHud();
    if (this.features.juice) this.drawJuiceMeter();
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
    const HORIZON = 210; // ground starts here; sky/backdrop/fence above
    const look = this.venue.look;

    // Base ground fill (prevents any gaps behind everything else).
    this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, look.grass);

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

    if (look.stands) {
      // --- Stands + crowd (the park) ---
      this.add.rectangle(W / 2, 168, W, 44, 0x5b6a7a).setOrigin(0.5);
      const crowdColors = [0xeb5a52, 0x3f86e0, 0x43b56f, 0x9161d0, 0xff924a, 0xf5c542, 0xffffff, 0x2fb4ac];
      for (let i = 0; i < 110; i++) {
        const x = Math.random() * W;
        const y = 150 + Math.random() * 32;
        this.add.circle(x, y, 4 + Math.random() * 2, crowdColors[(Math.random() * crowdColors.length) | 0]);
      }
    } else if (this.venue.id === 'sandlot') {
      // Backyard skyline: a treeline and a couple of neighbor rooftops.
      for (let x = 30; x < W; x += 90) {
        this.add.circle(x, 168 + ((x / 90) % 3) * 8, 34, 0x3f7d3a, 0.9);
      }
      for (const hx of [180, 470, 760]) {
        this.add.rectangle(hx, 178, 90, 46, 0xc9b8a4).setStrokeStyle(3, 0x8a7a66);
        const roof = this.add.graphics({ x: hx, y: 155 });
        roof.fillStyle(0xa14f3c, 1);
        roof.fillTriangle(-55, 0, 55, 0, 0, -30);
        this.add.rectangle(hx - 18, 186, 16, 16, 0x7fb2d8).setStrokeStyle(2, 0x5c7d99);
        this.add.rectangle(hx + 18, 186, 16, 16, 0x7fb2d8).setStrokeStyle(2, 0x5c7d99);
      }
    } else {
      // Blacktop: the school wall behind the court.
      this.add.rectangle(W / 2, 168, W, 44, 0xb0503c).setOrigin(0.5);
      const mortar = this.add.graphics();
      mortar.lineStyle(2, 0x8f3f30, 0.6);
      for (let y = 152; y <= 184; y += 10) mortar.lineBetween(0, y, W, y);
    }

    // --- Outfield fence: a band that follows the venue's (possibly slanted)
    // fence line, so a short porch reads at a glance ---
    const fl = { x: 0, y: this.geo.fenceLeftY };
    const fr = { x: W, y: this.geo.fenceRightY };
    const fence = this.add.graphics();
    fence.fillStyle(look.fence, 1);
    fence.fillPoints(
      [
        new Phaser.Geom.Point(fl.x, fl.y),
        new Phaser.Geom.Point(fr.x, fr.y),
        new Phaser.Geom.Point(fr.x, fr.y - 26),
        new Phaser.Geom.Point(fl.x, fl.y - 26),
      ],
      true
    );
    fence.fillStyle(look.fenceTrim, 1);
    fence.fillPoints(
      [
        new Phaser.Geom.Point(fl.x, fl.y - 26),
        new Phaser.Geom.Point(fr.x, fr.y - 26),
        new Phaser.Geom.Point(fr.x, fr.y - 32),
        new Phaser.Geom.Point(fl.x, fl.y - 32),
      ],
      true
    );
    if (this.venue.id === 'sandlot') {
      // Wood-plank verticals.
      const planks = this.add.graphics();
      planks.lineStyle(2, 0x6d4426, 0.7);
      for (let x = 8; x < W; x += 22) {
        const t = x / W;
        const y = fl.y + (fr.y - fl.y) * t;
        planks.lineBetween(x, y - 26, x, y);
      }
    } else if (this.venue.id === 'blacktop') {
      // Chain-link diamonds.
      const links = this.add.graphics();
      links.lineStyle(1.5, 0xcfd6db, 0.5);
      for (let x = 0; x < W; x += 16) {
        const t = x / W;
        const y = fl.y + (fr.y - fl.y) * t;
        links.lineBetween(x, y - 26, x + 13, y);
        links.lineBetween(x + 13, y - 26, x, y);
      }
    } else if (look.stands) {
      // Park bunting triangles hanging off the cap.
      const bunt = [0xeb5a52, 0xffffff, 0x3f86e0];
      for (let x = 20; x < W; x += 60) {
        const pennant = this.add.graphics({ x, y: 193 }).setAlpha(0.9);
        pennant.fillStyle(bunt[Math.floor(x / 60) % bunt.length], 1);
        pennant.fillTriangle(-20, 0, 20, 0, 0, 22);
      }
    }

    // --- Ground texture ---
    if (look.stripes) {
      for (let x = 0; x < W; x += 96) {
        if (((x / 96) & 1) === 0)
          this.add.rectangle(x + 48, (HORIZON + GAME_HEIGHT) / 2, 96, GAME_HEIGHT - HORIZON, look.grassDark, 0.35).setOrigin(0.5);
      }
    } else if (look.asphalt) {
      // Faded expansion seams + a painted center ring around second base.
      const seams = this.add.graphics();
      seams.lineStyle(2, look.grassDark, 0.7);
      for (let x = 120; x < W; x += 240) seams.lineBetween(x, HORIZON, x, GAME_HEIGHT);
      seams.lineBetween(0, 470, W, 470);
      this.add.circle(SECOND.x, SECOND.y, 58).setStrokeStyle(4, 0xf2e6c9, 0.5);
    } else {
      // Backyard grass: scruffy tufts.
      const tufts = this.add.graphics();
      tufts.lineStyle(2, look.grassDark, 0.8);
      for (let i = 0; i < 70; i++) {
        const x = (i * 137) % W;
        const y = HORIZON + 20 + ((i * 89) % (GAME_HEIGHT - HORIZON - 40));
        tufts.lineBetween(x, y, x - 4, y - 7);
        tufts.lineBetween(x, y, x + 4, y - 7);
      }
    }

    // --- Infield dirt diamond ---
    // NOTE: Phaser polygon points must be 0-based (no negatives) — negative
    // coords get double-shifted by the display origin and land off-field.
    const cx = (FIRST.x + THIRD.x) / 2;
    const cy = (SECOND.y + HOME.y) / 2;
    const dw = FIRST.x - THIRD.x; // diamond bounds
    const dh = HOME.y - SECOND.y;
    this.add
      .polygon(cx, cy, [dw / 2, 0, dw, dh / 2, dw / 2, dh, 0, dh / 2], look.dirt)
      .setOrigin(0.5)
      .setStrokeStyle(3, look.asphalt ? look.grassDark : 0xb87a3f);
    // Ground "cutout" in the middle of the infield for that manicured look.
    this.add
      .polygon(cx, cy + 6, [78, 0, 156, 58, 78, 116, 0, 58], look.grass)
      .setOrigin(0.5);

    // --- Foul lines (home out to where they meet THIS venue's fence) ---
    const leftPole = fencePointAt(this.geo, 0);
    const rightPole = fencePointAt(this.geo, 1);
    const lines = this.add.graphics();
    lines.lineStyle(4, 0xffffff, 0.85);
    lines.lineBetween(HOME.x, HOME.y, rightPole.x, rightPole.y);
    lines.lineBetween(HOME.x, HOME.y, leftPole.x, leftPole.y);

    // Base paths.
    const paths = this.add.graphics();
    paths.lineStyle(5, 0xe9d9bf, 0.6);
    paths.strokePoints(
      [HOME, FIRST, SECOND, THIRD, HOME].map((p) => new Phaser.Math.Vector2(p.x, p.y)),
      true
    );

    // --- Pitcher's mound + rubber ---
    this.add.ellipse(MOUND.x, MOUND.y + 4, 92, 60, look.dirt).setStrokeStyle(3, look.asphalt ? look.grassDark : 0xb87a3f);
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

    // --- Venue obstacles (the sandlot oak) — the sim knows they're there ---
    for (const o of this.venue.obstacles) {
      if (o.kind !== 'tree') continue;
      this.add.rectangle(o.x, o.y + o.r - 6, 14, 26, 0x6d4426).setStrokeStyle(3, 0x4e3019).setDepth(23);
      this.add.circle(o.x - o.r * 0.45, o.y - o.r * 0.2, o.r * 0.62, 0x3f7d3a).setDepth(23);
      this.add.circle(o.x + o.r * 0.45, o.y - o.r * 0.2, o.r * 0.62, 0x478940).setDepth(23);
      this.add.circle(o.x, o.y - o.r * 0.55, o.r * 0.7, 0x529a49).setDepth(23);
      groundShadow(this, 0, 0, o.r * 1.4).setPosition(o.x, o.y + o.r).setDepth(22);
    }
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

  // --- Juice meter (main mode) ---------------------------------------------

  /** ⚡ bar under the HUD strip — the player's juice at a glance. */
  private drawJuiceMeter(): void {
    this.add
      .text(22, 78, '⚡', { fontSize: '20px' })
      .setOrigin(0, 0.5)
      .setDepth(90);
    this.juiceGfx = this.add.graphics().setDepth(90);
    this.refreshJuiceMeter();
  }

  private refreshJuiceMeter(): void {
    const g = this.juiceGfx;
    if (!g) return;
    const p = Phaser.Math.Clamp(this.playerJuice.value / this.playerJuice.max, 0, 1);
    const full = canSpend(this.playerJuice, 'powerSwing');
    g.clear();
    g.fillStyle(COLORS.ink, 0.45);
    g.fillRoundedRect(48, 70, 128, 16, 8);
    if (p > 0.05) {
      g.fillStyle(full ? COLORS.gold : COLORS.white, 1);
      g.fillRoundedRect(51, 73, 122 * p, 10, 5);
    }
  }

  /** Charge a side's meter for a great play. */
  private gainJuice(side: 'player' | 'cpu', kind: JuiceEventKind, ability?: Character['ability']): void {
    if (!this.features.juice) return;
    const amount = juiceGain(kind, ability ?? 'none');
    if (side === 'player') {
      const was = canSpend(this.playerJuice, 'powerSwing');
      this.playerJuice = addJuice(this.playerJuice, amount);
      this.refreshJuiceMeter();
      if (!was && canSpend(this.playerJuice, 'powerSwing')) {
        floatingText(this, 110, 96, 'JUICE READY! ⚡', COLORS.gold, 22);
      }
    } else {
      this.cpuJuice = addJuice(this.cpuJuice, amount);
    }
  }

  // --- Half-inning orchestration ------------------------------------------
  private startHalf(): void {
    this.halfState = newHalfInning();
    this.clearRunners();
    this.buildDefense();
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

  private moundCharId = '';

  /** Put a kid on the mound (the AI's ace in the top, YOUR ace in the bottom). */
  private setMoundPitcher(char: Character): void {
    this.moundCharId = char.id;
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
    if (this.playerScore !== this.aiScore) {
      this.callIt(this.playerScore > this.aiScore ? 'winning' : 'losing', {}, 2);
    }
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
    // Real wind-up art (arm coiled, knee up) + the lean tween on top.
    if (this.moundCharId) p.setTexture(poseKey(this.moundCharId, 'windup'));
    this.tweens.chain({
      targets: p,
      tweens: [
        { angle: -13, scaleY: p.scaleX * 1.05, duration: ANIM.WINDUP_MS * 0.55, ease: 'Quad.out' },
        { angle: 11, scaleY: p.scaleX * 0.97, duration: ANIM.WINDUP_MS * 0.45, ease: 'Quad.in' },
        { angle: 0, scaleY: p.scaleX, duration: 220, ease: 'Sine.out' },
      ],
      onComplete: () => {
        if (p.active && this.moundCharId) p.setTexture(this.moundCharId);
      },
    });
  }

  private launchPitch(): void {
    if (this.features.pitchSelection) {
      this.launchPitchMain();
      return;
    }
    this.phase = 'pitching';
    this.swung = false;
    this.pitchStart = this.time.now;
    this.firstPitchOfGame = false;
    this.pitchPlan = undefined;
    this.pitchTravelMs = PITCH_TRAVEL_MS;
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

    this.startBallTrail();
  }

  /** A faint fading trail behind the inbound ball. */
  private startBallTrail(): void {
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

  /**
   * Main-mode inbound pitch: the CPU picks a kind + spot (pitchkind.ts) and
   * the ball flies a curved path to its ACTUAL crossing point over the drawn
   * strike zone. No red telegraph — reading the zone is the skill. Taking a
   * pitch outside the zone is a ball; chasing one caps the swing.
   */
  private launchPitchMain(): void {
    this.phase = 'pitching';
    this.swung = false;
    this.firstPitchOfGame = false;
    let plan = chooseCpuPitch(
      this.aiPitcher.stats.pitching,
      this.halfState.count,
      PITCH_TRAVEL_MS,
      () => Math.random()
    );
    // A trailing CPU digs into its own juice for the crazy pitch.
    if (
      this.features.juice &&
      cpuWantsSpend(this.cpuJuice, 'crazyPitch', this.aiScore - this.playerScore, () => Math.random(), this.aiPitcher.ability)
    ) {
      this.cpuJuice = spend(this.cpuJuice, 'crazyPitch', this.aiPitcher.ability);
      plan = resolvePitchLocation(
        'crazy',
        plan.target,
        this.aiPitcher.stats.pitching,
        60,
        PITCH_TRAVEL_MS,
        () => Math.random()
      );
      floatingText(this, MOUND.x, MOUND.y - 80, '⚡ CRAZY PITCH!', COLORS.red, 26);
      this.callIt('crazyPitch', {}, 2);
    }
    this.pitchPlan = plan;
    this.pitchIsWild = !plan.inZone; // reuses the take-a-ball / capped-chase rules
    this.pitchTravelMs = plan.travelMs;
    this.pitchStart = this.time.now;
    audio.pitchWoosh();

    this.zoneGfx = zoneOutline(this);
    const start: Vec = { x: MOUND.x, y: MOUND.y - 36 };
    const end = plateToScreen(plan.actual);

    if (SHOW_TIMING_RING) {
      this.ringTarget = this.add.circle(end.x, end.y, 30).setStrokeStyle(4, COLORS.gold).setDepth(15);
      this.ringShrink = this.add.circle(end.x, end.y, 30).setStrokeStyle(5, COLORS.white).setDepth(16);
      this.ringShrink.setScale(3.6);
      this.tweens.add({ targets: this.ringShrink, scale: 1, duration: plan.travelMs, ease: 'Sine.in' });
    }

    this.ballShadow = this.add.ellipse(start.x, MOUND.y + 6, 18, 7, COLORS.ink, 0.3).setDepth(14);
    const ball = this.add.circle(start.x, start.y, 10, COLORS.white).setDepth(20);
    ball.setStrokeStyle(2, COLORS.ink);
    this.ball = ball;
    this.tweens.add({
      targets: this.ballShadow,
      x: end.x,
      y: HOME.y + 8,
      scaleX: 2,
      scaleY: 2,
      duration: plan.travelMs,
      ease: 'Sine.in',
    });
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: plan.travelMs,
      ease: 'Sine.in',
      onUpdate: (tw) => {
        if (this.ball !== ball) return;
        const t = tw.getValue() ?? 0;
        const bend = ballCurveAt(plan, t);
        ball.setPosition(start.x + (end.x - start.x) * t + bend.x, start.y + (end.y - start.y) * t + bend.y);
        ball.setScale(0.7 + t);
      },
      onComplete: () => {
        if (!this.swung && this.phase === 'pitching') this.resolvePlayerSwing('miss', true);
      },
    });
    this.startBallTrail();
    if (this.features.battingCursor) this.showSwingCursor();
    if (this.features.steals) this.showStealChips();
    if (this.features.juice) this.showPowerButton();
  }

  /** 💥 POWER SWING button, shown while the meter can afford it. */
  private showPowerButton(): void {
    this.powerBtn?.destroy();
    this.powerBtn = undefined;
    if (!this.armedPower && !canSpend(this.playerJuice, 'powerSwing')) return;
    const { container } = pill(
      this,
      116,
      GAME_HEIGHT - 42,
      this.armedPower ? '💥 POWERED UP!' : '💥 POWER SWING',
      { fill: this.armedPower ? COLORS.gold : COLORS.cream, fontSize: 18, minW: 170 }
    );
    container.setDepth(94);
    if (!this.armedPower) {
      container.setInteractive(new Phaser.Geom.Rectangle(-90, -18, 180, 36), Phaser.Geom.Rectangle.Contains);
      container.on('pointerdown', () => {
        if (this.armedPower || !canSpend(this.playerJuice, 'powerSwing')) return;
        this.playerJuice = spend(this.playerJuice, 'powerSwing');
        this.armedPower = true;
        this.refreshJuiceMeter();
        audio.pop();
        this.showPowerButton(); // restyle as armed
      });
    } else {
      this.tweens.add({ targets: container, scale: 1.07, duration: 300, yoyo: true, repeat: -1 });
    }
    this.powerBtn = container;
  }

  /** 💨 STEAL! chips next to runners who have an open base ahead. */
  private showStealChips(): void {
    this.stealChips.forEach((c) => c.destroy());
    this.stealChips = [];
    this.armedSteal = undefined;
    for (const fromBase of [1, 2] as const) {
      if (!this.runners.has(fromBase) || this.runners.has(fromBase + 1)) continue;
      const p = basePos(fromBase);
      const { container } = pill(this, p.x + (fromBase === 1 ? 74 : 0), p.y - (fromBase === 2 ? 52 : 0), '💨 STEAL!', {
        fill: COLORS.cream,
        fontSize: 16,
        minW: 100,
      });
      container.setDepth(60).setAlpha(0.92);
      container.setInteractive(new Phaser.Geom.Rectangle(-52, -17, 104, 34), Phaser.Geom.Rectangle.Contains);
      container.on('pointerdown', () => {
        this.armedSteal = fromBase;
        audio.pop();
        // Highlight the armed chip; dim any other.
        for (const c of this.stealChips) c.setAlpha(0.4);
        container.setAlpha(1).setScale(1.12);
        // A little lead-off toward the next bag sells the intent.
        const token = this.runners.get(fromBase);
        if (token) {
          const next = basePos(fromBase + 1);
          const len = Math.max(1, dist({ x: token.x, y: token.y }, next));
          this.tweens.add({
            targets: token,
            x: token.x + ((next.x - token.x) / len) * 18,
            y: token.y + ((next.y - token.y) / len) * 18,
            duration: 180,
          });
        }
      });
      this.stealChips.push(container);
    }
  }

  /** The aim reticle: sweet-spot ring + faint contact ring, pointer-driven. */
  private showSwingCursor(): void {
    this.swingCursor?.destroy();
    const c = this.add.container(0, 0).setDepth(18);
    const outer = this.add.circle(0, 0, CURSOR.CONTACT_R).setStrokeStyle(2, COLORS.white, 0.35);
    const inner = this.add.circle(0, 0, CURSOR.SWEET_R).setStrokeStyle(4, COLORS.gold, 0.95);
    const dot = this.add.circle(0, 0, 3, COLORS.gold, 0.9);
    c.add([outer, inner, dot]);
    this.swingCursor = c;
    this.positionSwingCursor();
  }

  /** Clamp the pointer into the cursor's roam window around the zone. */
  private cursorPlate(): PlateLoc {
    const cx = HOME.x;
    const cy = HOME.y + PLATE_ZONE.CY;
    const rx = (PLATE_ZONE.W / 2) * CURSOR.RANGE_MULT;
    const ry = (PLATE_ZONE.H / 2) * CURSOR.RANGE_MULT;
    return {
      x: Math.max(-rx, Math.min(rx, this.lastPointer.x - cx)),
      y: Math.max(-ry, Math.min(ry, this.lastPointer.y - cy)),
    };
  }

  private positionSwingCursor(): void {
    if (!this.swingCursor) return;
    const p = plateToScreen(this.cursorPlate());
    this.swingCursor.setPosition(p.x, p.y);
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
    this.zoneGfx?.destroy();
    this.zoneGfx = undefined;
    this.swingCursor?.destroy();
    this.swingCursor = undefined;
    this.stealChips.forEach((c) => c.destroy());
    this.stealChips = [];
    this.powerBtn?.destroy();
    this.powerBtn = undefined;
  }

  private onSwing(): void {
    if (this.phase !== 'pitching' || this.swung) return;
    this.swung = true;
    const error = this.time.now - this.pitchStart - this.pitchTravelMs;
    if (this.features.battingCursor && this.pitchPlan) {
      this.resolvePlayerSwingAimed(error, this.cursorPlate());
      return;
    }
    const band = bandFromError(error);
    this.resolvePlayerSwing(band, false);
  }

  /** Public headless hook (main mode): swing with the cursor at `cursor`. */
  resolvePlayerSwingAimed(errorMs: number, cursor: PlateLoc): void {
    const plan = this.pitchPlan!;
    this.phase = 'resolving';
    this.swung = true;
    this.clearPitchVisuals();
    this.animateSwing();

    const powered = this.armedPower;
    this.armedPower = false;
    const { swing, band } = resolveContactAimed({
      band: bandFromError(errorMs, getSwingTiming(this.mode)),
      errorMs,
      cursor,
      plan,
      batter: this.batter,
      pitcher: this.aiPitcher,
      rng: () => Math.random(),
      boost: { power: powered },
      geo: this.geo,
    });
    this.showBandFeedback(band);
    if (band === 'perfect') this.gainJuice('player', 'perfectSwing', this.batter.ability);

    if (swing.kind !== 'inPlay') {
      if (swing.kind === 'strike') audio.whiff();
      else audio.crack();
      this.applyAndContinue({ kind: swing.kind, bases: 0, description: swing.description });
      return;
    }
    audio.crack();
    if (swing.launch.homer) {
      this.flyHitBall(4);
      screenShake(this, SHAKE.homer);
      this.gainJuice('player', 'homer', this.batter.ability);
      if (powered && this.batter.ability === 'calls_shot') this.callIt('calledShot', {}, 2);
      else this.callIt('homer', { name: this.batter.name }, 2);
      this.applyAndContinue({ kind: 'hit', bases: 4, description: 'HOME RUN! 💥' });
      return;
    }
    screenShake(this, SHAKE.single);
    this.beginLivePlay('offense', swing.launch);
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

    const outcome = resolveContact(band, this.batter, this.aiPitcher, () => Math.random(), this.geo);
    if (outcome.kind !== 'inPlay') {
      if (outcome.kind === 'strike') audio.whiff();
      else audio.crack();
      this.applyAndContinue({ kind: outcome.kind, bases: 0, description: outcome.description });
      return;
    }
    // Contact! Homers keep the classic celebration; everything else goes live.
    audio.crack();
    if (outcome.launch.homer) {
      this.flyHitBall(4);
      screenShake(this, SHAKE.homer);
      this.applyAndContinue({ kind: 'hit', bases: 4, description: 'HOME RUN! 💥' });
      return;
    }
    screenShake(this, SHAKE.single);
    this.beginLivePlay('offense', outcome.launch);
  }

  private applyAndContinue(result: AtBatResult): void {
    const prevBatter = this.batter;
    const applied = applyAtBat(this.halfState, result);
    this.halfState = applied.state;
    if (applied.runsScored > 0) this.playerScore += applied.runsScored;

    const walked = result.kind === 'ball' && applied.batterDone;
    // The CPU pitcher charges off striking you out.
    if (result.kind === 'strike' && applied.batterOut) {
      this.gainJuice('cpu', 'strikeoutThrown');
      this.callIt('strikeoutSwinging', { name: prevBatter.name });
    }

    // An armed steal races the catcher on a strike or a (non-walk) ball;
    // fouls and balls-four are dead — the runner scampers back.
    if (this.armedSteal !== undefined && this.features.steals) {
      const from = this.armedSteal;
      this.armedSteal = undefined;
      const token = this.runners.get(from);
      const liveOnPitch =
        (result.kind === 'strike' || (result.kind === 'ball' && !walked)) &&
        !isHalfOver(this.halfState);
      if (token && liveOnPitch) {
        const runner = getCharacter(token.getData('id') as string);
        const catcher = getCharacter(this.fieldAssignment.find((a) => a.position === 'C')!.charId);
        const safe = rollSteal(
          {
            runnerSpeed: runner.stats.speed,
            catcherArm: catcher.stats.pitching,
            pitchKind: this.pitchPlan?.kind ?? null,
          },
          () => Math.random()
        );
        this.halfState = applySteal(this.halfState, from, safe).state;
        this.animateSteal(from, token, safe);
      } else if (token) {
        // Dead ball — sneak back to the bag.
        const p = basePos(from);
        this.tweens.add({ targets: token, x: p.x, y: p.y - 6, duration: 220 });
      }
    }

    // Baserunning animation, driven by the reducer's movement list (hit or walk).
    let runDelay = 0;
    if (applied.movements.length > 0) {
      runDelay = this.animateBaserunning(applied.movements, prevBatter);
      this.fadeOutBatter();
    }

    if (applied.runsScored > 0) {
      audio.cheer();
      if (result.bases >= 4 && this.mode === 'kid') this.callIt('homer', { name: prevBatter.name }, 2);
    }
    if (walked) this.callIt('walk', {}, 2);

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

  /** Sprint the stealing runner to the next bag (or fade them on the out). */
  private animateSteal(
    from: 1 | 2,
    token: Phaser.GameObjects.Container,
    safe: boolean,
    cpuRunner = false
  ): void {
    this.runners.delete(from);
    const to = basePos(from + 1);
    const img = token.getAt(1) as Phaser.GameObjects.Image;
    const cycle = runCycle(this, img, token.getData('id') as string);
    img.setFlipX(to.x < token.x);
    this.tweens.add({
      targets: token,
      x: to.x,
      y: to.y - 6,
      duration: 380,
      ease: 'Sine.in',
      onComplete: () => {
        cycle.stop(true);
        img.setFlipX(false);
        // Color/SFX read from the PLAYER's point of view.
        if (safe) {
          floatingText(this, to.x, to.y - 50, 'STOLE IT!', cpuRunner ? COLORS.red : COLORS.gold, 28);
          this.tweens.add({ targets: img, scaleY: img.scaleY * 0.85, yoyo: true, duration: 90 });
          this.runners.set(from + 1, token);
          this.gainJuice(cpuRunner ? 'cpu' : 'player', 'steal');
          this.callIt('stealSafe', { name: getCharacter(token.getData('id') as string).name });
          if (cpuRunner) audio.whiff();
          else audio.cheer();
        } else {
          floatingText(this, to.x, to.y - 50, cpuRunner ? 'GOT HIM!' : 'CAUGHT!', cpuRunner ? COLORS.gold : COLORS.red, 28);
          this.callIt('stealCaught', {});
          screenShake(this, 3);
          if (cpuRunner) audio.cheer();
          else audio.whiff();
          this.tweens.add({
            targets: token,
            alpha: 0,
            y: token.y - 10,
            duration: 320,
            delay: 150,
            onComplete: () => token.destroy(),
          });
        }
        this.refreshHud();
      },
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

  // --- Live plays: interactive fielding & baserunning ----------------------

  /**
   * Stand the defending team's nine kids at their positions for this half.
   * Index 0 is always the pitcher (rendered by the existing mound sprite);
   * the other eight get fresh container sprites. The SIM moves these — the
   * scene must never tween them during a live play.
   */
  private buildDefense(): void {
    for (const f of this.fielderSprites) {
      f.cycle?.stop(false); // kill the texture-swap timer BEFORE the image dies
      f.cycle = null;
      if (f.container !== (this.pitcherSprite as unknown)) f.container.destroy();
    }
    this.fielderSprites = [];

    const defendingIds = this.half === 'top' ? this.aiTeam : this.playerTeam;
    const pitcher = this.half === 'top' ? this.aiPitcher : this.playerPitcher;
    const others = defendingIds.filter((id) => id !== pitcher.id);
    this.fieldAssignment = [
      { position: 'P' as PositionId, charId: pitcher.id },
      ...POSITION_ORDER.map((position, i) => ({ position, charId: others[i % others.length] })),
    ];

    this.fieldAssignment.forEach((a, i) => {
      if (i === 0) return; // the mound sprite plays P
      const p = FIELD_POSITIONS[a.position];
      const outfield = a.position === 'LF' || a.position === 'CF' || a.position === 'RF';
      const c = this.add.container(p.x, p.y).setDepth(26);
      const shadow = groundShadow(this, 0, 3, outfield ? 26 : 32);
      // Fielders wait in the ready crouch, gloves out.
      const img = this.add.image(0, 0, poseKey(a.charId, 'ready')).setOrigin(0.5, 0.95);
      img.setScale((outfield ? 52 : 60) / img.height);
      c.add([shadow, img]);
      idleBob(this, img, { amp: 3, dur: 1000 + i * 90 }); // bob the IMAGE — the sim owns the container
      this.fielderSprites.push({ container: c, img, charId: a.charId, cycle: null, lastX: p.x });
    });
  }

  /** A wrapper so index 0 (the pitcher) resolves to the mound sprite. */
  private fielderSpriteAt(i: number): LiveSprite | undefined {
    if (i === 0) return undefined; // handled specially via pitcherSprite
    return this.fielderSprites[i - 1];
  }

  /** Contact! Hand the play to the sim and switch input modes. */
  private beginLivePlay(mode: 'defense' | 'offense', launch: Launch): void {
    const batterChar = mode === 'offense' ? this.batter : this.cpuBatter;
    const baseRunners: Array<{ base: 1 | 2 | 3; charId: string; speed: number }> = [];
    for (const [base, token] of this.runners) {
      const id = token.getData('id') as string;
      baseRunners.push({ base: base as 1 | 2 | 3, charId: id, speed: getCharacter(id).stats.speed });
    }

    this.livePlay = startLivePlay({
      mode,
      launch,
      batter: { charId: batterChar.id, speed: batterChar.stats.speed },
      baseRunners,
      // Each kid fields with their own legs, glove, and arm.
      defense: this.fieldAssignment.map((a) => {
        const c = getCharacter(a.charId);
        return { ...a, speed: c.stats.speed, glove: c.stats.fielding, arm: c.stats.pitching };
      }),
      outs: this.halfState.outs,
      params: this.liveParams,
      geo: this.geo,
    });
    this.phase = mode === 'defense' ? 'fielding' : 'running';
    this.pendingThrow = undefined;
    this.pendingRun = false;
    this.pendingSend = undefined;
    this.pendingHold = undefined;
    this.charging = false;

    // The sim owns the pitcher's body now — stop his breathing/windup tweens.
    if (this.pitcherSprite) {
      this.tweens.killTweensOf(this.pitcherSprite);
      this.pitcherSprite.setAngle(0);
    }

    // The batter becomes a runner token at home; existing runners keep theirs.
    this.liveRunnerSprites = new Map();
    for (const token of this.runners.values()) {
      const img = token.getAt(1) as Phaser.GameObjects.Image;
      const id = token.getData('id') as string;
      this.liveRunnerSprites.set(id, { container: token, img, charId: id, cycle: null, lastX: token.x });
    }
    this.fadeOutBatter();
    const batterToken = this.makeRunner(batterChar);
    this.liveRunnerSprites.set(batterChar.id, {
      container: batterToken,
      img: batterToken.getAt(1) as Phaser.GameObjects.Image,
      charId: batterChar.id,
      cycle: null,
      lastX: batterToken.x,
    });
    this.runners = new Map(); // rebuilt from the outcome at settle

    // Ball + shadow, sim-positioned every frame.
    this.liveBallShadow = this.add.ellipse(HOME.x, HOME.y, 16, 6, COLORS.ink, 0.3).setDepth(14);
    this.liveBall = this.add.circle(HOME.x, HOME.y - 10, 9, COLORS.white).setStrokeStyle(2, COLORS.ink).setDepth(42);

    if (mode === 'defense') {
      // Spotlight the kid you steer.
      const chaser = this.livePlay.fielders[this.livePlay.active];
      this.activeMarker = this.add
        .ellipse(chaser.pos.x, chaser.pos.y + 4, 52, 20)
        .setStrokeStyle(4, COLORS.gold)
        .setDepth(25);
      this.tweens.add({ targets: this.activeMarker, alpha: 0.45, duration: 380, yoyo: true, repeat: -1 });
      if (this.firstFieldPlay) {
        audio.say('Get the ball!');
        this.firstFieldPlay = false;
      }
    } else if (this.features.manualBaserunning) {
      // Main mode: the bases ARE the controls — tap ahead to send, behind to
      // turn a runner back. Rings show what's tappable.
      this.showBaseRings();
      const { container } = pill(this, GAME_WIDTH / 2, GAME_HEIGHT - 46, 'TAP A BASE TO RUN!  ◆', {
        fill: COLORS.gold,
        fontSize: 26,
      });
      container.setDepth(95);
      this.tweens.add({ targets: container, scale: 1.06, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.goBanner = container;
      if (this.firstRunPlay) {
        audio.say('Tap a base to send your runner!');
        this.firstRunPlay = false;
      }
    } else {
      // Big tap-anywhere GO prompt.
      const { container } = pill(this, GAME_WIDTH / 2, GAME_HEIGHT - 46, 'TAP TO RUN!  ▶', {
        fill: COLORS.gold,
        fontSize: 28,
      });
      container.setDepth(95);
      this.tweens.add({ targets: container, scale: 1.07, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.goBanner = container;
      if (this.firstRunPlay) {
        audio.say('Run! Tap to take the next base!');
        this.firstRunPlay = false;
      }
    }
  }

  /** The per-frame heartbeat of a live play. Everything sim-owned is placed here. */
  update(_time: number, delta: number): void {
    if (this.swingCursor && this.phase === 'pitching') this.positionSwingCursor();
    if (!this.livePlay || this.livePlay.phase === 'done') return;

    const inputs: LiveInputs = {};
    if (this.phase === 'fielding') {
      inputs.pointer = this.lastPointer;
      if (this.pendingThrow) {
        inputs.throwTo = this.pendingThrow;
        this.pendingThrow = undefined;
        this.charging = false;
      }
    } else if (this.phase === 'running') {
      if (this.pendingRun) {
        inputs.run = true;
        this.pendingRun = false;
      }
      if (this.pendingSend) {
        inputs.sendRunner = this.pendingSend;
        this.pendingSend = undefined;
      }
      if (this.pendingHold) {
        inputs.holdRunner = this.pendingHold;
        this.pendingHold = undefined;
      }
    }

    this.livePlay = stepLivePlay(this.livePlay, inputs, delta, this.liveParams, () => Math.random());
    this.drainLiveEvents();
    this.renderLivePlay();
    if (this.livePlay.phase === 'done') this.settleLivePlay();
  }

  private renderLivePlay(): void {
    const s = this.livePlay!;

    // Fielders (index 0 = the mound pitcher sprite).
    s.fielders.forEach((f, i) => {
      if (i === 0) {
        this.pitcherSprite?.setPosition(f.pos.x, f.pos.y);
        return;
      }
      const spr = this.fielderSpriteAt(i);
      if (!spr) return;
      this.moveLiveSprite(spr, f.pos.x, f.pos.y);
    });

    // Runners. Done runners are scene-owned again (their exit animations —
    // fade on an out, hop on a score — must not be fought or their run cycle
    // restarted on a dying sprite).
    for (const r of s.runners) {
      if (r.done !== null) continue;
      const spr = this.liveRunnerSprites.get(r.charId);
      if (!spr || !spr.container.active) continue;
      // A runner closing on a bag with the ball bearing down HITS THE DIRT.
      const contested =
        r.to !== r.from &&
        r.progress > 0.72 &&
        ((s.ball.phase === 'thrown' && s.ball.throw?.toBase === r.to) ||
          (s.ball.phase === 'held' &&
            s.ball.heldBy !== null &&
            dist(s.fielders[s.ball.heldBy].pos, basePos(r.to)) < 70));
      if (contested) {
        spr.cycle?.stop(false);
        spr.cycle = null;
        spr.img.setTexture(poseKey(r.charId, 'slide'));
        spr.img.setFlipX(basePos(r.to).x < spr.container.x);
        spr.container.setPosition(r.pos.x, r.pos.y - 6);
        continue;
      }
      this.moveLiveSprite(spr, r.pos.x, r.pos.y - 6);
    }

    // Ball: lift by arc height; the shadow stays on the ground plane.
    if (this.liveBall && this.liveBallShadow) {
      const b = s.ball;
      if (b.phase === 'held' && b.heldBy !== null) {
        const holder = s.fielders[b.heldBy];
        this.liveBall.setPosition(holder.pos.x + 12, holder.pos.y - 34).setVisible(true);
        this.liveBallShadow.setVisible(false);
      } else {
        const lift = b.height * (b.phase === 'thrown' ? 46 : 92);
        this.liveBall.setPosition(b.pos.x, b.pos.y - 10 - lift).setVisible(true);
        this.liveBallShadow.setPosition(b.pos.x, b.pos.y).setVisible(true);
        this.liveBallShadow.setScale(1 - b.height * 0.45);
      }
    }

    // The steering spotlight follows the chaser.
    if (this.activeMarker) {
      const chaser = s.fielders[s.active];
      this.activeMarker.setPosition(chaser.pos.x, chaser.pos.y + 4);
    }

    // Throw-charge meter over the carrier.
    if (this.charging && this.chargeMeter && s.ball.phase === 'held' && s.ball.heldBy !== null) {
      const holder = s.fielders[s.ball.heldBy];
      // Clamp hard: a tiny/negative width makes fillRoundedRect paint garbage.
      const p = Phaser.Math.Clamp((this.time.now - this.chargeStart) / LIVE.THROW_METER_MS, 0, 1);
      const g = this.chargeMeter;
      g.clear();
      g.setPosition(holder.pos.x, holder.pos.y - 58);
      g.fillStyle(COLORS.ink, 0.5);
      g.fillRoundedRect(-30, -7, 60, 14, 7);
      if (p > 0.08) {
        g.fillStyle(p >= 1 ? COLORS.gold : COLORS.white, 1);
        g.fillRoundedRect(-27, -4, 54 * p, 8, 4);
      }
    }
  }

  /** Direct placement + run-cycle bookkeeping for one sim-owned kid. */
  private moveLiveSprite(spr: LiveSprite, x: number, y: number): void {
    const moving = Math.abs(x - spr.container.x) > 0.5 || Math.abs(y - spr.container.y) > 0.5;
    if (moving) {
      if (!spr.cycle) spr.cycle = runCycle(this, spr.img, spr.charId);
      if (Math.abs(x - spr.container.x) > 0.5) spr.img.setFlipX(x < spr.container.x);
    } else if (spr.cycle) {
      spr.cycle.stop(true);
      spr.cycle = null;
      spr.img.setFlipX(false);
    }
    spr.container.setPosition(x, y);
  }

  /** Turn this tick's sim events into juice: SFX, pops, shakes, text. */
  private drainLiveEvents(): void {
    const s = this.livePlay!;
    for (const e of s.events) {
      switch (e.t) {
        case 'catch': {
          audio.pop();
          floatingText(this, s.ball.pos.x, s.ball.pos.y - 40, 'CAUGHT!', COLORS.gold, 30);
          if (s.mode === 'defense') audio.cheer();
          break;
        }
        case 'pickup':
          audio.pop();
          if (s.mode === 'defense') this.showBaseRings();
          break;
        case 'land':
          burst(this, s.ball.pos.x, s.ball.pos.y, COLORS.dirt, 6);
          break;
        case 'bonk':
          floatingText(this, s.ball.pos.x, s.ball.pos.y - 40, 'BONK! 🌳', COLORS.white, 26);
          burst(this, s.ball.pos.x, s.ball.pos.y - 20, 0x529a49, 8);
          audio.pop();
          this.callIt('bonk', {});
          break;
        case 'error': {
          const label = e.kind === 'wild' ? 'WILD THROW!' : e.kind === 'drop' ? 'DROPPED IT!' : 'BOBBLED!';
          floatingText(this, s.ball.pos.x, s.ball.pos.y - 44, label, COLORS.red, 28);
          screenShake(this, 3);
          audio.whiff();
          this.callIt(e.kind === 'wild' ? 'errorWild' : 'errorDrop', {});
          // An error by the CPU while your kids run = a gift. Cheer it.
          if (s.mode === 'offense') audio.cheer();
          break;
        }
        case 'throw':
          audio.pitchWoosh();
          this.hideBaseRings();
          break;
        case 'out': {
          const p = basePos(e.base);
          floatingText(this, p.x, p.y - 46, 'OUT!', COLORS.red, 32);
          screenShake(this, 4);
          if (s.mode === 'defense') audio.cheer();
          else audio.whiff();
          const spr = this.liveRunnerSprites.get(e.runner);
          if (spr) {
            spr.cycle?.stop(false);
            spr.cycle = null;
            this.tweens.add({
              targets: spr.container,
              alpha: 0,
              y: spr.container.y - 10,
              duration: 320,
              delay: 120,
              onComplete: () => spr.container.destroy(),
            });
          }
          break;
        }
        case 'score': {
          burst(this, HOME.x, HOME.y - 20, COLORS.gold, 14);
          audio.cheer();
          floatingText(this, HOME.x, HOME.y - 60, '+1', COLORS.gold, 34);
          const spr = this.liveRunnerSprites.get(e.runner);
          if (spr) {
            spr.cycle?.stop(true);
            spr.cycle = null;
            squashHop(this, spr.img, { height: 18 });
            this.time.delayedCall(480, () => spr.container.destroy());
          }
          break;
        }
        case 'safe':
        case 'run':
        case 'playOver':
          break;
      }
    }
  }

  /** Four fat glowing rings — throw targets while you hold the ball. */
  private showBaseRings(): void {
    if (this.baseRings.length > 0) return;
    ([1, 2, 3, 4] as const).forEach((base) => {
      const p = basePos(base);
      const ring = this.add.circle(p.x, p.y, 30).setStrokeStyle(5, COLORS.gold, 0.9).setDepth(24);
      this.tweens.add({ targets: ring, scale: 1.25, alpha: 0.5, duration: 430, yoyo: true, repeat: -1 });
      this.baseRings.push(ring);
    });
  }

  private hideBaseRings(): void {
    this.baseRings.forEach((r) => r.destroy());
    this.baseRings = [];
  }

  /** The play is over — fold it into the inning and rejoin the normal flow. */
  private settleLivePlay(): void {
    const s = this.livePlay!;
    const outcome = finishLivePlay(s);
    this.livePlay = undefined;
    this.phase = 'resolving';

    // Chrome down.
    this.hideBaseRings();
    this.activeMarker?.destroy();
    this.activeMarker = undefined;
    this.chargeMeter?.destroy();
    this.chargeMeter = undefined;
    this.goBanner?.destroy();
    this.goBanner = undefined;
    this.liveBall?.destroy();
    this.liveBall = undefined;
    this.liveBallShadow?.destroy();
    this.liveBallShadow = undefined;
    this.charging = false;

    // Fielders trot home; the winner side cheers a beat.
    this.resetFieldersAfterPlay(outcome.outs > 0);

    // Rebuild the base->token map from where the sim left everyone.
    const nextRunners = new Map<number, Phaser.GameObjects.Container>();
    outcome.baseIds.forEach((id, i) => {
      if (!id) return;
      const spr = this.liveRunnerSprites.get(id);
      if (!spr || !spr.container.active) return;
      spr.cycle?.stop(false);
      spr.cycle = null;
      spr.img.setTexture(id); // whatever they ended in (run/slide) → standing
      const p = basePos(i + 1);
      spr.container.setPosition(p.x, p.y - 6);
      spr.img.setFlipX(false);
      nextRunners.set(i + 1, spr.container);
    });
    // Anything not standing on a base (outs already faded, scorers hopped) — sweep.
    for (const [id, spr] of this.liveRunnerSprites) {
      if (!outcome.baseIds.includes(id) && spr.container.active) {
        spr.cycle?.stop(false);
        spr.cycle = null;
        this.time.delayedCall(520, () => spr.container.destroy());
      }
    }
    this.liveRunnerSprites = new Map();
    this.runners = nextRunners;

    // Rules layer: fold in outs/runs/bases.
    const applied = applyLivePlay(this.halfState, outcome);
    this.halfState = applied.state;
    const isOffense = s.mode === 'offense';
    if (applied.runsScored > 0) {
      if (isOffense) this.playerScore += applied.runsScored;
      else this.aiScore += applied.runsScored;
    }

    // Juice: the batting side charges off hits/runs, the fielding side off outs.
    const batSide = isOffense ? ('player' as const) : ('cpu' as const);
    const fieldSide = isOffense ? ('cpu' as const) : ('player' as const);
    if (!outcome.batterOut && !outcome.flyCaught) this.gainJuice(batSide, 'hit');
    for (let i = 0; i < applied.runsScored; i++) this.gainJuice(batSide, 'runScored');
    if (outcome.outs >= 2) this.gainJuice(fieldSide, 'doublePlay');
    else if (outcome.flyCaught) this.gainJuice(fieldSide, 'cleanCatch');

    // Play-by-play for how the play ended.
    const batterName = (isOffense ? this.batter : this.cpuBatter)?.name;
    if (outcome.outs >= 2) this.callIt('doublePlay', {}, 2);
    else if (outcome.flyCaught && applied.runsScored > 0) this.callIt('sacFly', {}, 2);
    else if (outcome.flyCaught) this.callIt('catch', {});
    else if (outcome.outs === 1) this.callIt('outRace', {});
    else this.callIt('hitSafe', { name: batterName });

    const color = isOffense
      ? outcome.outs > 0
        ? COLORS.red
        : COLORS.gold
      : outcome.outs > 0
        ? COLORS.gold
        : COLORS.white;
    this.flashAnnounce(outcome.description, color, 800);
    this.refreshHud();

    // Walk-off: the CPU just took the lead in the bottom of the final inning.
    if (!isOffense && isWalkOff(this.inning, INNINGS, this.half, this.aiScore, this.playerScore)) {
      this.phase = 'ended';
      this.flashAnnounce('WALK-OFF!\nCPU WINS!', COLORS.red, 1300);
      this.time.delayedCall(1500, () => this.gameOver());
      return;
    }

    this.time.delayedCall(1100, () => {
      if (isOffense) this.playerLineup += 1;
      else this.aiLineup += 1;
      if (isHalfOver(this.halfState)) {
        this.endHalf();
      } else if (isOffense) {
        this.nextPlayerBatter();
      } else {
        this.nextCpuBatter();
      }
    });
  }

  /** Walk every fielder back to their spot; a successful defense cheers first. */
  private resetFieldersAfterPlay(gotAnOut: boolean): void {
    this.fieldAssignment.forEach((a, i) => {
      const home = FIELD_POSITIONS[a.position];
      if (i === 0) {
        if (this.pitcherSprite) {
          this.pitcherSprite.setPosition(MOUND.x, MOUND.y);
          idleBob(this, this.pitcherSprite, { amp: 4, dur: 1100 });
        }
        return;
      }
      const spr = this.fielderSpriteAt(i);
      if (!spr) return;
      spr.cycle?.stop(false);
      spr.cycle = null;
      spr.img.setTexture(poseKey(spr.charId, 'ready')); // back to the crouch
      spr.img.setFlipX(false);
      // Kids who left their spot were in on the play — a hop if it worked.
      if (gotAnOut && dist({ x: spr.container.x, y: spr.container.y }, home) > 8) {
        squashHop(this, spr.img, { height: 14 });
      }
      this.tweens.add({
        targets: spr.container,
        x: home.x,
        y: home.y,
        duration: 420,
        ease: 'Sine.inOut',
      });
    });
  }

  // --- Headless / dev hooks for live plays ---------------------------------
  /** Public for headless driving (see CLAUDE.md): steer the fielder. */
  setLivePointer(x: number, y: number): void {
    this.lastPointer = { x, y };
  }

  /** Public for headless driving: release a throw at a base. */
  commandThrow(base: 1 | 2 | 3 | 4, power: number): void {
    this.pendingThrow = { base, power };
  }

  /** Public for headless driving: the "everybody GO!" tap. */
  commandRun(): void {
    this.pendingRun = true;
  }

  /** Public for headless driving (main mode): send / turn back one runner. */
  commandSend(charId: string): void {
    this.pendingSend = charId;
  }

  commandHold(charId: string): void {
    this.pendingHold = charId;
  }

  /**
   * Main-mode running tap → a base: send the settled runner whose NEXT base
   * was tapped, or turn back the mid-leg runner who LEFT the tapped base.
   */
  private handleRunTap(p: Vec): void {
    const s = this.livePlay;
    if (!s) return;
    const base = this.nearestBaseTo(p);
    const send = s.runners.find(
      (r) => r.done === null && (r.tagging ? r.startBase : r.from) + 1 === base &&
        (r.tagging || r.to === r.from)
    );
    if (send) {
      this.pendingSend = send.charId;
      audio.pop();
      return;
    }
    const back = s.runners.find(
      (r) => r.done === null && r.to > r.from && r.progress < 1 && r.from === base
    );
    if (back) {
      this.pendingHold = back.charId;
      audio.pop();
    }
  }

  getLivePlay(): LivePlayState | undefined {
    return this.livePlay;
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
    this.time.delayedCall(520, () => this.beginPitchTurn());
  }

  /** Main mode picks a pitch + aim first; kid mode goes straight to the meter. */
  private beginPitchTurn(): void {
    if (!this.features.pitchSelection) {
      this.startPitchMeter();
      return;
    }
    this.phase = 'resolving'; // the select UI owns input until the aim is tapped
    const confirm = (kind: PitchKind, target: PlateLoc) => {
      autoPick.remove();
      this.pitchSelect?.destroy();
      this.pitchSelect = undefined;
      if (kind === 'crazy') {
        this.playerJuice = spend(this.playerJuice, 'crazyPitch', this.playerPitcher.ability);
        this.refreshJuiceMeter();
        floatingText(this, MOUND.x, MOUND.y - 80, '⚡ CRAZY PITCH!', COLORS.gold, 26);
        this.callIt('crazyPitch', {}, 2);
      }
      this.selectedPitch = { kind, target };
      // Next tick, not now: the confirming tap's pointerdown is still being
      // dispatched, and starting the meter synchronously would let that same
      // tap fall through to the scene handler and instantly "throw" wild.
      this.time.delayedCall(60, () => this.startPitchMeter());
    };
    // Idle-kid rescue: nobody stalls the game on the pitch menu.
    const autoPick = this.time.delayedCall(9000, () => {
      if (this.pitchSelect) confirm('fastball', { x: 0, y: 0 });
    });
    this.pitchSelect?.destroy();
    this.pitchSelect = showPitchSelect(this, {
      allowCrazy: this.features.juice && canSpend(this.playerJuice, 'crazyPitch', this.playerPitcher.ability),
      onDone: confirm,
    });
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
    const band = pitchBandFromError(error);
    if (this.features.pitchSelection && this.selectedPitch) {
      this.resolvePlayerPitchPlan(this.selectedPitch.kind, this.selectedPitch.target, band, error);
    } else {
      this.resolvePlayerPitch(band);
    }
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

  private lastPitchKind?: PitchKind;

  /** Public headless hook (main mode): resolve an aimed, typed pitch. */
  resolvePlayerPitchPlan(kind: PitchKind, target: PlateLoc, band: PitchBand, errorMs?: number): void {
    this.lastPitchKind = kind;
    // Speedy CPU runners sometimes take off on the pitch.
    this.cpuStealFrom = undefined;
    if (this.features.steals) {
      for (const from of [2, 1] as const) {
        if (!this.runners.has(from) || this.runners.has(from + 1)) continue;
        const runner = getCharacter(this.runners.get(from)!.getData('id') as string);
        if (cpuWantsSteal(runner.stats.speed, () => Math.random())) {
          this.cpuStealFrom = from;
          break;
        }
      }
    }
    // Nominal meter error per band, for callers that only know the band.
    const NOMINAL: Record<PitchBand, number> = { perfect: 0, good: 110, weak: 205, wild: 320 };
    const err = errorMs ?? NOMINAL[band];
    this.phase = 'resolving';
    this.autoThrowTimer?.remove();
    this.autoThrowTimer = undefined;
    this.selectedPitch = undefined;
    this.pitchSelect?.destroy(); // headless callers can skip the menu
    this.pitchSelect = undefined;
    this.clearPitchVisuals();
    this.showPitchFeedback(band);
    this.pitcherWindup();

    const plan = resolvePitchLocation(
      kind,
      target,
      this.playerPitcher.stats.pitching,
      err,
      CPU_PITCH_TRAVEL_MS,
      () => Math.random()
    );
    const cpuPlan = resolveCpuPitchLocated(plan, band, this.cpuBatter, () => Math.random());
    this.time.delayedCall(ANIM.WINDUP_MS, () => this.launchCpuPitchMain(plan, cpuPlan));
  }

  /** The aimed pitch flies its curved path over the drawn zone, then settles. */
  private launchCpuPitchMain(plan: PitchPlan, cpuPlan: CpuPitchPlan): void {
    audio.pitchWoosh();
    this.zoneGfx = zoneOutline(this);
    if (this.cpuStealFrom !== undefined) {
      const p = basePos(this.cpuStealFrom);
      floatingText(this, p.x, p.y - 54, 'RUNNER GOING!', COLORS.red, 26);
    }
    const start: Vec = { x: MOUND.x, y: MOUND.y - 36 };
    const end = plateToScreen(plan.actual);
    const ball = this.add.circle(start.x, start.y, 9, COLORS.white).setStrokeStyle(2, COLORS.ink).setDepth(20);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: plan.travelMs,
      ease: 'Sine.in',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const bend = ballCurveAt(plan, t);
        ball.setPosition(start.x + (end.x - start.x) * t + bend.x, start.y + (end.y - start.y) * t + bend.y);
        ball.setScale(0.7 + t * 0.8);
      },
      onComplete: () => {
        ball.destroy();
        this.zoneGfx?.destroy();
        this.zoneGfx = undefined;
        this.settleCpuPitch(cpuPlan);
      },
    });
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
        this.resolveCpuStealThen({ kind: 'ball', bases: 0, description: 'Ball!' });
      } else {
        floatingText(this, HOME.x, HOME.y - 60, 'STRIKE!', COLORS.gold, 28);
        audio.whiff();
        this.resolveCpuStealThen({ kind: 'strike', bases: 0, description: 'Strike! Looking!' });
      }
      return;
    }

    this.animateSwing();
    // A trailing CPU muscles up with its own juice.
    let cpuBand = plan.cpuBand;
    if (
      this.features.juice &&
      cpuBand !== 'miss' &&
      cpuWantsSpend(this.cpuJuice, 'powerSwing', this.aiScore - this.playerScore, () => Math.random())
    ) {
      this.cpuJuice = spend(this.cpuJuice, 'powerSwing');
      const up: Record<SwingBand, SwingBand> = { miss: 'weak', weak: 'good', good: 'perfect', perfect: 'perfect' };
      cpuBand = up[cpuBand];
      floatingText(this, HOME.x, HOME.y - 90, '⚡ POWER SWING!', COLORS.red, 24);
    }
    const outcome = resolveContact(cpuBand, this.cpuBatter, this.playerPitcher, () => Math.random(), this.geo);
    if (outcome.kind !== 'inPlay') {
      if (outcome.kind === 'strike') audio.whiff();
      else audio.crack();
      this.resolveCpuStealThen({ kind: outcome.kind, bases: 0, description: outcome.description });
      return;
    }
    this.cpuStealFrom = undefined; // contact: the live play owns the runners now
    audio.crack();
    if (outcome.launch.homer) {
      this.flyHitBall(4);
      screenShake(this, SHAKE.homer);
      this.callIt('homer', { name: this.cpuBatter.name }, 2);
      this.applyCpuResult({ kind: 'hit', bases: 4, description: 'HOME RUN! 💥' });
      return;
    }
    screenShake(this, SHAKE.single);
    this.beginLivePlay('defense', outcome.launch);
  }

  /**
   * If a CPU runner took off on this pitch, race them first (a quick tap on
   * the throw-down prompt sharpens the catcher's arm), then fold in the
   * at-bat result. Fouls and ball-four are dead balls — the runner goes back.
   */
  private resolveCpuStealThen(result: AtBatResult): void {
    const from = this.cpuStealFrom;
    this.cpuStealFrom = undefined;
    const token = from !== undefined ? this.runners.get(from) : undefined;
    const willWalk = result.kind === 'ball' && this.halfState.count.balls + 1 >= 4;
    const live =
      from !== undefined &&
      token !== undefined &&
      !willWalk &&
      (result.kind === 'strike' || result.kind === 'ball');
    if (!live) {
      this.applyCpuResult(result);
      return;
    }

    const { container } = pill(this, GAME_WIDTH / 2, GAME_HEIGHT - 46, '🚨 TAP! THROW HIM OUT!', {
      fill: COLORS.red,
      textColor: '#ffffff',
      fontSize: 26,
    });
    container.setDepth(95);
    const start = this.time.now;
    let done = false;
    const finish = (reactMs: number) => {
      if (done) return;
      done = true;
      container.destroy();
      const runner = getCharacter(token!.getData('id') as string);
      const catcher = getCharacter(this.fieldAssignment.find((a) => a.position === 'C')!.charId);
      const reactBonus = Math.max(0, (900 - reactMs) / 900) * 3;
      const safe = rollSteal(
        {
          runnerSpeed: runner.stats.speed,
          catcherArm: catcher.stats.pitching,
          pitchKind: this.lastPitchKind ?? null,
          reactBonus,
        },
        () => Math.random()
      );
      this.halfState = applySteal(this.halfState, from!, safe).state;
      this.animateSteal(from!, token!, safe, true);
      // A caught-stealing third out ends the half; the at-bat carries over conceptually.
      if (isHalfOver(this.halfState)) {
        this.refreshHud();
        this.time.delayedCall(900, () => this.endHalf());
        return;
      }
      this.time.delayedCall(600, () => this.applyCpuResult(result));
    };
    this.input.once('pointerdown', () => finish(this.time.now - start));
    this.time.delayedCall(900, () => finish(900));
  }

  private applyCpuResult(result: AtBatResult): void {
    const prevBatter = this.cpuBatter;
    const applied = applyAtBat(this.halfState, result);
    this.halfState = applied.state;
    if (applied.runsScored > 0) this.aiScore += applied.runsScored;
    // YOU threw the K — charge the meter.
    if (result.kind === 'strike' && applied.batterOut) {
      this.gainJuice('player', 'strikeoutThrown', this.playerPitcher.ability);
      this.callIt('strikeoutPitched', { name: prevBatter.name });
    }

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
        this.beginPitchTurn();
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

    // The batting-stance pose has the bat baked in, drawn facing the pitch.
    const targetX = HOME.x - 70;
    const spr = this.add
      .image(walkIn ? GAME_WIDTH + 50 : targetX, HOME.y + 6, poseKey(char.id, 'bat'))
      .setOrigin(0.5, 1)
      .setDepth(28);
    const s = 150 / spr.height;
    spr.setScale(s);
    this.batterSprite = spr;
    this.batterScale = s;

    if (walkIn) {
      // Jog to the plate with real run frames (facing left = flipX on).
      spr.setFlipX(true);
      const cycle = runCycle(this, spr, char.id);
      this.tweens.add({
        targets: spr,
        x: targetX,
        duration: 460,
        ease: 'Sine.out',
        onComplete: () => {
          cycle.stop(false);
          if (this.batterSprite !== spr) return;
          spr.setFlipX(false);
          spr.setTexture(poseKey(char.id, 'bat'));
          this.startBatterIdle(spr, s);
        },
      });
      return;
    }

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

  private fadeOutBatter(): void {
    this.batterIdle?.stop();
    if (!this.batterSprite) return;
    const s = this.batterSprite;
    this.batterSprite = undefined;
    this.tweens.add({ targets: s, alpha: 0, y: s.y - 8, duration: 300, delay: 90, onComplete: () => s.destroy() });
  }

  private animateSwing(): void {
    this.batterIdle?.stop();
    const spr = this.batterSprite;
    if (spr) {
      // The bat is part of the stance art — whip the whole kid through it.
      spr.setScale(this.batterScale); // clear any mid-breath scale
      this.tweens.add({ targets: spr, angle: 16, duration: ANIM.SWING_MS, yoyo: true, ease: 'Quad.out' });
      this.tweens.add({ targets: spr, x: spr.x + 10, duration: ANIM.SWING_MS, yoyo: true, ease: 'Quad.out' });
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

  /**
   * ONE pointer, routed by phase: batting -> swing, mound -> throw,
   * fielding -> steer / hold-to-charge a throw, running -> "everybody GO!".
   */
  private bindSwingInput(): void {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.lastPointer = { x: p.worldX, y: p.worldY };
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.lastPointer = { x: p.worldX, y: p.worldY };
      if (this.phase === 'pitching') this.onSwing();
      else if (this.phase === 'aiming') this.onThrow();
      else if (this.phase === 'running') {
        if (this.features.manualBaserunning) this.handleRunTap(this.lastPointer);
        else this.pendingRun = true;
      } else if (this.phase === 'fielding') this.beginThrowCharge();
    });

    this.input.on('pointerup', () => {
      if (this.phase === 'fielding' && this.charging) this.releaseThrow();
    });

    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.phase === 'pitching') this.onSwing();
      else if (this.phase === 'aiming') this.onThrow();
      else if (this.phase === 'running') {
        if (this.features.manualBaserunning) {
          // Keyboard shortcut: send the lead settled runner.
          const s = this.livePlay;
          const lead = s?.runners
            .filter((r) => r.done === null && !r.tagging && r.to === r.from && r.from < 4)
            .sort((a, b) => b.from - a.from)[0];
          if (lead) this.pendingSend = lead.charId;
        } else {
          this.pendingRun = true;
        }
      }
      else if (this.phase === 'fielding' && this.livePlay?.ball.phase === 'held') {
        // Keyboard shortcut: a solid throw to the sim's best target.
        const speed =
          this.liveParams.throwSpeedMin +
          0.8 * (this.liveParams.throwSpeedMax - this.liveParams.throwSpeedMin);
        this.pendingThrow = { base: chooseThrowTarget(this.livePlay, speed), power: 0.8 };
      }
    });
  }

  /** A fresh press while holding the ball = start charging a throw at a base. */
  private beginThrowCharge(): void {
    const s = this.livePlay;
    if (!s || s.ball.phase !== 'held') return; // still chasing — press just steers
    this.charging = true;
    this.chargeStart = this.time.now;
    this.chargeBase = this.nearestBaseTo(this.lastPointer);
    this.chargeMeter?.destroy();
    this.chargeMeter = this.add.graphics().setDepth(60);
    this.baseRings.forEach((r, i) => r.setStrokeStyle(5, i + 1 === this.chargeBase ? COLORS.red : COLORS.gold, 0.9));
  }

  private releaseThrow(): void {
    // Re-snap to wherever the pointer ended up — dragging onto a base aims there.
    this.chargeBase = this.nearestBaseTo(this.lastPointer);
    const held = this.time.now - this.chargeStart;
    const power = Math.min(1, Math.max(0.2, held / LIVE.THROW_METER_MS));
    this.pendingThrow = { base: this.chargeBase, power };
    this.charging = false;
    this.chargeMeter?.destroy();
    this.chargeMeter = undefined;
  }

  private nearestBaseTo(p: Vec): 1 | 2 | 3 | 4 {
    let best: 1 | 2 | 3 | 4 = 1;
    let bestD = Infinity;
    for (const base of [1, 2, 3, 4] as const) {
      const d = dist(p, basePos(base));
      if (d < bestD) {
        bestD = d;
        best = base;
      }
    }
    return best;
  }
}

// --- helpers ---------------------------------------------------------------

function bestPitcher(teamIds: string[]): Character {
  return teamIds
    .map(getCharacter)
    .reduce((best, c) => (c.stats.pitching > best.stats.pitching ? c : best));
}
