// ---------------------------------------------------------------------------
// The bunt (`BAT.BUNT_*`): the bat held in the ball's path. Asserted as
// ORDERINGS against the full swing — the values are authored, unmeasured.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { resolvePitch, throwPitch, type PitchInFlight } from './atbat';
import { makeRng } from './rng';
import { ROSTER } from '../../data/characters';
import { BAT } from './params';

const BATTER = ROSTER.find((c) => c.stats.power >= 7) ?? ROSTER[0];
const PITCHER = ROSTER[4];
const spec = () => ({ pitcher: PITCHER, batter: BATTER, count: { balls: 0, strikes: 0 } });

/** `lateFrac` is a fraction of the flight, like the windows themselves. */
function sweep(bunt: boolean, lateFrac: number) {
  let inPlay = 0;
  let ev = 0;
  let angle = 0;
  const n = 200;
  for (let i = 0; i < n; i++) {
    const rng = makeRng(`bunt${i}`);
    const f: PitchInFlight = throwPitch(spec(), rng);
    const r = resolvePitch(f, spec(), rng, { atSec: f.travelSec * (1 + lateFrac), aimHeightFt: f.crossing.y - 0.02, bunt });
    if (r.kind === 'inPlay') {
      inPlay++;
      ev += r.launch.exitVelocityFts;
      angle += r.launch.launchAngleDeg;
    }
  }
  return { inPlay, meanEv: ev / Math.max(1, inPlay), meanAngle: angle / Math.max(1, inPlay) };
}

describe('★ a bunt is soft by physics and forgiving by geometry', () => {
  it('leaves the bat far softer than a square swing', () => {
    const swing = sweep(false, 0);
    const bunt = sweep(true, 0);
    expect(bunt.inPlay).toBeGreaterThan(0);
    expect(bunt.meanEv).toBeLessThan(swing.meanEv * 0.5);
  });

  it('puts a mistimed ball in play where a swing whiffs', () => {
    // Late by more than the swing's contact window, inside the bunt's.
    const late = BAT.CONTACT_WINDOW_FRAC * 1.3;
    expect(late).toBeLessThan(BAT.CONTACT_WINDOW_FRAC * BAT.BUNT_WINDOW_MULT);
    expect(sweep(false, late).inPlay).toBe(0);
    expect(sweep(true, late).inPlay).toBeGreaterThan(sweep(false, late).inPlay);
  });

  it('is level: no swing-plane lift is added', () => {
    expect(sweep(true, 0).meanAngle).toBeLessThan(sweep(false, 0).meanAngle);
  });

  it('without the flag, a person swings exactly as before', () => {
    const rng = makeRng('same');
    const f = throwPitch(spec(), rng);
    const a = resolvePitch(f, spec(), makeRng('x'), { atSec: f.travelSec, aimHeightFt: 2 });
    const b = resolvePitch(f, spec(), makeRng('x'), { atSec: f.travelSec, aimHeightFt: 2, bunt: false });
    expect(b).toEqual(a);
  });
});
