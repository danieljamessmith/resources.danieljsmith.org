"""Builds public/og/esat.png, the link-preview image for the ESAT pages.

Drawn as build_tmua.py draws TMUA's, with the same layout, fonts and colours;
it needs the same tools. The image states no paper or question counts so it
never goes stale; live counts belong in the page description instead.

    python og-images/build_esat.py
"""

import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

from build_tmua import ACCENT, H, HERE, INK, MUTED, RULE, SURFACE, W, font, render_diagram

OUT = HERE.parent / "public" / "og" / "esat.png"


def main() -> None:
    img = Image.new("RGB", (W, H), SURFACE)
    d = ImageDraw.Draw(img)

    with tempfile.TemporaryDirectory() as tmp:
        dia = render_diagram(Path(tmp), "esat-diagram")
    scale = min(530 / dia.width, 480 / dia.height)
    dia = dia.resize((round(dia.width * scale), round(dia.height * scale)), Image.LANCZOS)
    img.paste(dia, (W - 60 - dia.width, (H - dia.height) // 2 - 6))

    x = 72
    # Burgundy rule, echoing the worked-solution boxes in the PDFs.
    d.rectangle([x, 150, x + 5, 420], fill=ACCENT)
    tx = x + 34
    d.text((tx, 150), "Free ESAT", font=font("georgia.ttf", 66), fill=INK)
    d.text((tx, 228), "practice papers", font=font("georgia.ttf", 66), fill=INK)
    d.text((tx, 342), "For Maths 1, Maths 2 and", font=font("arial.ttf", 30), fill=MUTED)
    d.text((tx, 384), "Physics, with answer keys", font=font("arial.ttf", 30), fill=MUTED)

    d.line([x, 520, x + 420, 520], fill=RULE, width=2)
    d.text((x, 538), "resources.danieljsmith.org/esat", font=font("arialbd.ttf", 24), fill=ACCENT)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    print(f"Wrote {OUT.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
