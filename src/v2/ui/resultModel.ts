// ---------------------------------------------------------------------------
// What the Result screen says, as a PURE model. `ResultScreen.ts` draws it.
//
// Same split as `scoreboardModel.ts`, for the same reason: "did the player win"
// is a rule, and a rule belongs somewhere a test can reach without a browser.
// ---------------------------------------------------------------------------

import type { GameResult } from '../sim/game';
import { computeAwards } from '../../systems/awards';

export type Verdict = 'win' | 'loss' | 'tie';

export interface ResultModel {
  verdict: Verdict;
  /** The player's own line, then the opponent's. Always this order. */
  yourName: string;
  yourRuns: number;
  theirName: string;
  theirRuns: number;
  innings: number;
  walkOff: boolean;
  /** Best bat of the game, as a character id, or null if nobody batted. */
  mvpId: string | null;
  /** Most home runs, if anyone hit one. */
  homerId: string | null;
  /** Most strikeouts thrown, if anyone threw one. */
  strikeoutId: string | null;
  /**
   * The finished game's per-inning line, away then home per entry — the board
   * BB2026 ends every game on. Unlike the score rows above this is in
   * SCOREBOARD order (away/home), because a line score is a fixture of the
   * sport, not of whoever held the device.
   */
  lineScore: ReadonlyArray<readonly [number, number | null]>;
  awayName: string;
  homeName: string;
  awayRuns: number;
  homeRuns: number;
}

export interface ResultTeams {
  away: string;
  home: string;
  /** Which side the human played. */
  you: 'away' | 'home';
}

/**
 * One finished game in, one result out.
 *
 * ★ THE VERDICT IS THE PLAYER'S, NOT THE SCOREBOARD'S. `GameResult` is symmetric
 * — it knows away and home and has no idea who was holding the device — so the
 * screen's whole job is to re-say it from one side. Getting this backwards does
 * not crash and does not fail a type check; it tells a six-year-old they lost a
 * game they won, which is the single worst bug this screen can have. That is why
 * `you` is required rather than defaulted.
 */
export function resultModel(
  result: GameResult,
  teams: ResultTeams,
  rosterOrder: string[]
): ResultModel {
  const youAreAway = teams.you === 'away';
  const yourRuns = youAreAway ? result.awayScore : result.homeScore;
  const theirRuns = youAreAway ? result.homeScore : result.awayScore;

  // ★ `computeAwards` IS v1's, IMPORTED RATHER THAN REWRITTEN. It is pure, it
  // already breaks ties deterministically by roster order, and it is the
  // definition the sticker album and the season awards use — so a kid who is
  // "MVP" here is MVP by the same arithmetic everywhere else in the product.
  const awards = computeAwards(result.lines, rosterOrder);

  return {
    verdict: yourRuns > theirRuns ? 'win' : yourRuns < theirRuns ? 'loss' : 'tie',
    yourName: youAreAway ? teams.away : teams.home,
    yourRuns,
    theirName: youAreAway ? teams.home : teams.away,
    theirRuns,
    innings: result.innings,
    walkOff: result.walkOff,
    mvpId: awards.mvp,
    homerId: awards.homerKing,
    strikeoutId: awards.strikeoutKing,
    lineScore: result.lineScore,
    awayName: teams.away,
    homeName: teams.home,
    awayRuns: result.awayScore,
    homeRuns: result.homeScore,
  };
}

/** The headline, in the fewest words a new reader can manage. */
export function verdictLine(v: Verdict): string {
  return v === 'win' ? 'YOU WIN!' : v === 'loss' ? 'GOOD GAME!' : 'ALL TIED!';
}
