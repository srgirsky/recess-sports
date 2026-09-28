// Zoom's run keyed push poses for years and no palm ever came within 0.43ft of
// a rim — every gate was green because none asked where the rims ARE. These
// play his delivered gaits through the same arm clamp the runtime applies
// (`HandPose.constrainArms`) and hold each palm to the sculpted rim centreline.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AnimationMixer, Bone, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { SKELETON } from './skeleton';
import { HandPose } from './HandPose';
import { clipSpec, FPS, type AnimName } from './clips';
import { buildZoomSeatedLibrary, ZOOM_RIM, zoomRimPoint } from './proceduralClips';

function rig() {
  const bones = new Map<string, Bone>();
  for (const spec of SKELETON) {
    const b = new Bone(); b.name = spec.name; b.position.set(...spec.pos); bones.set(b.name, b);
    if (spec.parent) bones.get(spec.parent)!.add(b);
  }
  // The reference hand joints `HandPose` requires before it clamps an arm.
  for (const [side, sign] of [['Left', -1], ['Right', 1]] as const) {
    for (const [name, parent, pos] of [
      ['Middle1', '', [sign * .165, 0, -.026]], ['Ring1', '', [sign * .165, 0, -.076]],
      ['Index2', 'Index1', [sign * .06, 0, 0]], ['Curl2', 'Middle1', [sign * .06, 0, 0]],
    ] as const) {
      const b = new Bone(); b.name = side + 'Hand' + name; b.position.set(pos[0], pos[1], pos[2]);
      bones.get(side + 'Hand' + parent)!.add(b); bones.set(b.name, b);
    }
  }
  const mesh = new SkinnedMesh(); mesh.add(bones.get('Root')!); mesh.skeleton = new Skeleton([...bones.values()]);
  return { mesh, bones };
}

/** Distance to the nearest point of a rim's centreline, and where on it (degrees, 0 = top). */
function onRim(side: -1 | 1, palm: Vector3): { gap: number; deg: number } {
  let gap = Infinity, deg = 0;
  for (let a = -180; a < 180; a += .5) {
    const d = palm.distanceTo(zoomRimPoint(side, a));
    if (d < gap) { gap = d; deg = a; }
  }
  return { gap, deg };
}

describe('Zoom propels his chair by its push rims', () => {
  it('mirrors the sculpted rim, so the targets are where the geometry is', () => {
    const py = readFileSync(new URL('../../../scripts/v2/blender/sculpt-zoom-source.py', import.meta.url), 'utf8');
    const read = (name: string) => Number(py.match(new RegExp(`^${name} = ([0-9.]+)`, 'm'))![1]);
    expect(ZOOM_RIM.centerY).toBe(read('WHEEL_CENTER_Z'));
    expect(ZOOM_RIM.radius).toBe(read('RIM_R'));
    expect(ZOOM_RIM.camber).toBe(read('WHEEL_CAMBER'));
    expect(ZOOM_RIM.x).toBeCloseTo(read('WHEEL_X') + .048, 9);
    expect(py).toMatch(/y = 0\.060 \+ radius \* sin\(theta\)/);
  });

  it.each([['run', 1], ['run_fast', 1], ['trot', 1], ['jog_back', -1]] as const)(
    'drives each rim through a stroke in %s', (name, direction) => {
      const { mesh, bones } = rig();
      const hands = new HandPose(mesh), mixer = new AnimationMixer(mesh);
      mixer.clipAction(buildZoomSeatedLibrary().find((clip) => clip.name === name)!).play();
      const frames = clipSpec(name as AnimName).frames;
      for (const [side, anchor] of [[-1, 'Prop_GloveAnchor'], [1, 'Prop_BatGrip']] as const) {
        const contact: number[] = [];
        // Sample from 90% of the loop so a stroke straddling the seam stays whole.
        for (let f = 0; f < frames; f += .25) {
          hands.restore(); mixer.setTime(((f + .9 * frames) % frames) / FPS); hands.constrainArms(name as AnimName); mesh.updateMatrixWorld(true);
          const { gap, deg } = onRim(side, bones.get(anchor)!.getWorldPosition(new Vector3()));
          if (gap < .03) contact.push(deg);
        }
        // A real stroke: the palm stays on the rim for a quarter of the cycle
        // and carries it at least 40 degrees, in the gait's direction.
        expect(contact.length / (frames * 4), `${name} side ${side} time on rim`).toBeGreaterThan(.2);
        const swept = contact[contact.length - 1] - contact[0];
        expect(Math.abs(swept), `${name} side ${side} rim swept`).toBeGreaterThan(40);
        expect(Math.sign(swept), `${name} side ${side} push direction`).toBe(-direction);
      }
      mixer.stopAllAction();
    });
});
