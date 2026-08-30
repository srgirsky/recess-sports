"""Curl clumping for hair shells.

★ WHY THIS EXISTS: EVERY θ-ONLY CLUMP IS A FLUTE, AND AMPLITUDE CANNOT SAVE IT.

`hairMass` is the roster's worst rubric category (mean 2.54 of 5 across 30
characters, worst 1). Four rounds on one character moved every measured number
and did not move the score. The history is worth carrying because each step
looked like the fix and was not:

  1. `1 + a·cos(6θ)` with constant `a` — every groove runs the full height of
     the shell. Measured 78.6% column-concentrated against the concept's 41.3%.
     A fluted column, not curls.
  2. Row-varying amplitudes on `cos(6θ)` and `cos(12θ)` — no movement at all
     (80.6% vs 37.2%). 12 is 2x6, so the two terms share every minimum and the
     sum's grooves sit at the SAME θ whatever the amplitudes do.
  3. Row-varying amplitudes on the NON-harmonic `cos(6θ)` and `cos(10θ)`, so
     the minima would wander as the two traded. They wander, and an independent
     review still measured the result as "about three long vertical grooves
     running crown-to-hem".

★ STEP 3 COULD NOT HAVE WORKED, AND THE IDENTITY SAYS SO IN ONE LINE:

    cos(6θ) + cos(10θ) = 2·cos(8θ)·cos(2θ)

The sum is a `cos(8θ)` carrier inside a `cos(2θ)` ENVELOPE, and that envelope
sits at fixed θ however the amplitudes move. Row-varying amplitude can only
make the same flutes deeper and shallower. This generalises: any sum of even
cosines of θ, with any per-row amplitudes, has its extrema pinned in θ. No
choice of amplitudes escapes it, so no amount of tuning that family would ever
have worked.

★ THE CONSTRAINT THAT MADE IT LOOK IMPOSSIBLE, AND THE WAY THROUGH.

The obvious fix is a per-row PHASE. It is forbidden: `cos(kθ)` is even under
θ→−θ and a phase offset destroys that mirror, which blew one character's
`faceAsymmetry` to 7.14 against a tolerance of 4. That lesson was then written
down as "row variation goes in the AMPLITUDE, never the phase" — true, and
read as if amplitude were the only remaining axis. It was not.

**Mirror symmetry constrains the SET of clumps, not each term.** A sum is even
in θ if for every bump at +θ₀ there is an identical bump at −θ₀. Nothing in
that requires each bump to be a function of θ alone — which frees z completely.

So a clump here is what a curl actually is: a BLOB, compact in θ AND in z,
placed in mirror pairs. Bumps at different heights sit at different angles, so
no groove can run the height of the shell — there is no θ-fixed envelope to
run down. Mirror symmetry is exact by construction rather than by tuning, and
the whole thing modulates ring radii that already exist, so it costs ZERO
triangles on a roster jammed against its LOD0 budget.
"""

from __future__ import annotations

from math import exp, pi, tau

# Beyond three standard deviations a Gaussian contributes under 0.02% of its
# own peak, which is far below a vertex position anyone can see. Skipping those
# terms is what keeps this affordable when a shell has 48 columns x 12 rows.
_CUTOFF = 3.0


def _angular_gap(a: float, b: float) -> float:
    """Shortest signed distance from angle `b` to angle `a`, in radians."""
    return (a - b + pi) % tau - pi


def curl_field(
    theta: float,
    z: float,
    seeds: list[tuple[float, float, float]],
    *,
    theta_width: float,
    z_width: float,
) -> float:
    """Clump displacement at (θ, z): a sum of mirror-paired Gaussian curls.

    `seeds` are (θ₀, z₀, amplitude) with θ₀ in (0, π). Each contributes a bump
    at +θ₀ AND at −θ₀, so the field is exactly even under θ→−θ. That is the
    property `faceAsymmetry` is measuring, and it holds here by construction —
    it cannot drift as the seeds are retuned.

    Returns a value to ADD to a unit clump factor, so 0.0 means "perfect ring".
    """
    total = 0.0
    for theta0, z0, amplitude in seeds:
        dz = (z - z0) / z_width
        if dz > _CUTOFF or dz < -_CUTOFF:
            continue
        for sign in (1.0, -1.0):
            dt = _angular_gap(theta, sign * theta0) / theta_width
            if dt > _CUTOFF or dt < -_CUTOFF:
                continue
            total += amplitude * exp(-(dt * dt) - (dz * dz))
    return total


def curl_seeds(
    *,
    pairs_per_row: int,
    bands: int,
    z_top: float,
    z_bottom: float,
    amplitude: float,
) -> list[tuple[float, float, float]]:
    """Curl centres in `bands` rings, staggered so no two bands align in θ.

    `pairs_per_row` mirror pairs gives `2 * pairs_per_row` lobes across a row,
    which is the number to trace from the concept — `measure:strands` reports
    the drawing's own minima-per-row and that is what this must match.

    ⚠️ THE STAGGER IS THE WHOLE POINT. Each band is rotated in θ relative to the
    ones above and below, so a groove between two curls in one band is filled by
    a curl in the next. Remove the stagger and every band's curls line up again
    and the flute comes straight back — the thing this module exists to stop. It
    is a one-line change and it undoes the entire file.

    ⚠️ AND A HALF-SPACING STAGGER IS NOT ENOUGH, which is worth knowing because
    it is the obvious choice and it was the first one tried. Offsetting alternate
    bands by half a spacing makes the minima alternate between exactly TWO sets
    of columns — measured, A/B/A/B down the whole shell. That is no longer a
    flute but it is a regular checkerboard, and a checkerboard is not curls
    either. The offset here advances by the golden-ratio conjugate instead, so
    no two bands in any realistic shell share an alignment and the pattern never
    repeats. The mirror is untouched by this: it is enforced by emitting every
    seed at ±θ₀ in `curl_field`, so ANY offset is mirror-safe, which is exactly
    the freedom that the "row variation goes in the amplitude, never the phase"
    rule was read as forbidding.

    ⚠️ AND THE ANGLES MUST STAY STRICTLY INSIDE (0, π). A seed landing exactly
    on π coincides with its own mirror at −π and would ship a double-amplitude
    curl at the back of the head. The wrap below keeps every angle in
    (0.02, π − 0.02).
    """
    if pairs_per_row < 1 or bands < 1:
        raise ValueError('curl_seeds needs at least one pair and one band')
    spacing = pi / pairs_per_row
    golden = 0.6180339887498949
    seeds: list[tuple[float, float, float]] = []
    for band in range(bands):
        t = band / (bands - 1) if bands > 1 else 0.0
        z = z_top + (z_bottom - z_top) * t
        offset = spacing * ((band * golden) % 1.0)
        for k in range(pairs_per_row):
            theta = (spacing * k + offset) % pi
            seeds.append((min(max(theta, 0.02), pi - 0.02), z, amplitude))
    return seeds
