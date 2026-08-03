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
