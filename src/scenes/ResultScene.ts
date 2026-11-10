// ---------------------------------------------------------------------------
// Win/lose screen. Crowns a Player of the Game from this game's box score
// (BB2001-style: earned, not rated), shows the team's box beside them, and
// offers a rematch. Without a box (a net guest never simulates) it falls back
// to crowning the highest-rated kid as TEAM MVP.
//
// Two-device games keep the channel open here: PLAY AGAIN is a vote
// (net/protocol.ts RematchVote), and when both kids have tapped, both devices
// walk back into the networked draft on the same session. GOOD GAME! leaves.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { getCharacter } from '../data/characters';
import { makeButton } from '../ui/Button';
import { makeMuteButton } from '../ui/MuteButton';
import { confetti } from '../ui/effects';
import { heading, ribbon, panel, FONT } from '../ui/theme';
import { row } from '../ui/layout';
import { squashHop } from '../ui/anim';
import * as audio from '../systems/audio';
import { commentatorProfile } from '../systems/voices';
import { recordAlbumGame } from '../systems/album';
import { teamName, type TeamIdentity } from '../systems/team';
import { playerOfTheGame, highlights, type BoxLine } from '../systems/boxscore';
import { activeSession, dropSession } from '../net/peer';
import { RematchVote } from '../net/protocol';
import { mountLayoutOverlay } from '../dev/LayoutOverlay';

/** The bottom button row. A makeButton's box runs to y + h/2 + lip + stroke/2. */
const BUTTON_H = 78;
const BUTTON_Y = GAME_HEIGHT - 58;

interface ResultData {
  playerScore: number;
  aiScore: number;
  playerTeam: string[];
  aiTeam?: string[];
  /** Season games route back to the week, not the draft. */
  seasonGame?: boolean;
  /** Pass-and-play/net: team-named headline, both albums credited. */
  matchType?: 'solo' | 'passplay' | 'net';
  /** Net: which end this device was. playerScore is ALWAYS the host's (away). */
  netRole?: 'host' | 'guest';
  awayIdentity?: TeamIdentity;
  homeIdentity?: TeamIdentity;
  /** This game's box score, keyed by kid id (absent on a net guest). */
  box?: Record<string, BoxLine>;
  /** Layout audit only: draw the net rematch row without a live session. */
  rematchPreview?: boolean;
}

/** The box-score columns, left to right: header + how to read a line. */
const BOX_COLS: Array<{ head: string; val: (l: BoxLine) => number }> = [
  { head: 'AB', val: (l) => l.ab },
  { head: 'H', val: (l) => l.h },
  { head: 'HR', val: (l) => l.hr },
  { head: 'RBI', val: (l) => l.rbi },
  { head: 'R', val: (l) => l.r },
  { head: 'K', val: (l) => l.k },
];

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data: ResultData): void {
    if (import.meta.env.DEV) mountLayoutOverlay(this);
    const cx = GAME_WIDTH / 2;
    const won = data.playerScore > data.aiScore;
    const tied = data.playerScore === data.aiScore;

    // Net: the guest is the HOME seat, so "player" is the friend's score there.
    const netGuest = data.matchType === 'net' && data.netRole === 'guest';
    const iWon = netGuest ? data.aiScore > data.playerScore : won;

    // Themed background.
    const bg = this.add.graphics();
    if (iWon) bg.fillGradientStyle(0x5bbf5a, 0x5bbf5a, 0x9be08a, 0x9be08a, 1);
    else bg.fillGradientStyle(0x5fb0ea, 0x5fb0ea, 0xa8dcf6, 0xa8dcf6, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Pass-and-play/net names the winner; solo keeps the classic YOU framing.
    const passplay = data.matchType === 'passplay' || data.matchType === 'net';
    const winnerIdentity = won ? data.awayIdentity : data.homeIdentity;
    const headline = tied
      ? 'TIE GAME!'
      : passplay && winnerIdentity
        ? `${teamName(winnerIdentity)} WIN!`
        : won
          ? 'YOU WIN!'
          : 'GOOD GAME!';
    // maxW: a team-named headline is unbounded — "THE PURPLE ALL-STARS WIN!"
    // is the worst of the 56 combinations and runs the full width at 52px.
    heading(this, cx, 46, headline, passplay ? 48 : 62, '#ffffff', { maxW: 900, minFontSize: 34 });

    // Celebrate.
    if (won || (passplay && !tied)) {
      confetti(this);
      audio.cheer();
      audio.say(
        passplay && winnerIdentity ? `${teamName(winnerIdentity)} win!` : 'You win!',
        commentatorProfile('A'),
        'flush'
      );
    } else {
      audio.say(tied ? 'Tie game!' : 'Good game!', commentatorProfile('A'), 'flush');
    }
    makeMuteButton(this, GAME_WIDTH - 40, 40);

    // Away on the left, home on the right, labelled from THIS device's seat —
    // a net game has no CPU, and the guest's own runs are the right-hand ones.
    const scoreLine =
      data.matchType === 'net'
        ? netGuest
          ? `FRIEND ${data.playerScore}   —   ${data.aiScore} YOU`
          : `YOU ${data.playerScore}   —   ${data.aiScore} FRIEND`
        : `YOU ${data.playerScore}   —   ${data.aiScore} CPU`;
    ribbon(this, cx, 122, scoreLine, {
      fill: COLORS.ink,
      fontSize: 30,
      maxW: 880,
    });

    // The featured nine: yours in solo; the winners in pass-and-play/net.
    const featured =
      passplay && !won && !tied && data.aiTeam ? data.aiTeam : data.playerTeam;
    const box = data.box;
    const potgId = box ? playerOfTheGame(box, featured) : null;
    // No box, or nobody did anything: the old rated pick, honestly labelled.
    const mvp = getCharacter(
      potgId ?? featured.map(getCharacter).reduce((b, c) => (overall(c) > overall(b) ? c : b)).id
    );
    const showBox = !!box && !!potgId;
    const cardX = showBox ? 250 : cx;

    // The card sits 8px higher than it used to: the old stack put the button
    // row's bottom edge at y 639 of a 640-tall canvas, so both buttons were
    // visibly clipped by the frame.
    panel(this, cardX, 344, 300, 360, { fill: COLORS.cream, strokeWidth: 6 });
    heading(this, cardX, 206, potgId ? '⭐ PLAYER OF THE GAME' : '🏆 TEAM MVP 🏆', potgId ? 21 : 24, '#ffce3a', {
      maxW: 280,
      minFontSize: 16,
    });
    const mvpImg = this.add.image(cardX, 238, mvp.id).setOrigin(0.5, 0);
    mvpImg.setScale(176 / mvpImg.height);
    // Celebratory hop on a loop.
    squashHop(this, mvpImg, { height: 22 });
    this.time.addEvent({ delay: 1500, loop: true, callback: () => squashHop(this, mvpImg, { height: 22 }) });
    this.add
      .text(cardX, 444, mvp.name, { fontFamily: FONT, fontSize: '28px', color: '#14202e', fontStyle: '700' })
      .setOrigin(0.5);
    const brag = potgId && box ? highlights(box[potgId], 2).join('  ·  ') : mvp.tagline;
    this.add
      .text(cardX, 482, brag, {
        fontFamily: FONT,
        fontSize: potgId ? '18px' : '17px',
        color: potgId ? '#b5651d' : '#3a4654',
        fontStyle: potgId ? '700' : 'normal',
        align: 'center',
        wordWrap: { width: 270 },
      })
      .setOrigin(0.5);
    if (potgId) {
      audio.say(`Player of the game, ${mvp.name}!`, commentatorProfile('B'));
    }

    if (showBox) this.drawBoxScore(box!, featured, potgId!);

    // Every finished game feeds the sticker album (drafted / won-with).
    // Pass-and-play/net: both squads played in this household's game — the
    // album credits both, foil to the winning nine.
    recordAlbumGame(data.playerTeam, won);
    if (passplay && data.aiTeam) {
      recordAlbumGame(data.aiTeam, !won && !tied);
    }

    if (data.matchType === 'net') {
      this.netButtons(cx, data.rematchPreview === true);
      return;
    }

    if (data.seasonGame) {
      // Season games return to the week's chalkboard, not the draft.
      makeButton(this, {
        x: cx,
        y: BUTTON_Y,
        label: 'BACK TO THE WEEK',
        icon: '🏆',
        width: 380,
        height: BUTTON_H,
        onClick: () => this.scene.start('Season'),
      });
      return;
    }

    const newTeam = makeButton(this, {
      x: cx,
      y: BUTTON_Y,
      label: 'NEW TEAM',
      icon: '🔄',
      width: 300,
      height: BUTTON_H,
      onClick: () => this.scene.start('Schoolyard', { straightToDraft: true }),
    });
    const home = makeButton(this, {
      x: cx,
      y: BUTTON_Y,
      label: 'HOME',
      icon: '🏠',
      width: 250,
      height: BUTTON_H,
      // Explicit data: Phaser reuses the previous start()'s data when none is
      // passed, which would carry straightToDraft over from NEW TEAM.
      onClick: () => this.scene.start('Schoolyard', { straightToDraft: false }),
    });
    // The two buttons are different widths, so the old fixed cx±175 offsets put
    // the pair's true centre 25px right of the screen's. row() measures.
    row([newTeam, home], { centerX: cx, y: BUTTON_Y + 4, gap: 40 });
  }

  /**
   * Net: 🔁 PLAY AGAIN beside 🏠 GOOD GAME!. The rematch is a two-tap vote —
   * the button says what it is waiting for, and a friend who has already left
   * (or a dead channel) leaves the one no-blame button it always had.
   */
  private netButtons(cx: number, preview: boolean): void {
    const session = activeSession();
    const vote = new RematchVote();
    let again: Phaser.GameObjects.Container | undefined;
    let pulse: Phaser.Tweens.Tween | undefined;
    let left = false;

    const home = makeButton(this, {
      x: cx,
      y: BUTTON_Y,
      label: 'GOOD GAME!',
      icon: '🏠',
      width: 340,
      height: BUTTON_H,
      onClick: () => {
        dropSession(); // says bye — the friend's PLAY AGAIN goes away
        this.scene.start('Schoolyard', { straightToDraft: false });
      },
    });

    const place = () => {
      if (again) row([again, home], { centerX: cx, y: BUTTON_Y + 4, gap: 40 });
      else home.setPosition(cx, BUTTON_Y);
    };
    /** (Re)draw the rematch button for the vote's current state. */
    const drawAgain = () => {
      pulse?.remove();
      pulse = undefined;
      again?.destroy();
      again = undefined;
      if (left) return place();
      const asked = vote.theyAsked;
      again = makeButton(this, {
        x: cx,
        y: BUTTON_Y,
        label: vote.waitingOnThem ? 'WAITING…' : 'PLAY AGAIN',
        icon: vote.waitingOnThem ? '🔍' : '🔁',
        width: 320,
        height: BUTTON_H,
        color: asked ? 0x5bbf5a : vote.waitingOnThem ? 0x9aa5b1 : undefined,
        onClick: () => {
          if (left || !vote.voteMine()) return;
          activeSession()?.send({ t: 'rematch' });
          audio.pop();
          if (vote.agreed) go();
          else drawAgain();
        },
      });
      place();
      // The friend is waiting on US: the button bounces until it is tapped.
      if (asked) {
        pulse = this.tweens.add({ targets: again, scale: 1.06, duration: 380, yoyo: true, repeat: -1 });
      }
    };
    /** Both tapped: same session, same identities, a fresh draft. */
    const go = () => {
      this.scene.start('Schoolyard', { straightToDraft: true, netDraft: true });
    };
    const friendLeft = () => {
      if (left) return;
      left = true;
      dropSession();
      drawAgain();
    };

    if (!session && !preview) left = true; // nobody to ask
    drawAgain();
    if (!session) return;

    const unMsg = session.onMessage((m) => {
      if (m.t === 'bye') friendLeft();
      if (m.t !== 'rematch' || left) return;
      vote.voteTheirs();
      if (vote.agreed) return go();
      audio.say('Play again?', commentatorProfile('B'));
      drawAgain();
    });
    const unStatus = session.onStatus((st) => {
      if (st === 'gone') friendLeft();
    });
    // Heartbeat + staleness ride the Phaser clock, so the open channel needs a
    // scene that ticks it — otherwise both ends go quiet and trip STALE_MS.
    const tick = () => activeSession()?.tick(this.time.now);
    this.events.on('update', tick);
    this.events.once('shutdown', () => {
      unMsg();
      unStatus();
      this.events.off('update', tick);
    });
  }

  /**
   * The featured team's box score, BB2001-style: one line per kid in batting
   * order, the Player of the Game's row lit gold. Numbers only — a nonreader
   * still sees who has the big column of hits.
   */
  private drawBoxScore(box: Record<string, BoxLine>, team: string[], starId: string): void {
    const X = 680;
    const W = 500;
    const TOP = 164;
    const H = 360;
    panel(this, X, TOP + H / 2, W, H, { fill: COLORS.cream, strokeWidth: 6 });
    heading(this, X, TOP + 26, '📋 BOX SCORE', 22, '#ffce3a');

    const left = X - W / 2 + 22;
    const nameW = 172;
    const colW = (W - 44 - nameW) / BOX_COLS.length;
    const colX = (i: number) => left + nameW + colW * (i + 0.5);
    const headY = TOP + 62;
    const rowH = 30;
    const style = (size: number, color: string, bold = false) => ({
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? '700' : 'normal',
    });

    BOX_COLS.forEach((c, i) =>
      this.add.text(colX(i), headY, c.head, style(16, '#5a6676', true)).setOrigin(0.5)
    );
    const rule = this.add.graphics();
    rule.lineStyle(2, 0xc9bfa6, 1);
    rule.lineBetween(left, headY + 14, X + W / 2 - 22, headY + 14);

    team.forEach((id, r) => {
      const y = headY + 14 + rowH * (r + 0.5) + 2;
      const line = box[id];
      const star = id === starId;
      if (star) {
        const hl = this.add.graphics();
        hl.fillStyle(0xffce3a, 0.45);
        hl.fillRoundedRect(left - 8, y - rowH / 2 + 2, W - 28, rowH - 4, 8);
      }
      const name = this.add.text(left, y, getCharacter(id).name, style(17, '#14202e', star)).setOrigin(0, 0.5);
      // Long names shrink to their column rather than running into AB.
      if (name.width > nameW - 8) name.setScale((nameW - 8) / name.width);
      BOX_COLS.forEach((c, i) => {
        const v = line ? c.val(line) : 0;
        this.add.text(colX(i), y, String(v), style(17, v > 0 ? '#14202e' : '#a3a9b0', star)).setOrigin(0.5);
      });
    });
  }
}

function overall(c: ReturnType<typeof getCharacter>): number {
  return c.stats.contact + c.stats.power + c.stats.speed + c.stats.pitching;
}
