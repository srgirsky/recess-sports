// ---------------------------------------------------------------------------
// The instruments paint off the fixed clock, never the wall clock.
//
// `smoke:presentation` and `audit:v2-layout` reach a game state with
// `devStepFixedClock` (six sim steps a call, nothing drawn) and then need that
// state DRAWN — the mixers, the HUD, the camera only move inside `tick()`.
// The obvious way to draw is `tick(performance.now())`, and it was the way
// both instruments did it. It is wrong in a way no gate could see:
//
//   `tick` steps the sim by `min(now - last, 0.1s)`, and `last` is the previous
//   drawn frame — the previous BEAT's last paint. The whole reach's wall time
//   sits in that gap, so the first paint tick pumps six sim steps the probe
//   never sampled, before the paint's own. And the clamp is the only bound:
//   a fast reach on a quiet machine paints fewer steps than a slow one under
//   load, so the same seed pumped a DIFFERENT game run to run.
//
// What it looked like (2026-09-01, main, every gate green): the smoke's
// fielded-or-throw beat reached a fly-out's catch at a sample boundary, the
// wall-clock paint carried the sim through the final out, and the probe read
// the between-pitch plate — "a fielder gloves the ball or a throw is in the
// air" failed on a game that had just shown exactly that. Earlier runs of the
// same seed had passed the beat on a different plate appearance entirely.
//
// The fix is `GameView.devPaint(frames)`: paint `frames` frames from the fixed
// clock's own last instant, exactly one sim step each, so a reached state and
// its painted state are the same state whatever the machine is doing. This
// lint keeps the instruments on it.
//
// Break-it record (2026-09-01): against the instruments as they were on main
// (both painted from `performance.now()`, neither called `devPaint`) the
// wall-clock test fails for each with
//   "<file> paints from the wall clock (performance.now) — reach with
//    devStepFixedClock and draw with devPaint(n) instead"
// and the devPaint test with "expected … to match /\.devPaint\(/". With
// `devPaint` deleted from GameView the last test says the lint has gone
// stale; with it ticking from `performance.now()` it says
//   "GameView.devPaint must tick from this.last (one fixed step per frame),
//    never from performance.now()".
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Strip comments — prose may discuss the history; only code counts. */
const codeOf = (rel) =>
  readFileSync(join(root, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The instruments that reach a state with the fixed clock and then draw it. */
const INSTRUMENTS = ['scripts/v2/presentation-smoke.mjs', 'scripts/v2/ui-audit.mjs'];

describe('the instruments paint off the fixed clock', () => {
  for (const rel of INSTRUMENTS) {
    it(`${rel} never reads the wall clock`, () => {
      expect(
        codeOf(rel),
        `${rel} paints from the wall clock (performance.now) — reach with devStepFixedClock and draw with devPaint(n) instead`
      ).not.toMatch(/performance\.now/);
    });

    it(`${rel} draws through devPaint`, () => {
      // An instrument that stopped painting altogether would pass the test
      // above and assert on states nobody drew.
      expect(codeOf(rel)).toMatch(/\.devPaint\(/);
    });
  }

  it('GameView.devPaint ticks from the fixed clock’s own last instant', () => {
    const view = codeOf('src/v2/game/GameView.ts');
    const body = view.match(/devPaint\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
    expect(body, 'GameView.devPaint not found — this lint has gone stale').toBeTruthy();
    expect(
      body[1],
      'GameView.devPaint must tick from this.last (one fixed step per frame), never from performance.now()'
    ).toMatch(/this\.tick\(this\.last\s*\+/);
    expect(body[1]).not.toMatch(/performance\.now/);
  });
});
