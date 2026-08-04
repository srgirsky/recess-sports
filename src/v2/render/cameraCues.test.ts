import { describe, it, expect } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELD_SOLVE, RIGS, chooseCamera, damp, type CameraPreset } from './cameraCues';
import { FIRST, HOME, SECOND, THIRD, VENUE_GEOMETRY, fenceDistAt, pointAt } from '../sim/field';

// The measurement records are the source of truth; read them rather than
// restating their numbers here, so a record edit can't silently pass.
const MEASURES = JSON.parse(
  readFileSync(new URL('../../../scripts/measures.json', import.meta.url), 'utf8')
) as {
  geometry: {
    foulSlope: { band: [number, number] };
    fieldScale: { measurements: Array<{ source: string; pctOfFrameHeight: number }> };
    projectionType: { verdict: string; affineThresholdPx: number };
  };
};

/** Project the field through a preset and measure what a player would see. */
function frame(preset: CameraPreset, aspect = 4 / 3) {
  const rig = RIGS[preset];
  const cam = new PerspectiveCamera(rig.fov, aspect, 0.1, 2000);
  cam.position.set(...rig.eye);
  cam.lookAt(...rig.target);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();

  const H = 480;
  const W = H * aspect;
  const px = (p: { x: number; z: number }, y = 0) => {
    const v = new Vector3(p.x, y, p.z).project(cam);
    return { x: v.x * 0.5 * W, y: -(v.y * 0.5) * H };
  };

  const h = px(HOME);
  const f = px(FIRST);
  const t = px(THIRD);
  const s = px(SECOND);

  return {
    H,
    W,
    px,
    home: h,
    first: f,
    third: t,
    second: s,
    basepathPx: Math.hypot(f.x - h.x, f.y - h.y),
    basepathPct: (Math.hypot(f.x - h.x, f.y - h.y) / H) * 100,
    slopeRight: Math.abs((f.x - h.x) / (f.y - h.y)),
    slopeLeft: Math.abs((t.x - h.x) / (t.y - h.y)),
    /**
     * A diamond is a SQUARE, so its diagonals bisect each other. An affine map
     * preserves that; a perspective map does not. The gap between the two
     * diagonal midpoints IS the perspective strength — this is exactly the
     * test `geometry.projectionType` used on BB2001 footage.
     */
    diagonalMidpointGapPx: Math.hypot((h.x + s.x) / 2 - (f.x + t.x) / 2, (h.y + s.y) / 2 - (f.y + t.y) / 2),
  };
}

describe('★ the FIELD camera closes two v1 known-drift records', () => {
  it('projects the foul lines to BB2001\'s measured slope', () => {
    const [lo, hi] = MEASURES.geometry.foulSlope.band;
    const v = frame('FIELD');

    // In v2 the foul lines are 45° in WORLD space — a real ballpark. The
    // measured 1.197-1.241 is therefore a statement about the CAMERA, not the
    // field, which is why this assertion lives here and not in sim/field.ts.
    expect(v.slopeLeft).toBeGreaterThanOrEqual(lo);
    expect(v.slopeLeft).toBeLessThanOrEqual(hi);
    expect(v.slopeRight).toBeGreaterThanOrEqual(lo);
    expect(v.slopeRight).toBeLessThanOrEqual(hi);
    // Symmetric rig, so the two sides must agree far more tightly than the band.
    expect(Math.abs(v.slopeLeft - v.slopeRight)).toBeLessThan(0.001);
  });

  it('draws the diamond at BB2001\'s measured size', () => {
    // The record's own `nNote` says the 52.3% stadium venue is a per-venue
    // outlier and "the band's top is not something to chase" — so the target
    // is the two LOCAL venues.
    const local = MEASURES.geometry.fieldScale.measurements
      .filter((m) => m.source.startsWith('local:'))
      .map((m) => m.pctOfFrameHeight);
    expect(local.length).toBe(2);
    const lo = Math.min(...local);
    const hi = Math.max(...local);

    const v = frame('FIELD');
    expect(v.basepathPct).toBeGreaterThanOrEqual(lo - 0.15);
    expect(v.basepathPct).toBeLessThanOrEqual(hi + 0.15);

    // v1 was stuck at 34.0% and recorded the shortfall as structural.
    expect(v.basepathPct).toBeGreaterThan(34.0 * 1.15);
  });

  it('is TRUE PERSPECTIVE, not an affine squash', () => {
    const v = frame('FIELD');
    // BB2001 measured a 34.8px diagonal gap against a 3px affine threshold.
    // v1 was affine by construction and could never produce one at all.
    expect(v.diagonalMidpointGapPx).toBeGreaterThan(MEASURES.geometry.projectionType.affineThresholdPx);
    expect(MEASURES.geometry.projectionType.verdict).toBe('PERSPECTIVE');
  });

  it('holds the same framing on every aspect ratio', () => {
    // With a fixed VERTICAL fov, pixels-per-foot doesn't change with aspect —
    // only how much extra width is revealed. So one solve serves phones,
    // tablets and desktops, and the record stays comparable across them.
    const base = frame('FIELD', 4 / 3);
    for (const aspect of [1.5, 1.6, 16 / 9, 2.0]) {
      const v = frame('FIELD', aspect);
      expect(v.basepathPct).toBeCloseTo(base.basepathPct, 3);
      expect(v.slopeLeft).toBeCloseTo(base.slopeLeft, 4);
    }
  });

  it('matches the recorded solve', () => {
    const v = frame('FIELD');
    expect(v.basepathPct).toBeCloseTo(FIELD_SOLVE.expect.basepathPctOfFrameHeight, 1);
    expect(v.slopeLeft).toBeCloseTo(FIELD_SOLVE.expect.foulSlope, 2);
  });
});

describe('FIELD framing', () => {
  it('keeps the whole park in frame on 16:9', () => {
    const v = frame('FIELD', 16 / 9);
    const geo = VENUE_GEOMETRY.park;
    const cfTop = v.px(pointAt(0, fenceDistAt(geo, 0)), geo.fenceHeight);
    const backstop = v.px({ x: 0, z: -22 });
    const poleL = v.px(pointAt(-45, fenceDistAt(geo, -45)), geo.fenceHeight);

    expect(cfTop.y, 'centre-field wall top is on screen').toBeGreaterThan(-v.H / 2);
    expect(backstop.y, 'the backstop is on screen').toBeLessThan(v.H / 2);
    expect(Math.abs(poleL.x), 'the foul poles are on screen at 16:9').toBeLessThan(v.W / 2);
  });

  it('DEEP shares FIELD\'s elevation so the cut does not change the foul slope', () => {
    // A cut that alters the projected slope reads as the field itself moving.
    expect(frame('DEEP').slopeLeft).toBeCloseTo(frame('FIELD').slopeLeft, 2);
  });

  it('DEEP is further back than FIELD', () => {
    expect(frame('DEEP').basepathPct).toBeLessThan(frame('FIELD').basepathPct);
  });
});

describe('camera policy', () => {
  it('CUTS from the pitch view to the field on contact — never blends', () => {
    // The load-bearing rule: proven in v1, and what BB does. A blend across
    // this distance takes ~400ms during which a 6-year-old loses the ball.
    const prev = chooseCamera({ phase: 'pitch' });
    const cue = chooseCamera({ phase: 'contact', ball: [0, 4, 10], launchDeg: 12, carryFt: 90 }, prev);
    expect(cue.transition).toBe('cut');
    // PLAY, not FIELD: gameplay lives on the closer rig. FIELD is the
    // establishing shot that conforms to geometry.fieldScale — see
    // CHARACTER_PRESENCE for why the two had to be split.
    expect(cue.preset).toBe('PLAY');
  });

  it('picks DEEP on the launch, before the ball gets there', () => {
    const cue = chooseCamera({ phase: 'contact', ball: [0, 5, 12], launchDeg: 32, carryFt: 190 });
    expect(cue.preset).toBe('DEEP');
  });

  it('stays on PLAY for a grounder', () => {
    const cue = chooseCamera({ phase: 'contact', ball: [0, 1, 12], launchDeg: -4, carryFt: 60 });
    expect(cue.preset).toBe('PLAY');
  });

  it('blends, not cuts, while a play is already live', () => {
    const cue = chooseCamera({ phase: 'live', ball: [20, 3, 60], launchDeg: 10, carryFt: 80 });
    expect(cue.transition).not.toBe('cut');
  });

  it('cuts to BANG only for a genuinely close play', () => {
    const close = chooseCamera({ phase: 'live', ball: [30, 2, 40], bangBangSec: 0.25 });
    expect(close.preset).toBe('BANG');
    const notClose = chooseCamera({ phase: 'live', ball: [30, 2, 40], bangBangSec: 1.4 });
    expect(notClose.preset).not.toBe('BANG');
  });

  it('returns to the pitch view between pitches', () => {
    expect(chooseCamera({ phase: 'between' }).preset).toBe('PITCH');
  });
});

describe('damp', () => {
  it('converges without overshooting', () => {
    // An overshooting camera on a fly ball reads as a stumble.
    let x = 0;
    let v = 0;
    for (let i = 0; i < 400; i++) {
      [x, v] = damp(x, 10, v, 1 / 60);
      expect(x).toBeLessThanOrEqual(10.0001);
    }
    expect(x).toBeCloseTo(10, 2);
  });

  it('is frame-rate independent to within a hair', () => {
    const run = (dt: number, steps: number) => {
      let x = 0;
      let v = 0;
      for (let i = 0; i < steps; i++) [x, v] = damp(x, 10, v, dt);
      return x;
    };
    // 1 second of settling at 60fps vs 30fps.
    expect(run(1 / 60, 60)).toBeCloseTo(run(1 / 30, 30), 1);
  });
});

describe('★ the policy finally has a caller', () => {
  // ★ `chooseCamera` WAS COMPLETE, TESTED AND INVOKED BY NOTHING until PR 13.
  // Same shape as `isFair` before PR 7 and `startDive` before PR 10: a whole
  // mechanism, argued from v1 and BB2001, that no code path reached. This test
  // is the regression guard for the calling, not the choosing.
  const playView = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../spike/PlayView.ts'),
    'utf8'
  );

  it('★ is called by the play view, through the bridge', () => {
    expect(playView).toMatch(/chooseCamera\(/);
    expect(playView).toMatch(/cameraInputFor\(/);
    // And its cue actually drives the camera, rather than being computed and
    // dropped — which is how a mechanism ends up "wired" but inert.
    expect(playView).toMatch(/RIGS\[[^\]]*preset\]/);
  });

  it('★ honours the hard cut rather than blending across it', () => {
    // The policy's own rule: PITCH -> FIELD is instantaneous, never a blend,
    // because "a blend across that much distance takes ~400ms during which a
    // six-year-old cannot tell where the ball is".
    const pitch = chooseCamera({ phase: 'pitch' });
    const contact = chooseCamera(
      { phase: 'contact', ball: [10, 12, 120], chaser: [20, 130] },
      pitch
    );
    const after = chooseCamera(
      { phase: 'live', ball: [12, 8, 140], chaser: [22, 140] },
      contact
    );
    expect(pitch.preset).toBe('PITCH');
    expect(contact.transition, 'contact is THE cut').toBe('cut');
    expect(after.transition, 'and everything after it is a damped move').not.toBe('cut');
    // The view must branch on it, not smooth everything uniformly.
    expect(playView).toMatch(/transition === 'cut'/);
    // ★ AND THE BRIDGE MUST ACTUALLY EMIT `contact`, or the cut is unreachable
    // while looking wired — which is exactly what it did until this assertion.
    const bridge = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'bridge.ts'),
      'utf8'
    );
    // ★ STRUCTURALLY, NOT "the word appears somewhere". The first version
    // matched /'contact'/ and was satisfied by the explanatory COMMENT, so
    // deleting the branch changed nothing — the gate sweep caught it.
    expect(bridge).toMatch(/phase:\s*[^\n]*\?\s*'contact'\s*:\s*'live'/);
  });

  it('★ damps only when the cue asks for a blend', () => {
    expect(playView).toMatch(/damp\(/);
    // A cut zeroes the velocities; carrying them over is how a "cut" turns
    // into a lurch on the following frames.
    expect(playView).toMatch(/eyeVel\.set\(0, 0, 0\)/);
  });
});
