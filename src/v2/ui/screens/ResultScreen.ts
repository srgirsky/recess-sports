// ---------------------------------------------------------------------------
// The Result screen. `resultModel.ts` decides what it says.
//
// ★ "GOOD GAME!" AND NOT "YOU LOSE". v1's online mode already made this call for
// a disconnect — a "no-blame GOOD GAME!" — and it is the right one for a losing
// scoreline too, for a four-to-eight audience whose next decision is whether to
// press PLAY AGAIN. The score is right there and says who won; the headline does
// not need to twist the knife.
// ---------------------------------------------------------------------------

import { button, el } from '../dom';
import type { Screen } from '../Router';
import { verdictLine, type ResultModel } from '../resultModel';

export class ResultScreen implements Screen {
  constructor(
    private readonly model: ResultModel,
    private readonly names: (id: string) => string,
    private readonly onAgain: () => void,
    private readonly onHome: () => void,
    private readonly labels: { headline?: string; again?: string; home?: string } = {}
  ) {}

  mount(): HTMLElement {
    const m = this.model;
    const root = el('div', `screen screen--result is-${m.verdict}`);

    const card = el('div', 'result-card');
    card.appendChild(el('h1', 'result-card__verdict', this.labels.headline ?? verdictLine(m.verdict)));

    // The score, the player's side first — the same order the model fixed.
    const score = el('div', 'result-score');
    for (const [name, runs, mine] of [
      [m.yourName, m.yourRuns, true],
      [m.theirName, m.theirRuns, false],
    ] as Array<[string, number, boolean]>) {
      const row = el('div', `result-score__row${mine ? ' is-mine' : ''}`);
      row.append(el('span', 'result-score__name', name), el('span', 'result-score__runs', String(runs)));
      score.appendChild(row);
    }
    card.appendChild(score);

    const note = m.walkOff ? 'walk-off!' : `${m.innings} innings`;
    card.appendChild(el('p', 'result-card__note', note));

    // Stars. Each one is skipped when nobody earned it, rather than shown empty
    // — an award with a blank next to it reads as a bug to a parent and as
    // nothing at all to a kid.
    const stars = el('div', 'result-stars');
    for (const [icon, label, id] of [
      ['⭐', 'MVP', m.mvpId],
      ['💥', 'HOMERS', m.homerId],
      ['🔥', 'K’s', m.strikeoutId],
    ] as Array<[string, string, string | null]>) {
      if (!id) continue;
      const chip = el('div', 'result-star');
      chip.append(
        el('span', 'result-star__icon', icon),
        el('span', 'result-star__who', this.names(id)),
        el('span', 'result-star__label', label)
      );
      stars.appendChild(chip);
    }
    if (stars.childElementCount > 0) card.appendChild(stars);

    const actions = el('div', 'result-actions');
    actions.append(
      button(this.labels.again ?? '⚾  PLAY AGAIN', this.onAgain, 'btn--hero'),
      button(this.labels.home ?? '🏠  HOME', this.onHome, 'btn--quiet')
    );

    root.append(card, actions);
    return root;
  }
}
