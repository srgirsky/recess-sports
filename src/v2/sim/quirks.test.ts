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

import { describe, expect, it } from 'vitest';
import { getCharacter, ROSTER } from '../../data/characters';
import type { Character, Quirk } from '../../data/types';
import { isStrike, pitchAndSwing, resolvePitch, throwPitch, type PitchSpec } from './atbat';
import { zoneBandFt, zoneHalfWidthFt } from './athletes';
import { DEFAULT_FEATURES } from './features';
import { simulateGame, type GameResult } from './game';
import { PITCH_SPOTS, PITCHES, releaseAtSpot, releaseFrom, flyToPlate, type BasePitchKind } from './pitch';
import {
  batterInMoment,
  clutchFiring,
  deliveryFor,
  pitchMenu,
  pitchOnMenu,
  scatterMult,
  zoneScale,
  type Moment,
} from './quirks';
import { makeRng } from './rng';

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
    expect(ROSTER.filter((c) => c.quirk).length).toBeGreaterThanOrEqual(12);
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
