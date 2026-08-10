// ---------------------------------------------------------------------------
// Refresh a character's RUNTIME evidence — the hero, run and contact stills
// the fidelity board composites and `authored-character.test.js` requires.
//
// Before this script the three `<slug>-runtime-*.png` files were hand-shot in
// a browser, which meant they silently went stale: Junebug's palette fix
// shipped while the board still showed the pale pre-fix captures, because
// nothing regenerated them when the GLB changed. Evidence that a human must
// remember to refresh is evidence that lies eventually.
//
// It drives the real review surface (`/v2/?anims=1&kid=<id>`) in headless
// Chromium: waits for the page to report `model model` (a proxy fallback is
// never fidelity evidence — playbook Gate 4), selects each clip through the
// same buttons a human reviewer clicks, catches the CONTACT marker flash for
// the swing still, and overwrites the three PNGs in docs/v2/concepts/.
// Re-run `npm run review:character-fidelity -- <id>` afterwards to rebuild
// the board from the fresh captures.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

import { SLUGS } from './render-character-fidelity.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const concepts = join(repo, 'docs', 'v2', 'concepts');
const PORT = 5199;

// Viewport matches the original hand-captured evidence, so the board layout
// keeps compositing at the same aspect.
const VIEWPORT = { width: 1059, height: 804 };

const CAPTURES = [
  { clip: 'idle', out: 'hero', settleMs: 1500 },
  { clip: 'run', out: 'run', settleMs: 1200 },
  // '◉ MARKER' is the flash the readout paints ON the marker frame; the
  // static '· CONTACT@7' annotation is present from frame 0 and must not
  // satisfy the wait, or the still shows the load instead of the contact.
  { clip: 'swing_contact', out: 'swing', waitForMarker: '◉ MARKER' },
];

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

async function captureCharacter(page, id, slug) {
  await page.goto(`http://localhost:${PORT}/v2/?anims=1&kid=${id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForFunction('!!window.__spike', { timeout: 30_000 });

  // `model model`: the delivered GLB on the shared skeleton. A proxy fallback
  // rendering here means the manifest or the model is broken — fail loudly
  // rather than photograph the wrong thing (playbook Gate 4).
  await page.waitForFunction(
    () => /model\s+model/.test(document.getElementById('devstats')?.textContent ?? ''),
    { timeout: 30_000 }
  );

  for (const capture of CAPTURES) {
    const row = page.locator('.anim-list button', { hasText: capture.clip }).first();
    await row.click();
    if (capture.waitForMarker) {
      // The readout flashes the marker name on the frame it lands. Catch it
      // live so the still shows the bat AT the ball, not the follow-through.
      await page
        .waitForFunction(
          (marker) => (document.body.textContent ?? '').includes(marker),
          capture.waitForMarker,
          { timeout: 8_000 }
        )
        .catch(() => {
          console.warn(`  ⚠ ${capture.clip}: marker flash not observed; capturing current frame`);
        });
    } else {
      await page.waitForTimeout(capture.settleMs);
    }
    const output = join(concepts, `${slug}-runtime-${capture.out}.png`);
    await page.screenshot({ path: output });
    console.log(`✓ ${output}`);
  }
}

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) throw new Error('pass one or more authored character ids');
  for (const id of ids) {
    if (!SLUGS[id]) throw new Error(`no evidence slug for "${id}" — add it to SLUGS in render-character-fidelity.mjs`);
  }
  const vite = await startVite();
  const browser = await chromium.launch({ args: process.env.CI ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    for (const id of ids) await captureCharacter(page, id, SLUGS[id]);
  } finally {
    await browser.close();
    vite.kill();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  });
}
