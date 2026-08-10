// ---------------------------------------------------------------------------
// Blender-authoritative character delivery.
//
// The .blend is the upstream geometry source. Blender performs the mesh export
// and rebuilds its transient armature in the canonical order supplied directly
// from skeleton.ts. This wrapper then stamps immutable source/concept hashes,
// validates the resulting file with the existing contract, writes a production
// receipt, and only then promotes it into public/v2/models/.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readGlb, writeGlb } from './glb.mjs';
import { checkCharacter, checkContainer, checkSkeleton, makeReport } from './modelRules.mjs';
import { loadContract, RUNTIME_DIR } from './validate-models.mjs';
import { writeManifest } from './models-manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const sourceDir = join(repo, 'assets', 'v2', 'source');
const conceptsDir = join(repo, 'docs', 'v2', 'concepts');
const receiptPath = join(sourceDir, 'character-production.json');
const blenderScript = join(here, 'blender', 'export-authored-character.py');

export const AUTHORED_CHARACTERS = {
  nostrike: {
    name: 'Junebug', source: 'junebug-pilot.blend', concept: 'junebug-turnaround.png',
    traits: ['arrow ponytail', 'athletic piping', 'compact focused face', 'clean joint flow', 'economical ready posture'],
  },
  calls_shot: {
    name: 'Big Talk Theo', source: 'theo-pilot.blend', concept: 'theo-turnaround.png',
    traits: ['oversized cap', 'broad tapered face', 'open varsity jacket', 'confident chest', 'kid-sized swagger'],
  },
  wheelchair_ace: {
    name: 'Zoom Ramirez', source: 'zoom-pilot.blend', concept: 'zoom-turnaround.png',
    traits: ['compact sport chair', 'cambered wheels', 'bright push rims', 'swept spiky crown', 'forward athletic posture'],
  },
  big_lou: {
    name: 'Big Lou', source: 'big-lou-pilot.blend', concept: 'big-lou-turnaround.png',
    traits: ['gentle broad silhouette', 'soft rounded face', 'layered casual shirt', 'relaxed shoulders', 'grounded friendly stance'],
  },
  tank: {
    name: 'Tank', source: 'tank-pilot.blend', concept: 'tank-turnaround.png',
    traits: ['low wide silhouette', 'bald round crown', 'massive tee', 'short planted legs', 'sleepy compact face'],
  },
  mimi_mash: {
    name: 'Mimi Mash', source: 'mimi-mash-pilot.blend', concept: 'mimi-mash-turnaround.png',
    traits: ['dense curly halo', 'proud chin', 'constructed hoodie and pocket', 'strong childlike forearms', 'spring-loaded stance'],
  },
};

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function failReport(report) {
  return report.items.filter((item) => item.severity === 'fail').map((item) => `[${item.rule}] ${item.message}`);
}

const ACCESSOR_PARTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

function readComponent(buffer, at, type) {
  if (type === 5120) return buffer.readInt8(at);
  if (type === 5121) return buffer.readUInt8(at);
  if (type === 5122) return buffer.readInt16LE(at);
  if (type === 5123) return buffer.readUInt16LE(at);
  if (type === 5125) return buffer.readUInt32LE(at);
  if (type === 5126) return buffer.readFloatLE(at);
  throw new Error(`unsupported accessor component type ${type}`);
}

function writeComponent(buffer, at, type, value) {
  if (type === 5120) buffer.writeInt8(value, at);
  else if (type === 5121) buffer.writeUInt8(value, at);
  else if (type === 5122) buffer.writeInt16LE(value, at);
  else if (type === 5123) buffer.writeUInt16LE(value, at);
  else if (type === 5125) buffer.writeUInt32LE(value, at);
  else if (type === 5126) buffer.writeFloatLE(value, at);
  else throw new Error(`unsupported accessor component type ${type}`);
}

function accessorLayout(json, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.bufferView === undefined || accessor.sparse) {
    throw new Error(`accessor ${accessorIndex} cannot be normalized in place`);
  }
  const view = json.bufferViews?.[accessor.bufferView];
  const parts = ACCESSOR_PARTS[accessor.type];
  const bytes = COMPONENT_BYTES[accessor.componentType];
  if (!view || !parts || !bytes) throw new Error(`accessor ${accessorIndex} has an unsupported layout`);
  return {
    accessor,
    parts,
    bytes,
    start: (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
    stride: view.byteStride ?? parts * bytes,
  };
}

/** Preserve deformation while replacing Blender's skin order with the contract. */
function normalizeSkinOrder(gltf, boneNames) {
  const skin = gltf.json.skins?.[0];
  if (!skin) throw new Error('Blender export has no skin');
  const oldNames = skin.joints.map((node) => gltf.json.nodes[node]?.name);
  const oldByName = new Map(oldNames.map((name, index) => [name, index]));
  const nodeByName = new Map(gltf.json.nodes.map((node, index) => [node.name, index]));
  const missing = boneNames.filter((name) => !oldByName.has(name));
  if (missing.length || oldNames.length !== boneNames.length) {
    throw new Error(`Blender skin differs from the contract; missing=${missing.join(', ')} joints=${oldNames.length}`);
  }
  const oldToNew = oldNames.map((name) => boneNames.indexOf(name));
  const bin = Buffer.from(gltf.bin);

  const jointAccessors = new Set();
  for (const mesh of gltf.json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.extensions?.KHR_draco_mesh_compression) {
        throw new Error('authored normalization requires uncompressed JOINTS_0; disable Draco in Blender export');
      }
      if (primitive.attributes?.JOINTS_0 !== undefined) jointAccessors.add(primitive.attributes.JOINTS_0);
    }
  }
  for (const accessorIndex of jointAccessors) {
    const layout = accessorLayout(gltf.json, accessorIndex);
    for (let row = 0; row < layout.accessor.count; row++) {
      for (let part = 0; part < layout.parts; part++) {
        const at = layout.start + row * layout.stride + part * layout.bytes;
        const oldIndex = readComponent(bin, at, layout.accessor.componentType);
        const next = oldToNew[oldIndex];
        if (next === undefined || next < 0) throw new Error(`JOINTS_0 refers to unknown skin index ${oldIndex}`);
        writeComponent(bin, at, layout.accessor.componentType, next);
      }
    }
  }

  if (skin.inverseBindMatrices !== undefined) {
    const layout = accessorLayout(gltf.json, skin.inverseBindMatrices);
    if (layout.parts !== 16 || layout.accessor.componentType !== 5126 || layout.accessor.count !== boneNames.length) {
      throw new Error('inverseBindMatrices is not one float MAT4 per canonical bone');
    }
    const matrices = Array.from({ length: layout.accessor.count }, (_, row) =>
      Buffer.from(bin.subarray(layout.start + row * layout.stride, layout.start + row * layout.stride + 64))
    );
    for (let oldIndex = 0; oldIndex < matrices.length; oldIndex++) {
      matrices[oldIndex].copy(bin, layout.start + oldToNew[oldIndex] * layout.stride);
    }
  }
  skin.joints = boneNames.map((name) => nodeByName.get(name));
  return bin;
}

/** Compact Blender's float vertex colours/weights into glTF-normalized bytes. */
function quantizePaletteAndWeights(gltf, sourceBin) {
  const wanted = new Map();
  for (const mesh of gltf.json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      for (const semantic of ['COLOR_0', 'WEIGHTS_0']) {
        const accessorIndex = primitive.attributes?.[semantic];
        if (accessorIndex !== undefined) wanted.set(accessorIndex, semantic);
      }
    }
  }

  const references = new Map();
  const note = (index) => references.set(index, (references.get(index) ?? 0) + 1);
  for (const accessor of gltf.json.accessors ?? []) if (accessor.bufferView !== undefined) note(accessor.bufferView);
  for (const image of gltf.json.images ?? []) if (image.bufferView !== undefined) note(image.bufferView);

  const replacements = new Map();
  for (const [accessorIndex, semantic] of wanted) {
    const layout = accessorLayout(gltf.json, accessorIndex);
    if (layout.accessor.componentType !== 5126 || layout.parts !== 4) continue;
    if (references.get(layout.accessor.bufferView) !== 1) {
      throw new Error(`${semantic} accessor ${accessorIndex} shares its bufferView and cannot be compacted safely`);
    }
    const compact = Buffer.alloc(layout.accessor.count * 4);
    for (let row = 0; row < layout.accessor.count; row++) {
      const values = Array.from({ length: 4 }, (_, part) => {
        const at = layout.start + row * layout.stride + part * layout.bytes;
        return Math.max(0, Math.min(1, readComponent(sourceBin, at, 5126)));
      });
      let bytes = values.map((value) => Math.round(value * 255));
      if (semantic === 'WEIGHTS_0') {
        const sum = bytes.reduce((total, value) => total + value, 0);
        let largest = 0;
        for (let part = 1; part < 4; part++) if (bytes[part] > bytes[largest]) largest = part;
        bytes[largest] = Math.max(0, Math.min(255, bytes[largest] + 255 - sum));
      }
      for (let part = 0; part < 4; part++) compact[row * 4 + part] = bytes[part];
    }
    replacements.set(layout.accessor.bufferView, compact);
    layout.accessor.componentType = 5121;
    layout.accessor.normalized = true;
    delete layout.accessor.min;
    delete layout.accessor.max;
    const view = gltf.json.bufferViews[layout.accessor.bufferView];
    view.byteLength = compact.length;
    delete view.byteStride;
  }

  const chunks = [];
  let at = 0;
  for (const [index, view] of (gltf.json.bufferViews ?? []).entries()) {
    const bytes = replacements.get(index) ?? Buffer.from(sourceBin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
    view.byteOffset = at;
    view.buffer = 0;
    chunks.push(bytes);
    at += bytes.length;
    const padding = (4 - (at % 4)) % 4;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      at += padding;
    }
  }
  return Buffer.concat(chunks);
}

function readReceipts() {
  if (!existsSync(receiptPath)) return { version: 1, characters: {} };
  return JSON.parse(readFileSync(receiptPath, 'utf8'));
}

export async function exportAuthoredCharacter(id, { blender = process.env.BLENDER ?? 'blender' } = {}) {
  const character = AUTHORED_CHARACTERS[id];
  if (!character) throw new Error(`unknown authored character "${id}"`);
  const source = join(sourceDir, character.source);
  const concept = join(conceptsDir, character.concept);
  if (!existsSync(source)) throw new Error(`missing Blender source ${source}`);
  if (!existsSync(concept)) throw new Error(`missing approved turnaround ${concept}`);

  const contract = await loadContract();
  const work = mkdtempSync(join(tmpdir(), `recess-authored-${id}-`));
  const contractPath = join(work, 'contract.json');
  const intermediate = join(work, `kid_${id}.glb`);
  const promoted = join(work, `kid_${id}.promoted.glb`);
  writeFileSync(contractPath, JSON.stringify({ boneNames: contract.BONE_NAMES }));

  try {
    const run = spawnSync(blender, [
      '--background', source,
      '--python', blenderScript,
      '--', '--id', id, '--contract', contractPath, '--output', intermediate,
    ], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (run.status !== 0) {
      throw new Error(`Blender export failed\n${run.stdout}\n${run.stderr}`.trim());
    }
    if (!existsSync(intermediate)) {
      throw new Error(`Blender did not write ${basename(intermediate)}\n${run.stdout}\n${run.stderr}`.trim());
    }

    const gltf = readGlb(intermediate);
    const normalizedBin = normalizeSkinOrder(gltf, contract.BONE_NAMES);
    const compactBin = quantizePaletteAndWeights(gltf, normalizedBin);
    gltf.json.asset = {
      version: '2.0',
      generator: `recess-sports Blender-authored character pipeline (${id})`,
      extras: {
        recessAuthoring: {
          version: 1,
          characterId: id,
          source: character.source,
          sourceSha256: sha(source),
          concept: character.concept,
          conceptSha256: sha(concept),
          definingTraits: character.traits,
        },
      },
    };
    writeGlb(promoted, gltf.json, compactBin.length ? [compactBin] : []);

    const normalized = readGlb(promoted);
    const report = makeReport();
    checkContainer(normalized, report, { maxBytes: 400 * 1024 });
    checkSkeleton(normalized, contract, report);
    checkCharacter(normalized, contract, report, id);
    const failures = failReport(report);
    if (failures.length) throw new Error(`authored export failed the asset contract:\n${failures.join('\n')}`);

    const output = join(RUNTIME_DIR, `kid_${id}.glb`);
    const receipts = readReceipts();
    receipts.characters[id] = {
      source: character.source,
      sourceSha256: sha(source),
      concept: character.concept,
      conceptSha256: sha(concept),
      output: basename(output),
      outputSha256: sha(promoted),
      definingTraits: character.traits,
    };
    writeFileSync(receiptPath, `${JSON.stringify(receipts, null, 2)}\n`);
    renameSync(promoted, output);
    return { output, bytes: normalized.bytes, report };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) throw new Error('pass one or more authored character ids');
  for (const id of ids) {
    const result = await exportAuthoredCharacter(id);
    console.log(`✓ ${basename(result.output)} ${(result.bytes / 1024).toFixed(0)}KB — Blender source promoted`);
  }
  writeManifest();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  });
}
