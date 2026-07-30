// ---------------------------------------------------------------------------
// ★ THE TEST THAT SHOULD HAVE EXISTED.
//
// `REFERENCE_HEIGHT_FT` said 4.0. The bone table summed to 3.400. Nothing
// compared them, because every consumer read the constant and trusted it — so
// the canonical rig sat 15% short, and BELOW `HEIGHT_MIN_FT`, i.e. outside the
// legal height band it defines for everyone else.
//
// That would not have stayed cheap. `docs/v2/animation-brief.md` hands the rig
// to an animator with "1 unit = 1 foot, the reference kid is 4.0ft" printed at
// the top, and stride length, foot plants and dive travel are authored in
// absolute feet against whatever they are given. A 3.4ft rig buys 35 clips
// whose every distance is 17% wrong — discovered after the invoice.
//
// So this file asserts the two ends of that claim against each other:
//   * the BONE chain sums to exactly REFERENCE_HEIGHT_FT, and
//   * the DRAWN mesh tops out where the bone chain says it does.
// The second is the one that actually failed twice: the proxy's head radius was
// a hardcoded 0.46 unrelated to the crown, so it drew 3.105ft while claiming
// 4.0 — which is why `render.characterPresence`'s "~5% of frame height"
// residual was really 3.9%.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { Box3, Vector3 } from 'three';
import {
  BONE_NAMES,
  HEIGHT_MAX_FT,
  HEIGHT_MIN_FT,
  MAX_BONES,
  OPTIONAL_BONES,
  REFERENCE_HEIGHT_FT,
  SKELETON,
  bindPoseHash,
  bindWorld,
  crownHeightFt,
} from './skeleton';
import { CHARACTER_SCALE, ProxyCharacter, buildSkeleton } from './ProxyCharacter';
import { ROSTER } from '../../data/characters';
import type { VisualParams } from '../../data/types';

const FT = 1e-9;

describe('the canonical skeleton', () => {
  it('is exactly REFERENCE_HEIGHT_FT tall, floor to HeadTop_End', () => {
    // EXACT, not approximate. The table is authored so the rounded values sum
    // to 4.000 on the nose (1.671 + 0.212 + 0.235 + 0.235 + 0.188 + 0.165 +
    // 1.294); a tolerance here would let the very drift this test exists to
    // catch back in one rounding error at a time.
    expect(crownHeightFt()).toBeCloseTo(REFERENCE_HEIGHT_FT, 9);
  });

  it('puts the reference kid inside the height band it defines for everyone', () => {
    expect(REFERENCE_HEIGHT_FT).toBeGreaterThanOrEqual(HEIGHT_MIN_FT);
    expect(REFERENCE_HEIGHT_FT).toBeLessThanOrEqual(HEIGHT_MAX_FT);
  });

  it('stands the rig on the floor', () => {
    // Origin between the feet, per the asset contract. A rig whose toes float
    // or sink is a rig every foot-plant in the library is authored wrong on.
    const w = bindWorld();
    expect(w.get('LeftToeBase')![1]).toBeCloseTo(0, 6);
    expect(w.get('RightToeBase')![1]).toBeCloseTo(0, 6);
    expect(Math.min(...[...w.values()].map((p) => p[1]))).toBeGreaterThan(-FT);
  });

  it('keeps the head near the 30% the contract advertises', () => {
    const headY = bindWorld().get('Head')![1];
    const headSpan = (REFERENCE_HEIGHT_FT - headY) / REFERENCE_HEIGHT_FT;
    expect(headSpan).toBeGreaterThan(0.26);
    expect(headSpan).toBeLessThan(0.36);
  });

  it('holds the shape of the contract: 33 bones, ordered, parents first', () => {
    expect(SKELETON).toHaveLength(33);
    expect(new Set(BONE_NAMES).size).toBe(33);
    expect(33 + OPTIONAL_BONES.length).toBeLessThanOrEqual(MAX_BONES);

    const seen = new Set<string>();
    for (const b of SKELETON) {
      if (b.parent) expect(seen.has(b.parent), `${b.name} precedes its parent`).toBe(true);
      seen.add(b.name);
    }
    expect(SKELETON.filter((b) => b.parent === null)).toHaveLength(1);
  });

  it('is mirrored left to right', () => {
    // Retargeting tools and every `_left`/`_right` clip pair assume it.
    for (const b of SKELETON) {
      if (!b.name.startsWith('Left')) continue;
      const twin = SKELETON.find((o) => o.name === b.name.replace(/^Left/, 'Right'));
      expect(twin, `${b.name} has no Right twin`).toBeDefined();
      expect(twin!.pos[0]).toBeCloseTo(-b.pos[0], 9);
      expect(twin!.pos[1]).toBeCloseTo(b.pos[1], 9);
      expect(twin!.pos[2]).toBeCloseTo(b.pos[2], 9);
    }
  });

  it('pins the bind pose against a 2mm nudge', () => {
    // The validator hashes a delivered model against this. Changing the rig is
    // allowed; changing it silently, after clips exist, is not.
    expect(bindPoseHash()).toBe('75b5610f');
  });

  it('lands every prop anchor on the body part it is named for', () => {
    const w = bindWorld();
    const near = (a: string, b: string, ft: number) => {
      const [ax, ay, az] = w.get(a)!;
      const [bx, by, bz] = w.get(b)!;
      expect(Math.hypot(ax - bx, ay - by, az - bz), `${a} vs ${b}`).toBeLessThan(ft);
    };
    near('Prop_BatGrip', 'RightHand', 0.2);
    near('Prop_BallAnchor', 'RightHand', 0.2);
    near('Prop_GloveAnchor', 'LeftHand', 0.2);
    // The cap and hair anchors sit ON the skull, between the head joint and
    // the crown — not inside the neck and not floating above the head.
    for (const anchor of ['Prop_CapAnchor', 'Prop_HairAnchor']) {
      expect(w.get(anchor)![1]).toBeGreaterThan(w.get('Head')![1]);
      expect(w.get(anchor)![1]).toBeLessThan(REFERENCE_HEIGHT_FT);
    }
  });
});

describe('the proxy draws the height it claims', () => {
  /** World-space bbox of the built (bind-pose) proxy mesh, in feet. */
  function drawnBox(visual: VisualParams): Box3 {
    const kid = new ProxyCharacter(visual);
    kid.root.updateMatrixWorld(true);
    const g = kid.mesh.geometry;
    const pos = g.attributes.position;
    const box = new Box3();
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(kid.mesh.matrixWorld));
    }
    kid.dispose();
    return box;
  }

  const bald: VisualParams = {
    ...ROSTER[0].visual,
    hair: 'bald',
    accessory: 'none',
    body: { height: 1 },
  };

  it('tops out on HeadTop_End, not 22% below it', () => {
    // The invariant that actually broke. A bald, capless kid's drawn crown IS
    // the head sphere, so it must land on the bone — times CHARACTER_SCALE,
    // the render-only exaggeration the sim never sees.
    const box = drawnBox(bald);
    const kid = new ProxyCharacter(bald);
    const expected = kid.heightFt * CHARACTER_SCALE;
    kid.dispose();
    expect(box.max.y).toBeGreaterThan(expected * 0.98);
    expect(box.max.y).toBeLessThan(expected * 1.02);
  });

  it('stands on the ground plane', () => {
    // Sprites are positioned by their feet; a proxy whose shoes hang below y=0
    // sinks into the turf, and one that floats casts a detached shadow.
    const box = drawnBox(bald);
    expect(box.min.y).toBeGreaterThan(-0.1);
    expect(box.min.y).toBeLessThan(0.05);
  });

  it('gives all 30 kids a real 6-to-8-year-old stature', () => {
    // Including the six with no authored `height`, which used to default to
    // the top of the band and make every one of them the tallest kid alive.
    const heights = ROSTER.map((c) => {
      const kid = new ProxyCharacter(c.visual);
      const h = kid.heightFt;
      kid.dispose();
      return h;
    });
    for (const h of heights) {
      expect(h).toBeGreaterThanOrEqual(HEIGHT_MIN_FT - FT);
      expect(h).toBeLessThanOrEqual(HEIGHT_MAX_FT + FT);
    }
    // And they must actually differ — 30 identically-sized kids would mean the
    // per-kid body specs stopped being read.
    expect(new Set(heights.map((h) => h.toFixed(2))).size).toBeGreaterThan(8);
    const tallest = heights.filter((h) => h > HEIGHT_MAX_FT - 0.01).length;
    expect(tallest, 'kids defaulting to the maximum height').toBeLessThan(3);
  });

  it('builds bones the mesh can actually be skinned to', () => {
    const built = buildSkeleton();
    expect(built.bones).toHaveLength(SKELETON.length);
    expect(built.bones.map((b) => b.name)).toEqual([...BONE_NAMES]);
    expect(built.world.get('HeadTop_End')!.y).toBeCloseTo(REFERENCE_HEIGHT_FT, 9);
  });
});
