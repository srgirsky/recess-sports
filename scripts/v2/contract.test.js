// ---------------------------------------------------------------------------
// v2's side of the conformance gate.
//
// `scripts/measure/conformance.test.js` exists because a measurement that
// nothing re-checks against the code becomes folklore — the 234px basepath
// that was really 179.6px, believed for months. Its own header says so: "this
// file is not really a test of the numbers, it is a test of the LINK between
// measures.json and the constants those measurements are about."
//
// This is the same test for the two v2 records added with the animation
// contract. Kept SEPARATE from conformance.test.js deliberately: that file
// gates the live v1 game and should not grow an import from a tree that is
// still being built.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REFERENCE_HEIGHT_FT, HEIGHT_MAX_FT, HEIGHT_MIN_FT, crownHeightFt } from '../../src/v2/render/skeleton.ts';
import { CHARACTER_SCALE } from '../../src/v2/render/ProxyCharacter.ts';
import { CLIPS, RUN_SPEED_FTS, clipSpec } from '../../src/v2/render/clips.ts';
import { RIGS } from '../../src/v2/render/cameraCues.ts';

const here = dirname(fileURLToPath(import.meta.url));
const M = JSON.parse(readFileSync(join(here, '..', 'measures.json'), 'utf8'));

describe('render.rigHeight', () => {
  const rec = M.render.rigHeight;

  it('is a well-formed record', () => {
    expect(Object.keys(M.statuses)).toContain(rec.status);
    expect(rec.informs).toBeTruthy();
  });

  it('still describes the rig the code actually has', () => {
    // The record's whole claim is "the crown sums to the reference height now".
    expect(crownHeightFt()).toBeCloseTo(REFERENCE_HEIGHT_FT, 9);
    expect(REFERENCE_HEIGHT_FT).toBeGreaterThanOrEqual(HEIGHT_MIN_FT);
    expect(REFERENCE_HEIGHT_FT).toBeLessThanOrEqual(HEIGHT_MAX_FT);
    expect(rec.informs).toContain('REFERENCE_HEIGHT_FT');
  });

  it('recomputes the character-presence figure it corrected', () => {
    // The arithmetic the record states, redone from the constants rather than
    // copied from it — so an edit to the PLAY rig or to CHARACTER_SCALE that
    // moves the number has to move the record too.
    const play = RIGS.PLAY;
    const distance = Math.hypot(play.eye[1] - play.target[1], play.eye[2] - play.target[2]);
    const frameHeightFt = 2 * distance * Math.tan((play.fov / 2) * (Math.PI / 180));
    const drawnFt = REFERENCE_HEIGHT_FT * CHARACTER_SCALE;
    // 40deg elevation: FIELD_SOLVE's, which PLAY shares so a cut never shifts
    // the foul slope.
    const apparent = drawnFt * Math.cos(40 * (Math.PI / 180));
    const pct = (apparent / frameHeightFt) * 100;

    expect(pct).toBeGreaterThan(4.8);
    expect(pct).toBeLessThan(5.25);
    expect(rec.consequence.nowTrue).toContain('5.02%');
    // And the brief's other number: 40px on an 800px viewport.
    expect((apparent / frameHeightFt) * 800).toBeGreaterThan(39);
    expect((apparent / frameHeightFt) * 800).toBeLessThan(41);
  });

  it('leaves characterPresence honest about having been wrong', () => {
    // A corrected record that does not say it was corrected is just a record
    // that was always right, which is the failure mode this whole file is for.
    expect(M.render.characterPresence.resolution.residual).toMatch(/CORRECTED 2026-07-30/);
    expect(M.render.characterPresence.resolution.residual).toContain('render.rigHeight');
  });
});

describe('render.runCadence', () => {
  const rec = M.render.runCadence;

  it('is a well-formed record', () => {
    expect(Object.keys(M.statuses)).toContain(rec.status);
    expect(rec.informs).toContain('RUN_SPEED_FTS');
    // DERIVED, not measured: it must claim no sample count.
    expect(rec.n).toBe(0);
    expect(rec.confidence).toBe('n/a');
    expect(rec.whatWouldClose).toBeTruthy();
  });

  it('derives run speed from the pace anchor, and both still agree', () => {
    const anchorMs = M.pace.homeToFirst.measured;
    const legFt = 60;
    const derived = legFt / (anchorMs / 1000);
    expect(derived).toBeCloseTo(rec.derivation.runSpeedFts, 2);
    expect(RUN_SPEED_FTS).toBeCloseTo(derived, 2);
    expect(clipSpec('run').authoredSpeedFts).toBe(RUN_SPEED_FTS);
  });

  it('recomputes the stride the record warns about', () => {
    // 24 frames at 30fps -> 2.5 footfalls/s -> a 5.71ft step on a 4.0ft kid.
    // If the clip length or the anchor moves, this number moves, and the
    // record's caveat has to be re-read rather than inherited.
    const cycles = 30 / clipSpec('run').frames;
    const footfalls = cycles * 2;
    const step = RUN_SPEED_FTS / footfalls;
    expect(footfalls).toBeCloseTo(2.5, 6);
    expect(step).toBeCloseTo(rec.derivation.impliedStepFt, 2);
    expect(step / REFERENCE_HEIGHT_FT).toBeCloseTo(rec.derivation.impliedStepPerHeight, 2);
  });

  it('states every authored speed the clip table carries', () => {
    for (const clip of CLIPS) {
      if (clip.authoredSpeedFts === undefined || clip.name === 'run') continue;
      expect(rec.others, `${clip.name} ${clip.authoredSpeedFts}`).toContain(String(clip.authoredSpeedFts));
    }
  });
});
