# -*- coding: utf-8 -*-
"""La guia de estrategias, en los tres idiomas y con la identidad Plaza.

Hasta la 5.4.0 eran dos scripts —uno en espanol y otro con el ingles y el
frances apretados en un diccionario— que habia que tocar por separado, y por
eso se fueron separando del juego: recomendaban aperturas que el propio
analisis de la partida puntuaba «Correcto», no contaban los puntos ni las
temporadas y dibujaban las pistas con letras. Ahora hay una sola maqueta:

- `textos.json` lleva lo que se lee, con las mismas claves en es, en y fr;
- `datos.json` lleva las cifras, medidas por `make-datos.mjs` con el motor del
  juego (`public/deduce.js`) y con la cuenta de puntos (`src/score.js`);
- este archivo lo dibuja: fichas, pistas por su forma (disco la fija, anillo la
  pica), capitulos con su color y la vaca en la portada.

Son para descargar e imprimir: papel claro, tinta oscura y Helvetica, que
reportlab trae sin incrustar nada. Verde y naranja solo aparecen en las pistas.

Uso:  python tools/pdf/build.py     (genera y publica en public/)
Necesita reportlab:  python -m pip install reportlab
"""
import hashlib
import io
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import CondPageBreak, Flowable, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "output" / "pdf"
ICON = ROOT / "public" / "icon-512.png"
FILES = {
    "es": "guia-estrategias-picas-y-fijas.pdf",
    "en": "picas-y-fijas-strategy-guide-en.pdf",
    "fr": "guide-strategies-picas-y-fijas-fr.pdf",
}
# Lo que entra en la huella: si cambia cualquiera de estos y no se regenera,
# test/strategy-guide.test.js lo dice. Los de texto se leen con LF.
SOURCES = ["tools/pdf/guia.py", "tools/pdf/textos.json", "tools/pdf/datos.json", "public/icon-512.png"]

# La paleta Plaza, la del `:root` de public/index.html. Los tonos «-2» son el
# reborde de cada color y aqui hacen de filete: un punto de azul claro no se
# lee impreso.
TINTA = colors.HexColor("#1B1638")
BRUMA = colors.HexColor("#625B7A")
PAPEL = colors.white
PAPEL_2 = colors.HexColor("#FFF9F1")
CREMA = colors.HexColor("#FFF5E8")
HUECO = colors.HexColor("#F7F0E4")
LINEA = colors.HexColor("#E9DFD0")
LINEA_3 = colors.HexColor("#C9BEAE")
FIJA = colors.HexColor("#12A150")
PICA = colors.HexColor("#E0731A")
TONES = {
    "azul": (colors.HexColor("#2F5BFF"), colors.HexColor("#1F3FB8"), colors.HexColor("#EEF2FF"), colors.white),
    "coral": (colors.HexColor("#FF6B5E"), colors.HexColor("#D94F45"), colors.HexColor("#FFF1EF"), TINTA),
    "violeta": (colors.HexColor("#7C5CFF"), colors.HexColor("#5A3FD1"), colors.HexColor("#F1EDFF"), colors.white),
    "sol": (colors.HexColor("#FFC531"), colors.HexColor("#D9A317"), colors.HexColor("#FFF6DA"), TINTA),
}
CHAPTER_TONES = ["azul", "coral", "violeta", "sol", "azul", "coral", "violeta", "sol", "azul", "coral"]
WIDTH = 174 * mm
SHEET_ROWS = 16

S = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=30, leading=33, textColor=TINTA),
    "sub": ParagraphStyle("sub", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=TINTA),
    "edition": ParagraphStyle("edition", fontName="Helvetica", fontSize=8.5, leading=12, textColor=BRUMA),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=TINTA, spaceBefore=9, spaceAfter=5),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=14, textColor=TINTA, spaceAfter=6),
    "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=9.5, leading=14, textColor=TINTA, leftIndent=11, bulletIndent=1, spaceAfter=3),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, leading=11.5, textColor=TINTA),
    "head": ParagraphStyle("head", fontName="Helvetica-Bold", fontSize=8.5, leading=11.5, textColor=colors.white),
    "callout": ParagraphStyle("callout", fontName="Helvetica", fontSize=9.5, leading=14, textColor=TINTA),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=11, textColor=BRUMA, spaceAfter=4),
    "legend": ParagraphStyle("legend", fontName="Helvetica", fontSize=8.5, leading=11.5, textColor=TINTA, alignment=TA_CENTER),
    "figure": ParagraphStyle("figure", fontName="Helvetica-Bold", fontSize=19, leading=22, alignment=TA_CENTER),
    "figlabel": ParagraphStyle("figlabel", fontName="Helvetica-Bold", fontSize=8.5, leading=11, alignment=TA_CENTER),
}


def read(name):
    return io.open(ROOT / name, encoding="utf-8").read()


def fingerprint():
    """La huella de las fuentes: viaja en /Keywords de cada PDF."""
    digest = hashlib.sha256()
    for name in SOURCES:
        data = (ROOT / name).read_bytes()
        if not name.endswith(".png"):
            data = data.replace(b"\r\n", b"\n")
        digest.update(data)
    return digest.hexdigest()[:16]


TEXTS = json.loads(read("tools/pdf/textos.json"))
DATA = json.loads(read("tools/pdf/datos.json"))


# -------------------- numeros, en la lengua de quien lee --------------------
def num(value, lang, places=0):
    text = "{:,.{}f}".format(value, places)
    return text if lang == "en" else text.replace(",", "\u00a0").replace(".", ",")


def pct(value, lang, places=1):
    return num(value, lang, places) + ("%" if lang == "en" else "\u00a0%")


def fill(text, values):
    for key, value in values.items():
        text = text.replace("{" + key + "}", str(value))
    if "{" in text:
        raise SystemExit("queda una llave sin rellenar: " + text[:90])
    return text


# -------------------- piezas dibujadas --------------------
class Tiles(Flowable):
    """Un codigo en fichas, como en el juego; `pips` le pone al lado la pista."""

    def __init__(self, code, kind="plain", pips=None, size=6.2 * mm):
        super().__init__()
        self.code, self.kind, self.pips, self.size = str(code), kind, pips, size
        self.gap = size * 0.2
        self.radius = size * 0.27
        self.code_width = len(self.code) * size + (len(self.code) - 1) * self.gap
        self.width = self.code_width + (0 if pips is None else size * 0.7 + len(self.code) * self.radius * 2.6)
        self.height = size * 1.14 + 1.4

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        c, w, h = self.canv, self.size, self.size * 1.14
        for i, char in enumerate(self.code):
            x = i * (w + self.gap)
            if self.kind == "ghost":
                c.setStrokeColor(LINEA_3)
                c.setLineWidth(0.9)
                c.setDash(2.2, 2)
                c.roundRect(x, 1.4, w, h, w * 0.26, stroke=1, fill=0)
                c.setDash()
                continue
            c.setFillColor(TINTA)
            c.roundRect(x, 0, w, h, w * 0.26, stroke=0, fill=1)
            c.setFillColor(TONES["sol"][0] if self.kind == "secret" else PAPEL)
            c.setStrokeColor(TINTA)
            c.setLineWidth(0.9)
            c.roundRect(x, 1.4, w, h, w * 0.26, stroke=1, fill=1)
            c.setFillColor(TINTA)
            c.setFont("Courier-Bold", w * 0.72)
            c.drawCentredString(x + w / 2, 1.4 + h / 2 - w * 0.235, char)
        if self.pips is not None:
            draw_pips(c, self.code_width + w * 0.7, 1.4 + h / 2, self.pips[0], self.pips[1], len(self.code), self.radius)


def draw_pips(c, x, y, fijas, picas, total, radius):
    """Disco lleno la fija, anillo la pica, punteado lo que no dio nada."""
    for i in range(total):
        cx = x + radius + i * radius * 2.6
        if i < fijas:
            c.setFillColor(FIJA)
            c.circle(cx, y, radius, stroke=0, fill=1)
        elif i < fijas + picas:
            ring = c.beginPath()
            ring.circle(cx, y, radius)
            ring.circle(cx, y, radius * 0.5)
            c.setFillColor(PICA)
            c.drawPath(ring, stroke=0, fill=1, fillMode=0)
        else:
            c.setStrokeColor(LINEA_3)
            c.setLineWidth(0.7)
            c.setDash(1.4, 1.3)
            c.circle(cx, y, radius * 0.86, stroke=1, fill=0)
            c.setDash()


class Pips(Flowable):
    def __init__(self, fijas, picas, total, radius=1.9 * mm):
        super().__init__()
        self.fijas, self.picas, self.total, self.radius = fijas, picas, total, radius
        self.width = total * radius * 2.6 - radius * 0.6
        self.height = radius * 2 + 2

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        draw_pips(self.canv, 0, self.height / 2, self.fijas, self.picas, self.total, self.radius)


class NumTile(Flowable):
    """El numero de un capitulo o de un paso, en su ficha de color."""

    def __init__(self, label, tone, size=7 * mm):
        super().__init__()
        self.label, self.tone, self.size = str(label), tone, size
        self.width, self.height = size, size + 1.6

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        c, s = self.canv, self.size
        fill_color, edge, _, ink = TONES[self.tone]
        c.setFillColor(edge)
        c.roundRect(0, 0, s, s, s * 0.28, stroke=0, fill=1)
        c.setFillColor(fill_color)
        c.roundRect(0, 1.6, s, s, s * 0.28, stroke=0, fill=1)
        c.setFillColor(ink)
        c.setFont("Helvetica-Bold", s * 0.52)
        c.drawCentredString(s / 2, 1.6 + s / 2 - s * 0.18, self.label)


class ChapterHead(Flowable):
    keepWithNext = 1

    def __init__(self, number, title, tone):
        super().__init__()
        self.tile = NumTile(number, tone, 9.5 * mm)
        self.title = title
        self.width, self.height = WIDTH, 15 * mm

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        c = self.canv
        self.tile.canv = c
        c.saveState()
        c.translate(0, 2.2 * mm)
        self.tile.draw()
        c.restoreState()
        c.setFillColor(TINTA)
        c.setFont("Helvetica-Bold", 18)
        c.drawString(13.5 * mm, 5.1 * mm, self.title)


class Brand(Flowable):
    """La baldosa azul con la vaca: el icono de la app, con su reborde."""

    def __init__(self, size=27 * mm):
        super().__init__()
        self.size = size
        self.width, self.height = size, size + 4

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        c, s = self.canv, self.size
        radius = s * 0.3
        c.setFillColor(TONES["azul"][1])
        c.roundRect(0, 0, s, s, radius, stroke=0, fill=1)
        c.saveState()
        clip = c.beginPath()
        clip.roundRect(0, 4, s, s, radius)
        c.clipPath(clip, stroke=0, fill=0)
        c.drawImage(ImageReader(str(ICON)), 0, 4, s, s)
        c.restoreState()


class Bars(Flowable):
    """La economia: los puntos que quedan segun el intento en que se descifra."""

    def __init__(self, values, label, width=78 * mm, height=40 * mm):
        super().__init__()
        self.values, self.label, self.width, self.height = values, label, width, height

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        c, n = self.canv, len(self.values)
        gap = 2 * mm
        bar = (self.width - gap * (n - 1)) / n
        base, top = 9.5 * mm, self.height - 5 * mm
        scale = (top - base - 1) / max(self.values)
        for i, value in enumerate(self.values):
            x = i * (bar + gap)
            height = max(1.4, value * scale)
            c.setFillColor(TONES["coral"][0])
            c.roundRect(x, base, bar, height, 2.2, stroke=0, fill=1)
            c.setFillColor(TINTA)
            c.setFont("Courier-Bold", 9)
            c.drawCentredString(x + bar / 2, base + height + 2.2, str(value))
            c.setFillColor(BRUMA)
            c.drawCentredString(x + bar / 2, base - 9, str(i + 1) + ("+" if i == n - 1 else ""))
        c.setFont("Helvetica", 7.5)
        c.drawCentredString(self.width / 2, 0.8, self.label)


def p(text, style="body"):
    return Paragraph(text, S[style])


def bullets(items):
    return [Paragraph(item, S["bullet"], bulletText="•") for item in items]


def cell(value, header=False):
    return Paragraph(str(value), S["head" if header else "cell"]) if isinstance(value, (str, int, float)) else value


def grid(rows, widths, header=True, valign="MIDDLE"):
    data = [[cell(value, header and r == 0) for value in row] for r, row in enumerate(rows)]
    table = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    style = [
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, LINEA),
        ("BOX", (0, 0), (-1, -1), 0.7, LINEA),
        ("VALIGN", (0, 0), (-1, -1), valign),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [PAPEL, PAPEL_2]),
        ("ROUNDEDCORNERS", [5, 5, 5, 5]),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), TINTA)]
    table.setStyle(TableStyle(style))
    return table


def callout(text, tone):
    _, edge, soft, _ = TONES[tone]
    table = Table([[p(text, "callout")]], colWidths=[WIDTH])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), soft),
        ("LINEBEFORE", (0, 0), (0, -1), 3.2, edge),
        ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return KeepTogether([Spacer(1, 2.5 * mm), table, Spacer(1, 2.5 * mm)])


def blocks(parts, joiner=""):
    """Tres baldosas con una cifra y su rotulo; `joiner` va entre ellas (el + de la suma)."""
    gap = 12 * mm if joiner else 5 * mm
    width = (WIDTH - 2 * gap) / 3

    def block(figure, label, tone):
        fill_color, _, _, ink = TONES[tone]
        hexa = "#%02X%02X%02X" % tuple(int(round(v * 255)) for v in (ink.red, ink.green, ink.blue))
        inner = Table([[Paragraph('<font color="%s">%s</font>' % (hexa, figure), S["figure"])],
                       [Paragraph('<font color="%s">%s</font>' % (hexa, label), S["figlabel"])]], colWidths=[width])
        inner.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), fill_color), ("ROUNDEDCORNERS", [7, 7, 7, 7]),
            ("TOPPADDING", (0, 0), (-1, 0), 8), ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
            ("TOPPADDING", (0, 1), (-1, 1), 0), ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
            ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        return inner
    between = Paragraph('<font size="15" color="#625B7A"><b>%s</b></font>' % joiner, S["legend"])
    row = [block(*parts[0]), between, block(*parts[1]), between, block(*parts[2])]
    table = Table([row], colWidths=[width, gap, width, gap, width], hAlign="LEFT")
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return table


def plain(table_rows, widths, valign="MIDDLE"):
    """Una rejilla sin bordes ni fondo, para poner cosas una al lado de otra."""
    table = Table(table_rows, colWidths=widths, hAlign="LEFT")
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), valign), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 2),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    return table


# -------------------- lo que dicen los datos --------------------
def opening(mode, symbols, digits, repeats):
    for row in DATA["openings"]:
        if (row["mode"], row["symbols"], row["digits"], row["repeats"]) == (mode, symbols, digits, repeats):
            return row
    raise SystemExit("datos.json no trae esa apertura")


def shape(row, name):
    for item in row["shapes"]:
        if item["shape"] == name:
            return item
    return None


def response(table, fijas, picas):
    for row in table["rows"]:
        if (row["f"], row["p"]) == (fijas, picas):
            return row
    raise SystemExit("datos.json no trae esa respuesta")


def values_for(lang):
    """Todo lo que los textos citan con una llave, ya escrito en su lengua."""
    tries, tries3, score, limits = DATA["tries"], DATA["tries3"], DATA["scoring"], DATA["limits"]
    n4 = opening("numbers", 10, 4, True)
    six = opening("colors", 6, 4, True)
    second = DATA["second"]
    none, one, two = response(second, 0, 0), response(second, 0, 1), response(second, 0, 2)
    return {
        "avg": num(tries["avg"], lang, 2), "max": tries["max"], "upTo4": pct(tries["upTo4"], lang),
        "upTo5": pct(tries["upTo5"], lang, 0), "upTo6": pct(tries["upTo6"], lang),
        "share6": pct(100.0 * tries["dist"]["6"] / tries["size"], lang, 0),
        "share7": pct(100.0 * tries["dist"]["7"] / tries["size"], lang),
        "avg3": num(tries3["avg"], lang, 2), "max3": tries3["max"], "upTo4of3": pct(tries3["upTo4"], lang, 0),
        "daily": limits["dailyAttempts"], "dailyDigits": limits["dailyDigits"],
        "arenaMin": limits["arenaMin"], "arenaMax": limits["arenaMax"], "pause": limits["pauseMinutes"],
        "puzzles": limits["puzzles"],
        "win": score["win"], "draw": score["draw"], "loss": score["loss"], "forfeit": score["forfeit"],
        "maxDifficulty": score["maxDifficulty"], "maxEconomy": score["economy"][0],
        "limitBonus": score["limitBonus"], "clockBonus": score["clockBonus"],
        "pairExtra": pct(100.0 * (shape(n4, "AABB")["left"] / shape(n4, "ABCD")["left"] - 1), lang, 0),
        "sameSymbol": pct(shape(n4, "AAAA")["pct"], lang, 0),
        "none": num(none["count"], lang), "one": num(one["count"], lang), "noneShare": pct(none["pct"], lang, 0),
        "ratio": int(round(one["count"] / float(none["count"]))),
        "twoNew": num(two["allNew"], lang), "twoBest": num(two["left"], lang),
        "sixDistinct": num(shape(six, "ABCD")["left"], lang), "sixPair": num(shape(six, "AABC")["left"], lang),
        "sixPairs": num(shape(six, "AABB")["left"], lang), "sixCodes": num(six["size"], lang),
        "sixWorstPairs": shape(six, "AABB")["worst"], "sixWorstPair": shape(six, "AABC")["worst"],
        "exampleLeft1": DATA["example"]["line"][0]["left"], "exampleLeft2": DATA["example"]["line"][1]["left"],
        "exampleLeft3": DATA["example"]["line"][2]["left"], "exampleLeft4": DATA["example"]["line"][3]["left"],
    }


def made_of(row, lang, t):
    """«2 cambiadas de sitio + 2 nuevas»: como esta hecha una segunda jugada."""
    parts = []
    for count, key in ((row["same"], "kept"), (row["moved"], "moved"), (row["fresh"], "fresh")):
        if count:
            parts.append(t(key + ("_one" if count == 1 else "_many")).replace("#", str(count)))
    return " + ".join(parts)


# -------------------- la guia --------------------
def story_for(lang):
    values = values_for(lang)
    texts = TEXTS[lang]

    def t(key):
        return fill(texts[key], values)

    def chapter(number):
        return ChapterHead(number, t("c%d" % number), CHAPTER_TONES[number - 1])

    def rules_label(row):
        kind = t("lbl_colors").replace("#", str(row["symbols"])) if row["mode"] == "colors" else t("lbl_numbers")
        return "%s · %s · %s" % (kind, t("lbl_positions").replace("#", str(row["digits"])),
                                           t("lbl_repeats" if row["repeats"] else "lbl_norepeats"))

    def letters(name, row):
        """ABCD en colores; 0123 en numeros, que es como se escribe."""
        if row["mode"] == "colors":
            return name
        return "".join(str("ABCDEF".index(ch)) for ch in name)

    story = []

    # ---- portada ----
    title = [p("Picas y Fijas", "title"), Spacer(1, 2 * mm), p(t("subtitle"), "sub"), p(t("edition"), "edition")]
    story += [Spacer(1, 6 * mm), plain([[Brand(), title]], [36 * mm, 138 * mm]), Spacer(1, 15 * mm)]
    hero = plain([[Tiles("????", "secret", size=9 * mm)], [Tiles("0123", pips=(1, 1), size=9 * mm)]], [80 * mm])
    legend = grid([
        [Pips(1, 0, 1, 2.6 * mm), p(t("legend_fija"), "cell")],
        [Pips(0, 1, 1, 2.6 * mm), p(t("legend_pica"), "cell")],
        [Pips(0, 0, 1, 2.6 * mm), p(t("legend_none"), "cell")],
    ], [12 * mm, 78 * mm], header=False)
    story += [plain([[hero, legend]], [84 * mm, 90 * mm]), Spacer(1, 3 * mm)]
    story += [callout(t("idea"), "azul"), p(t("intro"))]
    contents = []
    for left in range(1, 6):
        row = []
        for number in (left, left + 5):
            row += [NumTile(number, CHAPTER_TONES[number - 1], 6 * mm), p("<b>%s</b>" % t("c%d" % number), "cell")]
        contents.append(row)
    story += [p(t("contents"), "h2"), plain(contents, [9 * mm, 78 * mm, 9 * mm, 78 * mm])]
    story += [Spacer(1, 4 * mm), p(t("cover_stats_h"), "h2"), blocks([
        (values["avg"], t("cover_s1"), "azul"), (values["upTo5"], t("cover_s2"), "violeta"), (values["max"], t("cover_s3"), "coral"),
    ]), Spacer(1, 2 * mm), p(t("cover_stats_p"), "small"), PageBreak()]

    def next_chapter():
        """Sigue en la misma hoja si queda sitio para empezar; si no, hoja nueva."""
        return [Spacer(1, 8 * mm), CondPageBreak(105 * mm)]

    # ---- 1. el metodo ----
    story += [chapter(1), p(t("method_lead"))]
    story += [grid([[NumTile(i, "azul", 6 * mm), p(t("step%d" % i), "cell")] for i in range(1, 6)], [11 * mm, 163 * mm], header=False)]
    story += [p(t("read_h"), "h2"), grid([
        [t("read_c1"), t("read_c2"), t("read_c3")],
        [Pips(0, 0, 4), t("read_a1"), t("read_b1")],
        [Pips(0, 2, 4), t("read_a2"), t("read_b2")],
        [Pips(2, 0, 4), t("read_a3"), t("read_b3")],
        [Pips(1, 1, 4), t("read_a4"), t("read_b4")],
        [Pips(1, 3, 4), t("read_a5"), t("read_b5")],
    ], [26 * mm, 64 * mm, 84 * mm])]
    story += [callout(t("method_call"), "azul")] + next_chapter()

    # ---- 2. la apertura, medida ----
    story += [chapter(2), p(t("open_lead"))]
    story += [p(t("open_plain_h"), "h2"), p(t("open_plain_p"))]
    rows = [[t("open_col_rules"), t("open_col_codes"), t("open_col_open"), t("open_col_left")]]
    for digits in (3, 4, 5, 6):
        row = opening("numbers", 10, digits, False)
        only = row["shapes"][0]
        rows.append([t("lbl_positions").replace("#", str(digits)), num(row["size"], lang), Tiles(letters(only["shape"], row), size=5 * mm),
                     "%s (%s)" % (num(only["left"], lang), pct(only["pct"], lang))])
    story += [grid(rows, [34 * mm, 30 * mm, 56 * mm, 54 * mm])]
    story += [p(t("open_rep_h"), "h2"), p(t("open_rep_p"))]
    rows = [[t("open_col_rules"), t("open_col_codes"), t("open_col_distinct"), t("open_col_pair"), t("open_col_pairs")]]
    for mode, symbols, digits in (("numbers", 10, 3), ("numbers", 10, 4), ("numbers", 10, 5), ("numbers", 10, 6),
                                  ("colors", 4, 4), ("colors", 6, 4), ("colors", 8, 4)):
        row = opening(mode, symbols, digits, True)
        names = ["ABCDEF"[:digits], "AABCDE"[:digits], "AABBCD"[:digits] if digits >= 4 else None]
        cells = []
        for name in names:
            item = shape(row, name) if name else None
            if not item:
                cells.append("–")
                continue
            figure = pct(item["pct"], lang)
            mark = "<b>%s</b> · %s" % (figure, t("grade_" + item["grade"])) if item["grade"] == "optimal" else "%s · %s" % (figure, t("grade_" + item["grade"]))
            cells.append(p("<font face=\"Courier-Bold\">%s</font><br/>%s" % (letters(name, row), mark), "cell"))
        label = t("lbl_colors").replace("#", str(symbols)) if mode == "colors" else t("lbl_numbers")
        rows.append(["%s · %s" % (label, t("lbl_positions").replace("#", str(digits))), num(row["size"], lang)] + cells)
    story += [grid(rows, [44 * mm, 22 * mm, 36 * mm, 36 * mm, 36 * mm]), p(t("open_rep_note"), "small")]
    story += bullets([t("open_b1"), t("open_b2"), t("open_b3")])
    story += [callout(t("open_call"), "coral")] + next_chapter()

    # ---- 3. la segunda jugada ----
    second = DATA["second"]
    story += [chapter(3), p(t("second_lead"))]
    rows = [[t("second_c1"), t("second_c2"), t("second_c3"), t("second_c4"), t("second_c5"), t("second_c6")]]
    shown = [row for row in second["rows"] if row["pct"] >= 1]
    for row in shown:
        rows.append([Pips(row["f"], row["p"], 4), pct(row["pct"], lang), num(row["count"], lang),
                     Tiles(row["best"]), made_of(row, lang, t), "<b>%s</b> / %s" % (num(row["left"], lang), num(row["allNew"], lang))])
    story += [grid(rows, [24 * mm, 18 * mm, 18 * mm, 36 * mm, 50 * mm, 28 * mm]),
              p(t("second_note").replace("#", second["allNewGuess"]), "small")]
    story += [p(t("second_rule_h"), "h2")] + bullets([t("second_r1"), t("second_r2"), t("second_r3"), t("second_r4")])
    story += [callout(t("second_call"), "violeta")]
    third = DATA["second3"]
    rows = [[t("second_c1"), t("second_c2"), t("second_c3"), t("second_c4"), t("second_c5"), t("second_c6")]]
    for row in third["rows"][:4]:
        rows.append([Pips(row["f"], row["p"], 3), pct(row["pct"], lang), num(row["count"], lang),
                     Tiles(row["best"]), made_of(row, lang, t), "<b>%s</b> / %s" % (num(row["left"], lang), num(row["allNew"], lang))])
    story += [KeepTogether([p(t("three_h"), "h2"), p(t("three_p")), grid(rows, [24 * mm, 18 * mm, 18 * mm, 36 * mm, 50 * mm, 28 * mm]),
                            p(t("second_note").replace("#", third["allNewGuess"]), "small")]), p(t("three_blocks"))] + next_chapter()

    # ---- 4. ordenar ----
    story += [chapter(4), p(t("order_lead"))]
    story += [grid([
        [t("order_c1"), t("order_c2"), t("order_c3")],
        ["3", Tiles("012"), t("order_3")],
        ["4", Tiles("0123"), t("order_4")],
        ["5", Tiles("01234"), t("order_5")],
        ["6", Tiles("012345"), t("order_6")],
    ], [22 * mm, 48 * mm, 104 * mm])]
    story += [p(t("swap_h"), "h2"), p(t("swap_p"))]
    example = DATA["example"]
    rows = [[t("ex_c1"), t("ex_c2"), t("ex_c3"), t("ex_c4")]]
    for index, step in enumerate(example["line"]):
        rows.append([str(index + 1), Tiles(step["guess"], pips=(step["f"], step["p"])),
                     str(step["left"]) if step["left"] else "–", t("ex_%d" % (index + 1))])
    story += [KeepTogether([p(t("ex_h"), "h2"), p(t("ex_p")), grid(rows, [15 * mm, 44 * mm, 18 * mm, 97 * mm])])] + next_chapter()

    # ---- 5. con repeticion y con colores ----
    story += [chapter(5), p(t("rep_lead"))]
    story += bullets([t("rep_b1"), t("rep_b2"), t("rep_b3"), t("rep_b4")])
    story += [p(t("rep_plan_h"), "h2")] + bullets([t("rep_p1"), t("rep_p2"), t("rep_p3"), t("rep_p4")])
    story += [callout(t("rep_call"), "azul")]
    story += [KeepTogether([p(t("colors_h"), "h2"), p(t("colors_p")), grid([
        [t("colors_c1"), t("colors_c2"), t("colors_c3")],
        [t("lbl_colors").replace("#", "4"), t("colors_4a"), t("colors_4b")],
        [t("lbl_colors").replace("#", "6"), t("colors_6a"), t("colors_6b")],
        [t("lbl_colors").replace("#", "8"), t("colors_8a"), t("colors_8b")],
    ], [24 * mm, 72 * mm, 78 * mm], valign="TOP")])] + next_chapter()

    # ---- 6. el reloj y los intentos contados ----
    story += [chapter(6), p(t("clock_lead"))]
    story += [grid([[t("clock_c1"), t("clock_c2"), t("clock_c3")]] + [
        ["<b>%s</b>" % t("clock_%d_a" % i), t("clock_%d_b" % i), t("clock_%d_c" % i)] for i in range(1, 7)
    ], [30 * mm, 66 * mm, 78 * mm], valign="TOP")]
    story += [p(t("last_h"), "h2"), p(t("last_p"))]
    story += [KeepTogether([p(t("tree_h"), "h2"), grid([[t("tree_c1"), t("tree_c2")]] + [
        [t("tree_%d_a" % i), t("tree_%d_b" % i)] for i in range(1, 6)], [56 * mm, 118 * mm])])]
    story += [KeepTogether([p(t("errors_h"), "h2")] + bullets([t("error_%d" % i) for i in range(1, 7)]))] + next_chapter()

    # ---- 7. lo que paga ----
    score = DATA["scoring"]
    story += [chapter(7), p(t("pay_lead")), Spacer(1, 1 * mm)]
    story += [blocks([(score["win"], t("pay_win"), "azul"),
                      ("0–%d" % score["maxDifficulty"], t("pay_difficulty"), "violeta"),
                      ("0–%d" % score["economy"][0], t("pay_economy"), "coral")], "+"), Spacer(1, 4 * mm)]
    mono = '<font face="Courier-Bold">%s</font>'
    story += [grid([
        [t("pay_c1"), t("pay_c2")],
        [t("pay_r1"), mono % t("pay_v1")], [t("pay_r2"), mono % t("pay_v2")], [t("pay_r3"), mono % score["loss"]],
        [t("pay_r4"), mono % score["abandon"]], [t("pay_r5"), mono % score["forfeit"]], [t("pay_r6"), mono % t("pay_v6")],
    ], [112 * mm, 62 * mm])]
    rows = [[t("dif_c1"), t("dif_c2"), t("dif_c3")]]
    for row in score["rules"]:
        rows.append([rules_label(row), num(row["size"], lang), mono % row["difficulty"]])
    difficulty = grid(rows, [56 * mm, 20 * mm, 14 * mm])
    side = [Bars(score["economy"], t("eco_axis")), Spacer(1, 2 * mm), p(t("eco_p"), "small"), p(t("dif_p"), "small")]
    story += [KeepTogether([p(t("dif_h"), "h2"), plain([[difficulty, side]], [94 * mm, 80 * mm], valign="TOP")])]
    story += [KeepTogether([p(t("pay_take_h"), "h2")] + bullets([t("pay_t%d" % i) for i in range(1, 6)]))]
    story += [KeepTogether([p(t("badges_h"), "h2"), grid([
        [t("badges_c1"), t("badges_c2")],
        ["<b>%s</b>" % t("badge_1a"), t("badge_1b")],
        ["<b>%s</b>" % t("badge_2a"), t("badge_2b")],
        ["<b>%s</b>" % t("badge_3a"), t("badge_3b")],
    ], [40 * mm, 134 * mm], valign="TOP")])] + next_chapter()

    # ---- 8. tu propio codigo ----
    story += [chapter(8), p(t("own_lead"))] + bullets([t("own_%d" % i) for i in range(1, 5)])
    story += [callout(t("own_call"), "sol")] + next_chapter()

    # ---- 9. los otros modos ----
    story += [chapter(9), p(t("modes_lead"))]
    story += [grid([[t("modes_c1"), t("modes_c2"), t("modes_c3")]] + [
        ["<b>%s</b>" % t("mode_%d_a" % i), t("mode_%d_b" % i), t("mode_%d_c" % i)] for i in range(1, 5)
    ], [30 * mm, 72 * mm, 72 * mm], valign="TOP")]
    story += [p(t("notebook_h"), "h2"), p(t("notebook_p")), callout(t("notebook_call"), "azul")]
    story += [KeepTogether([p(t("analysis_h"), "h2"), p(t("analysis_p")), grid([
        [t("analysis_c1"), t("analysis_c2")],
        ["<b>%s</b>" % t("grade_optimal_name"), t("analysis_1")],
        ["<b>%s</b>" % t("grade_good_name"), t("analysis_2")],
        ["<b>%s</b>" % t("grade_wasted_name"), t("analysis_3")],
        ["<b>%s</b>" % t("analysis_4a"), t("analysis_4")],
    ], [36 * mm, 138 * mm], valign="TOP")]), p(t("analysis_end")), PageBreak()]

    # ---- 10. hoja de registro ----
    story += [chapter(10), p(t("sheet_lead"))]
    rows = [[t("sheet_c1"), t("sheet_c2"), "F", "P", "F+P", t("sheet_c6")]] + [[str(i), "", "", "", "", ""] for i in range(1, SHEET_ROWS + 1)]
    sheet = Table([[cell(v, r == 0) for v in row] for r, row in enumerate(rows)],
                  colWidths=[16 * mm, 40 * mm, 12 * mm, 12 * mm, 14 * mm, 80 * mm], rowHeights=[8 * mm] + [11.5 * mm] * SHEET_ROWS)
    sheet.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, LINEA_3), ("BACKGROUND", (0, 0), (-1, 0), TINTA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [sheet, Spacer(1, 4 * mm), callout(t("conclusion"), "coral")]
    return story


def build(lang):
    texts = TEXTS[lang]
    band = texts["band"]

    def footer(canvas, doc):
        canvas.setFillColor(BRUMA)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(18 * mm, 10 * mm, "picasyfijas.fans")
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, str(doc.page))

    def first(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(CREMA)
        canvas.rect(0, A4[1] - 62 * mm, A4[0], 62 * mm, stroke=0, fill=1)
        footer(canvas, doc)
        canvas.restoreState()

    def later(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(TINTA)
        canvas.rect(0, A4[1] - 11 * mm, A4[0], 11 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawString(18 * mm, A4[1] - 7 * mm, band)
        footer(canvas, doc)
        canvas.restoreState()

    out = OUT / FILES[lang]
    doc = SimpleDocTemplate(
        str(out), pagesize=A4, rightMargin=18 * mm - 6, leftMargin=18 * mm - 6, topMargin=19 * mm - 6, bottomMargin=18 * mm - 6,
        title=texts["meta_title"], author="Picas y Fijas", subject=texts["subtitle"],
        keywords="src:" + fingerprint(), lang=lang, invariant=1,
    )
    doc.build(story_for(lang), onFirstPage=first, onLaterPages=later)
    return out, doc.page


def main():
    keys = set(TEXTS["es"])
    for lang in ("en", "fr"):
        if set(TEXTS[lang]) != keys:
            raise SystemExit("%s no trae las mismas claves que es: %s" % (lang, sorted(keys ^ set(TEXTS[lang]))))
    OUT.mkdir(parents=True, exist_ok=True)
    for lang in FILES:
        out, pages = build(lang)
        print("%s  %d paginas" % (out, pages))


if __name__ == "__main__":
    main()
