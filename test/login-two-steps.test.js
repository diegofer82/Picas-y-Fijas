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
    d1Databases: { DB:'00000000-0000-0000-0000-000000000003' },
    bindings: { SESSION_TTL_HOURS:'168', ADMIN_PATH:'/admin', DEBUG_ERRORS:'1' },
  });
  const db = await mf.getD1Database('DB');
  for (const file of ['0001_initial.sql','0002_chat.sql','0003_private_threads.sql','0004_admin_insight.sql','0005_feedback.sql','0006_time_bank.sql','0007_d1_free_optimization.sql','0008_email_recovery.sql','0009_username_change.sql','0010_previous_username.sql','0011_user_timezone.sql','0012_push.sql','0013_daily.sql','0014_notebook_option.sql','0015_season.sql','0016_badges.sql']) {
    const migration = await readFile(new URL('../migrations/'+file, import.meta.url), 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
});

after(async () => { await mf?.dispose(); });

async function api(action, payload = {}) {
  const response = await mf.dispatchFetch('http://localhost/api', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ action, ...payload }),
  });
  assert.equal(response.status, 200, `${action} returned HTTP ${response.status}`);
  return response.json();
}

test('the first step tells a free name apart from a taken one', async () => {
  const free = await api('checkUsername', { username:'Mafalda' });
  assert.deepEqual({ ok:free.ok, known:free.known }, { ok:true, known:false });

  await seedAccount(await mf.getD1Database('DB'), 'Mafalda');

  const taken = await api('checkUsername', { username:'Mafalda' });
  assert.equal(taken.known, true);
  // El nombre vuelve tal y como se guardo, no como lo escribio quien pregunta.
  const other = await api('checkUsername', { username:'  mAFALDA ' });
  assert.equal(other.known, true);
  assert.equal(other.username, 'Mafalda');
});

test('the first step refuses a name too short and never reveals the PIN', async () => {
  const short = await api('checkUsername', { username:'M' });
  assert.equal(short.ok, false);
  const known = await api('checkUsername', { username:'Mafalda' });
  assert.equal(JSON.stringify(known).includes('2468'), false, 'la respuesta no puede llevar rastro del PIN');
  // `appVersion` viaja en toda respuesta: es el aviso que hace recargar a una
  // pestana vieja. Lo demas sigue siendo lo minimo.
  assert.deepEqual(Object.keys(known).filter((key) => key !== 'appVersion').sort(), ['known','ok','username']);
});

test('entrar nunca crea una cuenta: el alta pasa por el registro con correo', async () => {
  const unknown = await api('loginUser', { identifier:'Nadie', pin:'2468' });
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /No existe ninguna cuenta con ese nombre/);
  const byEmail = await api('loginUser', { identifier:'nadie@ejemplo.test', pin:'2468' });
  assert.equal(byEmail.ok, false);
  assert.match(byEmail.error, /No existe una cuenta con ese correo/);
  // Y no ha quedado ninguna fila a medias.
  const db = await mf.getD1Database('DB');
  const left = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE username_key='nadie'").first();
  assert.equal(Number(left.n), 0);
});

test('los tres pasos del acceso son formularios de verdad', () => {
  const login = html.slice(html.indexOf('<section id="s-login"'), html.indexOf('<section id="s-feedback"'));
  for (const id of ['auth-register-panel','auth-login-panel','auth-forgot-panel'])
    assert.match(login, new RegExp('<form id="'+id+'"'), `${id} deberia ser un <form>`);
  // Sin <form>, el gestor de contrasenas no ofrece guardar la pareja.
  assert.match(login, /id="auth-login-btn" type="submit"/);
  assert.match(html, /\$\('auth-login-panel'\)\.addEventListener\('submit'/);
  const account = html.slice(html.indexOf('<section id="s-account"'), html.indexOf('<!-- PRACTICA'));
  assert.match(account, /<form id="account-email-form">/);
  assert.match(account, /<form id="account-pin-form">/);
  assert.match(account, /id="account-username-pin"[^>]*autocomplete="username"/);
});

test('crear cuenta pide el PIN dos veces, entrar lo pide una sola', () => {
  const register = html.slice(html.indexOf('<form id="auth-register-panel"'), html.indexOf('<form id="auth-login-panel"'));
  const login = html.slice(html.indexOf('<form id="auth-login-panel"'), html.indexOf('<form id="auth-forgot-panel"'));
  assert.match(register, /id="upin"[^>]*autocomplete="new-password"/);
  assert.match(register, /id="upin2"[^>]*autocomplete="new-password"/);
  assert.match(login, /id="login-pin"[^>]*autocomplete="current-password"/);
  assert.doesNotMatch(login, /id="upin2"/);
  assert.match(html, /if\(pin!==repeat\) return authError\('auth-register-val',t\('login_pin_mismatch'\)\)/);
});

test('la entrada es la pantalla por defecto y el alta vive en un enlace', () => {
  const login = html.slice(html.indexOf('<section id="s-login"'), html.indexOf('<section id="s-feedback"'));
  // Ya no hay conmutador de pestanas: se entra directo.
  assert.doesNotMatch(login, /auth-switch/);
  assert.match(login, /<form id="auth-register-panel" class="hidden">/);
  assert.match(login, /<form id="auth-login-panel">/);
  // Y el enlace de alta queda debajo del formulario de entrada.
  const loginPanel = login.slice(login.indexOf('<form id="auth-login-panel">'), login.indexOf('<form id="auth-forgot-panel"'));
  assert.match(loginPanel, /class="auth-alt"[\s\S]*setAuthMode\('register'\)/);
  assert.match(html, /function defaultAuthMode\(\)/);
});

test('the login copy speaks of a password and warns it cannot be recovered', () => {
  for (const key of ['login_continue','login_back_title','login_new_title','login_pin_new','login_pin2','login_pin_warn','login_pin_mismatch','login_create','login_forgot','login_wrong_pin','login_welcome','login_forgot_msg']) {
    assert.equal((html.match(new RegExp(key+':', 'g'))||[]).length, 3, `falta ${key} en alguno de los tres idiomas`);
  }
  assert.doesNotMatch(html, /login_pin:"PIN de acceso"/, 'la etiqueta ya no llama PIN a la contrasena');
});

test('a fresh account is told once that the password will be needed again', () => {
  assert.match(html, /if\(res\.firstLogin\) pendingWelcome=res\.username\|\|fallback;/);
  assert.match(html, /function showWelcomeNote\(\)/);
  assert.match(html, /id="lobby-welcome"/);
});
