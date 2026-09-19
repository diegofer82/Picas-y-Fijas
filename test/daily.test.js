import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { seedAccount } from "./accounts.js";
import { DAILY_RULES, dailySecret, dayKey, dayNumber } from "../src/daily.js";

/* El código del día tiene dos promesas que no se pueden comprobar mirando la
   pantalla: que el secreto no sale de una jugada abierta y que nadie entrega
   dos veces el mismo día. Y una tercera, la de E3-T2: que la rejilla que se
   comparte no lleva el código dentro. */

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const DAILY_SECRET = "prueba-del-dia";

let mf;
let db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: "src/index.js",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
    compatibilityDate: "2026-08-02",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "00000000-0000-0000-0000-000000000013" },
    bindings: { SESSION_TTL_HOURS: "168", ADMIN_PATH: "/admin", DEBUG_ERRORS: "1", DAILY_SECRET },
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
  assert.equal(response.status, 200, `${action} devolvió HTTP ${response.status}`);
  return response.json();
}

async function player(username) {
  await seedAccount(db, username);
  const logged = await api("loginUser", { identifier: username, pin: "2468" });
  assert.equal(logged.ok, true, logged.error);
  return { username: logged.username, token: logged.sessionToken };
}

const secretOfToday = () => dailySecret({ DAILY_SECRET }, dayKey());
// Un intento que no acierta nada, sea cual sea el código del día.
const missFor = (secret) => [..."0123456789"].filter((digit) => !secret.includes(digit)).slice(0, DAILY_RULES.digits).join("");

test("el código del día sale del día y del secreto del Worker, nunca del azar", async () => {
  const today = await dailySecret({ DAILY_SECRET }, "2026-03-04");
  assert.equal(today, await dailySecret({ DAILY_SECRET }, "2026-03-04"), "el mismo día da el mismo código");
  assert.equal(today.length, DAILY_RULES.digits);
  assert.match(today, /^[0-9]+$/);
  assert.equal(new Set(today).size, today.length, "el código del día no repite símbolos");
  assert.notEqual(today, await dailySecret({ DAILY_SECRET }, "2026-03-05"), "otro día, otro código");
  assert.notEqual(today, await dailySecret({ DAILY_SECRET: "otro" }, "2026-03-04"), "otro secreto, otro código");
});

test("el número del día avanza de uno en uno", () => {
  assert.equal(dayNumber("2026-01-01"), 1);
  assert.equal(dayNumber("2026-01-31"), 31);
});

test("mientras se juega, el servidor no suelta el código", async () => {
  const wendy = await player("DiaWendy");
  const secret = await secretOfToday();
  const opened = await api("dailyState", {}, wendy.token);
  assert.equal(opened.ok, true);
  assert.equal(opened.secret, "", "una jugada abierta no revela nada");
  assert.equal(opened.attempts, 0);
  assert.equal(opened.rules.digits, DAILY_RULES.digits);

  const missed = await api("dailyGuess", { guess: missFor(secret) }, wendy.token);
  assert.equal(missed.ok, true, missed.error);
  assert.equal(missed.attempts, 1);
  assert.equal(missed.secret, "", "sigue sin revelar el código después de fallar");
  assert.ok(!JSON.stringify(missed).includes(secret), "el código no viaja escondido en ningún campo");

  const solved = await api("dailyGuess", { guess: secret }, wendy.token);
  assert.equal(solved.solved, true);
  assert.equal(solved.finished, true);
  assert.equal(solved.secret, secret, "una vez cerrada la jugada, el código se enseña");
  assert.equal(solved.attempts, 2);
  assert.equal(solved.yourRank, 1);
});

test("nadie entrega dos veces el mismo día", async () => {
  const luis = await player("DiaLuis");
  const secret = await secretOfToday();
  await api("dailyGuess", { guess: secret }, luis.token);
  const again = await api("dailyGuess", { guess: secret }, luis.token);
  assert.equal(again.ok, false);
  assert.equal(again.code, "daily_done");
  assert.equal(again.attempts, 1, "el intento de más no se apunta");
  const rows = await db.prepare("SELECT COUNT(*) AS n FROM daily_results WHERE username_key='dialuis'").first();
  assert.equal(Number(rows.n), 1, "una fila por persona y día");
});

test("un envío repetido no gasta dos intentos", async () => {
  const ana = await player("DiaAna");
  const secret = await secretOfToday();
  const miss = missFor(secret);
  const first = await api("dailyGuess", { guess: miss, requestId: "recibo-1" }, ana.token);
  const retry = await api("dailyGuess", { guess: miss, requestId: "recibo-1" }, ana.token);
  assert.equal(first.attempts, 1);
  assert.equal(retry.attempts, 1, "el mismo recibo devuelve lo que ya estaba escrito");
  assert.equal(retry.attemptsLeft, DAILY_RULES.maxAttempts - 1);
});

test("se acaban los intentos y la jugada se cierra sin acertar", async () => {
  const beto = await player("DiaBeto");
  const secret = await secretOfToday();
  const miss = missFor(secret);
  let state;
  for (let round = 0; round < DAILY_RULES.maxAttempts; round++)
    state = await api("dailyGuess", { guess: miss }, beto.token);
  assert.equal(state.finished, true);
  assert.equal(state.solved, false);
  assert.equal(state.attemptsLeft, 0);
  assert.equal(state.secret, secret, "al cerrarse la jugada se revela el código, como en una partida terminada");
});

test("la clasificación del día ordena por intentos y, a igualdad, por tiempo", async () => {
  const day = dayKey();
  await db.prepare(
    `INSERT INTO daily_results(day,username_key,username,country,guesses_json,attempts,solved,finished,duration_ms,started_at,updated_at,finished_at)
     VALUES(?,?,?,?,'[]',?,1,1,?,?,?,?)`,
  ).bind(day, "rapida", "Rapida", "fr", 3, 40000, new Date().toISOString(), new Date().toISOString(), new Date().toISOString()).run();
  await db.prepare(
    `INSERT INTO daily_results(day,username_key,username,country,guesses_json,attempts,solved,finished,duration_ms,started_at,updated_at,finished_at)
     VALUES(?,?,?,?,'[]',?,1,1,?,?,?,?)`,
  ).bind(day, "lenta", "Lenta", "es", 3, 90000, new Date().toISOString(), new Date().toISOString(), new Date().toISOString()).run();
  const mirona = await player("DiaMirona");
  const board = (await api("dailyState", {}, mirona.token)).board;
  const positions = board.map((entry) => entry.username);
  assert.ok(positions.indexOf("Rapida") < positions.indexOf("Lenta"), "a igualdad de intentos manda el tiempo");
  assert.ok(board.every((entry) => entry.attempts > 0), "la tabla solo lista a quien resolvió");
});

test("borrar una cuenta se lleva también lo que jugó al código del día", async () => {
  const admin = await player("DiaAdmin");
  await db.prepare("UPDATE users SET role='admin' WHERE username_key='diaadmin'").run();
  const victima = await player("DiaVictima");
  await api("dailyGuess", { guess: await secretOfToday() }, victima.token);
  const before = await db.prepare("SELECT COUNT(*) AS n FROM daily_results WHERE username_key='diavictima'").first();
  assert.equal(Number(before.n), 1);
  const deleted = await api("adminDeleteUser", { target: "DiaVictima", confirm: 1 }, admin.token);
  assert.equal(deleted.ok, true, deleted.error);
  const after = await db.prepare("SELECT COUNT(*) AS n FROM daily_results WHERE username_key='diavictima'").first();
  assert.equal(Number(after.n), 0, "la purga no deja resultados del día detrás");
});

/* -------------------- E3-T2: la rejilla que se comparte -------------------- */

function gridFunction() {
  const marks = html.match(/const DAILY_FIJA='[^']+', DAILY_PICA='[^']+', DAILY_NADA='[^']+';/);
  const generic = html.match(/function shareGridRows\(guesses,digits\)\{[\s\S]*?\n\}/);
  const source = html.match(/function dailyGridRows\(state\)\{[\s\S]*?\n\}/);
  assert.ok(marks && generic && source, "la rejilla se dibuja en public/index.html");
  return new Function(`${marks[0]}\n${generic[0]}\n${source[0]}\nreturn dailyGridRows;`)();
}

test("la rejilla cuenta fijas y picas y no lleva el código dentro", () => {
  const dailyGridRows = gridFunction();
  const rows = dailyGridRows({
    rules: { digits: 4 },
    guesses: [
      { guess: "0123", fijas: 0, picas: 1 },
      { guess: "4567", fijas: 2, picas: 1 },
      { guess: "4568", fijas: 4, picas: 0 },
    ],
  });
  assert.equal(rows.length, 3);
  for (const row of rows) assert.equal([...row].length, 4, "una marca por posición");
  assert.ok(!rows.join("").match(/[0-9]/), "ninguna cifra del intento aparece en la rejilla");
  const marksOf = (row) => [...row];
  assert.equal(new Set(marksOf(rows[2])).size, 1, "cuatro fijas son cuatro marcas iguales");
  assert.notEqual(marksOf(rows[0])[0], marksOf(rows[1])[0], "una fija y una pica no se dibujan igual");
});

test("la rejilla y el texto que se comparte son los mismos en los tres idiomas", () => {
  // La rejilla no pasa por `t()`: las marcas son constantes y el texto de
  // alrededor solo traduce el título.
  const source = html.match(/function shareGridRows\(guesses,digits\)\{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(source, /\bt\(/, "la rejilla no depende del idioma");
  const share = html.match(/function dailyShareText\(state\)\{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(share, /state\.secret/, "lo que se comparte no incluye el código del día");
  assert.match(share, /dailyGridRows\(state\)/);
  for (const key of ["daily_title", "daily_share", "daily_board_title", "daily_solved_detail"])
    assert.equal((html.match(new RegExp(key + ":", "g")) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
});

test("el código del día exige sesión, como todo lo que escribe en D1", async () => {
  const anonymous = await mf.dispatchFetch("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "dailyState" }),
  });
  assert.equal(anonymous.status, 401, "sin sesión no hay código del día");
});
