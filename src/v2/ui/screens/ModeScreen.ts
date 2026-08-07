// ---------------------------------------------------------------------------
// Extra games. Pickup stays the title's one-tap front door; this quiet screen
// holds focused practice and hands-free watch modes without adding new sims.
// ---------------------------------------------------------------------------

import type { PlayerControlMode } from '../../game/controlMode';
import { button, el } from '../dom';
import type { Screen } from '../Router';

export type ExtraModeId = 'batting' | 'pitching' | 'watch';

export const EXTRA_MODES: ReadonlyArray<{
  id: ExtraModeId;
  icon: string;
  title: string;
  line: string;
  controls: PlayerControlMode;
}> = [
  { id: 'batting', icon: '💥', title: 'BATTING PRACTICE', line: 'YOU HIT · 1 INNING', controls: 'batting' },
  { id: 'pitching', icon: '🔥', title: 'PITCHING PRACTICE', line: 'YOU PITCH · 1 INNING', controls: 'pitching' },
  { id: 'watch', icon: '🍿', title: 'WATCH A GAME', line: 'KIDS PLAY · YOU CHEER', controls: 'watch' },
];

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
