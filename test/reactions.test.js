import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { seedAccount } from "./accounts.js";
import { CHAT, REACTIONS, reactionBody } from "../src/chat.js";

/* E6-T2, las reacciones rápidas.

   Cuatro frases hechas para quien juega desde el teléfono y no va a escribir.
   Lo que estas pruebas vigilan es que no abran ninguna puerta nueva: viajan
   por `chat_messages` con un tipo que ya existía, lo que se guarda es la
   clave y no un texto —así no hay nada que traducir ni que moderar—, y
   respetan la misma espera que el zumbido. */

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
    d1Databases: { DB: "00000000-0000-0000-0000-000000000018" },
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

async function pairGame(prefix) {
  const a = await player(prefix + "-A");
  const b = await player(prefix + "-B");
  const created = await api("createGame", {
    digits: 3, mode: "numbers", numColors: 10, allowRepeats: false,
    isPublic: true, maxAttempts: 0, turnSeconds: 0, secret: "012", country: "es",
  }, a.token);
  assert.equal(created.ok, true, created.error);
  const joined = await api("joinGame", { gameId: created.gameId, secret: "345", country: "fr" }, b.token);
  assert.equal(joined.ok, true, joined.error);
  return { a, b, gameId: created.gameId };
}

test("una reacción guarda la clave, no la frase, y la lee quien juega enfrente", async () => {
  const { a, b, gameId } = await pairGame("react");
  const sent = await api("chatReact", { roomType: "game", gameId, reaction: "gg" }, a.token);
  assert.equal(sent.ok, true, sent.error);
  assert.equal(sent.message.body, reactionBody("gg", a.username));
  assert.equal(sent.message.kind, "system");
  assert.equal(sent.message.sender, a.username);
  const seen = await api("chatList", { roomType: "game", gameId }, b.token);
  const reaction = seen.messages.find((m) => m.body === reactionBody("gg", a.username));
  assert.ok(reaction, "el rival la recibe por el mismo canal que el resto del chat");
  // Ni una palabra en ningún idioma: el servidor no sabe en cuál se leerá.
  for (const phrase of ["Buena partida", "Good game", "Belle partie"])
    assert.equal(JSON.stringify(seen.messages).includes(phrase), false);
});

test("solo existen las cuatro, y una inventada se rechaza", async () => {
  const { a, gameId } = await pairGame("react-set");
  assert.deepEqual([...REACTIONS], ["luck", "close", "wow", "gg"]);
  const bogus = await api("chatReact", { roomType: "game", gameId, reaction: "insulto" }, a.token);
  assert.equal(bogus.ok, false);
  assert.match(bogus.error, /no existe/);
  const free = await api("chatReact", { roomType: "game", gameId, reaction: "<b>hola</b>" }, a.token);
  assert.equal(free.ok, false, "no hay manera de colar texto libre por esta vía");
});

test("las reacciones respetan la espera del zumbido y el silencio de un administrador", async () => {
  const { a, gameId } = await pairGame("react-wait");
  const first = await api("chatReact", { roomType: "game", gameId, reaction: "luck" }, a.token);
  assert.equal(first.ok, true, first.error);
  const second = await api("chatReact", { roomType: "game", gameId, reaction: "wow" }, a.token);
  assert.equal(second.ok, false);
  assert.match(second.error, /30 segundos/);
  assert.equal(CHAT.nudgeCooldownMs, 30000, "es la misma espera, no una nueva");

  const muted = await pairGame("react-mute");
  await db.prepare("INSERT INTO chat_mutes(username_key,muted_until,created_by,created_at) VALUES(?,?,?,?)")
    .bind(muted.a.username.toLowerCase(), null, "Diego", new Date().toISOString()).run();
  const refused = await api("chatReact", { roomType: "game", gameId: muted.gameId, reaction: "gg" }, muted.a.token);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /silenciado/);
});

test("el lobby no tiene reacciones: son cosa de la pareja que juega", async () => {
  const { a } = await pairGame("react-lobby");
  const lobby = await api("chatReact", { roomType: "lobby", reaction: "gg" }, a.token);
  assert.equal(lobby.ok, false);
  assert.match(lobby.error, /privadas/);
});

test("la pantalla ofrece las cuatro en los tres idiomas y las pinta aparte", () => {
  assert.match(html, /id="chat-reactions"/);
  assert.match(html, /const REACTIONS=\[\['luck','🍀'\],\['close','😮'\],\['wow','👏'\],\['gg','🤝'\]\];/);
  assert.match(html, /function isReaction\(m\)\{return m\.kind==='system'&&\/\^react_\/\.test\(String\(m\.body\|\|''\)\);\}/);
  for (const key of ["react_luck", "react_close", "react_wow", "react_gg", "react_short_luck", "react_short_gg"])
    assert.equal((html.match(new RegExp(key + ":", "g")) || []).length, 3, key + " debe existir en los tres idiomas");
  // Quien silencia a alguien deja de ver también sus reacciones.
  assert.match(html, /visible=chatItems\.filter\(m=>\(m\.kind==='system'&&!isReaction\(m\)\)\|\|!muted\.has\(chatUserKey\(m\.sender\)\)\)/);
});
