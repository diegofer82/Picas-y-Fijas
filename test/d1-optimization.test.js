import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { cleanupDatabase } from "../src/maintenance.js";

let mf;
let db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: "src/index.js",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
    compatibilityDate: "2026-08-02",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "00000000-0000-0000-0000-000000000003" },
    bindings: { SESSION_TTL_HOURS: "168", ADMIN_PATH: "/admin", DEBUG_ERRORS: "1" },
  });
  db = await mf.getD1Database("DB");
  for (const file of [
    "0001_initial.sql",
    "0002_chat.sql",
    "0003_private_threads.sql",
    "0004_admin_insight.sql",
    "0005_feedback.sql",
    "0006_time_bank.sql",
    "0007_d1_free_optimization.sql",
  ]) {
    const migration = await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8");
    for (const statement of migration.split(";").map((sql) => sql.trim()).filter(Boolean))
      await db.prepare(statement).run();
  }
});

after(async () => {
  await mf?.dispose();
});

async function api(action, payload = {}, token = "") {
  const response = await mf.dispatchFetch("http://localhost/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  assert.equal(response.status, 200, `${action} returned HTTP ${response.status}`);
  return response.json();
}

async function player(username) {
  const result = await api("loginUser", { username, pin: "2468" });
  assert.equal(result.ok, true, result.error);
  return { username: result.username, token: result.sessionToken };
}

async function timedGame(prefix, turnSeconds = 30) {
  const a = await player(`${prefix}-A`);
  const b = await player(`${prefix}-B`);
  const created = await api(
    "createGame",
    {
      digits: 4,
      mode: "numbers",
      numColors: 10,
      allowRepeats: false,
      isPublic: true,
      maxAttempts: 0,
      turnSeconds,
      secret: "0123",
    },
    a.token,
  );
  assert.equal(created.ok, true, created.error);
  const joined = await api(
    "joinGame",
    { gameId: created.gameId, secret: "4567" },
    b.token,
  );
  assert.equal(joined.ok, true, joined.error);
  await api("state", { gameId: created.gameId }, a.token);
  await api("state", { gameId: created.gameId }, b.token);
  return { a, b, gameId: created.gameId };
}

async function installUpdateProbes() {
  await db.prepare("DROP TABLE IF EXISTS write_probe").run();
  await db.prepare("CREATE TABLE write_probe(name TEXT PRIMARY KEY, updates INTEGER NOT NULL DEFAULT 0)").run();
  for (const name of ["presence", "sessions", "chat_threads"])
    await db.prepare("INSERT INTO write_probe(name) VALUES(?)").bind(name).run();
  await db.prepare("CREATE TRIGGER probe_presence AFTER UPDATE ON presence BEGIN UPDATE write_probe SET updates=updates+1 WHERE name='presence'; END").run();
  await db.prepare("CREATE TRIGGER probe_sessions AFTER UPDATE ON sessions BEGIN UPDATE write_probe SET updates=updates+1 WHERE name='sessions'; END").run();
  await db.prepare("CREATE TRIGGER probe_threads AFTER UPDATE ON chat_threads BEGIN UPDATE write_probe SET updates=updates+1 WHERE name='chat_threads'; END").run();
}

test("el polling estable no reescribe presencia, sesión ni hilo de chat", async () => {
  const { a, gameId } = await timedGame("NoWrite");
  const before = await db.prepare("SELECT version FROM games WHERE game_id=?").bind(gameId).first();
  const thread = await db.prepare("SELECT id FROM chat_threads WHERE latest_game_id=?").bind(gameId).first();
  await installUpdateProbes();

  for (let index = 0; index < 5; index++) {
    const state = await api("state", { gameId }, a.token);
    assert.equal(state.ok, true, state.error);
    const chat = await api("chatList", { roomType: "private", threadId: thread.id, after: 999999 }, a.token);
    assert.equal(chat.ok, true, chat.error);
  }

  const probes = await db.prepare("SELECT name,updates FROM write_probe ORDER BY name").all();
  assert.deepEqual(
    Object.fromEntries(probes.results.map((row) => [row.name, Number(row.updates)])),
    { chat_threads: 0, presence: 0, sessions: 0 },
  );
  const after = await db.prepare("SELECT version FROM games WHERE game_id=?").bind(gameId).first();
  assert.equal(after.version, before.version, "consultar no cambia la partida");
});

test("salir pausa el reloj por turno, repetir la salida es idempotente y volver conserva el tiempo", async () => {
  const { a, gameId } = await timedGame("ExitOne");
  await db.prepare(
    "UPDATE games SET turn_started_at=?,turn_remaining=30,timer_paused=0 WHERE game_id=?",
  ).bind(new Date(Date.now() - 10_000).toISOString(), gameId).run();

  const left = await api("gamePresence", { gameId, connected: false, reason: "lobby" }, a.token);
  assert.equal(left.ok, true, left.error);
  let row = await db.prepare(
    "SELECT version,lobby_paused_by,timer_paused,turn_remaining FROM games WHERE game_id=?",
  ).bind(gameId).first();
  assert.equal(row.timer_paused, 1);
  assert.deepEqual(JSON.parse(row.lobby_paused_by), [a.username]);
  assert.ok(row.turn_remaining >= 19 && row.turn_remaining <= 20);
  const pausedVersion = row.version;

  await api("gamePresence", { gameId, connected: false, reason: "lobby" }, a.token);
  row = await db.prepare("SELECT version FROM games WHERE game_id=?").bind(gameId).first();
  assert.equal(row.version, pausedVersion, "una señal duplicada no vuelve a escribir la partida");

  const returned = await api("state", { gameId }, a.token);
  assert.equal(returned.ok, true, returned.error);
  row = await db.prepare(
    "SELECT lobby_paused_by,timer_paused,turn_remaining,turn_started_at FROM games WHERE game_id=?",
  ).bind(gameId).first();
  assert.equal(row.lobby_paused_by, "");
  assert.equal(row.timer_paused, 0);
  assert.ok(row.turn_remaining >= 19 && row.turn_remaining <= 20, "no reinicia a 30 segundos");
  assert.ok(Number.isFinite(Date.parse(row.turn_started_at)));
});

test("si salen ambos, el reloj solo reanuda cuando ambos regresan", async () => {
  const { a, b, gameId } = await timedGame("ExitBoth");
  await api("gamePresence", { gameId, connected: false, reason: "lobby" }, a.token);
  await api("gamePresence", { gameId, connected: false, reason: "lobby" }, b.token);

  await api("state", { gameId }, a.token);
  let row = await db.prepare("SELECT lobby_paused_by,timer_paused FROM games WHERE game_id=?").bind(gameId).first();
  assert.deepEqual(JSON.parse(row.lobby_paused_by), [b.username]);
  assert.equal(row.timer_paused, 1, "el jugador que sigue fuera mantiene la pausa");

  await api("state", { gameId }, b.token);
  row = await db.prepare("SELECT lobby_paused_by,timer_paused,turn_started_at FROM games WHERE game_id=?").bind(gameId).first();
  assert.equal(row.lobby_paused_by, "");
  assert.equal(row.timer_paused, 0);
  assert.ok(Number.isFinite(Date.parse(row.turn_started_at)));
});

test("una pausa manual vencida y una salida se liberan juntas al regresar", async () => {
  const { a, gameId } = await timedGame("ExpiredPause");
  await db.prepare(
    "UPDATE games SET manual_paused_by=?,manual_pause_until=?,lobby_paused_by=?,timer_paused=1,turn_remaining=17,turn_started_at='' WHERE game_id=?",
  ).bind(
    a.username,
    new Date(Date.now() - 1_000).toISOString(),
    JSON.stringify([a.username]),
    gameId,
  ).run();

  await api("state", { gameId }, a.token);
  const row = await db.prepare(
    "SELECT manual_paused_by,lobby_paused_by,timer_paused,turn_remaining,turn_started_at FROM games WHERE game_id=?",
  ).bind(gameId).first();
  assert.equal(row.manual_paused_by, "");
  assert.equal(row.lobby_paused_by, "");
  assert.equal(row.timer_paused, 0);
  assert.equal(row.turn_remaining, 17);
  assert.ok(Number.isFinite(Date.parse(row.turn_started_at)));
});

test("el chat carga 100 recientes una vez y después solo mensajes posteriores al cursor", async () => {
  const a = await player("Cursor-A");
  const b = await player("Cursor-B");
  const created = await api("createGame", {
    digits: 3,
    mode: "numbers",
    numColors: 10,
    allowRepeats: false,
    isPublic: true,
    maxAttempts: 0,
    turnSeconds: 0,
    secret: "012",
  }, a.token);
  await api("joinGame", { gameId: created.gameId, secret: "345" }, b.token);
  const thread = await db.prepare("SELECT id FROM chat_threads WHERE latest_game_id=?").bind(created.gameId).first();
  const stamp = new Date().toISOString();
  for (let index = 0; index < 105; index++)
    await db.prepare(
      "INSERT INTO chat_messages(room_type,game_id,thread_id,sender,sender_key,kind,body,created_at) VALUES('game',?,?,?,?,'user',?,?)",
    ).bind(created.gameId, thread.id, a.username, a.username.toLowerCase(), `cursor-${index}`, stamp).run();

  const initial = await api("chatList", { roomType: "private", threadId: thread.id }, b.token);
  assert.equal(initial.messages.length, 100);
  assert.equal(initial.messages.at(-1).body, "cursor-104");
  const cursor = initial.messages.at(-1).id;

  for (let index = 105; index < 107; index++)
    await db.prepare(
      "INSERT INTO chat_messages(room_type,game_id,thread_id,sender,sender_key,kind,body,created_at) VALUES('game',?,?,?,?,'user',?,?)",
    ).bind(created.gameId, thread.id, a.username, a.username.toLowerCase(), `cursor-${index}`, stamp).run();
  const delta = await api("chatList", { roomType: "private", threadId: thread.id, after: cursor }, b.token);
  assert.deepEqual(delta.messages.map((message) => message.body), ["cursor-105", "cursor-106"]);
});

test("el mantenimiento horario elimina datos efímeros y expira partidas fuera del polling", async () => {
  const at = Date.parse("2026-08-25T12:00:00.000Z");
  const old = "2026-08-01T00:00:00.000Z";
  const recent = "2026-08-25T11:00:00.000Z";
  await db.prepare(
    "INSERT INTO request_receipts(request_id,username_key,game_id,response_json,created_at) VALUES('old-receipt','cleanup','X','{}',?)",
  ).bind(old).run();
  await db.prepare(
    "INSERT INTO request_receipts(request_id,username_key,game_id,response_json,created_at) VALUES('new-receipt','cleanup','X','{}',?)",
  ).bind(recent).run();
  await db.prepare(
    "INSERT INTO presence(username_key,username,location,last_seen_at) VALUES('stale-presence','Stale','lobby',?)",
  ).bind(old).run();
  await db.prepare(
    "INSERT INTO games(game_id,status,digits,p1,secret1,created_at,updated_at) VALUES('OLDWAIT','waiting',3,'Cleanup','012',?,?)",
  ).bind(old, old).run();
  await db.prepare(
    "INSERT INTO games(game_id,status,digits,p1,secret1,p2,secret2,turn,created_at,updated_at) VALUES('OLDACT','active',3,'Cleanup','012','Other','345',1,?,?)",
  ).bind(old, old).run();

  await cleanupDatabase(db, at);

  assert.equal(await db.prepare("SELECT 1 FROM request_receipts WHERE request_id='old-receipt'").first(), null);
  assert.ok(await db.prepare("SELECT 1 kept FROM request_receipts WHERE request_id='new-receipt'").first());
  assert.equal(await db.prepare("SELECT 1 FROM presence WHERE username_key='stale-presence'").first(), null);
  assert.equal((await db.prepare("SELECT status FROM games WHERE game_id='OLDWAIT'").first()).status, "expired");
  assert.equal((await db.prepare("SELECT status FROM games WHERE game_id='OLDACT'").first()).status, "inactive");
});

test("el cliente conserva mensajes y envía el cursor en cada polling", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /api\('chatList',\{\.\.\.room,after:chatLastId\}\)/);
  assert.match(html, /merged=new Map\(chatItems\.map/);
  assert.match(html, /privateThreadsFetchedAt<15000/);
  assert.match(html, /chatThreadId:gState\?\.chatThreadId\|\|0/);
});
