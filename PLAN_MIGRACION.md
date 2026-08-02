# Migración de Picas y Fijas

Última actualización: 2026-08-02

## Objetivo

Migrar el juego desde Google Apps Script y Google Sheets a:

GitHub → despliegue automático en Cloudflare → Worker para la API y los archivos web → D1 para los datos.

La versión actual seguirá disponible hasta que la nueva versión haya superado las pruebas.

## Estado general

**Fase actual:** 3. Creación del proyecto Cloudflare y D1.

**Siguiente acción:** autorizar la cuenta Cloudflare, crear D1 remoto y reemplazar el identificador provisional.

## Plan de trabajo

- [x] 1. Confirmar cuentas, repositorio, dominio y decisiones funcionales.
- [x] 2. Auditar el juego actual y documentar rutas, datos y reglas.
- [x] 3. Diseñar la arquitectura, el esquema D1 y las reglas de concurrencia.
- [ ] 4. Crear el proyecto Cloudflare Worker, configuración y migraciones D1. _(local completado; remoto pendiente)_
- [x] 5. Adaptar la interfaz y migrar la lógica de `Code.gs`.
- [x] 6. Implementar autenticación, validación, idempotencia y control de turnos.
- [ ] 7. Reducir el polling y optimizar presencia y actualización de partidas. _(presencia optimizada; polling pendiente de medición)_
- [ ] 8. Crear pruebas automáticas y simulaciones de varios jugadores. _(pruebas esenciales completadas; ampliar matriz pendiente)_
- [ ] 9. Configurar el repositorio y el despliegue automático en Cloudflare.
- [ ] 10. Migrar los datos que se decida conservar.
- [ ] 11. Publicar una versión de prueba y validarla desde varios países/dispositivos.
- [ ] 12. Publicar la versión final, documentar copias y preparar reversión.

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

## Decisiones pendientes

- Nombre final disponible del subdominio `workers.dev`.
- Compatibilidad del algoritmo actual de hash de PIN con Web Crypto en Cloudflare.
