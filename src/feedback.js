// Buzon de sugerencias y errores. Se abre desde la pantalla de inicio, antes de
// que nadie se haya identificado, asi que es el unico endpoint del juego que
// escribe en D1 sin sesion. Todo lo demas de este archivo existe por esa razon:
// las barandillas contra el abuso y el aviso por correo.
const now = () => new Date().toISOString();

export const FEEDBACK_KINDS = ["idea", "bug", "question", "other"];
export const FEEDBACK_STATUSES = [
  "new",
  "read",
  "planned",
  "done",
  "discarded",
];

export const FEEDBACK_LIMITS = Object.freeze({
  messageMin: 10,
  messageMax: 1000,
  contactMax: 120,
  cooldownMs: 30 * 1000,
  perHour: 5,
  perDay: 15,
});

// Un mensaje escrito a mano puede traer saltos de linea, pero no caracteres de
// control: se quitan antes de guardar para que la pestana del panel no tenga
// que defenderse de ellos.
const cleanText = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

const cleanLang = (value) =>
  ["es", "en", "fr"].includes(String(value ?? "").trim().toLowerCase())
    ? String(value).trim().toLowerCase()
    : "es";

// El contacto es texto libre a proposito: mucha gente deja su nombre de
// jugador y no un correo. El panel necesita saber cual de las dos cosas es
// para encender o apagar su boton de responder, y esa decision se toma aqui,
// donde se puede probar, y no dentro del marcado del panel.
export function replyAddress(contact) {
  const value = String(contact ?? "").trim();
  return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>".]{2,}$/.test(value)
    ? value
    : "";
}

export function validateFeedback(params) {
  const message = cleanText(params.message, FEEDBACK_LIMITS.messageMax);
  if (message.length < FEEDBACK_LIMITS.messageMin)
    return {
      error: `El mensaje debe tener al menos ${FEEDBACK_LIMITS.messageMin} caracteres.`,
    };
  return {
    kind: FEEDBACK_KINDS.includes(String(params.kind || ""))
      ? String(params.kind)
      : "idea",
    message,
    contact: cleanText(params.contact, FEEDBACK_LIMITS.contactMax),
    lang: cleanLang(params.lang),
    appVersion: cleanText(params.appVersion, 16),
  };
}

// Tres cortes con una sola lectura: el ultimo envio de esta IP y cuantos lleva
// en la ultima hora y en el ultimo dia. Cuesta una consulta por envio, nada
// frente a la cuota de D1, y es lo unico que separa el buzon de un grifo
// abierto.
export async function feedbackThrottle(db, ip, at = Date.now()) {
  if (!ip) return null;
  const dayAgo = new Date(at - 24 * 60 * 60 * 1000).toISOString();
  const hourAgo = new Date(at - 60 * 60 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS day_count,
              SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) AS hour_count,
              MAX(created_at) AS last_at
         FROM feedback WHERE ip=? AND created_at>=?`,
    )
    .bind(hourAgo, ip, dayAgo)
    .first();
  const lastAt = Date.parse(row?.last_at || "");
  if (Number.isFinite(lastAt) && at - lastAt < FEEDBACK_LIMITS.cooldownMs)
    return "Espera unos segundos antes de enviar otro mensaje.";
  if (Number(row?.hour_count || 0) >= FEEDBACK_LIMITS.perHour)
    return "Has enviado varios mensajes seguidos. Inténtalo dentro de un rato.";
  if (Number(row?.day_count || 0) >= FEEDBACK_LIMITS.perDay)
    return "Has alcanzado el máximo de mensajes por día. Gracias, los leeremos todos.";
  return null;
}

export async function submitFeedback(db, params, origin, username = "") {
  // Campo trampa: es invisible en la pantalla, asi que solo lo rellena un bot.
  // Se responde que todo fue bien para no ensenarle donde esta el corte.
  if (String(params.website || "").trim()) return { ok: true, saved: false };
  const clean = validateFeedback(params);
  if (clean.error) return { ok: false, error: clean.error };
  const throttled = await feedbackThrottle(db, origin.ip);
  if (throttled) return { ok: false, error: throttled };
  const created = now();
  const result = await db
    .prepare(
      `INSERT INTO feedback(kind,message,contact,username,lang,app_version,user_agent,ip,country,status,admin_note,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,'new','',?,?)`,
    )
    .bind(
      clean.kind,
      clean.message,
      clean.contact,
      String(username || "").slice(0, 24),
      clean.lang,
      clean.appVersion,
      cleanText(params.userAgent, 200),
      origin.ip,
      origin.country,
      created,
      created,
    )
    .run();
  return {
    ok: true,
    saved: true,
    id: Number(result?.meta?.last_row_id) || 0,
    entry: { ...clean, username, createdAt: created },
  };
}

export async function adminFeedback(db, params = {}) {
  const status = FEEDBACK_STATUSES.includes(String(params.status || ""))
    ? String(params.status)
    : "";
  const kind = FEEDBACK_KINDS.includes(String(params.kind || ""))
    ? String(params.kind)
    : "";
  const where = [];
  const binds = [];
  if (status) {
    where.push("status=?");
    binds.push(status);
  }
  if (kind) {
    where.push("kind=?");
    binds.push(kind);
  }
  const { results } = await db
    .prepare(
      `SELECT id,kind,message,contact,username,lang,app_version,user_agent,ip,country,status,admin_note,created_at,updated_at
         FROM feedback ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at DESC LIMIT 200`,
    )
    .bind(...binds)
    .all();
  const counts = await db
    .prepare("SELECT status, COUNT(*) AS total FROM feedback GROUP BY status")
    .all();
  return {
    ok: true,
    items: results.map((row) => ({
      id: row.id,
      kind: row.kind,
      message: row.message,
      contact: row.contact,
      username: row.username,
      lang: row.lang,
      appVersion: row.app_version,
      userAgent: row.user_agent,
      ip: row.ip,
      country: row.country,
      replyTo: replyAddress(row.contact),
      status: row.status,
      adminNote: row.admin_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    counts: Object.fromEntries(
      (counts.results || []).map((row) => [row.status, Number(row.total) || 0]),
    ),
  };
}

export async function adminUpdateFeedback(db, params) {
  const id = Number.parseInt(params.id, 10);
  if (!Number.isFinite(id))
    return { ok: false, error: "Falta el identificador." };
  const row = await db
    .prepare("SELECT id FROM feedback WHERE id=?")
    .bind(id)
    .first();
  if (!row) return { ok: false, error: "El mensaje ya no existe." };
  const status = FEEDBACK_STATUSES.includes(String(params.status || ""))
    ? String(params.status)
    : "";
  if (!status && params.adminNote === undefined)
    return { ok: false, error: "Nada que cambiar." };
  const sets = [];
  const binds = [];
  if (status) {
    sets.push("status=?");
    binds.push(status);
  }
  if (params.adminNote !== undefined) {
    sets.push("admin_note=?");
    binds.push(cleanText(params.adminNote, 500));
  }
  sets.push("updated_at=?");
  binds.push(now(), id);
  await db
    .prepare(`UPDATE feedback SET ${sets.join(",")} WHERE id=?`)
    .bind(...binds)
    .run();
  return { ok: true, id, status };
}

export async function adminDeleteFeedback(db, params) {
  const id = Number.parseInt(params.id, 10);
  if (!Number.isFinite(id))
    return { ok: false, error: "Falta el identificador." };
  await db.prepare("DELETE FROM feedback WHERE id=?").bind(id).run();
  return { ok: true, id };
}

// --- El aviso por correo -----------------------------------------------------
// Cloudflare Email Routing entrega a una direccion ya verificada sin API key ni
// secreto, pero a cambio exige un mensaje MIME completo. Se arma a mano —son
// cabeceras y un cuerpo— para no anadir una dependencia a un proyecto que hoy
// no tiene ninguna. El cuerpo va en base64 porque lleva acentos.
const KIND_LABEL = {
  idea: "Idea",
  bug: "Error",
  question: "Pregunta",
  other: "Otro",
};

const base64 = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export function feedbackEmail(entry, from, to) {
  const subject = `[Picas y Fijas] ${KIND_LABEL[entry.kind] || entry.kind}${entry.username ? ` de ${entry.username}` : ""}`;
  const body = [
    `Tipo: ${KIND_LABEL[entry.kind] || entry.kind}`,
    `Idioma: ${entry.lang}`,
    `Usuario: ${entry.username || "(sin sesión)"}`,
    `Contacto: ${entry.contact || "(no dejó)"}`,
    `Versión: ${entry.appVersion || "?"}`,
    `Fecha: ${entry.createdAt}`,
    "",
    entry.message,
    "",
    "-- ",
    "Responde desde https://picasyfijas.fans/admin, pestaña Feedback.",
  ].join("\r\n");
  return [
    `From: Picas y Fijas <${from}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${base64(subject)}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64(body).replace(/(.{76})/g, "$1\r\n"),
  ].join("\r\n");
}

// El correo es un aviso, no la fuente de verdad: si falla, la fila ya esta
// guardada y la pestana del panel la ensena igual. Por eso nunca propaga.
export async function notifyFeedback(env, entry) {
  const to = String(env?.FEEDBACK_TO || "").trim();
  const from = String(env?.FEEDBACK_FROM || "").trim();
  if (!env?.FEEDBACK_MAIL || !to || !from) return false;
  try {
    const { EmailMessage } = await import("cloudflare:email");
    await env.FEEDBACK_MAIL.send(
      new EmailMessage(from, to, feedbackEmail(entry, from, to)),
    );
    return true;
  } catch (cause) {
    console.error(
      JSON.stringify({
        message: "feedback-mail",
        detail: String(cause?.message || cause),
      }),
    );
    return false;
  }
}
