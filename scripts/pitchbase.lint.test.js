// ---------------------------------------------------------------------------
// One resolver for pitch flight time.
//
// systems/mode.ts getPitchBaseMs is meant to be the single place that answers
// "how long does this pitch take?", so mode and tee-ball are handled once. It
// wasn't: GameScene's two kid-mode flight paths read the raw constants instead,
// and the defensive one had no `tee` branch at all. A tee-ball game therefore
// lobbed at 1500ms when you batted and fired a 278ms laser when you pitched --
// a 5.4x asymmetry, in the tier that exists to be the easiest in the game.
//
// The resolver had the correct logic the whole time. Nothing called it. So this
// lints the CALL SITES rather than the resolver, because the resolver's own
// unit tests passed throughout.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scene = readFileSync(join(root, 'src/scenes/GameScene.ts'), 'utf8');

// Comments may name the constants when explaining the history; only code counts.
const code = scene
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('pitch flight time has exactly one resolver', () => {
  it('never reads TEE_PITCH_MS directly in the scene', () => {
    // The tee lob must arrive via getPitchBaseMs(mode, half, tee) so it cannot
    // apply to one half and not the other.
    expect(code).not.toMatch(/\bTEE_PITCH_MS\b/);
  });

  it('never reads CPU_PITCH_TRAVEL_MS directly in the scene', () => {
    // This was the actual bug: hardcoded as the defensive-half duration AND in
    // the net cast beside it, so tee-ball never reached either.
    expect(code).not.toMatch(/\bCPU_PITCH_TRAVEL_MS\b/);
  });

  it('uses PITCH_TRAVEL_MS only as a field default, never as a flight duration', () => {
    // Allowed: `private pitchTravelMs = PITCH_TRAVEL_MS` and its reset. Any
    // OTHER use is a flight path that skipped the resolver.
    const uses = [...code.matchAll(/\bPITCH_TRAVEL_MS\b/g)];
    const declaredDefaults = [...code.matchAll(/pitchTravelMs\s*=\s*PITCH_TRAVEL_MS/g)];
    const imports = [...code.matchAll(/^\s*PITCH_TRAVEL_MS,\s*$/gm)];
    expect(uses.length).toBe(declaredDefaults.length + imports.length);
  });

  it('resolves both halves through getPitchBaseMs with the tee flag', () => {
    // Both the batting and pitching kid-mode paths must pass `this.tee`; a call
    // that omits it silently reintroduces the asymmetry.
    const calls = [...code.matchAll(/getPitchBaseMs\(([^)]*)\)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const args of calls) {
      expect(args, `getPitchBaseMs(${args}) must pass the tee flag`).toMatch(/this\.tee/);
    }
    expect(calls.some((a) => /'batting'/.test(a))).toBe(true);
    expect(calls.some((a) => /'pitching'/.test(a))).toBe(true);
  });
});
