# -*- coding: utf-8 -*-
"""Piel comun de las paginas publicas (reglas, instalacion).

Los mismos colores y tipografias del juego, para que ninguna pagina parezca de
otro sitio. Vive aparte porque ya la usan dos generadores y no queria que se
separaran con el tiempo: `make-rules-pages.py` y `make-install-pages.py`.
"""

ORIGIN = "https://picasyfijas.fans"

NAMES = {"es": "Español", "en": "English", "fr": "Français"}

STYLE = """
  :root{--ink:#12100C;--panel:#231D16;--panel-2:#1A150F;--edge:#3B3229;
    --text:#F5EFE3;--muted:#A3947E;--accent:#5B8DEF;--r:14px}
  *{box-sizing:border-box}
  html,body{margin:0}
  body{font-family:'Archivo',system-ui,-apple-system,sans-serif;
    background:radial-gradient(1200px 600px at 80% -10%,rgba(91,141,239,.10),transparent 60%),
      radial-gradient(900px 500px at -10% 110%,rgba(224,104,90,.10),transparent 55%),var(--ink);
    color:var(--text);min-height:100dvh}
  .wrap{max-width:640px;margin:0 auto;padding:20px 18px 40px}
  .brand{display:flex;align-items:center;gap:12px;margin:6px 0 22px}
  .logo{width:46px;height:46px;border-radius:13px;flex:0 0 auto;overflow:hidden;
    background:linear-gradient(150deg,#2C241A,#171208);border:1px solid #4A3E30;display:block;
    box-shadow:0 8px 22px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,236,206,.09)}
  .logo img{width:100%;height:100%;display:block}
  .brand a.home{font-family:'Instrument Serif',Georgia,serif;font-size:25px;color:var(--text);
    text-decoration:none;line-height:1.05}
  .brand .sub{font-size:12px;color:var(--muted);margin-top:2px;letter-spacing:.14em;text-transform:uppercase}
  .card{background:linear-gradient(180deg,var(--panel),var(--panel-2));
    border:1px solid var(--edge);border-radius:var(--r);padding:22px;margin-bottom:16px;
    box-shadow:0 10px 30px rgba(0,0,0,.25)}
  h1{font-family:'Instrument Serif',Georgia,serif;margin:0 0 10px;font-size:27px;font-weight:400;line-height:1.15}
  .intro{color:var(--muted);font-size:14px;line-height:1.6;margin:0 0 18px}
  .intro b{color:var(--text);font-weight:600}
  .rules{color:var(--text);font-size:14px;line-height:1.6}
  .rules ol{padding-left:20px;margin:0 0 6px}
  .rules li{margin-bottom:11px}
  .rules ul{padding-left:18px;margin:6px 0;color:var(--muted);font-size:13px}
  .rules ul li{margin-bottom:4px}
  .rules b{color:var(--text)}
  .note{background:#0D0B07;border:1px solid var(--edge);border-left:3px solid var(--accent);
    border-radius:10px;padding:12px 14px;margin:12px 0;font-size:13px;color:var(--muted)}
  .note b{color:var(--text)}
  .strategy-download{margin-top:16px;text-align:center;border-color:rgba(91,141,239,.45)!important;
    background:rgba(91,141,239,.08)!important}
  .strategy-download a{display:inline-block;margin-top:8px;color:var(--accent);font-weight:700;text-decoration:none}
  .strategy-download a:hover,.strategy-download a:focus-visible{text-decoration:underline}
  .btn{display:block;width:100%;border:none;border-radius:12px;padding:15px;font-size:15px;font-weight:600;
    background:var(--accent);color:#0A1020;text-align:center;text-decoration:none;margin-top:20px}
  .langs{display:flex;gap:14px;justify-content:center;margin:0 0 14px;font-size:13px}
  .langs a{color:var(--accent);text-decoration:none}
  .langs a:hover{text-decoration:underline}
  .langs span{color:var(--muted)}
  .foot{text-align:center;color:var(--muted);font-size:11px;letter-spacing:.05em}
  .foot a{color:var(--muted)}
"""
