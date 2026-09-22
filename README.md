# Picas y Fijas — documento maestro

Este es el único documento de referencia del proyecto. Está pensado para personas y asistentes de IA: antes de modificar, desplegar o diagnosticar la aplicación, se debe leer completo y mantenerlo actualizado cuando cambie la arquitectura, la operación o una decisión importante.

## Estado actual

Picas y Fijas es un juego multijugador web en español, inglés y francés. La versión vigente funciona íntegramente en Cloudflare; la implementación anterior de Google Sheets y Apps Script fue retirada del árbol actual después de completar la migración. Sigue disponible en el historial de Git si alguna vez se necesita consultar.

Versión actual: **4.8.0**, el séptimo lote de la identidad **Plaza** —el movimiento; véase «La serie 5: la identidad Plaza»—, entregado dentro de la serie de correcciones y mejoras de la 4. La 4.0.0 cierra «El camino a la 4.0.0»: dieciocho mejoras en seis etapas, ordenadas alrededor de una sola frase —quien llegaba creaba una cuenta, iba a buscar el correo, volvía, entraba al vestíbulo y no había nadie—. La mayor sube por tres razones concretas, no por ceremonia: hay pantallas que funcionan **sin sesión**, cuando hasta la 3.5.1 todo lo que no fuera el buzón exigía una; el **ranking cambió de forma**, porque dejó de ordenar por victorias y pasó a contar puntos por temporada, de modo que su respuesta ya no es la misma; y llegó un modo con **más de dos jugadores**, que el modelo de `games`, con sus `p1` y `p2`, no podía representar. Antes de ponerle el número se auditó entera —véase «La auditoría de la 4.0.0»—, porque dieciocho cambios en seis etapas dejan grietas en las costuras y no en el sitio donde se miró al escribirlas.

Lo que hay hoy, de lo último a lo primero. La **arena** (3.11.0) junta de 3 a 8 jugadores contra el mismo código, a la vez: lo sortea el servidor, así que nadie elige secreto y nadie juega con ventaja; no hay turnos, así que una desconexión no congela a nadie; y siempre hay límite de intentos, que es lo que garantiza que una arena termine aunque alguien cierre la pestaña. La clasificación se ve en directo, pero los intentos de los demás no viajan —todos atacan el mismo código—: de cada rival solo se sabe cuánto ha gastado y cuál es su mejor número de fijas, que no dicen nada del código. Vive en tablas propias (`arenas`, `arena_players`, `arena_guesses`) y no toca ni una columna de las partidas clásicas. Las **reacciones rápidas** (3.10.2) dan cuatro frases hechas —suerte, casi, vaya jugada, buena partida— a un toque, en los tres idiomas; lo que se guarda es la clave, no la frase, así que por esa vía no entra texto libre que moderar. El **espectador** (3.10.1) deja mirar desde el vestíbulo una partida pública en curso: los nombres, las reglas, los intentos de los dos y el reloj, en directo. Lo que no se ve es ningún código: quien mira es `youAre === 0` y para esa cifra `secretsFor()` devuelve dos cadenas vacías, también al terminar, cuando los códigos se revelan a quienes jugaron. El chat de la partida se puede leer, no escribir, y la lectura se filtra por el identificador de la partida, porque el hilo de la pareja guarda conversaciones más antiguas que siguen siendo privadas.

La 3.10.0 trajo las razones para volver. El ranking dejó de premiar la insistencia: cada partida terminada reparte **puntos** por la dificultad de las reglas y por la economía de intentos, y la clasificación se reinicia **cada mes** conservando el total de siempre. Los nombres del ranking y de la lista de rivales se pueden pulsar y abren un **perfil público** —victorias, reglas preferidas, mejor partida, rachas e insignias— que no enseña nada que no fuera ya público y nunca el correo. Hay **siete insignias**, que se calculan al terminar la partida y se guardan, de modo que abrir un perfil no recorre `games`. Y hay una **lista de rivales**: con quién se ha jugado, el marcador de la pareja, un punto de presencia y un botón de desafío que pide la revancha de la última partida.

La 3.9.1 puso el motor de deducción al servicio de quien juega. Una partida puede crearse **con cuaderno**: una cuadrícula para marcar símbolos descartados y confirmados y un aviso cuando un intento contradice las pistas propias; es una opción de la partida, la valida el servidor y la heredan las revanchas, para que los dos jueguen con las mismas reglas. El ordenador de la práctica explica cada jugada —cuántos códigos le quedaban, cuántos le quedan y en cuántos grupos los parte—. Y hay **enigmas de deducción**: 72 puzles en tres dificultades, en solitario, sin cuenta y sin una sola fila en D1. La 3.9.0 abrió la etapa: el saber deductivo salió del rival de la práctica y pasó a `public/deduce.js`, y con él llegó **la partida que se explica**: al acabar cualquier partida, cada intento recibe una nota —óptimo, correcto, desperdiciado— y se señala la jugada tras la cual solo quedaba un código. Se calcula entero en el navegador, sin una lectura más en D1.

La 3.8.1 cerró la etapa 3 con la **tarjeta de fin de partida** —al acabar cualquier partida, contra una persona o contra el ordenador, la misma rejilla de emojis del código del día se puede compartir sin revelar ningún código—. La 3.8.0 estrenó el **código del día** —un secreto por día, el mismo para todo el mundo, un intento diario y una clasificación del día por intentos y tiempo— y la rejilla de emojis que se copia al terminarlo. La 3.7.0 abrió la **cadencia por correspondencia**, con uno o tres días por jugada y sin pausa al cerrar el juego, e hizo que el turno llegue mediante Web Push aunque la pestaña esté cerrada; si no hay una suscripción push válida, las partidas por correspondencia recurren al correo verificado, y `guess`, `passTurn` y el Cron comparten una deduplicación que impide avisar dos veces del mismo turno. Las invitaciones privadas esperan 48 horas y el mantenimiento ya no cierra una partida por correspondencia por llevar 48 horas sin actividad.

La 3.6.2 hizo que la primera visita abriera en el idioma del navegador cuando era inglés o francés, sin pulsar nada; la dirección sigue mandando sobre todo y una elección hecha a mano manda sobre el navegador. La 3.6.1 subió el selector de idioma a lo alto de la pantalla de acceso. La 3.6.0 cerró la etapa 1: una **invitación sobrevive al alta** y a la verificación en otro aparato. La 3.5.3 puso el **pulso numérico** en la portada y la 3.5.2 abrió la **práctica sin cuenta**. La 3.5.1 corrigió la inyección por nombres, unificó el contador de PIN, protegió el arranque de la bolsa, cerró ranking y lista pública detrás del correo y arregló las revanchas simultáneas. En la 3.5.0, `/admin` pasó a enseñar las horas en la zona de quien las mira. En la 3.3.3, el cronómetro Solo pasó a reiniciarse por intento. La 3.2.0 añadió el acuerdo de versión entre página y servidor. La 3.0.0 separó definitivamente entrar de crear una cuenta y la 3.1.0 fijó la puerta del correo: **no hay cuenta que valga sin correo verificado**.

El 12 de septiembre de 2026 la base de producción se vació a propósito: quedó una sola cuenta, `Diego`, y se borraron partidas, chat, presencia, buzón y todas las sesiones. El motivo es el mismo: arrancar sin ninguna cuenta que no cumpla la regla nueva.

«El camino a la 4.0.0» queda como historia: las seis etapas están entregadas y la séptima —el cierre— es esta versión. Lo que quedó fuera a propósito abre la lista de la siguiente, en «Lo que no entra en la 4.0.0».

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

En pantalla son dos relojes tipo ajedrez en la cabecera de la partida. El activo descuenta y pasa a ámbar bajo 30 segundos y a rojo bajo 10, y desde la 4.8.0 por debajo de diez segundos tiembla; el reloj por turno hace lo mismo desde los diez segundos, con el ámbar desde los veinte. Una victoria por tiempo no cuenta para las métricas de eficiencia del historial, igual que una victoria por abandono.

La práctica **contra el computador** también admite bolsa. Ahí solo corre la del jugador: el computador responde al instante y no gasta reloj. En **Solo** no aparece la bolsa: su reloj es siempre tiempo por intento y se reinicia después de cada propuesta o intento perdido.

### Cancelar, abandonar y caducidad

- El creador puede cancelar una partida mientras todavía espera un rival; no se registra victoria ni derrota.
- Abandonar una partida ya iniciada concede la victoria al rival y registra una derrota para quien abandona.
- Una partida pública que espera rival caduca después de 2 horas; una invitación privada espera 48 horas.
- Una partida activa normal se cierra como inactiva después de 48 horas sin actividad; una partida por correspondencia queda fuera de ese barrido y la gobierna su plazo por jugada.
- Cerrar sesión elimina inmediatamente la presencia del usuario. Para el contador general, se considera conectado a quien tuvo actividad durante los últimos 2 minutos.

### Revancha, historial y ranking

Al finalizar se puede proponer una revancha con las mismas reglas y el mismo rival. Se genera un código nuevo y cada jugador vuelve a escoger su secreto. El rival verá la invitación y podrá entrar mediante **Ir a la revancha**.

El historial muestra hasta las 40 partidas terminadas más recientes del jugador, con resultado, rival, fecha, reglas e intentos realizados. También resume el rendimiento de todo el historial competitivo: partidas, victorias, porcentaje de éxito, promedio de intentos al ganar y rachas. La mejor victoria y la victoria más difícil quedan destacadas; las victorias otorgadas por abandono no participan en esas métricas de eficiencia. La lista se puede filtrar por victorias, derrotas y empates. El ranking ordena por **puntos**. Cada partida terminada los reparte en el momento de terminar: ganar vale
diez, más la dificultad de las reglas —cuántos códigos posibles había, más dos si los intentos estaban contados
y dos más si había reloj— y más la economía de intentos, que premia descubrir el código pronto y deja de contar
a partir del séptimo intento. Un empate vale cuatro más media dificultad, perder una partida jugada vale uno, y
abandonarla vale cero: irse no puede salir más barato que terminar. Ganar por abandono del rival vale seis y no
reparte economía, porque no se descubrió ningún código.

La clasificación tiene dos cajones: **esta temporada**, que es el mes natural en UTC y empieza limpia cada mes,
y **desde siempre**, que no se reinicia nunca. De cada uno se muestra el Top 50, el total de jugadores y la
posición propia aunque quede fuera. Las partidas que ya estaban terminadas cuando llegó la fórmula entraron con
su base —diez, cuatro o uno— pero sin dificultad ni economía: preferimos un histórico honesto y algo más pobre
que unos puntos que nadie jugó.

### El perfil público, las insignias y los rivales

Los nombres del ranking y de la lista de rivales se pueden pulsar. El perfil enseña puntos, partidas, victorias
y acierto, el marcador completo, la temporada en curso, la mejor partida, las reglas más jugadas, las rachas y
las insignias. No enseña nada que no fuera ya público: ni el correo, ni la última conexión, ni el país de una
IP. Todo lo que se ve estaba ya calculado, así que abrir un perfil no recorre el historial de nadie.

Las insignias son siete y se ganan por cómo se juega, no por cuánto: primera victoria, código resuelto en
cuatro intentos o menos, ganar con cinco segundos o menos en el reloj, ganar con las reglas más duras, diez
victorias, cincuenta victorias y siete días seguidos jugando. Se calculan al terminar la partida y se guardan;
las que se acaban de ganar aparecen en la tarjeta final de esa misma partida. Desde la 4.7.0 están dibujadas
—un disco de un color de la marca y un trazo encima, en `BADGE_ART`— y el perfil enseña las siete: las ganadas
en color y las que faltan apagadas, con lo que queda cuando se puede contar sin preguntar nada más (3/10
victorias, 2/7 días).

La lista de **rivales** dice con quién se ha jugado, con el marcador de la pareja, un punto verde si está
conectado ahora y un botón de desafío que pide la revancha de la última partida que jugasteis: al rival le llega
como invitación en sus partidas, con su aviso, igual que cualquier otra revancha. No hay tabla nueva detrás: los
pares salen de los hilos privados que ya existían y el marcador, de las partidas terminadas entre los dos.

### La arena

Un modo aparte, y la respuesta al problema de fondo del juego: para una partida clásica hacen falta **dos personas libres al mismo tiempo**. La arena lo resuelve por el otro lado —junta de 3 a 8 contra el mismo código— y por eso vive en sus propias tablas: `games` es de dos, con `p1`, `p2`, dos secretos y un turno, y no puede representar esto sin deformarse.

- **El código lo sortea el servidor.** Nadie elige secreto, así que nadie juega con ventaja, y nadie tiene que esperar a que el rival piense el suyo.
- **No hay turnos.** Cada quien prueba cuando quiere: una desconexión no congela a los demás.
- **Siempre hay límite de intentos**, 6 o 10. Es lo que garantiza que una arena termine aunque alguien cierre la pestaña y no vuelva.
- **Las reglas son las de siempre**: números o colores, 4, 6 u 8 colores, de 3 a 6 posiciones, con o sin repetición.
- Quien la abre es el anfitrión y es el único que puede empezarla, con **3 jugadores como mínimo**. Se comparte por su código, igual que una partida privada.
- Una arena espera **2 horas** a llenarse. Ya empezada, se cierra sola cuando no queda nadie jugando —todos han acertado, agotado sus intentos o se han marchado— y el Cron barre las que quedan colgadas.
- **Solo se puede estar en una arena abierta a la vez**, y hay que esperar 30 segundos entre dos aperturas.

La clasificación se ve en directo, pero **los intentos de los demás no viajan**: todos atacan el mismo código, así que leer el intento de otro y su resultado sería jugar con su cabeza. De cada rival se sabe cuántos intentos ha gastado y cuál es su mejor número de fijas, que no dicen nada del código. Delante van quienes lo descifraron, y entre ellos manda quien lo hizo con menos intentos; después, quienes siguen jugando, por lo cerca que están; quien se marcha cierra la lista, conservando lo que jugó.

Marcharse antes de empezar es marcharse; si quien se va es el anfitrión, la arena se va con él. Ya empezada, marcharse no borra a nadie de la clasificación: la arena es de todos y lo jugado cuenta. **El código no sale de la tabla hasta que la arena termina**, salvo para quien acaba de acertarlo, que ya lo sabe.

La arena **no reparte puntos de temporada**. Es un modo nuevo y medirlo con la misma vara que una partida de dos deformaría una clasificación que acaba de estrenarse; si un día se decide contarlo, será con su propia cuenta y su propio recibo, como hizo `game_scores`.

### Mirar una partida

Desde el vestíbulo se puede mirar cualquier **partida pública en curso** que ya tenga a sus dos jugadores dentro. Se ven los nombres, las reglas, los intentos de los dos con sus picas y fijas, y el reloj, en directo.

Lo que no se ve es **ningún código**. Quien mira es `youAre === 0`, y para esa cifra `secretsFor()` devuelve dos cadenas vacías: ni el suyo, porque no tiene, ni el del rival, tampoco al terminar, cuando los códigos se revelan a quienes jugaron. Es la regla de siempre —los secretos no salen de una partida activa— aplicada a una pantalla nueva, y `test/spectator.test.js` recorre entera la respuesta que recibe quien mira para comprobarlo.

El chat de la partida se puede **leer, no escribir**, y lo que se lee es el de **esta** partida, filtrado por su identificador: el hilo privado de la pareja es más largo que la partida y guarda conversaciones anteriores que siguen siendo suyas.

La lista de partidas que se pueden mirar no cuesta una consulta más: sale de la misma lectura con la que el vestíbulo ya se dibujaba.

### El chat, los zumbidos y las reacciones rápidas

Hay un chat mundial en el vestíbulo y un chat privado por partida, exclusivo de sus dos jugadores. El de partida se cierra 24 horas después de terminar y conserva sus filas durante 7 días; el del vestíbulo conserva 24 horas.

El **zumbido** avisa al rival de que le toca. Requiere que esté presente en la partida y tiene 30 segundos de espera por emisor.

Las **reacciones rápidas** son cuatro frases hechas —«¡Suerte!», «Casi», «¡Vaya jugada!», «Buena partida»— a un toque, para quien juega desde el teléfono y no va a escribir. Viajan por el chat de siempre, con el mismo tipo que los avisos de la partida, y respetan la misma espera de 30 segundos que el zumbido. Lo que se guarda es la **clave** (`react_gg|Nombre`), no la frase: el servidor no sabe en qué idioma se leerá y no le hace falta saberlo, así que cada pantalla la lee en el suyo y por esta vía no entra texto libre que haya que moderar.

### El código del día

Cada día hay un código y es el mismo para todo el mundo: cuatro posiciones, cifras del 0 al 9, sin repetir, ocho intentos. Se juega una sola vez al día; al acertar —o al agotar los ocho intentos— la jugada se cierra, se revela el código y la persona aparece en la clasificación del día, ordenada por intentos y, a igualdad de intentos, por tiempo. El día empieza y acaba a medianoche **UTC**: una zona horaria por persona haría que el código dejara de ser el mismo para todo el mundo.

El secreto no está guardado en ninguna parte ni viaja al navegador. Se deriva del día con HMAC-SHA256 y el secreto `DAILY_SECRET` del Worker (`src/daily.js`), así que el mismo día produce siempre el mismo código y desde el navegador no hay nada que leer. La respuesta del servidor solo lleva el código cuando la jugada del día ya está cerrada, igual que una partida terminada.

La clave primaria de `daily_results` —día más cuenta— es lo que impide entregar dos veces el mismo día; el `requestId` de cada intento evita que un envío repetido por una conexión lenta gaste dos. Como escribe en D1, el código del día está detrás de la puerta del correo, como todo lo demás que escribe.

Al terminar, el resultado se copia como rejilla de emojis: un disco lleno por cada fija, un anillo por cada pica y un disco apagado por cada posición sin nada, una línea por intento. La rejilla **no contiene el código** —solo cuántas fijas y cuántas picas tuvo cada intento— y es la misma en los tres idiomas: solo se traduce el título que la acompaña. `test/daily.test.js` fija las dos cosas.

### La tarjeta de fin de partida

La rejilla del código del día es lo único que un jugador puede enseñar sin contar el código, y por eso no se queda en el código del día: al acabar **cualquier** partida —contra una persona, contra el ordenador o en solitario— el resultado ofrece la misma tarjeta. Dice cuántas posiciones tenía el código y en cuántos intentos se descifró, dibuja una línea por intento con las mismas marcas —disco lleno por fija, anillo por pica, disco apagado por posición sin nada— y acaba con la dirección del juego. Un intento perdido al tiempo se dibuja vacío, que es exactamente lo que cuenta de él.

`shareGridRows()` es la rejilla y la comparten el código del día y la tarjeta, así que las marcas nunca se separan. La tarjeta se calcula entera en el navegador a partir de los intentos que ya están en la pantalla: no gasta ni una lectura en D1 y no puede llevar dentro un código, ni el mío ni el del rival, porque solo ve cuántas fijas y cuántas picas tuvo cada intento. Quien únicamente mira una partida ajena no tiene nada que compartir. Donde el aparato sabe compartir, se abre el diálogo del sistema; donde no, el texto se copia al portapapeles. `test/share-card.test.js` fija las tres promesas: ninguna cifra en la rejilla, ninguna llamada al API y la tarjeta ofrecida en los tres finales.

### La partida que se explica

Al acabar cualquier partida —el código del día, una contra el ordenador, una en solitario o una contra otra persona— el resultado ofrece **Cómo se jugó**, plegado: quien no quiera análisis no lo ve. Abierto, cada intento lleva cuántos códigos seguían siendo compatibles con las pistas antes de jugarlo y cuántos quedaron después, una nota —**óptimo**, **correcto** o **desperdiciado**— y, donde corresponde, la marca de la jugada tras la cual solo quedaba un código: ahí se decidió la partida y lo demás fue escribirla.

La nota juzga la decisión, no la suerte. Se mide cuántos códigos deja cada intento **de media**, contando todas las respuestas posibles y no solo la que salió, y se compara con el mejor intento que encuentra el motor sobre la misma lista: un intento que parte bien la lista es bueno aunque el resultado saliera flojo, y uno que no descartó nada está desperdiciado aunque acertara a continuación. Acertar cuenta como cero restantes, así que jugar un código que todavía podía ser el bueno tiene a favor que puede ganar en el sitio. La lista se recorre entera hasta 6 000 códigos (por encima, una muestra de 1 500), para que dos primeros intentos idénticos salvo por el orden de los símbolos reciban la misma nota. Tocar la nota abre su porqué: cuántos dejaba de media, qué intento habría dejado menos y, si era el caso, que las pistas propias ya lo descartaban. La nota se calcula una vez por partida y se guarda en memoria, porque la pantalla final se repinta con cada sondeo. Un turno perdido al tiempo no recibe nota, porque no hubo decisión.

Todo sale de `Deduce.gradeGame()` y de los intentos que ya están en la pantalla: ni una lectura más en D1 y ningún secreto a la vista —el análisis solo ve cuántas fijas y cuántas picas tuvo cada intento, igual que la tarjeta—. En la partida contra otra persona son **mis** intentos, nunca los del rival. Rehacer una partida obliga a enumerar el espacio de códigos, así que hay un techo: por encima de 200 000 códigos (seis cifras con repetidos son un millón) no se pinta nada, que es mejor que una nota lenta en el teléfono de quien juega. `test/deduce.test.js` fija el techo, las notas y la jugada decisiva.

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
- El idioma se puede cambiar en cualquier momento: en la portada y en el buzón, con su propio selector; en el resto, desde la rueda de ajustes de la cabecera —en el ordenador, al pie del rail—. En el teléfono, la partida y la práctica ocupan la pantalla entera con su propia cabecera: la rueda vuelve al salir.
- Entrar pide a la vez el nombre (o el correo) y la contraseña, en un solo formulario.
- Se puede enviar con Enter desde los campos principales, además de usar los botones. En la partida y en la práctica el intento no es un campo de texto sino el muelle (véase «La partida en el teléfono»), y el teclado físico escribe en él: cifras, retroceso y Enter.
- Las banderas indican el país detectado, pero no afectan las reglas.
- Puede emitir sonido, vibración o una notificación cuando llega el turno o entra un rival, según los permisos del dispositivo.
- Los avisos de victoria, derrota y empate tienen sonidos distintos.
- En modo numérico, el cero se muestra con una barra para diferenciarlo mejor del ocho.

## Arquitectura y archivos

- `public/index.html`: interfaz completa del juego, estilos, traducciones y cliente API.
- `public/manifest.webmanifest`, `public/sw.js`: instalación como PWA y service worker. Recibe el payload Web Push, enseña el aviso traducido y abre la partida exacta al pulsarlo. La lista `screenshots` del manifest **es generada**: la escribe `tools/make-screenshots.mjs`.
- `public/screenshots/`: las capturas que Chrome enseña al ofrecer la instalación. **Son generadas: no se editan a mano.**
- `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`: iconos de la aplicación instalada.
- `public/deduce.js`: el motor de deducción de la casa. Enumera y cuenta el espacio de códigos, filtra por pistas, mide cómo un intento parte la lista, busca el mejor intento y puntúa una partida terminada. Nunca recibe un secreto: solo intentos y sus puntuaciones. **Se carga antes que `computer-ai.js`.**
- `public/computer-ai.js`: rival local de práctica. Desde la 3.9.0 no guarda saber propio: es el nombre por el que la práctica llama al adversario, y toma de `deduce.js` la generación de candidatos y las estrategias por dificultad.
- `public/puzzles.json`: los enigmas de deducción. **Es generado: no se edita a mano.** Sale de `node tools/make-puzzles.mjs`, que es determinista, y una prueba lo regenera y lo compara byte a byte. No guarda ninguna solución: cada enigma tiene una única combinación compatible con sus pistas, así que comprobar una respuesta es comprobar que es compatible.
- `public/admin.html`: panel reservado de administración, en pestañas.
- `public/audio/`: los dos sonidos del juego —el aviso de mensaje y el zumbido—, servidos tal cual.
- `public/robots.txt`, `public/sitemap.xml`: indexación. Abren el juego a los buscadores, cierran `/admin` y `/api` y declaran las tres direcciones de idioma.
- `public/rules-es.html`, `public/rules-en.html`, `public/rules-fr.html`: las reglas como página pública. **Son generadas: no se editan a mano.** Salen de `RULES`, en `public/index.html`, con `python tools/make-rules-pages.py`.
- `public/install-es.html`, `public/install-en.html`, `public/install-fr.html`: la guía de instalación como página pública. **Son generadas: no se editan a mano.** Salen de las claves `install_*` y de `INSTALL_ART`, en `public/index.html`, con `python tools/make-install-pages.py`.
- `public/og-es.png`, `public/og-en.png`, `public/og-fr.png`: la tarjeta social de 1200×630 que se ve al compartir el enlace, una por idioma. Se generan con `python tools/make-og-images.py` y necesitan `python -m pip install pillow`.
- `src/index.js`: Worker, rutas, API, acceso a D1 y operaciones administrativas. Aquí vive también `settleFinishedGame()`, por donde pasan todos los finales de una partida, y `safeParams()`, que es lo que impide que un cuerpo mal formado se convierta en un error 500.
- `src/game.js`: reglas puras, validaciones, cronómetro y sanitización del estado.
- `src/security.js`: PIN, autenticación, sesiones, limitación de intentos y lectura del país y la IP que pone Cloudflare.
- `src/chat.js`: permisos, hilos privados, mensajes incrementales y retención del chat.
- `src/score.js`: la cuenta de puntos, sin base de datos. Dada una partida terminada dice lo que vale para cada uno de los dos: la dificultad sale del número de códigos posibles más el castigo voluntario de los intentos contados y el reloj; la economía, de en cuántos intentos se descubrió el código. Es pura, así que se comprueba sin levantar un Worker.
- `src/season.js`: todo lo que esa cuenta deja escrito. `recordFinishedGame()` es el único camino por el que una partida entra en el ranking —la llaman los cuatro finales y la corrección de un administrador, y el recibo de `game_scores` impide contar dos veces—, y de las filas que escribe salen el ranking por temporada, el perfil público, las insignias y la lista de rivales.
- `src/arena.js`: la arena. De 3 a 8 jugadores contra un código que sortea el servidor, sin turnos y con límite de intentos siempre. Lleva sus propias tablas: `games` es de dos —`p1`, `p2`, dos secretos y un turno— y no puede representar esto sin deformarse. Dentro está también la clasificación en directo, `rankPlayers()`, que es pura y se prueba sin base de datos.
- `src/daily.js`: el código del día. Deriva el secreto del día con HMAC-SHA256 y `DAILY_SECRET`, resuelve los intentos y arma la clasificación del día.
- `src/maintenance.js`: mantenimiento horario fuera del camino crítico de las peticiones.
- `src/push.js`: suscripciones y avisos de turno. Firma VAPID y cifra `aes128gcm` con Web Crypto, sin dependencias; si una correspondencia no tiene push válido, usa el correo verificado.
- `src/admin.js`: herramientas de mantenimiento del panel: resumen, ficha de usuario, lista de partidas con sus reglas, arenas —lista, clasificación y cierre—, borrado, limpieza de partidas y consola SQL.
- `src/rename.js`: el cambio de nombre de usuario y su reescritura en todas las tablas que guardan el nombre —partidas, chat, ranking, insignias, arena y código del día—. También es donde se decide cuándo **no** se puede cambiar: con una partida o una arena abiertas, no.
- `src/recovery.js`: los enlaces de un solo uso que llegan por correo —verificar la dirección y reponer el PIN—, su emisión, su caducidad y el correo que los lleva en los tres idiomas.
- `src/feedback.js`: el buzón de sugerencias y errores: validación, barandillas del endpoint público, consultas del panel y el aviso por correo.
- `migrations/0001_initial.sql`: esquema reproducible de D1. No es un residuo de la migración desde Google y no debe eliminarse. Las migraciones siguientes añaden o ajustan: `0002` el chat, `0003` los hilos privados, `0004` el origen de cada cuenta, `0005` el buzón de sugerencias, `0006` la bolsa de tiempo, `0007` los índices necesarios para permanecer dentro de D1 Free, `0008` el correo y la recuperación del PIN, `0009` la fecha del último cambio de nombre, `0010` el nombre anterior, `0011` la zona horaria, `0012` la lengua de avisos, las suscripciones push y la deduplicación por turno, `0013` los resultados del código del día, `0014` la opción de cuaderno de la partida, `0015` los puntos por temporada y el recibo de cada partida contada, `0016` las insignias y las rachas, y `0017` la arena con sus tres tablas.
- `test/`: pruebas automáticas de reglas, rutas, teclado y regresiones.
- `tools/make-icons.mjs`: genera los cuatro PNG de la aplicación instalada: la vaca tranquila sobre azul. Se ejecuta con `npm run icons`.
- `tools/make-puzzles.mjs`: fabrica `public/puzzles.json`. Usa el mismo `public/deduce.js` que el navegador, parte de una semilla fija y quita de cada enigma las pistas que sobran hasta dejar el más apretado con solución única. Se ejecuta con `npm run puzzles`.
- `tools/make-rules-pages.py`: convierte `RULES` en las tres páginas públicas de reglas. El texto no se duplica: la única fuente sigue siendo el juego.
- `tools/make-install-pages.py`: convierte los pasos de instalación del juego en las tres páginas públicas de la guía. Tampoco duplica nada: lee `I18N` e `INSTALL_ART`.
- `tools/site_style.py`: la piel común de las páginas públicas —colores, tipografías y tarjetas del juego—. La usan los dos generadores anteriores para que no se separen con el tiempo. Desde la 4.3.0 lleva los tokens de Plaza con los mismos nombres que el `:root` del juego, porque los dibujos de `INSTALL_ART` que se copian en la guía de instalación los piden por su nombre; `test/vaca.test.js` comprueba que cada `var(--…)` de las páginas está definido.
- `tools/make-screenshots.mjs`: toma con Chrome sin ventana las capturas del juego real que Chrome enseña al ofrecer instalarlo, y reescribe con ellas la lista `screenshots` del manifest. Necesita el servidor local en marcha. Se ejecuta con `npm run screenshots`.
- `tools/make-og-images.py`: genera las tres tarjetas sociales: fondo crema, la baldosa azul de la vaca, el nombre, el lema y una jugada de ejemplo con la fija en disco y la pica en anillo. La vaca no se vuelve a dibujar: sale de `public/icon-512.png`, así que se ejecuta después de `npm run icons`. Usa las tipografías de reserva del CSS en Windows —Segoe UI Black por 'Bricolage Grotesque', Segoe UI por 'Figtree', Consolas por 'JetBrains Mono'—, así que no descarga ninguna fuente. Solo hay que volver a ejecutarlo si cambia la marca o el lema.
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

Con `screenshots` en el manifest, Chrome en Android abandona la barrita mínima y abre el diálogo grande, con imágenes y descripción. Las de `public/screenshots/` son del juego de verdad, no montajes: `node tools/make-screenshots.mjs` levanta Chrome sin ventana, conduce la aplicación por su protocolo de depuración —entra, monta una práctica con tres intentos y un cuarto a medias en el muelle— y guarda cuatro capturas; después reescribe la lista `screenshots` del manifest con lo que acaba de tomar, para que el manifest nunca hable de una imagen que no existe.

**Necesita el servidor local en marcha.** El script apunta por defecto a `http://127.0.0.1:8788`; `PF_URL` lo cambia y `CHROME_PATH` señala otro navegador. Toma el juego **de día** —emula `prefers-color-scheme: light`, porque el día es la cara de Plaza aunque la máquina esté en modo oscuro— y la captura del lobby entra como `Ana` con PIN `1234`, que tiene que existir con el correo verificado en la base local. Desde la 4.6.0 la captura ancha, la del escritorio, también entra como `Ana` y juega tres intentos contra el computador: es la que enseña el rail y los dos diarios a la vista.

Chrome descarta las capturas que se salen de sus límites —entre 320 y 3840 px, proporción máxima de 2,3 y la misma forma dentro de cada `form_factor`—, así que `test/install.test.js` los comprueba leyendo la cabecera de los propios PNG.

## Identidad visual

Desde la 4.2.0 la aplicación usa la identidad **Plaza**: una plaza pública, clara y de colores francos, en lugar del tablero de madera oscura de **Mesa** (2.4.0 → 4.1.0). La propuesta completa —sistema, pantallas y animaciones— se validó sobre un lienzo de diseño antes de tocar el código, y se está implementando por lotes (véase «La serie 5: la identidad Plaza»). Los colores viven en `:root`, dentro del bloque `<style>` de `public/index.html`, con el modo noche debajo, en `@media (prefers-color-scheme: dark)`; `data-theme="light|dark"` en `<html>` podrá forzarlo cuando exista el interruptor.

| Variable | Día | Noche | Uso |
| --- | --- | --- | --- |
| `--crema` | `#FFF5E8` | `#120F24` | Fondo de página |
| `--papel` / `--papel-2` / `--hueco` | `#FFFFFF` / `#FFF9F1` / `#F7F0E4` | `#1D1838` / `#231D45` / `#171233` | Tarjetas, y el hueco de campos y filas secundarias |
| `--linea` / `--linea-2` | `#E9DFD0` / `#F2ECE0` | `#2E2850` / `#2A2448` | Bordes de 2 px y rebordes duros de los controles |
| `--tinta` / `--bruma` | `#1B1638` / `#625B7A` | `#F6F1FF` / `#A79FC4` | Texto principal y secundario |
| `--azul` | `#2F5BFF` | `#4F79FF` | La acción primaria y el turno propio |
| `--coral` | `#FF6B5E` | `#FF7A6E` | La energía: probar, revancha, avisos |
| `--violeta` | `#7C5CFF` | `#9B82FF` | La arena y el chat del rival |
| `--sol` | `#FFC531` | `#FFC531` | El código del día y las insignias |
| `--fija` | `#12A150` | `#39D37E` | Fijas: disco lleno |
| `--pica` | `#E0731A` | `#F6A040` | Picas: anillo |
| `--error` | `#B23A31` | `#FF8A80` | Errores |

Cada color de marca tiene su variante oscura para el reborde (`--azul-2`, `--coral-2`…), su fondo suave (`--azul-suave`…) y, cuando hace falta contraste sobre fondo claro, su tono de texto (`--azul-texto`, `--fija-texto`, `--pica-texto`). Los nombres de **Mesa** (`--ink`, `--panel`, `--edge`, `--text`, `--muted`, `--accent`, `--pink`) siguen existiendo como alias de los nuevos, para que cualquier trazado que el script pinte por su nombre viejo siga encontrando un color; no se usan en la hoja de estilos y se retirarán al cerrar la serie.

Los controles son **táctiles**: cada botón, ficha y selector lleva un reborde duro de 4 px debajo (`box-shadow: 0 4px 0`) que desaparece al pulsar mientras el control baja esos mismos 4 px. Una sola acción llena por pantalla; lo secundario va en blanco con borde (`.btn.ghost`, y `.btn.pink`, que ya no es rosa), y `.btn.green` pasó a ser el botón coral de la energía —probar, revancha, jugar el código del día—, porque el verde volvió a ser solo información.

Reglas que conviene respetar al tocar el diseño:

- El verde y el ámbar son **información del juego**. No se deben usar para decorar; si el fondo compite con ellos, las pistas dejan de leerse.
- Las fichas se distinguen **también por forma**: la fija es un círculo relleno y la pica es un anillo (`.pip.f` y `.pip.p`). Es lo que permite jugar con daltonismo rojo-verde; no se debe reducir a una diferencia de color.
- Tipografías: `Bricolage Grotesque` (800) en los títulos y cifras fuertes, `Figtree` en la interfaz y `JetBrains Mono` en códigos y relojes. El cero de JetBrains Mono lleva punto interior, que lo separa del 8 y de la O; es la razón de conservarla.
- El array `COLORS` del script son las fichas de colores del modo Mastermind. No forma parte de la paleta de la interfaz y no debe repintarse con ella.
- Una sola acción primaria por tarjeta. Lo secundario baja a `.btn.ghost` y lo terciario a `.chipbtn`.
- La frontera es **icono o prosa**, y desde la 4.2.0 la prosa también se quedó sin emoji: títulos, botones, fichas, avisos, notificaciones y líneas de estado no llevan ninguno. Solo se conservan donde son contenido escrito por o para el chat (`react_*`, `chat_nudged`) y en la rejilla del código del día que se copia como texto. Un emoji que hace de control o de indicador se dibuja. Ojo con los que el JavaScript reescribe: el botón de silenciados llevaba su icono en el marcado y `updateChatLabels` se lo borraba en cada refresco poniendo el emoji de vuelta. Si un elemento se repinta desde el script, el icono tiene que salir de `ico()` ahí también, no solo de `data-ico`.
- **Nada de emoji ni de glifos Unicode como icono.** Vienen de bloques distintos, pesan distinto y cada sistema los dibuja a su manera; algunos se pintan en color y arruinan la ficha que los contiene. Todos los iconos viven en la constante `ICONS` de `public/index.html` y se piden con `ico(nombre, tamaño)`. Los botones estáticos llevan `data-ico` y los rellena `pintarIconos()` desde `applyI18n`, así que no hay trazados repetidos entre el marcado y el script.
- Las ocho fichas del modo colores se distinguen **por forma**, no solo por color: es lo que permite leer un código con daltonismo o en una pantalla mala. Están en `SYMBOL_D`, dibujadas sobre una rejilla de 24 e **igualadas por área de tinta**, no por caja: seis rondan las 176 px² y los dos triángulos se quedan en el 83 %, que es la compensación óptica habitual para que no parezcan más grandes. Si se añade o cambia una forma hay que volver a igualarla; medir la caja no sirve.
- La marca es una vaca pequeña y risueña, por *Bulls and Cows*; hasta la 4.2.0 fue una cabeza de toro. Los mismos trazados viven en **cuatro** sitios: `VACA_BODY` y `VACA_FACE` en el script y el logo de la cabecera, los dos en `public/index.html`; las dos vacas de `public/admin.html`; y el generador `tools/make-icons.mjs`. `test/vaca.test.js` comprueba que no se separan. Si cambia la marca hay que cambiarla en los cuatro y volver a ejecutar `npm run icons`, `python tools/make-og-images.py` y `npm run screenshots`.
- `tools/make-icons.mjs` no tiene dependencias: rasteriza y escribe el PNG por su cuenta porque la máquina de desarrollo no tenía ninguna herramienta de imagen instalada. Sabe rellenar y trazar caminos, círculos y elipses; el hocico, que es un rectángulo de esquinas redondas, lo pinta como una cápsula gruesa de tinta con otra más fina encima. Si algún día se añade `sharp` o `resvg`, ese archivo se puede sustituir por una llamada a esa herramienta sin tocar nada más.
- Cada cambio de texto se debe revisar en español, inglés y francés a 375 px de ancho. El francés es el idioma más largo y es el primero que desborda los controles estrechos.
- El texto de las guías perdió todas las tildes en algún momento y se restauró en 2.4.0. No era una limitación de la fuente: Helvetica en `reportlab` dibuja `é è ê ç ñ` y el apóstrofo tipográfico `’` sin problema. En francés se usa `’`, no la comilla recta, porque la recta rompería los literales de Python entre comillas simples.
- `create_strategy_translations.py` guarda **dos idiomas en el mismo diccionario**: inglés y francés. Cualquier cambio masivo debe limitarse al bloque que toca, porque hay palabras que existen en los dos (`Deduction`, `Decision`) y acentuar el inglés lo estropea. Las claves del diccionario y los nombres de archivo tampoco se tocan.
- Las guías en PDF llevan la paleta Plaza desde la 4.3.0 —antes, la de Mesa—, **sobre papel claro**: son para descargar e imprimir, y un fondo oscuro a sangre se bebe la tinta. Sus acentos se oscurecen respecto a los de la pantalla para que un filete de 1 pt se lea impreso. Los colores viven en las constantes de `tools/pdf/`; si cambia la paleta hay que repintarlos y volver a ejecutar `build.py`.
- Los elementos con `data-i18n` reciben `textContent` al traducir, así que un SVG dentro de ellos se borraría al cambiar de idioma. **No es un impedimento para poner iconos**: se envuelve la etiqueta en su propio `<span data-i18n>` y el icono queda como hermano, fuera del alcance del traductor.

  ```html
  <button class="btn" onclick="show('create')">
    <svg …></svg><span data-i18n="lobby_create">Crear partida</span>
  </button>
  ```

- **Nada de `flex:1` en filas de botones con texto traducido.** Fuerza anchos iguales ignorando el contenido, y la etiqueta más larga se desborda; fue lo que sacaba «Illimité» del control segmentado en francés. Con `flex:1 1 auto` cada botón parte de su propio texto y la fila envuelve si no cabe.

### La mascota

La vaca no es solo el logo: también es la mascota que reacciona al estado de la partida. Es la del lienzo de diseño, trazo por trazo: un solo dibujo —cuernos amarillos, orejas, dos manchas, hocico rosa— y cuatro humores que solo cambian ojos, cejas y boca. Se dibuja desde JavaScript con `vacaSVG(humor, ancho)` porque tiene que poder entrar en sitios que se pintan con `innerHTML`, como el banner de fin de partida.

| Humor | Dónde aparece |
| --- | --- |
| `calm` | Logo de la cabecera, banner de empate |
| `alert` | Barra de turno, solo cuando te toca a ti; el héroe de la portada, mirando una jugada a medias |
| `happy` | Banner de victoria, con cuatro confetis de color alrededor |
| `sad` | Banner de derrota |

Tres detalles que conviene no deshacer:

- Lleva sus colores escritos en el propio SVG (`fill` y `stroke`), no en la hoja de estilos: es la misma sobre crema y sobre noche, como pedía el lienzo, y así se copia tal cual a `/admin` y al generador de iconos. El SVG raíz lleva `fill="none"`, porque los trazos de línea —el interior de las orejas, el flequillo, la boca— no declaran relleno y sin él se pintarían negros.
- En la barra de turno la vaca la muestra y la esconde **el CSS**, no el JavaScript: aparece con `.turnbar.mine` y desaparece en cuanto la clase cambia. El marcado no la repite: la barra lleva un hueco `<span data-vaca="alert">` que `pintarIconos()` sustituye por la vaca entera, y como el hueco desaparece al sustituirlo, pintar dos veces no hace nada.
- Sus piezas no llevan clases, así que `.turnbar .dot` —el punto que parpadea— no puede alcanzar sus ojos. Era el motivo de los nombres `t-fill`, `t-line` y `t-dot` del toro, que ya no existen.

`ruleSVG(ancho)` dibuja el subrayado a dos pasadas que va bajo el resultado. Desde la 4.4.0 el saludo del vestíbulo ya no lo lleva, ni lleva la vaca: lleva la inicial de quien juega.

### La portada y el vestíbulo (4.4.0)

Son las dos pantallas del lienzo que más se ven, y el lote 3 las copia de sus artboards («Acceso» y «Lobby»). Una regla las ordena a las dos: **una sola acción llena por pantalla**. En la portada es «Probar ahora», en coral; en el vestíbulo, la tarjeta azul de «Crear partida». Todo lo demás es blanco con borde o, cuando tiene que pesar sin competir —«Entrar», «Unirse»—, tinta.

**La portada** empieza por el idioma y un héroe dibujado: cuatro fichas con un «?» amarillo, una fila de pistas —dos fijas en disco, una pica en anillo, un hueco— y la vaca alerta mirándolas. Es un dibujo con sus colores escritos, como la vaca, y lleva `aria-hidden`: no dice nada que no diga el título de debajo. Luego el título, «Adivina el código antes que tu rival.», la práctica sin cuenta, la raya con la «o», el formulario en su tarjeta y el pulso público al final. Al pedir el enlace del PIN o elegir uno nuevo, `setAuthMode` marca la sección con `data-mode="forgot"` y el héroe, el título y la práctica se apartan: quien llega desde un correo de recuperación va a lo suyo.

**El vestíbulo**, de arriba abajo:

- **El saludo**: la inicial de quien juega sobre coral —pulsarla abre su perfil— y, debajo, «Temporada de septiembre · 240 pts · 3.º». Esa línea sale de `leaderboard` con `meOnly`, que devuelve solo la fila propia y su puesto —dos lecturas por clave e índice, sin el Top 50 ni el total—; se pide **al entrar** al vestíbulo, se recuerda quince segundos para que ir y volver del ranking no la pida otra vez, y **nunca** entra en el sondeo de diez segundos. `test/season.test.js` fija las tres cosas.
- **Crear partida**, unirse por código y **el código del día**: una baldosa amarilla con un anillo que cuenta los intentos gastados hoy sobre ocho y la cuenta atrás hasta la medianoche UTC. No pregunta al servidor: lee lo que `pf_daily` recuerda de este aparato, como ya hacía la tarjeta anterior, y se repinta con el sondeo para que la cuenta atrás no se pare.
- **Cuatro modos** en rejilla —practicar, la arena, enigmas y el ranking—, cada uno con su dibujo. La arena se abre desde su baldosa; las arenas ya abiertas salen en la lista pública.
- **Tus partidas en curso**, privadas y públicas juntas, con el historial y los rivales en la cabecera. Delante va la revancha que te han propuesto y después las que esperan tu jugada, con el borde azul y la pastilla «Te toca». Como con cada una solo hay una cosa que hacer —entrar—, la fila entera es el botón.
- **Partidas públicas**: las que esperan rival, las que se pueden mirar y las arenas, en una sola lista con el recuento de gente en línea y el botón de recargar. Aquí sí hay que elegir —unirse o mirar—, así que el botón va aparte y la fila es solo texto.

Cada fila lleva la inicial de la persona sobre un color de la marca que sale de su nombre, así que la misma persona tiene el mismo color en todas las filas y en todos los aparatos. Los títulos dicen quién y qué —«Contra Marco · SZ93», «Théo busca rival», «Sara contra Pablo»— y el detalle, las reglas.

El francés elide «de» ante vocal, y dos textos nuevos lo tropezaban: «Saison d’octobre», «L’arène d’Ana», «Revanche d’Olga». `tElide(clave, valores, en_claro)` decide la elisión con el valor en claro antes de meter su HTML, porque el nombre llega envuelto en su bandera.

Cambiar de idioma repinta el saludo y las listas con la última respuesta del vestíbulo (`paintLobby`), sin pedir nada al servidor ni esperar al sondeo.

### La partida en el teléfono (4.5.0)

El lote 4 copia tres artboards del lienzo —«Partida», «Partida larga» y «Teclado desplegado»—, y lo que resuelve es de geometría. En una partida de doce intentos la entrada del código estaba arriba y el diario abajo, así que cada jugada obligaba a subir para escribir y a bajar para leer; y en el teléfono el teclado del sistema, al abrirse, tapaba justo la mitad de la pantalla donde estaban las pistas.

**La partida es una capa fija de tres pisos.** `s-game` y `s-practice-game` llevan la clase `gshell`: arriba la cabecera (`gbar`) con volver, el código, las reglas, la pausa, el chat y los dos relojes; abajo el muelle (`gdock`); y en medio `gbody`, lo único que se desplaza. `show()` pone `in-shell` en el `body`, que esconde la marca y el botón flotante del chat y deja quieta la página de debajo. La rueda de ajustes se va con la marca: dentro de una partida no hay nada que ajustar que no pueda esperar a la vuelta, y cada píxel de alto es diario. El chat de la partida pasa a la cabecera porque el botón flotante caía encima de «Adivinar»; sus avisos —el contador y la sacudida del zumbido— siguen al botón que se ve (`chatLauncher()`).

**Los relojes viven en la cabecera, los de las tres formas.** `renderClocks()` pinta `g-bank-mine` y `g-bank-theirs` —la inicial, el nombre o «Te toca», y el tiempo—: la bolsa de cada uno, el turno que corre y el entero de quien espera, o el plazo de la correspondencia. Sin reloj quedan la inicial y a quién le toca. Quien juega es coral, como en su saludo del vestíbulo; el rival lleva el color de su nombre y nunca el mismo que el tuyo. El chip del cronómetro, el de los intentos y la fila de jugadores se fueron porque decían lo mismo en otro sitio: lo que queda de intentos está en la línea de debajo del turno («Intento 5 de 10 · el turno pasa si el reloj llega a cero»). `turnLeft()` cuenta el turno desde la foto del servidor, como antes; quien decide sigue siendo el servidor.

**El intento ya no es un campo de texto.** Un campo abre el teclado del sistema, y en el teléfono ese teclado tapa el diario entero. El muelle (`makeDockPad`) guarda el intento, dibuja sus fichas —la que falta, con el cursor— y un teclado propio de cifras o de fichas de color, con borrar y «Adivinar». El teclado se pliega con la pestaña de arriba y la elección se recuerda en `pf_dock_open`; plegado, quedan las fichas y «Adivinar» en una sola fila. Cuando no te toca se pliega solo y se apaga. El teclado físico sigue sirviendo: mientras el muelle está en uso, el documento escucha las cifras, el retroceso y Enter, salvo que el foco esté en un campo de texto —el chat se queda con sus teclas—, y un clic de ratón sobre una ficha no se lleva el foco, para que Enter envíe el intento en vez de repetir la última ficha.

**Tachado sale lo que no tiene sentido pulsar, y nada más.** Un símbolo ya escrito cuando las reglas prohíben repetir sale tachado y apagado: no se puede. Lo que el jugador descartó en su cuaderno sale tachado pero se puede pulsar, porque un descartado sirve de relleno para aislar a otro. El teclado no deduce por nadie —ni lee las pistas ni tacha lo que ellas descartan—: eso sería jugar por el jugador en un juego de deducción. `test/phone-game.test.js` comprueba que `makeDockPad` no mira ni `Deduce` ni los intentos.

**El diario pone lo más reciente arriba.** Dos pestañas —«Tus intentos · 12» y «Marco · 12»— sustituyen a las dos columnas, y la cerrada lleva un punto cuando el otro lado ha jugado desde la última vez que se miró. Cada fila es el número, las fichas y tantas marcas como posiciones: disco lleno la fija, anillo la pica, anillo punteado la posición sin nada; la pista se lee por forma y el texto «1F · 2P» de antes sobraba. A partir del cuarto intento aparece encima un friso de pastillas, una por intento con sus fijas y picas en pequeño, que salta al que se pulse; pestañas y friso se quedan pegados arriba mientras se baja. La lista se rehace solo cuando cambia (`renderJournal` compara una clave): el sondeo llega cada dos segundos y rehacerla en cada vuelta movía lo que se estaba leyendo. Al terminar la partida el diario sube una vez, para que el resultado no quede fuera de la vista de quien estaba repasando un intento viejo.

**Tu código va plegado.** «Tu código secreto ••••» se enseña de un toque y se vuelve a plegar; al terminar la partida ya no hay nada que guardar y se ve solo.

**La práctica usa la misma pantalla.** Ningún lote la nombraba y es lo primero que juega quien llega por «Probar ahora», así que comparte cabecera, muelle y diario, con la pestaña del computador y lo que pensó en cada intento. Mientras piensa, el muelle se apaga en su sitio en vez de esconderse: esconderlo medio segundo en cada turno hacía saltar el diario. La dificultad pasó a la línea de reglas y los contadores de intentos solo aparecen cuando hay límite, porque sin él ya están en el título y en las pestañas.

En el ordenador la capa se abre en columnas: véase «El ordenador (4.6.0)».

### El ordenador (4.6.0)

El lote 5 copia dos artboards del lienzo —«Partida en pantalla grande» y «Lobby en pantalla grande»— y su rejilla de tres anchos. Hasta la 4.5.0 el ordenador enseñaba el teléfono en una columna centrada de 520 px; ahora el juego ocupa el navegador hasta 1600 px y, a partir de ahí, se centra.

**Tres anchos, una sola interfaz.** Por debajo de 720 px, el teléfono de siempre: nada de lo que sigue lo toca. De 720 a 1100, la marca se convierte en un rail de iconos a la izquierda y la partida se abre en dos columnas, jugar y diario. Por encima de 1100, el rail lleva sus nombres y la partida gana una tercera columna para el chat. Todo es CSS sobre el mismo marcado: la clase `has-rail` del `body` y dos `@media`.

**El rail es la marca.** `.brand` pasa a ser una barra fija y oscura —de día y de noche— con el logo, seis sitios (inicio, jugar, práctica, arena, enigmas y ranking), la rueda de ajustes y la inicial propia, que abre el perfil. Solo existe para quien tiene cuenta: la portada, la puerta del correo y el invitado siguen con la cabecera de siempre, porque `show()` pone `has-rail` según haya sesión y según la pantalla. Salir de una partida o de una práctica por el rail pasa por la misma puerta que su botón de volver —`quitGame()` avisa al servidor de que te vas y la partida sigue abierta; la práctica se guarda—, así que ningún atajo cuesta progreso. El logo sigue inerte dentro de una partida, como antes. El rail no se desplaza, porque recortaría el menú de ajustes, que se abre a su derecha; en una ventana baja se compacta y se queda en iconos.

**La partida en columnas.** En `s-game` y `s-practice-game` la capa fija se vuelve una rejilla: la cabecera y el cuerpo ceden sus piezas con `display:contents` y el CSS las ordena con `order` —relojes, turno, muelle, código, cuaderno—, de modo que el teléfono conserva su orden de lectura y el marcado no se duplica. El muelle deja de ser el piso de abajo y pasa a ser una tarjeta de la columna de jugar, con el teclado siempre a la vista —aquí no hay teclado del sistema que tape nada, así que plegarlo no sirve— y apagado en su sitio cuando no toca. El diario y el chat miden lo que la ventana y se quedan quietos; si la columna de jugar no cabe —el final, con su tarjeta y su análisis—, es ella la que se desplaza. Con el turno propio y un ratón, la barra del turno añade «Enter para adivinar».

**Los dos diarios a la vista.** Cuando su columna mide al menos 480 px, el diario se parte en dos tarjetas —«Tus intentos · 5, hacia el código de Marco» y «Marco · 4, hacia tu código»—, cada una con su propio desplazamiento; con menos, se quedan las pestañas del teléfono. Lo decide el ancho del diario (`syncJournalWidth`, con un `ResizeObserver`) y no el de la ventana, porque el rail y el chat se comen su parte: a 1440 px caben los dos, a 1280 no. La práctica contra el computador lo aprovecha igual; la práctica sola tiene una sola lista.

**El chat siempre abierto.** Por encima de 1100 px el chat no se abre ni se cierra: `placeChat()` mueve el mismo panel —las mismas funciones, el mismo sondeo— a la columna derecha del vestíbulo o a la tercera de la partida, y lo devuelve a su esquina en cualquier otra pantalla o ventana. En el vestíbulo, las conversaciones privadas dejan de ser burbujas flotantes y pasan a ser pestañas encima de los mensajes, con la del vestíbulo delante. Escape, dentro del chat anclado, devuelve el teclado al muelle.

**Siempre a la vista no es sondear más.** Un chat abierto pregunta cada 2,5 s; anclado sin más, eso habría multiplicado por cuatro las peticiones del vestíbulo de cada ordenador. `chatLive()` mantiene el ritmo del chat cerrado —10 s en el vestíbulo, 3 s en la partida— mientras nadie lo usa, y solo acelera mientras se escribe en él y durante el minuto siguiente. `test/desktop.test.js` lo fija junto con el resto del lote.

**El vestíbulo a lo ancho.** Crear partida a la izquierda; unirse y el código del día a la derecha; los cuatro modos en una fila; las partidas propias y las públicas una al lado de la otra; y el chat del vestíbulo en su columna, pegado a la ventana mientras se baja. El lienzo ponía en esa columna la gente conectada y el podio del ranking: se quedaron fuera porque piden lecturas que el sondeo del vestíbulo no hace —solo trae el recuento— y este lote no añade lecturas a D1. El resto de pantallas se centra en una columna de 600 px junto al rail.

### Volver cada día (4.7.0)

El lote 6 copia los artboards del lienzo que dan razones para volver —«El código del día», «Clasificación de la temporada», «Perfil, insignias y rivales», «Enigmas», «La arena» y «Tarjeta de fin»— y tiene una regla que vale para todos: **ninguna pantalla nueva pide al servidor nada que no pidiera antes**. Lo que el lienzo enseñaba y no se puede saber sin leer más —el puesto de la temporada en el perfil, la presencia del jugador que se mira, la racha en la tarjeta de fin— se quedó fuera.

**El código del día** es una hoja: la baldosa amarilla del vestíbulo crece hasta ser la cabecera, con el número, la fecha, las reglas y el anillo de intentos; debajo, los intentos de arriba abajo, la fila que se está escribiendo y una raya por cada intento que queda. La clasificación del día va en una tarjeta oscura con tu fila al final si todavía no estás entre los que lo resolvieron.

**El muelle sale de la partida.** El código del día, el enigma abierto y la arena escriben con el mismo `makeDockPad` de la partida —fichas, teclado de cifras o de colores, borrar— y el teclado físico llega a los tres por `activeDock()`. Ninguno abre ya el teclado del teléfono, y la regla sigue siendo la del lote 4: el teclado tacha lo ya escrito cuando no se repite y **no deduce nada**; en ninguno de los tres mira las pistas.

**El ranking** abre con el podio de los tres primeros —segundo, primero con corona, tercero— y sigue desde el cuarto en filas con la inicial, el nombre que lleva al perfil, las partidas y las victorias y los puntos. Debajo, cómo se suman los puntos —más diez por ganar, cuatro por empatar, uno por perder, y la dificultad y la economía que suma la victoria—, y la tarjeta azul con tu puesto y a cuántos puntos estás del que va justo delante. Todo sale de la misma respuesta de `leaderboard`. La cabecera dice la temporada con el nombre del mes y los días que le quedan, contados en UTC.

**El perfil** es una ficha coral con la inicial grande, el nombre, desde cuándo juega y dos pastillas —los puntos de la temporada y la racha de victorias—, cuatro cifras, las siete insignias y, en el tuyo, «Mi cuenta» arriba y «Tus rivales» abajo. Los rivales pasan a filas con la inicial, el punto de presencia y el desafío, lleno solo para el primero conectado.

**Los enigmas** van en una rejilla de cinco con un número por enigma: resuelto en verde y con su marca —no solo con el color—, abierto en azul. El enigma abierto lleva sus pistas en fichas, el muelle y, abajo, volver a la lista o ver la solución.

**La arena** pone una barra por jugador: su mejor número de fijas sobre las posiciones, que es lo único que la clasificación ya enseñaba de los demás; las picas de nadie se dibujan. «Lo que acaba de pasar» —fulano ya tiene dos fijas, mengano se ha ido— no lo cuenta el servidor: sale de comparar dos sondeos seguidos (`arenaEvents`), así que no dice nada que no estuviera ya en pantalla y no cuesta una lectura.

**La tarjeta de fin** es una sola para todos los finales —partida, las dos prácticas, código del día, enigma y arena—: la vaca con su humor, quién y dónde, el resultado y hasta tres cifras. Ganar es la tarjeta oscura con confeti; perder y empatar, claras y quietas. En la partida contra una persona las cifras son tus intentos, lo que duró —del primer intento al último— y **los puntos que te llevas**: el estado de una partida terminada lleva ahora `points`, calculado con la misma cuenta pura que los reparte (`scoreGame`, en `gameView`) sobre la fila que el Worker ya tiene en la mano. La revisión del historial no los lleva, porque las partidas de antes de la 3.10.0 entraron solo con su base. El código del rival, si se revela, va debajo en fichas grandes —verdes solo si lo descubriste—, y después la revancha, antes que la rejilla para compartir y el análisis: lo primero que se ofrece al terminar es volver a jugar. El sondeo sigue llegando cada dos segundos, así que la tarjeta se pinta solo cuando cambia (`paintOnce`); si no, relanzaría sus animaciones sin parar. El confeti cae una vez, en `endSound('win')`, que es por donde pasan todos los finales, y no cae al repasar una partida del historial ni con «reducir movimiento».

### El movimiento (4.8.0)

El lote 7 copia el catálogo «Mouvement et animations» del lienzo: nueve gestos, cada uno con una razón, cortos y con muelles ligeros —el resorte `cubic-bezier(.34,1.56,.64,1)` para lo que llega, la salida `cubic-bezier(.2,.9,.3,1)` para lo que se asienta—.

| Gesto | Qué hace | Dónde vive |
| --- | --- | --- |
| 01 · Pulsación | Todo control táctil baja 4 px y pierde su reborde, en 80 ms | `.btn:active` y compañía; el lote añade los que faltaban (pestañas, código plegado, burbujas del chat) |
| 02 · Entrada | La ficha que se escribe cae en su sitio desde arriba, con un poco de rebote, 300 ms | `push()` de `makeDockPad` marca solo la ficha nueva (`.tile.drop`) |
| 03 · Respuesta | Los indicios del intento nuevo estallan uno a uno, las fijas primero, 80 ms entre cada uno | `.jrow.new` y `.drow.new`: solo la fila más reciente, y solo cuando llega |
| 04 · Turno | Tu tarjeta de la cabecera y la pastilla «Te toca» del vestíbulo respiran, una onda azul cada 1,6 s; las del rival, nunca | `.bank.mine.running`, `.rpill.mine` |
| 05 · Urgencia | Por debajo de diez segundos el reloj tiembla 3 px, y el tuyo vibra una vez al cruzar la raya si el aparato sabe | `paintClock()`, que recuerda si ya vibró en este turno |
| 06 · Victoria | Confeti con las formas de la marca, tres segundos y silencio; la derrota no tiene: la vaca baja la cabeza | `rainConfetti()` desde `endSound('win')` (4.7.0) |
| 07 · Espera | Las listas dibujan su forma antes de que lleguen los datos, en vez de «…» | `skelHTML()`; la recarga silenciosa del vestíbulo no pinta esqueletos encima de lo que ya se ve |
| 08 · Navegación | La pantalla nueva sube 24 px con un fundido en 220 ms; al volver hacia el vestíbulo, lo contrario y más corto. Nunca de lado | `show()` compara la profundidad de las dos pantallas (`viewDepth`) |
| 09 · Progreso | En la tarjeta de fin, los puntos se cuentan de cero a su cifra en menos de un segundo | `countUp()`, solo cuando la tarjeta se pinta de verdad |

**Todo se apaga con «reducir movimiento».** La regla que lo hace es la última de la hoja, para que ninguna otra la pise; lo que se mueve desde el script —el confeti, los puntos, la entrada de una pantalla, el desplazamiento suave a un enigma— lo pregunta antes a `calmMotion()`. La vibración no es movimiento en pantalla y se queda. El lienzo pedía además que la barra de la temporada se llenara junto a los puntos: la tarjeta no sabe cuántos puntos llevas en el mes sin preguntarlo, así que esa barra no está.

### Volver al lobby desde la marca

El logo es un `<button>` (`#brand-home`) que lleva al lobby, pero solo desde las pantallas de consulta que enumera `BRAND_HOME_FROM`: historial, ranking, reglas, crear, unirse y configuración de práctica. El buzón de sugerencias también entra, con una salvedad: es la única de esas pantallas a la que se llega sin sesión, así que la marca lo devuelve a donde se entró —el registro o el lobby—, igual que su botón **Volver**, y su etiqueta cambia con el destino. Desde una partida o una práctica en curso queda inerte a propósito, porque saltar al lobby se saltaría el flujo que guarda o abandona y le costaría el progreso al jugador. `test/keyboard.test.js` fija las dos mitades de esa regla.

En el ordenador la marca encabeza el rail (véase «El ordenador (4.6.0)») y conserva esa misma regla. Las entradas del rail, en cambio, sí funcionan desde una partida o una práctica, porque no saltan nada: `railGo()` sale por la misma puerta que el botón de volver —la partida sigue abierta y la práctica queda guardada— antes de ir a su destino.

### La rueda de ajustes en la cabecera

Junto a la marca vive `#settings-btn`, una rueda dentada que abre un menú corto con las tres cosas que alguien busca cuando busca ajustes: el idioma, **Mi cuenta** y **Cerrar sesión**. Ocupa el sitio exacto del antiguo cuadrado de idioma (`#lang-cycle`, retirado el 12 de septiembre de 2026), porque en el pie del lobby la burbuja del chat tapaba los enlaces de cuenta y de salida. Los botones de idioma del menú llaman a `pickLang()`, la misma puerta que todos los selectores, así que arrastran consigo `localStorage`, la dirección (`/`, `/en`, `/fr`), el atributo `lang` del documento y el estado de los demás selectores.

En el ordenador la rueda baja al pie del rail, junto a la inicial propia, y su menú se abre hacia la derecha.

`syncSettingsBtn()` esconde la rueda en las dos pantallas que ya llevan su propio selector de idioma —la portada y el buzón, que enumera `SETTINGS_HIDDEN_ON`—, quita **Mi cuenta** mientras el correo no está validado o quien mira es un invitado, y se llama desde `show()` y `applyI18n()`.

### La puerta del correo

La regla vive en un solo sitio: en `routeApi`, justo después de `authenticate`, que es por donde pasan todas las acciones con sesión. Si la cuenta no tiene `email_verified_at` y la acción no está en `EMAIL_PENDING_ALLOWED` —`accountProfile`, `requestEmailVerification`, `leavePresence`—, la respuesta es un `403` con `code:"email_pending"`. Está ahí, y no repartida por cada acción, para que añadir una acción nueva no sea una forma de abrir un agujero por descuido.

El navegador no decide nada: `api()` reconoce ese código y enseña `s-verify`, la pantalla que bloquea. Dice dos cosas distintas según el caso —no hay correo apuntado, o lo hay y falta abrir el enlace—, porque lo que tiene que hacer la persona también es distinto. Desde ahí se pide el enlace y, con «Ya lo he validado», se vuelve a preguntar por la ficha: si el correo consta, se entra al lobby **con la misma sesión**, sin volver a escribir el PIN. Abrir el enlace en ese mismo navegador hace lo mismo sin pulsar nada.

`/admin` no tiene pantalla propia para esto: detecta `emailPending` en la respuesta de `loginUser` y ni siquiera guarda la sesión, porque un panel cuyas nueve pestañas responderían `403` no le sirve a nadie. Manda al juego, que es donde se arregla.

`test/email-gate.test.js` fija las tres mitades: lo que queda cerrado, lo que queda abierto y que validar el correo desbloquea la sesión que ya existía.

### Los tres paneles del acceso

El selector de idioma está **fuera** de los tres formularios, arriba a la derecha de la portada —tres siglas, ES, EN y FR, cada una con su nombre escrito para el lector de pantalla y `aria-pressed` en la que está puesta—: es lo primero que se ve y funciona en los tres modos, porque quien no lee español no puede tener que adivinar que estaba detrás de «Crear una cuenta». Sus botones llevan `type="button"` — dentro de un `<form>`, un `<button>` sin `type` es un botón de envío, y elegir idioma disparaba el alta. `setAuthMode('login'|'register'|'forgot')` enseña uno de los tres formularios y esconde los otros dos; `defaultAuthMode()` abre por «crear cuenta» solo cuando alguien llega con una invitación y nunca ha entrado en ese navegador. `resetLoginSteps()` se llama desde `show('login')`, así que cualquier vuelta al acceso —sesión caducada, cambio de usuario, salida del buzón— empieza limpia.

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
- `daily_results`: lo que hizo cada persona con el código del día —intentos, si lo resolvió y cuánto tardó—. No guarda el código: ese se deriva del día cada vez. Su clave primaria es el día más la cuenta, que es la regla «un intento diario» escrita en el esquema; su índice parcial (`solved = 1`) es el que sirve la clasificación del día.
- `player_scores`: los puntos de cada jugador, una fila por temporada (`AAAA-MM`) y otra con la temporada `all`, que es el total de siempre. Guarda también partidas, victorias, derrotas, empates, la mejor partida —el código descubierto en menos intentos— y las ocho combinaciones de reglas más jugadas. Es lo que lee el ranking, y por eso el ranking ya no recorre `games`.
- `game_scores`: un recibo por partida contada. Es lo que hace imposible sumar dos veces la misma partida, que puede cerrarse por el intento ganador, por el reloj, por abandono o por el Cron.
- `badges`: las insignias ganadas, únicas por cuenta y código. Se calculan al terminar la partida, nunca al abrir un perfil.
- `player_progress`: las rachas —días seguidos jugando y victorias seguidas—, que no pertenecen a ninguna temporada porque no se parten al cambiar de mes.
- `arenas`: una arena por fila —código, reglas, estado y el secreto que sortea el servidor—, con su columna `version` para la concurrencia. El secreto no sale de esta tabla hasta que la arena termina.
- `arena_players`: quién juega en cada arena y cómo va: intentos gastados, mejor número de fijas, cuándo lo descifró y si se marchó. De aquí sale la clasificación en directo, sin recorrer los intentos.
- `arena_guesses`: los intentos de la arena, uno por fila. Solo se devuelven los propios: leer el intento de otro y su resultado sería jugar con su cabeza, porque el código es el mismo para todos. Su índice único por `request_id` es la idempotencia de siempre.
- `turn_notifications`: recibos técnicos por partida, versión y usuario. Su clave única es lo que impide que `guess`, `passTurn` y el Cron avisen dos veces del mismo turno; se purgan después de 7 días.

Las columnas de la bolsa de tiempo viven en `games` y conviven con los otros relojes: `time_mode` (`turn`, `bank` o `correspondence`) decide cuál manda. La correspondencia reutiliza `turn_seconds` con 86.400 o 259.200 segundos, porque la aritmética y la autoridad siguen siendo las del reloj por turno; no necesitó una columna nueva. `bank_seconds`, `bank_increment`, `bank1_remaining` y `bank2_remaining` describen la reserva de cada jugador. `time_mode` vale `turn` por omisión, así que las partidas anteriores no cambian de comportamiento.

El país y la IP no los declara el navegador: los pone Cloudflare delante del Worker (`request.cf.country` y `CF-Connecting-IP`, en `requestOrigin`). Se escriben solo al entrar —una escritura por sesión, no por petición— y su único uso es administrativo. El país que enseña la bandera de una partida sigue siendo el que averigua el navegador; son dos datos distintos y no se mezclan.

**Ninguna tabla que guarde el nombre escrito tiene clave foránea hacia `users`.** Lo guardan así a propósito: el polling no tiene que cruzar con `users` en cada consulta. El precio es que dos operaciones tienen que acordarse de todas ellas, una por una, y lo hacen. **Cambiar de nombre las arrastra** —`games`, el chat y sus hilos, `player_scores`, `player_progress`, `badges`, las tres tablas de la arena y `daily_results`—, porque los puntos y la historia son de la persona, no del nombre; y con una partida o una arena todavía abiertas el cambio se rechaza, porque una jugada en vuelo llegaría con el nombre viejo. **Borrar una cuenta las borra**, incluidas las de la arena y las del código del día, para que un nombre reutilizado no herede una historia que no jugó y para que el derecho al olvido sea de verdad.

Los secretos de jugadores nunca deben exponerse mientras una partida esté activa. Toda nueva respuesta API debe pasar por la sanitización correspondiente.

La arena no toca `games` ni el ranking por temporada: no reparte puntos. Es un modo nuevo y medirlo con la misma vara que una partida de dos deformaría una clasificación que acaba de estrenarse; si un día se decide contarlo, será con su propia cuenta y su propio recibo, como hizo `game_scores`. Una arena espera 2 horas a llenarse, se cierra sola cuando ya no queda nadie jugando —todos han acertado, agotado sus intentos o se han marchado— y el Cron barre las que quedan colgadas y borra las terminadas a los 7 días.

El chat del lobby conserva 24 horas. El chat de partida es exclusivo de sus dos jugadores, se cierra 24 horas después de terminar y conserva sus filas durante 7 días. La limpieza se ejecuta una vez por hora mediante el Cron Trigger, nunca dentro del polling de chat. Los zumbidos requieren que el rival esté presente en la partida y tienen 30 segundos de espera por emisor.

## La administración

El panel vive en `/admin`, no está enlazado desde el juego, no se indexa y necesita una cuenta con rol `admin`. Se organiza en pestañas y cada una pide sus datos la primera vez que se abre, para no gastar lecturas de D1 en lo que nadie mira.

El botón **Volver al juego**, con la vaca, cierra el panel en ese navegador y devuelve al juego. Son dos sesiones distintas —`pf_admin_session` y `pf_session`—, así que salir de la administración no expulsa a nadie de su partida.

| Pestaña | Qué resuelve |
| --- | --- |
| Resumen | Usuarios, gente en línea, altas y activos de la semana, partidas y mensajes del día, moderación pendiente y los países de donde entra la gente. Debajo, el juego: correspondencias en curso, partidas públicas que se pueden mirar, arenas abiertas y del día, el código del día (resueltos / jugados, en UTC), jugadores de la temporada, insignias ganadas y aparatos con avisos push. |
| Usuarios | La lista completa con un punto verde/gris de presencia junto al nombre, país, última IP, partidas y mensajes. Bloquear, cambiar el PIN, dar o quitar el rol `admin`, cerrar sesiones, reactivar el chat y borrar. |
| Partidas | Las últimas 200, con sus reglas en una línea —código, intentos, reloj (por turno, bolsa o correspondencia), cuaderno, pública o privada— y cómo terminaron. El filtro busca también en las reglas: «correspondencia» las encuentra todas. Se cierran las que siguen abiertas y, a una partida colgada con sus dos jugadores dentro, se le puede **dar un resultado**. |
| Arenas | Las últimas 100: anfitrión, jugadores, cuántos la descifraron y reglas. La ficha enseña la clasificación en directo; el código, solo cuando la arena ha terminado. Una arena colgada se cierra: si esperaba gente caduca, si ya se jugaba termina y lo jugado se queda. |
| Conversaciones | Una fila por chat, no un río de mensajes: quiénes hablan, cuántos mensajes, cuántos zumbidos, cuántas reacciones rápidas y cuántos reportes. El histórico se abre aparte, en su propia ventana, y los avisos de la partida y las reacciones se leen en español, no como la clave que guarda la base (`react_gg|Ana`). |
| Moderación | Los reportes del chat, con borrar y silenciar a mano. |
| Feedback | Las sugerencias y los errores que llegan del juego. Filtro por estado y por tipo, cambio de estado desde la propia fila, respuesta, nota interna y borrado. |
| Mantenimiento | Limpieza de partidas por estado —también `expired` e `inactive`, que deja el mantenimiento— y antigüedad, y la consola SQL con recetas para el ranking del mes, las partidas terminadas que no entraron en la temporada, el código del día, las correspondencias y los avisos push. |
| Auditoría | Todo lo que la administración ha cambiado, con fecha, objetivo y detalle. |

Al pulsar un nombre se abre su ficha, que empieza por el **usuario**, su **nombre anterior** (`users.previous_username`, migración `0010`, que `changeUsername` rellena en cada cambio), la fecha del **último cambio de nombre** y el **email**, marcado como verificado o sin verificar. Solo se guarda un nombre anterior, no la lista entera. El correo solo viaja en la ficha (`adminUserDetail`); la lista no lo carga.

La ficha cuenta también lo que trajo la 4.0.0: puntos de siempre y de la temporada, rachas, insignias, el código del día (resueltos, mejor marca, último día), sus arenas y cuántos aparatos reciben avisos push y en qué idioma; si no tiene ninguno, lo dice, porque entonces sus turnos de correspondencia le llegan por correo. El endpoint de un aparato no viaja a la ficha: basta con saber que existe.

**Dar un resultado** (`adminSetGameResult`) es el quinto final de una partida y pasa por `settleFinishedGame()`, como los otros cuatro: reparte puntos e insignias y avisa en el chat. Solo se ofrece para una partida en juego con sus dos jugadores; una partida sin rival se cierra, no se decide. Una partida ya contada no se vuelve a contar, porque su recibo lo impide.

Toda acción que cambia algo queda en `audit_log`, también borrar un mensaje del chat, silenciar o reactivar a alguien y responder al buzón; leer el chat no se audita. Bloquear o cambiar el rol de un nombre que no existe responde «Usuario no encontrado.» en lugar de dejar una línea de auditoría sobre nadie. Bloquear borra además la presencia de la cuenta.

La exportación es la copia de seguridad del panel: `schemaVersion: 6` incluye el correo, su verificación, la zona horaria, el nombre anterior, la lengua de avisos y las suscripciones push, y además todo lo que trajo la 4.0.0 —puntos por temporada y sus recibos, insignias, rachas, el código del día y las tres tablas de la arena—. Sin los recibos de `game_scores`, una copia restaurada dejaría partidas terminadas que nadie podría volver a contar. El endpoint de una suscripción identifica un aparato y la exportación sigue siendo un archivo privado.

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

**Una partida solo termina por un sitio.** Hay cinco caminos que la cierran —el intento ganador, la bandera caída, el abandono, el Cron y la corrección de un administrador— y los cinco pasan por `settleFinishedGame()`, que avisa en el chat de la partida y llama a `recordFinishedGame()`. Separar las dos mitades es lo que hizo que durante tres versiones una partida con bolsa de tiempo cerrada por el reloj no repartiera ni un punto ni una insignia. El recibo de `game_scores` hace que llamarla dos veces no cuente dos veces, así que el camino nuevo siempre debe pasar por ahí.

**La arena no toca las partidas clásicas.** Sus tablas son suyas, el código lo sortea el servidor y no sale hasta que termina, nadie ve los intentos de nadie y siempre hay límite de intentos. Esas cuatro cosas son lo que la hace justa y lo que la hace terminable; `test/arena.test.js` las fija.

**Nada de lo que mande un navegador puede provocar un error 500.** El cuerpo de una petición es un objeto de valores simples y nada más: `safeParams()` descarta lo que no lo sea —`subscription` es el único parámetro estructurado del API— y un cuerpo demasiado grande responde `413` con su mensaje, no una traza. Equivocarse al escribir una petición es un error del cliente, y se le contesta como tal.

**Ningún fuente lleva bytes de control crudos.** Un `\x00` escrito como byte y no como escape convierte el archivo en binario a ojos de Git: el diff deja de existir, la revisión también, y `grep` se salta el archivo. Le pasó a `src/security.js`, que es justo el módulo de sesiones y contraseñas. `test/audit-v4.test.js` recorre `src/`, `public/`, `test/`, `tools/` y `migrations/` para que no vuelva a pasar.

La administración no está enlazada desde el juego. Requiere una cuenta con rol `admin`, y toda acción que cambie algo queda en `audit_log`. Un jugador sin ese rol recibe siempre un error, tenga o no sesión válida. Sus mensajes son los únicos del servidor que se quedan en español: es una herramienta interna, y `test/client-server-sync.test.js` recorre `src/` entero para comprobar que todos los demás existen en los tres idiomas.

## Desarrollo local

Requisitos: Node.js 20 o posterior. El proyecto se conduce con **`npm`** —es lo que dice `AGENTS.md` y lo que usan las instrucciones de entrega—; `pnpm` ejecuta exactamente los mismos scripts y el repositorio conserva su `pnpm-lock.yaml`, así que sirve igual siempre que se elija uno y no se mezclen.

```text
npm install
npm run db:local
npm run dev
```

La aplicación queda normalmente en `http://localhost:8787` y el panel en `http://localhost:8787/admin`.

Comandos disponibles:

```text
npm test        # todas las pruebas
npm run check   # sintaxis y pruebas
npm run deploy  # despliegue manual excepcional
npm run pages       # regenera las paginas de reglas y de instalacion
npm run puzzles     # regenera public/puzzles.json
npm run icons       # regenera los cuatro PNG de la app instalada
npm run screenshots # rehace las capturas del manifest (con el servidor en marcha)
npm run db:local
npm run db:remote
```

Fuera de `package.json` quedan dos generadores que necesitan Python: `python tools/make-og-images.py` para las tarjetas sociales (requiere `pillow`) y `python tools/pdf/build.py` para las guías de estrategia (requiere `reportlab`).

Antes de terminar cualquier cambio se debe ejecutar `npm run check`. Si cambia una regla, una ruta o una interacción crítica, se debe añadir o actualizar una prueba.

## Base de datos y despliegue

Para una instalación nueva, se crea la base D1, se coloca su identificador en `wrangler.jsonc` y se aplica el esquema:

```text
npm install
npm run db:remote
npm run deploy
```

Una modificación futura del esquema debe añadirse como una migración numerada nueva; nunca se debe reescribir `0001_initial.sql` después de que una base dependa de ella.

**El orden importa cuando un cambio trae migración.** Cloudflare despliega solo al recibir `main`, así que la migración debe aplicarse antes de empujar:

```text
npm run db:remote
git push origin main
```

La regla vale para todas, sin excepción: `0005_feedback.sql` y `0006_time_bank.sql` con la 2.5, `0007_d1_free_optimization.sql` con la optimización de D1 Free, `0012_push.sql` con la correspondencia, `0013_daily.sql` con el código del día, `0014_notebook_option.sql` con el cuaderno, `0015_season.sql` y `0016_badges.sql` con los puntos y las insignias, y `0017_arena.sql` con la arena. El aviso por correo del buzón necesita además, una sola vez, activar Email Routing en el dominio y colocar sus dos secretos:

```text
wrangler secret put FEEDBACK_TO
wrangler secret put FEEDBACK_FROM
```

Web Push necesita un par P-256 propio del sitio. La clave pública se guarda como base64url del punto sin comprimir y la privada como base64url del escalar; ninguna de las dos se escribe en Git y la privada nunca llega al navegador:

```text
wrangler secret put VAPID_PUBLIC
wrangler secret put VAPID_PRIVATE
```

Turnstile protege las dos puertas públicas —la petición del enlace de PIN y el buzón de sugerencias— y **se verifica siempre en el Worker**. `TURNSTILE_ENABLED` y `TURNSTILE_HOSTNAMES` viajan en `wrangler.jsonc` porque no son secretos; la clave privada, sí. Con `TURNSTILE_ENABLED` a `"1"` y sin secreto, la comprobación **falla cerrada**: una instalación nueva que se salte este paso deja el alta y la recuperación del PIN sin funcionar. Las pruebas locales dejan la bandera sin poner a propósito.

```text
wrangler secret put TURNSTILE_SECRET
```

El código del día necesita el suyo. Cualquier cadena larga y aleatoria sirve; lo importante es que no esté en Git, porque el repositorio es público y quien la tenga puede calcular el código de cualquier día. Si falta, el Worker sigue funcionando con un valor de reserva escrito en `src/daily.js`, que no vale para producción. Cambiarlo cambia el código de hoy a media jornada, así que se pone una vez y se deja:

```text
wrangler secret put DAILY_SECRET
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

## La auditoría de la 4.0.0

El 20 de septiembre de 2026, antes de poner el número, se revisó la versión entera con ojos de QA: no leyendo el código, sino **jugándolo**. La simulación recorrió los 90 juegos de reglas legales —números y colores, 4/6/8 colores, de 3 a 6 posiciones, con y sin repetición, sin límite / 6 / 10 intentos— de principio a fin contra el Worker de verdad, comparó 2,3 millones de pares intento/secreto con una implementación de referencia, jugó arenas de 3 a 8 jugadores con todas sus formas de acabar, y disparó unas 1.100 llamadas al API con parámetros absurdos, hostiles o ausentes. `test/audit-v4.test.js` fija cada hallazgo.

Lo que resistió sin una sola grieta: la aritmética de picas y fijas, la validación de códigos, los tres relojes con su aritmética al segundo, la regla del último intento y del empate, la sanitización —ningún código del rival salió nunca de una partida activa, ni hacia el rival ni hacia quien miraba—, la idempotencia por `requestId`, la puerta del correo en las 37 acciones del API, y las 648 claves del catálogo de idiomas, que están las tres veces y con las mismas variables.

| Hallazgo | Corrección |
| --- | --- |
| Dos de los cinco caminos que cierran una partida no contaban sus puntos: la bandera que descubre el rival al consultar (`state`) y la que descubre quien intenta jugar fuera de tiempo (`guess`). Una partida con bolsa de tiempo terminada por el reloj —el caso normal— no repartía ni un punto ni una insignia, y su chat no recibía el aviso de final. | `settleFinishedGame()`: avisar y contar dejan de ser dos mitades sueltas y los cinco caminos pasan por ahí. |
| Cambiar de nombre no arrastraba las tres tablas de la arena ni `daily_results`. Renombrarse durante una arena dejaba a la persona fuera de su propia arena —«No juegas en esta arena»— y la arena se quedaba esperando unos intentos que ya no podían llegar. | Una arena abierta bloquea el cambio, igual que una partida; y las cuatro tablas viajan con el nombre, como ya hacían el ranking y las insignias. |
| Borrar una cuenta no borraba sus filas de `arena_players` ni de `arena_guesses`, así que su nombre seguía en la clasificación de cada arena que jugó, y las arenas que había abierto sobrevivían a su cuenta. | El borrado se lleva sus filas y las arenas de las que fue anfitriona, como ya se llevaba sus partidas. |
| Un navegador podía hacer que el servidor respondiera **500**: un cuerpo demasiado grande, un cuerpo que fuera `null` o una lista, o un campo como `{"toString":1}` en `guess`, que hace estallar `String()`. | `safeParams()` acepta solo un objeto de valores simples —`subscription` es la única excepción— y un cuerpo demasiado grande responde `413` con su mensaje y sin traza. |
| `src/security.js` llevaba tres bytes de control crudos dentro de una expresión regular, escritos como bytes en vez de como escapes. Git leía el archivo como **binario**: cada cambio del módulo de sesiones y contraseñas salía en el diff como «Binary files differ», sin revisión posible, y `grep` se lo saltaba. | Los mismos caracteres, escritos `\x00-\x1f\x7f`. Una prueba recorre ahora los cinco directorios de fuentes. |
| Cuatro mensajes del servidor salían en español dentro de un juego en inglés o en francés: la prueba de traducciones llevaba una lista de archivos escrita a mano y `arena.js`, `daily.js`, `push.js` y `season.js` nunca entraron en ella. | Traducidos; la prueba recorre `src/` entero, así que un módulo nuevo no puede colarse. |
| En `test/notebook.test.js`, una frontera de palabra estaba escrita con un byte de retroceso crudo en vez de su escape: la aseveración buscaba «`.secret`» seguido de un retroceso, que no aparece nunca. Comprobaba menos de lo que decía. | Escrita como escape; la aseveración vuelve a valer. |
| Tres de las dieciocho mejoras —la arena, el espectador y las reacciones rápidas— solo estaban documentadas dentro del plan. «Cómo se juega» no las mencionaba. | Tienen sección propia. |
| `TURNSTILE_SECRET` no figuraba en ninguna lista de secretos, aunque `TURNSTILE_ENABLED` viaja a `"1"` en `wrangler.jsonc` y la comprobación falla cerrada: una instalación nueva que siguiera este documento se quedaba sin alta ni recuperación de PIN. | Documentado junto a los demás, con la advertencia. |
| El documento mandaba `pnpm` para desarrollar y desplegar, y `npm` en la lista de herramientas, en el plan y en `AGENTS.md`. Y la regla de «migración antes del push» solo enumeraba hasta la `0013`. | Un solo gestor en las instrucciones, `npm`, con la nota de que `pnpm` sirve igual; y la lista de migraciones llega hasta la `0017`. |
| Faltaban en «Arquitectura y archivos» `src/recovery.js` —los enlaces de correo— y `public/audio/`. | Añadidos. |

## Seguridad y archivos locales

Nunca se deben subir a GitHub:

- `.dev.vars`, `.env`, claves, tokens o credenciales;
- Excel, CSV, exportaciones o copias de seguridad;
- SQL con datos reales;
- `.private/`, `.wrangler/`, `dist/`, cachés o perfiles de rendimiento.

Estas exclusiones están definidas en `.gitignore`. Los PIN se almacenan con hash SHA-256 y una sal individual. No se deben registrar PIN, tokens de sesión, secretos de partida ni contenido privado en logs o documentación.

El contacto que alguien deja en el buzón de sugerencias es un dato personal y recibe el mismo trato que la IP: se guarda para poder responder, solo se ve dentro de `/admin`, no aparece en ninguna respuesta del juego y sí va en la exportación, que pasó a `schemaVersion: 3` al incluir el buzón, a `schemaVersion: 4` al incluir el correo de las cuentas y a `schemaVersion: 5` al incluir la lengua de avisos y las suscripciones push y a `schemaVersion: 6` al incluir puntos, insignias, rachas, código del día y arena. El endpoint y las claves públicas de una suscripción identifican un aparato: no salen del panel ni deben publicarse.

La IP y el país de cada cuenta son datos personales. Se guardan para poder investigar un abuso —quién creó una partida, desde dónde entró una cuenta bloqueada— y por eso solo se ven dentro de `/admin`: no aparecen en ninguna respuesta del juego, no viajan al navegador de ningún jugador y no se escriben en logs. Sí van en la exportación, que por lo tanto es un archivo con datos personales y nunca debe subirse al repositorio.

## Versionado

El proyecto sigue versionado semántico `vMAYOR.MENOR.PARCHE`:

- **MAYOR (X)**: cambios incompatibles del API o del contrato de datos —una respuesta que cambia de forma, un endpoint que desaparece, una migración que obliga a rehacer clientes.
- **MENOR (Y)**: funcionalidad nueva compatible hacia atrás —una pantalla, un modo de juego, un ajuste como el cuadrado de idioma.
- **PARCHE (Z)**: correcciones compatibles hacia atrás, retoques de texto, estilos y rendimiento.

El número vive en tres sitios y los tres se cambian en el mismo commit: `version` en `package.json` conserva el SemVer canónico (`4.1.0`), porque npm y pnpm lo requieren, y `APP_VERSION` en `public/index.html` y `src/version.js` publica `v4.1.0`. El Worker lo firma en todas sus respuestas; `test/client-server-sync.test.js` comprueba que los tres coinciden. De ahí sale lo que ve el jugador en los créditos y lo que viaja con cada mensaje del buzón (`appVersion`), así que un número desfasado hace que un informe apunte a una versión que no es. La versión sube en el commit que introduce el cambio, no al desplegar.

## Procedimiento para futuras modificaciones

1. Leer este documento y revisar `git status` para no sobrescribir trabajo pendiente.
2. Identificar las reglas y contratos afectados antes de editar.
3. Hacer el cambio más pequeño que resuelva el problema.
4. Ejecutar `npm run check` y añadir pruebas de regresión cuando corresponda.
5. Revisar que no se filtren datos privados ni secretos.
6. Actualizar este documento si cambian arquitectura, operación, rutas, límites o decisiones duraderas.
7. Subir la versión según las reglas de «Versionado», en `package.json`, `APP_VERSION` de `public/index.html` y `src/version.js` a la vez.
8. Confirmar los cambios en Git y enviar `main`; comprobar después el despliegue automático.

No se deben borrar datos, ejecutar importaciones, alterar producción, cambiar roles o publicar secretos sin autorización explícita del propietario.

## La serie 5: la identidad Plaza

El 22 de septiembre de 2026 se validó un rediseño completo de todas las pantallas sobre un lienzo de diseño (Claude, «Picas y Fijas — Redesign»): la identidad **Plaza**, con su sistema visual, sus dieciséis pantallas de teléfono y de ordenador y su catálogo de animaciones. Tres cosas se decidieron ahí y no se vuelven a discutir en cada lote: la mascota es una **vaca pequeña y risueña** (no la cabeza de toro, y desde luego no algo que parezca un cerdo); en ordenador la interfaz **ocupa todo el navegador** con un raíl de navegación y tres columnas, en lugar de la columna única de 520 px; y en teléfono una partida larga **no se desplaza**: la cabecera con los relojes queda fija arriba, la entrada del intento en un muelle fijo abajo con el teclado plegable, y solo el diario de intentos se mueve, con el más reciente arriba y una friso de pastillas para saltar a cualquier intento.

Se implementa por lotes sobre `public/index.html`, cada lote sube la menor y **se comita, se empuja y se despliega al terminar**, como cualquier tarea de este proyecto. Lo que ningún lote puede romper: el verde y el naranja siguen siendo información y no decoración; fija y pica se distinguen también por forma; todo texto nuevo nace en los tres idiomas y se relee a 375 px; la versión vive en tres sitios; los archivos generados se regeneran en el mismo commit que su fuente.

| Lote | Qué entrega | Versión | Estado |
| --- | --- | --- | --- |
| **L1 · Fundaciones** | Tokens de día y de noche, tipografías, todos los componentes rehechos con reborde táctil, `theme-color` y manifest claros, emojis fuera de títulos y controles | 4.2.0 | **Cerrado** el 22-09-2026 |
| **L2 · La vaca y la marca** | La mascota nueva en la cabecera, en `vacaSVG` (cuatro humores, antes `toroSVG`), en `/admin`, en `tools/make-icons.mjs` y en los PNG, tarjetas sociales, capturas, paleta de las guías PDF y piel de las páginas públicas | 4.3.0 | **Cerrado** el 22-09-2026 |
| **L3 · Entrar y el lobby** | Portada con héroe ilustrado y «Probar ahora» en coral, lobby con saludo personal, tarjeta del código del día, rejilla de modos con ilustración por modo, listas en filas blancas | 4.4.0 | **Cerrado** el 22-09-2026 |
| **L4 · La partida en teléfono** | Cabecera fija con relojes compactos, muelle inferior con fichas y «Adivinar», teclado plegable que tacha los símbolos descartados, pestañas Tú/Rival, diario con el más reciente arriba y friso de intentos | 4.5.0 | **Cerrado** el 22-09-2026 |
| **L5 · El ordenador** | Raíl de navegación, tres anchos (< 720, 720–1100, > 1100 hasta 1600 px), lobby y partida a tres columnas con los dos diarios a la vista y el chat siempre abierto | 4.6.0 | **Cerrado** el 22-09-2026 |
| **L6 · Volver cada día** | Código del día, podio del ranking, perfil con insignias dibujadas (adiós a `BADGE_ICONS`), enigmas en rejilla, arena con barras de progreso, tarjeta de fin con confeti | 4.7.0 | **Cerrado** el 23-09-2026 |
| **L7 · Movimiento** | Los nueve gestos del catálogo: pulsación, ficha que cae, indicios que estallan, turno que respira, reloj que tiembla, confeti, esqueletos, pantallas que suben, puntos que se cuentan; todo apagado con `prefers-reduced-motion` | 4.8.0 | **Cerrado** el 23-09-2026 |
| **L8 · Recepción y 5.0.0** | Relectura completa en tres idiomas a 375 px y en ordenador, retirada de los alias de Mesa, documento maestro al día, etiqueta `v5.0.0` | 5.0.0 | À faire |

Diario de transiciones:

- 22-09-2026 · L1 · À faire → Cerrado · 4.2.0 · 286 pruebas en verde; portada, práctica y acceso revisados a 390 px de día y de noche en el servidor local. Queda para L2 lo que L1 deja a la vista a propósito: la cabecera de turno y los banners siguen dibujando la cabeza de toro con la paleta nueva.
- 22-09-2026 · L3 · À faire → Cerrado · 4.4.0 · 294 pruebas en verde, una de ellas nueva en `test/season.test.js` (el saludo lee solo la fila propia y nunca en el sondeo); cuatro pruebas ajustadas a la pantalla nueva —la vaca del saludo pasa a la portada, las siglas del idioma llevan su nombre, y la lista de quien mira y la arena se anuncian con otros textos—; portada, recuperación del PIN y vestíbulo revisados a 375 px de día y de noche en español, inglés y francés, con filas de todas las clases pintadas a mano; capturas del manifest rehechas. Lo que L3 encontró de antes: el saludo se quedaba en el idioma de la entrada al cambiar de idioma, el icono del sonido saltaba de línea en el pie del lobby, «hace 1 días», y la sección del cuadrado de idioma describía un botón que se retiró el 12 de septiembre.
- 22-09-2026 · L2 · À faire → Cerrado · 4.3.0 · 293 pruebas en verde, siete de ellas nuevas en `test/vaca.test.js`; iconos, tarjetas sociales, guías PDF, páginas públicas y capturas regenerados; cabecera, lobby, barra de turno, los tres banners, `/admin` y las páginas públicas revisados de día y de noche en el servidor local. Lo que L2 encontró de L1: las guías de instalación públicas pedían colores (`--azul`, `--hueco`…) que su hoja no definía, y el enlace de la guía de estrategias conservaba un emoji de libro.
- 22-09-2026 · L5 · À faire → Cerrado · 4.6.0 · 308 pruebas en verde, siete nuevas en `test/desktop.test.js` —el rail y sus tres anchos, la salida por el rail que pasa por la puerta de volver, la partida en columnas con el muelle en la de jugar, los dos diarios cuando su columna tiene sitio, el chat anclado que no sondea más por estar a la vista, sus pestañas privadas y los textos en los tres idiomas—. Una partida con cuaderno —intentos escritos con el teclado físico y llevada hasta su tarjeta final—, otra con bolsa de tiempo mirada como espectador, práctica sola y contra el computador, vestíbulo con su chat y sus conversaciones privadas, ranking y menú de ajustes, revisados en el servidor local a 1440×900, 1280×800, 900 y 720 px, de día y de noche, en español, inglés y francés; el teléfono, a 390 px, sin cambios. Captura ancha del manifest rehecha: enseñaba la práctica de un invitado en la columna del teléfono. Lo que se quedó fuera a propósito: la gente conectada y el podio del ranking que el lienzo ponía junto al vestíbulo, porque piden lecturas que el sondeo no hace.
- 23-09-2026 · L7 · À faire → Cerrado · 4.8.0 · 321 pruebas en verde, seis nuevas en `test/motion.test.js` —el interruptor de «reducir movimiento» al final de la hoja y consultado desde el script, los nueve gestos con su animación, la ficha nueva que cae sin que el teclado deduzca nada, el turno que respira solo en lo tuyo y la vibración de una vez, los esqueletos en lugar de «…» sin pisar la recarga silenciosa, y la entrada de pantallas solo al cambiar—; una de `test/return-daily.test.js` ajustada a `countUp`. Comprobado en el servidor local: la entrada y la vuelta de pantallas, los esqueletos del ranking, la ficha que cae y los indicios que estallan en una práctica. Lo que se quedó fuera a propósito: la barra de la temporada que se llena en la tarjeta de fin, que pediría una lectura. Lo que L7 encontró de antes: el reloj caliente parpadeaba en vez de temblar, el reloj por turno se ponía rojo a los cinco segundos y no a los diez, y seis listas empezaban con un «…» escrito a mano.
- 23-09-2026 · L6 · À faire → Cerrado · 4.7.0 · 315 pruebas en verde, siete nuevas en `test/return-daily.test.js` —las insignias dibujadas y sin verde ni naranja, el muelle en el día, los enigmas y la arena sin mirar las pistas, ninguna pantalla nueva que pida algo al servidor, la arena que solo cuenta lo que la clasificación ya enseñaba, la tarjeta que se pinta una vez y el confeti solo de la victoria, los puntos de la tarjeta sacados de la cuenta pura y los textos en los tres idiomas—; dos pruebas ajustadas a la tarjeta de fin (`test/vaca.test.js`, `test/share-card.test.js`). Código del día jugado hasta agotarlo, ranking con podio, perfil propio, rivales, enigma resuelto, arena en juego con su hilo de novedades y terminada, y una partida ganada con sus puntos, revisados en el servidor local a 375 y 390 px en español y francés, de día, y el ranking a 1440 de noche. Lo que se quedó fuera a propósito: el puesto de la temporada y la presencia en el perfil, la racha en la tarjeta de fin y la barra de temporada, porque piden lecturas que hoy no se hacen. Lo que L6 encontró de antes: los rótulos del código revelado acababan en dos puntos, y el enigma decía «revela códigos al final».
- 22-09-2026 · L4 · À faire → Cerrado · 4.5.0 · 301 pruebas en verde: seis nuevas en `test/phone-game.test.js` —la capa de tres pisos, el muelle que no deja escribir lo imposible y tacha lo descartado en el cuaderno sin deducir nada, el teclado físico, el diario con lo más reciente arriba y sus marcas por forma, los textos en los tres idiomas y el código plegado— y una en `test/keyboard.test.js`, que sustituye a la que buscaba `bindEnterToButton('g-guess',…)`: ese campo ya no existe y Enter sigue enviando el intento. Partidas con bolsa, con reloj por turno, en colores y como espectador, y práctica sola y contra el computador, jugadas contra el servidor local y revisadas a 375 y 390 px, de día y de noche, en español, inglés y francés; capturas del manifest rehechas, con un intento a medias en el muelle. La práctica entró en el lote aunque la tabla no la nombraba, por ser la primera partida de quien llega. Lo que L4 encontró de antes: el contador del computador y el código del final de la práctica llevaban un emoji de robot, y el texto «1F · 2P» de cada intento repetía lo que las marcas ya decían.

## Correcciones y mejoras de la 4

Con la 4.0.0 cerrada empieza su serie de correcciones y mejoras. Cada corrección sube el parche (4.0.1, 4.0.2…) y cada mejora compatible sube la menor, siempre en el commit que la trae y con su etiqueta anotada `vX.Y.Z`. De la más reciente a la más antigua:

- **4.8.0** — Séptimo lote de la identidad Plaza: el movimiento. Los nueve gestos del lienzo: los controles se hunden al pulsarlos, cada ficha cae en su sitio al escribirla, los indicios del intento nuevo estallan uno a uno con las fijas primero, tu turno respira en tu tarjeta y en la pastilla del vestíbulo, el reloj tiembla por debajo de diez segundos —y el tuyo vibra una vez—, la victoria trae confeti, las listas dibujan su forma mientras cargan, las pantallas suben al entrar y bajan al volver, y los puntos de la tarjeta de fin se cuentan. Con «reducir movimiento» no se mueve nada.
- **4.7.0** — Sexto lote de la identidad Plaza: volver cada día. El código del día es una hoja con la baldosa amarilla por cabecera, los intentos de arriba abajo y la clasificación del día en una tarjeta oscura; el ranking abre con el podio de los tres primeros y acaba con tu puesto y la distancia al de delante; el perfil es una ficha coral con las siete insignias, ya dibujadas, las ganadas y las que faltan; los enigmas van en rejilla; la arena pone una barra por jugador y cuenta lo que acaba de pasar. El código del día, los enigmas y la arena escriben con el muelle de la partida. Todos los finales comparten una tarjeta con la vaca, tres cifras —en la partida, los puntos que te llevas— y confeti cuando se gana; la revancha va justo debajo.
- **4.6.0** — Quinto lote de la identidad Plaza: el ordenador. El juego ocupa el navegador hasta 1600 px en tres anchos: el teléfono no cambia; de 720 a 1100 la marca se hace un rail de iconos y la partida se abre en dos columnas, jugar y diario; por encima, el rail lleva sus nombres y la partida suma una tercera columna con el chat siempre abierto. El muelle pasa a la columna de jugar con el teclado siempre a la vista, los dos diarios se ponen uno al lado del otro cuando caben, y solo la columna de jugar se desplaza si no cabe. El vestíbulo se reparte a lo ancho, con su chat al lado y las conversaciones privadas en pestañas. Salir por el rail de una partida o de una práctica pasa por la puerta de siempre, y el chat anclado no pregunta al servidor más a menudo que el cerrado mientras nadie lo usa.
- **4.5.0** — Cuarto lote de la identidad Plaza: la partida en el teléfono. La partida y la práctica son una capa fija: arriba, la cabecera con el código, las reglas, la pausa, el chat y dos relojes compactos, uno por jugador, que sirven a la bolsa, al turno y a la correspondencia; abajo, el muelle con las fichas y «Adivinar» y un teclado propio que se pliega y tacha lo que no se puede escribir y lo que el jugador descartó en su cuaderno; en medio, lo único que se desplaza: el diario, en dos pestañas, con lo más reciente arriba, las pistas dibujadas por forma y un friso para saltar a cualquier intento. El teclado del teléfono ya no tapa el diario y el físico sigue escribiendo. Tu código va plegado hasta que lo pides. La práctica, que es la primera partida de quien llega, usa la misma pantalla, y su contador del computador deja de ser un emoji.
- **4.4.0** — Tercer lote de la identidad Plaza: la portada y el vestíbulo, copiados de sus artboards. La portada abre con un héroe dibujado —cuatro fichas, una fila de pistas y la vaca alerta—, el título «Adivina el código antes que tu rival.», «Probar ahora» en coral y el formulario en su tarjeta, con el idioma en tres siglas arriba a la derecha. El vestíbulo saluda con la inicial y la temporada propia —puntos y puesto, pedidos una vez al entrar con `leaderboard` y `meOnly`—, pone «Crear partida» en una tarjeta azul, el código del día en una baldosa amarilla con su anillo de intentos, cuatro modos ilustrados en rejilla y dos listas de filas blancas: las partidas propias, privadas y públicas juntas y ordenadas por lo que piden, y lo público —partidas abiertas, partidas que se pueden mirar y arenas— en una sola. La elisión francesa («d’Ana», «d’octobre») y el singular de «hace 1 día», de paso.
- **4.3.0** — Segundo lote de la identidad Plaza: la vaca sustituye al toro. Una vaca pequeña y risueña, dibujada tal cual en el lienzo, con cuatro humores —tranquila, alerta, contenta y decepcionada— en el logo, el saludo del lobby, la barra de turno, los banners de fin y `/admin`. Los iconos de la app pasan a la vaca sobre azul, las tarjetas sociales a crema con la baldosa de la marca y la pica en anillo, las guías PDF a la paleta Plaza y las páginas públicas de reglas e instalación a la piel del juego, de día y de noche; eso arregla de paso los dibujos de la guía de instalación, que desde la 4.2.0 pedían colores que su hoja no definía. Las capturas del diálogo de instalación se rehacen de día, y el script vuelve a entrar con el formulario de la 3.0.0. El enlace de la guía de estrategias pierde su emoji.
- **4.2.0** — Primer lote de la identidad Plaza. La hoja de estilos entera cambia de piel: fondo crema de día y noche índigo cuando el sistema lo pide, tarjetas blancas con borde de 2 px, botones y selectores con reborde táctil de 4 px, `Bricolage Grotesque` en los títulos y `Figtree` en la interfaz. Los títulos, botones, fichas, avisos y notificaciones pierden sus emoji; el altavoz del pie y la marca de revancha en las listas pasan a `ico()`. `theme-color` y el manifest se ponen en crema. Nada cambia de sitio todavía: la cabeza de toro y la columna única se van en los lotes siguientes.
- **4.1.0** — La nota del análisis pasa del peor caso a la media, y se explica. Con el peor caso, acertar con un código que aún era posible salía «desperdiciado» (457 con 12 posibles, que era justo el código) y el primer intento de una partida sin repetidos salía «correcto» o «óptimo» según la muestra, cuando todos valen lo mismo. Ahora se mide cuántos códigos quedan de media contando todas las respuestas, la victoria cuenta como cero, y la lista se recorre entera mientras cabe; el cálculo pasó a una versión sin objetos diez veces más rápida. Cada nota es un botón que despliega su porqué, y el pie aclara que un intento sin fijas ni picas no se castiga por el resultado sino por lo que podía enseñar. Las guías en PDF cuentan la regla nueva.
- **4.0.1** — El análisis de la partida («Cómo se jugó») se cerraba un segundo después de abrirlo. La pantalla final se repinta con cada sondeo, porque el chat y la revancha siguen preguntando al servidor al terminar, y cada repintado recreaba el desplegable cerrado. Ahora `analysisBlock` recuerda qué análisis está abierto, por reglas e intentos, y el bloque nuevo nace en el mismo estado; el clic se anota en el acto para que un repintado que llegue antes del evento `toggle` no lo cierre.

## El camino a la 4.0.0 — hecho

**Este plan está terminado.** Las seis etapas se entregaron una por una entre la 3.5.2 y la 3.11.0, y la séptima —el cierre— es la 4.0.0. Se conserva entero, y no resumido, porque explica por qué existe cada pantalla del juego y en qué orden se decidió construirlas: leerlo es la forma más rápida de entender el estado actual. Lo que sigue está escrito en el tiempo en que se escribió.

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

### Etapa 3 — Lo que se comparte (3.8.0 · 3.8.1) ✅

El juego no tiene publicidad y no va a tenerla. Lo único que puede traer gente es lo que un jugador comparte por su cuenta, y para eso hay que darle algo que valga la pena compartir. Picas y Fijas es literalmente el antepasado de Wordle: la mecánica del código diario con rejilla de emojis le sienta mejor que a nadie y, además, funciona con cero jugadores conectados, que es el problema de la etapa 1 visto desde el otro lado.

| Tarea | Qué cambia para quien juega | Dónde se toca | Hecho cuando |
| --- | --- | --- | --- |
| **E3-T1 (f)** ✅ El código del día (3.8.0) | Un secreto por día, el mismo para todo el mundo, un intento diario y una clasificación del día por intentos y tiempo. | `src/daily.js` (nuevo), `src/index.js`, `migrations/0013_daily.sql` (solo los resultados), `public/index.html` | El secreto se deriva del día con HMAC y un secreto del Worker: no se guarda en claro y no se puede adivinar desde el navegador. Nadie puede entregar dos veces el mismo día. **Encadenada con E3-T2** |
| **E3-T2 (f)** ✅ La rejilla que se comparte (3.8.0) | Al terminar, el resultado se copia como rejilla de emojis —fija llena, pica hueca— sin revelar el código. | `public/index.html` | Se copia igual en los tres idiomas y no contiene el secreto. Se entrega junto con E3-T1 |
| **E3-T3 (r)** ✅ La tarjeta de fin de partida (3.8.1) | «He descifrado un código de 5 en 6 intentos»: algo que compartir al acabar cualquier partida, no solo la del día. | `public/index.html`: `shareGridRows()` sale del código del día y la tarjeta se arma en los tres finales | La tarjeta se calcula en el navegador, sin una lectura más en D1, y no contiene ningún código; `test/share-card.test.js` lo comprueba |

### Etapa 4 — El motor al servicio de quien juega (3.9.0 · 3.9.1) ✅

`public/computer-ai.js` ya sabe mantener el conjunto de códigos compatibles con todas las pistas y medir cómo un intento lo parte. Ese saber está encerrado en la práctica, y cuatro de las mejoras de este plan salen del mismo sitio: sacarlo de ahí es la tarea más rentable de la etapa aunque por sí sola no se vea.

| Tarea | Qué cambia para quien juega | Dónde se toca | Hecho cuando |
| --- | --- | --- | --- |
| **E4-T1** ✅ El solucionador, fuera del rival (3.9.0) | Nada todavía: es el cimiento de las cuatro siguientes. | `public/deduce.js` (nuevo), `public/computer-ai.js` queda como la cara del rival y toma de él todo lo que sabía | Las tres comprobaciones de `test/computer-ai.test.js` no cambian ni una coma —eso era lo que tenía que demostrar la extracción—; lo único que se tocó del archivo es cargar `deduce.js` en el mismo contexto, como hace la página. `test/deduce.test.js` cubre el motor. **Entregada con E4-T2** |
| **E4-T2 (n)** ✅ La partida que se explica (3.9.0) | Al terminar, cada intento recibe una nota —óptimo, correcto, desperdiciado— y se señala la jugada en la que la partida se decidió. | `public/index.html`: `analysisBlock()` en los cuatro finales; la puntuación vive en `Deduce.gradeGame()` | Se calcula entero en el navegador a partir de los intentos que ya están en la pantalla: ni una lectura más en D1. Por encima de 200 000 códigos no se pinta nada. Se entrega junto con E4-T1 |
| **E4-T3 (o)** ✅ El cuaderno y el aviso de contradicción (3.9.1) | Una cuadrícula para marcar símbolos descartados y confirmados, y un aviso cuando un intento contradice las pistas propias. **Es una opción de la partida, elegida al crearla**, para que los dos jueguen con las mismas reglas. | `public/index.html`, `src/game.js`, `src/index.js`, `public/deduce.js` (`contradicts()`), `migrations/0014_notebook_option.sql` | La opción viaja en la columna `notebook` de `games`, el servidor la valida y la revancha la hereda; con la opción apagada, la pantalla es la de siempre. Las marcas son personales y no salen del navegador: ni se envían ni cuestan una lectura. `test/notebook.test.js` lo fija |
| **E4-T4 (h)** ✅ Ver pensar al ordenador (3.9.1) | El ordenador ataca el código del jugador explicando cada jugada: «le quedaban 720 posibles → ahora 252 · parte la lista en 9 grupos». | `public/index.html`, `public/deduce.js` (`solver.explain()`) | Las cifras salen del mismo solucionador que elige la jugada, así que no cuestan una pasada de más: `before` es exacto y gratis, y el reparto se calla por encima de `EXPLAIN_LIMIT` en vez de bloquear el teléfono. Funciona sin conexión, como el resto de la práctica, y viaja con la práctica guardada. `test/computer-thinking.test.js` lo cubre |
| **E4-T5 (g)** ✅ Enigmas de deducción (3.9.1) | «Aquí tienes unas pistas y sus resultados: deduce el código.» 72 enigmas en tres dificultades, en solitario, sin rival, sin cuenta y sin coste en D1. | `tools/make-puzzles.mjs` (nuevo), `public/puzzles.json` (**generado: no se edita a mano**), `public/index.html` | `test/puzzles.test.js` comprueba que cada enigma tiene solución única y que el archivo publicado es exactamente el que produce el generador. El archivo no guarda ninguna solución: como es única, comprobar una respuesta es comprobar que es compatible con las pistas |

### Etapa 5 — Razones para volver (3.10.0) ✅

Hasta la 3.9.1 `leaderboard()` ordenaba por victorias y desempataba por partidas jugadas: quien jugaba doscientas y perdía la mitad iba por delante de quien ganaba nueve de diez, y el que llegó primero se quedaba arriba para siempre. Y cuando una partida terminaba, el rival desaparecía: la revancha solo existía en los segundos siguientes, aunque `chat_threads` guardara un hilo por pareja desde la 2.x. Las cuatro tareas se entregaron juntas porque comparten un mismo instante —el final de la partida— y una misma promesa: leer el ranking, un perfil o la lista de rivales no recorre `games`.

| Tarea | Qué cambia para quien juega | Dónde se toca | Hecho cuando |
| --- | --- | --- | --- |
| **E5-T1 (i)** ✅ Puntos y temporadas (3.10.0) | El ranking premia la dificultad de las reglas y la economía de intentos, y se reinicia cada mes conservando el histórico. | `src/score.js` (nuevo, puro), `src/season.js` (nuevo), `src/index.js`, `src/maintenance.js`, `migrations/0015_season.sql` | La respuesta de `leaderboard` cambió de forma —cada fila lleva `points`, la petición elige temporada y la lista viene ordenada por puntos—, y está documentada en «Revancha, historial y ranking». Los puntos se cuentan en el único sitio donde una partida termina de verdad, `recordFinishedGame()`, al que llaman los cuatro finales y la corrección de un administrador; el recibo de `game_scores` impide contar dos veces. `test/season.test.js` lo fija |
| **E5-T2 (j)** ✅ Perfil público (3.10.0) | Los nombres del ranking y del chat se pueden pulsar: victorias, reglas preferidas, mejor partida e insignias. | `src/season.js`, `src/index.js`, `public/index.html` | Solo lectura y solo lo que ya es público; una prueba comprueba que el correo no aparece en ninguna parte de la respuesta. Todo lo que se enseña estaba ya calculado: abrir un perfil son cuatro lecturas por clave, no una pasada por `games` |
| **E5-T3 (k)** ✅ Insignias (3.10.0) | «Resuelto en 4», «Ganada con 5 segundos», «Al Experto», «7 días seguidos», y tres más. | `src/season.js`, `migrations/0016_badges.sql`, `public/index.html` | Se calculan **al terminar la partida** y se guardan; las rachas viven en `player_progress`, fuera de toda temporada. Las recién ganadas viajan en la respuesta del intento que las gana y se enseñan en la tarjeta final, sin una consulta más |
| **E5-T4 (l)** ✅ Lista de rivales (3.10.0) | Una lista de con quién se ha jugado, con punto de presencia y botón de desafío. | `src/season.js`, `src/index.js`, `public/index.html` | Sale de `chat_threads` y de las partidas terminadas: sin tabla nueva. El desafío no inventa un camino nuevo —pide la revancha de la última partida de la pareja, que al rival le llega como invitación con su aviso— y el marcador se calcula con una sola consulta apoyada en los índices por `p1` y `p2` |

### Etapa 6 — La sala viva (3.10.1 · 3.10.2 · 3.11.0) ✅

Lo que queda es lo que hace que una sala parezca habitada, y lo más ambicioso del plan: dejar de exigir que haya exactamente dos personas libres a la vez.

| Tarea | Qué cambia para quien juega | Dónde se toca | Hecho cuando |
| --- | --- | --- | --- |
| **E6-T1 (p)** ✅ Espectador de verdad (3.10.1) | Desde el vestíbulo se puede mirar una partida pública en curso, con el chat en lectura. Alimenta también la portada de E1-T2. | `src/game.js` (`secretsFor`, `sanitizeGame`), `src/index.js` (`listGames` devuelve `watchable`), `src/chat.js` (lectura del espectador), `public/index.html` | **La tarea delicada del plan.** `test/spectator.test.js` recorre entera la respuesta que recibe quien mira una partida **activa** y comprueba que ninguno de los dos códigos aparece en ninguna parte, tampoco al terminar. El chat que lee es el de **esta** partida, filtrado por `game_id` y sin el identificador del hilo: el hilo de la pareja es más largo que la partida y sigue siendo privado |
| **E6-T2 (q)** ✅ Reacciones rápidas (3.10.2) | Cuatro frases hechas en los tres idiomas para quien juega desde el teléfono y no va a escribir. | `src/chat.js` (`REACTIONS`, `sendReaction`), `src/index.js` (acción `chatReact`), `public/index.html` | Reutiliza `chat_messages` con su tipo y la espera del zumbido; no abre ninguna vía nueva de moderación. Lo que se guarda es la **clave** (`react_gg\|Nombre`), no la frase, así que por esta vía no entra texto libre y cada pantalla la lee en su idioma. El tipo es el de los avisos de la partida porque el `CHECK` de `chat_messages` no admite uno nuevo y esta tarea no trae migración. `test/reactions.test.js` lo fija |
| **E6-T3 (m)** ✅ La arena (3.11.0) | De 3 a 8 jugadores contra el mismo código, a la vez, con clasificación en directo. Resuelve de raíz el «hacen falta dos al mismo tiempo». | `src/arena.js` (nuevo), `src/index.js`, `src/maintenance.js`, `migrations/0017_arena.sql`, `public/index.html` | `games` no sirve —es de dos, `p1` y `p2`—, así que la arena lleva tablas propias y no toca las partidas clásicas. Es la tercera razón de la mayor. `test/arena.test.js` fija lo que la hace justa —el código lo sortea el servidor y no sale hasta el final, nadie ve los intentos de nadie— y lo que la hace terminable: límite de intentos siempre, cierre automático cuando no queda nadie jugando e idempotencia por `requestId` |

### Etapa 7 — El cierre: 4.0.0 ✅

No era papeleo: era lo que separa dieciocho cambios sueltos de una versión. Lo que se hizo, en el orden en que estaba escrito:

1. ✅ La versión subió a `4.0.0` en los tres sitios, en un mismo commit.
2. ✅ Este documento se puso al día: «Estado actual», «Arquitectura y archivos» con `recovery.js` y `public/audio/`, «Modelo de datos» con las tablas de la arena y la regla de qué arrastra un cambio de nombre, «Reglas técnicas que no se deben romper» con cuatro reglas nuevas, y este plan, que pasa a ser historia. Se añadieron además las tres secciones de «Cómo se juega» que faltaban —la arena, mirar una partida y el chat con sus reacciones—, porque tres de las dieciocho mejoras solo estaban documentadas dentro de este plan.
3. ✅ Se regeneró lo generado: las tres páginas de reglas, las tres de instalación, `public/puzzles.json` y las tres guías PDF, que ahora hablan del código del día, de los enigmas, del cuaderno, de la arena y del análisis de la partida. Los iconos y las tarjetas OG no se tocaron porque la marca no cambió, y las capturas del manifest tampoco porque ninguna pantalla cambió de aspecto.
4. ✅ `npm test` completo, migraciones en local y `wrangler deploy --dry-run`.
5. ✅ Una auditoría entera antes de ponerle el número, con simulación exhaustiva de combinaciones de juego: «La auditoría de la 4.0.0».
6. ✅ Etiqueta anotada `v4.0.0` sobre el commit del cierre.

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
