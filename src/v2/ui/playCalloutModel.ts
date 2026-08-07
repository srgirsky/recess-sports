// ---------------------------------------------------------------------------
// Big-play feedback, as a pure decision.
//
// BB2026 writes the verdict over the field in letters a child can read from
// across the room: STRIKE / SAFE / OUT, with EARLY or LATE beneath a swing.
// The sim already emits the umpire's verdict and the play's resolved hit type,
// so this file translates those facts and never re-judges a pitch or play.
// ---------------------------------------------------------------------------

import type { SimEvent } from '../sim/game';

export type PlayCalloutKind = 'ball' | 'strike' | 'foul' | 'safe' | 'out' | 'homer';

export interface PlayCalloutModel {
  kind: PlayCalloutKind;
  label: string;
  detail: string | null;
}

function timingDetail(errorSec: number | null): string | null {
  if (errorSec === null) return null;
  if (errorSec < 0) return 'EARLY';
  if (errorSec > 0) return 'LATE';
  return 'ON TIME';
}

export function playCalloutFor(e: SimEvent): PlayCalloutModel | null {
  if (e.t === 'pitch') {
    switch (e.kind) {
      case 'ball':
        return { kind: 'ball', label: e.balls === 3 ? 'WALK!' : 'BALL', detail: null };
      case 'calledStrike':
        return {
          kind: 'strike',
          label: e.strikes === 2 ? 'STRIKEOUT!' : 'STRIKE',
          detail: 'LOOKING',
        };
      case 'swingingStrike':
        return {
          kind: 'strike',
          label: e.strikes === 2 ? 'STRIKEOUT!' : 'STRIKE',
          detail: timingDetail(e.timingErrorSec),
        };
      case 'foulTip':
        return { kind: 'foul', label: 'FOUL', detail: timingDetail(e.timingErrorSec) };
      case 'inPlay':
        // The contact event arrives after the live play and owns the verdict.
        return null;
    }
  }

  if (e.t === 'pa') return null;
  if (e.foul) return { kind: 'foul', label: 'FOUL', detail: timingDetail(e.timingErrorSec) };
  if (e.hit === 'HR') return { kind: 'homer', label: 'HOME RUN!', detail: 'TOUCH ’EM ALL' };
  if (e.hit === 'out') return { kind: 'out', label: 'OUT', detail: e.flyCaught ? 'NICE CATCH' : null };
  const detail = e.hit === '1B' ? 'SINGLE' : e.hit === '2B' ? 'DOUBLE' : 'TRIPLE';
  return { kind: 'safe', label: 'SAFE!', detail };
}
