// The person's chosen skill level, remembered per browser. v2-only on purpose:
// v1 has its own difficulty store and the shared keys are the votes, not prefs.
import type { Skill } from '../sim/assist';
import type { CoachCounts } from './coachModel';

const KEY = 'recess_v2_skill';

export function loadSkill(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveSkill(skill: Skill): void {
  try {
    localStorage.setItem(KEY, skill);
  } catch {
    // Private mode or blocked storage: the level simply is not remembered.
  }
}

const COACH_KEY = 'recess_v2_coach';

/** How many times the coach has said each verb in this browser. */
export function loadCoachCounts(): CoachCounts {
  try {
    const raw = localStorage.getItem(COACH_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as CoachCounts) : {};
  } catch {
    return {};
  }
}

export function saveCoachCounts(c: CoachCounts): void {
  try {
    localStorage.setItem(COACH_KEY, JSON.stringify(c));
  } catch {
    // Not remembered; the coach just speaks again next visit.
  }
}
