// ---------------------------------------------------------------------------
// Strategy for a young player: who bats next.
//
// Nine field positions would turn this into a reading test. Defence remains the
// sim planner's job; batting order is visible, direct, and consequential. Each
// arrow moves the real array handed to TeamSpec—there is no preview copy.
// ---------------------------------------------------------------------------

import { getCharacter } from '../../../data/characters';
import type { Character } from '../../../data/types';
import { button, el } from '../dom';
import { portrait } from '../portrait';
import type { Screen } from '../Router';

export class StrategyScreen implements Screen {
  private readonly order: string[];
  private list!: HTMLElement;

  constructor(
    ids: readonly string[],
    private readonly onReady: (order: string[]) => void,
    private readonly lookup: (id: string) => Character = getCharacter
  ) {
    this.order = [...ids];
  }

  mount(): HTMLElement {
    const root = el('div', 'screen screen--strategy');
    const head = el('div', 'strategy-head');
    head.append(
      el('h1', 'strategy-head__title', '📋 BATTING ORDER'),
      el('p', 'strategy-head__tag', 'MOVE YOUR HITTERS')
    );
    this.list = el('div', 'strategy-list');
    this.paint();
    root.append(head, this.list, button('✓  LOOKS GOOD', () => this.onReady([...this.order]), 'btn--hero'));
    return root;
  }

  private move(index: number, by: -1 | 1): void {
    const next = index + by;
    if (next < 0 || next >= this.order.length) return;
    [this.order[index], this.order[next]] = [this.order[next], this.order[index]];
    this.paint();
  }

  private paint(): void {
    this.list.replaceChildren();
    this.order.forEach((id, index) => {
      const c = this.lookup(id);
      const row = el('div', 'strategy-row');
      row.dataset.id = id;
      row.appendChild(el('strong', 'strategy-row__slot', String(index + 1)));
      const art = el('span', 'strategy-row__art');
      art.appendChild(portrait(c.visual, '', { street: true }));
      row.append(art, el('span', 'strategy-row__name', c.name));
      const stats = el('span', 'strategy-row__stats', `🎯${c.stats.contact}  💥${c.stats.power}  ⚡${c.stats.speed}`);
      row.appendChild(stats);
      const controls = el('span', 'strategy-row__moves');
      const up = button('↑', () => this.move(index, -1), 'strategy-move strategy-move--up');
      const down = button('↓', () => this.move(index, 1), 'strategy-move strategy-move--down');
      up.disabled = index === 0;
      down.disabled = index === this.order.length - 1;
      up.setAttribute('aria-label', `Move ${c.name} earlier`);
      down.setAttribute('aria-label', `Move ${c.name} later`);
      controls.append(up, down);
      row.appendChild(controls);
      this.list.appendChild(row);
    });
  }
}
