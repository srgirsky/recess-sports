// ---------------------------------------------------------------------------
// node scripts/v2/presentation-smoke.mjs [outDir]
//
// The presentation smoke: WHAT DOES THE GAME ACTUALLY LOOK LIKE, painted.
//
// ★ WHY THIS EXISTS WHEN 1,857 TESTS ARE GREEN. The 2026-08-24 review drove
// the live game in a browser and found the batter holding nothing, the
// pitcher throwing from a T-pose and the catcher frozen mid-blend — while
// every gate passed, because every gate asserts state, and nobody was
// asserting the PAINTED state. This script reaches each game beat with
// `devStepFixedClock` (the ui-audit's instrument), then paints real `tick()`
// frames with SYNTHETIC timestamps — the mixers advance deterministically,
// with no dependence on a headless page's erratic rAF — and captures a
// screenshot plus a machine-readable probe of which clip each principal is
// actually playing.
//
// ⚠️ HEADLESS PAGES ARE TREATED AS BACKGROUNDED (see ui-audit.mjs's header):
// never wait for rAF here. Every painted frame is an explicit `tick(t)` call.
//
// Exit code: non-zero when a REQUIRED expectation fails (see EXPECT below) —
// so this can gate the presentation the way audit:v2-layout gates the DOM.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 5179;
const GAME_URL = `http://localhost:${PORT}/v2/?play=1&seed=smoke`;
const OUT = resolve(process.argv[2] ?? join(here, '../../.smoke'));

let viteProc = null;
function startVite() {
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: join(here, '../..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  viteProc = p;
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start in 30s')), 30_000);
    p.stdout.on('data', (d) => {
      if (String(d).includes('ready in')) { clearTimeout(t); res(p); }
    });
    p.on('error', rej);
  });
}

/** Pump the fixed clock until `until(frame, view)` holds, then paint. */
const REACH = (untilSrc, paintTicks) => `(async () => {
  const s = window.__spike;
  const until = ${untilSrc};
  for (let i = 0; i < 100 && !s.scoreboard(); i++) await new Promise((r) => setTimeout(r, 50));
  let reached = false;
  for (let i = 0; i < 8000; i++) {
    const f = s.devStepFixedClock(6);
    if (f && until(f, s)) { reached = true; break; }
    if (!f) break;
  }
  // Paint with synthetic, monotonic timestamps: deterministic mixer time.
  let t = performance.now();
  for (let i = 0; i < ${paintTicks}; i++) { t += 16.7; s.tick(t); }
  const f = s.scoreboard();
  const dir = (id) => s.refs.directors.get(id);
  const catcherId = f ? Object.entries(f.defence).find(([, p]) => p === 'C')?.[0] ?? null : null;
  const probe = (id) => {
    if (!id) return null;
    const d = dir(id);
    return { id, clip: d?.playing ?? null, bat: d?.bat ? d.bat.visible : null };
  };
  return {
    reached,
    phase: f?.phase ?? 'none',
    batter: probe(f?.batterId),
    pitcher: probe(f?.pitcherId),
    catcher: probe(catcherId),
    ball: { x: +s.refs.ball.position.x.toFixed(2), y: +s.refs.ball.position.y.toFixed(2), z: +s.refs.ball.position.z.toFixed(2), visible: s.refs.ball.visible },
  };
})()`;

/** name / how to reach it / how long to paint / what MUST be true there. */
const BEATS = [
  {
    name: 'plate-waiting',
    until: '(f, s) => f.phase === "windup" && !s.deliveryStarted',
    paint: 30,
    expect: (r) => [
      [r.batter?.clip === 'bat_stance', `batter waits in bat_stance (got ${r.batter?.clip})`],
      [r.batter?.bat === true, 'the batter holds a visible bat'],
      [r.catcher?.clip === 'field_ready', `catcher crouches in field_ready (got ${r.catcher?.clip})`],
    ],
  },
  {
    name: 'delivery',
    until: '(f, s) => f.phase === "windup" && s.deliveryStarted',
    paint: 8,
    expect: (r) => [
      [
        ['pitch_windup', 'pitch_stride', 'pitch_release'].includes(r.pitcher?.clip),
        `pitcher is mid-delivery (got ${r.pitcher?.clip})`,
      ],
    ],
  },
  {
    name: 'pitch-flight',
    until: '(f, s) => f.phase === "pitch" && s.pitchElapsed > 0.12',
    paint: 4,
    expect: (r) => [[r.ball.visible === true, 'the pitched ball is visible']],
  },
  {
    name: 'between',
    until: '(f) => f.phase === "between"',
    paint: 45,
    expect: () => [],
  },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  await startVite();
  const browser = await chromium.launch({ args: process.env.CI ? ['--no-sandbox'] : [] });
  const failures = [];
  const report = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('!!window.__spike', { timeout: 30_000 });
    await page.evaluate(
      'Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]).then(() => true)'
    );
    for (const beat of BEATS) {
      const r = await page.evaluate(REACH(beat.until, beat.paint));
      const shot = join(OUT, `${beat.name}.png`);
      // An occluded headless page can miss its rendering opportunity; a lost
      // screenshot is a warning, never a hang — the probe is the assertion.
      await page.screenshot({ path: shot, timeout: 15_000 }).catch((e) => {
        console.warn(`  (screenshot for ${beat.name} skipped: ${e.message.split('\n')[0]})`);
      });
      report.push({ beat: beat.name, shot, ...r });
      const checks = beat.expect(r);
      const bad = r.reached ? checks.filter(([ok]) => !ok) : [[false, `beat unreachable (phase ${r.phase})`]];
      for (const [, msg] of bad) failures.push(`${beat.name}: ${msg}`);
      const mark = bad.length ? '✗' : '✓';
      console.log(`  ${mark} ${beat.name.padEnd(16)} phase=${r.phase} batter=${r.batter?.clip} pitcher=${r.pitcher?.clip} catcher=${r.catcher?.clip} ball=${JSON.stringify(r.ball)}`);
      for (const [, msg] of bad) console.log(`      ✗ ${msg}`);
    }
    for (const e of errors) failures.push(`pageerror: ${e}`);
  } finally {
    await browser.close().catch(() => {});
    viteProc?.kill('SIGTERM');
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n  shots + report.json in ${OUT}`);
  if (failures.length) {
    console.error(`\n${failures.length} presentation expectation(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  viteProc?.kill('SIGTERM');
  console.error(e);
  process.exit(1);
});
