// ---------------------------------------------------------------------------
// ★ A COLOUR DECISION NO GATE CAN SEE IS A COLOUR DECISION THAT GETS REVERTED.
//
// The runtime's tone mapping curve decides how every authored swatch on every
// character reaches a player's eye — and **not one automated check in this repo
// can observe it.** `measure:fidelity` grades `<slug>-front-review.png`, which
// Blender renders with its own EEVEE lights; `palette.lint` reads COLOR_0 out
// of the GLB; `validate:models` reads the file. All of them are upstream of the
// renderer. Change `Renderer.ts`'s curve and every number in this project stays
// identical while the game looks different.
//
// That is the exact shape of a change that gets undone by accident months
// later, by someone reasonably assuming a default is a default.
//
// ★ WHAT IT COST TO FIND, AND WHY THE CURVE IS NOT A TASTE CALL.
//
// ACES has a filmic shoulder; its job is to desaturate bright values. This
// roster is pale warm creams — a sneaker midsole, a sock, a cream trim — on
// saturated garments, which is the worst case for that shoulder. The maintainer
// reported it as "the cream reads grey in game", and it measured out.
//
// Bounded to the character (a full-frame reading is meaningless — the HUD is
// DOM and is never tone-mapped), against Tank's own delivered COLOR_0:
//
//               shoe cream r-b    skin r-b    grass lum    kid lum   clipped
//   authored         104            128           -           -         -
//   ACES 1.05         89 (86%)      110 (86%)     74          85      0.00%
//   Neutral 1.05      97 (93%)      118 (92%)     71          79      0.00%
//   Neutral 1.25     100 (96%)      123 (96%)     78          81      0.00%
//   Neutral 1.35     102 (98%)      124 (97%)     81          84      0.00%
//
// Neutral at 1.25 recovers the warmth without moving the world the art was
// authored against. Full provenance, including what was rejected, is
// `render.toneMapping` in `scripts/measures.json`.
//
// ⚠️ THIS PIN DOES NOT FORBID CHANGING IT. It forbids changing it SILENTLY.
// Moving the curve means updating the record and this file together, which is
// the reviewable act. `?tonemap=` and `?exposure=` remain live for A/B work and
// deliberately are not pinned — a debug flag is not a default.
//
// Break-it record: swapping the default back to `ACESFilmicToneMapping` fires
// "Renderer.ts sets ACESFilmicToneMapping; the measured default is
// NeutralToneMapping".
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const renderer = () => readFileSync(resolve(repo, 'src/v2/render/Renderer.ts'), 'utf8');
const measures = () => JSON.parse(readFileSync(resolve(repo, 'scripts/measures.json'), 'utf8'));

/** The measured default. Changing these means changing the record too. */
const CURVE = 'NeutralToneMapping';
const EXPOSURE = 1.25;

describe('the runtime tone mapping stays where it was measured', () => {
  it('sets the curve the measurement chose', () => {
    const src = renderer();
    const m = /DEFAULT_TONE_MAPPING: ToneMapping = (\w+);/.exec(src);
    expect(m, 'Renderer.ts no longer declares DEFAULT_TONE_MAPPING').not.toBeNull();
    expect(
      m[1],
      `Renderer.ts sets ${m?.[1]}; the measured default is ${CURVE}. ACES desaturates ` +
        "pale warm values by ~14% on this roster's own swatches and that is what made " +
        'the cream read grey. If you mean to change it, update `render.toneMapping` in ' +
        'scripts/measures.json with fresh readings and change this pin in the same commit.',
    ).toBe(CURVE);
  });

  it('sets the exposure the field luminance solved for', () => {
    const m = /DEFAULT_TONE_EXPOSURE = ([\d.]+);/.exec(renderer());
    expect(m, 'Renderer.ts no longer declares DEFAULT_TONE_EXPOSURE').not.toBeNull();
    expect(
      Number(m[1]),
      'the exposure is not free: it is what keeps the field within ~5% of the ' +
        'luminance the art was authored against under ACES. Re-measure before moving it.',
    ).toBe(EXPOSURE);
  });

  it('keeps the A/B flag reachable, because the next person needs it too', () => {
    // The flag is how this decision was made and how it can be re-examined
    // without editing two files. Losing it makes the record unrepeatable.
    const src = renderer();
    expect(src).toContain("params.get('tonemap')");
    expect(src).toContain("params.get('exposure')");
  });

  it('is backed by a measures record that carries the numbers', () => {
    // A pin with no provenance is a magic constant with a test. The record has
    // to hold the readings, or "why Neutral" is unanswerable in six months.
    const record = measures().render?.toneMapping;
    expect(record, 'scripts/measures.json has no render.toneMapping record').toBeDefined();
    expect(record.status).toBeDefined();
    expect(record.informs).toContain('Renderer.ts');
    expect(JSON.stringify(record.measurements)).toContain('aces');
  });
});
