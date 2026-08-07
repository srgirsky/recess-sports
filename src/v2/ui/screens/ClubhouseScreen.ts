// ---------------------------------------------------------------------------
// The clubhouse: personal records and the shared sticker collection.
//
// This is deliberately one screen, not a menu of empty stations. Every number
// comes from an existing store and every unlocked sticker is a kid the player
// actually drafted in v1 or v2. Tap one and that kid speaks their authored
// line—the collection is about the cast, not completion percentages.
// ---------------------------------------------------------------------------

import type { Character } from '../../../data/types';
import { button, el } from '../dom';
import { portrait } from '../portrait';
import type { Screen } from '../Router';
import type { ClubhouseModel } from '../clubhouseModel';

export class ClubhouseScreen implements Screen {
  constructor(
    private readonly model: ClubhouseModel,
    private readonly roster: Character[],
    private readonly onSpeak: (character: Character) => void,
    private readonly onBack: () => void
  ) {}

  mount(): HTMLElement {
    const root = el('div', 'screen screen--clubhouse');
    const panel = el('div', 'clubhouse-panel');
    const head = el('header', 'clubhouse-head');
    head.append(
      el('h1', 'clubhouse-head__title', '🏠 CLUBHOUSE'),
      el('p', 'clubhouse-head__tag', 'YOUR TEAM · YOUR STORIES')
    );

    const stats = el('div', 'clubhouse-stats');
    for (const [icon, value, label] of [
      ['⚾', this.model.gamesPlayed, 'GAMES'],
      ['⭐', `${this.model.unlocked}/${this.model.total}`, 'STICKERS'],
      ['✨', this.model.foils, 'FOIL'],
      ['🏆', this.model.trophies, 'TROPHIES'],
    ] as Array<[string, number | string, string]>) {
      const item = el('div', 'clubhouse-stat');
      item.append(
        el('span', 'clubhouse-stat__icon', icon),
        el('strong', 'clubhouse-stat__value', String(value)),
        el('span', 'clubhouse-stat__label', label)
      );
      stats.appendChild(item);
    }

    panel.append(head, stats);

    if (this.model.favorites.length > 0) {
      const favorites = el('section', 'clubhouse-favorites');
      favorites.appendChild(el('h2', 'clubhouse-section__title', '❤️ YOUR FAVORITES'));
      const row = el('div', 'clubhouse-favorites__row');
      for (const favorite of this.model.favorites) {
        const c = this.roster.find((kid) => kid.id === favorite.id);
        if (!c) continue;
        const chip = el('div', 'clubhouse-favorite');
        chip.append(
          el('span', 'clubhouse-favorite__emoji', c.emoji),
          el('span', '', c.name),
          el('span', 'clubhouse-favorite__count', `×${favorite.picks}`)
        );
        row.appendChild(chip);
      }
      favorites.appendChild(row);
      panel.appendChild(favorites);
    }

    panel.appendChild(el('h2', 'clubhouse-section__title', '📒 STICKER BOOK'));
    const grid = el('div', 'clubhouse-grid');
    for (const sticker of this.model.stickers) {
      const c = this.roster.find((kid) => kid.id === sticker.id);
      if (!c) continue;
      if (!sticker.unlocked) {
        const locked = el('div', 'clubhouse-sticker is-locked');
        locked.setAttribute('aria-label', 'Locked sticker');
        locked.append(el('span', 'clubhouse-sticker__mystery', '?'), el('span', 'clubhouse-sticker__name', '???'));
        grid.appendChild(locked);
        continue;
      }

      const card = button('', () => this.onSpeak(c), `clubhouse-sticker${sticker.foil ? ' is-foil' : ''}`);
      card.setAttribute('aria-label', `${c.name}, ${sticker.games} games${sticker.foil ? ', foil' : ''}`);
      const art = el('span', 'clubhouse-sticker__art');
      art.appendChild(portrait(c.visual, '', { street: true }));
      card.append(
        art,
        el('span', 'clubhouse-sticker__name', c.name.split(' ')[0]),
        el('span', 'clubhouse-sticker__line', `${sticker.foil ? '✨ ' : ''}⚾ ${sticker.games}${sticker.trophies ? ` · 🏆 ${sticker.trophies}` : ''}`)
      );
      grid.appendChild(card);
    }
    panel.appendChild(grid);

    const back = button('←', this.onBack, 'btn--quiet clubhouse-back');
    back.setAttribute('aria-label', 'Back to home');
    root.append(panel, back);
    return root;
  }
}
