// ---------------------------------------------------------------------------
// ★ THE ONE BUG THIS SCREEN MUST NOT HAVE IS TELLING A KID THEY LOST A GAME
// THEY WON.
//
// `GameResult` is symmetric — it knows away and home and has no idea who was
// holding the device — so the whole job of `resultModel` is to re-say it from
// one side. Getting that backwards does not crash, does not fail a type check,
// and produces a screen that looks completely normal. It is exactly the class of
// error `game.ts`'s own seam tests exist for ("`decideAfterHalf` takes away then
// home while `shouldSkipBottom` takes home then away"), one layer up.
//
// So the verdict is swept against real finished games from BOTH sides, and the
// two sides must disagree on every field they should and agree on the rest.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { simulateGame, type GameResult } from '../sim/game';
import { makeRng } from '../sim/rng';
import { ROSTER, getCharacter } from '../../data/characters';
import { resultModel, verdictLine } from './resultModel';

const TEAMS = { away: 'ROCKETS', home: 'COMETS' };
const ORDER = ROSTER.map((c) => c.id);

function play(seed: string): GameResult {
  return simulateGame(
    {
      away: { name: TEAMS.away, ids: ROSTER.slice(0, 9).map((c) => c.id) },
      home: { name: TEAMS.home, ids: ROSTER.slice(9, 18).map((c) => c.id) },
      lookup: getCharacter,
    },
    makeRng(seed)
  );
}

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const GAMES = SEEDS.map(play);

describe('★ the verdict is the PLAYER’S, not the scoreboard’s', () => {
  it('★ calls a win a win from whichever side actually won it', () => {
    for (const g of GAMES) {
      const away = resultModel(g, { ...TEAMS, you: 'away' }, ORDER);
      const home = resultModel(g, { ...TEAMS, you: 'home' }, ORDER);

      // The same game, read from two sides: the runs swap, and so does who won.
      expect(away.yourRuns).toBe(g.awayScore);
      expect(home.yourRuns).toBe(g.homeScore);
      expect(away.theirRuns).toBe(home.yourRuns);
      expect(home.theirRuns).toBe(away.yourRuns);

      if (g.awayScore > g.homeScore) {
        expect(away.verdict).toBe('win');
        expect(home.verdict).toBe('loss');
      } else if (g.awayScore < g.homeScore) {
        expect(away.verdict).toBe('loss');
        expect(home.verdict).toBe('win');
      } else {
        expect(away.verdict).toBe('tie');
        expect(home.verdict).toBe('tie');
      }
    }
  }, 30_000);

  it('★ names the player’s own team first, whichever side they are', () => {
    // A screen that puts the runs in the right order under the WRONG names is
    // the same bug wearing a hat.
    const g = GAMES[0];
    expect(resultModel(g, { ...TEAMS, you: 'away' }, ORDER).yourName).toBe('ROCKETS');
    expect(resultModel(g, { ...TEAMS, you: 'home' }, ORDER).yourName).toBe('COMETS');
    expect(resultModel(g, { ...TEAMS, you: 'away' }, ORDER).theirName).toBe('COMETS');
  });

  it('saw a decided game and a spread of scores, or it proved nothing', () => {
    const decided = GAMES.filter((g) => g.awayScore !== g.homeScore);
    expect(decided.length, 'every sampled game was a tie').toBeGreaterThan(0);
    const bothWin =
      GAMES.some((g) => g.awayScore > g.homeScore) && GAMES.some((g) => g.homeScore > g.awayScore);
    expect(bothWin, 'one side won every game, so the swap is untested').toBe(true);
  });
});

describe('the stars', () => {
  it('come from v1’s own award arithmetic, not a second copy', () => {
    // `computeAwards` is what the sticker album and the season awards use, so a
    // kid who is MVP here is MVP by the same rule everywhere in the product.
    // It scores h + 2*hr + r; asserting the WINNER against a hand-rolled score
    // would just be reimplementing it, so assert the property instead: whoever
    // it named must be at least as good as everyone else by that score.
    for (const g of GAMES) {
      const m = resultModel(g, { ...TEAMS, you: 'away' }, ORDER);
      if (!m.mvpId) continue;
      const score = (id: string) => {
        const s = g.lines[id];
        return s ? s.h + s.hr * 2 + s.r : 0;
      };
      const best = score(m.mvpId);
      for (const id of Object.keys(g.lines)) expect(score(id)).toBeLessThanOrEqual(best);
    }
  }, 30_000);

  it('is null rather than a blank chip when nobody earned one', () => {
    // A home-run award with an empty name reads as a bug to a parent and as
    // nothing at all to a kid, so the screen skips the chip entirely.
    const noHomers = GAMES.find((g) => Object.values(g.lines).every((s) => s.hr === 0));
    if (!noHomers) return; // nothing to assert against in this sample
    expect(resultModel(noHomers, { ...TEAMS, you: 'away' }, ORDER).homerId).toBeNull();
  });
});

describe('the headline', () => {
  it('never says "you lose" to a six-year-old', () => {
    expect(verdictLine('win')).toBe('YOU WIN!');
    expect(verdictLine('loss')).not.toMatch(/lose|lost/i);
    expect(verdictLine('tie')).not.toMatch(/lose|lost/i);
  });
});

describe('the line score (round-2 re-audit #13)', () => {
  it('is passed through in SCOREBOARD order, whoever held the device', () => {
    // The you/them rows flip with `teams.you`; the board must NOT — a line
    // score is a fixture of the sport. Its per-inning sums must also agree
    // with the totals, from either chair.
    for (const g of GAMES.slice(0, 8)) {
      for (const you of ['away', 'home'] as const) {
        const m = resultModel(g, { ...TEAMS, you }, ORDER);
        expect(m.lineScore).toBe(g.lineScore);
        expect(m.awayName).toBe(TEAMS.away);
        expect(m.homeName).toBe(TEAMS.home);
        expect(m.awayRuns).toBe(g.awayScore);
        expect(m.homeRuns).toBe(g.homeScore);
        const sums = m.lineScore.reduce<[number, number]>(
          (acc, [a, h]) => [acc[0] + a, acc[1] + (h ?? 0)],
          [0, 0]
        );
        expect(sums[0]).toBe(m.awayRuns);
        expect(sums[1]).toBe(m.homeRuns);
      }
    }
  });
});
