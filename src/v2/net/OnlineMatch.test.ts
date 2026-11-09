// ---------------------------------------------------------------------------
// Two matches on a fake channel: the handshake, the draft's picks, PLAY BALL
// and the rematch vote, with no WebRTC anywhere. The channel is the same
// envelope + Sequencer the real session uses, so what is exercised here is the
// protocol the devices actually speak.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NET } from '../../config';
import type { NetMsg } from '../../net/protocol';
import type { NetSession, NetStatus } from '../../net/peer';
import { ROSTER } from '../../data/characters';
import { OnlineMatch, type LobbyState, type OnlineHooks, type OnlineStart } from './OnlineMatch';

const IDS = ROSTER.map((c) => c.id);
const last = <T>(a: T[]): T | undefined => a[a.length - 1];

/** One end of a fake channel. `drop` loses the next message it is asked to send. */
class FakeSession implements NetSession {
  codeEmoji = ['🐶', '🐱', '🦊', '🐸'];
  roomId = 'recess-0123';
  peer: FakeSession | null = null;
  inbox: NetMsg[] = [];
  sent: NetMsg[] = [];
  dropNext = 0;
  closed = false;
  private msgCbs = new Set<(m: NetMsg) => void>();
  private statusCbs = new Set<(s: NetStatus) => void>();
  private cur: NetStatus = 'reconnecting';

  constructor(public role: 'host' | 'guest') {}

  send(msg: NetMsg): void {
    if (this.closed) return;
    this.sent.push(msg);
    if (this.dropNext > 0) {
      this.dropNext -= 1;
      return;
    }
    // Through JSON, as the data channel would.
    this.peer?.inbox.push(JSON.parse(JSON.stringify(msg)) as NetMsg);
  }
  /** Deliver everything waiting, including replies raised while delivering. */
  flush(): void {
    for (let guard = 0; guard < 1000 && this.inbox.length > 0; guard++) {
      const m = this.inbox.shift()!;
      for (const cb of this.msgCbs) cb(m);
    }
  }
  onMessage(cb: (m: NetMsg) => void): () => void {
    this.msgCbs.add(cb);
    return () => this.msgCbs.delete(cb);
  }
  onStatus(cb: (s: NetStatus) => void): () => void {
    this.statusCbs.add(cb);
    return () => this.statusCbs.delete(cb);
  }
  status(): NetStatus {
    return this.cur;
  }
  setStatus(s: NetStatus): void {
    this.cur = s;
    for (const cb of this.statusCbs) cb(s);
  }
  tick(): void {}
  close(): void {
    if (this.closed) return;
    this.send({ t: 'bye' });
    this.closed = true;
  }
}

interface Seen {
  lobby: LobbyState[];
  drafts: number;
  starts: OnlineStart[];
  status: NetStatus[];
  byes: number;
  desyncs: number;
  pauses: boolean[];
}

function device(role: 'host' | 'guest', colour: number) {
  const session = new FakeSession(role);
  const seen: Seen = { lobby: [], drafts: 0, starts: [], status: [], byes: 0, desyncs: 0, pauses: [] };
  const hooks: OnlineHooks = {
    onLobby: (s) => seen.lobby.push(s),
    onDraft: () => (seen.drafts += 1),
    onStart: (s) => seen.starts.push(s),
    onPause: (p) => seen.pauses.push(p),
    onStatus: (s) => seen.status.push(s),
    onBye: () => (seen.byes += 1),
    onDesync: () => (seen.desyncs += 1),
    onRematch: () => {},
  };
  const match = new OnlineMatch(
    { color: colour, logo: 0 },
    { innings: role === 'host' ? 3 : 1, venueId: role === 'host' ? 'sandbox' : 'park', night: role === 'host' },
    hooks,
    7,
    { host: async () => session, join: async () => session }
  );
  return { session, seen, match };
}

/** A host and a guest, connected and through the handshake. */
async function connected(hostColour = 5, guestColour = 2) {
  const h = device('host', hostColour);
  const g = device('guest', guestColour);
  h.session.peer = g.session;
  g.session.peer = h.session;
  await h.match.host();
  await g.match.join([0, 1, 2, 3]);
  h.session.setStatus('connected');
  g.session.setStatus('connected');
  const pump = () => {
    for (let i = 0; i < 20; i++) {
      h.session.flush();
      g.session.flush();
    }
  };
  pump();
  return { h, g, pump };
}

describe('the handshake', () => {
  it('★ the host’s table rules win, and both devices agree who wears what', async () => {
    const { h, g } = await connected(5, 2);
    expect(h.seen.lobby[0]).toEqual({ s: 'hosting', code: ['🐶', '🐱', '🦊', '🐸'] });
    expect(g.seen.lobby[0]).toEqual({ s: 'finding' });
    expect(h.seen.drafts).toBe(1);
    expect(g.seen.drafts).toBe(1);
    expect(g.match.settings).toEqual({ innings: 3, venueId: 'sandbox', night: true });
    expect(h.match.identities).toEqual({ away: { color: 5, logo: 0 }, home: { color: 2, logo: 0 } });
    expect(g.match.identities).toEqual(h.match.identities);
  });

  it('a guest in the host’s colour steps off it, so the teams can be told apart', async () => {
    const { h, g } = await connected(6, 6);
    expect(h.match.identities!.away.color).toBe(6);
    expect(h.match.identities!.home.color).toBe(0); // 6 + 1, wrapped over 7 colours
    expect(g.match.identities).toEqual(h.match.identities);
  });

  it('★ says hello as v2 — so a CLASSIC device hears it is the other game', async () => {
    const { h } = await connected();
    const hello = h.session.sent.find((m) => m.t === 'hello') as NetMsg & { t: 'hello' };
    expect(hello).toMatchObject({ game: 'v2', version: NET.PROTOCOL_VERSION });
  });

  it('★ a guest that dialled a CLASSIC room is told so and leaves', async () => {
    const g = device('guest', 1);
    const classic = new FakeSession('host');
    g.session.peer = classic;
    classic.peer = g.session;
    await g.match.join([0, 1, 2, 3]);
    classic.send({ t: 'hello', version: NET.PROTOCOL_VERSION, mode: 'kid', innings: 1, venueId: 'park' });
    g.session.flush();
    expect(last(g.seen.lobby)).toEqual({ s: 'failed', why: 'other-game' });
    expect(g.session.closed).toBe(true);
    expect(g.seen.drafts).toBe(0);
  });

  it('a stale build is a version problem, not the other game', async () => {
    const g = device('guest', 1);
    const old = new FakeSession('host');
    g.session.peer = old;
    old.peer = g.session;
    await g.match.join([0, 1, 2, 3]);
    old.send({ t: 'hello', version: NET.PROTOCOL_VERSION - 1, mode: 'main', innings: 1, venueId: 'park', game: 'v2' });
    g.session.flush();
    expect(last(g.seen.lobby)).toEqual({ s: 'failed', why: 'version' });
  });

  it('a room that cannot be reached fails the lobby, not the page', async () => {
    const seen: LobbyState[] = [];
    const hooks = { onLobby: (s: LobbyState) => seen.push(s) } as unknown as OnlineHooks;
    const fail = async (): Promise<NetSession> => {
      throw new Error('join-timeout');
    };
    const m = new OnlineMatch({ color: 0, logo: 0 }, { innings: 1, venueId: 'park', night: false }, hooks, 7, {
      host: fail,
      join: fail,
    });
    await m.join([0, 0, 0, 0]);
    expect(last(seen)).toEqual({ s: 'failed', why: 'no-friend' });
    await m.host();
    expect(last(seen)).toEqual({ s: 'failed', why: 'offline' });
  });
});

describe('the draft on the wire', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('★ picks made before the draft screen is listening are kept, in order', async () => {
    const { h, g, pump } = await connected();
    h.match.sendPick(IDS[0]);
    pump();
    // Nobody on the guest has subscribed yet — v1 lost exactly this message.
    const heard: string[] = [];
    g.match.onFriendPick((id) => heard.push(id));
    expect(heard).toEqual([IDS[0]]);
    g.match.sendPick(IDS[1]);
    pump();
    const hostHeard: string[] = [];
    h.match.onFriendPick((id) => hostHeard.push(id));
    expect(hostHeard).toEqual([IDS[1]]);
  });

  it('★ a lost pick is sent again until it is acknowledged, and applied once', async () => {
    const { h, g, pump } = await connected();
    const heard: string[] = [];
    g.match.onFriendPick((id) => heard.push(id));
    h.session.dropNext = 1;
    h.match.sendPick(IDS[4]);
    pump();
    expect(heard).toEqual([]);
    vi.advanceTimersByTime(NET.DRAFT_RESEND_MS + 400);
    pump();
    expect(heard).toEqual([IDS[4]]);
    // Acknowledged now: no further copies however long we wait.
    const picksSent = () => h.session.sent.filter((m) => m.t === 'draftPick').length;
    const after = picksSent();
    vi.advanceTimersByTime(NET.DRAFT_RESEND_MS * 4);
    pump();
    expect(picksSent()).toBe(after);
    expect(heard).toEqual([IDS[4]]);
  });

  it('a lost ACK costs a duplicate pick on the wire and nothing on the board', async () => {
    const { h, g, pump } = await connected();
    const heard: string[] = [];
    g.match.onFriendPick((id) => heard.push(id));
    h.match.sendPick(IDS[2]);
    h.session.flush(); // nothing yet
    g.session.dropNext = 1; // the guest's ack is the one that dies
    g.session.flush();
    vi.advanceTimersByTime(NET.DRAFT_RESEND_MS + 400);
    pump();
    expect(heard).toEqual([IDS[2]]);
  });

  it('★ a pick that cannot follow ours is a desync, and one for a kid who does not exist is too', async () => {
    const { h, g, pump } = await connected();
    g.session.send({ t: 'draftPick', pickNo: 5, charId: IDS[0] });
    pump();
    expect(h.seen.desyncs).toBe(1);
    h.session.send({ t: 'draftPick', pickNo: 0, charId: 'nobody' });
    pump();
    expect(g.seen.desyncs).toBe(1);
  });
});

describe('the game and after', () => {
  it('★ PLAY BALL reaches the guest whole, and only a legal one does', async () => {
    const { h, g, pump } = await connected();
    const rosters = { away: IDS.slice(0, 9), home: IDS.slice(9, 18) };
    h.match.sendStart({ rosters });
    pump();
    expect(g.seen.starts).toEqual([{ rosters }]);
    // Eight kids, a stranger, a kid on both teams: none of these is a start.
    h.session.send({ t: 'v2', k: 'start', d: { rosters: { away: IDS.slice(0, 8), home: IDS.slice(9, 18) } } });
    h.session.send({ t: 'v2', k: 'start', d: { rosters: { away: ['x', ...IDS.slice(1, 9)], home: IDS.slice(9, 18) } } });
    h.session.send({ t: 'v2', k: 'start', d: { rosters: { away: IDS.slice(0, 9), home: IDS.slice(8, 17) } } });
    h.session.send({ t: 'v2', k: 'start', d: null });
    pump();
    expect(g.seen.starts).toHaveLength(1);
  });

  it('game traffic goes to the seat; pause goes to the app', async () => {
    const { h, g, pump } = await connected();
    g.match.seat.flush({ swing: { atSec: 0.4, aimHeightFt: 2 } }, 0);
    pump();
    expect(h.match.seat.remote.swing).toEqual({ atSec: 0.4, aimHeightFt: 2 });
    h.match.sendPause(true);
    h.match.sendPause(false);
    pump();
    expect(g.seen.pauses).toEqual([true, false]);
  });

  it('★ a rematch needs both taps, and a new draft spends them', async () => {
    const { h, g, pump } = await connected();
    h.match.voteRematch();
    pump();
    expect(h.match.vote.waitingOnThem).toBe(true);
    expect(g.match.vote.theyAsked).toBe(true);
    g.match.voteRematch();
    pump();
    expect(h.match.vote.agreed).toBe(true);
    expect(g.match.vote.agreed).toBe(true);
    h.match.beginDraft();
    g.match.beginDraft();
    expect(h.match.vote.agreed).toBe(false);
    // And the pick counter starts over: pick 0 of the new draft is expected.
    const heard: string[] = [];
    g.match.onFriendPick((id) => heard.push(id));
    h.match.sendPick(IDS[7]);
    pump();
    expect(heard).toEqual([IDS[7]]);
    expect(g.seen.desyncs).toBe(0);
  });

  it('leaving says goodbye, once', async () => {
    const { h, g, pump } = await connected();
    h.match.leave();
    h.match.leave();
    pump();
    expect(g.seen.byes).toBe(1);
  });

  it('a guest that got its channel back asks to be caught up', async () => {
    const { h, g, pump } = await connected();
    g.session.setStatus('reconnecting');
    g.session.setStatus('connected');
    pump();
    expect(g.session.sent.filter((m) => m.t === 'v2' && m.k === 'key')).toHaveLength(1);
    expect(h.seen.desyncs).toBe(0);
  });
});
