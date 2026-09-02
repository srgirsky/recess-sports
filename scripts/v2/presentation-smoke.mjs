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
// frames through `devPaint` — off the fixed clock's own last instant, one sim
// step per frame, so the mixers advance deterministically with no dependence
// on a headless page's erratic rAF — and captures a screenshot plus a
// machine-readable probe of which clip each principal is actually playing.
//
// ⚠️ HEADLESS PAGES ARE TREATED AS BACKGROUNDED (see ui-audit.mjs's header):
// never wait for rAF here. Every painted frame is an explicit `devPaint`.
//
// ⚠️ NEVER PAINT FROM `performance.now()`. The first wall-clock tick after a
// reach carries the whole reach's wall time, clamped to 0.1s — six unsampled
// sim steps before the paint's own — and how many depended on the machine's
// load, so the same seed pumped a different game run to run and the
// fielded-or-throw beat reached a fly-out's catch and painted the plate
// (2026-09-01, on main, with every gate green). `paintclock.lint.test.js`
// keeps the wall clock out of the instruments.
//
// Exit code: non-zero when a REQUIRED expectation fails (see EXPECT below) —
// so this can gate the presentation the way audit:v2-layout gates the DOM.
//
// Coverage (three pages): the FRONT DOOR (title, draft opens, a pick hands
// the turn back), the seeded GAME (plate, delivery, pitch, between, swing at
// its own tick, live play, a fielder gloving or throwing, a runner waiting,
// the half flip, and the whole game run out to its result), and a dedicated
// HOME-RUN page on a hunted seed. Screenshots fall back to reading the WebGL
// canvas in-task when the headless compositor stalls.
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

/**
 * Pump the fixed clock `step` sim steps at a time until `until(frame, view)`
 * holds, then paint `paintTicks` frames — one sim step each — off that clock.
 * A beat whose state can end within a few steps of arriving samples at
 * `step: 1`; the default six is the ui-audit's grid.
 */
const REACH = (untilSrc, paintTicks, endIsReach = false, step = 6) => `(async () => {
  const s = window.__spike;
  const until = ${untilSrc};
  // Wait for the game to START — but not when it is already OVER: scoreboard()
  // is null in both states, and a backgrounded headless page THROTTLES
  // setTimeout to ~1/minute, so spinning here after game end hangs the beat
  // for 100 throttled minutes (found the hard way; the probe script that
  // found it chunks its pumping instead).
  for (let i = 0; i < 100 && !s.scoreboard() && window.__result == null; i++)
    await new Promise((r) => setTimeout(r, 50));
  let reached = false;
  // An untilEnd beat pumps the whole rest of the game, so it gets more rope.
  for (let i = 0; i < ${Math.ceil((endIsReach ? 30000 : 8000) * (6 / step))}; i++) {
    const f = s.devStepFixedClock(${step});
    if (f && until(f, s)) { reached = true; break; }
    if (!f) { reached = ${endIsReach ? 'true' : 'reached'}; break; }
  }
  // Paint off the fixed clock: exactly ${paintTicks} more sim steps, drawn.
  s.devPaint(${paintTicks});
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
    // Live-play probe: who holds the ball, whether a throw is in the air, and
    // the runner picture — the fields the live beats assert on.
    play: f?.play ? { heldBy: f.play.heldBy, throw: !!f.play.throw, done: f.play.phase === 'done', runners: f.play.runners?.length ?? 0 } : null,
    bases: f?.bases ?? null,
    half: f?.half ?? null,
    inning: f?.inning ?? null,
    // The event tap (installed before the beats run) and the end-of-game tap.
    ev: (window.__ev ?? []).reduce((m, e) => { m[e.t] = (m[e.t] ?? 0) + 1; return m; }, {}),
    hr: (window.__ev ?? []).filter((e) => e.t === 'contact' && e.hit === 'HR' && !e.foul).length,
    gameOver: (window.__result ?? null) !== null,
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
  // --- the live-play beats: the 2026-08-24 review's blind spot, made beats.
  {
    name: 'swing',
    // Catch the batter MID-SWING. Firing on the swung-pitch EVENT is too late
    // — a whiff resolves the pitch and re-arms the next windup inside the same
    // six-tick pump (measured), so the probe lands on bat_stance. And the
    // view's `cpuSwingStarted` flag is TICK-side — it never flips while
    // devStepFixedClock pumps (measured: waiting on it drained the game). The
    // pump-visible condition is the sim's own swing preview: once
    // `pitchElapsed` passes `cpuSwingAtSec` the swing is due, and the paint
    // ticks below are what actually start the clip. CPU-batting halves only,
    // so this beat naturally waits into the bottom of the 1st.
    until:
      '(f, s) => f.phase === "pitch" && f.pitch && f.pitch.cpuSwingAtSec !== null && s.pitchElapsed >= f.pitch.cpuSwingAtSec',
    paint: 4,
    expect: (r) => [
      [
        ['swing_contact', 'swing_follow', 'swing_whiff', 'bunt'].includes(r.batter?.clip),
        `batter is mid-swing (got ${r.batter?.clip})`,
      ],
      [r.ball.visible === true, 'the pitch is still in flight under the swing'],
    ],
  },
  {
    name: 'live-play',
    until: '(f) => f.phase === "live"',
    paint: 12,
    expect: (r) => [
      [r.phase === 'live', `a ball in play goes live (got phase ${r.phase})`],
      [r.ball.visible === true, 'the live ball is visible'],
    ],
  },
  {
    name: 'fielded-or-throw',
    // A fly-out ends the play in the SAME step as the catch: the sim yields
    // exactly one live frame with the ball gloved and `playOver` already in
    // its events (`play.phase === "done"`), and the next step is `between`.
    // Every paint moves at least one step, so that frame can never be the
    // painted one — the beat asks for a hold or a throw on a play that is
    // still going (measured on the smoke seed: a grounder holds 18-28 steps
    // before the throw, a throw flies 39-47, a single's pickup holds 13).
    // Sampling one step at a time so the first such instant is the sampled
    // one, with the paint's six steps still inside it.
    until:
      '(f) => f.phase === "live" && f.play && f.play.phase === "live" && (f.play.heldBy !== null || f.play.throw)',
    step: 1,
    paint: 6,
    expect: (r) => [
      [
        r.play !== null && (r.play.heldBy !== null || r.play.throw === true),
        'a fielder gloves the ball or a throw is in the air',
      ],
    ],
  },
  {
    name: 'runner-on',
    until: '(f) => f.phase === "windup" && f.bases.some(Boolean)',
    paint: 20,
    expect: (r) => [[r.bases?.some(Boolean) === true, 'a runner waits on base at the next windup']],
  },
  {
    name: 'half-flip',
    until: '(f) => f.half === "bottom"',
    paint: 30,
    expect: (r) => [[r.half === 'bottom', 'the inning flips to the YOU-PITCH half']],
  },
  // A homer depends on the seeded game containing one, so this beat pumps
  // until an HR flies OR the game ends — `optional` turns its failures into
  // warnings, and `result` below still asserts the game ENDED either way.
  // The whole seeded game must run out through the VIEW pump — the game.test
  // drain proves the sim ends; this proves the page's own driver gets there.
  {
    name: 'result',
    until: '() => window.__result !== null',
    untilEnd: true,
    paint: 30,
    expect: (r) => [
      [r.gameOver === true, 'the seeded game reaches its result without a soft-lock'],
      [(r.ev.pa ?? 0) > 10, `the game produced real plate appearances (got ${r.ev.pa ?? 0})`],
    ],
  },
];

/**
 * The front door: title and draft, on the App surface (`/v2/?seed=smoke`).
 * DOM-driven where the screens are DOM, `devStepFixedClock` for the canvas
 * behind them — the draft bench is the same renderer as the game.
 */
async function frontDoorBeats(browser, failures, report) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const pump = (ticks) =>
    page
      .evaluate(`(() => { const s = window.__spike; s.devStepFixedClock(${ticks}); s.devPaint(10); })()`)
      .catch(() => {});
  const shoot = async (name, ok, msg) => {
    const shot = join(OUT, `${name}.png`);
    await page.screenshot({ path: shot, timeout: 15_000 }).catch(async () => {
      const data = await page
        .evaluate(`(() => { window.__spike.devPaint(2);
          return document.querySelector('canvas')?.toDataURL('image/png') ?? null; })()`)
        .catch(() => null);
      if (data) writeFileSync(shot, Buffer.from(data.split(',')[1], 'base64'));
      else console.warn(`  (screenshot for ${name} skipped: compositor and canvas both unavailable)`);
    });
    report.push({ beat: name, shot, ok, msg });
    console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(16)} ${msg}`);
    if (!ok) failures.push(`${name}: ${msg}`);
  };
  try {
    await page.goto(`http://localhost:${PORT}/v2/?seed=smoke`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForFunction('!!window.__spike', { timeout: 30_000 });
    await page.evaluate(
      'Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]).then(() => true)'
    );
    // Title: the hero PLAY button is the four-year-old's whole contract.
    const hero = await page.waitForSelector('.btn--hero', { timeout: 15_000 }).catch(() => null);
    await pump(30);
    await shoot('title', hero !== null, hero ? 'PLAY offered on the title' : 'no .btn--hero on the title');
    if (!hero) return;
    // Draft: PLAY opens it, a candidate presents, PICK ME! is armed.
    // el.click() in-page, never page.click(): playwright's click waits on an
    // animation frame for its post-action settle, and this page's rAF is
    // throttled to nothing — the click lands and the await never returns.
    await page.$eval('.btn--hero', (el) => el.click());
    let pick = null;
    for (let i = 0; i < 40 && !pick; i++) {
      await pump(12);
      pick = await page.$('.draft-preview__pick');
    }
    await pump(30);
    await shoot('draft-open', pick !== null, pick ? 'a candidate presents with PICK ME! armed' : 'PICK ME! never armed');
    if (!pick) return;
    // Pick once: the CPU answers and the turn must come BACK (the re-arm fix
    // — the 2026-08-24 review found the draft dead after the first CPU pick).
    await page.$eval('.draft-preview__pick', (el) => el.click());
    let rearmed = null;
    for (let i = 0; i < 80 && !rearmed; i++) {
      await pump(12);
      rearmed = await page.$('.draft-preview__pick');
    }
    await pump(20);
    await shoot(
      'draft-pick',
      rearmed !== null,
      rearmed ? 'the CPU picked and the turn came back' : 'the draft never handed the turn back'
    );
  } finally {
    for (const e of errors) failures.push(`front-door pageerror: ${e}`);
    await page.close().catch(() => {});
  }
}

/** Drive one ?play=1 page through `beats`. Shared by the main seeded game and
 *  the dedicated home-run page. */
async function runGameBeats(browser, url, beats, failures, report) {
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction('!!window.__spike', { timeout: 30_000 });
    await page.evaluate(
      'Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]).then(() => true)'
    );
    // Tap the sim's own event stream and the end-of-game callback. On the bare
    // play surface nothing else subscribes to either (Sound and the result
    // screens are the App's), so the taps steal from nobody.
    await page.evaluate(`window.__ev = []; window.__result = null;
      window.__spike.onSimEvent((e) => window.__ev.push(JSON.parse(JSON.stringify(e))));
      window.__spike.onGameEnd((r) => { window.__result = { awayScore: r.awayScore, homeScore: r.homeScore, innings: r.innings }; });
      true`);
    for (const beat of beats) {
      const r = await page.evaluate(REACH(beat.until, beat.paint, !!beat.untilEnd, beat.step ?? 6));
      const shot = join(OUT, `${beat.name}.png`);
      // An occluded headless page can miss its rendering opportunity; a lost
      // screenshot is a warning, never a hang — the probe is the assertion.
      // One retry after fresh paint ticks recovers most misses (the compositor
      // usually just needs a newer frame to present).
      const snap = () => page.screenshot({ path: shot, timeout: 15_000 });
      await snap().catch(async () => {
        // The headless compositor stalls sometimes; the canvas itself never
        // does. Paint and read the WebGL buffer in ONE task (it is only valid
        // until the task yields), losing the DOM HUD but keeping the scene.
        // Two steps past the probe — the picture stays the probed state.
        const data = await page
          .evaluate(`(() => { window.__spike.devPaint(2);
            return document.querySelector('canvas')?.toDataURL('image/png') ?? null; })()`)
          .catch(() => null);
        if (data) writeFileSync(shot, Buffer.from(data.split(',')[1], 'base64'));
        else console.warn(`  (screenshot for ${beat.name} skipped: compositor and canvas both unavailable)`);
      });
      report.push({ beat: beat.name, shot, ...r });
      const checks = beat.expect(r);
      let bad = r.reached ? checks.filter(([ok]) => !ok) : [[false, `beat unreachable (phase ${r.phase})`]];
      if (beat.optional && bad.length) {
        for (const [, msg] of bad) console.warn(`  (optional beat ${beat.name}: ${msg})`);
        bad = [];
      }
      for (const [, msg] of bad) failures.push(`${beat.name}: ${msg}`);
      const mark = bad.length ? '✗' : '✓';
      console.log(`  ${mark} ${beat.name.padEnd(16)} phase=${r.phase} batter=${r.batter?.clip} pitcher=${r.pitcher?.clip} catcher=${r.catcher?.clip} ball=${JSON.stringify(r.ball)}`);
      for (const [, msg] of bad) console.log(`      ✗ ${msg}`);
    }
    for (const e of errors) failures.push(`pageerror: ${e}`);
    await page.close().catch(() => {});
  } catch (e) {
    failures.push(`game page ${url}: ${String(e).split('\n')[0]}`);
  }
}

/** The dedicated home-run page's beats (see main). */
const HR_BEATS = [
  {
    name: 'home-run',
    until: '(f) => (window.__ev ?? []).some((e) => e.t === "contact" && e.hit === "HR" && !e.foul)',
    paint: 55,
    expect: (r) => [[r.hr > 0, "the smokeHR2 seed's home run flew out"]],
  },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  await startVite();
  const browser = await chromium.launch({ args: process.env.CI ? ['--no-sandbox'] : [] });
  const failures = [];
  const report = [];
  try {
    await frontDoorBeats(browser, failures, report);
    await runGameBeats(browser, GAME_URL, BEATS, failures, report);
    // The home run gets its own page: no seed both homers AND leaves the main
    // page's beats reachable in order, and hunting one mid-game drains the
    // game. `smokeHR2` was hunted with the chunked-pump probe — its bottom of
    // the 1st puts one over the fence. REQUIRED: a physics or park change
    // that keeps this ball in the yard should fail loudly, not silently.
    await runGameBeats(
      browser,
      `http://localhost:${PORT}/v2/?play=1&seed=smokeHR2`,
      HR_BEATS,
      failures,
      report
    );
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
