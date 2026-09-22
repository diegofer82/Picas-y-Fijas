/* -------------------- temporadas, perfiles, insignias y rivales --------------
   (E5-T1, E5-T2, E5-T3, E5-T4)

   Todo lo de esta etapa comparte un mismo momento: el instante en que una
   partida termina. Ahi, y solo ahi, se suman los puntos, se mueven las rachas
   y se ganan las insignias. Lo demas —el ranking, el perfil, la lista de
   rivales— son lecturas de lo que ese instante dejo escrito.

   Es una decision de coste, no de estilo. Un perfil que se calculara al
   abrirlo tendria que recorrer todas las partidas de esa persona, y un perfil
   es justo lo que la gente abre por curiosidad, muchas veces seguidas. Con
   esta forma, abrir un perfil son cuatro lecturas por clave; contar una
   partida, cinco escrituras. El plan gratuito de D1 da cinco millones de
   lecturas y cien mil escrituras al dia. */
import { bankRemaining, cleanCountry, isBankGame, toInt, usernameKey } from "./game.js";
import { SEASON_ALL, scoreGame, seasonOf } from "./score.js";

const now = () => new Date().toISOString();
const dayOf = (iso) => String(iso || now()).slice(0, 10);
const RULES_KEPT = 8;

/* Las insignias. Cada una es una frase corta que alguien puede querer contar,
   y ninguna depende de jugar mucho: se ganan por como se juega, no por
   cuanto. Los codigos no se traducen aqui —la pantalla los traduce a los tres
   idiomas—, porque el servidor no sabe en que lengua se va a leer. */
export const BADGES = Object.freeze([
  "first_win",
  "solved_4",
  "fast_finish",
  "expert_rules",
  "wins_10",
  "wins_50",
  "days_7",
]);

function badgesFor(detail, player, game, totals, progress) {
  const earned = [];
  const add = (code, value = "") => earned.push({ code, detail: String(value) });
  if (player.result === "win") {
    if (totals.wins === 1) add("first_win");
    if (totals.wins === 10) add("wins_10");
    if (totals.wins === 50) add("wins_50");
    if (player.solved && player.attempts > 0 && player.attempts <= 4) add("solved_4", player.attempts);
    // "Ganada con cinco segundos": solo cuenta si el codigo se descubrio con el
    // reloj corriendo. Ganar porque al rival se le acabo el tiempo no es eso.
    if (player.solved && detail.reason !== "abandon" && detail.reason !== "timeout") {
      const left = isBankGame(game)
        ? bankRemaining(game, game.p1 === player.username ? 1 : 2)
        : toInt(game.turn_seconds) > 0
          ? toInt(game.turn_remaining)
          : -1;
      if (left >= 0 && left <= 5) add("fast_finish", left);
    }
    if (player.solved && player.difficulty >= 12) add("expert_rules", player.difficulty);
  }
  if (progress.day_streak >= 7) add("days_7", progress.day_streak);
  return earned;
}

function mergeRules(rulesJson, key) {
  let rules = {};
  try {
    const parsed = JSON.parse(rulesJson || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) rules = parsed;
  } catch {
    rules = {};
  }
  rules[key] = (toInt(rules[key]) || 0) + 1;
  // Solo se guardan las ocho combinaciones mas jugadas: la columna no puede
  // crecer sin freno por una fila que se reescribe en cada partida.
  const kept = Object.entries(rules)
    .sort((a, b) => b[1] - a[1])
    .slice(0, RULES_KEPT);
  return JSON.stringify(Object.fromEntries(kept));
}

async function bumpProgress(db, player, game) {
  const key = usernameKey(player.username);
  const day = dayOf(game.updated_at);
  const row =
    (await db.prepare("SELECT * FROM player_progress WHERE username_key=?").bind(key).first()) || {
      username_key: key,
      username: player.username,
      last_play_day: "",
      day_streak: 0,
      best_day_streak: 0,
      win_streak: 0,
      best_win_streak: 0,
    };
  let dayStreak = toInt(row.day_streak);
  if (row.last_play_day !== day) {
    const previous = new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    dayStreak = row.last_play_day === previous ? dayStreak + 1 : 1;
  }
  const winStreak = player.result === "win" ? toInt(row.win_streak) + 1 : 0;
  const progress = {
    username_key: key,
    username: player.username,
    last_play_day: day,
    day_streak: dayStreak,
    best_day_streak: Math.max(toInt(row.best_day_streak), dayStreak),
    win_streak: winStreak,
    best_win_streak: Math.max(toInt(row.best_win_streak), winStreak),
    updated_at: now(),
  };
  await db
    .prepare(
      `INSERT INTO player_progress(username_key,username,last_play_day,day_streak,best_day_streak,win_streak,best_win_streak,updated_at)
       VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(username_key) DO UPDATE SET username=excluded.username,last_play_day=excluded.last_play_day,
         day_streak=excluded.day_streak,best_day_streak=excluded.best_day_streak,win_streak=excluded.win_streak,
         best_win_streak=excluded.best_win_streak,updated_at=excluded.updated_at`,
    )
    .bind(
      progress.username_key,
      progress.username,
      progress.last_play_day,
      progress.day_streak,
      progress.best_day_streak,
      progress.win_streak,
      progress.best_win_streak,
      progress.updated_at,
    )
    .run();
  return progress;
}

async function addPoints(db, season, player, detail, game) {
  const key = usernameKey(player.username);
  const row = await db
    .prepare("SELECT * FROM player_scores WHERE season=? AND username_key=?")
    .bind(season, key)
    .first();
  const bestAttempts = toInt(row?.best_attempts);
  const improved = player.result === "win" && player.solved && player.attempts > 0 && (!bestAttempts || player.attempts < bestAttempts);
  const next = {
    points: toInt(row?.points) + player.points,
    played: toInt(row?.played) + 1,
    wins: toInt(row?.wins) + (player.result === "win" ? 1 : 0),
    losses: toInt(row?.losses) + (player.result === "loss" ? 1 : 0),
    draws: toInt(row?.draws) + (player.result === "draw" ? 1 : 0),
    bestAttempts: improved ? player.attempts : bestAttempts,
    bestGameId: improved ? game.game_id : row?.best_game_id || "",
    rules: mergeRules(row?.rules_json, detail.rules),
  };
  await db
    .prepare(
      `INSERT INTO player_scores(season,username_key,username,country,points,played,wins,losses,draws,
         best_attempts,best_game_id,rules_json,first_played_at,last_played_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(season,username_key) DO UPDATE SET username=excluded.username,
         country=CASE WHEN excluded.country<>'' THEN excluded.country ELSE player_scores.country END,
         points=excluded.points,played=excluded.played,wins=excluded.wins,losses=excluded.losses,draws=excluded.draws,
         best_attempts=excluded.best_attempts,best_game_id=excluded.best_game_id,rules_json=excluded.rules_json,
         last_played_at=excluded.last_played_at`,
    )
    .bind(
      season,
      key,
      player.username,
      cleanCountry(player.country),
      next.points,
      next.played,
      next.wins,
      next.losses,
      next.draws,
      next.bestAttempts,
      next.bestGameId,
      next.rules,
      row?.first_played_at || game.updated_at || now(),
      game.updated_at || now(),
    )
    .run();
  return next;
}

/* El unico camino por el que una partida entra en la cuenta. Lo llaman los
   cuatro finales —el intento ganador, la bandera caida, el abandono y el
   Cron— y la correccion de un administrador. El recibo en `game_scores` es
   quien decide: si ya existe, esta partida ya se conto y aqui no pasa nada. */
export async function recordFinishedGame(db, game) {
  const detail = scoreGame(game);
  if (!detail) return { ok: true, scored: false };
  const receipt = await db
    .prepare("INSERT OR IGNORE INTO game_scores(game_id,season,detail_json,created_at) VALUES(?,?,?,?)")
    .bind(detail.gameId, detail.season, JSON.stringify(detail), now())
    .run();
  if (Number(receipt.meta?.changes) !== 1) return { ok: true, scored: false };
  const earned = {};
  for (const player of detail.players) {
    const totals = await addPoints(db, SEASON_ALL, player, detail, game);
    await addPoints(db, detail.season, player, detail, game);
    const progress = await bumpProgress(db, player, game);
    const badges = badgesFor(detail, player, game, totals, progress);
    const fresh = [];
    for (const badge of badges) {
      const written = await db
        .prepare("INSERT OR IGNORE INTO badges(username_key,code,earned_at,game_id,detail) VALUES(?,?,?,?,?)")
        .bind(usernameKey(player.username), badge.code, now(), game.game_id, badge.detail)
        .run();
      if (Number(written.meta?.changes) === 1) fresh.push(badge.code);
    }
    if (fresh.length) earned[player.username] = fresh;
  }
  return { ok: true, scored: true, season: detail.season, detail, badges: earned };
}

const boardRow = (row, rank) => ({
  rank,
  user: row.username,
  country: row.country || "",
  points: toInt(row.points),
  wins: toInt(row.wins),
  played: toInt(row.played),
});

/* El ranking. La respuesta cambia de forma respecto a la 3.9.1: cada fila
   lleva `points` y la lista viene ordenada por puntos. `wins` y `played`
   siguen ahi, porque la pantalla los sigue enseñando, y la peticion elige
   temporada: el mes en curso o la historia entera.

   Con `meOnly`, solo la fila propia y su puesto: es lo que pinta el saludo del
   vestibulo (4.4.0), que no necesita el Top 50 ni el total. Dos lecturas por
   clave e indice, una vez al entrar al vestibulo y nunca en su sondeo. */
export async function leaderboard(db, username, params = {}) {
  const requested = String(params.season || "").trim();
  const season = requested === SEASON_ALL ? SEASON_ALL : requested && /^\d{4}-\d{2}$/.test(requested) ? requested : seasonOf();
  const meOnly = Boolean(params.meOnly);
  const results = meOnly ? [] : (await db
    .prepare(
      `SELECT username,country,points,wins,played FROM player_scores
       WHERE season=? AND played>0 ORDER BY points DESC,wins DESC,played ASC LIMIT 50`,
    )
    .bind(season)
    .all()).results;
  const key = usernameKey(username);
  const total = meOnly ? null : await db
    .prepare("SELECT COUNT(*) n FROM player_scores WHERE season=? AND played>0")
    .bind(season)
    .first();
  const mine = await db
    .prepare("SELECT username,country,points,wins,played FROM player_scores WHERE season=? AND username_key=?")
    .bind(season, key)
    .first();
  let me = null;
  if (mine) {
    const ahead = await db
      .prepare(
        `SELECT COUNT(*) n FROM player_scores WHERE season=? AND played>0
           AND (points>? OR (points=? AND wins>?) OR (points=? AND wins=? AND played<?))`,
      )
      .bind(season, mine.points, mine.points, mine.wins, mine.points, mine.wins, mine.played)
      .first();
    me = boardRow(mine, toInt(ahead?.n) + 1);
  }
  if (meOnly) return { ok: true, season, me };
  return {
    ok: true,
    season,
    seasons: { current: seasonOf(), all: SEASON_ALL },
    ranking: results.map((row, index) => boardRow(row, index + 1)),
    total: toInt(total?.n),
    me,
  };
}

/* El perfil publico (E5-T2). Solo lo que ya era publico: el nombre, la
   bandera, lo que ha ganado y las insignias. El correo no sale de aqui, y
   tampoco la ultima conexion ni el pais de una IP: la bandera es la que el
   jugador eligio al crear sus partidas, que es la que todo el mundo ve ya en
   el ranking y en el chat. */
export async function profile(db, params, user) {
  // `authenticate` pisa `params.username` con el nombre de la sesion, asi que
  // el jugador que se quiere mirar viaja en su propio campo.
  const name = String(params.player || user.username);
  const key = usernameKey(name);
  if (!key) return { ok: false, error: "Jugador no encontrado." };
  const all = await db
    .prepare("SELECT * FROM player_scores WHERE season=? AND username_key=?")
    .bind(SEASON_ALL, key)
    .first();
  const account = await db
    .prepare("SELECT username,created_at FROM users WHERE username_key=?")
    .bind(key)
    .first();
  if (!all && !account) return { ok: false, error: "Jugador no encontrado." };
  const season = seasonOf();
  const current = await db
    .prepare("SELECT * FROM player_scores WHERE season=? AND username_key=?")
    .bind(season, key)
    .first();
  const progress = await db.prepare("SELECT * FROM player_progress WHERE username_key=?").bind(key).first();
  const { results: badgeRows } = await db
    .prepare("SELECT code,earned_at,detail FROM badges WHERE username_key=? ORDER BY earned_at DESC")
    .bind(key)
    .all();
  let rules = [];
  try {
    rules = Object.entries(JSON.parse(all?.rules_json || "{}"))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([code, count]) => ({ code, count: toInt(count) }));
  } catch {
    rules = [];
  }
  const played = toInt(all?.played);
  return {
    ok: true,
    profile: {
      username: all?.username || account?.username || name,
      country: all?.country || "",
      since: account?.created_at || all?.first_played_at || "",
      lastPlayedAt: all?.last_played_at || "",
      points: toInt(all?.points),
      played,
      wins: toInt(all?.wins),
      losses: toInt(all?.losses),
      draws: toInt(all?.draws),
      winRate: played ? Math.round((toInt(all?.wins) / played) * 100) : 0,
      bestAttempts: toInt(all?.best_attempts),
      bestGameId: all?.best_game_id || "",
      rules,
      season: { season, points: toInt(current?.points), played: toInt(current?.played), wins: toInt(current?.wins) },
      streaks: {
        days: toInt(progress?.day_streak),
        bestDays: toInt(progress?.best_day_streak),
        wins: toInt(progress?.win_streak),
        bestWins: toInt(progress?.best_win_streak),
      },
      badges: badgeRows.map((row) => ({ code: row.code, earnedAt: row.earned_at, detail: row.detail || "" })),
    },
  };
}

/* La lista de rivales (E5-T4). Sin tabla nueva: los pares salen de
   `chat_threads`, que ya guarda un hilo por pareja desde la 2.x, y el
   marcador de cada uno, de las partidas terminadas entre los dos. La consulta
   de marcadores es una sola y se apoya en los indices por `p1` y `p2` que
   existen desde la primera migracion. El punto de presencia es el mismo de
   siempre: dos minutos. */
export async function rivals(db, user) {
  const { results: threads } = await db
    .prepare(
      `SELECT id,user1,user1_key,user2,user2_key,last_game_at,last_message_at,latest_game_id
         FROM chat_threads WHERE user1_key=? OR user2_key=?
         ORDER BY CASE WHEN last_message_at IS NOT NULL AND last_message_at>last_game_at
           THEN last_message_at ELSE last_game_at END DESC LIMIT 30`,
    )
    .bind(user.username_key, user.username_key)
    .all();
  if (!threads.length) return { ok: true, rivals: [] };
  const { results: scores } = await db
    .prepare(
      `SELECT opponent,SUM(mine) wins,SUM(theirs) losses,COUNT(*) played,MAX(updated_at) last_at FROM (
         SELECT p2 opponent,CASE WHEN winner=p1 THEN 1 ELSE 0 END mine,CASE WHEN winner=p2 THEN 1 ELSE 0 END theirs,updated_at
           FROM games WHERE p1=? AND status='finished' AND p2<>''
         UNION ALL
         SELECT p1,CASE WHEN winner=p2 THEN 1 ELSE 0 END,CASE WHEN winner=p1 THEN 1 ELSE 0 END,updated_at
           FROM games WHERE p2=? AND status='finished'
       ) GROUP BY opponent`,
    )
    .bind(user.username, user.username)
    .all();
  const byName = new Map(scores.map((row) => [usernameKey(row.opponent), row]));
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { results: online } = await db
    .prepare("SELECT username_key FROM presence WHERE last_seen_at>=?")
    .bind(cutoff)
    .all();
  const connected = new Set(online.map((row) => row.username_key));
  const list = threads
    .map((thread) => {
      const mine = thread.user1_key === user.username_key;
      const opponent = mine ? thread.user2 : thread.user1;
      const key = mine ? thread.user2_key : thread.user1_key;
      const score = byName.get(key);
      return {
        username: opponent,
        threadId: Number(thread.id),
        lastGameId: thread.latest_game_id || "",
        lastPlayedAt: score?.last_at || thread.last_game_at || "",
        played: toInt(score?.played),
        wins: toInt(score?.wins),
        losses: toInt(score?.losses),
        online: connected.has(key),
      };
    })
    .filter((rival) => rival.username);
  list.sort(
    (a, b) => Number(b.online) - Number(a.online) || String(b.lastPlayedAt).localeCompare(String(a.lastPlayedAt)),
  );
  return { ok: true, rivals: list };
}
