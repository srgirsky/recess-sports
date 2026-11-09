// ---------------------------------------------------------------------------
// Two seats wired back to back are a whole online game: a real sim on the host,
// a `RemoteGame` on the guest, and JSON text between them in both directions.
// The gates are BEHAVIOUR — the guest's verb changes the game when it is the
// guest's to make, and changes nothing when it is not.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { OnlineSeat } from './OnlineSeat';
import { simulateGameLive, type GameResult, type LiveFrame } from '../sim/game';
import type { PlayInputs } from '../sim/play';
import { makeRng } from '../sim/rng';
import { VENUE_GEOMETRY } from '../sim/field';
import { ROSTER, getCharacter } from '../../data/characters';

const geo = VENUE_GEOMETRY.park;

/** A host seat and a guest seat joined by a wire that only carries JSON text. */
function pair() {
  const toGuest: string[] = [];
  const toHost: string[] = [];
  const host = new OnlineSeat('host', (k, d) => toGuest.push(JSON.stringify({ k, d })));
  const guest = new OnlineSeat('guest', (k, d) => toHost.push(JSON.stringify({ k, d })));
  const deliver = () => {
    for (const raw of toHost.splice(0)) {
      const m = JSON.parse(raw) as { k: string; d: unknown };
      host.handle(m.k, m.d);
    }
    for (const raw of toGuest.splice(0)) {
      const m = JSON.parse(raw) as { k: string; d: unknown };
      guest.handle(m.k, m.d);
    }
  };
  return { host, guest, deliver, toGuest, toHost };
}

/**
 * Play a whole game the way `GameView.advance` does on each device, with the
 * guest's taps chosen by `guestTaps` from the frame it is LOOKING AT.
 */
function play(seed: string, guestTaps: (f: LiveFrame) => PlayInputs): GameResult {
  const { host, guest, deliver } = pair();
  const ids = ROSTER.map((c) => c.id);
  const sim = simulateGameLive(
    {
      away: { name: 'A', ids: ids.slice(0, 9) },
      home: { name: 'H', ids: ids.slice(9, 18) },
      lookup: getCharacter,
      geo,
      regulationInnings: 2,
      onEvent: (e) => host.sendEvent(e),
    },
    makeRng(seed)
  );
  const remote = guest.attach(geo, () => {});
  let hostFrame: LiveFrame | null = null;
  let guestResult: GameResult | null = null;
  for (let guard = 0; guard < 200_000; guard++) {
    deliver();
    const wasWindup = hostFrame?.phase === 'windup';
    const r = sim.next(host.join(hostFrame?.half, {}));
    const stillLive = !r.done && r.value.phase === 'live';
    host.consumed(wasWindup, stillLive);
    if (r.done) {
      host.sendEnd(r.value as GameResult);
      deliver();
      const g = remote.next();
      expect(g.done).toBe(true);
      guestResult = g.value as GameResult;
      expect(guestResult).toEqual(JSON.parse(JSON.stringify(r.value)));
      return guestResult;
    }
    hostFrame = r.value;
    host.sendFrame(hostFrame);
    deliver();
    const g = remote.next();
    if (g.done) throw new Error('guest ended early');
    guest.flush(guestTaps(g.value), guard * 16);
  }
  throw new Error('the game never ended');
}

const swingAt = (f: LiveFrame): PlayInputs =>
  f.phase === 'pitch' && f.pitch ? { swing: { atSec: f.pitch.travelSec, aimHeightFt: 2.4 } } : {};

describe('★ the guest’s verbs reach the sim — and only its own', () => {
  const nobody = play('seat-1', () => ({}));

  it('★ a guest who swings while it BATS changes the game', () => {
    const swings = play('seat-1', (f) => (f.half === 'bottom' ? swingAt(f) : {}));
    expect(JSON.stringify(swings.lines)).not.toBe(JSON.stringify(nobody.lines));
  });

  it('★ a guest who swings while the HOST bats changes nothing at all', () => {
    const wrongHalf = play('seat-1', (f) => (f.half === 'top' ? swingAt(f) : {}));
    expect(wrongHalf).toEqual(nobody);
  });

  it('★ a guest who picks the pitch while it FIELDS changes the game; in the wrong half, nothing', () => {
    const plan = (f: LiveFrame): PlayInputs =>
      f.phase === 'windup' ? { pitch: { kind: 'changeup', aimLateralFt: 0.6, aimHeightFt: 1.2 } } : {};
    const fielding = play('seat-1', (f) => (f.half === 'top' ? plan(f) : {}));
    expect(JSON.stringify(fielding.lines)).not.toBe(JSON.stringify(nobody.lines));
    const batting = play('seat-1', (f) => (f.half === 'bottom' ? plan(f) : {}));
    expect(batting).toEqual(nobody);
  });

  it('a guest cannot send the host’s runners or steer in the host’s half', () => {
    const meddle = play('seat-1', (f) =>
      f.half === 'top' && f.phase === 'live' && f.play
        ? { sendRunner: f.play.runners[0]?.charId, holdRunner: f.play.runners[0]?.charId }
        : f.half === 'bottom' && f.phase === 'live'
          ? { pointer: { x: 0, z: 300 }, dive: true, throwTo: { base: 4 } }
          : {}
    );
    expect(meddle).toEqual(nobody);
  });
});

describe('the seat', () => {
  it('sends a one-shot once however long it stays set, and again when re-made', () => {
    const { guest, toHost } = pair();
    const swing = { atSec: 0.4, aimHeightFt: 2 };
    guest.flush({ swing }, 0);
    guest.flush({ swing }, 16);
    guest.flush({ swing }, 32);
    expect(toHost).toHaveLength(1);
    guest.flush({}, 48); // the local advance cleared it
    guest.flush({ swing }, 64);
    expect(toHost).toHaveLength(2);
  });

  it('★ a steal called OFF travels too', () => {
    const { host, guest, deliver } = pair();
    guest.flush({ steal: true }, 0);
    deliver();
    expect(host.remote.steal).toBe(true);
    guest.flush({}, 16);
    deliver();
    expect(host.remote.steal).toBeUndefined();
  });

  it('throttles the steering pointer and still sends where it ends up', () => {
    const { guest, toHost } = pair();
    for (let t = 0; t <= 200; t += 10) guest.flush({ pointer: { x: t, z: 100 } }, t);
    // 21 moves in 200ms at one per 50ms.
    expect(toHost.length).toBeGreaterThanOrEqual(4);
    expect(toHost.length).toBeLessThanOrEqual(5);
  });

  it('host lifetimes: a one-shot is spent, steering lasts the play, a toggle lasts to its windup', () => {
    const { host } = pair();
    host.handle('in', { swing: { atSec: 0.4, aimHeightFt: 2 }, pointer: { x: 1, z: 2 }, steal: true });
    host.consumed(false, true);
    expect(host.remote).toEqual({ pointer: { x: 1, z: 2 }, steal: true });
    host.consumed(false, false);
    expect(host.remote).toEqual({ steal: true });
    host.consumed(true, false);
    expect(host.remote).toEqual({});
  });

  it('★ "my windup is over" does not read as "my swing window is over"', () => {
    const { host, guest, deliver } = pair();
    guest.windowDone('windup');
    deliver();
    expect(host.remoteDone).toBe('windup');
    host.consumed(true, false); // the host moves on to the pitch
    expect(host.remoteDone).toBeNull();
    guest.windowOpened();
    guest.windowDone('pitch');
    guest.windowDone('pitch');
    deliver();
    expect(host.remoteDone).toBe('pitch');
  });

  it('★ keeps what arrives before the view attaches — the first frame is not lost', () => {
    const { host, guest, deliver } = pair();
    const ids = ROSTER.map((c) => c.id);
    const sim = simulateGameLive(
      { away: { name: 'A', ids: ids.slice(0, 9) }, home: { name: 'H', ids: ids.slice(9, 18) }, lookup: getCharacter, geo },
      makeRng('early')
    );
    host.sendFrame(sim.next().value as LiveFrame);
    deliver(); // nobody is listening yet
    const remote = guest.attach(geo, () => {});
    expect(remote.hasNext()).toBe(true);
    expect(remote.next().value).toMatchObject({ phase: 'windup', inning: 1 });
  });

  it('a guest that lost its place is handed a whole frame', () => {
    const { host, guest, deliver, toGuest } = pair();
    const ids = ROSTER.map((c) => c.id);
    const sim = simulateGameLive(
      { away: { name: 'A', ids: ids.slice(0, 9) }, home: { name: 'H', ids: ids.slice(9, 18) }, lookup: getCharacter, geo },
      makeRng('rejoin')
    );
    host.sendFrame(sim.next().value as LiveFrame);
    toGuest.length = 0; // the frame was lost with the channel
    const remote = guest.attach(geo, () => {});
    expect(remote.hasNext()).toBe(false);
    guest.askForKey();
    guest.askForKey(); // asked once, however often it is called
    deliver();
    deliver();
    expect(remote.pending).toBe(1);
    expect(remote.next().value).toMatchObject({ phase: 'windup' });
  });

  it('a malformed input from the wire is no input', () => {
    const { host } = pair();
    host.handle('in', { swing: 'now', pitch: { kind: 'laser' }, throwTo: { base: 9 } });
    expect(host.remote).toEqual({});
  });
});
