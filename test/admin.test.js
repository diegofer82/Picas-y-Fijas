import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { classifySql } from '../src/admin.js';
import { requestOrigin } from '../src/security.js';
import { seedAccount } from './accounts.js';

const adminHtml = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');
const publicHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

let mf;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: 'src/index.js',
    modulesRules: [{ type:'ESModule', include:['**/*.js'], fallthrough:true }],
    compatibilityDate: '2026-08-02',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB:'00000000-0000-0000-0000-000000000002' },
    bindings: { SESSION_TTL_HOURS:'168', ADMIN_PATH:'/admin', DEBUG_ERRORS:'1' },
  });
  const db = await mf.getD1Database('DB');
  for (const file of ['0001_initial.sql','0002_chat.sql','0003_private_threads.sql','0004_admin_insight.sql','0005_feedback.sql','0006_time_bank.sql','0007_d1_free_optimization.sql','0008_email_recovery.sql','0009_username_change.sql']) {
    const migration = await readFile(new URL('../migrations/'+file, import.meta.url), 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
});

after(async () => { await mf?.dispose(); });

async function api(action, payload = {}, token = '', headers = {}) {
  const response = await mf.dispatchFetch('http://localhost/api', {
    method:'POST',
    headers:{ 'content-type':'application/json', ...(token ? { authorization:`Bearer ${token}` } : {}), ...headers },
    body:JSON.stringify({ action, ...payload }),
  });
  assert.equal(response.status, 200, `${action} returned HTTP ${response.status}`);
  return response.json();
}

async function player(username, ip = '203.0.113.7') {
  await seedAccount(await mf.getD1Database('DB'), username, { ip, country:'co' });
  const result = await api('loginUser', { identifier:username, pin:'2468' }, '', { 'cf-connecting-ip':ip, 'cf-ipcountry':'CO' });
  assert.equal(result.ok, true, result.error);
  return { username:result.username, token:result.sessionToken };
}

async function admin() {
  const db = await mf.getD1Database('DB');
  const account = await player('Jefa');
  await db.prepare("UPDATE users SET role='admin' WHERE username_key='jefa'").run();
  return account;
}

async function duel(p1, p2, secret1, secret2) {
  const created = await api('createGame', { username:p1.username, digits:3, mode:'numbers', numColors:10,
    allowRepeats:false, maxAttempts:0, turnSeconds:0, revealSecrets:false, isPublic:true, secret:secret1, country:'co' }, p1.token);
  assert.equal(created.ok, true, created.error);
  const joined = await api('joinGame', { gameId:created.gameId, username:p2.username, secret:secret2, country:'fr' }, p2.token);
  assert.equal(joined.ok, true, joined.error);
  return created.gameId;
}

test('la IP y el pais los pone la red, no el navegador', () => {
  const request = new Request('https://picasyfijas.fans/api', {
    headers:{ 'cf-connecting-ip':'198.51.100.4, 10.0.0.1', 'cf-ipcountry':'FR' },
  });
  assert.deepEqual(requestOrigin(request), { ip:'198.51.100.4', country:'fr' });
  assert.deepEqual(requestOrigin(new Request('https://picasyfijas.fans/api')), { ip:'', country:'' });
});

test('entrar deja registrado el pais y la ultima IP de cada cuenta', async () => {
  const boss = await admin();
  await player('Carlos', '198.51.100.20');
  const list = await api('adminUsers', {}, boss.token);
  const carlos = list.users.find((u) => u.username === 'Carlos');
  // El pais lo decide la red que sirve la peticion, asi que aqui solo se
  // comprueba que llega y se guarda; su procedencia la fija la prueba de
  // `requestOrigin`.
  assert.match(carlos.last_country, /^[a-z]{2}$/);
  assert.equal(carlos.last_ip, '198.51.100.20');
  assert.equal(carlos.signup_ip, '198.51.100.20');
  assert.equal(carlos.login_count, 1);
});

test('el listado administrativo distingue jugadores conectados y desconectados', async () => {
  const boss = await admin();
  const connected = await player('Conectada');
  const disconnected = await player('Desconectada');
  await api('presence', {}, connected.token);
  await api('presence', {}, disconnected.token);
  const db = await mf.getD1Database('DB');
  await db
    .prepare("UPDATE presence SET last_seen_at=? WHERE username_key='desconectada'")
    .bind(new Date(Date.now() - 3 * 60 * 1000).toISOString())
    .run();

  const list = await api('adminUsers', {}, boss.token);
  assert.equal(Number(list.users.find((u) => u.username === 'Conectada').online), 1);
  assert.equal(Number(list.users.find((u) => u.username === 'Desconectada').online), 0);
});

test('la administracion ve conversaciones, no un rio de mensajes sueltos', async () => {
  const boss = await admin();
  const ana = await player('Ana'), beto = await player('Beto');
  const gameId = await duel(ana, beto, '123', '456');
  await api('chatSend', { roomType:'game', gameId, body:'Suerte' }, ana.token);
  await api('chatSend', { roomType:'lobby', body:'Hola a todos' }, beto.token);

  const rooms = await api('adminChatThreads', {}, boss.token);
  assert.equal(rooms.ok, true, rooms.error);
  assert.equal(rooms.threads.every((t) => t.user1 && t.user2), true, 'cada fila nombra a sus dos participantes');
  assert.equal(rooms.threads.some((t) => t.messages !== undefined && t.body === undefined), true, 'el listado no trae los cuerpos');
  assert.ok(rooms.lobby.messages >= 1);

  const pair = rooms.threads.find((t) => [t.user1,t.user2].includes('Ana') && [t.user1,t.user2].includes('Beto'));
  const opened = await api('adminChatThread', { threadId:pair.id }, boss.token);
  assert.equal(opened.messages.some((m) => m.body === 'Suerte'), true);
  const lobby = await api('adminChatThread', { threadId:0 }, boss.token);
  assert.equal(lobby.messages.some((m) => m.body === 'Hola a todos'), true);
});

test('la fusion de cuentas ya no existe en ninguna capa', async () => {
  const boss = await admin();
  const gone = await api('adminMergeUsers', { from:'Ana', into:'Beto' }, boss.token);
  assert.equal(gone.ok, false);
  assert.match(gone.error, /desconocida/);
  const source = await readFile(new URL('../src/admin.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /adminMergeUsers/);
  assert.doesNotMatch(adminHtml, /data-merge|openMerge/);
});

test('tampoco queda el buscador de cuentas repetidas, que solo servia para fusionar', async () => {
  const boss = await admin();
  const list = await api('adminUsers', {}, boss.token);
  assert.equal(list.duplicates, undefined, 'el listado ya no agrupa por IP ni por raiz del nombre');
  const detail = await api('adminUserDetail', { target:'Jefa' }, boss.token);
  assert.equal(detail.related, undefined, 'ni la ficha propone cuentas parecidas');
  const source = await readFile(new URL('../src/admin.js', import.meta.url), 'utf8');
  for (const gone of [/aliasRoot/, /duplicateGroups/]) assert.doesNotMatch(source, gone);
  assert.doesNotMatch(adminHtml, /dupPanel|Posibles cuentas repetidas|Cuentas parecidas/);
});

test('el panel confirma en su propia ventana, nunca con la del navegador', () => {
  // confirm/prompt/alert no caben en un movil, no se pueden explicar y no
  // distinguen entre cerrar una partida y borrar una cuenta.
  for (const banned of [/[^.\w]confirm\(/, /[^.\w]prompt\(/, /[^.\w]alert\(/])
    assert.doesNotMatch(adminHtml, banned, `sigue habiendo ${banned}`);
  assert.match(adminHtml, /<dialog id="ask"/);
  assert.match(adminHtml, /function ask\(options\)/);
  // Borrar una cuenta pide escribir el nombre exacto y siempre es una purga.
  assert.match(adminHtml, /name:'confirm',type:'text',label:'Escribe «'\+name\+'» para confirmar',match:name/);
  assert.doesNotMatch(adminHtml, /name:'purge',type:'checkbox'/);
  assert.match(adminHtml, /todos sus datos: partidas e historial, chats, reportes, sesiones/);
});

test('borrar una cuenta purga todos los datos vinculados y no deja auditoría', async () => {
  const boss = await admin();
  const forgotten = await player('Olvidado'), other = await player('Testigo');
  const db = await mf.getD1Database('DB');
  await db.prepare("UPDATE users SET email='olvidado@example.test' WHERE username_key='olvidado'").run();
  const row = await db.prepare("SELECT id FROM users WHERE username_key='olvidado'").first();
  const gameId = await duel(forgotten, other, '123', '456');
  await api('chatSend', { roomType:'game', gameId, body:'mensaje privado' }, forgotten.token);
  await api('chatSend', { roomType:'lobby', body:'mensaje público' }, forgotten.token);
  const otherMessage = await db.prepare("INSERT INTO chat_messages(room_type,sender,sender_key,kind,body,created_at) VALUES('lobby','Testigo','testigo','user','mensaje ajeno',?) RETURNING id")
    .bind(new Date().toISOString()).first();
  await db.prepare("INSERT INTO chat_reports(message_id,reporter,reporter_key,reason,created_at) VALUES(?,?,?,?,?)")
    .bind(otherMessage.id, 'Olvidado', 'olvidado', 'spam', new Date().toISOString()).run();
  await db.prepare("INSERT INTO request_receipts(request_id,username_key,game_id,response_json,created_at) VALUES('forget-me','olvidado',?,'{}',?)")
    .bind(gameId, new Date().toISOString()).run();
  await db.prepare("INSERT INTO feedback(kind,message,contact,username,lang,app_version,user_agent,ip,country,status,admin_note,created_at,updated_at) VALUES('idea','olvidar','olvidado@example.test','Olvidado','es','','','','','new','',?,?)")
    .bind(new Date().toISOString(), new Date().toISOString()).run();
  await db.prepare("INSERT INTO email_verifications(token_hash,user_id,email,expires_at,created_at) VALUES('forget-token',?,'olvidado@example.test',?,?)")
    .bind(row.id, new Date(Date.now() + 86400000).toISOString(), new Date().toISOString()).run();
  await db.prepare("INSERT INTO audit_log(admin_user_id,action,target,details_json,created_at) VALUES(?,?,?,?,?)")
    .bind(row.id, 'oldAction', 'Olvidado', '{\"target\":\"Olvidado\"}', new Date().toISOString()).run();

  const deleted = await api('adminDeleteUser', { target:'Olvidado' }, boss.token);
  assert.equal(deleted.ok, true, deleted.error);
  const checks = await Promise.all([
    db.prepare("SELECT 1 FROM users WHERE username_key='olvidado'").first(),
    db.prepare("SELECT 1 FROM games WHERE p1='Olvidado' OR p2='Olvidado'").first(),
    db.prepare("SELECT 1 FROM chat_messages WHERE sender_key='olvidado'").first(),
    db.prepare("SELECT 1 FROM chat_threads WHERE user1_key='olvidado' OR user2_key='olvidado'").first(),
    db.prepare("SELECT 1 FROM chat_reports WHERE reporter_key='olvidado'").first(),
    db.prepare("SELECT 1 FROM request_receipts WHERE username_key='olvidado' OR game_id=?").bind(gameId).first(),
    db.prepare("SELECT 1 FROM feedback WHERE username='Olvidado' OR contact='olvidado@example.test'").first(),
    db.prepare("SELECT 1 FROM email_verifications WHERE user_id=? OR token_hash='forget-token'").bind(row.id).first(),
    db.prepare("SELECT 1 FROM audit_log WHERE admin_user_id=? OR target='Olvidado' OR details_json LIKE '%Olvidado%'").bind(row.id).first(),
  ]);
  assert.deepEqual(checks, Array(9).fill(null));
});

test('las tablas del panel se leen en un telefono', () => {
  assert.match(adminHtml, /@media \(max-width:760px\)/);
  assert.match(adminHtml, /\.stack td::before\{content:attr\(data-label\)/);
  // Cada celda de Usuarios lleva su etiqueta; si no, la ficha del movil sale muda.
  for (const label of ['Usuario','País','Última IP','Partidas','Mensajes','Rol','Último acceso','Estado','Acciones'])
    assert.ok(adminHtml.includes(`data-label="${label}"`), `falta data-label="${label}"`);
});

test('el panel no se queda sin puerta: recuperacion del PIN desde el acceso', () => {
  assert.match(adminHtml, /href="\/\?forgot=1"/);
  // Y el juego sabe abrir ese modo desde la URL.
  assert.match(publicHtml, /const forgotRequested=new URLSearchParams\(location\.search\)\.get\('forgot'\)==='1'/);
});

test('el panel no deja entrar a una cuenta sin correo validado', () => {
  // Entrar a un panel cuyas ocho pestañas responderian 403 no ayuda a nadie.
  assert.match(adminHtml, /if\(r\.emailPending\)return showGate\(r\.email\)/);
  assert.match(adminHtml, /function showGate\(email\)/);
  assert.doesNotMatch(adminHtml, /checkOwnRecovery/);
});

test('la consola SQL para lo que rompe: dos instrucciones, DDL y borrados sin filtro', () => {
  assert.equal(classifySql('SELECT 1').kind, 'read');
  assert.equal(classifySql('UPDATE users SET role=\'player\' WHERE id=3').kind, 'write');
  assert.match(classifySql('SELECT 1; DELETE FROM users').error, /una instrucción/);
  assert.match(classifySql('DROP TABLE users').error, /migración/);
  assert.match(classifySql('ALTER TABLE users ADD COLUMN x TEXT').error, /migración/);
  assert.match(classifySql('DELETE FROM games').error, /WHERE/);
  assert.match(classifySql('UPDATE users SET role=\'admin\'').error, /WHERE/);
  assert.match(classifySql('   ').error, /Escribe/);
  assert.equal(classifySql('WITH x AS (SELECT 1 a) SELECT * FROM x').kind, 'read');
});

test('la consola SQL lee al momento y solo escribe cuando se confirma', async () => {
  const boss = await admin();
  await player('Consulta');
  const read = await api('adminSql', { sql:"SELECT username FROM users WHERE username='Consulta'" }, boss.token);
  assert.deepEqual(read.columns, ['username']);
  assert.deepEqual(read.rows, [['Consulta']]);

  const before = await api('adminSql', { sql:"SELECT last_country FROM users WHERE username='Consulta'" }, boss.token);
  const pending = await api('adminSql', { sql:"UPDATE users SET last_country='es' WHERE username='Consulta'" }, boss.token);
  assert.equal(pending.pending, true, 'un cambio sin confirmar no se ejecuta');
  const unchanged = await api('adminSql', { sql:"SELECT last_country FROM users WHERE username='Consulta'" }, boss.token);
  assert.deepEqual(unchanged.rows, before.rows);

  const done = await api('adminSql', { sql:"UPDATE users SET last_country='es' WHERE username='Consulta'", confirm:1 }, boss.token);
  assert.equal(done.changes, 1);
  const after = await api('adminSql', { sql:"SELECT last_country FROM users WHERE username='Consulta'" }, boss.token);
  assert.deepEqual(after.rows, [['es']]);

  const audit = await api('adminAudit', {}, boss.token);
  assert.equal(audit.audit.some((row) => row.action === 'adminSql'), true, 'todo cambio por SQL queda auditado');
});

test('limpiar partidas cuenta antes de borrar', async () => {
  const boss = await admin();
  const a = await player('Limpio'), b = await player('Limpia');
  const gameId = await duel(a, b, '123', '456');
  await api('adminCloseGame', { target:gameId }, boss.token);

  const preview = await api('adminPurgeGames', { status:'cancelled' }, boss.token);
  assert.equal(preview.preview, true);
  assert.ok(preview.matched >= 1);
  const purged = await api('adminPurgeGames', { status:'cancelled', confirm:1 }, boss.token);
  assert.equal(purged.matched, preview.matched);
  assert.ok(purged.deleted >= preview.matched);
  const left = await api('adminSql', { sql:"SELECT COUNT(*) n FROM games WHERE status='cancelled'" }, boss.token);
  assert.deepEqual(left.rows, [['0']]);
});

test('ninguna herramienta nueva responde sin rol de administrador', async () => {
  const intruder = await player('Curioso');
  for (const action of ['adminUserDetail','adminDeleteUser','adminPurgeGames','adminSql','adminChatThreads','adminChatThread','adminCloseSessions']) {
    const denied = await api(action, { target:'Jefa', sql:'SELECT 1' }, intruder.token);
    assert.equal(denied.ok, false, `${action} deberia rechazar a un jugador`);
    assert.match(denied.error, /administrador/);
  }
  const anonymous = await mf.dispatchFetch('http://localhost/api', {
    method:'POST', headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ action:'adminSql', sql:'SELECT 1' }),
  });
  assert.equal(anonymous.status, 401);
});

test('el panel abre las conversaciones aparte y ofrece la vuelta al juego', async () => {
  const html = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');
  assert.match(html, /id="backToGame"/, 'el toro azul devuelve al juego');
  assert.match(html, /\$\('backToGame'\)\.onclick=\(\)=>\{signOut\(\);location\.href='\/'\}/,
    'volver al juego cierra tambien la sesion del panel');
  assert.match(html, /class="toro"/, 'la mascota es la misma del juego');
  assert.doesNotMatch(html, /Mensajes recientes/, 'ya no hay un listado plano de mensajes');
  assert.match(html, /adminChatThreads/);
  assert.match(html, /adminChatThread'/);
  assert.match(html, /class="presence-dot\$\{x\.online\?' online':''\}"/,
    'cada usuario lleva un punto de presencia');
  assert.match(html, /aria-label="\$\{x\.online\?'En línea':'Desconectado'\}"/,
    'el estado no depende solo del color');
});
