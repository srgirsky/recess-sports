// ---------------------------------------------------------------------------
// The online lobby: MAKE A GAME shows four pictures to read to your friend;
// JOIN A GAME is sixteen pictures — tap your friend's four.
//
// ★ THE ROOM CODE IS FOUR EMOJI BECAUSE THE PLAYERS ARE FOUR YEARS OLD. v1
// settled this (`scenes/LobbyScene.ts`): a nonreader cannot type a code but can
// say "dog, apple, star, car" down a phone. The sixteen pictures are
// `NET.CODE_EMOJI`, shared with v1, and the wire only ever sees their indices
// (`net/protocol.ts` turns four of them into the room id) — there is no text
// box anywhere in online play, so there is nothing for a stranger to type.
//
// This screen draws and reports taps. The room itself is `net/OnlineMatch.ts`.
// ---------------------------------------------------------------------------

import { NET } from '../../../config';
import { button, clear, el } from '../dom';
import type { Screen } from '../Router';

/** Why a room could not be joined or made, in words a parent can act on. */
export type LobbyFailure = 'no-friend' | 'version' | 'other-game' | 'offline';

const FAILURES: Record<LobbyFailure, { icon: string; title: string; line: string }> = {
  'no-friend': { icon: '🤔', title: 'NO GAME THERE', line: 'CHECK THE FOUR PICTURES' },
  version: { icon: '🔄', title: 'DIFFERENT VERSIONS', line: 'BOTH RELOAD THE PAGE' },
  'other-game': { icon: '🙃', title: 'THAT’S CLASSIC!', line: 'PLAY THE SAME GAME' },
  offline: { icon: '📡', title: 'CAN’T CONNECT', line: 'CHECK THE INTERNET' },
};

export class LobbyScreen implements Screen {
  private body!: HTMLElement;
  private picked: number[] = [];

  constructor(
    private readonly onHost: () => void,
    private readonly onJoin: (code: number[]) => void,
    private readonly onBack: () => void
  ) {}

  mount(): HTMLElement {
    const root = el('div', 'screen screen--modes screen--lobby');
    const sign = el('header', 'mode-head');
    sign.append(el('h1', 'mode-head__title', '🔗 PLAY A FRIEND'));
    this.body = el('div', 'lobby-body');
    root.append(sign, this.body, button('←  BACK', this.onBack, 'btn--quiet mode-back'));
    this.showMenu();
    return root;
  }

  /** Two doors: make a room, or walk into a friend's. */
  showMenu(): void {
    clear(this.body);
    const cards = el('div', 'mode-cards lobby-cards');
    const make = button('', this.onHost, 'mode-card');
    make.dataset.lobby = 'host';
    make.setAttribute('aria-label', 'make a game');
    make.append(
      el('span', 'mode-card__icon', '🏠'),
      el('strong', 'mode-card__title', 'MAKE A GAME'),
      el('span', 'mode-card__line', 'YOU GET FOUR PICTURES')
    );
    const join = button('', () => this.showGrid(), 'mode-card');
    join.dataset.lobby = 'join';
    join.setAttribute('aria-label', 'join a game');
    join.append(
      el('span', 'mode-card__icon', '🔍'),
      el('strong', 'mode-card__title', 'JOIN A GAME'),
      el('span', 'mode-card__line', 'TAP YOUR FRIEND’S PICTURES')
    );
    cards.append(make, join);
    this.body.appendChild(cards);
  }

  /** The host's room is open: these four pictures are its address. */
  showCode(emoji: string[]): void {
    clear(this.body);
    const code = el('div', 'lobby-code');
    code.setAttribute('aria-label', `your pictures are ${emoji.join(' ')}`);
    for (const e of emoji) code.appendChild(el('span', 'lobby-code__pic', e));
    this.body.append(
      el('p', 'lobby-note', 'SHOW YOUR FRIEND THESE PICTURES'),
      code,
      el('p', 'lobby-note lobby-note--quiet', 'waiting for your friend… 🔍')
    );
  }

  /** Sixteen pictures; the fourth tap dials. */
  showGrid(): void {
    this.picked = [];
    this.paintGrid();
  }

  private paintGrid(): void {
    clear(this.body);
    const slots = el('div', 'lobby-code');
    for (let i = 0; i < NET.CODE_LEN; i++) {
      const idx = this.picked[i];
      slots.appendChild(el('span', `lobby-code__pic${idx === undefined ? ' is-empty' : ''}`, idx === undefined ? '·' : NET.CODE_EMOJI[idx]));
    }
    const grid = el('div', 'lobby-grid');
    NET.CODE_EMOJI.forEach((emoji, i) => {
      const pic = button(emoji, () => this.tap(i), 'lobby-grid__pic');
      pic.setAttribute('aria-label', `picture ${emoji}`);
      grid.appendChild(pic);
    });
    const undo = button('⌫', () => this.untap(), 'btn--quiet lobby-undo');
    undo.setAttribute('aria-label', 'take the last picture back');
    undo.disabled = this.picked.length === 0;
    this.body.append(el('p', 'lobby-note', 'TAP YOUR FRIEND’S FOUR PICTURES'), slots, grid, undo);
  }

  private tap(i: number): void {
    if (this.picked.length >= NET.CODE_LEN) return;
    this.picked.push(i);
    if (this.picked.length === NET.CODE_LEN) this.onJoin([...this.picked]);
    else this.paintGrid();
  }

  private untap(): void {
    this.picked.pop();
    this.paintGrid();
  }

  showFinding(): void {
    clear(this.body);
    this.body.append(el('p', 'lobby-big', '🔍'), el('p', 'lobby-note', 'FINDING YOUR FRIEND…'));
  }

  /** It did not work, and this is the one thing to do about it. */
  showFailed(why: LobbyFailure): void {
    const f = FAILURES[why];
    clear(this.body);
    this.body.append(
      el('p', 'lobby-big', f.icon),
      el('p', 'lobby-note', f.title),
      el('p', 'lobby-note lobby-note--quiet', f.line),
      button('🔁  TRY AGAIN', () => this.showMenu(), 'btn--hero lobby-retry')
    );
  }
}
