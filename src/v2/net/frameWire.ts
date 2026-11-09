// ---------------------------------------------------------------------------
// The live game on the wire. PURE (no three, no DOM, no peerjs).
//
// ★ THE HOST RUNS THE ONE SIM AND THE GUEST NEVER SIMULATES — v1's rule
// (`src/scenes/AGENTS.md` § Two-device play), kept for the reason v1 has it:
// two devices each stepping the physics would have to produce bit-identical
// floats in two different JavaScript engines, and the first one that did not
// would put the ball in two places.
//
// ★ SO THE GUEST'S VIEW IS HANDED THE HOST'S FRAMES THROUGH THE SAME DOOR THE
// SIM USES. `GameView` pumps a generator: it calls `next(inputs)` and draws
// the `LiveFrame` that comes back. `RemoteGame` is that generator's shape with
// the network behind it — every frame the host's sim yielded, in order, each
// preceded by the sim events that led to it. The guest's windup, pitch flight,
// play-end hold, camera, callouts and sound are therefore not a second
// implementation of anything: they are `GameView`'s own code, fed the same
// sequence.
//
// What crosses is a PROJECTION of the frame (`projectFrame`): plain JSON, with
// the pieces of `PlayState` that are not state left behind — the venue (the
// guest has its own copy), the rng closures, the retune table, the fielder
// cover map and the ball's sampled path, none of which the render layer reads.
// Non-live frames go whole (they are small and rare); live frames go as a
// `jsonDelta` against the previous one.
// ---------------------------------------------------------------------------

import type { GameResult, LiveFrame, SimEvent } from '../sim/game';
import type { PlayState } from '../sim/play';
import type { FieldGeometry } from '../sim/field';
import { diff, patch, quantize, type Delta, type Json } from './jsonDelta';

/** One frame on the wire: whole, or as what changed since the last one. */
export type FrameMsg = { key: Json } | { delta: Delta };

/**
 * The frame as plain JSON. A deep, DETACHED copy: the sim mutates its one
 * `LiveFrame` in place every tick, so anything kept past the tick (the
 * encoder's diff base) has to be a copy.
 */
export function projectFrame(frame: LiveFrame): Json {
  const { play, ...rest } = frame;
  let wirePlay: unknown = null;
  if (play) {
    // Left behind on purpose — see the header. `rng` and `cover` would not
    // survive JSON at all (closures, a Map); the others only cost bytes.
    const state: Record<string, unknown> = { ...play };
    for (const key of ['geo', 'rng', 'tune', 'chase', 'cover']) delete state[key];
    const read: Record<string, unknown> = { ...play.trace };
    delete read.samples;
    state.trace = read;
    wirePlay = state;
  }
  return quantize(JSON.parse(JSON.stringify({ ...rest, play: wirePlay })) as Json);
}

/**
 * Host side: turns the sim's frames into wire messages.
 *
 * A frame is sent WHOLE whenever it is not live, and on the first live tick of
 * a play — so every play, and every pause in play, is a resync point: a guest
 * that reconnects or asks to be caught up is never more than one play behind a
 * complete picture. `reset()` forces the next frame out whole.
 */
export class FrameEncoder {
  private last: Json | null = null;
  private lastLive = false;

  reset(): void {
    this.last = null;
    this.lastLive = false;
  }

  encode(frame: LiveFrame): FrameMsg {
    const cur = projectFrame(frame);
    const live = frame.phase === 'live';
    const whole = this.last === null || !live || !this.lastLive;
    const msg: FrameMsg = whole ? { key: cur } : { delta: diff(this.last, cur) ?? {} };
    this.last = cur;
    this.lastLive = live;
    return msg;
  }
}

type Queued = { f: FrameMsg } | { e: SimEvent } | { end: GameResult };

/**
 * Guest side: the host's game, as something `GameView` can pump.
 *
 * ★ `next()` IS SYNCHRONOUS AND THE NETWORK IS NOT, so the pump must ask
 * `hasNext()` first and simply not advance on a tick where nothing has
 * arrived. That is the whole of latency handling on the guest: it draws the
 * frame it has until the next one lands.
 *
 * ★ THE FRAME OBJECT IS REUSED AND THE PLAY OBJECT IS ONE PER PLAY, exactly as
 * the sim does it, because the view is written against that: it keeps the
 * finished play to paint the play-end hold, and it must stay the play it was.
 */
export class RemoteGame {
  private queue: Queued[] = [];
  private frame: Record<string, Json> = {};
  private frames = 0;
  private result: GameResult | null = null;
  private lost = false;

  constructor(
    private readonly geo: FieldGeometry,
    private readonly onEvent: (e: SimEvent) => void
  ) {}

  pushFrame(f: FrameMsg): void {
    this.queue.push({ f });
    this.frames += 1;
  }

  pushEvent(e: SimEvent): void {
    this.queue.push({ e });
  }

  pushEnd(result: GameResult): void {
    this.queue.push({ end: result });
    this.frames += 1; // the end is something `next()` can return
  }

  /** How many `next()` calls can be answered right now. */
  get pending(): number {
    return this.result ? 1 : this.frames;
  }

  hasNext(): boolean {
    return this.pending > 0;
  }

  /**
   * A delta arrived with nothing to apply it to (we joined or re-joined
   * mid-play). Deltas are skipped until the next WHOLE frame restarts the
   * stream; the caller asks the host for one.
   */
  get needsKey(): boolean {
    return this.lost;
  }

  /** The generator's `next`. The inputs are sent by the caller, not from here. */
  next(): IteratorResult<LiveFrame, GameResult> {
    for (;;) {
      if (this.result) return { done: true, value: this.result };
      const item = this.queue.shift();
      if (!item) throw new Error('RemoteGame.next() with nothing queued — ask hasNext() first');
      if ('e' in item) {
        this.onEvent(item.e);
        continue;
      }
      this.frames -= 1;
      if ('end' in item) {
        this.result = item.end;
        return { done: true, value: item.end };
      }
      if ('key' in item.f) {
        this.lost = false;
        this.install(item.f.key);
      } else if (this.lost || this.frame.phase === undefined) {
        this.lost = true; // a delta against nothing: skip it, wait for a key
        if (this.frames === 0) {
          // Nothing drawable left in the queue. Hand back what we have if there
          // is anything, so the caller's pump is not stranded mid-`next`.
          if (this.frame.phase !== undefined) return { done: false, value: this.frame as unknown as LiveFrame };
          throw new Error('RemoteGame: no whole frame has arrived yet');
        }
        continue;
      } else {
        patch(this.frame as Json, item.f.delta);
      }
      return { done: false, value: this.frame as unknown as LiveFrame };
    }
  }

  /** A whole frame: every field replaced, and a NEW play object if it has one. */
  private install(key: Json): void {
    const src = key as Record<string, Json>;
    for (const k of Object.keys(this.frame)) if (!(k in src)) delete this.frame[k];
    Object.assign(this.frame, src);
    const play = this.frame.play as unknown as PlayState | null;
    if (play) {
      // The two things the projection left behind that a reader could ask for.
      play.geo = this.geo;
      play.cover = new Map();
    }
  }
}
