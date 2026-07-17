// ---------------------------------------------------------------------------
// The draft — the heart of the product. Player and AI alternate picking from a
// grid of 30 kids until each has 9. Every player pick is logged to the "voting
// machine" (picklog). When both teams are full, we head to the game.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, TEAM_SIZE, AI_PICK_DELAY_MS } from '../config';
import { ROSTER } from '../data/characters';
import {
  createDraft,
  applyPick,
  chooseAiPick,
  isDraftComplete,
  type DraftState,
} from '../systems/draft';
import { recordPick } from '../systems/picklog';
import { makeCharacterCard, type CharacterCard } from '../ui/CharacterCard';
import * as audio from '../systems/audio';

export class DraftScene extends Phaser.Scene {
  private state!: DraftState;
  private cards = new Map<string, CharacterCard>();
  private statusText!: Phaser.GameObjects.Text;
  private playerSlots: Phaser.GameObjects.Container[] = [];
  private locked = false; // block input while the AI is "thinking"

  constructor() {
    super('Draft');
  }

  create(): void {
    this.cards.clear();
    this.playerSlots = [];
    this.locked = false;
    this.state = createDraft(ROSTER.map((c) => c.id));

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.sky);

    this.add
      .text(GAME_WIDTH / 2, 30, 'PICK YOUR TEAM', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '40px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setStroke('#14202e', 8);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 78, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        color: '#14202e',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    this.buildPool();
    this.buildTeamTray();
    this.refreshStatus();
  }

  // --- Pool grid: 30 cards, 10 columns x 3 rows ----------------------------
  private buildPool(): void {
    const cols = 10;
    const cardW = 88;
    const cardH = 124;
    const gapX = 4;
    const gapY = 8;
    const gridW = cols * cardW + (cols - 1) * gapX;
    const startX = (GAME_WIDTH - gridW) / 2 + cardW / 2;
    const startY = 130;

    ROSTER.forEach((char, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const card = makeCharacterCard(
        this,
        char,
        x,
        y,
        (c) => this.onPlayerPick(c.id),
        cardW,
        cardH
      );
      this.cards.set(char.id, card);
    });
  }

  // --- Bottom tray: 9 empty slots that fill as you draft -------------------
  private buildTeamTray(): void {
    const trayY = GAME_HEIGHT - 78;
    this.add
      .text(20, trayY - 60, 'YOUR TEAM', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setStroke('#14202e', 6);

    const slotW = 92;
    const startX = 130;
    for (let i = 0; i < TEAM_SIZE; i++) {
      const c = this.add.container(startX + i * (slotW + 6), trayY);
      const box = this.add.rectangle(0, 0, slotW, 120, COLORS.ink, 0.18).setOrigin(0.5);
      box.setStrokeStyle(3, COLORS.white);
      c.add(box);
      this.playerSlots.push(c);
    }
  }

  private onPlayerPick(id: string): void {
    if (this.locked || this.state.turn !== 'player') return;
    if (!this.state.pool.includes(id)) return;

    this.state = applyPick(this.state, id);
    recordPick(id); // <-- the vote is cast
    audio.pop();

    this.consumeCard(id);
    this.fillNextSlot(id);
    this.refreshStatus();

    if (isDraftComplete(this.state)) {
      this.finishDraft();
      return;
    }

    // Hand the turn to the AI after a beat so kids see it happen.
    this.locked = true;
    this.time.delayedCall(AI_PICK_DELAY_MS, () => this.aiTurn());
  }

  private aiTurn(): void {
    const id = chooseAiPick(this.state, () => Math.random());
    this.state = applyPick(this.state, id);
    this.consumeCard(id, /* aiPicked */ true);
    this.refreshStatus();
    this.locked = false;

    if (isDraftComplete(this.state)) this.finishDraft();
  }

  private consumeCard(id: string, aiPicked = false): void {
    const card = this.cards.get(id);
    if (!card) return;
    card.setCardEnabled(false);
    // Flash the picker's color so it's clear who grabbed the kid.
    const flash = this.add
      .rectangle(card.x, card.y, 88, 124, aiPicked ? COLORS.red : COLORS.gold, 0.5)
      .setOrigin(0.5);
    this.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() });
  }

  private fillNextSlot(id: string): void {
    const idx = this.state.playerTeam.length - 1;
    const slot = this.playerSlots[idx];
    if (!slot) return;
    const img = this.add.image(0, -4, id).setOrigin(0.5);
    img.setScale(96 / img.height);
    slot.add(img);
    this.tweens.add({
      targets: img,
      scale: { from: 96 / img.height * 1.4, to: 96 / img.height },
      duration: 200,
      ease: 'Back.out',
    });
  }

  private refreshStatus(): void {
    const mine = this.state.playerTeam.length;
    if (this.state.turn === 'player' && !this.locked) {
      this.statusText.setText(`Tap a kid to draft!   (${mine}/${TEAM_SIZE})`);
    } else {
      this.statusText.setText('The other team is picking...');
    }
  }

  private finishDraft(): void {
    this.statusText.setText('Teams are set! Play ball!');
    this.time.delayedCall(700, () => {
      this.scene.start('Game', {
        playerTeam: this.state.playerTeam,
        aiTeam: this.state.aiTeam,
      });
    });
  }
}
