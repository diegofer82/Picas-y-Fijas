const CHAT = Object.freeze({
  maxLength: 300,
  lobbyRetentionMs: 86400000,
  threadActiveMs: 86400000,
  threadRetentionMs: 604800000,
  gameRetentionMs: 604800000,
  gameOpenAfterFinishMs: 86400000,
  sendCooldownMs: 1500,
  burstWindowMs: 15000,
  burstMax: 5,
  duplicateWindowMs: 120000,
  nudgeCooldownMs: 30000,
});
const now = () => new Date().toISOString();
const key = (v) =>
  String(v ?? "")
    .trim()
    .toLocaleLowerCase();
const normalize = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
const BLOCKED_WORDS = new Set([
  "puta",
  "puto",
  "mierda",
  "cabron",
  "cabrona",
  "gilipollas",
  "imbecil",
  "idiota",
  "fuck",
  "fucker",
  "fucking",
  "bitch",
  "cunt",
  "asshole",
  "retard",
  "connard",
  "connasse",
  "salope",
  "encule",
  "enculee",
  "merde",
]);
const URL_PATTERN =
  /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|app|dev|fr|es|gg|me)(?:\b|\/))/i;
function messageError(body) {
  const text = String(body ?? "").trim();
  if (!text) return "Escribe un mensaje.";
  if ([...text].length > CHAT.maxLength)
    return `El mensaje no puede superar ${CHAT.maxLength} caracteres.`;
  if (URL_PATTERN.test(text)) return "No se permiten enlaces.";
  if (
    (normalize(text).match(/[a-z]+/g) || []).some((w) => BLOCKED_WORDS.has(w))
  )
    return "El mensaje contiene una palabra no permitida.";
  return "";
}
function pairData(a, b) {
  return a.username_key < b.username_key
    ? { pairKey: `${a.username_key}|${b.username_key}`, u1: a, u2: b }
    : { pairKey: `${b.username_key}|${a.username_key}`, u1: b, u2: a };
}
async function gameUsers(db, game) {
  const a = await db
      .prepare("SELECT username,username_key FROM users WHERE username=?")
      .bind(game.p1)
      .first(),
    b = await db
      .prepare("SELECT username,username_key FROM users WHERE username=?")
      .bind(game.p2)
      .first();
  return a && b ? pairData(a, b) : null;
}
export async function threadForGame(db, gameOrId, activate = false) {
  const game =
    typeof gameOrId === "string"
      ? await db
          .prepare("SELECT * FROM games WHERE game_id=?")
          .bind(gameOrId)
          .first()
      : gameOrId;
  if (!game?.p2) return null;
  const p = await gameUsers(db, game);
  if (!p) return null;
  const stamp = now();
  await db
    .prepare(
      `INSERT INTO chat_threads(pair_key,user1,user1_key,user2,user2_key,created_at,last_game_at,latest_game_id) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(pair_key) DO UPDATE SET last_game_at=CASE WHEN ? THEN excluded.last_game_at ELSE chat_threads.last_game_at END,latest_game_id=CASE WHEN ? THEN excluded.latest_game_id ELSE chat_threads.latest_game_id END`,
    )
    .bind(
      p.pairKey,
      p.u1.username,
      p.u1.username_key,
      p.u2.username,
      p.u2.username_key,
      stamp,
      stamp,
      game.game_id,
      activate ? 1 : 0,
      activate ? 1 : 0,
    )
    .run();
  return db
    .prepare("SELECT * FROM chat_threads WHERE pair_key=?")
    .bind(p.pairKey)
    .first();
}
export const activateThreadForGame = (db, game) =>
  threadForGame(db, game, true);
async function cleanup(db) {
  const lobby = new Date(Date.now() - CHAT.lobbyRetentionMs).toISOString(),
    threads = new Date(Date.now() - CHAT.threadRetentionMs).toISOString();
  await db.batch([
    db
      .prepare(
        "DELETE FROM chat_messages WHERE room_type='lobby' AND created_at<?",
      )
      .bind(lobby),
    db
      .prepare(
        "DELETE FROM chat_threads WHERE CASE WHEN last_message_at IS NOT NULL AND last_message_at>last_game_at THEN last_message_at ELSE last_game_at END<?",
      )
      .bind(threads),
    db
      .prepare(
        "DELETE FROM chat_mutes WHERE muted_until IS NOT NULL AND muted_until<=?",
      )
      .bind(now()),
  ]);
}
async function roomAccess(db, p, user) {
  if (p.roomType !== "private" && p.roomType !== "game")
    return { ok: true, roomType: "lobby", threadId: null, gameId: "" };
  let thread;
  if (p.roomType === "private")
    thread = await db
      .prepare("SELECT * FROM chat_threads WHERE id=?")
      .bind(Number(p.threadId) || 0)
      .first();
  else {
    const game = await db
      .prepare("SELECT * FROM games WHERE game_id=?")
      .bind(String(p.gameId || "").toUpperCase())
      .first();
    if (!game) return { ok: false, error: "Partida no encontrada." };
    thread = await threadForGame(db, game, false);
  }
  if (!thread) return { ok: false, error: "Conversación no encontrada." };
  if (
    thread.user1_key !== user.username_key &&
    thread.user2_key !== user.username_key
  )
    return { ok: false, error: "Este chat es privado." };
  const activity=thread.last_message_at&&thread.last_message_at>thread.last_game_at?thread.last_message_at:thread.last_game_at;
  if (Date.now() - Date.parse(activity) > CHAT.threadActiveMs)
    return { ok: false, error: "Esta conversación está archivada." };
  return {
    ok: true,
    roomType: "private",
    threadId: Number(thread.id),
    gameId: thread.latest_game_id || "",
    thread,
    opponent:
      thread.user1_key === user.username_key ? thread.user2 : thread.user1,
  };
}
async function activeMute(db, user) {
  const r = await db
    .prepare("SELECT muted_until FROM chat_mutes WHERE username_key=?")
    .bind(user.username_key)
    .first();
  if (!r) return "";
  if (r.muted_until === null)
    return "Tu acceso al chat fue silenciado permanentemente por un administrador.";
  return Date.parse(r.muted_until) > Date.now()
    ? `Tu acceso al chat está silenciado hasta ${r.muted_until}.`
    : "";
}
function publicMessage(r) {
  return {
    id: Number(r.id),
    roomType: r.thread_id ? "private" : r.room_type,
    threadId: Number(r.thread_id) || 0,
    gameId: r.game_id || "",
    sender: r.sender || "",
    senderKey: r.sender_key || "",
    kind: r.kind,
    body: r.deleted_at ? "" : r.body,
    createdAt: r.created_at,
    deleted: !!r.deleted_at,
  };
}
export async function listThreads(db, user) {
  await cleanup(db);
  const cutoff = new Date(Date.now() - CHAT.threadActiveMs).toISOString();
  const { results } = await db
    .prepare(
      `SELECT t.*,m.id last_message_id,m.kind last_kind,m.body last_body,m.sender last_sender FROM chat_threads t LEFT JOIN chat_messages m ON m.id=(SELECT MAX(id) FROM chat_messages WHERE thread_id=t.id) WHERE (t.user1_key=? OR t.user2_key=?) AND (CASE WHEN t.last_message_at IS NOT NULL AND t.last_message_at>t.last_game_at THEN t.last_message_at ELSE t.last_game_at END)>=? ORDER BY (CASE WHEN t.last_message_at IS NOT NULL AND t.last_message_at>t.last_game_at THEN t.last_message_at ELSE t.last_game_at END) DESC`,
    )
    .bind(user.username_key, user.username_key, cutoff)
    .all();
  return {
    ok: true,
    threads: results.map((t) => ({
      id: Number(t.id),
      opponent: t.user1_key === user.username_key ? t.user2 : t.user1,
      lastActivity: t.last_message_at&&t.last_message_at>t.last_game_at?t.last_message_at:t.last_game_at,
      lastMessageId: Number(t.last_message_id) || 0,
      lastKind: t.last_kind || "",
      lastBody: t.last_body || "",
    })),
  };
}
export async function listChat(db, p, user) {
  if (p.listThreads) return listThreads(db, user);
  await cleanup(db);
  const room = await roomAccess(db, p, user);
  if (!room.ok) return room;
  const after = Math.max(0, parseInt(p.after, 10) || 0);
  const q =
    room.roomType === "lobby"
      ? db
          .prepare(
            "SELECT * FROM chat_messages WHERE room_type='lobby' AND id>? ORDER BY id DESC LIMIT 100",
          )
          .bind(after)
      : db
          .prepare(
            "SELECT * FROM chat_messages WHERE thread_id=? AND id>? ORDER BY id DESC LIMIT 100",
          )
          .bind(room.threadId, after);
  const { results } = await q.all();
  return {
    ok: true,
    messages: results.reverse().map(publicMessage),
    roomType: room.roomType,
    threadId: room.threadId || 0,
    opponent: room.opponent || "",
    canWrite: true,
  };
}
export async function sendChat(db, p, user) {
  const room = await roomAccess(db, p, user);
  if (!room.ok) return room;
  const muted = await activeMute(db, user);
  if (muted) return { ok: false, error: muted };
  const body = String(p.body ?? "").trim(),
    validation = messageError(body);
  if (validation) return { ok: false, error: validation };
  const latest = await db
    .prepare(
      "SELECT body,created_at FROM chat_messages WHERE sender_key=? AND kind='user' ORDER BY id DESC LIMIT 6",
    )
    .bind(user.username_key)
    .all();
  if (
    latest.results[0] &&
    Date.now() - Date.parse(latest.results[0].created_at) < CHAT.sendCooldownMs
  )
    return {
      ok: false,
      error: "Espera un momento antes de enviar otro mensaje.",
    };
  if (
    latest.results.filter(
      (m) => Date.now() - Date.parse(m.created_at) < CHAT.burstWindowMs,
    ).length >= CHAT.burstMax
  )
    return {
      ok: false,
      error: "Has enviado demasiados mensajes. Espera unos segundos.",
    };
  if (
    latest.results.some(
      (m) =>
        m.body === body &&
        Date.now() - Date.parse(m.created_at) < CHAT.duplicateWindowMs,
    )
  )
    return { ok: false, error: "No repitas el mismo mensaje." };
  const stamp = now(),
    result = await db
      .prepare(
        "INSERT INTO chat_messages(room_type,game_id,thread_id,sender,sender_key,kind,body,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        room.roomType === "lobby" ? "lobby" : "game",
        room.gameId || null,
        room.threadId,
        user.username,
        user.username_key,
        "user",
        body,
        stamp,
      )
      .run();
  if (room.threadId)
    await db
      .prepare("UPDATE chat_threads SET last_message_at=? WHERE id=?")
      .bind(stamp, room.threadId)
      .run();
  return {
    ok: true,
    message: publicMessage(
      await db
        .prepare("SELECT * FROM chat_messages WHERE id=?")
        .bind(result.meta.last_row_id)
        .first(),
    ),
  };
}
export async function sendNudge(db, p, user) {
  const room = await roomAccess(db, p, user);
  if (!room.ok || room.roomType !== "private")
    return room.ok
      ? {
          ok: false,
          error:
            "Los zumbidos solo están disponibles en conversaciones privadas.",
        }
      : room;
  const muted = await activeMute(db, user);
  if (muted) return { ok: false, error: muted };
  const cutoff = new Date(Date.now() - 120000).toISOString(),
    presence = await db
      .prepare(
        "SELECT 1 present FROM presence WHERE username_key=? AND last_seen_at>=? LIMIT 1",
      )
      .bind(key(room.opponent), cutoff)
      .first();
  if (!presence) return { ok: false, error: "El rival no está conectado." };
  const last = await db
    .prepare(
      "SELECT created_at FROM chat_messages WHERE thread_id=? AND sender_key=? AND kind='nudge' ORDER BY id DESC LIMIT 1",
    )
    .bind(room.threadId, user.username_key)
    .first();
  if (last && Date.now() - Date.parse(last.created_at) < CHAT.nudgeCooldownMs)
    return {
      ok: false,
      error: "Espera 30 segundos antes de enviar otro zumbido.",
    };
  const stamp = now(),
    result = await db
      .prepare(
        "INSERT INTO chat_messages(room_type,game_id,thread_id,sender,sender_key,kind,body,created_at) VALUES('game',?,?,?,?,?,'',?)",
      )
      .bind(
        room.gameId || null,
        room.threadId,
        user.username,
        user.username_key,
        "nudge",
        stamp,
      )
      .run();
  await db
    .prepare("UPDATE chat_threads SET last_message_at=? WHERE id=?")
    .bind(stamp, room.threadId)
    .run();
  return {
    ok: true,
    message: publicMessage(
      await db
        .prepare("SELECT * FROM chat_messages WHERE id=?")
        .bind(result.meta.last_row_id)
        .first(),
    ),
  };
}
export async function reportChat(db, p, user) {
  const reason = ["spam", "harassment", "inappropriate"].includes(p.reason)
      ? p.reason
      : "inappropriate",
    m = await db
      .prepare("SELECT * FROM chat_messages WHERE id=?")
      .bind(Number(p.messageId) || 0)
      .first();
  if (!m) return { ok: false, error: "Mensaje no encontrado." };
  const room = await roomAccess(
    db,
    m.thread_id
      ? { roomType: "private", threadId: m.thread_id }
      : { roomType: m.room_type, gameId: m.game_id },
    user,
  );
  if (!room.ok) return room;
  if (m.sender_key === user.username_key)
    return { ok: false, error: "No puedes reportar tu propio mensaje." };
  await db
    .prepare(
      "INSERT OR IGNORE INTO chat_reports(message_id,reporter,reporter_key,reason,created_at) VALUES(?,?,?,?,?)",
    )
    .bind(m.id, user.username, user.username_key, reason, now())
    .run();
  return { ok: true };
}
export async function systemChat(db, gameId, eventKey, body) {
  const thread = await threadForGame(db, String(gameId).toUpperCase(), false);
  if (!thread) return;
  await db
    .prepare(
      "INSERT OR IGNORE INTO chat_messages(room_type,game_id,thread_id,sender,sender_key,kind,body,event_key,created_at) VALUES('game',?,?,'','','system',?,?,?)",
    )
    .bind(
      String(gameId).toUpperCase(),
      thread.id,
      String(body),
      `${String(gameId).toUpperCase()}:${eventKey}`,
      now(),
    )
    .run();
}
export async function adminChat(db, action, p, user) {
  if (user.role !== "admin")
    return { ok: false, error: "Acceso de administrador requerido." };
  if (action === "adminChatMessages") {
    const { results } = await db
      .prepare(
        "SELECT m.*,COUNT(r.id) report_count FROM chat_messages m LEFT JOIN chat_reports r ON r.message_id=m.id GROUP BY m.id ORDER BY m.id DESC LIMIT 300",
      )
      .all();
    return {
      ok: true,
      messages: results.map((m) => ({
        ...publicMessage(m),
        reportCount: Number(m.report_count) || 0,
      })),
    };
  }
  // La administracion no necesita leer el chat como un rio de mensajes sueltos:
  // necesita saber que conversaciones existen, entre quienes y cual merece una
  // mirada. Los mensajes se piden despues, uno a uno, con `adminChatThread`.
  if (action === "adminChatThreads") {
    const [threads, lobby] = await Promise.all([
      db
        .prepare(
          `SELECT t.id,t.user1,t.user2,t.last_message_at,t.last_game_at,t.latest_game_id,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id=t.id) messages,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id=t.id AND m.kind='user') written,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id=t.id AND m.kind='nudge') nudges,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id=t.id AND m.deleted_at IS NOT NULL) deleted,
            (SELECT COUNT(*) FROM chat_reports r JOIN chat_messages m ON m.id=r.message_id
              WHERE m.thread_id=t.id AND r.status='open') reports,
            (SELECT MAX(created_at) FROM chat_messages m WHERE m.thread_id=t.id) last_at
           FROM chat_threads t
           ORDER BY COALESCE(t.last_message_at,t.last_game_at) DESC LIMIT 300`,
        )
        .all(),
      db
        .prepare(
          `SELECT COUNT(*) messages,MAX(created_at) last_at,COUNT(DISTINCT sender_key) people,
            SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) deleted
           FROM chat_messages WHERE room_type='lobby' AND thread_id IS NULL`,
        )
        .first(),
    ]);
    return {
      ok: true,
      lobby: {
        id: 0,
        roomType: "lobby",
        messages: Number(lobby?.messages) || 0,
        people: Number(lobby?.people) || 0,
        deleted: Number(lobby?.deleted) || 0,
        lastActivity: lobby?.last_at || "",
      },
      threads: threads.results.map((t) => ({
        id: Number(t.id),
        roomType: "private",
        user1: t.user1,
        user2: t.user2,
        gameId: t.latest_game_id || "",
        messages: Number(t.messages) || 0,
        written: Number(t.written) || 0,
        nudges: Number(t.nudges) || 0,
        deleted: Number(t.deleted) || 0,
        reports: Number(t.reports) || 0,
        lastActivity:
          t.last_at ||
          (t.last_message_at && t.last_message_at > t.last_game_at
            ? t.last_message_at
            : t.last_game_at),
      })),
    };
  }
  if (action === "adminChatThread") {
    const threadId = Number(p.threadId) || 0;
    const rows = threadId
      ? await db
          .prepare(
            `SELECT m.*,(SELECT COUNT(*) FROM chat_reports r WHERE r.message_id=m.id) report_count
             FROM chat_messages m WHERE m.thread_id=? ORDER BY m.id DESC LIMIT 400`,
          )
          .bind(threadId)
          .all()
      : await db
          .prepare(
            `SELECT m.*,(SELECT COUNT(*) FROM chat_reports r WHERE r.message_id=m.id) report_count
             FROM chat_messages m WHERE m.room_type='lobby' AND m.thread_id IS NULL
             ORDER BY m.id DESC LIMIT 400`,
          )
          .all();
    const thread = threadId
      ? await db.prepare("SELECT * FROM chat_threads WHERE id=?").bind(threadId).first()
      : null;
    if (threadId && !thread)
      return { ok: false, error: "Conversación no encontrada." };
    return {
      ok: true,
      threadId,
      title: thread ? `${thread.user1} · ${thread.user2}` : "Chat del lobby",
      gameId: thread?.latest_game_id || "",
      messages: rows.results.reverse().map((m) => ({
        ...publicMessage(m),
        body: m.deleted_at ? "" : m.body,
        deletedBy: m.deleted_by || "",
        reportCount: Number(m.report_count) || 0,
      })),
    };
  }
  if (action === "adminChatReports") {
    const { results } = await db
      .prepare(
        "SELECT r.*,m.room_type,m.game_id,m.sender,m.body,m.deleted_at FROM chat_reports r JOIN chat_messages m ON m.id=r.message_id ORDER BY r.id DESC LIMIT 300",
      )
      .all();
    return { ok: true, reports: results };
  }
  if (action === "adminDeleteChatMessage") {
    const id = Number(p.messageId) || 0;
    await db
      .prepare("UPDATE chat_messages SET deleted_at=?,deleted_by=? WHERE id=?")
      .bind(now(), user.username, id)
      .run();
    await db
      .prepare("UPDATE chat_reports SET status='resolved' WHERE message_id=?")
      .bind(id)
      .run();
    return { ok: true };
  }
  if (action === "adminMuteChatUser") {
    const target = key(p.target),
      minutes = parseInt(p.minutes, 10),
      until =
        minutes > 0
          ? new Date(Date.now() + minutes * 60000).toISOString()
          : null;
    if (!target) return { ok: false, error: "Usuario no encontrado." };
    await db
      .prepare(
        "INSERT INTO chat_mutes(username_key,muted_until,created_by,created_at) VALUES(?,?,?,?) ON CONFLICT(username_key) DO UPDATE SET muted_until=excluded.muted_until,created_by=excluded.created_by,created_at=excluded.created_at",
      )
      .bind(target, until, user.username, now())
      .run();
    return { ok: true, mutedUntil: until };
  }
  if (action === "adminUnmuteChatUser") {
    await db
      .prepare("DELETE FROM chat_mutes WHERE username_key=?")
      .bind(key(p.target))
      .run();
    return { ok: true };
  }
  return { ok: false, error: "Acción administrativa de chat desconocida." };
}
export { CHAT, messageError };
