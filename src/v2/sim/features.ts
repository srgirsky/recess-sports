// ---------------------------------------------------------------------------
// The held features, as flags. Every one of them defaults OFF.
//
// ★ THE HOLD IS DATA, NOT A COMMENT. `docs/playtests/holds.json` records that
// defensive shifts, stamina and juice/power-ups were deliberately withheld on
// 2026-08-08 for want of playtest evidence, and that special pitches were never
// formally held at all. `scripts/playtest.lint.test.js` reads that file AND this
// one, and fails if any feature the holds file still lists as `held` or
// `never-held` defaults to `true` here. Lifting a hold means filing a playtest
// record with `verdict: "lift"` and naming it in `liftedBy` — only then may the
// default flip. That is the whole mechanism: a feature port lands behind its
// flag, the flag stays false, and a session with children is what turns it on.
//
// ★ TWO PORTS HAVE LANDED: `stamina` is read by `game.ts` (`Side.stamina`,
// `sim/stamina.ts`) and so is `juice` (`Side.juice`, `sim/juice.ts`, with its
// spends reaching `contact.ts`, `play.ts` and `fielders.ts`). The other two
// are still seams — `GameSpec.features` and `PlaySpec.features` carry the type
// so their ports have something to hang off. `game.test.ts` proves each case:
// the fingerprints with the field absent and at `DEFAULT_FEATURES` are
// identical, the two unported flags are inert, and each ported flag changes
// the game — "wired but inert" is the failure `src/v2/AGENTS.md` § The human
// names, and a port without that third test is exactly it.
//
// Pure and import-free on purpose: the purity lint applies to everything in
// `src/v2/sim/**`, and a flags module that reached for `location.search` would
// drag the DOM into the sim. `GameView.newGame` reads `?features=` and passes
// the parsed object in.
// ---------------------------------------------------------------------------

export interface Features {
  /** A tiring pitcher: his stat sags as the pitch count climbs. */
  stamina: boolean;
  /** Juice — a meter charged by play and spent on a power swing, turbo legs or a golden glove. */
  juice: boolean;
  /** Crazy ball, fireball, freezeball — the special pitch kinds. */
  specialPitches: boolean;
  /** Defensive shifts: pull, oppo, normal. */
  shifts: boolean;
}

/** Every held feature, off. The lint holds this to `docs/playtests/holds.json`. */
export const DEFAULT_FEATURES: Readonly<Features> = Object.freeze({
  stamina: false,
  juice: false,
  specialPitches: false,
  shifts: false,
});

/** The names `?features=` accepts, in the order they are documented. */
export const FEATURE_NAMES: ReadonlyArray<keyof Features> = Object.freeze([
  'stamina',
  'juice',
  'specialPitches',
  'shifts',
] as const);

/**
 * Parse a `?features=` value: `all`, or a comma-separated list of names.
 *
 * Unknown names are ignored rather than thrown, because the value comes off a
 * URL a person typed at a playtest — a typo should cost the one feature it
 * misspelled, not the session. Whitespace and case are forgiven for the same
 * reason. `null` (no parameter) is the defaults.
 */
export function parseFeatures(raw: string | null): Features {
  const f: Features = { ...DEFAULT_FEATURES };
  if (raw === null) return f;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.some((p) => p.toLowerCase() === 'all')) {
    for (const name of FEATURE_NAMES) f[name] = true;
    return f;
  }
  const byLower = new Map<string, keyof Features>(FEATURE_NAMES.map((n) => [n.toLowerCase(), n]));
  for (const p of parts) {
    const name = byLower.get(p.toLowerCase());
    if (name) f[name] = true;
  }
  return f;
}

/** The names that are on, for a log line or a record. */
export function enabledFeatures(f: Readonly<Features>): Array<keyof Features> {
  return FEATURE_NAMES.filter((n) => f[n]);
}
