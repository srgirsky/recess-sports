// ---------------------------------------------------------------------------
// ★ RUBRIC 3.7 IS BINARY ABOUT HOLES, AND IT HAS BEEN ADJUDICATED BY EYE.
//
// A character with a hole in it fails 3.7 outright. Nothing measured that, so
// for twenty review rounds it was settled by people arguing about a picture —
// and the picture lost, in both directions:
//
//   · Tank's hand cap was wound inward on both arms and all three LODs. The
//     defect was REFUTED by sampling alpha over the shoulder (0 pixels below
//     250, minimum 255) and written up as a shadowed concavity. That test can
//     only see the OUTER silhouette; the torso sits behind the arm, so an
//     interior hole is invisible to it by construction. `capwinding.lint` was
//     written for that one and asks the geometry instead.
//
//   · Then the reverse. A review reported a "collar rim shipping as a vertical
//     fin" and located it by dominant-joint segmentation. The rim was fine —
//     its own arithmetic puts it at lateral span 0.269 and height 0.410..0.423,
//     which is the flat ellipse it was asked for. The fin was the TOE CAP,
//     built on the heel: `SHOE_STATIONS` was reversed to put the toe at -y and
//     the predicate selecting the cap's stations (`if y_s < 0.13`) was not, so
//     the cap ran on stations where `toe_cap_v_low` returns its 2.0 "not here"
//     sentinel. `v` then ran 1.0 -> 2.0, `shoe_u_at_v` clamped every point to
//     the instep centre at u = 0, and eleven points collapsed onto one vertical
//     line that reached twice the shoe's topline. Between that card and the
//     shoe was 45 pixels of background, in one compact pocket, in both profile
//     views. Two `assert 0.0 <= v <= 1.0` in the sculpt source make that class
//     a build failure now.
//
// Both were real, both were mis-attributed, and the argument each time was
// about what a render showed. So measure the render. This is the cheap half of
// 3.7 — it proves the DELIVERED VIEWS have no hole in them, which is the thing
// a reviewer is looking for and the thing they keep getting wrong.
//
// ⚠️ IT IS NOT A WATERTIGHTNESS PROOF and must not be quoted as one. A hole
// with something opaque behind it is invisible here, exactly as it was to the
// alpha test above. `capwinding.lint` covers the caps; this covers the views.
//
// ★ HOW IT COUNTS, AND WHY EACH CHOICE IS NOT ARBITRARY.
//
// Flood the background inward from the frame edge, then anything still
// transparent is enclosed. Two details decide whether the answer means anything:
//
//   · The fill is 8-CONNECTED. A one-pixel gap between two limbs is open, but
//     its own antialiased border walls it off under a 4-connected fill, so the
//     figure invents enclosures wherever it nearly touches itself. Junebug —
//     approved — goes from 0 to 5 phantom pixels on that choice alone.
//
//   · A pixel is background when alpha < 128, i.e. genuinely see-through. At
//     the 250 threshold an ordinary antialiased edge counts as a hole: Junebug
//     scores 2 pixels at alpha 227 and 229, which is a nearly-opaque edge.
//
// And the verdict is the LARGEST BLOB, not the total. 3.7 asks whether you can
// see through the character, and one visible pocket is the failure; a scatter
// of single pixels along an edge is antialiasing. Measured, the two populations
// do not overlap — an approved character's worst blob is 3 pixels and the
// smallest real defect ever found here is 45.
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { AUTHORED_CHARACTERS, slugFor } from './character-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const concepts = resolve(here, '..', '..', 'docs', 'v2', 'concepts');

// A pixel is background when you can genuinely see through it.
const TRANSPARENT = 128;

// ★ THE ALLOWANCE IS AN ANTIALIASING ALLOWANCE, NOT A HOLE ALLOWANCE. Approved
// Junebug's worst blob is 3 pixels, on the profile views, where her ponytail
// passes her shoulder. 8 leaves room for a slightly different edge without
// leaving room for anything a reviewer could see: the smallest genuine defect
// measured on this roster is 45 pixels, and the next is 57. It may only shrink.
const ANTIALIAS_ALLOWANCE = 8;

// ★ DEBT, NOT EXEMPTION — and each entry retires itself. These two are proxy
// deformations rather than sculpts (`docs/v2/character-production-playbook.md`
// and the batch plan both have them scheduled for rebuild from scratch), so
// their holes are real and known rather than newly introduced. The budget
// records what shipped so it cannot get worse, and `no stale debt` below fails
// the moment a rebuild brings one under the allowance — which is the signal to
// delete the entry, not to lower it.
//
// ⚠️ Zoom's number is NOT all defect. He is the roster's only wheelchair, and
// the inside of a wheel is legitimately enclosed background. Whether that is a
// pass is a question for the single-character PR the plan gives him; until then
// this holds the line rather than pretending to judge it.
//
// ★ RE-MEASURED 2026-08-16, AND THE ENTRY WAS CARRYING EIGHT TIMES ITS OWN
// DEBT. 9600 was set against a measured 9525 when Zoom was a PROXY. He has
// shipped as an authored sculpt since batch 6 (PR #136) and his worst view now
// measures 1170 — so the budget had ~8x unused slack, which is precisely the
// "a ratchet that permits unused slack just gets refilled" failure this repo's
// lint conventions name. The stale word in the old comment ("proxy") is what
// made it survive: a number nobody could read as current is a number nobody
// re-measures.
//
// What remains is the wheel interiors and nothing else: front and front-apose
// read 234 in one pocket at (220,507), profile and profile-apose 1170 at
// (274,581) — the side-on view through the wheel, which is the largest honest
// enclosure a wheelchair has. Both A-pose views match their standing twin
// exactly, which is the tell that this is structure and not a posing artifact.
const DEBT = {
  zoom: 1200,       // measured 1170 (profile, through the wheel) — authored sculpt, not a proxy
};

const VIEWS = ['front', 'profile', 'front-apose', 'profile-apose'];

/**
 * The largest run of enclosed background in a rendered view, in pixels.
 *
 * Exported shape rather than inlined so the break-it test below can run it over
 * a deliberately punctured copy of a real render — a fixture proves the counter
 * works on a fixture, which is not the claim being made.
 */
export function largestEnclosedBlob(data, width, height, channels) {
  const alpha = (x, y) => data[(y * width + x) * channels + 3];
  const isBackground = (x, y) => alpha(x, y) < TRANSPARENT;

  const outside = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (outside[index] || !isBackground(x, y)) return;
    outside[index] = 1;
    stack.push(x, y);
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  // 8-connected: a diagonal channel between two limbs is open, not a hole.
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) push(x + dx, y + dy);
  }

  const seen = new Uint8Array(width * height);
  let largest = 0;
  let at = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (seen[index] || outside[index] || !isBackground(x, y)) continue;
      let area = 0;
      const queue = [x, y];
      seen[index] = 1;
      while (queue.length) {
        const cy = queue.pop();
        const cx = queue.pop();
        area++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (seen[j] || outside[j] || !isBackground(nx, ny)) continue;
          seen[j] = 1;
          queue.push(nx, ny);
        }
      }
      if (area > largest) { largest = area; at = `${x},${y}`; }
    }
  }
  return { largest, at };
}

// ★ A BUDGET, NOT A RAISED TIMEOUT — #45's lesson, applied to the image sweep.
//
// This file decodes every delivered view of every registered sculpt and
// flood-fills it: ~120 PNGs at roughly 25ms each once the roster is full. That
// is the thing under test, not waste around it, so it cannot be trimmed without
// trimming coverage — and a silhouette lint that skips characters is the defect
// it exists to catch. What WAS waste is re-decoding: three tests here measure
// overlapping sets of the same files, so the decode is memoised below and only
// the first pass pays for it.
//
// The residue is real wall-clock, so it gets a stated budget with the cost on
// the record rather than a bare number. It sat at ~2.1s under vitest's 5s
// default, which held until the roster filled and CI contention pushed it over
// — and it then failed as a TIMEOUT, which reads like a broken gate rather than
// a slow one. If this needs raising again, make the scan cheaper first.
const SCANS_EVERY_VIEW = 60_000;

const measured = new Map();
async function measure(path) {
  if (!measured.has(path)) {
    measured.set(path, (async () => {
      const { data, info } = await sharp(path).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
      return largestEnclosedBlob(data, info.width, info.height, info.channels);
    })());
  }
  return measured.get(path);
}

/** Every `<slug>-<view>-review.png` that exists, for every registered sculpt. */
function renders() {
  const found = [];
  for (const id of Object.keys(AUTHORED_CHARACTERS)) {
    const slug = slugFor(id);
    for (const view of VIEWS) {
      const path = join(concepts, `${slug}-${view}-review.png`);
      if (existsSync(path)) found.push({ slug, view, path });
    }
  }
  return found;
}

describe('a delivered view has no hole in it', () => {
  it('renders every registered sculpt, so the sweep is not empty', () => {
    const found = renders();
    expect(found.length).toBeGreaterThanOrEqual(12);
    expect([...new Set(found.map((r) => r.slug))].sort())
      .toEqual(Object.keys(AUTHORED_CHARACTERS).map(slugFor).sort());
  });

  it('encloses no background a reviewer could see through', async () => {
    const failures = [];
    for (const { slug, view, path } of renders()) {
      const budget = DEBT[slug] ?? ANTIALIAS_ALLOWANCE;
      const { largest, at } = await measure(path);
      if (largest > budget) {
        failures.push(
          `${slug}-${view}: ${largest} enclosed background pixels in one pocket ` +
          `at ${at}, over a budget of ${budget} — the delivered view can be seen ` +
          'through, which is rubric 3.7 and binary. Find the geometry under those ' +
          'pixels before changing this number; a budget here may only shrink',
        );
      }
    }
    expect(failures).toEqual([]);
  }, SCANS_EVERY_VIEW);

  // ★ NO STALE DEBT. A budget that outlives the defect it recorded is not a
  // ratchet — it is slack waiting to be refilled by the next regression.
  it('carries no debt entry whose character has been fixed', async () => {
    const retired = [];
    for (const slug of Object.keys(DEBT)) {
      const views = renders().filter((r) => r.slug === slug);
      expect(views.length).toBeGreaterThan(0);
      const worst = Math.max(...(await Promise.all(views.map(async (v) => (await measure(v.path)).largest))));
      if (worst <= ANTIALIAS_ALLOWANCE) retired.push(`${slug} (worst blob now ${worst})`);
    }
    expect(retired, `these no longer need a budget — delete their DEBT entries: ${retired.join(', ')}`)
      .toEqual([]);
  }, SCANS_EVERY_VIEW);

  // ★ BROKEN ONCE, AGAINST A REAL RENDER rather than a synthetic figure. A 7x7
  // puncture well inside Tank's profile reproduces the shape of the defect that
  // shipped — a compact pocket of background with the figure all round it — and
  // is caught at 49 pixels against the 45 that were actually there.
  it('fires when a delivered view is punctured', async () => {
    const path = join(concepts, 'tank-profile-review.png');
    const { data, info } = await sharp(path).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    expect((await measure(path)).largest).toBe(0);

    // Somewhere solidly opaque, so the puncture is enclosed rather than a bite
    // out of the silhouette.
    let hole = null;
    for (let y = 12; y < height - 12 && !hole; y++) {
      for (let x = 12; x < width - 12; x++) {
        let solid = true;
        for (let dy = -10; dy <= 10 && solid; dy++) {
          for (let dx = -10; dx <= 10; dx++) {
            if (data[((y + dy) * width + (x + dx)) * channels + 3] < 250) { solid = false; break; }
          }
        }
        if (solid) { hole = [x, y]; break; }
      }
    }
    expect(hole).not.toBeNull();
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        data[((hole[1] + dy) * width + (hole[0] + dx)) * channels + 3] = 0;
      }
    }
    expect(largestEnclosedBlob(data, width, height, channels).largest).toBe(49);
  });
});
