// ---------------------------------------------------------------------------
// ★ The rules `docs/v2/asset-contract.md` promises are machine-checked. PURE:
// the contract is passed IN, so this file has no TypeScript import and can be
// driven both by the CLI (`validate-models.mjs`, Node >= 22.6) and by the
// vitest gate (`validate-models.test.js`, any Node). One rule engine, two front
// ends — a gate that only runs on one of them is not a gate.
//
// Rejections are automatic and free; that is the deal the contract offers the
// artist. What matters is that they are also SPECIFIC. "Invalid model" wastes a
// round trip. "LeftShoulder is 2mm from the bind pose, and the bind pose is
// hashed because a nudge shows up later as animation drift on a subset of the
// roster" gets it fixed on the first try.
//
// Three severities:
//   fail  the contract is violated. Non-zero exit.
//   warn  something the contract cannot state absolutely — a DERIVED marker
//         frame, an unusually static clip. Reported, never fatal, because a
//         gate that cries wolf gets ignored and then the fails get ignored too.
//   info  measurements worth recording (body travel, triangle counts).
// ---------------------------------------------------------------------------

import { readAnimations, readNodes, triangleCount, worldTranslations } from './glb.mjs';

const FPS = 30;
/** A keyframe time may miss its frame by this much and still count as on-grid. */
const FRAME_EPS = 0.004; // ~1/8 frame
/** Bind-pose tolerance, feet. The contract's own example is "a 2mm nudge". */
const BIND_EPS = 0.004; // ~1.2mm

export function makeReport() {
  const items = [];
  return {
    items,
    fail: (rule, message) => items.push({ severity: 'fail', rule, message }),
    warn: (rule, message) => items.push({ severity: 'warn', rule, message }),
    info: (rule, message) => items.push({ severity: 'info', rule, message }),
    get failed() {
      return items.some((i) => i.severity === 'fail');
    },
  };
}

// --- Shared rules -------------------------------------------------------------

/** Things every delivered file must satisfy, rig or animation or character. */
export function checkContainer(gltf, report, { maxBytes } = {}) {
  const { json } = gltf;
  if (json.asset?.version !== '2.0') report.fail('gltf.version', `asset.version is ${json.asset?.version}, expected "2.0"`);
  if ((json.scenes ?? []).length > 1) report.fail('gltf.singleScene', `${json.scenes.length} scenes, expected 1`);
  if ((json.cameras ?? []).length) report.fail('gltf.noCameras', `${json.cameras.length} cameras — export without them`);
  const lights = json.extensions?.KHR_lights_punctual?.lights ?? [];
  if (lights.length) report.fail('gltf.noLights', `${lights.length} lights — export without them`);
  if (maxBytes && gltf.bytes > maxBytes) {
    report.fail('gltf.size', `${(gltf.bytes / 1024).toFixed(0)}KB exceeds the ${(maxBytes / 1024).toFixed(0)}KB budget`);
  }
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.targets?.length) {
        report.fail(
          'gltf.noMorphTargets',
          `${mesh.name ?? 'a mesh'} has ${prim.targets.length} morph targets — expressions are texture-atlas swaps`
        );
      }
    }
  }
}

/**
 * The bone set: names, ORDER, bind pose, and the optional-bone allowance.
 *
 * Order is part of the contract because retargeting tools and the engine both
 * index joints positionally; a model that reorders them animates, and animates
 * wrong, which is far worse than failing to load.
 */
export function checkSkeleton(gltf, spec, report) {
  const { BONE_NAMES, SKELETON, OPTIONAL_BONES, MAX_BONES, HEIGHT_MIN_FT, HEIGHT_MAX_FT } = spec;
  const nodes = readNodes(gltf);
  const byName = new Map(nodes.map((n) => [n.name, n]));

  const skin = gltf.json.skins?.[0];
  const jointNames = skin ? skin.joints.map((j) => nodes[j].name) : nodes.map((n) => n.name);

  const mandatory = jointNames.filter((n) => BONE_NAMES.includes(n));
  const extra = jointNames.filter((n) => !BONE_NAMES.includes(n));
  const missing = BONE_NAMES.filter((n) => !jointNames.includes(n));

  if (missing.length) report.fail('bones.missing', `missing ${missing.length} bone(s): ${missing.join(', ')}`);
  for (const name of extra) {
    if (!OPTIONAL_BONES.includes(name)) {
      report.fail('bones.unexpected', `"${name}" is not in the skeleton and not an allowed optional bone`);
    }
  }
  if (jointNames.length > MAX_BONES) {
    report.fail('bones.max', `${jointNames.length} bones exceeds the hard cap of ${MAX_BONES}`);
  }
  if (!missing.length && mandatory.join('|') !== BONE_NAMES.join('|')) {
    const at = mandatory.findIndex((n, i) => n !== BONE_NAMES[i]);
    report.fail(
      'bones.order',
      `bone order differs from the spec at index ${at}: found "${mandatory[at]}", expected "${BONE_NAMES[at]}"`
    );
  }

  // Bind pose, bone by bone, against the parent-relative table.
  let drift = 0;
  for (const b of SKELETON) {
    const node = byName.get(b.name);
    if (!node) continue;
    const d = Math.hypot(...node.translation.map((v, i) => v - b.pos[i]));
    if (d > BIND_EPS) {
      drift++;
      if (drift <= 5) {
        report.fail(
          'bones.bindPose',
          `${b.name} sits ${(d * 304.8).toFixed(1)}mm from the bind pose — a nudge here shows up later as animation drift`
        );
      }
    }
    if (node.matrix) report.fail('bones.matrix', `${b.name} uses a matrix; the bind pose must be translation-only`);
    const rot = node.rotation;
    if (Math.abs(rot[0]) + Math.abs(rot[1]) + Math.abs(rot[2]) > 1e-4) {
      report.fail('bones.bindRotation', `${b.name} is rotated in the bind pose; the rig is a T-pose with no joint rotation`);
    }
  }
  if (drift > 5) report.fail('bones.bindPose', `...and ${drift - 5} more bones off the bind pose`);

  // Height, measured the way the contract defines it.
  const world = worldTranslations(nodes);
  const crown = world.get('HeadTop_End');
  if (crown) {
    const h = crown[1];
    report.info('height', `${h.toFixed(3)}ft floor to HeadTop_End`);
    if (h < HEIGHT_MIN_FT - 1e-6 || h > HEIGHT_MAX_FT + 1e-6) {
      report.fail('height.band', `${h.toFixed(3)}ft is outside the ${HEIGHT_MIN_FT}-${HEIGHT_MAX_FT}ft band`);
    }
  }
  return { nodes, world, jointNames };
}

// --- Animation rules ----------------------------------------------------------

/**
 * ★ Where the motion says an event is.
 *
 * glTF stores keyframe times in seconds and has no dependable way to carry a
 * named marker — Blender will not round-trip action custom properties through
 * every exporter path — so the contract cannot ask for the marker as DATA. It
 * has to be derived from the motion, and the derivation differs by event type
 * because the physics does:
 *
 *   CONTACT / RELEASE  peak SPEED of the acting bone. A bat meets a ball, and
 *                      a ball leaves a hand, at the fastest instant of the whip.
 *   CATCH              full EXTENSION of the glove hand, measured from the hips.
 *                      Peak speed is WRONG here, and the placeholder library
 *                      proved it: on `catch_jump` the fastest the glove ever
 *                      moves is the take-off, five frames before the catch.
 *
 * Mirrors `AnimationDirector.test.ts`'s helper on purpose. If the two ever
 * disagree, the gate is checking something the engine does not believe.
 */
const MARKER_BONE = { CONTACT: 'Prop_BatGrip', RELEASE: 'RightHand', CATCH: 'LeftHand' };

export function markerFrameFromMotion(sampled, marker) {
  const bone = MARKER_BONE[marker];
  const track = sampled.get(bone);
  const hips = sampled.get('Hips');
  if (!track || track.length < 3) return null;

  let best = null;
  let bestScore = -Infinity;
  for (let f = 1; f < track.length - 1; f++) {
    let score;
    if (marker === 'CATCH') {
      const h = hips?.[f] ?? [0, 0, 0];
      score = Math.hypot(track[f][0] - h[0], track[f][1] - h[1], track[f][2] - h[2]);
    } else {
      const a = track[f - 1];
      const b = track[f + 1];
      score = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

/**
 * Sample an animation's bones frame by frame, in WORLD space.
 *
 * Rotation-only forward kinematics with quaternions — enough for marker
 * derivation and body travel, and it deliberately does not need three.js: the
 * validator must be able to say what is in the FILE.
 */
export function sampleAnimation(anim, nodes, frames) {
  const byNode = new Map();
  for (const ch of anim.channels) {
    if (!byNode.has(ch.node)) byNode.set(ch.node, {});
    byNode.get(ch.node)[ch.path] = ch;
  }

  const out = new Map();
  for (const node of nodes) out.set(node.name, []);

  for (let f = 0; f <= frames; f++) {
    const t = f / FPS;
    const local = nodes.map((n) => {
      const ch = byNode.get(n.index) ?? {};
      return {
        t: ch.translation ? sampleVec(ch.translation, t, 3) : n.translation,
        q: ch.rotation ? normalise(sampleVec(ch.rotation, t, 4)) : n.rotation,
      };
    });
    const world = new Array(nodes.length);
    for (const n of nodes) {
      const l = local[n.index];
      if (n.parent === null) {
        world[n.index] = { p: l.t.slice(), q: l.q.slice() };
      } else {
        const p = world[n.parent];
        world[n.index] = { p: addRotated(p.p, p.q, l.t), q: mulQuat(p.q, l.q) };
      }
      out.get(n.name).push(world[n.index].p);
    }
  }
  return out;
}

function sampleVec(channel, t, parts) {
  const { times, values } = channel;
  if (!times.length) return new Array(parts).fill(0);
  if (t <= times[0]) return values.slice(0, parts);
  const last = times.length - 1;
  if (t >= times[last]) return values.slice(last * parts, last * parts + parts);
  let i = 0;
  while (i < last && times[i + 1] < t) i++;
  const span = times[i + 1] - times[i] || 1;
  const k = (t - times[i]) / span;
  const out = new Array(parts);
  for (let c = 0; c < parts; c++) {
    const a = values[i * parts + c];
    const b = values[(i + 1) * parts + c];
    out[c] = a + (b - a) * k;
  }
  return out;
}

function normalise(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

function mulQuat(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function addRotated(p, q, v) {
  const [x, y, z] = v;
  const ix = q[3] * x + q[1] * z - q[2] * y;
  const iy = q[3] * y + q[2] * x - q[0] * z;
  const iz = q[3] * z + q[0] * y - q[1] * x;
  const iw = -q[0] * x - q[1] * y - q[2] * z;
  return [
    p[0] + ix * q[3] + iw * -q[0] + iy * -q[2] - iz * -q[1],
    p[1] + iy * q[3] + iw * -q[1] + iz * -q[0] - ix * -q[2],
    p[2] + iz * q[3] + iw * -q[2] + ix * -q[1] - iy * -q[0],
  ];
}

/**
 * The animation library: clip set, frame rate, root motion, loop seams, body
 * travel, and the derived marker frames.
 */
export function checkAnimations(gltf, spec, report) {
  const { CLIPS, CLIP_NAMES, BODY_TRAVEL_TOLERANCE_FT } = spec;
  const nodes = readNodes(gltf);
  const anims = readAnimations(gltf);
  const byName = new Map(anims.map((a) => [a.name, a]));

  const missing = CLIP_NAMES.filter((n) => !byName.has(n));
  const extra = anims.map((a) => a.name).filter((n) => !CLIP_NAMES.includes(n));
  if (missing.length) report.fail('clips.missing', `${missing.length} clip(s) not delivered: ${missing.join(', ')}`);
  for (const n of extra) report.warn('clips.extra', `"${n}" is not in the contract — it will never be played`);
  report.info('clips.count', `${anims.length} animation(s) in the file, ${CLIP_NAMES.length} in the contract`);

  for (const clipSpec of CLIPS) {
    const anim = byName.get(clipSpec.name);
    if (!anim) continue;
    checkOneClip(anim, clipSpec, nodes, spec, report, BODY_TRAVEL_TOLERANCE_FT);
  }
}

function checkOneClip(anim, spec, nodes, contract, report, travelTolerance) {
  const name = spec.name;
  const rootChannels = anim.channels.filter((ch) => nodes[ch.node]?.name === 'Root');

  // ROOT MOTION — the rule that rejects most deliveries.
  for (const ch of rootChannels) {
    if (ch.path !== 'translation') continue;
    const moved = ch.values.some((v, i) => Math.abs(v - ch.values[i % 3]) > 1e-4);
    if (moved) {
      report.fail('clip.rootMotion', `${name} translates Root — the engine owns position, run cycles run in place`);
    }
  }
  if (rootChannels.some((ch) => ch.path === 'rotation')) {
    report.warn('clip.rootRotation', `${name} rotates Root; the engine owns facing, so this will be overwritten`);
  }

  // Frame rate: every key must sit on the 30fps grid.
  const offGrid = [];
  for (const ch of anim.channels) {
    for (const t of ch.times) {
      const f = t * FPS;
      if (Math.abs(f - Math.round(f)) > FRAME_EPS) offGrid.push(t);
    }
  }
  if (offGrid.length) {
    report.fail(
      'clip.frameRate',
      `${name} has ${offGrid.length} keyframe(s) off the 30fps grid (first at ${offGrid[0].toFixed(4)}s) — re-export at 30fps`
    );
  }

  // Length, +-20% of the target.
  const duration = Math.max(0, ...anim.channels.flatMap((ch) => (ch.times.length ? [ch.times[ch.times.length - 1]] : [0])));
  const frames = Math.round(duration * FPS);
  const lo = Math.floor(spec.frames * 0.8);
  const hi = Math.ceil(spec.frames * 1.2);
  if (frames < lo || frames > hi) {
    report.fail('clip.length', `${name} is ${frames} frames, outside the ${lo}-${hi} allowed for a ${spec.frames}-frame clip`);
  }

  const sampled = sampleAnimation(anim, nodes, Math.max(frames, spec.frames));

  // LOOP SEAM. "Nearly closed" pops once per stride, forever.
  if (spec.loop) {
    let worst = 0;
    let worstBone = '';
    for (const ch of anim.channels) {
      if (ch.path !== 'rotation' || ch.times.length < 2) continue;
      const n = ch.times.length;
      const d = Math.max(
        ...[0, 1, 2, 3].map((c) => Math.abs(ch.values[c] - ch.values[(n - 1) * 4 + c]))
      );
      if (d > worst) {
        worst = d;
        worstBone = nodes[ch.node]?.name ?? '?';
      }
    }
    if (worst > 0.002) {
      report.fail('clip.loopSeam', `${name} does not close: ${worstBone} differs by ${worst.toFixed(4)} between first and last key`);
    }
  }

  // BODY TRAVEL — a gameplay number, measured rather than trusted.
  const hips = sampled.get('Hips') ?? [];
  let travel = 0;
  if (hips.length) {
    for (const p of hips) travel = Math.max(travel, Math.hypot(p[0] - hips[0][0], p[2] - hips[0][2]));
  }
  const expected = spec.bodyTravelFt ?? 0;
  report.info('clip.travel', `${name} hips travel ${travel.toFixed(2)}ft (contract ${expected}ft)`);
  if (Math.abs(travel - expected) > travelTolerance + 0.15) {
    const why =
      expected === 0
        ? 'the engine owns ground position, so a clip that travels puts the character where the sim says they are not'
        : 'this number IS the reach the sim grants — a clip that reaches further catches balls the sim scored as missed';
    report.fail('clip.bodyTravel', `${name} travels ${travel.toFixed(2)}ft, contract says ${expected}ft — ${why}`);
  }

  // MARKER — derived, and a warning rather than a failure, because the
  // derivation is an inference about intent and the contract says so.
  if (spec.marker) {
    const found = markerFrameFromMotion(sampled, spec.marker.name);
    if (found === null) {
      report.warn('clip.marker', `${name}: could not locate the ${spec.marker.name} instant`);
    } else if (Math.abs(found - spec.marker.frame) > 1) {
      report.warn(
        'clip.marker',
        `${name}: the motion peaks at frame ${found} but ${spec.marker.name} is specified on frame ${spec.marker.frame} — ` +
          'the engine time-warps the clip so that frame lands on the physical instant, so it must be the event'
      );
    } else {
      report.info('clip.marker', `${name}: ${spec.marker.name} confirmed on frame ${found}`);
    }
  }

  // A clip with nothing in it passes every rule above.
  if (anim.channels.length < 2) {
    report.fail('clip.empty', `${name} has ${anim.channels.length} channel(s) — nothing is animated`);
  }
}

// --- Character rules ----------------------------------------------------------

const SLOTS = ['M_Body', 'M_Uniform', 'M_Hair', 'M_Accessory'];
const LOD_BUDGET = { LOD0: 7000, LOD1: 3000, LOD2: 1200 };

export function checkCharacter(gltf, spec, report, id) {
  const { json } = gltf;

  const skinned = (json.nodes ?? []).filter((n) => n.skin !== undefined);
  if (skinned.length > 3) {
    report.fail('character.meshes', `${skinned.length} skinned meshes, at most 3 allowed (body / hair / accessory)`);
  }
  if ((json.skins ?? []).length !== 1) {
    report.fail('character.skin', `${(json.skins ?? []).length} skins, expected exactly 1`);
  }

  for (const [lod, budget] of Object.entries(LOD_BUDGET)) {
    const wanted = `kid_${id}_${lod}`;
    const node = (json.nodes ?? []).find((n) => n.name === wanted);
    if (!node) {
      report.fail('character.lod', `no node named ${wanted}`);
      continue;
    }
    const tris = node.mesh !== undefined ? triangleCount(gltf, node.mesh) : 0;
    report.info('character.lod', `${wanted}: ${tris} triangles (budget ${budget})`);
    if (tris > budget) report.fail('character.lodBudget', `${wanted} has ${tris} triangles, over the ${budget} budget`);
  }

  for (const mat of json.materials ?? []) {
    if (!SLOTS.includes(mat.name)) {
      report.fail('character.materialSlot', `material "${mat.name}" is not one of ${SLOTS.join(' / ')}`);
    }
    const pbr = mat.pbrMetallicRoughness ?? {};
    if (pbr.metallicRoughnessTexture) {
      report.fail('character.noPbr', `${mat.name} carries a metallic-roughness map; the toon shader ignores it`);
    }
    if (mat.normalTexture) report.fail('character.noNormalMap', `${mat.name} carries a normal map; the toon shader ignores it`);
  }

  const body = (json.materials ?? []).find((m) => m.name === 'M_Uniform');
  if (body) {
    const base = body.pbrMetallicRoughness?.baseColorFactor;
    if (base && (Math.abs(base[0] - base[1]) > 0.02 || Math.abs(base[1] - base[2]) > 0.02)) {
      report.fail(
        'character.uniformGreyscale',
        'M_Uniform has a coloured baseColorFactor — team colour is a runtime multiply, and a baked jersey cannot wear the team that drafts it'
      );
    }
  }
}
