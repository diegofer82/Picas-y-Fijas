import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';

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
  for (const file of ['0001_initial.sql','0002_chat.sql','0003_private_threads.sql','0004_admin_insight.sql','0005_feedback.sql','0006_time_bank.sql','0007_d1_free_optimization.sql']) {
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

  const created = await api('loginUser', { username:'Mafalda', pin:'2468' });
  assert.equal(created.ok, true, created.error);
  assert.equal(created.registered, true, 'el primer acceso es un registro');

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
  assert.deepEqual(Object.keys(known).sort(), ['known','ok','username']);
});

test('a returning name does not have to confirm the password, a new one does', () => {
  assert.match(html, /function applyLoginPinStep\(\)/);
  assert.match(html, /\$\('login-pin2-row'\)\.classList\.toggle\('hidden',loginKnown\)/);
  assert.match(html, /\$\('upin2'\)\.value\.trim\(\)!==pin\) return loginStepError\('upin-val',t\('login_pin_mismatch'\)\)/);
  assert.match(html, /\$\('upin'\)\.setAttribute\('autocomplete',loginKnown\?'current-password':'new-password'\)/);
});

test('the login copy speaks of a password and warns it cannot be recovered', () => {
  for (const key of ['login_continue','login_back_title','login_new_title','login_pin_new','login_pin2','login_pin_warn','login_pin_mismatch','login_create','login_forgot','login_wrong_pin','login_welcome','login_forgot_msg']) {
    assert.equal((html.match(new RegExp(key+':', 'g'))||[]).length, 3, `falta ${key} en alguno de los tres idiomas`);
  }
  assert.doesNotMatch(html, /login_pin:"PIN de acceso"/, 'la etiqueta ya no llama PIN a la contrasena');
});

test('a fresh account is told once that the password will be needed again', () => {
  assert.match(html, /if\(res\.registered\) pendingWelcome=res\.username\|\|v;/);
  assert.match(html, /function showWelcomeNote\(\)/);
  assert.match(html, /id="lobby-welcome"/);
});
