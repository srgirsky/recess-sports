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
import { GAME_WIDTH, GAME_HEIGHT, COLORS, TEAM_SIZE, AI_PICK_DELAY_MS, ANIM, type GameMode } from '../config';
import { getMode, setMode } from '../systems/mode';
import { ROSTER } from '../data/characters';
import type { Character } from '../data/types';
import {
  createDraft,
  applyPick,
  chooseAiPick,
  isDraftComplete,
  type DraftState,
} from '../systems/draft';
import { recordPick } from '../systems/picklog';
import { poseKey } from '../art/textureFactory';
import { makeButton } from '../ui/Button';
import { makeMuteButton } from '../ui/MuteButton';
import { ribbon, pill, panel, heading, FONT, OUTLINE } from '../ui/theme';
import { floatingText, burst, confetti } from '../ui/effects';
import { idleBob, squashHop, popIn, enterFrom, pulse, groundShadow, runCycle } from '../ui/anim';
import { drawStatBars } from '../ui/statbars';
import { mountPickRateOverlay } from '../dev/PickRateOverlay';
import { mountArtGallery } from '../dev/ArtGallery';
import * as audio from '../systems/audio';

type Phase =
  | 'title'
  | 'cutscene'
  | 'idle'
  | 'inspect'
  | 'playerRun'
  | 'cpuScan'
  | 'cpuRun'
  | 'done';

interface YardKid {
  char: Character;
  /** Container at the kid's FEET point; holds [shadow, img]. */
  root: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  home: { x: number; y: number; h: number; row: 0 | 1 };
  idle?: Phaser.Tweens.Tween;
  cycle?: { stop(restoreStand?: boolean): void };
}

// Yard geometry.
const DOOR = { x: 480, y: 208 };
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
  private cutsceneJobs: Array<Phaser.Tweens.Tween | Phaser.Time.TimerEvent> = [];
  private doors: Phaser.GameObjects.Rectangle[] = [];
  private inspectObjs: Phaser.GameObjects.GameObject[] = [];
  private inspectedId?: string;
  private straightToDraft = false;
  private titleObjs: Phaser.GameObjects.GameObject[] = [];
  private skipHint?: Phaser.GameObjects.Container;

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
    this.straightToDraft = data?.straightToDraft ?? false;
  }

  create(): void {
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
        audio.say(d === 'kid' ? 'Kid mode!' : 'Classic mode!');
        styleChips();
      });
      chips.push({ d, c: container });
      this.titleObjs.push(container);
    });
    styleChips();

    this.titleObjs.push(tag, play);
  }

  // --- Recess cutscene --------------------------------------------------------

  /** Ring the bell, fling the doors, stream all 30 kids to the wall. */
  private startRecess(): void {
    this.phase = 'cutscene';
    audio.bell();

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

    // Compute everyone's home spot, then stream them out.
    this.assignHomes();
    let i = 0;
    for (const kid of this.kids.values()) {
      const jitter = Math.floor(Math.random() * 60) - 30;
      const launch = this.time.delayedCall(
        620 + i * ANIM.STREAM_STAGGER_MS + jitter,
        () => this.streamOut(kid)
      );
      this.cutsceneJobs.push(launch);
      i++;
    }

    // When the last kid should have arrived, begin the draft.
    const doneAt = 620 + this.kids.size * ANIM.STREAM_STAGGER_MS + ANIM.STREAM_RUN_MS * 2 + 400;
    this.cutsceneJobs.push(this.time.delayedCall(doneAt, () => this.finishCutscene()));
  }

  /** Everyone's spot against the wall: 15 on the curb, 15 in front. */
  private assignHomes(): void {
    ROSTER.forEach((char, i) => {
      const row: 0 | 1 = i < 15 ? 0 : 1;
      const col = i % 15;
      const spacing = (GAME_WIDTH - 150) / 14;
      const x = 75 + col * spacing + (row === 1 ? spacing / 2 : 0);
      const home = {
        x: Math.min(GAME_WIDTH - 40, x),
        y: row === 0 ? CURB_Y : FRONT_Y,
        h: row === 0 ? 76 : 84,
        row,
      };
      const root = this.add.container(DOOR.x, DOOR.y).setDepth(row === 0 ? 10 + col : 30 + col);
      const shadow = groundShadow(this, 0, 2, 40);
      const img = this.add.image(0, 0, char.id).setOrigin(0.5, 1);
      img.setScale((home.h * 0.55) / img.height); // small at the door, grows en route
      root.add([shadow, img]);
      root.setVisible(false);
      this.kids.set(char.id, { char, root, img, home });
    });
  }

  /** One kid runs from the door, through the gap, to their wall spot. */
  private streamOut(kid: YardKid): void {
    const { root, img, home } = kid;
    root.setVisible(true);
    kid.cycle = runCycle(this, img, kid.char.id);
    img.setFlipX(home.x < DOOR.x);
    const finalScale = home.h / img.height;

    // Leg 1: out the doors and down through the gap.
    const midY = 330 + Math.random() * 20;
    const t1 = this.tweens.add({
      targets: root,
      y: midY,
      duration: ANIM.STREAM_RUN_MS * 0.45,
      ease: 'Sine.in',
      onComplete: () => {
        // Leg 2: across the yard to the wall spot (back rows step up to the curb).
        const t2 = this.tweens.add({
          targets: root,
          x: home.x,
          y: home.y,
          duration: ANIM.STREAM_RUN_MS,
          ease: 'Sine.out',
          onComplete: () => this.settleKid(kid),
        });
        this.cutsceneJobs.push(t2);
      },
    });
    this.cutsceneJobs.push(t1);
    // Grow to full row size on the way.
    const tScale = this.tweens.add({
      targets: img,
      scale: finalScale,
      duration: ANIM.STREAM_RUN_MS * 1.2,
      ease: 'Sine.out',
    });
    this.cutsceneJobs.push(tScale);
  }

  /** Kid arrives at the wall: stand, hop, breathe, become tappable. */
  private settleKid(kid: YardKid): void {
    kid.cycle?.stop(true);
    kid.cycle = undefined;
    kid.img.setFlipX(false);
    kid.img.setScale(kid.home.h / kid.img.height);
    kid.root.setPosition(kid.home.x, kid.home.y);
    squashHop(this, kid.img, { height: 8 });
    kid.idle?.stop();
    kid.idle = idleBob(this, kid.img, { amp: 3, dur: 800 + Math.random() * 400 });
    this.makeTappable(kid);
  }

  /** Idempotent cutscene fast-forward: everyone snaps to their spot. */
  finishCutscene(): void {
    if (this.phase !== 'cutscene') return;
    this.cutsceneJobs.forEach((j) => {
      if (j instanceof Phaser.Time.TimerEvent) j.remove(false);
      else j.stop();
    });
    this.cutsceneJobs = [];
    this.doors.forEach((d) => d.setScale(0.16, 1));
    for (const kid of this.kids.values()) {
      kid.cycle?.stop(true);
      kid.cycle = undefined;
      kid.root.setVisible(true);
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
    audio.say('Pick your team!');
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
    audio.say(kid.char.name);

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
        kid.root.setDepth(kid.home.row === 0 ? 10 : 30);
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
    audio.say(`${kid.char.name}!`);

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

  private walkToTeam(kid: YardKid, slot: { x: number; y: number; h: number }, done: () => void): void {
    kid.idle?.stop();
    kid.img.y = 0;
    kid.root.disableInteractive();
    kid.root.setDepth(70);
    kid.cycle = runCycle(this, kid.img, kid.char.id);
    kid.img.setFlipX(slot.x < kid.root.x);

    const dist = Math.hypot(slot.x - kid.root.x, slot.y - kid.root.y);
    const dur = Math.max(500, dist / 0.42);
    // Step down off the wall first if in the back row, then across.
    this.tweens.chain({
      targets: kid.root,
      tweens: [
        { y: kid.home.y === CURB_Y ? FRONT_Y : kid.root.y, duration: 140, ease: 'Quad.in' },
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
    } else {
      this.turnPill.setText('CPU picking…', 0xe8a0a0);
    }
  }

  private finishDraft(): void {
    this.phase = 'done';
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
      this.scene.start('Game', {
        playerTeam: this.state.playerTeam,
        aiTeam: this.state.aiTeam,
      });
    });
  }
}
