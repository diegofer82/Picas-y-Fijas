import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { seedAccount } from "./accounts.js";
import { ARENA, rankPlayers, randomSecret, validateArenaOptions } from "../src/arena.js";

/* E6-T3, la arena.

   De 3 a 8 jugadores contra el mismo código. Lo que estas pruebas vigilan es
   lo que la hace justa y lo que la hace terminable: el código lo sortea el
   servidor y no sale de ahí hasta el final, nadie ve los intentos de nadie, el
   mismo intento reenviado no gasta dos, y una arena se cierra sola cuando ya
   no queda nadie jugando. */

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const migrationsDir = new URL("../migrations/", import.meta.url);

let mf;
let db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: "src/index.js",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
    compatibilityDate: "2026-08-02",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "00000000-0000-0000-0000-000000000019" },
    bindings: { SESSION_TTL_HOURS: "168", ADMIN_PATH: "/admin", DEBUG_ERRORS: "1" },
  });
  db = await mf.getD1Database("DB");
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const migration = await readFile(new URL(file, migrationsDir), "utf8");
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

async function player(username) {
  await seedAccount(db, username);
  const logged = await api("loginUser", { identifier: username, pin: "2468", country: "es" });
  assert.equal(logged.ok, true, logged.error);
  return { username: logged.username, token: logged.sessionToken };
}

async function openArena(prefix, { players = 3, digits = 3, maxAttempts = 10 } = {}) {
  const people = [];
  for (let index = 0; index < players; index++) people.push(await player(`${prefix}-${index}`));
  const created = await api("arenaCreate", {
    digits, mode: "numbers", allowRepeats: false, maxAttempts, country: "es",
  }, people[0].token);
  assert.equal(created.ok, true, created.error);
  for (const person of people.slice(1)) {
    const joined = await api("arenaJoin", { arenaId: created.arenaId, country: "fr" }, person.token);
    assert.equal(joined.ok, true, joined.error);
  }
  return { arenaId: created.arenaId, people, host: people[0] };
}

const secretOf = async (arenaId) =>
  (await db.prepare("SELECT secret FROM arenas WHERE arena_id=?").bind(arenaId).first()).secret;

test("el código lo sortea el servidor y no sale de la arena hasta el final", async () => {
  const { arenaId, people, host } = await openArena("secret");
  const secret = await secretOf(arenaId);
  assert.match(secret, /^[0-9]{3}$/);
  assert.equal(new Set(secret).size, 3, "sin repetidos, porque así se abrió");
  const waiting = await api("arenaState", { arenaId }, people[1].token);
  assert.equal(waiting.ok, true, waiting.error);
  assert.equal(waiting.secret, "", "antes de empezar no hay nada que enseñar");
  await api("arenaStart", { arenaId }, host.token);
  const playing = await api("arenaState", { arenaId }, people[1].token);
  assert.equal(playing.status, "active");
  assert.equal(playing.secret, "");
  assert.equal(JSON.stringify(playing).includes('"' + secret + '"'), false, "el código no viaja mientras se juega");
});

test("nadie ve los intentos de nadie: de los demás solo se sabe cuánto han gastado", async () => {
  const { arenaId, people, host } = await openArena("board");
  await api("arenaStart", { arenaId }, host.token);
  const mine = await api("arenaGuess", { arenaId, guess: "012" }, people[1].token);
  assert.equal(mine.ok, true, mine.error);
  const seen = await api("arenaState", { arenaId }, people[2].token);
  assert.deepEqual(seen.guesses, [], "el registro que viaja es el propio, y el suyo está vacío");
  const row = seen.board.find((p) => p.username === people[1].username);
  assert.equal(row.attempts, 1);
  assert.equal(typeof row.bestFijas, "number");
  assert.equal(JSON.stringify(seen.board).includes("012"), false, "el intento de otro no se enseña");
  const own = await api("arenaState", { arenaId }, people[1].token);
  assert.equal(own.guesses.length, 1);
  assert.equal(own.guesses[0].guess, "012");
});

test("el mismo intento reenviado no gasta dos, y acertar cierra tu parte", async () => {
  const { arenaId, people, host } = await openArena("guess");
  await api("arenaStart", { arenaId }, host.token);
  const secret = await secretOf(arenaId);
  const first = await api("arenaGuess", { arenaId, guess: "012", requestId: "repetido-1" }, people[1].token);
  const again = await api("arenaGuess", { arenaId, guess: "012", requestId: "repetido-1" }, people[1].token);
  assert.equal(again.ok, true, again.error);
  assert.equal(again.repeated, true);
  const state = await api("arenaState", { arenaId }, people[1].token);
  assert.equal(state.attempts, 1, "el reenvío no gastó un segundo intento");
  assert.equal(state.guesses.length, 1);
  assert.equal(first.fijas + first.picas >= 0, true);

  const won = await api("arenaGuess", { arenaId, guess: secret }, people[1].token);
  assert.equal(won.solved, true);
  assert.equal(won.secret, secret, "a quien acierta sí se le confirma el código");
  const blocked = await api("arenaGuess", { arenaId, guess: "012" }, people[1].token);
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Ya has descifrado/);
});

test("una arena termina sola cuando ya no queda nadie jugando", async () => {
  const { arenaId, people, host } = await openArena("finish", { maxAttempts: 6 });
  await api("arenaStart", { arenaId }, host.token);
  const secret = await secretOf(arenaId);
  await api("arenaGuess", { arenaId, guess: secret }, people[0].token);
  await api("arenaLeave", { arenaId }, people[1].token);
  let state = await api("arenaState", { arenaId }, people[0].token);
  assert.equal(state.status, "active", "todavía queda alguien intentándolo");
  // El tercero agota sus seis intentos: ya no queda nadie jugando.
  for (let attempt = 0; attempt < 6; attempt++)
    await api("arenaGuess", { arenaId, guess: secret === "012" ? "345" : "012" }, people[2].token);
  state = await api("arenaState", { arenaId }, people[2].token);
  assert.equal(state.status, "finished");
  assert.equal(state.finishReason, "complete");
  assert.equal(state.secret, secret, "terminada, el código se enseña a todos");
  const board = state.board;
  assert.equal(board[0].username, people[0].username, "quien lo descifró va primero");
  assert.equal(board[board.length - 1].username, people[1].username, "quien se marchó cierra la lista");
  const late = await api("arenaGuess", { arenaId, guess: "012" }, people[2].token);
  assert.equal(late.ok, false);
});

test("hacen falta tres para empezar, caben ocho y solo empieza quien la abrió", async () => {
  const { arenaId, people, host } = await openArena("rules", { players: 2 });
  const early = await api("arenaStart", { arenaId }, host.token);
  assert.equal(early.ok, false);
  assert.match(early.error, /al menos 3/);
  const stranger = await player("rules-stranger");
  const joined = await api("arenaJoin", { arenaId, country: "es" }, stranger.token);
  assert.equal(joined.ok, true, joined.error);
  const notHost = await api("arenaStart", { arenaId }, people[1].token);
  assert.equal(notHost.ok, false);
  assert.match(notHost.error, /abrió la arena/);
  const started = await api("arenaStart", { arenaId }, host.token);
  assert.equal(started.ok, true, started.error);

  const full = await openArena("full", { players: 8 });
  const ninth = await player("full-ninth");
  const refused = await api("arenaJoin", { arenaId: full.arenaId, country: "es" }, ninth.token);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /llena/);
  assert.deepEqual([ARENA.minPlayers, ARENA.maxPlayers], [3, 8]);
});

test("no se juegan dos arenas a la vez, y el vestíbulo enseña las abiertas", async () => {
  const { arenaId, host } = await openArena("one");
  const second = await api("arenaCreate", { digits: 3, mode: "numbers", allowRepeats: false, maxAttempts: 10 }, host.token);
  assert.equal(second.ok, false);
  assert.match(second.error, /Ya estás en una arena/);
  const lobby = await api("lobbyState", {}, host.token);
  assert.equal(lobby.ok, true, lobby.error);
  const listed = (lobby.arenas || []).find((a) => a.arenaId === arenaId);
  assert.ok(listed, "la arena abierta se ve desde el vestíbulo");
  assert.equal(listed.players, 3);
  assert.equal(listed.secret, undefined, "la lista no lleva el código ni de lejos");
  assert.equal(JSON.stringify(lobby.arenas).includes(await secretOf(arenaId)), false);
});

test("las reglas de la arena se validan, y el sorteo respeta los repetidos", () => {
  assert.equal(validateArenaOptions({ digits: 7, mode: "numbers", numColors: 10, allowRepeats: false, maxAttempts: 10 }), "Longitud debe ser 3, 4, 5 o 6.");
  assert.match(validateArenaOptions({ digits: 3, mode: "numbers", numColors: 10, allowRepeats: false, maxAttempts: 0 }), /6 o a 10/);
  assert.equal(validateArenaOptions({ digits: 4, mode: "colors", numColors: 4, allowRepeats: false, maxAttempts: 10 }), null);
  assert.match(validateArenaOptions({ digits: 5, mode: "colors", numColors: 4, allowRepeats: false, maxAttempts: 10 }), /colores distintos/);
  for (let round = 0; round < 40; round++) {
    const secret = randomSecret(4, false, 6);
    assert.equal(secret.length, 4);
    assert.equal(new Set(secret).size, 4);
    assert.equal([...secret].every((symbol) => Number(symbol) < 6), true);
  }
});

test("la clasificación en directo es pura y ordena por quién va mejor", () => {
  const board = rankPlayers([
    { username: "Lenta", attempts: 5, bestFijas: 1, solvedAt: "", gaveUp: false, joinedAt: "1" },
    { username: "Rápida", attempts: 2, bestFijas: 3, solvedAt: "2026-09-20T10:00:00.000Z", gaveUp: false, joinedAt: "2" },
    { username: "Fugada", attempts: 1, bestFijas: 2, solvedAt: "", gaveUp: true, joinedAt: "3" },
    { username: "Cerca", attempts: 5, bestFijas: 2, solvedAt: "", gaveUp: false, joinedAt: "4" },
    { username: "Justa", attempts: 4, bestFijas: 3, solvedAt: "2026-09-20T10:05:00.000Z", gaveUp: false, joinedAt: "5" },
  ]);
  assert.deepEqual(board.map((p) => p.username), ["Rápida", "Justa", "Cerca", "Lenta", "Fugada"]);
  assert.deepEqual(board.map((p) => p.position), [1, 2, 3, 4, 5]);
});

test("la pantalla tiene su arena, con textos en los tres idiomas", () => {
  assert.match(html, /id="s-arena"/);
  assert.match(html, /id="s-arena-new"/);
  assert.match(html, /renderArenaList\(snapshot\.arenas\|\|\[\]\)/);
  assert.match(html, /'arena-new','arena','game'\]/);
  for (const key of ["arena_title", "mode_arena_hint", "arena_start", "arena_players", "arena_secret", "arena_you_solved"])
    assert.equal((html.match(new RegExp(key + ":", "g")) || []).length, 3, key + " debe existir en los tres idiomas");
});
