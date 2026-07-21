// ---------------------------------------------------------------------------
// The two-device lobby (🔗 on the title): MAKE A GAME shows four big emoji to
// read to your friend; JOIN A GAME is a 16-emoji grid — tap the four pictures.
// Zero reading, zero typing, zero free text. On connect the devices exchange
// hello (host's mode/innings/venue win; a version mismatch bows out politely)
// and identity (color/logo INDEXES), then both head to the networked draft.
//
// Dev/E2E hooks: `codeHex` exposes the wire code, `joinWithCode(hex)` skips
// the grid — the two-tab harness drives these.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, NET } from '../config';
import { FONT, pill, heading } from '../ui/theme';
import * as audio from '../systems/audio';
import { hostSession, joinSession, dropSession, type NetSession } from '../net/peer';
import { helloCompatible, type NetMsg } from '../net/protocol';
import { getTeamIdentity, type TeamIdentity } from '../systems/team';
import { UNIFORM_COLORS } from '../art/palette';
import { getMode, setMode } from '../systems/mode';
import { getSettings, saveSettings } from '../systems/settings';
import { getVenue, setVenue } from '../systems/venue';
import type { VenueId } from '../data/venues';

export class LobbyScene extends Phaser.Scene {
  private stage!: Phaser.GameObjects.Container;
  private session?: NetSession;
  private unsubMsg?: () => void;
  private unsubStatus?: () => void;
  private myIdentity!: TeamIdentity;
  private theirIdentity?: TeamIdentity;
  private gotHello = false;
  private sentIdentity = false;
  private picked: number[] = [];

  constructor() {
    super('Lobby');
  }

  /** Dev/E2E: the wire code's hex digits (host side, once the room is open). */
  get codeHex(): string {
    return this.session?.roomId.replace('recess-', '') ?? '';
  }

  create(): void {
    this.myIdentity = getTeamIdentity() ?? { color: 5, logo: 0 };
    this.gotHello = false;
    this.sentIdentity = false;
    this.theirIdentity = undefined;
    this.session = undefined;
    this.picked = [];
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.sky);
    heading(this, GAME_WIDTH / 2, 70, '🔗 PLAY A FRIEND', 40);
    this.stage = this.add.container(0, 0);
    this.events.once('shutdown', () => this.teardownSubs());
    this.showChoice();
  }

  private teardownSubs(): void {
    this.unsubMsg?.();
    this.unsubMsg = undefined;
    this.unsubStatus?.();
    this.unsubStatus = undefined;
  }

  private clearStage(): void {
    this.stage.removeAll(true);
  }

  private button(x: number, y: number, label: string, onTap: () => void, minW = 340): Phaser.GameObjects.Container {
    const b = pill(this, x, y, label, { fill: COLORS.cream, fontSize: 26, minW });
    b.container.setInteractive(new Phaser.Geom.Rectangle(-minW / 2, -26, minW, 52), Phaser.Geom.Rectangle.Contains);
    b.container.on('pointerdown', () => {
      audio.pop();
      onTap();
    });
    this.stage.add(b.container);
    return b.container;
  }

  private note(y: number, text: string, size = 22): Phaser.GameObjects.Text {
    const t = this.add
      .text(GAME_WIDTH / 2, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setStroke('#14202e', 8);
    this.stage.add(t);
    return t;
  }

  private showChoice(): void {
    this.clearStage();
    this.button(GAME_WIDTH / 2, 240, '🏠 MAKE A GAME', () => this.hostFlow());
    this.button(GAME_WIDTH / 2, 330, '🔍 JOIN A GAME', () => this.showJoinGrid());
    this.button(GAME_WIDTH / 2, GAME_HEIGHT - 70, '⬅ BACK', () => this.quit(), 180);
  }

  private quit(): void {
    dropSession();
    this.scene.start('Schoolyard', { straightToDraft: false });
  }

  private async hostFlow(): Promise<void> {
    this.clearStage();
    this.note(280, 'MAKING YOUR GAME…');
    try {
      this.session = await hostSession();
    } catch {
      this.showOops();
      return;
    }
    this.clearStage();
    this.note(170, 'SHOW YOUR FRIEND\nTHESE PICTURES:');
    const code = this.add
      .text(GAME_WIDTH / 2, 300, this.session.codeEmoji.join(' '), { fontSize: '84px' })
      .setOrigin(0.5);
    this.stage.add(code);
    this.tweens.add({ targets: code, scale: 1.06, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const waiting = this.note(440, 'waiting for your friend… 🔍', 20);
    this.tweens.add({ targets: waiting, alpha: 0.4, duration: 500, yoyo: true, repeat: -1 });
    this.button(GAME_WIDTH / 2, GAME_HEIGHT - 70, '⬅ BACK', () => this.quit(), 180);
    this.wireSession();
  }

  private showJoinGrid(): void {
    this.clearStage();
    this.note(140, "TAP YOUR FRIEND'S\nFOUR PICTURES:");
    const slots = this.add
      .text(GAME_WIDTH / 2, 210, '· · · ·', { fontSize: '46px' })
      .setOrigin(0.5);
    this.stage.add(slots);
    const refreshSlots = () => {
      slots.setText(
        Array.from({ length: NET.CODE_LEN }, (_, i) => NET.CODE_EMOJI[this.picked[i]] ?? '·').join(' ')
      );
    };
    NET.CODE_EMOJI.forEach((emo, i) => {
      const x = GAME_WIDTH / 2 + ((i % 8) - 3.5) * 92;
      const y = 300 + Math.floor(i / 8) * 96;
      const chip = this.add.container(x, y);
      const bg = this.add.circle(0, 0, 38, COLORS.cream).setStrokeStyle(4, COLORS.ink, 0.9);
      const face = this.add.text(0, 0, emo, { fontSize: '38px' }).setOrigin(0.5);
      chip.add([bg, face]);
      chip.setInteractive(new Phaser.Geom.Rectangle(-40, -40, 80, 80), Phaser.Geom.Rectangle.Contains);
      chip.on('pointerdown', () => {
        if (this.picked.length >= NET.CODE_LEN) return;
        audio.pop();
        this.picked.push(i);
        refreshSlots();
        if (this.picked.length === NET.CODE_LEN) this.joinFlow(this.picked);
      });
      this.stage.add(chip);
    });
    this.button(GAME_WIDTH / 2, GAME_HEIGHT - 60, '⬅ BACK', () => this.quit(), 180);
  }

  /** Dev/E2E: join straight from the wire code's hex digits. */
  joinWithCode(hex: string): void {
    const indices = [...hex].map((c) => parseInt(c, 16));
    void this.joinFlow(indices);
  }

  private async joinFlow(indices: number[]): Promise<void> {
    this.clearStage();
    const finding = this.note(300, 'FINDING YOUR FRIEND… 🔍');
    this.tweens.add({ targets: finding, alpha: 0.4, duration: 500, yoyo: true, repeat: -1 });
    this.button(GAME_WIDTH / 2, GAME_HEIGHT - 70, '⬅ BACK', () => this.quit(), 180);
    try {
      this.session = await joinSession(indices);
    } catch {
      this.showOops();
      return;
    }
    this.wireSession();
    this.onConnected();
  }

  private showOops(): void {
    dropSession();
    this.clearStage();
    this.note(280, "COULDN'T FIND THE GAME 😞\nCHECK THE PICTURES AND TRY AGAIN!");
    this.button(GAME_WIDTH / 2, 400, '🔁 TRY AGAIN', () => this.showChoice());
    this.button(GAME_WIDTH / 2, GAME_HEIGHT - 70, '⬅ BACK', () => this.quit(), 180);
  }

  private wireSession(): void {
    if (!this.session) return;
    this.teardownSubs();
    this.unsubMsg = this.session.onMessage((m) => this.onMsg(m));
    this.unsubStatus = this.session.onStatus((s) => {
      if (s === 'connected') this.onConnected();
      if (s === 'gone') this.showOops();
    });
  }

  /** Channel is up: the host leads with hello + its identity. */
  private onConnected(): void {
    const s = this.session;
    if (!s || s.role !== 'host') return;
    s.send({
      t: 'hello',
      version: NET.PROTOCOL_VERSION,
      mode: getMode(),
      innings: getSettings().innings,
      venueId: getVenue().id,
    });
    s.send({ t: 'identity', seat: 0, ...this.myIdentity });
  }

  private onMsg(m: NetMsg): void {
    const s = this.session;
    if (!s) return;
    if (m.t === 'hello' && s.role === 'guest') {
      if (!helloCompatible(m)) {
        this.clearStage();
        this.note(280, 'DIFFERENT GAME VERSIONS 😞\nUPDATE AND TRY AGAIN!');
        this.button(GAME_WIDTH / 2, GAME_HEIGHT - 70, '⬅ BACK', () => this.quit(), 180);
        return;
      }
      // The host's table rules win for this game.
      setMode(m.mode);
      saveSettings({ ...getSettings(), innings: m.innings });
      setVenue(m.venueId as VenueId);
      this.gotHello = true;
      this.maybeSendGuestIdentity();
    } else if (m.t === 'identity') {
      this.theirIdentity = { color: m.color, logo: m.logo };
      if (s.role === 'guest') this.maybeSendGuestIdentity();
      this.maybeGo();
    }
  }

  /** Guest replies once it knows the host's colors (dedupe, then send). */
  private maybeSendGuestIdentity(): void {
    const s = this.session;
    if (!s || s.role !== 'guest' || this.sentIdentity || !this.gotHello || !this.theirIdentity) return;
    if (this.myIdentity.color === this.theirIdentity.color) {
      this.myIdentity = {
        ...this.myIdentity,
        color: (this.myIdentity.color + 1) % UNIFORM_COLORS.length,
      };
    }
    s.send({ t: 'identity', seat: 1, ...this.myIdentity });
    this.sentIdentity = true;
    this.maybeGo();
  }

  /** Both identities known → the networked draft. */
  private maybeGo(): void {
    const s = this.session;
    if (!s || !this.theirIdentity) return;
    if (s.role === 'guest' && !this.sentIdentity) return;
    const away = s.role === 'host' ? this.myIdentity : this.theirIdentity;
    const home = s.role === 'host' ? this.theirIdentity : this.myIdentity;
    this.registry.set('netIdentities', { away, home });
    this.teardownSubs(); // the Schoolyard wires its own handlers
    this.scene.start('Schoolyard', { straightToDraft: true, netDraft: true });
  }
}
