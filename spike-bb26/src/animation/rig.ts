// OWNER: animation agent. The rig layer: fast, allocation-free access to a
// kid's named pivot groups (kid.ts skeleton) plus pose SNAPSHOTS — plain
// number records captured once at init from characters' pose() presets, then
// blended/applied every tick. Snapshots keep the expensive FK arm solver in
// poses.ts out of the frame loop entirely: we pay it once per pose at init,
// then interpolate cheap Euler triples forever after.
//
// Layering contract (why order matters): a Snapshot APPLY is absolute (it
// resets the joint), while add()/addHipsPos()/setTorsoBreath() are additive.
// Every tick must start from an apply (or blend) and only then stack additive
// idle life on top — additive calls without a fresh base accumulate forever.

import * as THREE from 'three';

export const JOINTS = [
  'hips',
  'head',
  'armL',
  'armR',
  'elbowL',
  'elbowR',
  'handL',
  'handR',
  'legL',
  'legR',
  'kneeL',
  'kneeR',
  'footL',
  'footR',
  'bat',
] as const;

export type JointName = (typeof JOINTS)[number];
export type Triple = [number, number, number];

export type Snapshot = {
  rot: Partial<Record<JointName, Triple>>;
  hipsPos: Triple;
};

export const clamp01 = (u: number): number => (u < 0 ? 0 : u > 1 ? 1 : u);
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
/** smoothstep — gentle in AND out. */
export const easeInOut = (u: number): number => {
  const c = clamp01(u);
  return c * c * (3 - 2 * c);
};
/** quadratic accelerate — swings and whips start slow and arrive fast. */
export const easeIn = (u: number): number => {
  const c = clamp01(u);
  return c * c;
};
/** cubic decelerate — follow-throughs bleed off speed. */
export const easeOut = (u: number): number => {
  const c = 1 - clamp01(u);
  return 1 - c * c * c;
};

export class Rig {
  readonly kid: THREE.Group;
  readonly j: Partial<Record<JointName, THREE.Object3D>> = {};
  readonly torso: THREE.Object3D | null;

  constructor(kid: THREE.Group) {
    this.kid = kid;
    for (const name of JOINTS) {
      const o = kid.getObjectByName(name);
      if (o) this.j[name] = o;
    }
    this.torso = kid.getObjectByName('torso') ?? null;
  }

  /** Record the current joint rotations + hips position as a Snapshot. */
  capture(): Snapshot {
    const rot: Partial<Record<JointName, Triple>> = {};
    for (const name of JOINTS) {
      const o = this.j[name];
      if (o) rot[name] = [o.rotation.x, o.rotation.y, o.rotation.z];
    }
    const hips = this.j.hips;
    const hipsPos: Triple = hips ? [hips.position.x, hips.position.y, hips.position.z] : [0, 0, 0];
    return { rot, hipsPos };
  }

  /** Absolute: set every recorded joint to the snapshot. */
  apply(s: Snapshot): void {
    for (const name of JOINTS) {
      const v = s.rot[name];
      const o = this.j[name];
      if (v && o) o.rotation.set(v[0], v[1], v[2]);
    }
    this.j.hips?.position.set(s.hipsPos[0], s.hipsPos[1], s.hipsPos[2]);
  }

  /** Absolute: apply the eased mix of two snapshots (u=0 ⇒ a, u=1 ⇒ b). */
  blend(a: Snapshot, b: Snapshot, u: number): void {
    const c = clamp01(u);
    for (const name of JOINTS) {
      const va = a.rot[name];
      const vb = b.rot[name];
      const o = this.j[name];
      if (!o) continue;
      if (va && vb) o.rotation.set(lerp(va[0], vb[0], c), lerp(va[1], vb[1], c), lerp(va[2], vb[2], c));
      else if (va) o.rotation.set(va[0], va[1], va[2]);
      else if (vb) o.rotation.set(vb[0], vb[1], vb[2]);
    }
    this.j.hips?.position.set(
      lerp(a.hipsPos[0], b.hipsPos[0], c),
      lerp(a.hipsPos[1], b.hipsPos[1], c),
      lerp(a.hipsPos[2], b.hipsPos[2], c),
    );
  }

  /** Additive joint rotation — stack AFTER an apply/blend. */
  add(name: JointName, rx = 0, ry = 0, rz = 0): void {
    const o = this.j[name];
    if (!o) return;
    o.rotation.x += rx;
    o.rotation.y += ry;
    o.rotation.z += rz;
  }

  /** Additive hips translation (weight shifts, crouch dips). */
  addHipsPos(dx: number, dy: number, dz = 0): void {
    const hips = this.j.hips;
    if (!hips) return;
    hips.position.x += dx;
    hips.position.y += dy;
    hips.position.z += dz;
  }

  /** Breathing: scale the torso shell around the hip pivot (absolute per tick). */
  setTorsoBreath(b: number): void {
    this.torso?.scale.set(1 + b * 0.35, 1 + b, 1 + b * 0.55);
  }
}

/** New snapshot = base + additive Euler deltas (and optional hips-pos delta). */
export function derive(
  base: Snapshot,
  deltas: Partial<Record<JointName, Triple>>,
  hipsPosDelta: Triple = [0, 0, 0],
): Snapshot {
  const rot: Partial<Record<JointName, Triple>> = {};
  for (const name of JOINTS) {
    const b = base.rot[name];
    const d = deltas[name];
    if (b) rot[name] = d ? [b[0] + d[0], b[1] + d[1], b[2] + d[2]] : [b[0], b[1], b[2]];
    else if (d) rot[name] = [d[0], d[1], d[2]];
  }
  return {
    rot,
    hipsPos: [
      base.hipsPos[0] + hipsPosDelta[0],
      base.hipsPos[1] + hipsPosDelta[1],
      base.hipsPos[2] + hipsPosDelta[2],
    ],
  };
}
