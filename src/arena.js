import { cleanCountry, evaluate, maxSymbolFor, padCode, toInt, truthy, validateCode } from "./game.js";

/* La arena (E6-T3).

   El problema del juego nunca fue el juego: era que hacen falta dos personas
   libres al mismo tiempo. La arena lo resuelve por el otro lado: en vez de
   emparejar a dos, junta de tres a ocho contra **el mismo código**, que sortea
   el servidor. Nadie elige secreto, así que nadie juega con ventaja; nadie
   espera turno, así que una desconexión no congela a los demás; y hay límite
   de intentos siempre, que es lo que garantiza que una arena termine aunque
   alguien cierre la pestaña y no vuelva.

   Vive en sus propias tablas. `games` es de dos —`p1`, `p2`, dos secretos, un
   turno— y no puede representar esto sin deformarse; las partidas clásicas no
   se tocan. Lo que sí se repite es lo aprendido: idempotencia por
   `requestId`, el servidor como única autoridad del código y de los
   resultados, y ni una lectura sin índice. */

export const ARENA = Object.freeze({
  minPlayers: 3,
  maxPlayers: 8,
  waitingTtlMs: 2 * 60 * 60 * 1000,
  activeTtlMs: 2 * 60 * 60 * 1000,
  createCooldownMs: 30 * 1000,
  listLimit: 12,
  finishedRetentionMs: 7 * 24 * 60 * 60 * 1000,
});

const now = () => new Date().toISOString();
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSymbol(max) {
  // Rechazo por módulo: sin esto, los símbolos bajos saldrían algo más a
  // menudo que los altos, y el código del servidor tiene que ser tan ciego
  // como el de una persona.
  const limit = Math.floor(256 / max) * max;
  const bytes = new Uint8Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
  return bytes[0] % max;
}

export function randomSecret(digits, allowRepeats, maxSymbol) {
  const out = [];
  while (out.length < digits) {
    const symbol = String(randomSymbol(maxSymbol));
    if (allowRepeats || !out.includes(symbol)) out.push(symbol);
  }
  return out.join("");
}

export function validateArenaOptions(options) {
  if (![3, 4, 5, 6].includes(options.digits)) return "Longitud debe ser 3, 4, 5 o 6.";
  if (options.mode === "colors" && ![4, 6, 8].includes(options.numColors))
    return "El número de colores debe ser 4, 6 u 8.";
  if (options.mode === "colors" && !options.allowRepeats && options.digits > options.numColors)
    return "No hay suficientes colores distintos para esa longitud. Permite repetidos o elige más colores.";
  if (![6, 10].includes(options.maxAttempts))
    return "La arena se juega a 6 o a 10 intentos.";
  return null;
}

function arenaOptions(params) {
  const mode = params.mode === "colors" ? "colors" : "numbers";
  return {
    digits: toInt(params.digits, 3),
    mode,
    numColors: mode === "colors" ? toInt(params.numColors, 6) : 10,
    allowRepeats: truthy(params.allowRepeats),
    maxAttempts: toInt(params.maxAttempts, 10),
  };
}

export function arenaMeta(row) {
  return {
    arenaId: row.arena_id,
    status: row.status,
    host: row.host,
    digits: toInt(row.digits),
    mode: row.mode === "colors" ? "colors" : "numbers",
    numColors: toInt(row.num_colors, 10),
    allowRepeats: truthy(row.allow_repeats),
    maxAttempts: toInt(row.max_attempts),
    players: toInt(row.players),
    minPlayers: ARENA.minPlayers,
    maxPlayers: ARENA.maxPlayers,
    createdAt: row.created_at,
    startedAt: row.started_at || "",
    finishReason: row.finish_reason || "",
  };
}

/* La clasificación en directo. Es pura y se calcula con lo que ya está en las
   filas de `arena_players`: quien ha resuelto va delante, y entre dos que han
   resuelto manda quien lo hizo con menos intentos; después, quien sigue
   jugando, por lo cerca que está —sus fijas, que no dicen nada del código— y
   por lo poco que ha gastado. Quien se marcha cierra la lista. */
export function rankPlayers(players) {
  const value = (p) => ({
    solved: p.solvedAt ? 0 : 1,
    gaveUp: p.gaveUp ? 1 : 0,
  });
  return [...players]
    .sort((a, b) => {
      const va = value(a), vb = value(b);
      if (va.solved !== vb.solved) return va.solved - vb.solved;
      if (a.solvedAt && b.solvedAt)
        return a.attempts - b.attempts || String(a.solvedAt).localeCompare(String(b.solvedAt));
      if (va.gaveUp !== vb.gaveUp) return va.gaveUp - vb.gaveUp;
      return b.bestFijas - a.bestFijas || a.attempts - b.attempts
        || String(a.joinedAt).localeCompare(String(b.joinedAt));
    })
    .map((player, index) => ({ ...player, position: index + 1 }));
}

const publicPlayer = (row) => ({
  username: row.username,
  country: cleanCountry(row.country),
  attempts: toInt(row.attempts),
  bestFijas: toInt(row.best_fijas),
  solvedAt: row.solved_at || "",
  gaveUp: truthy(row.gave_up),
  joinedAt: row.joined_at,
});

async function loadArena(db, arenaId) {
  const id = String(arenaId || "").toUpperCase().trim();
  if (!/^[A-Z0-9]{4,6}$/.test(id)) return null;
  return db
    .prepare(
      `SELECT a.*, (SELECT COUNT(*) FROM arena_players p WHERE p.arena_id=a.arena_id) AS players
       FROM arenas a WHERE a.arena_id=?`,
    )
    .bind(id)
    .first();
}

async function newArenaId(db) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let id = "";
    const random = new Uint8Array(4);
    crypto.getRandomValues(random);
    for (const byte of random) id += ALPHABET[byte % ALPHABET.length];
    const taken = await db.prepare("SELECT arena_id FROM arenas WHERE arena_id=?").bind(id).first();
    if (!taken) return id;
  }
  throw new Error("No se pudo generar un código de arena.");
}

async function openArenaOf(db, userKey) {
  return db
    .prepare(
      `SELECT a.arena_id FROM arena_players p JOIN arenas a ON a.arena_id=p.arena_id
       WHERE p.username_key=? AND a.status IN ('waiting','active') LIMIT 1`,
    )
    .bind(userKey)
    .first();
}

export async function listArenas(db, at = Date.now()) {
  const cutoff = new Date(at - ARENA.waitingTtlMs).toISOString();
  const { results } = await db
    .prepare(
      `SELECT a.*, (SELECT COUNT(*) FROM arena_players p WHERE p.arena_id=a.arena_id) AS players
       FROM arenas a WHERE a.status IN ('waiting','active') AND a.updated_at>=?
       ORDER BY a.created_at DESC LIMIT ?`,
    )
    .bind(cutoff, ARENA.listLimit)
    .all();
  return results.map(arenaMeta);
}

export async function createArena(db, user, params) {
  const options = arenaOptions(params);
  const validation = validateArenaOptions(options);
  if (validation) return { ok: false, error: validation };
  const already = await openArenaOf(db, user.username_key);
  if (already) return { ok: false, error: "Ya estás en una arena abierta." };
  const recent = await db
    .prepare("SELECT created_at FROM arenas WHERE host_key=? ORDER BY created_at DESC LIMIT 1")
    .bind(user.username_key)
    .first();
  if (recent && Date.now() - Date.parse(recent.created_at) < ARENA.createCooldownMs)
    return { ok: false, error: "Espera 30 segundos antes de crear otra arena." };
  const id = await newArenaId(db);
  const stamp = now();
  const secret = randomSecret(options.digits, options.allowRepeats, maxSymbolFor(options.mode, options.numColors));
  await db.batch([
    db.prepare(
      `INSERT INTO arenas(arena_id,status,host,host_key,secret,digits,mode,num_colors,allow_repeats,max_attempts,created_at,updated_at)
       VALUES(?,'waiting',?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id, user.username, user.username_key, secret, options.digits, options.mode,
      options.numColors, options.allowRepeats ? 1 : 0, options.maxAttempts, stamp, stamp),
    db.prepare(
      "INSERT INTO arena_players(arena_id,username_key,username,country,joined_at) VALUES(?,?,?,?,?)",
    ).bind(id, user.username_key, user.username, cleanCountry(params.country), stamp),
  ]);
  return { ok: true, arenaId: id };
}

export async function joinArena(db, user, params) {
  const arena = await loadArena(db, params.arenaId);
  if (!arena) return { ok: false, error: "No encontramos esa arena." };
  const mine = await db
    .prepare("SELECT username_key FROM arena_players WHERE arena_id=? AND username_key=?")
    .bind(arena.arena_id, user.username_key)
    .first();
  if (mine) return { ok: true, arenaId: arena.arena_id };
  if (arena.status !== "waiting") return { ok: false, error: "Esa arena ya ha empezado." };
  if (Date.now() - Date.parse(arena.created_at) > ARENA.waitingTtlMs)
    return { ok: false, error: "Esa arena ha expirado." };
  if (toInt(arena.players) >= ARENA.maxPlayers) return { ok: false, error: "Esa arena está llena." };
  const already = await openArenaOf(db, user.username_key);
  if (already) return { ok: false, error: "Ya estás en una arena abierta." };
  const stamp = now();
  await db.batch([
    db.prepare("INSERT INTO arena_players(arena_id,username_key,username,country,joined_at) VALUES(?,?,?,?,?)")
      .bind(arena.arena_id, user.username_key, user.username, cleanCountry(params.country), stamp),
    db.prepare("UPDATE arenas SET updated_at=?,version=version+1 WHERE arena_id=?").bind(stamp, arena.arena_id),
  ]);
  return { ok: true, arenaId: arena.arena_id };
}

export async function startArena(db, user, params) {
  const arena = await loadArena(db, params.arenaId);
  if (!arena) return { ok: false, error: "No encontramos esa arena." };
  if (arena.host_key !== user.username_key)
    return { ok: false, error: "Solo quien abrió la arena puede empezarla." };
  if (arena.status !== "waiting") return { ok: false, error: "Esa arena ya ha empezado." };
  if (toInt(arena.players) < ARENA.minPlayers)
    return { ok: false, error: "Hacen falta al menos 3 jugadores para empezar." };
  const stamp = now();
  const result = await db
    .prepare("UPDATE arenas SET status='active',started_at=?,updated_at=?,version=version+1 WHERE arena_id=? AND status='waiting'")
    .bind(stamp, stamp, arena.arena_id)
    .run();
  if (Number(result.meta?.changes) !== 1) return { ok: false, error: "Esa arena ya ha empezado." };
  return { ok: true, arenaId: arena.arena_id };
}

/* Una arena termina cuando ya no queda nadie jugando: todos han acertado,
   agotado sus intentos o se han marchado. Se comprueba después de cada intento
   y al soltar a alguien, que son los dos únicos momentos en los que eso puede
   cambiar. */
async function closeIfDone(db, arena) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN solved_at IS NOT NULL OR gave_up=1 OR attempts>=? THEN 1 ELSE 0 END) AS done
       FROM arena_players WHERE arena_id=?`,
    )
    .bind(toInt(arena.max_attempts), arena.arena_id)
    .first();
  if (toInt(row?.total) === 0 || toInt(row?.done) < toInt(row?.total)) return false;
  const stamp = now();
  await db
    .prepare("UPDATE arenas SET status='finished',finish_reason='complete',updated_at=?,version=version+1 WHERE arena_id=? AND status='active'")
    .bind(stamp, arena.arena_id)
    .run();
  return true;
}

export async function arenaGuess(db, user, params) {
  const arena = await loadArena(db, params.arenaId);
  if (!arena) return { ok: false, error: "No encontramos esa arena." };
  if (arena.status !== "active") return { ok: false, error: "Esa arena no está en juego." };
  const me = await db
    .prepare("SELECT * FROM arena_players WHERE arena_id=? AND username_key=?")
    .bind(arena.arena_id, user.username_key)
    .first();
  if (!me) return { ok: false, error: "No juegas en esta arena." };
  if (me.solved_at) return { ok: false, error: "Ya has descifrado el código." };
  if (truthy(me.gave_up)) return { ok: false, error: "Ya no juegas en esta arena." };
  if (toInt(me.attempts) >= toInt(arena.max_attempts))
    return { ok: false, error: "Has agotado tus intentos." };
  const guess = String(params.guess ?? "").trim();
  const validation = validateCode(guess, arena.digits, truthy(arena.allow_repeats),
    maxSymbolFor(arena.mode, arena.num_colors));
  if (validation) return { ok: false, error: validation };
  const requestId = String(params.requestId || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 80) || null;
  if (requestId) {
    const receipt = await db
      .prepare("SELECT guess,fijas,picas FROM arena_guesses WHERE arena_id=? AND username_key=? AND request_id=?")
      .bind(arena.arena_id, user.username_key, requestId)
      .first();
    // El mismo intento reenviado por una red que va y viene no gasta dos.
    if (receipt)
      return { ok: true, repeated: true, guess: receipt.guess, fijas: toInt(receipt.fijas), picas: toInt(receipt.picas) };
  }
  const secret = padCode(arena.secret, arena.digits);
  const score = evaluate(secret, padCode(guess, arena.digits));
  const solved = score.fijas === toInt(arena.digits);
  const stamp = now();
  const attempts = toInt(me.attempts) + 1;
  await db.batch([
    db.prepare(
      "INSERT INTO arena_guesses(arena_id,username_key,username,guess,fijas,picas,created_at,request_id) VALUES(?,?,?,?,?,?,?,?)",
    ).bind(arena.arena_id, user.username_key, user.username, padCode(guess, arena.digits),
      score.fijas, score.picas, stamp, requestId),
    db.prepare(
      `UPDATE arena_players SET attempts=attempts+1,best_fijas=MAX(best_fijas,?),solved_at=COALESCE(solved_at,?)
       WHERE arena_id=? AND username_key=?`,
    ).bind(score.fijas, solved ? stamp : null, arena.arena_id, user.username_key),
    db.prepare("UPDATE arenas SET updated_at=?,version=version+1 WHERE arena_id=?").bind(stamp, arena.arena_id),
  ]);
  const finished = await closeIfDone(db, arena);
  return {
    ok: true,
    guess: padCode(guess, arena.digits),
    fijas: score.fijas,
    picas: score.picas,
    solved,
    attempts,
    attemptsLeft: Math.max(0, toInt(arena.max_attempts) - attempts),
    finished,
    ...(solved || finished ? { secret } : {}),
  };
}

export async function leaveArena(db, user, params) {
  const arena = await loadArena(db, params.arenaId);
  if (!arena) return { ok: true };
  const stamp = now();
  if (arena.status === "waiting") {
    // Antes de empezar, marcharse es marcharse. Si quien se va abrió la arena,
    // la arena se va con él: nadie más puede darle al botón de empezar.
    if (arena.host_key === user.username_key) {
      await db.batch([
        db.prepare("DELETE FROM arena_players WHERE arena_id=?").bind(arena.arena_id),
        db.prepare("UPDATE arenas SET status='expired',finish_reason='host_left',updated_at=?,version=version+1 WHERE arena_id=?")
          .bind(stamp, arena.arena_id),
      ]);
      return { ok: true, closed: true };
    }
    await db.batch([
      db.prepare("DELETE FROM arena_players WHERE arena_id=? AND username_key=?").bind(arena.arena_id, user.username_key),
      db.prepare("UPDATE arenas SET updated_at=?,version=version+1 WHERE arena_id=?").bind(stamp, arena.arena_id),
    ]);
    return { ok: true };
  }
  if (arena.status === "active") {
    // Empezada, marcharse no borra a nadie de la clasificación: la arena es de
    // todos y lo jugado hasta aquí cuenta. Solo deja de esperar tus intentos.
    await db
      .prepare("UPDATE arena_players SET gave_up=1 WHERE arena_id=? AND username_key=? AND solved_at IS NULL")
      .bind(arena.arena_id, user.username_key)
      .run();
    await closeIfDone(db, arena);
  }
  return { ok: true };
}

export async function arenaState(db, user, params) {
  let arena = await loadArena(db, params.arenaId);
  if (!arena) return { ok: false, error: "No encontramos esa arena." };
  const at = Date.now();
  if (arena.status === "waiting" && at - Date.parse(arena.created_at) > ARENA.waitingTtlMs) {
    await db.prepare("UPDATE arenas SET status='expired',finish_reason='timeout',updated_at=?,version=version+1 WHERE arena_id=? AND status='waiting'")
      .bind(now(), arena.arena_id).run();
    arena = { ...arena, status: "expired", finish_reason: "timeout" };
  }
  if (arena.status === "active" && at - Date.parse(arena.updated_at) > ARENA.activeTtlMs) {
    await db.prepare("UPDATE arenas SET status='finished',finish_reason='timeout',updated_at=?,version=version+1 WHERE arena_id=? AND status='active'")
      .bind(now(), arena.arena_id).run();
    arena = { ...arena, status: "finished", finish_reason: "timeout" };
  }
  const [{ results: players }, { results: mine }] = await Promise.all([
    db.prepare("SELECT * FROM arena_players WHERE arena_id=?").bind(arena.arena_id).all(),
    db.prepare("SELECT guess,fijas,picas,created_at FROM arena_guesses WHERE arena_id=? AND username_key=? ORDER BY id ASC")
      .bind(arena.arena_id, user.username_key).all(),
  ]);
  const me = players.find((row) => row.username_key === user.username_key) || null;
  const over = arena.status === "finished" || arena.status === "expired";
  return {
    ok: true,
    ...arenaMeta({ ...arena, players: players.length }),
    board: rankPlayers(players.map(publicPlayer)),
    /* Los intentos de los demás no se enseñan mientras se juega: todos atacan
       el mismo código, así que leer el intento de otro y su resultado sería
       jugar con su cabeza. Lo que se ve de los demás —intentos gastados y
       mejor número de fijas— no dice nada del código. */
    guesses: mine.map((row) => ({
      guess: row.guess, fijas: toInt(row.fijas), picas: toInt(row.picas), createdAt: row.created_at,
    })),
    youArePlaying: Boolean(me) && !truthy(me?.gave_up),
    youAreHost: arena.host_key === user.username_key,
    attempts: toInt(me?.attempts),
    attemptsLeft: me ? Math.max(0, toInt(arena.max_attempts) - toInt(me.attempts)) : 0,
    solved: Boolean(me?.solved_at),
    // El código solo sale de aquí cuando ya no queda nada que adivinar.
    secret: over ? padCode(arena.secret, arena.digits) : "",
  };
}

export async function cleanupArenas(db, at = Date.now()) {
  const stamp = new Date(at).toISOString();
  const waitingCutoff = new Date(at - ARENA.waitingTtlMs).toISOString();
  const activeCutoff = new Date(at - ARENA.activeTtlMs).toISOString();
  const forgetCutoff = new Date(at - ARENA.finishedRetentionMs).toISOString();
  await db.batch([
    db.prepare("UPDATE arenas SET status='expired',finish_reason='timeout',updated_at=?,version=version+1 WHERE status='waiting' AND created_at<?")
      .bind(stamp, waitingCutoff),
    db.prepare("UPDATE arenas SET status='finished',finish_reason='timeout',updated_at=?,version=version+1 WHERE status='active' AND updated_at<?")
      .bind(stamp, activeCutoff),
    // Las cascadas dependen de un PRAGMA por conexión, así que las tres tablas
    // se limpian a mano y en orden.
    db.prepare("DELETE FROM arena_guesses WHERE arena_id IN (SELECT arena_id FROM arenas WHERE status IN ('finished','expired') AND updated_at<?)")
      .bind(forgetCutoff),
    db.prepare("DELETE FROM arena_players WHERE arena_id IN (SELECT arena_id FROM arenas WHERE status IN ('finished','expired') AND updated_at<?)")
      .bind(forgetCutoff),
    db.prepare("DELETE FROM arenas WHERE status IN ('finished','expired') AND updated_at<?").bind(forgetCutoff),
  ]);
}
