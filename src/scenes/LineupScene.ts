// ---------------------------------------------------------------------------
// Lineup screen (CLASSIC only): between the draft and the game, set your
// batting order, positions, and starting pitcher. Icon-forward for the age
// band: tap a kid, tap another kid — they trade places. Left column = the
// 1-9 batting order; right = a chalk mini-diamond with the 9 position pads
// (the kid on the mound pad IS your starting pitcher). AUTO re-deals the
// smart default; GO plays ball. Kid mode never sees this screen.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { getCharacter } from '../data/characters';
import type { TeamState } from '../data/types';
import type { PositionId } from '../systems/geometry';
import { autoAssign, swapOrder, swapPositions, validateLineup, type LineupPlan } from '../systems/lineup';
import { makeButton } from '../ui/Button';
import { heading, ribbon, FONT } from '../ui/theme';
import { popIn } from '../ui/anim';
import * as audio from '../systems/audio';
import { kidVoice, commentatorProfile } from '../systems/voices';
import {
  getTeamIdentity,
  setTeamIdentity,
  teamName,
  pickRival,
  TEAM_LOGOS,
  type TeamIdentity,
} from '../systems/team';
import { queueTeamTextures, teamSuffix } from '../art/textureFactory';
import { UNIFORM_COLORS } from '../art/palette';
import { getGamesPlayed } from '../systems/picklog';
import { getSeason } from '../systems/season';

/** Game init payload once lineups exist: teams + optional full plans. */
export interface GameInitData extends TeamState {
  playerPlan?: LineupPlan;
  aiPlan?: LineupPlan;
  /** Team identities (CLASSIC): drive jersey variants + spoken team names. */
  identity?: TeamIdentity;
  rival?: TeamIdentity;
  /** Batting practice: endless pitches, no outs, no innings, big DONE button. */
  practice?: boolean;
  /** This game counts toward the Recess Week season. */
  seasonGame?: boolean;
  /** Pass-and-play: both seats human-batted, the batting player holds the device. */
  matchType?: 'solo' | 'passplay';
}

/** Where each position pad sits on the mini-diamond (screen coords). */
const PAD_SPOTS: Record<PositionId, { x: number; y: number }> = {
  C: { x: 700, y: 520 },
  P: { x: 700, y: 420 },
  '1B': { x: 800, y: 400 },
  '2B': { x: 758, y: 330 },
  SS: { x: 642, y: 330 },
  '3B': { x: 600, y: 400 },
  LF: { x: 570, y: 240 },
  CF: { x: 700, y: 215 },
  RF: { x: 830, y: 240 },
};

interface Chip {
  container: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  kind: 'order' | 'pos';
  /** Order index or position id. */
  slot: number | PositionId;
}

export class LineupScene extends Phaser.Scene {
  private teams!: TeamState;
  private plan!: LineupPlan;
  private aiPlan!: LineupPlan;
  private chips: Chip[] = [];
  private selected?: Chip;
  private identity!: TeamIdentity;
  private rival!: TeamIdentity;
  private identityUi?: Phaser.GameObjects.Container;
  private seasonGame = false;
  private matchType: 'solo' | 'passplay' = 'solo';
  private pass: 1 | 2 = 1;
  private aPlan?: LineupPlan; // pass 1's plan, carried into pass 2
  private aIdentity?: TeamIdentity;
  private editingTeam: string[] = [];

  constructor() {
    super('Lineup');
  }

  create(
    data: TeamState & {
      seasonGame?: boolean;
      matchType?: 'solo' | 'passplay';
      pass?: 1 | 2;
      aPlan?: LineupPlan;
      aIdentity?: TeamIdentity;
    }
  ): void {
    this.teams = data;
    this.seasonGame = data.seasonGame ?? false;
    this.matchType = data.matchType ?? 'solo';
    this.pass = data.pass ?? 1;
    this.aPlan = data.aPlan;
    this.aIdentity = data.aIdentity;
    // Pass-and-play runs this screen twice: pass 1 edits Player 1's nine,
    // pass 2 (after the handoff) edits Player 2's.
    const passB = this.matchType === 'passplay' && this.pass === 2;
    this.editingTeam = passB ? data.aiTeam : data.playerTeam;
    this.plan = autoAssign(this.editingTeam);
    this.aiPlan = autoAssign(data.aiTeam);
    this.selected = undefined;
    if (passB) {
      // Player 2's identity is per-session; steer clear of Player 1's color.
      const taken = this.aIdentity?.color ?? -1;
      this.identity = { color: taken === 3 ? 4 : 3, logo: 3 };
    } else {
      this.identity = getTeamIdentity() ?? { color: 0, logo: 0 };
    }
    // Season games face the WEEK's scheduled rival; exhibitions rotate.
    const season = this.seasonGame ? getSeason() : null;
    this.rival = season ? season.rivals[season.gameIndex] : pickRival(this.identity, getGamesPlayed());

    // Chalkboard-green backdrop, like the dugout wall.
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2f6e4f, 0x2f6e4f, 0x3f8a63, 0x3f8a63, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // Chalk diamond on the right half.
    const chalk = this.add.graphics();
    chalk.lineStyle(3, 0xffffff, 0.5);
    chalk.strokeCircle(700, 425, 26); // mound
    chalk.lineBetween(700, 520, 810, 408); // home -> 1B line
    chalk.lineBetween(810, 408, 700, 305); // 1B -> 2B
    chalk.lineBetween(700, 305, 590, 408); // 2B -> 3B
    chalk.lineBetween(590, 408, 700, 520); // 3B -> home

    const who =
      this.matchType === 'passplay' ? (this.pass === 2 ? '2️⃣ PLAYER 2' : '1️⃣ PLAYER 1') : '⚾ YOUR';
    ribbon(this, GAME_WIDTH / 2, 46, `${who} LINEUP`);
    heading(this, 190, 96, '1 → 9', 26, '#fff4de');
    heading(this, 700, 96, 'POSITIONS', 26, '#fff4de');

    this.buildChips();
    this.buildIdentityPicker();
    this.queueJerseys();

    makeButton(this, {
      x: 190,
      y: GAME_HEIGHT - 56,
      label: 'AUTO',
      icon: '⚡',
      width: 210,
      height: 74,
      onClick: () => {
        this.plan = autoAssign(this.editingTeam);
        this.selected = undefined;
        audio.pop();
        this.buildChips();
      },
    });
    makeButton(this, {
      x: GAME_WIDTH - 190,
      y: GAME_HEIGHT - 56,
      label: 'PLAY BALL!',
      icon: '▶',
      width: 260,
      height: 74,
      onClick: () => this.go(),
    });
  }

  private go(): void {
    if (!validateLineup(this.plan, this.editingTeam)) return; // can't happen via swaps
    audio.cheer();

    if (this.matchType === 'passplay' && this.pass === 1) {
      // Hand the device to Player 2 for THEIR lineup + identity.
      audio.say('Player two, your turn!', commentatorProfile('A'), 'flush');
      this.scene.restart({
        ...this.teams,
        matchType: 'passplay',
        pass: 2,
        aPlan: this.plan,
        aIdentity: this.identity,
      });
      return;
    }

    const passB = this.matchType === 'passplay' && this.pass === 2;
    const payload: GameInitData = passB
      ? {
          playerTeam: this.aPlan!.order,
          aiTeam: this.plan.order,
          playerPlan: this.aPlan!,
          aiPlan: this.plan,
          identity: this.aIdentity,
          rival: this.identity,
          matchType: 'passplay',
          seasonGame: false,
        }
      : {
          playerTeam: this.plan.order,
          aiTeam: this.aiPlan.order,
          playerPlan: this.plan,
          aiPlan: this.aiPlan,
          identity: this.identity,
          rival: this.rival,
          seasonGame: this.seasonGame,
        };
    this.cameras.main.fadeOut(240, 0, 0, 0);
    // Jersey variants render in well under a second — but never start the
    // game before the loader has finished baking them.
    const start = () => this.scene.start('Game', payload);
    this.time.delayedCall(260, () => {
      if (this.load.isLoading()) this.load.once('complete', start);
      else start();
    });
  }

  /**
   * MY TEAM: a color-dot row + logo-emoji grid in the middle column. The
   * "name" is the spoken color+logo pair — naming a team requires zero
   * reading. Changing either re-bakes the jersey textures in the background.
   */
  private buildIdentityPicker(): void {
    this.identityUi?.destroy();
    const root = this.add.container(440, 150);
    const title = this.add
      .text(0, -34, 'MY TEAM', { fontFamily: FONT, fontSize: '20px', color: '#fff4de', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setStroke('#14202e', 5);
    const jersey = parseInt(UNIFORM_COLORS[this.identity.color].jersey.slice(1), 16);
    const preview = this.add.circle(0, 16, 34, jersey).setStrokeStyle(4, COLORS.ink, 0.9);
    const logo = this.add.text(0, 16, TEAM_LOGOS[this.identity.logo].icon, { fontSize: '34px' }).setOrigin(0.5);
    root.add([title, preview, logo]);

    UNIFORM_COLORS.forEach((u, i) => {
      const dot = this.add
        .circle((i % 4) * 34 - 51, 74 + Math.floor(i / 4) * 34, 13, parseInt(u.jersey.slice(1), 16))
        .setStrokeStyle(3, i === this.identity.color ? COLORS.gold : COLORS.ink, 1);
      dot.setInteractive();
      dot.on('pointerdown', () => this.setIdentity({ ...this.identity, color: i }));
      root.add(dot);
    });
    TEAM_LOGOS.forEach((l, i) => {
      const t = this.add
        .text((i % 4) * 36 - 54, 152 + Math.floor(i / 4) * 38, l.icon, {
          fontSize: i === this.identity.logo ? '30px' : '22px',
        })
        .setOrigin(0.5);
      t.setAlpha(i === this.identity.logo ? 1 : 0.65);
      t.setInteractive();
      t.on('pointerdown', () => this.setIdentity({ ...this.identity, logo: i }));
      root.add(t);
    });
    this.identityUi = root;
  }

  private setIdentity(next: TeamIdentity): void {
    this.identity = next;
    // Player 2's pick is session-only; only the device owner's seat persists.
    if (!(this.matchType === 'passplay' && this.pass === 2)) {
      setTeamIdentity(next);
      this.rival = pickRival(next, getGamesPlayed());
    }
    audio.pop();
    audio.say(`${teamName(next)}!`, commentatorProfile('A'), 'flush');
    this.buildIdentityPicker();
    this.queueJerseys();
  }

  /** Bake team-jersey texture variants in the background. */
  private queueJerseys(): void {
    const chars = (ids: string[]) => ids.map(getCharacter);
    // This pass's team in this pass's colors.
    queueTeamTextures(
      this,
      chars(this.editingTeam),
      { color: this.identity.color, logo: TEAM_LOGOS[this.identity.logo].icon },
      teamSuffix(this.identity.color, this.identity.logo)
    );
    // Solo also bakes the CPU rival here; pass-and-play bakes each team on
    // its own pass (pass 1 already covered Player 1's nine).
    if (this.matchType !== 'passplay') {
      queueTeamTextures(
        this,
        chars(this.teams.aiTeam),
        { color: this.rival.color, logo: TEAM_LOGOS[this.rival.logo].icon },
        teamSuffix(this.rival.color, this.rival.logo)
      );
    }
    this.load.start();
  }

  /** (Re)draw every chip from the current plan. */
  private buildChips(): void {
    for (const c of this.chips) c.container.destroy();
    this.chips = [];

    // Batting order: two columns of portrait chips, numbered.
    this.plan.order.forEach((id, i) => {
      const col = i < 5 ? 0 : 1;
      const row = i % 5;
      const x = 105 + col * 165;
      const y = 158 + row * 88;
      this.chips.push(this.makeChip(x, y, id, 'order', i, `${i + 1}`));
    });

    // Position pads on the diamond.
    const byPos = new Map<PositionId, string>();
    for (const [id, pos] of Object.entries(this.plan.positions)) byPos.set(pos, id);
    for (const [pos, spot] of Object.entries(PAD_SPOTS) as Array<[PositionId, { x: number; y: number }]>) {
      const id = byPos.get(pos);
      if (!id) continue;
      this.chips.push(this.makeChip(spot.x, spot.y, id, 'pos', pos, pos));
    }
  }

  /** One tappable kid chip: portrait + tiny label + selection ring. */
  private makeChip(
    x: number,
    y: number,
    id: string,
    kind: 'order' | 'pos',
    slot: number | PositionId,
    label: string
  ): Chip {
    const char = getCharacter(id);
    const c = this.add.container(x, y);
    const isPitcherPad = kind === 'pos' && slot === 'P';
    const bg = this.add
      .circle(0, 0, kind === 'order' ? 36 : 32, isPitcherPad ? COLORS.gold : COLORS.cream, 1)
      .setStrokeStyle(3, COLORS.ink, 0.85);
    const ring = this.add
      .circle(0, 0, kind === 'order' ? 41 : 37)
      .setStrokeStyle(5, COLORS.gold, 1)
      .setVisible(false);
    const img = this.add.image(0, 2, id).setOrigin(0.5, 0.55);
    img.setScale((kind === 'order' ? 62 : 54) / img.height);
    const tag = this.add
      .text(kind === 'order' ? -34 : 0, kind === 'order' ? -26 : 34, label, {
        fontFamily: FONT,
        fontSize: kind === 'order' ? '20px' : '15px',
        color: '#fff4de',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setStroke('#14202e', 5);
    c.add([ring, bg, img, tag]);
    if (kind === 'order') {
      const name = this.add
        .text(44, 0, char.name.split(' ')[0], {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#fff4de',
        })
        .setOrigin(0, 0.5)
        .setStroke('#14202e', 4);
      c.add(name);
    }
    c.setSize(84, 78);
    c.setInteractive(new Phaser.Geom.Rectangle(-42, -39, 84, 78), Phaser.Geom.Rectangle.Contains);
    const chip: Chip = { container: c, ring, kind, slot };
    c.on('pointerdown', () => this.tapChip(chip, char.name));
    popIn(this, c, 1);
    return chip;
  }

  /** Tap-tap swapping, scoped to the chip's own group (order vs positions). */
  private tapChip(chip: Chip, name: string): void {
    if (!this.selected) {
      this.selected = chip;
      chip.ring.setVisible(true);
      audio.pop();
      const id = this.idAt(chip);
      audio.say(name, kidVoice(getCharacter(id)), 'chatter');
      return;
    }
    if (this.selected === chip) {
      this.selected.ring.setVisible(false);
      this.selected = undefined;
      return;
    }
    if (this.selected.kind !== chip.kind) {
      // Switch selection across groups instead of a confusing cross-swap.
      this.selected.ring.setVisible(false);
      this.selected = chip;
      chip.ring.setVisible(true);
      audio.pop();
      return;
    }
    if (chip.kind === 'order') {
      this.plan = swapOrder(this.plan, this.selected.slot as number, chip.slot as number);
    } else {
      this.plan = swapPositions(this.plan, this.idAt(this.selected), this.idAt(chip));
    }
    audio.crack();
    this.selected = undefined;
    this.buildChips();
  }

  private idAt(chip: Chip): string {
    if (chip.kind === 'order') return this.plan.order[chip.slot as number];
    for (const [id, pos] of Object.entries(this.plan.positions)) {
      if (pos === chip.slot) return id;
    }
    return this.plan.order[0];
  }
}
