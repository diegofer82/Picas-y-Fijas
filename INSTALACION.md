# Picas y Fijas — Guía de instalación

Misma arquitectura que la app del stand: **Google Apps Script** (backend + base de datos)
+ **index.html** en **GitHub Pages** (frontend). El teléfono/navegador consulta el estado
cada 2,5 s para los turnos.

---

## Paso 1 — Backend (Google Apps Script)

1. Crea una **Google Sheet** nueva y vacía (será la base de datos).
2. Menú **Extensiones → Apps Script**.
3. Borra el contenido de `Código.gs` y pega todo el archivo **Code.gs**.
4. Guarda (💾).
5. **Implementar → Nueva implementación → Aplicación web**:
   - *Descripción*: Picas y Fijas
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier persona**
6. Autoriza los permisos cuando lo pida.
7. Copia la **URL de la aplicación web** (termina en `/exec`).

ID de déploiement
AKfycbyjJRp_ZokFiKyRK3-P2kA8shD1SR73zjP3DMbynf09BvCOpGDGNoHULXf-uDy40pEI
URL
https://script.google.com/macros/s/AKfycbyjJRp_ZokFiKyRK3-P2kA8shD1SR73zjP3DMbynf09BvCOpGDGNoHULXf-uDy40pEI/exec

> La pestaña "Partidas" con sus columnas se crea sola en la primera partida.

---

## Paso 2 — Frontend (index.html)

1. Abre **index.html** y en la línea de `const API =` pega tu URL `/exec`:

   ```js
   const API = 'https://script.google.com/macros/s/AKfy.../exec';
   ```

2. Guarda.

---

## Paso 3 — Publicar en GitHub Pages

1. Crea un repositorio (o usa uno existente) y sube **index.html**.
2. **Settings → Pages → Branch: main / (root) → Save**.
3. A los ~1-2 min tendrás una URL tipo `https://tuusuario.github.io/picasfijas/`.
4. Ábrela en el móvil y **"Añadir a la pantalla de inicio"** para que quede como app.

https://diegofer82.github.io/Picas-y-Fijas/

---

## Cómo se juega

1. Cada jugador registra un **nombre de usuario** con un **PIN de 4 a 8 dígitos**. El nombre se usa también en el ranking y el PIN evita que otra persona lo duplique o suplante.
2. Uno **crea partida** y elige las reglas:
   - **Modo**: números 0-9 o **colores** (4, 6 u 8 colores, estilo Mastermind).
   - **Posiciones**: 3, 4, 5 o 6.
   - **Repetidos**: permitir o no.
   - **Límite de intentos**: sin límite, 6 o 10 por jugador.
   - **Tiempo por turno**: sin límite, 30 s, 60 s o 2 min.
   - **Visibilidad**: pública (lobby) o privada (solo por código).
   - **Revelar códigos al terminar**: desactivado por defecto; si se activa, cada jugador ve el código secreto de su rival al finalizar.
   Define su código secreto y obtiene un **código de partida de 4 caracteres** para compartir.
3. El otro se une desde el lobby o con el código, y define su propio secreto con las mismas reglas.
4. Se turnan para adivinar. El servidor responde **Fijas** (verde) y **Picas** (ámbar).
5. Gana quien descifra primero el código del rival. Con límite de intentos, si nadie acierta → **empate**.
6. Al terminar: botón **Revancha** (misma configuración, mismo rival). Cuando uno la propone,
   el otro ve **"Ir a la revancha"** y se une con un código nuevo.

> **Modo colores:** los 6 colores se guardan internamente como dígitos 0-5, así que el cálculo de
> picas/fijas es el mismo. Solo cambia la presentación (fichas de color en vez de cifras).

> **Cronómetro:** cada cliente muestra la cuenta atrás; al llegar a 0 se pasa el turno automáticamente
> (verificado en el servidor con la marca de tiempo, para que no se pueda hacer trampa).

---

## Notas técnicas

- **CORS**: el frontend llama por `POST` con `Content-Type: text/plain` para evitar el *preflight*
  que Apps Script no responde. No cambies eso.
- **Concurrencia**: todas las escrituras usan `LockService`.
- **Seguridad**: los códigos secretos viven solo en la Sheet; la API **nunca** los devuelve, solo
  picas/fijas. Tu propio código se recuerda en `localStorage` del dispositivo para mostrártelo.
- **Ranking**: se calcula al vuelo contando victorias y partidas terminadas en la Sheet.
- **Expiración**: una partida que permanece abierta sin rival durante 2 horas se marca como `expired` y desaparece de las partidas activas.
- **Inactividad**: una partida ya comenzada que no registra actividad durante 48 horas se marca como `inactive`. No cuenta como victoria, derrota ni empate.
- **Cancelación y abandono**: el creador puede cancelar una espera inmediatamente; cualquiera de los dos jugadores puede abandonar una partida activa sin otorgar una victoria.
- **Protección antiabuso**: cada usuario puede mantener hasta 3 partidas abiertas/activas, debe esperar 10 segundos entre creaciones y queda bloqueado 15 minutos después de 5 PIN incorrectos.
- **Jugadores conectados**: se consideran conectados los usuarios autenticados con actividad durante los últimos 2 minutos. Cerrar sesión elimina la presencia inmediatamente.
- **Cronómetro pausable**: en partidas con tiempo, volver al lobby detiene el reloj inmediatamente hasta que ambos jugadores regresen. La pausa manual dura como máximo 5 minutos y solo está disponible en partidas cronometradas.
- **Juego asíncrono**: las partidas sin tiempo por turno no se bloquean al volver al lobby. Cada jugador puede continuar cuando esté disponible, incluso minutos u horas después. La pausa manual solo aparece en partidas cronometradas.
- **Recuperación tras refresh**: el navegador recuerda la partida que estaba abierta e intenta reanudarla automáticamente después de recargar la página.
- **Base de datos**: cada partida es una fila en "Partidas". Para limpiar, borra filas (o te añado purga automática).

## Funciones implementadas

- ✅ Modo **números** o **colores** (Mastermind, 4, 6 u 8 colores).
- ✅ Posiciones: 3, 4, 5 o 6.
- ✅ Permitir / no permitir repetidos.
- ✅ **Límite de intentos** por jugador (con empate si nadie acierta).
- ✅ **Cronómetro** por turno con paso de turno automático.
- ✅ Partida pública (lobby) o privada (solo por código).
- ✅ **Revancha** con el mismo rival.
- ✅ **Ranking global** de victorias.
- ✅ **Historial** de las últimas partidas terminadas.
- ✅ Avisos sonoros, vibración y **notificaciones** cuando llega tu turno o entra un rival.
- ✅ Pausa automática al volver al lobby y pausa manual de hasta 5 minutos en partidas cronometradas.
- ✅ Opción de revelar los códigos secretos al terminar.
- ✅ Turno a turno con turno inicial al azar.

## Ideas para más adelante (dímelo y lo agrego)

- PWA completa con `manifest.json` + service worker (instalación offline).
- Purga automática de partidas antiguas en la Sheet.
- Estadísticas más detalladas en historial y ranking.
