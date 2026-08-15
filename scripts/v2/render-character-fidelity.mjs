// Build the mandatory concept/runtime side-by-side evidence board. The source
// scores live in assets/v2/source/character-fidelity.json; this file renders
// evidence and never decides whether a character passed.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

import { AUTHORED_CHARACTERS, slugFor } from './character-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const concepts = join(repo, 'docs', 'v2', 'concepts');
const fidelityPath = join(repo, 'assets', 'v2', 'source', 'character-fidelity.json');
const renderer = join(here, 'blender', 'render-fidelity-views.py');
const fidelity = JSON.parse(readFileSync(fidelityPath, 'utf8'));


// ★ THE 40-PIXEL PANEL IS 280px TALL AND NOTHING MAY BE COMPOSITED OVER IT.
//
// The zoom strip is the one panel whose evidence IS its pixels: it is the 40px
// field read blown up 7x with a nearest kernel so a reviewer can count what
// survives at gameplay scale. It ran 620..900 while the animation thumbnails
// composited at top:840 — and sharp composites in source order, so on all 30
// boards the run/contact stills painted over the bottom 31px of it. That is 4.4
// of the 40 source pixels: the shoes and ankles, gone from every board, on the
// one panel where a missing pixel is the finding. The "Authored model
// deformation" label at y:825 overprinted the shins on top of that.
//
// It went unnoticed because the strip is bottom-padded — the figure does not
// reach y:900, so the cut lands mid-shin and reads as a short character rather
// than a clipped one. Several critic notes reason explicitly about feet at 40px
// ("the feet no longer fuse", "ankle daylight 48.5%"); whatever those measured,
// it was not this panel.
//
// So the animation row moved BELOW the strip rather than the strip shrinking:
// the zoom factor is the instrument, and trading it away to reclaim 60px would
// have quietly made the panel a worse ruler to fix a layout bug. The board grew
// instead. Keep ANIM_LABEL_Y's cap-height clear of ZOOM_TOP + 280 = 900.
const BOARD_H = 1150;
const ZOOM_TOP = 620;          // strip occupies 620..900
const ANIM_LABEL_Y = 935;      // 20px cap height -> glyphs start ~915, clear of 900
const ANIM_TOP = 950;          // thumbnails are 180 tall -> 950..1130, inside BOARD_H

function svgText(width, height, content) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <style>.title{font:700 32px system-ui;fill:#f7f0dc}.label{font:700 20px system-ui;fill:#f7f0dc}.small{font:600 16px system-ui;fill:#b9c7d8}.pass{fill:#89d185}.hold{fill:#f4bf67}</style>
    ${content}
  </svg>`);
}

async function fit(path, width, height, background = { r: 18, g: 27, b: 39, alpha: 1 }) {
  return sharp(path).resize(width, height, { fit: 'contain', background }).png().toBuffer();
}

// The guard for the rule above. Only layers composited AFTER the strip can cover
// it, which is why this walks the tail of the list rather than the whole of it.
// The `labels` layer is full-canvas and transparent, so it is exempt by name —
// its own overprinting risk is ANIM_LABEL_Y, checked separately.
function assertZoomStripUncovered(layers, slug) {
  const index = layers.findIndex((layer) => layer.width && layer.top === ZOOM_TOP);
  const strip = layers[index];
  const bottom = ZOOM_TOP + strip.height;
  for (const layer of layers.slice(index + 1)) {
    if (!layer.width) continue;                       // full-canvas transparent text
    const clash = layer.left < 850 + strip.width && layer.left + layer.width > 850
      && layer.top < bottom && layer.top + layer.height > ZOOM_TOP;
    if (clash) throw new Error(
      `${slug}: a layer at (${layer.left},${layer.top}) ${layer.width}x${layer.height} covers the ` +
      `40px zoom strip (850,${ZOOM_TOP} ${strip.width}x${strip.height}). Move that layer below ` +
      `y=${bottom} and grow BOARD_H to fit — do not shrink the strip, its zoom factor is the instrument.`
    );
  }
  if (ANIM_LABEL_Y - 20 < bottom) throw new Error(
    `${slug}: ANIM_LABEL_Y=${ANIM_LABEL_Y} puts label glyphs over the 40px zoom strip, which ends at ` +
    `y=${bottom}. Set it to at least ${bottom + 20}.`
  );
  if (ANIM_TOP + 180 > BOARD_H) throw new Error(
    `${slug}: the animation row runs to y=${ANIM_TOP + 180}, past BOARD_H=${BOARD_H}. Grow BOARD_H.`
  );
}

async function board(id) {
  const character = AUTHORED_CHARACTERS[id];
  const review = fidelity.characters[id];
  const slug = slugFor(id);
  if (!character || !review) throw new Error(`missing fidelity configuration for ${id}`);

  const run = spawnSync(process.env.BLENDER ?? 'blender', [
    '--background', '--factory-startup', '--python', renderer, '--', id, slug,
  ], { cwd: repo, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`front/profile render failed for ${id}\n${run.stdout}\n${run.stderr}`);

  const concept = await fit(join(concepts, character.concept), 760, 380, { r: 246, g: 238, b: 220, alpha: 1 });
  const frontPath = join(concepts, `${slug}-front-review.png`);
  const profilePath = join(concepts, `${slug}-profile-review.png`);
  const front = await fit(frontPath, 300, 420);
  const profile = await fit(profilePath, 300, 420);
  // ★ PREFER THE REGENERATED HERO OVER THE HAND-SHOT ONE.
  //
  // `<slug>-in-game-review.png` was captured by hand and nothing refreshes it,
  // which is exactly the failure `capture-character-evidence.mjs` was written to
  // end — and it recurred: an independent review found Tank's board compositing
  // a hero eleven hours older than his GLB, showing a character that no longer
  // existed. `<slug>-runtime-hero.png` is rewritten on every evidence capture,
  // so it cannot go stale without the whole board going stale with it.
  //
  // Falls back to the hand-shot file for the characters that have no captured
  // hero yet, so this fixes the ones it can and breaks none of the others.
  const captured = `${slug}-runtime-hero.png`;
  const heroName = review.heroEvidence
    ?? (existsSync(join(concepts, captured)) ? captured : `${slug}-in-game-review.png`);
  const hero = await fit(join(concepts, heroName), 760, 430);
  const animationPaths = (review.animationEvidence ?? []).map((name) => join(concepts, name));
  const animationImages = [];
  for (const path of animationPaths.slice(0, 2)) {
    if (existsSync(path)) animationImages.push(await fit(path, 320, 180));
  }
  const field40 = await sharp(frontPath).resize({ height: 40, fit: 'contain' }).png().toBuffer();
  const fieldZoom = await sharp(field40).resize({ height: 280, kernel: 'nearest' }).png().toBuffer();
  // A null score is an abstention, not a zero — see authored-character.test.js.
  // It has to print as such, because the board IS the evidence a reviewer reads.
  const categoryLines = Object.values(review.categories).map((category, index) =>
    `<text class="small" x="1110" y="${630 + index * 30}">${category.label}: ` +
    `${category.score === null ? 'n/a' : `${category.score}/5`}</text>`
  ).join('');
  const statusClass = review.status === 'approved' ? 'pass' : 'hold';
  const labels = svgText(1600, BOARD_H, `
    <text class="title" x="40" y="42">${character.name} — concept/runtime fidelity gate</text>
    <text class="${statusClass} label" x="1210" y="42">${review.status.toUpperCase()}</text>
    <text class="label" x="40" y="78">Approved turnaround</text>
    <text class="label" x="840" y="78">Delivered front / profile silhouette</text>
    <text class="label" x="40" y="500">Runtime hero read</text>
    <text class="label" x="840" y="500">40-pixel gameplay read</text>
    ${animationImages.length ? `<text class="label" x="840" y="${ANIM_LABEL_Y}">Authored model deformation — run / contact</text>` : ''}
    ${categoryLines}
  `);

  const output = join(concepts, `${slug}-fidelity-review.png`);
  const zoomMeta = await sharp(fieldZoom).metadata();
  const layers = [
    { input: concept, left: 40, top: 92 },
    { input: front, left: 850, top: 84 },
    { input: profile, left: 1190, top: 84 },
    { input: hero, left: 40, top: 520 },
    { input: field40, left: 960, top: 560 },
    { input: fieldZoom, left: 850, top: ZOOM_TOP, width: zoomMeta.width, height: zoomMeta.height },
    ...animationImages.map((input, index) => ({
      input, left: 840 + index * 340, top: ANIM_TOP, width: 320, height: 180,
    })),
    { input: labels, left: 0, top: 0 },
  ];
  assertZoomStripUncovered(layers, slug);
  await sharp({ create: { width: 1600, height: BOARD_H, channels: 4, background: '#121b27' } })
    .composite(layers.map(({ input, left, top }) => ({ input, left, top })))
    .png().toFile(output);
  console.log(`✓ ${output}`);
}

async function main() {
  const ids = process.argv.slice(2);
  for (const id of ids.length ? ids : Object.keys(AUTHORED_CHARACTERS)) await board(id);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
}
