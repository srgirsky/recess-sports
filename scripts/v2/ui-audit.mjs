// ---------------------------------------------------------------------------
// npm run audit:v2-layout
//
// ★ THE GATE `tokens.css` HAS BEEN CLAIMING SINCE IT WAS WRITTEN. Its header
// said "its overlap PREDICATES still gate CI — see scripts/v2/ui-audit.mjs",
// and this file did not exist. Same class as `isFair` having no caller,
// `PlayInputs` being read by nothing for eight PRs, and `bridge.ts` being
// documented before it was written — except this one was a claim about a GATE,
// which is the worst kind: a reviewer reading that comment believes v2's HUD is
// checked for overlap, and nothing was checking anything.
//
// It is also the reason the root brief lists `src/ui/layoutMath.ts`'s overlap
// predicates under "shared, never copied". They were shared with nobody. This
// imports the real ones, so v1's chrome and v2's HUD are judged by the same
// arithmetic rather than by two implementations that agree until they don't.
//
// ★ WHY A DOM AUDIT IS NOT REDUNDANT WITH `audit:layout`. That gate walks
// Phaser's display list, which v2 does not have. And v2's whole layout strategy
// is different: one `clamp()` scalar in `tokens.css` drives every size in `rem`,
// which deletes v1's solveRow/solveColumn — but it moves the failure rather than
// removing it. A rem-scaled strip does not collide at the size it was authored
// at; it collides at the extremes of that clamp, on a short landscape phone
// where `1.6svh + 0.6vw` bottoms out and on a large display where it tops out.
// So the matrix here is VIEWPORTS, not content.
//
// ⚠️ THE CLOCK IS DRIVEN BY HAND. `/v2/?play=1` is a rAF loop, and a headless
// page is frequently treated as backgrounded — the same trap `src/v2/AGENTS.md`
// records for a manual playtest. Every state below is reached by pumping
// `__spike.tick(t)` with a monotonic `t`, never by waiting.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { overlaps, insideFrame } from '../../src/ui/layoutMath.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 5178;
const URL = `http://localhost:${PORT}/v2/?play=1&seed=audit`;

/** A gate that can hang is worse than no gate — it burns a runner in silence. */
const RUN_BUDGET_MS = 8 * 60_000;

/**
 * The viewport matrix.
 *
 * ★ CHOSEN FOR WHERE THE `clamp()` BINDS, not for popularity. `tokens.css` sets
 * `font-size: clamp(14px, 1.6svh + 0.6vw, 22px)`, so the interesting sizes are
 * the ones that PIN it: a short landscape phone sits on the 14px floor with the
 * least vertical room, and a large display sits on the 22px ceiling. A layout
 * that survives both survives everything between them.
 */
const VIEWPORTS = [
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'short landscape', width: 740, height: 320 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'large display', width: 2560, height: 1440 },
];

/**
 * The states worth auditing, how to reach each, and what each must actually be
 * showing once reached.
 *
 * ★ `mustSee` IS NOT DECORATION — WITHOUT IT THIS GATE AUDITED NOTHING. The
 * picker is the only state-dependent chrome here, and the first version of this
 * file reached it by pumping to `phase === 'windup'` and stopping. That is the
 * TOP of the first inning, where the human BATS: `PlayView.onTheMound` is
 * `windup && !humanBats`, so the picker stayed hidden and the audit measured the
 * scoreboard three times while its own row said "picker open". Sabotaging the
 * CSS to drop the picker straight onto the scoreboard produced a clean run.
 *
 * So a state names a selector that must be visible when it is reached, and a
 * state that cannot show it FAILS rather than passing quietly.
 */
const STATES = [
  { name: 'pitch', until: (f) => f.phase === 'pitch', mustSee: '.sb' },
  {
    name: 'windup, picker open',
    // The bottom half, because that is the half the human pitches in.
    until: (f) => f.phase === 'windup' && f.half === 'bottom',
    mustSee: '.pitch-picker.is-open',
  },
  { name: 'live play', until: (f) => f.phase === 'live', mustSee: '.sb' },
];

const c = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

/** The dev server, tracked at module scope so every exit path can kill it. */
let viteProc = null;
function stopVite(signal = 'SIGTERM') {
  viteProc?.kill(signal);
  viteProc = null;
}

function startVite() {
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: join(here, '../..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  viteProc = p;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite did not start in 30s')), 30_000);
    p.stdout.on('data', (d) => {
      if (String(d).includes('ready in')) {
        clearTimeout(t);
        resolve(p);
      }
    });
    p.on('error', reject);
  });
}

/**
 * Walk `#hud` and report every LEAF box plus every top-level block.
 *
 * Leaves rather than every node, because a container legitimately contains its
 * children and `overlaps` would report each nesting as a collision. The blocks
 * are compared against each other; the leaves are what must stay in frame and
 * what must be big enough to tap.
 */
const COLLECT = `(() => {
  const hud = document.getElementById('hud');
  if (!hud) return { error: 'no #hud' };
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height,
             label: el.className || el.tagName.toLowerCase(),
             interactive: el.classList.contains('interactive') };
  };
  const blocks = [], leaves = [];
  for (const child of hud.children) {
    if (!vis(child)) continue;
    blocks.push(box(child));
    const walk = (el) => {
      const kids = [...el.children].filter(vis);
      if (kids.length === 0) { leaves.push(box(el)); return; }
      for (const k of kids) walk(k);
    };
    walk(child);
  }
  const interactives = [...hud.querySelectorAll('.interactive')].filter(vis).map(box);
  return { blocks, leaves, interactives,
           frame: { w: window.innerWidth, h: window.innerHeight },
           rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize) };
})()`;

/**
 * Pump the rAF loop by hand until the sim reaches `phase`.
 *
 * ★ 100ms A CALL, NOT ONE FRAME A CALL, AND THAT IS NOT A SHORTCUT. `tick`
 * RENDERS, and a headless WebGL render is the entire cost of this gate — at one
 * frame per call the run blew its own budget before the last viewport. The loop
 * clamps its delta at 0.1s and then steps a FIXED-RATE accumulator, so the sim
 * takes exactly the same number of 60Hz steps either way and only the number of
 * renders changes. Stepping past the clamp would silently drop sim time instead,
 * which is why 100 is the number and not 250.
 */
const PUMP = (untilSrc, mustSee) => `(async () => {
  const s = window.__spike;
  const until = ${untilSrc};
  for (let i = 0; i < 100 && !s.scoreboard(); i++) await new Promise((r) => setTimeout(r, 50));
  let t = performance.now();
  for (let i = 0; i < 4000; i++) {
    t += 100;
    s.tick(t);
    const f = s.scoreboard();
    if (f && i > 4 && until(f)) {
      const el = document.querySelector(${JSON.stringify(mustSee)});
      const r = el && el.getBoundingClientRect();
      const vs = el && getComputedStyle(el);
      const shown = !!el && vs.visibility !== 'hidden' && vs.display !== 'none' &&
                    Number(vs.opacity) > 0 && r.width > 0 && r.height > 0;
      return { reached: true, shown, phase: f.phase, half: f.half };
    }
  }
  const f = s.scoreboard();
  return { reached: false, shown: false, phase: f ? f.phase : 'none', half: f ? f.half : '?' };
})()`;

/**
 * Transitions and animations, off, for the duration of the audit.
 *
 * ★ NOT A CONVENIENCE — WITHOUT IT THE GATE CANNOT SEE HALF ITS OWN SUBJECT. A
 * CSS transition is driven by ANIMATION FRAMES, and a headless page composites
 * on its own schedule, so the pitch picker's 120ms opacity fade never advanced:
 * the class was applied, `visibility` computed `visible`, the box had real
 * width and height, and `opacity` sat at 0 forever. The element was there and
 * measurable and the audit was correct to call it invisible.
 *
 * It is the same clock split the root brief records for v1 -- "timers follow the
 * loop clock while tweens follow wall-clock Date.now()" -- with CSS as the
 * second clock. Driving the sim by hand cannot advance it.
 *
 * Turning them off is the right answer rather than a workaround, because this
 * gate measures LAYOUT and a transition is not layout: every box it compares is
 * the settled one, which is the only geometry a collision rule has an opinion
 * about. It also removes the pip pulse, whose transform would otherwise make a
 * measured box depend on which millisecond it was read.
 */
const NO_MOTION = `*, *::before, *::after {
  transition: none !important;
  animation: none !important;
}
/*
 * ★ AND THE 3D SURFACE IS SHRUNK TO NOTHING, because this gate measures DOM.
 * Every pump call RENDERS, and a headless WebGL frame costs its pixel count: at
 * 2560x1440 the last viewport alone ran past the whole run budget, and the gate
 * died on the same state every time. The HUD is laid out against the VIEWPORT,
 * not against the canvas, so a 2px drawing buffer changes nothing this file
 * looks at and makes the renders free. The viewport itself is untouched -- it is
 * the variable under test.
 */
#stage { inline-size: 2px !important; block-size: 2px !important; }`;

const failures = [];
function fail(where, msg) {
  failures.push(`${where}: ${msg}`);
}

/** Minimum tap target. `--tap-min` is 3.5rem; this is that, in px, per viewport. */
function tapMinPx(rootFontPx) {
  return 3.5 * rootFontPx;
}

async function auditOne(page, vp, state) {
  const where = `${vp.name} / ${state.name}`;
  const got = await page.evaluate(PUMP(String(state.until), state.mustSee));
  if (!got.reached) {
    // Not a layout failure — say so plainly rather than passing quietly.
    fail(where, `never reached the state (stuck at ${got.phase}/${got.half})`);
    return 0;
  }
  if (!got.shown) {
    // The state was reached and the thing it exists to audit is not on screen.
    // Auditing anyway would report a clean run over chrome nobody looked at.
    fail(where, `reached ${got.phase}/${got.half} but "${state.mustSee}" is not visible`);
    return 0;
  }
  const r = await page.evaluate(COLLECT);
  if (r.error) {
    fail(where, r.error);
    return 0;
  }

  const frame = { w: r.frame.w, h: r.frame.h };

  // 1. NOTHING LEAVES THE FRAME. A strip that overflows on a short landscape
  //    phone is the classic rem-scaling failure and is invisible at desk size.
  for (const b of r.leaves) {
    if (!insideFrame({ x: b.x, y: b.y, w: b.w, h: b.h }, frame.w, frame.h, -0.5)) {
      fail(where, `"${b.label}" is off-frame at ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)} in ${frame.w}x${frame.h}`);
    }
  }

  // 2. NO TWO HUD BLOCKS OVERLAP. Siblings of `#hud` occupy named grid areas,
  //    so an overlap means two areas have collided — exactly what the scoreboard
  //    and the pitch picker would do if the strip grew into the right rail.
  for (let i = 0; i < r.blocks.length; i++) {
    for (let j = i + 1; j < r.blocks.length; j++) {
      const a = r.blocks[i];
      const b = r.blocks[j];
      if (overlaps({ x: a.x, y: a.y, w: a.w, h: a.h }, { x: b.x, y: b.y, w: b.w, h: b.h }, 1)) {
        fail(where, `"${a.label}" overlaps "${b.label}"`);
      }
    }
  }

  // 3. EVERY TAP TARGET CLEARS THE FLOOR. Nothing in the HUD is interactive
  //    today, so this rule is presently vacuous — and it is here BECAUSE it is
  //    about to stop being: the moment a button is added, the floor is already
  //    enforced rather than remembered.
  const floor = tapMinPx(r.rootFontPx);
  for (const b of r.interactives) {
    if (b.w + 0.5 < floor || b.h + 0.5 < floor) {
      fail(where, `tap target "${b.label}" is ${Math.round(b.w)}x${Math.round(b.h)}, floor is ${Math.round(floor)}`);
    }
  }
  return r.leaves.length;
}

async function main() {
  await startVite();
  const browser = await chromium.launch({ args: process.env.CI ? ['--no-sandbox'] : [] });
  let audited = 0;
  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(URL, { waitUntil: 'load' });
      await page.addStyleTag({ content: NO_MOTION });
      // The renderer sizes its drawing buffer on resize, not on a CSS change,
      // so the shrink above only takes effect once it is told to look again.
      await page.evaluate('window.dispatchEvent(new Event("resize"))');
      for (const state of STATES) {
        const n = await auditOne(page, vp, state);
        audited += n;
        const bad = failures.filter((f) => f.startsWith(`${vp.name} / ${state.name}:`));
        const mark = bad.length ? `${c.red}✗${c.off}` : `${c.green}✓${c.off}`;
        console.log(`  ${mark} ${(vp.name + ' / ' + state.name).padEnd(34)} ${c.dim}${n} boxes${c.off}`);
        for (const b of bad) console.log(`      ${c.red}${b.split(': ').slice(1).join(': ')}${c.off}`);
      }
      // A page error is a failure even if the boxes happened to land right.
      for (const e of errors) fail(vp.name, `page error: ${e}`);
      await page.close();
    }
  } finally {
    await browser.close();
    stopVite();
  }

  if (failures.length) {
    console.log(`\n${c.red}v2 HUD layout FAILED${c.off} — ${failures.length} problem(s)`);
    return 1;
  }
  console.log(
    `\n${c.green}v2 HUD layout clean${c.off} across ${VIEWPORTS.length} viewports x ${STATES.length} states ${c.dim}(${audited} boxes)${c.off}`
  );
  return 0;
}

const budget = setTimeout(() => {
  console.error(`${c.red}audit:v2-layout exceeded ${RUN_BUDGET_MS / 1000}s — killing.${c.off}`);
  stopVite('SIGKILL');
  process.exit(1);
}, RUN_BUDGET_MS);
budget.unref?.();

// A Ctrl-C must not leave the port held either.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopVite('SIGKILL');
    process.exit(130);
  });
}

let code = 1;
try {
  code = await main();
} catch (err) {
  console.error(`${c.red}audit failed to run:${c.off} ${err.message}`);
  code = 1;
} finally {
  clearTimeout(budget);
  stopVite('SIGKILL');
  // ★ EXIT EXPLICITLY. `scripts/layout-audit.mjs` learned this first and says
  // why: "Playwright and the vite child can both leave handles open; the exit
  // code is already decided, so leaving would just stall the runner." Not
  // hypothetical here — this gate printed "v2 HUD layout clean" on CI and then
  // sat for three minutes until its own budget timer killed it with exit 1, so
  // a PASSING run reported as a failure. `unref()` on the budget is not enough
  // when a spawned child still owns a pipe.
  process.exit(code);
}
