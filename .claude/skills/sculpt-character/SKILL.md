---
name: sculpt-character
description: Take one roster character from concept turnaround to a delivered, measured kid_<id>.glb — the full authored-character pipeline, its gates, and the two verification instruments that lie.
---

# Sculpting one character

The 30 characters ARE the product. This is the whole pipeline for taking one
from a concept sheet to a delivered model, in the order it must happen.

**Do one character at a time, all the way to the end.** Four half-sculpted kids
are worth less than one finished one, because the thing being proved by
character N is that the shared library generalises — and a half-sculpt proves
nothing.

## Before you touch anything

Read, in this order — they carry rules this file deliberately does not repeat:

1. `AGENTS.md` (root) — loads automatically. The gates table and § Only one place.
2. `scripts/v2/blender/sculptlib/__init__.py` — the package doc. **The three rig
   conventions and the safety procedure are here.**
3. `scripts/AGENTS.md` — the lint conventions and `measures.json`'s role.
4. `scripts/v2/blender/sculpt-tank-source.py` — the worked exemplar. Tank is the
   most recent and most complete; Junebug is older and hand-written.

Then check the state of play, because it moves:

```bash
node -e "const j=require('./assets/v2/source/character-fidelity.json');
  const c=j.characters??j; for(const[k,v]of Object.entries(c)) if(v?.status) console.log(k, v.status)"
```

## The sequence

### 1. Read the sheet with the tool, not with your eyes

```bash
npm run analyse:turnaround -- <id> --write     # -> scripts/v2/turnaround-specs/<slug>.spec.json
```

If `<id>` has no recipe, add one to `scripts/v2/turnaround-recipes.mjs` first —
that file's header explains the four things a turnaround cannot tell you about
itself. **A recipe is a reviewable act**; every declaration in it is checked
against the sheet and a mismatch is an error, never a silent override.

The spec says what the sheet supports **and what it refuses**. A refusal is an
answer. Do not go around it by eyeballing the number.

### 2. Register the character

Add a `source` to `scripts/v2/character-registry.json`. Membership in the
authored set is **earned by declaring a source** — a kid with concept art and no
`.blend` is a kid nobody has sculpted, and the gates must not ask them for
evidence that cannot exist.

### 3. Bootstrap the `.blend` (new characters only)

```bash
blender --background --factory-startup \
  --python scripts/v2/blender/build-signature-source.py -- <id>
```

It refuses to replace an existing source, by design.

### 4. Write `scripts/v2/blender/sculpt-<slug>-source.py`

Copy Tank's structure. What goes where is not a style question:

| In the sculpt script | In `sculptlib/` |
|---|---|
| every number traced off **that kid's** sheet | construction that reads no character's table |
| the station tables, the section profiles, the bands | the builders that consume them |
| curves that are one kid's shape (`inseam_half`, `sole_profile`) | curves that are the rig (`leg_x`) |

Call the shared builders with a spec: `build_arm`, `build_leg`, `build_shoe`,
`build_ear`, `head_surface`. Each spec's fields are **all required** —
`sculptspec.lint.test.js` enforces it from both sides, and the reason is in its
header: a default is one kid's measurement living in the shared library, which
has already shipped twice.

**Every authored table needs provenance** — `# measured: <view> z=<ft>
halfWidth=<ft>` or `# not-traceable: <why>` — and the gate re-measures the
citations. Two rules about this:

- **Module-level tables are governed; locals are not.** A table declared inside
  its own builder escapes the gate entirely. That is how the arm's and the leg's
  went uncited for twenty rounds. Author them at module level.
- **Never write `not-traceable` on a table the sheet can give.** That is
  weakening a gate to pass. Check with `regionRunsAt` / `namedRunAt` first and
  put the measurement in the reason.

### 5. Build, deliver, verify

```bash
cp public/v2/models/kid_<id>.glb /tmp/baseline.glb          # if one exists
blender --background assets/v2/source/<slug>-pilot.blend \
  --python scripts/v2/blender/sculpt-<slug>-source.py       # rebuilds the .blend
npm run export:authored-character -- <id>                   # .blend -> .glb
npm run validate:models
npm test
```

### 6. Measure before you form an opinion

```bash
npm run review:character-fidelity -- <id>    # renders the boards
npm run measure:fidelity -- <id>             # grades them
```

`measure:fidelity` **settles anything it covers before any 1-5 eye score is
discussed.** Six rounds were once spent arguing a shoe's colour split with the
metric sitting right there.

### 7. Score it — but not yourself

**The sculptor never scores its own work.** An independent critic scores from
freshly rendered boards. If you sculpted it, you may report the measured
numbers; you may not assign the rubric scores.

### 8. Status

Agents cap at `candidate`. `approved` requires a human `approvedBy`,
`approvedAt` and `approvedEvidenceSha256` in
`assets/v2/source/character-fidelity.json`. Say plainly that approval is the
maintainer's and hand them the board path.

## ★ The two instruments that lie

**Both look exactly like verification. Both have certified a completely broken
sculpt.**

1. **`export:authored-character` does not run the sculpt script.** It reads the
   `.blend`. Edit the `.py`, skip the Blender line, and every downstream check
   re-certifies the build you already had.
2. **The delivered GLB's sha256 is not a geometry check.** The exporter stamps
   the `.blend`'s hash into the GLB and Blender's save is not byte-reproducible,
   so it changes when the source *is* rebuilt and holds when it is not — exactly
   backwards.

Under both, a source file with a `NameError` in it passed as "geometry is
identical" and took a 1,587-test suite green with it, **because no test opens
Blender.** Use `npm run compare:glb-geometry -- <baseline> <candidate>`, which
ignores the bookkeeping fields by name.

There is a third: **`measure:fidelity` reads a checked-in PNG.** Re-render with
`review:character-fidelity` before you believe its numbers, or you are grading
the previous sculpt.

## The failure class this project keeps hitting

**A quantity read down a line that passes through more than one object.** It has
cost this project at least five expensive rounds:

- the torso read across `sleeve | torso | sleeve` — 0.910 authored where the
  torso alone is 0.532
- the shoe read across two overlapping feet — 1.211ft for a 0.86ft foot
- the mouth read on the chin shadow — the atlas mouth at 97.3% of head height
- the legs read across a 2px seam — silhouette 0.6589 where one leg is 0.3178
- white × skin vertex colour = skin, exactly — which deleted every sclera

Before trusting any width: ask `regionRunsAt` which object each run is, and
declare paired parts in the recipe. `runidentity.lint.test.js` is the gate.

## Definition of done

- [ ] `npm test` and `npm run validate:models` green
- [ ] geometry verified with `compare:glb-geometry` (not a hash, not a re-export)
- [ ] `measure:fidelity` run on **freshly rendered** boards, every metric
      reported — including the ones still out of tolerance
- [ ] every authored table carries a citation or a measured refusal
- [ ] scored by an independent critic, not by whoever sculpted it
- [ ] status `candidate`; approval named as the maintainer's
- [ ] docs updated in the same branch (root `AGENTS.md` § The gates for a new
      gate; `README.md` for a new command)
- [ ] shipped as a **PR against `main`** — never a direct push

## Do not

- **Do not touch Junebug** (`nostrike`) while her board is awaiting re-approval.
  Her builders are the pre-review versions and adopting the newer construction
  would change her mesh mid-review.
- **Do not weaken a gate to make a sculpt pass.** If a gate is wrong, say so and
  show the measurement.
- **Do not claim a fix you have not measured from the artefact.** A full-page
  screenshot compared against a tight crop is not evidence; that mistake shipped
  an elbow that was never baked.
