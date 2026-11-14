// ---------------------------------------------------------------------------
// Signature behaviours. Each kid's quirk is tested where it bites — in the
// reducer that reads it — and one test up top holds the rule the whole module
// rests on: a kid WITHOUT a quirk gets the unmodified value and no extra roll.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { CURSOR, JUICE, PLATE_ZONE, QUIRKS } from '../config';
import { ROSTER, getCharacter } from '../data/characters';
import type { Character, Quirk } from '../data/types';
import { resolveContact, resolveContactAimed } from './atbat';
import { Chatter } from './chatter';
import { HOME, type PositionId } from './geometry';
import { startLivePlay, stepLivePlay, type LiveEvent, type LivePlayState } from './liveplay';
import { resolveLiveParams } from './mode';
import { resolveCpuPitch, resolveCpuPitchLocated, rollAiWildPitch, type PitchBand } from './pitch';
import { chooseCpuPitch, resolvePitchLocation, type PitchPlan } from './pitchkind';
import {
  batterInMoment,
  clutchFiring,
  foulChance,
  inZoneFor,
  planForBatter,
  scatterMultFor,
  stealEdgeFor,
  wrongBaseChance,
  zoneScaleFor,
  ballBumpFor,
} from './quirks';
import { cpuWantsSteal, rollSteal } from './steal';

const plain = (over: Partial<Character> = {}): Character => ({
  id: 'x',
  name: 'X',
  tagline: '',
  voiceGender: 'boy',
  stats: { contact: 5, power: 5, speed: 5, pitching: 5, fielding: 5 },
  visual: { skin: 0, hair: 'short', hairColor: 0, uniform: 0, accessory: 'none' },
  ability: 'none',
  ...over,
});

/** A seeded stream that also counts its draws. */
const counted = (seed = 1) => {
  let a = seed;
  let n = 0;
  const rng = () => {
    n++;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(rng, { draws: () => n });
};

const BANDS: PitchBand[] = ['perfect', 'good', 'weak', 'wild'];
const plan = (x: number, y: number): PitchPlan => ({
  kind: 'fastball',
  target: { x, y },
  actual: { x, y },
  inZone: Math.abs(x) <= PLATE_ZONE.W / 2 && Math.abs(y) <= PLATE_ZONE.H / 2,
  travelMs: 600,
});

describe('the roster carries the behaviours the cast sheet gives it', () => {
  it('★ exactly these twenty-five kids have a quirk — a new one is a decision, not a typo', () => {
    const got = Object.fromEntries(ROSTER.filter((c) => c.quirk).map((c) => [c.id, c.quirk]));
    const want: Record<string, Quirk> = {
      calls_shot: 'moonshot',
      wheelchair_ace: 'wobble',
      rocket: 'green_light',
      boomer: 'wild_arm',
      peaches: 'same_spot',
      cricket: 'never_swings',
      clover: 'foul_back',
      penny: 'clutch_behind',
      dex: 'clutch_risp',
      bubbles: 'clutch_runners',
      moose: 'wrong_base',
      noodle: 'hit_by_pitch',
      sprout: 'always_bunts',
      lefty: 'one_curve',
      bend_it: 'the_loop',
      the_prof: 'rainbow',
      smokey: 'heater',
      diva: 'velocity',
      gizmo: 'forty_percent',
      tank: 'brick_house',
      grizz: 'sure_hands',
      turbo: 'never_tagged',
      flash: 'fence_arm',
      ace_kid: 'plays_alone',
      mimi_mash: 'eyes_closed',
    };
    expect(got).toEqual(want);
  });

  it('Zaya, and only Zaya, says nothing during a game', () => {
    expect(ROSTER.filter((c) => c.silentInGame).map((c) => c.id)).toEqual(['rocket']);
  });
});

describe('★ a kid without a quirk is untouched, and costs no extra roll', () => {
  const kid = plain();
  it('every hook hands back the unmodified value', () => {
    const p = plan(10, 10);
    expect(planForBatter(p, kid)).toBe(p);
    expect(zoneScaleFor(kid)).toBe(1);
    const m = { bases: [true, true, true] as const, lead: -5 };
    expect(clutchFiring(kid, m)).toBe(false);
    expect(batterInMoment(kid, m)).toBe(kid);
    expect(foulChance(kid)).toBe(0.25);
    expect(scatterMultFor(kid)).toBe(1);
    expect(ballBumpFor(kid)).toBe(0);
    expect(stealEdgeFor(kid)).toBe(0);
    expect(wrongBaseChance(kid)).toBe(0);
  });

  it('the at-bat, the pitch and the steal draw exactly what they drew before', () => {
    // Contact in play: foul check is skipped on a good band, then quality,
    // contact type and spray — three draws, as it has always been.
    const a = counted(7);
    resolveContact('good', kid, kid, a);
    expect(a.draws()).toBe(3);
    // A located pitch: two scatter draws, with or without the default mult.
    const b = counted(7);
    const c = counted(7);
    const p1 = resolvePitchLocation('fastball', { x: 0, y: 0 }, 5, 100, 600, b);
    const p2 = resolvePitchLocation('fastball', { x: 0, y: 0 }, 5, 100, 600, c, scatterMultFor(kid));
    expect(b.draws()).toBe(2);
    expect(p2).toEqual(p1);
    // The CPU's own choice of pitch is the same pitch.
    expect(chooseCpuPitch(6, { balls: 1, strikes: 1 }, 600, counted(3), 1)).toEqual(
      chooseCpuPitch(6, { balls: 1, strikes: 1 }, 600, counted(3))
    );
    // A steal: one draw each for the decision and the race.
    const d = counted(7);
    cpuWantsSteal(7, d);
    rollSteal({ runnerSpeed: 7, catcherArm: 5, pitchKind: null }, d);
    expect(d.draws()).toBe(2);
  });
});

describe('Winnie has never swung the bat', () => {
  const winnie = getCharacter('cricket');
  it('her zone is the smallest around', () => {
    const edge = { x: PLATE_ZONE.W / 2 - 4, y: 0 };
    expect(inZoneFor(edge, plain())).toBe(true);
    expect(inZoneFor(edge, winnie)).toBe(false);
    expect(inZoneFor({ x: 0, y: 0 }, winnie)).toBe(true);
    expect(planForBatter(plan(edge.x, 0), winnie).inZone).toBe(false);
  });

  it('she takes every pitch, in the zone or out of it, in both games', () => {
    const rng = counted(11);
    for (let i = 0; i < 400; i++) {
      const band = BANDS[i % 4];
      expect(resolveCpuPitch(band, plain({ stats: { ...plain().stats, pitching: 9 } }), winnie, rng).cpuSwings).toBe(false);
      const p = plan((rng() - 0.5) * 140, (rng() - 0.5) * 140);
      const r = resolveCpuPitchLocated(p, band, winnie, rng);
      expect(r.cpuSwings).toBe(false);
      expect(r.isBall).toBe(!inZoneFor(p.actual, winnie));
    }
  });

  it('so she walks far more than she strikes out looking, off an ordinary arm', () => {
    const rng = counted(5);
    let balls = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) if (resolveCpuPitch('good', plain(), winnie, rng).isBall) balls++;
    expect(balls / N).toBeCloseTo(QUIRKS.NEVER_SWINGS_BALL.good, 1);
    // The CPU's own pitching at a human-controlled Winnie comes in wild.
    let wild = 0;
    for (let i = 0; i < N; i++) if (rollAiWildPitch(plain(), rng, winnie)) wild++;
    expect(wild / N).toBeCloseTo(QUIRKS.NEVER_SWINGS_WILD, 1);
  });
});

describe('the Clutch kids are ordinary until their moment', () => {
  const nora = getCharacter('penny');
  const marcus = getCharacter('dex');
  const yui = getCharacter('bubbles');
  const empty = [false, false, false] as const;
  const onFirst = [true, false, false] as const;
  const onSecond = [false, true, false] as const;

  it('Nora shows up when her team is losing, and only then', () => {
    expect(clutchFiring(nora, { bases: empty, lead: -1 })).toBe(true);
    expect(clutchFiring(nora, { bases: [true, true, true], lead: 0 })).toBe(false);
    expect(clutchFiring(nora, { bases: empty, lead: 3 })).toBe(false);
  });

  it('Marcus needs a runner in scoring position and a game that is tied or worse', () => {
    expect(clutchFiring(marcus, { bases: onSecond, lead: 0 })).toBe(true);
    expect(clutchFiring(marcus, { bases: onSecond, lead: -2 })).toBe(true);
    expect(clutchFiring(marcus, { bases: onSecond, lead: 1 })).toBe(false);
    expect(clutchFiring(marcus, { bases: onFirst, lead: -2 })).toBe(false);
  });

  it('Yui is only good with somebody on, whatever the score', () => {
    expect(clutchFiring(yui, { bases: onFirst, lead: 5 })).toBe(true);
    expect(clutchFiring(yui, { bases: empty, lead: -5 })).toBe(false);
  });

  it("in the moment she bats with the sheet's power, and is herself otherwise", () => {
    const hot = batterInMoment(nora, { bases: empty, lead: -1 });
    expect(hot.stats.power).toBe(QUIRKS.CLUTCH_POWER);
    expect({ ...hot.stats, power: 0 }).toEqual({ ...nora.stats, power: 0 });
    expect(batterInMoment(nora, { bases: empty, lead: 0 })).toBe(nora);
    // The roster object itself is never written to.
    expect(getCharacter('penny').stats.power).toBe(5);
  });
});

describe("Mars's Moonshot: perfect timing and it is gone", () => {
  const mars = getCharacter('calls_shot');
  const dev = getCharacter('wheelchair_ace'); // throws the pitch nobody can hit

  it('★ every perfectly timed swing is a home run, even off the wobble', () => {
    const rng = counted(21);
    for (let i = 0; i < 300; i++) {
      const out = resolveContact('perfect', mars, dev, rng);
      expect(out.kind).toBe('inPlay');
      if (out.kind === 'inPlay') expect(out.launch.homer).toBe(true);
    }
  });

  it('the same when she aims it — anywhere on the bat', () => {
    const rng = counted(22);
    for (let i = 0; i < 300; i++) {
      const p = plan(0, 0);
      const cursor = { x: CURSOR.SWEET_R + 10, y: 8 }; // out on the fringe
      const { swing } = resolveContactAimed({ band: 'perfect', errorMs: 0, cursor, plan: p, batter: mars, pitcher: dev, rng });
      expect(swing.kind).toBe('inPlay');
      if (swing.kind === 'inPlay') expect(swing.launch.homer).toBe(true);
    }
  });

  it('but she is wrong constantly: swing where the ball is not and it is a strike', () => {
    const cursor = { x: CURSOR.CONTACT_R + 5, y: 0 };
    const { swing } = resolveContactAimed({ band: 'perfect', errorMs: 0, cursor, plan: plan(0, 0), batter: mars, pitcher: plain(), rng: counted(1) });
    expect(swing.kind).toBe('strike');
  });

  it('and good timing is only good timing', () => {
    const rng = counted(23);
    let homers = 0;
    for (let i = 0; i < 300; i++) {
      const out = resolveContact('good', mars, plain(), rng);
      if (out.kind === 'inPlay' && out.launch.homer) homers++;
    }
    expect(homers).toBeLessThan(150);
    expect(JUICE.CALLED_SHOT_Q_FLOOR).toBeGreaterThan(1.18); // the floor she is lifted to clears the park
  });
});

describe('Josie fouls them back, and Hattie hits the same spot', () => {
  const josie = getCharacter('clover');
  const hattie = getCharacter('peaches');

  it('Josie turns most weak contact into a foul at the pitcher', () => {
    const rng = counted(31);
    const count = (kid: Character) => {
      let fouls = 0;
      for (let i = 0; i < 4000; i++) if (resolveContact('weak', kid, plain(), rng).kind === 'foul') fouls++;
      return fouls / 4000;
    };
    expect(count(josie)).toBeCloseTo(QUIRKS.FOUL_BACK, 1);
    expect(count(plain())).toBeCloseTo(0.25, 1);
    const out = resolveContact('weak', josie, plain(), () => 0);
    expect(out.kind === 'foul' && out.description).toBe('Fouled it back at the pitcher!');
  });

  it('★ every ball Hattie puts in play lands in one place: a soft liner to left', () => {
    const rng = counted(41);
    const spots = new Set<string>();
    for (let i = 0; i < 300; i++) {
      for (const band of ['perfect', 'good', 'weak'] as const) {
        const out = resolveContact(band, hattie, plain(), rng);
        if (out.kind !== 'inPlay') continue;
        expect(out.launch.type).toBe('liner');
        expect(out.launch.homer).toBe(false);
        spots.add(`${out.launch.landing.x.toFixed(3)},${out.launch.landing.y.toFixed(3)}`);
      }
    }
    expect(spots.size).toBe(1);
    const [x, y] = [...spots][0].split(',').map(Number);
    expect(x).toBeLessThan(HOME.x); // left of the plate
    expect(Math.hypot(x - HOME.x, y - HOME.y)).toBeCloseTo(QUIRKS.SAME_SPOT.DIST, 0);
  });

  it('and aiming it changes nothing — but a bunt is still a bunt', () => {
    const at = (cx: number, err: number, swingType?: 'bunt') =>
      resolveContactAimed({ band: 'good', errorMs: err, cursor: { x: cx, y: 0 }, plan: plan(0, 0), batter: hattie, pitcher: plain(), rng: counted(9), swingType });
    const a = at(-10, -120).swing;
    const b = at(12, 140).swing;
    expect(a.kind).toBe('inPlay');
    if (a.kind === 'inPlay' && b.kind === 'inPlay') expect(b.launch.landing).toEqual(a.launch.landing);
    const bunt = at(0, 0, 'bunt').swing;
    if (bunt.kind === 'inPlay') expect(bunt.launch.type).toBe('grounder');
  });
});

describe('Kwame has no idea where it goes, and neither does Dev', () => {
  const kwame = getCharacter('boomer');
  const dev = getCharacter('wheelchair_ace');

  it('the same throw off the same roll lands wider by exactly their multiplier', () => {
    const at = (mult: number) => resolvePitchLocation('fastball', { x: 0, y: 0 }, 9, 0, 600, counted(3), mult).actual;
    const base = at(1);
    for (const kid of [kwame, dev]) {
      const k = scatterMultFor(kid);
      expect(k).toBeGreaterThan(1);
      expect(at(k).x).toBeCloseTo(base.x * k, 6);
      expect(at(k).y).toBeCloseTo(base.y * k, 6);
    }
    expect(scatterMultFor(kwame)).toBeGreaterThan(scatterMultFor(dev));
  });

  it('so Kwame walks more batters than an ordinary arm with his stat', () => {
    const balls = (mult: number) => {
      const rng = counted(77);
      let n = 0;
      for (let i = 0; i < 3000; i++) if (!chooseCpuPitch(9, { balls: 0, strikes: 0 }, 600, rng, mult).inZone) n++;
      return n / 3000;
    };
    expect(balls(scatterMultFor(kwame))).toBeGreaterThan(balls(1) + 0.03);
  });

  it('and where a pitch has no location, more of his are balls', () => {
    const rate = (pitcher: Character) => {
      const rng = counted(78);
      let n = 0;
      for (let i = 0; i < 4000; i++) if (resolveCpuPitch('good', pitcher, plain(), rng).isBall) n++;
      return n / 4000;
    };
    const ordinary = plain({ stats: { ...plain().stats, pitching: 9 } });
    expect(rate(kwame)).toBeGreaterThan(rate(ordinary) + 0.1);
  });
});

describe('Zaya has the green light', () => {
  const zaya = getCharacter('rocket');
  it('she goes about half the time, on her own', () => {
    const rng = counted(51);
    let go = 0;
    for (let i = 0; i < 4000; i++) if (cpuWantsSteal(zaya.stats.speed, rng, true)) go++;
    expect(go / 4000).toBeCloseTo(QUIRKS.GREEN_LIGHT_GO, 1);
  });

  it('and gets a better jump than her speed alone buys — under the same ceiling', () => {
    const safe = (edge: number, arm: number) => {
      const rng = counted(52);
      let n = 0;
      for (let i = 0; i < 4000; i++) if (rollSteal({ runnerSpeed: 10, catcherArm: arm, pitchKind: null, edge }, rng)) n++;
      return n / 4000;
    };
    expect(safe(stealEdgeFor(zaya), 10)).toBeGreaterThan(safe(0, 10) + 0.1);
    expect(safe(stealEdgeFor(zaya), 1)).toBeLessThan(0.95); // the 0.92 cap still holds
  });

  it('★ and she does not say one word all game, without spending anyone else a roll', () => {
    const rng = counted(1);
    const chatter = new Chatter(rng);
    for (let t = 0; t < 50; t++) expect(chatter.pick('batterUp', t * 100000, zaya)).toBeNull();
    expect(rng.draws()).toBe(0);
  });
});

describe('Roya: incredible arm, catastrophic judgment', () => {
  const POSITIONS: PositionId[] = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const main = resolveLiveParams('main');
  const kid = resolveLiveParams('kid');

  /** A grounder to short with a runner on first, CPU defence, Roya at `where`. */
  const play = (where: PositionId | null, params = main, seed = 1, wrongBase = 1) => {
    const rng = counted(seed);
    const launch = resolveContact('good', plain(), plain(), counted(seed + 100));
    if (launch.kind !== 'inPlay') return null;
    let s: LivePlayState = startLivePlay({
      mode: 'offense',
      launch: { ...launch.launch, homer: false },
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [{ base: 1, charId: 'r1', speed: 5 }],
      defense: POSITIONS.map((p, i) => ({ position: p, charId: `f${i}`, wrongBase: p === where ? wrongBase : undefined })),
      outs: 0,
      params,
    });
    const events: LiveEvent[] = [];
    let guard = 0;
    while (s.phase !== 'done' && guard++ < 6000) {
      s = stepLivePlay(s, { run: true }, 50, params, rng);
      events.push(...s.events);
    }
    return { s, events, draws: rng.draws() };
  };

  it('★ a play with her in it always ends, wherever she stands and whatever she throws at', () => {
    let wrong = 0;
    for (const where of POSITIONS) {
      for (let seed = 1; seed <= 40; seed++) {
        const r = play(where, main, seed);
        if (!r) continue;
        expect(r.s.phase, `${where} seed ${seed}`).toBe('done');
        const w = r.events.filter((e) => e.t === 'wrongBase');
        wrong += w.length;
        for (const e of w) {
          // The throw that follows goes exactly where the event says.
          const i = r.events.indexOf(e);
          const next = r.events[i + 1];
          expect(next.t).toBe('throw');
          if (next.t === 'throw' && e.t === 'wrongBase') expect(next.toBase).toBe(e.toBase);
        }
      }
    }
    expect(wrong).toBeGreaterThan(20); // she really does it
  });

  it('nobody else ever does, and a play without her draws what it always drew', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const without = play(null, main, seed);
      const dormant = play('SS', main, seed, 0);
      if (!without || !dormant) continue;
      expect(without.events.some((e) => e.t === 'wrongBase')).toBe(false);
      expect(dormant.draws).toBe(without.draws);
      expect(dormant.events).toEqual(without.events);
    }
  });

  it('kid mode never sees it — like every other fielding mistake', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = play('SS', kid, seed);
      if (r) expect(r.events.some((e) => e.t === 'wrongBase')).toBe(false);
    }
  });
});

// --- The second batch ---------------------------------------------------------

import { SWING_TYPES } from '../config';
import { newHalfInning, applyAtBat } from './inning';
import {
  alwaysBunts,
  batterMustChase,
  countWhenHit,
  hitByPitchChance,
  leansIn,
  pitchMenuFor,
  pitchOnMenu,
  planForPitcher,
  travelMultFor,
} from './quirks';

describe('the second batch leaves everyone else alone too', () => {
  const kid = plain();
  it('every new hook is the identity for a kid without the quirk', () => {
    const p = plan(0, 0);
    expect(planForPitcher(p, kid)).toBe(p);
    expect(travelMultFor(kid)).toBe(1);
    expect([...pitchMenuFor(kid)]).toEqual(['fastball', 'changeup', 'curve', 'screwball']);
    expect(pitchOnMenu(kid, 'fastball')).toBe('fastball');
    expect(batterMustChase(kid, 'curve')).toBe(false);
    expect(alwaysBunts(kid)).toBe(false);
    expect(leansIn(kid)).toBe(false);
    expect(hitByPitchChance(kid)).toBe(0);
  });

  it('and the CPU picks the same pitch off the same roll with the default menu', () => {
    expect(chooseCpuPitch(6, { balls: 0, strikes: 2 }, 600, counted(9), 1, pitchMenuFor(kid))).toEqual(
      chooseCpuPitch(6, { balls: 0, strikes: 2 }, 600, counted(9))
    );
  });
});

describe('Sam gets hit by the pitch on purpose', () => {
  const sam = getCharacter('noodle');
  it('he never chases a ball, in either game', () => {
    const rng = counted(61);
    for (let i = 0; i < 500; i++) {
      const a = resolveCpuPitch(BANDS[i % 4], plain(), sam, rng);
      if (a.isBall) expect(a.cpuSwings).toBe(false);
      const off = plan(PLATE_ZONE.W / 2 + 4 + rng() * 30, 0);
      expect(resolveCpuPitchLocated(off, 'good', sam, rng).cpuSwings).toBe(false);
    }
  });

  it('★ being hit is a free base by the walk rule: only forced runners move', () => {
    expect(hitByPitchChance(sam)).toBe(QUIRKS.HIT_BY_PITCH);
    // First pitch, runner on second only: he takes first, the runner stays.
    const before = { ...newHalfInning(), bases: [false, true, false] as [boolean, boolean, boolean], count: { balls: 0, strikes: 2 } };
    const hit = applyAtBat(countWhenHit(before), { kind: 'ball', bases: 0, description: '' });
    expect(hit.batterDone).toBe(true);
    expect(hit.batterOut).toBe(false);
    expect(hit.state.bases).toEqual([true, true, false]);
    expect(hit.state.count).toEqual({ balls: 0, strikes: 0 });
    expect(hit.state.outs).toBe(0);
    // Bases loaded: it forces a run in.
    const loaded = { ...newHalfInning(), bases: [true, true, true] as [boolean, boolean, boolean] };
    expect(applyAtBat(countWhenHit(loaded), { kind: 'ball', bases: 0, description: '' }).runsScored).toBe(1);
    // The state handed in is never written to.
    expect(before.count).toEqual({ balls: 0, strikes: 2 });
  });
});

describe('Rafi bunts every single pitch', () => {
  const rafi = getCharacter('sprout');
  const dist = (l: { x: number; y: number }) => Math.hypot(l.x - HOME.x, l.y - HOME.y);

  it('★ everything he puts in play is a bunt: a grounder dead in front of the plate', () => {
    const rng = counted(71);
    let n = 0;
    for (let i = 0; i < 600; i++) {
      const out = resolveContact((['perfect', 'good', 'weak'] as const)[i % 3], rafi, plain(), rng);
      if (out.kind !== 'inPlay') continue;
      n++;
      expect(out.launch.type).toBe('grounder');
      expect(out.launch.homer).toBe(false);
      expect(dist(out.launch.landing)).toBeLessThanOrEqual(SWING_TYPES.BUNT.DIST_CAP + 0.001);
    }
    expect(n).toBeGreaterThan(300);
  });

  it('whatever card he is handed — except his own crazy bunt', () => {
    const swing = (swingType: 'normal' | 'big' | 'crazyBunt') =>
      resolveContactAimed({ band: 'perfect', errorMs: 0, cursor: { x: 0, y: 0 }, plan: plan(0, 0), batter: rafi, pitcher: plain(), rng: counted(4), swingType }).swing;
    for (const t of ['normal', 'big'] as const) {
      const s = swing(t);
      expect(s.kind).toBe('inPlay');
      if (s.kind === 'inPlay') {
        expect(s.launch.type).toBe('grounder');
        expect(dist(s.launch.landing)).toBeLessThanOrEqual(SWING_TYPES.BUNT.DIST_CAP + 0.001);
      }
    }
    const crazy = swing('crazyBunt');
    if (crazy.kind === 'inPlay') expect(dist(crazy.launch.landing)).toBeLessThanOrEqual(SWING_TYPES.CRAZY_BUNT.DIST_CAP + 0.001);
  });
});

describe('Lu, Ezra and Bao throw what they throw', () => {
  const lu = getCharacter('lefty');
  const ezra = getCharacter('bend_it');
  const bao = getCharacter('the_prof');

  it('Lu has one pitch, and the CPU throws it every time', () => {
    expect([...pitchMenuFor(lu)]).toEqual(['curve']);
    const rng = counted(81);
    for (let i = 0; i < 200; i++) {
      expect(chooseCpuPitch(9, { balls: i % 4, strikes: i % 3 }, 600, rng, 1, pitchMenuFor(lu)).kind).toBe('curve');
    }
    expect(pitchOnMenu(lu, 'fastball')).toBe('curve');
    expect(pitchOnMenu(lu, 'fireball')).toBe('fireball'); // juice is juice
  });

  it('Ezra has never thrown a fastball, and still throws everything else', () => {
    expect(pitchMenuFor(ezra)).not.toContain('fastball');
    const rng = counted(82);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(chooseCpuPitch(9, { balls: 0, strikes: 0 }, 600, rng, 1, pitchMenuFor(ezra)).kind);
    expect([...seen].sort()).toEqual(['changeup', 'curve', 'screwball']);
    expect(pitchOnMenu(ezra, 'fastball')).toBe('changeup');
  });

  it('batters always go after his curve, and nobody else\'s', () => {
    expect(batterMustChase(ezra, 'curve')).toBe(true);
    expect(batterMustChase(ezra, 'changeup')).toBe(false);
    expect(batterMustChase(lu, 'curve')).toBe(false);
    const rng = counted(83);
    const off = { ...plan(PLATE_ZONE.W / 2 + 30, 0), kind: 'curve' as const };
    let chased = 0;
    for (let i = 0; i < 300; i++) {
      expect(resolveCpuPitchLocated(off, 'good', plain(), rng, true).cpuSwings).toBe(true);
      if (resolveCpuPitchLocated(off, 'good', plain(), rng).cpuSwings) chased++;
    }
    expect(chased).toBeLessThan(150);
  });

  it("Bao's pitch takes half again as long to get there, and is otherwise the same pitch", () => {
    const p = plan(3, 4);
    const slow = planForPitcher(p, bao);
    expect(slow.travelMs).toBeCloseTo(p.travelMs * QUIRKS.RAINBOW_TRAVEL, 6);
    expect({ ...slow, travelMs: 0 }).toEqual({ ...p, travelMs: 0 });
    expect(QUIRKS.RAINBOW_TRAVEL).toBeGreaterThan(1.3);
  });
});

// --- The third batch ----------------------------------------------------------

import { againstWobbler, swingLate, type CpuPitchPlan } from './pitch';
import { basePos } from './geometry';
import {
  ballVisibleUntil,
  blindSwingBand,
  cannonFor,
  chaseSpeedFor,
  cpuBlindBand,
  heaterPlan,
  lateSwingChance,
  neverTagged,
  reachMultFor,
  refusesRelief,
  rollWobbler,
  sureHands,
  swingsBlind,
  throwsHeater,
  wobblerKind,
  wobblerTravelMult,
} from './quirks';

const swings = (cpuBand: CpuPitchPlan['cpuBand']): CpuPitchPlan => ({ isBall: false, cpuSwings: true, cpuBand, description: '' });

describe('the third batch leaves everyone else alone too', () => {
  const kid = plain();
  it('★ every new hook is the identity for a kid without the quirk, and draws nothing', () => {
    const rng = counted(5);
    expect(throwsHeater(kid, 'fastball', false)).toBe(false);
    expect(throwsHeater(kid, null, false)).toBe(false);
    expect(refusesRelief(kid)).toBe(false);
    expect(lateSwingChance(kid, false)).toBe(0);
    expect(rollWobbler(kid, 'changeup', rng)).toBeNull();
    expect(rollWobbler(kid, null, rng)).toBeNull();
    expect(wobblerKind(null, 'curve')).toBe('curve');
    expect(wobblerTravelMult(null)).toBe(1);
    expect(sureHands(kid)).toBe(false);
    expect(reachMultFor(kid)).toBe(1);
    expect(cannonFor(kid)).toBe(1);
    expect(chaseSpeedFor(kid)).toBe(kid.stats.speed);
    expect(neverTagged(kid)).toBe(false);
    expect(swingsBlind(kid)).toBe(false);
    expect(ballVisibleUntil(kid)).toBe(1);
    expect(cpuBlindBand(kid, rng)).toBeNull();
    for (const b of ['miss', 'weak', 'good', 'perfect'] as const) expect(blindSwingBand(kid, b)).toBe(b);
    const p = swings('good');
    expect(swingLate(p, lateSwingChance(kid, false), rng)).toBe(p);
    expect(againstWobbler(p, null)).toBe(p);
    expect(rng.draws()).toBe(0);
  });

  it('and the CPU batter draws exactly what it drew: Yaz swaps one roll for one roll', () => {
    const a = counted(9);
    const b = counted(9);
    resolveCpuPitch('perfect', kid, kid, a);
    resolveCpuPitch('perfect', kid, getCharacter('mimi_mash'), b);
    expect(b.draws()).toBe(a.draws());
  });
});

describe('Jay throws the Heater, and will not come out', () => {
  const jay = getCharacter('smokey');
  it('one a half inning: his first fastball, or his first pitch where pitches have no kind', () => {
    expect(throwsHeater(jay, 'fastball', false)).toBe(true);
    expect(throwsHeater(jay, null, false)).toBe(true);
    expect(throwsHeater(jay, 'curve', false)).toBe(false);
    expect(throwsHeater(jay, 'fireball', false)).toBe(false);
    expect(throwsHeater(jay, 'fastball', true)).toBe(false);
    expect(throwsHeater(jay, null, true)).toBe(false);
  });

  it('it gets there sooner and is otherwise the same pitch', () => {
    const p = plan(10, -5);
    expect(heaterPlan(p)).toEqual({ ...p, travelMs: p.travelMs * QUIRKS.HEATER_TRAVEL });
    expect(QUIRKS.HEATER_TRAVEL).toBeLessThan(1);
  });

  it('a CPU batter is always late on it — settled without a roll', () => {
    const rng = counted(3);
    expect(lateSwingChance(jay, true)).toBe(1);
    expect(swingLate(swings('perfect'), 1, rng).cpuBand).toBe('good');
    expect(swingLate(swings('weak'), 1, rng).cpuBand).toBe('miss');
    expect(rng.draws()).toBe(0);
    // His other pitches are just pitches, and a batter who takes is not late.
    expect(lateSwingChance(jay, false)).toBe(0);
    const take: CpuPitchPlan = { isBall: true, cpuSwings: false, cpuBand: 'miss', description: '' };
    expect(swingLate(take, 1, rng)).toBe(take);
  });

  it('nobody relieves him', () => {
    expect(refusesRelief(jay)).toBe(true);
    expect(ROSTER.filter(refusesRelief).map((c) => c.id)).toEqual(['smokey']);
  });
});

describe('Roz throws harder than Jay', () => {
  const roz = getCharacter('diva');
  it('every pitch of hers arrives early', () => {
    expect(travelMultFor(roz)).toBe(QUIRKS.VELOCITY_TRAVEL);
    expect(QUIRKS.VELOCITY_TRAVEL).toBeLessThan(1);
    const p = plan(0, 0);
    expect(planForPitcher(p, roz).travelMs).toBeCloseTo(p.travelMs * QUIRKS.VELOCITY_TRAVEL);
  });

  it('and a CPU batter is late on about three in ten', () => {
    const rng = counted(21);
    let late = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) if (swingLate(swings('good'), lateSwingChance(roz, false), rng).cpuBand === 'weak') late++;
    expect(late / N).toBeGreaterThan(QUIRKS.VELOCITY_LATE - 0.04);
    expect(late / N).toBeLessThan(QUIRKS.VELOCITY_LATE + 0.04);
    expect(rng.draws()).toBe(N);
  });
});

describe('Musa has one pitch, and it works 40% of the time', () => {
  const musa = getCharacter('gizmo');
  it('there is no plan B on the menu', () => {
    expect(pitchMenuFor(musa)).toEqual(['changeup']);
    expect(pitchOnMenu(musa, 'fastball')).toBe('changeup');
    expect(pitchOnMenu(musa, 'fireball')).toBe('fireball');
  });

  it('★ it works at the rate on the sheet', () => {
    const rng = counted(17);
    let works = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) if (rollWobbler(musa, i % 2 ? 'changeup' : null, rng) === 'works') works++;
    expect(works / N).toBeGreaterThan(0.37);
    expect(works / N).toBeLessThan(0.43);
    // A juice special is not the wobbler.
    expect(rollWobbler(musa, 'fireball', rng)).toBeNull();
    expect(rng.draws()).toBe(N);
  });

  it('when it works it wobbles and fools the swing; when it does not it floats and gets hit', () => {
    expect(wobblerKind('works', 'changeup')).toBe('crazy');
    expect(wobblerKind('flat', 'changeup')).toBe('changeup');
    expect(wobblerTravelMult('works')).toBe(1);
    expect(wobblerTravelMult('flat')).toBe(QUIRKS.WOBBLER_FLAT_TRAVEL);
    expect(againstWobbler(swings('good'), 'works').cpuBand).toBe('weak');
    expect(againstWobbler(swings('good'), 'flat').cpuBand).toBe('perfect');
  });
});

describe('Yaz swings with her eyes closed', () => {
  const yaz = getCharacter('mimi_mash');
  it('a human loses the ball halfway, and whatever she touches goes up a band', () => {
    expect(ballVisibleUntil(yaz)).toBe(QUIRKS.EYES_CLOSED_AT);
    expect(blindSwingBand(yaz, 'miss')).toBe('miss');
    expect(blindSwingBand(yaz, 'weak')).toBe('good');
    expect(blindSwingBand(yaz, 'good')).toBe('perfect');
    expect(blindSwingBand(yaz, 'perfect')).toBe('perfect');
  });

  it('the CPU plays her as a lottery: more perfect contact AND more misses than her stat buys', () => {
    const tally = (kid: Character) => {
      const rng = counted(31);
      const got = { perfect: 0, good: 0, weak: 0, miss: 0 };
      for (let i = 0; i < 6000; i++) got[resolveCpuPitch('good', plain(), kid, rng).cpuBand]++;
      return got;
    };
    const blind = tally(yaz);
    const sighted = tally({ ...yaz, quirk: undefined });
    expect(blind.perfect).toBeGreaterThan(sighted.perfect);
    expect(blind.miss).toBeGreaterThan(sighted.miss);
  });
});

describe('the Walls, the Cannons and the kid nobody has tagged', () => {
  const POSITIONS: PositionId[] = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const main = resolveLiveParams('main');
  type Flags = { sure?: boolean; reach?: number; cannon?: number };

  /** Hard contact with a runner on first against a CPU defence of nine `flags` kids. */
  const play = (flags: Flags, seed: number, band: 'good' | 'perfect' = 'perfect') => {
    const rng = counted(seed);
    const launch = resolveContact(band, plain(), plain(), counted(seed + 100));
    if (launch.kind !== 'inPlay' || launch.launch.homer) return null;
    let s: LivePlayState = startLivePlay({
      mode: 'offense',
      launch: launch.launch,
      batter: { charId: 'bat', speed: 5 },
      baseRunners: [{ base: 1, charId: 'r1', speed: 5 }],
      defense: POSITIONS.map((p, i) => ({ position: p, charId: `f${i}`, ...flags })),
      outs: 0,
      params: main,
    });
    const events: LiveEvent[] = [];
    let guard = 0;
    while (s.phase !== 'done' && guard++ < 6000) {
      s = stepLivePlay(s, { run: true }, 50, main, rng);
      events.push(...s.events);
    }
    return { s, events, draws: rng.draws() };
  };
  const sweep = (flags: Flags) => {
    const all: LiveEvent[] = [];
    for (let seed = 1; seed <= 120; seed++) {
      const r = play(flags, seed, seed % 2 ? 'perfect' : 'good');
      if (!r) continue;
      expect(r.s.phase, `seed ${seed}`).toBe('done');
      all.push(...r.events);
    }
    return all;
  };
  const muffs = (ev: LiveEvent[]) => ev.filter((e) => e.t === 'error' && e.kind !== 'wild').length;

  it('flags that say nothing change nothing: same events, same draws', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = play({}, seed);
      const b = play({ sure: false, reach: 1, cannon: 1 }, seed);
      if (!a || !b) continue;
      expect(b.events).toEqual(a.events);
      expect(b.draws).toBe(a.draws);
    }
  });

  it('★ Sonny and Greta have never dropped anything', () => {
    expect(sureHands(getCharacter('tank'))).toBe(true);
    expect(sureHands(getCharacter('grizz'))).toBe(true);
    expect(muffs(sweep({}))).toBeGreaterThan(0); // ordinary kids do drop them
    expect(muffs(sweep({ sure: true }))).toBe(0);
  });

  it('Sonny reaches further than anyone, and Greta does not', () => {
    expect(reachMultFor(getCharacter('tank'))).toBe(QUIRKS.BRICK_HOUSE_REACH);
    expect(reachMultFor(getCharacter('grizz'))).toBe(1);
    // A longer reach gets to more balls in the air: more fly outs, never fewer.
    const catches = (ev: LiveEvent[]) => ev.filter((e) => e.t === 'catch').length;
    expect(catches(sweep({ sure: true, reach: QUIRKS.BRICK_HOUSE_REACH }))).toBeGreaterThanOrEqual(
      catches(sweep({ sure: true }))
    );
  });

  it('★ a Cannon throws at the bag from the fence: no relay, no wild one, and the play still ends', () => {
    expect(cannonFor(getCharacter('flash'))).toBe(QUIRKS.CANNON_SPEED);
    expect(cannonFor(getCharacter('ace_kid'))).toBe(QUIRKS.CANNON_SPEED);
    const ordinary = sweep({});
    const cannons = sweep({ cannon: QUIRKS.CANNON_SPEED });
    expect(ordinary.filter((e) => e.t === 'relay').length).toBeGreaterThan(0);
    expect(ordinary.some((e) => e.t === 'fenceThrow')).toBe(false);
    expect(cannons.filter((e) => e.t === 'relay').length).toBe(0);
    expect(cannons.filter((e) => e.t === 'fenceThrow').length).toBeGreaterThan(0);
    expect(cannons.some((e) => e.t === 'error' && e.kind === 'wild')).toBe(false);
    // And it is worth something: more outs than the same nine kids relaying.
    const outs = (ev: LiveEvent[]) => ev.filter((e) => e.t === 'out').length;
    expect(outs(cannons)).toBeGreaterThan(outs(ordinary));
  });

  it('Amir covers the ground himself', () => {
    const amir = getCharacter('ace_kid');
    expect(chaseSpeedFor(amir)).toBe(QUIRKS.ALONE_RANGE);
    expect(chaseSpeedFor(amir)).toBeGreaterThan(amir.stats.speed);
    expect(chaseSpeedFor(getCharacter('flash'))).toBe(getCharacter('flash').stats.speed);
  });

  it('★ a carrier standing on Ollie between the bags tags anyone else, and not him', () => {
    expect(neverTagged(getCharacter('turbo'))).toBe(true);
    const caught = (untaggable: boolean) => {
      const launch = resolveContact('good', plain(), plain(), counted(3));
      if (launch.kind !== 'inPlay') throw new Error('fixture');
      const s: LivePlayState = startLivePlay({
        mode: 'offense',
        launch: { ...launch.launch, homer: false },
        batter: { charId: 'bat', speed: 5 },
        baseRunners: [{ base: 1, charId: 'r1', speed: 5, untaggable }],
        defense: POSITIONS.map((p, i) => ({ position: p, charId: `f${i}` })),
        outs: 0,
        params: main,
      });
      // Put the ball in the shortstop's glove and stand him on the runner,
      // who is halfway from first to second.
      const r = s.runners.find((x) => x.charId === 'r1')!;
      const a = basePos(1);
      const b = basePos(2);
      r.from = 1;
      r.to = 2;
      r.progress = 0.5;
      r.legMs = 4000;
      r.pos = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const idx = s.fielders.findIndex((f) => f.position === 'SS');
      s.fielders.forEach((f, i) => (f.hasBall = i === idx));
      s.fielders[idx].pos = { ...r.pos };
      s.ball.phase = 'held';
      s.ball.heldBy = idx;
      s.ball.pos = { ...r.pos };
      s.active = idx;
      s.heldAt = s.elapsed;
      const next = stepLivePlay(s, {}, 16, main, counted(1));
      return next.runners.find((x) => x.charId === 'r1')!.done === 'out';
    };
    expect(caught(false)).toBe(true);
    expect(caught(true)).toBe(false);
  });

  it('a play with him caught between bags still ends: a ball that beats him to a bag retires him', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = counted(seed);
      const launch = resolveContact('good', plain(), plain(), counted(seed + 100));
      if (launch.kind !== 'inPlay' || launch.launch.homer) continue;
      let s: LivePlayState = startLivePlay({
        mode: 'offense',
        launch: launch.launch,
        batter: { charId: 'bat', speed: 5, untaggable: true },
        baseRunners: [{ base: 1, charId: 'r1', speed: 5, untaggable: true }],
        defense: POSITIONS.map((p, i) => ({ position: p, charId: `f${i}` })),
        outs: 0,
        params: main,
      });
      let guard = 0;
      while (s.phase !== 'done' && guard++ < 6000) s = stepLivePlay(s, { run: true }, 50, main, rng);
      expect(s.phase, `seed ${seed}`).toBe('done');
    }
  });
});

// --- The family, and Friday ---------------------------------------------------

import { playsWithSibling, pitchLabelFor, siblingOf, sitsOnFriday, withFamily, SIBLINGS } from './quirks';
import { FRIDAY, teamForDay } from './season';

describe('siblings are better together', () => {
  const roz = getCharacter('diva');
  const rudy = getCharacter('flash');
  it('the sheet has two pairs, and every id in them is on the roster', () => {
    expect(SIBLINGS).toEqual([
      ['diva', 'flash'],
      ['peaches', 'bend_it'],
    ]);
    for (const id of SIBLINGS.flat()) expect(ROSTER.some((c) => c.id === id)).toBe(true);
    expect(siblingOf('diva')).toBe('flash');
    expect(siblingOf('bend_it')).toBe('peaches');
    expect(siblingOf('chip')).toBeNull();
  });

  it('★ apart, or on a team without them, a kid is the very same object', () => {
    expect(withFamily(roz, ['diva', 'chip'])).toBe(roz);
    expect(withFamily(roz, ['flash', 'chip'])).toBe(roz); // her sister is there; she is not
    expect(withFamily(plain(), ['diva', 'flash', 'x'])).toEqual(plain());
    expect(playsWithSibling(roz, ['diva', 'chip'])).toBe(false);
  });

  it('together, both are one better at everything, and nobody passes ten', () => {
    const team = ['diva', 'flash', 'chip'];
    const r = withFamily(rudy, team).stats;
    expect(r.contact).toBe(rudy.stats.contact + QUIRKS.SIBLING_BONUS);
    expect(r.fielding).toBe(Math.min(10, rudy.stats.fielding + QUIRKS.SIBLING_BONUS));
    expect(withFamily(roz, team).stats.pitching).toBe(10);
    expect(withFamily(roz, team).quirk).toBe('velocity'); // still herself
  });
});

describe('Ezra does not play on Fridays', () => {
  const sits = (id: string) => sitsOnFriday(getCharacter(id));
  const bench = ROSTER.map((c) => c.id);
  const mine = ['bend_it', 'chip', 'turbo', 'tank', 'grizz', 'flash', 'ace_kid', 'sniffles', 'zippy'];
  const theirs = ['smokey', 'diva', 'gizmo', 'penny', 'dex', 'bubbles', 'lefty', 'the_prof', 'moose'];

  it('he is the only one', () => {
    expect(ROSTER.filter(sitsOnFriday).map((c) => c.id)).toEqual(['bend_it']);
  });

  it('★ Monday to Thursday the team is the team', () => {
    for (let g = 0; g < FRIDAY; g++) {
      const d = teamForDay(mine, theirs, g, bench, sits);
      expect(d.team).toBe(mine);
      expect(d.swaps).toEqual([]);
    }
  });

  it('★ on Friday a kid from the block fills his slot: nine, no duplicates, nobody from either team', () => {
    const d = teamForDay(mine, theirs, FRIDAY, bench, sits);
    expect(d.team).toHaveLength(9);
    expect(d.team).not.toContain('bend_it');
    expect(new Set(d.team).size).toBe(9);
    expect(d.swaps).toHaveLength(1);
    expect(d.swaps[0].out).toBe('bend_it');
    expect(mine).not.toContain(d.swaps[0].in);
    expect(theirs).not.toContain(d.swaps[0].in);
    expect(d.team.indexOf(d.swaps[0].in)).toBe(0); // in his slot
    expect(mine).toContain('bend_it'); // the week's own nine is untouched
  });

  it('a team without him is untouched on Friday, and with nobody left to ask he plays', () => {
    expect(teamForDay(theirs, mine, FRIDAY, bench, sits).team).toBe(theirs);
    expect(teamForDay(mine, theirs, FRIDAY, [...mine, ...theirs], sits).team).toEqual(mine);
  });
});

describe("Musa's one card says what it is", () => {
  it('and nobody else gets a relabelled card', () => {
    expect(pitchLabelFor(getCharacter('gizmo'), 'changeup')).toBe('🎲 WOBBLER');
    expect(pitchLabelFor(getCharacter('gizmo'), 'fireball')).toBeUndefined();
    expect(pitchLabelFor(plain(), 'changeup')).toBeUndefined();
  });
});

// --- Where their story says they stand ----------------------------------------

import { autoAssign, validateLineup } from './lineup';
import { storyLineup } from './quirks';

describe('the auto lineup puts a kid where their story says', () => {
  const ids = ROSTER.map((c) => c.id);
  it('★ a nine with none of them comes back as the same plan', () => {
    const team = ['nostrike', 'calls_shot', 'smokey', 'rocket', 'zippy', 'big_lou', 'chip', 'peaches', 'sniffles'];
    const plan = autoAssign(team);
    expect(storyLineup(plan)).toBe(plan);
  });

  it('Sonny catches, Amir plays centre, Rudy is on the grass — and the plan is still a plan', () => {
    const team = ['tank', 'ace_kid', 'flash', 'smokey', 'chip', 'peaches', 'sniffles', 'zippy', 'big_lou'];
    const plan = storyLineup(autoAssign(team));
    expect(plan.positions.tank).toBe('C');
    expect(plan.positions.ace_kid).toBe('CF');
    expect(['LF', 'RF']).toContain(plan.positions.flash);
    expect(plan.pitcherId).toBe('smokey');
    expect(validateLineup(plan, team)).toBe(true);
    expect(plan.order).toEqual(autoAssign(team).order); // the batting order is not its business
  });

  it('★ every nine it is handed stays valid, and the pitcher never moves', () => {
    let a = 12345;
    const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 400; n++) {
      const team = [...ids].sort(() => rnd() - 0.5).slice(0, 9);
      const base = autoAssign(team);
      const plan = storyLineup(base);
      expect(validateLineup(plan, team)).toBe(true);
      expect(plan.pitcherId).toBe(base.pitcherId);
      expect(plan.positions[plan.pitcherId]).toBe('P');
      if (team.includes('tank') && base.pitcherId !== 'tank') expect(plan.positions.tank).toBe('C');
      if (team.includes('ace_kid') && base.pitcherId !== 'ace_kid') expect(plan.positions.ace_kid).toBe('CF');
      if (team.includes('flash') && base.pitcherId !== 'flash') expect(['LF', 'RF', 'CF']).toContain(plan.positions.flash);
    }
  });
});

// --- ...and in kid mode, which has no lineup plan ------------------------------

import { storyPosts } from './quirks';

describe('kid mode fields in draft order, with the story kids where they belong', () => {
  const POSTS: PositionId[] = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const at = (order: readonly string[], id: string) => POSTS[order.indexOf(id)];

  it('★ eight with none of them come back as the same array', () => {
    const eight = ['nostrike', 'calls_shot', 'rocket', 'zippy', 'big_lou', 'chip', 'peaches', 'sniffles'];
    expect(storyPosts(POSTS, eight)).toBe(eight);
  });

  it('Sonny catches, Amir plays centre, Rudy is on the grass', () => {
    const eight = ['chip', 'peaches', 'tank', 'flash', 'sniffles', 'zippy', 'big_lou', 'ace_kid'];
    const order = storyPosts(POSTS, eight);
    expect(at(order, 'tank')).toBe('C');
    expect(at(order, 'ace_kid')).toBe('CF');
    expect(['LF', 'RF']).toContain(at(order, 'flash'));
    expect([...order].sort()).toEqual([...eight].sort());
  });

  it('★ every eight it is handed is the same eight, each of the three in place', () => {
    let a = 54321;
    const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const ids = ROSTER.map((c) => c.id);
    for (let n = 0; n < 400; n++) {
      const eight = [...ids].sort(() => rnd() - 0.5).slice(0, 8);
      const order = storyPosts(POSTS, eight);
      expect([...order].sort()).toEqual([...eight].sort());
      if (eight.includes('tank')) expect(at(order, 'tank')).toBe('C');
      if (eight.includes('ace_kid')) expect(at(order, 'ace_kid')).toBe('CF');
      if (eight.includes('flash')) expect(['LF', 'RF', 'CF']).toContain(at(order, 'flash'));
    }
  });

  it('leaves a short-handed side alone rather than guess', () => {
    const seven = ['tank', 'chip', 'peaches', 'sniffles', 'zippy', 'big_lou', 'ace_kid'];
    expect(storyPosts(POSTS, seven)).toBe(seven);
  });
});
