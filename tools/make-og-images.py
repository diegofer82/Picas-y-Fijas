# -*- coding: utf-8 -*-
"""Genera la imagen social (Open Graph) de Picas y Fijas en los tres idiomas.

Una tarjeta por idioma, de 1200x630, con la marca del juego: la vaca sobre su
baldosa azul, el logotipo, el lema y una jugada de ejemplo con su resultado.
Los colores son los de la identidad Plaza, en el `:root` de `public/index.html`,
y las tipografias son las de reserva de ese CSS en Windows (Segoe UI Black por
'Bricolage Grotesque', Segoe UI por 'Figtree', Consolas por 'JetBrains Mono'),
asi que la tarjeta se parece al juego sin descargar ninguna fuente. La vaca no
se vuelve a dibujar: se toma de `public/icon-512.png`, que ya es la baldosa, asi
que hay que ejecutar antes `npm run icons` si cambia la marca.

Uso:  python tools/make-og-images.py
Necesita:  python -m pip install pillow
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

CREMA = (255, 245, 232)
TINTA = (27, 22, 56)
BRUMA = (98, 91, 122)
LINEA = (233, 223, 208)
AZUL = (47, 91, 255)
AZUL_2 = (31, 63, 184)
AZUL_TEXTO = (31, 63, 184)
VIOLETA = (124, 92, 255)
CORAL = (255, 107, 94)
SOL = (255, 197, 49)
FIJA = (18, 161, 80)
FIJA_TEXTO = (12, 122, 58)
PICA = (224, 115, 26)
PICA_TEXTO = (154, 75, 8)

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
    """Crema, con dos circulos de color a medio salir por la derecha, como el
    heroe de la portada. La esquina de arriba a la izquierda queda crema."""
    card = Image.new("RGB", (W, H), CREMA)
    draw = ImageDraw.Draw(card)
    draw.ellipse((W - 250, -190, W + 190, 250), fill=VIOLETA)
    draw.ellipse((W - 120, H - 150, W + 110, H + 80), fill=CORAL)
    draw.ellipse((W - 330, 70, W - 302, 98), fill=SOL)
    return card


def brand_tile(size, radius):
    """La baldosa de la marca: el icono instalable con esquinas redondas."""
    icon = Image.open(os.path.join(PUBLIC, "icon-512.png")).convert("RGB")
    icon = icon.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius, fill=255)
    return icon, mask


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

    # La baldosa lleva debajo el mismo reborde tactil que los botones.
    tile_size, tile_x, tile_y, radius = 300, 82, 160, 84
    draw.rounded_rectangle((tile_x, tile_y + 10, tile_x + tile_size - 1, tile_y + tile_size + 9), radius, fill=AZUL_2)
    tile, mask = brand_tile(tile_size, radius)
    image.paste(tile, (tile_x, tile_y), mask)

    x = 452
    tracked(draw, (x, 140), "Picas y Fijas", font("seguibl.ttf", 94), TINTA, -2.5)
    tracked(draw, (x + 3, 272), copy["tagline"], font("segoeuib.ttf", 25), BRUMA, 3.4)
    # El texto alternativo cambia de largo con el idioma: se encoge hasta caber
    # antes del circulo violeta en vez de pisarlo.
    alias, margin = font("segoeuisl.ttf", 23), W - 250
    while alias.size > 16 and x + draw.textlength(copy["alias"], font=alias) > margin:
        alias = font("segoeuisl.ttf", alias.size - 1)
    draw.text((x, 318), copy["alias"], font=alias, fill=BRUMA)

    # Una jugada de ejemplo con su resultado: dice de un vistazo de que va el
    # juego sin necesidad de leer nada. Fichas blancas con borde y reborde de
    # tinta; la fija es un disco lleno y la pica un anillo, como en el juego.
    digits, slot_w, slot_h, gap, top = "4719", 64, 74, 12, 384
    mono = font("consolab.ttf", 36)
    for i, digit in enumerate(digits):
        left = x + i * (slot_w + gap)
        draw.rounded_rectangle((left, top + 5, left + slot_w, top + slot_h + 5), 18, fill=TINTA)
        draw.rounded_rectangle((left, top, left + slot_w, top + slot_h), 18, fill=(255, 255, 255), outline=TINTA, width=3)
        box = draw.textbbox((0, 0), digit, font=mono)
        draw.text(
            (left + (slot_w - box[2] + box[0]) / 2 - box[0], top + (slot_h - box[3] + box[1]) / 2 - box[1]),
            digit,
            font=mono,
            fill=TINTA,
        )

    score_x = x + 4 * (slot_w + gap) + 16
    score = font("segoeuib.ttf", 27)
    middle = top + slot_h / 2
    draw.ellipse((score_x, middle - 10, score_x + 20, middle + 10), fill=FIJA)
    score_x += 30
    draw.text((score_x, middle - 19), copy["fijas"], font=score, fill=FIJA_TEXTO)
    score_x += draw.textlength(copy["fijas"], font=score) + 26
    draw.ellipse((score_x, middle - 10, score_x + 20, middle + 10), outline=PICA, width=5)
    score_x += 30
    draw.text((score_x, middle - 19), copy["picas"], font=score, fill=PICA_TEXTO)

    domain = font("consolab.ttf", 25)
    draw.text((x, 528), "picasyfijas.fans", font=domain, fill=AZUL_TEXTO)

    out = os.path.join(PUBLIC, f"og-{lang}.png")
    image.save(out, optimize=True)
    print(f"{out}  {os.path.getsize(out) // 1024} KB")


for lang, copy in CARDS.items():
    card(lang, copy)
