import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { seedAccount } from './accounts.js';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

let mf;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: 'src/index.js',
    modulesRules: [{ type:'ESModule', include:['**/*.js'], fallthrough:true }],
    compatibilityDate: '2026-08-02',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB:'00000000-0000-0000-0000-000000000009' },
    bindings: { SESSION_TTL_HOURS:'168', ADMIN_PATH:'/admin', DEBUG_ERRORS:'1' },
  });
  const db = await mf.getD1Database('DB');
  for (const file of ['0001_initial.sql','0002_chat.sql','0003_private_threads.sql','0004_admin_insight.sql','0005_feedback.sql','0006_time_bank.sql','0007_d1_free_optimization.sql','0008_email_recovery.sql','0009_username_change.sql','0010_previous_username.sql','0011_user_timezone.sql']) {
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

// Una cuenta antigua: existe, tiene PIN y no tiene correo. Es exactamente el
// caso que la puerta tiene que resolver sin dejar a nadie fuera para siempre.
async function legacyAccount(username) {
  const db = await mf.getD1Database('DB');
  await seedAccount(db, username, { email:'' });
  await db.prepare("UPDATE users SET email='',email_verified_at=NULL WHERE username_key=?")
    .bind(username.toLowerCase()).run();
  const entered = await call('loginUser', { identifier:username, pin:'2468' });
  return entered;
}

test('sin correo validado no se entra, y aun así hay sesión', async () => {
  const entered = await legacyAccount('Antigua');
  assert.equal(entered.body.ok, false, 'entrar con el correo sin validar es que no');
  assert.equal(entered.body.emailPending, true, 'la sesión nace a medias');
  assert.ok(entered.body.sessionToken, 'y aun así hay sesión: sin ella no podría pedir el enlace');
  const token = entered.body.sessionToken;

  for (const action of ['myGames','createGame','chatThreads','lobbyState','presence','changePin']) {
    const denied = await call(action, { username:'Antigua' }, token);
    assert.equal(denied.status, 403, `${action} debería quedar cerrado`);
    assert.equal(denied.body.code, 'email_pending');
  }

  // Lo único abierto es lo que sirve para abrir la puerta.
  const profile = await call('accountProfile', {}, token);
  assert.equal(profile.status, 200);
  assert.equal(profile.body.emailVerifiedAt, null);
  const asked = await call('requestEmailVerification', { email:'antigua@ejemplo.test' }, token);
  assert.notEqual(asked.status, 403, 'pedir el enlace no puede estar detrás de la propia puerta');
});

test('validar el correo abre la puerta sin volver a entrar', async () => {
  const entered = await legacyAccount('Tardona');
  const token = entered.body.sessionToken;
  assert.equal((await call('myGames', { username:'Tardona' }, token)).status, 403);

  const db = await mf.getD1Database('DB');
  await db.prepare("UPDATE users SET email=?,email_verified_at=? WHERE username_key='tardona'")
    .bind('tardona@ejemplo.test', new Date().toISOString()).run();

  const allowed = await call('myGames', { username:'Tardona' }, token);
  assert.equal(allowed.status, 200, 'la misma sesión ya sirve');
  assert.equal(allowed.body.ok, true, allowed.body.error);
});

test('la administración también espera detrás de la puerta', async () => {
  const db = await mf.getD1Database('DB');
  const entered = await legacyAccount('JefaSinCorreo');
  await db.prepare("UPDATE users SET role='admin' WHERE username_key='jefasincorreo'").run();
  const denied = await call('adminSummary', {}, entered.body.sessionToken);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'email_pending');
});

test('la pantalla que bloquea existe y dice las dos cosas distintas', () => {
  assert.match(html, /<section id="s-verify" class="hidden">/);
  assert.match(html, /<form id="verify-form">/);
  // Sin correo apuntado y con correo pendiente no se pide lo mismo.
  for (const key of ['verify_hint_missing','verify_hint_sent','verify_send','verify_resend','verify_done','verify_not_yet'])
    assert.equal((html.match(new RegExp(key+':', 'g')) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
  // El navegador no decide: obedece al 403 del servidor.
  assert.match(html, /if\(denied\.code==='email_pending'\)\{ handleEmailPending\(\); throw new Error\('EMAIL_PENDING'\); \}/);
  assert.match(html, /if\(res\.emailPending\) return showVerifyGate\(res\);/);
});
