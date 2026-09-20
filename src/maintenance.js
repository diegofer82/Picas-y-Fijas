import { cleanupArenas } from "./arena.js";
import { cleanupChat } from "./chat.js";
import { expiredTurnChanges, LIMITS } from "./game.js";
import { sendTurnNotification } from "./push.js";
import { recordFinishedGame } from "./season.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const RECEIPT_RETENTION_MS = 7 * DAY_MS;
export const PRESENCE_RETENTION_MS = DAY_MS;
export const ACTIVATION_RETENTION_MS = 30 * DAY_MS;

// El mantenimiento no pertenece al camino critico de ninguna partida. Se
// ejecuta una vez por hora mediante Cron, en vez de repetir DELETE/UPDATE en
// cada visita al lobby o cada polling del chat.
const CORRESPONDENCE_COLUMNS = new Set([
  "status", "turn", "guesses", "winner", "pending_winner", "timer_paused",
  "turn_started_at", "turn_remaining", "finish_reason",
]);

async function expireCorrespondenceTurns(db, env, at) {
  const stamp = new Date(at).toISOString();
  const earliestPossibleExpiry = new Date(at - DAY_MS).toISOString();
  const { results } = await db.prepare(
    `SELECT * FROM games WHERE status='active' AND time_mode='correspondence'
       AND timer_paused=0 AND turn_started_at<>'' AND turn_started_at<=?`,
  ).bind(earliestPossibleExpiry).all();
  for (const game of results) {
    const changes = expiredTurnChanges(game, at);
    if (!changes) continue;
    const entries = Object.entries({ ...changes, updated_at: stamp })
      .filter(([key]) => key === "updated_at" || CORRESPONDENCE_COLUMNS.has(key));
    const result = await db.prepare(
      `UPDATE games SET ${entries.map(([key]) => `${key}=?`).join(",")},version=version+1
       WHERE game_id=? AND version=?`,
    ).bind(...entries.map(([, value]) => value), game.game_id, game.version).run();
    if (Number(result.meta?.changes) !== 1) continue;
    const updated = { ...game, ...Object.fromEntries(entries), version: Number(game.version) + 1 };
    if (updated.status === "active" && env) await sendTurnNotification(db, env, updated);
    // Una correspondencia que se apaga por el reloj termina aqui, lejos de
    // cualquier jugador: tambien tiene que sumar sus puntos.
    if (updated.status === "finished") await recordFinishedGame(db, updated);
  }
}

export async function cleanupDatabase(db, at = Date.now(), env = null) {
  const stamp = new Date(at).toISOString();
  const waitingCutoff = new Date(at - LIMITS.waitingTtlMs).toISOString();
  const activeCutoff = new Date(at - LIMITS.activeTtlMs).toISOString();
  const receiptCutoff = new Date(at - RECEIPT_RETENTION_MS).toISOString();
  const presenceCutoff = new Date(at - PRESENCE_RETENTION_MS).toISOString();
  const activationCutoff = new Date(at - ACTIVATION_RETENTION_MS).toISOString();

  await cleanupChat(db, at);
  await cleanupArenas(db, at);
  await expireCorrespondenceTurns(db, env, at);
  await db.batch([
    db.prepare(
      `UPDATE games SET status='expired',turn=0,updated_at=?,version=version+1
       WHERE status='waiting' AND ((is_public=1 AND created_at<?) OR (is_public=0 AND created_at<?))`,
    ).bind(stamp, waitingCutoff, new Date(at - LIMITS.privateWaitingTtlMs).toISOString()),
    db.prepare(
      "UPDATE games SET status='inactive',turn=0,turn_started_at='',updated_at=?,version=version+1 WHERE status='active' AND time_mode<>'correspondence' AND updated_at<?",
    ).bind(stamp, activeCutoff),
    db.prepare("DELETE FROM request_receipts WHERE created_at<?").bind(receiptCutoff),
    db.prepare("DELETE FROM turn_notifications WHERE created_at<?").bind(receiptCutoff),
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(stamp),
    db.prepare("DELETE FROM presence WHERE last_seen_at<?").bind(presenceCutoff),
    // Contadores de PIN sin bloqueo vigente y sin movimiento desde hace un dia.
    db.prepare("DELETE FROM login_attempts WHERE updated_at<? AND (locked_until IS NULL OR locked_until<?)").bind(presenceCutoff, stamp),
    // Solo caducan las altas con correo que nunca se activaron: una cuenta
    // historica sin correo no esta "pendiente", y borrarla seria perder datos.
    db.prepare("DELETE FROM users WHERE email<>'' AND email_verified_at IS NULL AND created_at<?").bind(activationCutoff),
  ]);
}
