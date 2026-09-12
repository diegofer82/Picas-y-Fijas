import { cleanName, usernameKey } from "./game.js";
import { cleanEmail, hashPin, randomToken, sha256, validEmail, validPin } from "./security.js";

const stamp = () => new Date().toISOString();
const expiry = () => new Date(Date.now() + 15 * 60_000).toISOString();
const activationExpiry = () => new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString();

const escapeHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Los correos salen en el idioma que el jugador tiene puesto en la pantalla
// desde la que pide el enlace: quien juega en frances no entiende un aviso en
// castellano. Si no llega idioma —o llega uno que no existe— se cae al espanol,
// que es el de la casa.
export const mailLang = (value) =>
  ["es", "en", "fr"].includes(String(value ?? "").trim().toLowerCase())
    ? String(value).trim().toLowerCase()
    : "es";

const MAIL_TEXT = {
  es: {
    verifySubject: "Verifica tu correo de Picas y Fijas",
    verifyBody: (duration) => `Pulsa el botón en los próximos ${duration} para verificar tu correo y activar tu cuenta:`,
    verifyLabel: "Verificar mi correo",
    resetSubject: "Restablece tu contraseña de Picas y Fijas",
    resetBody: "Pulsa el botón en los próximos 15 minutos para elegir una contraseña nueva:",
    resetLabel: "Elegir contraseña nueva",
    fallback: "Si el botón no funciona, copia y pega esta dirección en tu navegador:",
    long: "3 días",
    short: "15 minutos",
  },
  en: {
    verifySubject: "Verify your Picas y Fijas email",
    verifyBody: (duration) => `Tap the button within the next ${duration} to verify your email and activate your account:`,
    verifyLabel: "Verify my email",
    resetSubject: "Reset your Picas y Fijas password",
    resetBody: "Tap the button within the next 15 minutes to choose a new password:",
    resetLabel: "Choose a new password",
    fallback: "If the button does not work, copy and paste this address into your browser:",
    long: "3 days",
    short: "15 minutes",
  },
  fr: {
    verifySubject: "Vérifie ton adresse e-mail Picas y Fijas",
    verifyBody: (duration) => `Appuie sur le bouton dans les ${duration} qui viennent pour vérifier ton adresse et activer ton compte :`,
    verifyLabel: "Vérifier mon adresse",
    resetSubject: "Réinitialise ton mot de passe Picas y Fijas",
    resetBody: "Appuie sur le bouton dans les 15 minutes qui viennent pour choisir un nouveau mot de passe :",
    resetLabel: "Choisir un nouveau mot de passe",
    fallback: "Si le bouton ne fonctionne pas, copie-colle cette adresse dans ton navigateur :",
    long: "3 jours",
    short: "15 minutes",
  },
};

export const mailText = (lang) => MAIL_TEXT[mailLang(lang)];

function emailHtml(text, action, copy) {
  const body = `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f2933;">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
  if (!action) return `<div style="font-family:Arial,Helvetica,sans-serif;">${body}</div>`;
  const url = escapeHtml(action.url);
  return `<div style="font-family:Arial,Helvetica,sans-serif;">${body}
  <p style="margin:0 0 24px;"><a href="${url}" style="display:inline-block;padding:14px 28px;border-radius:8px;background:#2563eb;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">${escapeHtml(action.label)}</a></p>
  <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">${escapeHtml(copy.fallback)}<br><a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a></p></div>`;
}

async function mail(env, to, subject, text, action = null, copy = MAIL_TEXT.es) {
  if (!env?.EMAIL) return false;
  try {
    await env.EMAIL.send({
      to,
      from: { email: "noreply@mail.picasyfijas.fans", name: "Picas y Fijas" },
      subject,
      text: action ? `${text}\n${action.url}\n\n${copy.fallback}` : text,
      html: emailHtml(text, action, copy),
    });
    return true;
  } catch (cause) {
    console.error(JSON.stringify({ message: "transactional-email", detail: String(cause?.message || cause) }));
    return false;
  }
}

export async function sendEmailVerification(db, env, user, email, origin, activation = false, lang = "es") {
  const address = cleanEmail(email);
  if (!validEmail(address)) return { ok: false, error: "Introduce un correo válido." };
  const duplicate = await db.prepare("SELECT id FROM users WHERE email=? AND id<>?").bind(address, user.id).first();
  if (duplicate) return { ok: false, error: "Ese correo ya está asociado a otra cuenta." };
  const token = randomToken(), at = stamp();
  await db.batch([
    db.prepare("DELETE FROM email_verifications WHERE user_id=? OR expires_at<?").bind(user.id, at),
    db.prepare("INSERT INTO email_verifications(token_hash,user_id,email,expires_at,created_at) VALUES(?,?,?,?,?)")
      .bind(await sha256(token), user.id, address, activation ? activationExpiry() : expiry(), at),
  ]);
  const link = `${origin}/?verify_email=${encodeURIComponent(token)}`;
  const copy = mailText(lang);
  const duration = activation ? copy.long : copy.short;
  const delivered = await mail(env, address, copy.verifySubject, copy.verifyBody(duration), { label: copy.verifyLabel, url: link }, copy);
  return delivered ? { ok: true } : { ok: false, error: "No pudimos enviar el correo. Inténtalo más tarde." };
}

export const requestEmailVerification = (db, env, user, email, origin, lang) =>
  sendEmailVerification(db, env, user, email, origin, false, lang);

export async function verifyEmail(db, token) {
  const at = stamp();
  const row = await db.prepare("SELECT * FROM email_verifications WHERE token_hash=? AND used_at IS NULL AND expires_at>? ").bind(await sha256(token), at).first();
  if (!row) return { ok: false, error: "El enlace no es válido o ya caducó." };
  await db.batch([
    db.prepare("UPDATE email_verifications SET used_at=? WHERE token_hash=?").bind(at, row.token_hash),
    db.prepare("UPDATE users SET email=?,email_verified_at=? WHERE id=?").bind(row.email, at, row.user_id),
  ]);
  return { ok: true };
}

export async function requestPinReset(db, env, params, requestUrl, origin) {
  const username = cleanName(params.username), email = cleanEmail(params.email), at = stamp();
  const ipCount = await db.prepare("SELECT COUNT(*) AS total FROM pin_resets WHERE requested_ip=? AND created_at>? ").bind(origin.ip, new Date(Date.now()-3600_000).toISOString()).first();
  if (Number(ipCount?.total || 0) >= 3) return { ok: true }; // identique: ne révèle rien
  const user = username
    ? await db.prepare("SELECT id,email FROM users WHERE username_key=? AND email=? AND email_verified_at IS NOT NULL").bind(usernameKey(username), email).first()
    : await db.prepare("SELECT id,email FROM users WHERE email=? AND email_verified_at IS NOT NULL").bind(email).first();
  if (!user) return { ok: true };
  const token = randomToken();
  await db.batch([
    db.prepare("DELETE FROM pin_resets WHERE user_id=? OR expires_at<?").bind(user.id, at),
    db.prepare("INSERT INTO pin_resets(token_hash,user_id,expires_at,requested_ip,created_at) VALUES(?,?,?,?,?)").bind(await sha256(token), user.id, expiry(), origin.ip, at),
  ]);
  const copy = mailText(params.lang);
  await mail(env, user.email, copy.resetSubject, copy.resetBody, { label: copy.resetLabel, url: `${new URL(requestUrl).origin}/?reset_pin=${encodeURIComponent(token)}` }, copy);
  return { ok: true };
}

export async function resetPin(db, token, pin) {
  if (!validPin(pin)) return { ok: false, error: "La contraseña debe tener entre 4 y 8 dígitos." };
  const at = stamp();
  const row = await db.prepare("SELECT * FROM pin_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?").bind(await sha256(token), at).first();
  if (!row) return { ok: false, error: "El enlace no es válido o ya caducó." };
  const salt = crypto.randomUUID();
  await db.batch([
    db.prepare("UPDATE pin_resets SET used_at=? WHERE token_hash=?").bind(at, row.token_hash),
    db.prepare("UPDATE users SET pin_salt=?,pin_hash=? WHERE id=?").bind(salt, await hashPin(pin, salt), row.user_id),
    db.prepare("DELETE FROM sessions WHERE user_id=?").bind(row.user_id),
  ]);
  return { ok: true };
}
