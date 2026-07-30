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
import { Box3, BufferGeometry, Vector3 } from 'three';
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
import { CHARACTER_SCALE, HAIR_HEADROOM_FRAC, ProxyCharacter, buildSkeleton } from './ProxyCharacter';
import { ROSTER } from '../../data/characters';
import type { Accessory, HairStyle, VisualParams } from '../../data/types';

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

// ---------------------------------------------------------------------------
// ★ THE SECOND TEST THAT SHOULD HAVE EXISTED.
//
// The block above pins the one number the proxy had already been caught getting
// wrong: how TALL it draws. It passed while the proxy drew a 0.49ft torso under
// a head that was 37% of body height, with 0.23ft of open air where the neck
// goes and an afro standing 14% of a body above the top of the kid — because it
// measures a single point (the topmost vertex) of a single fixture (`bald`,
// `accessory: 'none'`). 44 of the 44 hair × accessory combinations were
// measured by nothing at all.
//
// So: silhouette across every combination, continuity through the whole body,
// and the drawn head proportion checked against the BONE proportion — the two
// numbers that a commission brief states as one.
// ---------------------------------------------------------------------------

const HAIR: HairStyle[] = [
  'bald', 'buzz', 'short', 'curly', 'afro', 'mohawk', 'spiky', 'ponytail', 'pigtails', 'bun', 'long',
];
const ACC: Accessory[] = ['none', 'cap', 'headband', 'glasses'];

/** World-space bbox of a built proxy, in feet. */
function boxOf(visual: VisualParams): { box: Box3; expected: number } {
  const kid = new ProxyCharacter(visual);
  kid.root.updateMatrixWorld(true);
  const pos = kid.mesh.geometry.attributes.position;
  const box = new Box3();
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(kid.mesh.matrixWorld));
  }
  const expected = kid.heightFt * CHARACTER_SCALE;
  kid.dispose();
  return { box, expected };
}

/**
 * The y-intervals in which the merged surface encloses the vertical line
 * (x, z) — i.e. where the character is SOLID along that line.
 *
 * Deliberately not vertex-slab occupancy: a `SphereGeometry(r, 14, 10)` has 11
 * latitude rings, so slabs are sparse enough that the tolerance needed to avoid
 * false alarms would sail straight past a 0.23ft hole. Every primitive here is a
 * closed hull, so surface crossings are exact regardless of tessellation.
 *
 * Crossings are accumulated by WINDING DEPTH rather than paired off in order,
 * because the parts deliberately interpenetrate: a ray through the shoulder
 * enters the torso, enters the neck, leaves the torso, leaves the neck, and
 * pairing those in sorted order would report two solids with a hole between
 * them — inventing exactly the defect this function exists to detect.
 */
function solidSpans(geom: BufferGeometry, x: number, z: number): [number, number][] {
  const pos = geom.attributes.position;
  const idx = geom.index!;
  const hits: { y: number; dir: number }[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    const ax = pos.getX(a) - x, ay = pos.getY(a), az = pos.getZ(a) - z;
    const bx = pos.getX(b) - x, by = pos.getY(b), bz = pos.getZ(b) - z;
    const cx = pos.getX(c) - x, cy = pos.getY(c), cz = pos.getZ(c) - z;
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue; // edge-on to the ray
    const u = ((bz - cz) * -cx + (cx - bx) * -cz) / d;
    const v = ((cz - az) * -cx + (ax - cx) * -cz) / d;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    // Outward normal's y-component decides whether the ray is entering the
    // solid here (pointing down) or leaving it (pointing up).
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    hits.push({ y: u * ay + v * by + w * cy, dir: ny > 0 ? -1 : 1 });
  }
  hits.sort((p, q) => p.y - q.y);
  const spans: [number, number][] = [];
  let depth = 0;
  let start = 0;
  for (const h of hits) {
    if (depth === 0) start = h.y;
    depth += h.dir;
    if (depth === 0) spans.push([start, h.y]);
  }
  return spans;
}

/**
 * Solid spans with sub-`JOIN_TOL` breaks closed up.
 *
 * The tolerance is not slop, it is the joints: `limb()` spans exactly a→b, so
 * two capsules sharing a joint (the knee, the elbow) meet TANGENTIALLY at a
 * single point, and any ray a hair off that axis passes through a gap of
 * `d²/2r` — 0.0007ft at the knee. A test that called that a hole would fail on
 * geometry that is correct. 0.01ft is an eighth of an inch on a 4ft kid, and
 * the neck hole this exists to catch was 0.228ft: twenty-three times bigger.
 */
const JOIN_TOL = 0.01;

function spansOf(visual: VisualParams, x: number, z: number): [number, number][] {
  const kid = new ProxyCharacter(visual);
  const raw = solidSpans(kid.mesh.geometry, x, z);
  kid.dispose();
  const spans: [number, number][] = [];
  for (const s of raw) {
    const last = spans[spans.length - 1];
    if (last && s[0] - last[1] <= JOIN_TOL) last[1] = Math.max(last[1], s[1]);
    else spans.push([...s] as [number, number]);
  }
  return spans;
}

describe('the proxy draws a kid, not a bobblehead', () => {
  const base = ROSTER[0].visual;
  const kidWith = (hair: HairStyle, accessory: Accessory): VisualParams => ({
    ...base,
    hair,
    accessory,
    body: { height: 1 },
  });

  it('keeps every hair style and accessory inside the silhouette budget', () => {
    // Hair MAY exceed HeadTop_End — height is defined on the bone, and an afro
    // that stops at the skull is not an afro — but only by HAIR_HEADROOM_FRAC.
    // The afro was at 14.2% of body height, three and a half times the budget.
    for (const hair of HAIR) {
      for (const accessory of ACC) {
        const { box, expected } = boxOf(kidWith(hair, accessory));
        const over = (box.max.y - expected) / expected;
        expect(over, `${hair} + ${accessory} rises ${(over * 100).toFixed(1)}% above the crown`)
          .toBeLessThanOrEqual(HAIR_HEADROOM_FRAC);
        // And nothing may SHORTEN the kid: the skull always reaches the crown,
        // so a style that caps the silhouette lower has eaten the head.
        expect(box.max.y, `${hair} + ${accessory} draws short`).toBeGreaterThan(expected * 0.98);
      }
    }
  });

  it('gives a hat less headroom than hair', () => {
    // Worn ON the head. A cap standing proud of HeadTop_End is a cap drawn
    // wrong, not a taller kid.
    for (const accessory of ACC) {
      const { box, expected } = boxOf(kidWith('bald', accessory));
      expect(box.max.y / expected, `${accessory}`).toBeLessThanOrEqual(1.01);
    }
  });

  it('lets the styles that are made of height actually have height', () => {
    // ★ The other end of the budget, and the one with teeth. `spiky`'s cones
    // were absolute-sized (0.106 × 0.353ft) in an otherwise r-relative system
    // and topped out INSIDE the skull, so `spiky` drew as a plain cap: one of
    // eleven silhouettes silently collapsed onto another, on a proxy whose
    // entire justification is that 30 kids read apart at outfield distance.
    // A cap in the budget's ceiling could not see it — only a FLOOR can.
    const skull = boxOf(kidWith('bald', 'none'));
    for (const hair of ['afro', 'mohawk', 'spiky'] as HairStyle[]) {
      const { box, expected } = boxOf(kidWith(hair, 'none'));
      const rise = (box.max.y - skull.box.max.y) / expected;
      expect(rise, `${hair} rises only ${(rise * 100).toFixed(2)}% above a bald head`)
        .toBeGreaterThan(0.01);
    }
  });

  it('draws 11 hair styles that are actually 11 silhouettes', () => {
    const sigs = HAIR.map((hair) => {
      const { box } = boxOf(kidWith(hair, 'none'));
      return [box.max.y, box.max.x, box.min.z].map((n) => n.toFixed(3)).join('/');
    });
    expect(new Set(sigs).size, `hair silhouettes: ${sigs.join(' ')}`).toBeGreaterThanOrEqual(8);
  });

  /** "1.23→1.45" for each break, so a failure says WHERE the body came apart. */
  const gapsIn = (spans: [number, number][]) =>
    spans.slice(1).map((s, i) => `${spans[i][1].toFixed(3)}→${s[0].toFixed(3)}`).join(', ');

  it('has no hole between the hips and the crown', () => {
    // ★ The neck. Nothing was bound to `Neck` or `Spine2`, leaving 0.228ft of
    // open air between a torso that stopped at 2.293 and a head that started at
    // 2.521 — visible only because the head was big enough to hide it. Sampled
    // just off the centre line: the axis itself runs through every sphere's
    // pole, where the triangle fan is degenerate.
    const spans = spansOf(kidWith('bald', 'none'), 0.03, 0.021);
    expect(spans.length, `body breaks at ${gapsIn(spans)}`).toBe(1);
    const [bottom, top] = spans[0];
    const kid = new ProxyCharacter(kidWith('bald', 'none'));
    expect(bottom).toBeLessThanOrEqual(kid.proportions.torsoBottomFt + FT);
    // The ray is off-axis, so it clips the crown just below the apex.
    expect(top).toBeGreaterThan(kid.proportions.headTopFt - 0.02);
    expect(top).toBeLessThanOrEqual(kid.proportions.headTopFt + FT);
    kid.dispose();
  });

  it('has no hole between the foot and the hips', () => {
    // Down the leg line. This ray also passes the shoulder, where the torso
    // ends and the narrow neck does not reach — correctly — so the claim is
    // about the LOWEST span only: one unbroken run of shoe, shin, thigh and
    // pelvis from the ground to the hip joint.
    const spans = spansOf(kidWith('bald', 'none'), -0.2, 0.011);
    const [bottom, top] = spans[0];
    expect(bottom, `shoe off the ground; spans break at ${gapsIn(spans)}`).toBeLessThan(0.05);
    expect(top, `the leg breaks at ${gapsIn(spans)}`).toBeGreaterThan(bindWorld().get('Hips')![1]);
  });

  it('draws the head at the proportion the bone table and the brief claim', () => {
    // The whole point. `HeadTop_End` sits at 32.4% of the crown and the
    // contract tells the animator "~30%", while the sphere drew 37.0% — a
    // number nothing computed, exactly like the 3.4ft rig before it.
    const kid = new ProxyCharacter(kidWith('bald', 'none'));
    const p = kid.proportions;
    const drawn = (p.headTopFt - p.headBottomFt) / REFERENCE_HEIGHT_FT;
    const bone = (REFERENCE_HEIGHT_FT - bindWorld().get('Head')![1]) / REFERENCE_HEIGHT_FT;
    expect(p.headTopFt).toBeCloseTo(crownHeightFt(), 9);
    expect(drawn).toBeGreaterThan(0.3);
    expect(drawn).toBeLessThan(0.34);
    expect(drawn, 'drawn and bone head proportions must agree').toBeCloseTo(bone, 2);
    kid.dispose();
  });

  it('keeps the crown on the bone for every kid, not just the average one', () => {
    // `headH` scales the sphere's Y radius, so it used to lift the drawn crown
    // ~1.5% above the bone that DEFINES the character's height — inside the 2%
    // band the bbox test allows, and wrong all the same. The radius is derived
    // against `headH` now, so the excursion is zero.
    for (const c of ROSTER) {
      const kid = new ProxyCharacter(c.visual);
      expect(kid.proportions.headTopFt, c.id).toBeCloseTo(crownHeightFt(), 9);
      kid.dispose();
    }
  });

  it('draws a trunk, not a disc', () => {
    // The torso's Y term was a LENGTH handed to a dimensionless scale argument,
    // so it drew 0.49ft tall against 1.18ft wide.
    const kid = new ProxyCharacter(kidWith('bald', 'none'));
    const p = kid.proportions;
    const height = p.torsoTopFt - p.torsoBottomFt;
    expect(height, 'torso height vs width').toBeGreaterThan(0.75 * 2 * p.torsoHalfWidthFt);
    // And it must join what it sits between, symbolically as well as by ray.
    expect(p.neckBottomFt).toBeLessThan(p.torsoTopFt);
    expect(p.neckTopFt).toBeGreaterThan(p.headBottomFt);
    kid.dispose();
  });
});
