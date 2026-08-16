// ---------------------------------------------------------------------------
// The inning-break board — BB2026's green scoreboard beat, DOM over the park.
//
// Between halves BB2026 fills the frame with a park scoreboard: line score,
// team rows, the street still alive behind it. Ours rides the sim's own
// `between` beat — the trigger is `phase === 'between' && outs >= 3`, which
// is exactly the yield after a half's last at-bat and BEFORE the loop re-tops
// (so the frame still carries the finished half). It closes when the phase
// moves on, so it is sim-paced: the headless audit pump never strands it
// open, and nothing waits on a wall clock.
//
// While it is up, a `body.inning-break` class hides the rest of the HUD the
// same way `body.screen-open` does — the reference frame shows the BOARD, not
// the board fighting the scoreboard strip it duplicates.
// ---------------------------------------------------------------------------

import type { LiveFrame } from '../sim/game';
import { lineScoreHTML } from './lineScoreTable';

export class InningBreak {
  readonly root = document.createElement('div');
  /** `?break=1`: every between-beat is a break — the audit's review surface.
   *  The REAL trigger is a half-inning of sim away, which cost the audit 78
   *  measured seconds per viewport and left the tab unable to navigate; the
   *  result screen's `SHOW_RESULT` exists for exactly this class of reach. */
  private readonly forceEvery: boolean;
  private readonly caption = document.createElement('div');
  private readonly rows: [HTMLElement, HTMLElement];
  private names: { away: string; home: string } = { away: 'AWAY', home: 'HOME' };
  private regulation = 2;
  private skipped = false;
  private shownFor = '';

  constructor(opts: { forceEvery?: boolean } = {}) {
    this.forceEvery = opts.forceEvery === true;
    this.root.className = 'inning-board interactive';
    this.caption.className = 'inning-board__caption';
    const table = document.createElement('div');
    table.className = 'inning-board__table';
    const mkRow = (): HTMLElement => {
      const r = document.createElement('div');
      r.className = 'inning-board__row';
      table.appendChild(r);
      return r;
    };
    // Header row (inning numbers) is rebuilt with the body rows each show.
    this.rows = [mkRow(), mkRow()];
    this.root.append(this.caption, table);
    // Tap to skip: hides the visuals for THIS break only; the sim idles on.
    this.root.addEventListener('pointerdown', () => {
      this.skipped = true;
      this.root.classList.remove('is-open');
    });
  }

  setTeams(names: { away: string; home: string }, regulation: number): void {
    this.names = names;
    this.regulation = regulation;
  }

  /** Feed every painted frame; the board decides when it is a break. */
  update(frame: LiveFrame): void {
    const breaking = frame.phase === 'between' && (frame.outs >= 3 || this.forceEvery);
    if (!breaking) {
      this.root.classList.remove('is-open');
      document.body.classList.remove('inning-break');
      this.skipped = false;
      this.shownFor = '';
      return;
    }
    const key = `${frame.inning}-${frame.half}`;
    if (this.skipped) return;
    if (this.shownFor !== key) {
      this.shownFor = key;
      this.paint(frame);
    }
    this.root.classList.add('is-open');
    document.body.classList.add('inning-break');
  }

  private paint(frame: LiveFrame): void {
    this.caption.textContent = `END OF ${frame.half === 'top' ? 'TOP' : 'BOTTOM'} ${frame.inning}`;
    // ★ The sim pushes a half onto `lineScore` AFTER the yield this board
    // rides, so the half that JUST finished is not in the array yet — its
    // runs are the total minus everything already recorded.
    const recorded: [number, number] = frame.lineScore.reduce<[number, number]>(
      (acc, [a, h]) => [acc[0] + a, acc[1] + (h ?? 0)],
      [0, 0]
    );
    const finished: { inning: number; side: 0 | 1; runs: number } = {
      inning: frame.inning,
      side: frame.half === 'top' ? 0 : 1,
      runs: frame.half === 'top' ? frame.awayScore - recorded[0] : frame.homeScore - recorded[1],
    };
    const innings = Math.max(this.regulation, frame.inning);
    const cells = (side: 0 | 1): Array<number | null | undefined> => {
      const out: Array<number | null | undefined> = [];
      for (let i = 0; i < innings; i++) {
        out.push(
          i === finished.inning - 1 && side === finished.side
            ? finished.runs
            : frame.lineScore[i]?.[side]
        );
      }
      return out;
    };
    const html = lineScoreHTML('inning-board', innings, [
      { name: this.names.away.toUpperCase(), cells: cells(0), total: frame.awayScore },
      { name: this.names.home.toUpperCase(), cells: cells(1), total: frame.homeScore },
    ]);
    const head = html.head;
    this.rows[0].innerHTML = html.rows[0];
    this.rows[1].innerHTML = html.rows[1];
    this.rows[0].insertAdjacentHTML('beforebegin', '');
    const table = this.rows[0].parentElement!;
    let header = table.querySelector('.inning-board__row--head');
    if (!header) {
      header = document.createElement('div');
      header.className = 'inning-board__row inning-board__row--head';
      table.prepend(header);
    }
    header.innerHTML = head;
  }
}
