"""
Otimização de fontes — Ground Security Systems
------------------------------------------------
Gera uma única WOFF2 variável da Archivo, recortada para o que o site usa:

  * eixos limitados: peso 400–800, largura 100–125 (corpo normal → títulos expandidos)
  * subset de caracteres para português (Latin básico + Latin-1 + pontuação tipográfica)
  * mantém features: kern, liga, tnum, lnum, case

Também exporta instâncias estáticas TTF (usadas só para gerar a imagem Open Graph).

Uso:  python scripts/fonts.py
Requer: fonttools + brotli  (pip install fonttools brotli)
"""
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2"
OUT_DIR = ROOT / "public/fonts"
OG_DIR = ROOT / "scripts/.cache"

UNICODES = (
    list(range(0x20, 0x7F))        # ASCII
    + list(range(0xA0, 0x100))     # Latin-1 (á é í ó ú ã õ ç º ª …)
    + [0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E,
       0x2022, 0x2026, 0x2122, 0x20AC, 0x2192, 0x2190, 0x2191, 0x2193, 0x00D7]
)


def subset(font: TTFont) -> TTFont:
    opts = Options()
    opts.layout_features = ["kern", "liga", "calt", "tnum", "lnum", "case", "ss01"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.hinting = False          # sem hinting: arquivo menor, render moderno não precisa
    opts.desubroutinize = True
    s = Subsetter(options=opts)
    s.populate(unicodes=UNICODES)
    s.subset(font)
    return font


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OG_DIR.mkdir(parents=True, exist_ok=True)

    font = TTFont(SRC)
    font = instancer.instantiateVariableFont(font, {"wght": (400, 800), "wdth": (100, 125)})
    font = subset(font)
    font.flavor = "woff2"
    out = OUT_DIR / "archivo-pt-var.woff2"
    font.save(out)
    print(f"{out.name}: {out.stat().st_size / 1024:.1f} KB  (original {SRC.stat().st_size / 1024:.1f} KB)")

    # Instâncias estáticas para a imagem social (PIL não lê variável/woff2 de forma confiável)
    for name, loc in {"og-bold": {"wght": 800, "wdth": 118}, "og-regular": {"wght": 450, "wdth": 100}}.items():
        f = TTFont(SRC)
        f = instancer.instantiateVariableFont(f, loc)
        f.flavor = None
        p = OG_DIR / f"{name}.ttf"
        f.save(p)
        print(f"{p.name}: {p.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
