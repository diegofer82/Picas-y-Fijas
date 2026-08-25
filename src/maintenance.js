import { cleanupChat } from "./chat.js";
import { LIMITS } from "./game.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const RECEIPT_RETENTION_MS = 7 * DAY_MS;
export const PRESENCE_RETENTION_MS = DAY_MS;

// El mantenimiento no pertenece al camino critico de ninguna partida. Se
// ejecuta una vez por hora mediante Cron, en vez de repetir DELETE/UPDATE en
// cada visita al lobby o cada polling del chat.
export async function cleanupDatabase(db, at = Date.now()) {
  const stamp = new Date(at).toISOString();
  const waitingCutoff = new Date(at - LIMITS.waitingTtlMs).toISOString();
  const activeCutoff = new Date(at - LIMITS.activeTtlMs).toISOString();
  const receiptCutoff = new Date(at - RECEIPT_RETENTION_MS).toISOString();
  const presenceCutoff = new Date(at - PRESENCE_RETENTION_MS).toISOString();

  await cleanupChat(db, at);
  await db.batch([
    db.prepare(
      "UPDATE games SET status='expired',turn=0,updated_at=?,version=version+1 WHERE status='waiting' AND created_at<?",
    ).bind(stamp, waitingCutoff),
    db.prepare(
      "UPDATE games SET status='inactive',turn=0,turn_started_at='',updated_at=?,version=version+1 WHERE status='active' AND updated_at<?",
    ).bind(stamp, activeCutoff),
    db.prepare("DELETE FROM request_receipts WHERE created_at<?").bind(receiptCutoff),
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(stamp),
    db.prepare("DELETE FROM presence WHERE last_seen_at<?").bind(presenceCutoff),
  ]);
}
