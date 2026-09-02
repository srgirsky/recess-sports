// ---------------------------------------------------------------------------
// Two palette names in one sculpt source may not share a hex.
//
// A sculpt script names its colours — SHOE, SOLE, CUFF, TEAM_MASK — and the
// builders paint by NAME: a lace strap is `trim`, a rolled cuff's top ring is
// `team_mask`. When two names carry the same six hex digits the geometry is
// built and painted invisible, and no board can see it because there is no
// boundary to see. It has cost three rounds so far:
//
//   * Mimi's CUFF and TEAM_MASK were byte-identical, so the runtime — which
//     tints everything on the accent material — painted the ENTIRE ankle roll
//     team-colour and the recorded "thin top ring" convention could not be
//     enforced by colour (#194).
//   * Bubbles' SHOE and SOLE were both #F6C48C, so three declared lace straps
//     and a re-enabled toe cap shipped painted the panel colour: "built but
//     invisible", scored as a clothing gap by two critics before anyone
//     grepped the palette (#198, #200).
//   * Sniffles declared a CUFF identical to his TEAM_MASK (this lint's first
//     catch; the name was unused, so the trap was armed and waiting).
//
// The rule is on NAMES, not colours: a kid may of course wear two things the
// same colour — the allowlist below names each such pair WITH THE REASON, and
// like every allowlist in scripts/ it may only shrink. A pair that is not
// listed and shares a hex is a defect until someone writes down why not.
//
// Break-it record (2026-09-02): against main before this change the test
// failed with
//   "bubbles: SHOE and SOLE share #F6C48C — give the trim its own hex or
//    allowlist the pair with its reason"
// and the same for sniffles' CUFF/TEAM_MASK; the stale-entry check fails with
// "allowlist entry theo SHOE_DARK/SOLE no longer shares a hex — delete it"
// when the pair is made distinct.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'blender');

/** Deliberate same-colour pairs, each with the reason it is one colour. May only SHRINK. */
const ALLOW = {
  'bubbles SHIRT/STRIPE': 'the sock stripes are the dress\'s own pink by design (source comment)',
  'chip SHIRT/STRIPE': 'the sock stripe is the hoodie green by design',
  'theo SHOE_DARK/SOLE': 'the trim lane IS the charcoal saddle panels and laces (source comment)',
};

const sources = readdirSync(DIR).filter((f) => /^sculpt-.*-source\.py$/.test(f));

function palette(file) {
  const byHex = new Map();
  const text = readFileSync(join(DIR, file), 'utf8');
  for (const m of text.matchAll(/^([A-Z][A-Z_0-9]*)\s*=\s*rgba\("([0-9A-Fa-f]{6})"\)/gm)) {
    const hex = m[2].toUpperCase();
    if (!byHex.has(hex)) byHex.set(hex, []);
    byHex.get(hex).push(m[1]);
  }
  return byHex;
}

const kidOf = (file) => file.replace(/^sculpt-/, '').replace(/-source\.py$/, '');

describe('two palette names in one sculpt source never share a hex', () => {
  it('finds sculpt sources', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  for (const file of sources) {
    it(`${kidOf(file)} paints every named colour distinctly`, () => {
      const problems = [];
      for (const [hex, names] of palette(file)) {
        if (names.length < 2) continue;
        for (let i = 0; i < names.length; i++) {
          for (let j = i + 1; j < names.length; j++) {
            const key = `${kidOf(file)} ${names[i]}/${names[j]}`;
            if (ALLOW[key]) continue;
            problems.push(
              `${kidOf(file)}: ${names[i]} and ${names[j]} share #${hex} — give the trim its own hex or allowlist the pair with its reason`
            );
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }

  it('the allowlist has no stale entries', () => {
    for (const key of Object.keys(ALLOW)) {
      const [kid, pair] = key.split(' ');
      const [a, b] = pair.split('/');
      const file = `sculpt-${kid}-source.py`;
      const shared = [...palette(file).values()].some((names) => names.includes(a) && names.includes(b));
      expect(shared, `allowlist entry ${key} no longer shares a hex — delete it`).toBe(true);
    }
  });
});
