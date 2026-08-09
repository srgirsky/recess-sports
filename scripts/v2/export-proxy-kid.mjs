// ---------------------------------------------------------------------------
// ★ Emit a CONTRACT-LEGAL `kid_<id>.glb` from the primitive proxy.
//
//   npm run export:proxy-kid            a representative handful
//   npm run export:proxy-kid -- all     all 30
//   npm run export:proxy-kid -- junebug moose
//
// WHY THIS EXISTS. `docs/v2/asset-contract.md` §4 describes a file nobody has
// ever produced. The validator's character rules — LOD nodes, triangle budgets,
// the four material slots, the greyscale `M_Uniform` — had no real file to run
// against, only two synthetic fixtures built to fail. And the whole runtime
// half of §4 (the loader, the LOD switch, the slot rebinding, the team-colour
// multiply) had nothing to load. Both were specifications of a thing that did
// not exist yet, which is the state in which specifications quietly stop being
// true.
//
// So: the same move `proceduralClips.ts` makes for the animation library, and
// `export-skeleton.mjs` makes for the rig. The proxy already describes 30
// characters on the canonical skeleton; this writes that description out in the
// delivery format, and a commissioned model then replaces it kid by kid with no
// code change anywhere. Nothing downstream waits on the modeller.
//
// IT IS A STAND-IN, NOT A FORGERY. It is emitted to `public/v2/models/` (the
// runtime directory) and NOT to `assets/v2/` (the artist's directory and the
// validation inbox), so a stand-in can never be mistaken for a delivery. What
// it is faithful about is the CONTRACT — bone table, LOD structure, slot names,
// greyscale uniform — and it is deliberately not faithful about the art.
//
// NODE >= 22.6, because it imports the proxy straight out of TypeScript. Same
// bargain as `validate-models.mjs`: the character has exactly one description.
// ---------------------------------------------------------------------------

import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bounds, f32, u16, writeGlb } from './glb.mjs';
import { writeManifest } from './models-manifest.mjs';
import { makeFaceAtlasPng, makeWhitePng } from './face-atlas.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');

export const RUNTIME_DIR = join(repo, 'public', 'v2', 'models');

/**
 * ★ The three LOD tessellation multipliers.
 *
 * MEASURED, not chosen: they are the values at which a proxy's triangle count
 * lands under §4's per-level budgets (7,000 / 3,000 / 1,200) for every kid on
 * the roster — the widest head, the biggest afro and the spiky cones included,
 * since those are what move the count. The script re-measures on every run and
 * REFUSES to write a file that busts a budget, so these cannot rot into a lie
 * the way a comment could.
 */
export const LOD_DETAIL = [1.0, 0.62, 0.34];

/**
 * Roster files also carry UVs and a face atlas, so their geometry budget has
 * to leave room under the same 400KB delivery cap. At the game's closest
 * camera 0.82 still gives heads 11x8 sphere segments; more tessellation
 * changes neither the silhouette nor a 2.5px outline, it only inflates bytes.
 */
// Leaves enough of the 400KB delivery cap for moulded clothing/shoe/face
// detail on the densest hair and accessory combinations, rather than making
// those three characters special-case the shared production path.
export const ROSTER_LOD_DETAIL = [0.72, 0.44, 0.25];

/** §4's per-level triangle budgets, nearest first. */
export const LOD_BUDGET = [7000, 3000, 1200];

/**
 * A default sample chosen for SPREAD, not for favourites: the widest head
 * (`the_prof`), the biggest afro (`grizz`), the wheelchair special case
 * (`wheelchair_ace`), the smallest kid (`sprout`) and the largest (`moose`).
 * If the exporter holds for these five it holds for the roster — and every one
 * of them is a shape the LOD budgets are decided by.
 */
export const SAMPLE_IDS = ['moose', 'sprout', 'the_prof', 'grizz', 'wheelchair_ace'];

/** sRGB hex -> linear float triple, which is what glTF `baseColorFactor` is. */
function linearFromHex(hex) {
  const srgb = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => c / 255);
  return srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
}

/** Rec.709 luminance of an sRGB hex, 0-1. Used only for the shade ratio. */
function luminance(hex) {
  const [r, g, b] = linearFromHex(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * ★ The greyscale slot bases, and the one contract rule in this file that is
 * not merely structural.
 *
 * `M_Uniform` MUST be greyscale (§4): team colour is a runtime multiply, and a
 * model that bakes a jersey colour cannot wear the team that drafts it. 0.85
 * rather than 1.0 so the multiply lands near the true jersey tone instead of
 * washing it out — a white base multiplied by a mid-saturation team colour
 * gives back exactly the team colour, which reads flat next to skin and hair
 * that carry their own value.
 */
const UNIFORM_GREY = 0.85;

const SLOT_ORDER = ['M_Body', 'M_Uniform', 'M_Hair', 'M_Accessory'];

export async function loadProxySpec() {
  const proxy = await import(join(repo, 'src', 'v2', 'render', 'ProxyCharacter.ts'));
  const registry = await import(join(repo, 'src', 'v2', 'render', 'materials', 'registry.ts'));
  const skeleton = await import(join(repo, 'src', 'v2', 'render', 'skeleton.ts'));
  const characters = await import(join(repo, 'src', 'data', 'characters.ts'));
  return { ...proxy, ...registry, ...skeleton, ...characters };
}

/**
 * Build the three LOD meshes for one character, as plain arrays.
 *
 * Everything comes out of `ProxyCharacter` itself — the geometry AND the
 * `slots` index spans — so there is no second description of what a kid looks
 * like or of which triangles are jersey.
 */
function buildLevels(spec, character, fidelity = 'proxy') {
  const { ProxyCharacter, withDetail } = spec;
  const levels = fidelity === 'roster' ? ROSTER_LOD_DETAIL : LOD_DETAIL;

  return levels.map((detail, level) => {
    const kid = withDetail(detail, () => new ProxyCharacter(character.visual, { fidelity }));
    const g = kid.mesh.geometry;
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    const uv = g.attributes.uv.array;
    const col = g.attributes.color.array;
    const joints = g.attributes.skinIndex.array;
    const weights = g.attributes.skinWeight.array;
    const index = g.index.array;

    // Group each slot's index spans into one contiguous run. Vertices stay
    // shared across all four primitives — a slot is a different set of
    // TRIANGLES, not a different set of points.
    const perSlot = new Map(SLOT_ORDER.map((s) => [s, []]));
    for (const { slot, indexStart, indexCount } of kid.slots) {
      const into = perSlot.get(slot);
      if (!into) throw new Error(`export-proxy-kid: unknown slot "${slot}"`);
      for (let i = 0; i < indexCount; i++) into.push(index[indexStart + i]);
    }

    const triangles = index.length / 3;
    if (triangles > LOD_BUDGET[level]) {
      // Refuse rather than ship. A "LOD2" over its budget is LOD1 wearing a
      // different name, and the whole point of the level is the budget.
      throw new Error(
        `${character.id} LOD${level}: ${triangles} triangles over the ${LOD_BUDGET[level]} budget ` +
          `at detail ${detail}. Lower LOD_DETAIL[${level}] — do not raise the budget, it is the contract.`
      );
    }
    if (pos.length / 3 > 65535) {
      throw new Error(`${character.id} LOD${level}: ${pos.length / 3} vertices needs 32-bit indices`);
    }

    kid.dispose();
    return { pos, nor, uv, col, joints, weights, perSlot, triangles };
  });
}

/**
 * COLOR_0 as a per-vertex SHADE, relative to the slot's own base colour.
 *
 * The proxy carries every part's real colour in its vertex-colour attribute,
 * which cannot survive into a delivered model: the whole team-identity system
 * is a runtime multiply onto a greyscale jersey, and skin/hair colour arrive as
 * material colours. But dropping the attribute entirely would flatten the kid
 * to four colours — no dark shoes, no white headband — and the stand-in exists
 * partly so a delivery can be A/B'd against it.
 *
 * So it is kept, as a RATIO. Each vertex records how light or dark its part is
 * against the base colour of its slot, and the runtime multiplies. A jersey is
 * 1.0 and its pants are ~0.6; the whole thing still recolours per team.
 */
function shadeRatios(spec, character, level) {
  const { skinHex, hairHex, jerseyHex, trimHex } = spec;
  const v = character.visual;
  const base = {
    M_Body: luminance(skinHex(v.skin)),
    M_Uniform: luminance(jerseyHex(v.uniform)),
    M_Hair: luminance(hairHex(v.hairColor)),
    M_Accessory: luminance(trimHex(v.uniform)),
  };
  const out = new Float32Array((level.pos.length / 3) * 3).fill(1);
  // The proxy's own vertex colours are LINEAR (it calls convertSRGBToLinear),
  // so comparing them to a linear luminance is like for like.
  for (const [slot, indices] of level.perSlot) {
    const denom = Math.max(1e-4, base[slot]);
    for (const i of indices) {
      const lum =
        0.2126 * level.col[i * 3] + 0.7152 * level.col[i * 3 + 1] + 0.0722 * level.col[i * 3 + 2];
      const ratio = Math.min(2, lum / denom);
      out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = ratio;
    }
  }
  return out;
}

/**
 * Production vertex palette. Non-team slots bake their authored linear colour
 * so body, hair and accessories can collapse into one draw at runtime; uniform
 * vertices keep a greyscale shade ratio so the drafting team's colour remains
 * dynamic. Slot membership is still preserved as real glTF primitives and
 * material names in the delivery contract.
 */
function rosterVertexColors(spec, character, level) {
  const out = new Float32Array(level.pos.length).fill(1);
  const uniformBase = Math.max(1e-4, luminance(spec.jerseyHex(character.visual.uniform)));
  for (const [slot, indices] of level.perSlot) {
    for (const i of indices) {
      if (slot === 'M_Uniform') {
        const lum =
          0.2126 * level.col[i * 3] + 0.7152 * level.col[i * 3 + 1] + 0.0722 * level.col[i * 3 + 2];
        const ratio = Math.min(2, lum / uniformBase);
        out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = ratio;
      } else {
        out[i * 3] = level.col[i * 3];
        out[i * 3 + 1] = level.col[i * 3 + 1];
        out[i * 3 + 2] = level.col[i * 3 + 2];
      }
    }
  }
  return out;
}

export async function buildProxyKidGlb(id, outPath, spec, options = {}) {
  const { SKELETON, ROSTER, skinHex, hairHex, trimHex, REFERENCE_HEIGHT_FT, crownHeightFt, bindPoseHash } =
    spec;

  const character = ROSTER.find((c) => c.id === id);
  if (!character) throw new Error(`no character "${id}" in src/data/characters.ts`);

  const crown = crownHeightFt();
  if (Math.abs(crown - REFERENCE_HEIGHT_FT) > 1e-6) {
    throw new Error(`skeleton.ts is inconsistent: crown ${crown.toFixed(4)}ft vs ${REFERENCE_HEIGHT_FT}`);
  }

  const delivery = options.delivery === true;
  const levels = buildLevels(spec, character, delivery ? 'roster' : 'proxy');

  // --- Bones, exactly as export-skeleton.mjs writes them ---------------------
  const byName = new Map(SKELETON.map((b, i) => [b.name, i]));
  const nodes = SKELETON.map((b) => ({ name: b.name, translation: [...b.pos], children: [] }));
  for (const b of SKELETON) {
    if (b.parent) nodes[byName.get(b.parent)].children.push(byName.get(b.name));
  }
  for (const n of nodes) if (!n.children.length) delete n.children;

  const world = new Map();
  for (const b of SKELETON) {
    const p = b.parent ? world.get(b.parent) : [0, 0, 0];
    world.set(b.name, [p[0] + b.pos[0], p[1] + b.pos[1], p[2] + b.pos[2]]);
  }
  const ibm = [];
  for (const b of SKELETON) {
    const [x, y, z] = world.get(b.name);
    ibm.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1);
  }

  // --- Buffers ---------------------------------------------------------------
  const chunks = [];
  const accessors = [];
  const bufferViews = [];

  const pushView = (buf, target) => {
    chunks.push(buf);
    bufferViews.push({ buffer: 0, byteLength: buf.length, target });
    return bufferViews.length - 1;
  };
  const pushAccessor = (a) => {
    accessors.push(a);
    return accessors.length - 1;
  };

  const meshes = [];
  const lodNodes = [];

  levels.forEach((level, i) => {
    const vertexCount = level.pos.length / 3;
    const pb = bounds(Array.from(level.pos), 3);

    const posA = pushAccessor({
      bufferView: pushView(f32(Array.from(level.pos)), 34962),
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3',
      min: pb.min,
      max: pb.max,
    });
    const norA = pushAccessor({
      bufferView: pushView(f32(Array.from(level.nor)), 34962),
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3',
    });
    const uvA = pushAccessor({
      bufferView: pushView(f32(Array.from(level.uv)), 34962),
      componentType: 5126,
      count: vertexCount,
      type: 'VEC2',
    });
    const colA = pushAccessor({
      bufferView: pushView(
        f32(Array.from(delivery ? rosterVertexColors(spec, character, level) : shadeRatios(spec, character, level))),
        34962
      ),
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3',
    });
    const jntA = pushAccessor({
      bufferView: pushView(u16(Array.from(level.joints)), 34962),
      componentType: 5123,
      count: vertexCount,
      type: 'VEC4',
    });
    const wgtA = pushAccessor({
      bufferView: pushView(f32(Array.from(level.weights)), 34962),
      componentType: 5126,
      count: vertexCount,
      type: 'VEC4',
    });

    const primitives = [];
    for (const slot of SLOT_ORDER) {
      const indices = level.perSlot.get(slot);
      if (!indices.length) continue; // a bald kid has no M_Hair triangles
      primitives.push({
        attributes: {
          POSITION: posA,
          NORMAL: norA,
          TEXCOORD_0: uvA,
          COLOR_0: colA,
          JOINTS_0: jntA,
          WEIGHTS_0: wgtA,
        },
        indices: pushAccessor({
          bufferView: pushView(u16(indices), 34963),
          componentType: 5123,
          count: indices.length,
          type: 'SCALAR',
        }),
        material: SLOT_ORDER.indexOf(slot),
        mode: 4,
      });
    }

    meshes.push({ name: `kid_${id}_LOD${i}`, primitives });
    lodNodes.push({ name: `kid_${id}_LOD${i}`, mesh: i, skin: 0 });
  });

  const ibmA = pushAccessor({
    bufferView: pushView(f32(ibm)),
    componentType: 5126,
    count: SKELETON.length,
    type: 'MAT4',
  });

  // A delivered model carries a real albedo binding plus its individualized
  // expression atlas. `CharacterModel` deliberately refuses an atlas without
  // an albedo map because three only emits the UV varying when a map uses it.
  const whiteImageView = delivery ? pushView(makeWhitePng()) : undefined;
  const faceImageView = delivery ? pushView(makeFaceAtlasPng(character)) : undefined;

  const lodFirst = nodes.length;
  nodes.push(...lodNodes);

  const v = character.visual;
  const json = {
    asset: {
      version: '2.0',
      generator: delivery
        ? `recess-sports roster-model pipeline (bindPoseHash ${bindPoseHash()})`
        : `recess-sports export-proxy-kid (STAND-IN, bindPoseHash ${bindPoseHash()})`,
    },
    scene: 0,
    scenes: [{ nodes: [0, ...lodNodes.map((_, i) => lodFirst + i)] }],
    nodes,
    skins: [
      {
        name: 'skeleton_recess_v1',
        inverseBindMatrices: ibmA,
        skeleton: 0,
        joints: SKELETON.map((_, i) => i),
      },
    ],
    meshes,
    materials: [
      material(
        'M_Body',
        delivery ? [1, 1, 1] : linearFromHex(skinHex(v.skin)),
        delivery ? { bodyTextures: true, vertexPalette: true } : undefined
      ),
      // ★ GREYSCALE, per §4. Team colour is applied at runtime as a multiply,
      // and that is the entire team-identity system.
      material('M_Uniform', [UNIFORM_GREY, UNIFORM_GREY, UNIFORM_GREY], delivery ? { vertexPalette: true } : undefined),
      material('M_Hair', delivery ? [1, 1, 1] : linearFromHex(hairHex(v.hairColor)), delivery ? { vertexPalette: true } : undefined),
      material('M_Accessory', delivery ? [1, 1, 1] : linearFromHex(trimHex(v.uniform)), delivery ? { vertexPalette: true } : undefined),
    ],
    accessors,
    bufferViews,
    ...(delivery
      ? {
          images: [
            { name: 'albedo', bufferView: whiteImageView, mimeType: 'image/png' },
            { name: 'face_atlas', bufferView: faceImageView, mimeType: 'image/png' },
          ],
          samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
          textures: [
            { name: 'albedo', sampler: 0, source: 0 },
            { name: 'face_atlas', sampler: 0, source: 1 },
          ],
        }
      : {}),
  };

  // Byte offsets, once every chunk's length is known.
  let at = 0;
  for (const view of bufferViews) {
    view.byteOffset = at;
    at += view.byteLength + ((4 - (view.byteLength % 4)) % 4);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  const { bytes } = writeGlb(outPath, json, chunks);
  return { bytes, triangles: levels.map((l) => l.triangles) };
}

function material(name, linearRgb, options = {}) {
  const out = {
    name,
    // No normal map, no metallic-roughness map — the toon shader ignores both
    // and the validator rejects them (§4).
    pbrMetallicRoughness: {
      baseColorFactor: [...linearRgb, 1],
      metallicFactor: 0,
      roughnessFactor: 1,
    },
  };
  if (options.bodyTextures) {
    out.pbrMetallicRoughness.baseColorTexture = { index: 0 };
    out.emissiveTexture = { index: 1 };
    out.emissiveFactor = [0, 0, 0];
    out.alphaMode = 'OPAQUE';
  }
  if (options.vertexPalette) out.extras = { recessVertexPalette: true };
  return out;
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 6)) {
    console.error(
      `Node ${process.versions.node} cannot import the TypeScript proxy directly.\n` +
        'Use Node 22.6+ (type stripping).'
    );
    process.exit(2);
  }

  const spec = await loadProxySpec();
  const args = process.argv.slice(2);
  const ids = args.length === 0 ? SAMPLE_IDS : args[0] === 'all' ? spec.ROSTER.map((c) => c.id) : args;

  let failed = 0;
  for (const id of ids) {
    const out = resolve(RUNTIME_DIR, `kid_${id}.glb`);
    try {
      const r = await buildProxyKidGlb(id, out, spec);
      console.log(
        `✓ kid_${id}.glb  ${(r.bytes / 1024).toFixed(0)}KB  ` +
          `tris ${r.triangles.join(' / ')}  (budgets ${LOD_BUDGET.join(' / ')})`
      );
    } catch (e) {
      failed++;
      console.error(`✗ kid_${id}: ${e.message}`);
    }
  }
  // Rewrite the manifest from the DIRECTORY, not from `ids` — it must describe
  // what is actually on disk, including files this run did not touch and any
  // real delivery someone dropped in by hand.
  const listed = writeManifest();
  console.log(`\n${ids.length - failed}/${ids.length} written to ${RUNTIME_DIR}`);
  console.log(`manifest.json lists ${listed.length}: ${listed.join(', ')}`);
  console.log('Validate them with: npm run validate:models');
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
