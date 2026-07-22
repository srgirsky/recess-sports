// ---------------------------------------------------------------------------
// Two-device play wire protocol — PURE (no Phaser, no peerjs; the only file
// allowed to import peerjs is net/peer.ts). Message types, encode/decode,
// sequencing, and the emoji room-code mapping.
//
// Design rules (see the deferred-items plan):
// - Hybrid protocol: semantic EVENTS for game beats, positions-only FRAMES
//   (ReplayFrame @ NET.FRAME_HZ) for live plays. Guests never simulate.
// - Every timing window resolves LOCALLY on the acting device — the wire
//   carries resolved bands/cursors/powers, never raw taps.
// - NO free text anywhere on the wire: identities travel as color/logo
//   indexes, all banter is local canned lines. (Kid-safety by construction.)
// - PeerJS ids must be alphanumeric, so the room id is 'recess-' + hex; the
//   emoji code kids exchange is a UI-only rendering of those hex digits.
// ---------------------------------------------------------------------------

import { NET, type GameMode, type PitchKind } from '../config';
import type { PlateLoc, PitchPlan } from '../systems/pitchkind';
import type { PitchBand } from '../systems/pitch';
import type { SwingBand, SwingType, AtBatResult, Launch } from '../systems/atbat';
import type { LineupPlan } from '../systems/lineup';
import type { RunnerMove } from '../systems/inning';
import type { ReplayFrame } from '../systems/replay';
import type { LiveEvent } from '../systems/liveplay';
import type { Vec, PositionId } from '../systems/geometry';

export type NetRole = 'host' | 'guest';

/** Everything the guest needs to mirror the HUD after a beat. */
export interface HudSnap {
  /** [away, home] = [seats[0], seats[1]] — positions, not roles. */
  scores: [number, number];
  outs: number;
  balls: number;
  strikes: number;
  /** charIds on 1B/2B/3B (null = empty). */
  bases: [string | null, string | null, string | null];
  lineupIdx: [number, number];
  batterId?: string;
  pitcherId?: string;
  juice: [number, number];
}

export type NetMsg =
  /** Connection handshake — the host's settings win; version must match. */
  | { t: 'hello'; version: number; mode: GameMode; innings: number; venueId: string }
  /** Team identity as INDEX PAIRS (color/logo) — never a free-text name. */
  | { t: 'identity'; seat: 0 | 1; color: number; logo: number }
  /** One draft pick; pickNo is the 0-based global pick counter (desync trip-wire). */
  | { t: 'draftPick'; pickNo: number; charId: string }
  /** Receiver→sender: draftPick #pickNo arrived (re-sent for duplicates). */
  | { t: 'draftAck'; pickNo: number }
  | { t: 'lineup'; seat: 0 | 1; plan: LineupPlan }
  /** Defender→host: the locally-timed mound result (kind/aim/meter band+error). */
  | { t: 'pitchPlan'; kind: PitchKind; target: PlateLoc; band: PitchBand; errorMs: number }
  /** Host→guest: start the local ball-flight ceremony. */
  | { t: 'pitchLaunch'; wild: boolean; travelMs: number; plan?: PitchPlan; stealFrom?: 1 | 2 }
  /** Batter→host: the locally-resolved swing (main: errorMs+cursor; kid: band). */
  | { t: 'swing'; errorMs?: number; cursor?: PlateLoc; band?: SwingBand; swingType: SwingType; spend?: 'powerSwing' }
  /** Host→guest: a settled (non-live) at-bat plus the baserunning ceremony. */
  | { t: 'atBat'; result: AtBatResult; movements: RunnerMove[]; hud: HudSnap }
  /** Host→guest: a live play just launched — everything the view needs. */
  | {
      t: 'liveStart';
      mode: 'defense' | 'offense';
      launch: Launch;
      assignment: Array<{ position: PositionId; charId: string }>;
      batter: { charId: string; speed: number };
      baseRunners: Array<{ base: 1 | 2 | 3; charId: string; speed: number }>;
      outs: number;
      frame: ReplayFrame;
    }
  /** Host→guest, @ NET.FRAME_HZ: full positions snapshot (<1 KB; no deltas). */
  | { t: 'liveFrame'; frame: ReplayFrame }
  /** Host→guest: this tick's sim events, batched (view verbs on arrival). */
  | { t: 'liveEvents'; events: LiveEvent[] }
  /** Remote seat→host: live-play intents, injected through the verify hooks. */
  | {
      t: 'liveInput';
      pointer?: Vec;
      pointerActive?: boolean;
      dive?: boolean;
      throwTo?: { base: 1 | 2 | 3 | 4; power: number };
      run?: boolean;
      send?: string;
      hold?: string;
      /** Steal-race reaction time (ms) measured on the defender's device. */
      stealTap?: number;
    }
  /** Host→remote defender: a steal race armed — show the 🚨 TAP prompt. */
  | { t: 'stealRace'; from: 1 | 2 }
  /** Host→guest: the current moment settled; `next` names the following beat. */
  | { t: 'settle'; hud: HudSnap; next: 'pitch' | 'batter' | 'half' | 'gameOver' }
  | { t: 'half'; inning: number; half: 'top' | 'bottom'; hud: HudSnap }
  | { t: 'gameOver'; hud: HudSnap }
  | { t: 'pause' }
  | { t: 'resume'; hud: HudSnap }
  | { t: 'bye' };

/** Every legal msg kind — decode() rejects anything else. */
const MSG_KINDS = new Set<string>([
  'hello',
  'identity',
  'draftPick',
  'draftAck',
  'lineup',
  'pitchPlan',
  'pitchLaunch',
  'swing',
  'atBat',
  'liveStart',
  'liveFrame',
  'liveEvents',
  'liveInput',
  'stealRace',
  'settle',
  'half',
  'gameOver',
  'pause',
  'resume',
  'bye',
]);

export interface Envelope {
  seq: number;
  msg: NetMsg;
}

export function encode(seq: number, msg: NetMsg): string {
  return JSON.stringify({ seq, msg });
}

/**
 * Validating parse: returns null for anything that isn't a well-formed
 * envelope carrying a known message kind. Payload fields are trusted beyond
 * shape — both ends run the same build (hello gates the version), and the
 * protocol carries no free text by design.
 */
export function decode(raw: unknown): Envelope | null {
  if (typeof raw !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const env = parsed as { seq?: unknown; msg?: unknown };
  if (typeof env.seq !== 'number' || !Number.isFinite(env.seq)) return null;
  if (typeof env.msg !== 'object' || env.msg === null) return null;
  const t = (env.msg as { t?: unknown }).t;
  if (typeof t !== 'string' || !MSG_KINDS.has(t)) return null;
  return { seq: env.seq, msg: env.msg as NetMsg };
}

/** Does a received hello speak our protocol version? */
export function helloCompatible(msg: NetMsg & { t: 'hello' }): boolean {
  return msg.version === NET.PROTOCOL_VERSION;
}

/**
 * Per-direction sequence bookkeeping. Senders number outgoing envelopes
 * 1, 2, 3…; receivers drop duplicates and stale arrivals (the DataChannel is
 * ordered+reliable, so these only appear across a reconnect replay).
 */
export class Sequencer {
  private outSeq = 0;
  private lastIn = 0;

  nextSeq(): number {
    this.outSeq += 1;
    return this.outSeq;
  }

  accept(env: Envelope): 'ok' | 'duplicate' | 'stale' {
    if (env.seq > this.lastIn) {
      this.lastIn = env.seq;
      return 'ok';
    }
    return env.seq === this.lastIn ? 'duplicate' : 'stale';
  }
}

// --- Draft-pick reliability --------------------------------------------------
// draftPick is the one message whose loss deadlocks a whole flow (both sides
// sit at "FRIEND'S PICK…" forever), and send() drops silently while the
// channel is down — so picks get an ack + retransmit layer. Retransmits carry
// FRESH envelope seqs (the Sequencer can't dedupe them); dedupe happens at
// the pickNo level via classifyDraftPick.

/**
 * Sender-side ack/retransmit state for the one in-flight draftPick (picks
 * strictly alternate, so at most one of ours is ever unacked). Time is passed
 * in — pure, clock-agnostic, driven from the scene's update().
 */
export class PickCourier {
  private pending?: { pickNo: number; charId: string };
  private nextDue = 0;

  constructor(private resendMs: number) {}

  /** Arm after the first send of our pick. */
  arm(pickNo: number, charId: string, now: number): void {
    this.pending = { pickNo, charId };
    this.nextDue = now + this.resendMs;
  }

  /** Clears on a matching draftAck OR a later incoming draftPick (implicit ack). */
  ackedBy(msg: NetMsg): boolean {
    if (!this.pending) return false;
    const acked =
      (msg.t === 'draftAck' && msg.pickNo === this.pending.pickNo) ||
      (msg.t === 'draftPick' && msg.pickNo > this.pending.pickNo);
    if (acked) this.pending = undefined;
    return acked;
  }

  /** The draftPick to resend if the timer elapsed (re-arms it), else null. */
  due(now: number): NetMsg | null {
    if (!this.pending || now < this.nextDue) return null;
    this.nextDue = now + this.resendMs;
    return { t: 'draftPick', pickNo: this.pending.pickNo, charId: this.pending.charId };
  }

  /** Force the next due() to fire immediately (used on reconnect). */
  poke(now: number): void {
    if (this.pending) this.nextDue = now;
  }

  unacked(): boolean {
    return this.pending !== undefined;
  }
}

/**
 * Receiver-side classification of an incoming draftPick against the count of
 * picks already applied: duplicates are re-acked and ignored; only a pick
 * from the FUTURE is a true desync (the loud-abort case).
 */
export function classifyDraftPick(pickNo: number, applied: number): 'duplicate' | 'expected' | 'future' {
  if (pickNo < applied) return 'duplicate';
  return pickNo === applied ? 'expected' : 'future';
}

/** The transport seam peer.ts implements and tests fake. */
export interface Transport {
  send(raw: string): void;
  onMessage(cb: (raw: string) => void): void;
  onClose(cb: () => void): void;
}

// --- Emoji room codes ------------------------------------------------------
// 16 emoji = one hex digit each; kids exchange 4 pictures, the wire sees
// 'recess-' + 4 hex chars (PeerJS ids must be alphanumeric).

export function emojiToRoomId(indices: number[]): string {
  const hex = indices.map((i) => (i & 0xf).toString(16)).join('');
  return `recess-${hex}`;
}

/** Room id → the emoji to display, or null if it isn't one of ours. */
export function roomIdToEmoji(id: string): string[] | null {
  const m = /^recess-([0-9a-f]+)$/.exec(id);
  if (!m || m[1].length !== NET.CODE_LEN) return null;
  return [...m[1]].map((c) => NET.CODE_EMOJI[parseInt(c, 16)]);
}

/** Roll a fresh room code (rng injected — the app's rng discipline). */
export function rollRoomCode(rng: () => number): number[] {
  return Array.from({ length: NET.CODE_LEN }, () => Math.floor(rng() * NET.CODE_EMOJI.length) & 0xf);
}
