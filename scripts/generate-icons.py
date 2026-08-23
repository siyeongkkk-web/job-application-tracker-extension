from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "icons"
SCALE = 4


def scaled(value):
    return round(value * SCALE)


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(tuple(scaled(value) for value in box), radius=scaled(radius), fill=fill)


def make_master():
    image = Image.new("RGBA", (scaled(128), scaled(128)), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    rounded(draw, (6, 6, 122, 122), 28, "#1E3A8A")

    rounded(draw, (26, 24, 96, 110), 10, "#FFFFFF")
    draw.polygon(
        [(scaled(78), scaled(24)), (scaled(96), scaled(42)), (scaled(85), scaled(44)), (scaled(78), scaled(37))],
        fill="#DCE8FF",
    )
    rounded(draw, (40, 48, 74, 55), 3.5, "#1E3A8A")
    rounded(draw, (40, 63, 66, 69), 3, "#8CA3CC")

    draw.ellipse((scaled(63), scaled(65), scaled(109), scaled(111)), fill="#18B8A6")
    draw.line(
        [(scaled(75), scaled(88)), (scaled(82), scaled(95)), (scaled(97), scaled(78))],
        fill="#FFFFFF",
        width=scaled(7),
        joint="curve",
    )
    return image


def main():
    ICONS.mkdir(exist_ok=True)
    master = make_master()
    for size in (16, 32, 48, 128):
        icon = master.resize((size, size), Image.Resampling.LANCZOS)
        icon.save(ICONS / f"icon-{size}.png", optimize=True)


if __name__ == "__main__":
    main()
