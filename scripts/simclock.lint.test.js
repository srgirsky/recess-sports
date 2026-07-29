// ---------------------------------------------------------------------------
// Sim-time and real-time must stay the same thing.
//
// Every `pace.*` record in scripts/measures.json is a REAL-millisecond claim
// about our game -- home->1B is 4197ms against BB's measured 4200, fly hang is
// 2875-5075, and so on. Those numbers are only true because GameScene steps the
// live sim on Phaser's raw delta: one sim-ms IS one real-ms, so a constant in
// config.ts can be compared with a stopwatch reading off BB.
//
// conformance.test.js says as much, at the one place it matters:
//
//   No tempo dial exists in src/ -- GameScene steps the sim on Phaser's raw
//   delta -- so sim-ms and real-ms are the same thing. Stated explicitly so
//   that introducing a tempo dial later breaks HERE, loudly, instead of
//   silently invalidating every ratio in measures.json.
//
// It did not break loudly. `ourHomeToFirstMs` passes `tempo: 1` as a LITERAL,
// so a tempo scalar in config.ts changes what the game does and changes nothing
// the test computes. Test-merging the (now closed) PR #17, which added
// `TEMPO = 0.6` and `PITCH_TEMPO = 0.8`, put real home->1B at 6995ms while the
// record went on asserting 4197 -- and all 449 tests passed. Every conformed
// pace record silently invalidated, green CI.
//
// So the claim gets a test instead of a comment. This lints the two things that
// would make it false: a global tempo scalar applied to the sim delta, and a
// divisor on the pitch-base resolver.
//
// This is NOT a ban on ever having a tempo dial. It is a requirement that
// adding one is a visible act: teach the conformance records about it (derive
// the tempo rather than hardcoding 1) and then this file comes out, in the same
// commit, with the reasoning attached.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Strip comments — prose may discuss the history; only code counts. */
const codeOf = (rel) =>
  readFileSync(join(root, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('sim-ms and real-ms are the same millisecond', () => {
  it('config.ts exports no global tempo scalar', () => {
    // The pace records are absolute real-ms claims. A scalar between the
    // constant and the clock makes every one of them a different number
    // without editing any of them.
    expect(codeOf('src/config.ts')).not.toMatch(/export\s+const\s+\w*TEMPO\w*\b/);
  });

  it('GameScene steps the live sim on the RAW frame delta', () => {
    // stepLivePlay must receive delta itself. `delta * TEMPO`, `delta * 0.6`,
    // or any other rescale is the thing that decouples the two clocks.
    const scene = codeOf('src/scenes/GameScene.ts');
    const call = scene.match(/stepLivePlay\([^)]*\)/s);
    expect(call, 'stepLivePlay call not found — this lint has gone stale').toBeTruthy();
    // The dt argument must be a BARE identifier -- `delta`, not `delta * X`.
    // Scoped to this call on purpose: the replay's slow-motion playback clock
    // legitimately scales delta (FX.REPLAY.SPEED), and that is a render-side
    // effect that never reaches the sim.
    const dt = call[0]
      .slice(call[0].indexOf('(') + 1, -1)
      .split(',')[2]
      .trim();
    expect(dt, `stepLivePlay receives a rescaled delta: "${dt}"`).toBe('delta');
  });

  it('getPitchBaseMs SELECTS a constant, it does not scale one', () => {
    // PITCH_SPEED.MAIN_BASE_MS is measured (1350, from a stopwatch-gated
    // reading of a real BB flight, pace.pitchCorridor). Any arithmetic here
    // makes the shipped flight a number no record holds.
    //
    // Checks the whole function body for an operator rather than matching a
    // variable name -- PR #17 introduced a local called `base` and divided by
    // it, but the next attempt will call it something else.
    const mode = codeOf('src/systems/mode.ts');
    const start = mode.indexOf('export function getPitchBaseMs');
    expect(start, 'getPitchBaseMs not found — this lint has gone stale').toBeGreaterThan(-1);
    const open = mode.indexOf('{', mode.indexOf(')', start));
    let depth = 0;
    let end = open;
    for (; end < mode.length; end++) {
      if (mode[end] === '{') depth++;
      else if (mode[end] === '}' && --depth === 0) break;
    }
    const body = mode.slice(open + 1, end);
    expect(body, 'getPitchBaseMs is rescaling the measured pitch base').not.toMatch(
      /[*/%]|[-+]\s*\w/
    );
  });
});
