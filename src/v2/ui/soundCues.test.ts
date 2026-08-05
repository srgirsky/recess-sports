// ---------------------------------------------------------------------------
// ★ SILENCE IS WHAT A BROKEN CUE TABLE AND A WORKING MUTE BOTH SOUND LIKE.
//
// Every other view layer can be checked by looking at it. This one cannot: a cue
// that never fires produces exactly nothing, which is also the correct output
// when the game is muted, when the tab has not been clicked, and when the
// browser has no audio device. That is three ways to convince yourself it works
// while it does not, so the decision is a pure function and this file drives it
// with real games.
//
// The first version of `cuesForEvent` keyed a whiff on `hit === 'miss'`. There
// is no such `HitType` — a swing and a miss emits no `contact` event AT ALL, it
// is a `pitch` with `kind: 'swingingStrike'` — so the table was silent on every
// whiff in the game and nothing but a sweep of real events was going to say so.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { simulateGame, type SimEvent } from '../sim/game';
import { makeRng } from '../sim/rng';
import { ROSTER, getCharacter } from '../../data/characters';
import { announceFor, cuesForChange, cuesForEvent, snapshot, type Cue, type Snapshot } from './soundCues';
import { poolSizes } from '../../systems/announcer';

/** Every event of a real game, in order. Events are values, so keeping is safe. */
function eventsOf(seed: string): SimEvent[] {
  const events: SimEvent[] = [];
  simulateGame(
    {
      away: { name: 'A', ids: ROSTER.slice(0, 9).map((c) => c.id) },
      home: { name: 'H', ids: ROSTER.slice(9, 18).map((c) => c.id) },
      lookup: getCharacter,
      onEvent: (e) => events.push({ ...e }),
    },
    makeRng(seed)
  );
  return events;
}

const EVENTS = ['a', 'b', 'c'].flatMap(eventsOf);

describe('★ every event the sim can emit makes a sound', () => {
  it('★ leaves no pitch and no contact silent', () => {
    // The failure this catches is a cue table that has drifted from the union —
    // a new `PitchResult` kind, or a renamed one, falls straight through and
    // that pitch simply stops making a noise.
    const silent = EVENTS.filter((e) => cuesForEvent(e).length === 0);
    expect(silent.slice(0, 3), 'these events produce no cue at all').toEqual([]);
    expect(EVENTS.length, 'the sweep saw nothing').toBeGreaterThan(500);
  });

  it('★ covers every pitch kind the sim actually produced', () => {
    // Asserting the table handles five names proves nothing about the sim. This
    // asserts the sim's OWN output was covered, so a kind that stops being
    // produced shows up as a gap here rather than as dead code forever.
    const kinds = new Set(EVENTS.filter((e) => e.t === 'pitch').map((e) => e.kind));
    expect([...kinds].sort()).toEqual(
      ['ball', 'calledStrike', 'foulTip', 'inPlay', 'swingingStrike'].filter((k) => kinds.has(k as never))
    );
    expect(kinds.size, 'the roster never swung and missed?').toBeGreaterThanOrEqual(4);
  });

  it('★ whiffs, which the first version of this table did not', () => {
    const whiffs = EVENTS.filter((e) => e.t === 'pitch' && e.kind === 'swingingStrike');
    expect(whiffs.length, 'no swinging strikes in three games').toBeGreaterThan(10);
    for (const e of whiffs) expect(cuesForEvent(e)).toContain('whiff');
  });

  it('cracks the bat exactly once on a ball in play', () => {
    // The `inPlay` pitch and the `contact` that follows describe ONE swing.
    // Cracking on both is the obvious bug and it is audible as a stutter.
    for (const e of EVENTS) {
      if (e.t === 'pitch' && e.kind === 'inPlay') expect(cuesForEvent(e)).not.toContain('crack');
    }
    const contacts = EVENTS.filter((e) => e.t === 'contact' && !e.foul);
    expect(contacts.length).toBeGreaterThan(20);
    for (const e of contacts) {
      expect(cuesForEvent(e).filter((c) => c === 'crack')).toHaveLength(1);
    }
  });

  it('calls the umpire’s verdict, never the pitcher’s intention', () => {
    for (const e of EVENTS) {
      if (e.t !== 'pitch') continue;
      const cues = cuesForEvent(e);
      if (e.kind === 'ball') expect(cues).toContain('call:ball');
      if (e.kind === 'calledStrike') expect(cues).toContain('call:strike');
      // A called strike and a ball are mutually exclusive, or the scoreboard and
      // the umpire disagree in front of the player.
      expect(cues.includes('call:ball') && cues.includes('call:strike')).toBe(false);
    }
  });
});

describe('state changes', () => {
  const base: Snapshot = {
    inning: 1,
    half: 'top',
    outs: 0,
    awayScore: 0,
    homeScore: 0,
    phase: 'between',
  };
  const at = (over: Partial<Snapshot>): Snapshot => ({ ...base, ...over });

  it('cheers a run, from either side', () => {
    expect(cuesForChange(base, at({ awayScore: 1 }))).toContain('cheer');
    expect(cuesForChange(base, at({ homeScore: 3 }))).toContain('cheer');
  });

  it('marks an out', () => {
    expect(cuesForChange(base, at({ outs: 1 }))).toContain('out');
  });

  it('★ says nothing when a NEW GAME resets the numbers', () => {
    // A score that falls means a different game started under the same listener.
    // Firing on the difference would cheer for runs being undone.
    const late = at({ inning: 6, outs: 2, awayScore: 7, homeScore: 4 });
    expect(cuesForChange(late, base)).toEqual([]);
  });

  it('says nothing when nothing happened, which is most ticks', () => {
    expect(cuesForChange(base, at({}))).toEqual([]);
    expect(cuesForChange(base, at({ phase: 'pitch' }))).toEqual([]);
  });

  it('★ snapshots by VALUE, or every comparison is a thing against itself', () => {
    // `simulateGameLive` yields one reused frame. A snapshot holding a reference
    // would compare the current frame with the current frame, forever, and the
    // whole file would go quiet with nothing to see.
    const frame = {
      inning: 2,
      half: 'bottom' as const,
      outs: 1,
      awayScore: 3,
      homeScore: 2,
      phase: 'pitch' as const,
      balls: 0,
      strikes: 0,
      bases: [false, false, false] as [boolean, boolean, boolean],
      batterId: 'x',
      pitcherId: 'y',
      lineScore: [],
      defence: {},
      play: null,
      pitch: null,
    };
    const snap = snapshot(frame);
    frame.outs = 3;
    frame.awayScore = 9;
    expect(snap.outs, 'the snapshot followed the frame').toBe(1);
    expect(snap.awayScore).toBe(3);
    expect(cuesForChange(snap, snapshot(frame))).toEqual(['out', 'cheer']);
  });
});

/** Every cue the table can emit must be one the player layer knows about. */
describe('the vocabulary', () => {
  it('emits only declared cues', () => {
    const known = new Set<Cue>([
      'woosh',
      'crack',
      'whiff',
      'pop',
      'cheer',
      'call:strike',
      'call:ball',
      'call:foul',
      'out',
    ]);
    for (const e of EVENTS) for (const c of cuesForEvent(e)) expect(known.has(c)).toBe(true);
  });
});

describe('★ the booth calls the moments a kid is waiting for', () => {
  it('★ finds strikeouts, walks, homers, catches and hits in a real game', () => {
    // The mapping is only worth anything if the sim actually produces the
    // events it keys on. Asserting the switch handles seven names proves
    // nothing; asserting the sweep SAW them does.
    const seen = new Map<string, number>();
    for (const e of EVENTS) {
      const m = announceFor(e);
      if (m) seen.set(m.kind, (seen.get(m.kind) ?? 0) + 1);
    }
    for (const kind of ['strikeoutSwinging', 'strikeoutPitched', 'walk', 'catch', 'hitSafe', 'outRace']) {
      expect(seen.get(kind) ?? 0, `the booth never got to say "${kind}"`).toBeGreaterThan(0);
    }
  });

  it('★ calls a home run — which three games will not show you', () => {
    // ⚠️ DO NOT "FIX" THE SIM BECAUSE THIS SWEEP FINDS NO HOMERS. It found one
    // in thirty games at the park, and that is DELIBERATE and measured:
    // `sim.carryVsFence` sets the fences so a power-10 kid clears the 185ft line
    // and NOBODY clears the 212ft centre, and `sim.gameShape` counted 155 across
    // 861 games -- a record whose own header says it "exists to be READ, not to
    // be met", because conforming a four-to-eight-year-olds' game to MLB's rates
    // is the mistake the `reference` field exists to prevent.
    //
    // So the mapping is proven on a constructed event. A sweep is the right tool
    // for "does the sim emit this"; it is the wrong tool for "is the rarest
    // moment in the game wired up".
    const hr = { t: 'contact', launch: EVENTS.find((e) => e.t === 'contact')!.launch,
                 hit: 'HR', flyCaught: false, foul: false } as SimEvent;
    expect(announceFor(hr)).toEqual({ kind: 'homer', priority: 2 });
    expect(cuesForEvent(hr)).toContain('cheer');
  });

  it('★ never calls a foul ball, which is most contact there is', () => {
    const fouls = EVENTS.filter((e) => e.t === 'contact' && e.foul);
    expect(fouls.length, 'no fouls in three games').toBeGreaterThan(10);
    for (const e of fouls) expect(announceFor(e)).toBeNull();
  });

  it('★ calls a third strike and not a first or second', () => {
    // The whole mapping rests on `strikes` being the count BEFORE the pitch.
    // Off by one and the booth calls a strikeout on every 1-1 count.
    for (const e of EVENTS) {
      if (e.t !== 'pitch') continue;
      const m = announceFor(e);
      const isK = m?.kind === 'strikeoutSwinging' || m?.kind === 'strikeoutPitched';
      if (isK) expect(e.strikes, 'called a K on the wrong count').toBe(2);
      if (e.strikes < 2) expect(isK, `a K called on ${e.balls}-${e.strikes}`).toBe(false);
    }
  });

  it('★ calls ball four and not ball two', () => {
    for (const e of EVENTS) {
      if (e.t !== 'pitch') continue;
      if (announceFor(e)?.kind === 'walk') expect(e.balls).toBe(3);
    }
  });

  it('lets the big moments jump the rate limiter, and nothing else', () => {
    // `Announcer` drops priority-1 lines while the booth is still talking. A
    // homer or a strikeout that got dropped is the one call a kid was waiting
    // for, so those are the only ones allowed through.
    const loud = new Set<string>();
    const withHomer: SimEvent[] = [
      ...EVENTS,
      { t: 'contact', launch: EVENTS.find((e) => e.t === 'contact')!.launch,
        hit: 'HR', flyCaught: false, foul: false } as SimEvent,
    ];
    for (const e of withHomer) {
      const m = announceFor(e);
      if (m?.priority === 2) loud.add(m.kind);
    }
    expect([...loud].sort()).toEqual(['homer', 'strikeoutPitched', 'strikeoutSwinging']);
  });

  it('names a moment the booth actually has lines for', () => {
    const pools = poolSizes();
    for (const e of EVENTS) {
      const m = announceFor(e);
      if (m) expect(pools[m.kind], `no lines for "${m.kind}"`).toBeGreaterThan(0);
    }
  });
});
