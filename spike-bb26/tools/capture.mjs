// Deterministic capture. Two modes:
//
//   node tools/capture.mjs --views pitching,batting [--seed 1] [--frames 180]
//     Spawns the spike's vite (5299), drives ?view=&seed=, steps the clock by
//     hand via window.__spike.step() (never rAF — headless tabs throttle it),
//     writes shots/<view>-iterNNN.png and shots/<view>-latest.png at 1920×1080.
//
//   node tools/capture.mjs --external "http://localhost:5173/v2/?play=1" \
//       --name v2-baseline/pitching [--settle 4000]
//     Captures an arbitrary running page (used once for the v2 baseline) into
//     reference/<name>.png. Tries __spike.step if the page exposes it,
//     otherwise settles on wall-clock.
//
// Chassis cloned from scripts/v2/capture-character-evidence.mjs in the parent
// repo (vite --strictPort spawn, playwright, wait for window.__spike).

import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const PORT = 5299;
const VIEWPORT = { width: 1920, height: 1080 };

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function startVite() {
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: root,
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

function nextIter(dir, view) {
  mkdirSync(dir, { recursive: true });
  const n = readdirSync(dir)
    .map((f) => f.match(new RegExp(`^${view}-iter(\\d+)\\.png$`)))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .reduce((a, b) => Math.max(a, b), 0);
  return String(n + 1).padStart(3, '0');
}

async function stepWorld(page, frames) {
  // Chunked so a long settle doesn't hit evaluate timeouts.
  for (let done = 0; done < frames; done += 60) {
    const n = Math.min(60, frames - done);
    await page.evaluate((count) => {
      for (let i = 0; i < count; i += 1) window.__spike.step(16.7);
    }, n);
  }
}

async function main() {
  const external = arg('external');
  const browser = await chromium.launch({ args: process.env.CI ? ['--no-sandbox'] : [] });
  const page = await browser.newPage({ viewport: VIEWPORT });
  let vite = null;
  try {
    if (external) {
      const name = arg('name');
      if (!name) throw new Error('--external needs --name <path-under-reference/>');
      await page.goto(external, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const hasSpike = await page
        .waitForFunction('!!window.__spike', { timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (hasSpike) await stepWorld(page, Number(arg('frames', '180'))).catch(() => {});
      await page.waitForTimeout(Number(arg('settle', '4000')));
      const out = join(root, 'reference', `${name}.png`);
      mkdirSync(dirname(out), { recursive: true });
      await page.screenshot({ path: out });
      console.log(`✓ ${out}`);
    } else {
      const views = (arg('views', 'pitching')).split(',');
      const seed = arg('seed', '1');
      const frames = Number(arg('frames', '180'));
      const shots = join(root, 'shots');
      vite = await startVite();
      for (const view of views) {
        await page.goto(`http://localhost:${PORT}/?view=${view}&seed=${seed}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        await page.waitForFunction('!!window.__spike?.ready', { timeout: 30_000 });
        await stepWorld(page, frames);
        const iter = nextIter(shots, view);
        const out = join(shots, `${view}-iter${iter}.png`);
        await page.screenshot({ path: out });
        copyFileSync(out, join(shots, `${view}-latest.png`));
        console.log(`✓ ${out}`);
      }
    }
  } finally {
    await browser.close();
    if (vite) vite.kill();
  }
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
