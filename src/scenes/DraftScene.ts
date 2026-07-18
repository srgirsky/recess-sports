// ---------------------------------------------------------------------------
// The draft — the heart of the product. Player and AI alternate picking from a
// grid of 30 kids until each has 9. Every player pick is logged to the "voting
// machine" (picklog). When both teams are full, we head to the game.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, TEAM_SIZE, AI_PICK_DELAY_MS } from '../config';
import { ROSTER, getCharacter } from '../data/characters';
import {
  createDraft,
  applyPick,
  chooseAiPick,
  isDraftComplete,
  type DraftState,
} from '../systems/draft';
import { recordPick } from '../systems/picklog';
import { makeCharacterCard, type CharacterCard } from '../ui/CharacterCard';
import { makeMuteButton } from '../ui/MuteButton';
import { ribbon, pill, panel, heading } from '../ui/theme';
import { floatingText } from '../ui/effects';
import * as audio from '../systems/audio';

export class DraftScene extends Phaser.Scene {
  private state!: DraftState;
  private cards = new Map<string, CharacterCard>();
  private playerSlots: Phaser.GameObjects.Container[] = [];
  private locked = false;
  private turnPill!: ReturnType<typeof pill>;

  constructor() {
    super('Draft');
  }

  create(): void {
    this.cards.clear();
    this.playerSlots = [];
    this.locked = false;
    this.state = createDraft(ROSTER.map((c) => c.id));

    // Themed sky background.
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x5fb0ea, 0x5fb0ea, 0xa8dcf6, 0xa8dcf6, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ribbon(this, GAME_WIDTH / 2, 34, 'PICK YOUR TEAM', { fill: COLORS.red, fontSize: 32 });
    makeMuteButton(this, 34, 34);
    this.turnPill = pill(this, GAME_WIDTH - 160, 34, '', { fill: COLORS.gold, minW: 250 });

    this.buildPool();
    this.buildTeamTray();
    this.refreshStatus();
  }

  private buildPool(): void {
    const cols = 10;
    const cardW = 88;
    const cardH = 124;
    const gapX = 6;
    const gapY = 10;
    const gridW = cols * cardW + (cols - 1) * gapX;
    const startX = (GAME_WIDTH - gridW) / 2 + cardW / 2;
    const startY = 132;

    ROSTER.forEach((char, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const card = makeCharacterCard(this, char, x, y, (c) => this.onPlayerPick(c.id), cardW, cardH);
      this.cards.set(char.id, card);
    });
  }

  // --- Bottom "dugout bench": 9 rounded slots that fill as you draft --------
  private buildTeamTray(): void {
    const trayY = GAME_HEIGHT - 74;
    const slotW = 88;
    const gap = 8;
    const count = TEAM_SIZE;
    const benchW = count * slotW + (count - 1) * gap + 150;
    panel(this, GAME_WIDTH / 2 + 30, trayY, benchW, 130, { fill: 0x2f5d3a, strokeWidth: 5 });

    heading(this, 70, trayY, 'YOUR\nTEAM', 22).setStroke('#14202e', 5);

    const startX = 150;
    for (let i = 0; i < count; i++) {
      const c = this.add.container(startX + i * (slotW + gap), trayY);
      const g = this.add.graphics();
      g.fillStyle(0x22303c, 0.4);
      g.fillRoundedRect(-slotW / 2, -56, slotW, 112, 12);
      g.lineStyle(3, 0xffffff, 0.5);
      g.strokeRoundedRect(-slotW / 2, -56, slotW, 112, 12);
      c.add(g);
      this.playerSlots.push(c);
    }
  }

  private onPlayerPick(id: string): void {
    if (this.locked || this.state.turn !== 'player') return;
    if (!this.state.pool.includes(id)) return;

    this.state = applyPick(this.state, id);
    recordPick(id);
    audio.pop();

    this.consumeCard(id);
    this.fillNextSlot(id);
    this.refreshStatus();

    if (isDraftComplete(this.state)) {
      this.finishDraft();
      return;
    }
    this.locked = true;
    this.time.delayedCall(AI_PICK_DELAY_MS, () => this.aiTurn());
  }

  private aiTurn(): void {
    const id = chooseAiPick(this.state, () => Math.random());
    this.state = applyPick(this.state, id);
    this.consumeCard(id, true);
    // CPU pick callout.
    const card = this.cards.get(id);
    if (card) floatingText(this, card.x, card.y - 40, `CPU picks\n${getCharacter(id).name}`, COLORS.red, 18);
    this.refreshStatus();
    this.locked = false;

    if (isDraftComplete(this.state)) this.finishDraft();
  }

  private consumeCard(id: string, aiPicked = false): void {
    const card = this.cards.get(id);
    if (!card) return;
    card.setCardEnabled(false);
    const flash = this.add
      .rectangle(card.x, card.y, 88, 124, aiPicked ? COLORS.red : COLORS.gold, 0.5)
      .setOrigin(0.5);
    this.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() });
  }

  private fillNextSlot(id: string): void {
    const idx = this.state.playerTeam.length - 1;
    const slot = this.playerSlots[idx];
    if (!slot) return;
    const img = this.add.image(0, 44, id).setOrigin(0.5, 1);
    const s = 104 / img.height;
    img.setScale(s);
    slot.add(img);
    this.tweens.add({ targets: img, scale: { from: s * 1.4, to: s }, duration: 200, ease: 'Back.out' });
  }

  private refreshStatus(): void {
    const mine = this.state.playerTeam.length;
    if (this.state.turn === 'player' && !this.locked) {
      this.turnPill.setText(`YOUR PICK!  ${mine}/${TEAM_SIZE}`, COLORS.gold);
    } else {
      this.turnPill.setText('CPU picking…', 0xe8a0a0);
    }
  }

  private finishDraft(): void {
    this.turnPill.setText('PLAY BALL!', COLORS.gold);
    this.time.delayedCall(700, () => {
      this.scene.start('Game', {
        playerTeam: this.state.playerTeam,
        aiTeam: this.state.aiTeam,
      });
    });
  }
}
