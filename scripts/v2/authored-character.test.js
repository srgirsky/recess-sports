// ---------------------------------------------------------------------------
// ★ A Blender source that is downstream of its runtime GLB is not a source.
//
// This gate binds each finished delivery to the exact .blend and approved
// turnaround that produced it, and requires a six-category side-by-side review.
// It also makes `export:roster-kid` unable to silently overwrite an authored
// character: the runtime hash goes red.
//
// ★ DELIBERATE RULE CHANGE, 2026-08-12: the serialization clause is gone and the
// review clauses got stronger.
//
// This file used to hold `batch2Status`, which required the flag to read
// 'paused' while any character was not yet approved. Two things were wrong with
// it. It could only ever hold one value, because the condition stays true until
// all thirty are approved, at which point there is no batch to pause — a flag
// with one reachable value is a sentence of prose in a test's clothing. And it
// was believed to be what serialized production, which it never was: `baseline`
// is the registry's authored set, so registering a new character makes them a
// member rather than an `extra`, and one-character-per-PR lived only in the
// playbook's prose. Production now runs in batches of five; see
// `docs/v2/character-production-playbook.md`.
//
// What replaces it is per character and enforces the thing the flag was reaching
// for — that a character cannot be CALLED finished on evidence that does not
// describe it. `scoredBoardSha256` binds the six scores to the board's bytes,
// and `measuredFidelity` must record a real `measure:fidelity` run against that
// same board. That is the Mimi failure made mechanical instead of remembered.
// The four finished-work mesh checks stop being keyed on Junebug's id and follow
// the claim instead, so the second sculpt is checked as hard as the first.
//
// Broken deliberately, each demanding its own message: changing Mimi's receipt
// hash reported "runtime hash differs"; removing hairMass reported the missing
// category; re-rendering the board after scoring reported the unbound scores;
// deleting `measuredFidelity` reported the missing run; and pointing it at
// another character's board reported the mismatch. The tests below retain those
// mutations as fixtures.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { readAccessor, readGlb } from './glb.mjs';
import { AUTHORED_CHARACTERS } from './export-authored-character.mjs';
import { ROSTER } from '../../src/data/characters.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const sourceDir = join(repo, 'assets', 'v2', 'source');
const conceptsDir = join(repo, 'docs', 'v2', 'concepts');
const modelsDir = join(repo, 'public', 'v2', 'models');
const receipt = JSON.parse(readFileSync(join(sourceDir, 'character-production.json'), 'utf8'));
const fidelity = JSON.parse(readFileSync(join(sourceDir, 'character-fidelity.json'), 'utf8'));
const baseline = Object.keys(AUTHORED_CHARACTERS).sort();

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}


// ---------------------------------------------------------------------------
// ★ A VERTEX MUST BE WEIGHTED TO A BONE THAT IS ACTUALLY NEAR IT.
//
// Tank shipped a mesh whose arms hung at his sides while the canonical rig is a
// T-POSE — LeftForeArm at x -0.918, LeftHand at -1.365, both at z 2.471 — and
// whose left and right were MIRRORED, because the left bones live at negative x
// and the sculpt called +x "Left". Every forearm vertex was about two feet from
// the bone driving it and on the wrong side of the body.
//
// ⚠️ ALL EIGHT `measure:fidelity` METRICS WERE GREEN WHILE THAT WAS TRUE, and so
// was `validate:models` (38/38), and so was the fidelity board. Every one of
// them reads the BIND POSE, where a mesh sitting far from its bones looks
// exactly like a mesh sitting on them. The playbook says "reject a technically
// valid model that only works in the bind pose"; this is that sentence with
// teeth. It only became visible in the runtime run still, where the arms swung
// like planks about pivots outside themselves — `render.legStance`'s failure
// mode, arrived at from a different direction.
//
// The check is a RANK, not a distance, because distance cannot separate them: a
// skull legitimately sits 1.3ft above the Head bone, further than a misbound
// forearm sits from its own. But a correctly bound vertex is always near the
// TOP of the list of bones sorted by distance. Measured over the delivered
// roster: Junebug 5, Tank after the fix 6, Theo 9, Big Lou 8, Mimi 10 — and
// Tank before the fix 31.
//
// `Root` is exempt: Zoom's wheelchair is geometry legitimately parented to it
// and ranks 28 for that reason, which is a prop, not a misbinding.
// ---------------------------------------------------------------------------
const MAX_BONE_RANK = 12;

function boneRestPositions(gltf) {
  const world = new Map();
  const walk = (index, px, py, pz) => {
    const node = gltf.json.nodes[index];
    const t = node.translation ?? [0, 0, 0];
    const x = px + t[0], y = py + t[1], z = pz + t[2];
    world.set(index, [x, y, z]);
    for (const child of node.children ?? []) walk(child, x, y, z);
  };
  for (const root of gltf.json.scenes?.[0]?.nodes ?? []) walk(root, 0, 0, 0);
  return world;
}

/** The worst rank, by rest-distance, of any vertex's dominant bone. */
function worstDominantBoneRank(gltf) {
  const skin = gltf.json.skins?.[0];
  if (!skin) return { rank: 0, bone: null };
  const rest = boneRestPositions(gltf);
  const points = skin.joints.map((j) => rest.get(j));
  let worst = 0, bone = null;
  for (const mesh of gltf.json.meshes ?? []) {
    if (!mesh.name?.includes('LOD0')) continue;
    for (const primitive of mesh.primitives ?? []) {
      const positions = primitive.attributes?.POSITION;
      const jointsAttr = primitive.attributes?.JOINTS_0;
      const weightsAttr = primitive.attributes?.WEIGHTS_0;
      if (positions === undefined || jointsAttr === undefined || weightsAttr === undefined) continue;
      const P = readAccessor(gltf, positions);
      const J = readAccessor(gltf, jointsAttr);
      const W = readAccessor(gltf, weightsAttr);
      for (let v = 0; v < J.length / 4; v++) {
        let best = -1, bestWeight = 0;
        for (let k = 0; k < 4; k++) if (W[v * 4 + k] > bestWeight) { bestWeight = W[v * 4 + k]; best = J[v * 4 + k]; }
        if (best < 0) continue;
        const name = gltf.json.nodes[skin.joints[best]]?.name;
        if (name === 'Root') continue;
        const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
        const distance = (q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        const mine = distance(points[best]);
        let rank = 0;
        for (let i = 0; i < points.length; i++) if (points[i] && distance(points[i]) < mine) rank++;
        if (rank > worst) { worst = rank; bone = name; }
      }
    }
  }
  return { rank: worst, bone };
}


// ---------------------------------------------------------------------------
// ★ A MIRRORED HALF WHOSE NORMALS POINT INWARD.
//
// Tank shipped with 312 of 1,256 mirrored vertex pairs — 263 of 284 in the feet
// alone, and 100% of both far LODs — carrying normals related by
// `n(-x) = -mirror(n(+x))`: one side of the character was inside out. glTF
// materials are single-sided, so that is not a shading artifact. It renders as
// an open shell you can see the interior of, and it produced a shoe that looked
// like an open trough with a spike through the toe.
//
// ⚠️ IT SURVIVED THREE INDEPENDENT REVIEWS AS "A LIGHTING DIFFERENCE", and the
// measurement that dismissed it was mine: I compared mirrored pairs on POSITION
// and COLOR_0, found 2,182 matches and zero colour mismatches, and concluded
// the mesh was symmetric. It was — in the two attributes I checked. Nobody had
// asked about NORMAL.
//
// `validate:models` cannot see it either: bone order, budgets, height band and
// palette are all indifferent to which way a face points.
//
// Calibrated on the delivered roster before being trusted: approved Junebug is
// 0 of 1,354 pairs and Big Lou 1 of 809, so a small absolute allowance covers
// honest tessellation noise while catching a mirrored half.
// ---------------------------------------------------------------------------
const MAX_INVERTED_MIRROR_PAIRS = 8;

function invertedMirrorPairs(gltf) {
  let worst = 0;
  for (const mesh of gltf.json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const positions = primitive.attributes?.POSITION;
      const normals = primitive.attributes?.NORMAL;
      if (positions === undefined || normals === undefined) continue;
      const P = readAccessor(gltf, positions);
      const N = readAccessor(gltf, normals);
      const key = (x, y, z) => `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
      const byMirror = new Map();
      for (let v = 0; v < P.length / 3; v++) {
        byMirror.set(key(-P[v * 3], P[v * 3 + 1], P[v * 3 + 2]), v);
      }
      let inverted = 0;
      for (let v = 0; v < P.length / 3; v++) {
        if (P[v * 3] <= 1e-4) continue; // walk one side only
        const other = byMirror.get(key(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]));
        if (other === undefined) continue;
        // A correctly mirrored normal is (-nx, ny, nz). Inverted is its negation.
        const dx = -N[v * 3] - N[other * 3];
        const dy = N[v * 3 + 1] - N[other * 3 + 1];
        const dz = N[v * 3 + 2] - N[other * 3 + 2];
        if (Math.hypot(dx, dy, dz) > 1.0) inverted++;
      }
      if (inverted > worst) worst = inverted;
    }
  }
  return worst;
}

function stateErrors(production, reviews) {
  const errors = [];
  const expectedCategories = reviews.categories ?? [];
  for (const id of baseline) {
    const config = AUTHORED_CHARACTERS[id];
    const record = production.characters?.[id];
    const review = reviews.characters?.[id];
    if (!record) { errors.push(`${id}: missing production receipt`); continue; }
    if (!review) { errors.push(`${id}: missing fidelity review`); continue; }
    if (!['needs-polish', 'candidate', 'approved'].includes(review.status)) {
      errors.push(`${id}: unknown fidelity status ${review.status}`);
    }
    if (record.definingTraits?.length !== 5) errors.push(`${id}: expected exactly five defining traits`);
    const source = join(sourceDir, config.source);
    const concept = join(conceptsDir, config.concept);
    const output = join(modelsDir, `kid_${id}.glb`);
    if (!existsSync(source) || sha(source) !== record.sourceSha256) errors.push(`${id}: Blender source hash differs`);
    if (!existsSync(concept) || sha(concept) !== record.conceptSha256) errors.push(`${id}: concept hash differs`);
    if (!existsSync(output) || sha(output) !== record.outputSha256) errors.push(`${id}: runtime hash differs`);
    const evidencePath = join(conceptsDir, review.evidence ?? '');
    if (!existsSync(evidencePath)) errors.push(`${id}: fidelity evidence is missing`);
    const claimsFinished = review.status === 'candidate' || review.status === 'approved';
    if (claimsFinished) {
      if (!existsSync(join(conceptsDir, review.heroEvidence ?? ''))) errors.push(`${id}: authored-model hero evidence is missing`);
      const animationEvidence = review.animationEvidence ?? [];
      if (animationEvidence.length < 2 || animationEvidence.some((name) => !existsSync(join(conceptsDir, name)))) {
        errors.push(`${id}: run/contact authored-model evidence is missing`);
      }
      // ★ THE SCORES ARE BOUND TO THE BOARD THEY WERE READ OFF.
      //
      // This is the Mimi failure made mechanical. Her approval was revoked
      // because manually entered scores did not prove visual fidelity — and the
      // structural half of that is that a score can outlive the asset it
      // describes. Re-sculpt, re-export, do not re-score, and the record still
      // reads 4/5 with a note describing a mesh that no longer exists. Nothing
      // caught it, because every hash in the receipt tracked the ASSET and no
      // hash tracked the REVIEW.
      //
      // The board renders the shipped GLB, so binding the scores to the board's
      // bytes binds them to the delivery. Note the ordering trap this creates
      // and does not remove: the board PRINTS the scores and the status, so the
      // hash has to be taken from a board rendered AFTER the scores are written.
      if (!existsSync(evidencePath) || review.scoredBoardSha256 !== sha(evidencePath)) {
        errors.push(`${id}: the six scores are not bound to the current fidelity board`);
      }
      // Rubric §6b: the measurement settles what it covers BEFORE a 1-5 score is
      // discussed. Four rounds on Junebug produced 4,4,4,4,4,3 from one reviewer
      // and 3,4,3,3,3,3 from the next on barely-changed evidence, and a verdict
      // asserted a shoe colour nobody had measured. Requiring the run is what
      // makes "where a number exists, the number wins" checkable.
      const measured = review.measuredFidelity;
      if (!measured?.ranAt?.trim() || !measured?.result?.trim()) {
        errors.push(`${id}: no measure:fidelity run recorded — run it before scoring §3`);
      } else if (measured.board !== review.evidence) {
        errors.push(`${id}: the measure:fidelity run cites a different board than the review`);
      }
    }

    const categoryNames = Object.keys(review.categories ?? {}).sort();
    if (categoryNames.join('|') !== [...expectedCategories].sort().join('|')) {
      errors.push(`${id}: fidelity categories differ from the required set`);
    }
    // ★ A CATEGORY WITH NOTHING TO JUDGE SCORES NULL, NOT 5.
    //
    // Tank is bald, so rubric 3.3 (hair mass) has no subject on his board. The
    // record scored it 5/5 — "the approved bald negative space is preserved
    // exactly" — and an independent review named it as exactly the free point
    // the rubric warns about: it is one sixth of his average, it can never go
    // down, and it made a character with no category above 3 look like one
    // with a 5 in the bag.
    //
    // Abstaining has to be mechanical or it becomes the same problem in
    // reverse — a sculptor could abstain from whatever is going badly. So the
    // ONLY category that may abstain is `hairMass`, and only when the ROSTER
    // says the character has no hair. That is data, not opinion, and it is the
    // same `visual.hair` the sculpt script reads.
    const bald = ROSTER.find((entry) => entry.id === id)?.visual?.hair === 'bald';
    for (const name of expectedCategories) {
      const category = review.categories?.[name];
      const abstains = category?.score === null;
      if (abstains && !(name === 'hairMass' && bald)) {
        errors.push(`${id}: ${name} may not abstain — only hairMass, and only for a bald character`);
      } else if (!category || !category.note?.trim()
        || (!abstains && (!Number.isInteger(category.score) || category.score < 1 || category.score > 5))) {
        errors.push(`${id}: ${name} needs a 1-5 score and review note`);
      }
      // An abstention is not a pass. `< 4` is false for null, so the check has
      // to ask for a number rather than ask for the absence of a low one.
      if (review.status === 'approved' && !abstains && !(category?.score >= 4)) {
        errors.push(`${id}: approved with ${name} below 4/5`);
      }
    }
    if (review.status === 'approved') {
      if (!review.approvedBy?.trim() || !review.approvedAt?.trim()) {
        errors.push(`${id}: approval requires an explicit human approver and timestamp`);
      }
      if (!existsSync(evidencePath) || review.approvedEvidenceSha256 !== sha(evidencePath)) {
        errors.push(`${id}: approval is not bound to the current fidelity board`);
      }
      // An agent may only ever write `candidate` (the playbook's rule). The
      // record of who looked and what they said is therefore the one field an
      // agent cannot manufacture, and it was carried by Junebug and checked by
      // nobody.
      if (!review.humanReview?.reviewer?.trim() || !review.humanReview?.verdict?.trim()) {
        errors.push(`${id}: approval requires a humanReview reviewer and verdict`);
      }
    }

    if (existsSync(output)) {
      const gltf = readGlb(output);
      const authored = gltf.json.asset?.extras?.recessAuthoring;
      if (authored?.sourceSha256 !== record.sourceSha256 || authored?.conceptSha256 !== record.conceptSha256) {
        errors.push(`${id}: GLB provenance differs from its receipt`);
      }
      // Scoped to work that CLAIMS to be finished, like the other mesh rules:
      // a needs-polish sculpt in progress should be reported by the reviewer,
      // not blocked by CI. Tank sits at 258 today and is deliberately not
      // claiming; the moment he is marked `candidate` this stops him.
      const inverted = claimsFinished ? invertedMirrorPairs(gltf) : 0;
      if (inverted > MAX_INVERTED_MIRROR_PAIRS) {
        errors.push(
          `${id}: ${inverted} mirrored vertex pairs have INVERTED normals — one side of the ` +
          'mesh is inside out. glTF is single-sided, so those faces render as open shells. ' +
          'Check the `flip` predicate on every grid() that is emitted per side.',
        );
      }
      const bound = worstDominantBoneRank(gltf);
      if (bound.rank > MAX_BONE_RANK) {
        errors.push(
          `${id}: mesh is not bound to the rig it ships with — a vertex's dominant bone ` +
          `(${bound.bone}) is only the ${bound.rank}th nearest. Check the arms against the ` +
          'T-pose and that Left bones are at NEGATIVE x.',
        );
      }
      // ★ THESE ARE FINISHED-CHARACTER RULES, NOT JUNEBUG FACTS.
      //
      // They were gated on `id === 'nostrike'` because she was the only one who
      // could pass them — the other five are procedural bootstraps with no
      // authored wardrobe blocks and no finger volumes. But "a signature palette
      // is declared", "team colour is confined to one accent surface", "the hands
      // have knuckles" and "the arms deform across two bones" are the rubric's
      // items 2.3, 3.11 and 4.3 for every character, and pinning them to one id
      // meant the second sculpt would have been checked by nothing.
      //
      // So the gate follows the CLAIM instead of the name: anything marked
      // `candidate` or `approved` is asserting it is finished and gets the
      // finished-work checks. `needs-polish` is exempt by definition, which is
      // what it means. This is strictly stronger than the id test it replaces —
      // today it covers the same one character, and it covers each new one the
      // moment a sculptor claims it is done.
      if (claimsFinished) {
        const materials = gltf.json.materials ?? [];
        const uniformIndex = materials.findIndex((material) => material.name === 'M_Uniform');
        const accessory = materials.find((material) => material.name === 'M_Accessory');
        if (materials[uniformIndex]?.extras?.recessIdentityPalette !== true) {
          errors.push(`${id}: signature palette is not declared on M_Uniform`);
        }
        if (accessory?.extras?.recessTeamAccent !== true) {
          errors.push(`${id}: no deliberate team-accent surface is declared`);
        }
        const colours = new Set();
        for (const mesh of gltf.json.meshes ?? []) {
          for (const primitive of mesh.primitives ?? []) {
            if (primitive.material !== uniformIndex || primitive.attributes?._RECESS_COLOR !== undefined) continue;
            const accessorIndex = primitive.attributes?.COLOR_0;
            if (accessorIndex === undefined) continue;
            const accessor = gltf.json.accessors[accessorIndex];
            const parts = accessor.type === 'VEC4' ? 4 : 3;
            const values = readAccessor(gltf, accessorIndex);
            for (let at = 0; at < values.length; at += parts) colours.add(values.slice(at, at + parts).join(','));
          }
        }
        if (colours.size < 3) errors.push(`${id}: signature wardrobe colour blocks did not survive export`);

        const skin = gltf.json.skins?.[0];
        const jointNames = skin?.joints?.map((nodeIndex) => gltf.json.nodes?.[nodeIndex]?.name) ?? [];
        const fingerInfluence = new Map(
          ['LeftHandThumb1', 'LeftHandIndex1', 'RightHandThumb1', 'RightHandIndex1'].map((name) => [name, 0])
        );
        let blendedArmVertices = 0;
        for (const mesh of gltf.json.meshes ?? []) {
          if (!mesh.name?.includes('LOD0')) continue;
          for (const primitive of mesh.primitives ?? []) {
            const jointAccessor = primitive.attributes?.JOINTS_0;
            const weightAccessor = primitive.attributes?.WEIGHTS_0;
            if (jointAccessor === undefined || weightAccessor === undefined) continue;
            const joints = readAccessor(gltf, jointAccessor);
            const weights = readAccessor(gltf, weightAccessor);
            for (let vertex = 0; vertex < joints.length / 4; vertex++) {
              let active = 0;
              for (let part = 0; part < 4; part++) {
                const at = vertex * 4 + part;
                if (weights[at] <= 0) continue;
                active++;
                const name = jointNames[joints[at]];
                if (fingerInfluence.has(name)) fingerInfluence.set(name, fingerInfluence.get(name) + 1);
              }
              if (active > 1) blendedArmVertices++;
            }
          }
        }
        for (const [name, count] of fingerInfluence) {
          if (count < 6) errors.push(`${id}: ${name} has no authored finger volume`);
        }
        if (blendedArmVertices < 20) errors.push(`${id}: arms have no continuous two-bone deformation bands`);
      }
    }
  }

  // ★ `batch2Status` IS RETIRED, AND THE REASON IS THAT IT COULD ONLY EVER HOLD
  // ONE VALUE.
  //
  // It read: if anything is not `approved`, `batch2Status` must be `'paused'`.
  // `pending` counts `candidate` too, so the field was pinned to `'paused'`
  // until all thirty characters were approved — at which point there is no batch
  // 2 left to pause. A flag with one reachable value is not a gate; it is a
  // sentence from the playbook copied into a test, and it read as protection
  // that was not there.
  //
  // What it never did was stop parallel work, which is what everyone believed it
  // did. `baseline` is the registry's authored set, so registering a new kid
  // makes them a baseline member rather than an `extra`, and the serialization
  // rule this was standing in for lived only in the playbook's prose. That rule
  // is now deliberately changed (batches of five), and the protection it was
  // reaching for — that a character cannot be called finished on stale or
  // unmeasured evidence — is enforced above, per character, by the board hash
  // and the measurement record.
  //
  // The `extras` check stays: a production receipt for a character with no
  // registry entry is a file nothing can render, score or ship.
  const extras = Object.keys(production.characters ?? {}).filter((id) => !baseline.includes(id));
  if (extras.length) errors.push(`production receipts with no registry entry: ${extras.join(',')}`);
  return errors;
}

describe('Blender-authored character provenance and fidelity gate', () => {
  it('binds every completed character to its source, concept, runtime and review evidence', () => {
    expect(stateErrors(receipt, fidelity)).toEqual([]);
  });

  it('fires when a procedural export overwrites an authored runtime', () => {
    const broken = structuredClone(receipt);
    broken.characters.mimi_mash.outputSha256 = '0'.repeat(64);
    expect(stateErrors(broken, fidelity)).toContain('mimi_mash: runtime hash differs');
  });

  it('fires when a required visual category disappears', () => {
    const broken = structuredClone(fidelity);
    delete broken.characters.mimi_mash.categories.hairMass;
    expect(stateErrors(receipt, broken)).toContain('mimi_mash: fidelity categories differ from the required set');
  });

  // ★ Abstention is for a category with no subject, and it is not a back door.
  // Broken three ways, because the rule has three edges: only this category,
  // only this kind of character, and never as a substitute for a passing score.
  it('refuses an abstention in a category that always has a subject', () => {
    const broken = structuredClone(fidelity);
    broken.characters.tank.categories.clothingConstruction.score = null;
    expect(stateErrors(receipt, broken)).toContain(
      'tank: clothingConstruction may not abstain — only hairMass, and only for a bald character',
    );
  });

  it('refuses an abstention on hair for a character who has hair', () => {
    const broken = structuredClone(fidelity);
    broken.characters.nostrike.categories.hairMass.score = null;
    expect(stateErrors(receipt, broken)).toContain(
      'nostrike: hairMass may not abstain — only hairMass, and only for a bald character',
    );
  });

  // ⚠️ ABSTAINING DOES NOT BLOCK APPROVAL, AND MUST NOT — requiring hairMass
  // >= 4 from a character with no hair would make every bald kid permanently
  // unapprovable. What it must not do is launder the categories that DO have a
  // subject, so that is what this pins: hair abstained, one real category
  // short, approval still refused.
  it('does not let an abstention launder the categories that do have a subject', () => {
    const broken = structuredClone(fidelity);
    broken.characters.tank.status = 'approved';
    for (const [name, category] of Object.entries(broken.characters.tank.categories)) {
      category.score = name === 'hairMass' ? null : 5;
    }
    broken.characters.tank.categories.faceExpressionRead.score = 3;
    expect(stateErrors(receipt, broken)).toContain('tank: approved with faceExpressionRead below 4/5');
  });

  it('fires on a production receipt for a character the registry does not know', () => {
    const broken = structuredClone(receipt);
    broken.characters.not_a_kid = structuredClone(broken.characters.nostrike);
    expect(stateErrors(broken, fidelity)).toContain('production receipts with no registry entry: not_a_kid');
  });

  // ★ The Mimi failure, mechanised: scores that outlive the asset they describe.
  it('does not let the six scores float free of the board they were read off', () => {
    const broken = structuredClone(fidelity);
    broken.characters.nostrike.scoredBoardSha256 = '0'.repeat(64);
    expect(stateErrors(receipt, broken)).toContain(
      'nostrike: the six scores are not bound to the current fidelity board',
    );
  });

  it('refuses a scored character with no measure:fidelity run behind it', () => {
    const broken = structuredClone(fidelity);
    delete broken.characters.nostrike.measuredFidelity;
    expect(stateErrors(receipt, broken)).toContain(
      'nostrike: no measure:fidelity run recorded — run it before scoring §3',
    );
  });

  it('refuses a measurement taken against another character’s board', () => {
    const broken = structuredClone(fidelity);
    broken.characters.nostrike.measuredFidelity.board = 'tank-fidelity-review.png';
    expect(stateErrors(receipt, broken)).toContain(
      'nostrike: the measure:fidelity run cites a different board than the review',
    );
  });

  it('refuses an approval with no human reviewer behind it', () => {
    // ★ THE FIXTURE MUST CLAIM APPROVAL, because no character on the roster
    // currently does. Junebug was demoted to `candidate` when the runtime
    // face-atlas fix and the tone-mapping change re-rendered every hero and
    // invalidated the board her approval was bound to. This rule is only
    // reachable on an `approved` record, so the fixture asserts one — otherwise
    // the demotion would have silently deleted the test along with the status.
    const broken = structuredClone(fidelity);
    broken.characters.nostrike.status = 'approved';
    broken.characters.nostrike.approvedBy = 'Someone';
    broken.characters.nostrike.approvedAt = '2026-08-14';
    delete broken.characters.nostrike.humanReview;
    expect(stateErrors(receipt, broken)).toContain(
      'nostrike: approval requires a humanReview reviewer and verdict',
    );
  });

  // The four mesh rules used to be keyed on `id === 'nostrike'`. Promoting a
  // procedural bootstrap without sculpting it must now fail on the GEOMETRY,
  // rather than pass because it is not Junebug.
  //
  // ⚠️ Asserting merely that some `<id>:` error appears would be tautological:
  // flipping the status also trips the hero, animation, board-hash and
  // measurement clauses, so the test would stay green with the mesh rules
  // deleted. It names them.
  //
  // ★ AND THE FIXTURE IS CHOSEN AT RUN TIME, BECAUSE A COUNTEREXAMPLE STOPS
  // BEING ONE. This test first used Tank, and sculpting Tank broke it — his GLB
  // now declares the identity palette and the team accent, so two of the four
  // errors correctly stopped firing and the assertion failed. That is the same
  // class as approving Junebug silently disarming the approver test: a rule's
  // guinea pig graduates, and the rule quietly stops being exercised.
  //
  // So the fixture is whichever character still lacks the declarations. When
  // none is left, that is not a failure to paper over — it means every authored
  // character satisfies the rules and this test has nothing left to prove, and
  // it should be deleted in favour of the green path rather than kept alive
  // with a synthetic fixture nobody ships.
  it('applies the finished-work mesh rules to any character that claims to be finished', () => {
    const unsculpted = baseline.find((id) => {
      const output = join(modelsDir, `kid_${id}.glb`);
      if (!existsSync(output)) return false;
      const materials = readGlb(output).json.materials ?? [];
      return materials.find((m) => m.name === 'M_Uniform')?.extras?.recessIdentityPalette !== true;
    });
    if (!unsculpted) {
      expect(baseline.length).toBeGreaterThan(0);
      return; // every authored character now declares them — see the note above.
    }
    const broken = structuredClone(fidelity);
    broken.characters[unsculpted].status = 'candidate';
    const errors = stateErrors(receipt, broken);
    expect(errors).toContain(`${unsculpted}: signature palette is not declared on M_Uniform`);
    expect(errors).toContain(`${unsculpted}: no deliberate team-accent surface is declared`);
    expect(errors).toContain(`${unsculpted}: signature wardrobe colour blocks did not survive export`);
    expect(errors).toContain(`${unsculpted}: LeftHandThumb1 has no authored finger volume`);
  });

  // ⚠️ THIS FIXTURE STRIPS THE APPROVAL FIELDS ON PURPOSE. It used to flip
  // `nostrike.status` to 'approved' and rely on that character having no
  // approver — which held only while nobody had approved anyone. Junebug was
  // approved on 2026-08-12 and the assertion silently stopped exercising its
  // own rule: the flip produced no error because the fields were now really
  // there. Deleting them makes the test say what it means, and keeps saying it
  // however many characters get approved later.
  it('does not let a numeric score impersonate human art-direction approval', () => {
    const broken = structuredClone(fidelity);
    broken.characters.nostrike.status = 'approved';
    delete broken.characters.nostrike.approvedBy;
    delete broken.characters.nostrike.approvedAt;
    expect(stateErrors(receipt, broken)).toContain('nostrike: approval requires an explicit human approver and timestamp');
  });

  it('does not let an approval float free of the board it was given on', () => {
    // The other half of the same rule, and it had no test at all: an approver
    // and a date with a stale (or absent) board hash is an approval of
    // something nobody looked at.
    const broken = structuredClone(fidelity);
    broken.characters.nostrike.status = 'approved';
    broken.characters.nostrike.approvedEvidenceSha256 = '0'.repeat(64);
    expect(stateErrors(receipt, broken)).toContain('nostrike: approval is not bound to the current fidelity board');
  });

  it('does not let a sub-4 category ship as approved', () => {
    const broken = structuredClone(fidelity);
    broken.characters.nostrike.status = 'approved';
    broken.characters.nostrike.categories.hairMass.score = 3;
    expect(stateErrors(receipt, broken)).toContain('nostrike: approved with hairMass below 4/5');
  });
});
