# Picas y Fijas — documento maestro

Este es el único documento de referencia del proyecto. Está pensado para personas y asistentes de IA: antes de modificar, desplegar o diagnosticar la aplicación, se debe leer completo y mantenerlo actualizado cuando cambie la arquitectura, la operación o una decisión importante.

## Estado actual

Picas y Fijas es un juego multijugador web en español, inglés y francés. La versión vigente funciona íntegramente en Cloudflare; la implementación anterior de Google Sheets y Apps Script fue retirada del árbol actual después de completar la migración. Sigue disponible en el historial de Git si alguna vez se necesita consultar.

Versión actual: **3.7.0**: la etapa 2 del camino a la 4.0.0 abre la cadencia por correspondencia, con uno o tres días por jugada y sin pausa al cerrar el juego, y hace que el turno llegue mediante Web Push aunque la pestaña esté cerrada. Si no hay una suscripción push válida, las partidas por correspondencia recurren al correo verificado; `guess`, `passTurn` y el Cron comparten una deduplicación que impide avisar dos veces del mismo turno. Las invitaciones privadas esperan 48 horas y el mantenimiento ya no cierra una partida por correspondencia por llevar 48 horas sin actividad. La 3.6.2 hizo que la primera visita abriera en el idioma del navegador cuando era inglés o francés, sin pulsar nada; la dirección sigue mandando sobre todo y una elección hecha a mano manda sobre el navegador. La 3.6.1 subió el selector de idioma a lo alto de la pantalla de acceso y se ve en los tres modos —entrar, crear cuenta y recuperar el PIN—. La 3.6.0 cerró la etapa 1: una invitación sobrevive al alta y a la verificación en otro aparato. La 3.5.3 puso el pulso numérico en la portada y la 3.5.2 abrió la práctica sin cuenta. La 3.5.1 corrigió la inyección por nombres, unificó el contador de PIN, protegió el arranque de la bolsa, cerró ranking y lista pública detrás del correo y arregló las revanchas simultáneas. En la 3.5.0, `/admin` pasó a enseñar las horas en la zona de quien las mira y permitió cambiar el nombre sin cambiar el correo. En la 3.3.3, el cronómetro Solo pasó a reiniciarse por intento. La 3.2.0 añadió el acuerdo de versión entre página y servidor. La 3.0.0 separó definitivamente entrar de crear una cuenta y la 3.1.0 fijó la puerta del correo: **no hay cuenta que valga sin correo verificado**.

El 12 de septiembre de 2026 la base de producción se vació a propósito: quedó una sola cuenta, `Diego`, y se borraron partidas, chat, presencia, buzón y todas las sesiones. El motivo es el mismo: arrancar sin ninguna cuenta que no cumpla la regla nueva.

El trabajo en curso está en «El camino a la 4.0.0»: dieciocho mejoras repartidas en seis etapas y un cierre, ordenadas por lo que cambian para quien llega por primera vez y se encuentra el vestíbulo vacío.

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

La pantalla de acceso tiene tres caras que nunca se ven a la vez —entrar, crear cuenta y recuperar el PIN— y entra por la primera, porque es lo que hace casi todo el mundo casi siempre.

1. **Entrar** pide el nombre *o* el correo y el PIN. Cinco PIN incorrectos seguidos bloquean **la cuenta** durante 15 minutos, se haya escrito el nombre o el correo: los dos comparten un mismo contador (`login_attempts`, clave `user:<id>`). Los formularios de **Mi cuenta** que piden el PIN actual —cambiar el PIN o el nombre— cuentan en ese mismo contador, para que una sesión robada no pueda probar PIN sin límite.
2. **Crear cuenta** pide correo, nombre visible y PIN repetido. El nombre no puede llevar comillas, `<`, `>`, `&` ni barras invertidas. La cuenta nace inactiva: hasta que no se abre el enlace que llega por correo —válido 3 días— no se puede entrar con ella. Una cuenta que no se activa en 30 días la borra el mantenimiento horario.
3. **¿Olvidaste tu PIN?** pide el correo y manda un enlace de un solo uso que caduca en 15 minutos. La respuesta es siempre la misma, exista o no la cuenta, para no delatar qué direcciones están registradas.
4. La primera entrada de verdad —la que sigue a la activación— enseña una vez en el lobby el recordatorio de que ese PIN hará falta la próxima vez.

**Entrar nunca crea una cuenta.** Es una regla, no un detalle de implementación: una cuenta creada al vuelo con un nombre suelto nacería sin correo y, por tanto, sin ninguna forma de recuperar su PIN. `loginUser` con un nombre o un correo desconocido responde con un error que invita a crear la cuenta; el alta pasa siempre por `registerUser`, que exige correo. La portada puede leer `publicPulse` sin sesión, pero solo recibe dos agregados numéricos —personas conectadas y partidas activas— con un máximo de una consulta cada 30 segundos por isolate.

**Y ninguna cuenta juega sin correo verificado.** No hay excepción para las cuentas antiguas: si `email_verified_at` está vacío, la sesión nace a medias y lo único que se puede hacer con ella es mirar la propia ficha y pedir el enlace de verificación. Todo lo demás —crear una partida, unirse, el chat, el ranking, la lista de partidas públicas, `/admin`— responde `403` con el código `email_pending`. Sin sesión, el ranking y la lista responden `401`: hasta la 3.5.0 se servían a cualquiera, porque no figuraban en `PROTECTED`.

Entrar no se rechaza, y la razón es práctica: para pedir el enlace hace falta una sesión, y quien nunca declaró un correo no tendría por dónde empezar. Lo que se corta es lo que viene después.

Los tres paneles son `<form>` de verdad, con `autocomplete` correcto en cada campo: Enter envía sin código propio y el gestor de contraseñas ofrece guardar la pareja. Lo mismo vale para **Mi cuenta**, donde el nombre, el correo —solo lectura una vez verificado— y el cambio de PIN son formularios separados con su propio mensaje, y para el acceso de `/admin`.

En toda la interfaz se le llama **contraseña**, no PIN: la palabra «PIN» invitaba a confundirla con el código de la partida. No se debe compartir; para invitar a alguien se comparte únicamente el código de partida.

### Crear una partida

El creador elige su secreto y estas reglas:

- **Modo:** números del 0 al 9 o colores estilo Mastermind.
- **Colores disponibles:** 4, 6 u 8.
- **Posiciones del secreto:** 3, 4, 5 o 6.
- **Repeticiones:** permitidas o prohibidas. Si están prohibidas, ningún símbolo puede aparecer dos veces en el código o en un intento.
- **Intentos por jugador:** sin límite, 6 o 10.
- **Reloj:** sin límite, **por turno** (30 segundos, 60 segundos o 2 minutos), **bolsa de tiempo** (3, 5 o 10 minutos por jugador, con incremento opcional de 3, 5 o 10 segundos por jugada) o **correspondencia** (1 o 3 días por jugada). Las formas son excluyentes.
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
- En **correspondencia**, al llegar a cero se registra el intento perdido y el turno pasa al rival. El plazo sigue corriendo aunque una o las dos personas cierren el juego.
- El servidor es la autoridad del reloj; alterar la hora o la interfaz del navegador no permite jugar fuera de tiempo.
- Si un jugador vuelve al lobby durante una partida con cronómetro **por turno**, el reloj se detiene hasta que ambos regresen.
- La pausa manual solo está disponible con cronómetro **por turno**, dura como máximo 5 minutos y tiene un minuto de espera antes de poder solicitar otra.
- Solo quien solicitó una pausa manual puede reanudarla antes de su vencimiento.
- **En una partida con bolsa de tiempo no hay ninguna pausa**, ni manual ni al volver al lobby. Es una partida síncrona: los dos jugadores deben estar presentes de principio a fin.
- **En correspondencia tampoco hay pausa**: detener el reloj al cerrar la pestaña permitiría conservar un turno para siempre.

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

La práctica **contra el computador** también admite bolsa. Ahí solo corre la del jugador: el computador responde al instante y no gasta reloj. En **Solo** no aparece la bolsa: su reloj es siempre tiempo por intento y se reinicia después de cada propuesta o intento perdido.

### Cancelar, abandonar y caducidad

- El creador puede cancelar una partida mientras todavía espera un rival; no se registra victoria ni derrota.
- Abandonar una partida ya iniciada concede la victoria al rival y registra una derrota para quien abandona.
- Una partida pública que espera rival caduca después de 2 horas; una invitación privada espera 48 horas.
- Una partida activa normal se cierra como inactiva después de 48 horas sin actividad; una partida por correspondencia queda fuera de ese barrido y la gobierna su plazo por jugada.
- Cerrar sesión elimina inmediatamente la presencia del usuario. Para el contador general, se considera conectado a quien tuvo actividad durante los últimos 2 minutos.

### Revancha, historial y ranking

Al finalizar se puede proponer una revancha con las mismas reglas y el mismo rival. Se genera un código nuevo y cada jugador vuelve a escoger su secreto. El rival verá la invitación y podrá entrar mediante **Ir a la revancha**.

El historial muestra hasta las 40 partidas terminadas más recientes del jugador, con resultado, rival, fecha, reglas e intentos realizados. También resume el rendimiento de todo el historial competitivo: partidas, victorias, porcentaje de éxito, promedio de intentos al ganar y rachas. La mejor victoria y la victoria más difícil quedan destacadas; las victorias otorgadas por abandono no participan en esas métricas de eficiencia. La lista se puede filtrar por victorias, derrotas y empates. El ranking global ordena primero por cantidad de victorias y, en caso de igualdad, favorece a quien necesitó menos partidas. Muestra el Top 50, el total de jugadores y la posición propia aunque quede fuera del Top 50.

### Práctica Solo y Contra el computador

La práctica se alcanza por dos puertas. Desde el lobby, **Practicar**. Y desde la portada, sin cuenta: **«Probar ahora»** arranca en el acto una práctica Solo de tres cifras, sin repetidos y sin reloj —cambiar las reglas sigue a un toque—, para que nadie tenga que registrarse antes de saber si el juego le gusta. Un invitado no es una cuenta: mientras no haya sesión solo existen cinco pantallas (portada, práctica, partida de práctica, reglas y buzón) y `show()` devuelve a la portada cualquier otra. Al terminar la práctica aparece la invitación a crear la cuenta, y si sale antes de acabar, la práctica queda guardada en el dispositivo y la portada ofrece **Continuar práctica**. `test/guest-practice.test.js` fija las tres cosas: las pantallas públicas, que nada de ese camino llama al API y que la invitación solo se enseña al final.

Desde el lobby se puede abrir **Practicar** y escoger entre **Solo** o **Contra el computador**. Ambos modos permiten números o colores, entre 3 y 6 posiciones, repeticiones, 4, 6 u 8 colores, límite de intentos y cronómetro —contra el computador, además, bolsa de tiempo—, o una **Partida aleatoria** que combina las reglas. La creación de una partida clásica también ofrece **Partida aleatoria**: combina sus reglas y lleva al jugador a crear su propio código secreto antes de abrir la sala; la visibilidad y la preferencia de revelado escogidas se mantienen.

- El secreto se genera con Web Crypto, permanece oculto durante la partida y siempre se revela al terminar.
- Las partidas de práctica no se envían a la API, no crean filas en D1 y no afectan el historial ni el ranking competitivo.
- El dispositivo conserva localmente el total de prácticas, las resueltas y la racha actual.
- En Solo, el tiempo elegido corresponde a cada intento. Si llega a cero, se registra un intento perdido y empieza un cronómetro nuevo; la práctica solo termina al agotar el límite de intentos. En una partida real con tiempo por turno se aplica la misma regla, pero el turno pasa además al rival. La bolsa de tiempo sigue siendo distinta: agotarla hace perder la partida.
- Una práctica sin terminar se guarda automáticamente en el dispositivo. Al volver al lobby aparece **Continuar práctica**; el cronómetro queda pausado mientras la pantalla de práctica no está visible y el guardado se elimina al terminar o descartarlo.
- Durante la práctica se puede **Cancelar** para borrar el progreso sin registrar un resultado, o **Rendirse** para terminar, revelar el código y conservar los intentos visibles para analizarlos.
- En los formularios de crear, unirse y revancha, el botón **🔄** propone un secreto válido según las reglas escogidas.

En **Contra el computador**, el jugador define su propio secreto y el dispositivo genera el secreto rival. El jugador comienza cada ronda y ambos alternan intentos; si el jugador acierta primero, el computador conserva el último intento de la ronda para empatar. Al terminar se revelan los dos códigos. Las estadísticas locales de este modo son independientes de Solo e incluyen partidas, victorias, derrotas, empates y resultados por dificultad.

El rival funciona íntegramente sin conexión y no utiliza ChatGPT ni ninguna API. Solo recibe las reglas y las pistas de sus propios intentos:

- **Fácil:** elige al azar entre combinaciones compatibles con todas las pistas anteriores.
- **Normal:** mantiene y elimina el conjunto completo de combinaciones posibles usando cada resultado de picas y fijas.
- **Experto:** evalúa cómo distintos intentos dividen el conjunto compatible y escoge uno que reduzca estratégicamente el peor grupo restante.

### El buzón de sugerencias

Desde la pantalla de inicio, justo debajo de los créditos, hay un enlace a **Sugerencias y errores**; el lobby lo repite en su pie. Se puede escribir sin haber entrado: es el único endpoint del juego que **escribe** en D1 sin sesión —`loginUser` y `checkUsername` también responden sin sesión, pero el segundo solo lee—.

Como se llega antes de elegir idioma, la pantalla **lleva su propio selector de `es/en/fr`**. Es el mismo destino que el del registro: elegir ahí cambia el idioma de toda la aplicación, no solo el del formulario, y el idioma escogido se guarda con el mensaje para saber en qué responder.

Se elige un tipo —idea, error, pregunta u otro—, se escribe un mensaje de 10 a 1000 caracteres y, si se quiere, un contacto para recibir respuesta. El resto se captura solo: idioma, versión de la aplicación, navegador, país e IP —los pone Cloudflare, como en el resto del juego— y el nombre de usuario si había sesión abierta.

**No se envía a un correo y ya está: se guarda en D1 y se tría en `/admin`.** Un correo suelto no tiene estado ni filtro, y cualquier «envío directo» habría metido en el proyecto una API externa y un secreto. La fila es la fuente de verdad; el correo es solo un aviso, y si falla no se pierde nada.

**Responder se hace desde el panel.** El botón **Responder** de cada fila abre un diálogo con el borrador hecho —asunto, un hueco para escribir, la firma y el mensaje original citado con su fecha—, redactado en el idioma en el que escribió la persona. Al aceptarlo, `adminReplyFeedback` lo envía con **Cloudflare Email Sending** (binding `EMAIL`, remitente `noreply@mail.picasyfijas.fans`, el mismo de los correos de verificación), guarda el texto en `feedback_replies`, marca el mensaje como hecho y deja una línea en la auditoría. Cambiar el estado de un mensaje, en cambio, no envía nada nunca.

Hay dos mecanismos de correo y no se mezclan: **Email Routing** (`FEEDBACK_MAIL`) solo entrega a direcciones ya verificadas de la cuenta y sirve para el aviso al administrador; **Email Sending** (`EMAIL`) escribe a cualquier dirección y lleva los enlaces de verificación, de recuperación y las respuestas del buzón.

El contacto es texto libre a propósito —mucha gente deja su nombre de jugador en vez de un correo—, así que el botón se apaga cuando no hay a dónde escribir y su título dice por qué. Quién tiene dirección y quién no lo decide `replyAddress` en `src/feedback.js`, no el marcado del panel, para poder probarlo.

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
- El idioma se puede cambiar en cualquier momento desde el cuadrado de la cabecera.
- La entrada tiene dos pasos: primero el nombre, después la contraseña con las palabras del caso.
- Se puede enviar con Enter desde los campos principales, además de usar los botones.
- Las banderas indican el país detectado, pero no afectan las reglas.
- Puede emitir sonido, vibración o una notificación cuando llega el turno o entra un rival, según los permisos del dispositivo.
- Los avisos de victoria, derrota y empate tienen sonidos distintos.
- En modo numérico, el cero se muestra con una barra para diferenciarlo mejor del ocho.

## Arquitectura y archivos

- `public/index.html`: interfaz completa del juego, estilos, traducciones y cliente API.
- `public/manifest.webmanifest`, `public/sw.js`: instalación como PWA y service worker. Recibe el payload Web Push, enseña el aviso traducido y abre la partida exacta al pulsarlo. La lista `screenshots` del manifest **es generada**: la escribe `tools/make-screenshots.mjs`.
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
- `src/chat.js`: permisos, hilos privados, mensajes incrementales y retención del chat.
- `src/maintenance.js`: mantenimiento horario fuera del camino crítico de las peticiones.
- `src/push.js`: suscripciones y avisos de turno. Firma VAPID y cifra `aes128gcm` con Web Crypto, sin dependencias; si una correspondencia no tiene push válido, usa el correo verificado.
- `src/admin.js`: herramientas de mantenimiento del panel: ficha de usuario, detección de cuentas repetidas, fusión, borrado, limpieza de partidas y consola SQL.
- `src/rename.js`: el cambio de nombre de usuario y su reescritura en todas las tablas que guardan el nombre.
- `src/feedback.js`: el buzón de sugerencias y errores: validación, barandillas del endpoint público, consultas del panel y el aviso por correo.
- `migrations/0001_initial.sql`: esquema reproducible de D1. No es un residuo de la migración desde Google y no debe eliminarse. Las migraciones siguientes añaden o ajustan: `0002` el chat, `0003` los hilos privados, `0004` el origen de cada cuenta, `0005` el buzón de sugerencias, `0006` la bolsa de tiempo, `0007` los índices necesarios para permanecer dentro de D1 Free, `0008` el correo y la recuperación del PIN, `0009` la fecha del último cambio de nombre, `0010` el nombre anterior, `0011` la zona horaria y `0012` la lengua de avisos, las suscripciones push y la deduplicación por turno.
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

La aplicación adopta el idioma de la dirección: `URL_LANG` en `public/index.html` manda sobre el idioma guardado en `pf_lang`, de modo que quien llega desde un buscador a `/en` ve el juego en inglés. En la raíz, el orden entero es **dirección > elección guardada > navegador > español**: `BROWSER_LANG` lee `navigator.languages` —la lista entera, y por los dos primeros caracteres, para que `en-GB`, `es-419` o `fr-CA` cuenten— y decide solo cuando no hay nada más.

Esa suposición **no se guarda**, y es a propósito: guardarla convertiría en elección lo que solo es una suposición, y entonces cambiar el idioma del aparato ya no cambiaría nada. Tampoco toca la barra de direcciones. El precio está en la raíz: un rastreador que renderice `/` con un navegador en inglés verá el cuerpo en inglés, mientras el título, la descripción, la canónica, el JSON-LD y el `<noscript>` que escribe el Worker siguen en español. Se acepta porque redirigir `/` según el idioma del navegador sería peor —escondería la página española, que es la principal— y porque los textos que de verdad se indexan son los del Worker y los de las páginas públicas generadas.

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

El logo es un `<button>` (`#brand-home`) que lleva al lobby, pero solo desde las pantallas de consulta que enumera `BRAND_HOME_FROM`: historial, ranking, reglas, crear, unirse y configuración de práctica. El buzón de sugerencias también entra, con una salvedad: es la única de esas pantallas a la que se llega sin sesión, así que la marca lo devuelve a donde se entró —el registro o el lobby—, igual que su botón **Volver**, y su etiqueta cambia con el destino. Desde una partida o una práctica en curso queda inerte a propósito, porque saltar al lobby se saltaría el flujo que guarda o abandona y le costaría el progreso al jugador. `test/keyboard.test.js` fija las dos mitades de esa regla.

### El cuadrado de idioma en la cabecera

Junto a la marca vive `#lang-cycle`, un botón cuadrado que muestra el idioma actual con dos letras y recorre en bucle `es → fr → en` a cada pulsación (`LANG_CYCLE`). No es un selector aparte: llama a `pickLang()`, la misma puerta que usan los botones grandes, así que arrastra consigo `localStorage`, la dirección (`/`, `/en`, `/fr`), el atributo `lang` del documento y el estado visual de los demás selectores.

`syncLangBtn()` lo esconde en las dos pantallas que ya llevan su propio selector con los tres nombres escritos —el registro y el buzón, que enumera `LANG_BTN_HIDDEN_ON`— y lo actualiza desde `show()` y `applyI18n()`. El botón nace con la clase `hidden` en el HTML porque la primera vista es el registro. Se eligió la cabecera y no un botón flotante porque la esquina inferior derecha ya es del chat.

### La puerta del correo

La regla vive en un solo sitio: en `routeApi`, justo después de `authenticate`, que es por donde pasan todas las acciones con sesión. Si la cuenta no tiene `email_verified_at` y la acción no está en `EMAIL_PENDING_ALLOWED` —`accountProfile`, `requestEmailVerification`, `leavePresence`—, la respuesta es un `403` con `code:"email_pending"`. Está ahí, y no repartida por cada acción, para que añadir una acción nueva no sea una forma de abrir un agujero por descuido.

El navegador no decide nada: `api()` reconoce ese código y enseña `s-verify`, la pantalla que bloquea. Dice dos cosas distintas según el caso —no hay correo apuntado, o lo hay y falta abrir el enlace—, porque lo que tiene que hacer la persona también es distinto. Desde ahí se pide el enlace y, con «Ya lo he validado», se vuelve a preguntar por la ficha: si el correo consta, se entra al lobby **con la misma sesión**, sin volver a escribir el PIN. Abrir el enlace en ese mismo navegador hace lo mismo sin pulsar nada.

`/admin` no tiene pantalla propia para esto: detecta `emailPending` en la respuesta de `loginUser` y ni siquiera guarda la sesión, porque un panel cuyas ocho pestañas responderían `403` no le sirve a nadie. Manda al juego, que es donde se arregla.

`test/email-gate.test.js` fija las tres mitades: lo que queda cerrado, lo que queda abierto y que validar el correo desbloquea la sesión que ya existía.

### Los tres paneles del acceso

El selector de idioma está **fuera** de los tres formularios, arriba de la tarjeta: es lo primero que se ve y funciona en los tres modos, porque quien no lee español no puede tener que adivinar que estaba detrás de «Crear una cuenta». Sus botones llevan `type="button"` — dentro de un `<form>`, un `<button>` sin `type` es un botón de envío, y elegir idioma disparaba el alta. `setAuthMode('login'|'register'|'forgot')` enseña uno de los tres formularios y esconde los otros dos; `defaultAuthMode()` abre por «crear cuenta» solo cuando alguien llega con una invitación y nunca ha entrado en ese navegador. `resetLoginSteps()` se llama desde `show('login')`, así que cualquier vuelta al acceso —sesión caducada, cambio de usuario, salida del buzón— empieza limpia.

Tres parámetros de la URL entran directamente en un modo: `?verify_email=` activa la cuenta, `?reset_pin=` abre el formulario del PIN nuevo y `?forgot=1` abre la petición del enlace. El último existe para `/admin`, que no tiene recuperación propia porque usa la misma cuenta del juego.

### La invitación que sobrevive al registro

Compartir una partida crea un enlace `?game=XXXX`, y hasta la 3.6.0 ese código vivía solo en una variable de la pestaña: bastaba con ir a buscar el correo de activación al teléfono para perderlo. Ahora se guarda en `localStorage` bajo `pf_pending_join` con la hora, y caduca a las **48 horas**, para que un código viejo no secuestre una visita de la semana siguiente. Al limpiar la barra de direcciones se borra **solo** `game`: si se borrara toda la consulta se llevaría por delante `verify_email`, que es precisamente lo que trae de vuelta la invitación.

Antes de pedir nada, la pantalla de acceso enseña quién invita y a qué reglas. Lo da la acción pública **`inviteInfo`**, una lectura y nada más: responde únicamente de una partida en `waiting`, nunca devuelve un secreto, y de una partida ya empezada solo dice que no espera rival —sin nombres—. El código de la partida viaja además en `registerUser` y en `requestEmailVerification`, y de ahí al enlace del correo como `&game=XXXX`, que es lo que permite que la verificación hecha en otro aparato aterrice en la sala. `handleDeepLink()` consume la invitación al entrar: la borra del navegador para que no vuelva a disparar. `test/invite-signup.test.js` fija las tres partes.

La acción pública **`checkUsername`** responde `{ok, known, username}` con una sola lectura por el índice único `username_key`, sin escrituras. Devuelve el nombre **tal y como se guardó**, no como lo escribió quien pregunta.

`test/login-two-steps.test.js` fija que entrar no crea cuentas —ni por nombre ni por correo, y sin dejar filas a medias—, que los tres paneles y los dos de «Mi cuenta» son `<form>`, y que el aviso del lobby cuelga de `firstLogin`, la bandera que devuelve `loginUser` cuando la cuenta no tenía ninguna entrada anterior.

### Cambiar el nombre de usuario

**Mi cuenta** tiene un tercer formulario: nombre nuevo y PIN actual. El nombre se puede cambiar porque es solo la cara visible; **el correo verificado, no**.

**Un correo verificado es definitivo.** Es la única llave para recuperar el PIN, y poder cambiarlo desde una sesión abierta sería la forma de quedarse con una cuenta ajena. En **Mi cuenta** se enseña en solo lectura, sin botón y con una nota que lo dice. El servidor lo hace cumplir por su cuenta: `requestEmailVerification` responde «Tu correo ya está verificado y no se puede cambiar.» a toda cuenta con `email_verified_at`, y `verifyEmail` rechaza un enlace antiguo que apunte a otra dirección. Solo una cuenta que todavía no ha verificado su correo —la pantalla `s-verify`— puede pedir un enlace a otra dirección, para corregir una errata del alta. Si alguien pierde de verdad su buzón, el cambio lo hace la administración por la consola SQL, que deja rastro en la auditoría.

El nombre no vive solo en `users`. Partidas (`p1`, `p2`, `winner`, `pending_winner`), jugadas (`guesses[].by`), chat (`sender`, `deleted_by`), hilos privados (`user1`, `user2`, `pair_key`), reportes, silencios, recibos, buzón y el objetivo de `audit_log` lo guardan escrito, para que el polling no cruce con `users` en cada consulta. `changeUsername`, en `src/rename.js`, lo reescribe en todas esas tablas en un único `batch` —una transacción en D1—: o cambia en todas partes o en ninguna, y el historial y el ranking siguen siendo del mismo jugador. Los textos ya escritos en mensajes de sistema del chat se quedan como estaban: son historia.

Se hace en dos pasos. Primero se escribe el nombre nuevo, sin ningún PIN a la vista; después, en un formulario aparte, se confirma con el **PIN actual** —nunca uno nuevo— o se cancela. Van separados a propósito: cuando el nombre nuevo y el PIN compartían formulario, el gestor de contraseñas del navegador lo tomaba por un cambio de credenciales y ofrecía «actualizar la contraseña», y un jugador entendió que cambiar de nombre le obligaba a cambiar de PIN y lo dejó. Ahora el primer formulario no tiene campo de contraseña y el segundo lleva oculto el nombre actual, así que el navegador ve el PIN de siempre para la cuenta de siempre y no propone nada.

Tres barandillas:

- **el PIN actual**, solo como confirmación;
- **una vez cada 90 días** (`users.username_changed_at`, migración `0009`), para que el ranking no sea un desfile de disfraces. Corregir solo mayúsculas no cambia la clave y no consume el cupo; la ficha devuelve `usernameNextChangeAt` y la pantalla dice desde cuándo se podrá volver a cambiar;
- **ninguna partida en espera o en juego**: el rival la tiene abierta con el nombre anterior y una jugada en vuelo llegaría con el nombre viejo.

**Dos personas que piden el mismo nombre a la vez** pasan las dos la lectura previa; lo que las separa es el índice único de `username_key`. El `batch` de la segunda falla entero —D1 lo deshace, no gasta su cupo de 90 días y ninguna partida queda a medias— e `isUniqueViolation` (`src/security.js`) convierte ese rechazo en «Ese nombre de usuario ya está en uso.» en lugar de un 500. El alta (`register`) hace lo mismo con el nombre y con el correo.

El nombre nuevo sigue la misma regla que el alta: sin comillas, `<`, `>`, `&` ni barras invertidas (`nameCharsError`, `src/security.js`). Las cuentas antiguas que ya tuvieran uno de esos caracteres siguen entrando; solo no pueden estrenar otro así.

El nombre nuevo viaja como `newUsername`, no como `username`, porque `authenticate` pisa `params.username` con el de la sesión. La sesión no se cierra: sigue apuntando al mismo `user_id` y la siguiente respuesta ya lleva el nombre nuevo, que el navegador guarda en `pf_user`. `test/rename.test.js` fija todo esto.

## Modelo de datos

- `users`: identidad, hash y sal del PIN, rol, bloqueo, lengua del último acceso para los avisos y el origen de la cuenta: país e IP del alta, país e IP de la última entrada y número de entradas.
- `login_attempts`: el contador de PIN incorrectos de cada cuenta (`user:<id>`) y su bloqueo. El mantenimiento borra las filas sin bloqueo vigente que llevan un día quietas.
- `email_verifications` y `pin_resets`: los enlaces de un solo uso, guardados como hash.
- `sessions`: sesiones temporales; el PIN no viaja durante las consultas periódicas. Cada sesión guarda la IP y el país desde los que se abrió. `last_seen_at` se muestrea como máximo una vez cada 15 minutos por sesión; la caducidad es fija y no depende de ese campo.
- `games`: estado completo, opciones, cronómetro y versión de concurrencia.
- `presence`: usuario conectado y ubicación en lobby o partida. Una ubicación estable se toca como máximo una vez por minuto; un cambio entre lobby y partida se escribe inmediatamente.
- `request_receipts`: respuestas de jugadas ya procesadas para evitar duplicados.
- `audit_log`: acciones administrativas.
- `chat_messages`: chat mundial del lobby, chat privado de partida, eventos y zumbidos.
- `chat_reports`: reportes de moderación, únicos por mensaje y usuario.
- `chat_mutes`: silencios temporales o permanentes impuestos por administración.
- `feedback`: el buzón de sugerencias y errores, con su estado de triaje y la nota interna de administración.
- `feedback_replies`: las respuestas enviadas desde el panel. Apunta al administrador que respondió sin cascada, así que borrar a quien fue administrador borra antes sus respuestas.
- `chat_threads`: los hilos privados, uno por pareja de jugadores.
- `push_subscriptions`: la suscripción Web Push de cada aparato —endpoint y claves públicas del navegador—, con la lengua elegida. Un mismo endpoint cambia de dueño si se cambia de cuenta en el aparato.
- `turn_notifications`: recibos técnicos por partida, versión y usuario. Su clave única es lo que impide que `guess`, `passTurn` y el Cron avisen dos veces del mismo turno; se purgan después de 7 días.

Las columnas de la bolsa de tiempo viven en `games` y conviven con los otros relojes: `time_mode` (`turn`, `bank` o `correspondence`) decide cuál manda. La correspondencia reutiliza `turn_seconds` con 86.400 o 259.200 segundos, porque la aritmética y la autoridad siguen siendo las del reloj por turno; no necesitó una columna nueva. `bank_seconds`, `bank_increment`, `bank1_remaining` y `bank2_remaining` describen la reserva de cada jugador. `time_mode` vale `turn` por omisión, así que las partidas anteriores no cambian de comportamiento.

El país y la IP no los declara el navegador: los pone Cloudflare delante del Worker (`request.cf.country` y `CF-Connecting-IP`, en `requestOrigin`). Se escriben solo al entrar —una escritura por sesión, no por petición— y su único uso es administrativo. El país que enseña la bandera de una partida sigue siendo el que averigua el navegador; son dos datos distintos y no se mezclan.

Los secretos de jugadores nunca deben exponerse mientras una partida esté activa. Toda nueva respuesta API debe pasar por la sanitización correspondiente.

El chat del lobby conserva 24 horas. El chat de partida es exclusivo de sus dos jugadores, se cierra 24 horas después de terminar y conserva sus filas durante 7 días. La limpieza se ejecuta una vez por hora mediante el Cron Trigger, nunca dentro del polling de chat. Los zumbidos requieren que el rival esté presente en la partida y tienen 30 segundos de espera por emisor.

## La administración

El panel vive en `/admin`, no está enlazado desde el juego, no se indexa y necesita una cuenta con rol `admin`. Se organiza en pestañas y cada una pide sus datos la primera vez que se abre, para no gastar lecturas de D1 en lo que nadie mira.

El toro azul de la esquina superior cierra el panel en ese navegador y devuelve al juego. Son dos sesiones distintas —`pf_admin_session` y `pf_session`—, así que salir de la administración no expulsa a nadie de su partida.

| Pestaña | Qué resuelve |
| --- | --- |
| Resumen | Usuarios, gente en línea, altas y activos de la semana, partidas y mensajes del día, moderación pendiente y los países de donde entra la gente. |
| Usuarios | La lista completa con un punto verde/gris de presencia junto al nombre, país, última IP, partidas y mensajes. Bloquear, cambiar el PIN, dar o quitar el rol `admin`, cerrar sesiones, reactivar el chat y borrar. |
| Partidas | Las últimas 200, con filtro, y el cierre de las que siguen abiertas. |
| Conversaciones | Una fila por chat, no un río de mensajes: quiénes hablan, cuántos mensajes, cuántos zumbidos y cuántos reportes. El histórico se abre aparte, en su propia ventana. |
| Moderación | Los reportes del chat, con borrar y silenciar a mano. |
| Feedback | Las sugerencias y los errores que llegan del juego. Filtro por estado y por tipo, cambio de estado desde la propia fila, respuesta, nota interna y borrado. |
| Mantenimiento | Limpieza de partidas por estado y antigüedad, y la consola SQL. |
| Auditoría | Todo lo que la administración ha cambiado, con fecha, objetivo y detalle. |

Al pulsar un nombre se abre su ficha, que empieza por el **usuario**, su **nombre anterior** (`users.previous_username`, migración `0010`, que `changeUsername` rellena en cada cambio), la fecha del **último cambio de nombre** y el **email**, marcado como verificado o sin verificar. Solo se guarda un nombre anterior, no la lista entera. El correo solo viaja en la ficha (`adminUserDetail`); la lista no lo carga.

Toda acción que cambia algo queda en `audit_log`, también borrar un mensaje del chat, silenciar o reactivar a alguien y responder al buzón; leer el chat no se audita. Bloquear o cambiar el rol de un nombre que no existe responde «Usuario no encontrado.» en lugar de dejar una línea de auditoría sobre nadie. Bloquear borra además la presencia de la cuenta.

La exportación es la copia de seguridad del panel: `schemaVersion: 5` incluye el correo, su verificación, la zona horaria, el nombre anterior, la lengua de avisos y las suscripciones push. El endpoint de una suscripción identifica un aparato y la exportación sigue siendo un archivo privado.

El punto de cada fila reutiliza la tabla `presence` y el mismo umbral del contador general: verde significa actividad autenticada en los últimos 2 minutos y gris, desconectado. El texto accesible y el título del punto expresan también el estado, de modo que la información no depende únicamente del color. La consulta es parte de `adminUsers`, no genera escrituras adicionales y no cambia la versión de la aplicación.

### Las horas y las zonas horarias

**La base guarda y compara todo en UTC**, con `toISOString()`: caducidades, bloqueos, presencia, relojes y el Cron. Ninguna regla depende de la zona de nadie. La conversión se hace solo al pintar:

- **El juego** usa `toLocaleDateString` e `Intl.DateTimeFormat`, así que cada jugador ve sus fechas en la zona de su aparato.
- **`/admin`** pinta con `when` (texto plano, también para el borrador de correo) y `at` (un `<time>` cuyo título lleva la hora UTC exacta), los dos en la zona del navegador del administrador. La cabecera dice cuál es: «horas en Pacific/Noumea (UTC+11)».
- **La ficha de un jugador** enseña su zona y la hora que es allí ahora: «Australia/Sydney · allí son las 21:53 (UTC+10)».

La zona de cada cuenta vive en `users.timezone` (migración `0011`). **Se guarda el nombre IANA, nunca un desfase**: Sídney pasa de UTC+10 a UTC+11 en octubre y Numea no cambia nunca, así que un «+11» fijo mentiría medio año. **Tampoco se deduce del país**: Australia, Estados Unidos o Brasil tienen varias zonas, y una VPN engaña. Manda la que declara el navegador (`timeZone`, que el juego envía en cada petición y `/admin` al entrar); `request.cf.timezone`, que Cloudflare deduce de la IP, solo es el respaldo. `cleanTimeZone` descarta cualquier nombre que el motor no reconozca.

Se escribe al entrar (`login` y `register`) y, una sola vez, en la primera petición de una sesión cuya cuenta todavía no tenía zona. No se escribe en cada petición a propósito: dos aparatos de la misma cuenta con zonas distintas se la quitarían el uno al otro en cada polling. Quien viaja la actualiza en su siguiente entrada. `test/timezone.test.js` fija todo esto.

La consola SQL no convierte nada: lo que devuelve está en UTC.

### Lo que el correo dejó sin trabajo

**La fusión de cuentas y el buscador de cuentas repetidas se retiraron enteros.** Los dos resolvían el mismo problema, que ya no existe: quien olvidaba su PIN volvía a entrar con el mismo nombre y un número detrás —«carlos» pasaba a ser «carlos46»—, así que el panel agrupaba las cuentas por la última IP y por la raíz del nombre para que alguien uniera después los dos rastros a mano.

Con el correo verificado como identificador único, esa segunda cuenta no llega a nacer: quien olvida su PIN recibe un enlace y vuelve a la suya. Quedaba entonces un panel que señalaba coincidencias sin poder probar nada —una IP compartida es una casa o un móvil— y que no llevaba a ninguna acción, y la operación más delicada del panel, la que reescribía partidas, mensajes, reportes e hilos sin vuelta atrás. Si alguna vez hiciera falta unir dos cuentas, se hace por la consola SQL, que deja rastro en la auditoría.

`adminUsers` ya no devuelve `duplicates` y `adminUserDetail` ya no devuelve `related`; con ellos se fueron `aliasRoot`, `duplicateGroups` y las dos consultas que barrían la tabla `users` entera en cada ficha.

### Confirmar lo que borra

Ninguna acción del panel usa `confirm()`, `prompt()` ni `alert()` del navegador. Todas pasan por `ask()`, un `<dialog>` propio que devuelve una promesa: `null` si se cancela y un objeto con los campos si se acepta. Cabe explicar qué va a pasar antes de que pase —a quién afecta, qué se pierde, qué no—, y el botón de aceptar se queda apagado mientras falte algo obligatorio o no coincida el texto exacto que se pide escribir. Borrar una cuenta es el caso extremo: una sola ventana que enumera todo lo que se va —partidas, historial, chats, reportes, sesiones y rastros técnicos— y pide el nombre escrito a mano para confirmar.

Ese borrado es un derecho al olvido, no una limpieza a medias: ya no hay dos modos. `adminDeleteUser` arrastra también lo que ninguna clave foránea alcanza —`request_receipts`, el chat del lobby, el buzón que lleve su nombre o su correo— y borra sus líneas de `audit_log`; la propia operación tampoco se audita, porque una entrada que dijera «se borró a Fulano» sería justo el dato que la purga viene a eliminar. La contrapartida está asumida: una partida desaparece para los dos jugadores, no solo para quien se va.

Las tablas del panel llevan `data-label` en cada celda y viven dentro de un `.scroll.stack`. Por debajo de 760px cada fila se convierte en una ficha con su etiqueta delante: nueve columnas no caben en un teléfono y el scroll horizontal era la única forma de leerlas.

### El acceso al propio panel

`/admin` entra con la cuenta del juego, así que su recuperación es la del juego: el pie del formulario enlaza a `/?forgot=1`. Y como ninguna cuenta de administración puede existir ya sin correo verificado, el portal no puede quedarse sin puerta: si el PIN se olvida, el enlace del correo lo repone.

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

Sin sesión solo existen las pantallas de `GUEST_VIEWS` —portada, práctica, partida de práctica, reglas y buzón—. La guarda vive en una sola línea, al principio de `show()`, y no repartida por cada botón, para que añadir una pantalla nueva no sea una forma de dejarla abierta por descuido. Un invitado no es una cuenta: la puerta del correo se queda entera.

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

La 2.5 trae `0005_feedback.sql` y `0006_time_bank.sql`; la optimización de D1 Free añade `0007_d1_free_optimization.sql` y la correspondencia añade `0012_push.sql`. A todas les aplica esta misma regla. El aviso por correo del buzón necesita además, una sola vez, activar Email Routing en el dominio y colocar sus dos secretos:

```text
wrangler secret put FEEDBACK_TO
wrangler secret put FEEDBACK_FROM
```

Web Push necesita un par P-256 propio del sitio. La clave pública se guarda como base64url del punto sin comprimir y la privada como base64url del escalar; ninguna de las dos se escribe en Git y la privada nunca llega al navegador:

```text
wrangler secret put VAPID_PUBLIC
wrangler secret put VAPID_PRIVATE
```

Al revés, el Worker nuevo llegaría a una base sin las columnas que espera y cualquier entrada fallaría hasta que la migración se aplicara. Al derecho no hay ventana rota: las columnas nuevas siempre se añaden con valor por omisión, así que el Worker anterior las ignora sin enterarse.

El plan gratuito de D1 incluye por cuenta 5 millones de filas leídas al día, 100.000 filas escritas al día y 5 GB de almacenamiento. Las cuotas diarias se reinician a las 00:00 UTC. Los índices reducen lecturas, pero actualizar una columna indexada puede sumar escrituras adicionales. Antes de aumentar el tráfico se deben revisar las métricas de D1, la frecuencia de consultas y el polling.

### Optimización para D1 Free — 25 de agosto de 2026

Cloudflare avisó que empezaría a hacer cumplir las cuotas diarias de D1 Free. La revisión de Analytics entre el 2 y el 25 de agosto encontró 18,807 millones de filas leídas y 1,330 millones escritas. Las lecturas no superaron 5 millones en ningún día; las escrituras cruzaron 100.000 el 9 de agosto (100.617) y el 13 de agosto (114.417).

Query Insights de los 31 días anteriores atribuyó casi todas las escrituras repetitivas a tres caminos:

| Consulta o tabla | Filas escritas | Decisión permanente |
| --- | ---: | --- |
| `presence` | 737.408 | Escribir solo al cambiar de ubicación o después de 60 segundos; el chat no altera presencia y se elimina el índice sobre `last_seen_at`, que duplicaba el coste del heartbeat. |
| `chat_threads` | 321.192 | Crear o activar el hilo al comenzar una pareja, no hacer `UPSERT` durante cada consulta de estado. El cliente reutiliza el identificador estable del hilo. |
| `sessions.last_seen_at` | 251.260 | Muestrear una vez cada 15 minutos; la sesión tiene vencimiento fijo y no necesita una escritura deslizante por petición. |

Esas tres fuentes sumaban aproximadamente el 98,5 % de las filas escritas observadas. Las lecturas más caras se reducen así:

- el chat carga los últimos 100 mensajes una sola vez y después pide únicamente `id > cursor`;
- la lista de hilos privados se refresca como máximo cada 15 segundos y evita peticiones simultáneas;
- `threadForGame` deriva las claves normalizadas de los jugadores que ya están en la partida, en lugar de volver a leer dos filas de `users`;
- `myGames` parte de los índices por jugador y solo materializa partidas `waiting` o `active`; en la comprobación remota pasó de 395 a 2 filas leídas para la misma lista activa;
- `listGames` oculta inmediatamente partidas vencidas mediante sus fechas, pero ya no ejecuta dos `UPDATE` globales en cada polling;
- las limpiezas salen del camino crítico y se agrupan en `cleanupDatabase`.

El Cron Trigger `17 * * * *` se ejecuta a los 17 minutos de cada hora UTC. Borra chat del lobby con más de 24 horas, mensajes de partida heredados con más de 7 días, hilos con más de 7 días, silencios vencidos, recibos idempotentes y avisos de turno con más de 7 días, sesiones vencidas y presencia con más de 24 horas. También marca como vencidas las partidas públicas que llevan 2 horas esperando y las privadas que llevan 48, y como inactivas las partidas normales sin actividad durante 48 horas. La correspondencia queda fuera de ese cierre: el Cron consume el plazo de uno o tres días, entrega el turno siguiente y emite exactamente un aviso. Las consultas de los jugadores siguen ocultando o cerrando una partida vencida en el momento, por lo que el retraso máximo del mantenimiento no cambia el comportamiento visible.

La migración `0007` elimina `presence_last_seen` y el índice de chat por `game_id`, que no tenían lectores capaces de compensar su coste de escritura. Sustituye el índice general del lobby por uno parcial que solo contiene mensajes `room_type='lobby' AND thread_id IS NULL`. No borra filas ni modifica mensajes, partidas, usuarios o sesiones.

#### Verificación y vigilancia

La regresión específica está en `test/d1-optimization.test.js` y cubre polling sin escrituras, chat incremental, mantenimiento, salida repetida idempotente, salida de uno o ambos jugadores, regreso conservando el tiempo restante y pausa manual vencida. La batería completa tiene 121 pruebas. También se comprueban por separado la modalidad de bolsa —que nunca se pausa al salir—, la migración local, `wrangler types` y el empaquetado con `wrangler deploy --dry-run`.

Después de publicar se deben revisar `D1 > Metrics > Row Metrics` durante las primeras 24 y 48 horas y comparar Query Insights a los siete días. Como umbral operativo, 80.000 filas escritas o 4 millones leídas en un día requieren revisar de nuevo las consultas antes de alcanzar la cuota. Las cifras se evalúan por día UTC.

#### Reversión

El código se revierte con una versión anterior del Worker. El código viejo y el nuevo funcionan tanto antes como después de `0007`, porque la migración solo cambia índices. Si un plan de consulta empeora, se pueden reconstruir los índices anteriores con una migración nueva:

```sql
DROP INDEX IF EXISTS chat_messages_lobby;
CREATE INDEX presence_last_seen ON presence(last_seen_at);
CREATE INDEX chat_messages_game ON chat_messages(game_id,id DESC);
CREATE INDEX chat_messages_lobby ON chat_messages(room_type,id DESC);
```

Reconstruir índices escribe filas y solo debe hacerse después de confirmar el plan con `EXPLAIN QUERY PLAN`. Wrangler crea una copia de seguridad automática antes de aplicar una migración remota; para pérdida o corrupción de datos se usa esa copia o Time Travel, no SQL improvisado. Para detener únicamente el mantenimiento se cambia `triggers.crons` a `[]` y se despliega esa configuración.

## La auditoría de la 3.5.1

El 17 de septiembre de 2026 se revisaron el código, las pantallas y este documento con ojos de QA. `test/v351-audit.test.js` fija cada hallazgo:

| Hallazgo | Corrección |
| --- | --- |
| `esc()` del juego no escapaba comillas y el chat metía el nombre del remitente en un `onclick` con `encodeURIComponent`, que deja pasar el apóstrofo: un nombre bien elegido ejecutaba código en la pantalla de quien pulsaba «silenciar». | `esc()` escapa comillas dobles y simples; los argumentos de `onclick` pasan por `jsArg()`; el alta y el cambio de nombre rechazan comillas, `<`, `>`, `&` y barras invertidas. |
| El nombre y el correo llevaban contadores de PIN distintos (diez intentos en vez de cinco) y «Mi cuenta» no contaba ninguno. | `checkPin` cuenta por cuenta en `login`, `changePin` y `changeUsername`. |
| `joinGame` solo esperaba a las dos pantallas si había cronómetro por turno: la bolsa de tiempo empezaba a correr en cuanto el rival se unía. | El apretón de manos usa `hasClock`. |
| `leaderboard` y `listGames` respondían sin sesión y sin correo verificado. | Están en `PROTECTED`; el ranking usa el nombre de la sesión. |
| Dos revanchas pedidas a la vez dejaban una partida privada en espera, sin rival, ocupando uno de los tres huecos. | La petición que pierde la carrera borra su partida antes de reintentar. |
| Borrar una cuenta que fue administradora y respondió al buzón fallaba por la clave foránea de `feedback_replies`. | Se borran antes sus respuestas. |
| La moderación del chat y las respuestas del buzón no quedaban en la auditoría; bloquear a un nombre inexistente sí. | Se auditan; el objetivo inexistente se rechaza. |
| La exportación no llevaba el correo de las cuentas. | `schemaVersion: 4`. |
| Un enlace de verificación hacia una dirección que otra cuenta había tomado entretanto daba un error 500. | Responde «Ese correo ya está asociado a otra cuenta.». |
| La pantalla de verificación prometía un enlace de 3 días y el servidor lo emitía de 15 minutos. | `requestEmailVerification` emite el de 3 días. |
| «Continuar» desde el lobby perdía la bolsa de tiempo al entrar en la partida o en la sala de espera. | La meta lleva `timeMode`, `bankSeconds` y `bankIncrement`. |
| Once mensajes del servidor —chat, reloj, colores— salían en español en un juego en inglés o francés, porque la prueba de traducciones no miraba los `return "…"` ni `rename.js`. | Traducidos; la prueba los mira. «El código debe tener N posiciones.» se traduce por patrón (`ERR_PATTERNS`). |

## Seguridad y archivos locales

Nunca se deben subir a GitHub:

- `.dev.vars`, `.env`, claves, tokens o credenciales;
- Excel, CSV, exportaciones o copias de seguridad;
- SQL con datos reales;
- `.private/`, `.wrangler/`, `dist/`, cachés o perfiles de rendimiento.

Estas exclusiones están definidas en `.gitignore`. Los PIN se almacenan con hash SHA-256 y una sal individual. No se deben registrar PIN, tokens de sesión, secretos de partida ni contenido privado en logs o documentación.

El contacto que alguien deja en el buzón de sugerencias es un dato personal y recibe el mismo trato que la IP: se guarda para poder responder, solo se ve dentro de `/admin`, no aparece en ninguna respuesta del juego y sí va en la exportación, que pasó a `schemaVersion: 3` al incluir el buzón, a `schemaVersion: 4` al incluir el correo de las cuentas y a `schemaVersion: 5` al incluir la lengua de avisos y las suscripciones push. El endpoint y las claves públicas de una suscripción identifican un aparato: no salen del panel ni deben publicarse.

La IP y el país de cada cuenta son datos personales. Se guardan para poder investigar un abuso —quién creó una partida, desde dónde entró una cuenta bloqueada— y por eso solo se ven dentro de `/admin`: no aparecen en ninguna respuesta del juego, no viajan al navegador de ningún jugador y no se escriben en logs. Sí van en la exportación, que por lo tanto es un archivo con datos personales y nunca debe subirse al repositorio.

## Versionado

El proyecto sigue versionado semántico `vMAYOR.MENOR.PARCHE`:

- **MAYOR (X)**: cambios incompatibles del API o del contrato de datos —una respuesta que cambia de forma, un endpoint que desaparece, una migración que obliga a rehacer clientes.
- **MENOR (Y)**: funcionalidad nueva compatible hacia atrás —una pantalla, un modo de juego, un ajuste como el cuadrado de idioma.
- **PARCHE (Z)**: correcciones compatibles hacia atrás, retoques de texto, estilos y rendimiento.

El número vive en tres sitios y los tres se cambian en el mismo commit: `version` en `package.json` conserva el SemVer canónico (`3.7.0`), porque npm y pnpm lo requieren, y `APP_VERSION` en `public/index.html` y `src/version.js` publica `v3.7.0`. El Worker lo firma en todas sus respuestas; `test/client-server-sync.test.js` comprueba que los tres coinciden. De ahí sale lo que ve el jugador en los créditos y lo que viaja con cada mensaje del buzón (`appVersion`), así que un número desfasado hace que un informe apunte a una versión que no es. La versión sube en el commit que introduce el cambio, no al desplegar.

## Procedimiento para futuras modificaciones

1. Leer este documento y revisar `git status` para no sobrescribir trabajo pendiente.
2. Identificar las reglas y contratos afectados antes de editar.
3. Hacer el cambio más pequeño que resuelva el problema.
4. Ejecutar `pnpm run check` y añadir pruebas de regresión cuando corresponda.
5. Revisar que no se filtren datos privados ni secretos.
6. Actualizar este documento si cambian arquitectura, operación, rutas, límites o decisiones duraderas.
7. Subir la versión según las reglas de «Versionado», en `package.json`, `APP_VERSION` de `public/index.html` y `src/version.js` a la vez.
8. Confirmar los cambios en Git y enviar `main`; comprobar después el despliegue automático.

No se deben borrar datos, ejecutar importaciones, alterar producción, cambiar roles o publicar secretos sin autorización explícita del propietario.

## El camino a la 4.0.0

El juego va por delante de su público. Tiene bolsa de tiempo, relojes con autoridad del servidor, chat con hilos privados, reanudación después de recargar, instalación como app y tres idiomas; y aun así, quien llega hoy se encuentra esto: crea una cuenta, va a buscar el correo, vuelve, entra al vestíbulo y **no hay nadie**. Este plan entero está ordenado alrededor de esa frase. Son dieciocho mejoras repartidas en seis etapas por orden de valor, más el cierre. Cuando estén hechas, la versión será la **4.0.0**.

Sube la mayor por tres razones concretas, no por ceremonia: aparecen pantallas que funcionan **sin sesión** —hasta hoy todo lo que no fuera el buzón exigía una—, el ranking cambia de forma —deja de ordenar por victorias y pasa a contar puntos por temporada, así que su respuesta ya no es la misma— y llega un modo con **más de dos jugadores**, que el modelo actual de `games`, con sus `p1` y `p2`, no puede representar.

Cada etapa sube la menor —3.6, 3.7, 3.8, 3.9, 3.10 y 3.11— en el commit que la termina, y el cierre pone la 4.0.0. Ninguna etapa espera a la siguiente para estar en producción: el plan está pensado para que el juego mejore diecinueve veces, no una.

### Cómo se entrega cada tarea

**Cada tarea terminada se comita, se empuja a `main` y se despliega a producción**, en ese orden y sin esperar al final de la etapa. Cuando dos tareas están encadenadas —una no se sostiene sin la otra, o la primera no cambia nada visible para quien juega—, se entregan juntas al terminar la última; la tabla lo dice en la columna «Hecho cuando». Después de cada entrega, `main` queda limpio: sin cambios sueltos y sin archivos generados a medias. Si la tarea trae migración, `npm run db:remote` va **antes** del push, nunca después. Es la misma regla que ya lleva `AGENTS.md`, repetida aquí porque este plan es largo y la tentación de acumular entregas es grande.

### Lo que ninguna tarea de este plan puede romper

Son los invariantes de siempre, y este plan los pone a prueba más que ningún cambio anterior:

- **La puerta del correo se queda.** Ninguna cuenta juega sin `email_verified_at`. Que un visitante practique sin registrarse no es una excepción: un invitado no es una cuenta, y la práctica no escribe una sola fila en D1.
- **La bolsa de tiempo sigue sin pausa.** La cadencia por correspondencia de la etapa 2 es un modo de reloj nuevo, no un permiso para detener la bolsa.
- **Los secretos no salen de una partida activa.** La tarea del espectador (E6-T1) es la única del plan capaz de romper esa regla, y por eso lleva prueba propia.
- **D1 Free manda.** Ninguna tarea añade escrituras al polling ni lecturas sin índice. Al terminar cada etapa se miran las Row Metrics antes de empezar la siguiente.
- **La versión vive en tres sitios** —`package.json`, `APP_VERSION` de `public/index.html` y `src/version.js`— y se cambian juntos.
- **Todo texto nuevo nace en los tres idiomas**, también los que devuelve el servidor, y los archivos generados se regeneran en el mismo commit que su fuente.

### Etapa 1 — La puerta abierta (3.6.0)

Tres tareas, ninguna toca las reglas del juego, y son las que más cambian lo que ocurre en la primera visita. Hoy `openPractice()` solo se alcanza desde el vestíbulo, es decir después de registrarse y de verificar el correo: el visitante tiene que pagar por adelantado para saber si el juego le gusta. Y la portada no enseña ni un número, porque el contador de jugadores conectados vive en el vestíbulo, del otro lado de la puerta.

| Tarea | Qué cambia para quien juega | Dónde se toca | Hecho cuando |
| --- | --- | --- | --- |
| **E1-T1 (a)** ✅ Jugar antes de registrarse (3.5.2) | La portada ofrece «Probar ahora»: una partida contra el ordenador en tres segundos, sin cuenta. Al terminarla se le invita a crear una para jugar contra personas. | `public/index.html`: portada, `openPractice()`, las guardas de `show()` y el pie de créditos | Un navegador limpio termina una práctica sin sesión y sin ninguna llamada mutante al API; el único acceso es el pulso numérico de E1-T2, que lleva el acuerdo de versión. `test/guest-practice.test.js` lo fija |
| **E1-T2 (e)** ✅ La portada respira (3.5.3) | Debajo del botón: «3 jugadores conectados · 2 partidas en curso». Quien llega ve que el sitio está vivo antes de decidir si se registra. | `src/index.js`: acción pública `publicPulse` con caché de 30 s en el isolate; `public/index.html` | Devuelve **solo números**: ni nombres, ni códigos, ni países. La 3.5.0 metió el ranking y la lista pública detrás de la puerta del correo a propósito y esta tarea no lo deshace; `test/public-pulse.test.js` lo comprueba |
| **E1-T3 (d)** ✅ La invitación sobrevive al registro (3.6.0) | Quien abre un enlace de partida sin tener cuenta ve quién le invita y con qué reglas, se registra, verifica el correo y **aterriza dentro de la partida**, no en el vestíbulo. | `public/index.html`: `pendingJoinCode` en `localStorage`, `renderLoginInvite()`, `handleDeepLink()`; `src/index.js`: acción pública `inviteInfo`; `src/recovery.js`: el enlace de verificación conserva el código | Enlace, registro y verificación desde otro dispositivo acaban en la sala de la partida; `test/invite-signup.test.js` lo comprueba |

### Etapa 2 — El regreso asíncrono (3.7.0)

Dos amigos en dos husos horarios ya pueden terminar una partida: la correspondencia da **uno o tres días por jugada**, sigue corriendo cuando se cierra la pestaña y no cae en el cierre general por 48 horas sin actividad. Una invitación privada espera 48 horas; las públicas conservan el límite de 2. Web Push entrega el turno con la app cerrada y el correo verificado sirve de respaldo en correspondencia cuando el aparato no tiene una suscripción válida. El cambio de turno y el Cron comparten un recibo único, de modo que el polling no avisa y ningún turno se anuncia dos veces.

| Tarea | Qué cambia para quien juega | Dónde se toca | Hecho cuando |
| --- | --- | --- | --- |
| **E2-T1 (b)** ✅ Cadencia por correspondencia (3.7.0) | Un reloj nuevo: **un día** o **tres días** por jugada. La partida privada que espera rival aguanta 48 horas en vez de 2, y una partida en correspondencia no la barre el mantenimiento por inactividad. | `src/game.js`, `src/index.js`, `src/maintenance.js`, `public/index.html`; no hizo falta otra columna: `time_mode='correspondence'` reutiliza `turn_seconds` | `test/correspondence.test.js`: el reloj corre aunque el rival no esté, la partida no se cierra a las 48 h y la invitación privada dura 48 h. **Entregada con E2-T2** |
| **E2-T2 (c)** ✅ Avisos que sobreviven a la pestaña cerrada (3.7.0) | El teléfono avisa cuando toca jugar aunque el juego esté cerrado; si una correspondencia no tiene una suscripción push válida, usa el correo verificado. | `public/sw.js`, `public/index.html`, `src/push.js` (nuevo, VAPID firmado y `aes128gcm` con Web Crypto, sin dependencias), `src/index.js`, `migrations/0012_push.sql`, secretos `VAPID_PUBLIC` y `VAPID_PRIVATE` | El aviso sale del cambio de turno (`guess`, `passTurn`) y del Cron, **nunca del polling**. La clave única de `turn_notifications` impide más de un aviso por turno. La migración se aplica antes del push |

### Etapa 3 — Lo que se comparte (3.8.0)

El juego no tiene publicidad y no va a tenerla. Lo único que puede traer gente es lo que un jugador comparte por su cuenta, y para eso hay que darle algo que valga la pena compartir. Picas y Fijas es literalmente el antepasado de Wordle: la mecánica del código diario con rejilla de emojis le sienta mejor que a nadie y, además, funciona con cero jugadores conectados, que es el problema de la etapa 1 visto desde el otro lado.

| Tarea | Qué cambia para quien juega | Dónde se toca | Hecho cuando |
| --- | --- | --- | --- |
| **E3-T1 (f)** El código del día | Un secreto por día, el mismo para todo el mundo, un intento diario y una clasificación del día por intentos y tiempo. | `src/daily.js` (nuevo), `src/index.js`, `migrations/0013_daily.sql` (solo los resultados), `public/index.html` | El secreto se deriva del día con HMAC y un secreto del Worker: no se guarda en claro y no se puede adivinar desde el navegador. Nadie puede entregar dos veces el mismo día. **Encadenada con E3-T2** |
| **E3-T2 (f)** La rejilla que se comparte | Al terminar, el resultado se copia como rejilla de emojis —fija llena, pica hueca— sin revelar el código. | `public/index.html` | Se copia igual en los tres idiomas y no contiene el secreto. Se entrega junto con E3-T1 |
| **E3-T3 (r)** La tarjeta de fin de partida | «He descifrado un código de 5 en 6 intentos»: algo que compartir al acabar cualquier partida, no solo la del día. | `public/index.html`, la misma fontanería de compartir de E3-T2 | Se entrega sola |

### Etapa 4 — El motor al servicio de quien juega (3.9.0)

`public/computer-ai.js` ya sabe mantener el conjunto de códigos compatibles con todas las pistas y medir cómo un intento lo parte. Ese saber está encerrado en la práctica, y cuatro de las mejoras de este plan salen del mismo sitio: sacarlo de ahí es la tarea más rentable de la etapa aunque por sí sola no se vea.

| Tarea | Qué cambia para quien juega | Dónde se toca | Hecho cuando |
| --- | --- | --- | --- |
| **E4-T1** El solucionador, fuera del rival | Nada todavía: es el cimiento de las cuatro siguientes. | `public/deduce.js` (nuevo), `public/computer-ai.js` pasa a usarlo | `test/computer-ai.test.js` pasa sin tocarlo. **Encadenada con E4-T2** |
| **E4-T2 (n)** La partida que se explica | Al terminar, cada intento recibe una nota —óptimo, correcto, desperdiciado— y se señala la jugada en la que la partida se decidió. | `public/index.html` | Se calcula entero en el navegador a partir de `historyGame`: ni una lectura más en D1. Se entrega junto con E4-T1 |
| **E4-T3 (o)** El cuaderno y el aviso de contradicción | Una cuadrícula para marcar símbolos descartados y confirmados, y un aviso opcional cuando un intento contradice las pistas propias. **Es una opción de la partida, elegida al crearla**, para que los dos jueguen con las mismas reglas. | `public/index.html`, `src/game.js`, `migrations/0014_notebook_option.sql` | La opción viaja en `games` y el servidor la valida; con la opción apagada, la pantalla es la de siempre |
| **E4-T4 (h)** Ver pensar al ordenador | El ordenador ataca el código del jugador explicando cada jugada: «quedan 18 posibles, este intento las parte en dos». | `public/index.html` | Funciona sin conexión, como el resto de la práctica |
| **E4-T5 (g)** Enigmas de deducción | «Aquí tienes cinco intentos y sus resultados: deduce el código.» Contenido en solitario, por dificultad, sin rival y sin coste en D1. | `tools/make-puzzles.mjs` (nuevo), `public/puzzles.json` (**generado: no se edita a mano**), `public/index.html` | Una prueba comprueba que cada enigma tiene solución única y otra que el archivo publicado corresponde al generador |

### Etapa 5 — Razones para volver (3.10.0)

Hoy `leaderboard()` ordena por victorias y desempata por partidas jugadas: quien juega doscientas y pierde la mitad va por delante de quien gana nueve de diez, y el que llegó primero se queda arriba para siempre. Y cuando una partida termina, el rival desaparece: la revancha solo existe en los segundos siguientes, aunque `chat_threads` ya guarde un hilo por pareja.

| Tarea | Qué cambia para quien juega | Dónde se toca | Hecho cuando |
| --- | --- | --- | --- |
| **E5-T1 (i)** Puntos y temporadas | El ranking premia la dificultad de las reglas y la economía de intentos, y se reinicia cada mes conservando el histórico. | `src/index.js`, `migrations/0015_season.sql` | La respuesta de `leaderboard` cambia de forma: es una de las tres razones de la mayor, y se documenta aquí el día que se haga |
| **E5-T2 (j)** Perfil público | Los nombres del ranking y del chat se pueden pulsar: victorias, reglas preferidas, mejor partida e insignias. | `src/index.js`, `public/index.html` | Solo lectura y solo lo que ya es público; el correo no aparece nunca |
| **E5-T3 (k)** Insignias | «Resuelto en 4», «Ganada con 5 segundos», «Al Experto», «7 días seguidos». | `src/index.js`, `migrations/0016_badges.sql`, `public/index.html` | Se calculan **al terminar la partida** y se guardan; abrir un perfil no recorre `games` |
| **E5-T4 (l)** Lista de rivales | Una lista de con quién se ha jugado, con punto de presencia y botón de desafío. | `src/index.js`, `public/index.html` | Sale de `chat_threads` y de las partidas terminadas: sin tabla nueva |

### Etapa 6 — La sala viva (3.11.0)

Lo que queda es lo que hace que una sala parezca habitada, y lo más ambicioso del plan: dejar de exigir que haya exactamente dos personas libres a la vez.

| Tarea | Qué cambia para quien juega | Dónde se toca | Hecho cuando |
| --- | --- | --- | --- |
| **E6-T1 (p)** Espectador de verdad | Desde el vestíbulo se puede mirar una partida pública en curso, con el chat en lectura. Alimenta también la portada de E1-T2. | `src/game.js` (`sanitizeGame`), `src/index.js`, `public/index.html`; las traducciones `spectator_*` ya existen | **La tarea delicada del plan.** Una prueba dedicada comprueba que un espectador de una partida **activa** no recibe ningún secreto, ni el de uno ni el del otro |
| **E6-T2 (q)** Reacciones rápidas | Cuatro frases hechas en los tres idiomas para quien juega desde el teléfono y no va a escribir. | `src/chat.js`, `public/index.html` | Reutiliza `chat_messages` con su tipo y la espera del zumbido; no abre ninguna vía nueva de moderación |
| **E6-T3 (m)** La arena | De 3 a 8 jugadores contra el mismo código, a la vez, con clasificación en directo. Resuelve de raíz el «hacen falta dos al mismo tiempo». | `src/arena.js` (nuevo), `src/index.js`, `migrations/0017_arena.sql`, `public/index.html` | `games` no sirve —es de dos, `p1` y `p2`—, así que la arena lleva tablas propias y no toca las partidas clásicas. Es la tercera razón de la mayor |

### Etapa 7 — El cierre: 4.0.0

No es papeleo: es lo que separa dieciocho cambios sueltos de una versión.

1. Subir la versión a `4.0.0` en los tres sitios, en un mismo commit.
2. Poner al día este documento: «Estado actual», «Arquitectura y archivos», «Modelo de datos» con las tablas nuevas, «Reglas técnicas que no se deben romper» y este mismo plan, que pasa a ser historia.
3. Regenerar todo lo generado: páginas de reglas e instalación, capturas y su lista en el manifest, iconos si cambió la marca, tarjetas OG y las guías PDF, que para entonces deben hablar del código del día y del análisis.
4. `npm test` completo, migraciones en local, `wrangler types` y `wrangler deploy --dry-run`.
5. Repasar en producción las dieciocho mejoras, una por una, en los tres idiomas y en teléfono.
6. Etiqueta anotada `v4.0.0` sobre el commit del cierre.

### Lo que no entra en la 4.0.0

Quedan fuera a propósito y son las candidatas de la siguiente: el tema claro —hoy no hay `prefers-color-scheme` en el front y la identidad Mesa es oscura—, el aviso que aprovecha la zona horaria del rival que ya guarda la migración `0011`, el resumen semanal por correo y el indicador de fiabilidad de quien abandona partidas. Ninguna de las cuatro cambia la primera visita, que es de lo que trata esta versión.


## Recuperación

El código anterior de Google Apps Script, la documentación de migración y sus instrucciones siguen accesibles en el historial anterior al commit de limpieza. No forman parte del sistema vigente y no deben restaurarse al árbol principal salvo una decisión consciente.

Para recuperar D1 se debe usar una exportación confiable o Time Travel de Cloudflare, verificar primero el alcance y conservar una copia antes de sobrescribir datos. Una recuperación nunca debe improvisarse directamente sobre producción.

## Capacidad prevista y mejoras

La aplicación fue concebida inicialmente para menos de 20 conexiones simultáneas y preparada para crecer aproximadamente a 100 después de medir consumo. Actualmente usa consultas periódicas; si el tráfico aumenta, una evolución posible es WebSockets o coordinación con Durable Objects. Esa decisión requiere mediciones reales y no debe introducirse solo por anticipación.

### Recuperación del PIN — cómo quedó

El camino elegido fue el del correo, y ya está en producción: columna `email` con índice único parcial, `email_verifications` y `pin_resets` con el token guardado como hash, caducidad corta y un solo uso. La petición del enlace pasa por Turnstile y se corta a tres por IP y hora; responda lo que responda la base, la respuesta al navegador es siempre la misma, para no delatar qué direcciones están registradas. Reponer el PIN cierra todas las sesiones de esa cuenta.

`adminResetPin` sigue existiendo para el caso en que alguien pierda también el acceso a su correo, pero ya no es la única vía. Lo que queda pendiente es menor: las cuentas antiguas sin correo no pueden recuperarse hasta que su dueño lo añada desde **Mi cuenta**, y la pantalla se lo dice con todas las letras en lugar de dejarlo en gris.

Toda nueva tarea debe tratar este archivo como fuente principal de contexto. Cuando el código y este documento discrepen, se debe verificar el comportamiento con pruebas y corregir la documentación en el mismo cambio.
