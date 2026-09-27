// ---------------------------------------------------------------------------
// The coach: the control hint, SPOKEN. PURE.
//
// ★ A HINT A FOUR-YEAR-OLD CANNOT READ IS NOT A HINT. `controlMode.ts` already
// decides which verb belongs to the person at each beat and shows it as a pill;
// the design pillar is "icon- and voice-forward", so the coach says the same
// thing out loud. It speaks each verb the first few times per browser — a
// returning child is not lectured — and every time (on a cooldown) in the
// LEARN TO PLAY lesson, where coaching is the point.
//
// The timing ring (`timingRing`) is the batting lesson's picture: a ring that
// closes on the plate exactly when the ball arrives, drawn from the pitch's own
// flight time, so "swing when the ring closes" is true by construction.
// ---------------------------------------------------------------------------

export type CoachVerb = 'pitch' | 'watch' | 'bat' | 'field' | 'run';

/** What the coach says for each verb — short, concrete, no baseball words a six-year-old lacks. */
export const COACH_LINES: Readonly<Record<CoachVerb, string>> = Object.freeze({
  pitch: 'Your turn to pitch! Tap where you want the ball to go.',
  watch: 'Get ready! Watch the pitcher.',
  bat: 'Tap when the ball gets to you. Swing when the ring closes!',
  field: 'Catch it! Drag to run to the ball, then tap a base to throw.',
  run: 'Run! Tap the next base to keep running.',
});

/** Which verb a control hint names, by its leading icon. Null for no hint. */
export function verbOfHint(hint: string): CoachVerb | null {
  if (hint.startsWith('👆')) return 'pitch';
  if (hint.startsWith('👀')) return 'watch';
  if (hint.startsWith('🏏')) return 'bat';
  if (hint.startsWith('🧤')) return 'field';
  if (hint.startsWith('👟')) return 'run';
  return null;
}

/** How many times each verb is spoken per browser outside the lesson. */
export const COACH_TIMES_PER_VERB = 2;
/** In the lesson, the same verb is not repeated sooner than this, seconds. */
export const LESSON_COOLDOWN_SEC = 14;

export type CoachCounts = Partial<Record<CoachVerb, number>>;

export class Coach {
  private last: CoachVerb | null = null;
  private readonly spokenAt = new Map<CoachVerb, number>();

  constructor(
    private counts: CoachCounts,
    private readonly save: (c: CoachCounts) => void,
    private lesson = false
  ) {}

  setLesson(on: boolean): void {
    this.lesson = on;
  }

  /** A new game: the next hint is fresh even if it names the same verb. */
  reset(): void {
    this.last = null;
  }

  /**
   * A hint was painted at `nowSec`. Returns the line to say, or null.
   * Only a CHANGE of verb can speak — the pill repaints every frame.
   */
  onHint(hint: string, nowSec: number): string | null {
    const verb = verbOfHint(hint);
    if (verb === this.last) return null;
    this.last = verb;
    if (!verb) return null;
    if (this.lesson) {
      const at = this.spokenAt.get(verb);
      if (at !== undefined && nowSec - at < LESSON_COOLDOWN_SEC) return null;
      this.spokenAt.set(verb, nowSec);
      return COACH_LINES[verb];
    }
    const n = this.counts[verb] ?? 0;
    if (n >= COACH_TIMES_PER_VERB) return null;
    this.counts = { ...this.counts, [verb]: n + 1 };
    this.save(this.counts);
    return COACH_LINES[verb];
  }
}

/**
 * The timing ring's scale and state for a pitch `elapsedSec` into a flight of
 * `travelSec`. Scale falls linearly from `START_SCALE` to 1 at the crossing and
 * holds there; `now` is true within `NOW_WINDOW_FRAC` of the flight around it.
 */
export const RING_START_SCALE = 4;
export const RING_NOW_WINDOW_FRAC = 0.08;

export function timingRing(elapsedSec: number, travelSec: number): { scale: number; now: boolean } {
  const frac = travelSec > 0 ? elapsedSec / travelSec : 1;
  const scale = 1 + (RING_START_SCALE - 1) * Math.max(0, 1 - frac);
  return { scale, now: Math.abs(1 - frac) <= RING_NOW_WINDOW_FRAC };
}
