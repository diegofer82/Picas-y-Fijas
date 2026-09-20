import { cleanName, usernameKey } from "./game.js";
import { NAME_CHARS_ERROR, PIN_LOCKED, RENAME_COOLDOWN_MS, checkPin, isUniqueViolation, nameCharsError, nextUsernameChange } from "./security.js";

/* Cambiar el nombre visible sin tocar el correo, que es el identificador de
   verdad de la cuenta.

   El nombre no vive solo en `users`: partidas, jugadas, chat, hilos privados,
   reportes y buzon lo guardan escrito, porque asi el polling no tiene que
   cruzar con `users` en cada consulta. Renombrar es por tanto reescribirlo en
   todas esas tablas dentro de un mismo `batch`, que D1 ejecuta como una
   transaccion: o cambia en todas partes o no cambia en ninguna. Asi el
   historial y el ranking siguen siendo del mismo jugador.

   Dos barandillas:
   - con una partida en espera o en juego no se puede: el rival la tiene
     abierta con el nombre anterior y una jugada en vuelo llegaria con el
     nombre viejo;
   - una vez cada `RENAME_COOLDOWN_MS`, para que el ranking no sea un desfile
     de disfraces. Corregir solo mayusculas no cuenta, porque no cambia la
     clave. */
export async function changeUsername(db, user, params, at = Date.now()) {
  // `authenticate` pisa `params.username` con el nombre de la sesion: el nuevo
  // viaja en su propio campo.
  const username = cleanName(params.newUsername);
  const key = usernameKey(username);
  const pin = String(params.pin || "");
  if (username.length < 2) return { ok: false, error: "El nombre debe tener al menos 2 caracteres." };
  if (nameCharsError(username)) return { ok: false, error: NAME_CHARS_ERROR };
  const row = await db.prepare("SELECT * FROM users WHERE id=?").bind(user.id).first();
  if (!row) return { ok: false, error: "El PIN actual no es correcto." };
  const pinCheck = await checkPin(db, row, pin);
  if (!pinCheck.ok) return { ok: false, error: pinCheck.locked ? PIN_LOCKED : "El PIN actual no es correcto." };
  if (username === row.username)
    return { ok: true, username, usernameNextChangeAt: nextUsernameChange(row.username_changed_at) };
  const oldName = row.username, oldKey = row.username_key;
  const sameKey = key === oldKey;
  if (!sameKey) {
    const taken = await db.prepare("SELECT id FROM users WHERE username_key=?").bind(key).first();
    if (taken) return { ok: false, error: "Ese nombre de usuario ya está en uso." };
    const last = Date.parse(row.username_changed_at || "");
    if (Number.isFinite(last) && at - last < RENAME_COOLDOWN_MS)
      return { ok: false, error: "Solo puedes cambiar tu nombre una vez cada 90 días.",
        usernameNextChangeAt: nextUsernameChange(row.username_changed_at) };
  }
  const open = await db
    .prepare("SELECT game_id FROM games WHERE status IN ('waiting','active') AND (p1=?1 OR p2=?1) LIMIT 1")
    .bind(oldName)
    .first();
  if (open) return { ok: false, error: "Termina o cancela tus partidas abiertas antes de cambiar tu nombre." };
  // Una arena abierta es lo mismo visto desde el otro modo: sus filas se
  // identifican por la clave del nombre, asi que renombrarse en mitad de una
  // dejaba a la persona fuera de su propia arena —«No juegas en esta arena»—
  // y a la arena esperando unos intentos que ya no podian llegar.
  const arena = await db
    .prepare(`SELECT p.arena_id FROM arena_players p JOIN arenas a ON a.arena_id=p.arena_id
       WHERE p.username_key=? AND a.status IN ('waiting','active') LIMIT 1`)
    .bind(oldKey)
    .first();
  if (arena) return { ok: false, error: "Sal de tu arena o espera a que termine antes de cambiar tu nombre." };

  const stamp = new Date(at).toISOString();
  const byOld = `"by":${JSON.stringify(oldName)}`, byNew = `"by":${JSON.stringify(username)}`;
  const statements = [
    // `previous_username` guarda el nombre de antes para la ficha de /admin;
    // una correccion de mayusculas tambien lo cuenta, sin gastar el cupo.
    db.prepare(`UPDATE users SET username=?,username_key=?,previous_username=?,
      username_changed_at=CASE WHEN ? THEN username_changed_at ELSE ? END WHERE id=?`)
      .bind(username, key, oldName, sameKey ? 1 : 0, stamp, row.id),
    // Historial y ranking: los dos salen de estas columnas.
    db.prepare("UPDATE games SET p1=? WHERE p1=?").bind(username, oldName),
    db.prepare("UPDATE games SET p2=? WHERE p2=?").bind(username, oldName),
    db.prepare("UPDATE games SET winner=? WHERE winner=?").bind(username, oldName),
    db.prepare("UPDATE games SET pending_winner=? WHERE pending_winner=?").bind(username, oldName),
    // Las jugadas se guardan con `JSON.stringify`, que escribe `"by":"Nombre"`
    // siempre igual; basta sustituir ese fragmento exacto.
    db.prepare("UPDATE games SET guesses=REPLACE(guesses,?,?) WHERE (p1=?3 OR p2=?3) AND INSTR(guesses,?1)>0")
      .bind(byOld, byNew, username),
    db.prepare("UPDATE chat_messages SET sender=?,sender_key=? WHERE sender_key=?").bind(username, key, oldKey),
    db.prepare("UPDATE chat_messages SET deleted_by=? WHERE deleted_by=?").bind(username, oldName),
    db.prepare("UPDATE chat_reports SET reporter=?,reporter_key=? WHERE reporter_key=?").bind(username, key, oldKey),
    db.prepare("UPDATE chat_mutes SET username_key=? WHERE username_key=?").bind(key, oldKey),
    db.prepare("UPDATE chat_mutes SET created_by=? WHERE created_by=?").bind(username, oldName),
    db.prepare("UPDATE chat_threads SET user1=?,user1_key=? WHERE user1_key=?").bind(username, key, oldKey),
    db.prepare("UPDATE chat_threads SET user2=?,user2_key=? WHERE user2_key=?").bind(username, key, oldKey),
    // `pairData` ordena la pareja por clave; con la clave nueva el orden puede
    // invertirse, y `pair_key` tiene que seguir coincidiendo con lo que calcula.
    db.prepare(`UPDATE chat_threads SET
        user1=user2,user1_key=user2_key,user2=user1,user2_key=user1_key
      WHERE (user1_key=?1 OR user2_key=?1) AND user1_key>user2_key`).bind(key),
    db.prepare("UPDATE chat_threads SET pair_key=user1_key||'|'||user2_key WHERE user1_key=?1 OR user2_key=?1").bind(key),
    db.prepare("UPDATE request_receipts SET username_key=? WHERE username_key=?").bind(key, oldKey),
    // Los puntos de la temporada, las rachas y las insignias son de la
    // persona, no del nombre: si no viajaran, renombrarse seria empezar de
    // cero en el ranking. Las filas del nombre nuevo no pueden existir —el
    // nombre estaba libre y borrar una cuenta se lleva las suyas—, asi que un
    // UPDATE directo basta y el indice unico avisaria si algun dia no fuera
    // cierto.
    db.prepare("UPDATE player_scores SET username=?,username_key=? WHERE username_key=?").bind(username, key, oldKey),
    db.prepare("UPDATE player_progress SET username=?,username_key=? WHERE username_key=?").bind(username, key, oldKey),
    db.prepare("UPDATE badges SET username_key=? WHERE username_key=?").bind(key, oldKey),
    // La arena y el codigo del dia guardan tambien el nombre escrito, y por la
    // misma razon que el ranking: para no cruzar con `users` en cada consulta.
    // Si no viajaran, la clasificacion de una arena terminada y la del dia
    // seguirian ensenando el nombre de antes.
    db.prepare("UPDATE arenas SET host=?,host_key=? WHERE host_key=?").bind(username, key, oldKey),
    db.prepare("UPDATE arena_players SET username=?,username_key=? WHERE username_key=?").bind(username, key, oldKey),
    db.prepare("UPDATE arena_guesses SET username=?,username_key=? WHERE username_key=?").bind(username, key, oldKey),
    db.prepare("UPDATE daily_results SET username=?,username_key=? WHERE username_key=?").bind(username, key, oldKey),
    db.prepare("DELETE FROM presence WHERE username_key=?").bind(oldKey),
    db.prepare("UPDATE feedback SET username=? WHERE username=?").bind(username, oldName),
    db.prepare("UPDATE audit_log SET target=? WHERE target=?").bind(username, oldName),
  ];
  // Si alguien toma el mismo nombre entre la comprobacion y este batch, el
  // indice unico rechaza la primera instruccion y D1 deshace el lote entero.
  try {
    await db.batch(statements);
  } catch (cause) {
    if (!isUniqueViolation(cause)) throw cause;
    return { ok: false, error: "Ese nombre de usuario ya está en uso." };
  }
  return { ok: true, username,
    usernameNextChangeAt: nextUsernameChange(sameKey ? row.username_changed_at : stamp) };
}
