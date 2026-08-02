import { cleanName, usernameKey } from './game.js';

const encoder = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');

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

export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function createSession(db, user, ttlHours = 168) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Math.max(1, Number(ttlHours) || 168) * 3600000).toISOString();
  await db.prepare(`INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at)
    VALUES(?,?,?,?,?)`).bind(tokenHash, user.id, createdAt, expiresAt, createdAt).run();
  return { token, expiresAt };
}

export async function authenticate(db, request, params) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : String(params.sessionToken || '');
  if (!token) return { error: 'Sesión inválida. Vuelve a entrar con tu nombre y PIN.' };
  const tokenHash = await sha256(token);
  const user = await db.prepare(`SELECT u.id,u.username,u.username_key,u.role,u.blocked_at,s.expires_at
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).bind(tokenHash).first();
  if (!user || Date.parse(user.expires_at) <= Date.now()) return { error: 'La sesión ha expirado. Vuelve a entrar.' };
  if (user.blocked_at) return { error: 'Este usuario está bloqueado.' };
  params.username = user.username;
  await db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').bind(new Date().toISOString(), tokenHash).run();
  return { user, tokenHash };
}

export async function login(db, params, ttlHours) {
  const username = cleanName(params.username);
  const key = usernameKey(username);
  const pin = String(params.pin || '');
  if (username.length < 2) return { ok:false, error:'El nombre debe tener al menos 2 caracteres.' };
  if (!validPin(pin)) return { ok:false, error:'El PIN debe tener entre 4 y 8 dígitos.' };
  const attempt = await db.prepare('SELECT failures,locked_until FROM login_attempts WHERE throttle_key=?').bind(key).first();
  if (attempt?.locked_until && Date.parse(attempt.locked_until) > Date.now()) {
    return { ok:false, error:'Demasiados PIN incorrectos. Inténtalo de nuevo en 15 minutos.' };
  }
  let user = await db.prepare('SELECT * FROM users WHERE username_key=?').bind(key).first();
  let registered = false;
  const stamp = new Date().toISOString();
  if (user) {
    if (user.blocked_at) return { ok:false, error:'Este usuario está bloqueado.' };
    if (!await verifyPin(pin, user.pin_salt, user.pin_hash)) {
      const failures = (Number(attempt?.failures) || 0) + 1;
      const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
      await db.prepare(`INSERT INTO login_attempts(throttle_key,failures,locked_until,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(throttle_key) DO UPDATE SET failures=excluded.failures,locked_until=excluded.locked_until,updated_at=excluded.updated_at`)
        .bind(key, failures, lockedUntil, stamp).run();
      return { ok:false, error:failures >= 5 ? 'Demasiados PIN incorrectos. Inténtalo de nuevo en 15 minutos.' : 'Ese nombre ya existe y el PIN no es correcto.' };
    }
    await db.batch([
      db.prepare('DELETE FROM login_attempts WHERE throttle_key=?').bind(key),
      db.prepare('UPDATE users SET last_login_at=? WHERE id=?').bind(stamp, user.id),
    ]);
  } else {
    const salt = crypto.randomUUID();
    const pinHash = await hashPin(pin, salt);
    await db.prepare(`INSERT INTO users(username,username_key,pin_salt,pin_hash,role,created_at,last_login_at)
      VALUES(?,?,?,?,?,?,?)`).bind(username, key, salt, pinHash, key === 'diego' ? 'admin' : 'player', stamp, stamp).run();
    user = await db.prepare('SELECT * FROM users WHERE username_key=?').bind(key).first();
    registered = true;
  }
  const session = await createSession(db, user, ttlHours);
  return { ok:true, username:user.username, registered, role:user.role, sessionToken:session.token, sessionExpiresAt:session.expiresAt };
}
