import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../sim/game';
import { playCalloutFor } from './playCalloutModel';

const event = (e: unknown): SimEvent => e as SimEvent;

describe('play callouts', () => {
  it('shows the count-ending calls and swing timing', () => {
    expect(
      playCalloutFor(event({
        t: 'pitch', kind: 'swingingStrike', inZone: true, swung: true,
        timingErrorSec: -0.08, balls: 1, strikes: 2,
      }))
    ).toEqual({ kind: 'strike', label: 'STRIKEOUT!', detail: 'EARLY' });
    expect(
      playCalloutFor(event({
        t: 'pitch', kind: 'ball', inZone: false, swung: false,
        timingErrorSec: null, balls: 3, strikes: 1,
      }))
    ).toEqual({ kind: 'ball', label: 'WALK!', detail: null });
  });

  it('uses the resolved play rather than guessing from a frame', () => {
    expect(playCalloutFor(event({ t: 'contact', hit: '2B', foul: false, flyCaught: false, timingErrorSec: 0.03 })))
      .toEqual({ kind: 'safe', label: 'SAFE!', detail: 'DOUBLE' });
    expect(playCalloutFor(event({ t: 'contact', hit: 'out', foul: false, flyCaught: true, timingErrorSec: 0 })))
      .toEqual({ kind: 'out', label: 'OUT', detail: 'NICE CATCH' });
    expect(playCalloutFor(event({ t: 'contact', hit: 'HR', foul: false, flyCaught: false, timingErrorSec: -0.01 })))
      .toEqual({ kind: 'homer', label: 'HOME RUN!', detail: 'TOUCH ’EM ALL' });
  });

  it('waits for contact to resolve a ball in play', () => {
    expect(playCalloutFor(event({
      t: 'pitch', kind: 'inPlay', inZone: true, swung: true,
      timingErrorSec: 0, balls: 0, strikes: 0,
    }))).toBeNull();
    expect(playCalloutFor(event({ t: 'pa', batterId: 'a', pitcherId: 'b', result: 'hit' }))).toBeNull();
  });
});
