from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "icons"
CANVAS = 128


def make_master():
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    draw.polygon([(8, 0), (120, 0), (120, 8), (128, 8), (128, 120), (120, 120), (120, 128), (8, 128), (8, 120), (0, 120), (0, 8), (8, 8)], fill="#5D3C2B")
    draw.rectangle((8, 8, 119, 119), fill="#A86E43")
    draw.rectangle((16, 16, 111, 111), fill="#9BCBD0")
    draw.rectangle((24, 16, 31, 23), fill="#DCEFF0")
    draw.rectangle((96, 104, 103, 111), fill="#E4AD45")

    draw.rectangle((24, 20, 87, 107), fill="#5D3C2B")
    draw.rectangle((32, 28, 79, 99), fill="#FFF4D3")
    draw.rectangle((40, 40, 63, 47), fill="#6E5A48")
    draw.rectangle((40, 56, 71, 63), fill="#A86E43")
    draw.rectangle((40, 72, 63, 79), fill="#A86E43")

    draw.polygon([(64, 52), (88, 52), (88, 36), (112, 64), (88, 92), (88, 76), (64, 76)], fill="#5D3C2B")
    draw.polygon([(72, 60), (96, 60), (96, 52), (104, 64), (96, 76), (96, 68), (72, 68)], fill="#6D974D")
    return image


def main():
    ICONS.mkdir(exist_ok=True)
    master = make_master()
    for size in (16, 32, 48, 128):
        icon = master.resize((size, size), Image.Resampling.NEAREST)
        icon.save(ICONS / f"icon-{size}.png", optimize=True)


if __name__ == "__main__":
    main()
