// ---------------------------------------------------------------------------
// Recess Week: five scheduled rivals, persistent results, and Friday awards.
// ---------------------------------------------------------------------------

import { getCharacter } from '../../../data/characters';
import type { SeasonState } from '../../../systems/season';
import { UNIFORM_COLORS } from '../../../art/palette';
import { button, el } from '../dom';
import { portrait } from '../portrait';
import type { Screen } from '../Router';
import { seasonModel } from '../seasonModel';

export class SeasonScreen implements Screen {
  constructor(
    private readonly season: SeasonState,
    private readonly onPlay: () => void,
    private readonly onDone: (awardIds: string[]) => void,
    private readonly onBack: () => void
  ) {}

  mount(): HTMLElement {
    const model = seasonModel(this.season);
    const root = el('div', 'screen screen--season');
    const board = el('div', 'season-board');
    const head = el('header', 'season-head');
    head.append(
      el('h1', 'season-head__title', model.over && model.pennant ? '🏆 PENNANT WINNERS!' : '🏆 RECESS WEEK'),
      el('p', 'season-head__team', model.teamName),
      el('p', 'season-head__record', `${model.wins} W  ·  ${model.losses} L${model.ties ? `  ·  ${model.ties} T` : ''}`)
    );
    board.appendChild(head);

    const days = el('div', 'season-days');
    model.days.forEach((day) => {
      const slot = el('div', `season-day${day.next ? ' is-next' : ''}${day.result ? ' is-played' : ''}`);
      slot.style.setProperty('--team-color', UNIFORM_COLORS[day.rivalColor]?.jersey ?? '#888');
      slot.append(
        el('strong', 'season-day__name', day.day),
        el('span', 'season-day__rival', day.rivalIcon),
        el('span', 'season-day__result', day.result ?? (day.next ? '⚾' : '·'))
      );
      slot.setAttribute('aria-label', `${day.day}, ${day.rivalName}${day.result ? `, ${day.result}` : day.next ? ', next game' : ''}`);
      days.appendChild(slot);
    });
    board.appendChild(days);

    if (model.over) {
      const awards = el('div', 'season-awards');
      model.awards.forEach((award) => {
        const c = getCharacter(award.id);
        const card = el('div', 'season-award');
        const art = el('span', 'season-award__art');
        art.appendChild(portrait(c.visual, '', { street: true }));
        card.append(
          el('strong', 'season-award__label', `${award.icon} ${award.label}`),
          art,
          el('span', 'season-award__name', c.name)
        );
        awards.appendChild(card);
      });
      if (awards.childElementCount > 0) board.appendChild(awards);
      board.appendChild(button('✅  FINISH WEEK', () => this.onDone(model.awards.map((a) => a.id)), 'btn--hero season-finish'));
    } else {
      board.appendChild(button(`⚾  PLAY ${model.days[this.season.gameIndex].day}`, this.onPlay, 'btn--hero season-play'));
    }

    const back = button('←', this.onBack, 'btn--quiet season-back');
    back.setAttribute('aria-label', 'Back to home');
    root.append(board, back);
    return root;
  }
}
