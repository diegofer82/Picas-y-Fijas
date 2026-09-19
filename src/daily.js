import { cleanCountry, evaluate, parseJsonList, toInt, validateCode } from "./game.js";

/* -------------------- el código del día --------------------
   Un secreto por día, el mismo para todo el mundo, un intento diario. No hay
   fila de partida: el secreto se deriva del día con HMAC-SHA256 y un secreto
   del Worker, de modo que no se guarda en claro en ninguna parte y no se
   puede calcular desde el navegador. La tabla `daily_results` solo guarda lo
   que hizo cada persona, y su clave primaria (día + cuenta) es la que impide
   entregar dos veces el mismo día.

   El día es UTC a propósito: «el mismo código para todo el mundo» deja de ser
   verdad en cuanto cada zona horaria empieza el suyo cuando le toca. */

export const DAILY_RULES = Object.freeze({
  mode: "numbers",
  numColors: 10,
  digits: 4,
  allowRepeats: false,
  maxAttempts: 8,
});

const DAY_MS = 24 * 60 * 60 * 1000;
// El día 1 es el 1 de enero de 2026; solo sirve para numerar lo que se comparte.
const EPOCH_MS = Date.UTC(2026, 0, 1);
/* Sin `DAILY_SECRET` configurado el juego sigue funcionando —las pruebas y
   `wrangler dev` no tienen secretos—, pero entonces el código del día es
   calculable desde este repositorio, que es público. En producción el secreto
   se pone con `wrangler secret put DAILY_SECRET`. */
const FALLBACK_SECRET = "picas-y-fijas/daily/sin-configurar";

export const dayKey = (at = Date.now()) => new Date(at).toISOString().slice(0, 10);
export const dayStartMs = (day) => Date.parse(`${day}T00:00:00.000Z`);
export const dayNumber = (day) => Math.floor((dayStartMs(day) - EPOCH_MS) / DAY_MS) + 1;
export const nextDayIso = (day) => new Date(dayStartMs(day) + DAY_MS).toISOString();

/* El código no se saca del azar sino del propio resumen: una baraja de 0 a 9
   mezclada con los bytes del HMAC. Mismo día y mismo secreto, misma baraja. */
export async function dailySecret(env, day) {
  const material = String(env?.DAILY_SECRET || FALLBACK_SECRET);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(material),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`picas-y-fijas/daily/v1/${day}`)),
  );
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let index = pool.length - 1; index > 0; index--) {
    const swap = signature[index] % (index + 1);
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, DAILY_RULES.digits).join("");
}

const rules = () => ({
  mode: DAILY_RULES.mode,
  numColors: DAILY_RULES.numColors,
  digits: DAILY_RULES.digits,
  allowRepeats: DAILY_RULES.allowRepeats,
  maxAttempts: DAILY_RULES.maxAttempts,
});

async function loadRow(db, day, user) {
  return db
    .prepare("SELECT * FROM daily_results WHERE day=? AND username_key=?")
    .bind(day, user.username_key)
    .first();
}

/* Dos lecturas para la pantalla entera: la tabla del día y el recuento. El
   índice parcial las cubre y ninguna de las dos entra en un polling. */
async function boardFor(db, day, row) {
  const [listed, totals] = await Promise.all([
    db
      .prepare(
        `SELECT username,country,attempts,duration_ms FROM daily_results
         WHERE day=? AND solved=1 ORDER BY attempts ASC, duration_ms ASC LIMIT 10`,
      )
      .bind(day)
      .all(),
    db
      .prepare("SELECT COUNT(*) AS players, SUM(solved) AS solved FROM daily_results WHERE day=?")
      .bind(day)
      .first(),
  ]);
  const board = (listed.results || []).map((entry, index) => ({
    rank: index + 1,
    username: entry.username,
    country: cleanCountry(entry.country),
    attempts: toInt(entry.attempts),
    durationMs: toInt(entry.duration_ms),
    you: entry.username === row?.username,
  }));
  return { board, players: toInt(totals?.players), solvedCount: toInt(totals?.solved) };
}

async function rankOf(db, day, row) {
  if (!row || !toInt(row.solved)) return 0;
  const ahead = await db
    .prepare(
      `SELECT COUNT(*) AS ahead FROM daily_results
       WHERE day=? AND solved=1 AND (attempts<? OR (attempts=? AND duration_ms<?))`,
    )
    .bind(day, toInt(row.attempts), toInt(row.attempts), toInt(row.duration_ms))
    .first();
  return toInt(ahead?.ahead) + 1;
}

/* El secreto solo sale cuando la jugada del día está cerrada, igual que en una
   partida terminada. Mientras se juega, la respuesta lleva pistas y nada más.
   `requestId` tampoco viaja de vuelta: es del servidor, no de la pantalla. */
function present(day, secret, row, extra = {}) {
  const guesses = parseJsonList(row?.guesses_json).map((entry) => ({
    guess: String(entry.guess || ""),
    fijas: toInt(entry.fijas),
    picas: toInt(entry.picas),
  }));
  const finished = !!toInt(row?.finished);
  return {
    ok: true,
    day,
    number: dayNumber(day),
    nextAt: nextDayIso(day),
    rules: rules(),
    guesses,
    attempts: guesses.length,
    attemptsLeft: Math.max(0, DAILY_RULES.maxAttempts - guesses.length),
    solved: !!toInt(row?.solved),
    finished,
    durationMs: toInt(row?.duration_ms),
    startedAt: row?.started_at || "",
    secret: finished ? secret : "",
    ...extra,
  };
}

export async function dailyState(db, env, user, at = Date.now()) {
  const day = dayKey(at);
  const secret = await dailySecret(env, day);
  const row = await loadRow(db, day, user);
  const [totals, yourRank] = await Promise.all([boardFor(db, day, row), rankOf(db, day, row)]);
  return present(day, secret, row, { ...totals, yourRank });
}

export async function dailyGuess(db, env, user, params, at = Date.now()) {
  const day = dayKey(at);
  const secret = await dailySecret(env, day);
  const guess = String(params?.guess || "").trim();
  const invalid = validateCode(guess, DAILY_RULES.digits, DAILY_RULES.allowRepeats, DAILY_RULES.numColors);
  if (invalid) return { ok: false, error: invalid };
  const requestId = String(params?.requestId || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 80);
  const stamp = new Date(at).toISOString();

  for (let round = 0; round < 3; round++) {
    const row = await loadRow(db, day, user);
    const guesses = parseJsonList(row?.guesses_json);
    /* Idempotencia: el mismo envío repetido —una conexión que tardó y se
       reintentó— no gasta un intento, devuelve lo que ya quedó escrito. */
    if (requestId && guesses.some((entry) => entry.requestId === requestId))
      return dailyState(db, env, user, at);
    if (row && toInt(row.finished))
      return {
        ...(await dailyState(db, env, user, at)),
        ok: false,
        error: "Ya jugaste el código de hoy.",
        code: "daily_done",
      };

    const score = evaluate(secret, guess);
    guesses.push({ guess, ...score, ...(requestId ? { requestId } : {}), ts: stamp });
    const solved = score.fijas === DAILY_RULES.digits;
    const finished = solved || guesses.length >= DAILY_RULES.maxAttempts;
    const startedAt = row?.started_at || stamp;
    const durationMs = finished ? Math.max(0, at - Date.parse(startedAt)) : 0;
    const finishedAt = finished ? stamp : null;

    /* Concurrencia optimista sin columna `version`: el número de intentos ya es
       el contador que avanza con cada jugada, así que dos pestañas a la vez no
       pueden escribir la misma. */
    const written = row
      ? await db
          .prepare(
            `UPDATE daily_results SET guesses_json=?,attempts=?,solved=?,finished=?,duration_ms=?,updated_at=?,finished_at=?
             WHERE day=? AND username_key=? AND attempts=?`,
          )
          .bind(
            JSON.stringify(guesses), guesses.length, solved ? 1 : 0, finished ? 1 : 0, durationMs,
            stamp, finishedAt, day, user.username_key, guesses.length - 1,
          )
          .run()
      : await db
          .prepare(
            `INSERT OR IGNORE INTO daily_results(day,username_key,username,country,guesses_json,attempts,solved,finished,duration_ms,started_at,updated_at,finished_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            day, user.username_key, user.username, cleanCountry(user.last_country),
            JSON.stringify(guesses), guesses.length, solved ? 1 : 0, finished ? 1 : 0, durationMs,
            startedAt, stamp, finishedAt,
          )
          .run();
    if (Number(written.meta?.changes) === 1) return dailyState(db, env, user, at);
  }
  return { ok: false, error: "El código del día cambió mientras se procesaba tu intento." };
}
