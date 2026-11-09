// ---------------------------------------------------------------------------
// An online match, from the first emoji to GOOD GAME: the room, the handshake,
// the draft's picks, the game's traffic, pause, rematch, and the channel going
// away. `App.ts` owns the screens; this owns the wire.
//
// ★ ONE SUBSCRIBER, FOR THE WHOLE MATCH. v1 gives each Phaser scene its own
// `onMessage` subscription and unsubscribes on shutdown, and every bug its
// online mode shipped with lived in a gap between two of them — a message that
// arrived while one scene was leaving and the next had not subscribed was
// simply gone (`docs/OVERVIEW.md` § Two-device online play). Here nothing
// subscribes but this object, it lives as long as the session does, and
// anything that arrives before its screen exists is KEPT: the friend's picks
// queue until a draft is listening, and game traffic queues inside the seat
// until `GameView` attaches.
//
// The session layer is v1's, shared and unmodified in shape (`src/net/peer.ts`
// — the only file that may import peerjs). It is imported LAZILY, so the front
// door does not pay for a WebRTC library until somebody opens the lobby.
// ---------------------------------------------------------------------------

import { NET } from '../../config';
import {
  PickCourier,
  RematchVote,
  classifyDraftPick,
  helloMismatch,
  type NetMsg,
} from '../../net/protocol';
import type { NetSession, NetStatus } from '../../net/peer';
import type { TeamIdentity } from '../../systems/team';
import { ROSTER } from '../../data/characters';
import { OnlineSeat } from './OnlineSeat';

/** The table rules. The host's win; the guest plays what it is told. */
export interface OnlineSettings {
  innings: number;
  venueId: string;
  night: boolean;
}

/** PLAY BALL, as the host says it. */
export interface OnlineStart {
  rosters: { away: string[]; home: string[] };
}

export type LobbyState =
  | { s: 'hosting'; code: string[] }
  | { s: 'finding' }
  | { s: 'failed'; why: 'no-friend' | 'version' | 'other-game' | 'offline' };

export interface OnlineHooks {
  /** The lobby has something new to show. */
  onLobby(state: LobbyState): void;
  /** Both devices know both teams' colours: the draft can begin. */
  onDraft(): void;
  /** The host says PLAY BALL (guest only). */
  onStart(start: OnlineStart): void;
  /** The friend paused or resumed. */
  onPause(paused: boolean): void;
  /** The channel dropped, came back, or is gone for good. */
  onStatus(status: NetStatus): void;
  /** The friend left on purpose. */
  onBye(): void;
  /** The play-again vote moved. */
  onRematch(vote: RematchVote): void;
  /** The draft diverged — a pick arrived that cannot follow ours. No blame. */
  onDesync(): void;
}

/**
 * How a room is opened. The default is the real thing, imported lazily; a test
 * hands in a fake channel so the handshake and the draft run with no WebRTC.
 */
export interface Dialler {
  host(): Promise<NetSession>;
  join(code: number[]): Promise<NetSession>;
}

const PEER: Dialler = {
  host: async () => (await import('../../net/peer')).hostSession(),
  join: async (code) => (await import('../../net/peer')).joinSession(code),
};

/** How often the heartbeat, staleness check and pick retransmit run, ms. */
const TICK_MS = 250;
const ROSTER_IDS = new Set(ROSTER.map((c) => c.id));

export class OnlineMatch {
  role: 'host' | 'guest' = 'host';
  /** Both teams' colours, agreed in the lobby. Away is always the host. */
  identities: { away: TeamIdentity; home: TeamIdentity } | null = null;
  settings: OnlineSettings;
  readonly vote = new RematchVote();
  seat: OnlineSeat = new OnlineSeat('host', () => {});

  private session: NetSession | null = null;
  private unsub: Array<() => void> = [];
  private ticker: ReturnType<typeof setInterval> | null = null;
  private courier = new PickCourier(NET.DRAFT_RESEND_MS);
  /** Picks applied so far by both sides — the next pick's number. */
  private picks = 0;
  /** The friend's picks nobody has taken yet, in order. */
  private pickQueue: string[] = [];
  private pickListener: ((id: string) => void) | null = null;
  private gotHello = false;
  private sentIdentity = false;
  private theirs: TeamIdentity | null = null;
  private wasLost = false;
  private left = false;

  constructor(
    private mine: TeamIdentity,
    settings: OnlineSettings,
    private readonly hooks: OnlineHooks,
    /** How many uniform colours there are, to step off a clash. */
    private readonly colourCount: number,
    private readonly dial: Dialler = PEER
  ) {
    this.settings = { ...settings };
  }

  // --- the room -------------------------------------------------------------

  /** Make a room and wait for a friend. */
  async host(): Promise<void> {
    this.role = 'host';
    try {
      this.adopt(await this.dial.host());
    } catch {
      this.hooks.onLobby({ s: 'failed', why: 'offline' });
      return;
    }
    this.hooks.onLobby({ s: 'hosting', code: this.session!.codeEmoji });
  }

  /** Join a friend's room by its four emoji (as `NET.CODE_EMOJI` indices). */
  async join(code: number[]): Promise<void> {
    this.role = 'guest';
    this.hooks.onLobby({ s: 'finding' });
    try {
      this.adopt(await this.dial.join(code));
    } catch {
      this.hooks.onLobby({ s: 'failed', why: 'no-friend' });
    }
  }

  private adopt(session: NetSession): void {
    if (this.left) {
      session.close();
      return;
    }
    this.session = session;
    this.seat = new OnlineSeat(this.role, (k, d) => this.session?.send({ t: 'v2', k, d }));
    this.unsub.push(session.onMessage((m) => this.onMessage(m)));
    this.unsub.push(session.onStatus((s) => this.onStatus(s)));
    // v2 has no Phaser clock for the session to ride; a timer is its tick.
    this.ticker = setInterval(() => this.tick(), TICK_MS);
    if (session.status() === 'connected') this.onStatus('connected');
  }

  private tick(): void {
    const now = performance.now();
    this.session?.tick(now);
    const again = this.courier.due(now);
    if (again) this.session?.send(again);
  }

  /** Leave, saying so. Safe to call twice, and before a room exists. */
  leave(): void {
    this.left = true;
    for (const un of this.unsub) un();
    this.unsub = [];
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
    this.session?.close();
    this.session = null;
  }

  // --- the draft -------------------------------------------------------------

  /** A fresh draft on this session (the first, or a rematch). */
  beginDraft(): void {
    this.courier = new PickCourier(NET.DRAFT_RESEND_MS);
    this.picks = 0;
    this.pickQueue = [];
    this.vote.reset();
    this.seat.reset();
  }

  /** Our pick: number it, send it, and keep sending until it is acknowledged. */
  sendPick(id: string): void {
    const pickNo = this.picks;
    this.picks += 1;
    this.session?.send({ t: 'draftPick', pickNo, charId: id });
    this.courier.arm(pickNo, id, performance.now());
  }

  /**
   * Hear the friend's picks. Any that arrived before the draft screen existed
   * are delivered now, in order — the gap v1 lost messages in.
   */
  onFriendPick(fn: (id: string) => void): () => void {
    this.pickListener = fn;
    for (const id of this.pickQueue.splice(0)) fn(id);
    return () => {
      if (this.pickListener === fn) this.pickListener = null;
    };
  }

  // --- the game --------------------------------------------------------------

  /** Host: PLAY BALL. Sent before the first frame, on the same ordered channel. */
  sendStart(start: OnlineStart): void {
    this.session?.send({ t: 'v2', k: 'start', d: start });
  }

  sendPause(paused: boolean): void {
    this.session?.send({ t: 'v2', k: paused ? 'pause' : 'resume' });
  }

  /** We tapped PLAY AGAIN. */
  voteRematch(): void {
    if (this.vote.voteMine()) this.session?.send({ t: 'rematch' });
    this.hooks.onRematch(this.vote);
  }

  get connected(): boolean {
    return this.session?.status() === 'connected';
  }

  // --- the wire --------------------------------------------------------------

  private onStatus(status: NetStatus): void {
    if (status === 'connected') {
      if (this.role === 'host' && !this.gotHello) {
        // The channel is up for the first time: the host leads.
        this.gotHello = true;
        this.session?.send({
          t: 'hello',
          version: NET.PROTOCOL_VERSION,
          mode: 'main',
          innings: this.settings.innings,
          venueId: this.settings.venueId,
          night: this.settings.night,
          game: 'v2',
        });
        this.session?.send({ t: 'identity', seat: 0, ...this.mine });
        this.sentIdentity = true;
      }
      if (this.wasLost) {
        this.wasLost = false;
        // Whatever was in flight when the channel dropped is gone: resend our
        // unacknowledged pick at once, and ask for a whole frame.
        this.courier.poke(performance.now());
        this.seat.askForKey();
      }
    } else if (status === 'reconnecting') {
      this.wasLost = true;
    }
    this.hooks.onStatus(status);
  }

  private onMessage(m: NetMsg): void {
    switch (m.t) {
      case 'hello': {
        if (this.role !== 'guest') return;
        const mismatch = helloMismatch(m, 'v2');
        if (mismatch) {
          this.hooks.onLobby({ s: 'failed', why: mismatch === 'game' ? 'other-game' : 'version' });
          this.leave();
          return;
        }
        this.settings = { innings: m.innings, venueId: m.venueId, night: m.night === true };
        this.gotHello = true;
        this.maybeSendIdentity();
        return;
      }
      case 'identity':
        this.theirs = { color: m.color, logo: m.logo };
        this.maybeSendIdentity();
        this.maybeDraft();
        return;
      case 'draftPick': {
        // Acknowledge HERE, duplicates included: the sender retransmits until
        // it hears this, long after any draft screen has gone.
        this.session?.send({ t: 'draftAck', pickNo: m.pickNo });
        this.courier.ackedBy(m);
        const kind = classifyDraftPick(m.pickNo, this.picks);
        if (kind === 'duplicate') return;
        if (kind === 'future' || !ROSTER_IDS.has(m.charId)) {
          this.hooks.onDesync();
          return;
        }
        this.picks += 1;
        if (this.pickListener) this.pickListener(m.charId);
        else this.pickQueue.push(m.charId);
        return;
      }
      case 'draftAck':
        this.courier.ackedBy(m);
        return;
      case 'rematch':
        this.vote.voteTheirs();
        this.hooks.onRematch(this.vote);
        return;
      case 'bye':
        this.hooks.onBye();
        return;
      case 'v2':
        this.onV2(m.k, m.d);
        return;
      default:
        return; // CLASSIC's traffic means nothing here
    }
  }

  private onV2(k: string, d: unknown): void {
    if (this.seat.handle(k, d)) return;
    if (k === 'pause') this.hooks.onPause(true);
    else if (k === 'resume') this.hooks.onPause(false);
    else if (k === 'start' && this.role === 'guest') {
      const start = sanitizeStart(d);
      if (start) this.hooks.onStart(start);
    }
  }

  /** Guest: reply once it knows the host's colours, stepping off a clash. */
  private maybeSendIdentity(): void {
    if (this.role !== 'guest' || this.sentIdentity || !this.gotHello || !this.theirs) return;
    if (this.mine.color === this.theirs.color) {
      this.mine = { ...this.mine, color: (this.mine.color + 1) % this.colourCount };
    }
    this.session?.send({ t: 'identity', seat: 1, ...this.mine });
    this.sentIdentity = true;
    this.maybeDraft();
  }

  private maybeDraft(): void {
    if (!this.theirs || !this.sentIdentity || this.identities) return;
    this.identities =
      this.role === 'host' ? { away: this.mine, home: this.theirs } : { away: this.theirs, home: this.mine };
    this.beginDraft();
    this.hooks.onDraft();
  }
}

/** Nine known kids a side, no kid twice — or it is not a start. */
function sanitizeStart(d: unknown): OnlineStart | null {
  const rosters = (d as { rosters?: { away?: unknown; home?: unknown } } | null)?.rosters;
  const team = (v: unknown): string[] | null =>
    Array.isArray(v) && v.length === 9 && v.every((id) => typeof id === 'string' && ROSTER_IDS.has(id))
      ? (v as string[])
      : null;
  const away = team(rosters?.away);
  const home = team(rosters?.home);
  if (!away || !home || new Set([...away, ...home]).size !== 18) return null;
  return { rosters: { away, home } };
}
