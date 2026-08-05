// ---------------------------------------------------------------------------
// Cues, played. `soundCues.ts` decides which; this one makes the noise.
//
// ★ IT IS v1's SYNTHESISER, IMPORTED. `systems/audio.ts` is code-synthesized
// Web Audio plus browser SpeechSynthesis — no files, no cost, and Phaser-free,
// so it imports cleanly into v2's UI layer. A second bat crack would be a second
// sound for the same event that drifts from the one v1 ships, and the whole
// point of sharing `data/` and `config.ts` is that the two games are one product.
//
// ⚠️ AUDIO NEEDS A USER GESTURE. The root brief's gotcha: it is unlocked on the
// title PLAY click, and every call no-ops before that or when muted — so calls
// are always safe to make, and nothing here needs to know whether the tab has
// been clicked yet.
//
// ★ AND THE MUTE IS v1's MUTE. `toggleMute` persists to the same key, so a
// parent who silenced the game at `/` does not have to find the button again at
// `/v2/`. Same argument as the shared pick tally.
// ---------------------------------------------------------------------------

import {
  cheer as playCheer,
  crack,
  isMuted,
  pitchWoosh,
  pop,
  say,
  toggleMute,
  unlock,
  whiff,
} from '../../systems/audio';
import { commentatorProfile, kidVoice } from '../../systems/voices';
import { Announcer } from '../../systems/announcer';
import type { Character } from '../../data/types';
import { announceFor, cuesForChange, cuesForEvent, snapshot, type Cue, type Snapshot } from './soundCues';
import type { LiveFrame, SimEvent } from '../sim/game';

/**
 * How many of the same cue may sound in one tick.
 *
 * A ball in play emits its `pitch` and its `contact` within the same instant,
 * and a play can retire two runners on one tick. Playing every one stacks
 * identical waveforms into a click rather than a louder sound.
 */
const MAX_PER_TICK = 1;

export class Sound {
  /**
   * The last snapshot, COPIED.
   *
   * ⚠️ Never a `LiveFrame`. The generator yields one object and mutates it, so a
   * retained frame is the current frame and every comparison is a thing against
   * itself — no cues, ever, and nothing to see. `snapshot()` is the copy.
   */
  private last: Snapshot | null = null;

  /**
   * The booth. v1's `Announcer` — two kid commentators with line pools, a
   * no-repeat rule, a rate limiter and strict speaker alternation.
   *
   * ★ IT IS SEEDED FROM NOTHING, deliberately: `Math.random` is the default and
   * this is the VIEW. `sim/rng.ts`'s injected-and-forked rule exists so the SIM
   * is reproducible, and commentary that varied with the game seed would make
   * "watch that again" mean hearing the same jokes.
   */
  private readonly booth = new Announcer();

  /**
   * Who is at the plate, for `{name}` in a call.
   *
   * ★ THE FRAME IS BEHIND THE EVENT BY ONE STEP, AND THAT IS CORRECT HERE.
   * `advance()` runs the generator — firing events — and only then publishes the
   * new frame, so at event time this still holds the batter the event is ABOUT.
   * A batter cannot change mid-plate-appearance, which is the only span these
   * moments cover.
   */
  private batter = '';

  /** Unlock the audio context. Call from a real user gesture and nowhere else. */
  start(): void {
    unlock();
  }

  get muted(): boolean {
    return isMuted();
  }

  /** Flip the mute, and report the new state so a button can relabel itself. */
  toggle(): boolean {
    return toggleMute();
  }

  /** A plate event, straight off the sim's own observer. */
  onEvent(e: SimEvent): void {
    this.fire(cuesForEvent(e));
    const moment = announceFor(e);
    if (!moment) return;
    const lines = this.booth.line(moment.kind, performance.now(), { name: this.batter }, moment.priority);
    if (!lines) return;
    // ★ THE FIRST LINE FLUSHES, THE REACTION QUEUES. `audio.say` reserves the
    // speaking slot on a flush precisely so the second half of an exchange lines
    // up behind it instead of jumping in front during the deferred gap.
    lines.forEach((l, i) => say(l.text, commentatorProfile(l.speaker), i === 0 ? 'flush' : 'queue'));
  }

  /** Who to name in a call. Fed from the frame tap. */
  setBatter(name: string): void {
    this.batter = name;
  }

  /** One tick of state. Cheap enough to call every frame; usually silent. */
  onFrame(f: LiveFrame): void {
    const next = snapshot(f);
    if (this.last) this.fire(cuesForChange(this.last, next));
    this.last = next;
  }

  /**
   * A new game. Drops the snapshot so the reset to 0-0 is not heard as
   * anything — `cuesForChange` already refuses to fire on a fall, and this makes
   * the first tick of a game a baseline rather than a comparison.
   */
  reset(): void {
    this.last = null;
    this.batter = '';
  }

  /**
   * A kid saying their own name, in their own voice.
   *
   * ★ THE SINGLE MOST CHARACTERFUL THING v1 DOES, and it costs one call: every
   * character has a stable derived voice (`systems/voices.ts`), so drafting
   * Junebug means hearing Junebug. `flush` rather than `queue` because a fast
   * drafter should hear the kid they just tapped, not a backlog of the last four.
   */
  sayName(c: Character): void {
    say(c.name, kidVoice(c), 'flush');
  }

  /** "THE TEAL ROCKETS!" — said by the booth, at the top of the game. */
  sayTeam(name: string): void {
    say(`${name}!`, commentatorProfile('A'), 'flush');
  }

  private fire(cues: Cue[]): void {
    const seen = new Map<Cue, number>();
    for (const cue of cues) {
      const n = seen.get(cue) ?? 0;
      if (n >= MAX_PER_TICK) continue;
      seen.set(cue, n + 1);
      PLAY[cue]();
    }
  }
}

/**
 * The cue -> sound table.
 *
 * The umpire's calls deliberately share the SFX rather than being spoken: a
 * spoken "STRIKE" on every pitch is exhausting at this pace, and the count is
 * already on the scoreboard as pips that pop. `pop` for a strike and nothing at
 * all for a ball is v1's balance — the noise marks the thing that changed
 * against the batter.
 */
const PLAY: Record<Cue, () => void> = {
  woosh: pitchWoosh,
  crack,
  whiff,
  pop,
  cheer: playCheer,
  'call:strike': pop,
  'call:ball': () => {},
  'call:foul': () => {},
  out: pop,
};
