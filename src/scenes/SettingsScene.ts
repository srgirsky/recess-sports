// ---------------------------------------------------------------------------
// Settings (gear on the title): two fat volume sliders — 🔊 sound effects and
// 🗣 voices, independent pipelines — and a 1/2/3-inning game-length pick.
// Everything applies LIVE with audible feedback (drag the voice slider and a
// kid says hi at the new volume) so no reading is needed to understand it.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { getSettings, saveSettings, type Settings } from '../systems/settings';
import * as audio from '../systems/audio';
import { commentatorProfile } from '../systems/voices';
import { makeButton } from '../ui/Button';
import { ribbon, pill, heading } from '../ui/theme';

const TRACK_W = 420;

export class SettingsScene extends Phaser.Scene {
  private settings!: Settings;
  private inningPills: Phaser.GameObjects.Container[] = [];

  constructor() {
    super('Settings');
  }

  create(): void {
    this.settings = getSettings();
    this.inningPills = [];

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x35586e, 0x35586e, 0x4a7490, 0x4a7490, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ribbon(this, GAME_WIDTH / 2, 52, '⚙️ SETTINGS');

    this.slider(160, '🔊', this.settings.sfx, (v) => {
      this.settings.sfx = v;
      audio.setSfxVolume(v);
      saveSettings(this.settings);
      audio.pop(); // hear the new level immediately
    });
    this.slider(280, '🗣', this.settings.voice, (v) => {
      this.settings.voice = v;
      audio.setVoiceVolume(v);
      saveSettings(this.settings);
      audio.say('Hi there!', commentatorProfile('A'), 'flush');
    });

    heading(this, GAME_WIDTH / 2, 380, '⚾ INNINGS', 26, '#fff4de');
    this.buildInningPills();

    makeButton(this, {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT - 70,
      label: 'DONE',
      icon: '✅',
      width: 240,
      height: 78,
      onClick: () => this.scene.start('Schoolyard', { straightToDraft: false }),
    });
  }

  /** A fat-handled volume slider: track + draggable knob, icon on the left. */
  private slider(y: number, icon: string, value: number, onChange: (v: number) => void): void {
    const x0 = GAME_WIDTH / 2 - TRACK_W / 2;
    this.add.text(x0 - 64, y, icon, { fontSize: '40px' }).setOrigin(0.5);
    const track = this.add.graphics();
    const knob = this.add.circle(x0 + value * TRACK_W, y, 26, COLORS.gold).setStrokeStyle(4, COLORS.ink, 0.9);
    const fillBar = this.add.graphics();
    const redraw = (v: number) => {
      track.clear();
      track.fillStyle(COLORS.ink, 0.35);
      track.fillRoundedRect(x0 - 8, y - 10, TRACK_W + 16, 20, 10);
      fillBar.clear();
      fillBar.fillStyle(COLORS.gold, 0.85);
      if (v > 0.02) fillBar.fillRoundedRect(x0 - 4, y - 6, Math.max(12, v * TRACK_W + 8), 12, 6);
      knob.setX(x0 + v * TRACK_W);
    };
    redraw(value);
    knob.setDepth(2);
    knob.setInteractive({ draggable: true, useHandCursor: true });
    let last = value;
    knob.on('drag', (_p: Phaser.Input.Pointer, dragX: number) => {
      const v = Phaser.Math.Clamp((dragX - x0) / TRACK_W, 0, 1);
      redraw(v);
      last = v;
    });
    knob.on('dragend', () => onChange(last));
    // Tap anywhere on the track to jump there (little fingers miss knobs).
    const hit = this.add
      .rectangle(GAME_WIDTH / 2, y, TRACK_W + 60, 56, 0xffffff, 0.001)
      .setInteractive();
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const v = Phaser.Math.Clamp((p.worldX - x0) / TRACK_W, 0, 1);
      redraw(v);
      onChange(v);
    });
  }

  private buildInningPills(): void {
    for (const p of this.inningPills) p.destroy();
    this.inningPills = [];
    [1, 2, 3].forEach((n, i) => {
      const selected = this.settings.innings === n;
      const { container } = pill(this, GAME_WIDTH / 2 + (i - 1) * 130, 440, `${n}`, {
        fill: selected ? COLORS.gold : COLORS.cream,
        fontSize: 30,
        minW: 92,
      });
      container.setAlpha(selected ? 1 : 0.7);
      container.setInteractive(new Phaser.Geom.Rectangle(-46, -24, 92, 48), Phaser.Geom.Rectangle.Contains);
      container.on('pointerdown', () => {
        this.settings.innings = n;
        saveSettings(this.settings);
        audio.pop();
        this.buildInningPills();
      });
      this.inningPills.push(container);
    });
  }
}
