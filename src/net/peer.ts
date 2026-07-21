// ---------------------------------------------------------------------------
// The PeerJS session layer — the ONLY file in the project allowed to import
// peerjs. Connect/host/join over the free PeerJS cloud broker (no backend,
// no keys — the site stays a pure static deploy), envelope + sequencing via
// net/protocol.ts, heartbeat/staleness on the PHASER clock (tick(now) is
// called from active scenes' update(), so the headless pump drives it), and
// reconnect on WALL-CLOCK timers (it must keep working while Phaser is
// paused under the "Looking for your friend… 🔍" overlay).
//
// Lifecycle: a module-level singleton (precedent: venue.ts/mode.ts module
// state). Created by LobbyScene; read anywhere via activeSession(); every
// scene that subscribes MUST unsubscribe on its shutdown event; torn down by
// ResultScene exit, the reconnect timeout, and defensively by
// SchoolyardScene.create().
// ---------------------------------------------------------------------------

import Peer, { type DataConnection } from 'peerjs';
import { NET } from '../config';
import {
  encode,
  decode,
  Sequencer,
  emojiToRoomId,
  rollRoomCode,
  type NetMsg,
  type NetRole,
} from './protocol';

export type NetStatus = 'connected' | 'reconnecting' | 'gone';

export interface NetSession {
  role: NetRole;
  /** The room code as display emoji (host shows it; guest typed it). */
  codeEmoji: string[];
  /** The wire id ('recess-' + hex) — exposed for the headless E2E driver. */
  roomId: string;
  send(msg: NetMsg): void;
  /** Subscribe to decoded, sequence-accepted messages. Returns unsubscribe. */
  onMessage(cb: (msg: NetMsg) => void): () => void;
  /** Subscribe to channel status changes. Returns unsubscribe. */
  onStatus(cb: (s: NetStatus) => void): () => void;
  status(): NetStatus;
  /** Heartbeat + staleness, ridden on the Phaser clock — call from update(). */
  tick(nowMs: number): void;
  /** bye + teardown. Idempotent. */
  close(): void;
}

let session: NetSession | undefined;

export function activeSession(): NetSession | undefined {
  return session;
}

export function dropSession(): void {
  session?.close();
  session = undefined;
}

/** The raw heartbeat payload — decode() rejects it, traffic tracking sees it. */
const HEARTBEAT_RAW = '"hb"';

class Session implements NetSession {
  codeEmoji: string[];
  roomId: string;
  private conn?: DataConnection;
  private sequencer = new Sequencer();
  private msgCbs = new Set<(msg: NetMsg) => void>();
  private statusCbs = new Set<(s: NetStatus) => void>();
  private cur: NetStatus = 'reconnecting';
  private trafficPending = false;
  private lastRecvTick = -Infinity;
  private lastSendTick = -Infinity;
  private everConnected = false;
  private goneTimer?: ReturnType<typeof setTimeout>;
  private redialTimer?: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(
    public role: NetRole,
    private peer: Peer,
    codeIndices: number[]
  ) {
    this.roomId = emojiToRoomId(codeIndices);
    this.codeEmoji = codeIndices.map((i) => NET.CODE_EMOJI[i]);
    if (role === 'host') {
      // The host's peer stays open all game: a fresh connection (initial OR
      // a guest re-dial after a drop) simply replaces the channel.
      peer.on('connection', (conn) => this.attach(conn));
    }
    // Broker drop ≠ channel drop: the data channel is peer-to-peer and keeps
    // flowing; reconnect the broker link so re-dials stay possible.
    peer.on('disconnected', () => {
      if (!this.closed && !peer.destroyed) peer.reconnect();
    });
  }

  attach(conn: DataConnection): void {
    this.conn?.close();
    this.conn = conn;
    const onOpen = () => {
      this.everConnected = true;
      this.stopRecovery();
      this.setStatus('connected');
    };
    if (conn.open) onOpen();
    else conn.on('open', onOpen);
    conn.on('data', (raw) => {
      this.trafficPending = true;
      const env = decode(raw);
      if (!env) return; // heartbeats and junk stop here
      if (this.sequencer.accept(env) !== 'ok') return;
      for (const cb of this.msgCbs) cb(env.msg);
    });
    const lost = () => {
      if (this.closed || this.conn !== conn) return;
      this.beginRecovery();
    };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  private setStatus(s: NetStatus): void {
    if (this.cur === s) return;
    this.cur = s;
    for (const cb of this.statusCbs) cb(s);
  }

  status(): NetStatus {
    return this.cur;
  }

  /** Channel lost: wall-clock recovery — Phaser may be frozen under Pause. */
  private beginRecovery(): void {
    if (this.closed || this.goneTimer) return;
    this.setStatus('reconnecting');
    this.goneTimer = setTimeout(() => {
      this.setStatus('gone');
      this.close();
    }, NET.RECONNECT_MS);
    if (this.role === 'guest') {
      // Re-dial the same room until the host answers or the window closes.
      this.redialTimer = setInterval(() => {
        if (this.closed || this.peer.destroyed) return;
        try {
          this.attach(this.peer.connect(this.roomId, { reliable: true }));
        } catch {
          /* next interval retries */
        }
      }, 2500);
    }
  }

  private stopRecovery(): void {
    if (this.goneTimer) clearTimeout(this.goneTimer);
    this.goneTimer = undefined;
    if (this.redialTimer) clearInterval(this.redialTimer);
    this.redialTimer = undefined;
  }

  send(msg: NetMsg): void {
    if (!this.conn?.open) return; // reconnect resyncs via a full snapshot
    this.conn.send(encode(this.sequencer.nextSeq(), msg));
    this.lastSendTick = this.lastTick;
  }

  private lastTick = 0;

  tick(nowMs: number): void {
    this.lastTick = nowMs;
    if (this.trafficPending) {
      this.trafficPending = false;
      this.lastRecvTick = nowMs;
    }
    if (!this.conn?.open) return;
    if (nowMs - this.lastSendTick >= NET.HEARTBEAT_MS) {
      this.conn.send(HEARTBEAT_RAW);
      this.lastSendTick = nowMs;
    }
    // Soft disconnect: a throttled background tab stops sending heartbeats,
    // so the healthy side trips this and enters the same recovery path.
    if (this.everConnected && nowMs - this.lastRecvTick > NET.STALE_MS && this.cur === 'connected') {
      this.beginRecovery();
    }
  }

  onMessage(cb: (msg: NetMsg) => void): () => void {
    this.msgCbs.add(cb);
    return () => this.msgCbs.delete(cb);
  }

  onStatus(cb: (s: NetStatus) => void): () => void {
    this.statusCbs.add(cb);
    return () => this.statusCbs.delete(cb);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.conn?.open) this.conn.send(encode(this.sequencer.nextSeq(), { t: 'bye' }));
    } catch {
      /* going down anyway */
    }
    this.stopRecovery();
    this.conn?.close();
    this.peer.destroy();
    if (session === this) session = undefined;
  }
}

/** Create a room: claim a fresh emoji code on the broker, then wait for a guest. */
export function hostSession(rng: () => number = Math.random, retries = 4): Promise<NetSession> {
  return new Promise((resolve, reject) => {
    const code = rollRoomCode(rng);
    const peer = new Peer(emojiToRoomId(code));
    peer.on('open', () => {
      const s = new Session('host', peer, code);
      session = s;
      resolve(s);
    });
    peer.on('error', (err: Error & { type?: string }) => {
      if (err.type === 'unavailable-id' && retries > 0) {
        peer.destroy();
        resolve(hostSession(rng, retries - 1)); // fresh code, fresh try
      } else if (!session) {
        peer.destroy();
        reject(err);
      }
    });
  });
}

/** Join a room by its 4-emoji code (as CODE_EMOJI indices). */
export function joinSession(codeIndices: number[]): Promise<NetSession> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(); // broker-assigned id for the guest
    peer.on('open', () => {
      const s = new Session('guest', peer, codeIndices);
      session = s;
      const conn = peer.connect(s.roomId, { reliable: true });
      const fail = setTimeout(() => {
        if (s.status() !== 'connected') {
          dropSession();
          reject(new Error('join-timeout'));
        }
      }, 15000);
      const un = s.onStatus((st) => {
        if (st === 'connected') {
          clearTimeout(fail);
          un();
          resolve(s);
        }
      });
      s.attach(conn);
    });
    peer.on('error', (err: Error & { type?: string }) => {
      if (!session) {
        peer.destroy();
        reject(err);
      }
    });
  });
}
