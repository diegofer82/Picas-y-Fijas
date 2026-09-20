import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { seedAccount } from "./accounts.js";

/* La auditoría del cierre de la 4.0.0.

   Dieciocho mejoras repartidas en seis etapas dejan grietas en las costuras,
   y no en el sitio donde se miró al escribirlas. Estas pruebas fijan lo que
   encontró la simulación exhaustiva del cierre —90 juegos de reglas jugados
   hasta el final, arenas de 3 a 8, y unas 1.100 llamadas con parámetros
   hostiles—: cuatro cosas que se daban por ciertas y no lo eran.

   1. Una partida terminaba sin contarse cuando la bandera la descubría el
      rival al consultar o quien intentaba jugar fuera de tiempo: dos de los
      cinco caminos que cierran una partida no pasaban por
      `recordFinishedGame()`, y una partida con bolsa de tiempo cerrada por el
      reloj no repartía ni un punto ni una insignia.
   2. La arena guarda el nombre escrito, como el ranking, pero el cambio de
      nombre no la arrastraba: renombrarse dejaba a la persona fuera de su
      propia arena.
   3. Borrar una cuenta no borraba sus filas de la arena, así que su nombre
      seguía en la clasificación de cada arena que jugó.
   4. Un navegador podía hacer que el servidor respondiera 500 con un cuerpo
      demasiado grande, con un cuerpo que no fuera un objeto o con un campo
      que no fuera un valor simple. */

let mf;
let db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: "src/index.js",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
    compatibilityDate: "2026-08-02",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "00000000-0000-0000-0000-000000000020" },
    bindings: { SESSION_TTL_HOURS: "168", ADMIN_PATH: "/admin", DEBUG_ERRORS: "1" },
  });
  db = await mf.getD1Database("DB");
  const files = (await readdir(new URL("../migrations/", import.meta.url))).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const migration = await readFile(new URL("../migrations/" + file, import.meta.url), "utf8");
    for (const statement of migration.split(";").map((sql) => sql.trim()).filter(Boolean))
      await db.prepare(statement).run();
  }
});

after(async () => mf?.dispose());

async function raw(body, token = "") {
  return mf.dispatchFetch("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function api(action, payload = {}, token = "") {
  const response = await raw({ action, ...payload }, token);
  assert.equal(response.status, 200, action + " devolvió HTTP " + response.status);
  return response.json();
}

async function player(username) {
  await seedAccount(db, username);
  const logged = await api("loginUser", { identifier: username, pin: "2468", country: "es" });
  assert.equal(logged.ok, true, logged.error);
  return { username: logged.username, token: logged.sessionToken, key: username.toLocaleLowerCase() };
}

/* Una partida con bolsa de tiempo, empezada y con las dos pantallas listas.
   El creneau de diez segundos entre creaciones se esquiva envejeciendo las
   partidas anteriores, que es lo que haría el reloj si la prueba esperara. */
async function bankGame(host, guest) {
  await db.prepare("UPDATE games SET created_at='2026-01-01T00:00:00.000Z'").run();
  await db.prepare("UPDATE games SET status='cancelled' WHERE status IN ('waiting','active')").run();
  const created = await api("createGame", {
    secret: "0123", digits: 4, country: "es", isPublic: true,
    timeMode: "bank", bankSeconds: 180, bankIncrement: 0,
  }, host.token);
  assert.equal(created.ok, true, created.error);
  const joined = await api("joinGame", { gameId: created.gameId, secret: "4567", country: "fr" }, guest.token);
  assert.equal(joined.ok, true, joined.error);
  await api("state", { gameId: created.gameId }, host.token);
  await api("state", { gameId: created.gameId }, guest.token);
  return created.gameId;
}

// Deja a cero la bolsa de quien tiene el turno: la bandera ya cayó, falta que
// alguien lo descubra.
async function dropFlag(gameId, turn) {
  const column = turn === 1 ? "bank1_remaining" : "bank2_remaining";
  await db.prepare(`UPDATE games SET ${column}=0,turn_started_at=? WHERE game_id=?`)
    .bind(new Date(Date.now() - 5000).toISOString(), gameId).run();
}

const receiptFor = async (gameId) =>
  db.prepare("SELECT game_id FROM game_scores WHERE game_id=?").bind(gameId).first();

test("la bandera que descubre el rival al consultar cierra la partida y la cuenta", async () => {
  const ana = await player("AuditAna");
  const bru = await player("AuditBru");
  const gameId = await bankGame(ana, bru);
  const before = await api("state", { gameId }, ana.token);
  await dropFlag(gameId, before.turn);

  // Quien consulta es el rival: el de la bolsa vacía ya no pide nada.
  const watcher = before.turn === 1 ? bru : ana;
  const view = await api("state", { gameId }, watcher.token);
  assert.equal(view.status, "finished", "la partida sigue abierta con la bandera caída");
  assert.equal(view.finishReason, "timeout");
  assert.equal(view.winner, watcher.username, "gana quien no agotó su bolsa");

  assert.ok(await receiptFor(gameId), "la partida terminó sin recibo en `game_scores`");
  const scores = await db.prepare("SELECT username,points,played FROM player_scores WHERE season='all'").all();
  assert.equal(scores.results.length, 2, "una partida terminada reparte dos filas de puntos");
  const chat = await db
    .prepare("SELECT COUNT(*) n FROM chat_messages WHERE game_id=? AND body LIKE 'finished%'")
    .bind(gameId).first();
  assert.equal(Number(chat.n), 1, "el chat de la partida no recibió el aviso de final");
});

test("la bandera que descubre quien intenta jugar también cuenta la partida", async () => {
  const ana = await player("AuditCar");
  const bru = await player("AuditDan");
  const gameId = await bankGame(ana, bru);
  const before = await api("state", { gameId }, ana.token);
  await dropFlag(gameId, before.turn);

  const mover = before.turn === 1 ? ana : bru;
  const out = await api("guess", { gameId, guess: "8901" }, mover.token);
  assert.equal(out.ok, false, "se puede jugar con la bolsa a cero");
  assert.equal(out.state.status, "finished");
  assert.ok(await receiptFor(gameId), "la partida terminó sin recibo en `game_scores`");
});

test("cambiar de nombre no se puede con una arena abierta, y la arena terminada sigue al nombre", async () => {
  const host = await player("AuditHost");
  const one = await player("AuditUno");
  const two = await player("AuditDos");
  const created = await api("arenaCreate", { digits: 3, maxAttempts: 6, country: "es" }, host.token);
  assert.equal(created.ok, true, created.error);
  for (const person of [one, two]) {
    const joined = await api("arenaJoin", { arenaId: created.arenaId, country: "fr" }, person.token);
    assert.equal(joined.ok, true, joined.error);
  }
  await api("arenaStart", { arenaId: created.arenaId }, host.token);
  await api("arenaGuess", { arenaId: created.arenaId, guess: "012" }, one.token);

  // Con la arena en juego, renombrarse dejaría sus filas con la clave vieja:
  // ni podría jugar ni la arena podría terminar de esperarle.
  const refused = await api("changeUsername", { newUsername: "AuditNuevo", pin: "2468" }, one.token);
  assert.equal(refused.ok, false, "el cambio de nombre pasa por encima de una arena en juego");
  const stillPlaying = await api("arenaState", { arenaId: created.arenaId }, one.token);
  assert.equal(stillPlaying.youArePlaying, true);

  // Terminada la arena, el nombre sí viaja: la clasificación es de la persona.
  await db.prepare("UPDATE arenas SET status='finished',finish_reason='complete' WHERE arena_id=?")
    .bind(created.arenaId).run();
  const renamed = await api("changeUsername", { newUsername: "AuditNuevo", pin: "2468" }, one.token);
  assert.equal(renamed.ok, true, renamed.error);
  const row = await db.prepare("SELECT username,username_key FROM arena_players WHERE arena_id=? AND username_key='auditnuevo'")
    .bind(created.arenaId).first();
  assert.ok(row, "la arena se quedó con la clave anterior");
  assert.equal(row.username, "AuditNuevo");
  const guessed = await db.prepare("SELECT COUNT(*) n FROM arena_guesses WHERE username_key='auditnuevo'").first();
  assert.equal(Number(guessed.n), 1, "los intentos de la arena no siguieron al nombre");
});

test("borrar una cuenta se lleva también sus filas de la arena", async () => {
  const admin = await player("AuditJefa");
  await db.prepare("UPDATE users SET role='admin' WHERE username_key=?").bind(admin.key).run();
  const logged = await api("loginUser", { identifier: admin.username, pin: "2468" });
  const victim = await player("AuditVict");
  const mate = await player("AuditMate");
  const created = await api("arenaCreate", { digits: 3, maxAttempts: 6 }, victim.token);
  assert.equal(created.ok, true, created.error);
  await api("arenaJoin", { arenaId: created.arenaId }, mate.token);
  await api("arenaJoin", { arenaId: created.arenaId }, admin.token);
  await api("arenaStart", { arenaId: created.arenaId }, victim.token);
  await api("arenaGuess", { arenaId: created.arenaId, guess: "012" }, victim.token);

  const deleted = await api("adminDeleteUser", { target: victim.username }, logged.sessionToken);
  assert.equal(deleted.ok, true, deleted.error);
  for (const table of ["arena_players", "arena_guesses"]) {
    const left = await db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE username_key=?`).bind(victim.key).first();
    assert.equal(Number(left.n), 0, `quedan filas en ${table} después de borrar la cuenta`);
  }
  const arena = await db.prepare("SELECT arena_id FROM arenas WHERE host_key=?").bind(victim.key).first();
  assert.equal(arena, null, "la arena que abrió sobrevive a su cuenta");
});

test("ningún cuerpo de petición puede hacer que el servidor responda 500", async () => {
  const ana = await player("AuditFuzz");
  const bru = await player("AuditRival");
  await db.prepare("UPDATE games SET created_at='2026-01-01T00:00:00.000Z'").run();
  const created = await api("createGame", { secret: "0123", digits: 4, country: "es" }, ana.token);
  await api("joinGame", { gameId: created.gameId, secret: "4567", country: "fr" }, bru.token);

  // Un cuerpo que no es un objeto no es una petición.
  for (const body of ["null", "[]", '"texto"', "123", "", "no es json", '{"action":']) {
    const response = await raw(body, ana.token);
    assert.ok(response.status < 500, `el cuerpo ${JSON.stringify(body)} devolvió ${response.status}`);
  }

  // Un campo que no es un valor simple tampoco: `String({toString:1})` lanza.
  for (const action of ["guess", "dailyGuess", "arenaGuess"]) {
    const response = await raw({ action, gameId: created.gameId, arenaId: "AAAA", guess: { toString: 1 } }, ana.token);
    assert.equal(response.status, 200, `${action} se rompe con un objeto en \`guess\``);
    const parsed = await response.json();
    assert.equal(parsed.ok, false);
  }

  // Y un cuerpo demasiado grande es culpa de quien lo manda: 413, no 500.
  const huge = await raw({ action: "chatSend", body: "x".repeat(40 * 1024) }, ana.token);
  assert.equal(huge.status, 413, "un cuerpo enorme debe responder 413");
  const payload = await huge.json();
  assert.equal(payload.ok, false);
  assert.ok(payload.error, "el 413 debe llevar su mensaje");
});

/* El NUL que convirtió `src/security.js` en un binario para Git. Durante
   meses, cada cambio del módulo de sesiones y contraseñas salió en el diff
   como «Binary files differ»: ni revisión, ni historial legible, ni búsqueda.
   Escribir `\x00` en vez del byte crudo dice exactamente lo mismo y deja el
   archivo en texto. */
test("ningún fuente lleva bytes de control crudos: Git los leería como binarios", async () => {
  const folders = ["src", "public", "test", "tools", "migrations"];
  const offenders = [];
  for (const folder of folders) {
    const url = new URL(`../${folder}/`, import.meta.url);
    for (const name of await readdir(url)) {
      if (!/\.(js|mjs|html|json|sql|py|css)$/.test(name)) continue;
      const bytes = await readFile(new URL(name, url));
      for (let index = 0; index < bytes.length; index++) {
        const byte = bytes[index];
        if (byte < 9 || (byte > 13 && byte < 32) || byte === 127) {
          offenders.push(`${folder}/${name}:${index} (0x${byte.toString(16)})`);
          break;
        }
      }
    }
  }
  assert.deepEqual(offenders, [], "bytes de control crudos en el fuente");
});
