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
// records for a manual playtest. Every state below is reached through
// `GameView.devStepFixedClock`, the live pump's exact 60Hz path without the
// discarded intermediate WebGL frames; one real `tick` paints the reached state
// before a single box is measured.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { overlaps, insideFrame } from '../../src/ui/layoutMath.ts';

/**
 * A DOMRect as a `layoutMath` Box.
 *
 * ⚠️ ★ THE CONVENTIONS DISAGREE, AND SILENTLY. `layoutMath`'s `Box` documents
 * its x,y as "the CENTER (matching Phaser's setOrigin(0.5))"; `getBoundingClientRect`
 * returns the TOP-LEFT. Handing one to the other shifts every box by half its
 * own size, so `insideFrame` measures a rectangle that is not where the element
 * is and `overlaps` compares two boxes each displaced by a DIFFERENT amount.
 *
 * This file did exactly that from the day it was written, and it passed: the
 * HUD is a centred strip whose displacement happened not to push anything over
 * an edge, so a wrong rule agreed with a right one until the title and result
 * screens arrived and it reported four elements off-frame that are plainly
 * inside it. Shared predicates are only shared if the units are too.
 */
const asBox = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h });

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 5178;
// `break=1`: every between-beat shows the inning board (its real trigger is
// a half-inning of sim away — 78 measured seconds of pumping per viewport,
// after which the tab would not even navigate. Same reach class SHOW_RESULT
// solves for the result screen: real component, synthetic trigger).
const GAME_URL = `http://localhost:${PORT}/v2/?play=1&seed=audit&break=1`;
const APP_URL = `http://localhost:${PORT}/v2/`;

/** A gate that can hang is worse than no gate — it burns a runner in silence.
 *
 * Raised 8 → 11 minutes 2026-08-05, and here is what earned it: after the
 * neighborhood scenery (PR 28) the run streams every scenario green on a
 * 4-vCPU CI runner and was killed at 480s with 39 of 42 done — the kill was
 * the only failure. The local run burns ~38 CPU-minutes across 14 cores;
 * four cores simply need longer, not fewer assertions. A boot-once /
 * reflow-the-viewport-matrix refactor was tried and MEASURED SLOWER (6:40
 * against 4:49 wall, 59 against 38 CPU-minutes, identical 2568 boxes): the
 * document-start stage shrink had already deleted the boot cost, and holding
 * one page open runs the title's background game for the whole run. This
 * budget is the honest price of the assertions.
 *
 * Raised again 11 → 15 minutes 2026-08-05, after the inning-break state
 * (PR 34) added a fourth game scenario: CI was budget-killed at 660s with
 * every completed row green, twice. The same session found and fixed the real
 * flake (the 50s pumped-page unload stall — see the fresh-page note in main)
 * and re-tried the reflow refactor WITH that fix; it still lost. A page whose
 * sim has been pumped degrades everything done on or to it — INVESTIGATED
 * and resolved headless-only: real Chrome pumps the same 564 ticks in 1.16s
 * and navigates away instantly, so this is SwiftShader resource churn, not a
 * product leak, and the fresh-page rule is the complete mitigation. The
 * gate's budget must fit the assertions it actually runs on the runners it
 * actually gets.
 *
 * And LOWERED again 15 → 11 the same day, paid for by subtraction: the game
 * states now run at the clamp-pinning viewports only (GAME_VIEWPORTS), which
 * halved the repeated sim pumping — 4:19 local against 7:19 for the full
 * matrix, same screens coverage, and the assertions the mid viewports carried
 * for the HUD were interpolations between measured extremes. */
const RUN_BUDGET_MS = 11 * 60_000;

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
 * ★ The GAME states run at the clamp-PINNING viewports only. Every game boot
 * repeats the same sim pumping, and the doctrine above says the informative
 * sizes are where the `clamp()` binds: the floor with the least room (short
 * landscape), the floor with portrait proportions (phone portrait, where the
 * matchup plate's own height media-query flips), and the ceiling (large
 * display). For a HUD of edge-anchored strips and cards, the mid sizes are
 * interpolations between measured extremes — the SCREENS, whose scrollers and
 * thirty-card draft do change shape in the middle, keep the full matrix.
 * This is what returned the run to its budget after the inning-break state
 * (the fourth per-boot pump) pushed slow runners past 900s.
 */
const GAME_VIEWPORTS = VIEWPORTS.filter((v) =>
  ['phone portrait', 'short landscape', 'large display'].includes(v.name)
);

/**
 * The states worth auditing, how to reach each, and what each must actually be
 * showing once reached.
 *
 * ★ `mustSee` IS NOT DECORATION — WITHOUT IT THIS GATE AUDITED NOTHING. The
 * picker is the only state-dependent chrome here, and the first version of this
 * file reached it by pumping to `phase === 'windup'` and stopping. That is the
 * TOP of the first inning, where the human BATS: `GameView.onTheMound` is
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
  {
    name: 'inning break',
    // Any between-beat — `break=1` above makes each one a break, so this is
    // one pitch of pumping rather than a half-inning of it.
    until: (f) => f.phase === 'between',
    mustSee: '.inning-board.is-open',
  },
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
const COLLECT = (hostId) => `(() => {
  const hud = document.getElementById(${JSON.stringify(hostId)});
  if (!hud) return { error: 'no #${hostId}' };
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
  // The SCROLLER is usually a child (\`.screen--draft\` carries the overflow),
  // not the host, so asking the host alone answers "no" for a board that very
  // much does scroll -- and then every card below the fold is reported off-frame.
  const canScroll = (n) => n.scrollHeight > n.clientHeight + 1;
  const scrolls = canScroll(hud) || [...hud.querySelectorAll('*')].some(canScroll);
  return { blocks, leaves, interactives, scrolls,
           frame: { w: window.innerWidth, h: window.innerHeight },
           rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize) };
})()`;

/**
 * Pump the fixed game clock by hand until the sim reaches `phase`.
 *
 * ★ SIX FIXED STEPS A CALL, THEN ONE DRAW AT THE DESTINATION. The former driver
 * called `tick` for every 100ms and therefore rendered every intermediate state
 * in software WebGL. Once full pitch deliveries landed, those intentionally
 * longer timelines pushed a completely-green CI run past the 660s watchdog.
 * `devStepFixedClock(6)` invokes the same `pump(1 / SIM_HZ)` six times without
 * drawing; the final `tick(performance.now())` paints the real shipping HUD
 * before visibility and geometry are read. Layout assertions are unchanged.
 */
const PUMP = (untilSrc, mustSee) => `(async () => {
  const s = window.__spike;
  const until = ${untilSrc};
  for (let i = 0; i < 100 && !s.scoreboard(); i++) await new Promise((r) => setTimeout(r, 50));
  for (let i = 0; i < 4000; i++) {
    const f = s.devStepFixedClock(6);
    if (f && i > 4 && until(f)) {
      s.tick(performance.now());
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
 * The audit now draws only the reached state, but even those twelve software
 * WebGL frames should not scale to 2560x1440. The HUD is laid out against the
 * VIEWPORT, not against the canvas, so a 2px drawing buffer changes nothing this
 * file looks at and makes the destination renders free. The viewport itself is
 * untouched -- it is the variable under test.
 */
#stage { inline-size: 2px !important; block-size: 2px !important; }`;

/** The document-start stage shrink, shared by every page the audit opens. */
const INIT_SHRINK = `new MutationObserver((_, obs) => {
  if (!document.documentElement) return;
  const s = document.createElement('style');
  s.textContent = ${JSON.stringify(NO_MOTION)};
  document.documentElement.appendChild(s);
  obs.disconnect();
}).observe(document, { childList: true, subtree: true });`;

/** Exercise the clubhouse's unlocked, foil, trophy and favorite branches. The
 * browser context is throwaway, so these shared-key writes never leave the
 * audit. An empty album would measure thirty identical locked placeholders and
 * miss every tappable sticker the product actually grows into. */
const INIT_CLUBHOUSE = `(() => {
  localStorage.setItem('recess_games_played', '7');
  localStorage.setItem('recess_pickcounts', JSON.stringify({ nostrike: 5, big_lou: 3, turbo: 2 }));
  localStorage.setItem('recess_album', JSON.stringify({
    v: 1,
    drafted: { nostrike: 4, big_lou: 2, turbo: 1, wheelchair_ace: 1 },
    wonWith: { nostrike: 2, turbo: 1 },
    trophies: { nostrike: 1, wheelchair_ace: 2 }
  }));
})();`;

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
  const r = await page.evaluate(COLLECT('hud'));
  if (r.error) {
    fail(where, r.error);
    return 0;
  }

  const frame = { w: r.frame.w, h: r.frame.h };

  // 1. NOTHING LEAVES THE FRAME. A strip that overflows on a short landscape
  //    phone is the classic rem-scaling failure and is invisible at desk size.
  //    ⚠️ Through `asBox` — the HUD path passed RAW top-left rects into the
  //    centre-convention predicates from the day it was written, the exact bug
  //    `asBox`'s header records for the screens path. It never fired because
  //    the HUD was one centred strip nowhere near an edge; the matchup plate
  //    is top-left, and the displaced box read as crossing the frame top
  //    while sitting 20px inside it.
  for (const b of r.leaves) {
    if (!insideFrame(asBox(b), frame.w, frame.h, -0.5)) {
      fail(where, `"${b.label}" is off-frame at ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)} in ${frame.w}x${frame.h}`);
    }
  }

  // 2. NO TWO HUD BLOCKS OVERLAP. Siblings of `#hud` occupy named grid areas,
  //    so an overlap means two areas have collided — exactly what the scoreboard
  //    and the pitch picker would do if the strip grew into the right rail.
  //    (`asBox` here too: two raw boxes are displaced by DIFFERENT amounts, so
  //    the raw comparison was measuring rectangles where neither element is.)
  for (let i = 0; i < r.blocks.length; i++) {
    for (let j = i + 1; j < r.blocks.length; j++) {
      if (overlaps(asBox(r.blocks[i]), asBox(r.blocks[j]), 1)) {
        fail(where, `"${r.blocks[i].label}" overlaps "${r.blocks[j].label}"`);
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

/**
 * Reach a SCREEN and audit it.
 *
 * The title is simply where the app starts. The result screen would otherwise
 * need a whole game driven by hand -- about forty minutes of sim time, which is
 * 24,000 renders and wedges the tab -- so it is mounted from a REAL headless
 * `simulateGame`, the same function the 50,000-plate-appearance harness drains.
 * The data is a genuine finished game and the screen is the shipping one; only
 * the forty minutes are skipped.
 */
const SHOW_RESULT = `(async () => {
  const [{ simulateGame }, { makeRng }, chars] = await Promise.all([
    import('/src/v2/sim/game.ts'), import('/src/v2/sim/rng.ts'), import('/src/data/characters.ts')]);
  const { ROSTER, getCharacter } = chars;
  const result = simulateGame({
    away: { name: 'ROCKETS', ids: ROSTER.slice(0, 9).map((c) => c.id) },
    home: { name: 'COMETS',  ids: ROSTER.slice(9, 18).map((c) => c.id) },
    lookup: getCharacter }, makeRng('audit'));
  const [{ resultModel }, { ResultScreen }, { Router }] = await Promise.all([
    import('/src/v2/ui/resultModel.ts'), import('/src/v2/ui/screens/ResultScreen.ts'),
    import('/src/v2/ui/Router.ts')]);
  const m = resultModel(result, { away: 'ROCKETS', home: 'COMETS', you: 'away' },
    ROSTER.map((c) => c.id));
  new Router(document.getElementById('screens'))
    .show(new ResultScreen(m, (id) => getCharacter(id).name, () => {}, () => {}));
  return document.querySelector('.screen--result') ? 'ok' : 'no result screen';
})()`;

const SCREENS = [
  { name: 'title', reach: null, mustSee: '.screen--title .btn' },
  {
    name: 'clubhouse',
    reach: `(async () => {
      document.querySelector('.screen--title .btn--clubhouse')?.click();
      await new Promise((r) => setTimeout(r, 150));
      return document.querySelectorAll('.clubhouse-sticker').length === 30 ? 'ok' : 'no sticker book';
    })()`,
    mustSee: '.screen--clubhouse .clubhouse-back',
  },
  {
    name: 'draft',
    reach: `(async () => {
      document.querySelector('.screen--clubhouse .clubhouse-back')?.click();
      await new Promise((r) => setTimeout(r, 100));
      document.querySelector('.screen--title .btn')?.click();
      await new Promise((r) => setTimeout(r, 300));
      return document.querySelectorAll('.kid').length === 30 ? 'ok' : 'no draft board';
    })()`,
    mustSee: '.screen--draft .kid',
  },
  {
    name: 'team',
    // Straight through a whole draft — nine inspections, nine confirmations
    // and nine CPU beats. The confirmation is load-bearing: tapping a roster
    // thumbnail now PREVIEWS a kid, and only PICK ME records the person's vote.
    // A driver that skips it both fails to reach this screen and quietly stops
    // proving the product's most important interaction.
    // ★ REACHES FROM WHEREVER IT IS. The screen states run in sequence on ONE
    // page, so by the time this runs the draft state has already left the title
    // behind and a blind click on the title button throws. Each reach must be
    // written as "get to my screen from any screen", not "from the front door".
    reach: `(async () => {
      document.querySelector('.screen--title .btn')?.click();
      await new Promise((r) => setTimeout(r, 300));
      for (let i = 0; i < 9; i++) {
        if (document.querySelector('.screen--team')) break;
        const card = document.querySelector('.draft-board:not(.is-locked) .kid');
        if (!card) { await new Promise((r) => setTimeout(r, 200)); i--; continue; }
        card.click();
        const confirm = document.querySelector('.draft-preview__pick');
        if (!confirm) return 'draft preview never offered PICK ME';
        confirm.click();
        await new Promise((r) => setTimeout(r, 680));
      }
      document.querySelector('.screen--draft .btn--hero')?.click();
      await new Promise((r) => setTimeout(r, 500));
      return document.querySelector('.screen--team') ? 'ok' : 'never reached the team picker';
    })()`,
    mustSee: '.screen--team .swatch',
  },
  { name: 'result', reach: SHOW_RESULT, mustSee: '.screen--result .btn' },
];

async function auditScreen(page, vp, screen) {
  const where = `${vp.name} / ${screen.name}`;
  if (screen.reach) {
    const got = await page.evaluate(screen.reach);
    if (got !== 'ok') {
      fail(where, `could not reach the screen: ${got}`);
      return 0;
    }
  }
  const seen = await page.evaluate(`!!document.querySelector(${JSON.stringify(screen.mustSee)})`);
  if (!seen) {
    fail(where, `"${screen.mustSee}" is not present`);
    return 0;
  }
  const r = await page.evaluate(COLLECT('screens'));
  if (r.error) {
    fail(where, r.error);
    return 0;
  }
  const frame = { w: r.frame.w, h: r.frame.h };
  for (const b of r.leaves) {
    // ★ A SCROLLING SCREEN CHANGES WHAT "OFF-FRAME" MEANS, and pretending it
    // does not would either fail the draft board for having thirty cards or
    // force it to fit thirty kids on a phone at a size nobody can tap. Below the
    // fold is REACHABLE; off the side and above the top are not. So the rule
    // splits: horizontal containment always, vertical only when the screen does
    // not scroll, plus "nothing starts above the scroller" either way.
    const horizontal = b.x >= -0.5 && b.x + b.w <= frame.w + 0.5;
    const vertical = r.scrolls ? b.y >= -0.5 : insideFrame(asBox(b), frame.w, frame.h, -0.5);
    if (!horizontal || !vertical) {
      fail(where, `"${b.label}" is off-frame at ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)} in ${frame.w}x${frame.h}${r.scrolls ? ' (scrolling screen)' : ''}`);
    }
  }
  for (let i = 0; i < r.blocks.length; i++) {
    for (let j = i + 1; j < r.blocks.length; j++) {
      if (overlaps(asBox(r.blocks[i]), asBox(r.blocks[j]), 1)) {
        fail(where, `"${r.blocks[i].label}" overlaps "${r.blocks[j].label}"`);
      }
    }
  }
  // ★ AND THIS IS WHERE THE TAP-TARGET RULE STOPS BEING VACUOUS. Nothing in the
  // HUD is interactive; every button in the game is on a screen.
  const floor = tapMinPx(r.rootFontPx);
  if (r.interactives.length === 0) fail(where, 'a screen with no tappable control');

  // ★ AND THE HUD'S OWN CONTROLS, ON THIS ROUTE. The mute lives in `#hud` so it
  // survives every screen, which means auditing `#screens` alone never measures
  // it -- and `/v2/?play=1`, where the in-game states run, does not mount the app
  // shell at all. Between the two, the only persistent button in the game was
  // checked by nothing. It is also the first `.interactive` element the HUD has
  // ever had, so this is where that rule stops being vacuous.
  const hud = await page.evaluate(COLLECT('hud'));
  const controls = [...r.interactives, ...(hud.error ? [] : hud.interactives)];
  if (!hud.error) {
    if (hud.interactives.length === 0) fail(where, 'the HUD has no mute control');
    for (const b of hud.interactives) {
      if (!insideFrame(asBox(b), r.frame.w, r.frame.h, -0.5)) {
        fail(where, `HUD control "${b.label}" is off-frame at ${Math.round(b.x)},${Math.round(b.y)}`);
      }
    }
  }
  for (const b of controls) {
    if (b.w + 0.5 < floor || b.h + 0.5 < floor) {
      fail(where, `tap target "${b.label}" is ${Math.round(b.w)}x${Math.round(b.h)}, floor is ${Math.round(floor)}`);
    }
  }
  return r.leaves.length + (hud.error ? 0 : hud.interactives.length);
}

async function main() {
  await startVite();
  const browser = await chromium.launch({ args: process.env.CI ? ['--no-sandbox'] : [] });
  let audited = 0;
  try {
    for (const vp of VIEWPORTS) {
      const errors = [];
      let page = null;
      // ★ Game states at the clamp-PINNING viewports only — see GAME_VIEWPORTS.
      if (GAME_VIEWPORTS.includes(vp)) {
      page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      page.on('pageerror', (e) => errors.push(String(e)));
      // ★ The stage shrink must beat the FIRST frame, not follow it. Applied
      // only after `goto` resolves, the boot renders the full 3D scene at the
      // real viewport size in software GL — which is exactly the cost the
      // shrink exists to delete, paid 12 times per run (2 gotos x 6
      // viewports). The neighborhood scenery (PR 28) pushed those boots past
      // the run budget on CI runners and this gate started flaking on
      // `page.goto` timeouts with every scenario it DID run green. An init
      // script installs the same style at document start, so the first frame
      // is already 2px; the post-goto tag below stays as the belt to this
      // brace (navigations inside a scenario would otherwise lose it).
      await page.addInitScript(INIT_SHRINK);
      // ★ 'domcontentloaded', NEVER 'load'. Every flake this gate has had was
      // `page.goto` timing out on 'load' — which waits for every subresource
      // on the page, none of which this file measures. What it DOES need is
      // named explicitly instead: modules executed (`__spike` exists; module
      // scripts run before DOMContentLoaded, so the wait below is a
      // formality that also covers the app's async boot) and FONTS SETTLED,
      // because `font-display: swap` re-layouts every text box when Fredoka
      // lands, and a box measured mid-swap is a box measured in the wrong
      // font.
      await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction('!!window.__spike', { timeout: 30_000 });
      // Bounded: in an occluded headless page `fonts.ready` can wait for a
      // rendering opportunity that never comes — the uncapped version hung a
      // CI run for its whole 480s budget with no output and no error. A font
      // that has not settled in 5s falls back to measuring the fallback,
      // which a failed run cannot measure at all.
      await page.evaluate(
        'Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]).then(() => true)'
      );
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
      // The screens, on the app entry point rather than the bare game view —
      // and on a FRESH page. Navigating the game page away is a 50-SECOND
      // stall, measured: the unload of a page whose sim was pumped through
      // four states blocks the next document's commit (about:blank absorbed
      // the whole 50s and the app then booted in 82ms), which is what every
      // ‘/v2/’ goto timeout in this gate's history actually was. The pumped
      // page is fire-and-forget closed; its teardown runs off the audit's
      // critical path.
      void page.close().catch(() => {});
      }
      page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.addInitScript(INIT_SHRINK);
      await page.addInitScript(INIT_CLUBHOUSE);
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      // Bounded: in an occluded headless page `fonts.ready` can wait for a
      // rendering opportunity that never comes — the uncapped version hung a
      // CI run for its whole 480s budget with no output and no error. A font
      // that has not settled in 5s falls back to measuring the fallback,
      // which a failed run cannot measure at all.
      await page.evaluate(
        'Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]).then(() => true)'
      );
      await page.addStyleTag({ content: NO_MOTION });
      await page.waitForSelector('.screen--title', { timeout: 30_000 }).catch(() => {});
      for (const screen of SCREENS) {
        const n = await auditScreen(page, vp, screen);
        audited += n;
        const bad = failures.filter((f) => f.startsWith(`${vp.name} / ${screen.name}:`));
        const mark = bad.length ? `${c.red}✗${c.off}` : `${c.green}✓${c.off}`;
        console.log(`  ${mark} ${(vp.name + ' / ' + screen.name).padEnd(34)} ${c.dim}${n} boxes${c.off}`);
        for (const b of bad) console.log(`      ${c.red}${b.split(': ').slice(1).join(': ')}${c.off}`);
      }

      // A page error is a failure even if the boxes happened to land right.
      for (const e of errors) fail(vp.name, `page error: ${e}`);
      void page.close().catch(() => {});
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
    `\n${c.green}v2 layout clean${c.off} across ${GAME_VIEWPORTS.length}x${STATES.length} game + ${VIEWPORTS.length}x${SCREENS.length} screen scenarios ${c.dim}(${audited} boxes)${c.off}`
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
