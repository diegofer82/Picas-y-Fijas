import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { seedAccount } from './accounts.js';
import { changeUsername } from '../src/rename.js';
import { register } from '../src/security.js';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

let mf, db;

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
  db = await mf.getD1Database('DB');
  for (const file of ['0001_initial.sql','0002_chat.sql','0003_private_threads.sql','0004_admin_insight.sql','0005_feedback.sql','0006_time_bank.sql','0007_d1_free_optimization.sql','0008_email_recovery.sql','0009_username_change.sql','0010_previous_username.sql','0011_user_timezone.sql','0012_push.sql']) {
    const migration = await readFile(new URL('../migrations/'+file, import.meta.url), 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean))
      await db.prepare(statement).run();
  }
});

after(async () => { await mf?.dispose(); });

async function api(action, payload = {}, token = '') {
  const response = await mf.dispatchFetch('http://localhost/api', {
    method:'POST',
    headers:{ 'content-type':'application/json', ...(token ? { authorization:`Bearer ${token}` } : {}) },
    body:JSON.stringify({ action, ...payload }),
  });
  return response.json();
}

async function player(username) {
  await seedAccount(db, username);
  const result = await api('loginUser', { identifier:username, pin:'2468' });
  assert.equal(result.ok, true, result.error);
  return { username:result.username, token:result.sessionToken };
}

// Una partida terminada sembrada a mano: lo que importa es lo que el
// renombre tiene que reescribir, no como se llego a ella.
async function finishedGame(id, p1, p2, winner) {
  const stamp = new Date().toISOString();
  const guesses = JSON.stringify([
    { by:p1, guess:'4560', fijas:1, picas:2 },
    { by:p2, guess:'0123', fijas:4, picas:0 },
  ]);
  await db.prepare(`INSERT INTO games(game_id,status,digits,p1,secret1,p2,secret2,guesses,winner,created_at,updated_at,finish_reason)
    VALUES(?,'finished',4,?,'0123',?,'4567',?,?,?,?,'solved')`).bind(id, p1, p2, guesses, winner, stamp, stamp).run();
}

test('renombrar arrastra historial, ranking, chat e hilos, y el correo no cambia', async () => {
  const zoe = await player('Zoe');
  const ana = await player('Ana');
  await finishedGame('RN01', 'Ana', 'Zoe', 'Zoe');
  await finishedGame('RN02', 'Zoe', 'Ana', 'Zoe');
  const stamp = new Date().toISOString();
  await db.prepare(`INSERT INTO chat_threads(pair_key,user1,user1_key,user2,user2_key,created_at,last_game_at,latest_game_id)
    VALUES('ana|zoe','Ana','ana','Zoe','zoe',?,?,'RN02')`).bind(stamp, stamp).run();
  await db.prepare(`INSERT INTO chat_messages(room_type,sender,sender_key,kind,body,created_at)
    VALUES('lobby','Zoe','zoe','user','hola',?)`).bind(stamp).run();

  const wrongPin = await api('changeUsername', { newUsername:'Abril', pin:'0000' }, zoe.token);
  assert.equal(wrongPin.ok, false, 'sin el PIN no se cambia nada');
  const taken = await api('changeUsername', { newUsername:'ana', pin:'2468' }, zoe.token);
  assert.equal(taken.ok, false, 'un nombre ocupado, aunque cambie de mayúsculas, no se puede tomar');

  // «Abril» ordena antes que «ana»: el hilo tiene que darse la vuelta.
  const renamed = await api('changeUsername', { newUsername:'Abril', pin:'2468' }, zoe.token);
  assert.equal(renamed.ok, true, renamed.error);
  assert.equal(renamed.username, 'Abril');
  assert.ok(renamed.usernameNextChangeAt, 'la respuesta dice cuándo se podrá volver a cambiar');

  const profile = await api('accountProfile', {}, zoe.token);
  assert.equal(profile.username, 'Abril', 'la misma sesión ya lleva el nombre nuevo');
  assert.equal(profile.email, 'zoe@ejemplo.test', 'el correo no se toca');

  const history = await api('history', {}, zoe.token);
  assert.equal(history.stats.played, 2);
  assert.equal(history.stats.wins, 2, 'las victorias siguen siendo suyas');
  assert.equal(history.history[0].myAttempts, 1, 'y sus jugadas también');
  assert.equal(history.stats.averageWinningAttempts, 1);

  const ranking = await api('leaderboard', { username:'Abril' }, zoe.token);
  assert.deepEqual(ranking.ranking.map((row) => row.user).sort(), ['Abril', 'Ana']);
  assert.equal(ranking.me.wins, 2);

  const rivalView = await api('history', {}, ana.token);
  assert.deepEqual(rivalView.history.map((entry) => entry.opp), ['Abril', 'Abril'], 'el rival ve el nombre nuevo');

  const thread = await db.prepare("SELECT * FROM chat_threads WHERE latest_game_id='RN02'").first();
  assert.deepEqual([thread.pair_key, thread.user1, thread.user2], ['abril|ana', 'Abril', 'Ana']);
  const message = await db.prepare("SELECT sender,sender_key FROM chat_messages WHERE body='hola'").first();
  assert.deepEqual([message.sender, message.sender_key], ['Abril', 'abril']);

  assert.equal((await api('loginUser', { identifier:'Zoe', pin:'2468' })).ok, false, 'el nombre viejo ya no entra');
  assert.equal((await api('loginUser', { identifier:'Abril', pin:'2468' })).ok, true, 'el nuevo sí');
  assert.equal((await api('loginUser', { identifier:'zoe@ejemplo.test', pin:'2468' })).ok, true, 'y el correo también');
});

test('una vez cada 90 días, salvo corregir mayúsculas', async () => {
  const leo = await player('Leo');
  assert.equal((await api('changeUsername', { newUsername:'Leonardo', pin:'2468' }, leo.token)).ok, true);
  const again = await api('changeUsername', { newUsername:'Leon', pin:'2468' }, leo.token);
  assert.equal(again.ok, false);
  assert.match(again.error, /90 días/);
  assert.ok(Date.parse(again.usernameNextChangeAt) > Date.now() + 89 * 86400000);
  assert.equal((await api('changeUsername', { newUsername:'LEONARDO', pin:'2468' }, leo.token)).ok, true,
    'cambiar solo mayúsculas no consume el cupo');

  await db.prepare("UPDATE users SET username_changed_at=? WHERE username_key='leonardo'")
    .bind(new Date(Date.now() - 91 * 86400000).toISOString()).run();
  assert.equal((await api('changeUsername', { newUsername:'Leon', pin:'2468' }, leo.token)).ok, true, 'pasados 90 días, sí');
});

// Dos personas piden el mismo nombre a la vez: las dos pasan la lectura previa
// y solo el indice unico las separa. Se reproduce escondiendo esa lectura.
// `verifyPin` usa `timingSafeEqual`, que solo existe en el runtime de Workers.
crypto.subtle.timingSafeEqual ??= (a, b) => a.byteLength === b.byteLength && a.every((byte, i) => byte === b[i]);

function blindToName(database, name) {
  return new Proxy(database, { get(target, prop) {
    if (prop !== 'prepare') { const value = target[prop]; return typeof value === 'function' ? value.bind(target) : value; }
    return (sql) => {
      const statement = target.prepare(sql);
      if (!/^SELECT id FROM users WHERE username_key=\?$/.test(sql)) return statement;
      return { bind: (...args) => statement.bind(...(args[0] === name ? ['(nadie)'] : args)) };
    };
  } });
}

test('si dos piden el mismo nombre a la vez, el segundo recibe «ya está en uso» y nada cambia', async () => {
  await player('Rita');
  await seedAccount(db, 'Rival');
  const rita = await db.prepare("SELECT * FROM users WHERE username_key='rita'").first();
  await finishedGame('RC01', 'Rita', 'Ana', 'Rita');
  const late = await changeUsername(blindToName(db, 'rival'), rita, { newUsername:'Rival', pin:'2468' });
  assert.deepEqual(late, { ok:false, error:'Ese nombre de usuario ya está en uso.' });
  const after = await db.prepare("SELECT username,username_changed_at FROM users WHERE id=?").bind(rita.id).first();
  assert.deepEqual(after, { username:'Rita', username_changed_at:null }, 'el lote entero se deshace y no gasta el cupo');
  const game = await db.prepare("SELECT p1,winner FROM games WHERE game_id='RC01'").first();
  assert.deepEqual(game, { p1:'Rita', winner:'Rita' }, 'ninguna partida queda a medias');

  const signup = await register(blindToName(db, 'rival'), {}, { username:'Rival', email:'otra@ejemplo.test', pin:'2468' }, 168);
  assert.deepEqual(signup, { ok:false, error:'Ese nombre de usuario ya está en uso.' }, 'el alta tampoco revienta con un 500');
});

test('con una partida abierta no se renombra', async () => {
  const eva = await player('Eva');
  const created = await api('createGame', { username:'Eva', secret:'0123', digits:4, mode:'numbers', numColors:10,
    allowRepeats:false, isPublic:false, maxAttempts:0, turnSeconds:0 }, eva.token);
  assert.equal(created.ok, true, created.error);
  const blocked = await api('changeUsername', { newUsername:'Evita', pin:'2468' }, eva.token);
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /partidas abiertas/);
});

test('«Mi cuenta» ofrece el cambio de nombre en los tres idiomas', () => {
  assert.match(html, /<form id="account-name-form" autocomplete="off">/);
  // El nombre nuevo y el PIN no comparten formulario: juntos, el gestor de
  // contraseñas los tomaba por un cambio de credenciales y ofrecía cambiar el PIN.
  const nameForm = html.slice(html.indexOf('<form id="account-name-form"'), html.indexOf('<form id="account-name-confirm"'));
  assert.doesNotMatch(nameForm, /type="password"|autocomplete="(username|current-password|new-password)"/);
  const confirmForm = html.slice(html.indexOf('<form id="account-name-confirm"'), html.indexOf('<form id="account-email-form"'));
  assert.match(confirmForm, /id="account-username-name" type="text" autocomplete="username"[^>]*readonly/);
  assert.match(confirmForm, /id="account-name-pin" type="password"[^>]*autocomplete="current-password"/);
  assert.doesNotMatch(confirmForm, /new-password/, 'confirmar el nombre nunca pide un PIN nuevo');
  assert.match(html, /api\('changeUsername',\{newUsername:username,pin\}\)/);
  assert.match(html, /localStorage\.setItem\('pf_user',user\)/, 'el navegador recuerda el nombre nuevo');
  for (const key of ['account_name','account_name_hint','account_name_next','account_save_name','account_name_saved','account_name_confirm','account_name_confirm_btn','account_name_cancel'])
    assert.equal((html.match(new RegExp(key+':', 'g')) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
  for (const message of ['Solo puedes cambiar tu nombre una vez cada 90 días.','Termina o cancela tus partidas abiertas antes de cambiar tu nombre.'])
    assert.equal(html.split(`"${message}":`).length - 1, 2, `falta traducir «${message}»`);
});

test('el correo verificado no se cambia, ni desde la pantalla ni desde la API', async () => {
  const mia = await player('Mia');
  const asked = await api('requestEmailVerification', { email:'otra-mia@ejemplo.test' }, mia.token);
  assert.deepEqual([asked.ok, asked.error], [false, 'Tu correo ya está verificado y no se puede cambiar.']);

  // Un enlace que quedara de antes tampoco sustituye la dirección verificada.
  const { sha256 } = await import('../src/security.js');
  const user = await db.prepare("SELECT id FROM users WHERE username_key='mia'").first();
  const expires = new Date(Date.now() + 3600000).toISOString();
  await db.prepare('INSERT INTO email_verifications(token_hash,user_id,email,expires_at,created_at) VALUES(?,?,?,?,?)')
    .bind(await sha256('enlace-viejo'), user.id, 'otra-mia@ejemplo.test', expires, new Date().toISOString()).run();
  const opened = await api('verifyEmail', { token:'enlace-viejo' });
  assert.equal(opened.ok, false);
  const profile = await api('accountProfile', {}, mia.token);
  assert.equal(profile.email, 'mia@ejemplo.test');

  assert.match(html, /\$\('account-email'\)\.readOnly=locked;/);
  assert.match(html, /\$\('account-email-btn'\)\.classList\.toggle\('hidden',locked\);/);
  assert.equal((html.match(/account_email_locked:/g) || []).length, 3);
  assert.equal(html.split('"Tu correo ya está verificado y no se puede cambiar.":').length - 1, 2);
});
