// ---------------------------------------------------------------------------
// WHAT should make a noise, decided purely. `Sound.ts` makes it.
//
// ★ SAME SPLIT AS THE CAMERA AND THE SCOREBOARD, one more time: `cameraCues.ts`
// is policy with no `three`, `scoreboardModel.ts` is policy with no DOM, and
// this is policy with no Web Audio. Sound is the hardest of the three to check
// by hand — you cannot look at it, and a missing cue is silence, which is also
// what a working mute sounds like — so it is the one that most needs to be a
// function you can call in a test.
//
// ★ TWO SOURCES, AND THE SPLIT IS NOT ARBITRARY. `SimEvent` is emitted
// SYNCHRONOUSLY by the sim and carries exactly what happened at the plate —
// whether the batter swung, whether it was in the zone, whether the ball was
// caught. Nothing on the frame can reconstruct that: by the time a frame is
// yielded, a swing and a take look identical. Runs, outs and half-innings are
// the opposite — they are STATE, and the honest way to notice state changing is
// to compare it with what it was.
//
// ⚠️ WHICH MEANS THIS FILE MUST COPY. `simulateGameLive` yields the SAME frame
// object every tick, mutated in place (see `LiveFrame`), so holding "the
// previous frame" holds the current one and every comparison is between a thing
// and itself — zero cues, forever, with nothing to see. `snapshot()` exists for
// that reason and is the only thing `Sound.ts` is allowed to retain.
// ---------------------------------------------------------------------------

import type { LiveFrame, SimEvent } from '../sim/game';
import type { AnnounceKind } from '../../systems/announcer';

export type Cue =
  /** The ball leaving the hand. */
  | 'woosh'
  /** Bat on ball. */
  | 'crack'
  /** A swing that met nothing. */
  | 'whiff'
  /** A ball into a glove. */
  | 'pop'
  /** A run, or something worth shouting about. */
  | 'cheer'
  | 'call:strike'
  | 'call:ball'
  | 'call:foul'
  | 'out';

/** The scalars a cue can be derived from. Copied, never a frame reference. */
export interface Snapshot {
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  awayScore: number;
  homeScore: number;
  phase: LiveFrame['phase'];
}

/**
 * The fields worth keeping, copied out of the reused frame.
 *
 * Every field is a primitive on purpose: a snapshot that held `bases` would hold
 * the frame's own array, which is replaced rather than mutated today and might
 * not be tomorrow. Copy scalars and the trap cannot come back.
 */
export function snapshot(f: LiveFrame): Snapshot {
  return {
    inning: f.inning,
    half: f.half,
    outs: f.outs,
    awayScore: f.awayScore,
    homeScore: f.homeScore,
    phase: f.phase,
  };
}

/**
 * What a plate event sounds like.
 *
 * ★ THE `pitch` EVENT ALREADY KNOWS THE OUTCOME, so nothing here re-derives it.
 * `kind` is the umpire's own verdict — `ball`, `calledStrike`, `swingingStrike`,
 * `foulTip`, `inPlay` — and a whiff emits NO contact event at all, which is why
 * a cue table built around `hit === 'miss'` would have been silent on every
 * swing and a miss. The union is the contract; read it rather than infer it.
 *
 * ★ AND `inPlay` DELIBERATELY MAKES NO CRACK HERE. The same pitch emits a
 * `contact` event a moment later carrying the launch and whether it was caught,
 * and cracking on both would double every ball in play.
 */
export function cuesForEvent(e: SimEvent): Cue[] {
  if (e.t === 'pitch') {
    switch (e.kind) {
      case 'ball':
        return ['woosh', 'call:ball'];
      case 'calledStrike':
        return ['woosh', 'call:strike'];
      case 'swingingStrike':
        return ['woosh', 'whiff', 'call:strike'];
      case 'foulTip':
        return ['woosh', 'crack', 'call:foul'];
      case 'inPlay':
        return ['woosh'];
    }
  }

  // The plate appearance resolving. Two of these are the same instant as a
  // pitch/contact cue and DEDUPE (`MAX_PER_TICK` stacks identical waveforms
  // into one); the other two were genuinely silent moments before this event
  // existed — nobody cheered a single, and a groundout's putout had no mitt.
  if (e.t === 'pa') {
    switch (e.result) {
      case 'hit':
        return ['cheer'];
      case 'out':
        return ['pop'];
      case 'k':
        return ['call:strike'];
      case 'walk':
        return ['call:ball'];
    }
  }

  // Contact — the ball that was actually put in play, or fouled away.
  if (e.foul) return ['crack', 'call:foul'];
  const cues: Cue[] = ['crack'];
  if (e.flyCaught) cues.push('pop');
  if (e.hit === 'HR') cues.push('cheer');
  return cues;
}

/**
 * What CHANGED between two ticks.
 *
 * Only rises count. A score or an out can only go up within a game, so a fall
 * means a new game started under the same listener — which should be silent, not
 * a burst of cheering for runs that were undone.
 */
export function cuesForChange(prev: Snapshot, next: Snapshot): Cue[] {
  const cues: Cue[] = [];

  // ★ AN OUT IS NOT A CUE WHEN THE HALF TURNED OVER. `outs` resets to 0 on a new
  // half, so a naive `next.outs > prev.outs` is right; but the third out and the
  // half-change arrive together, and firing both reads as two events. The out
  // wins — it is the one that just happened.
  if (next.outs > prev.outs) cues.push('out');

  const runs = next.awayScore - prev.awayScore + (next.homeScore - prev.homeScore);
  if (runs > 0) cues.push('cheer');

  return cues;
}

// --- The booth --------------------------------------------------------------

/**
 * Which of the booth's moments this event is, and how loudly it counts.
 *
 * ★ THE COUNT ARRIVES WITH THE PITCH, WHICH IS WHY THIS WORKS WITHOUT NEW SIM
 * EVENTS. `SimEvent.pitch` carries `balls` and `strikes` as they were BEFORE the
 * pitch — a field `harness.ts` added because "a field nobody reads is a field
 * nobody can trust" — so a third strike is a strike thrown at `strikes === 2`,
 * and ball four is a ball thrown at `balls === 3`. The sim needed no change to
 * be commentated; it was already saying enough.
 *
 * ★ PRIORITY 2 IS "ALWAYS SPEAK". `Announcer` drops priority-1 lines while the
 * booth is still talking, which is what stops it babbling at this pace. A homer
 * and a strikeout are the calls a kid is waiting for, so they jump the queue and
 * may come back as a two-line exchange.
 */
export function announceFor(e: SimEvent): { kind: AnnounceKind; priority: 1 | 2 } | null {
  if (e.t === 'pitch') {
    if (e.strikes === 2 && e.kind === 'swingingStrike')
      return { kind: 'strikeoutSwinging', priority: 2 };
    if (e.strikes === 2 && e.kind === 'calledStrike')
      return { kind: 'strikeoutPitched', priority: 2 };
    if (e.balls === 3 && e.kind === 'ball') return { kind: 'walk', priority: 1 };
    return null;
  }

  // The booth already called this PA off its pitch and contact events — the
  // `pa` restatement is for tallies, and announcing it would say everything
  // twice.
  if (e.t === 'pa') return null;

  // ★ A FOUL IS NOT A MOMENT. It is the most common contact event there is, and
  // a booth that calls every one of them says nothing else all game.
  if (e.foul) return null;
  if (e.hit === 'HR') return { kind: 'homer', priority: 2 };
  if (e.flyCaught) return { kind: 'catch', priority: 1 };
  if (e.hit === 'out') return { kind: 'outRace', priority: 1 };
  return { kind: 'hitSafe', priority: 1 };
}
