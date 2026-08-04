// ---------------------------------------------------------------------------
// The scoreboard, as a PURE view-model.
//
// ★ SAME SPLIT AS EVERYWHERE ELSE IN THIS PROJECT, one layer up. `cameraCues.ts`
// is camera policy with no `three` import so it can be tested without a
// renderer; this is scoreboard policy with no DOM import so it can be tested
// without a browser. `Scoreboard.ts` is the thin thing that draws it.
//
// ★ THE CAPACITIES ARE MEASURED, NOT ASSUMED, and the obvious guess is wrong.
// A count never reaches four balls or three strikes — the fourth and the third
// END the plate appearance, and `inning.applyAtBat` owns that rule — so drawing
// four ball slots would show a kid a pip that can never light. OUTS ARE NOT
// SYMMETRIC WITH THAT: three really does appear, on the `between` frame after
// the side is retired, because the half has ended but the frame still describes
// it. Swept over five full games in `scoreboardModel.test.ts`, which is the only
// reason this comment is right rather than plausible.
//
// Design pillars, from the root brief: minimal reading, icon-forward. So the
// count, the outs and the bases are PIPS and a diamond rather than words, and
// the only text is two team names, two numbers and whose turn it is.
// ---------------------------------------------------------------------------

import type { LiveFrame } from '../sim/game';

/**
 * How many slots a pip row draws, and how many are lit.
 *
 * `of` is fixed per row and `lit` is clamped into it, so a frame the sim should
 * not be able to produce degrades to a full row rather than silently dropping a
 * pip off the end.
 */
export interface Pips {
  lit: number;
  of: number;
}

/** The most a count can ever show. Measured; see the header. */
export const MAX_BALLS = 3;
export const MAX_STRIKES = 2;
/** Three, and deliberately not two — the retired-side frame carries it. */
export const MAX_OUTS = 3;

export interface ScoreboardSide {
  name: string;
  runs: number;
  /** Drives the ▶ marker. Exactly one side is batting in any frame. */
  batting: boolean;
}

export interface ScoreboardModel {
  away: ScoreboardSide;
  home: ScoreboardSide;
  inning: number;
  half: 'top' | 'bottom';
  balls: Pips;
  strikes: Pips;
  outs: Pips;
  /** First, second, third. Index 0 is first base. */
  bases: [boolean, boolean, boolean];
  /** Who is at the plate, for the AT BAT block. */
  batter: string;
  pitcher: string;
  /**
   * What the human is doing this half, or null when nobody is playing this side.
   *
   * ★ IT IS THE SAME QUESTION THE TAP VERBS ASK. `sim.runnerSends` records that
   * a tap on a base means THROW THERE when fielding and SEND HIM THERE when
   * batting, so a player who cannot see which side they are on cannot know what
   * their own tap will do. The scoreboard is where that is answered, which is
   * why it is on the model rather than left to the view.
   */
  you: 'bat' | 'pitch' | null;
}

/** Which side bats in this half. Away bats the top; it is the only rule here. */
export function battingSide(half: 'top' | 'bottom'): 'away' | 'home' {
  return half === 'top' ? 'away' : 'home';
}

function pips(lit: number, of: number): Pips {
  return { lit: Math.max(0, Math.min(of, Math.round(lit))), of };
}

export interface ScoreboardTeams {
  away: string;
  home: string;
}

/**
 * One frame in, one scoreboard out.
 *
 * `names` resolves a character id to something printable. It is passed in rather
 * than imported so this stays testable with a stub and so a future roster swap
 * has one seam — the same reason `GameSpec` takes a `lookup`.
 */
export function scoreboardModel(
  frame: LiveFrame,
  teams: ScoreboardTeams,
  names: (id: string) => string,
  you: 'bat' | 'pitch' | null = null
): ScoreboardModel {
  const batting = battingSide(frame.half);
  return {
    away: { name: teams.away, runs: frame.awayScore, batting: batting === 'away' },
    home: { name: teams.home, runs: frame.homeScore, batting: batting === 'home' },
    inning: frame.inning,
    half: frame.half,
    balls: pips(frame.balls, MAX_BALLS),
    strikes: pips(frame.strikes, MAX_STRIKES),
    outs: pips(frame.outs, MAX_OUTS),
    bases: [frame.bases[0], frame.bases[1], frame.bases[2]],
    batter: names(frame.batterId),
    pitcher: names(frame.pitcherId),
    you,
  };
}

/**
 * ★ THE HALF ARROW POINTS THE WAY THE LINE SCORE READS, not the way a runner
 * goes. ▲ is the top of the inning and ▼ the bottom, which is the convention
 * every scoreboard a parent has ever seen uses.
 */
export function halfMark(half: 'top' | 'bottom'): '▲' | '▼' {
  return half === 'top' ? '▲' : '▼';
}
