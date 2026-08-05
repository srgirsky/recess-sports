// ---------------------------------------------------------------------------
// The matchup plate's numbers — pure, fed by `pa` events, owns no DOM.
//
// BB2001 and BB2026 both put a batter-vs-pitcher plate in the corner of the
// pitching view, and the thing that makes it read is the TODAY-LINE — "1 FOR
// 2 TODAY" tells a six-year-old the story of the game in four words. The sim
// already computes all of it; `SimEvent`'s `pa` restates the two stat pushes
// so this can tally live without a second source of truth (see the event's
// own header in `sim/game.ts`).
//
// Deliberately a fold over events rather than a read of `GameResult`: the
// result does not exist until the game ends, and the plate is for DURING.
// ---------------------------------------------------------------------------

import type { SimEvent } from '../sim/game';

export interface MatchupLines {
  /** "FIRST AT-BAT" until the kid has one, then "1 FOR 2 TODAY". */
  batter: string;
  /** "0 K · 0 BB" — the pitcher's day so far. */
  pitcher: string;
}

export class MatchupTally {
  private readonly atBats = new Map<string, number>();
  private readonly hits = new Map<string, number>();
  private readonly ks = new Map<string, number>();
  private readonly walks = new Map<string, number>();

  /** Feed every sim event; everything but `pa` is ignored. */
  onEvent(e: SimEvent): void {
    if (e.t !== 'pa') return;
    const bump = (m: Map<string, number>, id: string): void => {
      m.set(id, (m.get(id) ?? 0) + 1);
    };
    // A walk is not an official at-bat — same rule the stats stream keeps.
    if (e.result !== 'walk') bump(this.atBats, e.batterId);
    if (e.result === 'hit') bump(this.hits, e.batterId);
    if (e.result === 'k') bump(this.ks, e.pitcherId);
    if (e.result === 'walk') bump(this.walks, e.pitcherId);
  }

  /** A rematch starts a new day. */
  reset(): void {
    this.atBats.clear();
    this.hits.clear();
    this.ks.clear();
    this.walks.clear();
  }

  lines(batterId: string, pitcherId: string): MatchupLines {
    const ab = this.atBats.get(batterId) ?? 0;
    return {
      batter: ab === 0 ? 'FIRST AT-BAT' : `${this.hits.get(batterId) ?? 0} FOR ${ab} TODAY`,
      pitcher: `${this.ks.get(pitcherId) ?? 0} K · ${this.walks.get(pitcherId) ?? 0} BB`,
    };
  }
}
