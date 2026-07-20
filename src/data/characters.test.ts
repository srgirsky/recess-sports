// ---------------------------------------------------------------------------
// Content contract for the roster: every kid can speak when drafted.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { ROSTER } from './characters';

describe('roster voice content', () => {
  it('every kid has a non-empty draft line', () => {
    for (const c of ROSTER) {
      expect(c.draftLine?.trim(), `${c.id} is missing a draftLine`).toBeTruthy();
      expect(c.draftLine!.includes('{name}'), `${c.id} draftLine has a stray placeholder`).toBe(false);
    }
  });

  it('chatter lines, where present, are non-empty', () => {
    for (const c of ROSTER) {
      for (const line of c.chatterLines ?? []) {
        expect(line.trim(), `${c.id} has an empty chatter line`).toBeTruthy();
      }
    }
  });
});
