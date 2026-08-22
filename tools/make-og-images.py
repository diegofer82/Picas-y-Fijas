# -*- coding: utf-8 -*-
"""Genera la imagen social (Open Graph) de Picas y Fijas en los tres idiomas.

Una tarjeta por idioma, de 1200x630, con la marca del juego: el toro, el
logotipo, el lema y una jugada de ejemplo con su resultado. Los colores salen
del CSS de `public/index.html` y las tipografias son las mismas de reserva que
ese CSS ya declara (Georgia para 'Instrument Serif', Segoe UI para 'Archivo',
Consolas para 'JetBrains Mono'), asi que la tarjeta se parece al juego sin
descargar ninguna fuente.

Uso:  python tools/make-og-images.py
Necesita:  python -m pip install pillow
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

INK = (18, 16, 12)
TEXT = (245, 239, 227)
MUTED = (163, 148, 126)
FAINT = (119, 106, 89)
EDGE = (59, 50, 41)
SLOT = (13, 11, 7)
TILE_TOP = (44, 36, 26)
TILE_BOTTOM = (23, 18, 8)
TILE_EDGE = (74, 62, 48)
FIJA = (79, 201, 124)
PICA = (240, 180, 41)
ACCENT = (91, 141, 239)
PINK = (224, 104, 90)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
FONTS = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "Fonts")

CARDS = {
    "es": {
        "tagline": "DUELO DE DEDUCCIÓN ONLINE",
        "alias": "También conocido como “Bulls and Cows” · inspirado en “Mastermind”",
        "fijas": "2 fijas",
        "picas": "1 pica",
    },
    "en": {
        "tagline": "ONLINE DEDUCTION DUEL",
        "alias": "Also known as “Bulls and Cows” · inspired by “Mastermind”",
        "fijas": "2 F",
        "picas": "1 P",
    },
    "fr": {
        "tagline": "DUEL DE DÉDUCTION EN LIGNE",
        "alias": "Aussi appelé « Bulls and Cows » · inspiré de « Mastermind »",
        "fijas": "2 F",
        "picas": "1 P",
    },
}


def font(name, size):
    path = os.path.join(FONTS, name)
    if not os.path.exists(path):
        sys.exit(f"Falta la tipografia {name} en {FONTS}")
    return ImageFont.truetype(path, size)


def background():
    """El fondo del juego: tinta oscura y los dos halos del `body`."""
    card = Image.new("RGB", (W, H), INK)
    for center, radius, color, strength in (
        ((0.80 * W, -0.10 * H), 620, ACCENT, 0.10),
        ((-0.10 * W, 1.10 * H), 560, PINK, 0.10),
    ):
        small = Image.new("L", (W // 6, H // 6), 0)
        pixels = small.load()
        cx, cy, r = center[0] / 6, center[1] / 6, radius / 6
        for y in range(small.height):
            for x in range(small.width):
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                if d < r:
                    falloff = 1 - d / r
                    pixels[x, y] = int(255 * strength * falloff * falloff)
        glow = small.resize((W, H), Image.LANCZOS)
        card = Image.composite(Image.new("RGB", (W, H), color), card, glow)
    return card


def rounded_tile(size, radius):
    """La baldosa de la marca: degradado vertical y borde de un pixel."""
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gradient = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        gradient.putpixel(
            (0, y),
            tuple(int(TILE_TOP[i] + (TILE_BOTTOM[i] - TILE_TOP[i]) * t) for i in range(3)),
        )
    gradient = gradient.resize((size, size))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius, fill=255)
    tile.paste(gradient, (0, 0), mask)
    ImageDraw.Draw(tile).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius, outline=TILE_EDGE + (255,), width=2
    )
    return tile


def bull(size):
    """Recorta el toro del icono instalable y lo devuelve como silueta crema.

    El icono es una figura clara sobre fondo oscuro, asi que su luminancia ya
    es la mascara: se conserva el suavizado de los bordes sin volver a
    rasterizar los trazos.
    """
    icon = Image.open(os.path.join(PUBLIC, "icon-512.png")).convert("RGB")
    alpha = icon.convert("L").point(lambda v: 0 if v < 40 else min(255, int((v - 40) * 1.35)))
    shape = Image.new("RGBA", icon.size, TEXT + (0,))
    shape.putalpha(alpha)
    return shape.resize((size, size), Image.LANCZOS)


def tracked(draw, xy, text, fnt, fill, tracking):
    """Escribe con separacion entre letras, como el `letter-spacing` del CSS."""
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=fnt, fill=fill)
        x += draw.textlength(char, font=fnt) + tracking
    return x - tracking


def card(lang, copy):
    image = background()
    draw = ImageDraw.Draw(image)

    tile_size, tile_x, tile_y = 320, 82, 155
    image.paste(rounded_tile(tile_size, 90), (tile_x, tile_y), rounded_tile(tile_size, 90))
    mascot = bull(250)
    image.paste(mascot, (tile_x + (tile_size - 250) // 2, tile_y + (tile_size - 250) // 2), mascot)

    x = 462
    draw.text((x, 148), "Picas y Fijas", font=font("georgia.ttf", 92), fill=TEXT)
    tracked(draw, (x + 3, 268), copy["tagline"], font("segoeuib.ttf", 25), MUTED, 3.4)
    # El texto alternativo cambia de largo con el idioma: se encoge hasta caber
    # dentro del margen derecho en vez de salirse del borde.
    alias, margin = font("segoeui.ttf", 23), W - 82
    while alias.size > 16 and x + draw.textlength(copy["alias"], font=alias) > margin:
        alias = font("segoeui.ttf", alias.size - 1)
    draw.text((x, 316), copy["alias"], font=alias, fill=FAINT)

    # Una jugada de ejemplo con su resultado: dice de un vistazo de que va el
    # juego sin necesidad de leer nada.
    digits, slot, gap, top = "4719", 68, 13, 386
    mono = font("consolab.ttf", 34)
    for i, digit in enumerate(digits):
        left = x + i * (slot + gap)
        draw.rounded_rectangle((left, top, left + slot, top + slot), 18, fill=SLOT, outline=EDGE, width=2)
        box = draw.textbbox((0, 0), digit, font=mono)
        draw.text(
            (left + (slot - box[2] + box[0]) / 2 - box[0], top + (slot - box[3] + box[1]) / 2 - box[1]),
            digit,
            font=mono,
            fill=TEXT,
        )

    score_x = x + 4 * (slot + gap) + 18
    score = font("segoeuib.ttf", 27)
    middle = top + slot / 2
    for text, color in ((copy["fijas"], FIJA), (copy["picas"], PICA)):
        draw.ellipse((score_x, middle - 8, score_x + 16, middle + 8), fill=color)
        score_x += 26
        draw.text((score_x, middle - 19), text, font=score, fill=color)
        score_x += draw.textlength(text, font=score) + 26

    domain = font("consola.ttf", 25)
    draw.text(
        (W - 82 - draw.textlength("picasyfijas.fans", font=domain), 528),
        "picasyfijas.fans",
        font=domain,
        fill=FAINT,
    )

    out = os.path.join(PUBLIC, f"og-{lang}.png")
    image.save(out, optimize=True)
    print(f"{out}  {os.path.getsize(out) // 1024} KB")


for lang, copy in CARDS.items():
    card(lang, copy)
