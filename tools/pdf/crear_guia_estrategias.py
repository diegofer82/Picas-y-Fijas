from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "guia-estrategias-picas-y-fijas.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#241E17")
PURPLE = colors.HexColor("#5C4A33")
CYAN = colors.HexColor("#5B8DEF")
GREEN = colors.HexColor("#3FA968")
PINK = colors.HexColor("#C7503F")
GOLD = colors.HexColor("#C98A06")
MUTED = colors.HexColor("#6E6353")
LIGHT = colors.HexColor("#FAF6EE")
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitlePF", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25, leading=29, textColor=NAVY, alignment=TA_CENTER, spaceAfter=10))
styles.add(ParagraphStyle(name="SubPF", parent=styles["Normal"], fontName="Helvetica", fontSize=11, leading=16, textColor=MUTED, alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="H1PF", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=NAVY, spaceBefore=4, spaceAfter=10))
styles.add(ParagraphStyle(name="H2PF", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=PURPLE, spaceBefore=7, spaceAfter=5))
styles.add(ParagraphStyle(name="BodyPF", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=14, textColor=NAVY, spaceAfter=6))
styles.add(ParagraphStyle(name="SmallPF", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, leading=11, textColor=NAVY))
styles.add(ParagraphStyle(name="SmallWhitePF", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, leading=11, textColor=WHITE))
styles.add(ParagraphStyle(name="CalloutPF", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=10, leading=15, textColor=NAVY, leftIndent=8, rightIndent=8, spaceBefore=5, spaceAfter=8))

def p(text, style="BodyPF"):
    return Paragraph(text, styles[style])

def box(text, color=CYAN):
    t = Table([[p(text, "CalloutPF")]], colWidths=[174*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.Color(color.red, color.green, color.blue, alpha=.10)),
        ("BOX", (0,0), (-1,-1), 1, color),
        ("LEFTPADDING", (0,0), (-1,-1), 8), ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    return t

def table(rows, widths, header=True):
    data = [[p(str(c), "SmallWhitePF" if header and row_index == 0 else "SmallPF") for c in row]
            for row_index, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    cmds = [
        ("GRID", (0,0), (-1,-1), .45, colors.HexColor("#DDD2C0")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT]),
    ]
    if header:
        cmds += [("BACKGROUND", (0,0), (-1,0), NAVY), ("TEXTCOLOR", (0,0), (-1,0), WHITE)]
    t.setStyle(TableStyle(cmds))
    return t

def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1]-12*mm, A4[0], 12*mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(18*mm, A4[1]-8*mm, "PICAS Y FIJAS - GUIA ESTRATEGICA")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(A4[0]-8*mm, 9*mm, f"Pagina {doc.page}")
    canvas.restoreState()

story = [Spacer(1, 18*mm), p("Picas y Fijas", "TitlePF"), p("Guia practica de estrategias para codigos de 3 a 6 posiciones", "SubPF")]
story += [box("Idea central: una buena jugada no es la que parece cercana al codigo; es la que elimina la mayor cantidad de posibilidades despues de cualquier respuesta.", GREEN), Spacer(1, 7*mm)]
story += [p("Que contiene esta guia", "H1PF"), p("Estrategias para numeros y colores, con y sin repeticion, aperturas recomendadas, lectura de pistas y un metodo sistematico para no contradecir resultados anteriores. Las recomendaciones son heuristicas practicas: no garantizan el minimo absoluto de turnos en todas las variantes, pero son mucho mejores que adivinar al azar.")]
story += [p("Regla de oro", "H2PF"), p("Despues de cada intento, conserva solamente los codigos que producirian exactamente la misma cantidad de F y P si fueran el secreto. La siguiente jugada debe dividir ese conjunto restante en grupos pequenos.")]
story += [Spacer(1, 4*mm), table([
    ["Concepto", "Significado estrategico"],
    ["Fija (F)", "Simbolo correcto en la posicion correcta."],
    ["Pica (P)", "Simbolo correcto en una posicion diferente."],
    ["0F 0P", "Descarta todos los simbolos del intento: es una respuesta muy informativa."],
    ["F + P", "Cantidad total de simbolos del intento que pertenecen al secreto."],
], [38*mm, 136*mm])]
story.append(PageBreak())

story += [p("1. Metodo universal de eliminacion", "H1PF")]
steps = [
    ("1. Explorar", "Usa una apertura con simbolos distintos. Sin repeticion, cubre tantos simbolos nuevos como permita el codigo. Con repeticion, incluye pronto un simbolo duplicado para detectar multiplicidad."),
    ("2. Registrar", "Anota el resultado exacto de cada intento. Nunca interpretes solo F+P cuando necesitas separar posicion y presencia."),
    ("3. Filtrar", "Elimina cualquier candidato que no reproduzca todas las pistas anteriores."),
    ("4. Dividir", "Si quedan muchos candidatos, juega una prueba que compare posiciones o introduzca simbolos nuevos. Una jugada de prueba no tiene que poder ganar."),
    ("5. Resolver", "Cuando queden uno o muy pocos candidatos, prueba el candidato mas probable o el que mejor separe los restantes."),
]
for title, body in steps:
    story.append(KeepTogether([p(title, "H2PF"), p(body)]))

story += [p("Como leer la respuesta", "H2PF"), table([
    ["Respuesta", "Accion"],
    ["0F 0P", "Elimina todos esos simbolos y completa con simbolos nuevos."],
    ["0F y varias P", "Los simbolos estan, pero ninguno ocupa esa posicion. Reordena de forma controlada."],
    ["Varias F", "Conserva provisionalmente esas posiciones; cambia las otras para confirmarlas."],
    ["F+P menor que posiciones", "Faltan simbolos; introduce nuevos sin perder toda la informacion posicional."],
], [40*mm, 134*mm])]
story += [box("No cambies todos los simbolos y todas las posiciones a la vez cuando ya tienes coincidencias. Cambia una cosa por turno para saber que produjo la nueva pista.", GOLD)]

story += [p("Sobre 123 - 456 - 789", "H2PF"), p("Es una estrategia valida de <b>cobertura</b> para 3 cifras sin repeticion: F+P indica cuantos digitos de cada bloque pertenecen al secreto. Sin embargo, consume hasta tres turnos antes de estudiar posiciones, omite inicialmente el 0 y puede ser ineficiente si el limite de intentos es 6. Una mejora es detener la cobertura tan pronto como ya hayas localizado tres digitos y comenzar a permutarlos. Si 123 produce 2 coincidencias y 456 produce 1, ya tienes los tres digitos: no necesitas jugar 789.")]
story.append(PageBreak())

story += [p("2. Estrategias sin repeticion", "H1PF"), p("En estas variantes cada simbolo aparece como maximo una vez. Primero identifica el conjunto de simbolos; luego sus posiciones.")]
rows = [["Posiciones", "Apertura sugerida", "Plan practico"]]
rows += [
    ["3", "123; luego 456 si faltan simbolos", "Usa F+P para contar pertenencias. Detente al reunir 3. Despues permuta dos posiciones cada vez. Recuerda probar el 0 si los bloques no completan el codigo."],
    ["4", "0123", "Si F+P=4, solo falta ordenar. Si es menor, sustituye primero dos simbolos por 45; luego completa con 67/89 segun sea necesario."],
    ["5", "01234", "Con F+P alto, conserva el bloque y prueba permutaciones controladas. Con F+P bajo, cambia 2 o 3 simbolos por 567 y mide cuantos entran."],
    ["6", "012345", "La apertura cubre 60% del alfabeto numerico. Reemplaza grupos de 2 por 67, luego 89. Cuando los 6 simbolos esten identificados, ordena con intercambios."],
]
story += [table(rows, [22*mm, 42*mm, 110*mm])]
story += [p("Tecnica de intercambio", "H2PF"), p("Si conoces los simbolos pero no el orden, parte de una disposicion y cambia solo dos posiciones. Si las F aumentan en 2, ambas quedan corregidas; si bajan en 2, ambas estaban correctas antes; si no cambian, la informacion debe combinarse con otro intercambio. Mantener las demas posiciones fijas hace que el resultado sea interpretable.")]
story += [p("Ejemplo de 3 cifras sin repeticion", "H2PF"), table([
    ["Turno", "Jugada", "Ejemplo de pista", "Deduccion"],
    ["1", "123", "0F 2P", "Dos de {1,2,3} estan, ambos mal ubicados."],
    ["2", "456", "0F 1P", "Uno de {4,5,6} esta. Ya estan los 3 simbolos; no jugar 789."],
    ["3", "214", "1F 1P", "Compara posiciones de 1 y 2 e identifica si 4 es el tercero."],
    ["4+", "Candidato compatible", "-", "Solo prueba codigos que satisfagan las tres pistas."],
], [15*mm, 25*mm, 33*mm, 101*mm])]
story += [box("Con pocos intentos, la mejor apertura es informativa y la segunda jugada depende de la primera. Una lista rigida de jugadas desperdicia pistas.", PINK)]
story.append(PageBreak())

story += [p("3. Estrategias con repeticion", "H1PF"), p("Aqui debes descubrir dos cosas: cuales simbolos aparecen y cuantas veces. Las aperturas con todos los simbolos diferentes no detectan bien la multiplicidad.")]
story += [table([
    ["Posiciones", "Apertura sugerida", "Objetivo"],
    ["3", "112", "Detectar rapidamente si el 1 se repite y obtener informacion posicional."],
    ["4", "1122", "Divide el codigo entre dos simbolos y mide multiplicidades."],
    ["5", "11223", "Prueba dos pares y un simbolo adicional."],
    ["6", "112233", "Prueba tres pares; despues cambia los pares ausentes por 44/55/66."],
], [25*mm, 40*mm, 109*mm])]
story += [p("Prueba de multiplicidad", "H2PF"), p("Para conocer cuantas veces aparece un simbolo, puedes jugarlo repetido en todas las posiciones (por ejemplo, 1111). El valor F+P sera exactamente su cantidad en el secreto. Es una prueba muy clara, pero suele ser cara: usala cuando las pistas sugieran una repeticion fuerte o cuando queden candidatos que solo difieran en cantidades.")]
story += [p("Plan adaptativo", "H2PF")]
for txt in [
    "Si 1122 devuelve F+P=0, elimina 1 y 2 por completo.",
    "Si devuelve F+P=4 en un codigo de 4, el secreto solo contiene 1 y 2; concentra todo en cantidades y posiciones.",
    "Si devuelve F+P=1 o 2, introduce 3344 para medir la otra mitad del alfabeto.",
    "Cuando conozcas las cantidades, ordena cambiando posiciones de dos simbolos, no rehaciendo todo el codigo.",
]: story.append(p("• " + txt))
story += [box("En variantes con repeticion, no asumas que F+P=2 significa dos simbolos distintos: puede ser el mismo simbolo repetido dos veces.", GOLD)]

story += [p("4. Juego con colores", "H1PF"), p("La logica es identica. Sustituye los numeros por indices de color y considera el tamaño real de la paleta (4, 6 u 8 colores). Una paleta pequena hace que probar repeticiones sea mas importante.")]
story += [table([
    ["Paleta", "Sin repeticion", "Con repeticion"],
    ["4 colores", "Si el codigo usa 3 o 4 posiciones, una apertura con colores distintos cubre casi todo el universo.", "Para 4 posiciones usa AABB; luego CCDD. F+P revela cuantas copias aporta cada pareja."],
    ["6 colores", "Cubre primero tantos colores distintos como posiciones. Introduce los restantes solo si F+P no completa el codigo.", "Usa parejas (AABB, CCDD) o una mezcla AABC segun la longitud."],
    ["8 colores", "Se parece al modo numerico: explora por bloques y detente cuando el total de coincidencias complete la longitud.", "Distribuye las pruebas entre simbolos nuevos y duplicados; no explores los ocho si ya conoces suficientes."],
], [25*mm, 74*mm, 75*mm])]
story.append(PageBreak())

story += [p("5. Estrategia segun el limite de intentos", "H1PF")]
story += [table([
    ["Configuracion", "Prioridad"],
    ["Sin limite", "Maximiza certeza. Puedes usar pruebas puras de presencia o multiplicidad antes de intentar ganar."],
    ["10 intentos", "Equilibrio: 1-3 turnos de exploracion y luego candidatos compatibles."],
    ["6 intentos", "Cada jugada debe explorar y poder acercarse a la solucion. Evita cubrir todo el alfabeto por rutina."],
    ["Cronometro", "Prepara una tabla escrita de intentos, F y P. Filtra de manera simple; una estrategia perfecta que tarda demasiado pierde valor."],
], [40*mm, 134*mm])]
story += [p("Arbol de decision rapido", "H2PF"), table([
    ["Despues de una jugada", "Siguiente decision"],
    ["F+P = longitud", "No introduzcas simbolos nuevos; trabaja solo el orden y, si aplica, las cantidades."],
    ["F+P = 0", "Reemplaza todos por simbolos nuevos."],
    ["0 < F+P < longitud", "Conserva parte de la prueba e introduce suficientes simbolos nuevos para completar el codigo."],
    ["Quedan 2-5 candidatos", "Elige una jugada que produzca respuestas distintas entre ellos; no necesariamente uno de los candidatos."],
    ["Queda 1 candidato", "Juegalo."],
], [54*mm, 120*mm])]
story += [p("Errores frecuentes", "H2PF")]
for txt in [
    "Repetir una jugada que ya no puede distinguir candidatos.",
    "Ignorar el 0 en el modo numerico.",
    "Cambiar demasiadas posiciones despues de obtener varias F.",
    "Probar un codigo que contradice una pista anterior.",
    "Confundir F+P con la cantidad de simbolos distintos cuando se permiten repeticiones.",
    "Seguir una secuencia fija aunque una pista ya haya localizado todos los simbolos.",
]: story.append(p("• " + txt))

log_rows = [["Turno", "Intento", "F", "P", "F+P", "Deduccion / candidatos restantes"]]
log_rows += [[str(i), "", "", "", "", ""] for i in range(1, 6)]
story += [p("Hoja de registro", "H2PF"), table(log_rows, [14*mm, 28*mm, 12*mm, 12*mm, 16*mm, 92*mm])]
story += [Spacer(1, 5*mm), box("Conclusion: si, existen estrategias. La mas fuerte es tratar cada pista como una restriccion matematica, eliminar candidatos incompatibles y escoger la siguiente jugada por la informacion que puede producir.", GREEN)]

doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=20*mm, bottomMargin=20*mm, title="Guia de estrategias - Picas y Fijas", author="Picas y Fijas")
doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print(OUT)
