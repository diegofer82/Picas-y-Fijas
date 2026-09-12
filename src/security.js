import { cleanCountry, cleanName, usernameKey } from './game.js';
import { sendEmailVerification } from './recovery.js';

// El pais y la IP no los declara el navegador: los pone Cloudflare delante del
// Worker. Se guardan solo al entrar —una escritura por sesion, no por
// peticion— porque su unico uso es administrativo: reconocer a la persona que
// vuelve con otro nombre porque olvido su PIN.
export function requestOrigin(request) {
  const forwarded = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  return {
    ip: forwarded.split(',')[0].trim().slice(0, 45),
    country: cleanCountry(request.cf?.country || request.headers.get('cf-ipcountry') || ''),
  };
}

const encoder = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
export const SESSION_TOUCH_MS = 15 * 60 * 1000;

export async function sha256(value) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
}

export async function hashPin(pin, salt) {
  return sha256(`${salt}:${String(pin)}`);
}

export async function verifyPin(pin, salt, expectedHash) {
  const actualHash = await hashPin(pin, salt);
  return crypto.subtle.timingSafeEqual(encoder.encode(actualHash), encoder.encode(String(expectedHash || '').padEnd(64, '0').slice(0, 64)));
}

export function validPin(pin) {
  return /^\d{4,8}$/.test(String(pin || ''));
}

export function cleanEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 254);
}

export function validEmail(value) {
  return /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"'.]{2,}$/.test(cleanEmail(value));
}

export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((value) => value.toString(16).padStart(2, '0')).join('');
}

// Turnstile is always verified by the Worker, never by the browser alone.
// Local tests deliberately leave TURNSTILE_ENABLED unset; production sets it
// to "1", which makes a missing secret fail closed.
export async function verifyTurnstile(env, token, action, origin) {
  if (String(env?.TURNSTILE_ENABLED || "") !== "1") return { ok: true };
  const secret = String(env?.TURNSTILE_SECRET || "");
  const allowed = new Set(
    String(env?.TURNSTILE_HOSTNAMES || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (
    typeof token !== "string" ||
    !token ||
    token.length > 2048 ||
    !secret ||
    !allowed.size
  ) return { ok: false };
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({
          secret,
          response: token,
          remoteip: String(origin?.ip || ""),
        }),
      },
    );
    if (!response.ok) return { ok: false };
    const result = await response.json();
    return {
      ok: result?.success === true &&
        result.action === action &&
        allowed.has(result.hostname),
    };
  } catch {
    return { ok: false };
  }
}

export async function createSession(db, user, ttlHours = 168, origin = {}) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Math.max(1, Number(ttlHours) || 168) * 3600000).toISOString();
  await db.prepare(`INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at,ip,country)
    VALUES(?,?,?,?,?,?,?)`).bind(tokenHash, user.id, createdAt, expiresAt, createdAt, origin.ip || '', origin.country || '').run();
  return { token, expiresAt };
}

export async function authenticate(db, request, params) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : String(params.sessionToken || '');
  if (!token) return { error: 'Sesión inválida. Vuelve a entrar con tu nombre y PIN.' };
  const tokenHash = await sha256(token);
  const user = await db.prepare(`SELECT u.id,u.username,u.username_key,u.role,u.blocked_at,u.email,u.email_verified_at,s.expires_at,s.last_seen_at
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).bind(tokenHash).first();
  if (!user || Date.parse(user.expires_at) <= Date.now()) return { error: 'La sesión ha expirado. Vuelve a entrar.' };
  if (user.blocked_at) return { error: 'Este usuario está bloqueado.' };
  params.username = user.username;
  // `authenticate` se ejecuta en cada polling. La expiracion de la sesion es
  // fija, no deslizante, asi que escribir `last_seen_at` en cada peticion no
  // aporta seguridad ni funcionalidad. Una muestra cada 15 minutos conserva
  // la informacion administrativa y elimina casi todas esas escrituras.
  const seenAt = Date.parse(user.last_seen_at || '');
  if (!Number.isFinite(seenAt) || Date.now() - seenAt >= SESSION_TOUCH_MS)
    await db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?')
      .bind(new Date().toISOString(), tokenHash).run();
  return { user, tokenHash };
}

/* Primer paso del registro: saber si el nombre ya tiene dueno para poder
   pedir la contrasena con las palabras correctas —«vuelve a entrar» o «crea
   una»— en vez de dejar al jugador adivinando en que mitad esta.
   No revela nada nuevo: el ranking ya publica los nombres y el propio
   `login` distingue el nombre libre del ocupado en su mensaje de error. Es
   una sola lectura por el indice unico `username_key`, sin escrituras, para
   no gastar el presupuesto de D1 en cada tecleo. */
export async function lookupName(db, params) {
  const username = cleanName(params.username);
  if (username.length < 2) return { ok:false, error:'El nombre debe tener al menos 2 caracteres.' };
  const row = await db.prepare('SELECT username FROM users WHERE username_key=?')
    .bind(usernameKey(username)).first();
  return { ok:true, known:!!row, username:row?.username || username };
}

export async function login(db, params, ttlHours, origin = {}) {
  const identifier = String(params.identifier || params.username || '').trim();
  const isEmail = validEmail(identifier);
  const username = cleanName(identifier);
  const key = isEmail ? cleanEmail(identifier) : usernameKey(username);
  const pin = String(params.pin || '');
  if (!isEmail && username.length < 2) return { ok:false, error:'Introduce tu nombre de usuario o correo electrónico.' };
  if (!validPin(pin)) return { ok:false, error:'El PIN debe tener entre 4 y 8 dígitos.' };
  const attempt = await db.prepare('SELECT failures,locked_until FROM login_attempts WHERE throttle_key=?').bind(key).first();
  if (attempt?.locked_until && Date.parse(attempt.locked_until) > Date.now()) {
    return { ok:false, error:'Demasiados PIN incorrectos. Inténtalo de nuevo en 15 minutos.' };
  }
  const user = await db.prepare(isEmail ? 'SELECT * FROM users WHERE email=?' : 'SELECT * FROM users WHERE username_key=?').bind(key).first();
  // Entrar nunca crea una cuenta. El alta pasa siempre por `register`, que
  // exige un correo: sin el, la cuenta naceria sin forma de recuperar el PIN.
  if (!user) return { ok:false, error:isEmail
    ? 'No existe una cuenta con ese correo.'
    : 'No existe ninguna cuenta con ese nombre. Crea una cuenta para empezar.' };
  if (user.blocked_at) return { ok:false, error:'Este usuario está bloqueado.' };
  // Solo se exige activacion a las cuentas que declararon un correo. Las
  // cuentas historicas (sin correo) siguen entrando con nombre y PIN.
  if (user.email && !user.email_verified_at) return { ok:false, error:'Activa tu cuenta desde el enlace enviado a tu correo.' };
  const stamp = new Date().toISOString();
  if (!await verifyPin(pin, user.pin_salt, user.pin_hash)) {
    const failures = (Number(attempt?.failures) || 0) + 1;
    const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
    await db.prepare(`INSERT INTO login_attempts(throttle_key,failures,locked_until,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(throttle_key) DO UPDATE SET failures=excluded.failures,locked_until=excluded.locked_until,updated_at=excluded.updated_at`)
      .bind(key, failures, lockedUntil, stamp).run();
    return { ok:false, error:failures >= 5 ? 'Demasiados PIN incorrectos. Inténtalo de nuevo en 15 minutos.' : 'El PIN no es correcto.' };
  }
  // `register` deja la cuenta sin ninguna entrada, asi que esta es la primera
  // de verdad: la que merece el aviso de bienvenida.
  const firstLogin = !user.last_login_at;
  await db.batch([
    db.prepare('DELETE FROM login_attempts WHERE throttle_key=?').bind(key),
    db.prepare(`UPDATE users SET last_login_at=?,login_count=login_count+1,
      last_ip=CASE WHEN ?<>'' THEN ? ELSE last_ip END,
      last_country=CASE WHEN ?<>'' THEN ? ELSE last_country END WHERE id=?`)
      .bind(stamp, origin.ip || '', origin.ip || '', origin.country || '', origin.country || '', user.id),
  ]);
  const session = await createSession(db, user, ttlHours, origin);
  return { ok:true, username:user.username, firstLogin, role:user.role, sessionToken:session.token, sessionExpiresAt:session.expiresAt };
}

export async function register(db, env, params, ttlHours, origin = {}) {
  const username = cleanName(params.username);
  const key = usernameKey(username);
  const email = cleanEmail(params.email);
  const pin = String(params.pin || '');
  if (username.length < 2) return { ok:false, error:'El nombre debe tener al menos 2 caracteres.' };
  if (!validEmail(email)) return { ok:false, error:'Introduce un correo válido.' };
  if (!validPin(pin)) return { ok:false, error:'El PIN debe tener entre 4 y 8 dígitos.' };
  const [sameName, sameEmail] = await db.batch([
    db.prepare('SELECT id FROM users WHERE username_key=?').bind(key),
    db.prepare('SELECT id FROM users WHERE email=?').bind(email),
  ]);
  if (sameName?.results?.[0]) return { ok:false, error:'Ese nombre de usuario ya está en uso.' };
  if (sameEmail?.results?.[0]) return { ok:false, error:'Ese correo ya está asociado a una cuenta.' };
  const stamp = new Date().toISOString();
  const salt = crypto.randomUUID();
  const pinHash = await hashPin(pin, salt);
  // Crear la cuenta no es entrar: el contador y la fecha de acceso se quedan
  // vacios hasta que alguien entre de verdad con el PIN.
  await db.prepare(`INSERT INTO users(username,username_key,email,email_verified_at,pin_salt,pin_hash,role,created_at,last_login_at,
    login_count,signup_ip,signup_country,last_ip,last_country)
    VALUES(?,?,?,?,?,?,?, ?,?,0,?,?,?,?)`)
    .bind(username, key, email, null, salt, pinHash, 'player', stamp, null,
      origin.ip || '', origin.country || '', origin.ip || '', origin.country || '').run();
  const user = await db.prepare('SELECT * FROM users WHERE username_key=?').bind(key).first();
  const sent = await sendEmailVerification(db, env, user, email, origin.origin || '', true);
  if (!sent.ok) {
    await db.prepare('DELETE FROM users WHERE id=?').bind(user.id).run();
    return sent;
  }
  return { ok:true, username:user.username, registered:true, activationRequired:true };
}

export async function accountProfile(db, user) {
  const row = await db.prepare('SELECT username,email,email_verified_at,created_at FROM users WHERE id=?').bind(user.id).first();
  return { ok:true, username:row.username, email:row.email, emailVerifiedAt:row.email_verified_at, createdAt:row.created_at };
}

export async function changePin(db, user, tokenHash, currentPin, newPin) {
  if (!validPin(newPin)) return { ok:false, error:'El PIN debe tener entre 4 y 8 dígitos.' };
  const row = await db.prepare('SELECT pin_salt,pin_hash FROM users WHERE id=?').bind(user.id).first();
  if (!row || !await verifyPin(currentPin, row.pin_salt, row.pin_hash)) return { ok:false, error:'El PIN actual no es correcto.' };
  const salt = crypto.randomUUID();
  await db.batch([
    db.prepare('UPDATE users SET pin_salt=?,pin_hash=? WHERE id=?').bind(salt, await hashPin(newPin, salt), user.id),
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').bind(user.id, tokenHash),
  ]);
  return { ok:true };
}
