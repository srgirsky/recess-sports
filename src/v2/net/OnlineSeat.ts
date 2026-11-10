// ---------------------------------------------------------------------------
// One device's end of an online game: what `GameView` talks to instead of the
// network. No peerjs, no DOM, no three — it is handed a `send` function, so two
// of them wired back to back are a whole online game in a unit test.
//
// The shape (`frameWire.ts` has the why): the HOST is the visitors, runs the
// one sim and streams every frame and event; the GUEST is the home side, pumps
// a `RemoteGame`, and sends back nothing but its own verbs.
//
// ★ EVERY TIMING WINDOW RESOLVES ON THE DEVICE THAT ACTS — v1's rule, and v2
// gets it almost for free. A swing is not "now", it is `atSec`, seconds into
// the pitch's flight on the batter's own screen; a throw down likewise. So the
// guest's tap is judged against the pitch the guest SAW, however long the
// message took. What latency costs instead is a short wait: the host holds a
// pitch it has finished drawing until the guest says its own window has closed
// (`windowDone`), or `NET_GRACE_SEC` runs out and the kid's own read stands.
//
// The guest's verbs are never trusted: they are rebuilt field by field
// (`sanitizeInputs`) and admitted only for the role the guest holds this half
// (`joinInputs`).
// ---------------------------------------------------------------------------

import type { GameResult, LiveFrame, SimEvent } from '../sim/game';
import type { PlayInputs } from '../sim/play';
import type { FieldGeometry } from '../sim/field';
import type { Json } from './jsonDelta';
import { FrameEncoder, RemoteGame, type FrameMsg } from './frameWire';
import { joinInputs, sanitizeInputs, type Side } from './inputWire';

/** How long the host waits past its own clock for the guest's answer, seconds. */
export const NET_GRACE_SEC = 1.5;
/** The guest's steering pointer is streamed no faster than this, ms. */
export const POINTER_SEND_MS = 50;

/** Things one device shows because the other device's kid did something. */
export type Cue =
  /** The pitcher has started his delivery (host → guest). */
  | { c: 'delivery' }
  /** The batter swung (host → guest; the guest's own swing is an input). */
  | { c: 'swing'; bunt?: boolean };

export type SeatSend = (k: string, d?: unknown) => void;

/** The verbs that are one event each: sent once, cleared by the next advance. */
const ONE_SHOTS = ['dive', 'throwTo', 'sendRunner', 'holdRunner', 'swing', 'pitch', 'throwDown', 'pickoff'] as const;

export class OnlineSeat {
  /** Host: the guest's verbs, waiting for the sim to read them. */
  readonly remote: PlayInputs = {};
  /** Host: the phase whose window the guest's own clock has closed, if any. */
  remoteDone: 'windup' | 'pitch' | null = null;
  /** Guest: the host's game. */
  game: RemoteGame | null = null;
  /** Told when the other device's kid does something this one must draw. */
  onCue: (cue: Cue) => void = () => {};

  private readonly encoder = new FrameEncoder();
  private lastKey: Json | null = null;
  private readonly sent = new Set<string>();
  private lastSteal = false;
  private lastSpend: string | undefined;
  private lastShift: string | undefined;
  private lastPointer: { x: number; z: number } | null = null;
  private lastPointerAt = -Infinity;
  private windowSent: 'windup' | 'pitch' | null = null;
  private keyAsked = false;
  /** Guest: game traffic that arrived before `GameView` attached. */
  private backlog: Array<[string, unknown]> = [];

  constructor(
    readonly role: 'host' | 'guest',
    private readonly send: SeatSend
  ) {}

  /** The host is the visitors; the guest is at home. */
  get side(): Side {
    return this.role === 'host' ? 'away' : 'home';
  }

  // --- host ----------------------------------------------------------------

  /** What the generator reads this tick: both kids' verbs, each cut to its role. */
  join(half: 'top' | 'bottom' | undefined, mine: PlayInputs): PlayInputs {
    return half ? joinInputs(half, mine, this.side, this.remote) : {};
  }

  /**
   * The sim has read this tick's inputs. One-shots are spent; steering lasts
   * while the play does; a toggle lasts until the windup that reads it — the
   * same three lifetimes `GameView.advance` gives the local player's.
   */
  consumed(wasWindup: boolean, stillLive: boolean): void {
    for (const k of ONE_SHOTS) delete this.remote[k];
    if (!stillLive) delete this.remote.pointer;
    if (wasWindup) {
      delete this.remote.spend;
      delete this.remote.steal;
    }
    this.remoteDone = null;
  }

  sendEvent(e: SimEvent): void {
    if (this.role === 'host') this.send('e', e);
  }

  sendFrame(frame: LiveFrame): void {
    if (this.role !== 'host') return;
    const msg = this.encoder.encode(frame);
    this.lastKey = 'key' in msg ? msg.key : null;
    this.send('f', msg);
  }

  sendEnd(result: GameResult): void {
    if (this.role === 'host') this.send('end', result);
  }

  sendCue(cue: Cue): void {
    if (this.role === 'host') this.send('cue', cue);
  }

  /** A new game on the same seat: nothing of the last one may leak into it. */
  reset(): void {
    this.encoder.reset();
    this.lastKey = null;
    for (const k of Object.keys(this.remote)) delete this.remote[k as keyof PlayInputs];
    this.remoteDone = null;
    this.sent.clear();
    this.lastSteal = false;
    this.lastSpend = undefined;
    this.lastShift = undefined;
    this.lastPointer = null;
    this.windowSent = null;
    this.keyAsked = false;
    this.game = null;
    this.backlog = [];
  }

  // --- guest ---------------------------------------------------------------

  /** Start receiving a game. Returns what `GameView` pumps in the sim's place. */
  attach(geo: FieldGeometry, onEvent: (e: SimEvent) => void): RemoteGame {
    this.game = new RemoteGame(geo, onEvent);
    // The host starts sending the instant it says PLAY BALL, and this device
    // was still dressing eighteen kids: nothing it sent meanwhile is lost.
    for (const [k, d] of this.backlog.splice(0)) this.handle(k, d);
    return this.game;
  }

  /**
   * Send whatever the guest has newly asked for. Called every pump step; a
   * one-shot goes out once however many steps it stays set, a toggle goes out
   * when it CHANGES (so "call the steal off" travels too), and the steering
   * pointer is throttled.
   */
  flush(inputs: PlayInputs, nowMs: number): void {
    if (this.role !== 'guest') return;
    const out: Record<string, unknown> = {};
    for (const k of ONE_SHOTS) {
      const v = inputs[k];
      if (v === undefined) this.sent.delete(k);
      else if (!this.sent.has(k)) {
        this.sent.add(k);
        out[k] = v;
      }
    }
    const steal = inputs.steal === true;
    if (steal !== this.lastSteal) {
      this.lastSteal = steal;
      out.steal = steal;
    }
    if (inputs.spend !== this.lastSpend) {
      this.lastSpend = inputs.spend;
      if (inputs.spend) out.spend = inputs.spend;
    }
    if (inputs.shift !== this.lastShift) {
      this.lastShift = inputs.shift;
      if (inputs.shift) out.shift = inputs.shift;
    }
    const p = inputs.pointer;
    if (!p) this.lastPointer = null;
    else if (
      (!this.lastPointer || this.lastPointer.x !== p.x || this.lastPointer.z !== p.z) &&
      nowMs - this.lastPointerAt >= POINTER_SEND_MS
    ) {
      this.lastPointer = { x: p.x, z: p.z };
      this.lastPointerAt = nowMs;
      out.pointer = this.lastPointer;
    }
    if (Object.keys(out).length > 0) this.send('in', out);
  }

  /**
   * Our clock closed this windup or pitch: the host need not wait any longer.
   * Named by phase, because the word can land after the host has moved on, and
   * a late "my windup is over" must not read as "my swing window is over".
   */
  windowDone(phase: 'windup' | 'pitch'): void {
    if (this.role !== 'guest' || this.windowSent === phase) return;
    this.windowSent = phase;
    this.send('wd', phase);
  }

  /** A new windup or pitch frame is up: its window may be closed once. */
  windowOpened(): void {
    this.windowSent = null;
  }

  /** Ask the host for a whole frame (we re-joined, or lost our base). Once. */
  askForKey(): void {
    if (this.role !== 'guest' || this.keyAsked) return;
    this.keyAsked = true;
    this.send('key');
  }

  // --- both ----------------------------------------------------------------

  /** Game traffic from the other device. False if `k` is not ours to handle. */
  handle(k: string, d: unknown): boolean {
    if (this.role === 'host') {
      if (k === 'in') {
        const clean = sanitizeInputs(d);
        Object.assign(this.remote, clean);
        if (typeof d === 'object' && d !== null && (d as { steal?: unknown }).steal === false) {
          delete this.remote.steal;
        }
        if (clean.swing) this.onCue({ c: 'swing', bunt: clean.swing.bunt });
        return true;
      }
      if (k === 'wd') {
        if (d === 'windup' || d === 'pitch') this.remoteDone = d;
        return true;
      }
      if (k === 'key') {
        // Whole frames are the resync points; hand over the last one and let
        // the next tick's delta land on it. Mid-play there is no whole frame
        // to hand over, so force the next one out whole instead.
        if (this.lastKey !== null) this.send('f', { key: this.lastKey } satisfies FrameMsg);
        else this.encoder.reset();
        return true;
      }
      return false;
    }
    if (!this.game) {
      if (k === 'f' || k === 'e' || k === 'end') this.backlog.push([k, d]);
      return k === 'f' || k === 'e' || k === 'end' || k === 'cue';
    }
    if (k === 'f') {
      const msg = d as FrameMsg;
      if (msg && typeof msg === 'object' && ('key' in msg || 'delta' in msg)) {
        if ('key' in msg) this.keyAsked = false;
        this.game.pushFrame(msg);
      }
      return true;
    }
    if (k === 'e') {
      this.game.pushEvent(d as SimEvent);
      return true;
    }
    if (k === 'end') {
      this.game.pushEnd(d as GameResult);
      return true;
    }
    if (k === 'cue') {
      const cue = d as Cue;
      if (cue && (cue.c === 'delivery' || cue.c === 'swing')) this.onCue(cue);
      return true;
    }
    return false;
  }
}
