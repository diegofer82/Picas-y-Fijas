# Migración de Picas y Fijas

Última actualización: 2026-08-03

## Objetivo

Migrar el juego desde Google Apps Script y Google Sheets a:

GitHub → despliegue automático en Cloudflare → Worker para la API y los archivos web → D1 para los datos.

La versión actual seguirá disponible hasta que la nueva versión haya superado las pruebas.

## Estado general

**Fase actual:** migración completada.

**Siguiente acción:** mantenimiento normal y seguimiento de métricas/errores en Cloudflare.

## Plan de trabajo

- [x] 1. Confirmar cuentas, repositorio, dominio y decisiones funcionales.
- [x] 2. Auditar el juego actual y documentar rutas, datos y reglas.
- [x] 3. Diseñar la arquitectura, el esquema D1 y las reglas de concurrencia.
- [x] 4. Crear el proyecto Cloudflare Worker, configuración y migraciones D1.
- [x] 5. Adaptar la interfaz y migrar la lógica de `Code.gs`.
- [x] 6. Implementar autenticación, validación, idempotencia y control de turnos.
- [x] 7. Reducir el polling y optimizar presencia y actualización de partidas.
- [x] 8. Crear pruebas automáticas y simulaciones de varios jugadores.
- [x] 9. Configurar el repositorio y el despliegue automático en Cloudflare.
- [x] 10. Migrar los datos que se decidió conservar.
- [x] 11. Publicar una versión de prueba y validarla desde varios países/dispositivos.
- [x] 12. Publicar la versión final, documentar copias y preparar reversión.

## Criterios mínimos antes de publicar

- Dos o más partidas independientes pueden jugarse simultáneamente.
- Una petición repetida no duplica una jugada.
- Dos jugadores no pueden ejecutar válidamente el mismo turno.
- Los errores temporales se reintentan sin romper la partida.
- La interfaz recupera el estado después de recargar o perder conexión.
- No se guardan secretos en GitHub ni en el navegador.
- Existen instrucciones de instalación, despliegue, copia y restauración.
- La versión actual permanece recuperable durante el lanzamiento.

## Registro de acciones

### 2026-08-02

- Creado el plan inicial de migración.
- Comprobado que la carpeta actual todavía no es un repositorio Git.
- Comprobado que Git está instalado.
- Comprobado que GitHub CLI (`gh`) no está instalado; se podrá usar Git Credential Manager o instalar `gh` más adelante.
- Confirmado el repositorio público `diegofer82/Picas-y-Fijas`, rama `main` e historial existente.
- Confirmada la conservación de datos, funciones, apariencia y tres idiomas.
- Confirmado el acceso por usuario y PIN, con un módulo administrativo para `Diego`.
- Definido un objetivo inicial inferior a 20 usuarios concurrentes y diseño preparado para 100.
- Confirmado que la versión de Google seguirá activa durante la migración.
- Confirmado el uso inicial de un subdominio gratuito `workers.dev`.
- Acordado trabajar en bloques completos y publicar únicamente después de confirmación.
- Creado `.gitignore` para impedir la publicación de hojas, CSV, secretos, copias y archivos temporales.
- Inspeccionada de forma local y sin modificar `Picas y Fijas.xlsx`: 9 usuarios y 27 partidas, más una hoja vacía.
- Confirmado que los PIN existentes ya utilizan `pinSalt` y `pinHash`; `Diego` existe como usuario.
- Aprobado el alcance completo del módulo administrativo en una dirección separada del juego.
- Vinculada la carpeta con `origin/main` y descargado su historial sin sobrescribir ni publicar archivos.
- Confirmado que el `index.html` local coincide con el existente en GitHub.
- Inventariadas las 16 acciones públicas del servidor Apps Script y sus reglas.
- Creado el esquema D1 con usuarios, sesiones, partidas, presencia, recibos idempotentes y auditoría.
- Implementada una sesión temporal: el jugador conserva nombre/PIN, pero el PIN deja de viajar en cada polling.
- Implementado control optimista por versión de partida, sin bloqueo global.
- Migradas las acciones de juego, cronómetros, pausa, presencia, revancha, historial y ranking.
- Creado el panel separado `/admin` con bloqueo, PIN, cierre de partidas, exportación y API de roles/corrección.
- Adaptada una copia de la interfaz a `/api`, conservando apariencia, funciones y tres idiomas.
- Generado un importador privado desde Excel; importación local verificada con 9 usuarios, 27 partidas y 1 administrador.
- Creada y migrada la base D1 local: 17 operaciones de esquema correctas.
- Pruebas unitarias: 4 de 4 correctas.
- Prueba integral local: registro, sesión, creación, unión, estado, secreto protegido, jugada y ranking correctos.
- Prueba de concurrencia: una sola unión gana la plaza y dos reintentos simultáneos guardan una sola jugada.
- Compilación `wrangler deploy --dry-run` correcta con Worker, D1 y 2 archivos estáticos.
- Añadidas documentación de arquitectura e instalación paso a paso.
- Creado el commit local `732eee7` con el primer bloque completo; todavía no se ha subido a GitHub ni publicado en Cloudflare.
- Verificado que la terminal Cloudflare aún requiere autorización interactiva mediante `wrangler login`.
- Autorizados Wrangler y los cinco MCP oficiales de Cloudflare.
- Instaladas 11 habilidades oficiales desde `cloudflare/skills`.
- Revisado el Worker con las prácticas oficiales vigentes de Cloudflare.
- Activados `nodejs_compat`, logs estructurados y trazas con muestreo del 5 %.
- Añadidos límite de 32 KiB para peticiones JSON y comparación temporalmente segura del hash del PIN.
- Generados los tipos reales de bindings en `worker-configuration.d.ts`.
- Perfil de arranque correcto: 44,39 KiB, 10,86 KiB comprimido y 0,0 ms de CPU activa en la muestra local.
- Creada la base remota `picas-y-fijas-db` en región OC con identificador `efd19588-399d-4c98-a8c1-3d89ed3a465e`.
- Aplicada y verificada la migración remota `0001_initial.sql`; datos remotos todavía vacíos.
- Repetida la prueba integral después de los cambios oficiales: correcta.

### 2026-08-03

- Publicados en GitHub los commits `506a12e` y `b658423` tras autorización expresa.
- Desplegado el Worker público en `https://picas-y-fijas.picas-y-fijas.workers.dev`.
- Confirmado el subdominio gratuito de la cuenta `picas-y-fijas.workers.dev`; no se necesita comprar ni transferir un dominio.
- Detectado en la primera comprobación un bucle de redirección en `/admin` causado por el manejo automático de archivos HTML.
- Corregida la configuración de recursos estáticos y repetidas las 4 pruebas automáticas y la validación de despliegue, todas correctas.
- Desplegada la corrección como versión Cloudflare `badcd849-2fa6-478c-ac46-ff35e53e9688`.
- Verificadas públicamente la portada, la API y la ruta administrativa separada `/admin`, todas con respuesta correcta.
- Ejecutada una prueba remota con tres usuarios ficticios: una sola unión ganó la plaza, el secreto rival quedó protegido y una petición duplicada guardó una sola jugada.
- Retirados exclusivamente los tres usuarios y la partida ficticios; verificado que la base remota vuelve a tener 0 usuarios, 0 partidas, 0 sesiones, 0 presencias y 0 recibos.
- Acordado reservar para el final el reemplazo del `index.html` antiguo por una página de aviso y redirección al nuevo enlace, después de validar y migrar los datos.
- Detectado durante la validación visual que `/` devolvía 404 aunque `/admin` funcionaba, debido a que el modo HTML estricto no asignaba automáticamente `index.html`.
- Añadido enrutamiento explícito de `/` hacia `index.html` y una prueba automática para las dos entradas públicas.
- Superadas 5 de 5 pruebas y desplegada la corrección como versión Cloudflare `b29d3e1f-c3e1-44d9-8b51-d64bd01c6388`.
- Verificado el contenido público real: `/` responde 200 con el juego completo y `/admin` responde 200 con el panel administrativo.
- Confirmada por el propietario una partida real completa, funcionamiento correcto y eliminación de los problemas de lentitud.
- Verificado nuevamente `Picas y Fijas.xlsx`: 9 usuarios, 27 partidas y Diego presente como administrador.
- Guardada una copia SQL privada de D1 anterior a la importación final.
- Importados los 9 usuarios y las 27 partidas históricas sin duplicados; conservada también la partida real de validación, para un total de 28 partidas.
- Confirmado en D1 que Diego tiene rol `admin` y que las sesiones activas permanecieron disponibles.
- Sustituido el `index.html` antiguo de GitHub por una página trilingüe de aviso y redirección al nuevo Worker; la versión previa continúa recuperable en el historial Git.
- Instalada la aplicación oficial de Cloudflare en GitHub con acceso limitado únicamente a `diegofer82/Picas-y-Fijas`.
- Activado Cloudflare Builds desde la rama `main` con despliegue automático mediante `npx wrangler deploy`.

## Decisiones confirmadas

- Código fuente: GitHub.
- Ejecución y alojamiento: Cloudflare Workers.
- Base de datos: Cloudflare D1.
- Despliegue: automático desde GitHub.
- Repositorio: `https://github.com/diegofer82/Picas-y-Fijas`, público.
- Datos: conservar usuarios, PIN, clasificación, historial y demás datos útiles de Google Sheets.
- Acceso: conservar nombre de usuario y PIN; los PIN se almacenarán de forma segura en la nueva base.
- Administración: usuario administrador `Diego` y módulo administrativo.
- Producto: conservar funciones, apariencia y español, inglés y francés.
- Capacidad: optimizar para menos de 20 usuarios inicialmente y prever 100.
- Lanzamiento: mantener activa la versión de Google y usar inicialmente `workers.dev`.
- Flujo: cambios en bloques; despliegue público solo tras confirmación del propietario.
- Administración: panel en ruta separada, sin enlace visible en la interfaz del juego.
- Datos sensibles: las hojas y exportaciones quedan siempre excluidas de GitHub.

## Cierre

- Migración finalizada el 2026-08-03.
- Sitio oficial: `https://picas-y-fijas.picas-y-fijas.workers.dev/`.
- Panel administrativo: `https://picas-y-fijas.picas-y-fijas.workers.dev/admin`.
- La versión de Google y el historial Git permanecen disponibles como reversión.
