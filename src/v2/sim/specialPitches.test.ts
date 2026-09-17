// ---------------------------------------------------------------------------
// The three special pitches, checked as PHYSICS and as a SPEND.
//
// Physics: each special is a parameter set in the same model as the base four
// (`pitch.ts` `SPECIAL_PITCHES`), so the same solve must land it — every
// (kind, stat, spot) crosses at its aim height, which is what `contact.test.ts`
// asserts for the base four — and the flight times must ORDER the way the
// cards promise (floater slowest, fireball fastest), never at a value: the base
// flight is `pace.pitchCorridor`'s one measurement and these are multipliers.
// The crazy ball is wild by `scatterMult` on the kid's own execution error, so
// it is asserted as a SPREAD, not a miss.
//
// Spend: `game.ts` is the gate. With the flag off, or the meter short, a
// proposed special is thrown as a fastball with no `spend` event; with both on
// it is paid for at the sim's own cost and drains the arm triple. The CPU
// buys one off the same per-PA `fork('juice')` its powers roll on, and only
// when it can afford one — so a broke side draws nothing. `sim.specialPitches`
// records what was measured here, including what the solve could NOT deliver.
// ---------------------------------------------------------------------------

import { beforeAll, describe, expect, it } from 'vitest';
import {
  PITCHES,
  PITCH_SPOTS,
  SPECIAL_PITCHES,
  SPECIAL_PITCH_KINDS,
  flyToPlate,
  isSpecialPitch,
  pitchDef,
  releaseAtSpot,
  releaseFrom,
  type PitchKind,
} from './pitch';
import { throwPitch, type PitchPlan } from './atbat';
import { cpuPickSpecialPitch, isSpecialSpend, newJuice, spendSide, type SpendKind } from './juice';
import { simulateGame, simulateGameLive, type GameResult, type GameSpec, type LiveFrame, type SimEvent } from './game';
import { DEFAULT_FEATURES } from './features';
import { JUICE, PITCH, STAMINA } from './params';
import { makeRng } from './rng';
import { zoneBandFt, zoneHalfWidthFt } from './athletes';
import { ROSTER, getCharacter } from '../../data/characters';

const KINDS: PitchKind[] = [...(Object.keys(PITCHES) as PitchKind[]), ...SPECIAL_PITCH_KINDS];
const [ZLO, ZHI] = zoneBandFt();
const MID = (ZLO + ZHI) / 2;
const HALF_W = zoneHalfWidthFt();
const HALF_H = (ZHI - ZLO) / 2;
/** The nine aim points the sim actually uses, in feet. */
const SPOTS = PITCH_SPOTS.map((s) => ({ aimLateralFt: s.lateral * HALF_W, aimHeightFt: MID + s.height * HALF_H }));

/** Seven kinds x ten stats x nine spots is 630 solves at ~9ms each: fixture, warmed once. */
const SOLVES = 60_000;
beforeAll(() => {
  for (const kind of KINDS) for (let stat = 1; stat <= 10; stat++) for (const s of SPOTS) releaseAtSpot({ kind, pitchingStat: stat, ...s });
}, SOLVES);

describe('★ the specials are parameter sets in the one model', () => {
  it('are three, in a separate record, and PITCHES is still the four the CPU draws from', () => {
    // `choosePitch` picks from `Object.keys(PITCHES)`; a fifth key there would
    // move every CPU draw and break every golden fingerprint.
    expect(Object.keys(PITCHES).sort()).toEqual(['changeup', 'curve', 'fastball', 'screwball']);
    expect([...SPECIAL_PITCH_KINDS]).toEqual(['crazy', 'fireball', 'freezeball']);
    for (const k of SPECIAL_PITCH_KINDS) {
      expect(isSpecialPitch(k)).toBe(true);
      expect(pitchDef(k)).toBe(SPECIAL_PITCHES[k]);
    }
    for (const k of Object.keys(PITCHES) as PitchKind[]) {
      expect(isSpecialPitch(k)).toBe(false);
      expect(pitchDef(k)).toBe(PITCHES[k as keyof typeof PITCHES]);
    }
  });

  it('★ every kind, every arm, every spot crosses at its aim — the solve lands all seven', () => {
    // The same assertion `contact.test.ts` makes for the base four at stat 5,
    // over the whole (stat x spot) grid the game can ask for. A special that
    // wanted more hang than the solve's low branch has would end on the
    // fallback elevation and cross feet from its aim — which is exactly what
    // the first floater did (`pitch.ts` records it), so this is the gate:
    // the three specials land within 0.05 ft everywhere. The base four are
    // held to the residual the repo already records — a weak arm's changeup
    // saturates and crosses under its target (`params.ts` `ELEV_ITERATIONS`:
    // 0.87 ft measured; 0.78 today) — because moving that is the solver's
    // work and a golden's, not a spend's.
    for (const kind of KINDS) {
      const bar = isSpecialPitch(kind) ? 0.05 : 0.9;
      for (let stat = 1; stat <= 10; stat++) {
        for (const s of SPOTS) {
          const flown = flyToPlate(releaseFrom(releaseAtSpot({ kind, pitchingStat: stat, ...s })));
          expect(Math.abs(flown.state.p.y - s.aimHeightFt), `${kind} stat ${stat} at ${s.aimLateralFt.toFixed(2)},${s.aimHeightFt.toFixed(2)}`).toBeLessThan(bar);
          expect(flown.travelSec, `${kind} stat ${stat}: reached the plate`).toBeLessThan(PITCH.MAX_FLIGHT_SEC);
        }
      }
    }
  }, SOLVES);

  it('★ orders the flight times: floater > changeup > fastball > fireball, over every arm and spot', () => {
    // An ORDER, never a value. Means over the whole grid, because the base
    // solve saturates at weak arms (`sim.throwSpeed.comparedWithThePitch`)
    // and a single stat can invert — the fastball's stat-5 flight is a
    // half-converged 1.02 s that a fireball equals. The kid's experience is
    // the grid.
    const mean = (kind: PitchKind) => {
      let sum = 0;
      let n = 0;
      for (let stat = 1; stat <= 10; stat++) {
        for (const s of SPOTS) {
          sum += flyToPlate(releaseFrom(releaseAtSpot({ kind, pitchingStat: stat, ...s }))).travelSec;
          n++;
        }
      }
      return sum / n;
    };
    const t = Object.fromEntries(KINDS.map((k) => [k, mean(k)])) as Record<PitchKind, number>;
    expect(t.freezeball, 'the floater hangs longer than the changeup').toBeGreaterThan(t.changeup);
    expect(t.changeup).toBeGreaterThan(t.fastball);
    expect(t.fastball, 'the fireball is the fastest thing on the mound').toBeGreaterThan(t.fireball);
    for (const k of KINDS) {
      expect(t.freezeball, `${k} does not hang longer than the floater`).toBeGreaterThanOrEqual(t[k]);
      expect(t.fireball, `${k} is not faster than the fireball`).toBeLessThanOrEqual(t[k]);
    }
  }, SOLVES);

  it('★ the crazy ball is wild by the kid\'s own error, doubled — a spread, not a miss', () => {
    const arm = ROSTER.reduce((b, c) => (Math.abs(c.stats.pitching - 5) < Math.abs(b.stats.pitching - 5) ? c : b));
    const spec = { pitcher: arm, batter: ROSTER[0], count: { balls: 0, strikes: 0 } };
    const spread = (kind: PitchKind) => {
      const xs: number[] = [];
      for (let i = 0; i < 160; i++) {
        const inF = throwPitch(spec, makeRng(`wild${i}`), { kind, aimLateralFt: 0, aimHeightFt: MID });
        expect(inF.kind, 'the kind a person chose is the kind thrown').toBe(kind);
        xs.push(inF.crossing.x);
      }
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / xs.length);
    };
    expect(SPECIAL_PITCHES.crazy.scatterMult).toBe(2);
    // The same bell, a wider nudge: roughly double the lateral spread. The
    // bound is loose because the crossing is an integrated trajectory, not
    // the nudge itself.
    expect(spread('crazy')).toBeGreaterThan(1.5 * spread('fastball'));
    expect(spread('fireball'), 'the other two specials scatter like a base pitch').toBeLessThan(1.3 * spread('fastball'));
  }, SOLVES);
});

describe('★ a special is a spend', () => {
  it('names the three as fielding-side spends at v1\'s costs, distinct from the powers', () => {
    for (const k of SPECIAL_PITCH_KINDS) {
      expect(isSpecialSpend(k)).toBe(true);
      expect(spendSide(k)).toBe('fielding');
      expect(JUICE.COSTS[k]).toBeGreaterThan(0);
    }
    expect(isSpecialSpend('powerSwing')).toBe(false);
    expect(isSpecialSpend('goldenGlove')).toBe(false);
  });

  it('★ the CPU draws nothing when it can afford no special, and picks uniformly among what it can', () => {
    const rng = makeRng('broke');
    expect(cpuPickSpecialPitch(newJuice(), -3, rng)).toBeNull();
    expect(rng.draws, 'a broke side must not move a stream').toBe(0);

    // Trailing and rich: the pick is uniform among the three, so every kind is
    // reached, and the roll is at the trailing eagerness.
    const seen = new Map<string, number>();
    let picked = 0;
    const N = 1200;
    for (let i = 0; i < N; i++) {
      const k = cpuPickSpecialPitch({ value: JUICE.MAX }, -1, makeRng(`rich${i}`));
      if (k) {
        picked++;
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
    }
    expect([...seen.keys()].sort()).toEqual(['crazy', 'fireball', 'freezeball']);
    expect(picked / N).toBeGreaterThan(JUICE.CPU_EAGERNESS.trailing - 0.08);
    expect(picked / N).toBeLessThan(JUICE.CPU_EAGERNESS.trailing + 0.08);
    for (const n of seen.values()) expect(n / picked).toBeGreaterThan(0.2);

    // Afford exactly one kind: that is the only one ever picked.
    const only = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const k = cpuPickSpecialPitch({ value: JUICE.COSTS.crazy }, -1, makeRng(`one${i}`));
      if (k) only.add(k);
    }
    expect([...only]).toEqual(['crazy']);
  });
});

// --- The game loop's gate ----------------------------------------------------

const AWAY = ROSTER.slice(0, 9).map((c) => c.id);
const HOME = ROSTER.slice(9, 18).map((c) => c.id);
function spec(over: Partial<GameSpec> = {}): GameSpec {
  return { away: { name: 'Rockets', ids: AWAY }, home: { name: 'Comets', ids: HOME }, lookup: getCharacter, ...over };
}
const fp = (g: GameResult) =>
  `${g.awayScore}-${g.homeScore} i${g.innings} pa${g.tally.plateAppearances} h${g.tally.hits} k${g.tally.strikeouts} r${g.tally.runs} s${g.tally.stealAttempts} log${g.log.length}`;
const PLAYS_GAMES = 60_000;

/** Drive a live game, proposing `plan` on every bottom-half windup (the person's, with humanSide 'away'). */
function driveProposing(
  g: GameSpec,
  seed: string,
  plan: (f: LiveFrame) => PitchPlan | undefined,
  onPitch: (f: LiveFrame, before: LiveFrame) => void
): void {
  const it = simulateGameLive(g, makeRng(seed));
  let r = it.next();
  for (let n = 0; !r.done && n < 60_000; n++) {
    const f = r.value;
    if (f.phase === 'windup') {
      const p = plan(f);
      const before: LiveFrame = { ...f, juice: f.juice ? { ...f.juice } : null };
      r = it.next(p ? { pitch: p } : {});
      if (!r.done && r.value.phase === 'pitch') onPitch(r.value, before);
      continue;
    }
    r = it.next();
  }
}

describe('★ the game loop pays for a special or takes it away', () => {
  const special = (f: LiveFrame): PitchPlan | undefined =>
    f.half === 'bottom' ? { kind: 'fireball', aimLateralFt: 0, aimHeightFt: MID } : undefined;

  it('★ with the flag off a proposed special is a fastball, silently — no spend event', () => {
    for (const features of [undefined, { ...DEFAULT_FEATURES, juice: true }]) {
      const spends: SimEvent[] = [];
      let thrown = 0;
      driveProposing(
        spec({ humanSide: 'away', features, onEvent: (e) => { if (e.t === 'spend' && isSpecialSpend(e.kind)) spends.push(e); } }),
        'off',
        special,
        (f) => {
          if (f.half !== 'bottom') return;
          thrown++;
          expect(f.pitch!.kind, 'downgraded to the fastball').toBe('fastball');
        }
      );
      expect(thrown, 'the person pitched').toBeGreaterThan(0);
      expect(spends, 'nothing was bought').toEqual([]);
    }
  }, PLAYS_GAMES);

  it('★ with the flag and the meter on it is thrown as proposed, paid at the sim\'s cost, and drains the arm triple', () => {
    const spends: Array<{ side: string; kind: string }> = [];
    let bought = 0;
    let downgraded = 0;
    driveProposing(
      spec({
        humanSide: 'away',
        features: { ...DEFAULT_FEATURES, juice: true, specialPitches: true, stamina: true },
        onEvent: (e) => { if (e.t === 'spend') spends.push({ side: e.side, kind: e.kind }); },
      }),
      'on',
      special,
      (f, before) => {
        if (f.half !== 'bottom') return;
        const affordable = before.juice!.away >= JUICE.COSTS.fireball;
        // The tank floors at 0 (`stamina.ts`), so the drain is only visible
        // while there is that much left in it.
        const tankLeft = before.stamina! >= STAMINA.DRAIN_SPECIAL;
        if (affordable) {
          bought++;
          expect(f.pitch!.kind).toBe('fireball');
          expect(f.juice!.away, 'the meter dropped by the cost').toBe(before.juice!.away - JUICE.COSTS.fireball);
          expect(spends[spends.length - 1]).toEqual({ side: 'away', kind: 'fireball' });
          if (tankLeft) expect(before.stamina! - f.stamina!, 'a special costs the arm triple').toBeCloseTo(STAMINA.DRAIN_SPECIAL, 9);
        } else {
          downgraded++;
          expect(f.pitch!.kind, 'a short meter throws the fastball').toBe('fastball');
          if (tankLeft) expect(before.stamina! - f.stamina!).toBeCloseTo(STAMINA.DRAIN_PER_PITCH, 9);
        }
      }
    );
    expect(bought, 'the person never afforded a special').toBeGreaterThan(0);
    expect(downgraded, 'the person was never short — the downgrade path was not exercised').toBeGreaterThan(0);
    // Nobody buys a special for the person: every special spent on away's
    // meter is the one kind the person proposed.
    const awaySpecials = spends.filter((s) => s.side === 'away' && isSpecialSpend(s.kind as SpendKind));
    expect(awaySpecials.length).toBe(bought);
    expect(awaySpecials.every((s) => s.kind === 'fireball')).toBe(true);
  }, PLAYS_GAMES);

  it('★ a special proposed through the spend channel, or for the other side, buys nothing', () => {
    const spends: string[] = [];
    const it = simulateGameLive(
      spec({
        humanSide: 'away',
        features: { ...DEFAULT_FEATURES, juice: true, specialPitches: true },
        onEvent: (e) => { if (e.t === 'spend') spends.push(`${e.side}:${e.kind}`); },
      }),
      makeRng('channel')
    );
    let r = it.next();
    for (let n = 0; !r.done && n < 40_000; n++) {
      const f = r.value;
      if (f.phase === 'windup') {
        // A special on the SPEND channel is not how one is bought; a special
        // pitch plan on the TOP half is the other side's mound.
        r = it.next(
          f.half === 'top'
            ? { pitch: { kind: 'freezeball', aimLateralFt: 0, aimHeightFt: MID } }
            : { spend: 'crazy' }
        );
        continue;
      }
      r = it.next();
    }
    expect(spends.filter((s) => s.startsWith('away:') && SPECIAL_PITCH_KINDS.some((k) => s.endsWith(k)))).toEqual([]);
  }, PLAYS_GAMES);
});

describe('★ the flag is not inert, and alone it is', () => {
  const game = (seed: string, over: Partial<GameSpec> = {}) => simulateGame(spec(over), makeRng(seed));

  it('★ specialPitches WITHOUT juice changes nothing — the meter is the gate', () => {
    for (const seed of ['a', 'b', 'c']) {
      expect(fp(game(seed, { features: { ...DEFAULT_FEATURES, specialPitches: true } }))).toBe(fp(game(seed)));
    }
  }, PLAYS_GAMES);

  it('★ specialPitches WITH juice is a different game where the CPU affords one, and the CPU does buy them', () => {
    const kinds = new Set<string>();
    let differed = 0;
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const bought: string[] = [];
      const both = game(seed, {
        features: { ...DEFAULT_FEATURES, juice: true, specialPitches: true },
        onEvent: (e) => { if (e.t === 'spend' && isSpecialSpend(e.kind)) bought.push(e.kind); },
      });
      for (const k of bought) kinds.add(k);
      const juiceOnly = game(seed, { features: { ...DEFAULT_FEATURES, juice: true } });
      if (bought.length > 0) {
        differed++;
        expect(fp(both), `${seed}: a special was bought and the game did not change`).not.toBe(fp(juiceOnly));
      }
    }
    expect(differed, 'in eight seeded games the CPU never afforded a special').toBeGreaterThan(0);
    expect([...kinds].sort(), 'every kind is reachable by the CPU').toEqual(['crazy', 'fireball', 'freezeball']);
  }, PLAYS_GAMES);
});
