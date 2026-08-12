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

import { CHARACTERS, slugFor } from './character-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const concepts = join(repo, 'docs', 'v2', 'concepts');
const PORT = 5199;

// Viewport matches the original hand-captured evidence, so the board layout
// keeps compositing at the same aspect.
const VIEWPORT = { width: 1059, height: 804 };

const CAPTURES = [
  { clip: 'idle', out: 'hero', settleMs: 1500 },
  // ★ AT A REACH, NOT WHEREVER THE CLOCK LANDED. This still is the deformation
  // evidence rubric 3.11 and 4.3 are scored from, and a fixed 1200ms wait
  // photographed an arbitrary frame of a 24-frame loop. Round 5 drew exactly
  // the wrong conclusion from one — "both arms hang nearly straight at hip
  // level with no swing" off frame 16/24, which is a PASS, where straight arms
  // are what the pose means. Every run cycle in proceduralClips.ts now peaks a
  // quarter of the way through, so frame 25% is a full stretch for all of them.
  // ⚠️ TARGETED TWO FRAMES EARLY ON PURPOSE. `page.screenshot()` is not
  // instantaneous and the clip keeps running underneath it: aiming at the
  // reach (frame 6 of 24) delivered frame 8, a near-crossing pose whose foot
  // split is 0.36ft against the cycle's own 2.89ft maximum — the least
  // informative frame in the loop, and the second round in a row where the
  // still argued against the animation. 0.17 lands the SHOT on the reach.
  { clip: 'run', out: 'run', settleMs: 1200, atFrameFrac: 0.17 },
  // Screenshot at the marker: wait until the readout's CURRENT frame reaches
  // the clip's declared marker frame. The spike's '◉ MARKER' flash fires on
  // an exact frame-equality check, and a headless renderer running below full
  // rate can step 5→8 and never equal 7 — waiting for the flash was flaky in
  // exactly that way. The static '· CONTACT@7' annotation alone must never
  // satisfy the wait either, or the still shows the load instead of contact.
  { clip: 'swing_contact', out: 'swing', atMarker: true },
  // ★ THE EXPRESSION SHEET, which rubric 3.14 asks for by name and which no
  // surface produced until now: "lips, teeth and tongue where a cell opens the
  // mouth, never a stroke that collapses to a line", judged in gameplay
  // lighting. Two consecutive reviews had to record 3.14 as unverifiable — not
  // a finding about any character, a hole in the instrument. `grin`, `cheer`
  // and `tongue` are the three cells that open the mouth; `angry` is here
  // because it is the beat the draft card and the pitch reaction lean on.
  { clip: 'idle', out: 'face-grin', settleMs: 500, face: 'grin' },
  { clip: 'idle', out: 'face-cheer', settleMs: 500, face: 'cheer' },
  { clip: 'idle', out: 'face-tongue', settleMs: 500, face: 'tongue' },
  { clip: 'idle', out: 'face-angry', settleMs: 500, face: 'angry' },
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
    if (capture.face) {
      // Click the face button round to the named cell. It cycles FACE_CELLS in
      // order and prints the current cell, so this is a wait-and-press rather
      // than an index guess — a reordered atlas moves the button, not this.
      const faceBtn = page.locator('button', { hasText: /^😐/ }).first();
      for (let press = 0; press < 20; press++) {
        if ((await faceBtn.textContent())?.includes(capture.face)) break;
        await faceBtn.click();
      }
      if (!(await faceBtn.textContent())?.includes(capture.face)) {
        throw new Error(`could not reach face cell "${capture.face}" — is it still in FACE_CELLS?`);
      }
    }
    if (capture.atMarker) {
      await page
        .waitForFunction(
          () => {
            const readout = (document.body.textContent ?? '').match(/frame\s*(\d+)\s*\/\s*\d+[^@]*@(\d+)/);
            return readout !== null && Number(readout[1]) >= Number(readout[2]);
          },
          { timeout: 8_000 }
        )
        .catch(() => {
          console.warn(`  ⚠ ${capture.clip}: marker frame not reached; capturing current frame`);
        });
    } else if (capture.atFrameFrac !== undefined) {
      // ⚠️ A `>=` WAIT ON A LOOPING CLIP OVERSHOOTS, and by enough to matter: a
      // first attempt targeted frame 6 of 24 and the screenshot landed on 9,
      // because the page keeps animating between the predicate resolving and
      // the shot being taken. Drop to the slowest rate the page offers (0.6x,
      // the '1' key) and poll for EXACT equality, which at that rate the frame
      // readout holds for two render ticks or so. The rate goes back to 1.0x
      // afterwards so the remaining captures are unaffected.
      await page.keyboard.press('1');
      await page.locator('.anim-list button', { hasText: capture.clip }).first().click();
      await page
        .waitForFunction(
          (frac) => {
            const readout = (document.body.textContent ?? '').match(/frame\s*(\d+)\s*\/\s*(\d+)/);
            if (readout === null) return false;
            return Number(readout[1]) === Math.round(Number(readout[2]) * frac);
          },
          capture.atFrameFrac,
          { timeout: 12_000, polling: 'raf' }
        )
        .catch(() => {
          console.warn(`  ⚠ ${capture.clip}: exact target frame not caught; capturing current frame`);
        });
    } else {
      await page.waitForTimeout(capture.settleMs);
    }
    const output = join(concepts, `${slug}-runtime-${capture.out}.png`);
    // Read the frame BEFORE the shot and before restoring the rate: the rate
    // keys call playCurrent(), which restarts the clip, so a reading taken
    // afterwards reports frame 1 of a fresh loop and says nothing about the
    // still that was just saved.
    const landed = (await page.textContent('body'))?.match(/frame\s*(\d+)\s*\/\s*(\d+)/);
    await page.screenshot({ path: output });
    if (capture.atFrameFrac !== undefined) await page.keyboard.press('2');
    console.log(`✓ ${output}${landed ? `  (frame ${landed[1]}/${landed[2]})` : ''}`);
  }
}

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) throw new Error('pass one or more authored character ids');
  for (const id of ids) {
    if (!CHARACTERS[id]) {
      throw new Error(`unknown character "${id}" — add it to scripts/v2/character-registry.json`);
    }
  }
  const vite = await startVite();
  const browser = await chromium.launch({ args: process.env.CI ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    for (const id of ids) await captureCharacter(page, id, slugFor(id));
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
