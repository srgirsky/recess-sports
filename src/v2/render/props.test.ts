// ---------------------------------------------------------------------------
// The bat prop: it exists, it hangs on the contract's anchor bone, and it is
// sized like a bat rather than a toothpick or a telephone pole.
//
// The 2026-08-15 re-audit's #1 finding was that no bat existed anywhere in v2
// — the `Prop_BatGrip` anchor had been in the skeleton contract since the rig
// was specified, and nothing had ever parented anything to it. Same class as
// `bridge.ts` before PR 13: documented structure with no caller. These tests
// pin the caller's half; `AnimationDirector.test.ts` pins WHEN it shows.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { Box3, Vector3, type Object3D } from 'three';
import { ROSTER } from '../../data/characters';
import { ProxyCharacter } from './ProxyCharacter';
import { BAT_ANCHOR_BONE, BAT_LENGTH_FT, BAT_PROP_NAME, GLOVE_ANCHOR_BONE, attachBatProp, attachGloveProp } from './props';
import { AnimationDirector } from './AnimationDirector';
import { buildProceduralClips } from './proceduralClips';
import type { Mesh } from 'three';

describe('attachBatProp', () => {
  it('parents a hidden bat to the Prop_BatGrip bone', () => {
    const kid = new ProxyCharacter(ROSTER[0].visual);
    const bat = attachBatProp(kid);
    expect(bat).not.toBeNull();
    expect(bat!.name).toBe(BAT_PROP_NAME);
    expect(bat!.visible).toBe(false);
    expect((bat!.parent as Object3D).name).toBe(BAT_ANCHOR_BONE);
    kid.dispose();
  });

  it('spans a youth bat, knob to tip, in reference feet', () => {
    const kid = new ProxyCharacter(ROSTER[0].visual);
    const bat = attachBatProp(kid)!;
    bat.visible = true;
    kid.root.updateMatrixWorld(true);
    // Bind pose is translation-only, so the bat's +Y stays world-vertical here.
    const box = new Box3().setFromObject(bat);
    const size = box.getSize(new Vector3());
    // The bone inherits the kid's root scale, so measure against the composed
    // world scale of the anchor rather than assuming 1.
    const worldScale = bat.parent!.getWorldScale(new Vector3()).y;
    expect(size.y / worldScale).toBeCloseTo(BAT_LENGTH_FT, 1);
    kid.dispose();
  });

  it('shares one geometry and one material across the roster', () => {
    const a = new ProxyCharacter(ROSTER[0].visual);
    const b = new ProxyCharacter(ROSTER[1].visual);
    const batA = attachBatProp(a)! as unknown as { geometry: unknown; material: unknown };
    const batB = attachBatProp(b)! as unknown as { geometry: unknown; material: unknown };
    expect(batA.geometry).toBe(batB.geometry);
    expect(batA.material).toBe(batB.material);
    a.dispose();
    b.dispose();
  });

  it('returns null on a rig with no anchor, so wiring can be unconditional', () => {
    expect(attachBatProp({ bones: [] })).toBeNull();
  });
});

describe('attachGloveProp', () => {
  it('parents a hidden mitt to the Prop_GloveAnchor bone', () => {
    const kid = new ProxyCharacter(ROSTER[0].visual);
    const glove = attachGloveProp(kid)!;
    expect(glove).toBeTruthy();
    expect(glove.visible).toBe(false);
    expect(glove.parent?.name).toBe(GLOVE_ANCHOR_BONE);
  });

  it('shares geometry and material across the roster, like the bat', () => {
    const a = attachGloveProp(new ProxyCharacter(ROSTER[0].visual))!;
    const b = attachGloveProp(new ProxyCharacter(ROSTER[1].visual))!;
    const meshesOf = (g: typeof a) => g.children.filter((c): c is Mesh => (c as Mesh).isMesh);
    const [aShell] = meshesOf(a);
    const [bShell] = meshesOf(b);
    expect(aShell.geometry).toBe(bShell.geometry);
    expect(aShell.material).toBe(bShell.material);
  });

  it('is a role the director wears, vetoed while a bat clip plays', () => {
    // The batter cannot carry a mitt: `setGloveVisible(true)` on a kid whose
    // playing clip holds the bat stays hidden until the clip lets go.
    const kid = new ProxyCharacter(ROSTER[0].visual);
    const glove = attachGloveProp(kid)!;
    const dir = new AnimationDirector(kid.mesh, { fallback: buildProceduralClips(), glove });
    dir.setGloveVisible(true);
    expect(glove.visible).toBe(true);
    dir.play('bat_stance');
    expect(glove.visible).toBe(false);
    dir.play('field_ready');
    expect(glove.visible).toBe(true);
    dir.setGloveVisible(false);
    expect(glove.visible).toBe(false);
    dir.dispose();
  });
});
