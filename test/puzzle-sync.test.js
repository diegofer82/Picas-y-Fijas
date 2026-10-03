import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import { Miniflare } from "miniflare";
import { seedAccount } from "./accounts.js";
import { BADGES } from "../src/season.js";
import { PUZZLE_LEVELS, PUZZLE_TOTAL, solvesPuzzle } from "../src/puzzles.js";

/* Los enigmas resueltos viajan con la cuenta (5.3.0).

   Hasta la 5.2.1 lo resuelto vivía solo en `localStorage`: cambiar de aparato
   o de navegador era empezar de cero. Lo que estas pruebas vigilan es lo que
   hace que guardarlo en la cuenta sea de fiar: el servidor comprueba la
   respuesta antes de escribir, la insignia de un nivel se gana una vez y no se
   pierde cuando dos aparatos lo terminan a la vez, las filas siguen a la
   persona cuando cambia de nombre y se van con ella cuando se borra, y un
   invitado sigue sin llamar al API. */

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const published = JSON.parse(await readFile(new URL("../public/puzzles.json", import.meta.url), "utf8"));
const engine = vm.createContext({ Math });
vm.runInContext(await readFile(new URL("../public/deduce.js", import.meta.url), "utf8"), engine);
const Deduce = engine.Deduce;

/* La respuesta de un enigma no está escrita en ningún sitio: se deduce. */
const ANSWERS = new Map();
const IDS = {};
for (const level of published.levels) {
  IDS[level.level] = level.puzzles.map((puzzle) => puzzle.id);
  for (const puzzle of level.puzzles) {
    let left = Deduce.enumerate(level.rules);
    for (const [guess, fijas, picas] of puzzle.clues) left = Deduce.filter(left, guess, { fijas, picas });
    ANSWERS.set(puzzle.id, left[0]);
  }
}
const answersFor = (ids) => ids.map((id) => `${id}:${ANSWERS.get(id)}`).join(",");

let mf;
let db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: "src/index.js",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
    compatibilityDate: "2026-08-02",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "00000000-0000-0000-0000-000000000021" },
    bindings: { SESSION_TTL_HOURS: "168", ADMIN_PATH: "/admin", DEBUG_ERRORS: "1" },
  });
  db = await mf.getD1Database("DB");
  const files = (await readdir(new URL("../migrations/", import.meta.url))).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const migration = await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8");
    for (const statement of migration.split(";").map((sql) => sql.trim()).filter(Boolean))
      await db.prepare(statement).run();
  }
});

after(async () => mf?.dispose());

async function call(action, payload = {}, token = "") {
  const response = await mf.dispatchFetch("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...payload }),
  });
  return { status: response.status, body: await response.json() };
}

async function api(action, payload = {}, token = "") {
  const { status, body } = await call(action, payload, token);
  assert.equal(status, 200, `${action} devolvió HTTP ${status}`);
  return body;
}

async function player(username, options = {}) {
  await seedAccount(db, username, options);
  const logged = await api("loginUser", { identifier: username, pin: "2468", country: "es" });
  assert.equal(logged.ok, true, logged.error);
  return { username: logged.username, token: logged.sessionToken };
}

const rowsOf = async (username) =>
  (await db.prepare("SELECT * FROM puzzle_solves WHERE username_key=? ORDER BY puzzle_id")
    .bind(username.toLowerCase()).all()).results;
const badgesOf = async (username) =>
  (await db.prepare("SELECT code FROM badges WHERE username_key=? ORDER BY code")
    .bind(username.toLowerCase()).all()).results.map((row) => row.code);

test("el Worker conoce los mismos enigmas que la pantalla", () => {
  assert.equal(PUZZLE_TOTAL, published.levels.reduce((sum, level) => sum + level.puzzles.length, 0));
  assert.deepEqual(PUZZLE_LEVELS.map((level) => [level.level, level.total, level.badge]),
    published.levels.map((level) => [level.level, level.puzzles.length, `puzzles_${level.level}`]));
  for (const [id, code] of ANSWERS) assert.equal(solvesPuzzle(id, code), true, `${id} no acepta su solución`);
  assert.equal(solvesPuzzle("easy-01", ANSWERS.get("easy-02")), false, "la respuesta de otro enigma no vale");
  assert.equal(solvesPuzzle("nadie-01", "123"), false);
});

test("los enigmas de la cuenta están detrás de la sesión y del correo", async () => {
  const anonymous = await call("puzzleSync", { answers: answersFor(["easy-01"]) });
  assert.equal(anonymous.status, 401, "sin sesión no se escribe nada");
  await seedAccount(db, "SinCorreo");
  await db.prepare("UPDATE users SET email_verified_at=NULL WHERE username_key='sincorreo'").run();
  const pending = await call("loginUser", { identifier: "SinCorreo", pin: "2468" });
  const denied = await call("puzzleSync", { answers: answersFor(["easy-01"]) }, pending.body.sessionToken);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "email_pending", "la puerta del correo vale también aquí");
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM puzzle_solves").first()).n, 0);
});

test("el servidor comprueba la respuesta antes de apuntar un enigma", async () => {
  const ana = await player("Enigma-Ana");
  const empty = await api("puzzleSync", {}, ana.token);
  assert.deepEqual(empty, { ok: true, solved: [], appVersion: empty.appVersion }, "una cuenta nueva no tiene nada");

  const wrong = [...ANSWERS.get("easy-02")].reverse().join("");
  const sent = await api("puzzleSync", {
    answers: [
      `easy-01:${ANSWERS.get("easy-01")}`,   // la buena
      `easy-02:${wrong}`,                    // un código que no encaja con las pistas
      "easy-03",                             // sin respuesta
      "easy-04:112",                         // repetidos, que el nivel prohíbe
      `nivel-99:${ANSWERS.get("easy-01")}`,  // un enigma que no existe
      `normal-01:${ANSWERS.get("easy-01")}`, // la longitud de otro nivel
      ":::,,,",
    ].join(","),
  }, ana.token);
  assert.deepEqual(sent.solved, ["easy-01"], "solo queda apuntado el que venía con su solución");
  assert.equal(sent.newBadges, undefined);

  const rows = await rowsOf(ana.username);
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["puzzle_id", "solved_at", "username_key"],
    "la tabla guarda qué enigma y cuándo: la respuesta no se escribe en ningún sitio");

  // Un cuerpo que no es texto no rompe nada: `safeParams` lo deja en blanco.
  const odd = await api("puzzleSync", { answers: { toString: 1 } }, ana.token);
  assert.deepEqual(odd.solved, ["easy-01"]);
  // Repetirlo no escribe una segunda fila ni cambia la fecha.
  const again = await api("puzzleSync", { answers: answersFor(["easy-01"]) }, ana.token);
  assert.deepEqual(again.solved, ["easy-01"]);
  assert.deepEqual(await rowsOf(ana.username), rows);
});

test("otro aparato de la misma cuenta recibe lo resuelto, y otra cuenta no", async () => {
  const phone = await player("Enigma-Bea");
  await api("puzzleSync", { answers: answersFor(["normal-05", "expert-11"]) }, phone.token);
  const laptop = await api("loginUser", { identifier: "Enigma-Bea", pin: "2468", country: "es" });
  assert.notEqual(laptop.sessionToken, phone.token, "es otra sesión: otro navegador");
  const seen = await api("puzzleSync", {}, laptop.sessionToken);
  assert.deepEqual(seen.solved, ["expert-11", "normal-05"], "lo resuelto en el teléfono está en el ordenador");
  const stranger = await player("Enigma-Otra");
  assert.deepEqual((await api("puzzleSync", {}, stranger.token)).solved, []);
});

test("terminar un nivel da su insignia, y terminarlos todos, la cuarta", async () => {
  const carla = await player("Enigma-Carla");
  const almost = await api("puzzleSync", { answers: answersFor(IDS.easy.slice(0, -1)) }, carla.token);
  assert.equal(almost.solved.length, IDS.easy.length - 1);
  assert.equal(almost.newBadges, undefined, "con uno por resolver todavía no hay insignia");

  const last = await api("puzzleSync", { answers: answersFor(IDS.easy.slice(-1)) }, carla.token);
  assert.deepEqual(last.newBadges, ["puzzles_easy"], "la insignia viaja en la respuesta que la gana");
  const repeat = await api("puzzleSync", { answers: answersFor(IDS.easy) }, carla.token);
  assert.equal(repeat.newBadges, undefined, "y no se vuelve a anunciar");

  // Un aparato que ya los tenía todos resueltos los envía de una vez.
  const rest = await api("puzzleSync", { answers: answersFor([...IDS.normal, ...IDS.expert]) }, carla.token);
  assert.deepEqual([...rest.newBadges].sort(), ["puzzles_all", "puzzles_expert", "puzzles_normal"]);
  assert.equal(rest.solved.length, PUZZLE_TOTAL);
  assert.deepEqual(await badgesOf(carla.username), ["puzzles_all", "puzzles_easy", "puzzles_expert", "puzzles_normal"]);

  const profile = await api("profile", { player: carla.username }, carla.token);
  const shown = profile.profile.badges.map((badge) => badge.code).sort();
  assert.deepEqual(shown, ["puzzles_all", "puzzles_easy", "puzzles_expert", "puzzles_normal"], "y se ven en el perfil");
});

test("dos aparatos que terminan el nivel a la vez no se quedan sin la insignia", async () => {
  const dani = await player("Enigma-Dani");
  const half = Math.floor(IDS.expert.length / 2);
  const [one, two] = await Promise.all([
    api("puzzleSync", { answers: answersFor(IDS.expert.slice(0, half)) }, dani.token),
    api("puzzleSync", { answers: answersFor(IDS.expert.slice(half)) }, dani.token),
  ]);
  const announced = [...(one.newBadges || []), ...(two.newBadges || [])];
  assert.deepEqual(announced, ["puzzles_expert"], "se gana una vez, la envíe quien la envíe");
  assert.deepEqual(await badgesOf(dani.username), ["puzzles_expert"]);
});

test("cambiar de nombre se lleva los enigmas y borrar la cuenta los borra", async () => {
  const eva = await player("Enigma-Eva");
  await api("puzzleSync", { answers: answersFor(["easy-01", "easy-02"]) }, eva.token);
  const renamed = await api("changeUsername", { newUsername: "Enigma-Eva2", pin: "2468" }, eva.token);
  assert.equal(renamed.ok, true, renamed.error);
  assert.equal((await rowsOf("Enigma-Eva")).length, 0, "no queda nada con el nombre viejo");
  assert.deepEqual((await api("puzzleSync", {}, eva.token)).solved, ["easy-01", "easy-02"], "lo resuelto es de la persona");

  const boss = await player("Enigma-Jefa", { role: "admin" });
  const detail = await api("adminUserDetail", { target: "Enigma-Eva2" }, boss.token);
  assert.deepEqual(detail.puzzles, { solved: 2, total: PUZZLE_TOTAL }, "la ficha del panel dice cuántos lleva");
  const exported = await api("adminExport", {}, boss.token);
  assert.equal(exported.schemaVersion, 7);
  assert.ok(exported.puzzleSolves.some((row) => row.username_key === "enigma-eva2"), "y la copia los incluye");
  const deleted = await api("adminDeleteUser", { target: "Enigma-Eva2" }, boss.token);
  assert.equal(deleted.ok, true, deleted.error);
  assert.equal((await rowsOf("Enigma-Eva2")).length, 0, "borrar la cuenta se lleva sus enigmas");
});

/* ------------------------- la pantalla -------------------------
   El código de la página, tal cual, con un `localStorage` de juguete y un
   `api` que habla con el Worker de verdad: así la prueba comprueba también
   que los dos se entienden. */

function fn(name) {
  const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `falta ${name}`);
  const end = html.indexOf("\n}\n", start);
  return html.slice(start, end + 2);
}

function device({ user = "", token = "", stored = {} } = {}) {
  const store = new Map(Object.entries(stored));
  const localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  const calls = [];
  const painted = { "pz-banner": "", "pz-earned": "" };
  const $ = (id) => ({ insertAdjacentHTML: (_, markup) => { painted[id] += markup; } });
  const src = [
    `const PUZZLE_SOLVED_KEY='pf_puzzles_solved', PUZZLE_SYNC_KEY='pf_puzzles_sync';`,
    `let sessionToken=${JSON.stringify(token)}, user=${JSON.stringify(user)}, puzzleOpen=null;`,
    fn("solvedPuzzles"), fn("saveSolvedPuzzles"), fn("markPuzzleSolved"), fn("puzzleSyncMemo"), fn("detachPuzzles"),
    fn("pendingPuzzleAnswers"), fn("syncPuzzles"), fn("showPuzzleBadges"),
    `return { solvedPuzzles, markPuzzleSolved, detachPuzzles, syncPuzzles, puzzleSyncMemo };`,
  ].join("\n");
  const stubs = {
    localStorage, $, Deduce, puzzleData: published,
    api: async (action, payload) => { calls.push({ action, payload }); return api(action, payload, token); },
    renderPuzzleList: () => {}, badgesBlockHTML: (codes) => codes.join("+"),
  };
  const page = new Function(...Object.keys(stubs), src)(...Object.values(stubs));
  return { ...page, calls, painted, store };
}

const sorted = (set) => [...set].sort();

test("un invitado resuelve enigmas sin una sola llamada al API", async () => {
  const guest = device();
  guest.markPuzzleSolved("easy-01");
  await guest.syncPuzzles({ "easy-01": ANSWERS.get("easy-01") });
  assert.deepEqual(guest.calls, [], "sin sesión, nada sale del aparato");
  assert.deepEqual(sorted(guest.solvedPuzzles()), ["easy-01"], "y lo resuelto se queda donde estaba");
  assert.match(html, /const GUEST_VIEWS = new Set\(\[[^\]]*'puzzles'/, "los enigmas se siguen jugando sin cuenta");
});

test("lo resuelto antes de la 5.3.0 sube a la cuenta y baja en el otro aparato", async () => {
  const fede = await player("Enigma-Fede");
  // El teléfono trae lo que tenía en localStorage: identificadores, sin respuestas.
  const legacy = [...IDS.easy, "normal-01", "expert-24"];
  const phone = device({ user: fede.username, token: fede.token, stored: { pf_puzzles_solved: JSON.stringify(legacy) } });
  await phone.syncPuzzles();
  assert.equal(phone.calls.length, 1);
  assert.equal(phone.calls[0].action, "puzzleSync");
  assert.equal(phone.calls[0].payload.answers.split(",").length, legacy.length, "cada enigma viaja con su respuesta");
  assert.deepEqual((await rowsOf(fede.username)).map((row) => row.puzzle_id), [...legacy].sort());
  assert.equal(phone.painted["pz-earned"], "puzzles_easy", "el nivel que ya estaba completo trae su insignia");
  assert.deepEqual(phone.puzzleSyncMemo(), { owner: "enigma-fede", ids: [...legacy].sort() });

  // La segunda vez no hay nada pendiente: se pide la lista y no se envía nada.
  await phone.syncPuzzles();
  assert.equal(phone.calls[1].payload.answers, "");

  // El ordenador nunca había abierto los enigmas.
  const laptop = device({ user: fede.username, token: fede.token });
  await laptop.syncPuzzles();
  assert.deepEqual(sorted(laptop.solvedPuzzles()), [...legacy].sort(), "el historial ya no se pierde al cambiar de aparato");
  assert.equal(laptop.painted["pz-earned"], "", "y la insignia no se anuncia dos veces");

  // Y lo que se resuelve en uno aparece en el otro.
  laptop.markPuzzleSolved("normal-02");
  await laptop.syncPuzzles({ "normal-02": ANSWERS.get("normal-02") });
  await phone.syncPuzzles();
  assert.ok(phone.solvedPuzzles().has("normal-02"));
});

test("lo que la cuenta no acepta no se queda marcado, y sin conexión nada se pierde", async () => {
  const gala = await player("Enigma-Gala");
  // Tres marcas en el aparato: una buena, una que viaja con una respuesta
  // equivocada —el servidor no la devuelve y se va— y una de un enigma que el
  // archivo ya no trae: no hay respuesta que enviar, así que ni viaja ni se toca.
  const page = device({ user: gala.username, token: gala.token,
    stored: { pf_puzzles_solved: JSON.stringify(["easy-05", "easy-06", "viejo-01"]) } });
  await page.syncPuzzles({ "easy-06": ANSWERS.get("easy-05") });
  assert.deepEqual(page.calls[0].payload.answers.split(",").map((pair) => pair.split(":")[0]), ["easy-05", "easy-06"]);
  assert.deepEqual(sorted(page.solvedPuzzles()), ["easy-05", "viejo-01"]);
  assert.deepEqual((await rowsOf(gala.username)).map((row) => row.puzzle_id), ["easy-05"]);

  const offline = device({ user: gala.username, token: "caducada" });
  offline.markPuzzleSolved("easy-07");
  await offline.syncPuzzles({ "easy-07": ANSWERS.get("easy-07") });
  assert.deepEqual(sorted(offline.solvedPuzzles()), ["easy-07"], "si la llamada falla, lo resuelto sigue en el aparato");
  assert.equal(offline.puzzleSyncMemo(), null);
});

test("al salir, los enigmas de la cuenta se van del aparato; otra cuenta no los hereda", async () => {
  const hugo = await player("Enigma-Hugo");
  const page = device({ user: hugo.username, token: hugo.token });
  page.markPuzzleSolved("easy-01");
  await page.syncPuzzles({ "easy-01": ANSWERS.get("easy-01") });
  page.markPuzzleSolved("easy-02"); // resuelto sin que llegara a enviarse
  page.detachPuzzles();
  assert.deepEqual(sorted(page.solvedPuzzles()), ["easy-02"], "queda lo que no se envió");
  assert.equal(page.puzzleSyncMemo(), null);

  // Sesión caducada sin cerrar: el aparato conserva lo de Hugo y entra Iris.
  const shared = device({ user: hugo.username, token: hugo.token });
  await shared.syncPuzzles();
  assert.deepEqual(sorted(shared.solvedPuzzles()), ["easy-01"]);
  const iris = await player("Enigma-Iris");
  const hers = device({ user: iris.username, token: iris.token, stored: Object.fromEntries(shared.store) });
  await hers.syncPuzzles();
  assert.deepEqual(sorted(hers.solvedPuzzles()), [], "lo de Hugo no pasa a la cuenta de Iris");
  assert.deepEqual(await rowsOf(iris.username), []);
});

test("la pantalla sincroniza al abrir y al resolver, nunca en un sondeo", () => {
  const block = html.slice(html.indexOf("const PUZZLE_FILE="), html.indexOf("let historyEntries="));
  assert.deepEqual(block.match(/\bapi\('\w+'/g), ["api('puzzleSync'"], "una sola acción, y es esta");
  assert.match(fn("syncPuzzles"), /^async function syncPuzzles\(known\)\{\n  if\(!sessionToken\|\|!user\) return;/,
    "lo primero es la sesión: sin ella no se llega al API");
  assert.match(fn("openPuzzles"), /await loadPuzzles\(\);\n  syncPuzzles\(\);/);
  assert.match(fn("submitPuzzle"), /markPuzzleSolved\(puzzleOpen\.id\); syncPuzzles\(\{\[puzzleOpen\.id\]:code\}\);/);
  assert.equal((html.match(/syncPuzzles\(/g) || []).length, 3, "la definición y sus dos llamadas");
  assert.doesNotMatch(block, /setInterval|setTimeout/);
  assert.match(fn("logout"), /detachPuzzles\(\);/);
  assert.match(html, /<div id="pz-earned"><\/div>/);
});

test("las cuatro insignias de los enigmas están dibujadas y en los tres idiomas", () => {
  const art = html.slice(html.indexOf("const BADGE_ART={"), html.indexOf("const BADGE_ORDER="));
  const drawn = [...art.matchAll(/^\s{2}(\w+):\{bg:/gm)].map((m) => m[1]);
  assert.deepEqual(drawn, [...BADGES], "la pantalla dibuja las mismas insignias que guarda el servidor, en su orden");
  const mine = ["puzzles_easy", "puzzles_normal", "puzzles_expert", "puzzles_all"];
  assert.deepEqual(BADGES.slice(-4), mine);
  for (const code of mine) {
    assert.equal((html.match(new RegExp(`badge_${code}:`, "g")) || []).length, 3, `falta el nombre de ${code}`);
    assert.equal((html.match(new RegExp(`badge_${code}_desc:`, "g")) || []).length, 3, `falta la frase de ${code}`);
  }
});
