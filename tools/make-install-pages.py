# -*- coding: utf-8 -*-
"""Genera las paginas publicas que ensenan a instalar el juego en el movil.

Mucha gente que juega desde el telefono no encuentra "Anadir a pantalla de
inicio": en Android esta escondido en el menu del navegador y en iPhone no
existe ninguna forma automatica de ofrecerlo. El juego ya ensena los pasos
dibujados dentro del lobby; este script los saca a tres paginas propias, una
por idioma, para poder enlazarlas o pasarselas a quien pregunte.

El texto de los pasos y los dibujos NO se escriben aqui: se leen de
`public/index.html` (las claves `install_*` de I18N y el bloque `INSTALL_ART`),
que sigue siendo la unica fuente. Si cambian alli, basta con volver a ejecutar
este script.

Uso:  python tools/make-install-pages.py
Las paginas se sirven desde /instalar, /en/install y /fr/installer; el mapa
esta en `assetPathFor`, en `src/index.js`.
"""
import io
import os
import re

from site_style import NAMES, ORIGIN, STYLE

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "public", "index.html")

PAGES = {
    "es": {
        "path": "/instalar",
        "game": "/",
        "locale": "es_ES",
        "title": "Cómo instalar Picas y Fijas en el móvil · añadirlo a la pantalla de inicio",
        "description": "Guía con imágenes para añadir Picas y Fijas a la pantalla de inicio del iPhone o de Android: se abre a pantalla completa, vuelves a la partida de un toque y el iPhone puede avisarte cuando sea tu turno.",
        "h1": "Instalar Picas y Fijas en tu móvil",
        "tagline": "Duelo de deducción online",
        "intro": "No hace falta ninguna tienda de aplicaciones: el juego se añade a la pantalla de inicio desde el propio navegador, en menos de diez segundos. Se abre a pantalla completa, sin la barra del navegador, y vuelves a tus partidas de un solo toque.",
        "why_title": "Qué ganas",
        "why": [
            "<b>Un icono en tu pantalla de inicio</b>, como el de cualquier otra app.",
            "<b>Pantalla completa</b>: sin barra de direcciones, con más sitio para el tablero.",
            "<b>Avisos de turno</b>: en el iPhone solo llegan si el juego está instalado.",
        ],
        "ios_title": "En iPhone y iPad, con Safari",
        "android_title": "En Android, con Chrome",
        "ios_note": "<b>Los avisos de turno en el iPhone</b> solo funcionan dentro del juego instalado: Safari no permite notificaciones a una pestaña normal. Si quieres saber cuándo te toca sin estar mirando la pantalla, este es el motivo para añadirlo.",
        "android_note": "<b>Atajo:</b> en Android, con el juego abierto, suele aparecer en el lobby una tarjeta <b>Instalar la app</b>. Un toque y listo, sin buscar nada en el menú.",
        "inapp_note": "<b>¿Lo abriste desde Instagram, Facebook o WhatsApp?</b> Esos navegadores integrados no pueden instalar nada. Abre <b>picasyfijas.fans</b> en Safari (iPhone) o en Chrome (Android) y vuelve a intentarlo.",
        "cta": "Jugar ahora",
        "home": "Inicio",
        "breadcrumb": "Instalar",
        "back": "Volver al juego",
    },
    "en": {
        "path": "/en/install",
        "game": "/en",
        "locale": "en_US",
        "title": "Install Picas y Fijas on your phone · add it to your home screen",
        "description": "An illustrated guide to adding Picas y Fijas to your iPhone or Android home screen: full screen, one tap back into your games, and turn alerts on iPhone.",
        "h1": "Install Picas y Fijas on your phone",
        "tagline": "Online deduction duel",
        "intro": "No app store needed: the game is added to your home screen straight from the browser, in under ten seconds. It opens full screen, without the browser bar, and takes you back to your games in a single tap.",
        "why_title": "What you get",
        "why": [
            "<b>An icon on your home screen</b>, like any other app.",
            "<b>Full screen</b>: no address bar, more room for the board.",
            "<b>Turn alerts</b>: on iPhone they only arrive once the game is installed.",
        ],
        "ios_title": "On iPhone and iPad, with Safari",
        "android_title": "On Android, with Chrome",
        "ios_note": "<b>Turn alerts on iPhone</b> only work inside the installed game: Safari does not allow notifications for an ordinary tab. If you want to know when it is your move without watching the screen, that is the reason to add it.",
        "android_note": "<b>Shortcut:</b> on Android, with the game open, an <b>Install the app</b> card usually shows up in the lobby. One tap and you are done, with nothing to hunt for in the menu.",
        "inapp_note": "<b>Opened it from Instagram, Facebook or WhatsApp?</b> Those in-app browsers cannot install anything. Open <b>picasyfijas.fans</b> in Safari (iPhone) or Chrome (Android) and try again.",
        "cta": "Play now",
        "home": "Home",
        "breadcrumb": "Install",
        "back": "Back to the game",
    },
    "fr": {
        "path": "/fr/installer",
        "game": "/fr",
        "locale": "fr_FR",
        "title": "Installer Picas y Fijas sur ton téléphone · l'ajouter à l'écran d'accueil",
        "description": "Un guide en images pour ajouter Picas y Fijas à l'écran d'accueil de ton iPhone ou de ton Android : plein écran, retour aux parties en un geste et alertes de tour sur iPhone.",
        "h1": "Installer Picas y Fijas sur ton téléphone",
        "tagline": "Duel de déduction en ligne",
        "intro": "Aucune boutique d'applications n'est nécessaire : le jeu s'ajoute à l'écran d'accueil depuis le navigateur, en moins de dix secondes. Il s'ouvre en plein écran, sans la barre du navigateur, et te ramène à tes parties d'un seul geste.",
        "why_title": "Ce que tu y gagnes",
        "why": [
            "<b>Une icône sur ton écran d'accueil</b>, comme n'importe quelle autre appli.",
            "<b>Plein écran</b> : sans barre d'adresse, plus de place pour le plateau.",
            "<b>Les alertes de tour</b> : sur iPhone, elles n'arrivent qu'une fois le jeu installé.",
        ],
        "ios_title": "Sur iPhone et iPad, avec Safari",
        "android_title": "Sur Android, avec Chrome",
        "ios_note": "<b>Les alertes de tour sur iPhone</b> ne fonctionnent que dans le jeu installé : Safari n'autorise pas les notifications pour un onglet ordinaire. Si tu veux savoir quand c'est à toi sans surveiller l'écran, voilà la raison de l'ajouter.",
        "android_note": "<b>Raccourci :</b> sur Android, quand le jeu est ouvert, une carte <b>Installer l'appli</b> apparaît en général dans le lobby. Un geste et c'est fait, sans rien chercher dans le menu.",
        "inapp_note": "<b>Tu l'as ouvert depuis Instagram, Facebook ou WhatsApp ?</b> Ces navigateurs intégrés ne peuvent rien installer. Ouvre <b>picasyfijas.fans</b> dans Safari (iPhone) ou Chrome (Android) et réessaie.",
        "cta": "Jouer maintenant",
        "home": "Accueil",
        "breadcrumb": "Installer",
        "back": "Retour au jeu",
    },
}

# Lo que anade esta pagina sobre la piel comun: los pasos con su dibujo.
EXTRA_STYLE = """
  h2{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:20px;margin:26px 0 12px}
  .steps{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}
  .step{display:flex;gap:13px;align-items:center;background:#0D0B07;border:1px solid var(--edge);
    border-radius:12px;padding:12px 14px}
  .step .num{flex:0 0 24px;width:24px;height:24px;border-radius:50%;background:var(--accent);
    color:#0A1020;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center}
  .step .txt{flex:1;font-size:14px;line-height:1.45;color:var(--muted)}
  .step .txt b{color:var(--text)}
  .step .shot{flex:0 0 auto}
  .step .shot svg{display:block}
  .why{margin:0;padding-left:20px;color:var(--muted);font-size:14px;line-height:1.7}
  .why b{color:var(--text)}
"""


def game_source():
    return io.open(SOURCE, encoding="utf-8").read()


def install_art(source):
    """Los seis dibujos del juego, tal cual, para no tener dos versiones."""
    start = source.index("const INSTALL_ART = {")
    block = source[start:source.index("\n};", start)]
    found = dict(re.findall(r"\n  ([a-z]+):`(.*?)`,?(?=\n  [a-z]+:`|$)", block, re.S))
    missing = {"share", "sheet", "add", "menu", "list", "confirm"} - set(found)
    if missing:
        raise SystemExit("INSTALL_ART no trae %s; cambio la forma del bloque?" % sorted(missing))
    # En la pagina hay sitio de sobra: el mismo dibujo, algo mas grande.
    return {k: v.replace('width="56" height="40"', 'width="84" height="60"') for k, v in found.items()}


def install_texts(source):
    """Los pasos escritos, leidos de las claves install_* de cada idioma."""
    texts = {}
    for lang in PAGES:
        marker = "Object.assign(I18N.%s,{install_title:" % lang
        if marker not in source:
            raise SystemExit("no encuentro las claves install_* de %s" % lang)
        start = source.index(marker)
        block = source[start:source.index("});", start)]
        texts[lang] = dict(re.findall(r'(install_[a-z0-9_]+):"([^"]*)"', block))
        for key in ("install_ios_1", "install_ios_2", "install_ios_3",
                    "install_and_1", "install_and_2", "install_and_3"):
            if key not in texts[lang]:
                raise SystemExit("falta %s en %s" % (key, lang))
    return texts


def steps_html(texts, art, kind):
    drawings = {"ios": ["share", "sheet", "add"], "and": ["menu", "list", "confirm"]}[kind]
    rows = []
    for n, name in enumerate(drawings, start=1):
        rows.append(
            '<li class="step"><span class="num">%d</span>'
            '<span class="txt">%s</span>'
            '<span class="shot">%s</span></li>'
            % (n, texts["install_%s_%d" % (kind, n)], art[name])
        )
    return '<ol class="steps">%s</ol>' % "".join(rows)


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


def build(lang, page, texts, art):
    url = ORIGIN + page["path"]
    breadcrumb_ld = (
        '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":['
        '{"@type":"ListItem","position":1,"name":"%s","item":"%s"},'
        '{"@type":"ListItem","position":2,"name":"%s","item":"%s"}]}'
        % (page["home"], ORIGIN + page["game"], page["breadcrumb"], url)
    )
    why = "".join("<li>%s</li>" % item for item in page["why"])
    fields = {key: value for key, value in page.items() if key != "why"}
    return """<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#12100C">
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
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet">
<style>{style}{extra}</style>
<script type="application/ld+json">{breadcrumb_ld}</script>
</head>
<body>
<div class="wrap">
  <header class="brand">
    <a class="logo" href="{game}"><img src="/icon-192.png" alt="Picas y Fijas" width="46" height="46"></a>
    <div>
      <a class="home" href="{game}">Picas y Fijas</a>
      <div class="sub">{tagline}</div>
    </div>
  </header>
  <main class="card">
    <h1>{h1}</h1>
    <p class="intro">{intro}</p>
    <h2>{why_title}</h2>
    <ul class="why">{why}</ul>
    <h2>{ios_title}</h2>
    {ios_steps}
    <div class="note">{ios_note}</div>
    <h2>{android_title}</h2>
    {android_steps}
    <div class="note">{android_note}</div>
    <div class="note">{inapp_note}</div>
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
        extra=EXTRA_STYLE,
        breadcrumb_ld=breadcrumb_ld,
        nav=language_nav(lang),
        why=why,
        ios_steps=steps_html(texts, art, "ios"),
        android_steps=steps_html(texts, art, "and"),
        **fields
    )


source = game_source()
art = install_art(source)
texts = install_texts(source)
for lang, page in PAGES.items():
    out = os.path.join(ROOT, "public", "install-%s.html" % lang)
    io.open(out, "w", encoding="utf-8", newline="\n").write(build(lang, page, texts[lang], art))
    print("%s  ->  public/install-%s.html  (%d KB)" % (page["path"], lang, os.path.getsize(out) // 1024))
