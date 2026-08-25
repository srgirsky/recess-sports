# scripts/ — AI brief

Loaded when you touch anything under `scripts/`. The root `AGENTS.md` is the
always-loaded brief; this one carries the rules for the measurement instrument
and the lints.

## Writing a lint in this repo

The house pattern is `hitrect.lint.test.js`, `simclock.lint.test.js`,
`pitchbase.lint.test.js`, `purity.lint.test.js`, `bundle.lint.test.js`. Plain JS
in `scripts/`, not TS in `src/`, because a lint touches the filesystem and
tsconfig's `include` is src-only with no `@types/node`. Vitest's default include
picks them up, so `npm test` and CI run them with no wiring.

- **A long `// ---` header naming the failure it prevents.** The person reading a
  red test is standing in that file; the reasoning belongs where they are, not in
  a brief they may not have loaded. This is why a brief may cite a lint instead
  of restating it.
- **An allowlist or budget may only SHRINK.** Raising one is the reviewable act,
  and the comment beside the entry says what earned it.
- **No stale entries.** A ratchet that permits unused slack is not a ratchet —
  it just gets refilled. Assert the allowlist has no dead entries and that a
  budget with real headroom must be lowered.
- **Break it once before you trust it.** A rule that never fires is
  indistinguishable from no rule; the header records that the break was tried and
  what the message said.
- **The message says what to do instead**, not merely what is wrong.

## The brief budgets — `brief.lint.test.js`

Every `AGENTS.md` in the repo is loaded into an AI session: the root one always,
a nested one whenever a file in its subtree is read. That is a per-session token
bill, and it is why each has a byte and line ceiling. Adding material is fine —
adding it *to the root* is what the routing table in the root brief governs.

`brief-inventory.json` is the census that makes deletion safe: one entry per rule
that was in the 161 kB brief, each with an `anchor` (a string that travels with
the rule) and an `owner` (the file that now carries it). Moving a rule means
flipping its `owner`; the lint then proves the anchor is really there. It is a
census, not a copy — it restates no rule's content, and it is never auto-loaded.

**Do not regenerate it.** It was extracted once and is hand-maintained after
that; a regenerator would clobber the `owner` edits that are the whole point.

### ★ There is deliberately no path-scoped rules file, and that was checked

A nested brief is **dropped after context compaction** until a file in its
subtree is read again; only the root brief is re-injected. The obvious guard is a
path-scoped rule file under the .claude directory (the feature is real and
documented). It does not work: a rule carrying a
`paths:` frontmatter has **exactly the same compaction behaviour** as a nested
brief. Only an UNSCOPED rule survives — and an unscoped rule loads in every
session, which is the cost this whole arrangement exists to remove.

The root brief already survives compaction and already carries the instruction to
re-read the brief for the tree you are in. A rules file would be a second copy of
it. Do not add one thinking it closes the gap; it closes nothing and duplicates
something.

## Commands that live here

`npm run sim:harness` · `npm run sim:plate-sweep` · `npm run sim:game` ·
`npm run analyse:turnaround` · `npm run validate:models` · `npm run export:authored-character` ·
`npm run review:character-fidelity` · `npm run retarget:rig` · `npm run audit:layout` · the other
`export:*` and `manifest:models` asset scripts. Details in `README.md`.

## `measures.json` is the record, not the prose

A number with provenance belongs in `scripts/measures.json`, and a brief cites
the record id rather than the value — a value copied into a brief agrees with a
stale record forever. `measure/conformance.test.js` gates the link from record to
constant, and it is the only walk that visits each record once, so it is where
the `reference` and `status` rules are enforced.

## Where things live

| File | What it owns |
|---|---|
| `scripts/measure/lib.js` | PURE measure math: robust stats, `summarize`, DERIVED confidence |
| `scripts/measure/video.js` | ffmpeg I/O, the play indexer, the `clockFidelity` gate |
| `scripts/measure/screenshot.js` | the EXACT-COLOUR path; throws if the blit is inexact |
| `scripts/measure/conformance.test.js` | the record->constant gate; one walk, each record once |
| `scripts/layout.browser.js` | the in-page layout audit, paste into a dev tab |
| `scripts/layout-audit.mjs` / `scripts/v2/ui-audit.mjs` | `audit:layout` over the scene x CONTENT matrix; same predicates over v2's HUD |
| `scripts/v2/presentation-smoke.mjs` | `smoke:presentation`: paint beats, assert PLAYING clips |
| `scripts/goldlog.browser.js` | the seeded v1 drive; its fingerprint stays byte-identical |
| `scripts/v2/turnaround.mjs` / `tone.mjs` / `analyse-turnaround.mjs` | reader, colour ruler, spec writer; `regionRunsAt` NAMES a run |
| `scripts/v2/glb.mjs` | dependency-free glTF read AND write — a playback loader forgives; a validator rejects |
| `scripts/v2/modelRules.mjs` | the rule engine behind both `validate:models` fronts |
| `scripts/v2/harness.mjs` / `plate-sweep.mjs` | the 50k-PA run, and the coupled-constant search |
