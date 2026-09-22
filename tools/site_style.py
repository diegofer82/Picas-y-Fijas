# -*- coding: utf-8 -*-
"""Piel comun de las paginas publicas (reglas, instalacion).

Los mismos colores y tipografias del juego, para que ninguna pagina parezca de
otro sitio. Vive aparte porque ya la usan dos generadores y no queria que se
separaran con el tiempo: `make-rules-pages.py` y `make-install-pages.py`.
"""

ORIGIN = "https://picasyfijas.fans"

NAMES = {"es": "Español", "en": "English", "fr": "Français"}

# Las paginas publicas cargan las mismas tipografias que el juego y declaran el
# mismo color de barra. Viven aqui para que los dos generadores no se separen.
FONTS = ('<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800'
         '&family=Figtree:wght@400;600;700;800&display=swap" rel="stylesheet">')
THEME_COLOR = ('<meta name="theme-color" content="#FFF5E8" media="(prefers-color-scheme: light)">\n'
               '<meta name="theme-color" content="#120F24" media="(prefers-color-scheme: dark)">')

# Los tokens son los de la identidad Plaza, con los mismos nombres que en el
# `:root` de public/index.html: los dibujos de INSTALL_ART que se copian aqui los
# piden por ese nombre (--azul, --hueco, --linea, --papel, --bruma-2, --pica).
STYLE = """
  :root{--crema:#FFF5E8;--papel:#FFFFFF;--hueco:#F7F0E4;--linea:#E9DFD0;--linea-2:#F2ECE0;
    --tinta:#1B1638;--bruma:#625B7A;--bruma-2:#A79FB8;
    --azul:#2F5BFF;--azul-2:#1F3FB8;--azul-suave:#EEF2FF;--azul-texto:#1F3FB8;
    --pica:#E0731A;--fija:#12A150;--r:22px;--r-md:16px}
  @media (prefers-color-scheme:dark){:root{--crema:#120F24;--papel:#1D1838;--hueco:#171233;
    --linea:#2E2850;--linea-2:#2A2448;--tinta:#F6F1FF;--bruma:#A79FC4;--bruma-2:#6E63A0;
    --azul:#4F79FF;--azul-2:#2F4FC7;--azul-suave:#22305E;--azul-texto:#A9BDFF;
    --pica:#F6A040;--fija:#39D37E}}
  *{box-sizing:border-box}
  html,body{margin:0}
  body{font-family:'Figtree',system-ui,-apple-system,sans-serif;background:var(--crema);
    color:var(--tinta);min-height:100dvh;-webkit-font-smoothing:antialiased}
  .wrap{max-width:640px;margin:0 auto;padding:20px 18px 40px}
  .brand{display:flex;align-items:center;gap:12px;margin:6px 0 22px}
  .logo{width:48px;height:48px;border-radius:15px;flex:0 0 auto;overflow:hidden;display:block;
    box-shadow:0 4px 0 var(--azul-2)}
  .logo img{width:100%;height:100%;display:block}
  /* La vaca tambien lleva de vuelta al juego aqui, asi que responde igual que
     dentro: se hunde sobre su reborde al pulsarla. Las reglas gemelas estan en
     `button.logo`, en public/index.html. */
  .logo{transition:transform .08s,box-shadow .08s,filter .15s}
  .logo:hover{filter:brightness(1.06)}
  .logo:active{transform:translateY(4px);box-shadow:none}
  .logo:focus-visible{outline:3px solid var(--azul);outline-offset:2px}
  .brand a.home{font-family:'Bricolage Grotesque','Figtree',sans-serif;font-weight:800;font-size:24px;
    letter-spacing:-.03em;color:var(--tinta);text-decoration:none;line-height:1}
  .brand .sub{font-size:12px;color:var(--bruma);margin-top:3px;font-weight:600}
  .card{background:var(--papel);border:2px solid var(--linea);border-radius:var(--r);padding:22px;margin-bottom:16px}
  h1{font-family:'Bricolage Grotesque','Figtree',sans-serif;margin:0 0 10px;font-size:28px;font-weight:800;
    letter-spacing:-.03em;line-height:1.1}
  .intro{color:var(--bruma);font-size:15px;line-height:1.6;margin:0 0 18px}
  .intro b{color:var(--tinta);font-weight:700}
  .rules{color:var(--tinta);font-size:15px;line-height:1.6}
  .rules ol{padding-left:20px;margin:0 0 6px}
  .rules li{margin-bottom:11px}
  .rules ul{padding-left:18px;margin:6px 0;color:var(--bruma);font-size:14px}
  .rules ul li{margin-bottom:4px}
  .rules b{color:var(--tinta)}
  .note{background:var(--hueco);border:2px solid var(--linea-2);border-radius:var(--r-md);
    padding:12px 14px;margin:12px 0;font-size:14px;color:var(--bruma)}
  .note b{color:var(--tinta)}
  .strategy-download{margin-top:16px;text-align:center;border-color:var(--azul)!important;
    background:var(--azul-suave)!important}
  .strategy-download a{display:inline-block;margin-top:8px;color:var(--azul-texto);font-weight:700;text-decoration:none}
  .strategy-download a:hover,.strategy-download a:focus-visible{text-decoration:underline}
  .btn{display:block;width:100%;border:none;border-radius:var(--r-md);padding:16px;font-size:16px;font-weight:800;
    background:var(--azul);color:#FFFFFF;text-align:center;text-decoration:none;margin-top:20px;
    box-shadow:0 4px 0 var(--azul-2);transition:transform .08s,box-shadow .08s}
  .btn:active{transform:translateY(4px);box-shadow:none}
  .langs{display:flex;gap:14px;justify-content:center;margin:0 0 14px;font-size:14px;font-weight:600}
  .langs a{color:var(--azul-texto);text-decoration:none}
  .langs a:hover{text-decoration:underline}
  .langs span{color:var(--bruma)}
  .foot{text-align:center;color:var(--bruma);font-size:12px;font-weight:600}
  .foot a{color:var(--bruma)}
  @media (prefers-reduced-motion:reduce){*{transition:none!important}}
"""
