import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { seedAccount } from './accounts.js';
import { APP_VERSION } from '../src/version.js';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const adminHtml = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

/* Tres síntomas distintos —una cuenta sin validar que ve el vestíbulo, un
   mensaje en español dentro de un juego en francés y un contador parado hace
   hora y media— resultaron ser el mismo fallo: una pestaña con la versión
   anterior hablando con el servidor nuevo. Estas pruebas vigilan las tres
   costuras por las que se coló. */

let mf;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: 'src/index.js',
    modulesRules: [{ type:'ESModule', include:['**/*.js'], fallthrough:true }],
    compatibilityDate: '2026-08-02',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB:'00000000-0000-0000-0000-000000000011' },
    bindings: { SESSION_TTL_HOURS:'168', ADMIN_PATH:'/admin', DEBUG_ERRORS:'1' },
  });
  const db = await mf.getD1Database('DB');
  // La lista se lee del directorio: una migración nueva entra sola.
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort()) {
    const migration = await readFile(new URL('../migrations/'+file, import.meta.url), 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
});

after(async () => { await mf?.dispose(); });

async function call(action, payload = {}, token = '') {
  const response = await mf.dispatchFetch('http://localhost/api', {
    method:'POST',
    headers:{ 'content-type':'application/json', ...(token ? { authorization:`Bearer ${token}` } : {}) },
    body:JSON.stringify({ action, ...payload }),
  });
  return { status:response.status, body:await response.json() };
}

test('la versión es la misma en el Worker, en la página y en el paquete', () => {
  const client = html.match(/const APP_VERSION = '([^']+)'/)?.[1];
  assert.equal(client, APP_VERSION, 'la página y el Worker deben anunciar la misma versión');
  assert.equal(APP_VERSION, 'v' + pkg.version, 'package.json va con la misma versión');
});

test('cada respuesta dice qué versión la escribió', async () => {
  const anonymous = await call('checkUsername', { username:'Nadie' });
  assert.equal(anonymous.body.appVersion, APP_VERSION);
  const denied = await call('lobbyState', {}, 'token-que-no-existe');
  assert.equal(denied.status, 401);
  assert.equal(denied.body.appVersion, APP_VERSION, 'también los rechazos: son los que más ve una pestaña vieja');
});

test('una página desfasada se recarga en vez de seguir adivinando', () => {
  assert.match(html, /if\(data\.appVersion&&data\.appVersion!==APP_VERSION\) handleOutdatedClient\(data\.appVersion\);/);
  assert.match(html, /function handleOutdatedClient\(serverVersion\)\{/);
  // Una sola recarga: si la nueva carga sigue desfasada, se pide a mano.
  assert.match(html, /sessionStorage\.getItem\('pf_reloaded_for'\)===serverVersion/);
  for (const key of ['outdated_reload','outdated_manual','lobby_offline'])
    assert.equal((html.match(new RegExp(key+':', 'g')) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
});

test('sin correo validado, entrar es que no', async () => {
  const db = await mf.getD1Database('DB');
  await seedAccount(db, 'Wendy');
  await db.prepare("UPDATE users SET email_verified_at=NULL WHERE username_key='wendy'").run();
  const entered = await call('loginUser', { identifier:'Wendy', pin:'2468' });
  assert.equal(entered.body.ok, false, 'un cliente antiguo lee esto y se queda en la pantalla de acceso');
  assert.equal(entered.body.emailPending, true);
  assert.equal(entered.body.code, 'email_pending');
  assert.ok(entered.body.error, 'y con el motivo escrito');
  assert.ok(entered.body.sessionToken, 'la sesión viaja igual: sirve para pedir el enlace');

  await db.prepare("UPDATE users SET email_verified_at=? WHERE username_key='wendy'")
    .bind(new Date().toISOString()).run();
  const again = await call('loginUser', { identifier:'Wendy', pin:'2468' });
  assert.equal(again.body.ok, true, again.body.error);
  assert.equal(again.body.emailPending, false);
});

test('el navegador trata el correo pendiente como un no con sesión', () => {
  assert.match(html, /if\(!res\.ok&&!res\.emailPending\)\{userPin='';return authError\('auth-login-val',te\(res\.error\)\);\}/);
  assert.match(html, /if\(res\.emailPending\) return showVerifyGate\(res\);/);
  // En el panel, la puerta del correo se mira antes que el rol: una entrada
  // rechazada no puede depender de un `role` que ya no viaja.
  assert.ok(adminHtml.indexOf('if(r.emailPending)') < adminHtml.indexOf("if(r.role!=='admin')"),
    'el panel debe mirar el correo pendiente antes que el rol');
});

/* El vestíbulo ya no anuncia un recuento de hace hora y media: pasado un
   minuto, lo único cierto es que no hay línea. */
test('el contador viejo no se hace pasar por información fresca', () => {
  assert.match(html, /\$\('players-online'\)\.textContent=age>60\s*\?\s*t\('lobby_offline'\)/);
  assert.match(html, /if\(e&&\(e\.message==='EMAIL_PENDING'\|\|e\.message==='SESSION_EXPIRED'\)\) return;/);
});

/* --------- ningún mensaje del servidor se queda sin traducir --------- */

// El panel de administración es una herramienta interna y está en español:
// sus mensajes no pasan por el diccionario del juego.
const ADMIN_ONLY = new Set([
  'Acceso de administrador requerido.',
  'Acción administrativa desconocida.',
  'Acción administrativa de chat desconocida.',
  'Usuario no encontrado.',
  'No se puede borrar el administrador principal.',
  'No se puede retirar el administrador principal.',
  'No puedes borrar tu propia cuenta.',
  'Quita primero el rol de administrador a esta cuenta.',
  'Elige al menos un estado o una antigüedad.',
  'Escribe una consulta.',
  'Solo se permite una instrucción por ejecución.',
  'Aquí no se cambia el esquema (CREATE, ALTER, DROP, PRAGMA…). Eso va en una migración numerada.',
  'Un UPDATE o DELETE sin WHERE afectaría a la tabla entera. Añade una condición (WHERE 1=1 si de verdad es lo que quieres).',
  'El ganador debe ser uno de los jugadores o quedar vacío para empate.',
  'Falta el identificador.',
  'Faltan el mensaje o su identificador.',
  'El mensaje ya no existe.',
  'Nada que cambiar.',
  'Este mensaje no tiene un correo válido.',
  'No se pudo enviar el correo.',
]);

function serverMessages(source) {
  const found = new Set();
  // Tambien las validaciones que devuelven la frase suelta (`return "…"`),
  // que llegan al jugador como `error` sin pasar por un literal `error:`.
  for (const pattern of [/error:\s*'([^']+)'/g, /error:\s*"([^"]+)"/g, /\berror\(\s*'([^']+)'/g, /\berror\(\s*"([^"]+)"/g,
    /\breturn\s+'([A-Z¿¡][^'`$]*\.)'/g, /\breturn\s+"([A-Z¿¡][^"`$]*\.)"/g, /\?\s*"([A-Z][^"`$]*\.)"\s*:/g])
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  return found;
}

test('todo mensaje que puede leer un jugador existe en los tres idiomas', async () => {
  const dictionaries = new Function(
    html.slice(html.indexOf('const ERR = {'), html.indexOf('/* Instrucciones del juego')).replace('const ERR', 'var ERR') + ';return ERR;',
  )();
  const messages = new Set();
  // La lista de archivos era a mano, y por eso `arena.js`, `daily.js`,
  // `push.js` y `season.js` entraron al juego sin que nadie comprobara sus
  // mensajes: cuatro frases salian en espanol dentro de un juego en frances.
  // Ahora se recorre `src/` entero, asi que un modulo nuevo no puede colarse.
  const sources = new URL('../src/', import.meta.url);
  for (const file of (await readdir(sources)).filter((name) => name.endsWith('.js')))
    for (const message of serverMessages(await readFile(new URL(file, sources), 'utf8')))
      messages.add(message);
  const untranslated = [...messages]
    .filter((message) => !ADMIN_ONLY.has(message))
    .filter((message) => !dictionaries.en[message] || !dictionaries.fr[message]);
  assert.deepEqual(untranslated, [],
    'estos mensajes saldrían en español dentro de un juego en inglés o en francés');
});
