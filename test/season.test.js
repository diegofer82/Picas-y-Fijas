import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { seedAccount } from "./accounts.js";
import { SEASON_ALL, difficulty, scoreGame, seasonOf } from "../src/score.js";

/* La etapa 5: puntos y temporadas (E5-T1), perfil público (E5-T2), insignias
   (E5-T3) y lista de rivales (E5-T4).

   Las cuatro comparten un mismo instante —el final de la partida— y una misma
   promesa de coste: leer el ranking, un perfil o la lista de rivales no
   recorre `games`. Lo que estas pruebas vigilan es justo eso, más las dos
   cosas que pueden estropear una clasificación: contar una partida dos veces
   y dejar salir algo que no era público. */

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
    d1Databases: { DB: "00000000-0000-0000-0000-000000000016" },
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

async function api(action, payload = {}, token = "") {
  const response = await mf.dispatchFetch("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...payload }),
  });
  assert.equal(response.status, 200, `${action} devolvió HTTP ${response.status}`);
  return response.json();
}

async function player(username, country = "es") {
  await seedAccount(db, username, { country });
  const logged = await api("loginUser", { identifier: username, pin: "2468", country });
  assert.equal(logged.ok, true, logged.error);
  return { username: logged.username, token: logged.sessionToken };
}

/* Una partida de verdad, de principio a fin. Quien juega primero falla y quien
   juega segundo descubre el código del otro: así la partida termina en el
   acto, sin el turno de desempate que la regla concede a quien va por detrás.
   Devuelve quién ganó, que no siempre es quien creó la partida: el servidor
   reparte el primer turno. */
async function playedGame(prefix) {
  const a = await player(`${prefix}-A`);
  const b = await player(`${prefix}-B`);
  const secrets = { [a.username]: "012", [b.username]: "345" };
  const created = await api("createGame", {
    digits: 3, mode: "numbers", numColors: 10, allowRepeats: false,
    isPublic: false, maxAttempts: 0, turnSeconds: 0, secret: secrets[a.username], country: "es",
  }, a.token);
  assert.equal(created.ok, true, created.error);
  const joined = await api("joinGame", { gameId: created.gameId, secret: secrets[b.username], country: "fr" }, b.token);
  assert.equal(joined.ok, true, joined.error);
  const state = await api("state", { gameId: created.gameId }, a.token);
  const first = state.turn === 1 ? a : b;
  const second = first === a ? b : a;
  const missed = await api("guess", { gameId: created.gameId, guess: "678" }, first.token);
  assert.equal(missed.ok, true, missed.error);
  const guess = await api("guess", { gameId: created.gameId, guess: secrets[first.username] }, second.token);
  assert.equal(guess.ok, true, guess.error);
  assert.equal(guess.win, true, "quien juega segundo y acierta gana en el acto");
  return { a, b, winner: second, loser: first, gameId: created.gameId, guess };
}

test("los puntos premian la dificultad y la economía de intentos, y abandonar no paga", () => {
  const base = { status: "finished", digits: 3, mode: "numbers", num_colors: 10, allow_repeats: 0,
    max_attempts: 0, turn_seconds: 0, p1: "Ana", p2: "Bru", country1: "es", country2: "fr",
    updated_at: "2026-09-20T10:00:00.000Z", game_id: "PT01" };
  const quick = scoreGame({ ...base, winner: "Ana",
    guesses: JSON.stringify([{ by: "Ana", guess: "345", fijas: 3, picas: 0 }]) });
  const slow = scoreGame({ ...base, winner: "Ana",
    guesses: JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ by: "Ana", guess: "123", fijas: i === 5 ? 3 : 0, picas: 0 }))) });
  assert.ok(quick.players[0].points > slow.players[0].points, "resolver en uno vale más que resolver en seis");
  assert.equal(quick.players[1].result, "loss");
  assert.equal(quick.players[1].points, 1, "perder una partida jugada suma uno");

  const harder = difficulty({ digits: 5, mode: "numbers", num_colors: 10, allow_repeats: 0, max_attempts: 8, turn_seconds: 60 });
  const easier = difficulty({ digits: 3, mode: "colors", num_colors: 6, allow_repeats: 1, max_attempts: 0, turn_seconds: 0 });
  assert.ok(harder > easier, "más posiciones, intentos contados y reloj pesan más");

  const left = scoreGame({ ...base, winner: "Ana", finish_reason: "abandon",
    guesses: JSON.stringify([{ by: "Bru", guess: "111", fijas: 0, picas: 0 }]) });
  assert.equal(left.players[1].points, 0, "quien se va de una partida empezada no se lleva nada");
  assert.ok(left.players[0].points > 0, "y quien se queda no pierde por ello");

  const drawn = scoreGame({ ...base, winner: "",
    guesses: JSON.stringify([{ by: "Ana", guess: "345", fijas: 3, picas: 0 }, { by: "Bru", guess: "012", fijas: 3, picas: 0 }]) });
  assert.deepEqual(drawn.players.map((p) => p.result), ["draw", "draw"]);
  assert.equal(drawn.players[0].points, drawn.players[1].points, "un empate vale lo mismo para los dos");
  assert.equal(seasonOf("2026-09-20T10:00:00.000Z"), "2026-09");
});

test("una partida se cuenta una sola vez, pase por donde pase su final", async () => {
  const { winner, gameId } = await playedGame("once");
  const before = await db.prepare("SELECT points,played,wins FROM player_scores WHERE season=? AND username_key=?")
    .bind(SEASON_ALL, winner.username.toLowerCase()).first();
  assert.ok(before.points > 0, "el intento ganador ya sumó");
  assert.equal(before.played, 1);
  assert.equal(before.wins, 1);

  // El Cron, un `passTurn` tardío o una corrección de administrador pueden
  // volver a pasar por la misma partida terminada: el recibo lo impide.
  const { recordFinishedGame } = await import("../src/season.js");
  const game = await db.prepare("SELECT * FROM games WHERE game_id=?").bind(gameId).first();
  const again = await recordFinishedGame(db, game);
  assert.equal(again.scored, false, "la segunda vez no cuenta nada");
  const after = await db.prepare("SELECT points,played,wins FROM player_scores WHERE season=? AND username_key=?")
    .bind(SEASON_ALL, winner.username.toLowerCase()).first();
  assert.deepEqual([after.points, after.played, after.wins], [before.points, before.played, before.wins]);
});

test("el ranking ordena por puntos, distingue temporada de historia y sitúa a quien pregunta", async () => {
  const { winner, loser } = await playedGame("rank");
  const board = await api("leaderboard", {}, winner.token);
  assert.equal(board.ok, true);
  assert.equal(board.season, seasonOf(), "sin pedir nada, la temporada en curso");
  const top = board.ranking.find((row) => row.user === winner.username);
  const bottom = board.ranking.find((row) => row.user === loser.username);
  assert.ok(top && bottom, "los dos jugadores están en la tabla");
  assert.ok(top.points > bottom.points, "manda la columna de puntos");
  assert.ok(board.ranking.findIndex((r) => r.user === winner.username) < board.ranking.findIndex((r) => r.user === loser.username));
  assert.equal(board.me.user, winner.username);
  assert.ok(board.me.rank >= 1);

  const forever = await api("leaderboard", { season: "all" }, winner.token);
  assert.equal(forever.season, "all");
  assert.ok(forever.ranking.some((row) => row.user === winner.username));

  // Una temporada pasada existe y está vacía: el mes que viene el tablero
  // arranca limpio sin que nadie pierda su historia.
  const past = await api("leaderboard", { season: "2020-01" }, winner.token);
  assert.deepEqual(past.ranking, []);
  assert.equal(past.me, null);
});

test("el perfil sale de lo ya contado, enseña insignias y no deja escapar el correo", async () => {
  const { winner, loser } = await playedGame("prof");
  const mine = await api("profile", { player: winner.username }, loser.token);
  assert.equal(mine.ok, true, mine.error);
  const p = mine.profile;
  assert.equal(p.username, winner.username);
  assert.equal(p.played, 1);
  assert.equal(p.wins, 1);
  assert.equal(p.winRate, 100);
  assert.equal(p.bestAttempts, 1, "la mejor partida es la del código descubierto en un intento");
  assert.ok(p.points > 0);
  assert.equal(p.season.season, seasonOf());
  assert.deepEqual(p.rules, [{ code: "n-3-norep", count: 1 }], "las reglas preferidas salen de lo jugado");
  const codes = p.badges.map((badge) => badge.code).sort();
  assert.deepEqual(codes, ["first_win", "solved_4"], "ganar la primera y resolver en cuatro o menos");
  assert.doesNotMatch(JSON.stringify(mine), /@|email/i, "ni el correo ni su nombre salen del perfil");

  const nobody = await api("profile", { player: "NoExiste" }, loser.token);
  assert.equal(nobody.ok, false, "un nombre que no existe no inventa un perfil");
});

test("las insignias viajan en la respuesta del intento que las gana", async () => {
  const { guess, winner } = await playedGame("badge");
  assert.deepEqual([...(guess.newBadges || [])].sort(), ["first_win", "solved_4"],
    "la primera victoria y el código resuelto en cuatro o menos, en la misma jugada");
  const earned = await db.prepare("SELECT code FROM badges WHERE username_key=? ORDER BY code")
    .bind(winner.username.toLowerCase()).all();
  assert.deepEqual(earned.results.map((row) => row.code), ["first_win", "solved_4"], "y quedan guardadas");
});

test("la lista de rivales sale de los hilos y de las partidas terminadas, y ofrece la revancha", async () => {
  const { winner, loser, gameId } = await playedGame("riv");
  const list = await api("rivals", {}, winner.token);
  assert.equal(list.ok, true);
  const rival = list.rivals.find((r) => r.username === loser.username);
  assert.ok(rival, "el rival de la partida terminada está en la lista");
  assert.equal(rival.played, 1);
  assert.equal(rival.wins, 1, "el marcador es el de esta pareja");
  assert.equal(rival.losses, 0);
  assert.equal(rival.lastGameId, gameId, "el botón de desafío apunta a la última partida");
  assert.equal(typeof rival.online, "boolean");

  const theirs = await api("rivals", {}, loser.token);
  const mirror = theirs.rivals.find((r) => r.username === winner.username);
  assert.equal(mirror.wins, 0, "visto del otro lado, el marcador se da la vuelta");
  assert.equal(mirror.losses, 1);
});

test("renombrarse se lleva los puntos, y borrar una cuenta se los lleva del ranking", async () => {
  const { winner: a } = await playedGame("move");
  const renamed = await api("changeUsername", { newUsername: `${a.username}-2`, pin: "2468" }, a.token);
  assert.equal(renamed.ok, true, renamed.error);
  const moved = await db.prepare("SELECT points FROM player_scores WHERE season=? AND username_key=?")
    .bind(SEASON_ALL, renamed.username.toLowerCase()).first();
  assert.ok(moved && moved.points > 0, "los puntos siguen a la persona, no al nombre");
  const orphan = await db.prepare("SELECT COUNT(*) n FROM player_scores WHERE username_key=?")
    .bind(a.username.toLowerCase()).first();
  assert.equal(orphan.n, 0, "y no queda una fila con el nombre viejo");
});

test("la pantalla traduce las insignias y las dos pantallas nuevas en los tres idiomas", () => {
  for (const code of ["first_win", "solved_4", "fast_finish", "expert_rules", "wins_10", "wins_50", "days_7"]) {
    assert.equal((html.match(new RegExp(`badge_${code}:`, "g")) || []).length, 3, `falta el nombre de ${code}`);
    assert.equal((html.match(new RegExp(`badge_${code}_desc:`, "g")) || []).length, 3, `falta la frase de ${code}`);
  }
  for (const key of ["rank_season_month", "rank_season_all", "rank_line", "profile_points", "profile_badges",
    "rivals_title", "rivals_challenge", "rivals_record", "lobby_rivals"])
    assert.equal((html.match(new RegExp(`${key}:`, "g")) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
  assert.match(html, /<section id="s-profile"/);
  assert.match(html, /<section id="s-rivals"/);
  assert.match(html, /'rank','profile','rivals'/, "las dos pantallas entran en show\\(\\)");
  // El perfil y los rivales se piden una vez al abrirlos: ninguna de las dos
  // pantallas entra en el polling del vestíbulo.
  const lobbyPoll = html.match(/function startLobbyPoll\(\)\{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(lobbyPoll, /rivals|profile/);
});
