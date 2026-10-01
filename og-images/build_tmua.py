"""Builds public/og/tmua.png, the link-preview image for the TMUA pages.

Needs pdflatex and pdftoppm (TeX Live), Pillow, and the Georgia and Arial
fonts (Windows paths below). The image states no paper or question counts so
it never goes stale; live counts belong in the page description instead.

    python og-images/build_tmua.py
"""

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public" / "og" / "tmua.png"
FONTS = Path("C:/Windows/Fonts")

W, H = 1200, 630
# Light-theme tokens from src/styles/global.css.
SURFACE, INK, MUTED, ACCENT, RULE = (250, 249, 246), (37, 42, 48), (96, 101, 106), (118, 59, 67), (216, 213, 205)


def render_diagram(tmp: Path) -> Image.Image:
    shutil.copy(HERE / "tmua-diagram.tex", tmp)
    subprocess.run(["pdflatex", "-interaction=nonstopmode", "tmua-diagram.tex"], cwd=tmp, check=True, capture_output=True)
    subprocess.run(["pdftoppm", "-r", "300", "-png", "-singlefile", "tmua-diagram.pdf", "tmua-diagram"], cwd=tmp, check=True)
    return Image.open(tmp / "tmua-diagram.png").convert("RGB")


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def main() -> None:
    img = Image.new("RGB", (W, H), SURFACE)
    d = ImageDraw.Draw(img)

    with tempfile.TemporaryDirectory() as tmp:
        dia = render_diagram(Path(tmp))
    scale = min(530 / dia.width, 480 / dia.height)
    dia = dia.resize((round(dia.width * scale), round(dia.height * scale)), Image.LANCZOS)
    img.paste(dia, (W - 60 - dia.width, (H - dia.height) // 2 - 6))

    x = 72
    # Burgundy rule, echoing the worked-solution boxes in the PDFs.
    d.rectangle([x, 150, x + 5, 420], fill=ACCENT)
    tx = x + 34
    d.text((tx, 150), "Free TMUA", font=font("georgia.ttf", 66), fill=INK)
    d.text((tx, 228), "practice papers", font=font("georgia.ttf", 66), fill=INK)
    d.text((tx, 342), "With answer keys and", font=font("arial.ttf", 30), fill=MUTED)
    d.text((tx, 384), "worked solutions", font=font("arial.ttf", 30), fill=MUTED)

    d.line([x, 520, x + 420, 520], fill=RULE, width=2)
    d.text((x, 538), "resources.danieljsmith.org/tmua", font=font("arialbd.ttf", 24), fill=ACCENT)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    print(f"Wrote {OUT.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
