// ---------------------------------------------------------------------------
// The story behaviours, in the physical model (`quirks.ts`).
//
// Three kinds of claim, kept apart:
//
//   1. THE FLAG. With `PitchSpec.story` absent every pitch is the pitch it was
//      — for the kids who carry a quirk as much as for the kids who do not —
//      and with it present a kid WITHOUT a quirk is still thrown and judged
//      identically. `game.test.ts` holds the golden games; this holds the
//      pitch.
//   2. EACH KID DOES THE THING. Asserted on what the model produces (the kinds
//      thrown, where and when the ball crosses, whether the bat moved), never
//      on the constant that asks for it.
//   3. THE PORT IS NOT INERT. A whole game with the flag on differs.
//
// Orderings and relationships only: every number in `params.STORY` is a guess
// awaiting its sheet, and a test that pinned one would be pinning the guess.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from 'vitest';
import { getCharacter, ROSTER } from '../../data/characters';
import type { Character, Quirk } from '../../data/types';
import { isStrike, pitchAndSwing, resolvePitch, throwPitch, type PitchSpec } from './atbat';
import { zoneBandFt, zoneHalfWidthFt } from './athletes';
import { DEFAULT_FEATURES } from './features';
import { simulateGame, type GameResult, type SimEvent } from './game';
import { jumpSecOf } from './steal';
import { PITCH_SPOTS, PITCHES, releaseAtSpot, releaseFrom, flyToPlate, type BasePitchKind } from './pitch';
import {
  batterInMoment,
  clutchFiring,
  deliveryFor,
  familyLookup,
  hitByPitch,
  jumpCapSec,
  pitchMenu,
  pitchOnMenu,
  scatterMult,
  SIBLINGS,
  slipsTheTag,
  storyDefence,
  zoneScale,
  type Moment,
} from './quirks';
import { makeRng } from './rng';
import { launch } from './launch';
import { traceLooseBall } from './bounce';
import { BASEPATH, VENUE_GEOMETRY, distFromHome, isFair, type PositionId } from './field';
import { beginPlay, stepPlay, type PlayEvent, type PlaySpec } from './play';
import { maxThrowFt, reachOf } from './fielders';
import { PLAY } from './params';
import { planDefence } from './lineup';
import type { LaunchSpec } from './launch';

// ★ ONE TIMEOUT FOR THE FILE, AND WHY. These tests throw and judge thousands
// of pitches, and the first cold release solve of each (kind, stat, spot) is
// ~14 ms (`pitch.ts` § releaseAtSpot). Locally the slowest finishes inside the
// default; CI's runner is about twice as slow and one did not. Nothing here
// waits on anything — a slow run is a slow machine, never a hang.
vi.setConfig({ testTimeout: 120_000 });

const QUIET: Moment = { bases: [false, false, false], lead: 0 };
const kidWith = (q: Quirk): Character => {
  const kid = ROSTER.find((c) => c.quirk === q);
  if (!kid) throw new Error(`no kid carries ${q}`);
  return kid;
};
const PLAIN = ROSTER.filter((c) => !c.quirk);
const count = { balls: 0, strikes: 0 };
const BASE = Object.keys(PITCHES) as BasePitchKind[];
const N = 400;

/** Every pitch `pitcher` throws `batter` over N seeds, with or without the story. */
const pitches = (pitcher: Character, batter: Character, story?: Moment, c = count) =>
  Array.from({ length: N }, (_, i) => {
    const spec: PitchSpec = { pitcher, batter, count: c, story };
    return { spec, thrown: throwPitch(spec, makeRng(`q${i}`)), seed: `q${i}` };
  });

describe('★ the flag: absent, nothing is read; present, an ordinary kid is unchanged', () => {
  it('has kids to test with and kids to test against', () => {
    expect(PLAIN.length).toBeGreaterThanOrEqual(2);
    expect(ROSTER.filter((c) => c.quirk).length).toBeGreaterThanOrEqual(16);
  });

  it('★ a kid WITH a quirk is thrown and judged as before when the story is off', () => {
    // The strongest form of "the flag is asked by the caller": compare against
    // the same kid with the quirk field deleted.
    for (const kid of ROSTER.filter((c) => c.quirk)) {
      const bare: Character = { ...kid, quirk: undefined };
      for (let i = 0; i < 25; i++) {
        const a = pitchAndSwing({ pitcher: kid, batter: kid, count }, makeRng(`f${i}`));
        const b = pitchAndSwing({ pitcher: bare, batter: bare, count }, makeRng(`f${i}`));
        expect(a, `${kid.id} f${i}`).toEqual(b);
      }
    }
  });

  it('★ a kid WITHOUT a quirk is thrown and judged identically with the story on', () => {
    for (const pitcher of PLAIN) {
      const batter = PLAIN[(PLAIN.indexOf(pitcher) + 1) % PLAIN.length];
      for (let i = 0; i < 40; i++) {
        const off = pitchAndSwing({ pitcher, batter, count }, makeRng(`g${i}`));
        const on = pitchAndSwing({ pitcher, batter, count, story: QUIET }, makeRng(`g${i}`));
        expect(on, `${pitcher.id} → ${batter.id} g${i}`).toEqual(off);
      }
    }
  });

  it('gives an ordinary arm the ordinary answers', () => {
    for (const kid of PLAIN) {
      expect(pitchMenu(kid)).toEqual(BASE);
      expect(scatterMult(kid)).toBe(1);
      expect(zoneScale(kid)).toBe(1);
      for (const k of BASE) {
        expect(deliveryFor(kid, k)).toBeUndefined();
        expect(pitchOnMenu(kid, k)).toBe(k);
      }
      expect(batterInMoment(kid, { bases: [true, true, true], lead: -5 })).toBe(kid);
    }
  });
});

describe('the mound', () => {
  const batter = PLAIN[0];

  it('★ Lu throws nothing but the curve, whoever asks', () => {
    const lu = kidWith('one_curve');
    expect(new Set(pitches(lu, batter, QUIET).map((p) => p.thrown.kind))).toEqual(new Set(['curve']));
    // A person asking for the fastball gets the curve.
    const spec: PitchSpec = { pitcher: lu, batter, count, story: QUIET };
    const [lo, hi] = zoneBandFt();
    const asked = throwPitch(spec, makeRng('h'), { kind: 'fastball', aimLateralFt: 0, aimHeightFt: (lo + hi) / 2 });
    expect(asked.kind).toBe('curve');
    // And without the story she has all four.
    expect(new Set(pitches(lu, batter).map((p) => p.thrown.kind)).size).toBe(4);
  });

  it('★ Ezra never throws a fastball, and a CPU batter always goes after his curve', () => {
    const ezra = kidWith('the_loop');
    const thrown = pitches(ezra, batter, QUIET);
    const kinds = new Set(thrown.map((p) => p.thrown.kind));
    expect(kinds.has('fastball')).toBe(false);
    expect(kinds.size).toBe(3);
    const taken = (story?: Moment) =>
      pitches(ezra, batter, story)
        .filter((p) => p.thrown.kind === 'curve')
        .map((p) => resolvePitch(p.thrown, p.spec, makeRng(p.seed)))
        .filter((r) => r.kind === 'ball' || r.kind === 'calledStrike').length;
    expect(taken(QUIET), 'a curve of his was taken').toBe(0);
    expect(taken(), 'the control: batters do take his curve without the story').toBeGreaterThan(0);
  });

  it('★ Musa has one pitch, and it comes out as the crazy ball some of the time', () => {
    const musa = kidWith('forty_percent');
    const kinds = pitches(musa, batter, QUIET).map((p) => p.thrown.kind);
    expect(new Set(kinds)).toEqual(new Set(['changeup', 'crazy']));
    const worked = kinds.filter((k) => k === 'crazy').length / kinds.length;
    // "Some of the time, less than half": the sheet's own claim, not its digit.
    expect(worked).toBeGreaterThan(0.2);
    expect(worked).toBeLessThan(0.5);
  });

  it('★ a wobbler that worked is no wilder than Musa himself', () => {
    // The crazy ball doubles its buyer's scatter. Musa's was free and is his own.
    const musa = kidWith('forty_percent');
    const bare: Character = { ...musa, quirk: undefined };
    const spread = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
    };
    const [lo, hi] = zoneBandFt();
    const centre = { aimLateralFt: 0, aimHeightFt: (lo + hi) / 2 };
    const at = (pitcher: Character, kind: 'changeup' | 'crazy', story?: Moment) =>
      Array.from({ length: N }, (_, i) => throwPitch({ pitcher, batter, count, story }, makeRng(`w${i}`), { kind, ...centre }))
        .filter((t) => t.kind === 'crazy')
        .map((t) => t.crossing.x);
    const his = spread(at(musa, 'changeup', QUIET));
    const bought = spread(at(bare, 'crazy'));
    expect(his).toBeLessThan(bought * 0.75);
  });

  it.each(['wild_arm', 'wobble'] as const)('★ %s misses the spot by more than the same arm without it', (q) => {
    const kid = kidWith(q);
    const [lo, hi] = zoneBandFt();
    const plan = { kind: 'fastball' as const, aimLateralFt: 0, aimHeightFt: (lo + hi) / 2 };
    const miss = (story?: Moment) =>
      Array.from({ length: N }, (_, i) => throwPitch({ pitcher: kid, batter, count, story }, makeRng(`s${i}`), plan))
        .map((t) => Math.hypot(t.crossing.x - plan.aimLateralFt, t.crossing.y - plan.aimHeightFt))
        .reduce((a, b) => a + b, 0) / N;
    expect(miss(QUIET)).toBeGreaterThan(miss() * 1.2);
  });

  it('★ Kwame is wilder than Dev', () => {
    expect(scatterMult(kidWith('wild_arm'))).toBeGreaterThan(scatterMult(kidWith('wobble')));
  });

  const flightOf = (kid: Character, kind: BasePitchKind, story?: Moment) => {
    const [lo, hi] = zoneBandFt();
    const plan = { kind, aimLateralFt: 0, aimHeightFt: (lo + hi) / 2 };
    return throwPitch({ pitcher: kid, batter, count, story }, makeRng('t'), plan).travelSec;
  };

  it('★ rainbow: every pitch of Bao\'s arrives later than the same arm would throw it', () => {
    const bao = kidWith('rainbow');
    for (const kind of BASE) expect(flightOf(bao, kind, QUIET), kind).toBeGreaterThan(flightOf(bao, kind));
  });

  it('★ velocity: Roz\'s fastball arrives sooner, and her other three are untouched', () => {
    const roz = kidWith('velocity');
    expect(flightOf(roz, 'fastball', QUIET)).toBeLessThan(flightOf(roz, 'fastball'));
    for (const kind of BASE.filter((k) => k !== 'fastball')) {
      expect(deliveryFor(roz, kind), kind).toBeUndefined();
      expect(flightOf(roz, kind, QUIET), kind).toBe(flightOf(roz, kind));
    }
  });

  it('★ a delivery still lands on the spot it was aimed at, at every stat and spot', () => {
    // The release solve saturates if asked for too slow or too fast a pitch
    // (`pitch.ts` § SPECIAL_PITCHES): it then crosses feet from its aim, with
    // no error. So the two deliveries are swept the way the specials were.
    const [lo, hi] = zoneBandFt();
    const mid = (lo + hi) / 2;
    const halfH = (hi - lo) / 2;
    for (const q of ['rainbow', 'velocity'] as const) {
      const kid = kidWith(q);
      const kinds = BASE.filter((k) => deliveryFor(kid, k));
      expect(kinds.length, q).toBeGreaterThan(0);
      for (const kind of kinds) {
        const delivery = deliveryFor(kid, kind);
        for (let stat = 1; stat <= 10; stat++) {
          for (const spot of PITCH_SPOTS) {
            const aimLateralFt = spot.lateral * zoneHalfWidthFt();
            const aimHeightFt = mid + spot.height * halfH;
            const plan = releaseAtSpot({ kind, pitchingStat: stat, aimLateralFt, aimHeightFt, delivery });
            const at = flyToPlate(releaseFrom(plan)).state.p;
            const off = Math.hypot(at.x - aimLateralFt, at.y - aimHeightFt);
            expect(off, `${q} ${kind} stat ${stat} spot ${spot.lateral},${spot.height}`).toBeLessThan(0.05);
          }
        }
      }
    }
  }, 120_000);

  it('★ a delivery never poisons the memo an ordinary arm reads', () => {
    const [lo, hi] = zoneBandFt();
    // At HER arm: the release solve is not monotone across stats (a weak arm's
    // fastball already saturates it), so the comparison is hers against hers.
    const roz = kidWith('velocity');
    const opts = { kind: 'fastball' as const, pitchingStat: roz.stats.pitching, aimLateralFt: 0, aimHeightFt: (lo + hi) / 2 };
    const fast = releaseAtSpot({ ...opts, delivery: deliveryFor(roz, 'fastball') });
    const plain = releaseAtSpot(opts);
    expect(fast).not.toBe(plain);
    expect(flyToPlate(releaseFrom(fast)).travelSec).toBeLessThan(flyToPlate(releaseFrom(plain)).travelSec);
    expect(releaseAtSpot(opts)).toBe(plain);
  });
});

describe('the plate', () => {
  const pitcher = PLAIN[0];

  it('★ Winnie never offers — CPU or person — and without the story she does', () => {
    const winnie = kidWith('never_swings');
    const swung = (story?: Moment) =>
      pitches(pitcher, winnie, story, { balls: 0, strikes: 2 })
        .map((p) => resolvePitch(p.thrown, p.spec, makeRng(p.seed)))
        .filter((r) => r.kind !== 'ball' && r.kind !== 'calledStrike').length;
    expect(swung(QUIET)).toBe(0);
    expect(swung()).toBeGreaterThan(0);
    // A person's perfectly timed tap is a take too.
    for (const p of pitches(pitcher, winnie, QUIET).slice(0, 40)) {
      const r = resolvePitch(p.thrown, p.spec, makeRng(p.seed), { atSec: p.thrown.travelSec, aimHeightFt: p.thrown.crossing.y });
      expect(['ball', 'calledStrike']).toContain(r.kind);
    }
  });

  it('★ Winnie is called fewer strikes on the same pitches, and never one the full zone calls a ball', () => {
    const winnie = kidWith('never_swings');
    const called = (story?: Moment) =>
      pitches(pitcher, winnie, story).map((p) => {
        // Without the story she may swing; ask the umpire directly instead.
        return isStrike(p.thrown.crossing, undefined, story ? zoneScale(winnie) : 1);
      });
    const small = called(QUIET);
    const full = called();
    expect(small.filter(Boolean).length).toBeLessThan(full.filter(Boolean).length);
    small.forEach((s, i) => {
      if (s) expect(full[i], `pitch ${i}`).toBe(true);
    });
  });

  it('★ every ball Rafi puts in play is a bunt: none of them leaves the infield', () => {
    const rafi = kidWith('always_bunts');
    const exits = (story?: Moment) =>
      pitches(pitcher, rafi, story)
        .map((p) => resolvePitch(p.thrown, p.spec, makeRng(p.seed)))
        .flatMap((r) => (r.kind === 'inPlay' ? [r.launch.exitVelocityFts] : []));
    const bunts = exits(QUIET);
    const swings = exits();
    expect(bunts.length).toBeGreaterThan(20);
    expect(swings.length).toBeGreaterThan(20);
    expect(Math.max(...bunts)).toBeLessThan(Math.min(...swings.filter((v) => v > 0).sort((a, b) => b - a).slice(0, 10)));
  });

  it.each([
    ['clutch_behind', { bases: [false, false, false], lead: -1 }, { bases: [true, true, true], lead: 0 }],
    ['clutch_risp', { bases: [false, true, false], lead: 0 }, { bases: [false, true, false], lead: 1 }],
    ['clutch_runners', { bases: [true, false, false], lead: 4 }, { bases: [false, false, false], lead: -4 }],
  ] as Array<[Quirk, Moment, Moment]>)('★ %s fires in its moment and only there', (q, yes, no) => {
    const kid = kidWith(q);
    expect(clutchFiring(kid, yes)).toBe(true);
    expect(clutchFiring(kid, no)).toBe(false);
    expect(batterInMoment(kid, no)).toBe(kid);
    const hot = batterInMoment(kid, yes);
    expect(hot.stats.power).toBeGreaterThan(kid.stats.power);
    expect({ ...hot.stats, power: kid.stats.power }).toEqual(kid.stats);
  });

  it('★ a Clutch kid in her moment hits the same pitches harder', () => {
    const kid = kidWith('clutch_runners');
    const mean = (story: Moment) => {
      const vs = pitches(pitcher, kid, story)
        .map((p) => resolvePitch(p.thrown, p.spec, makeRng(p.seed)))
        .flatMap((r) => (r.kind === 'inPlay' ? [r.launch.exitVelocityFts] : []));
      expect(vs.length).toBeGreaterThan(20);
      return vs.reduce((a, b) => a + b, 0) / vs.length;
    };
    expect(mean({ bases: [true, false, false], lead: 0 })).toBeGreaterThan(mean(QUIET) * 1.05);
  });
});

describe('the plate, continued: where the ball goes', () => {
  const pitcher = PLAIN[0];
  const inPlay = (batter: Character, story?: Moment) =>
    pitches(pitcher, batter, story).flatMap((p) => {
      const r = resolvePitch(p.thrown, p.spec, makeRng(p.seed));
      return r.kind === 'inPlay' ? [r] : [];
    });
  const kinds = (batter: Character, story?: Moment) => {
    const tally: Record<string, number> = {};
    for (const p of pitches(pitcher, batter, story)) {
      const k = resolvePitch(p.thrown, p.spec, makeRng(p.seed)).kind;
      tally[k] = (tally[k] ?? 0) + 1;
    }
    return tally;
  };

  it('★ every ball Hattie puts in play is the same ball', () => {
    const hattie = kidWith('same_spot');
    const balls = inPlay(hattie, QUIET);
    expect(balls.length).toBeGreaterThan(20);
    const first = balls[0].launch;
    for (const b of balls) {
      expect([b.launch.exitVelocityFts, b.launch.launchAngleDeg, b.launch.sprayDeg, b.launch.spinRpm]).toEqual([
        first.exitVelocityFts,
        first.launchAngleDeg,
        first.sprayDeg,
        first.spinRpm,
      ]);
    }
    // And it is a ball in the field of play: fair, down, short of every fence.
    for (const [id, geo] of Object.entries(VENUE_GEOMETRY)) {
      const t = traceLooseBall(launch(first), geo);
      expect(t.leftPark, id).toBe(false);
      expect(t.landing, id).not.toBeNull();
      expect(isFair(t.landing!), id).toBe(true);
      expect(distFromHome(t.landing!), id).toBeGreaterThan(BASEPATH);
    }
    // The control: without the story her balls go where she hit them.
    expect(new Set(inPlay(hattie).map((b) => b.launch.sprayDeg)).size).toBeGreaterThan(5);
  });

  it('★ a perfectly timed swing of Mars\'s leaves every park, and a mistimed one is an ordinary swing', () => {
    const mars = kidWith('moonshot');
    const spec: PitchSpec = { pitcher, batter: mars, count, story: QUIET };
    let perfect = 0;
    for (const p of pitches(pitcher, mars, QUIET).slice(0, 60)) {
      const aim = { atSec: p.thrown.travelSec, aimHeightFt: p.thrown.crossing.y };
      const hit = resolvePitch(p.thrown, spec, makeRng(p.seed), aim);
      if (hit.kind !== 'inPlay') continue;
      perfect++;
      for (const [id, geo] of Object.entries(VENUE_GEOMETRY)) {
        expect(traceLooseBall(launch(hit.launch), geo).leftPark, `${id} ${p.seed}`).toBe(true);
      }
      // The same swing, a fifth of the flight late: whatever the model says.
      const late = resolvePitch(p.thrown, spec, makeRng(p.seed), { ...aim, atSec: p.thrown.travelSec * 1.2 });
      const off = resolvePitch(p.thrown, { ...spec, story: undefined }, makeRng(p.seed), { ...aim, atSec: p.thrown.travelSec * 1.2 });
      expect(late).toEqual(off);
    }
    expect(perfect).toBeGreaterThan(30);
  }, 120_000);

  it('★ Josie ticks more of them foul than she would', () => {
    const josie = kidWith('foul_back');
    const on = kinds(josie, QUIET).foulTip ?? 0;
    const off = kinds(josie).foulTip ?? 0;
    expect(on).toBeGreaterThan(off * 1.5);
    expect(on).toBeGreaterThan(off + 5);
  });

  it('★ Yaz offers at every pitch, misses more of them, and hits what she meets harder', () => {
    const yaz = kidWith('eyes_closed');
    const on = kinds(yaz, QUIET);
    const off = kinds(yaz);
    expect((on.ball ?? 0) + (on.calledStrike ?? 0), 'she took one').toBe(0);
    expect((off.ball ?? 0) + (off.calledStrike ?? 0)).toBeGreaterThan(0);
    expect(on.swingingStrike ?? 0).toBeGreaterThan(off.swingingStrike ?? 0);
    const best = (story?: Moment) => Math.max(...inPlay(yaz, story).map((b) => b.launch.exitVelocityFts));
    expect(best(QUIET)).toBeGreaterThanOrEqual(best());
    // A person's perfectly timed swing with her is the big bat too.
    const p = pitches(pitcher, yaz, QUIET)[0];
    const aim = { atSec: p.thrown.travelSec, aimHeightFt: p.thrown.crossing.y - 0.05 };
    const hers = resolvePitch(p.thrown, p.spec, makeRng(p.seed), aim);
    const plain = resolvePitch(p.thrown, { ...p.spec, story: undefined }, makeRng(p.seed), aim);
    if (hers.kind !== 'inPlay' || plain.kind !== 'inPlay') throw new Error('a perfectly timed swing missed');
    if (yaz.stats.power < 10) expect(hers.launch.exitVelocityFts).toBeGreaterThan(plain.launch.exitVelocityFts);
    else expect(hers.launch.exitVelocityFts).toBe(plain.launch.exitVelocityFts);
  });
});

describe('the bases', () => {
  const steals = (awayIds: string[], seed: string, on: boolean, humanSide?: 'away' | 'home') => {
    const home = ROSTER.filter((c) => !awayIds.includes(c.id)).slice(0, 9).map((c) => c.id);
    const out: Array<Extract<SimEvent, { t: 'steal' }>> = [];
    simulateGame(
      {
        away: { name: 'Rockets', ids: awayIds },
        home: { name: 'Comets', ids: home },
        lookup: getCharacter,
        humanSide,
        features: on ? { ...DEFAULT_FEATURES, storyKids: true } : undefined,
        onEvent: (e) => {
          if (e.t === 'steal') out.push(e);
        },
      },
      makeRng(seed)
    );
    return out;
  };
  const teamWith = (q: Quirk) => {
    const kid = kidWith(q);
    return [kid.id, ...PLAIN.filter((c) => c.id !== kid.id).map((c) => c.id), ...ROSTER.filter((c) => c.quirk && c.id !== kid.id).map((c) => c.id)].slice(0, 9);
  };
  const SEEDS = Array.from({ length: 12 }, (_, i) => `b${i}`);

  it('★ Zaya is never late off the pitcher, and without the cap she sometimes is', () => {
    const zaya = kidWith('green_light');
    const cap = jumpCapSec(zaya);
    expect(cap).toBeDefined();
    const jumps = (c?: number) => Array.from({ length: 200 }, (_, i) => jumpSecOf(zaya, makeRng(`j${i}`), c));
    expect(Math.max(...jumps(cap))).toBeLessThanOrEqual(cap!);
    expect(Math.max(...jumps())).toBeGreaterThan(cap!);
    // Her early jumps are the ones she drew.
    expect(Math.min(...jumps(cap))).toBe(Math.min(...jumps()));
    for (const kid of PLAIN) expect(jumpCapSec(kid)).toBeUndefined();
  });

  it('★ Zaya goes on her own for a person who never gives the order', () => {
    // A person's runners go only on order, and a drained game gives none.
    const zaya = kidWith('green_light');
    const team = teamWith('green_light');
    const on = SEEDS.flatMap((s) => steals(team, s, true, 'away')).filter((e) => team.includes(e.runnerId));
    const off = SEEDS.flatMap((s) => steals(team, s, false, 'away')).filter((e) => team.includes(e.runnerId));
    expect(off.length, 'the control: nobody on a person\'s bench runs unasked').toBe(0);
    expect(on.length).toBeGreaterThan(0);
    expect(new Set(on.map((e) => e.runnerId))).toEqual(new Set([zaya.id]));
    expect(on.every((e) => !e.human)).toBe(true);
  }, 120_000);

  it('★ Ollie is never caught stealing', () => {
    const ollie = kidWith('never_tagged');
    const team = teamWith('never_tagged');
    const his = SEEDS.flatMap((s) => steals(team, s, true)).filter((e) => e.runnerId === ollie.id);
    expect(his.length).toBeGreaterThan(0);
    expect(his.filter((e) => !e.safe).length).toBe(0);
    expect(slipsTheTag(ollie)).toBe(true);
    for (const kid of PLAIN) expect(slipsTheTag(kid)).toBe(false);
  }, 120_000);
});

describe('the field', () => {
  const POSTS: PositionId[] = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  /** Nine fielders with `kid` standing at `at`; everyone else has no fielding story. */
  const defenceWith = (kid: Character, at: PositionId): Record<string, PositionId> => {
    const fill = ROSTER.filter((c) => c.id !== kid.id && !FIELD_STORIES.includes(c.quirk as Quirk));
    const out: Record<string, PositionId> = { [kid.id]: at };
    let i = 0;
    for (const pos of POSTS) if (pos !== at) out[fill[i++].id] = pos;
    return out;
  };
  const FIELD_STORIES: Quirk[] = ['brick_house', 'sure_hands', 'fence_arm', 'plays_alone', 'wrong_base'];
  const batter = PLAIN[0];
  const runOne = (defence: Record<string, PositionId>, launchSpec: LaunchSpec, seed: string, story: boolean, runners: PlaySpec['runners'] = []) => {
    const s = beginPlay({ launch: launchSpec, batter, runners, defence, lookup: getCharacter, geo: VENUE_GEOMETRY.park, story: story || undefined }, makeRng(seed));
    const events: PlayEvent[] = [];
    let ticks = 0;
    while (s.phase === 'live' && ticks++ < 60 * PLAY.MAX_PLAY_SEC + 60) {
      stepPlay(s, 1 / 60);
      events.push(...s.events);
    }
    return { s, events };
  };
  // A grounder at short and a fly to short centre: balls a fielder gets a glove on.
  const AT_SHORT: LaunchSpec = { exitVelocityFts: 60, launchAngleDeg: 4, sprayDeg: -20, spinRpm: 600, heightFt: 2.5 };
  const errorsBy = (kid: Character, story: boolean) => {
    let n = 0;
    for (let i = 0; i < 300; i++) {
      n += runOne(defenceWith(kid, 'SS'), AT_SHORT, `e${i}`, story).events.filter((e) => e.t === 'error' && e.fielder === kid.id).length;
    }
    return n;
  };

  it.each(['brick_house', 'sure_hands'] as const)('★ %s never drops or bobbles one, and without the story does', (q) => {
    const kid = kidWith(q);
    expect(errorsBy(kid, true)).toBe(0);
    expect(errorsBy(kid, false), 'the control: the same balls, the same kid, some errors').toBeGreaterThan(0);
  }, 120_000);

  it('★ Sonny reaches further than the kid he is, and Greta does not', () => {
    const reach = (q: Quirk, story: boolean) => {
      const kid = kidWith(q);
      const s = beginPlay({ launch: AT_SHORT, batter, defence: defenceWith(kid, 'C'), lookup: getCharacter, geo: VENUE_GEOMETRY.park, story: story || undefined }, makeRng('r'));
      return reachOf(s.fielders.find((f) => f.charId === kid.id)!, 0);
    };
    expect(reach('brick_house', true)).toBeGreaterThan(reach('brick_house', false));
    expect(reach('sure_hands', true)).toBe(reach('sure_hands', false));
  });

  it.each(['fence_arm', 'plays_alone'] as const)('★ %s throws with the best arm there is, from the outfield', (q) => {
    const kid = kidWith(q);
    const armOf = (story: boolean) =>
      beginPlay({ launch: AT_SHORT, batter, defence: defenceWith(kid, 'CF'), lookup: getCharacter, geo: VENUE_GEOMETRY.park, story: story || undefined }, makeRng('a'))
        .fielders.find((f) => f.charId === kid.id)!.arm;
    const best = Math.max(...ROSTER.map((c) => c.stats.pitching));
    expect(armOf(true)).toBeGreaterThanOrEqual(best);
    expect(armOf(false)).toBe(kid.stats.pitching);
    // What the arm buys: range. An arm has one, so a longer throw is one fewer relay.
    if (kid.stats.pitching < best) expect(maxThrowFt(armOf(true))).toBeGreaterThan(maxThrowFt(kid.stats.pitching));
  });

  it('★ some of Roya\'s throws go to a bag nobody chose, and no play hangs for it', () => {
    const roya = kidWith('wrong_base');
    const throwsOf = (story: boolean) => {
      const bags: number[] = [];
      let capped = 0;
      for (let i = 0; i < 300; i++) {
        const { s, events } = runOne(defenceWith(roya, 'SS'), AT_SHORT, `t${i}`, story, [{ base: 1, char: PLAIN[1] }]);
        expect(s.phase, `t${i} never ended`).toBe('done');
        if (s.elapsedSec >= PLAY.MAX_PLAY_SEC) capped++;
        for (const e of events) if (e.t === 'throw' && e.fielder === roya.id) bags.push(e.toBase);
      }
      return { bags, capped };
    };
    const on = throwsOf(true);
    const off = throwsOf(false);
    expect(on.capped, 'plays that ran to the clock').toBe(0);
    expect(off.bags.length).toBeGreaterThan(50);
    // Without the story she throws where the play is; with it, the spread widens.
    const share = (bags: number[], most: number) => bags.filter((b) => b === most).length / bags.length;
    const usual = [1, 2, 3, 4].sort((a, b) => off.bags.filter((x) => x === b).length - off.bags.filter((x) => x === a).length)[0];
    expect(share(on.bags, usual)).toBeLessThan(share(off.bags, usual) - 0.1);
    expect(new Set(on.bags).size).toBeGreaterThanOrEqual(new Set(off.bags).size);
  }, 120_000);

  it('★ a fielder with no fielding story is not touched', () => {
    for (const kid of PLAIN.slice(0, 3)) {
      const make = (story: boolean) =>
        beginPlay({ launch: AT_SHORT, batter, defence: defenceWith(kid, 'SS'), lookup: getCharacter, geo: VENUE_GEOMETRY.park, story: story || undefined }, makeRng('n')).fielders;
      expect(make(true)).toEqual(make(false));
    }
  });
});

describe('Sam and Jay', () => {
  const pitcher = PLAIN[0];

  it('★ Sam takes more two-strike pitches than he would', () => {
    const sam = kidWith('hit_by_pitch');
    const taken = (story?: Moment) =>
      pitches(pitcher, sam, story, { balls: 0, strikes: 2 })
        .map((p) => resolvePitch(p.thrown, p.spec, makeRng(p.seed)))
        .filter((r) => r.kind === 'ball' || r.kind === 'calledStrike').length;
    expect(taken(QUIET)).toBeGreaterThan(taken());
  });

  it('★ a ball far enough inside hits Sam, and only Sam, and only inside', () => {
    const sam = kidWith('hit_by_pitch');
    const [lo, hi] = zoneBandFt();
    const mid = (lo + hi) / 2;
    const edge = zoneHalfWidthFt();
    expect(hitByPitch(sam, { x: -(edge + 1), y: mid })).toBe(true);
    expect(hitByPitch(sam, { x: edge + 1, y: mid }), 'outside').toBe(false);
    expect(hitByPitch(sam, { x: -edge, y: mid }), 'on the black').toBe(false);
    expect(hitByPitch(sam, { x: -(edge + 1), y: 0.1 }), 'in the dirt').toBe(false);
    expect(hitByPitch(sam, { x: -(edge + 1), y: hi * 3 }), 'over his head').toBe(false);
    for (const kid of PLAIN) expect(hitByPitch(kid, { x: -(edge + 1), y: mid })).toBe(false);
  });

  it('★ Sam is hit in real games, and it puts him on first', () => {
    const sam = kidWith('hit_by_pitch');
    const away = [sam.id, ...ROSTER.filter((c) => c.id !== sam.id).slice(0, 8).map((c) => c.id)];
    const home = ROSTER.filter((c) => !away.includes(c.id)).slice(0, 9).map((c) => c.id);
    let hits = 0;
    for (let i = 0; i < 12; i++) {
      const g = simulateGame(
        { away: { name: 'A', ids: away }, home: { name: 'H', ids: home }, lookup: getCharacter, features: { ...DEFAULT_FEATURES, storyKids: true } },
        makeRng(`hbp${i}`)
      );
      hits += g.log.filter((l) => l.includes('is hit by the pitch')).length;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('★ Jay\'s Heater is his fastball, faster, and only while it is unthrown', () => {
    const jay = kidWith('heater');
    const [lo, hi] = zoneBandFt();
    const plan = { kind: 'fastball' as const, aimLateralFt: 0, aimHeightFt: (lo + hi) / 2 };
    const fly = (story?: Moment) => throwPitch({ pitcher: jay, batter: PLAIN[0], count, story }, makeRng('h'), plan).travelSec;
    const heater = fly({ ...QUIET, heaterReady: true });
    expect(heater).toBeLessThan(fly());
    expect(fly({ ...QUIET, heaterReady: false })).toBe(fly());
    expect(fly(QUIET)).toBe(fly());
    // Nobody else has one, ready or not.
    for (const kid of PLAIN) expect(deliveryFor(kid, 'fastball', true)).toBeUndefined();
    // And his curve is not it.
    expect(deliveryFor(jay, 'curve', true)).toBeUndefined();
  });
});

describe('the team', () => {
  it('★ siblings on the same nine are each one better, capped, and nobody else is touched', () => {
    for (const [a, b] of SIBLINGS) {
      const together = familyLookup(getCharacter, [[a, b, PLAIN[0].id], [PLAIN[1].id]]);
      for (const id of [a, b]) {
        const base = getCharacter(id).stats;
        const got = together(id).stats;
        for (const k of Object.keys(base) as Array<keyof typeof base>) {
          expect(got[k], `${id} ${k}`).toBe(Math.min(10, base[k] + 1));
        }
        expect(together(id)).toBe(together(id));
      }
      expect(together(PLAIN[0].id)).toBe(PLAIN[0]);
      // Split across the two benches, they are who they always were.
      const apart = familyLookup(getCharacter, [[a, PLAIN[0].id], [b, PLAIN[1].id]]);
      expect(apart).toBe(getCharacter);
    }
  });

  it('★ Sonny catches, Amir plays centre, Rudy is on the grass, and the pitcher never moves', () => {
    const sonny = kidWith('brick_house');
    const amir = kidWith('plays_alone');
    const rudy = kidWith('fence_arm');
    const ids = [sonny.id, amir.id, rudy.id, ...ROSTER.filter((c) => ![sonny.id, amir.id, rudy.id].includes(c.id)).slice(0, 6).map((c) => c.id)];
    const plan = planDefence(ids, getCharacter);
    const told = storyDefence(plan, getCharacter);
    expect(told.pitcherId).toBe(plan.pitcherId);
    expect(told.order).toEqual(plan.order);
    expect(Object.values(told.positions).sort()).toEqual(Object.values(plan.positions).sort());
    if (sonny.id !== plan.pitcherId) expect(told.positions[sonny.id]).toBe('C');
    if (amir.id !== plan.pitcherId) expect(told.positions[amir.id]).toBe('CF');
    if (rudy.id !== plan.pitcherId) expect(['RF', 'LF']).toContain(told.positions[rudy.id]);
    // A nine with none of the three is the plan it was.
    const plain = planDefence(ROSTER.filter((c) => ![sonny.id, amir.id, rudy.id].includes(c.id)).slice(0, 9).map((c) => c.id), getCharacter);
    expect(storyDefence(plain, getCharacter)).toBe(plain);
  });
});

describe('★ the story does not break the game it is told in', () => {
  // What the first numbers did, and why this is here: with every guess at
  // its first value the harness measured 12.9 runs a game against 6.8 — Lu
  // walked 44% of the batters she faced (a curve aimed at the zone breaks out
  // of it, and the curve was her only pitch), Mars homered in 46% of her
  // plate appearances, Winnie walked 84% of the time and Hattie's one spot
  // was an out 92% of the time. Each kid's own test passed. So the gate is on
  // the GAME: thirty rosters rotated through, stories on and off.
  const rotated = (on: boolean) => {
    let runs = 0;
    const perKid: Record<string, { pa: number; onBase: number; hr: number }> = {};
    const N = 60;
    for (let g = 0; g < N; g++) {
      const off = (g * 7) % ROSTER.length;
      const at = (j: number) => ROSTER[(off + j) % ROSTER.length].id;
      let lastHr = false;
      const r = simulateGame(
        {
          away: { name: 'A', ids: Array.from({ length: 9 }, (_, j) => at(j)) },
          home: { name: 'B', ids: Array.from({ length: 9 }, (_, j) => at(j + 9)) },
          lookup: getCharacter,
          features: on ? { ...DEFAULT_FEATURES, storyKids: true } : undefined,
          onEvent: (e) => {
            if (e.t === 'contact') lastHr = e.hit === 'HR' && !e.foul;
            if (e.t !== 'pa') return;
            const k = (perKid[e.batterId] ??= { pa: 0, onBase: 0, hr: 0 });
            k.pa++;
            if (e.result === 'hit' || e.result === 'walk') k.onBase++;
            if (e.result === 'hit' && lastHr) k.hr++;
            lastHr = false;
          },
        },
        makeRng(`shape${g}`)
      );
      runs += r.awayScore + r.homeScore;
    }
    return { rpg: runs / N, perKid };
  };
  const on = rotated(true);
  const off = rotated(false);

  it('★ scoring with the stories on stays within a quarter of scoring without', () => {
    expect(on.rpg).toBeGreaterThan(off.rpg * 0.75);
    expect(on.rpg).toBeLessThan(off.rpg * 1.25);
  });

  it('★ no kid\'s story makes her an automatic out or an automatic base', () => {
    for (const kid of ROSTER.filter((c) => c.quirk)) {
      const k = on.perKid[kid.id];
      if (!k || k.pa < 40) continue;
      const obp = k.onBase / k.pa;
      expect(obp, `${kid.name} reaches base ${Math.round(obp * 100)}% of the time`).toBeGreaterThan(0.25);
      expect(obp, `${kid.name} reaches base ${Math.round(obp * 100)}% of the time`).toBeLessThan(0.8);
    }
  });

  it('★ Mars is the biggest bat in the game and still makes outs', () => {
    const mars = kidWith('moonshot');
    const hers = on.perKid[mars.id];
    expect(hers.pa).toBeGreaterThan(40);
    const rate = hers.hr / hers.pa;
    const others = ROSTER.filter((c) => c.id !== mars.id && on.perKid[c.id]?.pa > 40).map((c) => on.perKid[c.id].hr / on.perKid[c.id].pa);
    expect(rate).toBeGreaterThan(Math.max(...others));
    expect(rate).toBeLessThan(0.25);
  });

  it('★ the three who aim through the break throw it for strikes', () => {
    // An ordinary curve is aimed at a spot and breaks off it. Lu's is her
    // whole job (`aimsThroughBreak`): the same curve, called against the zone.
    const lu = kidWith('one_curve');
    const [lo, hi] = zoneBandFt();
    const plan = { kind: 'curve' as const, aimLateralFt: 0, aimHeightFt: (lo + hi) / 2 };
    const strikes = (story?: Moment) =>
      Array.from({ length: 200 }, (_, i) => throwPitch({ pitcher: lu, batter: PLAIN[0], count, story }, makeRng(`k${i}`), plan)).filter((t) =>
        isStrike(t.crossing)
      ).length / 200;
    expect(strikes(QUIET)).toBeGreaterThan(0.8);
    expect(strikes(QUIET)).toBeGreaterThan(strikes() + 0.3);
  });
});

describe('★ the port is not inert', () => {
  const ids = (qs: Quirk[], fill: number) => [...qs.map((q) => kidWith(q).id), ...PLAIN.slice(0, fill).map((c) => c.id)];
  const AWAY = ROSTER.filter((c) => c.quirk).slice(0, 9).map((c) => c.id);
  const HOME = ROSTER.filter((c) => !AWAY.includes(c.id)).slice(0, 9).map((c) => c.id);
  const fp = (g: GameResult) =>
    `${g.awayScore}-${g.homeScore} i${g.innings} pa${g.tally.plateAppearances} h${g.tally.hits} k${g.tally.strikeouts} bb${g.tally.walks} log${g.log.length}`;
  const play = (seed: string, on: boolean) =>
    simulateGame(
      {
        away: { name: 'Rockets', ids: AWAY },
        home: { name: 'Comets', ids: HOME },
        lookup: getCharacter,
        features: on ? { ...DEFAULT_FEATURES, storyKids: true } : undefined,
      },
      makeRng(seed)
    );

  it('names nine a side', () => {
    expect(ids([], 2).length).toBe(2);
    expect(AWAY.length).toBe(9);
    expect(HOME.length).toBe(9);
  });

  it('★ storyKids: true changes the game, and the game still ends', () => {
    for (const seed of ['a', 'b', 'c']) {
      const on = play(seed, true);
      expect(fp(on), `${seed}: storyKids on played the identical game`).not.toBe(fp(play(seed, false)));
      expect(on.innings).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);
});
