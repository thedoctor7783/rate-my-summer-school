"""Extract lossless lettering and character artwork from the founder's SVG.

The Canva export outlines its fonts. Keeping the original path groups retains
the exact English letter shapes without embedding unavailable font software.
"""

from copy import deepcopy
from pathlib import Path
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1] / "assets" / "images"
SOURCE = ROOT / "homepage-design.svg"
SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)

source = ET.parse(SOURCE).getroot()
children = list(source)
defs = children[1]
groups = [child for child in children if child.tag == f"{{{SVG_NS}}}g"]


def export(name: str, view_box: str, elements: list[ET.Element]) -> None:
    _, _, width, height = map(float, view_box.split())
    artwork = ET.Element(f"{{{SVG_NS}}}svg", {
        "width": str(width),
        "height": str(height),
        "viewBox": view_box,
        "preserveAspectRatio": "xMidYMid meet",
    })
    artwork.append(deepcopy(defs))
    artwork.extend(deepcopy(element) for element in elements)
    ET.ElementTree(artwork).write(ROOT / name, encoding="utf-8", xml_declaration=True)


export("home-person-1.svg", "465 480 150 230", children[5:19])
export("home-person-2.svg", "220 716 155 280", children[19:29])
export("home-person-3.svg", "435 1008 153 255", children[29:45])

export("home-lettering-1.svg", "42 539 372 119", groups[13:109])
export("home-lettering-2.svg", "370 794 408 114", groups[109:218])
export("home-lettering-3.svg", "16 1075 420 119", groups[218:314])
export("home-lettering-4.svg", "356 1288 440 116", groups[314:429])
