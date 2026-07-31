// ---------------------------------------------------------------------------
// A lint with teeth: no NEW hand-written tap targets.
//
// `pill()` sizes itself to MEASURED text, so any `Rectangle(-55, -22, 110, 44)`
// written next to a `minW: 110` is a guess that drifts the moment the label,
// the font, or the platform's emoji metrics change. SchoolyardScene already
// carried two hand-patched examples (a 140-wide rect on a minW-130 pill, a 170
// on a 160) — someone noticed the drift and corrected the symptom twice without
// the cause ever being fixed.
//
// A rect whose arguments are all numeric literals is a guess. A rect derived
// from a measured value (`-w / 2`, `-minW / 2`, `m.ox - w / 2`) is not, and
// passes automatically. Use `hitFromBox()` from src/ui/layout.ts instead.
//
// Lives in scripts/ as plain JS for the same reason conformance.test.js does:
// it touches the filesystem, and tsconfig's `include` is src-only with no
// @types/node.
//
// The allowlist may only SHRINK. Adding to it is the reviewable act.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src');

/**
 * Files still holding hardcoded tap targets, with how many each has.
 * Every entry is a place where the drawn shape and the touchable area can
 * silently disagree. Drive these to zero; never raise one.
 */
const ALLOWLIST = {
  // Every menu scene is converted and deliberately has no entry.
  //
  // GameScene is the last holdout, and on purpose: its HUD sits inside the
  // seeded goldlog stream, so re-flowing it needs its own PR with a
  // fingerprint-regeneration budget. Its hit areas are stable today because the
  // HUD geometry is declared in config.HUD rather than measured per label.
  //
  // 6 -> 5 on 2026-07-31: the practice/spectator exit button's rect was the one
  // that could NOT rely on that stability. It was hand-written 130 wide while
  // `pill()` sizes itself to measured text, so '👀 STOP' and the font-blocked
  // fallback both grew the art past a tap target that stayed put. Now
  // `hitFromBox`, which derives the rect from the pill's published footprint.
  'scenes/GameScene.ts': 5,
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** Every `new Phaser.Geom.Rectangle(a, b, c, d)` whose args are all literals. */
function hardcodedRects(src) {
  const found = [];
  for (const m of src.matchAll(/new Phaser\.Geom\.Rectangle\(([^)]*)\)/g)) {
    const args = m[1].split(',').map((a) => a.trim());
    if (args.length === 4 && args.every((a) => /^-?\d+(\.\d+)?$/.test(a))) {
      found.push(`Rectangle(${args.join(', ')})`);
    }
  }
  return found;
}

describe('hit-area lint', () => {
  const offenders = new Map();
  for (const dir of ['scenes', 'ui', 'dev']) {
    for (const file of walk(join(SRC, dir))) {
      const rects = hardcodedRects(readFileSync(file, 'utf8'));
      if (rects.length) offenders.set(relative(SRC, file).replace(/\\/g, '/'), rects);
    }
  }

  it('adds no hardcoded tap target outside the allowlist', () => {
    const news = [...offenders.keys()].filter((f) => !(f in ALLOWLIST));
    expect(
      news,
      `Hardcoded hit areas in un-allowlisted files. Use hitFromBox() from ui/layout.ts, ` +
        `so the tap target is derived from the measured box:\n` +
        news.map((f) => `  ${f}: ${offenders.get(f).join(', ')}`).join('\n')
    ).toEqual([]);
  });

  it('never grows an allowlisted file past its recorded count', () => {
    for (const [file, budget] of Object.entries(ALLOWLIST)) {
      const rects = offenders.get(file) ?? [];
      expect(
        rects.length,
        `${file} now has ${rects.length} hardcoded hit areas, budgeted ${budget}. ` +
          `Convert one to hitFromBox() instead of raising the budget.`
      ).toBeLessThanOrEqual(budget);
    }
  });

  it('has no stale allowlist entries', () => {
    const stale = Object.entries(ALLOWLIST)
      .filter(([file, budget]) => (offenders.get(file)?.length ?? 0) < budget)
      .map(([f, b]) => `${f}: budget ${b}, actual ${offenders.get(f)?.length ?? 0}`);
    expect(stale, 'These files improved — lower their budget so the gain is locked in.').toEqual([]);
  });
});
