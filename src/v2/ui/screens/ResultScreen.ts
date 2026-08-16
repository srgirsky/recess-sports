// ---------------------------------------------------------------------------
// The Result screen. `resultModel.ts` decides what it says.
//
// ★ "GOOD GAME!" AND NOT "YOU LOSE". v1's online mode already made this call for
// a disconnect — a "no-blame GOOD GAME!" — and it is the right one for a losing
// scoreline too, for a four-to-eight audience whose next decision is whether to
// press PLAY AGAIN. The score is right there and says who won; the headline does
// not need to twist the knife.
//
// ★ THE GAME ENDS ON THE GREEN BOARD, NOT A GREY CARD. BB2026 closes every game
// on the diegetic line-score scoreboard with portraits (reference notes,
// screenshot 6), and the round-2 re-audit called our dark card the last plain
// rectangle in the product. The board is the inning-break board's own language
// — same builder (`lineScoreTable.ts`), same scoreboard green — and the award
// chips wear the season screen's portrait-card idiom, so Friday's pennant and
// tonight's game read as one product.
// ---------------------------------------------------------------------------

import { button, el } from '../dom';
import type { Screen } from '../Router';
import { portrait } from '../portrait';
import { lineScoreHTML } from '../lineScoreTable';
import { verdictLine, type ResultModel } from '../resultModel';
import type { Character } from '../../../data/types';

export class ResultScreen implements Screen {
  constructor(
    private readonly model: ResultModel,
    /** Full character lookup — the custom captain has a face here too. */
    private readonly lookup: (id: string) => Character,
    private readonly onAgain: () => void,
    private readonly onHome: () => void,
    private readonly labels: { headline?: string; again?: string; home?: string } = {}
  ) {}

  mount(): HTMLElement {
    const m = this.model;
    const root = el('div', `screen screen--result is-${m.verdict}`);

    const board = el('div', 'result-board');
    board.appendChild(el('h1', 'result-board__verdict', this.labels.headline ?? verdictLine(m.verdict)));
    board.appendChild(
      el('p', 'result-board__note', m.walkOff ? '⚡ WALK-OFF!' : `${m.innings} INNINGS · FINAL`)
    );

    // The line score, in scoreboard order — away on top, exactly as the
    // between-innings board draws it, from the same builder.
    const innings = m.lineScore.length;
    const html = lineScoreHTML('result-board', Math.max(innings, 1), [
      { name: m.awayName.toUpperCase(), cells: m.lineScore.map((s) => s[0]), total: m.awayRuns },
      { name: m.homeName.toUpperCase(), cells: m.lineScore.map((s) => s[1]), total: m.homeRuns },
    ]);
    const table = el('div', 'result-board__table');
    const headRow = el('div', 'result-board__row result-board__row--head');
    headRow.innerHTML = html.head;
    const awayRow = el('div', `result-board__row${m.awayRuns > m.homeRuns ? ' is-winner' : ''}`);
    awayRow.innerHTML = html.rows[0];
    const homeRow = el('div', `result-board__row${m.homeRuns > m.awayRuns ? ' is-winner' : ''}`);
    homeRow.innerHTML = html.rows[1];
    table.append(headRow, awayRow, homeRow);
    board.appendChild(table);

    // The stars, as portrait cards — the season screen's award idiom, shared
    // classes and all. Each is skipped when nobody earned it, rather than
    // shown empty: an award with a blank next to it reads as a bug to a
    // parent and as nothing at all to a kid.
    const stars = el('div', 'season-awards result-board__stars');
    for (const [icon, label, id] of [
      ['⭐', 'MVP', m.mvpId],
      ['💥', 'HOMERS', m.homerId],
      ['🔥', 'K’s', m.strikeoutId],
    ] as Array<[string, string, string | null]>) {
      if (!id) continue;
      const c = this.lookup(id);
      const card = el('div', 'season-award');
      const art = el('span', 'season-award__art');
      art.appendChild(portrait(c.visual, '', { street: true }));
      card.append(
        el('strong', 'season-award__label', `${icon} ${label}`),
        art,
        el('span', 'season-award__name', c.name)
      );
      stars.appendChild(card);
    }
    if (stars.childElementCount > 0) board.appendChild(stars);

    const actions = el('div', 'result-actions');
    actions.append(
      button(this.labels.again ?? '⚾  PLAY AGAIN', this.onAgain, 'btn--hero'),
      button(this.labels.home ?? '🏠  HOME', this.onHome, 'btn--quiet')
    );

    // The board scrolls inside `.screen-scroll` on short frames; the actions
    // stay on glass (the hero rule this repo now audits for).
    const scroll = el('div', 'screen-scroll');
    scroll.appendChild(board);
    root.append(scroll, actions);
    return root;
  }
}
