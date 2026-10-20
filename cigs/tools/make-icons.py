"""Generate the Cigs app icons (180/192/512 PNG) with Pillow.

Draws the same picture as ../icons/icon.svg: the cartoon cigarette on the
light-blue disk. Rendered at 4x and downsampled for clean edges.

    python tools/make-icons.py        (run from the cigs/ folder, or anywhere)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = Path(__file__).resolve().parent.parent / "icons"
SIZES = (512, 192, 180)
SS = 4                      # supersampling factor
U = 512 * SS / 260          # one SVG unit (the design is 260 units wide)

BG = (207, 227, 245)        # #CFE3F5
DISK = (234, 244, 252)      # #EAF4FC
OUTLINE = (31, 58, 87)      # #1F3A57
WHITE = (255, 255, 255)
TAN = (242, 181, 107)       # #F2B56B
TAN_LINE = (210, 147, 73)   # #B8782E at 55% over tan
ORANGE = (255, 122, 89)     # #FF7A59
EMBER = (255, 211, 107)     # #FFD36B
SMOKE = (159, 184, 207)     # #9FB8CF


def u(*vals):
    return tuple(v * U for v in vals)


def draw_icon():
    size = int(512 * SS)
    img = Image.new("RGBA", (size, size), BG + (255,))

    # soft shadow under the disk
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(u(26, 36, 234, 244), fill=OUTLINE + (36,))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14 * U))
    img.alpha_composite(shadow)

    draw = ImageDraw.Draw(img)
    draw.ellipse(u(26, 26, 234, 234), fill=DISK + (255,))

    # smoke: two "c" curls, drawn upright
    for cx, cy, r in ((184, 54, 6.5), (200, 52, 5.5)):
        box = u(cx - r, cy - r, cx + r, cy + r)
        draw.arc(box, start=60, end=300, fill=SMOKE + (255,), width=int(3.5 * U))
        for ang in (60, 300):
            import math
            ex = cx + r * math.cos(math.radians(ang))
            ey = cy + r * math.sin(math.radians(ang))
            draw.ellipse(u(ex - 1.75, ey - 1.75, ex + 1.75, ey + 1.75), fill=SMOKE + (255,))

    # cigarette: drawn horizontally on its own layer, then rotated 24 degrees
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w = int(4 * U)            # outline width; shapes are grown by 2 units so the
    e = 2                     # outline straddles the edge like an SVG stroke
    r = 16 * U
    d.rounded_rectangle(u(52 - e, 114 - e, 96 + e, 146 + e), radius=r + e * U,
                        fill=TAN + (255,), outline=OUTLINE + (255,), width=w,
                        corners=(True, False, False, True))
    d.rectangle(u(96 - e, 114 - e, 188 + e, 146 + e),
                fill=WHITE + (255,), outline=OUTLINE + (255,), width=w)
    for x in (66, 74, 82):
        d.rounded_rectangle(u(x - 1.25, 121, x + 1.25, 139), radius=1.25 * U, fill=TAN_LINE + (255,))
    d.rounded_rectangle(u(180 - e, 114 - e, 208 + e, 146 + e), radius=r + e * U,
                        fill=ORANGE + (255,), outline=OUTLINE + (255,), width=w,
                        corners=(False, True, True, False))
    d.ellipse(u(196 - 5.5, 130 - 5.5, 196 + 5.5, 130 + 5.5), fill=EMBER + (255,))
    layer = layer.rotate(24, resample=Image.BICUBIC, center=(130 * U, 130 * U))
    img.alpha_composite(layer)
    return img


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    big = draw_icon()
    for s in SIZES:
        out = big.resize((s, s), Image.LANCZOS).convert("RGB")
        path = OUT_DIR / f"icon-{s}.png"
        out.save(path, optimize=True)
        print("wrote", path)


if __name__ == "__main__":
    main()
