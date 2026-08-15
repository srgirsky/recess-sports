// ---------------------------------------------------------------------------
// ★ THE SCULPTOR'S SPEC — read a concept sheet, emit every number a sculpt
// needs, and REFUSE the ones the drawing cannot answer.
//
// `measure-turnaround.mjs` already prints a tape measure to stdout. This writes
// a spec: structured, re-derivable, and — the part that matters — able to say
// "this cannot be measured, here is why, use this instead".
//
// ★ WHY A REFUSAL IS THE PRODUCT. Four expensive failures on this project are
// one shape: a quantity read down a line passing through more than one object.
// The torso measured across `sleeve | torso | sleeve` (half 0.910 authored where
// the torso is 0.532 — "the corners of the T-shirt ended up on his stomach").
// The shoe measured across two overlapping feet (1.211ft for a 0.86ft foot).
// The mouth measured on the chin shadow (97.3% of head height, i.e. the jaw).
// The shoe's colour bands never traced at all.
//
// Every one of them would have been prevented by a tool that declined. So the
// spec's `notTraceable` entries are not gaps in the output — they ARE the
// output, and a character whose spec is mostly refusals is a character whose
// sheet cannot be traced, which is a fact worth having on day one rather than
// in round seventeen.
//
// ⚠️ THE SPEC DESCRIBES THE DRAWING, POSED. It is not a delivery target. A
// number here can be satisfied by moving a mesh off its own bones — that failure
// is recorded in `render.leg-stance` — and nothing in this file makes that
// harder or should pretend to.
//
//   npm run analyse:turnaround -- tank            # print
//   npm run analyse:turnaround -- tank --write    # write the spec
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

import { slugFor } from './character-registry.mjs';
import { RECIPES } from './turnaround-recipes.mjs';
import { TONE_MEMBERSHIP, lum, toneDistance } from './tone.mjs';
import {
  REFERENCE_HEIGHT_FT,
  bandBoundaries,
  figure,
  halfWidthAt,
  headSpan,
  inkBandsIn,
  loadSheet,
  mouthIn,
  namedRunAt,
  palette,
  regionRunsAt,
  rowAt,
  views,
} from './turnaround.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
export const SPEC_DIR = join(here, 'turnaround-specs');
export const SPEC_VERSION = 1;

const round = (v, n = 4) => (v === null || v === undefined ? v : Number(v.toFixed(n)));
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const specPath = (slug) => join(SPEC_DIR, `${slug}.spec.json`);

/** A figure's pixel height deviating from the standing set means it is posed. */
const POSED_DEVIATION = 0.03;

/**
 * ★ AN ANCHOR NAMES A LIT MATERIAL, SO ITS CLUSTER MUST HOLD COMPARABLE VALUE.
 *
 * `toneDistance` decides in chromaticity with a deliberately tiny value term,
 * because for PIXEL membership that is correct — shading changes value, not
 * hue. Anchor→cluster RESOLUTION is a different question, and Grizz is the
 * sheet that proved it: his 3%-share outline cluster #050302 (luminance 3) sat
 * 9 tone units from his declared #8a5a34 tee anchor (luminance 103), because a
 * near-black keeps the ratio of whatever ink it was drawn with — so both his
 * "shirt" and his "skin" resolved to the outlines, and the spec blessed it.
 * An anchor describes the material as DRAWN; a cluster thirty times dimmer is
 * not that material with the light off it, it is a different thing that
 * happens to share a hue. 3x spans every lit-to-shadow range on the six
 * sheets analysed so far (the widest, Tank's shorts #24242B to their shadow
 * #121116, is 2.1x) without admitting an outline.
 */
const ANCHOR_VALUE_RATIO = 3;

/**
 * Resolve each declared material to one of the sheet's own clusters.
 *
 * Refuses rather than taking the nearest: a tool that always answers cannot
 * report that it does not know, and not knowing is the outcome this exists for.
 *
 * ★ AND ONE CLUSTER MAY CARRY ONLY ONE NAME. When two declared materials both
 * resolve to the same cluster, the sheet is saying it draws them in one tone —
 * Grizz's tee and his skin are 15 tone units apart, inside the clusterer's own
 * merge distance — and assigning the cluster to either name would be a silent
 * override of exactly the kind this file's header forbids. Both refuse, and
 * the boundary between those regions must be traced by geometry, not colour.
 * Break-it record: regenerating Grizz's spec with this rule fired both ways —
 * "indistinct-materials" on shirt/skin (one warm cluster) and on hair/pants
 * (his afro's black and his shorts' near-black are one cluster too).
 */
function resolveMaterials(pal, recipe) {
  const out = {};
  for (const [name, decl] of Object.entries(recipe.materials)) {
    const want = hexToRgb(decl.hex);
    let best = -1, bestD = Infinity, nearestAny = -1, nearestAnyD = Infinity;
    pal.forEach((p, i) => {
      const d = toneDistance(p.rgb, want);
      if (d < nearestAnyD) { nearestAnyD = d; nearestAny = i; }
      const bright = Math.max(lum(p.rgb), lum(want)), dim = Math.min(lum(p.rgb), lum(want));
      if (bright > ANCHOR_VALUE_RATIO * Math.max(dim, 1)) return; // an outline, not this material unlit
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best === -1 || bestD > TONE_MEMBERSHIP) {
      out[name] = { notTraceable: {
        class: 'no-such-material',
        reason: `no cluster on this sheet is within ${TONE_MEMBERSHIP} of the declared ${decl.hex} for "${name}" ` +
          `at compatible value (nearest by tone is ${pal[nearestAny]?.hex} at ${round(nearestAnyD, 1)}) — ` +
          'the recipe\'s anchor is wrong, or the art changed',
      } };
      continue;
    }
    out[name] = {
      index: best, hex: pal[best].hex, sharePct: round(pal[best].sharePct, 2),
      declaredAnchor: decl.hex, toneDistance: round(bestD, 2), paired: decl.paired === true,
    };
  }
  const claims = new Map();
  for (const [name, m] of Object.entries(out)) {
    if (m.notTraceable) continue;
    if (!claims.has(m.index)) claims.set(m.index, []);
    claims.get(m.index).push(name);
  }
  for (const [index, names] of claims) {
    if (names.length < 2) continue;
    for (const name of names) {
      const rivals = names.filter((n) => n !== name).map((n) => `"${n}"`).join(', ');
      out[name] = { notTraceable: {
        class: 'indistinct-materials',
        reason: `"${name}" and ${rivals} both resolve to this sheet's ${pal[index].hex} cluster ` +
          `(${round(pal[index].sharePct, 1)}% of the figure) — the drawing holds them in one tone, so no ` +
          'colour read can separate them; trace their boundary by geometry, or fix whichever anchor is wrong',
      } };
    }
  }
  return out;
}

export async function analyse(id) {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`${id}: no turnaround recipe — add one to turnaround-recipes.mjs first`);
  const slug = slugFor(id);
  const sheetPath = join(repo, 'docs/v2/concepts', `${slug}-turnaround.png`);
  const sheet = await loadSheet(sheetPath);
  const bounds = views(sheet);

  if (bounds.length !== recipe.views.length) {
    throw new Error(
      `${id}: the recipe declares ${recipe.views.length} views and the sheet splits into ${bounds.length}. ` +
      'Fix whichever is wrong — do not measure a sheet the recipe does not describe.',
    );
  }

  const figures = bounds.map((_, i) => figure(sheet, i));
  const heights = figures.map((f) => f.figH);
  const median = [...heights].sort((a, b) => a - b)[heights.length >> 1];
  const viewOf = (role) => recipe.views.indexOf(role);

  const viewRecords = figures.map((f, i) => {
    const deviation = (f.figH - median) / median;
    const posed = Math.abs(deviation) > POSED_DEVIATION;
    const rec = {
      index: i, role: recipe.views[i], pose: posed ? 'posed' : 'standing',
      box: [f.x0, f.x1, f.y0, f.y1], heightPx: f.figH, ftPerPx: round(f.ftPerPx, 6),
      deviationPct: round(100 * deviation, 2),
    };
    if (posed) {
      rec.measurable = false;
      rec.notTraceable = { class: 'posed-view', reason:
        `${f.figH}px against a ${median}px standing view — every figure is scaled independently to ` +
        `${REFERENCE_HEIGHT_FT}ft, so a z read here is off by ${round(Math.abs(100 * deviation), 1)}%. Silhouette and colour only.` };
    }
    return rec;
  });

  // The recipe's own claim, checked: an `action` view must be the posed one.
  const declaredAction = viewOf('action');
  const posedIndexes = viewRecords.filter((v) => v.pose === 'posed').map((v) => v.index);
  const viewCheck = declaredAction === -1
    ? (posedIndexes.length === 0 ? 'ok' : `views ${posedIndexes} are posed but none is declared 'action'`)
    : (posedIndexes.length === 1 && posedIndexes[0] === declaredAction ? 'ok'
      : `declared action view ${declaredAction}, posed views ${JSON.stringify(posedIndexes)}`);

  const front = figures[Math.max(viewOf('front'), 0)];
  const pal = palette(front);
  const materials = resolveMaterials(pal, recipe);
  const head = headSpan(front);

  // --- landmarks -----------------------------------------------------------
  const bands = inkBandsIn(front, head);
  const featureBands = bands.filter((b) => b.hostFrac <= 0.5);
  const rejected = bands.filter((b) => b.hostFrac > 0.5)
    .map((b) => ({ fromPct: round(b.fromPct, 1), toPct: round(b.toPct, 1), hostFrac: round(b.hostFrac, 2),
      why: 'as wide as the face at its own row — a fringe or a chin shadow, not a feature' }));
  const mouth = mouthIn(front, head);

  const landmark = (b, name) => b
    ? { value: round(b.centroidPct, 1), unit: 'pctOfHead', fromPct: round(b.fromPct, 1), toPct: round(b.toPct, 1),
        paired: b.paired, hostFrac: round(b.hostFrac, 2), confidence: 'traced' }
    : { notTraceable: { class: 'merged-region', reason: `no distinct ${name} band survived the width guard on this sheet` } };

  const landmarks = {
    head: { crownRow: head.crown, neckRow: head.neck, heightPx: head.height, pinchFound: head.pinchFound },
    brow: landmark(featureBands[0], 'brow'),
    eye: landmark(featureBands[1], 'eye'),
    mouth: mouth.notTraceable ? mouth : {
      value: round(mouth.pct, 1), unit: 'pctOfHead', row: mouth.row,
      darkest: round(mouth.darkest, 0), hostFrac: round(mouth.hostFrac, 2),
      rejectedRows: mouth.rejectedRows, confidence: 'traced',
    },
    earLine: { value: round(head.earLinePct, 1), unit: 'pctOfHead',
      proudPctOfHead: round((50 * (head.earWidthPx - head.templeWidthPx)) / head.height, 1), confidence: 'traced' },
    rejected,
  };
  if (!head.pinchFound) {
    landmarks.head.notTraceable = { class: 'no-pinch', reason:
      'the neck pinch landed on a search-window edge, so the head height is a boundary artifact and every ' +
      'percentage below it would be scaled by a number nobody measured' };
  }

  // --- profiles ------------------------------------------------------------
  const profiles = {};
  for (const [name, sweep] of Object.entries(recipe.sweeps ?? {})) {
    const f = figures[viewOf(sweep.view)];
    const mat = materials[sweep.material];
    const stations = [];
    if (mat.notTraceable) {
      profiles[name] = { material: sweep.material, notTraceable: mat.notTraceable };
      continue;
    }
    for (let z = sweep.from; z <= sweep.to + 1e-9; z += sweep.step) {
      const zz = round(z, 3);
      const got = namedRunAt(f, pal, zz, { material: mat.index, role: sweep.role, paired: mat.paired });
      const silhouette = halfWidthAt(f, zz);
      const runs = regionRunsAt(f, pal, zz);
      stations.push(got.notTraceable
        ? { z: zz, halfWidth: { notTraceable: got.notTraceable,
            evidence: { silhouetteHalfWidth: round(silhouette), runs: runs.map((r) => `${r.hex ?? 'abstain'}:${r.x0}-${r.x1}`) } } }
        : { z: zz, halfWidth: { value: round(got.value), unit: 'ft', view: sweep.view, region: sweep.material,
            role: sweep.role, parts: got.parts, px: got.px, confidence: [got.px.seamLeftPx, got.px.seamRightPx].some((v) => v !== null && v <= 1) ? 'weak-seam' : 'traced',
            silhouetteHalfWidth: round(silhouette),
            note: 'the silhouette figure beside it is what a run-count-blind trace would have recorded' } });
    }
    profiles[name] = { material: sweep.material, view: sweep.view, role: sweep.role, stations };
  }

  // --- bands ---------------------------------------------------------------
  const bandRecords = {};
  for (const [name, decl] of Object.entries(recipe.bands ?? {})) {
    const f = figures[viewOf(decl.view)];
    const mat = materials[decl.material];
    if (mat.notTraceable) { bandRecords[name] = { notTraceable: mat.notTraceable }; continue; }
    // One side only: a window spanning both feet is the paired-part failure.
    // ★ ONE SHOE, NOT THE LEFT HALF OF THE KID. A window that is merely "left
    // of the centreline" also contains a leg and a sock, and their tones then
    // outvote the shoe's own bands. Bound it to the widest run of shoe material
    // near the ground, which IS one shoe.
    const centre = Math.round((f.x0 + f.x1) / 2);
    const top = rowAt(f, 0.44), ground = f.y1;
    const nearGround = regionRunsAt(f, pal, 0.06)
      .filter((r) => r.material === mat.index && r.x1 < centre)
      .sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
    if (!nearGround) {
      bandRecords[name] = { notTraceable: { class: 'no-such-material', reason:
        `no run of ${decl.material} left of the centreline near the ground, so there is no single ${name} to band` } };
      continue;
    }
    const found = bandBoundaries(f, pal, { x0: nearGround.x0, x1: nearGround.x1, top, ground });
    bandRecords[name] = {
      window: { view: decl.view, x: [f.x0, centre - 4], topRow: top, groundRow: ground, side: 'left' },
      boundaries: found.map((b) => ({ material: b.hex, fromFrac: round(b.fromFrac, 3), toFrac: round(b.toFrac, 3) })),
      note: 'measured on ONE side of the centreline; a window spanning both is the paired-part failure',
    };
  }

  const flat = [];
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (node.notTraceable) { flat.push({ at: path, ...node.notTraceable }); return; }
    for (const [k, v] of Object.entries(node)) walk(v, `${path}/${k}`);
  };
  walk({ views: viewRecords, materials, landmarks, profiles, bands: bandRecords }, '');

  return {
    specVersion: SPEC_VERSION,
    comment: 'Generated by `npm run analyse:turnaround -- <id> --write`. Describes the DRAWING, posed — never a delivery target. ' +
      'scripts/v2/turnaround-spec.lint.test.js regenerates this and fails on any drift.',
    id, slug,
    source: { sheet: `docs/v2/concepts/${slug}-turnaround.png`, sha256: createHash('sha256').update(readFileSync(sheetPath)).digest('hex'), pixels: `${sheet.W}x${sheet.H}` },
    recipe: { views: recipe.views, check: viewCheck },
    referenceHeightFt: REFERENCE_HEIGHT_FT,
    views: viewRecords,
    materials,
    landmarks,
    profiles,
    bands: bandRecords,
    notTraceable: flat,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const ids = args.filter((a) => !a.startsWith('--'));
  if (!ids.length) throw new Error('usage: npm run analyse:turnaround -- <id> [<id>…] [--write]');
  for (const id of ids) {
    const spec = await analyse(id);
    if (write) {
      if (!existsSync(SPEC_DIR)) mkdirSync(SPEC_DIR, { recursive: true });
      writeFileSync(specPath(spec.slug), `${JSON.stringify(spec, null, 2)}\n`);
      console.log(`✓ ${specPath(spec.slug)}`);
    }
    const n = spec.notTraceable.length;
    console.log(`${spec.id.padEnd(16)} ${spec.views.length} views · ${Object.keys(spec.materials).length} materials · ` +
      `${n} refusal${n === 1 ? '' : 's'} · recipe ${spec.recipe.check}`);
    for (const r of spec.notTraceable) console.log(`   ✗ ${r.at} [${r.class}] ${r.reason.slice(0, 120)}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
