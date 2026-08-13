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

★ THE THREE CONVENTIONS THAT DECIDE WHETHER A SCULPT IS BOUND AT ALL, and all
three are invisible in the bind pose. Tank shipped with every gate green while
breaking all three, and only the runtime run still showed it:

  * **The rig is a T-POSE.** `LeftArm` is at x -0.400, `LeftForeArm` at -0.918
    and `LeftHand` at -1.365, all at z 2.471 — the arms run STRAIGHT OUT
    SIDEWAYS. Author them there. A sculpt with the arms hanging at the hips
    looks correct on every board and swings about pivots two feet away the
    moment a clip plays.
  * **LEFT IS NEGATIVE X.** So a `side` multiplier of +1 is the RIGHT side. Name
    the bones accordingly; a symmetric pose hides the mistake completely and an
    asymmetric clip then drives the wrong limb.
  * **FORWARD IS -Y.** `LeftToeBase` sits at y -0.259 against `LeftFoot` at 0,
    and `head_surface` puts the face at bearing 0 where `ny = -sin(phi)`. A shoe
    built toe-forward in +y points the character's feet backwards, and a front
    render cannot tell.

The cheapest check is a comparison, not a rule: read the delivered GLB's
vertices for one hand and confirm they wrap the bone that drives them.
`authored-character.test.js` does this as a RANK — a vertex's dominant bone
must be among its nearest — because distance alone cannot separate a misbound
forearm from a skull that legitimately sits 1.3ft above the Head bone.

★ HOW TO KNOW A CHANGE HERE WAS SAFE. Re-run a character's sculpt script,
re-export, and compare geometry:

    npm run compare:glb-geometry -- <baseline>.glb public/v2/models/kid_<id>.glb

The pipeline is deterministic where it matters — Junebug's binary buffer and all
89 accessors reproduce byte for byte — so a refactor that changes no float
provably changes no mesh. Whole-file comparison does NOT work; Blender's save is
not byte-reproducible and its hash is stamped into the GLB.
"""
