// ---------------------------------------------------------------------------
// ★ THE LIVE CAMERA OWES THE PLAYER THE KIDS, NOT JUST THE PLAY.
//
// `render.characterPresence` chose real scale plus camera distance over BB's
// ~3.5x kids. Nothing measured what the game then filmed. Over every live
// frame of these seeded games, through the real bridge and the real ladder,
// the chasing fielder was 3.4% of frame height at the median and 2.2% at p10
// (BB2001 measures 8-9%): the 2026-09-29 playthrough's "dark specks". A dolly
// along PLAY's direction was tried and measured: it buys size only by losing
// home plate from frame, and with home kept it did WORSE than the parked eye.
//
// The approved answer is `presenceScale`: render-only growth with distance
// from the live camera. This gate measures the chaser as drawn, through the
// same eye and fov the game uses, and requires floors that the unscaled game
// fails (asserted below, so the gate is known to fire).
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateGameLive, type GameSpec } from '../sim/game';
import { makeRng } from '../sim/rng';
import { ROSTER, getCharacter } from '../../data/characters';
import { cameraInputFor } from './bridge';
import { runnerPos } from '../sim/runners';
import { chooseCamera, crowdTaper, ndcThrough, presenceScale, PRESENCE, RIGS, type CameraCue } from './cameraCues';
import { CHARACTER_SCALE } from './ProxyCharacter';
import { REFERENCE_HEIGHT_FT } from './skeleton';

const SPEC: GameSpec = {
  away: { name: 'Away', ids: ROSTER.slice(0, 9).map((c) => c.id) },
  home: { name: 'Home', ids: ROSTER.slice(9, 18).map((c) => c.id) },
  lookup: getCharacter,
};
/** A median kid drawn: reference rig x render scale x the roster's ~0.95. */
const KID_FT = REFERENCE_HEIGHT_FT * CHARACTER_SCALE * 0.95;
const ASPECT = 4 / 3;
const WIDE = new Set(['PLAY', 'FIELD', 'DEEP']);

/** Chaser heights as a fraction of frame height, with and without presence. */
function survey() {
  const scaled: number[] = [];
  const bare: number[] = [];
  for (const seed of ['presence-a', 'presence-b', 'presence-c']) {
    const game = simulateGameLive(SPEC, makeRng(seed));
    let r = game.next();
    let prev: CameraCue | undefined;
    while (!r.done) {
      const f = r.value;
      if (f.phase === 'live' && f.play) {
        const input = cameraInputFor(f);
        const cue = chooseCamera(input, prev);
        prev = cue;
        if (WIDE.has(cue.preset) && input.chaser) {
          const rig = RIGS[cue.preset];
          const at: [number, number, number] = [input.chaser[0], 0, input.chaser[1]];
          const dist = Math.hypot(rig.eye[0] + at[0], rig.eye[1], rig.eye[2] - at[2]);
          const others = [...f.play.fielders.filter((x) => x.charId !== f.play!.fielders[f.play!.active]?.charId).map((x) => x.p), ...f.play.runners.map((x) => runnerPos(x))];
          const nearest = Math.min(...others.map((p) => Math.hypot(p.x - at[0], p.z - at[2])));
          const m = crowdTaper(presenceScale(dist, rig.fov, KID_FT), nearest);
          const height = (h: number) => {
            const foot = ndcThrough(rig.eye, cue.focus, rig.fov, ASPECT, at);
            const top = ndcThrough(rig.eye, cue.focus, rig.fov, ASPECT, [at[0], h, at[2]]);
            return foot && top ? (top[1] - foot[1]) / 2 : null;
          };
          const b = height(KID_FT);
          const s = height(KID_FT * m);
          if (b !== null && s !== null) {
            bare.push(b);
            scaled.push(s);
          }
        }
      }
      r = game.next();
    }
  }
  const pct = (xs: number[]) => {
    xs.sort((a, b) => a - b);
    return (q: number) => xs[Math.floor(q * (xs.length - 1))];
  };
  return { scaled: pct(scaled), bare: pct(bare), frames: scaled.length };
}

describe('live-camera character presence', () => {
  const s = survey();
  if (process.env.PRESENCE_LOG) {
    for (const [k, f] of [['bare', s.bare], ['scaled', s.scaled]] as const) {
      console.log(`${k} p10 ${(f(0.1) * 100).toFixed(2)}% p50 ${(f(0.5) * 100).toFixed(2)}% p90 ${(f(0.9) * 100).toFixed(2)}%`);
    }
  }

  it('films the chaser large enough to read', () => {
    expect(s.frames).toBeGreaterThan(10_000);
    // Measured with presence: p50 4.98%, p10 3.48% (the 1.6x cap binds on
    // the far half). Unscaled: 3.38% and 2.16%.
    expect(s.scaled(0.5), 'p50').toBeGreaterThan(0.046);
    expect(s.scaled(0.1), 'p10').toBeGreaterThan(0.032);
  });

  it('★ fires on the unscaled game', () => {
    expect(s.bare(0.5)).toBeLessThan(0.046);
    expect(s.bare(0.1)).toBeLessThan(0.032);
  });

  it('never draws a kid past the cap, and never shrinks one', () => {
    expect(presenceScale(10, 46, KID_FT)).toBe(1);
    expect(presenceScale(10_000, 46, KID_FT)).toBe(PRESENCE.maxScale);
  });

  it('eases two kids sharing a bag back to base scale', () => {
    expect(crowdTaper(1.6, 0.5)).toBe(1);
    expect(crowdTaper(1.6, 20)).toBe(1.6);
    expect(crowdTaper(1.6, 4)).toBeGreaterThan(1);
    expect(crowdTaper(1.6, 4)).toBeLessThan(1.6);
  });

  it('★ GameView applies it before the frame, off the live shots only', () => {
    const view = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'game', 'GameView.ts'), 'utf8');
    const tick = view.indexOf("this.applyPresence(painted.phase === 'live', painted);");
    expect(tick).toBeGreaterThan(0);
    expect(tick).toBeLessThan(view.indexOf('applyFrame(this.refs, painted'));
    expect(view).toMatch(/presenceScale\(/);
  });
}, 120_000);
