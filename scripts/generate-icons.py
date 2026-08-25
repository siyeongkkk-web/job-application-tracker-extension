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
    draw.rectangle((16, 16, 111, 95), fill="#9BCBD0")
    draw.rectangle((16, 96, 111, 111), fill="#6D974D")
    draw.rectangle((24, 16, 31, 23), fill="#DCEFF0")
    draw.rectangle((96, 24, 103, 31), fill="#DCEFF0")

    draw.rectangle((28, 20, 99, 91), fill="#5D3C2B")
    draw.rectangle((36, 28, 91, 83), fill="#FFF4D3")
    draw.rectangle((60, 52, 67, 75), fill="#355C32")
    draw.rectangle((44, 44, 59, 59), fill="#5F8D45")
    draw.rectangle((36, 36, 51, 51), fill="#79A85C")
    draw.rectangle((68, 40, 83, 55), fill="#5F8D45")
    draw.rectangle((76, 32, 83, 39), fill="#79A85C")
    draw.rectangle((44, 72, 83, 79), fill="#8B5A3C")
    draw.rectangle((52, 80, 75, 83), fill="#38291F")

    draw.rectangle((88, 96, 95, 103), fill="#E4AD45")
    draw.rectangle((96, 104, 103, 111), fill="#E4AD45")
    return image


def main():
    ICONS.mkdir(exist_ok=True)
    master = make_master()
    for size in (16, 32, 48, 128):
        icon = master.resize((size, size), Image.Resampling.NEAREST)
        icon.save(ICONS / f"icon-{size}.png", optimize=True)


if __name__ == "__main__":
    main()
