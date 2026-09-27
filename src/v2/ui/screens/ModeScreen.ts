// ---------------------------------------------------------------------------
// Extra games. Pickup stays the title's one-tap front door; this quiet screen
// holds focused practice and hands-free watch modes without adding new sims.
// ---------------------------------------------------------------------------

import type { PlayerControlMode } from '../../game/controlMode';
import { button, el } from '../dom';
import type { Screen } from '../Router';

export type ExtraModeId = 'lesson' | 'versus' | 'batting' | 'pitching' | 'watch';

export const EXTRA_MODES: ReadonlyArray<{
  id: ExtraModeId;
  icon: string;
  title: string;
  line: string;
  controls: PlayerControlMode;
}> = [
  // The lesson: one T-BALL inning each way with the coach speaking every verb
  // and the timing ring on. First, because it is where a new player belongs.
  { id: 'lesson', icon: '🎓', title: 'LEARN TO PLAY', line: 'A COACH SHOWS YOU HOW', controls: 'both' },
  // Pass and play: two people on one device (`controlMode.ts` `versus`).
  { id: 'versus', icon: '👥', title: '2 PLAYERS', line: 'PASS AND PLAY', controls: 'versus' },
  { id: 'batting', icon: '💥', title: 'BATTING PRACTICE', line: 'YOU HIT · 1 INNING', controls: 'batting' },
  { id: 'pitching', icon: '🔥', title: 'PITCHING PRACTICE', line: 'YOU PITCH · 1 INNING', controls: 'pitching' },
  { id: 'watch', icon: '🍿', title: 'WATCH A GAME', line: 'KIDS PLAY · YOU CHEER', controls: 'watch' },
];

/** Who won a pass-and-play game. Player 1 is the away side (bats first). */
export function versusHeadline(away: number, home: number): string {
  if (away === home) return 'TIE GAME!';
  return away > home ? '🏆 PLAYER 1 WINS!' : '🏆 PLAYER 2 WINS!';
}

export class ModeScreen implements Screen {
  constructor(
    private readonly onChoose: (mode: ExtraModeId) => void,
    private readonly onBack: () => void
  ) {}

  mount(): HTMLElement {
    const root = el('div', 'screen screen--modes');
    const sign = el('header', 'mode-head');
    sign.append(
      el('h1', 'mode-head__title', '⚾ MORE GAMES'),
      el('p', 'mode-head__tag', 'PICK A WAY TO PLAY')
    );
    const cards = el('div', 'mode-cards');
    for (const mode of EXTRA_MODES) {
      const card = button('', () => this.onChoose(mode.id), 'mode-card');
      card.dataset.mode = mode.id;
      card.setAttribute('aria-label', `${mode.title}, ${mode.line}`);
      card.append(
        el('span', 'mode-card__icon', mode.icon),
        el('strong', 'mode-card__title', mode.title),
        el('span', 'mode-card__line', mode.line),
        el('span', 'mode-card__go', 'PLAY  →')
      );
      cards.appendChild(card);
    }
    root.append(sign, cards, button('←  HOME', this.onBack, 'btn--quiet mode-back'));
    return root;
  }
}
