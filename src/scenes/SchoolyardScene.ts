// ---------------------------------------------------------------------------
// The schoolyard — title screen AND draft in one continuous world.
//
// Title beat: the school facade wears the RECESS SPORTS banner; one big PLAY
// button. Press it → the recess bell rings, the doors burst open, and all 30
// kids stream out to the blacktop and line up against the brick wall.
// The draft happens right there, playground style: tap a kid (they step
// forward, name spoken, stat card pops), PICK → they run to your side of the
// yard; the CPU visibly "scans" the wall before its kid walks to the other
// side. Both teams cheer when the wall is empty of nine-a-side.
//
// Draft RULES stay in systems/draft.ts (pure); every player pick still feeds
// the picklog voting machine. This scene is staging only.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  COLORS,
  TEAM_SIZE,
  AI_PICK_DELAY_MS,
  ANIM,
  CROWD,
  KID_SIZE,
  type GameMode,
} from '../config';
import { createCrowd, stepCrowd, type CrowdKidInit, type CrowdState } from '../systems/crowd';
import { getMode, setMode } from '../systems/mode';
import { getVenue, setVenue } from '../systems/venue';
import { VENUES, type VenueDef, type VenueId } from '../data/venues';
import { ROSTER } from '../data/characters';
import type { Character } from '../data/types';
import {
  createDraft,
  applyPick,
  chooseAiPick,
  chooseBestPick,
  isDraftComplete,
  type DraftState,
} from '../systems/draft';
import { recordPick } from '../systems/picklog';
import { poseKey, clearTeamVariant } from '../art/textureFactory';
import { getSeason, newSeason, saveSeason } from '../systems/season';
import { getTeamIdentity } from '../systems/team';
import { makeButton } from '../ui/Button';
import { makeMuteButton } from '../ui/MuteButton';
import { ribbon, pill, panel, heading, FONT, OUTLINE } from '../ui/theme';
import { floatingText, burst, confetti } from '../ui/effects';
import { idleBob, squashHop, popIn, enterFrom, pulse, groundShadow, runCycle } from '../ui/anim';
import { drawStatBars } from '../ui/statbars';
import { mountPickRateOverlay } from '../dev/PickRateOverlay';
import { mountArtGallery } from '../dev/ArtGallery';
import * as audio from '../systems/audio';
import { commentatorProfile, kidVoice } from '../systems/voices';

type Phase =
  | 'title'
  | 'cutscene'
  | 'idle'
  | 'inspect'
  | 'playerRun'
  | 'cpuScan'
  | 'cpuRun'
  | 'auto'
  | 'done';

interface YardKid {
  char: Character;
  /** Container at the kid's FEET point; holds [shadow, img]. */
  root: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  home: { x: number; y: number; h: number; row: 0 | 1 };
  idle?: Phaser.Tweens.Tween;
  cycle?: { stop(restoreStand?: boolean): void };
}

/** How small a kid is drawn at the door vs their full wall-row size. */
const DOOR_SCALE = 0.55;

// Yard geometry.
const DOOR = { x: 480, y: 208 };
const STAIRS = { topY: 212, stepH: 12, count: 4 }; // concrete steps below the doors
const WALL_GAP = { left: 428, right: 532 }; // opening in the wall under the doors
const CURB_Y = 308; // back-row feet (on the concrete curb)
const FRONT_Y = 356; // front-row feet (on the blacktop)
const TEAM_Y = [438, 482]; // cluster rows (back, front)

export class SchoolyardScene extends Phaser.Scene {
  private state!: DraftState;
  private kids = new Map<string, YardKid>();
  private phase: Phase = 'title';
  private turnPill!: ReturnType<typeof pill>;
  private pillPulse?: Phaser.Tweens.Tween;
  private cutsceneJobs: Array<Phaser.Tweens.Tween | Phaser.Tweens.TweenChain | Phaser.Time.TimerEvent> = [];
  private doors: Phaser.GameObjects.Rectangle[] = [];
  private inspectObjs: Phaser.GameObjects.GameObject[] = [];
  private inspectedId?: string;
  private straightToDraft = false;
  private titleObjs: Phaser.GameObjects.GameObject[] = [];
  private skipHint?: Phaser.GameObjects.Container;
  private autoBtn?: Phaser.GameObjects.Container;
  private autoWalkers = 0;
  private crowd?: CrowdState;

  constructor() {
    super('Schoolyard');
  }

  init(data?: { straightToDraft?: boolean }): void {
    this.kids = new Map();
    this.phase = 'title';
    this.cutsceneJobs = [];
    this.doors = [];
    this.inspectObjs = [];
    this.inspectedId = undefined;
    this.titleObjs = [];
    this.pillPulse = undefined;
    this.autoBtn = undefined;
    this.autoWalkers = 0;
    this.crowd = undefined;
    this.straightToDraft = data?.straightToDraft ?? false;
  }

  create(): void {
    // The draft always shows each kid's OWN look — team jerseys are a
    // Game/Result-era thing (the resolver re-arms on the next Game init).
    clearTeamVariant();
    this.cameras.main.fadeIn(250, 0x6c, 0xc0, 0xf5);
    this.state = createDraft(ROSTER.map((c) => c.id));

    this.drawSchoolyard();
    this.turnPill = pill(this, GAME_WIDTH - 160, 34, '', { fill: COLORS.gold, minW: 250 });
    this.turnPill.container.setVisible(false).setDepth(80);
    makeMuteButton(this, 34, 34);

    // A tap anywhere fast-forwards the cutscene.
    this.input.on('pointerdown', () => {
      if (this.phase === 'cutscene') this.finishCutscene();
    });

    if (import.meta.env.DEV) {
      mountPickRateOverlay(this);
      mountArtGallery(this);
      this.add
        .text(GAME_WIDTH - 12, GAME_HEIGHT - 8, 'dev: D = pick rates · G = art gallery', {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#ffffff',
        })
        .setOrigin(1, 1)
        .setAlpha(0.4);
    }

    if (this.straightToDraft) {
      this.startRecess();
    } else {
      this.buildTitle();
    }
  }

  // --- Environment ----------------------------------------------------------

  private drawSchoolyard(): void {
    const W = GAME_WIDTH;

    // Sky.
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x7cc4f2, 0x7cc4f2, 0xcdeeff, 0xcdeeff, 1);
    sky.fillRect(0, 0, W, 220);
    this.add.circle(880, 40, 34, 0xffe066).setDepth(0);
    this.driftCloud(180, 30, 0.7, 46000);
    this.driftCloud(640, 22, 0.5, 58000);

    // --- School building ---
    const brick = 0xb5563e;
    const brickDk = 0x93432f;
    const g = this.add.graphics();
    // Facade.
    g.fillStyle(brick, 1);
    g.fillRect(0, 64, W, 148);
    // Roofline.
    g.fillStyle(0x6b7a88, 1);
    g.fillRect(0, 52, W, 14);
    g.fillStyle(0x592f23, 1);
    g.fillRect(0, 64, W, 6);
    // Mortar courses + staggered head joints.
    g.lineStyle(2, brickDk, 0.35);
    for (let y = 78; y < 212; y += 14) g.lineBetween(0, y, W, y);
    for (let y = 78; y < 212; y += 14) {
      const off = ((y / 14) & 1) === 0 ? 0 : 24;
      for (let x = off; x < W; x += 48) g.lineBetween(x, y, x, y + 14);
    }

    // Windows: two rows, three per side, leaving the center for banner + doors.
    const winXs = [70, 172, 274, 630, 732, 834];
    for (const wy of [86, 148]) {
      for (const wx of winXs) {
        const wg = this.add.graphics();
        wg.fillStyle(0x27404f, 1);
        wg.fillRoundedRect(wx - 26, wy - 22, 52, 46, 5);
        wg.fillStyle(0xbfe6f7, 0.9);
        wg.fillRoundedRect(wx - 22, wy - 18, 44, 38, 4);
        wg.lineStyle(3, 0x27404f, 1);
        wg.lineBetween(wx, wy - 18, wx, wy + 20);
        wg.lineBetween(wx - 22, wy + 1, wx + 22, wy + 1);
        // Sill.
        wg.fillStyle(0xd8cdb5, 1);
        wg.fillRect(wx - 28, wy + 22, 56, 5);
      }
    }

    // Door frame + the two swinging doors (origins at the hinges).
    const frame = this.add.graphics();
    frame.fillStyle(0x59352a, 1);
    frame.fillRoundedRect(DOOR.x - 52, 128, 104, 84, { tl: 10, tr: 10, bl: 0, br: 0 });
    frame.fillStyle(0x2b3a48, 1);
    frame.fillRoundedRect(DOOR.x - 44, 136, 88, 76, { tl: 8, tr: 8, bl: 0, br: 0 });
    const doorL = this.add
      .rectangle(DOOR.x - 43, 174, 42, 74, 0x8a5a3b)
      .setOrigin(0, 0.5)
      .setStrokeStyle(3, 0x59352a)
      .setDepth(1);
    const doorR = this.add
      .rectangle(DOOR.x + 43, 174, 42, 74, 0x8a5a3b)
      .setOrigin(1, 0.5)
      .setStrokeStyle(3, 0x59352a)
      .setDepth(1);
    this.doors = [doorL, doorR];
    // Little porthole windows on the doors.
    this.add.circle(DOOR.x - 22, 158, 7, 0xbfe6f7).setStrokeStyle(2, 0x59352a).setDepth(2);
    this.add.circle(DOOR.x + 22, 158, 7, 0xbfe6f7).setStrokeStyle(2, 0x59352a).setDepth(2);
    // Bell box above the doors.
    this.add.circle(DOOR.x, 118, 9, 0xffce3a).setStrokeStyle(3, OUTLINE).setDepth(2);

    // Flag on a pole, gently waving.
    this.add.rectangle(36, 130, 5, 165, 0x8a93a0).setOrigin(0.5, 1);
    const flag = this.add.graphics({ x: 39, y: 48 });
    flag.fillStyle(COLORS.red, 1);
    flag.fillTriangle(0, 0, 46, 9, 0, 18);
    this.tweens.add({ targets: flag, scaleX: 0.85, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // --- Brick playground wall (lighter, with a cap) + opening at the doors.
    const wall = this.add.graphics();
    const wallTone = 0xcf8a63;
    const wallDk = 0xb06f4c;
    const drawWallSlab = (x0: number, x1: number) => {
      wall.fillStyle(wallTone, 1);
      wall.fillRect(x0, 222, x1 - x0, 76);
      wall.fillStyle(0xdba277, 1);
      wall.fillRect(x0, 212, x1 - x0, 12);
      wall.lineStyle(2, wallDk, 0.4);
      for (let y = 236; y < 298; y += 15) wall.lineBetween(x0, y, x1, y);
      for (let y = 236; y < 298; y += 15) {
        const off = ((y / 15) & 1) === 0 ? 0 : 26;
        for (let x = x0 + off; x < x1; x += 52) wall.lineBetween(x, y, x, y + 15);
      }
    };
    drawWallSlab(0, WALL_GAP.left);
    drawWallSlab(WALL_GAP.right, W);
    wall.setDepth(3);
    // Gate posts at the opening.
    for (const px of [WALL_GAP.left, WALL_GAP.right]) {
      this.add.rectangle(px, 255, 14, 90, 0x9aa5b1).setStrokeStyle(3, 0x6b7a88).setDepth(4);
    }
    // Path from the doors through the gap.
    const path = this.add.graphics();
    path.fillStyle(0x9aa5b1, 0.9);
    path.fillRect(WALL_GAP.left + 10, 212, WALL_GAP.right - WALL_GAP.left - 20, 100);
    path.setDepth(2);

    // Concrete steps down from the doors (the kids hop these in the cutscene).
    const stairs = this.add.graphics().setDepth(2);
    for (let s = 0; s < STAIRS.count; s++) {
      const sw = 84 + s * 6; // each step a touch wider than the one above
      const sy = STAIRS.topY + s * STAIRS.stepH;
      stairs.fillStyle(0xcfd6db, 1);
      stairs.fillRect(DOOR.x - sw / 2, sy, sw, STAIRS.stepH);
      stairs.fillStyle(0x7f8a95, 1);
      stairs.fillRect(DOOR.x - sw / 2, sy + STAIRS.stepH - 3, sw, 3);
    }

    // Concrete curb the back row stands on.
    this.add.rectangle(W / 2, 305, W, 18, 0xb9c0c7).setDepth(3);
    this.add.rectangle(W / 2, 298, W, 4, 0xd7dde2).setDepth(3);

    // --- Blacktop ---
    const bt = this.add.graphics();
    bt.fillStyle(0x434a52, 1);
    bt.fillRect(0, 314, W, GAME_HEIGHT - 314);
    // Patchy asphalt tone.
    bt.fillStyle(0x3a4149, 0.6);
    bt.fillEllipse(220, 420, 260, 90);
    bt.fillEllipse(700, 560, 320, 110);
    bt.fillEllipse(480, 620, 400, 90);
    bt.setDepth(2);

    // Chalk & paint markings (all Graphics — never add.triangle).
    const chalk = this.add.graphics().setDepth(3);
    // Four-square, left.
    chalk.lineStyle(4, 0xf3f6f8, 0.4);
    chalk.strokeRect(96, 470, 150, 130);
    chalk.lineBetween(171, 470, 171, 600);
    chalk.lineBetween(96, 535, 246, 535);
    // Hopscotch, right.
    chalk.lineStyle(4, 0xffe28a, 0.45);
    let hy = 600;
    for (const wdouble of [false, true, false, true, false]) {
      if (wdouble) {
        chalk.strokeRect(760 - 34, hy - 30, 34, 30);
        chalk.strokeRect(760, hy - 30, 34, 30);
      } else {
        chalk.strokeRect(760 - 17, hy - 30, 34, 30);
      }
      hy -= 30;
    }
    // Painted center circle.
    chalk.lineStyle(5, 0xf3f6f8, 0.28);
    chalk.strokeCircle(480, 560, 70);

    // Team zone pennants.
    this.pennant(60, 396, COLORS.gold);
    this.pennant(900, 396, COLORS.red);
  }

  private pennant(x: number, y: number, color: number): void {
    this.add.rectangle(x, y, 5, 60, 0x8a93a0).setOrigin(0.5, 1).setDepth(4);
    const f = this.add.graphics({ x: x + 2, y: y - 58 }).setDepth(4);
    f.fillStyle(color, 1);
    f.fillTriangle(0, 0, 34, 7, 0, 14);
    f.lineStyle(3, OUTLINE, 1);
    f.strokeTriangle(0, 0, 34, 7, 0, 14);
  }

  /** A soft two-lobe cloud that drifts across the sky forever. */
  private driftCloud(x: number, y: number, scale: number, loopMs: number): void {
    const c = this.add.container(x, y).setScale(scale).setAlpha(0.9).setDepth(0);
    c.add(this.add.circle(0, 0, 18, 0xffffff));
    c.add(this.add.circle(22, 4, 23, 0xffffff));
    c.add(this.add.circle(46, 0, 16, 0xffffff));
    c.add(this.add.ellipse(23, 12, 72, 20, 0xffffff));
    const drift = () => {
      const dist = GAME_WIDTH + 100 - c.x;
      this.tweens.add({
        targets: c,
        x: GAME_WIDTH + 100,
        duration: (dist / (GAME_WIDTH + 200)) * loopMs,
        ease: 'Linear',
        onComplete: () => {
          c.x = -100;
          drift();
        },
      });
    };
    drift();
  }

  // --- Title beat -----------------------------------------------------------

  private buildTitle(): void {
    // The banner hangs on the school between the window groups.
    const board = panel(this, GAME_WIDTH / 2, 108, 300, 92, {
      fill: 0x2f5d3a,
      strokeWidth: 5,
      radius: 12,
    });
    board.setDepth(5);
    const line1 = heading(this, GAME_WIDTH / 2, 88, 'RECESS', 42).setDepth(6);
    const line2 = heading(this, GAME_WIDTH / 2, 128, 'SPORTS', 42).setDepth(6);
    line1.setScale(0);
    line2.setScale(0);
    this.tweens.add({ targets: line1, scale: 1, delay: 150, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: line2, scale: 1, delay: 300, duration: 260, ease: 'Back.out' });

    const tag = ribbon(this, GAME_WIDTH / 2, 400, 'Recess is almost here…', {
      fill: COLORS.red,
      fontSize: 24,
      padX: 26,
    });
    tag.setDepth(5);
    enterFrom(this, tag, { dy: 40, delay: 350, dur: 320 });

    const play = makeButton(this, {
      x: GAME_WIDTH / 2,
      y: 512,
      label: 'PLAY',
      icon: '🔔',
      width: 300,
      height: 100,
      color: COLORS.gold,
      onClick: () => {
        if (this.phase !== 'title') return;
        audio.unlock();
        audio.pop();
        this.titleObjs.forEach((o) => o.destroy());
        this.titleObjs = [];
        this.startRecess();
      },
    });
    play.setDepth(5).setScale(0);
    this.tweens.add({
      targets: play,
      scale: 1,
      delay: 500,
      duration: 280,
      ease: 'Back.out',
      onComplete: () => pulse(this, play, { scale: 1.05, dur: 520 }),
    });

    // 🏆 RECESS WEEK: the 5-game season (resumes mid-week automatically) and
    // 📔 the sticker album.
    const week = pill(this, GAME_WIDTH / 2 - 250, 452, '🏆 WEEK', { fill: COLORS.gold, fontSize: 20, minW: 130 });
    week.container.setDepth(5);
    week.container.setInteractive(new Phaser.Geom.Rectangle(-70, -22, 140, 44), Phaser.Geom.Rectangle.Contains);
    week.container.on('pointerdown', () => {
      if (this.phase !== 'title') return;
      audio.unlock();
      audio.pop();
      if (getSeason()) {
        this.scene.start('Season'); // resume the week in progress
      } else {
        // Draft first; finishDraft sees the flag and builds the season.
        this.registry.set('seasonDraft', true);
        this.titleObjs.forEach((o) => o.destroy());
        this.titleObjs = [];
        this.startRecess();
      }
    });
    this.titleObjs.push(week.container);

    const albumBtn = pill(this, GAME_WIDTH / 2 + 250, 452, '📔', { fill: COLORS.cream, fontSize: 24, minW: 64 });
    albumBtn.container.setDepth(5);
    albumBtn.container.setInteractive(new Phaser.Geom.Rectangle(-32, -22, 64, 44), Phaser.Geom.Rectangle.Contains);
    albumBtn.container.on('pointerdown', () => {
      if (this.phase !== 'title') return;
      audio.unlock();
      this.scene.start('Album');
    });
    this.titleObjs.push(albumBtn.container);

    // 🥎 batting practice: no draft, no innings — grab a bat and swing.
    const practice = pill(this, GAME_WIDTH / 2 - 250, 512, '🥎 PRACTICE', {
      fill: COLORS.cream,
      fontSize: 20,
      minW: 160,
    });
    practice.container.setDepth(5);
    practice.container.setInteractive(
      new Phaser.Geom.Rectangle(-85, -22, 170, 44),
      Phaser.Geom.Rectangle.Contains
    );
    practice.container.on('pointerdown', () => {
      if (this.phase !== 'title') return;
      audio.unlock();
      audio.pop();
      // A quick random 9-vs-9 so the cage is always ready.
      const shuffled = [...ROSTER].sort(() => Math.random() - 0.5).map((c) => c.id);
      this.scene.start('Game', {
        playerTeam: shuffled.slice(0, TEAM_SIZE),
        aiTeam: shuffled.slice(TEAM_SIZE, TEAM_SIZE * 2),
        practice: true,
      });
    });
    this.titleObjs.push(practice.container);

    // ⚙️ settings.
    const gear = pill(this, GAME_WIDTH / 2 + 250, 512, '⚙️', { fill: COLORS.cream, fontSize: 24, minW: 64 });
    gear.container.setDepth(5);
    gear.container.setInteractive(
      new Phaser.Geom.Rectangle(-32, -22, 64, 44),
      Phaser.Geom.Rectangle.Contains
    );
    gear.container.on('pointerdown', () => {
      if (this.phase !== 'title') return;
      audio.unlock();
      this.scene.start('Settings');
    });
    this.titleObjs.push(gear.container);

    // Mode toggle: two icon chips under PLAY. Selected = gold + full size.
    const chips: Array<{ d: GameMode; c: Phaser.GameObjects.Container }> = [];
    const styleChips = () => {
      const current = getMode();
      for (const chip of chips) {
        const selected = chip.d === current;
        chip.c.setAlpha(selected ? 1 : 0.55);
        chip.c.setScale(selected ? 1 : 0.85);
      }
    };
    (
      [
        { d: 'main' as GameMode, label: '⚾ CLASSIC', x: GAME_WIDTH / 2 - 92 },
        { d: 'kid' as GameMode, label: '🙂 KID MODE', x: GAME_WIDTH / 2 + 92 },
      ] as const
    ).forEach(({ d, label, x }) => {
      const { container } = pill(this, x, 592, label, { fill: COLORS.cream, fontSize: 20, minW: 150 });
      container.setDepth(5);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-80, -22, 160, 44),
        Phaser.Geom.Rectangle.Contains
      );
      container.on('pointerdown', () => {
        if (this.phase !== 'title') return;
        setMode(d);
        audio.pop();
        audio.say(d === 'kid' ? 'Kid mode!' : 'Classic mode!', commentatorProfile('A'), 'flush');
        styleChips();
      });
      chips.push({ d, c: container });
      this.titleObjs.push(container);
    });
    styleChips();

    // Venue picker: three little field chips between the ribbon and PLAY.
    const venueChips: Array<{ id: VenueId; c: Phaser.GameObjects.Container }> = [];
    const styleVenues = () => {
      const current = getVenue().id;
      for (const chip of venueChips) {
        const selected = chip.id === current;
        chip.c.setAlpha(selected ? 1 : 0.5);
        chip.c.setScale(selected ? 1 : 0.82);
      }
    };
    (Object.values(VENUES) as VenueDef[]).forEach((v, i) => {
      const x = GAME_WIDTH / 2 + (i - 1) * 150;
      const { container } = pill(this, x, 444, `${v.emoji} ${v.name.replace('The ', '').toUpperCase()}`, {
        fill: COLORS.cream,
        fontSize: 15,
        minW: 128,
      });
      container.setDepth(5);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-70, -17, 140, 34),
        Phaser.Geom.Rectangle.Contains
      );
      container.on('pointerdown', () => {
        if (this.phase !== 'title') return;
        setVenue(v.id);
        audio.pop();
        audio.say(v.name + '!', commentatorProfile('A'), 'flush');
        styleVenues();
      });
      venueChips.push({ id: v.id, c: container });
      this.titleObjs.push(container);
    });
    styleVenues();

    this.titleObjs.push(tag, play);
  }

  // --- Recess cutscene --------------------------------------------------------

  /** Ring the bell, fling the doors, stream all 30 kids to the wall. */
  private startRecess(): void {
    this.phase = 'cutscene';
    audio.bell();

    // Open on a close-up of the doors, then pull back to the whole yard as the
    // kids start streaming out.
    const cam = this.cameras.main;
    cam.setZoom(ANIM.CUTSCENE_ZOOM);
    cam.centerOn(DOOR.x, DOOR.y + 30);
    const pullBack = this.time.delayedCall(ANIM.CUTSCENE_ZOOM_HOLD_MS, () => {
      // NB: camera effects need exact EaseMap keys ('Sine.easeInOut'), unlike
      // tweens which also accept the 'Sine.inOut' shorthand.
      cam.pan(GAME_WIDTH / 2, GAME_HEIGHT / 2, ANIM.CUTSCENE_ZOOMOUT_MS, 'Sine.easeInOut');
      cam.zoomTo(1, ANIM.CUTSCENE_ZOOMOUT_MS, 'Sine.easeInOut');
    });
    this.cutsceneJobs.push(pullBack);

    // Small "skip" hint (icon only).
    this.skipHint = pill(this, GAME_WIDTH - 60, GAME_HEIGHT - 34, '⏩', {
      fill: 0xffffff,
      fontSize: 18,
      minW: 60,
    }).container;
    this.skipHint.setDepth(80).setAlpha(0.75);

    // Doors fly open shortly after the bell starts.
    const openDoors = this.time.delayedCall(420, () => {
      this.doors.forEach((d) =>
        this.tweens.add({ targets: d, scaleX: 0.16, duration: 220, ease: 'Quad.out' })
      );
      burst(this, DOOR.x, DOOR.y - 10, 0xffffff, 10);
    });
    this.cutsceneJobs.push(openDoors);

    // Compute everyone's home spot, then hand the stream to the crowd sim —
    // update() steps it every frame and positions the kids directly.
    const inits = this.assignHomes();
    this.crowd = createCrowd(
      inits,
      {
        door: DOOR,
        stairBottomY: STAIRS.topY + STAIRS.count * STAIRS.stepH,
        stairHalfW: CROWD.STAIR_HALF_W,
        gap: WALL_GAP,
        gapExitY: 318,
        wallTopY: 222,
      },
      CROWD,
      () => Math.random()
    );

    // Safety net: if update() ever stops stepping the sim, still start the draft.
    this.cutsceneJobs.push(
      this.time.delayedCall(CROWD.MAX_RUN_MS + 2000, () => this.finishCutscene())
    );
  }

  /** Steps the stream-out sim; a no-op outside the recess cutscene. */
  update(_t: number, delta: number): void {
    if (this.phase !== 'cutscene' || !this.crowd) return;
    stepCrowd(this.crowd, delta, CROWD);
    for (const ev of this.crowd.events) {
      const kid = this.kids.get(ev.id);
      if (!kid) continue;
      if (ev.type === 'launched') {
        kid.root.setVisible(true);
        kid.cycle = runCycle(this, kid.img, kid.char.id);
      } else {
        kid.img.y = 0; // clear the run bob before idleBob captures its baseline
        this.settleKid(kid);
      }
    }
    this.renderCrowd();
    if (this.crowd.allSettled) {
      this.crowd = undefined;
      this.finishCutscene();
    }
  }

  /** Draw the sim state: positions set directly (never tweened — the sim owns them). */
  private renderCrowd(): void {
    if (!this.crowd) return;
    for (const k of this.crowd.kids) {
      if (k.phase !== 'stairs' && k.phase !== 'yard') continue;
      const kid = this.kids.get(k.id);
      if (!kid) continue;
      kid.root.setPosition(k.pos.x, k.pos.y);
      kid.root.setDepth(this.yardDepth(k.pos.y, k.pos.x));
      const f = DOOR_SCALE + (1 - DOOR_SCALE) * k.progress;
      kid.img.setScale((f * kid.home.h) / kid.img.height);
      kid.shadow.setScale(f);
      // Hysteresis so separation jiggle doesn't flicker the facing.
      if (Math.abs(k.vel.x) > 0.02) kid.img.setFlipX(k.vel.x < 0);
      // Flourish only — written to the img INSIDE the container so the sim's
      // feet position is never touched. Stairs: an arc per step, derived from
      // sim y so it survives fast-forward. Yard: a simple run bob.
      if (k.phase === 'stairs') {
        const stepPhase = (k.pos.y - STAIRS.topY) / STAIRS.stepH;
        kid.img.y = -CROWD.STAIR_HOP_H * Math.abs(Math.sin(Math.PI * stepPhase));
      } else {
        const t = k.bobSeed + (this.crowd.timeMs * CROWD.RUN_BOB_HZ * Math.PI) / 1000;
        kid.img.y = -CROWD.RUN_BOB_H * Math.abs(Math.sin(t));
      }
    }
  }

  /**
   * Draw order for kids in the yard: lower on screen = nearer = on top.
   * Output range ≈ 11–34 — above the environment (≤6), below the team
   * clusters (40/50), inspect (60+), and UI (80+). The tiny x term is a
   * deterministic tie-break for kids on the same row.
   */
  private yardDepth(y: number, x = 0): number {
    return 10 + (y - 200) * 0.15 + x * 0.0001;
  }

  /** Everyone's spot against the wall: 15 on the curb, 15 in front. */
  private assignHomes(): CrowdKidInit[] {
    const inits: CrowdKidInit[] = [];
    ROSTER.forEach((char, i) => {
      const row: 0 | 1 = i < 15 ? 0 : 1;
      const col = i % 15;
      const spacing = (GAME_WIDTH - 150) / 14;
      const x = 75 + col * spacing + (row === 1 ? spacing / 2 : 0);
      const home = {
        x: Math.min(GAME_WIDTH - 40, x),
        y: row === 0 ? CURB_Y : FRONT_Y,
        h: row === 0 ? KID_SIZE.WALL_BACK_H : KID_SIZE.WALL_FRONT_H,
        row,
      };
      const root = this.add
        .container(DOOR.x, DOOR.y)
        .setDepth(this.yardDepth(home.y, home.x));
      const shadow = groundShadow(this, 0, 2, 46);
      const img = this.add.image(0, 0, char.id).setOrigin(0.5, 1);
      img.setScale((home.h * DOOR_SCALE) / img.height); // small at the door, grows en route
      shadow.setScale(DOOR_SCALE);
      root.add([shadow, img]);
      root.setVisible(false);
      this.kids.set(char.id, { char, root, img, shadow, home });
      inits.push({ id: char.id, home: { x: home.x, y: home.y } });
    });
    return inits;
  }

  /** Kid arrives at the wall: stand, hop, breathe, become tappable. */
  private settleKid(kid: YardKid): void {
    kid.cycle?.stop(true);
    kid.cycle = undefined;
    kid.img.setFlipX(false);
    kid.img.setScale(kid.home.h / kid.img.height);
    kid.shadow.setScale(1);
    kid.root.setPosition(kid.home.x, kid.home.y);
    kid.root.setDepth(this.yardDepth(kid.home.y, kid.home.x));
    squashHop(this, kid.img, { height: 8 });
    kid.idle?.stop();
    kid.idle = idleBob(this, kid.img, { amp: 3, dur: 800 + Math.random() * 400 });
    this.makeTappable(kid);
  }

  /** Idempotent cutscene fast-forward: everyone snaps to their spot. */
  finishCutscene(): void {
    if (this.phase !== 'cutscene') return;
    this.crowd = undefined;
    this.cutsceneJobs.forEach((j) => {
      if (j instanceof Phaser.Time.TimerEvent) j.remove(false);
      else j.stop();
    });
    this.cutsceneJobs = [];
    const cam = this.cameras.main;
    cam.panEffect.reset();
    cam.zoomEffect.reset();
    cam.setZoom(1);
    cam.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.doors.forEach((d) => d.setScale(0.16, 1));
    for (const kid of this.kids.values()) {
      kid.cycle?.stop(true);
      kid.cycle = undefined;
      kid.root.setVisible(true);
      kid.img.y = 0; // clear any in-flight run bob before idleBob captures baseY
      this.settleKid(kid);
    }
    this.skipHint?.destroy();
    this.skipHint = undefined;

    const banner = ribbon(this, GAME_WIDTH / 2, 34, 'PICK YOUR TEAM', {
      fill: COLORS.red,
      fontSize: 30,
    });
    banner.setDepth(80);
    enterFrom(this, banner, { dy: -70, dur: 380, ease: 'Bounce.out' });
    this.turnPill.container.setVisible(true);
    // Skip-the-drafting escape hatch: fast-forwards the rest of the picks.
    // Depth 80 keeps it under the inspect panel's catcher, so a tap while a
    // stat card is open just closes the card.
    this.autoBtn = makeButton(this, {
      x: GAME_WIDTH - 160,
      y: 92,
      label: 'AUTO',
      icon: '⚡',
      width: 170,
      height: 52,
      color: 0x8a6de0,
      onClick: () => this.startAutoDraft(),
    });
    this.autoBtn.setDepth(80);
    enterFrom(this, this.autoBtn, { dy: -70, dur: 380, ease: 'Bounce.out' });
    audio.say('Pick your team!', commentatorProfile('A'), 'flush');
    this.phase = 'idle';
    this.refreshStatus();

    // Waiting kids occasionally hop — "pick me! pick me!"
    this.time.addEvent({
      delay: ANIM.AMBIENT_HOP_EVERY_MS,
      loop: true,
      callback: () => this.pickMeHop(),
    });
  }

  private pickMeHop(): void {
    if (this.phase !== 'idle' && this.phase !== 'cpuScan') return;
    const pool = this.state.pool.filter((id) => id !== this.inspectedId);
    if (pool.length === 0) return;
    const kid = this.kids.get(pool[Math.floor(Math.random() * pool.length)]);
    if (!kid || kid.cycle) return;
    kid.idle?.stop();
    kid.img.y = 0;
    squashHop(this, kid.img, {
      height: 12,
      onDone: () => {
        if (this.kids.has(kid.char.id)) {
          kid.idle = idleBob(this, kid.img, { amp: 3, dur: 800 });
        }
      },
    });
  }

  // --- Tapping & inspecting ---------------------------------------------------

  private makeTappable(kid: YardKid): void {
    const w = Math.max(50, kid.img.displayWidth + 8);
    // Back row: head + torso only, so the front row can't shadow them.
    const height = kid.home.row === 0 ? kid.home.h * 0.62 : kid.home.h;
    kid.root.off('pointerdown'); // settleKid can run twice (arrival + skip)
    kid.root.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -kid.home.h, w, height),
      Phaser.Geom.Rectangle.Contains
    );
    kid.root.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      if (this.phase !== 'idle' || this.state.turn !== 'player') return;
      if (!this.state.pool.includes(kid.char.id)) return;
      event.stopPropagation();
      this.inspectKid(kid.char.id);
    });
  }

  /** Tap a kid: they step forward and their stat card pops. */
  inspectKid(id: string): void {
    if (this.phase !== 'idle') return;
    const kid = this.kids.get(id);
    if (!kid) return;
    this.phase = 'inspect';
    this.inspectedId = id;
    audio.pop();
    audio.say(kid.char.name, kidVoice(kid.char), 'flush'); // tap the wall = voice toybox

    kid.idle?.stop();
    kid.img.y = 0;
    kid.root.setDepth(60);
    this.tweens.add({
      targets: kid.root,
      y: kid.home.y + 14,
      duration: 160,
      ease: 'Quad.out',
    });
    this.tweens.add({ targets: kid.img, scale: (kid.home.h * 1.18) / kid.img.height, duration: 160 });

    this.buildInspectPanel(kid.char);
  }

  private buildInspectPanel(char: Character): void {
    // Tap-away catcher behind the panel.
    const catcher = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.001)
      .setDepth(98)
      .setInteractive();
    catcher.on('pointerdown', () => this.closeInspect());

    const px = GAME_WIDTH / 2;
    const py = 508;
    const card = panel(this, px, py, 600, 224, { fill: COLORS.cream, strokeWidth: 6 });
    card.setDepth(100);
    popIn(this, card, 1);

    const portrait = this.add.image(-220, 94, char.id).setOrigin(0.5, 1);
    portrait.setScale(180 / portrait.height);
    card.add(portrait);

    const name = this.add
      .text(40, -76, char.name, { fontFamily: FONT, fontSize: '32px', color: '#14202e', fontStyle: '700' })
      .setOrigin(0.5, 0);
    card.add(name);
    const tag = this.add
      .text(40, -40, char.tagline, {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#3a4654',
        align: 'center',
        wordWrap: { width: 300 },
      })
      .setOrigin(0.5, 0);
    card.add(tag);

    drawStatBars(this, card, char.stats, { x: -130, y: 56, width: 250, height: 60 });

    const pick = makeButton(this, {
      x: px + 205,
      y: py + 52,
      label: 'PICK',
      icon: '✅',
      width: 160,
      height: 68,
      color: 0x3fae6b,
      onClick: () => this.confirmPick(),
    });
    pick.setDepth(101);
    const close = makeButton(this, {
      x: px + 254,
      y: py - 80,
      label: '✕',
      width: 62,
      height: 54,
      color: COLORS.red,
      onClick: () => this.closeInspect(),
    });
    close.setDepth(101);

    this.inspectObjs = [catcher, card, pick, close];
  }

  private closeInspect(): void {
    if (this.phase !== 'inspect') return;
    const kid = this.inspectedId ? this.kids.get(this.inspectedId) : undefined;
    this.inspectObjs.forEach((o) => o.destroy());
    this.inspectObjs = [];
    this.inspectedId = undefined;
    if (kid) this.returnToWall(kid);
    this.phase = 'idle';
  }

  private returnToWall(kid: YardKid): void {
    this.tweens.add({ targets: kid.root, y: kid.home.y, duration: 150 });
    this.tweens.add({
      targets: kid.img,
      scale: kid.home.h / kid.img.height,
      duration: 150,
      onComplete: () => {
        kid.root.setDepth(this.yardDepth(kid.home.y, kid.home.x));
        kid.idle = idleBob(this, kid.img, { amp: 3, dur: 800 });
      },
    });
  }

  /** PICK pressed: log the vote, and the kid runs to your side of the yard. */
  confirmPick(): void {
    if (this.phase !== 'inspect' || !this.inspectedId) return;
    const id = this.inspectedId;
    const kid = this.kids.get(id);
    if (!kid) return;

    this.inspectObjs.forEach((o) => o.destroy());
    this.inspectObjs = [];
    this.inspectedId = undefined;

    this.state = applyPick(this.state, id);
    recordPick(id);
    audio.pop();
    // The kid announces themself in their own voice as they run to the pennant.
    audio.say(kid.char.draftLine ?? `${kid.char.name}!`, kidVoice(kid.char), 'flush');

    this.phase = 'playerRun';
    this.refreshStatus();
    const slot = this.teamSpot('player', this.state.playerTeam.length - 1);
    this.walkToTeam(kid, slot, () => {
      burst(this, slot.x, slot.y - 20, COLORS.gold, 10);
      this.afterPlayerPick();
    });
  }

  private afterPlayerPick(): void {
    if (isDraftComplete(this.state)) {
      this.finishDraft();
      return;
    }
    this.phase = 'cpuScan';
    this.refreshStatus();
    this.time.delayedCall(AI_PICK_DELAY_MS, () => this.cpuTurn());
  }

  // --- CPU turn ---------------------------------------------------------------

  private cpuTurn(): void {
    if (this.phase !== 'cpuScan') return;
    const id = chooseAiPick(this.state, () => Math.random());

    const others = this.state.pool.filter((p) => p !== id);
    const stops: string[] = [];
    for (let i = 0; i < 3 && others.length > 0; i++) {
      stops.push(others[Math.floor(Math.random() * others.length)]);
    }
    stops.push(id);

    // A wandering "?" + spotlight while the CPU pretends to decide.
    const spot = this.add.ellipse(0, 0, 70, 22, 0xffffff, 0.25).setDepth(58).setVisible(false);
    const q = this.add
      .text(0, 0, '?', { fontFamily: FONT, fontSize: '34px', color: '#ffffff', fontStyle: '700' })
      .setOrigin(0.5, 1)
      .setStroke('#14202e', 6)
      .setDepth(59)
      .setVisible(false);

    let step = 0;
    const hop = () => {
      // AUTO can interrupt the scan mid-chain — bail before committing a pick.
      if (this.phase !== 'cpuScan') {
        spot.destroy();
        q.destroy();
        return;
      }
      const kid = this.kids.get(stops[step]);
      if (kid) {
        spot.setVisible(true).setPosition(kid.home.x, kid.home.y + 4);
        q.setVisible(true).setPosition(kid.home.x, kid.home.y - kid.home.h - 6);
        q.setScale(0.4);
        this.tweens.add({ targets: q, scale: 1, duration: 120, ease: 'Back.out' });
      }
      step += 1;
      if (step < stops.length) {
        this.time.delayedCall(ANIM.CPU_SCAN_HOP_MS, hop);
      } else {
        this.time.delayedCall(ANIM.CPU_SCAN_HOP_MS + 80, () => {
          spot.destroy();
          q.destroy();
          if (this.phase !== 'cpuScan') return;
          this.commitCpuPick(id);
        });
      }
    };
    hop();
  }

  private commitCpuPick(id: string): void {
    const kid = this.kids.get(id);
    this.state = applyPick(this.state, id);
    audio.pop();
    if (kid) audio.say(`${kid.char.name}!`, kidVoice(kid.char), 'chatter'); // droppable — never delays the draft
    this.phase = 'cpuRun';
    this.refreshStatus();
    if (!kid) return;
    kid.idle?.stop();
    kid.img.y = 0;
    floatingText(this, kid.home.x, kid.home.y - kid.home.h - 24, `CPU picks\n${kid.char.name}`, COLORS.red, 18);
    const slot = this.teamSpot('cpu', this.state.aiTeam.length - 1);
    this.walkToTeam(kid, slot, () => {
      if (isDraftComplete(this.state)) {
        this.finishDraft();
        return;
      }
      this.phase = 'idle';
      this.refreshStatus();
    });
  }

  // --- Auto draft ---------------------------------------------------------------

  /** AUTO pressed: rapid-fire the rest of the draft. Safe in idle or cpuScan. */
  private startAutoDraft(): void {
    if (this.phase !== 'idle' && this.phase !== 'cpuScan') return;
    this.phase = 'auto';
    this.autoBtn?.destroy();
    this.autoBtn = undefined;
    audio.pop();
    audio.say('Auto pick!', commentatorProfile('A'), 'flush');
    this.refreshStatus();
    // First pick waits one beat: a tap through an open stat card closes it on
    // pointerdown and lands here on pointerup, and the inspected kid needs
    // their ~150ms return-to-wall tween to finish before they can be drafted.
    this.time.delayedCall(ANIM.AUTO_PICK_STEP_MS, () => this.autoStep());
  }

  /** One auto pick for whoever's turn it is, then schedule the next. */
  private autoStep(): void {
    if (this.phase !== 'auto' || isDraftComplete(this.state)) return;
    const forPlayer = this.state.turn === 'player';
    const id = chooseBestPick(this.state, () => Math.random());
    this.state = applyPick(this.state, id);
    // NO recordPick — auto picks aren't human preference (see picklog.ts).
    this.refreshStatus();
    audio.pop();

    const kid = this.kids.get(id);
    const team = forPlayer ? 'player' : 'cpu';
    const idx = (forPlayer ? this.state.playerTeam : this.state.aiTeam).length - 1;
    if (kid) {
      // Walks overlap and durations vary with distance, so count them in and
      // out — the celebration waits for the LAST kid to land, not the last
      // one launched.
      this.autoWalkers += 1;
      this.walkToTeam(
        kid,
        this.teamSpot(team, idx),
        () => {
          this.autoWalkers -= 1;
          if (isDraftComplete(this.state) && this.autoWalkers === 0) this.finishDraft();
        },
        ANIM.AUTO_PICK_RUN_SPEED
      );
    }

    if (!isDraftComplete(this.state)) {
      this.time.delayedCall(ANIM.AUTO_PICK_STEP_MS, () => this.autoStep());
    } else if (!kid && this.autoWalkers === 0) {
      this.finishDraft(); // defensive: last pick's sprite missing
    }
  }

  // --- Walking to a team --------------------------------------------------------

  /** Where the n-th drafted kid stands in a team cluster. */
  private teamSpot(team: 'player' | 'cpu', idx: number): { x: number; y: number; h: number } {
    const backRow = idx >= 5;
    const i = backRow ? idx - 5 : idx;
    const y = backRow ? TEAM_Y[0] : TEAM_Y[1];
    const h = backRow ? 56 : 64;
    const step = 42;
    const x =
      team === 'player'
        ? 58 + i * step + (backRow ? step / 2 : 0)
        : GAME_WIDTH - 58 - i * step - (backRow ? step / 2 : 0);
    return { x, y, h };
  }

  private walkToTeam(
    kid: YardKid,
    slot: { x: number; y: number; h: number },
    done: () => void,
    speedMult = 1
  ): void {
    kid.idle?.stop();
    kid.img.y = 0;
    kid.root.disableInteractive();
    kid.root.setDepth(70);
    kid.cycle = runCycle(this, kid.img, kid.char.id);
    kid.img.setFlipX(slot.x < kid.root.x);

    const dist = Math.hypot(slot.x - kid.root.x, slot.y - kid.root.y);
    const dur = Math.max(500, dist / 0.42) / speedMult;
    // Step down off the wall first if in the back row, then across.
    this.tweens.chain({
      targets: kid.root,
      tweens: [
        { y: kid.home.y === CURB_Y ? FRONT_Y : kid.root.y, duration: 140 / speedMult, ease: 'Quad.in' },
        { x: slot.x, y: slot.y, duration: dur, ease: 'Sine.inOut' },
      ],
      onComplete: () => {
        kid.cycle?.stop(true);
        kid.cycle = undefined;
        kid.img.setFlipX(false);
        this.tweens.add({ targets: kid.img, scale: slot.h / kid.img.height, duration: 160 });
        kid.root.setDepth(slot.y === TEAM_Y[0] ? 40 : 50);
        squashHop(this, kid.img, { height: 10 });
        done();
      },
    });
  }

  // --- Status & finish ------------------------------------------------------------

  private refreshStatus(): void {
    const mine = this.state.playerTeam.length;
    this.pillPulse?.stop();
    this.pillPulse = undefined;
    this.turnPill.container.setScale(1);
    if (isDraftComplete(this.state)) return;
    if (this.phase === 'idle' && this.state.turn === 'player') {
      this.turnPill.setText(`YOUR PICK!  ${mine}/${TEAM_SIZE}`, COLORS.gold);
      this.pillPulse = pulse(this, this.turnPill.container, { scale: 1.06, dur: 420 });
    } else if (this.phase === 'playerRun' || this.phase === 'inspect') {
      this.turnPill.setText(`YOUR PICK!  ${mine}/${TEAM_SIZE}`, COLORS.gold);
    } else if (this.phase === 'auto') {
      this.turnPill.setText('AUTO DRAFT!', COLORS.gold);
    } else {
      this.turnPill.setText('CPU picking…', 0xe8a0a0);
    }
  }

  private finishDraft(): void {
    this.phase = 'done';
    this.autoBtn?.destroy();
    this.autoBtn = undefined;
    this.turnPill.setText('PLAY BALL!', COLORS.gold);
    audio.cheer();
    confetti(this, 70);
    // Both clusters cheer, in a wave.
    const all = [...this.state.playerTeam, ...this.state.aiTeam];
    all.forEach((id, i) => {
      const kid = this.kids.get(id);
      if (!kid) return;
      this.time.delayedCall(ANIM.CHEER_WAVE_STAGGER_MS * (i % 9), () => {
        kid.img.setTexture(poseKey(id, 'cheer'));
        squashHop(this, kid.img, { height: 16 });
      });
    });
    this.time.delayedCall(1300, () => this.cameras.main.fadeOut(280, 0x43, 0x4a, 0x52));
    this.time.delayedCall(1600, () => {
      // A season draft rolls into Recess Week instead of a one-off game.
      if (this.registry.get('seasonDraft')) {
        this.registry.remove('seasonDraft');
        const identity = getTeamIdentity() ?? { color: 0, logo: 0 };
        saveSeason(
          newSeason(this.state.playerTeam, identity, ROSTER.map((c) => c.id), () => Math.random())
        );
        this.scene.start('Season');
        return;
      }
      const teams = { playerTeam: this.state.playerTeam, aiTeam: this.state.aiTeam };
      // CLASSIC gets the lineup screen (order/positions/pitcher); kid mode
      // goes straight to the game with the automatic defaults.
      this.scene.start(getMode() === 'main' ? 'Lineup' : 'Game', teams);
    });
  }
}
