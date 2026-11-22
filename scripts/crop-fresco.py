"""Cut each Fre&co menu item's photo out of the menu pages in ../FRESCO.

Crop boxes come from FRESCO/crop_photos.py. Writes 640px WebP photos plus the logo to
public/seed/fresco/, which scripts/seed-fresco.mjs uploads to Supabase Storage.

    python3 scripts/crop-fresco.py      (needs Pillow)
"""
import re
from pathlib import Path

from PIL import Image

SRC = Path(__file__).resolve().parents[2] / "FRESCO"
OUT = Path(__file__).resolve().parents[1] / "public" / "seed" / "fresco"
OUT.mkdir(parents=True, exist_ok=True)


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def page(file, rotate=0, shown_w=1623):
    im = Image.open(SRC / file).convert("RGB")
    if rotate:
        im = im.rotate(rotate, expand=True)
    return im, im.width / shown_w


def cups(centers, top, bottom, half):
    return [(c - half, top, c + half, bottom) for c in centers]


# (page file, rotation, displayed width, [(item name, box)])
PAGES = [
    ("fresco specials.jpg", 0, 1623, list(zip(
        ["Brunch Tapa", "Crispy Kare-Kare", "Hungarian Sausage", "Pork Liempo", "Katsu Curry", "Fried Chicken"],
        [(56, 600, 796, 1003), (827, 600, 1566, 1003), (56, 1190, 796, 1568), (827, 1160, 1566, 1568),
         (56, 1740, 796, 2133), (827, 1740, 1566, 2133)]))),
    ("fresco specials2.jpg", 0, 1623, [
        ("Kimchi Rice", (430, 280, 1623, 1210)),
        ("Burger Steak (1 pc)", (0, 1210, 1130, 2240)),
        ("Burger Steak (2 pcs)", (0, 1210, 1130, 2240))]),
    ("rice bowls.jpg", 0, 1623, list(zip(
        ["Pork Sisig", "Spam and Egg", "Fresco Pops", "Chicken Ala King", "Fresco Pastil"],
        [(365, y, 675, y + 310) for y in (482, 817, 1152, 1487, 1822)]))),
    ("pastas.jpg", 0, 1623, [
        ("Creamy Carbonara", (0, 380, 820, 950)),
        ("Crispy Palabok", (900, 700, 1623, 1300)),
        ("Creamy Pesto", (0, 1150, 900, 1750)),
        ("Fresco Spaghetti", (760, 1650, 1623, 2240))]),
    ("appetizers.jpg", 0, 1623, [
        ("Loaded Nachos", (115, 725, 530, 1065)),
        ("Cheesy Fries Overload", (642, 725, 1005, 1065)),
        ("Chick n' Fries", (1118, 730, 1512, 1065)),
        ("Clubhouse", (0, 1580, 860, 2150)),
        ("Classic Cheeseburger", (810, 1170, 1623, 1890))]),
    ("appetizers2.jpg", 0, 1623, [
        ("French Fries", (0, 440, 880, 860)),
        ("Fish n' Chips", (690, 800, 1623, 1260)),
        ("Chicken Nuggets", (470, 1560, 1623, 2120)),
        ("Mozza Sticks", (0, 1140, 900, 1630))]),
    ("mix platter.jpg", 0, 1623, [("Mix Platter", (0, 650, 1623, 2250))]),
    ("fresco kasalo.jpg", 90, 2296, [
        ("Whole Chicken", (440, 90, 1210, 820)),
        ("Grilled Liempo", (20, 740, 960, 1195)),
        ("Lumpiang Shanghai", (1265, 465, 1740, 705)),
        ("Sweet & Sour Fish", (1767, 465, 2242, 705)),
        ("Beefy Mushroom", (1265, 850, 1740, 1090)),
        ("Classic Pork Steak", (1767, 850, 2242, 1090)),
        ("Fresco Leche Flan", (1265, 1235, 1740, 1475)),
        ("Caesar Salad", (1767, 1235, 2242, 1475))]),
    ("drinks.jpg", 0, 1623,
        list(zip(["Americano", "Latte", "Mocha", "Spanish Latte", "Vietnamese"], cups([283, 546, 808, 1070, 1330], 490, 815, 130)))
        + list(zip(["Toffee Nut", "White Chocolate", "Creme Brulee", "Salted Caramel", "Vanilla Latte"], cups([288, 552, 808, 1070, 1330], 1012, 1342, 130)))
        + list(zip(["Caramel Macchiato", "Sea Salt Latte", "Biscoffee", "Tiramisu", "Einspanner Latte"], cups([270, 545, 818, 1100, 1365], 1700, 2060, 140)))),
    ("drinks2.jpg", 0, 1623,
        list(zip(["Lychee", "Strawberry Pop", "Blueberry Ade", "Raspberry Tea", "Passion Fruit Tea", "Lemoncello"], cups([190, 430, 678, 920, 1170, 1420], 465, 755, 115)))
        + list(zip(["Ube Cloud", "Strawberry Cloud", "Choco Cloud", "Red Velvet Cloud", "Biscoff Cloud", "Choco Pistachio"], cups([190, 440, 688, 935, 1185, 1428], 1080, 1370, 115)))
        + list(zip(["Matcha Latte", "Strawberry Matcha", "Dirty Matcha"], cups([540, 812, 1095], 1670, 1955, 115)))),
    ("drinks3.jpg", 0, 1623,
        list(zip(["Hershey", "Cookies & Cream", "Caramel Biscoff", "Java Chip"], cups([373, 657, 960, 1250], 540, 890, 125)))
        + list(zip(["Matcha Blended", "Strawberry Blended", "Ube Blended", "Red Velvet Blended"], cups([373, 657, 960, 1240], 1025, 1405, 125)))
        + list(zip(["Mango Graham", "Pistachio", "Coffee Jelly"], cups([522, 800, 1075], 1550, 1935, 125)))),
    ("special drinks.jpg", 0, 864, [
        ("Matcha Banana Pudding", (60, 450, 425, 1035)),
        ("Latte Banana Pudding", (475, 460, 830, 1025)),
        ("Banana Pudding (200 g)", (475, 460, 830, 1025))]),
]


count = 0
for file, rot, shown, items in PAGES:
    im, k = page(file, rot, shown)
    for name, box in items:
        c = im.crop(tuple(round(v * k) for v in box))
        c.thumbnail((640, 640))
        c.save(OUT / f"{slug(name)}.webp", "WEBP", quality=80)
        count += 1

logo = Image.open(SRC / "Fresco Logo.jpeg").convert("RGB")
logo.thumbnail((512, 512))
logo.save(OUT / "logo.webp", "WEBP", quality=90)
print(count, "item photos + logo ->", OUT)
print("brand colour #%02x%02x%02x" % logo.getpixel((20, 20)))
