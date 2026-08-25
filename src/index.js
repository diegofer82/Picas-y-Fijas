import {
  LIMITS,
  cleanCountry,
  cleanName,
  evaluate,
  expiredTurnChanges,
  freshTurnClock,
  gameMeta,
  hasClock,
  isBankGame,
  maxSymbolFor,
  padCode,
  parseJsonList,
  sanitizeGame,
  timerRemaining,
  toInt,
  truthy,
  usernameKey,
  validateCode,
} from "./game.js";
import { authenticate, hashPin, login, requestOrigin, validPin } from "./security.js";
import {
  adminDeleteUser,
  adminMergeUsers,
  adminPurgeGames,
  adminSql,
  adminSummary,
  adminUserDetail,
  adminUsers,
} from "./admin.js";
import {
  adminDeleteFeedback,
  adminFeedback,
  adminUpdateFeedback,
  notifyFeedback,
  submitFeedback,
} from "./feedback.js";
import {
  activateThreadForGame,
  adminChat,
  listChat,
  listThreads,
  reportChat,
  sendChat,
  sendNudge,
  systemChat,
  threadForGame,
} from "./chat.js";
import { cleanupDatabase } from "./maintenance.js";

const PROTECTED = new Set([
  "createGame",
  "joinGame",
  "state",
  "guess",
  "passTurn",
  "togglePause",
  "myGames",
  "history",
  "historyGame",
  "rematch",
  "closeGame",
  "presence",
  "leavePresence",
  "gamePresence",
  "chatList",
  "chatThreads",
  "chatSend",
  "chatReport",
  "chatNudge",
]);
const ADMIN_ACTIONS = new Set([
  "adminSummary",
  "adminUsers",
  "adminGames",
  "adminAudit",
  "adminSetBlocked",
  "adminSetRole",
  "adminCloseGame",
  "adminResetPin",
  "adminSetGameResult",
  "adminExport",
  "adminChatMessages",
  "adminChatThreads",
  "adminChatThread",
  "adminChatReports",
  "adminDeleteChatMessage",
  "adminMuteChatUser",
  "adminUnmuteChatUser",
  "adminUserDetail",
  "adminMergeUsers",
  "adminDeleteUser",
  "adminPurgeGames",
  "adminCloseSessions",
  "adminSql",
  "adminFeedback",
  "adminUpdateFeedback",
  "adminDeleteFeedback",
]);
const PASSIVE_PRESENCE_ACTIONS = new Set([
  "chatList",
  "chatSend",
  "chatReport",
  "chatNudge",
]);
const GAME_COLUMNS = new Set([
  "status",
  "p2",
  "secret2",
  "turn",
  "guesses",
  "winner",
  "updated_at",
  "turn_started_at",
  "rematch_id",
  "pending_winner",
  "country2",
  "turn_remaining",
  "timer_paused",
  "manual_paused_by",
  "manual_pause_until",
  "last_manual_pause_at",
  "lobby_paused_by",
  "timer_ready_by",
  "timer_activated",
  "finish_reason",
  "bank1_remaining",
  "bank2_remaining",
]);
class ConflictError extends Error {}
const PRESENCE_TOUCH_MS = 60 * 1000;

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
const error = (message, status = 200) =>
  json({ ok: false, error: message }, status);
const now = () => new Date().toISOString();

async function bodyParams(request) {
  if (request.method === "GET")
    return Object.fromEntries(new URL(request.url).searchParams);
  if (!request.body) return {};
  const maxBytes = 32 * 1024;
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("Solicitud demasiado grande.");
  const reader = request.body.getReader(),
    chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Solicitud demasiado grande.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {};
  }
}

async function getGame(db, gameId) {
  return db
    .prepare("SELECT * FROM games WHERE game_id=?")
    .bind(
      String(gameId || "")
        .trim()
        .toUpperCase(),
    )
    .first();
}

async function saveGame(db, game, changes) {
  const entries = Object.entries(changes).filter(([key]) =>
    GAME_COLUMNS.has(key),
  );
  if (!entries.length) return game;
  const setSql = entries.map(([key]) => `${key}=?`).join(",");
  const result = await db
    .prepare(
      `UPDATE games SET ${setSql},version=version+1 WHERE game_id=? AND version=?`,
    )
    .bind(...entries.map(([, value]) => value), game.game_id, game.version)
    .run();
  if (result.meta.changes !== 1)
    throw new ConflictError(
      "La partida cambió mientras se procesaba la acción.",
    );
  return { ...game, ...changes, version: game.version + 1 };
}

async function withConflictRetry(task) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await task();
    } catch (cause) {
      if (!(cause instanceof ConflictError) || attempt === 2) throw cause;
    }
  }
}

async function touchPresence(db, user, gameId = null, location = "lobby") {
  const stamp = now();
  const cutoff = new Date(Date.now() - PRESENCE_TOUCH_MS).toISOString();
  await db
    .prepare(
      `INSERT INTO presence(username_key,username,game_id,location,last_seen_at) VALUES(?,?,?,?,?)
    ON CONFLICT(username_key) DO UPDATE SET username=excluded.username,game_id=excluded.game_id,location=excluded.location,last_seen_at=excluded.last_seen_at
    WHERE presence.username<>excluded.username
       OR COALESCE(presence.game_id,'')<>COALESCE(excluded.game_id,'')
       OR presence.location<>excluded.location
       OR presence.last_seen_at<?`,
    )
    .bind(user.username_key, user.username, gameId || null, location, stamp, cutoff)
    .run();
}

async function onlineCount(db) {
  const cutoff = new Date(Date.now() - LIMITS.presenceMs).toISOString();
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM presence WHERE last_seen_at>=?")
    .bind(cutoff)
    .first();
  return Number(row?.count) || 0;
}

function gameInsertValues(params, username, gameId, source = null) {
  const digits = source ? source.digits : toInt(params.digits, 3);
  const mode = source
    ? source.mode
    : params.mode === "colors"
      ? "colors"
      : "numbers";
  const numColors = source
    ? source.num_colors
    : mode === "colors"
      ? toInt(params.numColors, 6)
      : 10;
  const allowRepeats = source
    ? truthy(source.allow_repeats)
    : truthy(params.allowRepeats);
  const isPublic = source
    ? false
    : params.isPublic === undefined
      ? true
      : truthy(params.isPublic);
  const revealSecrets = source
    ? truthy(source.reveal_secrets)
    : truthy(params.revealSecrets);
  const maxAttempts = source
    ? toInt(source.max_attempts)
    : Math.max(0, toInt(params.maxAttempts));
  // El reloj tiene tres formas: sin limite, cronometro por turno (lo de
  // siempre) y bolsa de tiempo. Son excluyentes, asi que elegir bolsa deja
  // `turnSeconds` en cero y al reves.
  const timeMode = source
    ? (String(source.time_mode || "turn") === "bank" ? "bank" : "turn")
    : params.timeMode === "bank"
      ? "bank"
      : "turn";
  const bankSeconds = source
    ? toInt(source.bank_seconds)
    : timeMode === "bank"
      ? Math.max(0, toInt(params.bankSeconds))
      : 0;
  const bankIncrement = source
    ? toInt(source.bank_increment)
    : timeMode === "bank"
      ? Math.max(0, toInt(params.bankIncrement))
      : 0;
  const turnSeconds = source
    ? toInt(source.turn_seconds)
    : timeMode === "bank"
      ? 0
      : Math.max(0, toInt(params.turnSeconds));
  return {
    gameId,
    digits,
    mode,
    numColors,
    allowRepeats,
    isPublic,
    revealSecrets,
    maxAttempts,
    turnSeconds,
    timeMode,
    bankSeconds,
    bankIncrement,
    username,
    secret: String(params.secret || "").trim(),
    country: cleanCountry(params.country),
  };
}

function validateGameOptions(options) {
  if (![3, 4, 5, 6].includes(options.digits))
    return "Longitud debe ser 3, 4, 5 o 6.";
  if (options.mode === "colors" && ![4, 6, 8].includes(options.numColors))
    return "El número de colores debe ser 4, 6 u 8.";
  if (
    options.mode === "colors" &&
    !options.allowRepeats &&
    options.digits > options.numColors
  )
    return "No hay suficientes colores distintos para esa longitud. Permite repetidos o elige más colores.";
  if (![0, 6, 10].includes(options.maxAttempts))
    return "El límite de intentos debe ser ilimitado, 6 o 10.";
  if (![0, 30, 60, 120].includes(options.turnSeconds))
    return "El tiempo por turno debe ser ilimitado, 30, 60 o 120 segundos.";
  // Los dos relojes son excluyentes por construccion: `gameInsertValues` deja
  // en cero el que no se eligio. Aqui solo se validan los valores de la bolsa.
  if (options.timeMode === "bank") {
    if (![180, 300, 600].includes(options.bankSeconds))
      return "La bolsa de tiempo debe ser de 3, 5 o 10 minutos.";
    if (![0, 3, 5, 10].includes(options.bankIncrement))
      return "El incremento debe ser 0, 3, 5 o 10 segundos.";
  }
  return validateCode(
    options.secret,
    options.digits,
    options.allowRepeats,
    maxSymbolFor(options.mode, options.numColors),
  );
}

async function newGameId(db) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 50; attempt++) {
    let id = "";
    const random = new Uint8Array(4);
    crypto.getRandomValues(random);
    for (const byte of random) id += alphabet[byte % alphabet.length];
    if (!(await getGame(db, id))) return id;
  }
  throw new Error("No se pudo generar un código de partida.");
}

async function createGame(db, params, user, source = null) {
  const id = await newGameId(db);
  const options = gameInsertValues(params, user.username, id, source);
  const validation = validateGameOptions(options);
  if (validation) return { ok: false, error: validation };
  const cutoff = new Date(Date.now() - LIMITS.createCooldownMs).toISOString();
  const counts = await db
    .prepare(
      `SELECT
    SUM(CASE WHEN status IN ('waiting','active') THEN 1 ELSE 0 END) AS open_count,
    MAX(created_at) AS last_created FROM games WHERE p1=? OR p2=?`,
    )
    .bind(user.username, user.username)
    .first();
  if (Number(counts?.open_count) >= LIMITS.maxOpenGames)
    return {
      ok: false,
      error: "Solo puedes tener 3 partidas abiertas o activas al mismo tiempo.",
    };
  if (!source && counts?.last_created && counts.last_created > cutoff)
    return {
      ok: false,
      error: "Espera 10 segundos antes de crear otra partida.",
    };
  const stamp = now();
  const values = [
    id,
    "waiting",
    options.digits,
    user.username,
    options.secret,
    "",
    "",
    0,
    "[]",
    "",
    stamp,
    stamp,
    options.allowRepeats ? 1 : 0,
    options.isPublic ? 1 : 0,
    options.mode,
    options.numColors,
    options.maxAttempts,
    options.turnSeconds,
    "",
    "",
    "",
    options.country,
    "",
    options.turnSeconds,
    options.turnSeconds > 0 || options.bankSeconds > 0 ? 1 : 0,
    "",
    "",
    "",
    "",
    options.revealSecrets ? 1 : 0,
    "",
    0,
    "",
    options.timeMode,
    options.bankSeconds,
    options.bankIncrement,
    options.bankSeconds,
    options.bankSeconds,
  ];
  await db
    .prepare(
      `INSERT INTO games(game_id,status,digits,p1,secret1,p2,secret2,turn,guesses,winner,created_at,updated_at,
    allow_repeats,is_public,mode,num_colors,max_attempts,turn_seconds,turn_started_at,rematch_id,pending_winner,country1,country2,
    turn_remaining,timer_paused,manual_paused_by,manual_pause_until,last_manual_pause_at,lobby_paused_by,reveal_secrets,timer_ready_by,timer_activated,finish_reason,
    time_mode,bank_seconds,bank_increment,bank1_remaining,bank2_remaining)
    VALUES(${values.map(() => "?").join(",")})`,
    )
    .bind(...values)
    .run();
  return { ok: true, gameId: id };
}

async function listGames(db) {
  const cutoff = new Date(Date.now() - LIMITS.waitingTtlMs).toISOString();
  const inactiveCutoff = new Date(Date.now() - LIMITS.activeTtlMs).toISOString();
  const { results } = await db
    .prepare(
      `SELECT * FROM games
       WHERE (status='waiting' AND created_at>=?) OR (status='active' AND updated_at>=?)
       ORDER BY created_at DESC`,
    )
    .bind(cutoff, inactiveCutoff)
    .all();
  const games = results
    .filter((g) => g.status === "waiting" && truthy(g.is_public))
    .slice(0, 30)
    .map((g) => ({ ...gameMeta(g), createdAt: g.created_at }));
  return {
    ok: true,
    games,
    activeCount: results.filter((g) => g.status === "active").length,
    privateCount: results.filter((g) => !truthy(g.is_public)).length,
    publicActiveCount: results.filter(
      (g) => g.status === "active" && truthy(g.is_public),
    ).length,
    publicOpenCount: games.length,
    onlineCount: await onlineCount(db),
  };
}

async function joinGame(db, params, user) {
  return withConflictRetry(async () => {
    const game = await getGame(db, params.gameId);
    if (!game) return { ok: false, error: "Partida no encontrada." };
    if (game.status !== "waiting")
      return { ok: false, error: "Esta partida ya no acepta jugadores." };
    if (Date.now() - Date.parse(game.created_at) > LIMITS.waitingTtlMs)
      return { ok: false, error: "La partida ha expirado." };
    if (game.p1 === user.username)
      return {
        ok: false,
        error: "No puedes unirte a tu propia partida con el mismo nombre.",
      };
    const validation = validateCode(
      params.secret,
      game.digits,
      truthy(game.allow_repeats),
      maxSymbolFor(game.mode, game.num_colors),
    );
    if (validation) return { ok: false, error: validation };
    const timed = toInt(game.turn_seconds) > 0;
    const updated = await saveGame(db, game, {
      p2: user.username,
      secret2: String(params.secret).trim(),
      country2: cleanCountry(params.country),
      status: "active",
      turn: (crypto.getRandomValues(new Uint8Array(1))[0] % 2) + 1,
      turn_started_at: timed ? "" : now(),
      turn_remaining: toInt(game.turn_seconds),
      timer_paused: timed ? 1 : 0,
      timer_ready_by: "",
      timer_activated: timed ? 0 : 1,
      updated_at: now(),
    });
    await activateThreadForGame(db, updated);
    await systemChat(db, updated.game_id, "started", `joined|${user.username}`);
    return { ok: true, gameId: updated.game_id };
  });
}

async function state(db, params, user) {
  return withConflictRetry(async () => {
    let game = await getGame(db, params.gameId);
    if (!game) return { ok: false, error: "Partida no encontrada." };
    if (
      game.status === "waiting" &&
      Date.now() - Date.parse(game.created_at) > LIMITS.waitingTtlMs
    )
      game = await saveGame(db, game, {
        status: "expired",
        turn: 0,
        updated_at: now(),
      });
    if (
      game.status === "active" &&
      Date.now() - Date.parse(game.updated_at) > LIMITS.activeTtlMs
    )
      game = await saveGame(db, game, {
        status: "inactive",
        turn: 0,
        turn_started_at: "",
        updated_at: now(),
      });
    const closed = {
      expired: "La partida ha expirado.",
      inactive: "La partida se cerró tras 48 horas sin actividad.",
      abandoned: "Un jugador abandonó la partida.",
      cancelled: "La partida fue cancelada.",
    };
    if (closed[game.status]) return { ok: false, error: closed[game.status] };
    const participant = game.p1 === user.username || game.p2 === user.username;
    if (game.status === "active" && participant && hasClock(game)) {
      const checkedAt = Date.now();
      const manualExpired = Boolean(
        game.manual_paused_by &&
          Date.parse(game.manual_pause_until) <= checkedAt,
      );
      const autoResumeFrom = manualExpired ? game.manual_paused_by : "";
      const changes = {};
      let manualPausedBy = manualExpired ? "" : game.manual_paused_by;
      let lobby = parseJsonList(game.lobby_paused_by);
      let pauseStateChanged = false;
      if (manualExpired) {
        Object.assign(changes, {
          manual_paused_by: "",
          manual_pause_until: "",
          last_manual_pause_at: now(),
        });
        pauseStateChanged = true;
      }
      if (lobby.includes(user.username)) {
        lobby = lobby.filter((name) => name !== user.username);
        changes.lobby_paused_by = lobby.length ? JSON.stringify(lobby) : "";
        pauseStateChanged = true;
      }
      if (pauseStateChanged) {
        const held = Boolean(manualPausedBy) || lobby.length > 0;
        changes.timer_paused = held ? 1 : 0;
        changes.turn_started_at = held ? "" : now();
      }
      if (!truthy(game.timer_activated)) {
        const ready = parseJsonList(game.timer_ready_by);
        if (!ready.includes(user.username)) ready.push(user.username);
        const both = ready.includes(game.p1) && ready.includes(game.p2);
        Object.assign(changes, {
          timer_ready_by: JSON.stringify(ready),
          timer_activated: both ? 1 : 0,
          timer_paused: both ? 0 : 1,
          turn_remaining: game.turn_seconds,
          turn_started_at: both
            ? new Date(checkedAt + LIMITS.turnStartGraceMs).toISOString()
            : "",
        });
      }
      if (Object.keys(changes).length)
        game = await saveGame(db, game, { ...changes, updated_at: now() });
      if (autoResumeFrom)
        await systemChat(
          db,
          game.game_id,
          `auto-resume:${game.version}`,
          `resumed|${autoResumeFrom}`,
        );
      const expired = expiredTurnChanges(game);
      if (expired)
        game = await saveGame(db, game, { ...expired, updated_at: now() });
    }
    const response = sanitizeGame(game, user.username);
    if (participant && game.p2) {
      // El hilo es estable para la pareja. Tras la primera respuesta el
      // navegador devuelve su id y evita una lectura en cada polling de 2 s.
      const knownThreadId = Math.max(0, toInt(params.chatThreadId));
      if (knownThreadId) response.chatThreadId = knownThreadId;
      else {
        const thread = await threadForGame(db, game, false);
        response.chatThreadId = Number(thread?.id) || 0;
      }
      response.chatOpponent = game.p1 === user.username ? game.p2 : game.p1;
    }
    return response;
  });
}

async function myGames(db, user) {
  const { results } = await db
    .prepare(
      `WITH candidates(game_id) AS (
         SELECT game_id FROM games WHERE p1=? AND status IN ('waiting','active')
         UNION SELECT game_id FROM games WHERE p2=? AND status IN ('waiting','active')
         UNION SELECT rematch_id FROM games WHERE p1=? AND status='finished' AND rematch_id<>''
         UNION SELECT rematch_id FROM games WHERE p2=? AND status='finished' AND rematch_id<>''
       )
       SELECT g.* FROM games g JOIN candidates c ON c.game_id=g.game_id
       WHERE g.status IN ('waiting','active')
       ORDER BY g.updated_at DESC LIMIT 100`,
    )
    .bind(user.username, user.username, user.username, user.username)
    .all();
  const out = results
    .filter(
      (game) =>
        !["finished", "expired", "cancelled", "abandoned", "inactive"].includes(
          game.status,
        ),
    )
    .map((game) => {
      const meta = { ...gameMeta(game), status: game.status };
      meta.yourTurn =
        game.status === "active" &&
        ((game.turn === 1 && game.p1 === user.username) ||
          (game.turn === 2 && game.p2 === user.username));
      meta.rematchInvite =
        game.status === "waiting" &&
        game.p1 !== user.username &&
        game.p2 !== user.username;
      return meta;
    });
  out.sort(
    (a, b) =>
      Number(Boolean(b.rematchInvite)) - Number(Boolean(a.rematchInvite)) ||
      String(b.updatedAt).localeCompare(String(a.updatedAt)),
  );
  return { ok: true, games: out, onlineCount: await onlineCount(db) };
}

async function makeGuess(db, params, user) {
  return withConflictRetry(async () => {
    const game = await getGame(db, params.gameId);
    if (!game) return { ok: false, error: "Partida no encontrada." };
    const requestId = String(params.requestId || "")
      .replace(/[^A-Za-z0-9-]/g, "")
      .slice(0, 80);
    if (requestId) {
      const receipt = await db
        .prepare(
          "SELECT response_json FROM request_receipts WHERE request_id=? AND username_key=?",
        )
        .bind(requestId, user.username_key)
        .first();
      if (receipt) return JSON.parse(receipt.response_json);
    }
    if (game.status !== "active")
      return { ok: false, error: "La partida no está activa." };
    if (
      game.manual_paused_by ||
      parseJsonList(game.lobby_paused_by).length ||
      truthy(game.timer_paused)
    )
      return { ok: false, error: "La partida está en pausa." };
    const youAre =
      game.p1 === user.username ? 1 : game.p2 === user.username ? 2 : 0;
    if (!youAre)
      return { ok: false, error: "No eres jugador de esta partida." };
    const expired = expiredTurnChanges(game);
    if (expired) {
      const updated = await saveGame(db, game, {
        ...expired,
        updated_at: now(),
      });
      if (updated.status === "finished")
        await systemChat(
          db,
          game.game_id,
          `finished:${updated.version}`,
          "finished|",
        );
      return {
        ok: false,
        error: isBankGame(game)
          ? "Se te acabó la bolsa de tiempo."
          : "El tiempo del turno terminó.",
        state: sanitizeGame(updated, user.username),
      };
    }
    if (game.turn !== youAre) return { ok: false, error: "No es tu turno." };
    const validation = validateCode(
      params.guess,
      game.digits,
      truthy(game.allow_repeats),
      maxSymbolFor(game.mode, game.num_colors),
    );
    if (validation) return { ok: false, error: validation };
    const guesses = parseJsonList(game.guesses),
      mineCount = guesses.filter((g) => g.by === user.username).length;
    if (game.max_attempts > 0 && mineCount >= game.max_attempts)
      return { ok: false, error: "Sin intentos restantes." };
    const opponent = youAre === 1 ? game.p2 : game.p1;
    const result = evaluate(
      padCode(youAre === 1 ? game.secret2 : game.secret1, game.digits),
      padCode(params.guess, game.digits),
    );
    guesses.push({
      by: user.username,
      guess: padCode(params.guess, game.digits),
      ...result,
      ts: now(),
      requestId,
    });
    const mineNow = mineCount + 1,
      oppNow = guesses.filter((g) => g.by === opponent).length,
      solved = result.fijas === game.digits;
    const response = {
      ok: true,
      ...result,
      solved,
      win: false,
      pending: false,
      tie: false,
      draw: false,
    };
    const changes = { guesses: JSON.stringify(guesses), updated_at: now() };
    if (game.pending_winner) {
      changes.status = "finished";
      changes.pending_winner = "";
      changes.timer_paused = 1;
      if (solved) {
        changes.winner = "";
        response.tie = true;
        response.draw = true;
      } else changes.winner = game.pending_winner;
    } else if (solved) {
      if (mineNow > oppNow) {
        changes.pending_winner = user.username;
        changes.turn = youAre === 1 ? 2 : 1;
        Object.assign(changes, freshTurnClock(game));
        response.pending = true;
      } else {
        changes.status = "finished";
        changes.winner = user.username;
        changes.timer_paused = 1;
        response.win = true;
      }
    } else if (
      game.max_attempts > 0 &&
      mineNow >= game.max_attempts &&
      oppNow >= game.max_attempts
    ) {
      changes.status = "finished";
      changes.winner = "";
      changes.timer_paused = 1;
      response.draw = true;
    } else {
      changes.turn = youAre === 1 ? 2 : 1;
      Object.assign(changes, freshTurnClock(game));
    }
    const updated = await saveGame(db, game, changes);
    response.state = sanitizeGame(updated, user.username);
    if (updated.status === "finished")
      await systemChat(
        db,
        game.game_id,
        `finished:${updated.version}`,
        "finished|",
      );
    if (requestId)
      await db
        .prepare(
          "INSERT OR IGNORE INTO request_receipts(request_id,username_key,game_id,response_json,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          requestId,
          user.username_key,
          game.game_id,
          JSON.stringify(response),
          now(),
        )
        .run();
    return response;
  });
}

async function passTurn(db, params, user) {
  return withConflictRetry(async () => {
    const game = await getGame(db, params.gameId);
    if (!game) return { ok: false, error: "Partida no encontrada." };
    if (game.status !== "active")
      return { ok: false, error: "La partida no está activa." };
    if (game.p1 !== user.username && game.p2 !== user.username)
      return { ok: false, error: "No eres jugador de esta partida." };
    if (!hasClock(game))
      return { ok: false, error: "Esta partida no tiene cronómetro." };
    if (truthy(game.timer_paused))
      return { ok: false, error: "El cronómetro está en pausa." };
    // Con bolsa de tiempo no se pasa el turno: agotar la bolsa pierde la
    // partida. El navegador avisa igual que con el cronometro, pero quien
    // decide es el servidor, que vuelve a hacer la cuenta antes de cerrar.
    if (isBankGame(game)) {
      const flag = expiredTurnChanges(game);
      if (!flag) return { ok: false, error: "Aún queda tiempo." };
      const closed = await saveGame(db, game, { ...flag, updated_at: now() });
      await systemChat(
        db,
        game.game_id,
        `finished:${closed.version}`,
        "finished|",
      );
      return { ok: true, resolved: true, timeout: true };
    }
    if (timerRemaining(game) > 0)
      return { ok: false, error: "Aún queda tiempo." };
    const changes = game.pending_winner
      ? {
          status: "finished",
          winner: game.pending_winner,
          pending_winner: "",
          timer_paused: 1,
          updated_at: now(),
        }
      : {
          ...freshTurnClock(game),
          turn: game.turn === 1 ? 2 : 1,
          updated_at: now(),
        };
    const updated = await saveGame(db, game, changes);
    if (updated.status === "finished")
      await systemChat(
        db,
        game.game_id,
        `finished:${updated.version}`,
        "finished|",
      );
    return game.pending_winner
      ? { ok: true, resolved: true }
      : { ok: true, passed: true };
  });
}

async function closeGame(db, params, user) {
  return withConflictRetry(async () => {
    const game = await getGame(db, params.gameId);
    if (!game) return { ok: false, error: "Partida no encontrada." };
    const youAre =
      game.p1 === user.username ? 1 : game.p2 === user.username ? 2 : 0;
    if (!youAre)
      return { ok: false, error: "No eres jugador de esta partida." };
    if (game.status === "waiting") {
      if (params.intent === "abandon")
        return { ok: false, error: "La partida todavía no ha comenzado." };
      if (youAre !== 1)
        return {
          ok: false,
          error: "Solo el creador puede cancelar esta partida.",
        };
      await saveGame(db, game, {
        status: "cancelled",
        turn: 0,
        turn_started_at: "",
        pending_winner: "",
        updated_at: now(),
      });
      return { ok: true, status: "cancelled" };
    }
    if (game.status === "active") {
      if (params.intent === "cancel")
        return {
          ok: false,
          error: "El rival ya se unió; la partida ya comenzó.",
        };
      const opponent = youAre === 1 ? game.p2 : game.p1;
      await saveGame(db, game, {
        status: "finished",
        winner: opponent,
        finish_reason: "abandon",
        turn: 0,
        turn_started_at: "",
        pending_winner: "",
        timer_paused: 1,
        manual_paused_by: "",
        manual_pause_until: "",
        lobby_paused_by: "",
        updated_at: now(),
      });
      await systemChat(
        db,
        game.game_id,
        "abandoned",
        `abandoned|${user.username}`,
      );
      return { ok: true, status: "finished", winner: opponent };
    }
    return { ok: false, error: "La partida ya está cerrada." };
  });
}

async function history(db, user) {
  const { results } = await db
    .prepare(
      `SELECT game_id,p1,p2,country1,country2,winner,digits,mode,num_colors,allow_repeats,max_attempts,turn_seconds,
              time_mode,bank_seconds,bank_increment,guesses,finish_reason,updated_at
       FROM games WHERE status='finished' AND (p1=? OR p2=?) ORDER BY updated_at DESC`,
    )
    .bind(user.username, user.username)
    .all();
  const entries = results.map((g) => {
    const mine = g.p1 === user.username;
    const result = !g.winner
      ? "draw"
      : g.winner === user.username
        ? "win"
        : "loss";
    const guesses = parseJsonList(g.guesses);
    const myAttempts = guesses.filter((entry) => entry.by === user.username).length;
    const solved = guesses.some(
      (entry) => entry.by === user.username && toInt(entry.fijas) === toInt(g.digits),
    );
    return {
      gameId: g.game_id,
      opp: mine ? g.p2 : g.p1,
      oppCountry: mine ? g.country2 : g.country1,
      result,
      myAttempts,
      abandoned: g.finish_reason === "abandon",
      timedOut: g.finish_reason === "timeout",
      efficiencyEligible:
        result === "win" &&
        g.finish_reason !== "abandon" &&
        g.finish_reason !== "timeout" &&
        solved,
      digits: g.digits,
      mode: g.mode,
      numColors: g.num_colors,
      allowRepeats: truthy(g.allow_repeats),
      maxAttempts: g.max_attempts,
      turnSeconds: g.turn_seconds,
      timeMode: String(g.time_mode || "turn") === "bank" ? "bank" : "turn",
      bankSeconds: toInt(g.bank_seconds),
      bankIncrement: toInt(g.bank_increment),
      updatedAt: g.updated_at,
    };
  });
  const wins = entries.filter((entry) => entry.result === "win");
  const eligibleWins = entries.filter((entry) => entry.efficiencyEligible);
  const best = eligibleWins.reduce(
    (selected, entry) => !selected || entry.myAttempts < selected.myAttempts ? entry : selected,
    null,
  );
  const hardestCandidate = eligibleWins.reduce(
    (selected, entry) => !selected || entry.myAttempts > selected.myAttempts ? entry : selected,
    null,
  );
  let currentStreak = 0;
  for (const entry of entries) {
    if (entry.result !== "win") break;
    currentStreak++;
  }
  let bestStreak = 0, runningStreak = 0;
  for (const entry of entries) {
    runningStreak = entry.result === "win" ? runningStreak + 1 : 0;
    bestStreak = Math.max(bestStreak, runningStreak);
  }
  return {
    ok: true,
    history: entries.slice(0, 40).map(({ efficiencyEligible, ...entry }) => entry),
    stats: {
      played: entries.length,
      wins: wins.length,
      losses: entries.filter((entry) => entry.result === "loss").length,
      draws: entries.filter((entry) => entry.result === "draw").length,
      winRate: entries.length ? Math.round((wins.length / entries.length) * 100) : 0,
      averageWinningAttempts: eligibleWins.length
        ? Math.round((eligibleWins.reduce((sum, entry) => sum + entry.myAttempts, 0) / eligibleWins.length) * 10) / 10
        : null,
      currentStreak,
      bestStreak,
      bestGameId: best?.gameId || "",
      hardestGameId: hardestCandidate && best && hardestCandidate.myAttempts > best.myAttempts
        ? hardestCandidate.gameId
        : "",
    },
  };
}

async function historyGame(db, params, user) {
  const game = await getGame(db, params.gameId);
  if (!game || game.status !== "finished")
    return { ok: false, error: "Partida terminada no encontrada." };
  if (game.p1 !== user.username && game.p2 !== user.username)
    return { ok: false, error: "No eres jugador de esta partida." };
  return sanitizeGame(game, user.username);
}

async function leaderboard(db, username) {
  const { results } = await db
    .prepare(
      `WITH players AS (SELECT p1 user,country1 country,updated_at,winner FROM games WHERE status='finished' UNION ALL SELECT p2,country2,updated_at,winner FROM games WHERE status='finished' AND p2<>''), ranked AS (SELECT user,SUM(CASE WHEN winner=user THEN 1 ELSE 0 END) wins,COUNT(*) played,MAX(country) country FROM players GROUP BY user) SELECT user,wins,played,country FROM ranked ORDER BY wins DESC,played ASC`,
    )
    .all();
  const key = cleanName(username),
    index = results.findIndex((x) => x.user === key);
  return {
    ok: true,
    ranking: results.slice(0, 50),
    total: results.length,
    me: index < 0 ? null : { ...results[index], rank: index + 1 },
  };
}

async function togglePause(db, params, user) {
  return withConflictRetry(async () => {
    const game = await getGame(db, params.gameId);
    if (!game) return { ok: false, error: "Partida no encontrada." };
    if (game.status !== "active")
      return { ok: false, error: "La partida no está activa." };
    if (game.p1 !== user.username && game.p2 !== user.username)
      return { ok: false, error: "No eres jugador de esta partida." };
    if (game.turn_seconds <= 0)
      return {
        ok: false,
        error:
          "La pausa manual solo está disponible en partidas con tiempo por turno.",
      };
    if (params.intent === "resume") {
      if (!game.manual_paused_by) return { ok: true };
      if (game.manual_paused_by !== user.username)
        return {
          ok: false,
          error: "Solo quien pidió la pausa puede reanudar.",
        };
      const held = parseJsonList(game.lobby_paused_by).length > 0;
      await saveGame(db, game, {
        manual_paused_by: "",
        manual_pause_until: "",
        last_manual_pause_at: now(),
        timer_paused: held ? 1 : 0,
        turn_remaining: timerRemaining(game),
        turn_started_at: held ? "" : now(),
        updated_at: now(),
      });
      await systemChat(
        db,
        game.game_id,
        `resume:${game.manual_pause_until}`,
        `resumed|${user.username}`,
      );
      return { ok: true };
    }
    if (game.manual_paused_by)
      return { ok: false, error: "La partida ya está pausada." };
    if (
      game.last_manual_pause_at &&
      Date.now() - Date.parse(game.last_manual_pause_at) <
        LIMITS.manualPauseCooldownMs
    )
      return { ok: false, error: "Espera un minuto antes de volver a pausar." };
    const until = new Date(Date.now() + LIMITS.manualPauseMs).toISOString();
    await saveGame(db, game, {
      manual_paused_by: user.username,
      manual_pause_until: until,
      timer_paused: 1,
      turn_remaining: timerRemaining(game),
      turn_started_at: "",
      updated_at: now(),
    });
    await systemChat(
      db,
      game.game_id,
      `pause:${until}`,
      `paused|${user.username}`,
    );
    return { ok: true, manualPauseUntil: until };
  });
}

async function gamePresence(db, params, user) {
  return withConflictRetry(async () => {
    let game = await getGame(db, params.gameId);
    if (!game) return { ok: false, error: "Partida no encontrada." };
    if (game.p1 !== user.username && game.p2 !== user.username)
      return { ok: false, error: "No eres jugador de esta partida." };
    const connected = truthy(params.connected);
    if (game.turn_seconds > 0 && game.status === "active") {
      let lobby = parseJsonList(game.lobby_paused_by),
        changes = {};
      if (!connected && String(params.reason || "") === "lobby") {
        if (!lobby.includes(user.username)) {
          lobby.push(user.username);
          changes = {
            lobby_paused_by: JSON.stringify(lobby),
            timer_paused: 1,
            turn_remaining: timerRemaining(game),
            turn_started_at: "",
            updated_at: now(),
          };
        }
      } else if (connected && lobby.includes(user.username)) {
        lobby = lobby.filter((name) => name !== user.username);
        const held = lobby.length > 0 || Boolean(game.manual_paused_by);
        changes = {
          lobby_paused_by: lobby.length ? JSON.stringify(lobby) : "",
          timer_paused: held ? 1 : 0,
          turn_started_at: held ? "" : now(),
          updated_at: now(),
        };
      }
      if (Object.keys(changes).length) game = await saveGame(db, game, changes);
    }
    await touchPresence(
      db,
      user,
      connected ? game.game_id : null,
      connected ? "game" : "lobby",
    );
    return {
      ok: true,
      timerPaused: truthy(game.timer_paused),
      turnRemaining: timerRemaining(game),
    };
  });
}

async function rematch(db, params, user) {
  return withConflictRetry(async () => {
    const old = await getGame(db, params.gameId);
    if (!old) return { ok: false, error: "Partida no encontrada." };
    if (old.status !== "finished")
      return { ok: false, error: "La partida aún no ha terminado." };
    if (old.p1 !== user.username && old.p2 !== user.username)
      return { ok: false, error: "No eres jugador de esta partida." };
    if (old.rematch_id) {
      const existing = await getGame(db, old.rematch_id);
      if (
        existing?.status === "active" ||
        (existing?.status === "waiting" && existing.p1 === user.username)
      )
        return { ok: true, gameId: existing.game_id, reused: true };
      if (existing?.status === "waiting")
        return joinGame(db, { ...params, gameId: existing.game_id }, user);
    }
    const created = await createGame(db, params, user, old);
    if (!created.ok) return created;
    await saveGame(db, old, { rematch_id: created.gameId, updated_at: now() });
    await systemChat(
      db,
      old.game_id,
      `rematch:${created.gameId}`,
      `rematch|${user.username}`,
    );
    return created;
  });
}

async function adminAction(db, action, params, user) {
  if (user.role !== "admin")
    return { ok: false, error: "Acceso de administrador requerido." };
  if (
    action.startsWith("adminChat") ||
    action === "adminDeleteChatMessage" ||
    action === "adminMuteChatUser" ||
    action === "adminUnmuteChatUser"
  )
    return adminChat(db, action, params, user);
  if (action === "adminSummary") return adminSummary(db, onlineCount);
  if (action === "adminUsers") return adminUsers(db);
  if (action === "adminUserDetail") return adminUserDetail(db, params.target);
  if (action === "adminFeedback") return adminFeedback(db, params);
  if (action === "adminGames") {
    const { results } = await db
      .prepare(
        "SELECT game_id,status,p1,p2,winner,created_at,updated_at,version FROM games ORDER BY updated_at DESC LIMIT 200",
      )
      .all();
    return { ok: true, games: results };
  }
  if (action === "adminAudit") {
    const { results } = await db
      .prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200")
      .all();
    return { ok: true, audit: results };
  }
  if (action === "adminExport") {
    const [users, games, audit, chatMessages, chatReports, chatMutes, feedback] =
      await Promise.all([
        db
          .prepare(
            `SELECT username,username_key,pin_salt,pin_hash,role,blocked_at,created_at,last_login_at,
              last_ip,last_country,signup_ip,signup_country,login_count FROM users`,
          )
          .all(),
        db.prepare("SELECT * FROM games").all(),
        db.prepare("SELECT * FROM audit_log ORDER BY id").all(),
        db.prepare("SELECT * FROM chat_messages ORDER BY id").all(),
        db.prepare("SELECT * FROM chat_reports ORDER BY id").all(),
        db.prepare("SELECT * FROM chat_mutes ORDER BY username_key").all(),
        db.prepare("SELECT * FROM feedback ORDER BY id").all(),
      ]);
    return {
      ok: true,
      exportedAt: now(),
      schemaVersion: 3,
      users: users.results,
      games: games.results,
      audit: audit.results,
      chatMessages: chatMessages.results,
      chatReports: chatReports.results,
      chatMutes: chatMutes.results,
      feedback: feedback.results,
    };
  }
  // Las herramientas de mantenimiento devuelven su propio detalle, asi que
  // registran su linea de auditoria aqui mismo en vez de compartir la del
  // final de la funcion.
  if (
    action === "adminMergeUsers" ||
    action === "adminDeleteUser" ||
    action === "adminPurgeGames" ||
    action === "adminSql"
  ) {
    const result =
      action === "adminMergeUsers"
        ? await adminMergeUsers(db, params)
        : action === "adminDeleteUser"
          ? await adminDeleteUser(db, params, user)
          : action === "adminPurgeGames"
            ? await adminPurgeGames(db, params)
            : await adminSql(db, params);
    const rehearsal = result.preview === true || result.pending === true;
    if (result.ok && !rehearsal)
      await logAudit(
        db,
        user,
        action,
        String(params.target || params.from || params.status || ""),
        action === "adminSql"
          ? { sql: String(params.sql || "").slice(0, 900), kind: result.kind, changes: result.changes ?? null }
          : { ...params },
      );
    return result;
  }
  const target = String(params.target || "");
  if (action === "adminCloseSessions") {
    const targetUser = await db
      .prepare("SELECT id FROM users WHERE username_key=?")
      .bind(usernameKey(target))
      .first();
    if (!targetUser) return { ok: false, error: "Usuario no encontrado." };
    await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(targetUser.id).run();
  } else if (action === "adminSetBlocked") {
    await db
      .prepare("UPDATE users SET blocked_at=? WHERE username_key=?")
      .bind(truthy(params.blocked) ? now() : null, usernameKey(target))
      .run();
  } else if (action === "adminSetRole") {
    const role = params.role === "admin" ? "admin" : "player";
    if (usernameKey(target) === "diego" && role !== "admin")
      return {
        ok: false,
        error: "No se puede retirar el administrador principal.",
      };
    await db
      .prepare("UPDATE users SET role=? WHERE username_key=?")
      .bind(role, usernameKey(target))
      .run();
  } else if (action === "adminResetPin") {
    if (!validPin(params.newPin))
      return { ok: false, error: "El PIN debe tener entre 4 y 8 dígitos." };
    const targetUser = await db
      .prepare("SELECT id FROM users WHERE username_key=?")
      .bind(usernameKey(target))
      .first();
    if (!targetUser) return { ok: false, error: "Usuario no encontrado." };
    const salt = crypto.randomUUID(),
      pinHash = await hashPin(params.newPin, salt);
    await db.batch([
      db
        .prepare("UPDATE users SET pin_salt=?,pin_hash=? WHERE id=?")
        .bind(salt, pinHash, targetUser.id),
      db.prepare("DELETE FROM sessions WHERE user_id=?").bind(targetUser.id),
    ]);
  } else if (action === "adminUpdateFeedback") {
    const result = await adminUpdateFeedback(db, params);
    if (!result.ok) return result;
  } else if (action === "adminDeleteFeedback") {
    const result = await adminDeleteFeedback(db, params);
    if (!result.ok) return result;
  } else if (action === "adminCloseGame") {
    await db
      .prepare(
        `UPDATE games SET status='cancelled',turn=0,updated_at=?,version=version+1 WHERE game_id=? AND status IN ('waiting','active')`,
      )
      .bind(now(), target.toUpperCase())
      .run();
  } else if (action === "adminSetGameResult") {
    const game = await getGame(db, target);
    if (!game) return { ok: false, error: "Partida no encontrada." };
    const winner = cleanName(params.winner);
    if (winner && winner !== game.p1 && winner !== game.p2)
      return {
        ok: false,
        error:
          "El ganador debe ser uno de los jugadores o quedar vacío para empate.",
      };
    await saveGame(db, game, {
      status: "finished",
      winner,
      turn: 0,
      timer_paused: 1,
      finish_reason: "admin-correction",
      updated_at: now(),
    });
  } else return { ok: false, error: "Acción administrativa desconocida." };
  await logAudit(db, user, action, target, params);
  return { ok: true };
}

async function logAudit(db, user, action, target, details) {
  const safeDetails = { ...details };
  delete safeDetails.newPin;
  delete safeDetails.sessionToken;
  delete safeDetails.action;
  await db
    .prepare(
      "INSERT INTO audit_log(admin_user_id,action,target,details_json,created_at) VALUES(?,?,?,?,?)",
    )
    .bind(user.id, action, String(target || ""), JSON.stringify(safeDetails), now())
    .run();
}

async function routeApi(request, env, ctx) {
  const params = await bodyParams(request);
  const action = String(params.action || "");
  if (action === "loginUser")
    return json(
      await login(env.DB, params, env.SESSION_TTL_HOURS, requestOrigin(request)),
    );
  // El buzon se abre desde la pantalla de inicio, donde todavia no hay sesion,
  // asi que es el unico endpoint que escribe sin autenticar. Si de todas formas
  // llega una sesion valida, el nombre se guarda para poder responder.
  if (action === "sendFeedback") {
    let author = "";
    try {
      const signed = await authenticate(env.DB, request, params);
      if (!signed.error) author = signed.user.username;
    } catch {
      author = "";
    }
    const result = await submitFeedback(
      env.DB,
      params,
      requestOrigin(request),
      author,
    );
    if (result.ok && result.entry) {
      const notify = notifyFeedback(env, result.entry);
      if (ctx?.waitUntil) ctx.waitUntil(notify);
      else await notify;
    }
    return json({ ok: result.ok, error: result.error });
  }
  let auth = null;
  if (PROTECTED.has(action) || ADMIN_ACTIONS.has(action)) {
    auth = await authenticate(env.DB, request, params);
    if (auth.error) return error(auth.error, 401);
    // Estas dos acciones administran su propia salida. Escribir presencia
    // antes de borrarla o cambiarla produciria dos escrituras contradictorias.
    if (
      action !== "leavePresence" &&
      action !== "gamePresence" &&
      !PASSIVE_PRESENCE_ACTIONS.has(action)
    )
      await touchPresence(
        env.DB,
        auth.user,
        params.gameId || null,
        params.gameId ? "game" : "lobby",
      );
  }
  let result;
  switch (action) {
    case "createGame":
      result = await createGame(env.DB, params, auth.user);
      break;
    case "listGames":
      result = await listGames(env.DB);
      break;
    case "joinGame":
      result = await joinGame(env.DB, params, auth.user);
      break;
    case "state":
      result = await state(env.DB, params, auth.user);
      break;
    case "guess":
      result = await makeGuess(env.DB, params, auth.user);
      break;
    case "passTurn":
      result = await passTurn(env.DB, params, auth.user);
      break;
    case "togglePause":
      result = await togglePause(env.DB, params, auth.user);
      break;
    case "myGames":
      result = await myGames(env.DB, auth.user);
      break;
    case "history":
      result = await history(env.DB, auth.user);
      break;
    case "historyGame":
      result = await historyGame(env.DB, params, auth.user);
      break;
    case "rematch":
      result = await rematch(env.DB, params, auth.user);
      break;
    case "closeGame":
      result = await closeGame(env.DB, params, auth.user);
      break;
    case "leavePresence":
      await env.DB.batch([
        env.DB.prepare("DELETE FROM presence WHERE username_key=?").bind(
          auth.user.username_key,
        ),
        env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(
          auth.tokenHash,
        ),
      ]);
      result = { ok: true };
      break;
    case "presence":
      result = { ok: true, onlineCount: await onlineCount(env.DB) };
      break;
    case "gamePresence":
      result = await gamePresence(env.DB, params, auth.user);
      break;
    case "leaderboard":
      result = await leaderboard(env.DB, params.username);
      break;
    case "chatList":
      result = await listChat(env.DB, params, auth.user);
      break;
    case "chatSend":
      result = await sendChat(env.DB, params, auth.user);
      break;
    case "chatReport":
      result = await reportChat(env.DB, params, auth.user);
      break;
    case "chatNudge":
      result = await sendNudge(env.DB, params, auth.user);
      break;
    default:
      if (ADMIN_ACTIONS.has(action))
        result = await adminAction(env.DB, action, params, auth.user);
      else result = { ok: false, error: `Acción desconocida: ${action}` };
  }
  return json(result);
}

// Las reglas ya estaban escritas y traducidas dentro del juego, pero solo se
// veian al pulsar "Como se juega", donde ningun buscador las lee. Estas tres
// paginas las publican con direccion propia. Las genera
// `tools/make-rules-pages.py` a partir de `RULES`, que sigue siendo la unica
// fuente del texto.
const RULES_PAGES = {
  "/como-se-juega": "/rules-es.html",
  "/en/how-to-play": "/rules-en.html",
  "/fr/comment-jouer": "/rules-fr.html",
};

// Anadir el juego a la pantalla de inicio es justo lo que mas gente pregunta y
// lo que ningun navegador explica igual: Android lo esconde en su menu y el
// iPhone no lo ofrece nunca. Estas paginas ensenan los pasos con dibujos, en
// los tres idiomas, y las genera `tools/make-install-pages.py` a partir de los
// mismos textos y dibujos que el juego usa dentro del lobby.
const INSTALL_PAGES = {
  "/instalar": "/install-es.html",
  "/en/install": "/install-en.html",
  "/fr/installer": "/install-fr.html",
};

export function assetPathFor(pathname) {
  if (pathname === "/") return "/index.html";
  if (pathname === "/admin") return "/admin.html";
  if (RULES_PAGES[pathname]) return RULES_PAGES[pathname];
  if (INSTALL_PAGES[pathname]) return INSTALL_PAGES[pathname];
  // Las direcciones por idioma sirven el mismo documento; lo unico que cambia
  // es la cabecera que reescribe `localizeHtml`.
  if (SEO_PAGES[pathname]) return "/index.html";
  return "";
}

// La administracion no debe aparecer nunca en un buscador. Su `noindex` va en
// el HTML, pero un rastreador solo lo lee si llega a la pagina; por eso
// robots.txt ya no le prohibe el paso. Esta cabecera dice lo mismo sin
// depender de que alguien parsee el documento.
function noIndex(response) {
  const headers = new Headers(response.headers);
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function noStoreHtml(response) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, max-age=0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const CANONICAL_HOST = "picasyfijas.fans";

// Un buscador solo puede ofrecer la version correcta de una pagina si cada
// idioma tiene su propia direccion. Las tres sirven la misma aplicacion: `/`
// y `/es` son la version espanola —`/es` existe porque alguien puede
// escribirla, y su canonica apunta a la raiz para no duplicar contenido— y
// `/en` y `/fr` son las otras dos. Los textos se reescriben al vuelo con
// HTMLRewriter, sin duplicar el HTML.
const SEO_ORIGIN = `https://${CANONICAL_HOST}`;

export const SEO_PAGES = {
  "/": { lang: "es", canonical: `${SEO_ORIGIN}/` },
  "/es": { lang: "es", canonical: `${SEO_ORIGIN}/` },
  "/en": { lang: "en", canonical: `${SEO_ORIGIN}/en` },
  "/fr": { lang: "fr", canonical: `${SEO_ORIGIN}/fr` },
};

const SEO_TEXT = {
  es: {
    locale: "es_ES",
    image: `${SEO_ORIGIN}/og-es.png`,
    imageAlt: "Picas y Fijas · duelo de deducción online",
    title: "Picas y Fijas · Juego de deducción online (Bulls and Cows)",
    description:
      "Adivina el código secreto antes que tu rival. Picas y Fijas es el clásico Bulls and Cows / Mastermind: duelos online, práctica contra el computador y ranking. Gratis y sin instalar.",
    social:
      "Adivina el código secreto antes que tu rival. Duelos online, práctica contra el computador y ranking. Gratis y sin instalar.",
  },
  en: {
    locale: "en_US",
    image: `${SEO_ORIGIN}/og-en.png`,
    imageAlt: "Picas y Fijas · online deduction duel, also known as Bulls and Cows",
    title: "Bulls and Cows online · Picas y Fijas deduction game",
    description:
      "Crack your rival's secret code first. Picas y Fijas is the classic Bulls and Cows / Mastermind duel: online multiplayer matches, practice against the computer and rankings. Free, no install.",
    social:
      "Crack your rival's secret code first. Online matches, practice against the computer and rankings. Free, no install.",
  },
  fr: {
    locale: "fr_FR",
    image: `${SEO_ORIGIN}/og-fr.png`,
    imageAlt: "Picas y Fijas · duel de déduction en ligne, aussi appelé Bulls and Cows",
    title: "Bulls and Cows en ligne · Picas y Fijas, jeu de déduction",
    description:
      "Devine le code secret avant ton adversaire. Picas y Fijas, c'est le classique Bulls and Cows / Mastermind : duels en ligne, entraînement contre l'ordinateur et classement. Gratuit.",
    social:
      "Devine le code secret avant ton adversaire. Duels en ligne, entraînement contre l'ordinateur et classement. Gratuit.",
  },
};

export function seoFor(pathname) {
  const page = SEO_PAGES[pathname];
  if (!page) return null;
  return { ...page, ...SEO_TEXT[page.lang] };
}

function localizeHtml(response, seo) {
  const set = (attribute, value) => ({
    element(element) {
      element.setAttribute(attribute, value);
    },
  });
  return new HTMLRewriter()
    .on("html", set("lang", seo.lang))
    .on("title", {
      element(element) {
        element.setInnerContent(seo.title);
      },
    })
    .on('meta[name="description"]', set("content", seo.description))
    .on('link[rel="canonical"]', set("href", seo.canonical))
    .on('meta[property="og:title"]', set("content", seo.title))
    .on('meta[property="og:description"]', set("content", seo.social))
    .on('meta[property="og:url"]', set("content", seo.canonical))
    .on('meta[property="og:locale"]', set("content", seo.locale))
    .on('meta[property="og:image"]', set("content", seo.image))
    .on('meta[property="og:image:alt"]', set("content", seo.imageAlt))
    .on('meta[name="twitter:image"]', set("content", seo.image))
    .on('meta[name="twitter:title"]', set("content", seo.title))
    .on('meta[name="twitter:description"]', set("content", seo.social))
    .transform(response);
}

// Direcciones que responden pero no son la canonica. Se enumeran una a una en
// vez de redirigir "todo lo que no sea CANONICAL_HOST" para no dejar fuera de
// juego a `wrangler dev`, que sirve en localhost, ni arriesgar un bucle si
// algun dia se anade otro dominio.
export function canonicalRedirect(url) {
  const host = url.hostname;
  const alias = host === `www.${CANONICAL_HOST}` || host.endsWith(".workers.dev");
  if (!alias) return null;
  // Se conservan ruta y parametros: los enlaces de partida antiguos deben
  // seguir abriendo su partida.
  const target = new URL(url);
  target.hostname = CANONICAL_HOST;
  target.port = "";
  target.protocol = "https:";
  return Response.redirect(target.toString(), 301);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const redirect = canonicalRedirect(url);
    if (redirect) return redirect;
    try {
      if (url.pathname === "/api" || url.pathname.startsWith("/api/"))
        return await routeApi(request, env, ctx);
      const assetPath = assetPathFor(url.pathname);
      if (assetPath) {
        const asset = noStoreHtml(
          await env.ASSETS.fetch(new Request(new URL(assetPath, url), request)),
        );
        if (assetPath === "/admin.html") return noIndex(asset);
        const seo = seoFor(url.pathname);
        return seo ? localizeHtml(asset, seo) : asset;
      }
      if (url.pathname === "/index.html")
        return noStoreHtml(await env.ASSETS.fetch(request));
      return env.ASSETS.fetch(request);
    } catch (cause) {
      console.error(
        JSON.stringify({
          message: cause?.message,
          stack: cause?.stack,
          path: url.pathname,
        }),
      );
      const message =
        cause instanceof ConflictError
          ? "La partida recibió dos acciones simultáneas. Inténtalo de nuevo."
          : env.DEBUG_ERRORS === "1"
            ? String(cause?.message || cause)
            : "Error temporal del servidor.";
      return error(message, 500);
    }
  },
  async scheduled(_controller, env, _ctx) {
    await cleanupDatabase(env.DB);
  },
};
