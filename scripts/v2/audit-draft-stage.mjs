// ---------------------------------------------------------------------------
// npm run audit:draft-stage [-- --check]
//
// ★ NO PLATE OVER A KID'S FACE OR FEET, AND NO KID INSIDE ANOTHER.
//
// The draft stage is one live 3D render under a grid of DOM plates (the
// identity card, the stat card, PICK ME, the ribbon, the bench labels).
// `audit:v2-layout` measures the plates against each other and the frame; it
// cannot see the kids, because they are pixels. The 2026-09-29 playthrough
// found, at 1280x720 with every gate green: the candidate's head cropped by
// the stage top, her feet under PICK ME, a waiting kid's face under the stat
// card, and after Pick the Rest the benches interpenetrating in one clump.
//
// This drives the real draft at the layout audit's six viewports plus
// 1280x720 (where it was found), through four beats — a candidate, the
// player's pick reacting, the CPU's reveal, the finished draft — and reads
// `GameView.devDraftStage()`, which poses the stage exactly as the render pass
// does and projects each DRAWN kid's crown, face and feet into CSS px. It
// fails a face, crown or foot under a `data-stage-cover` plate or off the
// stage, a candidate who is not drawn, two drawn kids sharing more than
// DRAFT_MAX_OVERLAP of the smaller silhouette box, and a wide stage with
// fewer than two kids beside the candidate (hiding everyone is not a fix).
//
// Native rAF is frozen and every frame is an explicit `devPaint`, like the
// presentation smoke; the CPU's pick timer still runs on real time.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { VIEWPORTS } from './viewports.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env.DRAFT_STAGE_PORT ?? 5194);
const check = process.argv.includes('--check');
const ONLY = process.env.DRAFT_STAGE_ONLY;
const COPY_SIZES = new Set(['phone portrait', 'short landscape', 'laptop']);
const MATRIX = [...VIEWPORTS, { name: 'laptop', width: 1280, height: 720 }].filter((v) => !ONLY || v.name === ONLY);
/** Keep in step with GameView's DRAFT_MAX_OVERLAP, plus float slack. */
const MAX_OVERLAP = 0.2 + 1e-3;
/** Hair rises above the crown bone: a crown this share of the kid's drawn
 * height inside the stage top keeps the hair on glass too. */
const HAIR_SHARE = 0.08;

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(Error('vite did not start in 30s')), 30_000);
  server.stdout.on('data', (d) => { if (String(d).includes('ready in')) { clearTimeout(timer); ok(); } });
  server.once('exit', (code) => { clearTimeout(timer); fail(Error(`vite exited: ${code}`)); });
});

const failures = [];
let browser;
try {
  browser = await chromium.launch();
  for (const vp of MATRIX) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; window.cancelAnimationFrame = () => {}; });
    await page.goto(`http://localhost:${port}/v2/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      const b = document.querySelector('.screen--title .btn');
      return b && !b.disabled && window.__spike?.game;
    }, null, { timeout: 60_000 });
    const paint = (n) => page.evaluate((n) => window.__spike.game.devPaint(n), n);
    const probe = async (beat) => {
      const r = await page.evaluate(() => {
        const s = window.__spike.game.devDraftStage(true);
        const covers = [...document.querySelectorAll('[data-stage-cover]')]
          .map((e) => ({ name: e.className.split(' ')[0], r: e.getBoundingClientRect() }))
          .filter((c) => c.r.width > 0 && c.r.height > 0)
          .map((c) => ({ name: c.name, left: c.r.left, top: c.r.top, right: c.r.right, bottom: c.r.bottom }));
        return { s, covers };
      });
      if (process.env.DRAFT_STAGE_VERBOSE) console.log(JSON.stringify({ beat, host: r.s?.host, covers: r.covers, all: r.s?.all }));
      judge(vp, beat, r.s, r.covers);
    };

    await page.click('.screen--title .btn');
    await page.waitForSelector('.screen--draft .draft-preview__pick', { timeout: 30_000 });
    await paint(60);
    await probe('candidate');

    // Every kid's card copy fits its plate. Tapping a roster card previews a
    // kid (it never votes), so the whole board is measured without a pick.
    // Copy depends on the plate's width, not the stage, so three sizes that
    // span it are enough; all seven would cost CI minutes for nothing.
    const spill = !COPY_SIZES.has(vp.name) ? [] : await page.evaluate(async () => {
      const out = [];
      for (const card of document.querySelectorAll('.draft-board .kid')) {
        card.click();
        await new Promise((r) => setTimeout(r, 0));
        const plate = document.querySelector('.draft-preview__identity');
        if (!plate) continue;
        const r = plate.getBoundingClientRect();
        const cs = getComputedStyle(plate);
        const box = {
          left: r.left + parseFloat(cs.paddingLeft) - 1,
          right: r.right - parseFloat(cs.paddingRight) + 1,
          top: r.top - 1,
          bottom: r.bottom + 1,
        };
        for (const line of plate.children) {
          // The ribbon is a tab ON the card's edge by design; plates hold it
          // off kids through data-stage-cover, not this copy rule.
          if (line.classList.contains('draft-preview__ribbon')) continue;
          if (!line.textContent || getComputedStyle(line).display === 'none') continue;
          const range = document.createRange();
          range.selectNodeContents(line);
          for (const t of range.getClientRects()) {
            if (t.left < box.left || t.right > box.right || t.top < box.top || t.bottom > box.bottom) {
              out.push(`${plate.querySelector('.draft-preview__name')?.textContent}: "${line.textContent.slice(0, 40)}" spills its plate`);
              break;
            }
          }
        }
      }
      return out;
    });
    for (const f of spill) failures.push(`${vp.name} (${vp.width}x${vp.height}) / card copy: ${f}`);

    await page.click('.draft-preview__pick');
    await paint(30);
    await probe('your pick');
    // The CPU's turn runs on a real timer; its reveal is a ribbon.
    await page.waitForSelector('.draft-preview__ribbon.is-cpu', { timeout: 30_000 });
    await paint(40);
    await probe('their pick');

    await page.waitForSelector('.draft-head__fill:not(.is-hidden)', { timeout: 30_000 });
    await page.click('.draft-head__fill');
    await page.waitForSelector('.screen--draft .btn--hero:not(.is-hidden)', { timeout: 30_000 });
    await paint(180);
    await probe('draft complete');
    if (errors.length) failures.push(`${vp.name}: page errors: ${errors.join(' | ')}`);
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

function judge(vp, beat, stage, covers) {
  const where = `${vp.name} (${vp.width}x${vp.height}) / ${beat}`;
  if (!stage) {
    failures.push(`${where}: no draft stage to probe`);
    return;
  }
  const h = stage.host;
  const off = (p) => p[0] < h.left - 0.5 || p[0] > h.left + h.width + 0.5 || p[1] < h.top - 0.5 || p[1] > h.top + h.height + 0.5;
  const coveredBy = (p) => covers.find((c) => p[0] >= c.left && p[0] <= c.right && p[1] >= c.top && p[1] <= c.bottom);
  const candidate = stage.kids.find((k) => k.role === 'candidate');
  if (!candidate) failures.push(`${where}: the candidate is not drawn`);
  for (const k of stage.kids) {
    const pts = [['crown', k.crown], ['face', k.face], ...k.faceSides.map((f, i) => [`face side ${i}`, f]), ...k.feet.map((f, i) => [`foot ${i}`, f])];
    if (k.role !== 'candidate' && (k.box[0] < h.left - 0.5 || k.box[2] > h.left + h.width + 0.5)) {
      failures.push(`${where}: ${k.id} (${k.role}) is cut off at the stage edge`);
    }
    for (const [part, p] of pts) {
      if (off(p)) failures.push(`${where}: ${k.id} (${k.role}) ${part} off the stage at ${p.map(Math.round)}`);
      const c = coveredBy(p);
      if (c) failures.push(`${where}: ${k.id} (${k.role}) ${part} under ${c.name}`);
    }
    if (k.role === 'candidate') {
      const hair = (k.box[3] - k.box[1]) * HAIR_SHARE;
      if (k.crown[1] - hair < h.top) failures.push(`${where}: ${k.id}'s hair crops at the stage top`);
    }
  }
  const others = stage.kids.filter((k) => k.role !== 'candidate');
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      const share = overlapShare(others[i].box, others[j].box);
      if (share > MAX_OVERLAP) failures.push(`${where}: ${others[i].id} and ${others[j].id} share ${(share * 100).toFixed(0)}% of a silhouette`);
    }
  }
  // Hiding everyone would pass every rule above, so the crowd has a floor.
  // Two, not more: at 1024x768 the stage is ~300px tall and the two plates
  // fill most of both side columns, so only the centre column can hold kids
  // clear of them (measured 2026-09-29); the desktop sizes keep six.
  if (h.width >= 700 && others.length < 2) {
    failures.push(`${where}: only ${others.length} kids beside the candidate — the crowd vanished`);
  }
  // A phone stage still shows somebody waiting while a child browses and at
  // the end: the crowd steps inward there. A pick's 1.5s cheer may take the
  // sliver alone (her arms up cover whoever stood behind her).
  if (h.width < 700 && (beat === 'candidate' || beat === 'draft complete') && others.length < 1) {
    failures.push(`${where}: the candidate stands alone on a narrow stage`);
  }
  const hidden = stage.hidden?.length ? `; hidden ${stage.hidden.map((x) => `${x.id}:${x.why}`).join(', ')}` : '';
  console.log(`  ${where}: ${stage.kids.length} drawn (${others.length} beside the candidate)${hidden}`);
}

function overlapShare(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const hh = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || hh <= 0) return 0;
  const area = (r) => Math.max(1e-6, (r[2] - r[0]) * (r[3] - r[1]));
  return (w * hh) / Math.min(area(a), area(b));
}

for (const f of failures) console.log(`  ✗ ${f}`);
console.log(failures.length ? `${failures.length} failure(s)` : 'draft stage clear at every viewport');
if (check && failures.length) process.exitCode = 1;
