// ---------------------------------------------------------------------------
// The plate appearance is checked against three things that are true
// independently of it:
//
//   - THE RULEBOOK. The plate is 17 inches and a strike is any part of the ball
//     over any part of it, so the zone's width is arithmetic, not a choice. The
//     height is the rulebook's own definition — knees to the letters — which is
//     why it is a fraction of the batter rather than a number of feet.
//   - `BAT.CONTACT_WINDOW_FRAC`, which the batter's timing noise has to be sized
//     against rather than beside. A noise too small for the window makes
//     swinging strikes impossible; measured, that is exactly what happened.
//   - The batter's own STAT, which must move both halves of his judgement in the
//     same direction, because there is only one judgement.
//
// ★ WHAT IS NOT CHECKED HERE: the RATES. Chase rate, whiff rate, strikeout rate
// and walk rate are emergent, nothing measures them, and `sim.plateDiscipline`
// says so. PR 8 is the harness that gets to have an opinion. These tests assert
// that each mechanism EXISTS and points the right way.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  choosePitch,
  distOutsideZone,
  isStrike,
  pitchAndSwing,
  type PitchResult,
  type PitchSpec,
} from './atbat';
import {
  plateJudgementFt,
  pitchScatterFt,
  swingTimingSigmaFrac,
  zoneBandFt,
  zoneHalfWidthFt,
} from './athletes';
import { ATBAT, BAT, DEFENSE } from './params';
import { BALL_RADIUS_FT } from './ball';
import { inToFt } from './units';
import { makeRng } from './rng';
import { ROSTER } from '../../data/characters';

const ARM = ROSTER.find((c) => c.stats.pitching === 5) ?? ROSTER[0];
const kidWithContact = (n: number) => ROSTER.find((c) => c.stats.contact === n) ?? ROSTER[0];

/** Throw a lot of pitches at one batter and count what came back. */
function sample(batter: (typeof ROSTER)[number], n: number, counts?: PitchSpec['count'][]) {
  const cs = counts ?? [
    { balls: 0, strikes: 0 },
    { balls: 1, strikes: 1 },
    { balls: 3, strikes: 0 },
  ];
  const out: PitchResult[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      pitchAndSwing({ pitcher: ARM, batter, count: cs[i % cs.length] }, makeRng(`s:${batter.id}:${i}`))
    );
  }
  return out;
}

const swung = (r: PitchResult) => r.kind !== 'ball' && r.kind !== 'calledStrike';

describe('★ the strike zone, which v1 does not have in any units', () => {
  it('is the rulebook plate plus a ball on each side', () => {
    // `Official Baseball Rules` 2.02 and Little League 1.05 both specify a
    // 17-inch plate, and a strike is any part of the ball over any part of it —
    // so the ball's CENTRE may sit a radius outside each edge.
    expect(zoneHalfWidthFt()).toBeCloseTo(inToFt(8.5) + BALL_RADIUS_FT, 10);
    const widthIn = zoneHalfWidthFt() * 2 * 12;
    expect(widthIn, 'a shade under twenty inches').toBeGreaterThan(19);
    expect(widthIn).toBeLessThan(21);
  });

  it('belongs to the BATTER, not the park', () => {
    // The rulebook defines the zone on the hitter — knee hollow to the midpoint
    // between shoulders and belt — so it is a fraction of height, and a taller
    // kid has a taller zone.
    const [lo, hi] = zoneBandFt(DEFENSE.REFERENCE_HEIGHT_FT);
    expect(lo).toBeCloseTo(DEFENSE.REFERENCE_HEIGHT_FT * ATBAT.ZONE_BOTTOM_FRAC, 10);
    expect(hi).toBeCloseTo(DEFENSE.REFERENCE_HEIGHT_FT * ATBAT.ZONE_TOP_FRAC, 10);
    expect((hi - lo) * 12, 'about sixteen inches tall on a four-foot kid').toBeGreaterThan(14);
    expect((hi - lo) * 12).toBeLessThan(19);
    const [lo2, hi2] = zoneBandFt(5);
    expect(hi2 - lo2, 'a taller batter, a taller zone').toBeGreaterThan(hi - lo);
  });

  it('★ has a SIZE at all, which v1s PLATE_ZONE does not', () => {
    // v1's zone is `{ W: 96, H: 100 }` in "plate coords" — a space `plateView.ts`
    // maps to the screen at about 1.8x and which nothing relates to the field.
    // It is not a wrong size; it has no size. The test that can be written about
    // ours and not about v1's is simply that it is measured in feet and lands
    // inside the park.
    const [lo, hi] = zoneBandFt();
    expect(Number.isFinite(zoneHalfWidthFt() + lo + hi)).toBe(true);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeLessThan(DEFENSE.REFERENCE_HEIGHT_FT);
  });

  it('calls a pitch by where it actually crossed', () => {
    const [lo, hi] = zoneBandFt();
    const w = zoneHalfWidthFt();
    const mid = (lo + hi) / 2;
    expect(isStrike({ x: 0, y: mid })).toBe(true);
    expect(isStrike({ x: w - 0.01, y: mid })).toBe(true);
    expect(isStrike({ x: w + 0.01, y: mid }), 'a shade off the plate').toBe(false);
    expect(isStrike({ x: 0, y: lo - 0.01 }), 'below the knees').toBe(false);
    expect(isStrike({ x: 0, y: hi + 0.01 }), 'above the letters').toBe(false);
    expect(distOutsideZone({ x: 0, y: mid })).toBe(0);
    expect(distOutsideZone({ x: w + 0.5, y: mid })).toBeCloseTo(0.5, 6);
  });
});

describe('★ one judgement error, two behaviours', () => {
  it('moves both halves with the same stat, in the same direction', () => {
    for (let s = 1; s < 10; s++) {
      expect(plateJudgementFt(s + 1), `contact ${s}`).toBeLessThan(plateJudgementFt(s));
      expect(swingTimingSigmaFrac(s + 1), `contact ${s}`).toBeLessThan(swingTimingSigmaFrac(s));
    }
    // And a content typo cannot produce a negative eye.
    expect(plateJudgementFt(-3)).toBe(plateJudgementFt(1));
    expect(swingTimingSigmaFrac(99)).toBe(swingTimingSigmaFrac(10));
  });

  it('★ sizes the timing noise AGAINST the contact window, not beside it', () => {
    // The first draft used 0.115/0.035 and produced ZERO swinging strikes over
    // 4,000 pitches at every contact stat — because `Rng.bell` has bounded
    // support (±3) and a miss needed 2.5 sigma. A bounded noise makes that
    // failure silent rather than merely unlikely, which is why the relationship
    // is asserted rather than the values.
    const worstSigma = swingTimingSigmaFrac(1);
    const bestSigma = swingTimingSigmaFrac(10);
    // A miss needs |error| >= CONTACT_WINDOW_FRAC. In bell sigmas:
    expect(BAT.CONTACT_WINDOW_FRAC / worstSigma, 'the worst eye must miss often').toBeLessThan(2);
    expect(BAT.CONTACT_WINDOW_FRAC / bestSigma, 'the best eye rarely').toBeGreaterThan(2);
    expect(BAT.CONTACT_WINDOW_FRAC / bestSigma, 'but the mechanism must still exist').toBeLessThan(3.2);
  });

  it('★ produces swinging strikes, and fewer of them for a better eye', () => {
    const rate = (contact: number) => {
      const rs = sample(kidWithContact(contact), 900);
      const swings = rs.filter(swung);
      return swings.filter((r) => r.kind === 'swingingStrike').length / swings.length;
    };
    const bad = rate(3);
    const good = rate(10);
    expect(bad, 'a poor-contact kid swings through pitches').toBeGreaterThan(0.05);
    expect(good, 'an elite-contact kid almost never does').toBeLessThan(bad);
  });

  it('★ produces takes and chases, and the good eye takes the right ones', () => {
    const look = (contact: number) => {
      const rs = sample(kidWithContact(contact), 1200);
      const inZone = rs.filter((r) => isStrike(r.crossing));
      const outZone = rs.filter((r) => !isStrike(r.crossing));
      return {
        chase: outZone.filter(swung).length / outZone.length,
        takeStrike: inZone.filter((r) => r.kind === 'calledStrike').length / inZone.length,
      };
    };
    const bad = look(3);
    const good = look(10);
    expect(bad.chase, 'chasing has to happen at all').toBeGreaterThan(0.05);
    expect(good.takeStrike, 'a good eye does not stand there watching strikes').toBeLessThan(
      bad.takeStrike
    );
    // ★ Neither of these is a constant anywhere. There is no chase rate and no
    // whiff rate in the codebase — both come out of one judgement error.
    expect(Object.keys(ATBAT)).not.toContain('CHASE_RATE');
    expect(Object.keys(ATBAT)).not.toContain('WHIFF_RATE');
  });

  it('★ protects with two strikes, which is what keeps a K from being a take', () => {
    const at = (count: PitchSpec['count']) => {
      const rs = sample(kidWithContact(3), 700, [count]);
      const outZone = rs.filter((r) => !isStrike(r.crossing));
      return outZone.filter(swung).length / outZone.length;
    };
    const even = at({ balls: 1, strikes: 1 });
    const twoStrikes = at({ balls: 1, strikes: 2 });
    expect(twoStrikes, 'he flails with two strikes').toBeGreaterThan(even);
    expect(ATBAT.TWO_STRIKE_PROTECT_FT).toBeGreaterThan(0);
  });
});

describe('the mound', () => {
  it('works the corners when even, wastes when ahead, grooves when behind', () => {
    const reach = (count: PitchSpec['count']) => {
      let sum = 0;
      for (let i = 0; i < 200; i++) {
        const p = choosePitch({ pitcher: ARM, batter: kidWithContact(5), count }, makeRng(`c${i}`));
        sum += distOutsideZone({ x: p.aimLateralFt, y: p.aimHeightFt });
      }
      return sum / 200;
    };
    const behind = reach({ balls: 3, strikes: 0 });
    const even = reach({ balls: 1, strikes: 1 });
    const ahead = reach({ balls: 0, strikes: 2 });
    expect(behind, 'behind in the count it has to come in').toBe(0);
    expect(ahead, 'ahead it goes off the edge').toBeGreaterThan(even);
  });

  it('★ aims at a SPOT, which is what makes a pitch affordable', () => {
    // The release solve is a secant over a bisection — measured at 13.6ms, three
    // hundred and fifty times the flight it produces, and PR 8 throws 200,000
    // pitches. A continuously random aim would have to re-solve every one. A
    // finite spot grid is solved once per (kind, arm, spot) and reused.
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const p = choosePitch(
        { pitcher: ARM, batter: kidWithContact(5), count: { balls: 1, strikes: 1 } },
        makeRng(`spot${i}`)
      );
      seen.add(`${p.aimLateralFt.toFixed(6)}|${p.aimHeightFt.toFixed(6)}`);
    }
    expect(seen.size, 'a finite set of intents, not a continuum').toBeLessThanOrEqual(9);
    expect(seen.size, 'and more than one of them').toBeGreaterThan(3);
  });

  it('misses its spot by the pitching stat', () => {
    for (let s = 1; s < 10; s++) expect(pitchScatterFt(s + 1)).toBeLessThan(pitchScatterFt(s));
    const wildness = (stat: number) => {
      const p = ROSTER.find((c) => c.stats.pitching === stat) ?? ARM;
      let inZone = 0;
      for (let i = 0; i < 400; i++) {
        const r = pitchAndSwing(
          { pitcher: p, batter: kidWithContact(5), count: { balls: 1, strikes: 1 } },
          makeRng(`w${stat}:${i}`)
        );
        if (isStrike(r.crossing)) inZone++;
      }
      return inZone / 400;
    };
    expect(wildness(10), 'a better arm hits the zone more often').toBeGreaterThan(wildness(2));
  });
});

describe('determinism', () => {
  it('gives bit-identical results across runs', () => {
    const run = () => {
      const out: number[] = [];
      for (const contact of [3, 5, 8]) {
        for (let i = 0; i < 40; i++) {
          const r = pitchAndSwing(
            { pitcher: ARM, batter: kidWithContact(contact), count: { balls: i % 4, strikes: i % 3 } },
            makeRng(`det${contact}:${i}`)
          );
          out.push(r.crossing.x, r.crossing.y, r.kind.length);
          if (r.kind === 'inPlay') out.push(r.launch.exitVelocityFts, r.launch.launchAngleDeg);
        }
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('keeps a fork independent of its siblings', () => {
    const a = makeRng('seed');
    const b = makeRng('seed');
    b.fork('somethingElse')();
    const spec: PitchSpec = { pitcher: ARM, batter: kidWithContact(5), count: { balls: 0, strikes: 0 } };
    expect(pitchAndSwing(spec, a)).toEqual(pitchAndSwing(spec, b));
  });

  it('★ draws a fixed number of values for the bell, whatever the branch', () => {
    // `Rng.bell` is three uniforms unconditionally. If it short-circuited, a
    // batter who took a pitch would leave the stream in a different place from
    // one who swung, and draw order would be part of the contract again.
    const r = makeRng('bell');
    const before = r.draws;
    r.bell();
    expect(r.draws - before).toBe(3);
    // Symmetric, zero-mean, and bounded — the three properties it claims.
    const s = makeRng('bellstats');
    let sum = 0;
    let max = 0;
    for (let i = 0; i < 20000; i++) {
      const v = s.bell();
      sum += v;
      max = Math.max(max, Math.abs(v));
    }
    expect(Math.abs(sum / 20000), 'zero mean').toBeLessThan(0.03);
    expect(max, 'bounded at three sigma, by construction').toBeLessThanOrEqual(3);
  });
});
