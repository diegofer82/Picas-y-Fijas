# Picas y Fijas — documento maestro

Este es el único documento de referencia del proyecto. Está pensado para personas y asistentes de IA: antes de modificar, desplegar o diagnosticar la aplicación, se debe leer completo y mantenerlo actualizado cuando cambie la arquitectura, la operación o una decisión importante.

## Estado actual

Picas y Fijas es un juego multijugador web en español, inglés y francés. La versión vigente funciona íntegramente en Cloudflare; la implementación anterior de Google Sheets y Apps Script fue retirada del árbol actual después de completar la migración. Sigue disponible en el historial de Git si alguna vez se necesita consultar.

Versión actual: **2.5.0**.

- Juego: https://picasyfijas.fans/ (también https://www.picasyfijas.fans/)
- Dirección anterior, sigue activa: https://picas-y-fijas.picas-y-fijas.workers.dev/
- Administración: https://picasyfijas.fans/admin
- Repositorio: https://github.com/diegofer82/Picas-y-Fijas
- Rama de producción: `main`
- Worker y base D1: `picas-y-fijas` / `picas-y-fijas-db`

Cloudflare despliega automáticamente la rama `main`. No se debe modificar producción manualmente salvo una recuperación explícita.

Los dominios propios se declaran en `routes` dentro de `wrangler.jsonc` con `custom_domain: true`; Cloudflare crea y mantiene los registros DNS a partir de ahí.

**Al declarar `routes`, Wrangler apaga la ruta `workers.dev` salvo que se ponga `"workers_dev": true`.** Es lo que dejó la dirección antigua en 404 durante unos minutos al añadir el dominio propio. La bandera debe quedarse: el Worker responde en `workers.dev` para poder redirigir 301 al dominio propio, conservando ruta y parámetros, y así los enlaces de partida antiguos siguen llevando a su partida. La constante `CANONICAL_HOST` en `src/index.js` es el destino de esa redirección.

Solo hay una dirección canónica: **`picasyfijas.fans`**. Todo lo demás redirige a ella con un 301 y conserva ruta y parámetros:

| Dirección | Qué hace |
| --- | --- |
| `picasyfijas.fans` | Sirve la aplicación (español) |
| `picasyfijas.fans/en`, `/fr`, `/es` | La misma aplicación con la cabecera traducida, para los buscadores |
| `picasyfijas.fans/como-se-juega`, `/en/how-to-play`, `/fr/comment-jouer` | Las reglas como página pública, una por idioma |
| `picasyfijas.fans/instalar`, `/en/install`, `/fr/installer` | La guía para añadir el juego a la pantalla de inicio, una por idioma |
| `www.picasyfijas.fans` | 301 al apex |
| `picas-y-fijas.picas-y-fijas.workers.dev` | 301 al apex |
| `diegofer82.github.io/Picas-y-Fijas/` | Página estática que redirige al apex |

Los alias se enumeran uno a uno en `canonicalRedirect` (`src/index.js`) en lugar de redirigir todo lo que no sea el apex, para no dejar fuera de juego a `wrangler dev`, que sirve en `localhost`. Al añadir un dominio nuevo hay que añadirlo también ahí, y `test/routing.test.js` fija ese comportamiento.

## Cómo se juega

Picas y Fijas es un juego de lógica para dos personas, conocido también como *Bulls and Cows* o, en su variante de colores, Mastermind. Cada jugador crea un código secreto y trata de descubrir el del rival antes de que el rival descubra el suyo.

- **Fija (F):** símbolo correcto en la posición correcta.
- **Pica (P):** símbolo correcto, pero situado en otra posición.

Por ejemplo, si el secreto es `1234` y el intento es `1356`, el resultado es **1 fija** (el `1`) y **1 pica** (el `3`). El resultado no revela cuáles símbolos produjeron las picas o las fijas.

### Entrar y proteger el usuario

1. Escribe un nombre de al menos 2 caracteres y un PIN de 4 a 8 dígitos.
2. Si el nombre no existe, se registra automáticamente con ese PIN.
3. Si ya existe, se debe introducir el mismo PIN. El nombre identifica al jugador en partidas, historial y ranking.
4. Después de 5 PIN incorrectos, el acceso a ese nombre se bloquea durante 15 minutos.

El PIN de acceso no es el código secreto de una partida. No se debe compartir el PIN; para invitar a alguien se comparte únicamente el código de partida.

### Crear una partida

El creador elige su secreto y estas reglas:

- **Modo:** números del 0 al 9 o colores estilo Mastermind.
- **Colores disponibles:** 4, 6 u 8.
- **Posiciones del secreto:** 3, 4, 5 o 6.
- **Repeticiones:** permitidas o prohibidas. Si están prohibidas, ningún símbolo puede aparecer dos veces en el código o en un intento.
- **Intentos por jugador:** sin límite, 6 o 10.
- **Reloj:** sin límite, **por turno** (30 segundos, 60 segundos o 2 minutos) o **bolsa de tiempo** (3, 5 o 10 minutos por jugador, con incremento opcional de 3, 5 o 10 segundos por jugada). Las dos formas son excluyentes.
- **Visibilidad:** pública, visible en el lobby, o privada, accesible solamente mediante su código.
- **Revelar secretos al terminar:** desactivado inicialmente; si se activa, cada jugador podrá ver el código del rival cuando finalice la partida.

Al crearla se obtiene un código de partida de 4 caracteres y un enlace para compartir. Cada usuario puede mantener como máximo 3 partidas abiertas o activas y debe esperar 10 segundos entre creaciones.

### Unirse y comenzar

El segundo jugador puede elegir una partida pública del lobby, introducir su código o abrir el enlace de invitación. Debe definir un secreto que cumpla las reglas escogidas por el creador. El primer turno se asigna siempre al azar.

En partidas con cronómetro, la cuenta comienza cuando ambos jugadores han entrado y están listos. Hay una breve cortesía técnica antes del inicio del reloj para que las dos pantallas reciban el estado.

### Turnos, intentos y cronómetro

Durante su turno, el jugador envía un código completo. El servidor valida el intento, calcula picas y fijas y pasa el turno al rival.

- Con tiempo ilimitado, la partida puede jugarse de forma asíncrona: se puede volver al lobby y continuar minutos u horas después.
- Con cronómetro **por turno**, al llegar a cero el turno pasa automáticamente al rival.
- Con **bolsa de tiempo**, al llegar a cero se pierde la partida. La partida se cierra con `finish_reason = 'timeout'`.
- El servidor es la autoridad del reloj; alterar la hora o la interfaz del navegador no permite jugar fuera de tiempo.
- Si un jugador vuelve al lobby durante una partida con cronómetro **por turno**, el reloj se detiene hasta que ambos regresen.
- La pausa manual solo está disponible con cronómetro **por turno**, dura como máximo 5 minutos y tiene un minuto de espera antes de poder solicitar otra.
- Solo quien solicitó una pausa manual puede reanudarla antes de su vencimiento.
- **En una partida con bolsa de tiempo no hay ninguna pausa**, ni manual ni al volver al lobby. Es una partida síncrona: los dos jugadores deben estar presentes de principio a fin.

Volver al lobby no cancela ni abandona una partida. El navegador recuerda la partida abierta e intenta recuperarla después de recargar.

### Victoria, empate y último intento

Una partida normal termina cuando alguien obtiene tantas fijas como posiciones tenga el código. Para que ambos jugadores tengan el mismo número de oportunidades se aplica esta regla:

1. Si quien comenzó la ronda descifra el secreto, queda como ganador pendiente.
2. El rival recibe un último intento para igualar.
3. Si también lo descifra, la partida termina en empate.
4. Si falla o se le acaba el tiempo, gana quien acertó primero.
5. Si quien iba segundo en la ronda acierta sin que hubiera un ganador pendiente, gana inmediatamente porque la ronda ya estaba completa.

Cuando existe límite de intentos y ambos jugadores lo agotan sin resolver el código, la partida termina en empate.

### La bolsa de tiempo

Desde 2.5 el reloj tiene una tercera forma, tomada del ajedrez: en lugar de un cronómetro que se reinicia en cada turno, cada jugador recibe una **bolsa** de 3, 5 o 10 minutos y gasta de ella mientras le toca. Quien la agota pierde la partida, sin importar cómo vayan los intentos. Un **incremento** opcional de 3, 5 o 10 segundos se abona al terminar cada jugada, nunca por encima del tamaño inicial de la bolsa.

La aritmética es la misma del cronómetro por turno, con dos diferencias: la reserva es por jugador —`bank1_remaining` y `bank2_remaining`— y `turn_started_at` pasa a significar «cuándo arrancó el reloj de quien juega». **Solo corre el reloj de quien tiene el turno**; el del rival se queda quieto.

**Por eso en modo bolsa no hay pausas, y no es un olvido.** Detener el reloj al volver al lobby permitiría esquivar la caída de bandera para siempre. Y no hace falta ninguna protección: como solo corre el reloj de quien juega, irse mientras no te toca no cuesta nada e irse cuando te toca cuesta tu propio tiempo. En el código sale casi gratis, porque `togglePause` y la pausa por lobby ya estaban condicionadas a `turn_seconds > 0`, que en una partida con bolsa vale 0. El apretón de manos que ya existía —`timer_ready_by`, `timer_activated` y la cortesía de 5 segundos— sirve tal cual para arrancar el reloj cuando las dos pantallas están listas.

**Nadie depende del navegador de quien pierde.** El cliente avisa con `passTurn` cuando cae su propia bandera, pero el rival descubre lo mismo en su consulta periódica, porque `state` vuelve a hacer la cuenta. Si los dos cierran el navegador, la partida se resuelve correctamente al abrirla: todo se calcula sobre sellos de tiempo, no sobre temporizadores vivos.

En pantalla son dos relojes tipo ajedrez sobre la fila de jugadores. El activo descuenta y pasa a ámbar bajo 30 segundos y a rojo bajo 10. Una victoria por tiempo no cuenta para las métricas de eficiencia del historial, igual que una victoria por abandono.

La práctica **contra el computador** también admite bolsa. Ahí solo corre la del jugador: el computador responde al instante y no gasta reloj. En **Solo** no aparece la opción porque su «Tiempo total» ya era exactamente eso.

### Cancelar, abandonar y caducidad

- El creador puede cancelar una partida mientras todavía espera un rival; no se registra victoria ni derrota.
- Abandonar una partida ya iniciada concede la victoria al rival y registra una derrota para quien abandona.
- Una partida que espera rival caduca después de 2 horas y desaparece del lobby.
- Una partida activa se cierra como inactiva después de 48 horas sin actividad; no cuenta como victoria, derrota ni empate.
- Cerrar sesión elimina inmediatamente la presencia del usuario. Para el contador general, se considera conectado a quien tuvo actividad durante los últimos 2 minutos.

### Revancha, historial y ranking

Al finalizar se puede proponer una revancha con las mismas reglas y el mismo rival. Se genera un código nuevo y cada jugador vuelve a escoger su secreto. El rival verá la invitación y podrá entrar mediante **Ir a la revancha**.

El historial muestra hasta las 40 partidas terminadas más recientes del jugador, con resultado, rival, fecha, reglas e intentos realizados. También resume el rendimiento de todo el historial competitivo: partidas, victorias, porcentaje de éxito, promedio de intentos al ganar y rachas. La mejor victoria y la victoria más difícil quedan destacadas; las victorias otorgadas por abandono no participan en esas métricas de eficiencia. La lista se puede filtrar por victorias, derrotas y empates. El ranking global ordena primero por cantidad de victorias y, en caso de igualdad, favorece a quien necesitó menos partidas. Muestra el Top 50, el total de jugadores y la posición propia aunque quede fuera del Top 50.

### Práctica Solo y Contra el computador

Desde el lobby se puede abrir **Practicar** y escoger entre **Solo** o **Contra el computador**. Ambos modos permiten números o colores, entre 3 y 6 posiciones, repeticiones, 4, 6 u 8 colores, límite de intentos y cronómetro —contra el computador, además, bolsa de tiempo—, o una **Partida aleatoria** que combina las reglas. La creación de una partida clásica también ofrece **Partida aleatoria**: combina sus reglas y lleva al jugador a crear su propio código secreto antes de abrir la sala; la visibilidad y la preferencia de revelado escogidas se mantienen.

- El secreto se genera con Web Crypto, permanece oculto durante la partida y siempre se revela al terminar.
- Las partidas de práctica no se envían a la API, no crean filas en D1 y no afectan el historial ni el ranking competitivo.
- El dispositivo conserva localmente el total de prácticas, las resueltas y la racha actual.
- Una práctica sin terminar se guarda automáticamente en el dispositivo. Al volver al lobby aparece **Continuar práctica**; el cronómetro queda pausado mientras la pantalla de práctica no está visible y el guardado se elimina al terminar o descartarlo.
- Durante la práctica se puede **Cancelar** para borrar el progreso sin registrar un resultado, o **Rendirse** para terminar, revelar el código y conservar los intentos visibles para analizarlos.
- En los formularios de crear, unirse y revancha, el botón **🔄** propone un secreto válido según las reglas escogidas.

En **Contra el computador**, el jugador define su propio secreto y el dispositivo genera el secreto rival. El jugador comienza cada ronda y ambos alternan intentos; si el jugador acierta primero, el computador conserva el último intento de la ronda para empatar. Al terminar se revelan los dos códigos. Las estadísticas locales de este modo son independientes de Solo e incluyen partidas, victorias, derrotas, empates y resultados por dificultad.

El rival funciona íntegramente sin conexión y no utiliza ChatGPT ni ninguna API. Solo recibe las reglas y las pistas de sus propios intentos:

- **Fácil:** elige al azar entre combinaciones compatibles con todas las pistas anteriores.
- **Normal:** mantiene y elimina el conjunto completo de combinaciones posibles usando cada resultado de picas y fijas.
- **Experto:** evalúa cómo distintos intentos dividen el conjunto compatible y escoge uno que reduzca estratégicamente el peor grupo restante.

### El buzón de sugerencias

Desde la pantalla de inicio, justo debajo de los créditos, hay un enlace a **Sugerencias y errores**; el lobby lo repite en su pie. Se puede escribir sin haber entrado: es el único endpoint del juego que escribe en D1 sin sesión.

Como se llega antes de elegir idioma, la pantalla **lleva su propio selector de `es/en/fr`**. Es el mismo destino que el del registro: elegir ahí cambia el idioma de toda la aplicación, no solo el del formulario, y el idioma escogido se guarda con el mensaje para saber en qué responder.

Se elige un tipo —idea, error, pregunta u otro—, se escribe un mensaje de 10 a 1000 caracteres y, si se quiere, un contacto para recibir respuesta. El resto se captura solo: idioma, versión de la aplicación, navegador, país e IP —los pone Cloudflare, como en el resto del juego— y el nombre de usuario si había sesión abierta.

**No se envía a un correo y ya está: se guarda en D1 y se tría en `/admin`.** Un correo suelto no tiene estado ni filtro, y cualquier «envío directo» habría metido en el proyecto una API externa y un secreto. La fila es la fuente de verdad; el correo es solo un aviso, y si falla no se pierde nada.

Al ser público, el endpoint necesita barandillas propias. Son cuatro y viven en `src/feedback.js`:

- un **campo trampa** invisible en la pantalla: si viene relleno se responde que todo fue bien y no se guarda nada;
- entre 10 y 1000 caracteres, sin caracteres de control;
- **30 segundos** entre mensajes de la misma IP;
- un máximo de **5 por hora y 15 por día** por IP.

Los tres cortes de tiempo se resuelven con una sola consulta por envío, contando filas por `ip`.

**El aviso por correo usa Cloudflare Email Routing**, que entrega a una dirección ya verificada de la cuenta sin API key ni servicio externo. El Worker declara el binding `FEEDBACK_MAIL` en `wrangler.jsonc` y arma el mensaje MIME a mano —cabeceras y un cuerpo en base64, porque lleva acentos— para no añadir una dependencia a un proyecto que no tiene ninguna. El destino y el remitente **no** están en el repositorio, que es público: viajan como secretos.

```text
wrangler secret put FEEDBACK_TO      # la dirección verificada que recibe el aviso
wrangler secret put FEEDBACK_FROM    # un remitente del dominio, p. ej. buzon@picasyfijas.fans
```

Antes hay que activar **Email Routing** en `picasyfijas.fans` y verificar la dirección de destino en el panel de Cloudflare. Mientras falten el binding o los dos secretos, `notifyFeedback` se retira en silencio y el buzón sigue funcionando: la fila se guarda y se lee en el panel.

### Interfaz y accesibilidad

- La aplicación está disponible en español, inglés y francés.
- Se puede enviar con Enter desde los campos principales, además de usar los botones.
- Las banderas indican el país detectado, pero no afectan las reglas.
- Puede emitir sonido, vibración o una notificación cuando llega el turno o entra un rival, según los permisos del dispositivo.
- Los avisos de victoria, derrota y empate tienen sonidos distintos.
- En modo numérico, el cero se muestra con una barra para diferenciarlo mejor del ocho.

## Arquitectura y archivos

- `public/index.html`: interfaz completa del juego, estilos, traducciones y cliente API.
- `public/manifest.webmanifest`, `public/sw.js`: instalación como PWA y service worker de notificaciones. La lista `screenshots` del manifest **es generada**: la escribe `tools/make-screenshots.mjs`.
- `public/screenshots/`: las capturas que Chrome enseña al ofrecer la instalación. **Son generadas: no se editan a mano.**
- `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`: iconos de la aplicación instalada.
- `public/computer-ai.js`: rival local de práctica, generación de candidatos y estrategias por dificultad.
- `public/admin.html`: panel reservado de administración, en pestañas.
- `public/robots.txt`, `public/sitemap.xml`: indexación. Abren el juego a los buscadores, cierran `/admin` y `/api` y declaran las tres direcciones de idioma.
- `public/rules-es.html`, `public/rules-en.html`, `public/rules-fr.html`: las reglas como página pública. **Son generadas: no se editan a mano.** Salen de `RULES`, en `public/index.html`, con `python tools/make-rules-pages.py`.
- `public/install-es.html`, `public/install-en.html`, `public/install-fr.html`: la guía de instalación como página pública. **Son generadas: no se editan a mano.** Salen de las claves `install_*` y de `INSTALL_ART`, en `public/index.html`, con `python tools/make-install-pages.py`.
- `public/og-es.png`, `public/og-en.png`, `public/og-fr.png`: la tarjeta social de 1200×630 que se ve al compartir el enlace, una por idioma. Se generan con `python tools/make-og-images.py` y necesitan `python -m pip install pillow`.
- `src/index.js`: Worker, rutas, API, acceso a D1 y operaciones administrativas.
- `src/game.js`: reglas puras, validaciones, cronómetro y sanitización del estado.
- `src/security.js`: PIN, autenticación, sesiones, limitación de intentos y lectura del país y la IP que pone Cloudflare.
- `src/admin.js`: herramientas de mantenimiento del panel: ficha de usuario, detección de cuentas repetidas, fusión, borrado, limpieza de partidas y consola SQL.
- `src/feedback.js`: el buzón de sugerencias y errores: validación, barandillas del endpoint público, consultas del panel y el aviso por correo.
- `migrations/0001_initial.sql`: esquema reproducible de D1. No es un residuo de la migración desde Google y no debe eliminarse. Las migraciones siguientes solo añaden: `0002` el chat, `0003` los hilos privados, `0004` el origen de cada cuenta, `0005` el buzón de sugerencias y `0006` la bolsa de tiempo.
- `test/`: pruebas automáticas de reglas, rutas, teclado y regresiones.
- `tools/make-icons.mjs`: genera los cuatro PNG de la aplicación instalada. Se ejecuta con `npm run icons`.
- `tools/make-rules-pages.py`: convierte `RULES` en las tres páginas públicas de reglas. El texto no se duplica: la única fuente sigue siendo el juego.
- `tools/make-install-pages.py`: convierte los pasos de instalación del juego en las tres páginas públicas de la guía. Tampoco duplica nada: lee `I18N` e `INSTALL_ART`.
- `tools/site_style.py`: la piel común de las páginas públicas —colores, tipografías y tarjetas del juego—. La usan los dos generadores anteriores para que no se separen con el tiempo.
- `tools/make-screenshots.mjs`: toma con Chrome sin ventana las capturas del juego real que Chrome enseña al ofrecer instalarlo, y reescribe con ellas la lista `screenshots` del manifest. Necesita el servidor local en marcha. Se ejecuta con `npm run screenshots`.
- `tools/make-og-images.py`: genera las tres tarjetas sociales. Dibuja la marca con las tipografías de reserva que ya declara el CSS del juego —Georgia por 'Instrument Serif', Segoe UI por 'Archivo', Consolas por 'JetBrains Mono'—, así que no descarga ninguna fuente. Solo hay que volver a ejecutarlo si cambia la marca o el lema.
- `tools/pdf/`: los scripts de `reportlab` que generan las guías de estrategia en los tres idiomas. `python tools/pdf/build.py` las genera y las copia a `public/` con los nombres que enlaza la pantalla de reglas. Necesita `python -m pip install reportlab`.
- `wrangler.jsonc`: configuración de Cloudflare, recursos y variables no secretas.
- `index.html`: aviso y redirección desde la dirección histórica de GitHub Pages.

No hay proceso de compilación del frontend. Wrangler sirve `public/` y ejecuta el Worker primero para `/api`, `/admin` y sus subrutas.

## Buscadores e indexación

El juego debe encontrarse buscando su nombre y los nombres con los que se conoce en cada idioma: *Picas y Fijas*, *Bulls and Cows*, *Toros y Vacas*, *Mastermind*, *jeu du taureau*, *jeu de déduction*.

Un buscador solo puede ofrecer la versión correcta de una página si cada idioma tiene su propia dirección. Por eso hay tres:

| Dirección | Idioma | Canónica |
| --- | --- | --- |
| `/` | Español | `/` |
| `/es` | Español | `/` |
| `/en` | Inglés | `/en` |
| `/fr` | Francés | `/fr` |

Las cuatro sirven el mismo `public/index.html`; no hay copias del documento. La tabla `SEO_PAGES` y los textos `SEO_TEXT` viven en `src/index.js`, y `localizeHtml` reescribe al vuelo con `HTMLRewriter` el atributo `lang`, el título, la descripción, la canónica y las etiquetas Open Graph. `/es` existe porque alguien puede escribirla, y su canónica apunta a la raíz para que no cuente como contenido duplicado.

La aplicación adopta el idioma de la dirección: `URL_LANG` en `public/index.html` manda sobre el idioma guardado en `pf_lang`, de modo que quien llega desde un buscador a `/en` ve el juego en inglés. En la raíz sigue mandando la preferencia guardada.

**Y la dirección sigue al idioma que elige el jugador.** Como al cargar manda la dirección, cambiar de idioma sin mover la barra dejaba la página contradiciéndose —el juego en español y la dirección en `/en`— y al recargar volvía a mandar la dirección: la elección se perdía. El selector llama ahora a `syncLangUrl`, que reescribe la barra con `history.replaceState` a `/`, `/en` o `/fr` sin recargar, conservando la búsqueda y el fragmento. Solo toca las direcciones del juego (`LANG_HOMES`); una página pública se queda donde está.

En la cabecera de `public/index.html` están además los `hreflang` de los tres idiomas más `x-default`, las tarjetas Open Graph y Twitter, y un bloque `application/ld+json` de tipo `VideoGame` con los nombres alternativos del juego. La imagen que se ve al compartir el enlace también cambia de idioma: `/en` anuncia `og-en.png` y `/fr`, `og-fr.png`. El `<noscript>` describe el juego en los tres idiomas y enlaza las guías de estrategia: es lo que lee un rastreador que no ejecuta JavaScript.

**La administración no debe aparecer nunca en un buscador, y por eso `robots.txt` no la prohíbe.** Suena al revés de lo que parece lógico. Un buscador solo respeta el `noindex` de una página si puede leerla: prohibirle el rastreo le impide verlo, y la dirección puede acabar listada igual —como URL desnuda, sin título— si la encuentra enlazada desde fuera. Y sí está enlazada desde fuera: el README de este repositorio es público y la nombra. Así que se le deja entrar para que lea el `noindex` y la descarte de verdad. `public/admin.html` lo lleva en el HTML y el Worker añade `X-Robots-Tag: noindex, nofollow` en la respuesta, para quien no parsee el documento. `Disallow: /api` sí se mantiene: la API no devuelve HTML donde poner un `noindex`.

El repositorio es público y no contiene secretos: `.dev.vars` y todo lo sensible está en `.gitignore`. La seguridad no depende de esconder el código ni la dirección del panel, sino de la autenticación y del rol `admin`.

### Las reglas como página pública

El punto débil que quedaba no era técnico sino de contenido: un rastreador que ejecuta el JavaScript solo veía la pantalla de acceso, unas sesenta palabras. Las reglas —unas 360 palabras por idioma, ya escritas y traducidas— vivían dentro de `RULES`, en `public/index.html`, y solo aparecían al pulsar «Cómo se juega», donde ningún buscador las lee.

Ahora tienen dirección propia: `/como-se-juega`, `/en/how-to-play` y `/fr/comment-jouer`. Son páginas estáticas, sin una línea de JavaScript, con la marca del juego y un enlace de vuelta a jugar.

**No se editan a mano.** Las genera `python tools/make-rules-pages.py` leyendo `RULES`, que sigue siendo la única fuente del texto. Si alguien cambia las reglas del juego y no vuelve a generarlas, `test/seo.test.js` falla comparando el texto visible de cada página con su bloque de `RULES`. Al tocar las reglas hay que regenerar y confirmar las tres páginas.

El enlace «Cómo se juega» del juego es un `<a href>` de verdad, para que los buscadores lo sigan, pero conserva su `onclick` y abre el panel de siempre sin navegar. `applyI18n` le cambia el destino con el idioma.

`test/seo.test.js` fija todo esto. Al añadir un idioma hay que tocar `SEO_PAGES`, `SEO_TEXT`, `RULES_PAGES`, `I18N`, `URL_LANG`, `RULES_PAGE_PATH`, los `hreflang` de la cabecera, `PAGES` en `tools/make-rules-pages.py`, `INSTALL_PAGES`, `INSTALL_PAGE_PATH`, las claves `install_*`, `PAGES` en `tools/make-install-pages.py`, `CARDS` en `tools/make-og-images.py`, `sitemap.xml` y `run_worker_first` en `wrangler.jsonc`.

El sitio está dado de alta en Google Search Console como propiedad de dominio y el sitemap fue enviado el 22 de agosto de 2026.

Los enlaces entrantes son la debilidad que queda. El campo *Website* del repositorio y el perfil de LinkedIn apuntan al juego desde el 22 de agosto de 2026, pero **ambos sitios marcan sus enlaces salientes como `nofollow`**, así que no transmiten señal de posicionamiento: sirven para que alguien llegue, no para subir puestos.

**El `robots.txt` de Cloudflare solo es un suplente.** Mientras el proyecto no tuvo el suyo, `https://picasyfijas.fans/robots.txt` devolvía 24 líneas de comentarios de la política de señales de contenido de Cloudflare, sin una sola directiva; fue lo que hizo fallar el primer envío del sitemap. Desde que `public/robots.txt` existe, Cloudflare sirve el nuestro tal cual, sin añadir ni sustituir nada. No hay que desactivar nada en el panel, pero si algún día vuelven a aparecer esos comentarios en vez de nuestras directivas, el culpable es el `robots.txt` gestionado.

## Instalarlo como app

El juego siempre fue instalable —manifest, service worker e iconos están desde el principio—, pero casi nadie lo instalaba: Android esconde «Instalar aplicación» dentro del menú del navegador y el iPhone no lo ofrece nunca. Era la duda más repetida de quien juega desde el móvil.

Las dos plataformas se resuelven de forma distinta, y por eso el código las separa. La tarjeta del lobby (`install-card`) se adapta:

| Situación | Qué ofrece |
| --- | --- |
| Android o escritorio, con Chrome o Edge | Botón **Instalar la app**: abre el diálogo nativo del navegador. Un toque, sin explicaciones |
| iPhone o iPad, con Safari | Botón **Ver cómo se hace**: despliega los tres pasos dibujados (Compartir → Añadir a pantalla de inicio → Añadir) |
| Android sin el evento del navegador (Firefox) | Los mismos tres pasos, con el menú ⋮ |
| Navegador incrustado (Instagram, Facebook, TikTok) o Chrome y Firefox en iOS | Ahí no se puede instalar: botón **Copiar el enlace** y aviso de abrirlo en Safari o en Chrome |
| Ya instalado (`display-mode: standalone`) | Nada. La tarjeta no aparece |

**Android solo instala de un toque si guardamos el evento.** Chrome dispara `beforeinstallprompt` una vez; si nadie lo captura se queda con su aviso mínimo, que casi nadie ve. El juego lo intercepta, lo guarda en `deferredInstall` y lo dispara desde su propio botón. Si el jugador cancela el diálogo, el evento se conserva para poder reintentarlo; `appinstalled` retira la tarjeta.

**En el iPhone no hay ninguna API, y esa carencia es justo el mejor argumento para instalar.** Safari no permite notificaciones a una pestaña normal: los avisos de turno solo existen dentro del juego añadido a la pantalla de inicio. Antes, la tarjeta de notificaciones decía «este navegador no admite notificaciones» y dejaba al jugador en un callejón sin salida; ahora, cuando detecta un iPhone sin instalar, señala la pantalla de inicio (`experience_ios_install`). Es la misma información, convertida en una salida.

La tarjeta se puede descartar con «Ahora no»: guarda la fecha en `pf_install_hide` y no vuelve en 14 días. El enlace discreto del pie de la pantalla de entrada no se descarta nunca —es la puerta para quien todavía no se ha registrado— y solo aparece en un aparato que pueda instalar.

Los dibujos de los pasos son SVG en `INSTALL_ART`, dentro de `public/index.html`: la barra de Safari, la hoja de compartir, el menú ⋮ y el diálogo de confirmación. No son capturas de iOS ni de Android a propósito, porque envejecerían con cada versión del sistema; son formas reconocibles con la paleta del juego.

### La guía de instalación como página pública

Igual que las reglas, los pasos tienen dirección propia: `/instalar`, `/en/install` y `/fr/installer`. Sirven para enlazarlas desde la tarjeta, para pasárselas a quien pregunte y para que un buscador encuentre la pregunta que la gente escribe de verdad («cómo instalar el juego en el iPhone»).

**No se editan a mano.** Las genera `python tools/make-install-pages.py`, que lee del juego las claves `install_*` de `I18N` y los dibujos de `INSTALL_ART`. `test/install.test.js` compara el texto de cada página con esas claves y falla si alguien cambia los pasos y no vuelve a generarlas.

### Las capturas del diálogo de instalación

Con `screenshots` en el manifest, Chrome en Android abandona la barrita mínima y abre el diálogo grande, con imágenes y descripción. Las de `public/screenshots/` son del juego de verdad, no montajes: `node tools/make-screenshots.mjs` levanta Chrome sin ventana, conduce la aplicación por su protocolo de depuración —entra, monta una práctica con tres intentos— y guarda cuatro capturas; después reescribe la lista `screenshots` del manifest con lo que acaba de tomar, para que el manifest nunca hable de una imagen que no existe.

**Necesita el servidor local en marcha.** El script apunta por defecto a `http://127.0.0.1:8788`; `PF_URL` lo cambia y `CHROME_PATH` señala otro navegador.

Chrome descarta las capturas que se salen de sus límites —entre 320 y 3840 px, proporción máxima de 2,3 y la misma forma dentro de cada `form_factor`—, así que `test/install.test.js` los comprueba leyendo la cabecera de los propios PNG.

## Identidad visual

Desde 2.4.0 la aplicación usa la identidad **Mesa**: tablero de madera oscura en lugar del morado anterior. Los colores viven en `:root`, dentro del bloque `<style>` de `public/index.html`.

| Variable | Valor | Uso |
| --- | --- | --- |
| `--ink` | `#12100C` | Fondo de página |
| `--panel` / `--panel-2` | `#231D16` / `#1A150F` | Degradado de las tarjetas |
| `--edge` | `#3B3229` | Bordes |
| `--text` / `--muted` | `#F5EFE3` / `#A3947E` | Texto principal y secundario |
| `--fija` | `#4FC97C` | Fijas |
| `--pica` | `#F0B429` | Picas |
| `--accent` | `#5B8DEF` | Acciones e interactividad |
| `--pink` | `#E0685A` | Errores y avisos |

Reglas que conviene respetar al tocar el diseño:

- El verde y el ámbar son **información del juego**. No se deben usar para decorar; si el fondo compite con ellos, las pistas dejan de leerse.
- Las fichas se distinguen **también por forma**: la fija es un círculo relleno y la pica es un anillo (`.pip.f` y `.pip.p`). Es lo que permite jugar con daltonismo rojo-verde; no se debe reducir a una diferencia de color.
- Tipografías: `Instrument Serif` en los títulos, `Archivo` en la interfaz y `JetBrains Mono` en códigos y cifras. El cero de JetBrains Mono lleva punto interior, que lo separa del 8 y de la O.
- El array `COLORS` del script son las fichas de colores del modo Mastermind. No forma parte de la paleta de la interfaz y no debe repintarse con ella.
- Una sola acción primaria por tarjeta. Lo secundario baja a `.btn.ghost` y lo terciario a `.chipbtn`.
- La frontera es **icono o prosa**: un emoji dentro de una frase (`chat_nudged`, `tiebreak_you`, un `¡Ganaste! 🎉`) es tono y se queda; un emoji que hace de control o de indicador se dibuja. Ojo con los que el JavaScript reescribe: el botón de silenciados llevaba su icono en el marcado y `updateChatLabels` se lo borraba en cada refresco poniendo el emoji de vuelta. Si un elemento se repinta desde el script, el icono tiene que salir de `ico()` ahí también, no solo de `data-ico`.
- **Nada de emoji ni de glifos Unicode como icono.** Vienen de bloques distintos, pesan distinto y cada sistema los dibuja a su manera; algunos se pintan en color y arruinan la ficha que los contiene. Todos los iconos viven en la constante `ICONS` de `public/index.html` y se piden con `ico(nombre, tamaño)`. Los botones estáticos llevan `data-ico` y los rellena `pintarIconos()` desde `applyI18n`, así que no hay trazados repetidos entre el marcado y el script.
- Las ocho fichas del modo colores se distinguen **por forma**, no solo por color: es lo que permite leer un código con daltonismo o en una pantalla mala. Están en `SYMBOL_D`, dibujadas sobre una rejilla de 24 e **igualadas por área de tinta**, no por caja: seis rondan las 176 px² y los dos triángulos se quedan en el 83 %, que es la compensación óptica habitual para que no parezcan más grandes. Si se añade o cambia una forma hay que volver a igualarla; medir la caja no sirve.
- La marca es una cabeza de toro, por *Bulls and Cows*. Los mismos trazados viven en **tres** sitios: el logo de la cabecera y la constante `TORO_HEAD` del script, ambos en `public/index.html`, y el generador `tools/make-icons.mjs`. Si cambia la marca hay que cambiarla en los tres y volver a ejecutar `npm run icons`.
- `tools/make-icons.mjs` no tiene dependencias: rasteriza y escribe el PNG por su cuenta porque la máquina de desarrollo no tenía ninguna herramienta de imagen instalada. Si algún día se añade `sharp` o `resvg`, ese archivo se puede sustituir por una llamada a esa herramienta sin tocar nada más.
- Cada cambio de texto se debe revisar en español, inglés y francés a 375 px de ancho. El francés es el idioma más largo y es el primero que desborda los controles estrechos.
- El texto de las guías perdió todas las tildes en algún momento y se restauró en 2.4.0. No era una limitación de la fuente: Helvetica en `reportlab` dibuja `é è ê ç ñ` y el apóstrofo tipográfico `’` sin problema. En francés se usa `’`, no la comilla recta, porque la recta rompería los literales de Python entre comillas simples.
- `create_strategy_translations.py` guarda **dos idiomas en el mismo diccionario**: inglés y francés. Cualquier cambio masivo debe limitarse al bloque que toca, porque hay palabras que existen en los dos (`Deduction`, `Decision`) y acentuar el inglés lo estropea. Las claves del diccionario y los nombres de archivo tampoco se tocan.
- Las guías en PDF llevan la paleta Mesa, pero **sobre papel claro**: son para descargar e imprimir, y un tablero oscuro a sangre se bebe la tinta. Sus acentos se oscurecen respecto a los de la pantalla para que un filete de 1 pt se lea impreso. Los colores viven en las constantes de `tools/pdf/`; si cambia la paleta hay que repintarlos y volver a ejecutar `build.py`.
- Los elementos con `data-i18n` reciben `textContent` al traducir, así que un SVG dentro de ellos se borraría al cambiar de idioma. **No es un impedimento para poner iconos**: se envuelve la etiqueta en su propio `<span data-i18n>` y el icono queda como hermano, fuera del alcance del traductor.

  ```html
  <button class="btn" onclick="show('create')">
    <svg …></svg><span data-i18n="lobby_create">Crear partida</span>
  </button>
  ```

- **Nada de `flex:1` en filas de botones con texto traducido.** Fuerza anchos iguales ignorando el contenido, y la etiqueta más larga se desborda; fue lo que sacaba «Illimité» del control segmentado en francés. Con `flex:1 1 auto` cada botón parte de su propio texto y la fila envuelve si no cabe.

### La mascota

El toro no es solo el logo: también es la mascota que reacciona al estado de la partida. Se dibuja desde JavaScript con `toroSVG(cara, ancho, chispas)` porque tiene que poder entrar en sitios que se pintan con `innerHTML`, como el banner de fin de partida.

| Cara | Dónde aparece |
| --- | --- |
| `calm` | Saludo del lobby, banner de empate |
| `alert` | Barra de turno, solo cuando te toca a ti |
| `happy` | Banner de victoria, con chispas alrededor |
| `sad` | Banner de derrota, sin chispas |

Dos detalles que conviene no deshacer:

- En la barra de turno el toro lo muestra y lo esconde **el CSS**, no el JavaScript: aparece con `.turnbar.mine` y desaparece en cuanto la clase cambia. No hace falta tocarlo al renderizar el turno.
- Las clases internas del SVG se llaman `t-fill`, `t-line` y `t-dot`, y no `dot` a secas, porque dentro de la barra de turno `.turnbar .dot` es el punto que parpadea y le habría aplicado la animación a los ojos del toro.

`ruleSVG(ancho)` dibuja el subrayado a dos pasadas que va bajo el saludo y bajo el resultado.

### Volver al lobby desde la marca

El logo es un `<button>` (`#brand-home`) que lleva al lobby, pero solo desde las pantallas de consulta que enumera `BRAND_HOME_FROM`: historial, ranking, reglas, crear, unirse y configuración de práctica. El buzón de sugerencias queda fuera a propósito: se abre también desde la pantalla de inicio, donde todavía no hay sesión ni lobby al que volver; su botón **Volver** recuerda de dónde se entró. Desde una partida o una práctica en curso queda inerte a propósito, porque saltar al lobby se saltaría el flujo que guarda o abandona y le costaría el progreso al jugador. `test/keyboard.test.js` fija las dos mitades de esa regla.

## Modelo de datos

- `users`: identidad, hash y sal del PIN, rol, bloqueo y el origen de la cuenta: país e IP del alta, país e IP de la última entrada y número de entradas.
- `sessions`: sesiones temporales; el PIN no viaja durante las consultas periódicas. Cada sesión guarda la IP y el país desde los que se abrió.
- `games`: estado completo, opciones, cronómetro y versión de concurrencia.
- `presence`: usuario conectado y ubicación en lobby o partida.
- `request_receipts`: respuestas de jugadas ya procesadas para evitar duplicados.
- `audit_log`: acciones administrativas.
- `chat_messages`: chat mundial del lobby, chat privado de partida, eventos y zumbidos.
- `chat_reports`: reportes de moderación, únicos por mensaje y usuario.
- `chat_mutes`: silencios temporales o permanentes impuestos por administración.
- `feedback`: el buzón de sugerencias y errores, con su estado de triaje y la nota interna de administración.

Las columnas de la bolsa de tiempo viven en `games` y conviven con el cronómetro por turno de siempre: `time_mode` (`turn` o `bank`) decide cuál manda, y `bank_seconds`, `bank_increment`, `bank1_remaining` y `bank2_remaining` describen el reloj de cada jugador. `time_mode` vale `turn` por omisión, así que las partidas anteriores no cambian de comportamiento. Los dos relojes son excluyentes por construcción: `gameInsertValues` deja en cero el que no se eligió, y por eso la validación solo comprueba los valores de la bolsa.

El país y la IP no los declara el navegador: los pone Cloudflare delante del Worker (`request.cf.country` y `CF-Connecting-IP`, en `requestOrigin`). Se escriben solo al entrar —una escritura por sesión, no por petición— y su único uso es administrativo. El país que enseña la bandera de una partida sigue siendo el que averigua el navegador; son dos datos distintos y no se mezclan.

Los secretos de jugadores nunca deben exponerse mientras una partida esté activa. Toda nueva respuesta API debe pasar por la sanitización correspondiente.

El chat del lobby conserva 24 horas. El chat de partida es exclusivo de sus dos jugadores, se cierra 24 horas después de terminar y conserva sus filas durante 7 días. La limpieza es progresiva al usar el chat. Los zumbidos requieren que el rival esté presente en la partida y tienen 30 segundos de espera por emisor.

## La administración

El panel vive en `/admin`, no está enlazado desde el juego, no se indexa y necesita una cuenta con rol `admin`. Se organiza en pestañas y cada una pide sus datos la primera vez que se abre, para no gastar lecturas de D1 en lo que nadie mira.

El toro azul de la esquina superior cierra el panel en ese navegador y devuelve al juego. Son dos sesiones distintas —`pf_admin_session` y `pf_session`—, así que salir de la administración no expulsa a nadie de su partida.

| Pestaña | Qué resuelve |
| --- | --- |
| Resumen | Usuarios, gente en línea, altas y activos de la semana, partidas y mensajes del día, moderación pendiente y los países de donde entra la gente. |
| Usuarios | La lista completa con país, última IP, partidas y mensajes. Bloquear, cambiar el PIN, dar o quitar el rol `admin`, cerrar sesiones, reactivar el chat, borrar y fusionar. Arriba, las cuentas que parecen repetidas. |
| Partidas | Las últimas 200, con filtro, y el cierre de las que siguen abiertas. |
| Conversaciones | Una fila por chat, no un río de mensajes: quiénes hablan, cuántos mensajes, cuántos zumbidos y cuántos reportes. El histórico se abre aparte, en su propia ventana. |
| Moderación | Los reportes del chat, con borrar y silenciar a mano. |
| Feedback | Las sugerencias y los errores que llegan del juego. Filtro por estado y por tipo, cambio de estado desde la propia fila, nota interna y borrado. |
| Mantenimiento | Limpieza de partidas por estado y antigüedad, y la consola SQL. |
| Auditoría | Todo lo que la administración ha cambiado, con fecha, objetivo y detalle. |

### Cuentas repetidas y fusión

Quien olvida su PIN no escribe a nadie: vuelve a entrar con el mismo nombre y un número detrás. Por eso el panel agrupa las cuentas por dos pistas independientes —la misma última IP y la misma raíz del nombre, que ignora acentos, dígitos y signos— y las enseña con su motivo. Ninguna de las dos es una prueba: una IP compartida puede ser una casa o un móvil, y dos nombres parecidos pueden ser dos personas.

Fusionar arrastra a la cuenta de destino las partidas, los mensajes, los reportes y las conversaciones de la de origen, y borra la de origen. El PIN que sobrevive es el del destino. La parte delicada son los hilos: `chat_threads` solo admite un hilo por pareja, así que cuando la fusión crea una pareja que ya existe los mensajes se mudan al hilo superviviente y el vacío se retira; un hilo de la cuenta consigo misma desaparece. No se puede absorber al administrador principal ni a una cuenta con rol `admin`, y no hay vuelta atrás: conviene exportar una copia antes.

### La consola SQL

Existe para las reparaciones que ninguna pantalla previó. Tiene tres barandillas, que no protegen de un administrador decidido —para eso está la confirmación— sino de los tres accidentes reales:

- una sola instrucción por ejecución, para que un `;` de más no arrastre un segundo comando;
- ni `CREATE`, ni `ALTER`, ni `DROP`, ni `PRAGMA`: el esquema solo se cambia con una migración numerada;
- ni `UPDATE` ni `DELETE` sin `WHERE`.

Las lecturas salen directas y se cortan a 200 filas. Los cambios se ejecutan en dos pasos —el servidor devuelve la instrucción sin tocarla y espera la confirmación— y quedan siempre en `audit_log`. La limpieza de partidas funciona igual: primero cuenta, después borra.

## Reglas técnicas que no se deben romper

Cada partida tiene una columna `version`. Las modificaciones usan actualización condicional y reintentos para que dos peticiones simultáneas no sobrescriban el mismo estado.

Las jugadas incluyen `requestId`. Si el navegador repite una petición por pérdida de conexión, el servidor debe devolver el resultado guardado, no insertar una segunda jugada.

El servidor es la autoridad sobre turnos y temporizadores. El navegador muestra una cuenta regresiva basada en el estado recibido, pero no decide por sí solo el resultado. Una petición recibida tras expirar el turno debe ser rechazada y provocar la transición válida del servidor. Con bolsa de tiempo eso significa cerrar la partida: `passTurn` no pasa el turno, vuelve a hacer la cuenta y, si la bandera cayó de verdad, entrega la victoria al rival.

El buzón de sugerencias es el único endpoint que escribe en D1 sin sesión. Cualquier cambio en él debe conservar sus cuatro barandillas —campo trampa, longitud, espera entre mensajes y tope por hora y por día—, porque son lo único que lo separa de un grifo abierto.

La administración no está enlazada desde el juego. Requiere una cuenta con rol `admin`, y toda acción que cambie algo queda en `audit_log`. Un jugador sin ese rol recibe siempre un error, tenga o no sesión válida.

## Desarrollo local

Requisitos: Node.js 20 o posterior y pnpm.

```text
pnpm install
pnpm run db:local
pnpm run dev
```

La aplicación queda normalmente en `http://localhost:8787` y el panel en `http://localhost:8787/admin`.

Comandos disponibles:

```text
pnpm test       # todas las pruebas
pnpm run check  # sintaxis y pruebas
pnpm run deploy # despliegue manual excepcional
pnpm run pages       # regenera las paginas de reglas y de instalacion
pnpm run screenshots # rehace las capturas del manifest (con el servidor en marcha)
pnpm run db:local
pnpm run db:remote
```

Antes de terminar cualquier cambio se debe ejecutar `pnpm run check`. Si cambia una regla, una ruta o una interacción crítica, se debe añadir o actualizar una prueba.

## Base de datos y despliegue

Para una instalación nueva, se crea la base D1, se coloca su identificador en `wrangler.jsonc` y se aplica el esquema:

```text
pnpm install
pnpm run db:remote
pnpm run deploy
```

Una modificación futura del esquema debe añadirse como una migración numerada nueva; nunca se debe reescribir `0001_initial.sql` después de que una base dependa de ella.

**El orden importa cuando un cambio trae migración.** Cloudflare despliega solo al recibir `main`, así que la migración debe aplicarse antes de empujar:

```text
pnpm run db:remote
git push origin main
```

La 2.5 trae dos migraciones nuevas, `0005_feedback.sql` y `0006_time_bank.sql`, así que le aplica esta misma regla. El aviso por correo del buzón necesita además, una sola vez, activar Email Routing en el dominio y colocar sus dos secretos:

```text
wrangler secret put FEEDBACK_TO
wrangler secret put FEEDBACK_FROM
```

Al revés, el Worker nuevo llegaría a una base sin las columnas que espera y cualquier entrada fallaría hasta que la migración se aplicara. Al derecho no hay ventana rota: las columnas nuevas siempre se añaden con valor por omisión, así que el Worker anterior las ignora sin enterarse.

El plan gratuito de D1 incluye por cuenta 5 millones de filas leídas al día, 100.000 filas escritas al día y 5 GB de almacenamiento. Las cuotas diarias se reinician a las 00:00 UTC. Los índices reducen lecturas, pero actualizar una columna indexada puede sumar escrituras adicionales. Antes de aumentar el tráfico se deben revisar las métricas de D1, la frecuencia de consultas y el polling.

## Seguridad y archivos locales

Nunca se deben subir a GitHub:

- `.dev.vars`, `.env`, claves, tokens o credenciales;
- Excel, CSV, exportaciones o copias de seguridad;
- SQL con datos reales;
- `.private/`, `.wrangler/`, `dist/`, cachés o perfiles de rendimiento.

Estas exclusiones están definidas en `.gitignore`. Los PIN se almacenan con hash SHA-256 y una sal individual. No se deben registrar PIN, tokens de sesión, secretos de partida ni contenido privado en logs o documentación.

El contacto que alguien deja en el buzón de sugerencias es un dato personal y recibe el mismo trato que la IP: se guarda para poder responder, solo se ve dentro de `/admin`, no aparece en ninguna respuesta del juego y sí va en la exportación, que pasó a `schemaVersion: 3` al incluir el buzón.

La IP y el país de cada cuenta son datos personales. Se guardan porque sin ellos no hay forma de reconocer a quien vuelve con otro nombre tras olvidar su PIN, y por eso solo se ven dentro de `/admin`: no aparecen en ninguna respuesta del juego, no viajan al navegador de ningún jugador y no se escriben en logs. Sí van en la exportación, que por lo tanto es un archivo con datos personales y nunca debe subirse al repositorio.

## Procedimiento para futuras modificaciones

1. Leer este documento y revisar `git status` para no sobrescribir trabajo pendiente.
2. Identificar las reglas y contratos afectados antes de editar.
3. Hacer el cambio más pequeño que resuelva el problema.
4. Ejecutar `pnpm run check` y añadir pruebas de regresión cuando corresponda.
5. Revisar que no se filtren datos privados ni secretos.
6. Actualizar este documento si cambian arquitectura, operación, rutas, límites o decisiones duraderas.
7. Confirmar los cambios en Git y enviar `main`; comprobar después el despliegue automático.

No se deben borrar datos, ejecutar importaciones, alterar producción, cambiar roles o publicar secretos sin autorización explícita del propietario.

## Recuperación

El código anterior de Google Apps Script, la documentación de migración y sus instrucciones siguen accesibles en el historial anterior al commit de limpieza. No forman parte del sistema vigente y no deben restaurarse al árbol principal salvo una decisión consciente.

Para recuperar D1 se debe usar una exportación confiable o Time Travel de Cloudflare, verificar primero el alcance y conservar una copia antes de sobrescribir datos. Una recuperación nunca debe improvisarse directamente sobre producción.

## Capacidad prevista y mejoras

La aplicación fue concebida inicialmente para menos de 20 conexiones simultáneas y preparada para crecer aproximadamente a 100 después de medir consumo. Actualmente usa consultas periódicas; si el tráfico aumenta, una evolución posible es WebSockets o coordinación con Durable Objects. Esa decisión requiere mediciones reales y no debe introducirse solo por anticipación.

Toda nueva tarea debe tratar este archivo como fuente principal de contexto. Cuando el código y este documento discrepen, se debe verificar el comportamiento con pruebas y corregir la documentación en el mismo cambio.
