// ---------------------------------------------------------------------------
// Pin the BB2026 parity evidence — reference | v2 | spike, as pixels, per
// dimension of the gap list.
//
// The failure this prevents: parity claims made from memory instead of pinned
// pixels. "v2's park reads about as warm as Cement Gardens now" is exactly the
// kind of sentence that gets written from a two-day-old mental image of a
// surface that has since changed. The gap list in
// docs/research/backyard-2026-reference.md is worked top-down, and every
// "closed enough" judgement in it is only as good as the stills it was made
// from. This script regenerates those stills from the live surfaces on demand,
// so a parity judgement is always made against what the game renders TODAY.
//
// What it captures, into docs/v2/parity/ (PNGs are per-run output, kept out of
// git by the scoped .gitignore there — unlike docs/v2/concepts, whose boards
// are curated one-per-character approval evidence and are committed):
//
//   play-batting.png    /v2/?play=1 at settle — top 1, the player at bat.
//   play-pitching.png   the same game once the HUD shows the bottom half (▼).
//                       No input is sent; called strikes retire the side. If
//                       the half never flips inside the wait, it warns and
//                       captures the current frame rather than failing.
//   roster-grid.png     /v2/?spike=1&roster=1 — all 30 models, one grid.
//   venue-park.png      /v2/?spike=1&venue=park — the Look Spike's park wide.
//   venue-park-night.png  /v2/?play=1&venue=park&night=1 — night only exists
//                       on the game surface (the Look Spike has no night rig),
//                       so the night twin is shot there, not on the spike.
//   character-<id>.png  /v2/?anims=1&kid=<id> hero for each delivered id given
//                       on argv (default: nostrike). A proxy fallback fails
//                       loudly — a stand-in is never parity evidence.
//
// When the local reference corpus is present (the spike checkout at
// ../recess-spike-bb26/spike-bb26, whose reference-manifest.json maps each
// view/dimension to its anchor frames), it also composites a
// parity-<name>.png contact sheet — reference | v2 | spike — beside each
// capture, using the spike's shots/<view>-latest.png when one exists. The
// corpus is a 690MB local-only directory: CI does not have it, so its absence
// is a warning and a skip, never a failure. And this file is deliberately NOT
// named *.test.* — it drives a browser for minutes and belongs to a human's
// review loop, not to vitest's include or CI.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const outDir = join(repo, 'docs', 'v2', 'parity');
const spikeRoot = resolve(repo, '..', 'recess-spike-bb26', 'spike-bb26');
const manifestPath = join(spikeRoot, 'reference-manifest.json');
const PORT = 5199;

// Matches the hand-captured evidence viewport the fidelity boards composite at,
// so panels from both pipelines sit side by side at the same aspect.
const VIEWPORT = { width: 1059, height: 804 };

function startVite() {
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: repo,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolveStart, reject) => {
    const t = setTimeout(() => reject(new Error('vite did not start in 30s')), 30_000);
    p.stdout.on('data', (d) => {
      if (String(d).includes('ready in')) {
        clearTimeout(t);
        resolveStart(p);
      }
    });
    p.on('error', reject);
  });
}

async function settleOn(page, path) {
  await page.goto(`http://localhost:${PORT}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  // NB: playwright's waitForFunction is (fn, ARG, options) — options passed in
  // the second slot are silently taken as the page-function argument and the
  // 30s default applies. That exact slip made the bottom-half wait below time
  // out at 30s while claiming 300, so every wait here fills the arg slot.
  await page.waitForFunction('!!window.__spike', null, { timeout: 30_000 });
}

async function shoot(page, name) {
  const output = join(outDir, name);
  await page.screenshot({ path: output });
  console.log(`✓ ${output}`);
  return output;
}

async function capturePlay(page) {
  // Seeded so the two stills come from the same reproducible game every run.
  await settleOn(page, '/v2/?play=1&seed=parity');
  await page.waitForTimeout(5_000);
  await shoot(page, 'play-batting.png');

  // The scoreboard's half mark is ▲ for the top and ▼ for the bottom
  // (scoreboardModel.halfMark), so ▼ appearing in the HUD is the deterministic
  // "now the game is in the pitching half" signal. The half must be DRIVEN
  // there: with the human's verbs live the sim waits on a human forever (a
  // 420s hands-off wait, and a 300s blind-tapping wait, both died still in the
  // top of the 1st when this was built). `window.__spike` is the GameView on
  // this surface, and `setControlMode('watch')` hands both sides to the CPU —
  // the sanctioned hands-free mode, whose contract is exactly that nothing
  // waits on a hidden human (controlMode.ts) — so the half plays itself out.
  await page.evaluate(() => window.__spike.setControlMode('watch'));
  await page
    .waitForFunction(
      () =>
        (document.body.textContent ?? '').includes('▼') ||
        window.__spike?.frame?.half === 'bottom',
      null,
      { timeout: 300_000 }
    )
    .catch(() => {
      console.warn('  ⚠ play: bottom half (▼) not reached; capturing current frame');
    });
  await page.waitForTimeout(2_000);
  await shoot(page, 'play-pitching.png');
}

async function captureRoster(page) {
  await settleOn(page, '/v2/?spike=1&roster=1');
  await page.waitForTimeout(8_000); // 30 models stream in; let the grid fill
  await shoot(page, 'roster-grid.png');
}

async function captureVenue(page) {
  await settleOn(page, '/v2/?spike=1&venue=park');
  await page.waitForTimeout(5_000);
  await shoot(page, 'venue-park.png');

  // Night lives on the game surface only — the Look Spike has no night rig, so
  // ?night=1 there would silently shoot an identical daytime twin.
  await settleOn(page, '/v2/?play=1&venue=park&night=1&seed=parity');
  await page.waitForTimeout(5_000);
  await shoot(page, 'venue-park-night.png');
}

async function captureCharacter(page, id) {
  await settleOn(page, `/v2/?anims=1&kid=${id}`);
  // `model model`: the delivered GLB on the shared skeleton. A proxy fallback
  // here means the manifest or the model is broken — fail loudly rather than
  // photograph the wrong thing (playbook Gate 4).
  await page.waitForFunction(
    () => /model\s+model/.test(document.getElementById('devstats')?.textContent ?? ''),
    null,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(1_500);
  await shoot(page, `character-${id}.png`);
}

// --- contact sheets: reference | v2 | spike ---------------------------------

const PANEL = { width: 500, height: 380 };

function svgText(width, height, content) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <style>.title{font:700 28px system-ui;fill:#f7f0dc}.label{font:700 20px system-ui;fill:#f7f0dc}.small{font:600 16px system-ui;fill:#b9c7d8}</style>
    ${content}
  </svg>`);
}

async function fit(path, width, height, background = { r: 18, g: 27, b: 39, alpha: 1 }) {
  return sharp(path).resize(width, height, { fit: 'contain', background }).png().toBuffer();
}

async function sheet(name, anchorPath, v2Path, spikePath) {
  const panels = [
    { label: 'BB2026 reference', path: anchorPath },
    { label: 'v2 today', path: v2Path },
    { label: 'spike latest', path: spikePath },
  ];
  const width = 40 + panels.length * (PANEL.width + 20);
  const height = PANEL.height + 130;
  const composites = [];
  let labelSvg = `<text class="title" x="40" y="42">${name} — reference | v2 | spike</text>`;
  for (const [index, panel] of panels.entries()) {
    const left = 40 + index * (PANEL.width + 20);
    labelSvg += `<text class="label" x="${left}" y="86">${panel.label}</text>`;
    if (panel.path && existsSync(panel.path)) {
      composites.push({ input: await fit(panel.path, PANEL.width, PANEL.height), left, top: 100 });
    } else {
      labelSvg += `<text class="small" x="${left}" y="${100 + PANEL.height / 2}">— no still —</text>`;
    }
  }
  const output = join(outDir, `parity-${name}.png`);
  await sharp({ create: { width, height, channels: 4, background: '#121b27' } })
    .composite([...composites, { input: svgText(width, height, labelSvg), left: 0, top: 0 }])
    .png()
    .toFile(output);
  console.log(`✓ ${output}`);
}

async function compositeSheets(characterIds) {
  if (!existsSync(manifestPath)) {
    console.warn(`⚠ reference corpus not found at ${spikeRoot} — skipping contact sheets (captures above still stand)`);
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const anchor = (rel) => (rel ? join(spikeRoot, 'reference', rel) : null);
  const spikeShot = (view) => join(spikeRoot, 'shots', `${view}-latest.png`);
  const rows = [
    { name: 'batting', anchor: anchor(manifest.views?.batting?.anchor), v2: 'play-batting.png', spike: spikeShot('batting') },
    { name: 'pitching', anchor: anchor(manifest.views?.pitching?.anchor), v2: 'play-pitching.png', spike: spikeShot('pitching') },
    { name: 'roster', anchor: anchor(manifest.dimensions?.character?.[0]), v2: 'roster-grid.png', spike: spikeShot('roster') },
    { name: 'venue', anchor: anchor(manifest.dimensions?.venue?.[2]), v2: 'venue-park.png', spike: spikeShot('venue') },
    ...characterIds.map((id) => ({
      name: `character-${id}`,
      anchor: anchor(manifest.dimensions?.character?.[1]),
      v2: `character-${id}.png`,
      spike: spikeShot('character'),
    })),
  ];
  for (const row of rows) {
    const v2Path = join(outDir, row.v2);
    if (!existsSync(v2Path)) continue;
    await sheet(row.name, row.anchor, v2Path, row.spike);
  }
}

async function main() {
  const characterIds = process.argv.slice(2);
  const ids = characterIds.length ? characterIds : ['nostrike'];
  mkdirSync(outDir, { recursive: true });
  // Scoped ignore: these PNGs are per-run review output and the sheets need a
  // 690MB local-only corpus to rebuild — they must never land in git.
  const scopedIgnore = join(outDir, '.gitignore');
  if (!existsSync(scopedIgnore)) writeFileSync(scopedIgnore, '*\n!.gitignore\n');

  const vite = await startVite();
  const browser = await chromium.launch({ args: process.env.CI ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await capturePlay(page);
    await captureRoster(page);
    await captureVenue(page);
    for (const id of ids) await captureCharacter(page, id);
  } finally {
    await browser.close();
    vite.kill();
  }
  await compositeSheets(ids);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  });
}
