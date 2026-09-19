import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { seedAccount } from "./accounts.js";
import { cleanupDatabase } from "../src/maintenance.js";
import { savePushSubscription, sendTurnNotification, validPushSubscription } from "../src/push.js";

let mf;
let db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: "src/index.js",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
    compatibilityDate: "2026-08-02",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "00000000-0000-0000-0000-000000000012" },
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
  assert.equal(response.status, 200, `${action} returned HTTP ${response.status}`);
  return response.json();
}

async function player(username, lang = "es") {
  await seedAccount(db, username);
  const logged = await api("loginUser", { identifier: username, pin: "2468", lang });
  assert.equal(logged.ok, true, logged.error);
  return { username: logged.username, token: logged.sessionToken };
}

async function correspondenceGame(prefix, days = 1) {
  const a = await player(`${prefix}-A`, "fr");
  const b = await player(`${prefix}-B`, "en");
  const created = await api("createGame", {
    digits: 3, mode: "numbers", numColors: 10, allowRepeats: false,
    isPublic: false, maxAttempts: 0, timeMode: "correspondence",
    turnSeconds: days * 86400, secret: "012",
  }, a.token);
  assert.equal(created.ok, true, created.error);
  const joined = await api("joinGame", { gameId: created.gameId, secret: "345" }, b.token);
  assert.equal(joined.ok, true, joined.error);
  return { a, b, gameId: created.gameId };
}

test("la correspondencia admite uno o tres días y arranca sin esperar dos pantallas", async () => {
  for (const days of [1, 3]) {
    const { gameId } = await correspondenceGame(`Cadence${days}`, days);
    const row = await db.prepare("SELECT time_mode,turn_seconds,timer_activated,timer_paused,turn_started_at FROM games WHERE game_id=?")
      .bind(gameId).first();
    assert.equal(row.time_mode, "correspondence");
    assert.equal(row.turn_seconds, days * 86400);
    assert.equal(row.timer_activated, 1);
    assert.equal(row.timer_paused, 0);
    assert.ok(Number.isFinite(Date.parse(row.turn_started_at)));
  }
});

test("el reloj de correspondencia corre aunque el jugador vuelva al lobby", async () => {
  const { a, gameId } = await correspondenceGame("NoPause");
  const before = await db.prepare("SELECT version,turn_started_at FROM games WHERE game_id=?").bind(gameId).first();
  await api("gamePresence", { gameId, connected: false, reason: "lobby" }, a.token);
  const afterRow = await db.prepare("SELECT version,timer_paused,lobby_paused_by,turn_started_at FROM games WHERE game_id=?").bind(gameId).first();
  assert.equal(afterRow.version, before.version, "salir no reescribe el reloj por correspondencia");
  assert.equal(afterRow.timer_paused, 0);
  assert.equal(afterRow.lobby_paused_by, "");
  assert.equal(afterRow.turn_started_at, before.turn_started_at);
});

test("una partida privada espera 48 horas y la pública conserva el límite de 2 horas", async () => {
  const privatePlayer = await player("PrivateWait");
  const publicPlayer = await player("PublicWait");
  const create = async (owner, isPublic) => api("createGame", {
    digits: 3, mode: "numbers", numColors: 10, allowRepeats: false,
    isPublic, maxAttempts: 0, timeMode: "turn", turnSeconds: 0, secret: "012",
  }, owner.token);
  const privateGame = await create(privatePlayer, false);
  const publicGame = await create(publicPlayer, true);
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  await db.prepare("UPDATE games SET created_at=?,updated_at=? WHERE game_id IN (?,?)")
    .bind(threeHoursAgo, threeHoursAgo, privateGame.gameId, publicGame.gameId).run();
  assert.equal((await api("state", { gameId: privateGame.gameId }, privatePlayer.token)).status, "waiting");
  assert.equal((await api("inviteInfo", { gameId: privateGame.gameId })).ok, true);
  const expired = await api("state", { gameId: publicGame.gameId }, publicPlayer.token);
  assert.equal(expired.ok, false);
  assert.match(expired.error, /expirado/);
  const fortyNineHoursAgo = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
  await db.prepare("UPDATE games SET created_at=? WHERE game_id=?").bind(fortyNineHoursAgo, privateGame.gameId).run();
  assert.equal((await api("inviteInfo", { gameId: privateGame.gameId })).ok, false);
});

test("el mantenimiento no ferme pas la correspondencia à 48 h et passe un tour expiré", async () => {
  const { gameId } = await correspondenceGame("CronTurn");
  const original = await db.prepare("SELECT * FROM games WHERE game_id=?").bind(gameId).first();
  const old = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
  await db.prepare("UPDATE games SET updated_at=?,turn_started_at=? WHERE game_id=?").bind(old, old, gameId).run();
  const sent = [];
  const env = { EMAIL: { send: async (message) => sent.push(message) } };
  const at = Date.now();
  await cleanupDatabase(db, at, env);
  const updated = await db.prepare("SELECT * FROM games WHERE game_id=?").bind(gameId).first();
  assert.equal(updated.status, "active", "la regla de 48 h no barre la correspondencia");
  assert.notEqual(updated.turn, original.turn, "el Cron pasa el tour expiré");
  assert.equal(JSON.parse(updated.guesses).at(-1).reason, "timeout");
  assert.equal(sent.length, 1, "le nouveau joueur reçoit un seul avis");
  await cleanupDatabase(db, at, env);
  assert.equal(sent.length, 1, "rejouer le Cron ne double pas l'avis du même tour");
});

test("l'avis de tour est dédupliqué et le courrier reprend la langue du compte", async () => {
  const { gameId } = await correspondenceGame("NotifyOnce");
  const game = await db.prepare("SELECT * FROM games WHERE game_id=?").bind(gameId).first();
  const sent = [];
  const env = { EMAIL: { send: async (message) => sent.push(message) } };
  const first = await sendTurnNotification(db, env, game);
  const second = await sendTurnNotification(db, env, game);
  assert.equal(first.channel, "email");
  assert.equal(second.deduped, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, game.turn === 1 ? /À toi/ : /Your turn/);
});

test("une tentative arrivée après l'échéance passe le tour et prévient le joueur suivant", async () => {
  const { a, b, gameId } = await correspondenceGame("LateGuess");
  const game = await db.prepare("SELECT * FROM games WHERE game_id=?").bind(gameId).first();
  const current = game.turn === 1 ? a : b;
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  await db.prepare("UPDATE games SET turn_started_at=? WHERE game_id=?").bind(old, gameId).run();
  const response = await api("guess", { gameId, guess: "456", requestId: crypto.randomUUID() }, current.token);
  assert.equal(response.ok, false);
  assert.match(response.error, /tiempo/);
  const changed = await db.prepare("SELECT turn,version FROM games WHERE game_id=?").bind(gameId).first();
  assert.notEqual(changed.turn, game.turn);
  const receipt = await db.prepare("SELECT channel FROM turn_notifications WHERE game_id=? AND game_version=?")
    .bind(gameId, changed.version).first();
  assert.equal(receipt, null, "sans binding email le retry reste possible au lieu de marquer un faux envoi");
});

test("les abonnements push exigent une URL HTTPS et les deux clés", () => {
  assert.equal(validPushSubscription({ endpoint: "http://example.test", keys: {} }), false);
  assert.equal(validPushSubscription({ endpoint: "https://push.example.test/x", keys: { p256dh: "bad", auth: "bad" } }), false);
});

test("le payload Web Push est chiffré et signé VAPID sans dépendance", async () => {
  const { gameId } = await correspondenceGame("RealPush");
  const game = await db.prepare("SELECT * FROM games WHERE game_id=?").bind(gameId).first();
  const username = game.turn === 1 ? game.p1 : game.p2;
  const user = await db.prepare("SELECT id FROM users WHERE username=?").bind(username).first();
  const subscriptionPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const subscriptionPublic = new Uint8Array(await crypto.subtle.exportKey("raw", subscriptionPair.publicKey));
  const vapidPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const vapidPublic = new Uint8Array(await crypto.subtle.exportKey("raw", vapidPair.publicKey));
  const vapidPrivate = await crypto.subtle.exportKey("jwk", vapidPair.privateKey);
  const b64 = (value) => Buffer.from(value).toString("base64url");
  const subscription = {
    endpoint: "https://push.example.test/send/abc",
    keys: { p256dh: b64(subscriptionPublic), auth: b64(crypto.getRandomValues(new Uint8Array(16))) },
  };
  assert.equal((await savePushSubscription(db, user, subscription, "fr")).ok, true);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response("", { status: 201 }); };
  try {
    const result = await sendTurnNotification(db, {
      VAPID_PUBLIC: b64(vapidPublic), VAPID_PRIVATE: vapidPrivate.d,
      EMAIL: { send: async () => assert.fail("le push valide ne doit pas tomber sur l'email") },
    }, game);
    assert.equal(result.channel, "push");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls.length, 1);
  assert.match(calls[0].init.headers.Authorization, /^vapid t=.+, k=.+/);
  assert.equal(calls[0].init.headers["Content-Encoding"], "aes128gcm");
  assert.ok(calls[0].init.body.byteLength > 100);
});

test("le client et le service worker branchent le push sans passer par le polling", async () => {
  const [html, worker, source] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../src/index.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /pushManager\.subscribe/);
  assert.match(html, /api\('savePushSubscription'/);
  assert.match(worker, /addEventListener\('push'/);
  assert.match(source, /makeGuess\(env\.DB, params, auth\.user, notifyTurnChange\)/);
  assert.match(source, /passTurn\(env\.DB, params, auth\.user, notifyTurnChange\)/);
  assert.doesNotMatch(html.match(/async function refreshGame[\s\S]*?\n}/)?.[0] || "", /savePushSubscription|sendTurnNotification/);
});
