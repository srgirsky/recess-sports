"""A character's authored swatches, as one object every builder can be handed.

★ THE SWATCHES ARE THE PALETTE OF RECORD, and `palette.lint.test.js` holds the
shipped GLB to them both ways — every vertex colour must be a declared swatch,
and every declared swatch must survive export. So this is not a convenience
grouping: it is the list the gate checks against, and a builder that invents a
colour instead of taking one from here fails that gate for the character, not
for itself.

Twelve names, because twelve is what a kid in a baseball kit needs. They are
authored in sRGB (`rgba("E07C28")`) and decoded to scene-linear on the way into
Blender's FLOAT_COLOR and glTF's COLOR_0 — see `sculptlib.color.srgb_to_linear`,
and the finding in its docstring about shipping everything one stop too bright.

★ AND A SWATCH IS MEASURED OFF THE TURNAROUND, NOT REMEMBERED. Junebug's were
sampled from the concept art pixel by pixel; the round-4 finding recorded in her
sculpt script is that the board's AgX view transform then eats about a third of
the skin's chroma, so a swatch that looks right in Blender can still read grey
at field scale. Author against the concept and check on the board.
"""

from __future__ import annotations

from dataclasses import dataclass

RGBA = tuple[float, float, float, float]


@dataclass(frozen=True)
class Palette:
    """Every colour one character is allowed to use."""

    skin: RGBA
    skin_shadow: RGBA
    hair: RGBA
    shirt: RGBA
    shirt_dark: RGBA
    pants: RGBA
    pants_dark: RGBA
    shoe: RGBA
    sock: RGBA
    white: RGBA
    sole: RGBA
    # The ONE surface the drafting team's colour is allowed to tint. Everything
    # else is identity and must survive both team palettes unchanged — the
    # material carrying this is marked `recessTeamAccent`, and
    # `authored-character.test.js` requires a character claiming to be finished
    # to declare exactly that.
    team_mask: RGBA

    def swatches(self) -> tuple[RGBA, ...]:
        """Every declared colour, for a builder that needs to check its own work."""
        return tuple(getattr(self, f.name) for f in self.__dataclass_fields__.values())
