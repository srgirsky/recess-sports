// ---------------------------------------------------------------------------
// The line-score table, built ONCE for its two readers.
//
// The inning-break board and the Result screen both draw "innings across the
// top, two team rows, R at the end" — BB2026 ends every half AND every game on
// that exact green board. One builder, so the two can never disagree about
// what a line score looks like. PURE string assembly: the callers own their
// hosts, their class prefixes and their data corrections (the break board's
// mid-half total-minus-recorded fix stays in `InningBreak.ts`, because a
// finished `GameResult` must NOT apply it).
// ---------------------------------------------------------------------------

export interface LineScoreRow {
  name: string;
  /** Per-inning runs; `null`/`undefined` renders as the unplayed dash. */
  cells: ReadonlyArray<number | null | undefined>;
  total: number;
}

export interface LineScoreHTML {
  head: string;
  rows: [string, string];
}

/** Escape a team name; everything else the builder emits is its own. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function lineScoreHTML(
  prefix: string,
  innings: number,
  rows: readonly [LineScoreRow, LineScoreRow]
): LineScoreHTML {
  const cell = (text: string, mod = ''): string =>
    `<span class="${prefix}__cell${mod ? ` ${prefix}__cell--${mod}` : ''}">${text}</span>`;
  const row = (r: LineScoreRow): string => {
    let cells = cell(esc(r.name), 'name');
    for (let i = 0; i < innings; i++) {
      const v = r.cells[i];
      cells += cell(v === undefined || v === null ? '–' : String(v));
    }
    return cells + cell(String(r.total), 'total');
  };
  let head = cell('', 'name');
  for (let i = 0; i < innings; i++) head += cell(String(i + 1), 'head');
  head += cell('R', 'head');
  return { head, rows: [row(rows[0]), row(rows[1])] };
}
