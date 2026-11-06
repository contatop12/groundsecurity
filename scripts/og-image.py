"""
Imagem social (Open Graph / Twitter) — 1200×630, < 300 KB
Composição: fundo navy, domo de faixas (símbolo da marca) com a foto da central de
monitoramento, logo negativo e título na Archivo expandida.

Uso: python scripts/og-image.py   (rode scripts/fonts.py antes — gera as TTF estáticas)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts/.cache"
W, H = 1200, 630
NAVY = (2, 42, 63)
TEAL_L = (95, 197, 186)
WHITE = (255, 255, 255)

PAGES = {
    "og-ground-security": (
        "Segurança eletrônica sob medida para operações que não podem parar",
        "Controle de acesso, CFTV, incêndio e raio-X. São Paulo, desde 1993.",
        "central-de-monitoramento-cftv.jpg",
    ),
}


def dome(photo: Image.Image, size: int) -> Image.Image:
    """Recorta a foto em semicírculo de 5 faixas, como o símbolo da Ground."""
    w, h = size, size // 2
    ph = photo.copy()
    r = max(w / ph.width, h / ph.height)
    ph = ph.resize((int(ph.width * r) + 1, int(ph.height * r) + 1), Image.LANCZOS)
    ph = ph.crop(((ph.width - w) // 2, (ph.height - h) // 2, (ph.width - w) // 2 + w, (ph.height - h) // 2 + h))

    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.pieslice((0, 0, w, h * 2), 180, 360, fill=255)
    bands = Image.new("L", (w, h), 0)
    bd = ImageDraw.Draw(bands)
    pitch = h / 5
    gap = pitch * 0.22
    for i in range(5):
        bd.rectangle((0, i * pitch + gap, w, (i + 1) * pitch), fill=255)
    from PIL import ImageChops
    mask = ImageChops.multiply(mask, bands)

    tint = Image.new("RGB", (w, h), (0, 136, 120))
    ph = Image.blend(ph.convert("RGB"), tint, 0.18)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(ph, (0, 0), mask)
    return out


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for wd in words:
        test = f"{cur} {wd}".strip()
        if draw.textlength(test, font=font) <= max_w:
            cur = test
        else:
            lines.append(cur)
            cur = wd
    lines.append(cur)
    return lines


def build(slug: str, title: str, sub: str, photo_name: str) -> None:
    img = Image.new("RGB", (W, H), NAVY)
    photo = Image.open(ROOT / "assets-src/fotos" / photo_name)
    dm = dome(photo, 620)
    img.paste(dm, (W - 620 + 70, H - 310 - 40), dm)

    logo = Image.open(ROOT / "assets-src/marca/logo-ground-security-negativo.png").convert("RGBA")
    logo = logo.crop(logo.getbbox())
    logo.thumbnail((150, 140), Image.LANCZOS)
    img.paste(logo, (72, 64), logo)

    d = ImageDraw.Draw(img)
    bold = ImageFont.truetype(str(CACHE / "og-bold.ttf"), 46)
    reg = ImageFont.truetype(str(CACHE / "og-regular.ttf"), 25)
    y = 212
    for line in wrap(d, title, bold, 560):
        d.text((72, y), line, font=bold, fill=WHITE)
        y += 56
    y += 16
    for line in wrap(d, sub, reg, 540):
        d.text((72, y), line, font=reg, fill=TEAL_L)
        y += 34
    d.text((72, H - 50), "groundsecurity.com.br", font=ImageFont.truetype(str(CACHE / "og-regular.ttf"), 21), fill=(150, 180, 192))

    out = ROOT / "public/img" / f"{slug}.jpg"
    img.save(out, "JPEG", quality=84, optimize=True, progressive=True)
    print(f"{out.name}: {out.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    for slug, (t, s, p) in PAGES.items():
        build(slug, t, s, p)
