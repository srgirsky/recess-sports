// ---------------------------------------------------------------------------
// v2's side of the conformance gate.
//
// `scripts/measure/conformance.test.js` exists because a measurement that
// nothing re-checks against the code becomes folklore — the 234px basepath
// that was really 179.6px, believed for months. Its own header says so: "this
// file is not really a test of the numbers, it is a test of the LINK between
// measures.json and the constants those measurements are about."
//
// This is the same test for the two v2 records added with the animation
// contract. Kept SEPARATE from conformance.test.js deliberately: that file
// gates the live v1 game and should not grow an import from a tree that is
// still being built.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REFERENCE_HEIGHT_FT, HEIGHT_MAX_FT, HEIGHT_MIN_FT, bindWorld, crownHeightFt } from '../../src/v2/render/skeleton.ts';
import {
  BROW_MIN_CONTRAST,
  BROW_SHADE,
  CHARACTER_SCALE,
  HAIR_HEADROOM_FRAC,
  HEAD_RISE,
  ProxyCharacter,
} from '../../src/v2/render/ProxyCharacter.ts';
import { SLOT_NAMES, hairHex, skinHex } from '../../src/v2/render/materials/registry.ts';
import { shadeInt } from '../../src/art/fieldTexture.ts';
import { ROSTER } from '../../src/data/characters.ts';
import { CLIPS, RUN_SPEED_FTS, clipSpec } from '../../src/v2/render/clips.ts';
import { RIGS } from '../../src/v2/render/cameraCues.ts';

const here = dirname(fileURLToPath(import.meta.url));
const M = JSON.parse(readFileSync(join(here, '..', 'measures.json'), 'utf8'));

describe('render.rigHeight', () => {
  const rec = M.render.rigHeight;

  it('is a well-formed record', () => {
    expect(Object.keys(M.statuses)).toContain(rec.status);
    expect(rec.informs).toBeTruthy();
  });

  it('still describes the rig the code actually has', () => {
    // The record's whole claim is "the crown sums to the reference height now".
    expect(crownHeightFt()).toBeCloseTo(REFERENCE_HEIGHT_FT, 9);
    expect(REFERENCE_HEIGHT_FT).toBeGreaterThanOrEqual(HEIGHT_MIN_FT);
    expect(REFERENCE_HEIGHT_FT).toBeLessThanOrEqual(HEIGHT_MAX_FT);
    expect(rec.informs).toContain('REFERENCE_HEIGHT_FT');
  });

  it('recomputes the character-presence figure it corrected', () => {
    // The arithmetic the record states, redone from the constants rather than
    // copied from it — so an edit to the PLAY rig or to CHARACTER_SCALE that
    // moves the number has to move the record too.
    const play = RIGS.PLAY;
    const distance = Math.hypot(play.eye[1] - play.target[1], play.eye[2] - play.target[2]);
    const frameHeightFt = 2 * distance * Math.tan((play.fov / 2) * (Math.PI / 180));
    const drawnFt = REFERENCE_HEIGHT_FT * CHARACTER_SCALE;
    // 40deg elevation: FIELD_SOLVE's, which PLAY shares so a cut never shifts
    // the foul slope.
    const apparent = drawnFt * Math.cos(40 * (Math.PI / 180));
    const pct = (apparent / frameHeightFt) * 100;

    expect(pct).toBeGreaterThan(4.8);
    expect(pct).toBeLessThan(5.25);
    expect(rec.consequence.nowTrue).toContain('5.02%');
    // And the brief's other number: 40px on an 800px viewport.
    expect((apparent / frameHeightFt) * 800).toBeGreaterThan(39);
    expect((apparent / frameHeightFt) * 800).toBeLessThan(41);
  });

  it('leaves characterPresence honest about having been wrong', () => {
    // A corrected record that does not say it was corrected is just a record
    // that was always right, which is the failure mode this whole file is for.
    expect(M.render.characterPresence.resolution.residual).toMatch(/CORRECTED 2026-07-30/);
    expect(M.render.characterPresence.resolution.residual).toContain('render.rigHeight');
  });
});

describe('render.proxySilhouette', () => {
  const rec = M.render.proxySilhouette;
  const d = rec.derivation;

  it('is a well-formed record', () => {
    expect(Object.keys(M.statuses)).toContain(rec.status);
    expect(rec.informs).toContain('HEAD_RISE');
    expect(rec.informs).toContain('HAIR_HEADROOM_FRAC');
    expect(rec.n).toBe(0);
    expect(rec.confidence).toBe('n/a');
  });

  it('recomputes the head proportion from the constants, not from itself', () => {
    // The record's whole claim is that the DRAWN head now spans the same
    // fraction as the BONE chain. Both sides are recomputed here, so moving
    // HEAD_RISE without moving the record goes red — which is the link that
    // did not exist when the drawing said 37% and the brief said 30%.
    const headJoint = bindWorld().get('Head')[1];
    expect(headJoint).toBeCloseTo(d.headJointFt, 3);
    expect(crownHeightFt()).toBeCloseTo(d.crownFt, 9);

    const bonePct = ((crownHeightFt() - headJoint) / REFERENCE_HEIGHT_FT) * 100;
    expect(bonePct).toBeCloseTo(d.boneHeadSpanPct, 2);

    // Drawn: radius derived from the crown, sphere centred HEAD_RISE radii up.
    const r = (crownHeightFt() - headJoint) / (HEAD_RISE + 1);
    const drawnPct = ((2 * r) / REFERENCE_HEIGHT_FT) * 100;
    expect(HEAD_RISE).toBe(d.headRise);
    expect(drawnPct).toBeCloseTo(d.drawnHeadSpanPctAfter, 2);
    expect(drawnPct, 'drawn and bone head proportions must agree').toBeCloseTo(bonePct, 6);

    // And the value it was: the same arithmetic at the old constant.
    const rBefore = (crownHeightFt() - headJoint) / (d.headRiseBefore + 1);
    expect(((2 * rBefore) / REFERENCE_HEIGHT_FT) * 100).toBeCloseTo(d.drawnHeadSpanPctBefore, 2);
  });

  it('states the hair headroom the code enforces', () => {
    expect(HAIR_HEADROOM_FRAC).toBe(d.hairHeadroomFrac);
    // There has to have been a violation, or the budget is describing a rule
    // nothing ever broke — and every style has to be inside it now.
    const before = Object.values(d.hairOvershootPctBefore).map((p) => p / 100);
    const after = Object.values(d.hairOvershootPctAfter).map((p) => p / 100);
    expect(Math.max(...before)).toBeGreaterThan(HAIR_HEADROOM_FRAC);
    for (const [style, pct] of Object.entries(d.hairOvershootPctAfter)) {
      expect(pct / 100, `${style} after`).toBeLessThanOrEqual(HAIR_HEADROOM_FRAC);
    }
    // The floor matters as much as the ceiling: `spiky` was at 0.0 because its
    // cones were inside the skull, and a ceiling-only rule called that fine.
    expect(Math.min(...before)).toBe(0);
    expect(Math.min(...after)).toBeGreaterThan(0.01);
  });

  it('leaves rigHeight honest about the claim it got wrong', () => {
    // Its `fix` field said "proportions are unchanged", which was true of the
    // bone chain and false of the drawing. A record that quietly stops being
    // wrong is a record that was always right.
    expect(M.render.rigHeight.correctedClaim).toMatch(/36\.97%/);
    expect(M.render.rigHeight.correctedClaim).toContain('render.proxySilhouette');
    expect(M.render.rigHeight.fix).toContain('BONE CHAIN');
  });
});

describe('render.proxyFace', () => {
  const rec = M.render.proxyFace;
  const d = rec.derivation;

  it('is a well-formed record', () => {
    expect(Object.keys(M.statuses)).toContain(rec.status);
    expect(rec.informs).toContain('BROW_SHADE');
    expect(rec.informs).toContain('BROW_MIN_CONTRAST');
    expect(rec.n).toBe(0);
    expect(rec.confidence).toBe('n/a');
    // A record whose whole subject is a feature nobody could see has to say
    // what its own test still cannot see.
    expect(rec.falseNegative).toBeTruthy();
  });

  it('states the constants the code actually carries', () => {
    expect(BROW_SHADE).toBe(d.browShade);
    expect(BROW_MIN_CONTRAST).toBe(d.browMinContrast);
    expect(HEIGHT_MIN_FT).toBeLessThan(HEIGHT_MAX_FT); // (the record's band is the rig's)
  });

  it('recomputes the head width at which a FIXED-depth feature is swallowed', () => {
    // The defect in one line of arithmetic: the skull's z half-extent scales
    // with headW and a constant does not. Recomputed here so that reshaping the
    // skull or moving the brow's latitude has to move the record too.
    const perHeadW = 0.95 * Math.sqrt(1 - 0.3 ** 2 - d.browLatitude ** 2);
    expect(perHeadW).toBeCloseTo(d.skullFrontPerHeadW, 3);

    // The constant that reproduces today's geometry at headW 1 — i.e. what a
    // fixed depth would have been — and the width at which the skull passes it.
    const fixedFront = perHeadW * 1 - 0.02 + d.derivedMarginR;
    expect(fixedFront).toBeCloseTo(d.fixedBrowFront, 3);
    expect(fixedFront / perHeadW).toBeCloseTo(d.browBuriedAboveHeadW, 2);

    // It has to be a width kids actually have, or the bug is hypothetical.
    const affected = ROSTER.filter(
      (c) => Math.min(1.08, Math.max(0.9, c.visual.body?.headW ?? 1)) > d.browBuriedAboveHeadW
    );
    expect(affected).toHaveLength(d.kidsAffectedByFixedDepth);
    expect(d.headWRange[1]).toBeGreaterThan(d.browBuriedAboveHeadW);
  });

  it('recomputes the worst brow-against-skin separation on the real roster', () => {
    // The record names `moose` and a number. Both are re-derived from the
    // palettes and the shade constant, so a palette edit that makes a brow
    // vanish cannot leave the record saying it did not.
    const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
    let worst = Infinity;
    let who = '';
    for (const c of ROSTER) {
      const s = rgb(skinHex(c.visual.skin));
      const b = rgb(shadeInt(hairHex(c.visual.hairColor), BROW_SHADE));
      const dist = Math.sqrt(2 * (s[0] - b[0]) ** 2 + 4 * (s[1] - b[1]) ** 2 + 3 * (s[2] - b[2]) ** 2);
      if (dist < worst) {
        worst = dist;
        who = c.id;
      }
    }
    expect(who).toBe(d.worstBrowContrast.kid);
    expect(worst).toBeCloseTo(d.worstBrowContrast.at055, 0);
    expect(worst).toBeGreaterThan(BROW_MIN_CONTRAST);
  });

  it('states the triangle cost it actually costs', () => {
    // The figure this record and docs/OVERVIEW.md both quote, measured off a
    // built proxy rather than copied. It was wrong once already: the count was
    // taken with brows that were then removed, and nothing re-measured.
    const kid = new ProxyCharacter(ROSTER[0].visual);
    const tris = kid.mesh.geometry.index.count / 3;
    kid.dispose();
    expect(tris).toBe(d.trianglesPerKid);
    expect(M.render.proxySilhouette.derivation.trianglesPerKid.after).toBe(tris);
  });
});

describe('render.characterDrawCost', () => {
  const rec = M.render.characterDrawCost;

  it('is a well-formed record', () => {
    expect(Object.keys(M.statuses)).toContain(rec.status);
    expect(rec.status).toBe('known-drift');
    expect(rec.informs).toContain('CharacterModel.ts');
    expect(rec.whatWouldClose).toBeTruthy();
  });

  it('states arithmetic that adds up', () => {
    // The whole claim is that four material slots x (mesh + hull) is eight
    // draws, and that thirteen of those plus the field is what busts the
    // budget. If either half stops being derivable the record is folklore.
    const m = rec.measured;
    expect(m.perCharacter.modelMax).toBe(SLOT_NAMES.length * 2);
    expect(m.perCharacter.proxy).toBe(2);

    // Models minus proxies is the extra hulls-and-primitives, and nothing else
    // in the scene changed between the two reads. It comes to 76 rather than
    // the 78 the maximum predicts, and the two missing draws are the point:
    // one of the thirteen is bald, so has no M_Hair primitive and no hull for
    // it. Cost is per POPULATED slot, which the record has to say out loud or
    // the next person recomputes 78 and calls the measurement wrong.
    const extra = m.models.drawCalls - m.proxies.drawCalls;
    const perSlotPair = 2;
    expect(extra).toBe(m.kids * (m.perCharacter.modelMax - m.perCharacter.proxy) -
      rec.drift.emptySlotCharacters * perSlotPair);

    // The drift is the size the record says it is.
    expect(m.models.drawCalls - m.budget.drawCalls).toBe(rec.drift.drawCallsOver);
    expect(m.models.drawCalls).toBeGreaterThan(m.budget.drawCalls);
  });

  it('records LOD paying for itself on the axis it is for', () => {
    // A draw-call regression that bought nothing would be a reason to delete
    // the LOD, not to record a budget overrun.
    const m = rec.measured;
    expect(m.models.trianglesK).toBeLessThan(m.proxies.trianglesK * 0.6);
    expect(m.models.trianglesK).toBeLessThan(m.budget.trianglesK);
    expect(m.proxies.trianglesK).toBeLessThan(m.budget.trianglesK);
  });
});

describe('render.runCadence', () => {
  const rec = M.render.runCadence;

  it('is a well-formed record', () => {
    expect(Object.keys(M.statuses)).toContain(rec.status);
    expect(rec.informs).toContain('RUN_SPEED_FTS');
    // DERIVED, not measured: it must claim no sample count.
    expect(rec.n).toBe(0);
    expect(rec.confidence).toBe('n/a');
    expect(rec.whatWouldClose).toBeTruthy();
  });

  it('derives run speed from the pace anchor, and both still agree', () => {
    const anchorMs = M.pace.homeToFirst.measured;
    const legFt = 60;
    const derived = legFt / (anchorMs / 1000);
    expect(derived).toBeCloseTo(rec.derivation.runSpeedFts, 2);
    expect(RUN_SPEED_FTS).toBeCloseTo(derived, 2);
    expect(clipSpec('run').authoredSpeedFts).toBe(RUN_SPEED_FTS);
  });

  it('recomputes the stride the record warns about', () => {
    // 24 frames at 30fps -> 2.5 footfalls/s -> a 5.71ft step on a 4.0ft kid.
    // If the clip length or the anchor moves, this number moves, and the
    // record's caveat has to be re-read rather than inherited.
    const cycles = 30 / clipSpec('run').frames;
    const footfalls = cycles * 2;
    const step = RUN_SPEED_FTS / footfalls;
    expect(footfalls).toBeCloseTo(2.5, 6);
    expect(step).toBeCloseTo(rec.derivation.impliedStepFt, 2);
    expect(step / REFERENCE_HEIGHT_FT).toBeCloseTo(rec.derivation.impliedStepPerHeight, 2);
  });

  it('states every authored speed the clip table carries', () => {
    for (const clip of CLIPS) {
      if (clip.authoredSpeedFts === undefined || clip.name === 'run') continue;
      expect(rec.others, `${clip.name} ${clip.authoredSpeedFts}`).toContain(String(clip.authoredSpeedFts));
    }
  });
});
