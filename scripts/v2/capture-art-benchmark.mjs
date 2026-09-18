// Capture a real at-bat, through its outcome, with HUD at both review sizes.
// No canvas fallback: a missing HUD is incomplete evidence, not a good capture.
// rAF is disabled in this instrument's isolated browser before the app boots;
// every frame is advanced by devPaint, two 60Hz frames per 30fps sample.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root } from './art-review-context.mjs';
import { VIEWPORTS, digest, sourceDigest } from './art-review.mjs';
const port = Number(process.env.ART_REVIEW_PORT ?? 5187);
const out = join(root, '.art-review/evidence/benchmark-park');
const evidence = [];
const profile = process.argv.find(a => a.startsWith('--profile='))?.slice(10);
if (profile && !Object.keys(VIEWPORTS).flatMap(s => ['day', 'night'].map(l => `${s}-${l}`)).includes(profile)) throw new Error(`Unknown profile ${profile}`);
let server, browser;
async function main() {
  mkdirSync(out, { recursive: true });
  const hash = sourceDigest(root);
  server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('Vite did not start')), 30000);
    server.stdout.on('data', d => { if (String(d).includes('ready in')) { clearTimeout(timer); done(); } });
    server.stderr.on('data', d => process.stderr.write(d));
    server.on('error', e => { clearTimeout(timer); fail(e); });
    server.on('exit', code => { clearTimeout(timer); fail(new Error(`Vite exited ${code}`)); });
  });
  browser = await chromium.launch({ args: process.env.CI ? ['--no-sandbox'] : [] });
  for (const [size, viewport] of Object.entries(VIEWPORTS)) for (const light of ['day', 'night']) {
    const id = `${size}-${light}`;
    if (profile && id !== profile) continue;
    const folder = join(out, id);
    mkdirSync(folder, { recursive: true });
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', msg => { if (/proxy|failed to load/i.test(msg.text())) errors.push(msg.text()); });
    await page.addInitScript(() => {
      window.requestAnimationFrame = () => 0;
      window.cancelAnimationFrame = () => {};
    });
    const url = `/v2/?play=1&seed=art-benchmark&venue=park${light === 'night' ? '&night=1' : ''}`;
    await page.goto(`http://localhost:${port}${url}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => !!window.__spike?.refs?.kids?.size, null, { polling: 100, timeout: 60000 });
    const probe = await page.evaluate(() => {
      const s = window.__spike;
      window.__artPa = 0;
      s.onSimEvent(e => { if (e.t === 'pa') window.__artPa++; });
      s.setControlMode('watch');
      s.devStepFixedClock(0);
      s.devPaint(1);
      const f = s.scoreboard();
      return { batter: f?.batterId, pitcher: f?.pitcherId, phase: f?.phase, mode: 'watch', venue: 'park' };
    });
    if (!probe.batter || !probe.pitcher) throw new Error(`${id}: game not ready`);
    const cdp = await page.context().newCDPSession(page);
    const save = async name => {
      const still = name === 'plate';
      const path = join(folder, `${name}.${still ? 'png' : 'jpg'}`);
      // Native compositor capture includes DOM + WebGL without Playwright's
      // per-shot animation disabling. Hero stills stay lossless; motion JPEGs
      // are quality 90 and are not a replacement for pixel-level still review.
      const shot = await cdp.send('Page.captureScreenshot', { format: still ? 'png' : 'jpeg', ...(still ? {} : { quality: 90 }), fromSurface: true, captureBeyondViewport: false });
      writeFileSync(path, Buffer.from(shot.data, 'base64'));
      return { path: relative(root, path), sha256: digest(readFileSync(path)) };
    };
    const common = { url, viewport, probe, surface: 'full-page' };
    evidence.push({ id, kind: 'still', ...common, files: [await save('plate')] });
    const files = [];
    let after = 0, outcome = false;
    for (let frame = 0; frame < 1800; frame++) {
      const state = await page.evaluate(() => {
        window.__spike.devPaint(2);
        const f = window.__spike.scoreboard();
        return { completed: window.__artPa > 0, phase: f?.phase };
      });
      files.push(await save(`frame-${String(frame).padStart(4, '0')}`));
      if (state.completed) { outcome = true; after++; }
      if (frame % 90 === 0) console.log(`${id}: ${(frame / 30).toFixed(1)}s captured, ${state.phase}`);
      if (after >= 60) break;
    }
    if (!outcome) throw new Error(`${id}: no at-bat outcome inside 60 simulated seconds`);
    if (errors.length) throw new Error(`${id}: ${errors.join('\n')}`);
    evidence.push({ id: `${id}-motion`, kind: 'sequence', ...common, fps: 30, clock: 'devPaint', probe: { ...probe, atBatCompleted: true }, files });
    await page.close();
    if (sourceDigest(root) !== hash) throw new Error('Source changed during capture — rerun before reviewing.');
    writeFileSync(join(out, 'receipt.json'), JSON.stringify({ version: 1, target: 'benchmark:park', sourceHash: hash, capturedAt: new Date().toISOString(), evidence }, null, 2) + '\n');
    console.log(`${id}: complete at-bat and two-second outcome hold, ${files.length} frames`);
  }
  if (sourceDigest(root) !== hash) throw new Error('Source changed during capture — rerun before reviewing.');
  writeFileSync(join(out, 'receipt.json'), JSON.stringify({ version: 1, target: 'benchmark:park', sourceHash: hash, capturedAt: new Date().toISOString(), evidence }, null, 2) + '\n');
  console.log(`Captured benchmark without assigning a visual verdict: ${out}`);
}
try { await main(); } finally { await browser?.close(); server?.kill('SIGTERM'); }
