// ---------------------------------------------------------------------------
// One picture, one line, at most one button. What an online game shows when
// the thing to wait for is the other device: looking for your friend, your
// friend paused, your friend went home.
//
// ★ NO BLAME, EVER. v1's rule for a dropped game is "GOOD GAME!" and never a
// word about who left or why — the kid still holding a device did nothing
// wrong, and a seven-year-old reads "CONNECTION LOST" as "you broke it".
// ---------------------------------------------------------------------------

import { button, el } from '../dom';
import type { Screen } from '../Router';

export class NoticeScreen implements Screen {
  constructor(
    private readonly icon: string,
    private readonly title: string,
    private readonly line = '',
    private readonly action?: { label: string; onTap: () => void }
  ) {}

  mount(): HTMLElement {
    const root = el('div', 'screen screen--pause screen--notice');
    const sign = el('header', 'mode-head');
    sign.append(el('p', 'lobby-big', this.icon), el('h1', 'mode-head__title', this.title));
    if (this.line) sign.appendChild(el('p', 'mode-head__tag', this.line));
    root.appendChild(sign);
    if (this.action) root.appendChild(button(this.action.label, this.action.onTap, 'btn--hero notice-action'));
    return root;
  }
}
