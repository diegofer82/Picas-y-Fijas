# -*- coding: utf-8 -*-
"""Genera las paginas publicas de reglas a partir de las del juego.

Las reglas ya estaban escritas y traducidas dentro de `RULES`, en
`public/index.html`, pero solo se veian al pulsar "Como se juega" dentro de la
aplicacion, donde ningun buscador las lee. Este script las saca a tres paginas
propias y rastreables, una por idioma, sin JavaScript y sin duplicar el texto:
la unica fuente sigue siendo `RULES`.

Desde la 5.4.0 las reglas son una guia por capitulos. Tres cosas mas salen del
juego en lugar de escribirse aqui: su hoja de estilos (el bloque que va de
`guia:inicio` a `guia:fin`), los iconos (`ICONS`) y las insignias (`BADGE_ART`),
que en `RULES` son huecos `data-ico` y `data-badge`. Sin script, los capitulos se
abren con `:target`; el laboratorio del primer capitulo solo existe en el juego.

Uso:  python tools/make-rules-pages.py
Las paginas generadas se sirven desde /como-se-juega, /en/how-to-play y
/fr/comment-jouer; el mapa esta en `assetPathFor`, en `src/index.js`.
"""
import io
import os
import re

from site_style import FONTS_MONO, NAMES, ORIGIN, STYLE, THEME_COLOR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "public", "index.html")

PAGES = {
    "es": {
        "path": "/como-se-juega",
        "game": "/",
        "locale": "es_ES",
        "title": "Cómo se juega a Picas y Fijas · reglas de Bulls and Cows",
        "description": "Las reglas completas de Picas y Fijas, el clásico Bulls and Cows: qué es una fija, qué es una pica, los relojes, la arena, el código del día y cómo se suman los puntos del ranking. Con guía de estrategias en PDF.",
        "h1": "Cómo se juega a Picas y Fijas",
        "tagline": "Duelo de deducción online",
        "intro": "Picas y Fijas es un juego de deducción para dos jugadores, conocido en inglés como <b>Bulls and Cows</b>, en español también como <b>Toros y Vacas</b>, y emparentado con <b>Mastermind</b>. Cada jugador esconde un código secreto y gana quien descifre antes el del rival. Se juega gratis en el navegador, sin instalar nada.",
        "cta": "Jugar ahora",
        "home": "Inicio",
        "breadcrumb": "Cómo se juega",
        "back": "Volver al juego",
    },
    "en": {
        "path": "/en/how-to-play",
        "game": "/en",
        "locale": "en_US",
        "title": "How to play Bulls and Cows · Picas y Fijas rules",
        "description": "The full rules of Picas y Fijas, the classic Bulls and Cows deduction game: what the Fixed and Present clues mean, the clocks, the arena, the code of the day and how ranking points add up. Free strategy guide in PDF.",
        "h1": "How to play Picas y Fijas",
        "tagline": "Online deduction duel",
        "intro": "Picas y Fijas is a two-player deduction game, known in English as <b>Bulls and Cows</b> and closely related to <b>Mastermind</b>. Each player hides a secret code and the first to crack their opponent's code wins. It is free and runs in the browser, with nothing to install.",
        "cta": "Play now",
        "home": "Home",
        "breadcrumb": "How to play",
        "back": "Back to the game",
    },
    "fr": {
        "path": "/fr/comment-jouer",
        "game": "/fr",
        "locale": "fr_FR",
        "title": "Comment jouer à Bulls and Cows · règles de Picas y Fijas",
        "description": "Les règles complètes de Picas y Fijas, le classique Bulls and Cows : ce que veulent dire les indices Fixe et Présent, les horloges, l'arène, le code du jour et le calcul des points du classement. Guide stratégique en PDF.",
        "h1": "Comment jouer à Picas y Fijas",
        "tagline": "Duel de déduction en ligne",
        "intro": "Picas y Fijas est un jeu de déduction à deux joueurs, appelé <b>Bulls and Cows</b> en anglais, parfois <b>le jeu du taureau</b>, et proche de <b>Mastermind</b>. Chaque joueur cache un code secret et le premier à deviner celui de l'adversaire gagne. C'est gratuit et ça se joue dans le navigateur, sans rien installer.",
        "cta": "Jouer maintenant",
        "home": "Accueil",
        "breadcrumb": "Comment jouer",
        "back": "Retour au jeu",
    },
}

def game_source():
    return io.open(SOURCE, encoding="utf-8").read()


def guide_css(source):
    """La hoja de la guia vive en el juego, de marca a marca, y se copia tal cual."""
    start = source.index("/* guia:inicio")
    end = source.index("/* guia:fin */", start) + len("/* guia:fin */")
    return source[start:end]


def icon_paths(source):
    """Los trazados de ICONS: una linea por icono, `nombre:'<path ...>'`."""
    start = source.index("const ICONS={")
    block = source[start:source.index("\n};", start)]
    return dict(re.findall(r"\n  (\w+):'([^']*)'", block))


def badge_art(source):
    """BADGE_ART: fondo, anillo si lo hay y el dibujo de cada insignia."""
    start = source.index("const BADGE_ART={")
    block = source[start:source.index("\n};", start)]
    return {
        code: dict(re.findall(r"(bg|ring|fg):'([^']*)'", body))
        for code, body in re.findall(r"\n  (\w+):\{(.*)\},?", block)
    }


def ico(paths, name, size):
    """El gemelo de ico() del juego: mismo marcado, para que el icono sea el mismo."""
    return '<svg class="ico" width="%s" height="%s" viewBox="0 0 24 24" aria-hidden="true">%s</svg>' % (
        size, size, paths[name])


def badge_svg(art, size):
    """El gemelo de badgeSVG() del juego."""
    ring = ' stroke="%s" stroke-width="2"' % art["ring"] if "ring" in art else ""
    return (
        '<svg class="badge-art" width="%s" height="%s" viewBox="0 0 44 44" fill="none" aria-hidden="true">'
        '<circle class="bg" cx="22" cy="22" r="%s" fill="%s"%s></circle><g class="fg">%s</g></svg>'
        % (size, size, 19 if "ring" in art else 20, art["bg"], ring, art["fg"])
    )


def fill_art(html, paths, arts):
    """Rellena los huecos que en el juego pinta paintRules(): iconos e insignias."""
    def icon(match):
        size = re.search(r'data-ico-size="(\d+)"', match.group(1))
        return match.group(1) + ico(paths, match.group(2), size.group(1) if size else "16") + "</span>"

    html = re.sub(r'(<span[^>]*\bdata-ico="(\w+)"[^>]*>)</span>', icon, html)
    return re.sub(
        r'(<span data-badge="(\w+)">)</span>',
        lambda match: match.group(1) + badge_svg(arts[match.group(2)], 40) + "</span>",
        html,
    )


def rules_html(source):
    """Saca los tres bloques de reglas del juego. La fuente unica es RULES."""
    start = source.index("const RULES = {")
    block = source[start:source.index("\n};", start)]
    found = dict(re.findall(r"\n  ([a-z]{2}):`(.*?)`,?(?=\n  [a-z]{2}:`|$)", block, re.S))
    missing = set(PAGES) - set(found)
    if missing:
        raise SystemExit("RULES no trae %s; cambio la forma del bloque?" % sorted(missing))
    return found


def alternates():
    links = [
        '<link rel="alternate" hreflang="%s" href="%s%s">' % (lang, ORIGIN, page["path"])
        for lang, page in PAGES.items()
    ]
    links.append('<link rel="alternate" hreflang="x-default" href="%s%s">' % (ORIGIN, PAGES["es"]["path"]))
    return "\n".join(links)


def language_nav(current):
    parts = []
    for lang, page in PAGES.items():
        if lang == current:
            parts.append("<span>%s</span>" % NAMES[lang])
        else:
            parts.append('<a href="%s" hreflang="%s">%s</a>' % (page["path"], lang, NAMES[lang]))
    return "".join(parts)


def build(lang, page, rules, guide):
    url = ORIGIN + page["path"]
    breadcrumb_ld = (
        '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":['
        '{"@type":"ListItem","position":1,"name":"%s","item":"%s"},'
        '{"@type":"ListItem","position":2,"name":"%s","item":"%s"}]}'
        % (page["home"], ORIGIN + page["game"], page["breadcrumb"], url)
    )
    return """<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{theme_color}
<title>{title}</title>
<meta name="description" content="{description}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="{url}">
{alternates}
<meta property="og:type" content="article">
<meta property="og:site_name" content="Picas y Fijas">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{url}">
<meta property="og:locale" content="{locale}">
<meta property="og:image" content="{origin}/og-{lang}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{origin}/og-{lang}.png">
<link rel="icon" href="/icon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{fonts}
<style>{style}{guide}
</style>
<script type="application/ld+json">{breadcrumb_ld}</script>
</head>
<body>
<div class="wrap">
  <header class="brand">
    <a class="logo" href="{game}"><img src="/icon-192.png" alt="Picas y Fijas" width="48" height="48"></a>
    <div>
      <a class="home" href="{game}">Picas y Fijas</a>
      <div class="sub">{tagline}</div>
    </div>
  </header>
  <main class="card">
    <h1>{h1}</h1>
    <p class="intro">{intro}</p>
    <div class="rules">{rules}</div>
    <a class="btn" href="{game}">{cta}</a>
  </main>
  <nav class="langs">{nav}</nav>
  <footer class="foot"><a href="{game}">{back}</a> · picasyfijas.fans</footer>
</div>
</body>
</html>
""".format(
        lang=lang,
        origin=ORIGIN,
        url=url,
        alternates=alternates(),
        style=STYLE,
        guide=guide,
        fonts=FONTS_MONO,
        theme_color=THEME_COLOR,
        breadcrumb_ld=breadcrumb_ld,
        nav=language_nav(lang),
        rules=rules.strip(),
        **page
    )


source = game_source()
rules = rules_html(source)
guide = guide_css(source)
paths, arts = icon_paths(source), badge_art(source)
for lang, page in PAGES.items():
    out = os.path.join(ROOT, "public", "rules-%s.html" % lang)
    html = build(lang, page, fill_art(rules[lang], paths, arts), guide)
    io.open(out, "w", encoding="utf-8", newline="\n").write(html)
    print("%s  ->  public/rules-%s.html  (%d KB)" % (page["path"], lang, os.path.getsize(out) // 1024))
