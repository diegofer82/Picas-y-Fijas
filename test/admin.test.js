import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { aliasRoot, classifySql, duplicateGroups } from '../src/admin.js';
import { requestOrigin } from '../src/security.js';

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
  for (const file of ['0001_initial.sql','0002_chat.sql','0003_private_threads.sql','0004_admin_insight.sql','0005_feedback.sql','0006_time_bank.sql']) {
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
  const result = await api('loginUser', { username, pin:'2468' }, '', { 'cf-connecting-ip':ip, 'cf-ipcountry':'CO' });
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
  assert.equal(carlos.last_country, carlos.signup_country);
  assert.equal(carlos.last_ip, '198.51.100.20');
  assert.equal(carlos.signup_ip, '198.51.100.20');
  assert.equal(carlos.login_count, 1);
});

test('la raiz del nombre ignora acentos, digitos y signos', () => {
  assert.equal(aliasRoot('Carlos46'), 'carlos');
  assert.equal(aliasRoot('Nuboso_2'), 'nuboso');
  assert.equal(aliasRoot('Andrés'), 'andres');
});

test('las cuentas repetidas se agrupan por IP y por nombre, con su motivo', () => {
  const groups = duplicateGroups([
    { username:'Carlos', last_ip:'1.1.1.1', last_country:'co', games:3 },
    { username:'Carlos46', last_ip:'1.1.1.1', last_country:'co', games:1 },
    { username:'Otra', last_ip:'', last_country:'fr', games:0 },
  ]);
  assert.deepEqual(groups.map((g) => g.reason).sort(), ['ip','nombre']);
  for (const group of groups) assert.deepEqual(group.members.map((m) => m.username), ['Carlos','Carlos46']);
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

test('fusionar dos cuentas arrastra partidas y mensajes y deja una sola', async () => {
  const boss = await admin();
  const viejo = await player('Nube', '198.51.100.55');
  const nuevo = await player('Nube7', '198.51.100.55');
  const rival = await player('Rival');
  const gameA = await duel(viejo, rival, '123', '456');
  const gameB = await duel(nuevo, rival, '321', '654');
  await api('chatSend', { roomType:'game', gameId:gameA, body:'primera cuenta' }, viejo.token);
  await api('chatSend', { roomType:'game', gameId:gameB, body:'segunda cuenta' }, nuevo.token);

  const merged = await api('adminMergeUsers', { from:'Nube7', into:'Nube' }, boss.token);
  assert.equal(merged.ok, true, merged.error);

  const users = await api('adminUsers', {}, boss.token);
  assert.equal(users.users.some((u) => u.username === 'Nube7'), false, 'la cuenta absorbida desaparece');
  const survivor = users.users.find((u) => u.username === 'Nube');
  assert.equal(survivor.games, 2, 'las partidas de las dos cuentas quedan bajo el mismo nombre');

  const detail = await api('adminUserDetail', { target:'Nube' }, boss.token);
  assert.equal(detail.stats.messages, 2, 'los mensajes tambien cambian de dueño');
  assert.equal(detail.threads.length, 1, 'los dos hilos con el mismo rival se unifican en uno');
});

test('la fusion protege al administrador principal y a las cuentas admin', async () => {
  const boss = await admin();
  await player('Diego');
  const refused = await api('adminMergeUsers', { from:'Diego', into:'Jefa' }, boss.token);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /administrador principal/);
  const itself = await api('adminMergeUsers', { from:'Jefa', into:'Jefa' }, boss.token);
  assert.equal(itself.ok, false);
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
  for (const action of ['adminUserDetail','adminMergeUsers','adminDeleteUser','adminPurgeGames','adminSql','adminChatThreads','adminChatThread','adminCloseSessions']) {
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
});
