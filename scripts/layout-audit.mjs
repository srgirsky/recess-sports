// ---------------------------------------------------------------------------
// npm run audit:layout
//
// Boots every menu screen headlessly, walks its display list, and fails if any
// two pieces of chrome overlap, leave the frame, collide in hit space, or are
// too small to tap. This is the gate that keeps the GAME SETUP bug — SWING SPOT
// sitting on top of OFF — from coming back on any screen, for any content.
//
// The rules live in scripts/layout.browser.js (also pasteable into a dev tab);
// the scene x content matrix and the waivers live in scripts/layout-audit.json.
//
// Two passes:
//   1. Fredoka loaded — the full ruleset. Asserts the font really resolved,
//      because every measured width is a lie otherwise.
//   2. Fredoka blocked — BootScene races the font load against a 2500ms timeout,
//      so a slow font ships a fallback-font layout to a real user. Arial Black
//      is wider than Fredoka, so this pass runs only the rules that should hold
//      regardless: OUT_OF_FRAME and HIT_OVERLAP.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(readFileSync(join(here, 'layout-audit.json'), 'utf8'));
const AUDIT_JS = readFileSync(join(here, 'layout.browser.js'), 'utf8');
const PORT = 5177;
const URL = `http://localhost:${PORT}/`;

const c = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m' };

function startVite() {
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: join(here, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite did not start in 30s')), 30_000);
    p.stdout.on('data', (d) => {
      if (String(d).includes('ready in')) {
        clearTimeout(t);
        resolve(p);
      }
    });
    p.stderr.on('data', (d) => process.stderr.write(c.dim + String(d) + c.off));
    p.on('exit', (code) => reject(new Error(`vite exited early (${code})`)));
  });
}

/** Waivers match on scene + code + the unordered element pair. */
function isWaived(sceneId, f) {
  return CFG.waivers.some(
    (w) =>
      w.scene === sceneId &&
      w.code === f.code &&
      ((w.a === f.a && (w.b ?? null) === (f.b ?? null)) || (w.a === f.b && w.b === f.a))
  );
}

/** Everything below runs INSIDE the page. */
async function auditScene(page, spec, loose) {
  return page.evaluate(
    async ({ spec, loose }) => {
      const g = window.__game;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const pump = (ms, dt = 50) => {
        let t = Math.max(g.loop.time, performance.now());
        for (let e = 0; e < ms; e += dt) {
          t += dt;
          for (const s of g.scene.getScenes(true)) s.tweens.startTime -= dt;
          g.loop.step(t);
        }
      };

      // The widest of the 56 colour x logo combinations, computed rather than
      // hardcoded so a new colour or logo is covered the day it lands.
      const T = await import('/src/systems/team.ts');
      let longest = { color: 0, logo: 0, name: '' };
      T.TEAM_COLOR_NAMES.forEach((_, col) =>
        T.TEAM_LOGOS.forEach((_, logo) => {
          const n = T.teamName({ color: col, logo });
          if (n.length > longest.name.length) longest = { color: col, logo, name: n };
        })
      );
      if (spec.teamIdentity === 'longest') {
        localStorage.setItem('recess_team', JSON.stringify({ v: 1, color: longest.color, logo: longest.logo }));
      }

      const R = await import('/src/data/characters.ts');
      const ids = R.ROSTER.map((k) => k.id);
      const team = ids.slice(0, 9);

      if (spec.needsSeason) {
        const S = await import('/src/systems/season.ts');
        let s = S.newSeason(team, { color: longest.color, logo: longest.logo }, ids.slice(9), Math.random);
        for (let gi = 0; gi < 5; gi++) {
          const ev = [];
          team.forEach((id, i) => {
            for (let n = 0; n <= i; n++) ev.push({ t: 'atBat', kid: id });
            ev.push({ t: 'hit', kid: id, homer: i % 3 === 0 });
            ev.push({ t: 'run', kid: id });
            if (i % 2) ev.push({ t: 'kThrown', kid: id });
          });
          s = S.recordSeasonGame(s, { rivalIdx: gi, us: 7 - gi, them: gi }, ev);
        }
        S.saveSeason(s);
      }

      let data = spec.data;
      if (spec.result) {
        data = { ...spec.result, playerTeam: team, aiTeam: ids.slice(9, 18) };
        if (spec.result.useIdentity) {
          data.awayIdentity = { color: longest.color, logo: longest.logo };
          data.homeIdentity = { color: longest.color, logo: longest.logo };
        }
      }

      for (const s of g.scene.getScenes(true)) g.scene.stop(s.scene.key);
      g.scene.start(spec.key, data);
      await sleep(350);
      pump(spec.settle || 1800);

      const runOne = () => window.layoutAuditScene(spec.key, { loose });
      const first = runOne();
      if (first.error) return { ...first, longest: longest.name };
      const findings = [...first.findings];
      let tagged = first.tagged;
      let untagged = first.untaggedInteractive;
      const seen = new Set(findings.map((f) => f.code + f.detail));
      const merge = (r) => {
        for (const f of r.findings) if (!seen.has(f.code + f.detail)) (seen.add(f.code + f.detail), findings.push(f));
      };

      const sc = g.scene.getScene(spec.key);
      // Content axes: the defects live in the data, not the code.
      if (spec.cycleDifficulties && sc.diffPills) {
        for (const p of sc.diffPills) {
          p.c.emit('pointerdown');
          pump(120);
          merge(runOne());
        }
      }
      if (spec.cycleVenues && sc.cycleVenue) {
        for (let v = 0; v < 3; v++) {
          sc.cycleVenue(1);
          pump(120);
          merge(runOne());
        }
      }
      return { scene: spec.key, tagged, untaggedInteractive: untagged, findings, longest: longest.name };
    },
    { spec, loose }
  );
}

async function runPass(browser, { blockFont }) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 820 } });
  if (blockFont) await ctx.route('**/fredoka*.woff2', (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(URL, { waitUntil: 'load' });
  await page.addScriptTag({ content: AUDIT_JS });
  await page.waitForFunction(() => window.__game && window.__game.scene.getScenes(true).length > 0, null, {
    timeout: 30_000,
  });
  // Boot hands off to Schoolyard only after the font settles (or times out).
  await page.waitForFunction(
    () => window.__game.scene.getScenes(true).some((s) => s.scene.key !== 'Boot'),
    null,
    { timeout: 30_000 }
  );

  const fontReady = await page.evaluate(() => window.layoutFontReady());
  if (!blockFont && !fontReady) {
    throw new Error(
      'Fredoka did not load — every measured width would be the Arial fallback, so this run proves nothing.'
    );
  }
  if (blockFont && fontReady) {
    console.log(`${c.yellow}  note: font-blocked pass still resolved Fredoka (cached); pass is weaker than intended${c.off}`);
  }

  const results = [];
  for (const spec of CFG.scenes) {
    const r = await auditScene(page, spec, blockFont);
    results.push({ id: spec.id, ...r });
  }
  await ctx.close();
  return { results, errors };
}

function report(label, results, errors, { loose }) {
  console.log(`\n${label}`);
  let failed = 0;
  let waivedCount = 0;
  for (const r of results) {
    if (r.error) {
      console.log(`  ${c.red}✗${c.off} ${r.id.padEnd(32)} ${r.error}`);
      failed++;
      continue;
    }
    const live = r.findings.filter((f) => !isWaived(r.id, f));
    const waived = r.findings.length - live.length;
    waivedCount += waived;
    const extra = [`${r.tagged} boxes`];
    if (waived) extra.push(`${waived} waived`);
    if (r.untaggedInteractive) extra.push(`${r.untaggedInteractive} untagged interactive`);
    if (live.length === 0) {
      console.log(`  ${c.green}✓${c.off} ${r.id.padEnd(32)} ${c.dim}${extra.join(', ')}${c.off}`);
    } else {
      failed += live.length;
      console.log(`  ${c.red}✗${c.off} ${r.id.padEnd(32)} ${c.dim}${extra.join(', ')}${c.off}`);
      for (const f of live) console.log(`      ${c.red}${f.code.padEnd(16)}${c.off} ${f.detail}`);
    }
  }
  if (errors.length) {
    failed += errors.length;
    console.log(`  ${c.red}page errors:${c.off}`);
    for (const e of errors) console.log(`      ${e}`);
  }
  if (loose) console.log(`  ${c.dim}(loose ruleset: OUT_OF_FRAME + HIT_OVERLAP only)${c.off}`);
  return { failed, waivedCount };
}

let vite;
let browser;
try {
  vite = await startVite();
  browser = await chromium.launch();

  const strict = await runPass(browser, { blockFont: false });
  const a = report(`Fredoka loaded ${c.dim}(full ruleset)${c.off}`, strict.results, strict.errors, { loose: false });

  const fallback = await runPass(browser, { blockFont: true });
  const b = report(
    `Font blocked ${c.dim}(BootScene's 2500ms timeout path)${c.off}`,
    fallback.results,
    fallback.errors,
    { loose: true }
  );

  const total = a.failed + b.failed;
  const waived = a.waivedCount + b.waivedCount;
  console.log(
    total === 0
      ? `\n${c.green}Layout clean${c.off} across ${CFG.scenes.length} screens x 2 font states` +
          (waived ? ` ${c.dim}(${waived} waived, see scripts/layout-audit.json)${c.off}` : '')
      : `\n${c.red}${total} layout finding(s)${c.off} — fix them, or add a waiver with a reason to scripts/layout-audit.json`
  );
  process.exitCode = total === 0 ? 0 : 1;
} catch (err) {
  console.error(`${c.red}audit failed to run:${c.off} ${err.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (vite) vite.kill();
}
