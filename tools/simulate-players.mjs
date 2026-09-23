/* Simula a varias personas jugando a la vez contra el Worker, en local y sin
 * red, para encontrar lo que una sola pestana no encuentra: dos que se unen a
 * la misma partida, dos intentos que llegan juntos, la revancha pedida por los
 * dos, ocho en la arena disparando a la vez, el chat a rafagas, el sondeo del
 * vestibulo de todos al mismo tiempo, y las peticiones malformadas que un
 * navegador roto podria mandar.
 *
 * Levanta el Worker con Miniflare y una D1 vacia con las migraciones, igual
 * que las pruebas, y encadena escenarios. Cada escenario comprueba invariantes
 * —una sola partida por revancha, un solo recibo de puntos por partida, ningun
 * secreto fuera de una partida activa, ningun 500— y anota las anomalias en
 * lugar de parar en la primera. Al final imprime el informe y sale con 1 si
 * encontro algo.
 *
 * Uso:  node tools/simulate-players.mjs          (PF_PLAYERS=8 por defecto)
 */
import { readFile, readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { seedAccount } from "../test/accounts.js";
import { evaluate } from "../src/game.js";
import { dailySecret, DAILY_RULES } from "../src/daily.js";

const PLAYERS = Math.min(8, Math.max(4, Number(process.env.PF_PLAYERS) || 8));
const migrationsDir = new URL("../migrations/", import.meta.url);

const mf = new Miniflare({
  modules: true,
  scriptPath: "src/index.js",
  modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
  compatibilityDate: "2026-08-02",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "00000000-0000-0000-0000-000000000077" },
  bindings: { SESSION_TTL_HOURS: "168", ADMIN_PATH: "/admin", DEBUG_ERRORS: "1" },
});
const db = await mf.getD1Database("DB");
for (const file of (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = await readFile(new URL(file, migrationsDir), "utf8");
  for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run();
}

/* ---------- utilidades ---------- */
const anomalies = [];
let checks = 0;
const bad = (code, detail) => { anomalies.push({ code, detail }); console.log(`  ✗ ${code} · ${detail}`); };
const good = (detail) => { checks++; console.log(`  ✓ ${detail}`); };
const expect = (cond, code, detail) => (cond ? good(detail) : bad(code, detail));
const section = (title) => console.log(`\n== ${title} ==`);
const rid = () => crypto.randomUUID();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Cada llamada anota su HTTP: un 500 es siempre una anomalia, venga de donde venga. */
async function call(action, payload = {}, token = "", { raw = null, allow = [200] } = {}) {
  const response = await mf.dispatchFetch("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: raw ?? JSON.stringify({ action, ...payload }),
  });
  let body = null;
  try { body = await response.json(); } catch { body = { ok: false, error: "(sin JSON)" }; }
  if (!allow.includes(response.status))
    bad(`HTTP-${response.status}`, `${action}: ${JSON.stringify(body).slice(0, 160)}`);
  return { status: response.status, ...body };
}

async function login(name) {
  await seedAccount(db, name);
  const res = await call("loginUser", { identifier: name, pin: "2468", country: "es" });
  if (!res.ok) throw new Error(`no entra ${name}: ${res.error}`);
  return { name: res.username, token: res.sessionToken };
}

const GAME = { digits: 3, mode: "numbers", numColors: 10, allowRepeats: false, isPublic: true,
  maxAttempts: 0, turnSeconds: 0, timeMode: "turn", bankSeconds: 0, bankIncrement: 0, country: "es" };
const codes = ["123", "456", "789", "012", "345", "678", "901", "234", "567", "890"];
const randomCode = (digits = 3) => {
  const pool = [..."0123456789"];
  let out = "";
  for (let i = 0; i < digits; i++) out += pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  return out;
};
const count = async (sql, ...binds) => Number((await db.prepare(sql).bind(...binds).first())?.n) || 0;

const players = [];
for (let i = 0; i < PLAYERS; i++) players.push(await login(`Sim${String.fromCharCode(65 + i)}`));
const [A, B, C, D, E, F, G, H] = players;
console.log(`Jugadores: ${players.map((p) => p.name).join(", ")}`);

/* ---------- S1: tres se unen a la misma partida a la vez ---------- */
section("S1 · Tres jugadores se unen a la misma partida en el mismo instante");
let game1;
{
  const created = await call("createGame", { ...GAME, secret: "123" }, A.token);
  expect(created.ok, "S1-create", `A crea la partida: ${created.error || created.gameId}`);
  game1 = created.gameId;
  const joins = await Promise.all([B, C, D].map((p, i) => call("joinGame", { gameId: game1, secret: codes[i + 1], country: "es" }, p.token)));
  const winners = joins.filter((j) => j.ok);
  expect(winners.length === 1, "S1-join-race", `exactamente una union acepta (${winners.length} de 3)`);
  const st = await call("state", { gameId: game1 }, A.token);
  const joined = [B, C, D][joins.findIndex((j) => j.ok)];
  expect(st.status === "active" && st.p2 === joined?.name, "S1-p2", `la partida queda activa con ${st.p2} como rival`);
  expect(joins.filter((j) => !j.ok).every((j) => j.status === 200 && /acepta|simult/.test(j.error)), "S1-errors", "los otros dos reciben un rechazo limpio");
  game1 = { id: game1, p1: A, p2: joined, secrets: { [A.name]: "123", [joined.name]: codes[joins.findIndex((j) => j.ok) + 1] } };
}

/* ---------- S2: intentos simultaneos de los dos, y el mismo intento dos veces ---------- */
section("S2 · Los dos jugadores disparan intentos a la vez, y uno repite el suyo");
{
  const st = await call("state", { gameId: game1.id }, A.token);
  const holder = st.turn === 1 ? game1.p1 : game1.p2, other = holder === game1.p1 ? game1.p2 : game1.p1;
  const before = st.guesses.length;
  const shots = await Promise.all([
    ...[0, 1, 2].map((i) => call("guess", { gameId: game1.id, guess: codes[i + 4], requestId: rid() }, holder.token)),
    ...[0, 1, 2].map((i) => call("guess", { gameId: game1.id, guess: codes[i + 7], requestId: rid() }, other.token)),
  ]);
  const accepted = shots.filter((s) => s.ok);
  const after = await call("state", { gameId: game1.id }, A.token);
  // Puede entrar uno del que tenia el turno y, justo despues, uno del otro: al
  // reintentar tras el conflicto ya es su turno. Lo que no puede pasar es que
  // entren dos del mismo jugador ni que el diario no coincida con lo aceptado.
  const byPlayer = new Set(after.guesses.slice(before).map((g) => g.by));
  expect(accepted.length >= 1 && accepted.length <= 2 && byPlayer.size === accepted.length, "S2-turns", `de seis intentos simultaneos entran ${accepted.length}, de jugadores distintos y por turno`);
  expect(after.guesses.length === before + accepted.length, "S2-count", `el diario crece exactamente en lo aceptado (${before} → ${after.guesses.length})`);
  expect(shots.filter((s) => !s.ok).every((s) => s.status === 200), "S2-clean", "los rechazados responden 200 con su motivo");
  // El mismo intento, dos veces a la vez (una red que reintenta).
  const st2 = await call("state", { gameId: game1.id }, A.token);
  const h2 = st2.turn === 1 ? game1.p1 : game1.p2;
  const same = rid();
  const twin = await Promise.all([0, 1].map(() => call("guess", { gameId: game1.id, guess: "246", requestId: same }, h2.token)));
  const after2 = await call("state", { gameId: game1.id }, A.token);
  expect(twin.every((t) => t.ok), "S2-receipt-ok", "las dos copias del mismo intento reciben la misma respuesta valida");
  expect(after2.guesses.length === st2.guesses.length + 1, "S2-receipt-once", `el intento repetido cuenta una sola vez (${after2.guesses.length - st2.guesses.length})`);
  expect(JSON.stringify(twin[0].fijas) === JSON.stringify(twin[1].fijas), "S2-receipt-same", "las dos copias traen las mismas fijas");
}

/* ---------- S3: la partida termina y se cuenta una sola vez ---------- */
section("S3 · La partida se juega hasta el final y los puntos se apuntan una vez");
{
  let st = await call("state", { gameId: game1.id }, A.token);
  let guard = 0;
  while (st.status === "active" && guard++ < 12) {
    const holder = st.turn === 1 ? game1.p1 : game1.p2, other = holder === game1.p1 ? game1.p2 : game1.p1;
    // El que tiene el turno acierta el secreto del rival; si queda ultimo intento, el otro falla.
    const target = game1.secrets[other.name];
    const res = await call("guess", { gameId: game1.id, guess: st.pendingWinner ? randomCode() : target, requestId: rid() }, holder.token);
    if (!res.ok) { bad("S3-guess", `${holder.name}: ${res.error}`); break; }
    st = await call("state", { gameId: game1.id }, A.token);
  }
  expect(st.status === "finished", "S3-finished", `la partida termina (${st.status}, ganador ${st.winner || "nadie"})`);
  const receipts = await count("SELECT COUNT(*) AS n FROM game_scores WHERE game_id=?", game1.id);
  expect(receipts === 1, "S3-receipt", `un recibo de puntos por partida (${receipts})`);
  const finishedMsgs = await count("SELECT COUNT(*) AS n FROM chat_messages WHERE game_id=? AND body LIKE 'finished|%'", game1.id);
  expect(finishedMsgs === 1, "S3-finished-msg", `un aviso de fin en el chat (${finishedMsgs})`);
  const spectator = await call("state", { gameId: game1.id }, E.token);
  expect(spectator.ok && spectator.spectator && !spectator.yourSecret && !spectator.opponentSecret, "S3-spectator-secrets", "quien mira no recibe secretos ni al terminar");
}

/* ---------- S4: intento ganador y abandono en el mismo instante ---------- */
section("S4 · El intento ganador y el abandono del rival llegan juntos");
{
  const created = await call("createGame", { ...GAME, isPublic: false, secret: "135" }, C.token);
  expect(created.ok, "S4-create", `C crea una privada: ${created.error || created.gameId}`);
  const gid = created.gameId;
  const joined = await call("joinGame", { gameId: gid, secret: "246", country: "es" }, D.token);
  expect(joined.ok, "S4-join", `D se une: ${joined.error || "ok"}`);
  let st = await call("state", { gameId: gid }, C.token);
  // El primero que mueve falla a proposito, para que el siguiente pueda ganar de golpe.
  const first = st.turn === 1 ? C : D;
  await call("guess", { gameId: gid, guess: "789", requestId: rid() }, first.token);
  st = await call("state", { gameId: gid }, C.token);
  const T = st.turn === 1 ? C : D, O = T === C ? D : C;
  const target = T === C ? "246" : "135";
  const scoresBefore = { [T.name]: await count("SELECT COUNT(*) AS n FROM game_scores WHERE game_id=?", gid) };
  const [win, quit] = await Promise.all([
    call("guess", { gameId: gid, guess: target, requestId: rid() }, T.token),
    call("closeGame", { gameId: gid, intent: "abandon" }, O.token),
  ]);
  st = await call("state", { gameId: gid }, T.token);
  expect(st.status === "finished" && st.winner === T.name, "S4-winner", `termina con ${st.winner} como ganador (motivo ${st.finishReason || "intento"})`);
  expect(win.ok !== quit.ok || (win.ok && quit.ok), "S4-paths", `caminos: intento ${win.ok ? "acepta" : "rechaza"}, abandono ${quit.ok ? "acepta" : "rechaza"}`);
  const receipts = await count("SELECT COUNT(*) AS n FROM game_scores WHERE game_id=?", gid);
  expect(receipts === 1, "S4-receipt", `un solo recibo de puntos (${receipts}, antes ${scoresBefore[T.name]})`);
  const games = await count("SELECT COUNT(*) AS n FROM player_scores WHERE username_key=? AND season='all' AND played=1", T.name.toLowerCase());
  expect(games === 1, "S4-player-scores", `${T.name} tiene exactamente una partida contada (${games})`);
}

/* ---------- S5: los dos piden la revancha a la vez ---------- */
section("S5 · Los dos jugadores piden la revancha en el mismo instante");
{
  await sleep(10_500); // el cooldown de creacion de A y de su rival
  const [ra, rb] = await Promise.all([
    call("rematch", { gameId: game1.id, secret: "321", country: "es" }, game1.p1.token),
    call("rematch", { gameId: game1.id, secret: "654", country: "es" }, game1.p2.token),
  ]);
  expect(ra.ok && rb.ok, "S5-both-ok", `las dos peticiones vuelven bien (${ra.error || ra.gameId} / ${rb.error || rb.gameId})`);
  const ids = new Set([ra.gameId, rb.gameId].filter(Boolean));
  const st = ids.size ? await call("state", { gameId: [...ids][0] }, game1.p1.token) : {};
  const waiting = await count("SELECT COUNT(*) AS n FROM games WHERE status='waiting' AND (p1=? OR p1=?)", game1.p1.name, game1.p2.name);
  const linked = (await db.prepare("SELECT rematch_id FROM games WHERE game_id=?").bind(game1.id).first())?.rematch_id;
  expect(ids.size === 1 && st.status === "active", "S5-one-game", `una sola revancha, activa, entre ${st.p1} y ${st.p2}`);
  expect(waiting === 0, "S5-no-orphan", `ninguna partida huerfana en espera (${waiting})`);
  expect(ids.has(linked), "S5-linked", `la partida vieja apunta a la revancha (${linked})`);
}

/* ---------- S6: la arena con ocho a la vez ---------- */
section("S6 · La arena: todos entran, todos disparan a la vez, nadie ve el codigo");
{
  const host = E;
  const created = await call("arenaCreate", { digits: 3, mode: "numbers", allowRepeats: false, maxAttempts: 6, country: "es" }, host.token);
  expect(created.ok, "S6-create", `E abre la arena: ${created.error || created.arenaId}`);
  const arenaId = created.arenaId;
  const others = players.filter((p) => p !== host);
  const joins = await Promise.all(others.map((p) => call("arenaJoin", { arenaId, country: "es" }, p.token)));
  expect(joins.every((j) => j.ok), "S6-joins", `${joins.filter((j) => j.ok).length} de ${others.length} entran a la vez`);
  const early = await call("arenaGuess", { arenaId, guess: "123", requestId: rid() }, A.token);
  expect(!early.ok && early.status === 200, "S6-before-start", "un intento antes de empezar se rechaza limpio");
  const notHost = await call("arenaStart", { arenaId }, A.token);
  expect(!notHost.ok, "S6-start-guard", "solo quien la abrio puede empezarla");
  const started = await call("arenaStart", { arenaId }, host.token);
  expect(started.ok, "S6-start", `la arena empieza: ${started.error || "ok"}`);
  const secret = (await db.prepare("SELECT secret FROM arenas WHERE arena_id=?").bind(arenaId).first()).secret;
  let leaked = false, finished = false, round = 0;
  while (!finished && round < 8) {
    round++;
    const volley = await Promise.all(players.map((p, i) => {
      const guess = round === 3 && i === 1 ? secret : randomCode();
      const id = rid();
      // En la primera ronda cada uno manda su intento dos veces, como una red que reintenta.
      const calls = [call("arenaGuess", { arenaId, guess, requestId: id }, p.token)];
      if (round === 1) calls.push(call("arenaGuess", { arenaId, guess, requestId: id }, p.token));
      return Promise.all(calls);
    }));
    const states = await Promise.all(players.map((p) => call("arenaState", { arenaId }, p.token)));
    finished = states.some((s) => s.status === "finished");
    if (!finished && states.some((s) => s.secret)) leaked = true;
    for (const s of states) if (s.ok && !finished && s.secret) leaked = true;
    if (round === 1) {
      const dup = volley.filter(([a, b]) => a.ok && b.ok && ((a.repeated ? 1 : 0) + (b.repeated ? 1 : 0)) === 1).length;
      expect(dup === players.length, "S6-receipts", `el intento reenviado no gasta dos (${dup} de ${players.length} parejas coherentes)`);
    }
  }
  expect(!leaked, "S6-secret-hidden", "el codigo no sale de la arena mientras se juega");
  const final = await call("arenaState", { arenaId }, A.token);
  expect(final.status === "finished" && final.secret === secret, "S6-finished", `la arena termina y revela ${final.secret} (${final.finishReason || "complete"})`);
  const rows = (await db.prepare("SELECT username, attempts, solved_at FROM arena_players WHERE arena_id=?").bind(arenaId).all()).results;
  const over = rows.filter((r) => Number(r.attempts) > 6);
  expect(over.length === 0, "S6-attempts", `nadie pasa de 6 intentos (max ${Math.max(...rows.map((r) => Number(r.attempts)))})`);
  const guessesCount = (await db.prepare("SELECT username_key, COUNT(*) AS n FROM arena_guesses WHERE arena_id=? GROUP BY username_key").bind(arenaId).all()).results;
  const mismatch = rows.filter((r) => Number(guessesCount.find((g) => g.username_key === r.username.toLowerCase())?.n || 0) !== Number(r.attempts));
  expect(mismatch.length === 0, "S6-consistency", `intentos contados = intentos guardados para todos (${mismatch.map((m) => m.username).join(",") || "sí"})`);
  expect(final.board?.[0]?.username === B.name, "S6-ranking", `quien acerto va primero (${final.board?.[0]?.username})`);
  const late = await call("arenaJoin", { arenaId, country: "es" }, A.token);
  expect(late.status === 200, "S6-late-join", `unirse a una arena terminada responde limpio (${late.error || "ok"})`);
}

/* ---------- S7: el chat a rafagas ---------- */
section("S7 · Todos escriben en el chat del vestibulo a la vez");
{
  const before = await count("SELECT COUNT(*) AS n FROM chat_messages WHERE kind='user' AND room_type='lobby'");
  const sends = await Promise.all(players.flatMap((p) => [0, 1, 2].map((i) => call("chatSend", { roomType: "lobby", body: `hola ${i} de ${p.name}` }, p.token))));
  const okSends = sends.filter((s) => s.ok).length;
  const after = await count("SELECT COUNT(*) AS n FROM chat_messages WHERE kind='user' AND room_type='lobby'");
  expect(after - before === okSends, "S7-stored", `se guardan exactamente los aceptados (${okSends} aceptados, ${after - before} guardados)`);
  expect(sends.every((s) => s.status === 200), "S7-clean", "ningun envio rompe el servidor");
  const list = await call("chatList", { roomType: "lobby" }, A.token);
  const ids = (Object.values(list).find(Array.isArray) || []).map((m) => m.id);
  expect(ids.length > 0 && ids.every((id, i) => i === 0 || id > ids[i - 1]), "S7-order", `la lista llega ordenada (${ids.length} mensajes)`);
  const spy = await call("chatSend", { roomType: "game", gameId: game1.id, body: "psst" }, F.token);
  expect(!spy.ok && spy.status === 200, "S7-spectator-write", `quien mira no escribe en el chat de la partida (${spy.error})`);
}

/* ---------- S8: el sondeo de todos a la vez ---------- */
section("S8 · Ocho vestibulos sondeando a la vez, cinco rondas");
{
  const actions = ["lobbyState", "listGames", "publicPulse", "myGames", "history", "rivals", "dailyState", "presence"];
  let failures = 0, total = 0;
  for (let round = 0; round < 5; round++) {
    const results = await Promise.all(players.flatMap((p) => actions.map((a) => call(a, a === "leaderboard" ? { season: "month" } : {}, p.token))));
    total += results.length;
    failures += results.filter((r) => !r.ok).length;
  }
  expect(failures === 0, "S8-poll", `${total} sondeos, ${failures} fallos`);
  const lb = await Promise.all(players.map((p) => call("leaderboard", {}, p.token)));
  expect(lb.every((r) => r.ok), "S8-leaderboard", "el ranking responde a todos");
}

/* ---------- S9: el codigo del dia, todos a la vez ---------- */
section("S9 · El codigo del dia: ocho jugadores, ocho intentos cada uno, a la vez");
{
  const secret = await dailySecret({}, new Date().toISOString().slice(0, 10));
  const rounds = DAILY_RULES.maxAttempts;
  for (let r = 0; r < rounds; r++) {
    await Promise.all(players.map((p, i) => {
      const guess = r === 2 && i === 0 ? secret : randomCode(4);
      const id = rid();
      return Promise.all([call("dailyGuess", { guess, requestId: id }, p.token), r === 0 ? call("dailyGuess", { guess, requestId: id }, p.token) : null]);
    }));
  }
  const extra = await call("dailyGuess", { guess: randomCode(4), requestId: rid() }, B.token);
  expect(!extra.ok && extra.status === 200, "S9-limit", `el noveno intento se rechaza limpio (${extra.code || extra.error})`);
  const rows = (await db.prepare("SELECT username, attempts, solved FROM daily_results WHERE day=?").bind(new Date().toISOString().slice(0, 10)).all()).results;
  expect(rows.every((row) => Number(row.attempts) <= rounds), "S9-attempts", `nadie pasa de ${rounds} intentos (max ${Math.max(...rows.map((r) => Number(r.attempts)))})`);
  const solver = rows.find((row) => row.username === A.name);
  expect(solver && Number(solver.solved) === 1 && Number(solver.attempts) === 3, "S9-solver", `${A.name} resuelve al tercer intento (${solver?.attempts} intentos, resuelto ${solver?.solved})`);
  const st = await call("dailyState", {}, A.token);
  const top = st.board?.[0] || {};
  expect(st.ok && (top.username || top.name) === A.name, "S9-board", `la clasificacion del dia pone primero a quien resolvio (${top.username || top.name})`);
}

/* ---------- S10: peticiones malformadas ---------- */
section("S10 · Lo que un navegador roto podria mandar");
{
  const unknown = await call("nadaDeNada", {}, A.token);
  expect(!unknown.ok && unknown.status === 200, "S10-unknown", `accion desconocida: ${unknown.error}`);
  const noToken = await call("lobbyState", {}, "", { allow: [401] });
  expect(noToken.status === 401, "S10-no-token", "sin sesion responde 401");
  const badToken = await call("lobbyState", {}, "no-es-un-token", { allow: [401] });
  expect(badToken.status === 401, "S10-bad-token", "una sesion inventada responde 401");
  const notJson = await call("guess", {}, A.token, { raw: "esto no es json", allow: [200, 400] });
  expect(notJson.status !== 500, "S10-not-json", `un cuerpo que no es JSON responde ${notJson.status}`);
  const huge = await call("guess", {}, A.token, { raw: JSON.stringify({ action: "guess", guess: "x".repeat(600_000) }), allow: [413] });
  expect(huge.status === 413, "S10-huge", `un cuerpo enorme responde ${huge.status}`);
  const wrongLen = await call("guess", { gameId: game1.id, guess: "1", requestId: rid() }, A.token);
  expect(!wrongLen.ok, "S10-short", `un intento corto se rechaza (${wrongLen.error})`);
  const ghost = await call("guess", { gameId: "ZZZZ", guess: "123", requestId: rid() }, A.token);
  expect(!ghost.ok, "S10-ghost", `una partida inexistente se rechaza (${ghost.error})`);
  const nested = await call("guess", { gameId: { a: 1 }, guess: ["1"], requestId: rid() }, A.token, { allow: [200, 400] });
  expect(nested.status !== 500, "S10-nested", `parametros estructurados responden ${nested.status}`);
  const own = await call("joinGame", { gameId: game1.id, secret: "123", country: "es" }, A.token);
  expect(!own.ok, "S10-own", `unirse a la propia partida se rechaza (${own.error})`);
  const stranger = await call("arenaGuess", { arenaId: "NOPE", guess: "123", requestId: rid() }, A.token);
  expect(!stranger.ok, "S10-arena", `una arena inexistente se rechaza (${stranger.error})`);
  const fourth = [];
  for (let i = 0; i < 4; i++) fourth.push(await call("createGame", { ...GAME, secret: "123" }, G.token));
  expect(fourth.filter((r) => r.ok).length <= 3 && fourth.every((r) => r.status === 200), "S10-limits", `el tope de partidas y el cooldown responden limpio (${fourth.filter((r) => r.ok).length} creadas)`);
  const gone = await call("leavePresence", {}, H.token);
  const afterLeave = await call("lobbyState", {}, H.token, { allow: [401] });
  expect(gone.ok && afterLeave.status === 401, "S10-leave", "salir borra la sesion: la siguiente peticion responde 401");
}

/* ---------- S11: el reloj por turno vence y los dos avisan a la vez ---------- */
section("S11 · Un turno de 30 s vence: los dos avisan a la vez y el que perdio el turno intenta colarse");
// H salio en S10 y su sesion ya no existe: vuelve a entrar para los escenarios que siguen.
players[players.indexOf(H)] = await login(H.name);
const H2 = players[players.length - 1];
{
  await sleep(10_500);
  const created = await call("createGame", { ...GAME, isPublic: false, turnSeconds: 30, secret: "147" }, E.token);
  expect(created.ok, "S11-create", `E crea una partida con 30 s por turno: ${created.error || created.gameId}`);
  const gid = created.gameId;
  const joined = await call("joinGame", { gameId: gid, secret: "258", country: "es" }, F.token);
  expect(joined.ok, "S11-join", `F se une: ${joined.error || "ok"}`);
  // Las dos pantallas piden el estado: solo entonces arranca el reloj.
  let st = (await Promise.all([call("state", { gameId: gid }, E.token), call("state", { gameId: gid }, F.token)]))[0];
  st = await call("state", { gameId: gid }, E.token);
  const holder = st.turn === 1 ? E : F, other = holder === E ? F : E;
  expect(!st.timerPaused && st.turnRemaining > 0, "S11-armed", `el reloj arranca cuando los dos han mirado (${st.turnRemaining}s, pausado ${st.timerPaused})`);
  console.log("  … esperando a que venza el turno (36 s)");
  await sleep(36_000);
  const [pass1, pass2, late] = await Promise.all([
    call("passTurn", { gameId: gid }, E.token),
    call("passTurn", { gameId: gid }, F.token),
    call("guess", { gameId: gid, guess: "369", requestId: rid() }, holder.token),
  ]);
  const after = await call("state", { gameId: gid }, E.token);
  const passes = [pass1, pass2].filter((r) => r.ok && r.passed).length;
  expect(after.status === "active" && after.turn !== st.turn, "S11-turn-moved", `el turno pasa una vez al otro jugador (${st.turn} → ${after.turn})`);
  expect(passes <= 1, "S11-one-pass", `de dos avisos simultaneos, ${passes} pasan el turno; el otro recibe «aún queda tiempo» o el estado ya cambiado`);
  expect(!late.ok, "S11-late-guess", `el intento tardio del que perdio el turno se rechaza (${late.error})`);
  expect(after.guesses.some((g) => g.missed), "S11-missed", "el diario anota el turno perdido");
  const otherNow = after.turn === 1 ? E : F;
  const move = await call("guess", { gameId: gid, guess: "369", requestId: rid() }, otherNow.token);
  expect(move.ok, "S11-play-on", `${otherNow.name} juega con el reloj nuevo (${move.error || "ok"})`);
}

/* ---------- S12: el Cron cierra partidas mientras se juega ---------- */
section("S12 · El mantenimiento del Cron pasa mientras todos siguen jugando");
{
  const { cleanupDatabase } = await import("../src/maintenance.js");
  const gid = (await db.prepare("SELECT game_id FROM games WHERE status='active' AND p1=? LIMIT 1").bind(E.name).first())?.game_id;
  const receiptsBefore = await count("SELECT COUNT(*) AS n FROM game_scores");
  const results = await Promise.all([
    cleanupDatabase(db, Date.now() + 49 * 3600 * 1000).then(() => ({ ok: true, cron: true })),
    ...players.map((p) => call("lobbyState", {}, p.token)),
    gid ? call("guess", { gameId: gid, guess: "159", requestId: rid() }, E.token) : Promise.resolve({ ok: true }),
    gid ? call("guess", { gameId: gid, guess: "159", requestId: rid() }, F.token) : Promise.resolve({ ok: true }),
  ]);
  expect(results.every((r) => r.status === undefined || r.status === 200), "S12-clean", "ninguna peticion rompe mientras el Cron limpia");
  const st = gid ? await call("state", { gameId: gid }, E.token) : { error: "sin partida" };
  expect(!st.ok && /48 horas|expirado|activa/.test(st.error || ""), "S12-inactive", `la partida activa de hace «49 horas» se cierra por inactividad (${st.error})`);
  const receiptsAfter = await count("SELECT COUNT(*) AS n FROM game_scores");
  expect(receiptsAfter === receiptsBefore, "S12-no-points", `una partida cerrada por inactividad no reparte puntos (${receiptsBefore} → ${receiptsAfter})`);
  const sessions = await call("lobbyState", {}, A.token);
  expect(sessions.ok, "S12-sessions", "las sesiones vigentes sobreviven a la limpieza");
}

/* ---------- S13: veinte rondas de intentos cruzados ---------- */
section("S13 · Veinte rondas de intentos cruzados en una partida nueva");
{
  await sleep(10_500);
  const created = await call("createGame", { ...GAME, isPublic: false, secret: "159" }, G.token);
  const gid = created.gameId;
  const joined = await call("joinGame", { gameId: gid, secret: "260", country: "es" }, H2.token);
  expect(created.ok && joined.ok, "S13-setup", `G y H abren una partida (${created.error || joined.error || gid})`);
  let lastVersion = 0, broken = false, mine = 0, theirs = 0;
  for (let round = 0; round < 20 && !broken; round++) {
    const st = await call("state", { gameId: gid }, G.token);
    if (st.status !== "active") break;
    if (st.version < lastVersion) { bad("S13-version", `la version retrocede (${lastVersion} → ${st.version})`); broken = true; }
    lastVersion = st.version;
    const holder = st.turn === 1 ? G : H2, other = holder === G ? H2 : G;
    const shots = await Promise.all([
      call("guess", { gameId: gid, guess: randomCode(), requestId: rid() }, holder.token),
      call("guess", { gameId: gid, guess: randomCode(), requestId: rid() }, other.token),
      call("guess", { gameId: gid, guess: randomCode(), requestId: rid() }, holder.token),
    ]);
    const after = await call("state", { gameId: gid }, G.token);
    const added = after.guesses.slice(st.guesses.length);
    const accepted = shots.filter((r) => r.ok).length;
    if (added.length !== accepted) { bad("S13-diary", `ronda ${round}: ${accepted} aceptados, ${added.length} anotados`); broken = true; }
    if (added.length && added[0].by !== holder.name) { bad("S13-order", `ronda ${round}: el primer intento anotado no es del que tenia el turno`); broken = true; }
    if (added.length === 2 && added[1].by !== other.name) { bad("S13-alternate", `ronda ${round}: dos intentos seguidos del mismo jugador`); broken = true; }
    if (shots.some((r) => r.status !== 200)) { bad("S13-http", `ronda ${round}: un intento devolvio algo que no es 200`); broken = true; }
    mine += added.filter((g) => g.by === G.name).length; theirs += added.filter((g) => g.by === H2.name).length;
  }
  expect(!broken, "S13-rounds", `veinte rondas sin incoherencias (${mine} intentos de G, ${theirs} de H)`);
  expect(Math.abs(mine - theirs) <= 1, "S13-balance", `los turnos alternan (${mine} frente a ${theirs})`);
}

/* ---------- informe ---------- */
console.log(`\n${checks} comprobaciones, ${anomalies.length} anomalías`);
for (const a of anomalies) console.log(` - ${a.code}: ${a.detail}`);
await mf.dispose();
process.exit(anomalies.length ? 1 : 0);
