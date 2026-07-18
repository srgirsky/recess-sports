// ---------------------------------------------------------------------------
// Headless tests for the pure game logic. These run without a browser, so they
// prove the draft / at-bat / inning rules independently of Phaser's render loop.
// Run with: npm test
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { ROSTER, getCharacter } from '../data/characters';
import type { Character } from '../data/types';
import {
  createDraft,
  applyPick,
  chooseAiPick,
  isDraftComplete,
} from './draft';
import { bandFromError, resolveContact, resolveContactAimed, type SwingBand } from './atbat';
import type { PitchPlan } from './pitchkind';
import { CURSOR } from '../config';
import { HOME } from './geometry';
import { newHalfInning, applyAtBat, applyLivePlay } from './inning';
import {
  startLivePlay,
  stepLivePlay,
  finishLivePlay,
  type LivePlayState,
} from './liveplay';
import { resolveLiveParams, getMode, setMode } from './mode';
import { LIVE, MODES } from '../config';
import type { PositionId } from './geometry';
import {
  pitchBandFromError,
  resolveCpuPitch,
  rollAiWildPitch,
  wildSwingBand,
} from './pitch';
import { shouldSkipBottom, isWalkOff, decideAfterHalf } from './gameflow';

const seq = (nums: number[]) => {
  let i = 0;
  return () => nums[i++ % nums.length];
};

const plain = (over: Partial<Character>): Character => ({
  id: 'x',
  name: 'X',
  tagline: '',
  stats: { contact: 5, power: 5, speed: 5, pitching: 5 },
  visual: { skin: 0, hair: 'short', hairColor: 0, uniform: 0, accessory: 'none' },
  ability: 'none',
  ...over,
});

describe('game mode', () => {
  /** Minimal in-memory localStorage for the node test env. */
  const fakeStorage = (initial: Record<string, string> = {}) => {
    const store = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      dump: () => Object.fromEntries(store),
    };
  };
  const withStorage = (initial: Record<string, string>, fn: () => void) => {
    const g = globalThis as { localStorage?: unknown };
    const prev = g.localStorage;
    g.localStorage = fakeStorage(initial);
    try {
      fn();
    } finally {
      g.localStorage = prev;
    }
  };

  it('kid mode keeps the original forgiving live params', () => {
    const p = resolveLiveParams('kid');
    expect(p.cpuFielderSpeed).toBeCloseTo(LIVE.FIELDER_SPEED * 0.62);
    expect(p.cpuReactionMs).toBe(550);
    expect(p.cpuThrowErrorMs).toBe(320);
    expect(p.catchRadius).toBeCloseTo(LIVE.CATCH_RADIUS * 1.6);
    expect(p.playerRunSpeed).toBeCloseTo(LIVE.RUNNER_SPEED * 1.15);
    // CPU reach is never inflated by kid mode.
    expect(p.cpuCatchRadius).toBe(LIVE.CATCH_RADIUS);
  });

  it('main mode is stricter than kid mode across the board', () => {
    const kid = resolveLiveParams('kid');
    const main = resolveLiveParams('main');
    expect(main.cpuFielderSpeed).toBeGreaterThan(kid.cpuFielderSpeed);
    expect(main.cpuReactionMs).toBeLessThan(kid.cpuReactionMs);
    expect(main.cpuThrowErrorMs).toBeLessThan(kid.cpuThrowErrorMs);
    expect(main.catchRadius).toBeLessThan(kid.catchRadius);
  });

  it('kid mode has every extra mechanic switched off', () => {
    expect(Object.values(MODES.kid.features).every((f) => f === false)).toBe(true);
  });

  it('defaults to main for brand-new players', () => {
    withStorage({}, () => expect(getMode()).toBe('main'));
  });

  it('migrates the legacy difficulty choice (easy→kid, hard→main)', () => {
    withStorage({ recess_difficulty: 'easy' }, () => expect(getMode()).toBe('kid'));
    withStorage({ recess_difficulty: 'hard' }, () => expect(getMode()).toBe('main'));
  });

  it('setMode persists and wins over the legacy key', () => {
    withStorage({ recess_difficulty: 'easy' }, () => {
      setMode('main');
      expect(getMode()).toBe('main');
    });
  });

  it('falls back to main when storage is unavailable', () => {
    const g = globalThis as { localStorage?: unknown };
    const prev = g.localStorage;
    g.localStorage = undefined;
    try {
      expect(getMode()).toBe('main');
    } finally {
      g.localStorage = prev;
    }
  });
});

describe('main-mode batting cursor (resolveContactAimed)', () => {
  const planAt = (x: number, y: number): PitchPlan => ({
    kind: 'fastball',
    target: { x, y },
    actual: { x, y },
    inZone: true,
    travelMs: 800,
  });
  const aimed = (over: Partial<Parameters<typeof resolveContactAimed>[0]>) =>
    resolveContactAimed({
      band: 'perfect',
      errorMs: 0,
      cursor: { x: 0, y: 0 },
      plan: planAt(0, 0),
      batter: plain({}),
      pitcher: plain({}),
      rng: () => 0.5,
      ...over,
    });

  it('swinging where the ball is keeps the timing band', () => {
    expect(aimed({}).band).toBe('perfect');
  });

  it('the sweet-spot fringe costs one band; missing entirely whiffs', () => {
    expect(aimed({ cursor: { x: CURSOR.SWEET_R + 5, y: 0 } }).band).toBe('good');
    const whiff = aimed({ cursor: { x: CURSOR.CONTACT_R + 10, y: 0 } });
    expect(whiff.band).toBe('miss');
    expect(whiff.swing.kind).toBe('strike');
  });

  it('never_strikes_out turns a cursor whiff into weak contact', () => {
    const r = aimed({
      cursor: { x: CURSOR.CONTACT_R + 10, y: 0 },
      batter: plain({ ability: 'never_strikes_out' }),
      rng: () => 0.9, // dodge the weak-contact foul roll
    });
    expect(r.band).toBe('weak');
    expect(r.swing.kind).toBe('inPlay');
  });

  it('early swings pull left, late swings go opposite field', () => {
    const early = aimed({ errorMs: -200, band: 'good' });
    const late = aimed({ errorMs: 200, band: 'good' });
    if (early.swing.kind !== 'inPlay' || late.swing.kind !== 'inPlay') throw new Error('expected contact');
    expect(early.swing.launch.landing.x).toBeLessThan(HOME.x);
    expect(late.swing.launch.landing.x).toBeGreaterThan(HOME.x);
  });

  it('cursor under the ball lifts it; over the top chops it down', () => {
    const under = aimed({ band: 'good', cursor: { x: 0, y: 40 }, plan: planAt(0, 0), rng: () => 0.65 });
    const over = aimed({ band: 'good', cursor: { x: 0, y: -40 }, plan: planAt(0, 0), rng: () => 0.65 });
    if (under.swing.kind !== 'inPlay' || over.swing.kind !== 'inPlay') throw new Error('expected contact');
    expect(under.swing.launch.type).toBe('fly');
    expect(over.swing.launch.type).toBe('grounder');
  });

  it('main mode widens the timing windows via the override', () => {
    expect(bandFromError(60)).toBe('good'); // kid default: PERFECT is 55
    expect(bandFromError(60, MODES.main.swingTiming)).toBe('perfect');
  });
});

describe('roster', () => {
  it('has 30 unique characters', () => {
    expect(ROSTER).toHaveLength(30);
    expect(new Set(ROSTER.map((c) => c.id)).size).toBe(30);
  });

  it('includes the three signature ability kids', () => {
    const abilities = ROSTER.map((c) => c.ability);
    expect(abilities).toContain('never_strikes_out');
    expect(abilities).toContain('calls_shot');
    expect(abilities).toContain('unhittable_pitch');
  });
});

describe('draft', () => {
  it('alternates turns and fills both teams to 9', () => {
    let state = createDraft(ROSTER.map((c) => c.id));
    let guard = 0;
    while (!isDraftComplete(state) && guard++ < 100) {
      if (state.turn === 'player') {
        state = applyPick(state, state.pool[0]); // player grabs whatever
      } else {
        state = applyPick(state, chooseAiPick(state, () => 0.5));
      }
    }
    expect(state.playerTeam).toHaveLength(9);
    expect(state.aiTeam).toHaveLength(9);
    expect(state.pool).toHaveLength(30 - 18);
    // No kid drafted twice, no overlap between teams.
    const all = [...state.playerTeam, ...state.aiTeam];
    expect(new Set(all).size).toBe(18);
  });

  it('AI grabs a strong kid left on the board (drafting tension)', () => {
    // Player passes on the best overall hitter; AI should take it next turn.
    const byBat = [...ROSTER].sort(
      (a, b) =>
        b.stats.contact + b.stats.power + b.stats.speed -
        (a.stats.contact + a.stats.power + a.stats.speed)
    );
    const stud = byBat[0];
    let state = createDraft(ROSTER.map((c) => c.id));
    // Player picks a deliberately weak kid instead of the stud.
    const weak = [...ROSTER].sort(
      (a, b) =>
        a.stats.contact + a.stats.power + a.stats.speed -
        (b.stats.contact + b.stats.power + b.stats.speed)
    )[0];
    state = applyPick(state, weak.id);
    const aiPick = chooseAiPick(state, () => 0); // no jitter
    expect(aiPick).toBe(stud.id);
  });
});

describe('at-bat timing bands', () => {
  it('maps swing error to the right band', () => {
    expect(bandFromError(0)).toBe('perfect');
    expect(bandFromError(-40)).toBe('perfect'); // early but dead-on
    expect(bandFromError(100)).toBe('good');
    expect(bandFromError(200)).toBe('weak');
    expect(bandFromError(400)).toBe('miss');
  });
});

describe('at-bat abilities', () => {
  it('never_strikes_out turns a miss into contact (never a strikeout swing)', () => {
    const batter = plain({ ability: 'never_strikes_out' });
    const pitcher = plain({});
    const r = resolveContact('miss', batter, pitcher, seq([0.9, 0.5, 0.5, 0.5]));
    expect(r.kind).not.toBe('strike'); // upgraded away from a whiff
  });

  it('unhittable_pitch drags the batter down a band (a miss stays a strikeout)', () => {
    // vs a normal pitcher a weak swing is contact; vs the ace it drops to a miss.
    const rWeakVsAce = resolveContact('weak', plain({}), plain({ ability: 'unhittable_pitch' }), seq([0.9]));
    expect(rWeakVsAce.kind).toBe('strike');
    const rWeakVsNormal = resolveContact('weak', plain({}), plain({}), seq([0.9, 0.5, 0.5, 0.5]));
    expect(rWeakVsNormal.kind).toBe('inPlay');
  });
});

describe('inning: auto-baserunning', () => {
  it('a home run with the bases loaded scores 4 and clears the bases', () => {
    let s = newHalfInning();
    s.bases = [true, true, true];
    const res = applyAtBat(s, { kind: 'hit', bases: 4, description: 'HR' });
    expect(res.runsScored).toBe(4);
    expect(res.state.bases).toEqual([false, false, false]);
    expect(res.state.runs).toBe(4);
    // Four runners (three on base + batter) all cross home (toBase 4).
    expect(res.movements).toHaveLength(4);
    expect(res.movements.every((m) => m.toBase === 4)).toBe(true);
  });

  it('a single advances runners by one and puts the batter on first', () => {
    let s = newHalfInning();
    s.bases = [true, false, true]; // runners on 1st and 3rd
    const res = applyAtBat(s, { kind: 'hit', bases: 1, description: '1B' });
    // 3rd scores, 1st -> 2nd, batter -> 1st
    expect(res.runsScored).toBe(1);
    expect(res.state.bases).toEqual([true, true, false]);
    // Movements mirror the state change exactly.
    expect(res.movements).toEqual([
      { fromBase: 1, toBase: 2 }, // runner on first -> second
      { fromBase: 3, toBase: 4 }, // runner on third scores
      { fromBase: 0, toBase: 1 }, // batter -> first
    ]);
  });

  it('non-hit outcomes report no movements', () => {
    let s = newHalfInning();
    expect(applyAtBat(s, { kind: 'strike', bases: 0, description: 'K' }).movements).toEqual([]);
    expect(applyAtBat(s, { kind: 'out', bases: 0, description: 'out' }).movements).toEqual([]);
  });

  it('three strikeouts end the half-inning', () => {
    let s = newHalfInning();
    for (let i = 0; i < 3; i++) {
      // three swinging strikes on the same batter = one out; do it for 3 batters
      let r = applyAtBat(s, { kind: 'strike', bases: 0, description: 'K' });
      s = r.state;
      r = applyAtBat(s, { kind: 'strike', bases: 0, description: 'K' });
      s = r.state;
      r = applyAtBat(s, { kind: 'strike', bases: 0, description: 'K' });
      s = r.state;
    }
    expect(s.outs).toBe(3);
  });

  it('a foul does not become the third strike', () => {
    let s = newHalfInning();
    s.count.strikes = 2;
    const res = applyAtBat(s, { kind: 'foul', bases: 0, description: 'foul' });
    expect(res.state.count.strikes).toBe(2);
    expect(res.batterOut).toBe(false);
  });
});

describe('pitch timing bands', () => {
  it('maps throw error to the right band', () => {
    expect(pitchBandFromError(0)).toBe('perfect');
    expect(pitchBandFromError(-60)).toBe('perfect'); // early but dead-on
    expect(pitchBandFromError(140)).toBe('good');
    expect(pitchBandFromError(250)).toBe('weak');
    expect(pitchBandFromError(400)).toBe('wild');
  });
});

describe('CPU at-bat vs the player pitch', () => {
  it('a perfect pitch is never a ball', () => {
    const plan = resolveCpuPitch('perfect', plain({}), plain({}), seq([0, 0.5]));
    expect(plan.isBall).toBe(false);
    expect(plan.cpuSwings).toBe(true);
  });

  it('a wild pitch is usually taken for a ball', () => {
    // isBall roll 0.5 < 0.85 -> ball; chase roll 0.9 > 0.2 -> takes it.
    const plan = resolveCpuPitch('wild', plain({}), plain({}), seq([0.5, 0.9]));
    expect(plan.isBall).toBe(true);
    expect(plan.cpuSwings).toBe(false);
  });

  it('a chased bad ball can only be a weak swing or a whiff', () => {
    // ball -> chase (0.1 < 0.2) -> band roll.
    const plan = resolveCpuPitch('wild', plain({}), plain({}), seq([0.5, 0.1, 0.9]));
    expect(plan.isBall).toBe(true);
    expect(plan.cpuSwings).toBe(true);
    expect(['weak', 'miss']).toContain(plan.cpuBand);
  });

  it('a perfect pitch drags the CPU swing down a band vs a good pitch', () => {
    // Same rng both times: swing roll 0.9 -> 'perfect' before the shift.
    const vsGood = resolveCpuPitch('good', plain({}), plain({}), seq([0.5, 0.9]));
    const vsPerfect = resolveCpuPitch('perfect', plain({}), plain({}), seq([0.5, 0.9]));
    expect(vsGood.cpuBand).toBe('perfect');
    expect(vsPerfect.cpuBand).toBe('good');
  });

  it('a big arm (8+) can rescue a wild throw into the zone', () => {
    const ace = plain({ stats: { contact: 5, power: 5, speed: 5, pitching: 10 } });
    // Ace: nudge roll 0.1 < 0.35 -> wild becomes weak; isBall 0.5 > 0.45 -> strike.
    const rescued = resolveCpuPitch('wild', ace, plain({}), seq([0.1, 0.5, 0.5]));
    expect(rescued.isBall).toBe(false);
    // Average arm, same rolls: stays wild -> 0.5 < 0.85 -> ball. (First roll goes
    // to the isBall check since there's no nudge roll.)
    const notRescued = resolveCpuPitch('wild', plain({}), plain({}), seq([0.1, 0.5, 0.5]));
    expect(notRescued.isBall).toBe(true);
  });

  it('AI wild pitches get rarer with a better pitching stat', () => {
    const wildKid = plain({ stats: { contact: 5, power: 5, speed: 5, pitching: 1 } });
    const ace = plain({ stats: { contact: 5, power: 5, speed: 5, pitching: 10 } });
    expect(rollAiWildPitch(wildKid, () => 0.1)).toBe(true);
    expect(rollAiWildPitch(ace, () => 0.1)).toBe(false);
  });

  it('swinging at a wild pitch caps the band', () => {
    expect(wildSwingBand('perfect')).toBe('weak');
    expect(wildSwingBand('good')).toBe('weak');
    expect(wildSwingBand('weak')).toBe('miss');
    expect(wildSwingBand('miss')).toBe('miss');
  });
});

describe('inning: balls & walks', () => {
  const ball = { kind: 'ball' as const, bases: 0, description: 'Ball!' };

  it('balls 1-3 do not end the at-bat', () => {
    let s = newHalfInning();
    for (let i = 1; i <= 3; i++) {
      const res = applyAtBat(s, ball);
      s = res.state;
      expect(s.count.balls).toBe(i);
      expect(res.batterDone).toBe(false);
      expect(res.movements).toEqual([]);
    }
  });

  it('ball four with the bases empty walks the batter to first', () => {
    const s = newHalfInning();
    s.count.balls = 3;
    const res = applyAtBat(s, ball);
    expect(res.batterDone).toBe(true);
    expect(res.batterOut).toBe(false);
    expect(res.runsScored).toBe(0);
    expect(res.state.bases).toEqual([true, false, false]);
    expect(res.state.count).toEqual({ balls: 0, strikes: 0 });
    expect(res.movements).toEqual([{ fromBase: 0, toBase: 1 }]);
  });

  it('a walk moves only forced runners (runner on 2nd stays put)', () => {
    const s = newHalfInning();
    s.bases = [false, true, false];
    s.count.balls = 3;
    const res = applyAtBat(s, ball);
    expect(res.runsScored).toBe(0);
    expect(res.state.bases).toEqual([true, true, false]);
    expect(res.movements).toEqual([{ fromBase: 0, toBase: 1 }]);
  });

  it('a bases-loaded walk forces in a run and keeps the bases loaded', () => {
    const s = newHalfInning();
    s.bases = [true, true, true];
    s.count.balls = 3;
    const res = applyAtBat(s, ball);
    expect(res.runsScored).toBe(1);
    expect(res.state.bases).toEqual([true, true, true]);
    expect(res.movements).toContainEqual({ fromBase: 3, toBase: 4 });
    expect(res.movements).toContainEqual({ fromBase: 0, toBase: 1 });
  });
});

describe('gameflow: walk-offs, skipped bottoms, bonus innings', () => {
  it('skips the bottom of the final inning when the home CPU already leads', () => {
    expect(shouldSkipBottom(2, 2, 3, 1)).toBe(true);
    expect(shouldSkipBottom(2, 2, 1, 1)).toBe(false); // tied: they still bat
    expect(shouldSkipBottom(2, 2, 1, 3)).toBe(false); // trailing: they still bat
    expect(shouldSkipBottom(1, 2, 5, 0)).toBe(false); // mid-game: always play
    expect(shouldSkipBottom(3, 2, 2, 1)).toBe(true); // extra innings too
  });

  it('walk-off only triggers in the bottom of a final/extra inning', () => {
    expect(isWalkOff(2, 2, 'bottom', 3, 2)).toBe(true);
    expect(isWalkOff(3, 2, 'bottom', 3, 2)).toBe(true); // extra inning
    expect(isWalkOff(1, 2, 'bottom', 3, 2)).toBe(false); // too early
    expect(isWalkOff(2, 2, 'top', 3, 2)).toBe(false); // wrong half
    expect(isWalkOff(2, 2, 'bottom', 2, 2)).toBe(false); // not ahead yet
  });

  it('a tie after regulation earns exactly one bonus inning, then stands', () => {
    // Tied after the bottom of the 2nd -> bonus inning 3.
    expect(decideAfterHalf(2, 'bottom', 2, 2, 2, 1)).toEqual({
      done: false,
      inning: 3,
      half: 'top',
      extra: true,
    });
    // Still tied after the bonus inning -> the tie stands.
    expect(decideAfterHalf(3, 'bottom', 2, 2, 2, 1)).toEqual({ done: true, tie: true });
    // Decided after the bottom -> game over.
    expect(decideAfterHalf(2, 'bottom', 2, 1, 3, 1)).toEqual({ done: true, tie: false });
    // Normal mid-game transitions.
    expect(decideAfterHalf(1, 'top', 2, 0, 0, 1)).toEqual({
      done: false,
      inning: 1,
      half: 'bottom',
      extra: false,
    });
    expect(decideAfterHalf(1, 'bottom', 2, 0, 0, 1)).toEqual({
      done: false,
      inning: 2,
      half: 'top',
      extra: false,
    });
  });
});

describe('sanity: a full simulated game always terminates with a score', () => {
  it('plays 2 innings without hanging (live plays included)', () => {
    // Draft two teams greedily.
    let d = createDraft(ROSTER.map((c) => c.id));
    let guard = 0;
    while (!isDraftComplete(d) && guard++ < 100) {
      d = applyPick(d, chooseAiPick(d, () => Math.random()));
    }

    const POSITIONS: PositionId[] = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
    const params = resolveLiveParams('kid');
    const defenseFor = (team: string[]) =>
      POSITIONS.map((p, i) => ({ position: p, charId: team[i % team.length] }));

    // Drive one live play to completion with plausible scripted inputs: the
    // headless equivalent of the GameScene update() loop.
    const runLive = (s: LivePlayState) => {
      let threw = false;
      let g = 0;
      while (s.phase !== 'done' && g++ < 2000) {
        const inputs =
          s.mode === 'offense'
            ? { run: Math.random() < 0.15 }
            : s.ball.phase === 'held' && !threw
              ? ((threw = true),
                { throwTo: { base: (1 + Math.floor(Math.random() * 4)) as 1 | 2 | 3 | 4, power: Math.random() } })
              : { pointer: s.ball.pos };
        s = stepLivePlay(s, inputs, 50, params, () => Math.random());
      }
      return finishLivePlay(s);
    };

    // Both halves fold contact through the live sim, like GameScene does.
    const contactOrCount = (
      band: SwingBand,
      batter: Character,
      pitcher: Character,
      mode: 'offense' | 'defense',
      state: ReturnType<typeof newHalfInning>,
      defense: Array<{ position: PositionId; charId: string }>
    ) => {
      const r = resolveContact(band, batter, pitcher, () => Math.random());
      if (r.kind !== 'inPlay') return applyAtBat(state, { kind: r.kind, bases: 0, description: '' });
      if (r.launch.homer) return applyAtBat(state, { kind: 'hit', bases: 4, description: 'HR' });
      const baseRunners = ([1, 2, 3] as const)
        .filter((b) => state.bases[b - 1])
        .map((b) => ({ base: b, charId: `r${b}`, speed: 5 }));
      const live = startLivePlay({
        mode,
        launch: r.launch,
        batter: { charId: batter.id, speed: batter.stats.speed },
        baseRunners,
        defense,
        outs: state.outs,
        params,
      });
      return applyLivePlay(state, runLive(live));
    };

    // Player-style half: random swing bands; the AI defense fields the sim.
    const bat = (team: string[], pitcher: Character, defense: ReturnType<typeof defenseFor>) => {
      let s = newHalfInning();
      let i = 0;
      let g = 0;
      while (s.outs < 3 && g++ < 200) {
        const batter = getCharacter(team[i % team.length]);
        const bands = ['perfect', 'good', 'weak', 'miss'] as const;
        const band = bands[Math.floor(Math.random() * 4)];
        const applied = contactOrCount(band, batter, pitcher, 'offense', s, defense);
        s = applied.state;
        if (applied.batterDone) i++;
      }
      return s.runs;
    };
    // CPU-style half: random pitch bands through resolveCpuPitch (balls, walks,
    // takes, and chases included) — the same path GameScene's defense half uses.
    const pitchTo = (team: string[], pitcher: Character, defense: ReturnType<typeof defenseFor>) => {
      let s = newHalfInning();
      let i = 0;
      let g = 0;
      while (s.outs < 3 && g++ < 400) {
        const batter = getCharacter(team[i % team.length]);
        const bands = ['perfect', 'good', 'weak', 'wild'] as const;
        const band = bands[Math.floor(Math.random() * 4)];
        const plan = resolveCpuPitch(band, pitcher, batter, () => Math.random());
        const applied = plan.cpuSwings
          ? contactOrCount(plan.cpuBand, batter, pitcher, 'defense', s, defense)
          : applyAtBat(
              s,
              plan.isBall
                ? { kind: 'ball' as const, bases: 0, description: 'Ball!' }
                : { kind: 'strike' as const, bases: 0, description: 'Strike looking!' }
            );
        s = applied.state;
        if (applied.batterDone) i++;
      }
      return s.runs;
    };

    const aiPitcher = getCharacter(d.aiTeam[0]);
    const playerPitcher = getCharacter(d.playerTeam[0]);
    const aiDefense = defenseFor(d.aiTeam);
    const playerDefense = defenseFor(d.playerTeam);
    let playerScore = 0;
    let aiScore = 0;
    for (let inn = 0; inn < 2; inn++) {
      playerScore += bat(d.playerTeam, aiPitcher, aiDefense);
      aiScore += pitchTo(d.aiTeam, playerPitcher, playerDefense);
    }
    expect(Number.isFinite(playerScore)).toBe(true);
    expect(Number.isFinite(aiScore)).toBe(true);
    expect(playerScore).toBeGreaterThanOrEqual(0);
    expect(aiScore).toBeGreaterThanOrEqual(0);
  });
});
