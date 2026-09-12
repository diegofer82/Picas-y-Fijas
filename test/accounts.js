import { hashPin } from '../src/security.js';
import { usernameKey } from '../src/game.js';

/* Entrar ya no crea la cuenta: el alta pasa por `register`, que manda un
   correo de activación. Las pruebas no tienen buzón, así que siembran la
   cuenta ya activada directamente en la base y luego entran con normalidad.
   Es la misma fila que deja `register`, sin el viaje del correo. */
export async function seedAccount(db, username, { pin = '2468', email, role = 'player', ip = '', country = '' } = {}) {
  const key = usernameKey(username);
  const existing = await db.prepare('SELECT username FROM users WHERE username_key=?').bind(key).first();
  if (existing) return existing.username;
  const salt = crypto.randomUUID();
  const stamp = new Date().toISOString();
  await db.prepare(`INSERT INTO users(username,username_key,email,email_verified_at,pin_salt,pin_hash,role,created_at,
    last_login_at,login_count,signup_ip,signup_country,last_ip,last_country)
    VALUES(?,?,?,?,?,?,?,?,?,0,?,?,?,?)`)
    .bind(username, key, email || `${key}@ejemplo.test`, stamp, salt, await hashPin(pin, salt), role, stamp,
      null, ip, country, ip, country).run();
  return username;
}
