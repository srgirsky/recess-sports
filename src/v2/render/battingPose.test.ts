// A face direction and a nearby hand bone both passed while the bat was held
// backwards. Exercise the production director under the gameplay reflection,
// using palm anchors, not wrist proximity. These tests do not certify mesh
// clearance or visual quality; the delivered-roster browser audit checks those.
import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { ROSTER } from '../../data/characters';
import { ProxyCharacter } from './ProxyCharacter';
import { AnimationDirector } from './AnimationDirector';
import { applySnapshot } from './bridge';
import { buildProceduralClips, buildJunebugPilotClips, buildZoomSeatedLibrary } from './proceduralClips';
import { performanceFor } from './performance';
import { battingPlacement, battingRunOut } from './battingPose';
import { BAT_SWEET_SPOT_FT } from './props';
import { clipSpec, FPS, type AnimName } from './clips';

function fixture(mirrored = true, scale = 1.6, seated = false) {
  const kid = new ProxyCharacter(ROSTER[0].visual);
  const scene = new Group(); scene.scale.x = mirrored ? -1 : 1;
  scene.add(kid.root); kid.root.scale.setScalar(scale);
  const box = battingPlacement(scale); kid.setPosition(box.x, box.z); kid.setFacing(box.facing);
  const dir = new AnimationDirector(kid.mesh, { fallback: buildProceduralClips(), performanceClips: seated ? buildZoomSeatedLibrary() : buildJunebugPilotClips(), actor: { id: seated ? 'wheelchair_ace' : 'nostrike', profile: performanceFor(seated ? 'wheelchair_ace' : 'nostrike'), setExpression() {} } });
  scene.updateMatrixWorld(true);
  dir.battingPose.contact = scene.localToWorld(new Vector3(0, 2.4, 0));
  const bone = (name: string) => kid.bones.find(b => b.name === name)!;
  const at = (name: string) => bone(name).getWorldPosition(new Vector3());
  return {kid, scene, dir, bone, at, cleanup: () => {dir.dispose();kid.dispose();}};
}

describe('batting mechanics in the actual scene coordinate system', () => {
  it.each([false, true])('keeps the head on the pitcher and both palms on the handle (mirror %s)', mirror => {
    const f = fixture(mirror);
    for (const name of ['bat_stance', 'swing_contact', 'swing_follow', 'swing_whiff'] as AnimName[]) {
      for (let frame = 0; frame < clipSpec(name).frames; frame++) {
        f.dir.seek(name, frame / FPS); f.scene.updateMatrixWorld(true);
        const lowerPalm = f.bone('Prop_BatGrip').localToWorld(new Vector3(0, -.18, 0));
        expect(lowerPalm.distanceTo(f.at('Prop_GloveAnchor')), `${name}:${frame} support palm`).toBeLessThan(.015);
        const headAt = f.at('Head');
        const forward = f.bone('Head').localToWorld(new Vector3(0, 0, 1)).sub(headAt).normalize();
        expect(forward.z, `${name}:${frame} facing`).toBeGreaterThan(.95);
      }
    }
    f.cleanup();
  });

  it.each([1.45, 1.6, 1.75])('places the barrel on the chosen height at contact (scale %s)', scale => {
    const f = fixture(true, scale);
    for (const height of [1.6, 2.4, 3.1]) {
      f.dir.battingPose.contact = f.scene.localToWorld(new Vector3(0, height, 0));
      f.dir.seek('swing_contact', clipSpec('swing_contact').marker!.frame / FPS);
      f.scene.updateMatrixWorld(true);
      const sweet = f.bone('Prop_BatGrip').localToWorld(new Vector3(0, BAT_SWEET_SPOT_FT, 0));
      expect(sweet.distanceTo(f.dir.battingPose.contact)).toBeLessThan(.02);
    }
    f.cleanup();
  });

  it('plants standing feet throughout ready, swing and recovery', () => {
    const f = fixture(); f.dir.seek('bat_stance', 0); f.scene.updateMatrixWorld(true);
    const planted = ['LeftFoot', 'RightFoot'].map(n => f.at(n));
    for (const name of ['bat_stance', 'swing_contact', 'swing_follow'] as AnimName[]) {
      for (let frame = 0; frame < clipSpec(name).frames; frame++) {
        f.dir.seek(name, frame / FPS); f.scene.updateMatrixWorld(true);
        ['LeftFoot', 'RightFoot'].forEach((n, i) => expect(f.at(n).distanceTo(planted[i]), `${name}:${frame} ${n}`).toBeLessThan(.02));
      }
    }
    f.cleanup();
  });

  it('joins the basepath from the batting box without a contact-frame teleport', () => {
    const box = battingPlacement(1.6);
    expect(battingRunOut(1.6, 0)).toEqual({ x: box.x, z: box.z });
    expect(battingRunOut(1.6, .01).x).toBeCloseTo(box.x, 4);
    expect(battingRunOut(1.6, 10)).toEqual({ x: -0, z: -0 });
    expect(battingRunOut(1.6, 60)).toEqual({ x: -0, z: -0 });
  });

  it('replays the recorded aim rather than a later pitch’s target', () => {
    const f = fixture();
    const target = f.dir.battingPose.contact!.clone();
    f.dir.battingPose.contact!.y += 1;
    applySnapshot({ kids: new Map([['kid', f.kid]]), directors: new Map([['kid', f.dir]]), ball: new Group() }, {
      t: 0, ball: [0, 2.4, 0], activeId: null, camera: { phase: 'between' },
      actors: [{ id: 'kid', x: f.kid.root.position.x, z: f.kid.root.position.z, facing: f.kid.root.rotation.y,
        visible: true, clip: 'swing_contact', clipTime: clipSpec('swing_contact').marker!.frame / FPS,
        glove: false, batContact: target.toArray() }],
    }, { seekClips: true });
    f.scene.updateMatrixWorld(true);
    const sweet = f.bone('Prop_BatGrip').localToWorld(new Vector3(0, BAT_SWEET_SPOT_FT, 0));
    expect(sweet.distanceTo(target)).toBeLessThan(.02); f.cleanup();
  });

  it('restores unconstrained locomotion and can seek the same pose repeatedly', () => {
    const f = fixture();
    f.dir.seek('run', .2); const run = f.kid.bones.map(b => [...b.position.toArray(), ...b.quaternion.toArray()]);
    f.dir.seek('swing_contact', .23); const first = f.at('Prop_BatGrip');
    f.dir.seek('swing_follow', .4); f.dir.seek('swing_contact', .23);
    expect(f.at('Prop_BatGrip').distanceTo(first)).toBeLessThan(1e-6);
    f.dir.seek('run', .2);
    f.kid.bones.forEach((b, i) => [...b.position.toArray(), ...b.quaternion.toArray()].forEach((v, j) => expect(v).toBeCloseTo(run[i][j], 6)));
    f.cleanup();
  });

  it('keeps an unchanged play request from removing the painted constraints', () => {
    const f = fixture(); f.dir.seek('bat_stance', .2); const before = f.at('Prop_BatGrip');
    f.dir.play('bat_stance'); f.scene.updateMatrixWorld(true);
    expect(f.at('Prop_BatGrip').distanceTo(before)).toBeLessThan(1e-6); f.cleanup();
  });

  it('keeps the seated athlete’s hands attached through the swing', () => {
    const f = fixture(true, 1.6, true);
    for (const name of ['bat_stance', 'swing_contact', 'swing_follow'] as AnimName[]) {
      for (let frame = 0; frame < clipSpec(name).frames; frame++) {
        f.dir.seek(name, frame / FPS); f.scene.updateMatrixWorld(true);
        const lower = f.bone('Prop_BatGrip').localToWorld(new Vector3(0, -.18, 0));
        expect(lower.distanceTo(f.at('Prop_GloveAnchor')), `${name}:${frame}`).toBeLessThan(.02);
      }
    }
    f.cleanup();
  });

  it('leaves the seated athlete’s seat and leg tracks intact', () => {
    const f = fixture(true, 1.6, true);
    for (const name of ['bat_stance', 'swing_contact', 'swing_follow'] as AnimName[]) {
      f.dir.seek(name, .2); f.dir.battingPose.restore();
      const names = ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
      const positions = names.map(n => f.bone(n).position.toArray());
      const legs = names.slice(1).map(n => f.bone(n).quaternion.toArray());
      f.dir.seek(name, .2);
      names.forEach((n, i) => expect(f.bone(n).position.toArray()).toEqual(positions[i]));
      names.slice(1).forEach((n, i) => expect(f.bone(n).quaternion.toArray()).toEqual(legs[i]));
    }
    f.cleanup();
  });
});
