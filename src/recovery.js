import { cleanName, usernameKey } from "./game.js";
import { cleanEmail, hashPin, randomToken, sha256, validEmail, validPin } from "./security.js";

const stamp = () => new Date().toISOString();
const expiry = () => new Date(Date.now() + 15 * 60_000).toISOString();
const activationExpiry = () => new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();

async function mail(env, to, subject, text) {
  if (!env?.EMAIL) return false;
  try {
    await env.EMAIL.send({
      to,
      from: { email: "noreply@mail.picasyfijas.fans", name: "Picas y Fijas" },
      subject,
      text,
      html: `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`,
    });
    return true;
  } catch (cause) {
    console.error(JSON.stringify({ message: "transactional-email", detail: String(cause?.message || cause) }));
    return false;
  }
}

export async function sendEmailVerification(db, env, user, email, origin, activation = false) {
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
  const duration = activation ? "30 días" : "15 minutos";
  const delivered = await mail(env, address, "Verifica tu correo de Picas y Fijas", `Abre este enlace en los próximos ${duration} para verificar tu correo y activar tu cuenta:\n${link}`);
  return delivered ? { ok: true } : { ok: false, error: "No pudimos enviar el correo. Inténtalo más tarde." };
}

export const requestEmailVerification = (db, env, user, email, origin) =>
  sendEmailVerification(db, env, user, email, origin, false);

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
  await mail(env, user.email, "Restablece tu contraseña de Picas y Fijas", `Abre este enlace en los próximos 15 minutos para elegir una contraseña nueva:\n${new URL(requestUrl).origin}/?reset_pin=${encodeURIComponent(token)}`);
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
