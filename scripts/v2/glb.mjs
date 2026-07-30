// ---------------------------------------------------------------------------
// glTF 2.0 binary (.glb) reader and writer. PURE — no dependencies, no three.
//
// Hand-rolled rather than pulled from a library, for the same reason
// `scripts/measure/lib.js` is: the validator has to be the thing that DOES NOT
// lie about a delivered file. A loader designed for playback is built to be
// forgiving — it silently normalises, it fills in defaults, it ignores what it
// does not understand — and every one of those kindnesses is a rejection the
// validator would fail to make. Reading the bytes ourselves means "the file
// says X" and "our loader inferred X" are never confused.
//
// The writer exists because the reader already did the hard part (accessors,
// buffer views, chunk framing), and because `skeleton_recess_v1.glb` — the rig
// the animator works from — must be GENERATED from `skeleton.ts` rather than
// hand-authored. A rig that can drift from its own spec is the exact failure
// this whole apparatus exists to prevent.
//
// Scope is deliberate: enough glTF to express a skeleton and to inspect one.
// Draco and KTX2 payloads are detected and reported, never decoded.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';

const MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

/** glTF component types -> [TypedArray, bytes]. */
const COMPONENT = {
  5120: [Int8Array, 1],
  5121: [Uint8Array, 1],
  5122: [Int16Array, 2],
  5123: [Uint16Array, 2],
  5125: [Uint32Array, 4],
  5126: [Float32Array, 4],
};

const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

// --- Reading -----------------------------------------------------------------

/**
 * Parse a .glb into `{ json, bin }`.
 *
 * Throws with a specific message on anything malformed. A validator that
 * reports "could not read the file" tells the artist nothing; "chunk 0 is not
 * JSON" tells them their exporter wrote a .gltf and renamed it.
 */
export function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.length < 12) throw new Error('too short to be a .glb (under 12 bytes)');

  const magic = buf.readUInt32LE(0);
  if (magic !== MAGIC) {
    const looksJson = buf[0] === 0x7b; // '{'
    throw new Error(
      looksJson
        ? 'this is a text .gltf, not a binary .glb — re-export as glTF Binary'
        : `not a .glb (magic ${magic.toString(16)})`
    );
  }
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error(`glTF version ${version}, expected 2`);

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buf.length) throw new Error(`chunk at ${offset} runs past the end of the file`);
    if (type === CHUNK_JSON) json = JSON.parse(buf.subarray(start, end).toString('utf8'));
    else if (type === CHUNK_BIN) bin = buf.subarray(start, end);
    offset = end + ((4 - (end % 4)) % 4);
  }
  if (!json) throw new Error('no JSON chunk');
  return { json, bin, bytes: buf.length };
}

/** Read an accessor into a plain array of numbers (flat, component-major). */
export function readAccessor(gltf, index) {
  const { json, bin } = gltf;
  const accessor = json.accessors?.[index];
  if (!accessor) throw new Error(`no accessor ${index}`);
  if (accessor.sparse) throw new Error(`accessor ${index} is sparse — unsupported`);

  const parts = NUM_COMPONENTS[accessor.type];
  const spec = COMPONENT[accessor.componentType];
  if (!parts || !spec) throw new Error(`accessor ${index} has an unknown type`);
  const [Ctor, size] = spec;

  const count = accessor.count * parts;
  if (accessor.bufferView === undefined) return new Array(count).fill(0);

  const view = json.bufferViews[accessor.bufferView];
  if (!bin) throw new Error('accessor needs the BIN chunk, which is absent');

  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? parts * size;
  const packed = stride === parts * size;

  if (packed) {
    // The common case: one contiguous read.
    const start = bin.byteOffset + base;
    return Array.from(new Ctor(bin.buffer.slice(start, start + count * size)));
  }
  // Interleaved: walk element by element.
  const out = new Array(count);
  for (let i = 0; i < accessor.count; i++) {
    const at = bin.byteOffset + base + i * stride;
    const el = new Ctor(bin.buffer.slice(at, at + parts * size));
    for (let c = 0; c < parts; c++) out[i * parts + c] = el[c];
  }
  return out;
}

/**
 * The scene's node tree as `{ name, parent, translation, rotation, scale,
 * children, index }`, in file order.
 *
 * Order matters: the asset contract makes bone ORDER part of the spec, so the
 * validator has to see the file's order rather than a sorted or de-duplicated
 * version of it.
 */
export function readNodes(gltf) {
  const nodes = (gltf.json.nodes ?? []).map((n, index) => ({
    index,
    name: n.name ?? `node_${index}`,
    translation: n.translation ?? [0, 0, 0],
    rotation: n.rotation ?? [0, 0, 0, 1],
    scale: n.scale ?? [1, 1, 1],
    matrix: n.matrix,
    mesh: n.mesh,
    skin: n.skin,
    camera: n.camera,
    children: n.children ?? [],
    parent: null,
  }));
  for (const n of nodes) for (const c of n.children) if (nodes[c]) nodes[c].parent = n.index;
  return nodes;
}

/** World-space translation of every node, by name. Ignores rotation/scale —
 *  a bind pose that rotates or scales a bone is itself a contract violation
 *  and is reported separately. */
export function worldTranslations(nodes) {
  const world = new Map();
  const resolve = (n) => {
    if (world.has(n.name)) return world.get(n.name);
    const parent = n.parent === null ? [0, 0, 0] : resolve(nodes[n.parent]);
    const p = [parent[0] + n.translation[0], parent[1] + n.translation[1], parent[2] + n.translation[2]];
    world.set(n.name, p);
    return p;
  };
  for (const n of nodes) resolve(n);
  return world;
}

/**
 * Animations, decoded into per-channel keyframes:
 * `{ name, channels: [{ node, path, times, values }] }`.
 */
export function readAnimations(gltf) {
  return (gltf.json.animations ?? []).map((anim, i) => ({
    name: anim.name ?? `animation_${i}`,
    channels: (anim.channels ?? [])
      .filter((ch) => ch.target?.node !== undefined && anim.samplers?.[ch.sampler])
      .map((ch) => {
        const sampler = anim.samplers[ch.sampler];
        return {
          node: ch.target.node,
          path: ch.target.path,
          interpolation: sampler.interpolation ?? 'LINEAR',
          times: readAccessor(gltf, sampler.input),
          values: readAccessor(gltf, sampler.output),
        };
      }),
  }));
}

/** Triangle count of a mesh, summed over its primitives. */
export function triangleCount(gltf, meshIndex) {
  const mesh = gltf.json.meshes?.[meshIndex];
  if (!mesh) return 0;
  let tris = 0;
  for (const prim of mesh.primitives ?? []) {
    // mode 4 is TRIANGLES; the contract does not permit anything else, and a
    // strip counted as a list would understate the budget.
    const mode = prim.mode ?? 4;
    const count =
      prim.indices !== undefined
        ? gltf.json.accessors[prim.indices].count
        : (gltf.json.accessors[prim.attributes.POSITION]?.count ?? 0);
    tris += mode === 4 ? count / 3 : Math.max(0, count - 2);
  }
  return tris;
}

// --- Writing ------------------------------------------------------------------

/**
 * Build a .glb from a glTF JSON object plus binary chunks.
 *
 * `chunks` is an array of Buffers; each returns its byteOffset so the caller
 * can point bufferViews at it. Both chunks are padded to 4 bytes, which the
 * spec requires and which importers enforce inconsistently — the ones that
 * don't produce silent corruption further downstream.
 */
export function writeGlb(path, json, chunks = []) {
  const parts = [];
  let offset = 0;
  const offsets = chunks.map((c) => {
    const at = offset;
    parts.push(c);
    offset += c.length;
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      parts.push(Buffer.alloc(pad));
      offset += pad;
    }
    return at;
  });

  const bin = Buffer.concat(parts);
  if (bin.length) json.buffers = [{ byteLength: bin.length }];

  let jsonText = JSON.stringify(json);
  while (jsonText.length % 4 !== 0) jsonText += ' '; // pad with SPACE, per spec
  const jsonBuf = Buffer.from(jsonText, 'utf8');

  const total = 12 + 8 + jsonBuf.length + (bin.length ? 8 + bin.length : 0);
  const out = Buffer.alloc(total);
  out.writeUInt32LE(MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(CHUNK_JSON, 16);
  jsonBuf.copy(out, 20);
  if (bin.length) {
    const at = 20 + jsonBuf.length;
    out.writeUInt32LE(bin.length, at);
    out.writeUInt32LE(CHUNK_BIN, at + 4);
    bin.copy(out, at + 8);
  }

  writeFileSync(path, out);
  return { bytes: total, binOffsets: offsets };
}

/** Little-endian Float32 buffer from an array of numbers. */
export function f32(values) {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  return buf;
}

/** Little-endian Uint16 buffer. */
export function u16(values) {
  const buf = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => buf.writeUInt16LE(v, i * 2));
  return buf;
}

/** Min/max per component, which glTF REQUIRES on POSITION accessors. */
export function bounds(values, parts) {
  const min = new Array(parts).fill(Infinity);
  const max = new Array(parts).fill(-Infinity);
  for (let i = 0; i < values.length; i += parts) {
    for (let c = 0; c < parts; c++) {
      min[c] = Math.min(min[c], values[i + c]);
      max[c] = Math.max(max[c], values[i + c]);
    }
  }
  return { min, max };
}
