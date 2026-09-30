// ---------------------------------------------------------------------------
// ★ THE CATCHER SQUATS LOW ENOUGH TO BE A FOREGROUND ELEMENT, NOT THE SUBJECT.
//
// He posts 5ft behind home, the nearest kid to the PITCH rig by a factor of
// three, so his height decides whether the most-seen frame in the game shows
// the batter and the zone or the back of a catcher's head. `bridge.ts` always
// asked him to crouch, but in `field_ready`, the FIELDER's ready stance. It
// sets a kid down correctly (see `groundContact.test.ts`) and still leaves his
// crown at 86% of standing height, because these kids carry a third of their
// height in the head: a knee bend that would hide an adult hides almost none
// of a kid. The 2026-09-29 playthrough found him level with the batter's head
// in both halves, and in the bottom half no smaller than the batter.
//
// The rule, measured through the rig the player actually sees: for every
// standing roster kid as catcher, with a batter of the same drawn height, the
// catcher's crown projects BELOW the batter's shoulder. A same-height pair is
// the fair case. A tall catcher behind the smallest batter still reaches the
// batter's collar, and no squat these proportions allow can fix that (the
// squat below already sits the hips level with the knees).
//
// Measured on `main` with `field_ready`: crown at ndc y 0.47 against a
// shoulder at 0.21 for the median kid; every standing kid fails.
//
// Zoom is exempt from the rig measurement, not from the rule: his model is
// sculpted seated over bind-pose legs, so his rig reads standing height while
// his mesh draws seated. His take maps `catcher_squat` to his own ready lean.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { AnimationMixer, Object3D, Vector3, type AnimationClip } from 'three';
import { ROSTER } from '../../data/characters';
import { buildProceduralClips } from './proceduralClips';
import { buildSkeleton, kidRootScale } from './ProxyCharacter';
import { RIGS, ndcThrough } from './cameraCues';
import { battingPlacement } from './battingPose';
import { FIELD_POSITIONS } from '../sim/field';
import { CATCHER_STANCE } from './bridge';
// @ts-expect-error — an .mjs exporter with no declarations
import { buildPerformanceClips } from '../../../scripts/v2/export-signature-performance.mjs';

const SHARED = new Map(buildProceduralClips().map((c) => [c.name, c]));
/** `chooseCamera` focuses PITCH here; see cameraCues.ts. */
const PITCH_FOCUS: [number, number, number] = [0, 2.4, 1];
const SEATED = new Set(['wheelchair_ace']);

/** Posed world positions of every bone, sampled across the loop. */
function sample(clip: AnimationClip, t: number): Map<string, Vector3> {
  const { root } = buildSkeleton();
  const holder = new Object3D();
  holder.add(root);
  const mixer = new AnimationMixer(holder);
  mixer.clipAction(clip).play();
  mixer.update(t);
  holder.updateWorldMatrix(true, true);
  const out = new Map<string, Vector3>();
  root.traverse((n) => out.set(n.name, n.getWorldPosition(new Vector3())));
  return out;
}

function clipFor(id: string, name: string): AnimationClip {
  const take: AnimationClip[] | null = buildPerformanceClips(id);
  return take?.find((c) => c.name === name) ?? SHARED.get(name)!;
}

/** Highest crown the catcher reaches over the loop, rig feet. */
function crownFt(clip: AnimationClip): number {
  let top = -Infinity;
  for (let i = 0; i <= 12; i++) top = Math.max(top, sample(clip, (clip.duration * i) / 12).get('HeadTop_End')!.y);
  return top;
}

const ndcY = (p: [number, number, number]) =>
  ndcThrough(RIGS.PITCH.eye, PITCH_FOCUS, RIGS.PITCH.fov, 16 / 9, p)![1];

/** Where the rule is judged: catcher crown vs same-height batter's shoulder. */
function framing(id: string, catcherClip: string) {
  const kid = ROSTER.find((c) => c.id === id)!;
  const s = kidRootScale(kid.visual);
  const stance = sample(clipFor(id, 'bat_stance'), 0);
  const shoulderFt = Math.max(stance.get('LeftArm')!.y, stance.get('RightArm')!.y) * s;
  // Rig eyes are authored in the DRAWN frame, and the scene is mirrored at the
  // root, so a sim x negates on its way to the lens (GameView.driveCamera).
  // The batter's sim -x is therefore the camera's own side.
  const box = battingPlacement(s);
  const c = FIELD_POSITIONS.C;
  return {
    crown: ndcY([-c.x, crownFt(clipFor(id, catcherClip)) * s, c.z]),
    shoulder: ndcY([-box.x, shoulderFt, box.z]),
  };
}

describe('the catcher squats under the batter’s shoulder from the PITCH rig', () => {
  for (const kid of ROSTER.filter((k) => !SEATED.has(k.id))) {
    it(`${kid.name} as catcher`, () => {
      const { crown, shoulder } = framing(kid.id, CATCHER_STANCE);
      expect(crown, `crown ndc ${crown.toFixed(3)} vs shoulder ${shoulder.toFixed(3)}`).toBeLessThan(shoulder);
    });
  }

  it('squats: hips no higher than the knees', () => {
    const pose = sample(SHARED.get(CATCHER_STANCE)!, 0);
    const knee = Math.max(pose.get('LeftLeg')!.y, pose.get('RightLeg')!.y);
    expect(pose.get('Hips')!.y).toBeLessThan(knee + 0.1);
  });

  it('★ fires on the stance it replaced: field_ready leaves every kid too tall', () => {
    for (const kid of ROSTER.filter((k) => !SEATED.has(k.id))) {
      const { crown, shoulder } = framing(kid.id, 'field_ready');
      expect(crown, kid.name).toBeGreaterThan(shoulder);
    }
  });

  it('Zoom keeps a seated take for the role, never the standing squat', () => {
    const take: AnimationClip[] = buildPerformanceClips('wheelchair_ace');
    expect(take.some((c) => c.name === CATCHER_STANCE)).toBe(true);
  });
});
