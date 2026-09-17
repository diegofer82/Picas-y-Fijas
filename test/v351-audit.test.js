import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { seedAccount } from './accounts.js';
import { nameCharsError, sha256 } from '../src/security.js';

/* La auditoria de la 3.5.1 encontro una docena de fallos que las pruebas no
   veian. Cada prueba de este archivo fija uno de ellos. */

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
let mf, db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: 'src/index.js',
    modulesRules: [{ type:'ESModule', include:['**/*.js'], fallthrough:true }],
    compatibilityDate: '2026-08-02',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB:'00000000-0000-0000-0000-000000000351' },
    bindings: { SESSION_TTL_HOURS:'168', ADMIN_PATH:'/admin', DEBUG_ERRORS:'1' },
  });
  db = await mf.getD1Database('DB');
  for (const file of ['0001_initial.sql','0002_chat.sql','0003_private_threads.sql','0004_admin_insight.sql','0005_feedback.sql','0006_time_bank.sql','0007_d1_free_optimization.sql','0008_email_recovery.sql','0009_username_change.sql','0010_previous_username.sql','0011_user_timezone.sql']) {
    const migration = await readFile(new URL('../migrations/'+file, import.meta.url), 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean))
      await db.prepare(statement).run();
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

async function player(username, options = {}) {
  await seedAccount(db, username, options);
  const result = await call('loginUser', { identifier:username, pin:'2468' });
  assert.equal(result.body.ok, true, result.body.error);
  return { username:result.body.username, token:result.body.sessionToken };
}

test('el ranking y la lista de partidas piden sesion y correo validado', async () => {
  for (const action of ['leaderboard', 'listGames']) {
    const anonymous = await call(action, {});
    assert.equal(anonymous.status, 401, `${action} sin sesion`);
  }
  await seedAccount(db, 'SinValidar');
  await db.prepare("UPDATE users SET email_verified_at=NULL WHERE username_key='sinvalidar'").run();
  const pending = await call('loginUser', { identifier:'SinValidar', pin:'2468' });
  for (const action of ['leaderboard', 'listGames']) {
    const denied = await call(action, {}, pending.body.sessionToken);
    assert.equal(denied.status, 403, `${action} con el correo pendiente`);
    assert.equal(denied.body.code, 'email_pending');
  }
  const ok = await player('ConRanking');
  const ranking = await call('leaderboard', { username:'Otro' }, ok.token);
  assert.equal(ranking.body.ok, true);
});

test('la bolsa de tiempo no empieza a gastarse hasta que las dos pantallas estan listas', async () => {
  const a = await player('Bolsa-Uno'), b = await player('Bolsa-Dos');
  const created = await call('createGame', { secret:'0123', digits:4, timeMode:'bank', bankSeconds:180, bankIncrement:0 }, a.token);
  assert.equal(created.body.ok, true, created.body.error);
  const joined = await call('joinGame', { gameId:created.body.gameId, secret:'4567' }, b.token);
  assert.equal(joined.body.ok, true, joined.body.error);
  let row = await db.prepare('SELECT timer_paused,timer_activated,turn_started_at FROM games WHERE game_id=?').bind(created.body.gameId).first();
  assert.equal(row.timer_paused, 1, 'recien unida, la bolsa sigue quieta');
  assert.equal(row.timer_activated, 0);
  assert.equal(row.turn_started_at, '');
  await call('state', { gameId:created.body.gameId }, b.token);
  row = await db.prepare('SELECT timer_activated FROM games WHERE game_id=?').bind(created.body.gameId).first();
  assert.equal(row.timer_activated, 0, 'una sola pantalla no basta');
  const ready = await call('state', { gameId:created.body.gameId }, a.token);
  assert.equal(ready.body.timerPaused, false, 'con las dos pantallas, arranca');
  assert.equal(ready.body.bank1Remaining, 180);
});

test('dos revanchas simultaneas terminan en una sola partida y sin huerfanas', async () => {
  const a = await player('Rev-Uno'), b = await player('Rev-Dos');
  const created = await call('createGame', { secret:'012', digits:3 }, a.token);
  const gameId = created.body.gameId;
  await call('joinGame', { gameId, secret:'345' }, b.token);
  await call('state', { gameId }, a.token);
  const state = await call('state', { gameId }, b.token);
  const [first, second] = state.body.yourTurn ? [b, a] : [a, b];
  const firstSolution = first === a ? '345' : '012';
  await call('guess', { gameId, guess:firstSolution, requestId:'rev-1' }, first.token);
  await call('guess', { gameId, guess:'987', requestId:'rev-2' }, second.token);
  const [ra, rb] = await Promise.all([
    call('rematch', { gameId, secret:'678' }, a.token),
    call('rematch', { gameId, secret:'901' }, b.token),
  ]);
  assert.equal(ra.body.ok, true, ra.body.error);
  assert.equal(rb.body.ok, true, rb.body.error);
  assert.equal(ra.body.gameId, rb.body.gameId, 'los dos acaban en la misma revancha');
  const open = await db.prepare("SELECT COUNT(*) AS n FROM games WHERE (p1 IN (?,?)) AND status='waiting'").bind(a.username, b.username).first();
  assert.equal(open.n, 0, 'ninguna partida en espera se queda sin rival');
});

test('el nombre y el correo comparten el contador de PIN, y Mi cuenta tambien cuenta', async () => {
  await seedAccount(db, 'Cerrojo', { email:'cerrojo@ejemplo.test' });
  for (let i = 0; i < 3; i++) await call('loginUser', { identifier:'Cerrojo', pin:'1111' });
  await call('loginUser', { identifier:'cerrojo@ejemplo.test', pin:'1111' });
  const fifth = await call('loginUser', { identifier:'cerrojo@ejemplo.test', pin:'1111' });
  assert.match(fifth.body.error, /15 minutos/, 'el quinto fallo bloquea, se escriba el nombre o el correo');
  const right = await call('loginUser', { identifier:'Cerrojo', pin:'2468' });
  assert.equal(right.body.ok, false, 'bloqueada, ni el PIN correcto entra');

  const victim = await player('Robada');
  for (let i = 0; i < 4; i++) {
    const wrong = await call('changePin', { currentPin:'0000', newPin:'1234' }, victim.token);
    assert.equal(wrong.body.error, 'El PIN actual no es correcto.');
  }
  const locked = await call('changePin', { currentPin:'0001', newPin:'1234' }, victim.token);
  assert.match(locked.body.error, /15 minutos/, 'una sesion robada no puede probar PIN sin limite');
  const renamed = await call('changeUsername', { newUsername:'Otra', pin:'2468' }, victim.token);
  assert.equal(renamed.body.ok, false);
  assert.match(renamed.body.error, /15 minutos/);
});

test('un nombre nuevo no puede traer comillas ni angulos', async () => {
  assert.ok(nameCharsError(`x');alert(1);//`));
  assert.ok(nameCharsError('a"b'));
  assert.ok(nameCharsError('<b>'));
  assert.equal(nameCharsError('José-Luis_ 2'), '');
  const registered = await call('registerUser', { username:`O'Hara`, email:'ohara@ejemplo.test', pin:'2468' });
  assert.equal(registered.body.ok, false);
  assert.match(registered.body.error, /comillas/);
  const someone = await player('Normal');
  const renamed = await call('changeUsername', { newUsername:'Mal"Nombre', pin:'2468' }, someone.token);
  assert.equal(renamed.body.ok, false);
  assert.match(renamed.body.error, /comillas/);
});

test('borrar a quien fue administrador y respondio al buzon no falla', async () => {
  const boss = await player('Diego', { role:'admin' });
  await seedAccount(db, 'ExJefe');
  const ex = await db.prepare("SELECT id FROM users WHERE username_key='exjefe'").first();
  const stamp = new Date().toISOString();
  const fb = await db.prepare(`INSERT INTO feedback(kind,message,contact,username,lang,app_version,user_agent,ip,country,status,admin_note,created_at,updated_at)
    VALUES('idea','un mensaje cualquiera','a@b.test','','es','','','','','done','',?,?)`).bind(stamp, stamp).run();
  await db.prepare('INSERT INTO feedback_replies(feedback_id,admin_user_id,recipient,subject,body,created_at) VALUES(?,?,?,?,?,?)')
    .bind(fb.meta.last_row_id, ex.id, 'a@b.test', 'Re', 'Gracias', stamp).run();
  const deleted = await call('adminDeleteUser', { target:'ExJefe' }, boss.token);
  assert.equal(deleted.body.ok, true, deleted.body.error);
  assert.equal(await db.prepare("SELECT id FROM users WHERE username_key='exjefe'").first(), null);
});

test('la moderacion del chat queda en la auditoria y la exportacion lleva el correo', async () => {
  const boss = await player('Diego', { role:'admin' });
  await seedAccount(db, 'Ruidoso');
  const muted = await call('adminMuteChatUser', { target:'Ruidoso', minutes:10 }, boss.token);
  assert.equal(muted.body.ok, true, muted.body.error);
  const audit = await db.prepare("SELECT target FROM audit_log WHERE action='adminMuteChatUser'").first();
  assert.equal(audit?.target, 'Ruidoso');
  const read = await call('adminChatThreads', {}, boss.token);
  assert.equal(read.body.ok, true);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'adminChat%'").first()).n, 0, 'leer no se audita');

  const missing = await call('adminSetBlocked', { target:'NoExiste', blocked:true }, boss.token);
  assert.equal(missing.body.ok, false, 'no se audita un bloqueo sobre nadie');

  const exported = await call('adminExport', {}, boss.token);
  const row = exported.body.users.find((user) => user.username_key === 'ruidoso');
  assert.equal(row.email, 'ruidoso@ejemplo.test', 'sin el correo la copia no permite recuperar ninguna cuenta');
  assert.ok('email_verified_at' in row);
});

test('un enlace de verificacion cuya direccion ya tiene dueno responde sin error 500', async () => {
  await seedAccount(db, 'Primera', { email:'compartida@ejemplo.test' });
  await seedAccount(db, 'Segunda', { email:'segunda@ejemplo.test' });
  await db.prepare("UPDATE users SET email_verified_at=NULL WHERE username_key='segunda'").run();
  const second = await db.prepare("SELECT id FROM users WHERE username_key='segunda'").first();
  const token = 'token-de-prueba-compartida';
  await db.prepare('INSERT INTO email_verifications(token_hash,user_id,email,expires_at,created_at) VALUES(?,?,?,?,?)')
    .bind(await sha256(token), second.id, 'compartida@ejemplo.test', new Date(Date.now() + 3600e3).toISOString(), new Date().toISOString()).run();
  const verified = await call('verifyEmail', { token });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.ok, false);
  assert.equal(verified.body.error, 'Ese correo ya está asociado a otra cuenta.');
});

test('el navegador escapa las comillas y conserva la bolsa al continuar desde el lobby', () => {
  const esc = new Function(html.match(/function esc\(s\)\{[^\n]+\}/)[0] + ';return esc;')();
  assert.equal(esc(`a"b'c<d>&`), 'a&quot;b&#39;c&lt;d&gt;&amp;');
  const jsArg = new Function(html.match(/function jsArg\(s\)\{[^\n]+\}/)[0] + ';return jsArg;')();
  assert.ok(!jsArg(`x');alert(1);//`).includes("'"), 'un apostrofo cerraria la cadena del onclick');
  assert.doesNotMatch(html, /onclick="[^"]*encodeURIComponent/);
  assert.match(html, /timeMode:g\.timeMode,bankSeconds:g\.bankSeconds,bankIncrement:g\.bankIncrement/);
  assert.match(html, /const ERR_PATTERNS = \{/);
});
