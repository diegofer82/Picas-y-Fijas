// Herramientas de administracion que van mas alla de consultar y bloquear:
// ficha de usuario, borrado de cuentas, limpieza de partidas y una consola SQL
// con barandillas. Viven aparte de `index.js` porque son operaciones de
// mantenimiento, no del juego, y porque cada una necesita mas cuidado que una
// consulta suelta.
import { LIMITS, toInt, usernameKey } from "./game.js";
import { pinThrottleKey } from "./security.js";
import { rankPlayers } from "./arena.js";
import { SEASON_ALL, seasonOf } from "./score.js";

const now = () => new Date().toISOString();
const KEY_DIEGO = "diego";

const USER_COLUMNS = `u.id,u.username,u.username_key,u.role,u.blocked_at,u.created_at,u.last_login_at,
  u.last_ip,u.last_country,u.signup_ip,u.signup_country,u.login_count`;

export async function adminUsers(db) {
  const presenceCutoff = new Date(Date.now() - LIMITS.presenceMs).toISOString();
  const { results } = await db
    .prepare(
      `SELECT ${USER_COLUMNS},
        (SELECT COUNT(*) FROM games g WHERE g.p1=u.username OR g.p2=u.username) games,
        (SELECT COUNT(*) FROM games g WHERE g.winner=u.username) wins,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.sender_key=u.username_key) messages,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at>?) sessions,
        EXISTS(SELECT 1 FROM presence p WHERE p.username_key=u.username_key AND p.last_seen_at>=?) online,
        EXISTS(SELECT 1 FROM chat_mutes c WHERE c.username_key=u.username_key) muted
       FROM users u ORDER BY u.username_key LIMIT 500`,
    )
    .bind(now(), presenceCutoff)
    .all();
  return { ok: true, users: results };
}

// La ficha reune en una sola respuesta todo lo que hace falta para decidir si
// una cuenta se bloquea o se borra: de donde entra, con quien juega y cuanto
// habla.
export async function adminUserDetail(db, target) {
  const key = usernameKey(String(target || ""));
  const user = await db
    // La ficha, y solo ella, ensena el correo: la lista no lo necesita.
    .prepare(`SELECT ${USER_COLUMNS},u.email,u.email_verified_at,u.username_changed_at,u.previous_username,u.timezone,u.notification_lang FROM users u WHERE u.username_key=?`)
    .bind(key)
    .first();
  if (!user) return { ok: false, error: "Usuario no encontrado." };
  const season = seasonOf(Date.now());
  const [games, sessions, threads, mute, presence, stats, scores, badges, progress, daily, arenas, push] =
    await Promise.all([
      db
        .prepare(
          `SELECT game_id,status,p1,p2,winner,digits,mode,time_mode,turn_seconds,bank_seconds,bank_increment,finish_reason,created_at,updated_at FROM games
           WHERE p1=? OR p2=? ORDER BY updated_at DESC LIMIT 20`,
        )
        .bind(user.username, user.username)
        .all(),
      db
        .prepare(
          `SELECT created_at,expires_at,last_seen_at,ip,country FROM sessions
           WHERE user_id=? ORDER BY last_seen_at DESC LIMIT 20`,
        )
        .bind(user.id)
        .all(),
      db
        .prepare(
          `SELECT t.id,t.user1,t.user1_key,t.user2,t.last_message_at,t.last_game_at,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id=t.id) messages
           FROM chat_threads t WHERE t.user1_key=? OR t.user2_key=?
           ORDER BY COALESCE(t.last_message_at,t.last_game_at) DESC LIMIT 30`,
        )
        .bind(key, key)
        .all(),
      db
        .prepare(
          "SELECT muted_until,created_by,created_at FROM chat_mutes WHERE username_key=?",
        )
        .bind(key)
        .first(),
      db
        .prepare(
          "SELECT location,game_id,last_seen_at FROM presence WHERE username_key=?",
        )
        .bind(key)
        .first(),
      db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM games WHERE p1=?1 OR p2=?1) played,
            (SELECT COUNT(*) FROM games WHERE winner=?1) wins,
            (SELECT COUNT(*) FROM games WHERE status='finished' AND winner='' AND (p1=?1 OR p2=?1)) draws,
            (SELECT COUNT(*) FROM chat_messages WHERE sender_key=?2) messages,
            (SELECT COUNT(*) FROM chat_reports WHERE reporter_key=?2) reportsMade,
            (SELECT COUNT(*) FROM chat_reports r JOIN chat_messages m ON m.id=r.message_id WHERE m.sender_key=?2) reportsGot`,
        )
        .bind(user.username, key)
        .first(),
      // Lo que llego con la 4.0.0 tambien es de la persona: sus puntos, sus
      // insignias, sus rachas, el codigo del dia, las arenas y los aparatos
      // que reciben avisos. Todo son lecturas por clave; ninguna recorre
      // `games`.
      db
        .prepare(
          "SELECT season,points,played,wins,losses,draws,best_attempts FROM player_scores WHERE username_key=? AND season IN (?,?)",
        )
        .bind(key, season, SEASON_ALL)
        .all(),
      db
        .prepare("SELECT code,earned_at,game_id FROM badges WHERE username_key=? ORDER BY earned_at DESC")
        .bind(key)
        .all(),
      db
        .prepare("SELECT day_streak,best_day_streak,win_streak,best_win_streak,last_play_day FROM player_progress WHERE username_key=?")
        .bind(key)
        .first(),
      db
        .prepare(
          `SELECT COUNT(*) played,COALESCE(SUM(solved),0) solved,MAX(day) lastDay,
            (SELECT MIN(attempts) FROM daily_results WHERE username_key=?1 AND solved=1) bestAttempts
           FROM daily_results WHERE username_key=?1`,
        )
        .bind(key)
        .first(),
      db
        .prepare(
          `SELECT a.arena_id,a.status,a.host,a.created_at,p.attempts,p.solved_at,p.gave_up
           FROM arena_players p JOIN arenas a ON a.arena_id=p.arena_id
           WHERE p.username_key=? ORDER BY a.created_at DESC LIMIT 10`,
        )
        .bind(key)
        .all(),
      db
        .prepare("SELECT lang,created_at,updated_at FROM push_subscriptions WHERE user_id=? ORDER BY updated_at DESC")
        .bind(user.id)
        .all(),
    ]);
  const scoreOf = (name) => scores.results.find((row) => row.season === name) || null;
  return {
    ok: true,
    user,
    stats,
    games: games.results,
    sessions: sessions.results,
    threads: threads.results.map((t) => ({
      id: Number(t.id),
      opponent: t.user1_key === key ? t.user2 : t.user1,
      messages: Number(t.messages) || 0,
      lastActivity:
        t.last_message_at && t.last_message_at > t.last_game_at
          ? t.last_message_at
          : t.last_game_at,
    })),
    mute: mute || null,
    presence: presence || null,
    season,
    seasonScore: scoreOf(season),
    allTimeScore: scoreOf(SEASON_ALL),
    badges: badges.results,
    progress: progress || null,
    daily: {
      played: toInt(daily?.played),
      solved: toInt(daily?.solved),
      lastDay: daily?.lastDay || "",
      bestAttempts: toInt(daily?.bestAttempts),
    },
    arenas: arenas.results.map((a) => ({
      arenaId: a.arena_id,
      status: a.status,
      host: a.host,
      createdAt: a.created_at,
      attempts: toInt(a.attempts),
      solved: !!a.solved_at,
      gaveUp: toInt(a.gave_up) === 1,
    })),
    // Del aparato solo se dice cuantos hay y en que idioma avisan: el
    // endpoint lo identifica y no hace falta verlo para administrar.
    push: push.results,
  };
}

// La pestana de partidas ensena las reglas de cada una, porque desde la 3.7.0
// una partida puede durar dias (correspondencia) y desde la 3.9.1 llevar
// cuaderno: sin eso no se distingue una partida olvidada de una que espera,
// con todo derecho, la jugada de manana.
export async function adminGames(db) {
  const { results } = await db
    .prepare(
      `SELECT game_id,status,p1,p2,winner,created_at,updated_at,version,digits,mode,num_colors,allow_repeats,
        max_attempts,is_public,time_mode,turn_seconds,bank_seconds,bank_increment,notebook,finish_reason
       FROM games ORDER BY updated_at DESC LIMIT 200`,
    )
    .all();
  return { ok: true, games: results };
}

// La arena vive en sus propias tablas, asi que tambien necesita su propia
// pestana: la de partidas solo ve `games`.
export async function adminArenas(db) {
  const { results } = await db
    .prepare(
      `SELECT a.arena_id,a.status,a.host,a.digits,a.mode,a.num_colors,a.allow_repeats,a.max_attempts,
        a.created_at,a.started_at,a.updated_at,a.finish_reason,
        (SELECT COUNT(*) FROM arena_players p WHERE p.arena_id=a.arena_id) players,
        (SELECT COUNT(*) FROM arena_players p WHERE p.arena_id=a.arena_id AND p.solved_at IS NOT NULL) solved,
        (SELECT COUNT(*) FROM arena_guesses g WHERE g.arena_id=a.arena_id) guesses
       FROM arenas a ORDER BY a.updated_at DESC LIMIT 100`,
    )
    .all();
  return { ok: true, arenas: results };
}

// La ficha de una arena es su clasificacion, la misma que ve quien juega. El
// codigo sigue la regla de la arena: no sale de la tabla mientras se juega,
// tampoco hacia el panel. Si de verdad hace falta, la consola SQL lo lee, y
// eso ya es una decision consciente.
export async function adminArenaDetail(db, arenaId) {
  const id = String(arenaId || "").toUpperCase().trim();
  const arena = await db.prepare("SELECT * FROM arenas WHERE arena_id=?").bind(id).first();
  if (!arena) return { ok: false, error: "Arena no encontrada." };
  const { results } = await db
    .prepare(
      "SELECT username,country,joined_at,attempts,best_fijas,solved_at,gave_up FROM arena_players WHERE arena_id=?",
    )
    .bind(id)
    .all();
  const over = arena.status === "finished" || arena.status === "expired";
  const { secret, ...meta } = arena;
  return {
    ok: true,
    arena: { ...meta, secret: over ? secret : "" },
    players: rankPlayers(
      results.map((row) => ({
        username: row.username,
        country: row.country,
        joinedAt: row.joined_at,
        attempts: toInt(row.attempts),
        bestFijas: toInt(row.best_fijas),
        solvedAt: row.solved_at || "",
        gaveUp: toInt(row.gave_up) === 1,
      })),
    ),
  };
}

// Cerrar una arena colgada. La que esperaba gente caduca; la que ya se jugaba
// termina, y lo jugado se queda en su clasificacion.
export async function adminCloseArena(db, arenaId) {
  const id = String(arenaId || "").toUpperCase().trim();
  const result = await db
    .prepare(
      `UPDATE arenas SET status=CASE WHEN status='waiting' THEN 'expired' ELSE 'finished' END,
        finish_reason='admin',updated_at=?,version=version+1
       WHERE arena_id=? AND status IN ('waiting','active')`,
    )
    .bind(now(), id)
    .run();
  if (!result.meta?.changes)
    return { ok: false, error: "Esa arena no existe o ya está cerrada." };
  return { ok: true };
}

const findUser = (db, name) =>
  db
    .prepare("SELECT * FROM users WHERE username_key=?")
    .bind(usernameKey(String(name || "")))
    .first();

// Borrar una cuenta es un derecho al olvido: no se conserva su historial de
// juego, conversaciones ni los registros técnicos que permiten identificarla.
export async function adminDeleteUser(db, params, admin) {
  const user = await findUser(db, params.target);
  if (!user) return { ok: false, error: "Usuario no encontrado." };
  if (user.username_key === KEY_DIEGO)
    return { ok: false, error: "No se puede borrar el administrador principal." };
  if (user.id === admin.id)
    return { ok: false, error: "No puedes borrar tu propia cuenta." };
  if (user.role === "admin")
    return {
      ok: false,
      error: "Quita primero el rol de administrador a esta cuenta.",
    };
  // Algunas tablas no tienen una clave foránea hacia users porque también se
  // usan antes de iniciar sesión. Se limpian explícitamente aquí, junto con
  // las que SQLite elimina mediante ON DELETE CASCADE (sesiones y recuperación).
  const auditNeedle = `%${user.username}%`;
  const emailNeedle = user.email ? `%${user.email}%` : null;
  const statements = [
    db.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
    db.prepare("DELETE FROM presence WHERE username_key=?").bind(user.username_key),
    db.prepare("DELETE FROM chat_mutes WHERE username_key=?").bind(user.username_key),
    // El contador de PIN es de la cuenta; las claves por nombre y por correo
    // son las de antes de la 3.5.1 y pueden seguir ahi.
    db
      .prepare("DELETE FROM login_attempts WHERE throttle_key IN (?,?,?)")
      .bind(pinThrottleKey(user.id), user.username_key, user.email || ""),
    db.prepare("DELETE FROM request_receipts WHERE username_key=? OR game_id IN (SELECT game_id FROM games WHERE p1=? OR p2=?)")
      .bind(user.username_key, user.username, user.username),
    db.prepare("DELETE FROM chat_reports WHERE reporter_key=?").bind(user.username_key),
    // El codigo del dia no tiene clave foranea: sus filas se identifican por
    // la cuenta, asi que se borran aqui como la presencia o los silencios.
    db.prepare("DELETE FROM daily_results WHERE username_key=?").bind(user.username_key),
    // Los puntos, las rachas y las insignias de la etapa 5 tampoco tienen
    // clave foranea: sin esto, el nombre seguiria en el ranking despues de
    // borrar la cuenta, y una cuenta nueva con ese mismo nombre heredaria
    // unos puntos que no jugo.
    db.prepare("DELETE FROM player_scores WHERE username_key=?").bind(user.username_key),
    db.prepare("DELETE FROM player_progress WHERE username_key=?").bind(user.username_key),
    db.prepare("DELETE FROM badges WHERE username_key=?").bind(user.username_key),
    db.prepare("DELETE FROM game_scores WHERE game_id IN (SELECT game_id FROM games WHERE p1=? OR p2=?)")
      .bind(user.username, user.username),
    // La arena guarda el nombre escrito en sus tres tablas y no tiene clave
    // foranea hacia `users`: sin esto, borrar una cuenta dejaba su nombre en
    // la clasificacion de cada arena que jugo. Se va lo suyo, y se van enteras
    // las arenas que abrio, igual que se van las partidas en las que jugo.
    db.prepare("DELETE FROM arena_guesses WHERE username_key=? OR arena_id IN (SELECT arena_id FROM arenas WHERE host_key=?)")
      .bind(user.username_key, user.username_key),
    db.prepare("DELETE FROM arena_players WHERE username_key=? OR arena_id IN (SELECT arena_id FROM arenas WHERE host_key=?)")
      .bind(user.username_key, user.username_key),
    db.prepare("DELETE FROM arenas WHERE host_key=?").bind(user.username_key),
    // Un fil privé est une conversation : s'il implique le compte, il part
    // entièrement, y compris les messages de l'autre participant.
    db
      .prepare("DELETE FROM chat_threads WHERE user1_key=? OR user2_key=?")
      .bind(user.username_key, user.username_key),
    // Les messages du lobby n'appartiennent à aucun fil et doivent donc être
    // retirés séparément. Les signalements associés suivent par cascade.
    db.prepare("DELETE FROM chat_messages WHERE sender_key=?").bind(user.username_key),
    db
      .prepare("DELETE FROM games WHERE p1=? OR p2=?")
      .bind(user.username, user.username),
    db
      .prepare("DELETE FROM feedback WHERE username=? OR (?<>'' AND contact=?)")
      .bind(user.username, user.email || "", user.email || ""),
    // Une entrée d'audit peut désigner la personne, ou empêcher la suppression
    // si elle a elle-même été administratrice par le passé. Elle ne doit pas
    // survivre à cette purge, et l'opération elle-même n'est pas auditée.
    db
      .prepare("DELETE FROM audit_log WHERE admin_user_id=? OR target=? OR details_json LIKE ? OR (? IS NOT NULL AND details_json LIKE ?)")
      .bind(user.id, user.username, auditNeedle, emailNeedle, emailNeedle),
  ];
  // Quien fue administrador pudo responder mensajes del buzon; esa fila apunta
  // a su id sin cascada y haria fallar el borrado entero.
  statements.push(db.prepare("DELETE FROM feedback_replies WHERE admin_user_id=?").bind(user.id));
  statements.push(db.prepare("DELETE FROM users WHERE id=?").bind(user.id));
  await db.batch(statements);
  return { ok: true, deleted: user.username, purged: true };
}

// Limpiar partidas siempre se hace en dos tiempos: primero se cuenta, despues
// se borra. Ninguna limpieza debe estrenarse sobre datos reales a ciegas.
export async function adminPurgeGames(db, params) {
  const status = ["waiting", "active", "finished", "cancelled", "expired", "inactive"].includes(
    params.status,
  )
    ? params.status
    : "";
  const days = Math.max(0, parseInt(params.olderThanDays, 10) || 0);
  if (!status && !days)
    return { ok: false, error: "Elige al menos un estado o una antigüedad." };
  const where = [];
  const binds = [];
  if (status) {
    where.push("status=?");
    binds.push(status);
  }
  if (days) {
    where.push("updated_at<?");
    binds.push(new Date(Date.now() - days * 86400000).toISOString());
  }
  const clause = where.join(" AND ");
  const preview = await db
    .prepare(`SELECT COUNT(*) count FROM games WHERE ${clause}`)
    .bind(...binds)
    .first();
  const matched = Number(preview.count) || 0;
  if (!params.confirm)
    return { ok: true, preview: true, matched, status, olderThanDays: days };
  const result = await db
    .prepare(`DELETE FROM games WHERE ${clause}`)
    .bind(...binds)
    .run();
  return {
    ok: true,
    preview: false,
    matched,
    deleted: Number(result.meta?.changes) || matched,
  };
}

// La consola SQL existe para las reparaciones que ninguna pantalla previo. Sus
// barandillas no protegen de un administrador decidido —para eso esta la
// confirmacion— sino de los tres accidentes reales: dos instrucciones pegadas,
// un DELETE sin WHERE y un cambio de esquema fuera de una migracion.
export function classifySql(sql) {
  const text = String(sql || "")
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .replace(/;+\s*$/, "")
    .trim();
  if (!text) return { error: "Escribe una consulta." };
  if (text.includes(";"))
    return { error: "Solo se permite una instrucción por ejecución." };
  if (/\b(attach|detach|vacuum|reindex|drop|alter|create|pragma|analyze)\b/i.test(text))
    return {
      error:
        "Aquí no se cambia el esquema (CREATE, ALTER, DROP, PRAGMA…). Eso va en una migración numerada.",
    };
  const head = (text.match(/^[a-z]+/i) || [""])[0].toLowerCase();
  const writes = /\b(insert|update|delete)\b/i.test(text);
  if (head === "select" || (head === "with" && !writes)) return { text, kind: "read" };
  if (["insert", "update", "delete"].includes(head) || (head === "with" && writes)) {
    if (/^(update|delete)\b/i.test(text) && !/\bwhere\b/i.test(text))
      return {
        error:
          "Un UPDATE o DELETE sin WHERE afectaría a la tabla entera. Añade una condición (WHERE 1=1 si de verdad es lo que quieres).",
      };
    return { text, kind: "write" };
  }
  return { error: `Instrucción no permitida: ${head.toUpperCase() || "vacía"}.` };
}

export async function adminSql(db, params) {
  const plan = classifySql(params.sql);
  if (plan.error) return { ok: false, error: plan.error };
  if (plan.kind === "write" && !params.confirm)
    return { ok: true, kind: "write", pending: true, sql: plan.text };
  const started = Date.now();
  try {
    if (plan.kind === "read") {
      const { results } = await db.prepare(plan.text).all();
      const rows = results || [];
      const columns = rows.length ? Object.keys(rows[0]) : [];
      return {
        ok: true,
        kind: "read",
        columns,
        rows: rows
          .slice(0, 200)
          .map((row) =>
            columns.map((column) =>
              row[column] === null ? null : String(row[column]),
            ),
          ),
        total: rows.length,
        truncated: rows.length > 200,
        ms: Date.now() - started,
      };
    }
    const result = await db.prepare(plan.text).run();
    return {
      ok: true,
      kind: "write",
      changes: Number(result.meta?.changes) || 0,
      ms: Date.now() - started,
    };
  } catch (cause) {
    return { ok: false, error: `SQLite: ${cause?.message || cause}` };
  }
}

// El resumen contesta de un vistazo lo que antes obligaba a abrir cada tabla:
// cuanta gente vuelve, de donde entra y si hay moderacion pendiente.
export async function adminSummary(db, onlineCount) {
  const day = new Date(Date.now() - 86400000).toISOString();
  const week = new Date(Date.now() - 7 * 86400000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const season = seasonOf(Date.now());
  const [users, games, online, activity, countries] = await Promise.all([
    db.prepare("SELECT COUNT(*) count FROM users").first(),
    db.prepare("SELECT status,COUNT(*) count FROM games GROUP BY status").all(),
    onlineCount(db),
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM users WHERE created_at>=?1) newUsersWeek,
          (SELECT COUNT(*) FROM users WHERE last_login_at>=?1) activeUsersWeek,
          (SELECT COUNT(*) FROM users WHERE blocked_at IS NOT NULL) blocked,
          (SELECT COUNT(*) FROM games WHERE created_at>=?2) gamesDay,
          (SELECT COUNT(*) FROM chat_messages WHERE created_at>=?2) messagesDay,
          (SELECT COUNT(*) FROM chat_reports WHERE status='open') openReports,
          (SELECT COUNT(*) FROM feedback WHERE status='new') openFeedback,
          (SELECT COUNT(*) FROM feedback) feedback,
          (SELECT COUNT(*) FROM chat_mutes) mutes,
          (SELECT COUNT(*) FROM chat_threads) threads,
          (SELECT COUNT(*) FROM chat_messages) messages,
          (SELECT COUNT(*) FROM sessions WHERE expires_at>?3) sessions,
          (SELECT COUNT(*) FROM games WHERE status='active' AND time_mode='correspondence') correspondence,
          (SELECT COUNT(*) FROM games WHERE status='active' AND is_public=1 AND p2<>'') watchable,
          (SELECT COUNT(*) FROM arenas WHERE status IN ('waiting','active')) arenasOpen,
          (SELECT COUNT(*) FROM arenas WHERE created_at>=?2) arenasDay,
          (SELECT COUNT(*) FROM daily_results WHERE day=?4) dailyToday,
          (SELECT COUNT(*) FROM daily_results WHERE day=?4 AND solved=1) dailySolvedToday,
          (SELECT COUNT(*) FROM player_scores WHERE season=?5 AND played>0) seasonPlayers,
          (SELECT COUNT(*) FROM badges) badges,
          (SELECT COUNT(*) FROM push_subscriptions) pushDevices`,
      )
      .bind(week, day, now(), today, season)
      .first(),
    db
      .prepare(
        `SELECT last_country country,COUNT(*) count FROM users WHERE last_country<>''
         GROUP BY last_country ORDER BY count DESC LIMIT 8`,
      )
      .all(),
  ]);
  return {
    ok: true,
    users: Number(users.count),
    games: games.results,
    online,
    activity,
    countries: countries.results,
    today,
    season,
  };
}
