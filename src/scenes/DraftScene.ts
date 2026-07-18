// ---------------------------------------------------------------------------
// The draft — the heart of the product. Player and AI alternate picking from a
// grid of 30 kids until each has 9. Every player pick is logged to the "voting
// machine" (picklog). When both teams are full, we head to the game.
//
// It plays like an event, not a form: cards DEAL in, your pick flies to the
// dugout bench and lands with a hop, the CPU visibly "scans" candidates with a
// red spotlight before grabbing one, and the finished team celebrates.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, TEAM_SIZE, AI_PICK_DELAY_MS, ANIM } from '../config';
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
import { floatingText, burst, confetti } from '../ui/effects';
import { squashHop, enterFrom, pulse } from '../ui/anim';
import * as audio from '../systems/audio';

export class DraftScene extends Phaser.Scene {
  private state!: DraftState;
  private cards = new Map<string, CharacterCard>();
  private playerSlots: Phaser.GameObjects.Container[] = [];
  private benchKids: Phaser.GameObjects.Image[] = [];
  private locked = false;
  private turnPill!: ReturnType<typeof pill>;
  private pillPulse?: Phaser.Tweens.Tween;

  constructor() {
    super('Draft');
  }

  create(): void {
    this.cards.clear();
    this.playerSlots = [];
    this.benchKids = [];
    this.state = createDraft(ROSTER.map((c) => c.id));
    this.cameras.main.fadeIn(250, 0x5f, 0xb0, 0xea);

    // Themed sky background.
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x5fb0ea, 0x5fb0ea, 0xa8dcf6, 0xa8dcf6, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const banner = ribbon(this, GAME_WIDTH / 2, 34, 'PICK YOUR TEAM', { fill: COLORS.red, fontSize: 32 });
    enterFrom(this, banner, { dy: -70, dur: 380, ease: 'Bounce.out' });
    makeMuteButton(this, 34, 34);
    this.turnPill = pill(this, GAME_WIDTH - 160, 34, 'GET READY!', { fill: COLORS.gold, minW: 250 });
    enterFrom(this, this.turnPill.container, { dy: -70, dur: 380, delay: 80, ease: 'Bounce.out' });

    // Deal the grid in before anyone can pick.
    this.locked = true;
    const dealDone = this.buildPool();
    this.buildTeamTray();
    this.time.delayedCall(dealDone, () => {
      this.locked = false;
      this.refreshStatus();
    });
  }

  /** Deal all 30 cards in with a stagger; returns roughly when the deal ends. */
  private buildPool(): number {
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
      // Deal-in: drop + pop, row by row.
      card.setScale(0.4).setAlpha(0);
      card.y -= 26;
      this.tweens.add({
        targets: card,
        y: y,
        scale: 1,
        alpha: 1,
        delay: i * ANIM.DEAL_STAGGER_MS,
        duration: ANIM.DEAL_POP_MS,
        ease: 'Back.out',
      });
    });
    return ROSTER.length * ANIM.DEAL_STAGGER_MS + ANIM.DEAL_POP_MS;
  }

  // --- Bottom "dugout bench": 9 rounded slots that fill as you draft --------
  private buildTeamTray(): void {
    const trayY = GAME_HEIGHT - 74;
    const slotW = 88;
    const gap = 8;
    const count = TEAM_SIZE;
    const benchW = count * slotW + (count - 1) * gap + 150;
    const bench = panel(this, GAME_WIDTH / 2 + 30, trayY, benchW, 130, { fill: 0x2f5d3a, strokeWidth: 5 });
    enterFrom(this, bench, { dy: 170, dur: 420, ease: 'Back.out' });

    const label = heading(this, 70, trayY, 'YOUR\nTEAM', 22).setStroke('#14202e', 5);
    enterFrom(this, label, { dy: 170, dur: 420, delay: 60, ease: 'Back.out' });

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
      enterFrom(this, c, { dy: 170, dur: 380, delay: 90 + i * 30, ease: 'Back.out' });
    }
  }

  private onPlayerPick(id: string): void {
    if (this.locked || this.state.turn !== 'player') return;
    if (!this.state.pool.includes(id)) return;

    this.state = applyPick(this.state, id);
    recordPick(id);
    audio.pop();
    audio.say(getCharacter(id).name + '!');

    this.consumeCard(id);
    this.fillNextSlot(id);
    this.refreshStatus();

    if (isDraftComplete(this.state)) {
      this.finishDraft();
      return;
    }
    this.locked = true;
    this.refreshStatus();
    this.time.delayedCall(AI_PICK_DELAY_MS, () => this.aiTurn());
  }

  /**
   * The CPU's turn is a little show: a red spotlight hops across a few
   * candidate cards ("hmm...") before landing on the real pick.
   */
  private aiTurn(): void {
    const id = chooseAiPick(this.state, () => Math.random());

    const others = this.state.pool.filter((p) => p !== id);
    const stops: string[] = [];
    for (let i = 0; i < 3 && others.length > 0; i++) {
      stops.push(others[Math.floor(Math.random() * others.length)]);
    }
    stops.push(id);

    const ring = this.add.graphics().setDepth(40).setVisible(false);
    ring.lineStyle(6, COLORS.red, 1);
    ring.strokeRoundedRect(-48, -66, 96, 132, 14);

    let step = 0;
    const hop = () => {
      const card = this.cards.get(stops[step]);
      if (card) {
        ring.setVisible(true).setPosition(card.x, card.y).setScale(1.25).setAlpha(0.6);
        this.tweens.add({ targets: ring, scale: 1, alpha: 1, duration: 110, ease: 'Quad.out' });
      }
      step += 1;
      if (step < stops.length) {
        this.time.delayedCall(ANIM.CPU_SCAN_HOP_MS, hop);
      } else {
        this.time.delayedCall(ANIM.CPU_SCAN_HOP_MS + 60, () => {
          ring.destroy();
          this.commitAiPick(id);
        });
      }
    };
    hop();
  }

  private commitAiPick(id: string): void {
    this.state = applyPick(this.state, id);
    audio.pop();
    this.consumeCard(id, true);
    const card = this.cards.get(id);
    if (card) floatingText(this, card.x, card.y - 40, `CPU picks\n${getCharacter(id).name}`, COLORS.red, 18);
    this.locked = false;
    this.refreshStatus();

    if (isDraftComplete(this.state)) this.finishDraft();
  }

  private consumeCard(id: string, aiPicked = false): void {
    const card = this.cards.get(id);
    if (!card) return;
    card.setCardEnabled(false);
    const color = aiPicked ? COLORS.red : COLORS.gold;
    const flash = this.add.rectangle(card.x, card.y, 88, 124, color, 0.5).setOrigin(0.5);
    this.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() });
    burst(this, card.x, card.y, color, 8);
    // The card itself reacts: a quick squeeze as it's "taken".
    this.tweens.add({ targets: card, scale: 0.92, duration: 110, yoyo: true, ease: 'Quad.out' });
  }

  /** Your new kid FLIES from their card to the next open bench slot. */
  private fillNextSlot(id: string): void {
    const idx = this.state.playerTeam.length - 1;
    const slot = this.playerSlots[idx];
    if (!slot) return;
    const card = this.cards.get(id);

    const land = () => {
      const img = this.add.image(0, 44, id).setOrigin(0.5, 1);
      const s = 104 / img.height;
      img.setScale(s);
      slot.add(img);
      this.benchKids.push(img);
      squashHop(this, img, { height: 12 });
      burst(this, slot.x, slot.y + 20, COLORS.gold, 8);
    };

    if (!card) {
      land();
      return;
    }

    // Arc flight: x eases straight across while y goes up-and-over.
    const fly = this.add.image(card.x, card.y, id).setOrigin(0.5, 1).setDepth(50);
    const flyScale = 104 / fly.height;
    fly.setScale(flyScale);
    const targetY = slot.y + 44;
    const upMs = ANIM.FLY_TO_BENCH_MS * 0.45;
    const downMs = ANIM.FLY_TO_BENCH_MS * 0.55;
    this.tweens.add({ targets: fly, x: slot.x, duration: ANIM.FLY_TO_BENCH_MS, ease: 'Sine.inOut' });
    this.tweens.add({ targets: fly, angle: card.x < slot.x ? 10 : -10, duration: upMs, yoyo: true });
    this.tweens.chain({
      targets: fly,
      tweens: [
        { y: card.y - 70, duration: upMs, ease: 'Quad.out' },
        { y: targetY, duration: downMs, ease: 'Quad.in' },
      ],
      onComplete: () => {
        fly.destroy();
        land();
      },
    });
  }

  private refreshStatus(): void {
    const mine = this.state.playerTeam.length;
    this.pillPulse?.stop();
    this.pillPulse = undefined;
    this.turnPill.container.setScale(1);
    if (isDraftComplete(this.state)) return; // finishDraft owns the pill now
    if (this.state.turn === 'player' && !this.locked) {
      this.turnPill.setText(`YOUR PICK!  ${mine}/${TEAM_SIZE}`, COLORS.gold);
      this.pillPulse = pulse(this, this.turnPill.container, { scale: 1.06, dur: 420 });
    } else {
      this.turnPill.setText('CPU picking…', 0xe8a0a0);
    }
  }

  private finishDraft(): void {
    this.turnPill.setText('PLAY BALL!', COLORS.gold);
    audio.cheer();
    confetti(this, 70);
    // The whole bench celebrates, left to right.
    this.benchKids.forEach((kid, i) => {
      this.time.delayedCall(80 * i, () => squashHop(this, kid, { height: 18 }));
    });
    this.time.delayedCall(1100, () => this.cameras.main.fadeOut(250, 0x5f, 0xb0, 0xea));
    this.time.delayedCall(1380, () => {
      this.scene.start('Game', {
        playerTeam: this.state.playerTeam,
        aiTeam: this.state.aiTeam,
      });
    });
  }
}
