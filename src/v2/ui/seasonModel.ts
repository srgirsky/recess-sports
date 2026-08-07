// ---------------------------------------------------------------------------
// Recess Week as a pure screen model, plus the one adapter from v2 results to
// the shared season fold.
// ---------------------------------------------------------------------------

import { computeAwards } from '../../systems/awards';
import type { KidStats, StatEvent } from '../../systems/stats';
import { isWeekOver, WEEKDAYS, wins, wonPennant, type SeasonState } from '../../systems/season';
import { TEAM_LOGOS, teamName } from '../../systems/team';

export interface SeasonDayModel {
  day: string;
  rivalName: string;
  rivalIcon: string;
  rivalColor: number;
  result: 'W' | 'L' | 'T' | null;
  next: boolean;
}

export interface SeasonAwardModel {
  id: string;
  label: string;
  icon: string;
}

export interface SeasonModel {
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  over: boolean;
  pennant: boolean;
  days: SeasonDayModel[];
  awards: SeasonAwardModel[];
}

export function seasonModel(s: SeasonState): SeasonModel {
  const over = isWeekOver(s);
  const awards = computeAwards(s.stats, s.playerTeam);
  const defs: Array<{ id: string | null; label: string; icon: string }> = [
    { id: awards.mvp, label: 'WEEK MVP', icon: '🏆' },
    { id: awards.homerKing, label: 'HOMER KING', icon: '💥' },
    { id: awards.strikeoutKing, label: 'K MACHINE', icon: '🔥' },
  ];
  return {
    teamName: teamName(s.identity),
    wins: wins(s),
    losses: s.results.filter((r) => r === 'L').length,
    ties: s.results.filter((r) => r === 'T').length,
    over,
    pennant: wonPennant(s),
    days: WEEKDAYS.map((day, i) => ({
      day,
      rivalName: teamName(s.rivals[i]),
      rivalIcon: TEAM_LOGOS[s.rivals[i].logo].icon,
      rivalColor: s.rivals[i].color,
      result: s.results[i] ?? null,
      next: !over && i === s.gameIndex,
    })),
    awards: defs.filter((a): a is SeasonAwardModel => a.id !== null),
  };
}

/** Re-express a folded v2 game line as events the shared season reducer owns. */
export function statEventsFromLines(lines: Record<string, KidStats>): StatEvent[] {
  const out: StatEvent[] = [];
  for (const [kid, line] of Object.entries(lines)) {
    for (let i = 0; i < line.ab; i++) out.push({ t: 'atBat', kid });
    for (let i = 0; i < line.h; i++) out.push({ t: 'hit', kid, homer: i < line.hr });
    for (let i = 0; i < line.r; i++) out.push({ t: 'run', kid });
    for (let i = 0; i < line.k; i++) out.push({ t: 'kThrown', kid });
  }
  return out;
}
