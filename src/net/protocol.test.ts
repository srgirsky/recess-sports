// ---------------------------------------------------------------------------
// Pure protocol tests: encode/decode round trips over a FakeTransport pair,
// Sequencer duplicate/stale handling, malformed-input rejection, and the
// emoji↔room-id mapping. No networking, no Phaser, no peerjs.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { NET } from '../config';
import {
  encode,
  decode,
  helloCompatible,
  Sequencer,
  PickCourier,
  classifyDraftPick,
  emojiToRoomId,
  roomIdToEmoji,
  rollRoomCode,
  type NetMsg,
  type Transport,
  type HudSnap,
} from './protocol';

/** Deterministic rng: cycles the given numbers (house style, cf. liveplay.test.ts). */
const seq = (nums: number[]): (() => number) => {
  let i = 0;
  return () => nums[i++ % nums.length];
};

/**
 * A linked FakeTransport pair: send() enqueues into the peer's inbox;
 * flush() delivers. Optional reorder/drop knobs model a misbehaving channel.
 */
function fakePair(): {
  a: Transport & { flush(opts?: { reverse?: boolean; dropEvery?: number }): void; close(): void };
  b: Transport & { flush(opts?: { reverse?: boolean; dropEvery?: number }): void; close(): void };
} {
  const make = () => {
    const inbox: string[] = [];
    let onMsg: (raw: string) => void = () => {};
    let onClose: () => void = () => {};
    const t = {
      peer: undefined as { inbox: string[] } | undefined,
      send(raw: string) {
        t.peer!.inbox.push(raw);
      },
      onMessage(cb: (raw: string) => void) {
        onMsg = cb;
      },
      onClose(cb: () => void) {
        onClose = cb;
      },
      inbox,
      flush(opts?: { reverse?: boolean; dropEvery?: number }) {
        let pending = inbox.splice(0, inbox.length);
        if (opts?.reverse) pending = pending.reverse();
        pending.forEach((raw, i) => {
          if (opts?.dropEvery && (i + 1) % opts.dropEvery === 0) return;
          onMsg(raw);
        });
      },
      close() {
        onClose();
      },
    };
    return t;
  };
  const a = make();
  const b = make();
  a.peer = b;
  b.peer = a;
  return { a, b };
}

const HUD: HudSnap = {
  scores: [2, 1],
  outs: 1,
  balls: 2,
  strikes: 1,
  bases: ['turbo', null, 'penny'],
  lineupIdx: [3, 4],
  batterId: 'dex',
  pitcherId: 'nostrike',
  juice: [40, 15],
};

const FRAME = {
  t: 1250,
  ball: { pos: { x: 480, y: 300 }, height: 0.4, phase: 'flight' as const, heldBy: null },
  fielders: [{ pos: { x: 480, y: 420 }, diving: false }],
  runners: [{ pos: { x: 700, y: 500 }, from: 0, to: 1, progress: 0.5, done: null }],
};

/** One of every message kind — the round-trip corpus. */
const ALL_MSGS: NetMsg[] = [
  { t: 'hello', version: NET.PROTOCOL_VERSION, mode: 'main', innings: 3, venueId: 'park' },
  { t: 'identity', seat: 1, color: 3, logo: 7 },
  { t: 'draftPick', pickNo: 4, charId: 'turbo' },
  { t: 'draftAck', pickNo: 4 },
  { t: 'lineup', seat: 0, plan: { order: ['a', 'b'], positions: { a: 'P', b: 'C' }, pitcherId: 'a' } as never },
  { t: 'pitchPlan', kind: 'fastball', target: { x: 0.2, y: -0.4 }, band: 'good', errorMs: 88 },
  { t: 'pitchLaunch', wild: false, travelMs: 900, stealFrom: 2 },
  { t: 'swing', errorMs: 42, cursor: { x: 0.1, y: 0 }, swingType: 'big', spend: 'powerSwing' },
  { t: 'atBat', result: { kind: 'hit', bases: 1, description: 'Single!' }, movements: [], hud: HUD },
  {
    t: 'liveStart',
    mode: 'defense',
    launch: { angleDeg: 20, dist: 300, hangMs: 1500, homer: false } as never,
    assignment: [{ position: 'P', charId: 'nostrike' }],
    batter: { charId: 'tank', speed: 4 },
    baseRunners: [{ base: 1, charId: 'zippy', speed: 9 }],
    outs: 1,
    frame: FRAME,
  },
  { t: 'liveFrame', frame: FRAME },
  { t: 'liveEvents', events: [{ t: 'catch', fielder: 'clover' }, { t: 'out', base: 2, runner: 'zippy' }] },
  {
    t: 'liveInput',
    pointer: { x: 500, y: 400 },
    pointerActive: true,
    dive: true,
    throwTo: { base: 2, power: 0.8 },
    stealTap: 340,
  },
  { t: 'stealRace', from: 1 },
  { t: 'settle', hud: HUD, next: 'batter' },
  { t: 'half', inning: 2, half: 'bottom', hud: HUD },
  { t: 'gameOver', hud: HUD },
  { t: 'pause' },
  { t: 'resume', hud: HUD },
  { t: 'bye' },
];

describe('protocol encode/decode', () => {
  it('round-trips every message kind through a FakeTransport pair', () => {
    const { a, b } = fakePair();
    const got: NetMsg[] = [];
    b.onMessage((raw) => {
      const env = decode(raw);
      expect(env).not.toBeNull();
      got.push(env!.msg);
    });
    ALL_MSGS.forEach((m, i) => a.send(encode(i + 1, m)));
    b.flush();
    expect(got).toEqual(ALL_MSGS);
  });

  it('rejects malformed input', () => {
    expect(decode('not json')).toBeNull();
    expect(decode('42')).toBeNull();
    expect(decode('null')).toBeNull();
    expect(decode(JSON.stringify({ msg: { t: 'hello' } }))).toBeNull(); // no seq
    expect(decode(JSON.stringify({ seq: 1 }))).toBeNull(); // no msg
    expect(decode(JSON.stringify({ seq: 1, msg: { t: 'evilKind' } }))).toBeNull();
    expect(decode(JSON.stringify({ seq: 'one', msg: { t: 'bye' } }))).toBeNull();
    expect(decode(123 as never)).toBeNull(); // non-string raw
  });

  it('flags a hello from a different protocol version', () => {
    const ours: NetMsg = { t: 'hello', version: NET.PROTOCOL_VERSION, mode: 'kid', innings: 1, venueId: 'park' };
    const theirs: NetMsg = { t: 'hello', version: NET.PROTOCOL_VERSION + 1, mode: 'kid', innings: 1, venueId: 'park' };
    expect(helloCompatible(ours as NetMsg & { t: 'hello' })).toBe(true);
    expect(helloCompatible(theirs as NetMsg & { t: 'hello' })).toBe(false);
  });
});

describe('Sequencer', () => {
  it('numbers outgoing envelopes monotonically from 1', () => {
    const s = new Sequencer();
    expect(s.nextSeq()).toBe(1);
    expect(s.nextSeq()).toBe(2);
    expect(s.nextSeq()).toBe(3);
  });

  it('accepts in-order, flags duplicates and stale arrivals', () => {
    const s = new Sequencer();
    const bye: NetMsg = { t: 'bye' };
    expect(s.accept({ seq: 1, msg: bye })).toBe('ok');
    expect(s.accept({ seq: 2, msg: bye })).toBe('ok');
    expect(s.accept({ seq: 2, msg: bye })).toBe('duplicate');
    expect(s.accept({ seq: 1, msg: bye })).toBe('stale');
    expect(s.accept({ seq: 5, msg: bye })).toBe('ok'); // gaps are fine (ordered channel)
    expect(s.accept({ seq: 3, msg: bye })).toBe('stale');
  });

  it('a reordered flush is caught by the receiver sequencer', () => {
    const { a, b } = fakePair();
    const s = new Sequencer();
    const verdicts: string[] = [];
    b.onMessage((raw) => {
      const env = decode(raw);
      if (env) verdicts.push(s.accept(env));
    });
    a.send(encode(1, { t: 'pause' }));
    a.send(encode(2, { t: 'resume', hud: HUD }));
    a.send(encode(3, { t: 'bye' }));
    b.flush({ reverse: true });
    expect(verdicts).toEqual(['ok', 'stale', 'stale']);
  });

  it('dropped messages leave gaps but later traffic still flows', () => {
    const { a, b } = fakePair();
    const s = new Sequencer();
    const got: number[] = [];
    b.onMessage((raw) => {
      const env = decode(raw);
      if (env && s.accept(env) === 'ok') got.push(env.seq);
    });
    for (let i = 1; i <= 6; i++) a.send(encode(i, { t: 'bye' }));
    b.flush({ dropEvery: 3 }); // drops seq 3 and 6
    expect(got).toEqual([1, 2, 4, 5]);
  });
});

describe('PickCourier', () => {
  const RESEND = NET.DRAFT_RESEND_MS;
  const PICK: NetMsg = { t: 'draftPick', pickNo: 3, charId: 'turbo' };

  it('is idle until armed, then due only after the resend window', () => {
    const c = new PickCourier(RESEND);
    expect(c.unacked()).toBe(false);
    expect(c.due(99999)).toBeNull(); // unarmed: never due
    c.arm(3, 'turbo', 1000);
    expect(c.unacked()).toBe(true);
    expect(c.due(1000 + RESEND - 1)).toBeNull();
    expect(c.due(1000 + RESEND)).toEqual(PICK);
  });

  it('re-arms after each resend (steady cadence, not a burst)', () => {
    const c = new PickCourier(RESEND);
    c.arm(3, 'turbo', 0);
    expect(c.due(RESEND)).toEqual(PICK);
    expect(c.due(RESEND + 1)).toBeNull(); // just resent — not due again yet
    expect(c.due(RESEND * 2)).toEqual(PICK);
  });

  it('clears on the matching draftAck, ignores a non-matching one', () => {
    const c = new PickCourier(RESEND);
    c.arm(3, 'turbo', 0);
    expect(c.ackedBy({ t: 'draftAck', pickNo: 2 })).toBe(false);
    expect(c.unacked()).toBe(true);
    expect(c.ackedBy({ t: 'draftAck', pickNo: 3 })).toBe(true);
    expect(c.unacked()).toBe(false);
    expect(c.due(RESEND * 5)).toBeNull(); // acked: nothing to resend
  });

  it("treats the friend's LATER pick as an implicit ack, not an earlier one", () => {
    const c = new PickCourier(RESEND);
    c.arm(3, 'turbo', 0);
    expect(c.ackedBy({ t: 'draftPick', pickNo: 2, charId: 'penny' })).toBe(false); // a retransmit of theirs
    expect(c.ackedBy({ t: 'draftPick', pickNo: 4, charId: 'penny' })).toBe(true);
    expect(c.unacked()).toBe(false);
  });

  it('poke() forces the next due() to fire immediately (reconnect resend)', () => {
    const c = new PickCourier(RESEND);
    c.arm(3, 'turbo', 1000);
    expect(c.due(1001)).toBeNull();
    c.poke(1001);
    expect(c.due(1001)).toEqual(PICK);
  });
});

describe('classifyDraftPick', () => {
  it('splits duplicate / expected / future around the applied counter', () => {
    expect(classifyDraftPick(4, 5)).toBe('duplicate');
    expect(classifyDraftPick(0, 5)).toBe('duplicate');
    expect(classifyDraftPick(5, 5)).toBe('expected');
    expect(classifyDraftPick(6, 5)).toBe('future');
  });
});

describe('draft reliability over a lossy channel', () => {
  it('retransmits until acked; the receiver applies exactly once despite drops both ways', () => {
    const { a, b } = fakePair();
    const RESEND = NET.DRAFT_RESEND_MS;
    const sender = { seq: new Sequencer(), courier: new PickCourier(RESEND) };
    const receiver = { seqIn: new Sequencer(), seqOut: new Sequencer(), applied: 0, appliedIds: [] as string[] };

    // Receiver: ack EVERY arriving draftPick (dups included), apply once.
    b.onMessage((raw) => {
      const env = decode(raw);
      if (!env || receiver.seqIn.accept(env) !== 'ok') return;
      if (env.msg.t !== 'draftPick') return;
      b.send(encode(receiver.seqOut.nextSeq(), { t: 'draftAck', pickNo: env.msg.pickNo }));
      if (classifyDraftPick(env.msg.pickNo, receiver.applied) === 'expected') {
        receiver.applied += 1;
        receiver.appliedIds.push(env.msg.charId);
      }
    });
    const senderSeqIn = new Sequencer();
    a.onMessage((raw) => {
      const env = decode(raw);
      if (!env || senderSeqIn.accept(env) !== 'ok') return;
      sender.courier.ackedBy(env.msg);
    });

    const resendNow = (now: number) => {
      const again = sender.courier.due(now);
      expect(again).not.toBeNull();
      a.send(encode(sender.seq.nextSeq(), again!));
    };

    // The FIRST send vanishes into a dead channel (peer.ts drops silently
    // while reconnecting) — arm the courier with nothing on the wire.
    sender.courier.arm(0, 'turbo', 0);

    // Round 1: retransmit lost too (dropEvery: 1 = drop everything).
    resendNow(RESEND);
    b.flush({ dropEvery: 1 });
    expect(sender.courier.unacked()).toBe(true);
    expect(receiver.applied).toBe(0);

    // Round 2: the pick lands and is applied — but the ACK is lost.
    resendNow(RESEND * 2);
    b.flush();
    expect(receiver.applied).toBe(1);
    a.flush({ dropEvery: 1 });
    expect(sender.courier.unacked()).toBe(true);

    // Round 3: the duplicate lands, is re-acked but NOT re-applied,
    // and this ack finally gets home.
    resendNow(RESEND * 3);
    b.flush();
    a.flush();
    expect(sender.courier.unacked()).toBe(false);
    expect(receiver.applied).toBe(1); // dup deliveries never double-apply
    expect(receiver.appliedIds).toEqual(['turbo']);
    expect(sender.courier.due(RESEND * 9)).toBeNull(); // courier is done
  });
});

describe('emoji room codes', () => {
  it('round-trips indices → room id → emoji', () => {
    const indices = [0, 5, 10, 15];
    const id = emojiToRoomId(indices);
    expect(id).toBe('recess-05af');
    const emoji = roomIdToEmoji(id);
    expect(emoji).toEqual(indices.map((i) => NET.CODE_EMOJI[i]));
  });

  it('rejects ids that are not ours', () => {
    expect(roomIdToEmoji('recess-05a')).toBeNull(); // wrong length
    expect(roomIdToEmoji('recess-05afe')).toBeNull();
    expect(roomIdToEmoji('recess-05aZ')).toBeNull(); // non-hex
    expect(roomIdToEmoji('lobby-05af')).toBeNull();
    expect(roomIdToEmoji('')).toBeNull();
  });

  it('rollRoomCode uses the injected rng and stays in range', () => {
    const code = rollRoomCode(seq([0, 0.49, 0.99, 0.26]));
    expect(code).toHaveLength(NET.CODE_LEN);
    code.forEach((i) => {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(NET.CODE_EMOJI.length);
    });
    expect(code).toEqual([0, 7, 15, 4]);
    // Deterministic: same rng → same code.
    expect(rollRoomCode(seq([0, 0.49, 0.99, 0.26]))).toEqual(code);
  });
});
