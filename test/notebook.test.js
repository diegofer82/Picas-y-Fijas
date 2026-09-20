import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import { Miniflare } from "miniflare";
import { seedAccount } from "./accounts.js";

/* El cuaderno y el aviso de contradicción (E4-T3).

   La tentación era guardar la opción en el navegador: es una ayuda personal y
   nadie la ve. Pero entonces uno jugaría con cuadrícula y aviso y el otro sin
   ellos, sin saberlo, en la misma partida. Por eso viaja en `games`, se elige
   al crearla, el servidor la valida y la revancha la hereda. Eso es lo que
   comprueban estas pruebas; lo demás —las marcas de quien juega— nunca sale
   del navegador, y también se vigila aquí. */

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../public/deduce.js", import.meta.url), "utf8");
const context = vm.createContext({ Math });
vm.runInContext(engineSource, context);
const Deduce = context.Deduce;

let mf;
let db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: "src/index.js",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
    compatibilityDate: "2026-08-02",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "00000000-0000-0000-0000-000000000014" },
    bindings: { SESSION_TTL_HOURS: "168", ADMIN_PATH: "/admin", DEBUG_ERRORS: "1" },
  });
  db = await mf.getD1Database("DB");
  const files = (await readdir(new URL("../migrations/", import.meta.url))).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const migration = await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8");
    for (const statement of migration.split(";").map((sql) => sql.trim()).filter(Boolean))
      await db.prepare(statement).run();
  }
});

after(async () => mf?.dispose());

async function api(action, payload = {}, token = "") {
  const response = await mf.dispatchFetch("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...payload }),
  });
  return response.json();
}

async function player(username) {
  await seedAccount(db, username);
  const logged = await api("loginUser", { identifier: username, pin: "2468" });
  assert.equal(logged.ok, true, logged.error);
  return { username: logged.username, token: logged.sessionToken };
}

async function game(prefix, notebook) {
  const a = await player(`${prefix}-A`);
  const b = await player(`${prefix}-B`);
  const created = await api("createGame", {
    digits: 3, mode: "numbers", numColors: 10, allowRepeats: false,
    isPublic: false, maxAttempts: 0, turnSeconds: 0, secret: "012", notebook,
  }, a.token);
  assert.equal(created.ok, true, created.error);
  const joined = await api("joinGame", { gameId: created.gameId, secret: "345" }, b.token);
  assert.equal(joined.ok, true, joined.error);
  return { a, b, gameId: created.gameId };
}

test("la opción viaja en la partida y los dos jugadores la ven igual", async () => {
  const on = await game("nb-on", true);
  for (const who of [on.a, on.b]) {
    const state = await api("state", { gameId: on.gameId }, who.token);
    assert.equal(state.notebook, true, "los dos juegan con las mismas reglas");
  }
  const off = await game("nb-off", false);
  const state = await api("state", { gameId: off.gameId }, off.a.token);
  assert.equal(state.notebook, false, "sin elegirla, la partida es la de siempre");
});

test("el servidor la valida y no acepta cualquier cosa en la columna", async () => {
  const who = await player("nb-bad");
  const refused = await api("createGame", {
    digits: 3, mode: "numbers", numColors: 10, allowRepeats: false,
    isPublic: false, maxAttempts: 0, turnSeconds: 0, secret: "012", notebook: "quizás",
  }, who.token);
  // `truthy` no deja pasar una cadena cualquiera como sí, así que la partida se
  // crea con el cuaderno apagado en vez de con un valor inventado.
  assert.equal(refused.ok, true, refused.error);
  const state = await api("state", { gameId: refused.gameId }, who.token);
  assert.equal(state.notebook, false);
  const row = await db.prepare("SELECT notebook FROM games WHERE game_id=?").bind(refused.gameId).first();
  assert.equal(row.notebook, 0, "en la base solo hay 0 o 1");
});

test("la revancha hereda el cuaderno, como hereda el resto de las reglas", async () => {
  const match = await game("nb-rematch", true);
  await api("closeGame", { gameId: match.gameId, intent: "abandon" }, match.b.token);
  const rematch = await api("rematch", { gameId: match.gameId, secret: "678" }, match.a.token);
  assert.equal(rematch.ok, true, rematch.error);
  const row = await db.prepare("SELECT notebook FROM games WHERE game_id=?").bind(rematch.gameId).first();
  assert.equal(row.notebook, 1);
});

test("un intento que contradice las pistas propias se reconoce sin enumerar nada", () => {
  const secret = "5042";
  const rules = { mode: "colors", numColors: 6, digits: 4, allowRepeats: true };
  const clues = ["0123", "4501"].map((guess) => ({ guess, ...Deduce.evaluate(secret, guess) }));
  assert.equal(Deduce.contradicts(secret, clues), false, "el código de verdad nunca contradice sus propias pistas");
  const ruled = Deduce.enumerate(rules).find((code) => Deduce.contradicts(code, clues));
  assert.ok(ruled, "con dos pistas ya hay códigos descartados");
  assert.equal(Deduce.contradicts("", clues), false, "un intento a medias no avisa de nada");
  assert.equal(Deduce.contradicts(secret, [{ missed: true, reason: "timeout" }, ...clues]), false,
    "un turno perdido al tiempo no dice nada y no cuenta");
});

test("la pantalla enciende el cuaderno porque lo dice el servidor, no el navegador", () => {
  assert.match(html, /function syncNotebook\(st\)\{[\s\S]*?st\.notebook/, "la cuadrícula sale del estado de la partida");
  assert.match(html, /const armed=!!\(gState&&gState\.notebook\)/, "el aviso también");
  // Las marcas son notas de quien juega, no una jugada: ni se envían ni se
  // piden, y por eso no cuestan una sola lectura en D1.
  const block = html.match(/const NOTEBOOK_STATES[\s\S]*?function renderContradiction\(value\)\{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(block, /\bapi\(/, "el cuaderno no habla con el servidor");
  assert.doesNotMatch(block, /yourSecret|opponentSecret|\.secret\b/, "el cuaderno no toca ningún secreto");
  assert.match(block, /localStorage\.setItem\(notebookKey\(\)/, "las marcas viven en este aparato");
  assert.match(html, /<div class="seg" id="seg-notebook">/, "la opción se elige al crear la partida");
  assert.match(html, /notebook:cfg\.notebook/, "y viaja con la creación");
});

test("la opción y el aviso están en los tres idiomas", () => {
  for (const key of ["lbl_notebook", "nb_on", "nb_off", "nb_title", "nb_clear", "nb_hint", "nb_contradiction", "rl_notebook"])
    assert.equal((html.match(new RegExp(key + ":", "g")) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
});
