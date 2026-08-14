"""`head_surface`: the skull and the face-atlas island as ONE surface.

★ WHY IT IS ONE SURFACE. The face used to be a separate patch laid over the
skull, and every version of that shows its own boundary — the "sticker" seam
three of Junebug's review rounds went looking for. A single surface whose UVs
enter the atlas island over one angular window has no boundary to show, because
there is no second mesh. `sculptlib.mesh`'s `grid` docstring records the same
lesson one level down, for garment trim.

★ WHAT VARIES PER CHARACTER, AND IT IS EXACTLY FOUR THINGS. The skull's centre
and radii, the jaw's own width curve, the eye socket's recess and the nose's
relief. Everything else — the row/column layout, the atlas island window, the
pole handling, the winding — is the same construction for every child, and
Junebug paid for it: the socket exists because without it the profile is a flat
wall, and the nose is three forms (bridge, rounded tip, nostril shelf) because
one bump reads as a smudge at hero scale.

⚠️ THE FACE COLUMNS MUST MIRROR, and for five rounds one of them did not. The
symptom was not a lopsided nose — it was every reviewer reading the FACE as
asymmetrically sculpted, while the delivered head skin mirrored to within
0.0000 milli-ft everywhere they were not looking. Keep column generation
symmetric about the nose and let the atlas carry any deliberate asymmetry.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from math import cos, pi, sin

from .mesh import MeshBuilder
from .palette import Palette



# ★ THE FACE UV ISLAND'S ANGULAR WINDOW, and it is now the SKULL'S OWN
# PARAMETERISATION rather than a separate patch mesh's. See `head_surface`.
#
# ★ AND IT IS PER CHARACTER, WHICH TANK FOUND. The window decides where a
# feature drawn in the atlas LANDS on the face, so a head with different
# proportions puts the same cell coordinate somewhere else. Junebug's window
# maps his measured brow, eye and mouth latitudes to cell y 15, 46 and 118 —
# the mouth 10 cells from the bottom edge, where its own lower lip runs off the
# cell. Nothing would have gone red: the atlas would simply have been drawn with
# a clipped mouth.
FACE_BEARING = 0.92   # radians off the nose at the island's u edges
FACE_LOW = -1.10      # latitude (rad) at v = 0, below the chin
FACE_SPAN = 1.54      # latitude sweep from v = 0 to v = 1


def face_island_uv(
    bearing: float,
    latitude: float,
    window: tuple[float, float, float] = (FACE_BEARING, FACE_LOW, FACE_SPAN),
) -> tuple[float, float]:
    """The face-atlas UV for a skull vertex, CLAMPED outside the island.

    `toon.ts` tests `island = (uv - (0, 0.5)) / (0.5, 0.5)` per FRAGMENT and
    leaves the albedo alone outside [0,1]^2, and the atlas cell is transparent
    outside the drawn marks (eyes and brows start at cell x 8 of 128). So a
    skull whose UV field is CONTINUOUS and clamped to the island's border can
    carry the atlas directly: every quad that straddles the border sweeps only
    the cell's blank margin, which is the smear the old separate patch existed
    to avoid.

    Contract island: forehead V=1, chin V=.5. Blender's exporter flips authored
    loop V, so author its inverse here. The runtime shader — not this mesh —
    owns the embedded-image origin fix.
    """
    face_bearing, face_low, face_span = window
    uf = min(1.0, max(0.0, 0.5 + 0.5 * bearing / face_bearing))
    vf = min(1.0, max(0.0, (latitude - face_low) / face_span))
    return (0.5 * uf, 0.5 * (1.0 - vf))


@dataclass(frozen=True)
class HeadSpec:
    """The four measurements that make one child's skull, plus its atlas window.

    `half_scale`, `socket` and `nose` are CALLABLES rather than tables because
    each is sampled at arbitrary latitudes the caller does not choose — a table
    would have to publish its own interpolation, and two characters would then
    interpolate differently while claiming the same shape.
    """

    center: tuple[float, float, float]
    radii: tuple[float, float, float]
    # normalised z on the skull -> multiplier on the ellipsoid's lateral radius.
    # This is the concept's own jaw curve: a plain ellipsoid sheds width the
    # moment it passes the eyes, where a child holds full cheek width and only
    # then falls away to a small chin.
    half_scale: Callable[[float], float]
    # (nx, nz) -> inward push, the eye socket's recess.
    socket: Callable[[float, float], float]
    # (nx, nz) -> outward push, the nose's three forms.
    nose: Callable[[float, float], float]
    # (bearing, low, span) of the face-atlas island. Per character: see the
    # window's own note above for what Tank's head did to Junebug's values.
    island: tuple[float, float, float] = (FACE_BEARING, FACE_LOW, FACE_SPAN)


def head_surface(
    builder: MeshBuilder,
    face_columns: int,
    back_columns: int,
    face_rows: list[float],
    crown_rows: int,
    chin_rows: int,
    *,
    spec: HeadSpec,
    palette: Palette,
) -> None:
    face_bearing, _face_low, _face_span = spec.island
    """★ THE SKULL AND THE FACE-ATLAS ISLAND ARE ONE SURFACE.

    Four rounds shipped the face as a SEPARATE patch mesh laid over the
    skull, and four rounds chased the seam it draws. The round-3 verdict
    found it again by gradient map: "a CLOSED contour around the whole face
    — an arc ~10px inside the hairline, near-vertical seams inboard of both
    ears, and a U through the chin", where the same map of the concept
    shows only silhouette, hairline and features. Rubric 3.5's five forbids
    a visible decal-island seam BY NAME.

    Every previous fix moved the lip rather than removing it, because a
    patch that is offset from the skull has a border, and a patch that is
    not offset z-fights. There is no third setting. The seam is structural.

    ★ WHY THE PATCH EXISTED, AND WHY THAT REASON IS GONE. Its docstring
    said face UVs on a closed skull "makes boundary triangles interpolate
    from the atlas island to the body UV and smears an eye around each
    cheek". True of a UV field that JUMPS — the body UV is (0.75, 0.25),
    outside the island, so a quad from a face vertex to a body vertex
    sweeps the whole cell. It is not true of a field that is CONTINUOUS and
    CLAMPED: `toon.ts` tests the island per FRAGMENT and leaves the albedo
    alone outside it, and the atlas cell is transparent outside the marks
    (the generator's own no-paint margin starts at cell x 8 of 128). So a
    quad straddling the island border sweeps only blank cell, which paints
    nothing. `face_island_uv` is that field.

    The face's UV RESOLUTION is preserved exactly rather than approximately:
    `face_columns` spans the island's 2*FACE_BEARING with the patch's own
    |t|**1.25 warp about the nose, and `face_rows` IS the patch's row table.
    At hero that is 20 columns and 14 rows over the same window the patch
    covered with 20 and 14. What the merge costs is `back_columns` and the
    crown/chin rows, and what it refunds is the entire patch — 952
    triangles against the 1070 the two meshes cost apart.

    ⚠️ A LONGITUDE MAPPED TO A BOUNDED INTERVAL HAS ONE SEAM, and it is put
    at the DEAD BACK of the head between a duplicated column pair 0.008rad
    apart. That sliver quad is the only one whose UV sweeps the cell, it is
    sub-pixel at every board scale, and the hair cap covers the back of the
    skull to phi 2.645 — under hair at every latitude it exists at.
    """
    cx, cy, cz = spec.center
    rx, ry, rz = spec.radii

    # --- longitudes, as BEARINGS off the nose in (-pi, pi] ---------------
    # ★ THE FACE COLUMNS MUST MIRROR, AND FOR FIVE ROUNDS ONE OF THEM DID
    # NOT. The old spacing was `2*(c+0.5)/(n+1) - 1`, which for an even `n`
    # produces the set {-20,-18,...,+18}/21 — every column matched except
    # the outermost left one — and then forced the two ENDS to +/-1, which
    # overwrote +0.857 while leaving -0.857 in place. The result was a
    # single unmatched longitude down the left temple: eight LOD0 vertices
    # 35-46 milli-ft off their own mirror image, and a hard planar break
    # running temple-to-jaw that round 6 measured as a 39.9-count left/right
    # cheek shading split against the concept's 15.6.
    #
    # It was invisible to every gate on purpose-built evidence: the
    # SILHOUETTE is symmetric (`measure:fidelity` reports 0.00 face
    # asymmetry, correctly — it measures the width of visible skin, not its
    # shading), so nothing that keys on outline could ever see it.
    #
    # `2*c/(n-1) - 1` spans exactly -1..+1 and mirrors for any n; an ODD n
    # additionally puts a column on t=0, i.e. on the nose ridge, which is
    # where the face wants its resolution anyway. Both are required, so an
    # even count is refused rather than silently un-mirrored.
    if face_columns % 2 == 0:
        raise ValueError(
            f"face_columns must be ODD (got {face_columns}) so a column lands on the nose "
            "ridge and every other column has a mirror partner"
        )
    bearings: list[float] = []
    for column in range(face_columns):
        t = 2.0 * column / (face_columns - 1) - 1.0
        warped = (abs(t) ** 1.25) * (1.0 if t >= 0 else -1.0)
        bearings.append(face_bearing * warped)
    # The back run, and the sliver pair that confines the UV wrap.
    rear = pi - face_bearing
    for step in range(1, back_columns + 1):
        bearings.append(face_bearing + rear * step / (back_columns + 1))
    bearings.append(pi - 0.004)
    bearings.append(-pi + 0.004)
    for step in range(back_columns, 0, -1):
        bearings.append(-face_bearing - rear * step / (back_columns + 1))
    bearings.sort()

    # --- latitudes -------------------------------------------------------
    # phi is colatitude from +z; the island's latitude is pi/2 - phi.
    phis: list[float] = []
    top_phi = pi / 2 - (FACE_LOW + FACE_SPAN)
    for step in range(1, crown_rows + 1):
        phis.append(top_phi * step / (crown_rows + 1))
    for vf in reversed(face_rows):
        phis.append(pi / 2 - (FACE_LOW + vf * FACE_SPAN))
    bottom_phi = pi / 2 - FACE_LOW
    for step in range(1, chin_rows + 1):
        phis.append(bottom_phi + (pi - bottom_phi) * step / (chin_rows + 1))

    def place(bearing: float, phi: float) -> int:
        theta = bearing - pi / 2
        nx = sin(phi) * sin(bearing)
        ny = -sin(phi) * cos(bearing)
        nz = cos(phi)
        frontness = max(0.0, cos(bearing))
        # Junebug's face carries FULL cheek width down to the jaw and only
        # then falls away to a small chin — the concept's measured curve,
        # tabulated in FACE_HALF_WIDTH. The ad-hoc taper this replaced shed
        # width from the eyes down and measured 27% narrow at the cheek,
        # 37% at the jaw.
        width = spec.half_scale(nz)
        # A real face is a PLANE in front, not a continuation of the ball.
        # Softened from 0.86-0.16: that full flattening rendered the profile
        # as the literal vertical wall the round-2 critic flagged;
        # 0.88-0.11 keeps the front plane while letting brow and cheek curve
        # into it. The 1.02 back half meets it where ny is 0, so the surface
        # is continuous across the side meridian even though its slope is
        # not.
        depth = (0.88 - 0.11 * frontness * frontness) if ny < 0 else 1.02
        x = cx + rx * nx * width
        y = cy + ry * ny * depth
        z = cz + rz * nz
        y += spec.socket(nx, nz) * frontness
        y -= spec.nose(nx, nz) * frontness
        if nz < -0.45:
            # The turnaround gives Junebug a small determined chin and a
            # jawline; a bare ellipsoid curves away to nothing under the
            # mouth. The X profile is the measured table's job, so this term
            # only carries the chin's FORWARD projection, faded by frontness
            # so the sides stay smooth.
            chin = min(1.0, (-nz - 0.45) / 0.45)
            y -= 0.090 * (chin**1.8) * frontness
            # 0.012, was 0.030. MEASURED hairline-to-chin on both boards at
            # their own figure heights: the concept runs z 3.539 to 2.750
            # (190.5 per 1000 of figure height) and the round-2 build
            # shipped 186.9 — short, all of it this term lifting the chin's
            # front off the ball.
            z += 0.012 * (chin**1.8) * frontness
        uv = face_island_uv(bearing, pi / 2 - phi, spec.island)
        del theta
        return builder.vertex((x, y, z), palette.skin, "Head", uv)

    columns = len(bearings)
    top = builder.vertex(
        (cx, cy, cz + rz), palette.skin, "Head", face_island_uv(0.0, pi / 2)
    )
    rows = [[place(bearing, phi) for bearing in bearings] for phi in phis]
    bottom = builder.vertex(
        (cx, cy, cz - rz), palette.skin, "Head", face_island_uv(0.0, -pi / 2)
    )
    for column in range(columns):
        builder.face((top, rows[0][column], rows[0][(column + 1) % columns]), 0)
    for upper, lower in zip(rows, rows[1:]):
        for column in range(columns):
            nxt = (column + 1) % columns
            builder.face((upper[column], lower[column], lower[nxt], upper[nxt]), 0)
    last = rows[-1]
    for column in range(columns):
        builder.face((last[column], bottom, last[(column + 1) % columns]), 0)
