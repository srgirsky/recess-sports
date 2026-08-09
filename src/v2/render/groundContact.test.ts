// ---------------------------------------------------------------------------
// ★ THE OTHER HALF OF A TEST THAT ALREADY EXISTED.
//
// `skeleton.test.ts` § "stands the rig on the floor" asserts the BIND pose's
// toes sit at exactly 0, and its comment says why it matters: "a rig whose toes
// float or sink is a rig every foot-plant in the library is authored wrong on".
// Nobody then asked the same question of the LIBRARY. Thirty-five clips are
// authored as joint angles in absolute feet, and bending a knee without also
// dropping the hips does not lower a kid — it lifts his feet.
//
// So the whole fielding family levitated. Measured on the 4.0ft reference rig,
// before the ground solve:
//
//   field_ready   both toes 0.451ft up   (11% of body height)
//   throw_quick   0.472ft up
//   catch_low / field_scoop / catch_jump / catch_chest   0.477ft up
//   bat_stance and the three swings off it   0.081ft up
//   jog_back, shuffle_left, shuffle_right    0.141ft up
//   slide   a toe 1.141ft UNDER the field
//   getup   0.888ft under
//   dive_left / dive_right   0.792ft under
//
// ★ AND IT WAS ALREADY BEING PAID FOR SOMEWHERE ELSE. `render.pitchFraming`
// recorded the PITCH camera as unable to see its own strike zone and blamed a
// catcher who is "close and TALL" — 6.43 drawn feet, which is a kid's STANDING
// height. He was tall because `field_ready`, the clip `bridge.ts` gives him
// precisely so he crouches, lifted him instead of lowering him. A camera record
// was describing an animation bug, which is what an unmeasured quantity does:
// it turns up as somebody else's number.
//
// ★ THIS FILE MEASURES INDEPENDENTLY OF THE SOLVER. `proceduralClips.ts` solves
// the offset by evaluating its own `KeyframeTrack` interpolants and running hand
// forward kinematics over `SKELETON`. This asserts it by playing the clip on a
// real `AnimationMixer` against a real bone hierarchy and reading world matrices
// — the path the engine actually takes. Two implementations, one answer; if they
// disagree the gate is checking something the renderer does not believe. It is
// the same reason `AnimationDirector.test.ts` re-derives markers that
// `modelRules.mjs` already derives.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { AnimationClip, AnimationMixer, Object3D, Vector3 } from 'three';
import { CLIPS, FPS, type ClipSpec } from './clips';
import { GROUND_EPSILON_FT, buildJunebugPilotClips, buildProceduralClips, buildTheoPilotClips } from './proceduralClips';
import { buildSkeleton } from './ProxyCharacter';

/** Sub-frame samples, so a slerped dip between two grounded keys is seen. */
const SUBSAMPLES = 4;

interface Contact {
  /** Lowest world Y any bone reaches over the clip, ft. Negative = through. */
  lowestFt: number;
  /** Lowest either toe reaches, ft. */
  lowestToeFt: number;
  /** Highest the LOWER toe reaches — a clip's flight phase, ft. */
  peakLowerToeFt: number;
}

/**
 * Play a clip on a real mixer and read the world matrices.
 *
 * `Root` is excluded for the reason the solver excludes it: it sits at the
 * origin by definition and is never keyed, so a rule that counted it would be
 * satisfied by every clip in the library including the broken ones. That is not
 * hypothetical — it is what the first version of the solve did, and it moved
 * nothing while reporting success.
 */
function measure(clip: AnimationClip, spec: ClipSpec): Contact {
  const { root } = buildSkeleton();
  const holder = new Object3D();
  holder.add(root);
  const mixer = new AnimationMixer(holder);
  mixer.clipAction(clip).play();

  const bones: Object3D[] = [];
  root.traverse((n) => bones.push(n));
  const toes = bones.filter((b) => b.name === 'LeftToeBase' || b.name === 'RightToeBase');
  const body = bones.filter((b) => b.name !== 'Root');
  expect(toes).toHaveLength(2);

  let lowestFt = Infinity;
  let lowestToeFt = Infinity;
  let peakLowerToeFt = -Infinity;
  const at = new Vector3();
  let prev = 0;
  for (let i = 0; i <= spec.frames * SUBSAMPLES; i++) {
    const t = i / SUBSAMPLES / FPS;
    mixer.update(t - prev);
    prev = t;
    holder.updateWorldMatrix(true, true);
    for (const b of body) lowestFt = Math.min(lowestFt, b.getWorldPosition(at).y);
    const lower = Math.min(...toes.map((b) => b.getWorldPosition(at).y));
    lowestToeFt = Math.min(lowestToeFt, lower);
    peakLowerToeFt = Math.max(peakLowerToeFt, lower);
  }
  return { lowestFt, lowestToeFt, peakLowerToeFt };
}

const LIBRARY = new Map(buildProceduralClips().map((c) => [c.name, c]));

describe('every clip stands on the ground', () => {
  for (const spec of CLIPS) {
    it(`${spec.name} touches the field and never passes through it`, () => {
      const clip = LIBRARY.get(spec.name);
      expect(clip, `no procedural stand-in for ${spec.name}`).toBeDefined();
      const { lowestFt } = measure(clip!, spec as ClipSpec);

      // NOTHING SINKS. A kid whose foot is under the grass is not a small
      // error — `slide` buried one 1.14ft down, a quarter of his height.
      expect(lowestFt).toBeGreaterThan(-GROUND_EPSILON_FT);
      // AND SOMETHING TOUCHES. Without this half the rule is satisfied by
      // hovering, which is exactly the defect that shipped.
      expect(lowestFt).toBeLessThan(GROUND_EPSILON_FT);
    });
  }
});

describe('Junebug pilot ground contact', () => {
  for (const clip of buildJunebugPilotClips()) {
    it(`${clip.name} touches the field without sinking`, () => {
      const spec = CLIPS.find((candidate) => candidate.name === clip.name)! as ClipSpec;
      const { lowestFt } = measure(clip, spec);
      expect(lowestFt).toBeGreaterThan(-GROUND_EPSILON_FT);
      expect(lowestFt).toBeLessThan(GROUND_EPSILON_FT);
    });
  }
});

describe('Theo character-pass ground contact', () => {
  for (const clip of buildTheoPilotClips()) {
    it(`${clip.name} touches the field without sinking`, () => {
      const spec = CLIPS.find((candidate) => candidate.name === clip.name)! as ClipSpec;
      const { lowestFt } = measure(clip, spec);
      expect(lowestFt).toBeGreaterThan(-GROUND_EPSILON_FT);
      expect(lowestFt).toBeLessThan(GROUND_EPSILON_FT);
    });
  }
});

describe('★ the rule fires, and the motion survives it', () => {
  // ★ WITHOUT THIS THE FILE ABOVE IS A DESCRIPTION, NOT A GATE. Deleting the
  // Hips track is exactly the state the library shipped in — no clip authored a
  // ground offset — so this reconstructs the bug rather than inventing one.
  it('★ catches the float it was written for: strip the solve and field_ready hovers', () => {
    const spec = CLIPS.find((c) => c.name === 'field_ready')! as ClipSpec;
    const solved = LIBRARY.get('field_ready')!;
    const unsolved = solved.clone();
    unsolved.tracks = unsolved.tracks.filter((t) => t.name !== 'Hips.position');

    const before = measure(unsolved, spec);
    const after = measure(solved, spec);

    // The defect, at its recorded size: a catcher standing on nothing.
    expect(before.lowestToeFt).toBeGreaterThan(0.4);
    expect(after.lowestToeFt).toBeLessThan(GROUND_EPSILON_FT);
  });

  it('★ leaves a run its flight phase — a per-key plant would have deleted it', () => {
    // The reason the offset is ONE rigid translation per clip and not a plant
    // solved per key: planting every frame glues the lower foot to the ground,
    // and a run with both feet always down is a shuffle.
    for (const name of ['run', 'run_fast'] as const) {
      const spec = CLIPS.find((c) => c.name === name)! as ClipSpec;
      const { peakLowerToeFt } = measure(LIBRARY.get(name)!, spec);
      expect(peakLowerToeFt, `${name} never leaves the ground`).toBeGreaterThan(0.1);
    }
  });

  it('★ leaves catch_jump its apex, measured off the ground it now touches', () => {
    const spec = CLIPS.find((c) => c.name === 'catch_jump')! as ClipSpec;
    const { lowestToeFt, peakLowerToeFt } = measure(LIBRARY.get('catch_jump')!, spec);
    // A jump starts from the floor and leaves it. Before the solve it did
    // neither: it began 0.477ft up and stayed airborne for its whole duration.
    expect(lowestToeFt).toBeLessThan(GROUND_EPSILON_FT);
    expect(peakLowerToeFt).toBeGreaterThan(1.0);
  });

  it('★ crouches the catcher, which is the whole reason bridge.ts plays it', () => {
    // `applyIdleDefence` gives the catcher `field_ready` so he does what a
    // catcher does. Before the solve the clip lowered his crown by 6% of his
    // height, which is not a crouch — it is a kid standing up with bent knees
    // and his feet in the air.
    const spec = CLIPS.find((c) => c.name === 'field_ready')! as ClipSpec;
    const clip = LIBRARY.get('field_ready')!;
    const { root } = buildSkeleton();
    const holder = new Object3D();
    holder.add(root);
    const mixer = new AnimationMixer(holder);
    mixer.clipAction(clip).play();
    mixer.update(spec.frames / 2 / FPS);
    holder.updateWorldMatrix(true, true);

    let crown: Object3D | undefined;
    root.traverse((n) => {
      if (n.name === 'HeadTop_End') crown = n;
    });
    const y = crown!.getWorldPosition(new Vector3()).y;
    // Standing is 4.0. A crouch has to read as one from the PITCH camera, and
    // the drawn figure is this times CHARACTER_SCALE.
    expect(y).toBeLessThan(3.45);
    expect(y).toBeGreaterThan(2.9);
  });
});
