// Herramientas de administracion que van mas alla de consultar y bloquear:
// ficha de usuario, deteccion de cuentas repetidas, fusion de cuentas, limpieza
// de partidas y una consola SQL con barandillas. Viven aparte de `index.js`
// porque son operaciones de mantenimiento, no del juego, y porque cada una
// necesita mas cuidado que una consulta suelta.
import { LIMITS, usernameKey } from "./game.js";

const now = () => new Date().toISOString();
const KEY_DIEGO = "diego";

// Quien olvida su PIN vuelve a entrar con el mismo nombre y un numero detras:
// "carlos" pasa a ser "carlos46". Esta raiz ignora acentos, digitos y signos
// para que las dos cuentas caigan en el mismo grupo.
export function aliasRoot(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

// Dos pistas independientes de que dos cuentas son la misma persona: comparten
// la ultima IP, o comparten la raiz del nombre. Ninguna es una prueba; las dos
// juntas casi siempre lo son, y por eso cada grupo muestra su motivo.
export function duplicateGroups(users) {
  const groups = [];
  const collect = (reason, keyOf) => {
    const buckets = new Map();
    for (const user of users) {
      const value = keyOf(user);
      if (!value) continue;
      buckets.set(value, [...(buckets.get(value) || []), user]);
    }
    for (const [value, members] of buckets)
      if (members.length > 1)
        groups.push({
          reason,
          value,
          members: members.map((u) => ({
            username: u.username,
            lastLoginAt: u.last_login_at || "",
            country: u.last_country || "",
            games: Number(u.games) || 0,
          })),
        });
  };
  collect("ip", (u) => u.last_ip || "");
  collect("nombre", (u) => {
    const root = aliasRoot(u.username);
    return root.length >= 3 ? root : "";
  });
  return groups.sort((a, b) => b.members.length - a.members.length).slice(0, 40);
}

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
  return { ok: true, users: results, duplicates: duplicateGroups(results) };
}

// La ficha reune en una sola respuesta todo lo que hace falta para decidir si
// una cuenta se bloquea, se fusiona o se borra: de donde entra, con quien
// juega, cuanto habla y que cuentas se le parecen.
export async function adminUserDetail(db, target) {
  const key = usernameKey(String(target || ""));
  const user = await db
    .prepare(`SELECT ${USER_COLUMNS} FROM users u WHERE u.username_key=?`)
    .bind(key)
    .first();
  if (!user) return { ok: false, error: "Usuario no encontrado." };
  const [games, sessions, threads, mute, presence, stats, sameIp, everyone] =
    await Promise.all([
      db
        .prepare(
          `SELECT game_id,status,p1,p2,winner,digits,mode,created_at,updated_at FROM games
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
      db
        .prepare(
          `SELECT username,last_ip,last_country,last_login_at FROM users
           WHERE username_key<>? AND last_ip<>'' AND last_ip=? LIMIT 20`,
        )
        .bind(key, user.last_ip || "\u0000")
        .all(),
      db
        .prepare(
          "SELECT username,last_ip,last_country,last_login_at FROM users WHERE username_key<>? LIMIT 500",
        )
        .bind(key)
        .all(),
    ]);
  const root = aliasRoot(user.username);
  const related = [
    ...sameIp.results.map((u) => ({ ...u, reason: "ip" })),
    ...everyone.results
      .filter((u) => root.length >= 3 && aliasRoot(u.username) === root)
      .map((u) => ({ ...u, reason: "nombre" })),
  ].filter(
    (item, index, list) =>
      list.findIndex((other) => other.username === item.username) === index,
  );
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
    related,
  };
}

const findUser = (db, name) =>
  db
    .prepare("SELECT * FROM users WHERE username_key=?")
    .bind(usernameKey(String(name || "")))
    .first();

// Fusionar es la operacion delicada del panel: hay que arrastrar partidas,
// mensajes, hilos y presencia de una cuenta a otra sin romper la clave unica
// de `chat_threads`, que solo admite un hilo por pareja. Cuando la fusion crea
// una pareja que ya existe, los mensajes se mudan al hilo superviviente y el
// hilo vacio se retira; un hilo de la cuenta consigo misma desaparece.
export async function adminMergeUsers(db, params) {
  const from = await findUser(db, params.from);
  const into = await findUser(db, params.into);
  if (!from) return { ok: false, error: "La cuenta de origen no existe." };
  if (!into) return { ok: false, error: "La cuenta de destino no existe." };
  if (from.id === into.id)
    return { ok: false, error: "Las dos cuentas son la misma." };
  if (from.username_key === KEY_DIEGO)
    return { ok: false, error: "No se puede absorber el administrador principal." };
  if (from.role === "admin")
    return {
      ok: false,
      error: "Quita primero el rol de administrador a la cuenta de origen.",
    };

  const statements = [
    db.prepare("UPDATE games SET p1=? WHERE p1=?").bind(into.username, from.username),
    db.prepare("UPDATE games SET p2=? WHERE p2=?").bind(into.username, from.username),
    db
      .prepare("UPDATE games SET winner=? WHERE winner=?")
      .bind(into.username, from.username),
    db
      .prepare("UPDATE games SET pending_winner=? WHERE pending_winner=?")
      .bind(into.username, from.username),
    db
      .prepare("UPDATE games SET manual_paused_by=? WHERE manual_paused_by=?")
      .bind(into.username, from.username),
    db
      .prepare("UPDATE games SET lobby_paused_by=? WHERE lobby_paused_by=?")
      .bind(into.username, from.username),
    db
      .prepare("UPDATE games SET timer_ready_by=? WHERE timer_ready_by=?")
      .bind(into.username, from.username),
    db
      .prepare("UPDATE chat_messages SET sender=?,sender_key=? WHERE sender_key=?")
      .bind(into.username, into.username_key, from.username_key),
    db
      .prepare("UPDATE chat_reports SET reporter=?,reporter_key=? WHERE reporter_key=?")
      .bind(into.username, into.username_key, from.username_key),
  ];

  const { results: threads } = await db
    .prepare("SELECT * FROM chat_threads WHERE user1_key=? OR user2_key=?")
    .bind(from.username_key, from.username_key)
    .all();
  let movedThreads = 0;
  let mergedThreads = 0;
  for (const thread of threads) {
    const otherKey =
      thread.user1_key === from.username_key ? thread.user2_key : thread.user1_key;
    const otherName =
      thread.user1_key === from.username_key ? thread.user2 : thread.user1;
    if (otherKey === into.username_key) {
      statements.push(
        db.prepare("DELETE FROM chat_messages WHERE thread_id=?").bind(thread.id),
        db.prepare("DELETE FROM chat_threads WHERE id=?").bind(thread.id),
      );
      continue;
    }
    const pairKey =
      into.username_key < otherKey
        ? `${into.username_key}|${otherKey}`
        : `${otherKey}|${into.username_key}`;
    const existing = await db
      .prepare("SELECT id FROM chat_threads WHERE pair_key=?")
      .bind(pairKey)
      .first();
    if (existing) {
      statements.push(
        db
          .prepare("UPDATE chat_messages SET thread_id=? WHERE thread_id=?")
          .bind(existing.id, thread.id),
        db.prepare("DELETE FROM chat_threads WHERE id=?").bind(thread.id),
      );
      mergedThreads += 1;
    } else {
      const other = { username: otherName, username_key: otherKey };
      const first = into.username_key < otherKey ? into : other;
      const second = into.username_key < otherKey ? other : into;
      statements.push(
        db
          .prepare(
            "UPDATE chat_threads SET pair_key=?,user1=?,user1_key=?,user2=?,user2_key=? WHERE id=?",
          )
          .bind(
            pairKey,
            first.username,
            first.username_key,
            second.username,
            second.username_key,
            thread.id,
          ),
      );
      movedThreads += 1;
    }
  }

  statements.push(
    db
      .prepare(
        `UPDATE chat_threads SET last_message_at=(SELECT MAX(created_at) FROM chat_messages m WHERE m.thread_id=chat_threads.id)
         WHERE user1_key=? OR user2_key=?`,
      )
      .bind(into.username_key, into.username_key),
    db
      .prepare(
        `UPDATE users SET created_at=MIN(created_at,?),login_count=login_count+?,
          last_login_at=MAX(COALESCE(last_login_at,''),?),
          last_ip=CASE WHEN last_ip='' THEN ? ELSE last_ip END,
          last_country=CASE WHEN last_country='' THEN ? ELSE last_country END WHERE id=?`,
      )
      .bind(
        from.created_at,
        Number(from.login_count) || 0,
        from.last_login_at || "",
        from.last_ip || "",
        from.last_country || "",
        into.id,
      ),
    db.prepare("DELETE FROM sessions WHERE user_id=?").bind(from.id),
    db.prepare("DELETE FROM presence WHERE username_key=?").bind(from.username_key),
    db.prepare("DELETE FROM chat_mutes WHERE username_key=?").bind(from.username_key),
    db
      .prepare("DELETE FROM login_attempts WHERE throttle_key=?")
      .bind(from.username_key),
    db.prepare("DELETE FROM users WHERE id=?").bind(from.id),
  );
  await db.batch(statements);
  return {
    ok: true,
    merged: {
      from: from.username,
      into: into.username,
      movedThreads,
      mergedThreads,
    },
  };
}

// Borrar una cuenta deja sus partidas con un nombre que ya no existe. Por eso
// hay dos modos: conservar el rastro de juego o llevarselo todo por delante.
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
  const purge = user.username && (params.purge === true || params.purge === "1");
  const statements = [
    db.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
    db.prepare("DELETE FROM presence WHERE username_key=?").bind(user.username_key),
    db.prepare("DELETE FROM chat_mutes WHERE username_key=?").bind(user.username_key),
    db
      .prepare("DELETE FROM login_attempts WHERE throttle_key=?")
      .bind(user.username_key),
  ];
  if (purge)
    statements.push(
      db.prepare("DELETE FROM chat_messages WHERE sender_key=?").bind(user.username_key),
      db
        .prepare("DELETE FROM chat_threads WHERE user1_key=? OR user2_key=?")
        .bind(user.username_key, user.username_key),
      db
        .prepare("DELETE FROM games WHERE p1=? OR p2=?")
        .bind(user.username, user.username),
    );
  statements.push(db.prepare("DELETE FROM users WHERE id=?").bind(user.id));
  await db.batch(statements);
  return { ok: true, deleted: user.username, purged: !!purge };
}

// Limpiar partidas siempre se hace en dos tiempos: primero se cuenta, despues
// se borra. Ninguna limpieza debe estrenarse sobre datos reales a ciegas.
export async function adminPurgeGames(db, params) {
  const status = ["waiting", "active", "finished", "cancelled"].includes(
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
          (SELECT COUNT(*) FROM sessions WHERE expires_at>?3) sessions`,
      )
      .bind(week, day, now())
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
  };
}
