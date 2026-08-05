// ---------------------------------------------------------------------------
// ★ "SHORT GAMES" IS A DESIGN PILLAR, AND v2 WAS IGNORING IT BY DEFAULT.
//
// The root brief lists three pillars for a four-to-eight-year-old audience:
// minimal reading, icon- and voice-forward, and SHORT GAMES. v1 ships
// `INNINGS = 2`. v2 was defaulting to the SIM's `GAME.REGULATION_INNINGS` of 6 —
// measured at 217 pitches and about seventeen minutes against v1's 60 and five.
// Three and a half times the sitting, inherited from a constant chosen for the
// harness rather than for a player.
//
// The two defaults stay different on purpose. Every harness record —
// `sim.gameShape`'s 861 games, the 50,000-plate-appearance sweep — was measured
// at six innings, and moving the sim's default would silently restate all of
// them. So the sim keeps its measurement default and the product passes its own
// through `GameSpec.regulationInnings`, which is what that field is for.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { simulateGame } from '../sim/game';
import { makeRng } from '../sim/rng';
import { GAME } from '../sim/params';
import { ROSTER, getCharacter } from '../../data/characters';
import { DEFAULT_INNINGS, GAME_LENGTHS } from './GameView';

const spec = (regulationInnings: number) => ({
  away: { name: 'A', ids: ROSTER.slice(0, 9).map((c) => c.id) },
  home: { name: 'H', ids: ROSTER.slice(9, 18).map((c) => c.id) },
  lookup: getCharacter,
  regulationInnings,
});

describe('★ the product picks its own game length', () => {
  it('★ defaults SHORT, and shorter than the sim does', () => {
    expect(DEFAULT_INNINGS).toBeLessThan(GAME.REGULATION_INNINGS);
    // v1 ships two. Landing anywhere else is a decision, not a default.
    expect(DEFAULT_INNINGS).toBe(2);
  });

  it('★ leaves the SIM default alone, because every record rests on it', () => {
    // Moving this restates `sim.gameShape` and the whole 50,000-PA sweep without
    // re-running either. The product has its own knob precisely so it does not
    // have to touch this one.
    expect(GAME.REGULATION_INNINGS).toBe(6);
  });

  it('★ actually produces the game it advertises', () => {
    // A choice labelled "5 min" that plays for seventeen is worse than no choice
    // at all, so the pitch counts are asserted to be ORDERED and separated —
    // the minutes on the button come from these.
    const pitches = GAME_LENGTHS.map((c) => {
      let total = 0;
      for (let i = 0; i < 4; i++) {
        total += simulateGame(spec(c.innings), makeRng(`len${c.innings}-${i}`)).tally.pitches;
      }
      return total / 4;
    });
    for (let i = 1; i < pitches.length; i++) {
      expect(pitches[i], `${GAME_LENGTHS[i].label} is not longer than ${GAME_LENGTHS[i - 1].label}`)
        .toBeGreaterThan(pitches[i - 1]);
    }
    // And the advertised minutes track the measured pitches, within a wide band
    // — the point is that the labels are not decorative.
    const ratio = pitches[2] / pitches[0];
    const advertised = GAME_LENGTHS[2].minutes / GAME_LENGTHS[0].minutes;
    expect(Math.abs(ratio - advertised)).toBeLessThan(1.2);
  }, 60_000);

  it('every advertised length is playable and terminates', () => {
    for (const c of GAME_LENGTHS) {
      const r = simulateGame(spec(c.innings), makeRng(`play${c.innings}`));
      expect(r.innings).toBeGreaterThanOrEqual(c.innings);
      expect(Number.isFinite(r.awayScore + r.homeScore)).toBe(true);
    }
  }, 60_000);
});
