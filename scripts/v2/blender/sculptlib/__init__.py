"""Shared sculpt machinery for Recess Sports characters.

★ WHAT THIS IS, AND WHY IT EXISTS.

Junebug took seven review rounds and a 3,096-line sculpt script, and the obvious
reading — that the other 29 characters cost twenty-nine more of those — is
wrong. Measured, that file is 1,467 lines of code against 1,629 of comment, and
only about 193 code lines are irreducibly hers: the hair cap and its traced
hairline table, the headband, the bun, the ponytail, the arrowhead and the tie.

The rest splits in two. About 456 lines are machinery that knows nothing about
any character, and that is what lives here. Another ~818 are construction code
that is generic in its logic and specific only in the TABLES it reads — arms,
legs, shoes, ears, torso, pelvis, neck — and those follow, one at a time, as
each is proved against a second character rather than guessed at.

★ THE RULE FOR ADDING TO THIS PACKAGE. A function belongs here when it reads no
character's table. If it needs one number that is Junebug's, it is not shared
yet; parameterise it first or leave it where it is. The alternative — lifting it
with her constants baked in — produces a library that silently sculpts one kid
thirty times, which is the exact failure `measure:fidelity`'s hardcoded
`isRed`/`isCream` turned out to be.

★ HOW TO KNOW A CHANGE HERE WAS SAFE. Re-run a character's sculpt script,
re-export, and compare geometry:

    npm run compare:glb-geometry -- <baseline>.glb public/v2/models/kid_<id>.glb

The pipeline is deterministic where it matters — Junebug's binary buffer and all
89 accessors reproduce byte for byte — so a refactor that changes no float
provably changes no mesh. Whole-file comparison does NOT work; Blender's save is
not byte-reproducible and its hash is stamped into the GLB.
"""
