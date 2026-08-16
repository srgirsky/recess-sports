// ---------------------------------------------------------------------------
// The pause screen. Two big cards, icon-first: keep playing, or go home.
//
// Re-audit #4's second half: a kid trapped in a blowout had NO exit — no
// pause, no quit, no home. This is that exit. It is deliberately tiny: the
// game behind it is frozen by `GameView.setPaused`, not torn down, so KEEP
// PLAYING costs nothing and GO HOME is the title's own flow.
// ---------------------------------------------------------------------------

import { button, el } from '../dom';
import type { Screen } from '../Router';

export class PauseScreen implements Screen {
  constructor(
    private readonly onResume: () => void,
    private readonly onQuit: () => void
  ) {}

  mount(): HTMLElement {
    const root = el('div', 'screen screen--pause');
    const sign = el('header', 'mode-head');
    sign.append(el('h1', 'mode-head__title', '⏸ PAUSED'));
    const cards = el('div', 'mode-cards');
    const resume = button('', this.onResume, 'mode-card');
    resume.setAttribute('aria-label', 'keep playing');
    resume.append(el('span', 'mode-card__icon', '▶'), el('strong', 'mode-card__title', 'KEEP PLAYING'));
    const quit = button('', this.onQuit, 'mode-card');
    quit.setAttribute('aria-label', 'quit to the clubhouse');
    quit.append(el('span', 'mode-card__icon', '🏠'), el('strong', 'mode-card__title', 'GO HOME'));
    cards.append(resume, quit);
    root.append(sign, cards);
    return root;
  }
}
