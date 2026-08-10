// Build the mandatory concept/runtime side-by-side evidence board. The source
// scores live in assets/v2/source/character-fidelity.json; this file renders
// evidence and never decides whether a character passed.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

import { AUTHORED_CHARACTERS } from './export-authored-character.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const concepts = join(repo, 'docs', 'v2', 'concepts');
const fidelityPath = join(repo, 'assets', 'v2', 'source', 'character-fidelity.json');
const renderer = join(here, 'blender', 'render-fidelity-views.py');
const fidelity = JSON.parse(readFileSync(fidelityPath, 'utf8'));

const SLUGS = {
  nostrike: 'junebug', calls_shot: 'theo', wheelchair_ace: 'zoom',
  big_lou: 'big-lou', tank: 'tank', mimi_mash: 'mimi-mash',
};

function svgText(width, height, content) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <style>.title{font:700 32px system-ui;fill:#f7f0dc}.label{font:700 20px system-ui;fill:#f7f0dc}.small{font:600 16px system-ui;fill:#b9c7d8}.pass{fill:#89d185}.hold{fill:#f4bf67}</style>
    ${content}
  </svg>`);
}

async function fit(path, width, height, background = { r: 18, g: 27, b: 39, alpha: 1 }) {
  return sharp(path).resize(width, height, { fit: 'contain', background }).png().toBuffer();
}

async function board(id) {
  const character = AUTHORED_CHARACTERS[id];
  const review = fidelity.characters[id];
  const slug = SLUGS[id];
  if (!character || !review || !slug) throw new Error(`missing fidelity configuration for ${id}`);

  const run = spawnSync(process.env.BLENDER ?? 'blender', [
    '--background', '--factory-startup', '--python', renderer, '--', id, slug,
  ], { cwd: repo, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`front/profile render failed for ${id}\n${run.stdout}\n${run.stderr}`);

  const concept = await fit(join(concepts, character.concept), 760, 380, { r: 246, g: 238, b: 220, alpha: 1 });
  const frontPath = join(concepts, `${slug}-front-review.png`);
  const profilePath = join(concepts, `${slug}-profile-review.png`);
  const front = await fit(frontPath, 300, 420);
  const profile = await fit(profilePath, 300, 420);
  const heroName = id === 'mimi_mash' ? 'mimi-mash-runtime-hero.png' : `${slug}-in-game-review.png`;
  const hero = await fit(join(concepts, heroName), 760, 430);
  const field40 = await sharp(frontPath).resize({ height: 40, fit: 'contain' }).png().toBuffer();
  const fieldZoom = await sharp(field40).resize({ height: 280, kernel: 'nearest' }).png().toBuffer();
  const categoryLines = Object.values(review.categories).map((category, index) =>
    `<text class="small" x="1110" y="${630 + index * 30}">${category.label}: ${category.score}/5</text>`
  ).join('');
  const statusClass = review.status === 'approved' ? 'pass' : 'hold';
  const labels = svgText(1600, 1050, `
    <text class="title" x="40" y="42">${character.name} — concept/runtime fidelity gate</text>
    <text class="${statusClass} label" x="1210" y="42">${review.status.toUpperCase()}</text>
    <text class="label" x="40" y="78">Approved turnaround</text>
    <text class="label" x="840" y="78">Delivered front / profile silhouette</text>
    <text class="label" x="40" y="500">Runtime hero read</text>
    <text class="label" x="840" y="500">40-pixel gameplay read</text>
    ${categoryLines}
  `);

  const output = join(concepts, `${slug}-fidelity-review.png`);
  await sharp({ create: { width: 1600, height: 1050, channels: 4, background: '#121b27' } })
    .composite([
      { input: concept, left: 40, top: 92 },
      { input: front, left: 850, top: 84 },
      { input: profile, left: 1190, top: 84 },
      { input: hero, left: 40, top: 520 },
      { input: field40, left: 960, top: 560 },
      { input: fieldZoom, left: 850, top: 620 },
      { input: labels, left: 0, top: 0 },
    ]).png().toFile(output);
  console.log(`✓ ${output}`);
}

async function main() {
  const ids = process.argv.slice(2);
  for (const id of ids.length ? ids : Object.keys(AUTHORED_CHARACTERS)) await board(id);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
}
