// ---------------------------------------------------------------------------
// GAME SETUP — the Backyard-Baseball-2001 single-page pre-game menu. One screen
// gathers everything: game type (GAME / PRACTICE / WATCH), the difficulty
// ladder (TEE-BALL / EASY / MEDIUM / HARD), innings, an errors ON/OFF toggle,
// the SWING SPOT / PITCH LOCATOR helper toggles, RESET ALL, and a CHOOSE A
// FIELD picker with a live preview. Everything applies immediately and is
// spoken (no reading needed); PLAY BALL routes by the chosen game type.
//
// Reached from the title PLAY button. GAME → the draft (Schoolyard,
// straightToDraft) → Lineup/Game; PRACTICE / WATCH → a quick random 9-v-9.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  COLORS,
  TEAM_SIZE,
  DIFFICULTY_TIERS,
  type DifficultyLevel,
} from '../config';
import { ROSTER } from '../data/characters';
import { VENUES, type VenueDef, type VenueId } from '../data/venues';
import { getVenue, setVenue } from '../systems/venue';
import { setDifficulty } from '../systems/mode';
import {
  getSettings,
  saveSettings,
  INNING_CHOICES,
  type Settings,
} from '../systems/settings';
import * as audio from '../systems/audio';
import { commentatorProfile } from '../systems/voices';
import { makeButton } from '../ui/Button';
import { ribbon, pill, heading } from '../ui/theme';
import { shadeInt, lightenInt, grassFlecks, hash01 } from '../art/fieldTexture';

type GameType = 'game' | 'practice' | 'watch';

const DIFF_ORDER: DifficultyLevel[] = ['teeball', 'easy', 'medium', 'hard'];

/** The field-preview card footprint (top-right, mirroring BB's photo panel). */
const PREVIEW = { x: 700, y: 300, w: 420, h: 260 };

export class GameSetupScene extends Phaser.Scene {
  private settings!: Settings;
  private gameType: GameType = 'game';
  private venueIdx = 0;

  // Re-styled on every change so the current pick reads as gold + full size.
  private typePills: Array<{ t: GameType; c: Phaser.GameObjects.Container }> = [];
  private diffPills: Array<{ d: DifficultyLevel; c: Phaser.GameObjects.Container }> = [];
  private inningPills: Array<{ n: number; c: Phaser.GameObjects.Container }> = [];
  private errorPills: Array<{ on: boolean; c: Phaser.GameObjects.Container }> = [];
  private helperPills: Array<{ key: 'swingSpot' | 'pitchLocator'; c: Phaser.GameObjects.Container }> = [];
  private previewLabel?: Phaser.GameObjects.Text;
  private preview?: Phaser.GameObjects.Container;

  constructor() {
    super('GameSetup');
  }

  create(): void {
    this.settings = getSettings();
    this.gameType = 'game';
    const ids = Object.keys(VENUES) as VenueId[];
    this.venueIdx = Math.max(0, ids.indexOf(getVenue().id));
    this.typePills = [];
    this.diffPills = [];
    this.inningPills = [];
    this.errorPills = [];
    this.helperPills = [];

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x3f6f9e, 0x3f6f9e, 0x5a8fc0, 0x5a8fc0, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ribbon(this, GAME_WIDTH / 2, 44, '⚾ GAME SETUP', { fontSize: 34 });

    // --- Left column: the choices -----------------------------------------
    heading(this, 250, 96, 'CHOOSE A GAME', 22, '#fff4de');
    (
      [
        { t: 'game' as GameType, label: '⚾ GAME' },
        { t: 'practice' as GameType, label: '🥎 PRACTICE' },
        { t: 'watch' as GameType, label: '👀 WATCH' },
      ]
    ).forEach(({ t, label }, i) => {
      const c = this.choiceChip(120 + i * 140, 138, label, () => {
        this.gameType = t;
        this.speak(label);
        this.styleAll();
      });
      this.typePills.push({ t, c });
    });

    heading(this, 250, 192, 'HOW HARD?', 22, '#fff4de');
    DIFF_ORDER.forEach((d, i) => {
      const tier = DIFFICULTY_TIERS[d];
      const c = this.choiceChip(96 + i * 108, 234, `${tier.icon} ${tier.label}`, () => {
        setDifficulty(d);
        // A fresh difficulty re-seeds the helper toggles to that mode's
        // defaults (RESET-ALL-lite), just like BB restores them per level.
        this.settings = getSettings();
        this.settings.errors = true;
        this.settings.swingSpot = tier.mode === 'main';
        this.settings.pitchLocator = tier.mode === 'main';
        saveSettings(this.settings);
        this.speak(tier.label);
        this.styleAll();
      }, 100, 15);
      this.diffPills.push({ d, c });
    });

    heading(this, 150, 292, '⚾ INNINGS', 20, '#fff4de');
    INNING_CHOICES.forEach((n, i) => {
      const c = this.choiceChip(70 + i * 74, 332, `${n}`, () => {
        this.settings.innings = n;
        saveSettings(this.settings);
        audio.pop();
        this.styleAll();
      }, 60);
      this.inningPills.push({ n, c });
    });

    heading(this, 130, 392, '🧤 OOPSIES', 20, '#fff4de');
    (
      [
        { on: true, label: 'ON' },
        { on: false, label: 'OFF' },
      ]
    ).forEach(({ on, label }, i) => {
      const c = this.choiceChip(70 + i * 96, 432, label, () => {
        this.settings.errors = on;
        saveSettings(this.settings);
        audio.pop();
        this.speak(on ? 'Oopsies on!' : 'Oopsies off!');
        this.styleAll();
      }, 84);
      this.errorPills.push({ on, c });
    });

    heading(this, 330, 392, '🙋 HELPERS', 20, '#fff4de');
    (
      [
        { key: 'swingSpot' as const, label: '🎯 SWING SPOT' },
        { key: 'pitchLocator' as const, label: '🥊 PITCH LOCATOR' },
      ]
    ).forEach(({ key, label }, i) => {
      const c = this.choiceChip(280 + i * 190, 432, label, () => {
        this.settings[key] = !this.settings[key];
        saveSettings(this.settings);
        audio.pop();
        this.styleAll();
      }, 176, 15);
      this.helperPills.push({ key, c });
    });

    // Reset all: back to defaults + medium difficulty.
    const reset = pill(this, 130, 494, '♻ RESET ALL', { fill: COLORS.cream, fontSize: 16, minW: 170 });
    reset.container.setInteractive(new Phaser.Geom.Rectangle(-90, -20, 180, 40), Phaser.Geom.Rectangle.Contains);
    reset.container.on('pointerdown', () => this.resetAll());

    // --- Right column: field preview + PLAY BALL --------------------------
    heading(this, PREVIEW.x, 128, 'CHOOSE A FIELD', 22, '#c6ffb0');
    this.drawPreview();

    const prevBtn = pill(this, PREVIEW.x - PREVIEW.w / 2 - 6, PREVIEW.y + PREVIEW.h / 2 + 40, '◀', {
      fill: COLORS.cream,
      fontSize: 26,
      minW: 56,
    });
    prevBtn.container.setInteractive(new Phaser.Geom.Rectangle(-28, -24, 56, 48), Phaser.Geom.Rectangle.Contains);
    prevBtn.container.on('pointerdown', () => this.cycleVenue(-1));

    const nextBtn = pill(this, PREVIEW.x + PREVIEW.w / 2 + 6, PREVIEW.y + PREVIEW.h / 2 + 40, '▶', {
      fill: COLORS.cream,
      fontSize: 26,
      minW: 56,
    });
    nextBtn.container.setInteractive(new Phaser.Geom.Rectangle(-28, -24, 56, 48), Phaser.Geom.Rectangle.Contains);
    nextBtn.container.on('pointerdown', () => this.cycleVenue(1));

    this.previewLabel = heading(this, PREVIEW.x, PREVIEW.y + PREVIEW.h / 2 + 40, this.currentVenue().name, 24, '#ffffff');

    makeButton(this, {
      x: PREVIEW.x,
      y: GAME_HEIGHT - 66,
      label: 'PLAY BALL',
      icon: '▶️',
      width: 300,
      height: 86,
      color: COLORS.gold,
      onClick: () => this.playBall(),
    });

    // Back to the title.
    const back = pill(this, 70, GAME_HEIGHT - 40, '⬅', { fill: COLORS.cream, fontSize: 22, minW: 60 });
    back.container.setInteractive(new Phaser.Geom.Rectangle(-30, -22, 60, 44), Phaser.Geom.Rectangle.Contains);
    back.container.on('pointerdown', () => this.scene.start('Schoolyard', { straightToDraft: false }));

    this.styleAll();
  }

  // --- Chips ----------------------------------------------------------------

  private choiceChip(
    x: number,
    y: number,
    label: string,
    onTap: () => void,
    minW = 120,
    fontSize = 18
  ): Phaser.GameObjects.Container {
    const { container } = pill(this, x, y, label, { fill: COLORS.cream, fontSize, minW });
    const w = (container as Phaser.GameObjects.Container).width || minW;
    container.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -22, w, 44),
      Phaser.Geom.Rectangle.Contains
    );
    container.on('pointerdown', onTap);
    return container;
  }

  /** Repaint every group so the active pick is gold + full size, others dim. */
  private styleAll(): void {
    const tier = DIFFICULTY_TIERS[this.settings.difficulty];
    const classic = tier.mode === 'main';
    const set = (c: Phaser.GameObjects.Container, on: boolean, dimTo = 0.55) => {
      // Selection read is alpha + scale (matches the title chips' pattern).
      c.setAlpha(on ? 1 : dimTo);
      c.setScale(on ? 1 : 0.86);
    };
    for (const p of this.typePills) set(p.c, p.t === this.gameType);
    for (const p of this.diffPills) set(p.c, p.d === this.settings.difficulty);
    for (const p of this.inningPills) set(p.c, p.n === this.settings.innings);
    for (const p of this.errorPills) set(p.c, p.on === this.settings.errors);
    for (const p of this.helperPills) {
      // Helpers only apply in classic (medium/hard); dim them hard in kid modes.
      const enabled = classic;
      const on = enabled && this.settings[p.key];
      p.c.setAlpha(enabled ? (on ? 1 : 0.5) : 0.28);
      p.c.setScale(on ? 1 : 0.86);
    }
  }

  private resetAll(): void {
    setDifficulty('medium');
    this.settings = getSettings();
    this.settings.errors = true;
    this.settings.swingSpot = true;
    this.settings.pitchLocator = true;
    this.settings.innings = 2;
    saveSettings(this.settings);
    setVenue('park');
    this.venueIdx = 0;
    this.gameType = 'game';
    this.drawPreview();
    this.previewLabel?.setText(this.currentVenue().name);
    audio.pop();
    this.speak('Reset!');
    this.styleAll();
  }

  // --- Field preview --------------------------------------------------------

  private currentVenue(): VenueDef {
    const ids = Object.keys(VENUES) as VenueId[];
    return VENUES[ids[this.venueIdx % ids.length]];
  }

  private cycleVenue(dir: 1 | -1): void {
    const n = Object.keys(VENUES).length;
    this.venueIdx = (this.venueIdx + dir + n) % n;
    const v = this.currentVenue();
    setVenue(v.id);
    this.drawPreview();
    this.previewLabel?.setText(v.name);
    audio.pop();
    this.speak(v.name);
  }

  /**
   * A compact, representative field thumbnail built from the venue's palette
   * (not GameScene.drawField, which is deeply scene-coupled): grass fill with
   * flecks, a dirt diamond, the fence line tinted per style, and a skyline
   * band hint. Enough to tell the three venues apart at a glance.
   */
  private drawPreview(): void {
    this.preview?.destroy();
    const v = this.currentVenue();
    const { x, y, w, h } = PREVIEW;
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const left = -w / 2;
    const top = -h / 2;

    // Sky / skyline band behind the fence.
    g.fillStyle(v.look.asphalt ? 0x8fa0ad : 0x8fd0f4, 1);
    g.fillRect(left, top, w, h * 0.28);
    // Skyline hint: a couple of blocky shapes tinted by the fence trim.
    const skTone = v.look.skyline === 'brick' ? 0x9a6b52 : v.look.skyline === 'rooftops' ? 0xb0705a : 0xcfe6ff;
    for (let i = 0; i < 5; i++) {
      const bw = w / 6;
      const bh = 10 + hash01(i * 3 + 1) * (h * 0.14);
      g.fillStyle(shadeInt(skTone, 0.05 + hash01(i) * 0.1), 0.85);
      g.fillRect(left + 8 + i * (bw + 4), top + h * 0.28 - bh, bw, bh);
    }

    // Outfield grass (or asphalt).
    g.fillStyle(v.look.grass, 1);
    g.fillRect(left, top + h * 0.28, w, h * 0.72);
    // Mow stripes / court tint.
    if (v.look.stripes || v.look.mowPattern === 'checker') {
      for (let i = 0; i < 6; i++) {
        if (i % 2 === 0) continue;
        g.fillStyle(v.look.grassDark, 0.5);
        g.fillRect(left + (i * w) / 6, top + h * 0.28, w / 6, h * 0.72);
      }
    }

    // Fence line just under the skyline band.
    g.fillStyle(v.look.fence, 1);
    g.fillRect(left, top + h * 0.28 - 6, w, 8);
    g.fillStyle(lightenInt(v.look.fence, 0.2), 1);
    g.fillRect(left, top + h * 0.28 - 6, w, 2);

    // Dirt infield diamond (a rotated square via a triangle pair).
    const cx = 0;
    const dy = top + h * 0.66;
    const dr = h * 0.3;
    g.fillStyle(v.look.dirt, 1);
    g.fillTriangle(cx, dy - dr, cx - dr * 1.2, dy, cx + dr * 1.2, dy);
    g.fillTriangle(cx - dr * 1.2, dy, cx + dr * 1.2, dy, cx, dy + dr);
    // Bases + mound dots.
    g.fillStyle(COLORS.white, 1);
    [
      [cx, dy - dr],
      [cx - dr * 1.2, dy],
      [cx + dr * 1.2, dy],
      [cx, dy + dr],
    ].forEach(([bx, by]) => g.fillRect(bx - 3, by - 3, 6, 6));
    g.fillStyle(shadeInt(v.look.dirt, 0.1), 1);
    g.fillCircle(cx, dy - dr * 0.1, 6);

    // A few grass flecks for texture (deterministic, rng-free).
    grassFlecks(
      g,
      left,
      top + h * 0.28,
      w,
      h * 0.72,
      lightenInt(v.look.grass, 0.18),
      v.look.grassDark,
      40
    );

    c.add(g);

    // Rounded frame on top.
    const frame = this.add.graphics();
    frame.lineStyle(6, COLORS.ink, 1);
    frame.strokeRoundedRect(left, top, w, h, 16);
    c.add(frame);

    // Mask the fill to the rounded rect so corners read clean.
    const maskG = this.make.graphics({});
    maskG.fillStyle(0xffffff);
    maskG.fillRoundedRect(x + left, y + top, w, h, 16);
    g.setMask(maskG.createGeometryMask());

    this.preview = c;
  }

  // --- Actions --------------------------------------------------------------

  private speak(word: string): void {
    audio.say(word + '!', commentatorProfile('A'), 'flush');
  }

  private playBall(): void {
    audio.unlock();
    audio.pop();
    if (this.gameType === 'game') {
      // Into the draft; finishDraft routes to Lineup (classic) or Game (kid).
      this.scene.start('Schoolyard', { straightToDraft: true });
      return;
    }
    // PRACTICE / WATCH: a quick random 9-v-9, no draft.
    const shuffled = [...ROSTER].sort(() => Math.random() - 0.5).map((ch) => ch.id);
    this.scene.start('Game', {
      playerTeam: shuffled.slice(0, TEAM_SIZE),
      aiTeam: shuffled.slice(TEAM_SIZE, TEAM_SIZE * 2),
      practice: this.gameType === 'practice',
      spectator: this.gameType === 'watch',
    });
  }
}
