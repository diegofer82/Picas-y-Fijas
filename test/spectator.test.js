import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { seedAccount } from "./accounts.js";
import { sanitizeGame, secretsFor } from "../src/game.js";

/* E6-T1, el espectador de verdad.

   Es la tarea delicada del plan: la única capaz de romper la regla de que los
   secretos no salen de una partida activa. Por eso esta prueba no mira «que la
   pantalla enseñe algo», sino lo contrario: recorre entera la respuesta que
   recibe quien mira y comprueba que ninguno de los dos códigos aparece en
   ninguna parte, ni siquiera dentro de una lista de intentos. */

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

let mf;
let db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: "src/index.js",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
    compatibilityDate: "2026-08-02",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "00000000-0000-0000-0000-000000000017" },
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

async function api(action, payload = {}, token = "") {
  const response = await mf.dispatchFetch("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: JSON.stringify({ action, ...payload }),
  });
  assert.equal(response.status, 200, action + " devolvió HTTP " + response.status);
  return response.json();
}

async function player(username, country = "es") {
  await seedAccount(db, username, { country });
  const logged = await api("loginUser", { identifier: username, pin: "2468", country });
  assert.equal(logged.ok, true, logged.error);
  return { username: logged.username, token: logged.sessionToken };
}

/* Una partida pública viva: dos jugadores dentro, un intento fallado por cada
   uno para que haya algo que mirar y una línea de chat de cada. */
async function liveGame(prefix, { isPublic = true } = {}) {
  const a = await player(prefix + "-A");
  const b = await player(prefix + "-B", "fr");
  const watcher = await player(prefix + "-W");
  const created = await api("createGame", {
    digits: 3, mode: "numbers", numColors: 10, allowRepeats: false,
    isPublic, maxAttempts: 0, turnSeconds: 0, secret: "012", country: "es",
  }, a.token);
  assert.equal(created.ok, true, created.error);
  const joined = await api("joinGame", { gameId: created.gameId, secret: "345", country: "fr" }, b.token);
  assert.equal(joined.ok, true, joined.error);
  const state = await api("state", { gameId: created.gameId }, a.token);
  const first = state.turn === 1 ? a : b;
  const second = first === a ? b : a;
  await api("guess", { gameId: created.gameId, guess: "678" }, first.token);
  await api("guess", { gameId: created.gameId, guess: "679" }, second.token);
  await api("chatSend", { roomType: "game", gameId: created.gameId, body: "Suerte con ese código." }, a.token);
  await api("chatSend", { roomType: "game", gameId: created.gameId, body: "La vas a necesitar tú." }, b.token);
  return { a, b, watcher, gameId: created.gameId, secrets: { [a.username]: "012", [b.username]: "345" } };
}

test("quien mira una partida activa no recibe ningún secreto, ni el de uno ni el del otro", async () => {
  const { watcher, gameId } = await liveGame("spy");
  const seen = await api("state", { gameId }, watcher.token);
  assert.equal(seen.ok, true, seen.error);
  assert.equal(seen.status, "active");
  assert.equal(seen.youAre, 0);
  assert.equal(seen.spectator, true, "el servidor dice en voz alta que quien pregunta solo mira");
  assert.equal(seen.yourSecret, "");
  assert.equal(seen.opponentSecret, "");
  // La comprobación que importa: los dos códigos, buscados en la respuesta
  // entera, incluidos los intentos y cualquier campo que se añada mañana.
  const serialized = JSON.stringify(seen);
  for (const secret of ["012", "345"])
    assert.equal(serialized.includes('"' + secret + '"'), false, "el código " + secret + " salió de una partida activa");
  // Y lo que sí puede ver: la partida, sus reglas y los intentos de los dos.
  assert.equal(seen.guesses.length, 2);
  assert.ok(seen.p1 && seen.p2);
  assert.equal(typeof seen.turnRemaining, "number");
});

test("al terminar, el espectador sabe quién ganó pero sigue sin ver los códigos revelados", async () => {
  const { a, b, watcher, gameId, secrets } = await liveGame("reveal");
  const state = await api("state", { gameId }, a.token);
  const onTurn = state.turn === 1 ? a : b;
  const target = onTurn === a ? b : a;
  const won = await api("guess", { gameId, guess: secrets[target.username] }, onTurn.token);
  assert.equal(won.ok, true, won.error);
  // Quien va por detrás conserva su turno de desempate: si lo falla, la
  // partida termina de verdad y es entonces cuando se revelan los códigos.
  if (won.pending) await api("guess", { gameId, guess: "987" }, target.token);
  const seen = await api("state", { gameId }, watcher.token);
  assert.equal(seen.status, "finished");
  assert.equal(seen.opponentSecret, "", "revelar los códigos es cosa de quienes jugaron");
  assert.equal(seen.yourSecret, "");
});

test("`secretsFor` es la regla entera, y se puede leer sin base de datos", () => {
  const finished = { status: "finished" };
  assert.deepEqual(secretsFor(finished, 0, "012", "345", true), { yourSecret: "", opponentSecret: "" });
  assert.deepEqual(secretsFor(finished, 1, "012", "345", true), { yourSecret: "012", opponentSecret: "345" });
  assert.deepEqual(secretsFor({ status: "active" }, 2, "012", "345", true), { yourSecret: "345", opponentSecret: "" });
  const active = {
    game_id: "SPEC1", status: "active", digits: 3, p1: "Ana", p2: "Bru", secret1: "012", secret2: "345",
    turn: 1, guesses: JSON.stringify([{ by: "Ana", guess: "678" }]), created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), version: 1, reveal_secrets: 1,
  };
  assert.equal(JSON.stringify(sanitizeGame(active, "Curiosa")).includes("012"), false);
  assert.equal(sanitizeGame(active, "Ana").yourSecret, "012");
});

test("el vestíbulo ofrece mirar solo partidas públicas con sus dos jugadores dentro", async () => {
  const open = await liveGame("list-pub");
  const hidden = await liveGame("list-priv", { isPublic: false });
  const lobby = await api("lobbyState", {}, open.watcher.token);
  assert.equal(lobby.ok, true, lobby.error);
  const ids = (lobby.watchable || []).map((g) => g.gameId);
  assert.ok(ids.includes(open.gameId), "la partida pública en curso se puede mirar");
  assert.equal(ids.includes(hidden.gameId), false, "una partida privada no se ofrece a nadie");
  const row = lobby.watchable.find((g) => g.gameId === open.gameId);
  assert.deepEqual([row.attemptsP1, row.attemptsP2], [1, 1]);
  assert.equal(JSON.stringify(lobby.watchable).includes("012"), false, "la lista tampoco lleva códigos");
});

test("el chat del espectador es de lectura, cabe en esta partida y no deja escribir", async () => {
  const { a, watcher, gameId } = await liveGame("chat");
  const other = await liveGame("chat-other");
  const read = await api("chatList", { roomType: "game", gameId }, watcher.token);
  assert.equal(read.ok, true, read.error);
  assert.equal(read.spectator, true);
  assert.equal(read.canWrite, false);
  assert.equal(read.threadId, 0, "el hilo de la pareja no se entrega: su historia es más larga que la partida");
  assert.ok(read.messages.length >= 2);
  assert.ok(read.messages.every((m) => m.gameId === gameId), "solo lo dicho en esta partida");
  const written = await api("chatSend", { roomType: "game", gameId, body: "Prueba el 345" }, watcher.token);
  assert.equal(written.ok, false);
  assert.match(written.error, /privado/);
  const nudged = await api("chatNudge", { roomType: "game", gameId }, watcher.token);
  assert.equal(nudged.ok, false);
  const another = await api("chatList", { roomType: "game", gameId: other.gameId }, watcher.token);
  assert.equal(another.ok, true, "otra partida pública también se puede leer");
  const priv = await liveGame("chat-priv", { isPublic: false });
  const closed = await api("chatList", { roomType: "game", gameId: priv.gameId }, watcher.token);
  assert.equal(closed.ok, false);
  assert.match(closed.error, /privado/);
  // Quien juega conserva su hilo completo, con su identificador de siempre.
  const mine = await api("chatList", { roomType: "game", gameId }, a.token);
  assert.equal(mine.canWrite, true);
  assert.ok(mine.threadId > 0);
});

test("la pantalla ofrece mirar y avisa de que el chat es solo de lectura", () => {
  assert.match(html, /id="watch-list"/);
  assert.match(html, /function renderWatchable\(games\)\{/);
  assert.match(html, /renderWatchable\(snapshot\.watchable\|\|\[\]\)/);
  assert.match(html, /id="chat-readonly"/);
  for (const key of ["watch_title", "watch_empty", "watch_btn", "spectator_chat_readonly"])
    assert.equal((html.match(new RegExp(key + ":", "g")) || []).length, 3, key + " debe existir en los tres idiomas");
  // Mirar no es jugar: no se guarda como partida propia ni se suelta presencia.
  assert.match(html, /if\(!reviewingHistory&&!game\.spectator\)localStorage\.setItem\('pf_current_game'/);
});
