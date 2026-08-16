// ---------------------------------------------------------------------------
// The clip contract, and the thing that keeps three copies of it honest.
//
// `clips.ts` is the source; `docs/v2/animation-brief.md` is what the animator
// works from; `docs/v2/asset-contract.md` is what the validator's rules are
// written against. Two of those are markdown, which means nothing stops them
// rotting — and a brief that quietly disagrees with the engine buys 43 clips
// that fail acceptance for reasons nobody wrote down.
//
// So the docs are PARSED here and compared field by field. This is the same
// move `scripts/measure/conformance.test.js` makes for the feel constants:
// the prose is allowed to be prose, but every number in it is checked.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CLIPS,
  CLIP_NAMES,
  FPS,
  LOOP_MAX_RATE,
  LOOP_MIN_RATE,
  RUN_SPEED_FTS,
  WARP_MAX_RATE,
  WARP_MIN_RATE,
  clipDurationMs,
  clipSpec,
  holdsBat,
  locomotionRateFor,
  markerLeadSec,
  pickLocomotion,
  warpRateFor,
} from './clips';

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, '..', '..', '..', 'docs', 'v2');
const brief = readFileSync(join(docs, 'animation-brief.md'), 'utf8');
const contract = readFileSync(join(docs, 'asset-contract.md'), 'utf8');

describe('the clip library', () => {
  it('is 43 uniquely-named clips', () => {
    expect(CLIPS).toHaveLength(43);
    expect(new Set(CLIP_NAMES).size).toBe(43);
  });

  it('hands the bat to every plate clip and to nothing that has left the box', () => {
    // Derived from the table: batting group, plus anything settling into
    // `bat_stance` (the dodge). Locomotion is the load-bearing negative — the
    // director drops the bat the moment a batter becomes a runner.
    for (const c of CLIPS) {
      const expected = c.group === 'batting' || c.returnsTo === 'bat_stance';
      expect(holdsBat(c.name), c.name).toBe(expected);
    }
    expect(holdsBat('dodge')).toBe(true);
    expect(holdsBat('run')).toBe(false);
    expect(holdsBat('field_ready')).toBe(false);
  });

  it('puts every marker inside its own clip', () => {
    for (const c of CLIPS) {
      if (!c.marker) continue;
      expect(c.marker.frame, `${c.name} marker`).toBeGreaterThan(0);
      expect(c.marker.frame, `${c.name} marker`).toBeLessThan(c.frames);
    }
  });

  it('settles every one-shot into a real clip, and never a loop into anything', () => {
    // This IS acceptance criterion 2 ("no popping"), expressed as a graph.
    for (const c of CLIPS) {
      if (c.loop) {
        expect(c.returnsTo, `${c.name} loops, so it cannot settle`).toBeUndefined();
        continue;
      }
      if (c.name === 'pose_card') continue; // a held pose settles nowhere
      expect(c.returnsTo, `${c.name} names no clip to settle into`).toBeTruthy();
      expect(CLIP_NAMES, `${c.name} settles into a clip that does not exist`).toContain(c.returnsTo);
    }
  });

  it('cannot build an infinite settle chain', () => {
    // swing_contact -> swing_follow -> bat_stance terminates. A cycle among
    // one-shots would leave the director playing forever.
    for (const c of CLIPS) {
      const seen = new Set<string>([c.name]);
      let cur = clipSpec(c.name);
      while (cur.returnsTo) {
        expect(seen.has(cur.returnsTo), `settle cycle through ${cur.returnsTo}`).toBe(false);
        seen.add(cur.returnsTo);
        cur = clipSpec(cur.returnsTo);
        if (cur.loop) break;
      }
    }
  });

  it('gives every locomotion clip a ground speed to divide by', () => {
    // Without it there is no rate to play at and the feet skate at all speeds.
    const loco = CLIPS.filter((c) => c.group === 'locomotion' && c.name !== 'idle' && c.name !== 'idle_fidget');
    expect(loco.length).toBeGreaterThan(4);
    for (const c of loco) expect(c.authoredSpeedFts, `${c.name}`).toBeGreaterThan(0);
    // walk_on lives in the front-end group but is still locomotion.
    expect(clipSpec('walk_on').authoredSpeedFts).toBeGreaterThan(0);
  });

  it('anchors run to the one measured pace number in the project', () => {
    // pace.homeToFirst: 60ft in 4200ms. Everything else is proportion.
    expect(RUN_SPEED_FTS).toBeCloseTo(60 / 4.2, 2);
    expect(clipSpec('run').authoredSpeedFts).toBe(RUN_SPEED_FTS);
    expect(clipSpec('run_fast').authoredSpeedFts!).toBeGreaterThan(RUN_SPEED_FTS);
    expect(clipSpec('trot').authoredSpeedFts!).toBeLessThan(RUN_SPEED_FTS);
  });

  it('only lets a clip travel when the sim expects it to', () => {
    for (const c of CLIPS) {
      if (c.bodyTravelFt === undefined) continue;
      expect(c.loop, `${c.name} loops and travels — it would drift forever`).toBe(false);
    }
    // A dive is reach; the number must match the sim's dive bonus.
    expect(clipSpec('dive_left').bodyTravelFt).toBe(3.0);
    expect(clipSpec('dive_right').bodyTravelFt).toBe(clipSpec('dive_left').bodyTravelFt);
    // A slide is NOT: the basepath track is sim-owned.
    expect(clipSpec('slide').bodyTravelFt!).toBeLessThanOrEqual(0.5);
  });

  it('keeps pose_card playable', () => {
    // One keyframe is a zero-duration animation. Two is an ordinary held clip.
    expect(clipSpec('pose_card').frames).toBeGreaterThanOrEqual(2);
  });
});

describe('playback rates', () => {
  it('lands a marker on the simulated instant', () => {
    // swing_contact's marker is 7 frames = 233ms in. Give the swing exactly
    // that long and it plays at 1x; give it half and it plays at 2x.
    expect(markerLeadSec('swing_contact')).toBeCloseTo(7 / FPS, 9);
    expect(warpRateFor('swing_contact', 7 / FPS).rate).toBeCloseTo(1, 9);
    expect(warpRateFor('swing_contact', 7 / FPS / 2).rate).toBeCloseTo(2, 9);
    expect(warpRateFor('swing_contact', (7 / FPS) * 1.5).rate).toBeCloseTo(1 / 1.5, 9);
  });

  it('needs more than the loop band, which is why marker clips get their own', () => {
    // The concrete case from the brief: a 120ms-before-contact swing.
    const { rate, clamped } = warpRateFor('swing_contact', 0.12);
    expect(rate).toBeGreaterThan(LOOP_MAX_RATE);
    expect(clamped).toBe(false);
    expect(rate).toBeLessThanOrEqual(WARP_MAX_RATE);
  });

  it('clamps rather than running away, and says so', () => {
    expect(warpRateFor('swing_contact', 0.001).rate).toBe(WARP_MAX_RATE);
    expect(warpRateFor('swing_contact', 0.001).clamped).toBe(true);
    expect(warpRateFor('swing_contact', 10).rate).toBe(WARP_MIN_RATE);
    expect(warpRateFor('swing_contact', 10).clamped).toBe(true);
    // A non-positive lead time is a bug upstream, not a reason to divide by 0.
    expect(warpRateFor('pitch_release', 0).rate).toBe(WARP_MAX_RATE);
    expect(warpRateFor('pitch_release', -1).rate).toBe(WARP_MAX_RATE);
  });

  it('refuses to warp a clip with no marker', () => {
    expect(() => warpRateFor('idle', 0.2)).toThrow(/marker/);
  });

  it('plays a run at the speed the sim is actually running', () => {
    expect(locomotionRateFor('run', RUN_SPEED_FTS)).toBeCloseTo(1, 9);
    expect(locomotionRateFor('run', RUN_SPEED_FTS / 2)).toBeCloseTo(0.5, 9);
    expect(locomotionRateFor('run', 0)).toBe(0);
    expect(() => locomotionRateFor('idle', 5)).toThrow(/locomotion/);
  });

  it('switches motion rather than stretching one clip past legibility', () => {
    // Walking is not running at 0.3x — it is a different motion, and playing
    // `run` that slow reads as slow motion.
    expect(pickLocomotion(4.4)).toBe('walk_on');
    expect(pickLocomotion(7.5)).toBe('trot');
    expect(pickLocomotion(RUN_SPEED_FTS)).toBe('run');
    expect(pickLocomotion(19)).toBe('run_fast');
  });

  it('keeps every speed the game can produce inside the loop band', () => {
    // The point of having four locomotion clips: a kid with speed 2 and a kid
    // with speed 10 must BOTH be inside 0.6x-1.4x, or one of them skates.
    for (let v = 4.0; v <= 19; v += 0.25) {
      const clip = pickLocomotion(v);
      const rate = locomotionRateFor(clip, v);
      expect(rate, `${v.toFixed(2)} ft/s on ${clip}`).toBeGreaterThanOrEqual(LOOP_MIN_RATE);
      expect(rate, `${v.toFixed(2)} ft/s on ${clip}`).toBeLessThanOrEqual(LOOP_MAX_RATE);
    }
  });

  it('reports durations at 30fps', () => {
    expect(clipDurationMs('run')).toBeCloseTo(800, 6);
    expect(clipDurationMs('swing_contact')).toBeCloseTo(600, 6);
  });
});

// --- Doc parity --------------------------------------------------------------

/** Every `| \`name\` | frames | loop | settles into | ... |` row in the brief. */
function briefRows(): Map<string, { frames: number; loop: boolean; settles: string }> {
  const rows = new Map<string, { frames: number; loop: boolean; settles: string }>();
  for (const line of brief.split('\n')) {
    const m = /^\|\s*`([a-z_]+)`\s*\|\s*(\d+)\s*\|\s*(✔|—)\s*\|\s*([^|]*)\|/.exec(line);
    if (!m) continue;
    const settles = m[4].trim().replace(/`/g, '');
    rows.set(m[1], { frames: Number(m[2]), loop: m[3] === '✔', settles: settles === '—' ? '' : settles });
  }
  return rows;
}

describe('docs/v2 mirrors clips.ts', () => {
  it('lists exactly the same clips in the brief', () => {
    const rows = briefRows();
    expect([...rows.keys()].sort()).toEqual([...CLIP_NAMES].sort());
  });

  it('states the same frames, loop flag and settle target', () => {
    const rows = briefRows();
    for (const c of CLIPS) {
      const row = rows.get(c.name)!;
      expect(row.frames, `${c.name} frames`).toBe(c.frames);
      expect(row.loop, `${c.name} loop`).toBe(c.loop);
      expect(row.settles, `${c.name} settles into`).toBe(c.returnsTo ?? '');
    }
  });

  it('states the same marker frames in BOTH documents', () => {
    // The brief and the contract each carry a marker table, and the validator
    // is written against the contract's. Three copies, one truth.
    const markers = CLIPS.filter((c) => c.marker);
    expect(markers.length).toBe(10);
    for (const doc of [brief, contract]) {
      for (const c of markers) {
        const row = new RegExp(
          `\\|\\s*\`${c.name}\`\\s*\\|\\s*\`?${c.marker!.name}\`?\\s*\\|\\s*\\*{0,2}${c.marker!.frame}\\*{0,2}\\s*\\|`
        );
        expect(row.test(doc), `${c.name} marker row missing or wrong`).toBe(true);
      }
    }
  });

  it('states the same authored ground speeds', () => {
    for (const c of CLIPS) {
      if (c.authoredSpeedFts === undefined) continue;
      expect(brief.includes(`${c.authoredSpeedFts} ft/s`), `${c.name} speed ${c.authoredSpeedFts}`).toBe(true);
    }
  });

  it('names every clip in the asset contract too', () => {
    for (const name of CLIP_NAMES) {
      expect(contract.includes(`\`${name}\``), `${name} missing from asset-contract.md`).toBe(true);
    }
    expect(contract).toMatch(/\b43 clips\b/);
    expect(brief).toMatch(/\b43 clips\b/);
  });

  it('tells the animator the wider warp band, not just the loop band', () => {
    // The brief used to state 0.6x-1.4x only, which does not cover a marker
    // clip's rate — and its rate is not negotiable, it is decided by physics.
    expect(brief).toContain(`${WARP_MIN_RATE}×–${WARP_MAX_RATE}×`);
    expect(brief).toContain(`${LOOP_MIN_RATE}×–${LOOP_MAX_RATE}×`);
  });
});
