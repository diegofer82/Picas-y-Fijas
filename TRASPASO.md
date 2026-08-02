# Picas y Fijas — Documento de traspaso

> **Para retomar el proyecto en Cowork / Claude Code.**
> Pega este archivo en la carpeta del proyecto (`Picas Y Fijas`) o su contenido en el primer mensaje.

---

## ⚠️ Lo primero: cuál es la versión buena

**La versión válida es la de la carpeta local `C:\Users\Diego\OneDrive\Documents\Picas Y Fijas`**
(y su despliegue en GitHub Pages).

El chat anterior tenía una copia **desactualizada**: le faltan dos funciones que Diego añadió
por su cuenta y que **no deben perderse**:

- **PIN de acceso** en el login (protege el nombre de usuario).
- **Abandonar partida** en el pie de la pantalla de juego.

👉 **Regla:** leer y editar SIEMPRE los archivos de la carpeta local. No reconstruir desde cero
ni pegar versiones antiguas encima.

---

## Qué es el proyecto

Juego web multijugador por turnos de **Picas y Fijas** (Bulls & Cows / Mastermind).
Dos jugadores eligen un código secreto y se turnan para adivinar el del rival.

- **Fija (F)** = símbolo correcto en la **posición correcta**.
- **Pica (P)** = símbolo correcto en **otra posición**.

Autor: **Diego OLAYA** — https://www.linkedin.com/in/diego-olaya-857bb6105
Créditos en la app: "Creado por Diego OLAYA · powered by Claude · 2026 · v1.3"
(la versión vive en la constante `APP_VERSION` del `index.html`).

---

## Arquitectura

| Pieza | Tecnología | Dónde |
|---|---|---|
| Frontend | **Un solo `index.html`** (HTML+CSS+JS vanilla, sin build) | GitHub Pages: `https://diegofer82.github.io/Picas-y-Fijas/` |
| Backend | **Google Apps Script** (`Code.gs`) | Ligado a una Google Sheet |
| Base de datos | Google Sheet, pestaña **`Partidas`** | 1 fila = 1 partida |
| Sincronización | *Polling* del cliente | 2 s en partida, 2,5 s en espera · 10 s en el lobby |

### Puntos técnicos que NO se deben romper

- **CORS**: el frontend llama por `POST` con `Content-Type: text/plain`. Es a propósito:
  evita el *preflight* que Apps Script no sabe responder. **No cambiar a `application/json`.**
- **URL del backend**: está fija en la constante `API` del `index.html` (termina en `/exec`).
  Cambiar el `Code.gs` exige **volver a implementar** en Apps Script
  (Implementar → Gestionar implementaciones → editar → Versión: **Nueva**). La URL no cambia.
- **Concurrencia**: toda escritura usa `LockService` para que dos jugadores no pisen el mismo turno.
- **Secretos**: los códigos secretos viven solo en la Sheet. La API **nunca** los devuelve,
  solo picas/fijas. El código propio se guarda en `localStorage` para mostrárselo al dueño.
- **Ceros a la izquierda** (bug ya corregido): Sheets convierte `"054"` en el número `54`.
  Hay un helper `padCode(v, digits)` que rellena al leer, y `sanitize()` **recalcula**
  picas/fijas al vuelo. **No quitar `padCode`** o se rompen los códigos que empiezan por 0.

---

## Acciones del backend (`Code.gs`)

Router en `handle(e)`; el cuerpo es un JSON con `{action, ...}`.

| Acción | Qué hace |
|---|---|
| `createGame` | Crea partida (reglas + secreto del creador). Devuelve `gameId` de 4 letras. Barre de paso las partidas abiertas caducadas. |
| `listGames` | Partidas públicas abiertas (no caducadas) + `activeCount` (partidas en curso). |
| `joinGame` | El rival entra con su secreto. Turno inicial **al azar**. |
| `state` | Estado saneado de la partida (sin secretos). Recalcula picas/fijas. |
| `guess` | Registra intento, evalúa, gestiona victoria/empate/desempate. |
| `passTurn` | Pasa el turno si el cronómetro expiró (verificado en servidor). |
| `myGames` | Partidas activas del jugador, con `yourTurn`. |
| `rematch` | Crea revancha con las mismas reglas y el mismo rival. |
| `history` | Partidas terminadas del jugador (rival, resultado, reglas, fecha). |
| `leaderboard` | Ranking global de victorias. |

### Columnas de la Sheet (`HEADERS`)

```
gameId, status, digits, p1, secret1, p2, secret2, turn, guesses, winner,
createdAt, updatedAt, allowRepeats, isPublic, mode, numColors,
maxAttempts, turnSeconds, turnStartedAt, rematchId, pendingWinner,
country1, country2, turnRemaining, timerPaused, manualPausedBy,
manualPauseUntil, lastManualPauseAt, lobbyPausedBy, revealSecrets,
timerReadyBy, timerActivated, finishReason
```

`status`: `waiting` → `active` → `finished`. También puede terminar como `expired`,
`inactive` o `cancelled`; un abandono se registra como `finished` con `finishReason = abandon`
y victoria para el rival.

> Si se añaden columnas, hay que **reimplementar** y conviene regenerar la pestaña
> (borrar `Partidas` para que se recree con los encabezados nuevos).

---

## Reglas de juego implementadas

- **Modo**: números `0-9` o **colores** (Mastermind). Los colores se guardan como dígitos
  `0..numColors-1`, así que **toda la lógica numérica sirve igual**; solo cambia la presentación.
- **Número de colores**: 4, 6 u 8 (paleta de 8 tonos en `COLORS`).
- **Posiciones**: 3, 4, 5 o 6.
- **Repetidos**: permitidos o no. El cálculo usa el **algoritmo general de Mastermind**
  (frecuencia mínima por símbolo), correcto con y sin repetidos.
- **Límite de intentos**: sin límite, 6 o 10 por jugador. Si ambos agotan sin acertar → **empate**.
- **Cronómetro**: sin límite, 30 s, 60 s o 2 min. Al llegar a 0 pasa el turno automáticamente
  (el servidor comprueba la marca de tiempo real; no se puede hacer trampa).
- **Visibilidad**: pública (aparece en el lobby) o privada (solo por código).
- **Quién empieza**: **siempre al azar**. Decisión de producto, no añadir selector.

### Regla de desempate (importante)

Si el jugador que **empezó la ronda** acierta, la partida **no termina**: se marca
`pendingWinner` y el rival recibe **un último intento para igualar**.

- Si el rival **también acierta** → **empate**.
- Si **falla** (o se le acaba el tiempo) → gana quien resolvió primero.
- Si acierta el que iba **segundo** en la ronda, gana de inmediato (la ronda ya estaba completa).

### Expiración

Las partidas **abiertas** caducan a las **2 horas** sin rival (`WAITING_TTL_MS`):
se ocultan del lobby, no se puede uno unir y se marcan `expired`.

---

## Funcionalidades del frontend

- **Idiomas**: español, inglés y francés. Objeto `I18N` (≈131 claves, **paridad exacta** entre
  los tres) + `ERR` para traducir errores del backend + `RULES` con las instrucciones.
  Los textos del HTML usan `data-i18n` / `data-i18n-ph`; `applyI18n()` los rellena.
  👉 **Al añadir una clave, añadirla en los TRES idiomas.**
- **Instrucciones** integradas ("¿Cómo se juega?") desde login y lobby.
- **Banderas por país**: se detecta por IP (GeoJS, con `api.country.is` de respaldo) y se envía
  en `createGame`/`joinGame`/`rematch`. Se usan **imágenes** de flagcdn.com, no emojis
  (en Windows los emojis de bandera no se renderizan). Helper `playerChip(cc, name)`.
- **Avisos**: chime generado con WebAudio + vibración + notificación del sistema cuando
  (a) es tu turno, (b) un rival se une a tu partida. Interruptor de sonido en el lobby.
- **Sonidos de fin**: victoria (ascendente), derrota (descendente), empate (dos notas iguales).
- **Enlace de invitación**: `?game=CODIGO` lleva directo a unirse. Botón **Compartir** usa el
  menú nativo del móvil.
- **Lobby**: contador `1/2` · `2/2`, "🟢 X en curso ahora", auto-refresco cada 10 s.
- **Revancha**, **historial**, **ranking**, cero con barra (`slashed-zero`) para no confundir 0 y 8.

---

## Ranking ampliado (implementado)

El backend `leaderboard(p)` devuelve el Top 50, el total de jugadores y la posición propia.
El frontend muestra el total y, si el usuario queda fuera del Top 50, añade su fila al final.

### Referencia de implementación

#### Backend — `leaderboard` con total y posición propia

Sustituir la función `leaderboard` de `Code.gs` por esta (ya probada). Cambia la firma a
`leaderboard(p)` y añade `total` y `me`:

```javascript
function leaderboard(p) {
  var username = cleanName(p && p.username);
  var rows = readAll();
  var stats = {};
  function ensure(u) { if (!stats[u]) stats[u] = { user: u, wins: 0, played: 0, country: '', _ts: '' }; return stats[u]; }
  function seen(u, country, ts) {
    var s = ensure(u);
    if (country && String(ts) > String(s._ts)) { s.country = country; s._ts = String(ts); }
  }
  for (var i = 0; i < rows.length; i++) {
    var g = rows[i];
    if (g.status !== 'finished') continue;
    if (g.p1) { ensure(g.p1).played++; seen(g.p1, cleanCountry(g.country1), g.updatedAt); }
    if (g.p2) { ensure(g.p2).played++; seen(g.p2, cleanCountry(g.country2), g.updatedAt); }
    if (g.winner) ensure(g.winner).wins++;
  }
  var list = [];
  for (var u in stats) { delete stats[u]._ts; list.push(stats[u]); }
  list.sort(function (a, b) {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.played - b.played;
  });
  var meEntry = null;
  for (var k = 0; k < list.length; k++) {
    if (list[k].user === username) {
      meEntry = { user: list[k].user, wins: list[k].wins, played: list[k].played, country: list[k].country, rank: k + 1 };
      break;
    }
  }
  return { ok: true, ranking: list.slice(0, 50), total: list.length, me: meEntry };
}
```

> El ranking muestra el **Top 50** (`slice(0, 50)`), no top 5. Ese número es el límite si algún
> día hay más jugadores.

#### Frontend — mostrar total y tu posición

En `openRank()`, pasar el usuario y usar los datos nuevos:

```javascript
const res = await api('leaderboard', { username: user });
```

**a) Total de jugadores** bajo el título ("Ranking global · 37 jugadores"):
añadir en el HTML de la sección ranking, tras el `<h2>`:

```html
<div class="scoretxt" id="rank-count" style="margin:2px 0 10px"></div>
```

y rellenarlo: `$('rank-count').textContent = t('rank_total', { n: res.total || 0 });`

**b) Tu fila aunque quedes fuera del Top 50**: si `res.me` existe y `res.me.rank > 50`
(o su nombre no está en la lista dibujada), añadir al final un separador y tu fila:

```html
<div class="rank-sep">···</div>
```

seguido de una `.rankrow.me` con `res.me.rank`, `playerChip(res.me.country, res.me.user)`
y `t('rank_wl', {wins: res.me.wins, played: res.me.played})`.

CSS del separador (ya redactado):

```css
.rank-sep{text-align:center;color:var(--muted);font-size:18px;letter-spacing:3px;padding:2px 0}
```

**c) Claves i18n a añadir en los TRES idiomas** (`rank_total`):

- es: `rank_total:"{n} jugadores"`
- en: `rank_total:"{n} players"`
- fr: `rank_total:"{n} joueurs"`

---

## Cómo desplegar

**Frontend**: subir `index.html` al repo de GitHub → recargar con `Ctrl+F5`.

**Backend**: pegar `Code.gs` en el editor de Apps Script → **Implementar → Gestionar
implementaciones → ✏️ editar → Versión: Nueva versión → Implementar**.
La URL `/exec` **no cambia**, así que no hay que tocar el `index.html`.

> Si solo se cambió el frontend, **no hace falta** reimplementar Apps Script.

---

## Cómo probar en local

Abrir el `index.html` no basta para probar dos jugadores: usar la web publicada y abrir
una **ventana normal** + una **ventana de incógnito** con dos nombres distintos
(el usuario se guarda en `localStorage`, que no se comparte entre ambas).

---

## Ideas pendientes (no aprobadas / aplazadas)

- **PWA instalable** (`manifest.json` + service worker + icono). Aplazado por Diego: "más adelante".
- Elegir quién empieza → **descartado** (siempre al azar).
- Revancha reusando el código anterior → **descartado**.
- Posibles: ordenar ranking por % de victorias, historial con detalle de la partida,
  purga automática de partidas viejas en la Sheet.

---

## Convenciones de trabajo

- Español para hablar con Diego; comentarios del código en español.
- **Un solo archivo** de frontend: no fragmentar en varios `.js`/`.css`.
- Sin frameworks ni paso de build: HTML/CSS/JS vanilla.
- Antes de entregar: comprobar sintaxis JS, que los `id` referenciados existan, que las
  funciones de `onclick` estén definidas y que las claves i18n tengan **paridad es/en/fr**.
- Subir `APP_VERSION` al añadir funcionalidad relevante.
