// OWNER: characters agent. Static poses: joint-rotation presets applied to the
// named skeleton in kid.ts. These make the scene read at capture time (batting
// stance, mid-windup, catcher squat, fielder ready, idle life); the animation
// owner can call pose() to key off any of them, or drive the same joints
// directly. pose() RESETS every joint first, so poses never stack.
//
// Hands are placed by a tiny FK grid search (solveArm) instead of hand-tuned
// Euler angles — that is what keeps both mitts ON the bat and gloves where a
// ball would arrive. Targets are in HIPS space (origin at the hip pivot,
// +z facing, feet at y≈-1.5). The bat is oriented by quaternion after the
// arms land, so it stays gripped whatever the solver chose.
//
// Sign conventions (kid faces local +z): rotation.x + tips forward (+z),
// rotation.z on a hanging limb + swings the hand/foot toward +x (kid's left).

import * as THREE from 'three';

export type PoseName =
  | 'stand'
  | 'stanceBat'
  | 'windup'
  | 'crouchCatch'
  | 'ready'
  | 'idle'
  | 'idleWave'
  | 'idleHips'
  | 'idleCross';

export const POSE_NAMES: readonly PoseName[] = [
  'stand',
  'stanceBat',
  'windup',
  'crouchCatch',
  'ready',
  'idle',
  'idleWave',
  'idleHips',
  'idleCross',
];

const JOINTS = [
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

type Joints = Partial<Record<(typeof JOINTS)[number], THREE.Object3D>>;

function joints(kid: THREE.Group): Joints {
  const j: Joints = {};
  for (const name of JOINTS) {
    const o = kid.getObjectByName(name);
    if (o) j[name] = o;
  }
  return j;
}

function set(o: THREE.Object3D | undefined, x = 0, y = 0, z = 0): void {
  if (o) o.rotation.set(x, y, z);
}

/** Level the foot against the accumulated thigh+knee bend. */
function plant(foot: THREE.Object3D | undefined, legX: number, kneeX: number): void {
  set(foot, -(legX + kneeX));
}

// ---------------------------------------------------------------------------
// FK arm solver

const Q1 = new THREE.Quaternion();
const Q2 = new THREE.Quaternion();
const E = new THREE.Euler();
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();

/** Hand position in hips space for (armX, armZ, elbowX). */
function fkHand(
  shoulder: THREE.Vector3,
  upperLen: number,
  foreLen: number,
  armX: number,
  armZ: number,
  elbowX: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  Q1.setFromEuler(E.set(armX, 0, armZ));
  V1.set(0, -upperLen, 0).applyQuaternion(Q1);
  Q2.setFromEuler(E.set(elbowX, 0, 0)).premultiply(Q1);
  V2.set(0, -foreLen, 0).applyQuaternion(Q2);
  return out.copy(shoulder).add(V1).add(V2);
}

/**
 * Grid-search the 3 dominant arm DOF so the hand lands on `target` (hips
 * space). Deterministic, ~9k cheap evals, run only at pose time. Returns the
 * chain quaternion (hips→hand) so equipment can be counter-rotated.
 */
function solveArm(j: Joints, side: 'L' | 'R', target: THREE.Vector3): THREE.Quaternion {
  const arm = j[side === 'L' ? 'armL' : 'armR'];
  const elbow = j[side === 'L' ? 'elbowL' : 'elbowR'];
  const hand = j[side === 'L' ? 'handL' : 'handR'];
  if (!arm || !elbow || !hand) return new THREE.Quaternion();
  const shoulder = arm.position;
  const upperLen = -elbow.position.y;
  const foreLen = -hand.position.y;

  let best: [number, number, number] = [0, 0, 0];
  let bestErr = Infinity;
  const out = new THREE.Vector3();
  for (let ax = -3.1; ax <= 1.4; ax += 0.16) {
    for (let az = -3.1; az <= 3.1; az += 0.16) {
      for (let ex = -2.7; ex <= 0.01; ex += 0.13) {
        const err = fkHand(shoulder, upperLen, foreLen, ax, az, ex, out).distanceToSquared(target);
        if (err < bestErr) {
          bestErr = err;
          best = [ax, az, ex];
        }
      }
    }
  }
  set(arm, best[0], 0, best[1]);
  set(elbow, best[2]);
  return Q1.setFromEuler(E.set(best[0], 0, best[1]))
    .multiply(Q2.setFromEuler(E.set(best[2], 0, 0)))
    .clone();
}

/** Orient the bat (child of a hand) so its +y barrel points `dir` in hips space. */
function aimBat(j: Joints, chainQ: THREE.Quaternion, dir: THREE.Vector3): void {
  if (!j.bat) return;
  const qDir = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  j.bat.quaternion.copy(chainQ.clone().invert().multiply(qDir));
}

// ---------------------------------------------------------------------------

export function pose(kid: THREE.Group, name: PoseName): void {
  const j = joints(kid);
  // Reset everything (including crouch height).
  for (const n of JOINTS) set(j[n]);
  if (j.hips) j.hips.position.y = kid.userData.hipsY as number;

  switch (name) {
    case 'stand':
      break;

    case 'stanceBat': {
      // Open cartoon stance (steam-02): feet spread, knees flexed, both hands
      // stacked at the back shoulder, bat cocked high, eyes on the mound.
      set(j.legL, -0.12, 0, 0.3);
      set(j.legR, -0.12, 0, -0.3);
      set(j.kneeL, 0.28);
      set(j.kneeR, 0.28);
      plant(j.footL, -0.12, 0.28);
      plant(j.footR, -0.12, 0.28);
      if (j.hips) {
        j.hips.position.y -= 0.09;
        j.hips.rotation.set(-0.06, -0.12, 0.02);
      }
      const batDir = new THREE.Vector3(-0.42, 0.82, -0.45).normalize();
      const rHand = new THREE.Vector3(-0.58, 1.42, -0.18); // by the back shoulder
      const chainR = solveArm(j, 'R', rHand);
      aimBat(j, chainR, batDir);
      solveArm(j, 'L', rHand.clone().addScaledVector(batDir, 0.26).add(V1.set(0.06, 0, 0.04)));
      set(j.head, -0.06, -0.35, 0.04);
      break;
    }

    case 'windup': {
      // Mid-delivery: lead knee up, hands together in the glove at the chest.
      set(j.legL, -1.45, 0, 0.12);
      set(j.kneeL, 1.7);
      set(j.footL, -0.4);
      set(j.legR, 0.05, 0, -0.08);
      plant(j.footR, 0.05, 0);
      if (j.hips) {
        j.hips.position.y -= 0.06;
        j.hips.rotation.set(-0.14, 0.1, 0.05);
      }
      // Hands together OVERHEAD — the windup silhouette that still reads at
      // 60 ft from the plate cameras (a lifted knee alone foreshortens away).
      solveArm(j, 'R', V1.set(0.14, 2.45, 0.08).clone());
      solveArm(j, 'L', V1.set(-0.14, 2.45, 0.08).clone());
      set(j.head, 0.02, 0, -0.04);
      break;
    }

    case 'crouchCatch': {
      // Deep squat: thighs near-horizontal, shins tucked back, glove up at the
      // incoming pitch, throwing hand resting on the knee.
      set(j.legL, -1.3, 0, 0.42);
      set(j.legR, -1.3, 0, -0.42);
      set(j.kneeL, 2.1);
      set(j.kneeR, 2.1);
      set(j.footL, -0.45); // tiptoe squat — a level foot shows its sole disc
      set(j.footR, -0.45);
      if (j.hips) {
        j.hips.position.y = 0.72;
        j.hips.rotation.set(0.18, 0, 0);
      }
      solveArm(j, 'L', V1.set(0.28, 1.15, 0.72).clone()); // glove up
      solveArm(j, 'R', V1.set(-0.42, 0.15, 0.55).clone()); // hand on knee
      set(j.head, -0.1); // chin up, eyes on the pitch

      break;
    }

    case 'ready': {
      // Fielder athletic crouch: feet wide, hands low and forward.
      set(j.legL, -0.32, 0, 0.24);
      set(j.legR, -0.32, 0, -0.24);
      set(j.kneeL, 0.5);
      set(j.kneeR, 0.5);
      plant(j.footL, -0.32, 0.5);
      plant(j.footR, -0.32, 0.5);
      if (j.hips) {
        j.hips.position.y -= 0.14;
        j.hips.rotation.set(0.2, 0, 0);
      }
      solveArm(j, 'L', V1.set(0.42, 0.55, 0.55).clone());
      solveArm(j, 'R', V1.set(-0.42, 0.55, 0.55).clone());
      set(j.head, -0.24);
      break;
    }

    case 'idle': {
      set(j.armL, -0.05, 0, 0.06);
      set(j.armR, -0.05, 0, -0.06);
      set(j.elbowL, -0.12);
      set(j.elbowR, -0.12);
      set(j.legL, 0, 0, 0.06);
      set(j.legR, 0, 0, -0.06);
      break;
    }

    case 'idleWave': {
      pose(kid, 'idle');
      set(j.armL, 0.1, 0, 2.65);
      set(j.elbowL, -0.35, 0, 0.2);
      set(j.head, -0.04, 0.15, 0.06);
      break;
    }

    case 'idleHips': {
      pose(kid, 'idle');
      set(j.armL, 0, 0, 0.7);
      set(j.elbowL, -1.3, 0, -0.6);
      set(j.armR, 0, 0, -0.7);
      set(j.elbowR, -1.3, 0, 0.6);
      break;
    }

    case 'idleCross': {
      pose(kid, 'idle');
      set(j.armL, -0.8, 0, -0.3);
      set(j.elbowL, -1.5, 0, -0.3);
      set(j.armR, -0.8, 0, 0.3);
      set(j.elbowR, -1.5, 0, 0.3);
      set(j.head, 0, -0.12);
      break;
    }
  }
}
