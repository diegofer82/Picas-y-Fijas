"""Genera las guias de estrategia y las publica en public/.

    python tools/pdf/build.py

Existe porque regenerar y publicar eran dos pasos sueltos, y por eso las guias
se quedaron con la paleta morada cuando la aplicacion ya usaba la identidad
Mesa: alguien regeneraba en output/ y se olvidaba de copiar. Los nombres de
public/ son los que enlaza la pantalla de reglas y no se pueden cambiar sin
cambiarlos tambien en public/index.html.

Necesita reportlab:  python -m pip install reportlab
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "output" / "pdf"
PUBLIC = ROOT / "public"

GENERADORES = ["crear_guia_estrategias.py", "create_strategy_translations.py"]

# origen en output/pdf  ->  nombre que sirve la aplicacion
PUBLICAR = {
    "guia-estrategias-picas-y-fijas.pdf": "guia-estrategias-picas-y-fijas-es.pdf",
    "picas-y-fijas-strategy-guide-en.pdf": "picas-y-fijas-strategy-guide-en.pdf",
    "guide-strategies-picas-y-fijas-fr.pdf": "guide-strategies-picas-y-fijas-fr.pdf",
}


def main() -> int:
    try:
        import reportlab  # noqa: F401
    except ModuleNotFoundError:
        print("Falta reportlab.  python -m pip install reportlab", file=sys.stderr)
        return 1

    for nombre in GENERADORES:
        print(f"· {nombre}")
        r = subprocess.run([sys.executable, str(HERE / nombre)], cwd=ROOT)
        if r.returncode:
            print(f"fallo {nombre}", file=sys.stderr)
            return r.returncode

    faltan = [o for o in PUBLICAR if not (OUT / o).exists()]
    if faltan:
        print(f"no se generaron: {', '.join(faltan)}", file=sys.stderr)
        return 1

    for origen, destino in PUBLICAR.items():
        shutil.copyfile(OUT / origen, PUBLIC / destino)
        print(f"  public/{destino}  {(PUBLIC / destino).stat().st_size} bytes")

    print("Listo. Revisa el diff de public/ antes de commitear.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
