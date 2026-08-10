// ---------------------------------------------------------------------------
// ★ A Blender source that is downstream of its runtime GLB is not a source.
//
// This gate binds each finished delivery to the exact .blend and approved
// turnaround that produced it, requires a six-category side-by-side review,
// and keeps Batch 2 paused while any of the six already-produced characters is
// still labelled needs-polish. It also makes `export:roster-kid` unable to
// silently overwrite an authored character: the runtime hash goes red.
//
// Broken deliberately while writing the gate: changing Mimi's receipt hash
// reported "runtime hash differs"; removing hairMass reported the missing
// category; setting batch2Status to active while Tank needed polish reported
// the unsafe unlock. The tests below retain those mutations as fixtures.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { readAccessor, readGlb } from './glb.mjs';
import { AUTHORED_CHARACTERS } from './export-authored-character.mjs';

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

function stateErrors(production, reviews) {
  const errors = [];
  const expectedCategories = reviews.categories ?? [];
  const pending = [];
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
    if (!existsSync(join(conceptsDir, review.evidence ?? ''))) errors.push(`${id}: fidelity evidence is missing`);
    if (review.status === 'candidate' || review.status === 'approved') {
      if (!existsSync(join(conceptsDir, review.heroEvidence ?? ''))) errors.push(`${id}: authored-model hero evidence is missing`);
      const animationEvidence = review.animationEvidence ?? [];
      if (animationEvidence.length < 2 || animationEvidence.some((name) => !existsSync(join(conceptsDir, name)))) {
        errors.push(`${id}: run/contact authored-model evidence is missing`);
      }
    }

    const categoryNames = Object.keys(review.categories ?? {}).sort();
    if (categoryNames.join('|') !== [...expectedCategories].sort().join('|')) {
      errors.push(`${id}: fidelity categories differ from the required set`);
    }
    for (const name of expectedCategories) {
      const category = review.categories?.[name];
      if (!category || !Number.isInteger(category.score) || category.score < 1 || category.score > 5 || !category.note?.trim()) {
        errors.push(`${id}: ${name} needs a 1-5 score and review note`);
      }
      if (review.status === 'approved' && category?.score < 4) {
        errors.push(`${id}: approved with ${name} below 4/5`);
      }
    }
    if (review.status === 'approved') {
      const evidencePath = join(conceptsDir, review.evidence ?? '');
      if (!review.approvedBy?.trim() || !review.approvedAt?.trim()) {
        errors.push(`${id}: approval requires an explicit human approver and timestamp`);
      }
      if (!existsSync(evidencePath) || review.approvedEvidenceSha256 !== sha(evidencePath)) {
        errors.push(`${id}: approval is not bound to the current fidelity board`);
      }
    }
    if (review.status !== 'approved') pending.push(id);

    if (existsSync(output)) {
      const gltf = readGlb(output);
      const authored = gltf.json.asset?.extras?.recessAuthoring;
      if (authored?.sourceSha256 !== record.sourceSha256 || authored?.conceptSha256 !== record.conceptSha256) {
        errors.push(`${id}: GLB provenance differs from its receipt`);
      }
      if (id === 'nostrike') {
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
      }
    }
  }

  const extras = Object.keys(production.characters ?? {}).filter((id) => !baseline.includes(id));
  if ((pending.length || extras.length) && reviews.batch2Status !== 'paused') {
    errors.push(`Batch 2 must stay paused; pending=${pending.join(',')} extra=${extras.join(',')}`);
  }
  if (extras.length && pending.length) errors.push(`new characters exported before retrofit approval: ${extras.join(',')}`);
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

  it('fires when Batch 2 is unlocked before the retrofit is approved', () => {
    const broken = structuredClone(fidelity);
    broken.batch2Status = 'active';
    expect(stateErrors(receipt, broken).some((error) => error.startsWith('Batch 2 must stay paused'))).toBe(true);
  });

  it('does not let a numeric score impersonate human art-direction approval', () => {
    const broken = structuredClone(fidelity);
    broken.characters.nostrike.status = 'approved';
    expect(stateErrors(receipt, broken)).toContain('nostrike: approval requires an explicit human approver and timestamp');
  });
});
