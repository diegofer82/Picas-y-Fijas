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
    canvas.drawString(18*mm, A4[1]-8*mm, "PICAS Y FIJAS - GUÍA ESTRATÉGICA")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(A4[0]-8*mm, 9*mm, f"Página {doc.page}")
    canvas.restoreState()

story = [Spacer(1, 18*mm), p("Picas y Fijas", "TitlePF"), p("Guía práctica de estrategias para códigos de 3 a 6 posiciones", "SubPF")]
story += [box("Idea central: una buena jugada no es la que parece cercana al código; es la que elimina la mayor cantidad de posibilidades después de cualquier respuesta.", GREEN), Spacer(1, 7*mm)]
story += [p("Qué contiene esta guía", "H1PF"), p("Estrategias para números y colores, con y sin repetición, aperturas recomendadas, lectura de pistas y un método sistemático para no contradecir resultados anteriores. Las recomendaciones son heurísticas prácticas: no garantizan el mínimo absoluto de turnos en todas las variantes, pero son mucho mejores que adivinar al azar.")]
story += [p("Regla de oro", "H2PF"), p("Después de cada intento, conserva solamente los códigos que producirían exactamente la misma cantidad de F y P si fueran el secreto. La siguiente jugada debe dividir ese conjunto restante en grupos pequeños.")]
story += [Spacer(1, 4*mm), table([
    ["Concepto", "Significado estratégico"],
    ["Fija (F)", "Símbolo correcto en la posición correcta."],
    ["Pica (P)", "Símbolo correcto en una posición diferente."],
    ["0F 0P", "Descarta todos los símbolos del intento: es una respuesta muy informativa."],
    ["F + P", "Cantidad total de símbolos del intento que pertenecen al secreto."],
], [38*mm, 136*mm])]
story.append(PageBreak())

story += [p("1. Método universal de eliminación", "H1PF")]
steps = [
    ("1. Explorar", "Usa una apertura con símbolos distintos. Sin repetición, cubre tantos símbolos nuevos como permita el código. Con repetición, incluye pronto un símbolo duplicado para detectar multiplicidad."),
    ("2. Registrar", "Anota el resultado exacto de cada intento. Nunca interpretes solo F+P cuando necesitas separar posición y presencia."),
    ("3. Filtrar", "Elimina cualquier candidato que no reproduzca todas las pistas anteriores."),
    ("4. Dividir", "Si quedan muchos candidatos, juega una prueba que compare posiciones o introduzca símbolos nuevos. Una jugada de prueba no tiene que poder ganar."),
    ("5. Resolver", "Cuando queden uno o muy pocos candidatos, prueba el candidato más probable o el que mejor separe los restantes."),
]
for title, body in steps:
    story.append(KeepTogether([p(title, "H2PF"), p(body)]))

story += [p("Cómo leer la respuesta", "H2PF"), table([
    ["Respuesta", "Acción"],
    ["0F 0P", "Elimina todos esos símbolos y completa con símbolos nuevos."],
    ["0F y varias P", "Los símbolos están, pero ninguno ocupa esa posición. Reordena de forma controlada."],
    ["Varias F", "Conserva provisionalmente esas posiciones; cambia las otras para confirmarlas."],
    ["F+P menor que posiciones", "Faltan símbolos; introduce nuevos sin perder toda la información posicional."],
], [40*mm, 134*mm])]
story += [box("No cambies todos los símbolos y todas las posiciones a la vez cuando ya tienes coincidencias. Cambia una cosa por turno para saber que produjo la nueva pista.", GOLD)]

story += [p("Sobre 123 - 456 - 789", "H2PF"), p("Es una estrategia válida de <b>cobertura</b> para 3 cifras sin repetición: F+P indica cuántos dígitos de cada bloque pertenecen al secreto. Sin embargo, consume hasta tres turnos antes de estudiar posiciones, omite inicialmente el 0 y puede ser ineficiente si el límite de intentos es 6. Una mejora es detener la cobertura tan pronto como ya hayas localizado tres dígitos y comenzar a permutarlos. Si 123 produce 2 coincidencias y 456 produce 1, ya tienes los tres dígitos: no necesitas jugar 789.")]
story.append(PageBreak())

story += [p("2. Estrategias sin repetición", "H1PF"), p("En estas variantes cada símbolo aparece como máximo una vez. Primero identifica el conjunto de símbolos; luego sus posiciones.")]
rows = [["Posiciones", "Apertura sugerida", "Plan práctico"]]
rows += [
    ["3", "123; luego 456 si faltan símbolos", "Usa F+P para contar pertenencias. Detente al reunir 3. Después permuta dos posiciones cada vez. Recuerda probar el 0 si los bloques no completan el código."],
    ["4", "0123", "Si F+P=4, solo falta ordenar. Si es menor, sustituye primero dos símbolos por 45; luego completa con 67/89 según sea necesario."],
    ["5", "01234", "Con F+P alto, conserva el bloque y prueba permutaciones controladas. Con F+P bajo, cambia 2 o 3 símbolos por 567 y mide cuántos entran."],
    ["6", "012345", "La apertura cubre 60% del alfabeto numérico. Reemplaza grupos de 2 por 67, luego 89. Cuando los 6 símbolos estén identificados, ordena con intercambios."],
]
story += [table(rows, [22*mm, 42*mm, 110*mm])]
story += [p("Técnica de intercambio", "H2PF"), p("Si conoces los símbolos pero no el orden, parte de una disposición y cambia solo dos posiciones. Si las F aumentan en 2, ambas quedan corregidas; si bajan en 2, ambas estaban correctas antes; si no cambian, la información debe combinarse con otro intercambio. Mantener las demás posiciones fijas hace que el resultado sea interpretable.")]
story += [p("Ejemplo de 3 cifras sin repetición", "H2PF"), table([
    ["Turno", "Jugada", "Ejemplo de pista", "Deducción"],
    ["1", "123", "0F 2P", "Dos de {1,2,3} están, ambos mal ubicados."],
    ["2", "456", "0F 1P", "Uno de {4,5,6} está. Ya están los 3 símbolos; no jugar 789."],
    ["3", "214", "1F 1P", "Compara posiciones de 1 y 2 e identifica si 4 es el tercero."],
    ["4+", "Candidato compatible", "-", "Solo prueba códigos que satisfagan las tres pistas."],
], [15*mm, 25*mm, 33*mm, 101*mm])]
story += [box("Con pocos intentos, la mejor apertura es informativa y la segunda jugada depende de la primera. Una lista rígida de jugadas desperdicia pistas.", PINK)]
story.append(PageBreak())

story += [p("3. Estrategias con repetición", "H1PF"), p("Aquí debes descubrir dos cosas: cuáles símbolos aparecen y cuántas veces. Las aperturas con todos los símbolos diferentes no detectan bien la multiplicidad.")]
story += [table([
    ["Posiciones", "Apertura sugerida", "Objetivo"],
    ["3", "112", "Detectar rápidamente si el 1 se repite y obtener información posicional."],
    ["4", "1122", "Divide el código entre dos símbolos y mide multiplicidades."],
    ["5", "11223", "Prueba dos pares y un símbolo adicional."],
    ["6", "112233", "Prueba tres pares; después cambia los pares ausentes por 44/55/66."],
], [25*mm, 40*mm, 109*mm])]
story += [p("Prueba de multiplicidad", "H2PF"), p("Para conocer cuántas veces aparece un símbolo, puedes jugarlo repetido en todas las posiciones (por ejemplo, 1111). El valor F+P será exactamente su cantidad en el secreto. Es una prueba muy clara, pero suele ser cara: usala cuando las pistas sugieran una repetición fuerte o cuando queden candidatos que solo difieran en cantidades.")]
story += [p("Plan adaptativo", "H2PF")]
for txt in [
    "Si 1122 devuelve F+P=0, elimina 1 y 2 por completo.",
    "Si devuelve F+P=4 en un código de 4, el secreto solo contiene 1 y 2; concentra todo en cantidades y posiciones.",
    "Si devuelve F+P=1 o 2, introduce 3344 para medir la otra mitad del alfabeto.",
    "Cuando conozcas las cantidades, ordena cambiando posiciones de dos símbolos, no rehaciendo todo el código.",
]: story.append(p("• " + txt))
story += [box("En variantes con repetición, no asumas que F+P=2 significa dos símbolos distintos: puede ser el mismo símbolo repetido dos veces.", GOLD)]

story += [p("4. Juego con colores", "H1PF"), p("La lógica es idéntica. Sustituye los números por índices de color y considera el tamaño real de la paleta (4, 6 u 8 colores). Una paleta pequeña hace que probar repeticiones sea más importante.")]
story += [table([
    ["Paleta", "Sin repetición", "Con repetición"],
    ["4 colores", "Si el código usa 3 o 4 posiciones, una apertura con colores distintos cubre casi todo el universo.", "Para 4 posiciones usa AABB; luego CCDD. F+P revela cuántas copias aporta cada pareja."],
    ["6 colores", "Cubre primero tantos colores distintos como posiciones. Introduce los restantes solo si F+P no completa el código.", "Usa parejas (AABB, CCDD) o una mezcla AABC según la longitud."],
    ["8 colores", "Se parece al modo numérico: explora por bloques y detente cuando el total de coincidencias complete la longitud.", "Distribuye las pruebas entre símbolos nuevos y duplicados; no explores los ocho si ya conoces suficientes."],
], [25*mm, 74*mm, 75*mm])]
story.append(PageBreak())

story += [p("5. Estrategia según el límite de intentos", "H1PF")]
story += [table([
    ["Configuración", "Prioridad"],
    ["Sin límite", "Maximiza certeza. Puedes usar pruebas puras de presencia o multiplicidad antes de intentar ganar."],
    ["10 intentos", "Equilibrio: 1-3 turnos de exploración y luego candidatos compatibles."],
    ["6 intentos", "Cada jugada debe explorar y poder acercarse a la solución. Evita cubrir todo el alfabeto por rutina."],
    ["Cronómetro", "Prepara una tabla escrita de intentos, F y P. Filtra de manera simple; una estrategia perfecta que tarda demasiado pierde valor."],
], [40*mm, 134*mm])]
story += [p("Arbol de decisión rápido", "H2PF"), table([
    ["Después de una jugada", "Siguiente decisión"],
    ["F+P = longitud", "No introduzcas símbolos nuevos; trabaja solo el orden y, si aplica, las cantidades."],
    ["F+P = 0", "Reemplaza todos por símbolos nuevos."],
    ["0 < F+P < longitud", "Conserva parte de la prueba e introduce suficientes símbolos nuevos para completar el código."],
    ["Quedan 2-5 candidatos", "Elige una jugada que produzca respuestas distintas entre ellos; no necesariamente uno de los candidatos."],
    ["Queda 1 candidato", "Juegalo."],
], [54*mm, 120*mm])]
story += [p("Errores frecuentes", "H2PF")]
for txt in [
    "Repetir una jugada que ya no puede distinguir candidatos.",
    "Ignorar el 0 en el modo numérico.",
    "Cambiar demasiadas posiciones después de obtener varias F.",
    "Probar un código que contradice una pista anterior.",
    "Confundir F+P con la cantidad de símbolos distintos cuando se permiten repeticiones.",
    "Seguir una secuencia fija aunque una pista ya haya localizado todos los símbolos.",
]: story.append(p("• " + txt))

log_rows = [["Turno", "Intento", "F", "P", "F+P", "Deducción / candidatos restantes"]]
log_rows += [[str(i), "", "", "", "", ""] for i in range(1, 6)]
story += [p("Hoja de registro", "H2PF"), table(log_rows, [14*mm, 28*mm, 12*mm, 12*mm, 16*mm, 92*mm])]
story += [Spacer(1, 5*mm), box("Conclusión: sí, existen estrategias. La más fuerte es tratar cada pista como una restricción matemática, eliminar candidatos incompatibles y escoger la siguiente jugada por la información que puede producir.", GREEN)]

doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=20*mm, bottomMargin=20*mm, title="Guía de estrategias - Picas y Fijas", author="Picas y Fijas")
doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print(OUT)
