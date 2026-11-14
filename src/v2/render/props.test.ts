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
import { Bone, Box3, Vector3, type Object3D } from 'three';
import { ROSTER } from '../../data/characters';
import { ProxyCharacter } from './ProxyCharacter';
import { BAT_ANCHOR_BONE, BAT_LENGTH_FT, BAT_PROP_NAME, BIG_BAT_SCALE, HELMET, HELMET_PROP_NAME, TASSELS, TASSEL_PROP_NAME, attachSignatureProp, GLOVE_ANCHOR_BONE, TEAM_BAND_ANCHOR_BONE, attachBatProp, attachGloveProp, attachTeamBandProp, paintTeamBand } from './props';
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

describe('attachTeamBandProp', () => {
  it('parents a hidden band holder to the throwing arm', () => {
    const kid = new ProxyCharacter(ROSTER[0].visual);
    const band = attachTeamBandProp(kid)!;
    expect(band).toBeTruthy();
    expect(band.visible).toBe(false);
    expect(band.parent?.name).toBe(TEAM_BAND_ANCHOR_BONE);
  });

  it('dresses in a team colour, shares materials per colour, and undresses', () => {
    const a = attachTeamBandProp(new ProxyCharacter(ROSTER[0].visual))!;
    const b = attachTeamBandProp(new ProxyCharacter(ROSTER[1].visual))!;
    paintTeamBand(a, 0x7b5bd6);
    paintTeamBand(b, 0x7b5bd6);
    expect(a.visible).toBe(true);
    const meshA = a.children[0] as Mesh;
    const meshB = b.children[0] as Mesh;
    // One geometry and one material per palette colour — the bat's budget rule.
    expect(meshA.geometry).toBe(meshB.geometry);
    expect(meshA.material).toBe(meshB.material);
    paintTeamBand(a, null);
    expect(a.visible).toBe(false);
    // Re-dressing after undress keeps the one mesh rather than stacking more.
    paintTeamBand(a, 0xd6455b);
    expect(a.children.length).toBe(2);
    expect((a.children[0] as Mesh).material).not.toBe(meshB.material);
  });
});

describe('Mars\'s bat is visibly too big', () => {
  const anchored = () => {
    const anchor = new Bone();
    anchor.name = BAT_ANCHOR_BONE;
    return { bones: [anchor] };
  };

  it('★ is longer and fatter than everyone else\'s, grown away from the hands', () => {
    const plain = attachBatProp(anchored())!;
    const big = attachBatProp(anchored(), 'bigBat')!;
    expect(plain.scale.toArray()).toEqual([1, 1, 1]);
    expect(big.scale.y).toBe(BIG_BAT_SCALE.length);
    expect(big.scale.x).toBe(BIG_BAT_SCALE.girth);
    expect(big.scale.z).toBe(BIG_BAT_SCALE.girth);
    // Longer than it is fatter, and clearly so — a bat, not a club.
    expect(BIG_BAT_SCALE.length).toBeGreaterThan(BIG_BAT_SCALE.girth);
    expect(BIG_BAT_SCALE.length).toBeGreaterThanOrEqual(1.25);
    // The origin is the grip: the bat is not moved, only grown.
    expect(big.position.toArray()).toEqual([0, 0, 0]);
  });

  it('shares the one geometry: the big bat is a scale, never a second mesh', () => {
    const a = attachBatProp(anchored()) as unknown as { geometry: unknown };
    const b = attachBatProp(anchored(), 'bigBat') as unknown as { geometry: unknown };
    expect(b.geometry).toBe(a.geometry);
  });

  it('★ only the kid whose sheet says so carries one', () => {
    const carriers = ROSTER.filter((c) => c.visual.signature === 'bigBat').map((c) => c.id);
    expect(carriers).toEqual(['calls_shot']);
    for (const sig of ['hijab', 'patka', 'slidingHelmet', 'catcherGear', 'tzitzit'] as const) {
      expect(attachBatProp(anchored(), sig)!.scale.toArray()).toEqual([1, 1, 1]);
    }
  });
});

describe('the looks a kid wears: June\'s helmet and Ezra\'s tassels', () => {
  const rig = () => {
    const head = new Bone();
    head.name = 'Head';
    const hips = new Bone();
    hips.name = 'Hips';
    return { bones: [head, hips], head, hips };
  };

  it('★ June\'s helmet rides her head and is too big for it', () => {
    const r = rig();
    const helmet = attachSignatureProp(r, 'slidingHelmet')!;
    expect(helmet.name).toBe(HELMET_PROP_NAME);
    expect(helmet.parent).toBe(r.head);
    expect(r.hips.children.length).toBe(0);
    // "Too big": wider than the whole canonical head is tall, joint to crown.
    const HEAD_TALL_FT = 1.294;
    expect(HELMET.radiusFt * 2).toBeGreaterThan(HEAD_TALL_FT);
    // And it sits ON the head, not above it: the shell's rim is below the crown.
    expect(HELMET.centreUpFt).toBeLessThan(HEAD_TALL_FT);
    expect(HELMET.centreUpFt + HELMET.radiusFt).toBeGreaterThan(HEAD_TALL_FT);
  });

  it('★ Ezra\'s tassels are four, one at each corner, hanging below his hips', () => {
    const r = rig();
    const tassels = attachSignatureProp(r, 'tzitzit')!;
    expect(tassels.name).toBe(TASSEL_PROP_NAME);
    expect(tassels.parent).toBe(r.hips);
    expect(tassels.children.length).toBe(4);
    const corners = tassels.children.map((c) => `${Math.sign(c.position.x)},${Math.sign(c.position.z)}`).sort();
    expect(corners).toEqual(['-1,-1', '-1,1', '1,-1', '1,1']);
    for (const strand of tassels.children) expect(strand.position.y + TASSELS.lengthFt / 2).toBeLessThan(0);
  });

  it('★ nobody else is handed one, and the four sculpted looks are left to the sculpt', () => {
    for (const sig of [undefined, 'hijab', 'patka', 'catcherGear', 'bigBat'] as const) {
      const r = rig();
      expect(attachSignatureProp(r, sig)).toBeNull();
      expect(r.head.children.length + r.hips.children.length).toBe(0);
    }
    expect(ROSTER.filter((c) => c.visual.signature === 'slidingHelmet').map((c) => c.id)).toEqual(['nostrike']);
    expect(ROSTER.filter((c) => c.visual.signature === 'tzitzit').map((c) => c.id)).toEqual(['bend_it']);
  });

  it('a rig with no such bone gets nothing rather than a throw', () => {
    expect(attachSignatureProp({ bones: [] }, 'slidingHelmet')).toBeNull();
    expect(attachSignatureProp({ bones: [] }, 'tzitzit')).toBeNull();
  });
});
