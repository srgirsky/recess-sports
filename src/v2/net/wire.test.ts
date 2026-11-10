// ---------------------------------------------------------------------------
// The online wire, tested the way it is used: a real game's frames go in one
// end and must come out the other as the same game.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { diff, patch, quantize, type Json } from './jsonDelta';
import { FrameEncoder, RemoteGame, projectFrame, type FrameMsg } from './frameWire';
import { joinInputs, roleOf, sanitizeInputs, verbsFor } from './inputWire';
import { simulateGameLive, type GameResult, type SimEvent } from '../sim/game';
import type { PlayInputs } from '../sim/play';
import { makeRng } from '../sim/rng';
import { VENUE_GEOMETRY } from '../sim/field';
import { ROSTER, getCharacter } from '../../data/characters';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('jsonDelta', () => {
  const cases: Array<[string, Json, Json]> = [
    ['a changed leaf', { a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } }],
    ['an added and a removed key', { a: 1, gone: true }, { a: 1, fresh: [1, 2] }],
    ['null is a value, not a removal', { steal: { from: 1 } }, { steal: null }],
    ['an equal-length array is walked', { f: [{ x: 1 }, { x: 2 }] }, { f: [{ x: 1 }, { x: 9 }] }],
    ['a resized array is replaced', { events: [] }, { events: [{ t: 'catch' }] }],
    ['a type change', { v: [1, 2] }, { v: { a: 1 } }],
    ['a scalar root', 1, 2],
  ];

  it.each(cases)('patch(a, diff(a, b)) is b: %s', (_name, a, b) => {
    const d = diff(a, b);
    expect(d).toBeDefined();
    // Through JSON, because that is how a delta actually travels.
    expect(patch(clone(a), clone(d!))).toEqual(b);
  });

  it('says nothing when nothing changed', () => {
    const a: Json = { a: [1, { b: null }], c: 'x' };
    expect(diff(a, clone(a))).toBeUndefined();
  });

  it('patches IN PLACE, so a held reference sees the new tick', () => {
    const frame = { play: { fielders: [{ p: { x: 0, z: 46 } }] } };
    const fielder = frame.play.fielders[0];
    const next = { play: { fielders: [{ p: { x: 3, z: 44 } }] } };
    patch(frame as Json, diff(frame as Json, next as Json)!);
    expect(fielder.p).toEqual({ x: 3, z: 44 });
    expect(frame.play.fielders[0]).toBe(fielder);
  });

  it('carries only what moved', () => {
    const still = { charId: 'a', p: { x: 1, z: 2 }, topFts: 18, arm: 7 };
    const a: Json = { fielders: [still, { ...still, charId: 'b' }] };
    const b: Json = { fielders: [still, { ...still, charId: 'b', p: { x: 1.5, z: 2 } }] };
    expect(diff(a, b)).toEqual({ fielders: { 1: { p: { x: { $: 1.5 } } } } });
  });

  it('refuses a key it could not tell from its own markers', () => {
    expect(() => diff({}, { $: 1 })).toThrow(/reserved/);
    expect(() => diff({}, { _: 1 })).toThrow(/reserved/);
  });

  it('quantize rounds floats and leaves integers and structure alone', () => {
    expect(quantize({ a: 1.23456789, b: [2, 0.1 + 0.2], c: null, d: 'x' })).toEqual({
      a: 1.2346,
      b: [2, 0.3],
      c: null,
      d: 'x',
    });
  });
});

/**
 * Drive one whole game the way an online host does — both sides human, with
 * scripted taps so pitches are chosen, swung at and fielded — and pipe every
 * frame and event through the wire as JSON text.
 */
function playThroughWire(seed: string): {
  ticks: number;
  mismatches: number;
  firstMismatch: string | null;
  hostEvents: SimEvent[];
  guestEvents: SimEvent[];
  hostResult: GameResult;
  guestResult: GameResult;
  wholeBytes: number;
  liveBytes: number;
  liveTicks: number;
  liveWholeBytes: number;
} {
  const ids = ROSTER.map((c) => c.id);
  const geo = VENUE_GEOMETRY.park;
  const hostEvents: SimEvent[] = [];
  const guestEvents: SimEvent[] = [];
  const wire: string[] = [];
  const send = (m: unknown) => wire.push(JSON.stringify(m));

  const game = simulateGameLive(
    {
      away: { name: 'A', ids: ids.slice(0, 9) },
      home: { name: 'H', ids: ids.slice(9, 18) },
      lookup: getCharacter,
      geo,
      regulationInnings: 2,
      onEvent: (e) => {
        hostEvents.push(clone(e));
        send({ e });
      },
    },
    makeRng(seed)
  );
  const remote = new RemoteGame(geo, (e) => guestEvents.push(e));
  const drain = () => {
    for (const raw of wire.splice(0)) {
      const m = JSON.parse(raw) as { e?: SimEvent; f?: FrameMsg; end?: GameResult };
      if (m.e) remote.pushEvent(m.e);
      else if (m.f) remote.pushFrame(m.f);
      else if (m.end) remote.pushEnd(m.end);
    }
  };

  const encoder = new FrameEncoder();
  const taps = makeRng(`${seed}-taps`);
  let inputs: PlayInputs = {};
  let ticks = 0;
  let mismatches = 0;
  let firstMismatch: string | null = null;
  let wholeBytes = 0;
  let liveBytes = 0;
  let liveTicks = 0;
  let liveWholeBytes = 0;
  let guestResult: GameResult | null = null;
  let hostResult: GameResult | null = null;

  for (;;) {
    const r = game.next(inputs);
    if (r.done) {
      hostResult = r.value as GameResult;
      send({ end: hostResult });
      drain();
      const g = remote.next();
      expect(g.done).toBe(true);
      guestResult = g.value as GameResult;
      break;
    }
    const frame = r.value;
    const msg = encoder.encode(frame);
    const text = JSON.stringify({ f: msg });
    wire.push(text);
    if (frame.phase === 'live') {
      liveTicks += 1;
      liveBytes += text.length;
      liveWholeBytes += JSON.stringify(projectFrame(frame)).length;
    } else {
      wholeBytes += text.length;
    }
    drain();
    expect(remote.pending).toBe(1);
    const g = remote.next();
    if (g.done) throw new Error('guest ended early');
    const want = JSON.stringify(projectFrame(frame));
    const got = JSON.stringify(projectFrame(g.value));
    if (want !== got) {
      mismatches += 1;
      firstMismatch ??= `tick ${ticks} (${frame.phase})`;
    }
    ticks += 1;

    // The next tick's taps, off a seeded stream so the game is reproducible.
    inputs = {};
    if (frame.phase === 'windup' && taps() < 0.8) {
      inputs.pitch = { kind: 'fastball', aimLateralFt: (taps() - 0.5) * 1.2, aimHeightFt: 1.6 + taps() * 1.4 };
    } else if (frame.phase === 'pitch' && frame.pitch && taps() < 0.7) {
      inputs.swing = {
        atSec: frame.pitch.travelSec + (taps() - 0.5) * 0.06,
        aimHeightFt: 1.8 + taps() * 1.2,
      };
    } else if (frame.phase === 'live' && frame.play && taps() < 0.02) {
      inputs.throwTo = { base: (1 + Math.floor(taps() * 4)) as 1 | 2 | 3 | 4 };
    }
  }

  return {
    ticks,
    mismatches,
    firstMismatch,
    hostEvents,
    guestEvents,
    hostResult: hostResult!,
    guestResult: guestResult!,
    wholeBytes,
    liveBytes,
    liveTicks,
    liveWholeBytes,
  };
}

describe('★ a whole game survives the wire', () => {
  const run = playThroughWire('wire-1');

  it('★ the guest is handed, tick for tick, the frame the host yielded', () => {
    expect(run.ticks).toBeGreaterThan(1000);
    expect(run.firstMismatch).toBeNull();
    expect(run.mismatches).toBe(0);
  });

  it('★ every sim event arrives, in order', () => {
    expect(run.hostEvents.length).toBeGreaterThan(20);
    expect(run.guestEvents).toEqual(run.hostEvents);
  });

  it('★ the result the guest ends on is the host’s', () => {
    expect(run.guestResult).toEqual(clone(run.hostResult));
  });

  it('★ a live tick costs a small fraction of a whole frame', () => {
    const avg = run.liveBytes / run.liveTicks;
    const whole = run.liveWholeBytes / run.liveTicks;
    // The claim the encoder exists for. Measured on this seed when written:
    // 374 bytes a live tick against 3770 for the whole frame — about 22 KB/s
    // at the sim's 60 ticks, where whole frames would be 226. The bound is
    // loose on purpose; the object printed on failure carries the numbers.
    expect({ avg: Math.round(avg), whole: Math.round(whole), ok: avg < whole / 4 }).toMatchObject({ ok: true });
  });

  it('the same holds on a second seed', () => {
    const b = playThroughWire('wire-2');
    expect(b.firstMismatch).toBeNull();
    expect(b.guestEvents).toEqual(b.hostEvents);
    expect(b.guestResult).toEqual(clone(b.hostResult));
    // A whole game through the codec: ~2s alone, but it is the only whole
    // game played INSIDE a test body here (the first seed runs at collect,
    // which has no clock), and beside 139 other files on a CI runner it has
    // crossed vitest's 5s default three times. The limit is a budget for a
    // loaded machine, not a claim about speed.
  }, 30_000);
});

describe('RemoteGame', () => {
  const geo = VENUE_GEOMETRY.park;
  const key = (phase: string, extra: Record<string, Json> = {}): FrameMsg => ({
    key: { phase, play: null, ...extra },
  });

  it('answers hasNext() only when a frame — not just an event — is waiting', () => {
    const g = new RemoteGame(geo, () => {});
    expect(g.hasNext()).toBe(false);
    g.pushEvent({ t: 'playOver' } as unknown as SimEvent);
    expect(g.hasNext()).toBe(false);
    g.pushFrame(key('windup'));
    expect(g.hasNext()).toBe(true);
  });

  it('delivers the events that led to a frame before handing the frame back', () => {
    const seen: string[] = [];
    const g = new RemoteGame(geo, (e) => seen.push(e.t));
    g.pushEvent({ t: 'pa' } as unknown as SimEvent);
    g.pushFrame(key('between'));
    g.pushEvent({ t: 'steal' } as unknown as SimEvent);
    g.pushFrame(key('windup'));
    expect(seen).toEqual([]);
    expect(g.next().value).toMatchObject({ phase: 'between' });
    expect(seen).toEqual(['pa']);
    expect(g.next().value).toMatchObject({ phase: 'windup' });
    expect(seen).toEqual(['pa', 'steal']);
  });

  it('reuses the frame object and makes a new play object per play', () => {
    const g = new RemoteGame(geo, () => {});
    g.pushFrame(key('live', { play: { outs: 0, events: [] } }));
    g.pushFrame({ delta: { play: { outs: { $: 1 } } } });
    g.pushFrame(key('between'));
    g.pushFrame(key('live', { play: { outs: 0, events: [] } }));
    const f1 = g.next().value as { play: { outs: number } | null };
    const first = f1.play!;
    const f2 = g.next().value as { play: { outs: number } | null };
    expect(f2).toBe(f1);
    expect(f2.play).toBe(first);
    expect(first.outs).toBe(1);
    g.next();
    expect(f1.play).toBeNull();
    // The finished play the view kept for its hold is still the play it was.
    expect(first.outs).toBe(1);
    g.next();
    expect(f1.play).not.toBe(first);
  });

  it('gives a live play the local venue and a cover map', () => {
    const g = new RemoteGame(geo, () => {});
    g.pushFrame(key('live', { play: { outs: 0 } }));
    const f = g.next().value as { play: { geo: unknown; cover: unknown } };
    expect(f.play.geo).toBe(geo);
    expect(f.play.cover).toBeInstanceOf(Map);
  });

  it('skips deltas it has no base for and asks for a whole frame', () => {
    const g = new RemoteGame(geo, () => {});
    g.pushFrame(key('windup'));
    g.next();
    // A reconnect: the stream resumes mid-play, deltas first.
    g.pushFrame(key('live', { play: { outs: 0 } }));
    expect(g.next().value).toMatchObject({ phase: 'live' });
    expect(g.needsKey).toBe(false);
  });

  it('ends once, and keeps saying so', () => {
    const g = new RemoteGame(geo, () => {});
    const result = { awayScore: 1, homeScore: 0 } as GameResult;
    g.pushFrame(key('between'));
    g.pushEnd(result);
    g.next();
    expect(g.hasNext()).toBe(true);
    expect(g.next()).toEqual({ done: true, value: result });
    expect(g.hasNext()).toBe(true);
    expect(g.next()).toEqual({ done: true, value: result });
  });
});

describe('whose verb is it', () => {
  const everything: PlayInputs = {
    pointer: { x: 10, z: 80 },
    dive: true,
    throwTo: { base: 2 },
    sendRunner: 'turbo',
    holdRunner: 'penny',
    swing: { atSec: 0.5, aimHeightFt: 2 },
    pitch: { kind: 'curve', aimLateralFt: 0, aimHeightFt: 2 },
    shift: 'pull',
    steal: true,
    throwDown: { atSec: 0.6 },
    pickoff: true,
  };

  it('the visitors bat the top and field the bottom', () => {
    expect(roleOf('away', 'top')).toBe('bat');
    expect(roleOf('away', 'bottom')).toBe('field');
    expect(roleOf('home', 'top')).toBe('field');
    expect(roleOf('home', 'bottom')).toBe('bat');
  });

  it('the two roles split every verb between them and share none', () => {
    const bat = verbsFor(everything, 'bat');
    const field = verbsFor(everything, 'field');
    expect(Object.keys(bat).sort()).toEqual(['holdRunner', 'sendRunner', 'steal', 'swing']);
    expect(Object.keys(field).sort()).toEqual(['dive', 'pickoff', 'pitch', 'pointer', 'shift', 'throwDown', 'throwTo']);
    expect(Object.keys({ ...bat, ...field }).sort()).toEqual(Object.keys(everything).sort());
  });

  it('a spend goes with the side it belongs to', () => {
    expect(verbsFor({ spend: 'powerSwing' }, 'bat').spend).toBe('powerSwing');
    expect(verbsFor({ spend: 'powerSwing' }, 'field').spend).toBeUndefined();
    expect(verbsFor({ spend: 'goldenGlove' }, 'field').spend).toBe('goldenGlove');
    expect(verbsFor({ spend: 'fireball' }, 'bat').spend).toBeUndefined();
  });

  it('★ a batter’s pointer cannot steer the other kid’s fielder', () => {
    // Top half: away bats. A tap on a base sets the pointer AND sends a runner.
    const joined = joinInputs('top', { pointer: { x: 60, z: 60 }, sendRunner: 'turbo' }, 'away', {});
    expect(joined).toEqual({ sendRunner: 'turbo' });
  });

  it('★ a guest cannot order the host’s runners, nor the host throw the guest’s pitch', () => {
    const top = joinInputs('top', everything, 'away', everything);
    // Away bats: batting verbs are the host's, fielding verbs the guest's —
    // and since both sent `everything`, each half must have come from one side.
    expect(Object.keys(top).sort()).toEqual(Object.keys(everything).sort());
    const mineOnly = joinInputs('top', everything, 'away', {});
    expect(mineOnly.pitch).toBeUndefined();
    expect(mineOnly.pointer).toBeUndefined();
    const theirsOnly = joinInputs('top', {}, 'away', everything);
    expect(theirsOnly.swing).toBeUndefined();
    expect(theirsOnly.sendRunner).toBeUndefined();
    expect(theirsOnly.pitch).toEqual(everything.pitch);
  });

  it('sanitizeInputs keeps a well-formed input exactly', () => {
    expect(sanitizeInputs(clone(everything))).toEqual(everything);
    expect(sanitizeInputs({ swing: { atSec: 0.4, aimHeightFt: 2.2, bunt: true } })).toEqual({
      swing: { atSec: 0.4, aimHeightFt: 2.2, bunt: true },
    });
  });

  it('sanitizeInputs drops anything malformed, field by field', () => {
    expect(sanitizeInputs(null)).toEqual({});
    expect(sanitizeInputs('swing')).toEqual({});
    expect(
      sanitizeInputs({
        pointer: { x: 'left', z: 3 },
        throwTo: { base: 7 },
        sendRunner: '<script>',
        swing: { atSec: null, aimHeightFt: 2 },
        pitch: { kind: 'knuckleball', aimLateralFt: 0, aimHeightFt: 2 },
        spend: 'infiniteJuice',
        shift: 'everywhere',
        steal: 'yes',
        throwDown: {},
        extra: { nested: true },
        dive: true,
      })
    ).toEqual({ dive: true });
  });
});
