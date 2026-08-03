# Picas y Fijas — documento maestro

Este es el único documento de referencia del proyecto. Está pensado para personas y asistentes de IA: antes de modificar, desplegar o diagnosticar la aplicación, se debe leer completo y mantenerlo actualizado cuando cambie la arquitectura, la operación o una decisión importante.

## Estado actual

Picas y Fijas es un juego multijugador web en español, inglés y francés. La versión vigente funciona íntegramente en Cloudflare; la implementación anterior de Google Sheets y Apps Script fue retirada del árbol actual después de completar la migración. Sigue disponible en el historial de Git si alguna vez se necesita consultar.

- Juego: https://picas-y-fijas.picas-y-fijas.workers.dev/
- Administración: https://picas-y-fijas.picas-y-fijas.workers.dev/admin
- Repositorio: https://github.com/diegofer82/Picas-y-Fijas
- Rama de producción: `main`
- Worker y base D1: `picas-y-fijas` / `picas-y-fijas-db`

Cloudflare despliega automáticamente la rama `main`. No se debe modificar producción manualmente salvo una recuperación explícita.

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
- **Tiempo por turno:** sin límite, 30 segundos, 60 segundos o 2 minutos.
- **Visibilidad:** pública, visible en el lobby, o privada, accesible solamente mediante su código.
- **Revelar secretos al terminar:** desactivado inicialmente; si se activa, cada jugador podrá ver el código del rival cuando finalice la partida.

Al crearla se obtiene un código de partida de 4 caracteres y un enlace para compartir. Cada usuario puede mantener como máximo 3 partidas abiertas o activas y debe esperar 10 segundos entre creaciones.

### Unirse y comenzar

El segundo jugador puede elegir una partida pública del lobby, introducir su código o abrir el enlace de invitación. Debe definir un secreto que cumpla las reglas escogidas por el creador. El primer turno se asigna siempre al azar.

En partidas con cronómetro, la cuenta comienza cuando ambos jugadores han entrado y están listos. Hay una breve cortesía técnica antes del inicio del reloj para que las dos pantallas reciban el estado.

### Turnos, intentos y cronómetro

Durante su turno, el jugador envía un código completo. El servidor valida el intento, calcula picas y fijas y pasa el turno al rival.

- Con tiempo ilimitado, la partida puede jugarse de forma asíncrona: se puede volver al lobby y continuar minutos u horas después.
- En una partida cronometrada, al llegar a cero el turno pasa automáticamente al rival.
- El servidor es la autoridad del reloj; alterar la hora o la interfaz del navegador no permite jugar fuera de tiempo.
- Si un jugador vuelve al lobby durante una partida cronometrada, el reloj se detiene hasta que ambos regresen.
- La pausa manual solo está disponible con cronómetro, dura como máximo 5 minutos y tiene un minuto de espera antes de poder solicitar otra.
- Solo quien solicitó una pausa manual puede reanudarla antes de su vencimiento.

Volver al lobby no cancela ni abandona una partida. El navegador recuerda la partida abierta e intenta recuperarla después de recargar.

### Victoria, empate y último intento

Una partida normal termina cuando alguien obtiene tantas fijas como posiciones tenga el código. Para que ambos jugadores tengan el mismo número de oportunidades se aplica esta regla:

1. Si quien comenzó la ronda descifra el secreto, queda como ganador pendiente.
2. El rival recibe un último intento para igualar.
3. Si también lo descifra, la partida termina en empate.
4. Si falla o se le acaba el tiempo, gana quien acertó primero.
5. Si quien iba segundo en la ronda acierta sin que hubiera un ganador pendiente, gana inmediatamente porque la ronda ya estaba completa.

Cuando existe límite de intentos y ambos jugadores lo agotan sin resolver el código, la partida termina en empate.

### Cancelar, abandonar y caducidad

- El creador puede cancelar una partida mientras todavía espera un rival; no se registra victoria ni derrota.
- Abandonar una partida ya iniciada concede la victoria al rival y registra una derrota para quien abandona.
- Una partida que espera rival caduca después de 2 horas y desaparece del lobby.
- Una partida activa se cierra como inactiva después de 48 horas sin actividad; no cuenta como victoria, derrota ni empate.
- Cerrar sesión elimina inmediatamente la presencia del usuario. Para el contador general, se considera conectado a quien tuvo actividad durante los últimos 2 minutos.

### Revancha, historial y ranking

Al finalizar se puede proponer una revancha con las mismas reglas y el mismo rival. Se genera un código nuevo y cada jugador vuelve a escoger su secreto. El rival verá la invitación y podrá entrar mediante **Ir a la revancha**.

El historial muestra hasta las 40 partidas terminadas más recientes del jugador, con resultado, rival, fecha y reglas. El ranking global ordena primero por cantidad de victorias y, en caso de igualdad, favorece a quien necesitó menos partidas. Muestra el Top 50, el total de jugadores y la posición propia aunque quede fuera del Top 50.

### Interfaz y accesibilidad

- La aplicación está disponible en español, inglés y francés.
- Se puede enviar con Enter desde los campos principales, además de usar los botones.
- Las banderas indican el país detectado, pero no afectan las reglas.
- Puede emitir sonido, vibración o una notificación cuando llega el turno o entra un rival, según los permisos del dispositivo.
- Los avisos de victoria, derrota y empate tienen sonidos distintos.
- En modo numérico, el cero se muestra con una barra para diferenciarlo mejor del ocho.

## Arquitectura y archivos

- `public/index.html`: interfaz completa del juego, estilos, traducciones y cliente API.
- `public/admin.html`: panel reservado de administración.
- `src/index.js`: Worker, rutas, API, acceso a D1 y operaciones administrativas.
- `src/game.js`: reglas puras, validaciones, cronómetro y sanitización del estado.
- `src/security.js`: PIN, autenticación, sesiones y limitación de intentos.
- `migrations/0001_initial.sql`: esquema reproducible de D1. No es un residuo de la migración desde Google y no debe eliminarse.
- `test/`: pruebas automáticas de reglas, rutas, teclado y regresiones.
- `wrangler.jsonc`: configuración de Cloudflare, recursos y variables no secretas.
- `index.html`: aviso y redirección desde la dirección histórica de GitHub Pages.

No hay proceso de compilación del frontend. Wrangler sirve `public/` y ejecuta el Worker primero para `/api`, `/admin` y sus subrutas.

## Modelo de datos

- `users`: identidad, hash y sal del PIN, rol y bloqueo.
- `sessions`: sesiones temporales; el PIN no viaja durante las consultas periódicas.
- `games`: estado completo, opciones, cronómetro y versión de concurrencia.
- `presence`: usuario conectado y ubicación en lobby o partida.
- `request_receipts`: respuestas de jugadas ya procesadas para evitar duplicados.
- `audit_log`: acciones administrativas.

Los secretos de jugadores nunca deben exponerse mientras una partida esté activa. Toda nueva respuesta API debe pasar por la sanitización correspondiente.

## Reglas técnicas que no se deben romper

Cada partida tiene una columna `version`. Las modificaciones usan actualización condicional y reintentos para que dos peticiones simultáneas no sobrescriban el mismo estado.

Las jugadas incluyen `requestId`. Si el navegador repite una petición por pérdida de conexión, el servidor debe devolver el resultado guardado, no insertar una segunda jugada.

El servidor es la autoridad sobre turnos y temporizadores. El navegador muestra una cuenta regresiva basada en el estado recibido, pero no decide por sí solo el resultado. Una petición recibida tras expirar el turno debe ser rechazada y provocar la transición válida del servidor.

La administración no está enlazada desde el juego. Requiere una cuenta con rol `admin` y permite consultar, bloquear, restablecer PIN, cerrar partidas y exportar datos. Las acciones sensibles deben permanecer autenticadas y auditadas.

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

El plan gratuito de D1 incluye por cuenta 5 millones de filas leídas al día, 100.000 filas escritas al día y 5 GB de almacenamiento. Las cuotas diarias se reinician a las 00:00 UTC. Los índices reducen lecturas, pero actualizar una columna indexada puede sumar escrituras adicionales. Antes de aumentar el tráfico se deben revisar las métricas de D1, la frecuencia de consultas y el polling.

## Seguridad y archivos locales

Nunca se deben subir a GitHub:

- `.dev.vars`, `.env`, claves, tokens o credenciales;
- Excel, CSV, exportaciones o copias de seguridad;
- SQL con datos reales;
- `.private/`, `.wrangler/`, `dist/`, cachés o perfiles de rendimiento.

Estas exclusiones están definidas en `.gitignore`. Los PIN se almacenan con hash SHA-256 y una sal individual. No se deben registrar PIN, tokens de sesión, secretos de partida ni contenido privado en logs o documentación.

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
