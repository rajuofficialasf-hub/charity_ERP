"""Builds the UbuntuSans subset shipped by packages/ui (DECISION_LOG D-065, DESIGN_SYSTEM 2.5).

Input:  docs/ui/brand/fonts/UbuntuSans.woff2 (Ubuntu Sans 1.006, variable, wdth 75-100, wght 100-800)
Output: packages/ui/fonts/UbuntuSans-derivative-CSSERP.woff2

What it does:
  1. keeps Basic Latin, Latin-1, general punctuation and the minus sign (Bengali is drawn by Bornomala);
  2. limits the weight axis to 400-700 and pins the width axis at 100;
  3. keeps the default OpenType features plus tnum, lnum, pnum and case;
  4. renames the font "Ubuntu Sans derivative CSS ERP", as Ubuntu Font Licence 1.0 clause 2(c) requires
     for a Modified Version. The CSS family alias stays UbuntuSans.

Development tool only, not a project dependency. Run from the repository root:
  python -m venv .fontvenv && .fontvenv/Scripts/pip install fonttools==4.60.1 brotli==1.1.0
  .fontvenv/Scripts/python packages/ui/scripts/subset-ubuntu-sans.py
"""

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SOURCE = "docs/ui/brand/fonts/UbuntuSans.woff2"
TARGET = "packages/ui/fonts/UbuntuSans-derivative-CSSERP.woff2"

FAMILY = "Ubuntu Sans derivative CSS ERP"
PS_PREFIX = "UbuntuSansDerivativeCSSERP"

# Keep in sync with the unicode-range of packages/ui/src/styles/fonts.css.
UNICODES = (
    list(range(0x0020, 0x007F))  # Basic Latin
    + list(range(0x00A0, 0x0100))  # Latin-1 Supplement
    + list(range(0x2000, 0x206F))  # General Punctuation
    + [0x2212]  # minus sign
)

FEATURES = subset.Options().layout_features + ["tnum", "lnum", "pnum", "case"]


def main() -> None:
    font = TTFont(SOURCE, lazy=False)

    options = subset.Options()
    options.layout_features = FEATURES
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.flavor = "woff2"
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    font = instancer.instantiateVariableFont(font, {"wdth": 100, "wght": (400, 700)})

    names = font["name"]
    version = names.getDebugName(5) or "Version 1.006"
    renamed = {
        1: FAMILY,
        3: f"{version.replace('Version ', '')};CSSERP;{PS_PREFIX}-Regular",
        4: f"{FAMILY} Regular",
        6: f"{PS_PREFIX}-Regular",
        16: FAMILY,
        25: PS_PREFIX,
    }
    for record in names.names:
        if record.nameID in renamed:
            record.string = renamed[record.nameID]
    # Typographic family names (16) may be missing in the source; add them for every platform used.
    for name_id in (16,):
        if names.getName(name_id, 3, 1, 0x409) is None:
            names.setName(renamed[name_id], name_id, 3, 1, 0x409)

    font.flavor = "woff2"
    font.save(TARGET)


if __name__ == "__main__":
    main()
