import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { bankRemaining, expiredTurnChanges, freshTurnClock, isBankGame, sanitizeGame } from '../src/game.js';
import { feedbackEmail, replyAddress, validateFeedback } from '../src/feedback.js';

let mf;
let db;

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
  db = await mf.getD1Database('DB');
  for (const file of ['0001_initial.sql','0002_chat.sql','0003_private_threads.sql','0004_admin_insight.sql','0005_feedback.sql','0006_time_bank.sql','0007_d1_free_optimization.sql']) {
    const migration = await readFile(new URL('../migrations/'+file, import.meta.url), 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
});

after(async () => { await mf?.dispose(); });

async function api(action, payload = {}, token = '') {
  const response = await mf.dispatchFetch('http://localhost/api', {
    method:'POST',
    headers:{ 'content-type':'application/json', ...(token ? { authorization:`Bearer ${token}` } : {}) },
    body:JSON.stringify({ action, ...payload }),
  });
  assert.equal(response.status, 200, `${action} returned HTTP ${response.status}`);
  return response.json();
}

async function player(username) {
  const result = await api('loginUser', { username, pin:'2468' });
  assert.equal(result.ok, true, result.error);
  return { username:result.username, token:result.sessionToken };
}

const BANK = { digits:4, mode:'numbers', numColors:10, allowRepeats:false, isPublic:true, maxAttempts:0,
  turnSeconds:0, timeMode:'bank', bankSeconds:300, bankIncrement:5, revealSecrets:true };

async function bankGame(a, b, overrides = {}) {
  const created = await api('createGame', { username:a.username, country:'co', secret:'0123', ...BANK, ...overrides }, a.token);
  assert.equal(created.ok, true, created.error);
  const joined = await api('joinGame', { gameId:created.gameId, username:b.username, secret:'4567', country:'fr' }, b.token);
  assert.equal(joined.ok, true, joined.error);
  // El reloj no arranca hasta que las dos pantallas han pedido el estado.
  await api('state', { gameId:created.gameId }, a.token);
  await api('state', { gameId:created.gameId }, b.token);
  return created.gameId;
}

/* -------------------- la bolsa de tiempo -------------------- */

test('solo se acepta una bolsa de 3, 5 o 10 minutos y un incremento aprobado', async () => {
  const a = await player('Bank-Rules');
  for (const [overrides, pattern] of [
    [{ bankSeconds:45 }, /3, 5 o 10 minutos/],
    [{ bankIncrement:7 }, /incremento/i],
  ]) {
    const result = await api('createGame', { username:a.username, secret:'0123', ...BANK, ...overrides }, a.token);
    assert.equal(result.ok, false, JSON.stringify(overrides));
    assert.match(result.error, pattern);
  }
});

test('los dos relojes son excluyentes: elegir uno deja el otro en cero', async () => {
  const a = await player('Bank-Exclusive');
  const bank = await api('createGame', { username:a.username, secret:'0123', ...BANK, turnSeconds:30 }, a.token);
  assert.equal(bank.ok, true, bank.error);
  const bankRow = await db.prepare('SELECT time_mode,turn_seconds,bank_seconds FROM games WHERE game_id=?').bind(bank.gameId).first();
  assert.equal(bankRow.time_mode, 'bank');
  assert.equal(bankRow.turn_seconds, 0, 'la bolsa apaga el cronómetro por turno');
  await api('closeGame', { gameId:bank.gameId, intent:'cancel' }, a.token);

  // Otra cuenta, porque crear dos partidas seguidas tiene 10 segundos de espera.
  const c = await player('Turn-Exclusive');
  const turn = await api('createGame', { username:c.username, secret:'0123', ...BANK, timeMode:'turn', turnSeconds:60, bankSeconds:300, bankIncrement:5 }, c.token);
  assert.equal(turn.ok, true, turn.error);
  const turnRow = await db.prepare('SELECT time_mode,turn_seconds,bank_seconds,bank_increment FROM games WHERE game_id=?').bind(turn.gameId).first();
  assert.equal(turnRow.time_mode, 'turn');
  assert.equal(turnRow.turn_seconds, 60);
  assert.equal(turnRow.bank_seconds, 0, 'sin bolsa, sus campos no entran de contrabando');
  assert.equal(turnRow.bank_increment, 0);
  await api('closeGame', { gameId:turn.gameId, intent:'cancel' }, c.token);
});

test('cada jugador estrena su bolsa y solo corre la de quien tiene el turno', async () => {
  const a = await player('Bank-A');
  const b = await player('Bank-B');
  const gameId = await bankGame(a, b);
  const state = await api('state', { gameId }, a.token);
  assert.equal(state.timeMode, 'bank');
  assert.equal(state.bankSeconds, 300);
  assert.equal(state.bankIncrement, 5);
  assert.equal(state.bank1Remaining, 300);
  assert.equal(state.bank2Remaining, 300);

  const row = await db.prepare('SELECT * FROM games WHERE game_id=?').bind(gameId).first();
  const started = Date.parse(row.turn_started_at);
  const later = started + 60_000;
  const mover = Number(row.turn);
  const waiting = mover === 1 ? 2 : 1;
  assert.equal(bankRemaining(row, mover, later), 240);
  assert.equal(bankRemaining(row, waiting, later), 300, 'el reloj del rival no corre');
  await api('closeGame', { gameId, intent:'abandon' }, a.token);
});

test('la jugada descuenta lo consumido y abona el incremento sin pasarse de la bolsa', () => {
  const base = { status:'active', time_mode:'bank', bank_seconds:300, bank_increment:5, turn:1,
    bank1_remaining:300, bank2_remaining:300, timer_paused:0, turn_started_at:new Date(0).toISOString() };
  const after40 = freshTurnClock(base, 40_000);
  assert.equal(after40.bank1_remaining, 265, '300 - 40 consumidos + 5 de incremento');
  assert.equal(after40.bank2_remaining, undefined, 'la jugada no toca el reloj del rival');

  // El incremento nunca levanta la bolsa por encima de su tamano inicial.
  const quick = freshTurnClock({ ...base, bank1_remaining:300 }, 1_000);
  assert.equal(quick.bank1_remaining, 300);
});

test('cuando cae la bandera pierde quien agotó su bolsa, y el rival lo descubre al consultar', async () => {
  const a = await player('Flag-A');
  const b = await player('Flag-B');
  const gameId = await bankGame(a, b, { bankIncrement:0 });
  const row = await db.prepare('SELECT turn,p1,p2 FROM games WHERE game_id=?').bind(gameId).first();
  const loser = row.turn === 1 ? a : b;
  const winner = row.turn === 1 ? b : a;
  await db.prepare('UPDATE games SET turn_started_at=? WHERE game_id=?')
    .bind(new Date(Date.now() - 301_000).toISOString(), gameId).run();

  // Basta con que consulte el rival: nadie depende del navegador del perdedor.
  const seen = await api('state', { gameId }, winner.token);
  assert.equal(seen.status, 'finished');
  assert.equal(seen.winner, winner.username);
  assert.equal(seen.finishReason, 'timeout');

  const late = await api('guess', { gameId, guess:'0123', requestId:'flag-late' }, loser.token);
  assert.equal(late.ok, false);
});

test('la caída de bandera también se puede reportar desde el propio navegador', async () => {
  const a = await player('Flag-Self-A');
  const b = await player('Flag-Self-B');
  const gameId = await bankGame(a, b, { bankIncrement:0 });
  const row = await db.prepare('SELECT turn FROM games WHERE game_id=?').bind(gameId).first();
  const loser = row.turn === 1 ? a : b;
  const winner = row.turn === 1 ? b : a;

  const early = await api('passTurn', { gameId }, loser.token);
  assert.equal(early.ok, false, 'con tiempo de sobra no se rinde la partida');

  await db.prepare('UPDATE games SET turn_started_at=? WHERE game_id=?')
    .bind(new Date(Date.now() - 400_000).toISOString(), gameId).run();
  const fallen = await api('passTurn', { gameId }, loser.token);
  assert.equal(fallen.ok, true, fallen.error);
  assert.equal(fallen.timeout, true);
  const closed = await api('state', { gameId }, winner.token);
  assert.equal(closed.status, 'finished');
  assert.equal(closed.winner, winner.username);
  assert.equal(closed.finishReason, 'timeout');
});

test('con el último intento en juego, quedarse sin tiempo entrega la victoria a quien ya resolvió', () => {
  const game = { status:'active', time_mode:'bank', bank_seconds:180, bank_increment:0, turn:2,
    p1:'Ana', p2:'Beto', pending_winner:'Ana', bank1_remaining:100, bank2_remaining:0,
    timer_paused:0, turn_started_at:new Date(0).toISOString() };
  const changes = expiredTurnChanges(game, 1_000);
  assert.equal(changes.status, 'finished');
  assert.equal(changes.winner, 'Ana');
  assert.equal(changes.finish_reason, 'timeout');
  assert.equal(changes.pending_winner, '');
});

test('en modo bolsa no hay pausas: ni la manual ni la del lobby', async () => {
  const a = await player('NoPause-A');
  const b = await player('NoPause-B');
  const gameId = await bankGame(a, b);
  const refused = await api('togglePause', { gameId }, a.token);
  assert.equal(refused.ok, false);

  const before = await db.prepare('SELECT bank1_remaining,bank2_remaining,timer_paused FROM games WHERE game_id=?').bind(gameId).first();
  await api('gamePresence', { gameId, connected:false, reason:'lobby' }, a.token);
  const after = await db.prepare('SELECT lobby_paused_by,timer_paused FROM games WHERE game_id=?').bind(gameId).first();
  assert.equal(after.lobby_paused_by, '', 'volver al lobby no congela la bolsa');
  assert.equal(after.timer_paused, before.timer_paused);
  await api('closeGame', { gameId, intent:'abandon' }, a.token);
});

test('la revancha hereda la bolsa, su tamaño y su incremento', async () => {
  const a = await player('BankRematch-A');
  const b = await player('BankRematch-B');
  const gameId = await bankGame(a, b, { bankSeconds:600, bankIncrement:10 });
  await db.prepare("UPDATE games SET status='finished',winner=?,updated_at=? WHERE game_id=?")
    .bind(a.username, new Date().toISOString(), gameId).run();
  const rematch = await api('rematch', { gameId, username:a.username, secret:'2345', country:'co' }, a.token);
  assert.equal(rematch.ok, true, rematch.error);
  const row = await db.prepare('SELECT time_mode,bank_seconds,bank_increment,turn_seconds,bank1_remaining,bank2_remaining FROM games WHERE game_id=?')
    .bind(rematch.gameId).first();
  assert.equal(row.time_mode, 'bank');
  assert.equal(row.bank_seconds, 600);
  assert.equal(row.bank_increment, 10);
  assert.equal(row.turn_seconds, 0);
  assert.equal(row.bank1_remaining, 600);
  assert.equal(row.bank2_remaining, 600);
});

test('una partida sin bolsa sigue comportándose exactamente igual que antes', () => {
  const classic = { status:'active', time_mode:'turn', bank_seconds:0, turn_seconds:30, turn:1,
    turn_remaining:30, timer_paused:0, turn_started_at:new Date(0).toISOString(), p1:'Ana', p2:'Beto' };
  assert.equal(isBankGame(classic), false);
  assert.equal(bankRemaining(classic, 1, 10_000), 0);
  const expired = expiredTurnChanges(classic, 31_000);
  assert.equal(expired.turn, 2, 'el cronometro por turno pasa el turno, no cierra la partida');
  assert.equal(expired.status, undefined);

  const view = sanitizeGame({ ...classic, digits:3, secret1:'012', secret2:'345', guesses:'[]', game_id:'AAAA' }, 'Ana');
  assert.equal(view.timeMode, 'turn');
  assert.equal(view.bankSeconds, 0);
  assert.equal(view.bank1Remaining, 0);
});

/* -------------------- el buzón de sugerencias -------------------- */

test('el buzón acepta un mensaje sin sesión y lo guarda con su idioma', async () => {
  const sent = await api('sendFeedback', { kind:'bug', message:'El cronómetro parpadea en el iPhone.', lang:'fr', appVersion:'2.5', contact:'alguien@example.com' });
  assert.equal(sent.ok, true, sent.error);
  const row = await db.prepare("SELECT * FROM feedback WHERE message LIKE '%parpadea%'").first();
  assert.equal(row.kind, 'bug');
  assert.equal(row.lang, 'fr');
  assert.equal(row.status, 'new');
  assert.equal(row.username, '', 'sin sesión no hay nombre que guardar');
  assert.equal(row.contact, 'alguien@example.com');
});

test('un mensaje demasiado corto se rechaza y el campo trampa se traga en silencio', async () => {
  const short = await api('sendFeedback', { message:'hola', lang:'es' });
  assert.equal(short.ok, false);
  assert.match(short.error, /al menos 10/);

  const before = await db.prepare('SELECT COUNT(*) AS total FROM feedback').first();
  const bot = await api('sendFeedback', { message:'Compre nuestras pastillas milagrosas ahora mismo', website:'http://spam.example', lang:'es' });
  assert.equal(bot.ok, true, 'al bot se le responde que todo fue bien');
  const afterBot = await db.prepare('SELECT COUNT(*) AS total FROM feedback').first();
  assert.equal(afterBot.total, before.total, 'pero no se guarda nada');
});

test('la misma IP no puede vaciar el buzón a base de mensajes seguidos', async () => {
  await db.prepare("DELETE FROM feedback WHERE ip='203.0.113.9'").run();
  const stamp = new Date().toISOString();
  for (let index = 0; index < 5; index++) {
    await db.prepare("INSERT INTO feedback(kind,message,contact,username,lang,app_version,user_agent,ip,country,status,admin_note,created_at,updated_at) VALUES('idea',?,'','','es','','','203.0.113.9','co','new','',?,?)")
      .bind(`mensaje de prueba ${index}`, new Date(Date.now() - 60_000 * (index + 1)).toISOString(), stamp).run();
  }
  const response = await mf.dispatchFetch('http://localhost/api', {
    method:'POST',
    headers:{ 'content-type':'application/json', 'cf-connecting-ip':'203.0.113.9' },
    body:JSON.stringify({ action:'sendFeedback', message:'Una idea más para la lista', lang:'es' }),
  });
  const blocked = await response.json();
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /mensajes seguidos/);
});

test('el mensaje de quien ha entrado guarda su nombre para poder responderle', async () => {
  const a = await player('Buzon-Con-Sesion');
  const sent = await api('sendFeedback', { message:'Me encantaría un modo por equipos.', lang:'es' }, a.token);
  assert.equal(sent.ok, true, sent.error);
  const row = await db.prepare("SELECT username FROM feedback WHERE message LIKE '%equipos%'").first();
  assert.equal(row.username, a.username);
});

test('el buzón solo se lee y se cambia con rol de administrador', async () => {
  const anonymous = await mf.dispatchFetch('http://localhost/api', {
    method:'POST', headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ action:'adminFeedback' }),
  });
  assert.equal(anonymous.status, 401, 'sin sesión ni se llega a la consulta');
  const plain = await player('Buzon-Curioso');
  const denied = await api('adminFeedback', {}, plain.token);
  assert.equal(denied.ok, false);
  assert.match(denied.error, /administrador/i);
});

test('la administración puede triar, anotar y borrar, y todo queda en la auditoría', async () => {
  const admin = await player('Buzon-Admin');
  await db.prepare("UPDATE users SET role='admin' WHERE username_key=?").bind(admin.username.toLowerCase()).run();
  await api('sendFeedback', { message:'Sería bonito un tablero de madera clara.', lang:'es', kind:'idea' }, admin.token);
  const row = await db.prepare("SELECT id FROM feedback WHERE message LIKE '%madera clara%'").first();

  const listed = await api('adminFeedback', { status:'new' }, admin.token);
  assert.equal(listed.ok, true, listed.error);
  assert.ok(listed.items.some((item) => item.id === row.id));
  assert.ok(listed.counts.new >= 1);

  const planned = await api('adminUpdateFeedback', { id:row.id, target:String(row.id), status:'planned', adminNote:'Para la 2.6' }, admin.token);
  assert.equal(planned.ok, true, planned.error);
  const updated = await db.prepare('SELECT status,admin_note FROM feedback WHERE id=?').bind(row.id).first();
  assert.equal(updated.status, 'planned');
  assert.equal(updated.admin_note, 'Para la 2.6');

  const exported = await api('adminExport', {}, admin.token);
  assert.ok(exported.feedback.some((item) => item.id === row.id), 'la exportación se lleva el buzón');

  const removed = await api('adminDeleteFeedback', { id:row.id, target:String(row.id) }, admin.token);
  assert.equal(removed.ok, true, removed.error);
  assert.equal(await db.prepare('SELECT id FROM feedback WHERE id=?').bind(row.id).first(), null);

  const audit = await api('adminAudit', {}, admin.token);
  const actions = audit.audit.map((entry) => entry.action);
  assert.ok(actions.includes('adminUpdateFeedback'));
  assert.ok(actions.includes('adminDeleteFeedback'));
});

test('el correo de aviso es un MIME válido y no filtra el mensaje en claro en el asunto', () => {
  const mime = feedbackEmail({ kind:'bug', lang:'es', username:'Ana', contact:'', appVersion:'2.5',
    createdAt:'2026-08-23T10:00:00.000Z', message:'Se cayó la conexión en la revancha' }, 'buzon@picasyfijas.fans', 'destino@example.com');
  assert.match(mime, /^From: Picas y Fijas <buzon@picasyfijas\.fans>/);
  assert.match(mime, /\r\nTo: <destino@example\.com>\r\n/);
  assert.match(mime, /\r\nSubject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
  assert.match(mime, /Content-Transfer-Encoding: base64/);
  assert.equal(mime.includes('Se cayó la conexión'), false, 'el cuerpo viaja codificado');
  const body = Buffer.from(mime.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
  assert.match(body, /Se cayó la conexión en la revancha/);
});

test('la validación recorta el mensaje y limpia los caracteres de control', () => {
  const clean = validateFeedback({ message:'a'.repeat(1200), kind:'inventado', lang:'de', contact:' hola@example.com ' });
  assert.equal(clean.message.length, 1000);
  assert.equal(clean.kind, 'idea', 'un tipo desconocido cae en idea');
  assert.equal(clean.lang, 'es', 'un idioma que no existe cae en español');
  assert.equal(clean.contact, 'hola@example.com');
  const stripped = validateFeedback({ message:'linea uno\nlinea dos\u0000\u0007 con basura' });
  assert.equal(stripped.message.includes('\u0000'), false);
  assert.equal(stripped.message.includes('\n'), true, 'los saltos de línea sí se conservan');
});

/* -------------------- la interfaz -------------------- */

test('la pantalla del buzón existe, lleva su propio selector de idioma y se abre desde el inicio', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<section id="s-feedback"/);
  assert.match(html, /id="fb-seg-lang"/);
  assert.match(html, /onclick="openFeedback\(\)"/);
  // El enlace vive debajo de los creditos de la pantalla de inicio.
  const login = html.slice(html.indexOf('<section id="s-login"'), html.indexOf('<section id="s-feedback"'));
  assert.match(login, /class="foot credits"[\s\S]*openFeedback\(\)/);
  // El campo trampa no se ve, pero esta.
  assert.match(html, /id="fb-website"[^>]*aria-hidden="true"/);
  // Y la pantalla entra en el conmutador de vistas.
  assert.match(html, /\['login','lobby','feedback',/);
});

test('la marca devuelve desde el buzón al sitio del que se entró', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const screens = html.match(/const BRAND_HOME_FROM = new Set\(\[([^\]]*)\]\)/)[1];
  assert.match(screens, /'feedback'/);
  // Es la unica pantalla de la lista a la que se llega sin sesion, asi que no
  // puede saltar al lobby a ciegas.
  assert.match(html, /if\(currentView==='feedback'\) closeFeedback\(\);/);
  assert.match(html, /else enterLobby\(\);/);
  assert.match(html, /function brandHomeLabel\(\)/);
});

test('cada texto nuevo está en los tres idiomas', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const key of ['feedback_link','feedback_title','feedback_msg','feedback_sent_title',
    'lbl_clock','clock_bank','lbl_bank','lbl_bank_inc','bank_hint','rl_bank','win_timeout','lose_timeout','hist_timeout']) {
    assert.equal((html.match(new RegExp(`\\b${key}:`, 'g')) || []).length, 3, `${key} debería estar en es, en y fr`);
  }
});

test('el reloj de la creación ofrece las tres formas y la bolsa viaja al servidor', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="seg-clock"[\s\S]*data-c="none"[\s\S]*data-c="turn"[\s\S]*data-c="bank"/);
  assert.match(html, /id="seg-bank"[\s\S]*data-b="180"[\s\S]*data-b="300"[\s\S]*data-b="600"/);
  assert.match(html, /timeMode:cfg\.timeMode, bankSeconds:cfg\.bankSeconds, bankIncrement:cfg\.bankIncrement/);
  // Los dos relojes de la partida, uno por jugador.
  assert.match(html, /id="g-bank-mine"/);
  assert.match(html, /id="g-bank-theirs"/);
  assert.match(html, /function bankLeft\(st, side\)/);
});

test('la partida aleatoria también sortea la bolsa y su incremento', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('function selectCreateRandomRules()');
  const end = html.indexOf("$('seg-mode').addEventListener", start);
  const source = html.slice(start, end);
  assert.match(source, /clockChoice=\['none','turn','bank'\]\[randomInt\(3\)\]/);
  assert.match(source, /\[180,300,600\]\[randomInt\(3\)\]/);
  assert.match(source, /\[0,3,5,10\]\[randomInt\(4\)\]/);
  assert.match(source, /syncClockControls\(\)/);
});

test('la práctica contra el computador también puede jugarse con bolsa', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="p-seg-clock"/);
  assert.match(html, /id="p-seg-bank"/);
  assert.match(html, /const isPracticeBank=\(\)=>practiceCfg\.type==='computer'/);
  // Agotar la bolsa en la practica pierde la partida, no pasa el turno.
  assert.match(html, /if\(isPracticeBank\(\)\)\{practice\.deadline=0;practice\.bankMs=0;finishComputerPractice\('loss','timeout'\);return;\}/);
});

test('solo se puede responder a quien dejó un correo de verdad', () => {
  for (const good of ['diego@example.com', 'a@b.co', '  espacio@x.com  ']) {
    assert.equal(replyAddress(good), good.trim(), good);
  }
  // El contacto es texto libre: mucha gente deja su nombre de jugador.
  for (const bad of ['Monito', '', null, undefined, 'sin arroba.com', 'uno@dominio',
    'dos@@x.com', 'Nombre <n@x.com>', 'con espacio@x.com', 'a@b.c']) {
    assert.equal(replyAddress(bad), '', JSON.stringify(bad));
  }
});

test('el panel marca cada mensaje con la dirección a la que se puede responder', async () => {
  const admin = await player('Responder-Admin');
  await db.prepare("UPDATE users SET role='admin' WHERE username_key=?").bind(admin.username.toLowerCase()).run();
  await api('sendFeedback', { message:'Con correo para responder, por favor.', contact:'jugador@example.com', lang:'fr' }, admin.token);
  const listed = await api('adminFeedback', {}, admin.token);
  const withMail = listed.items.find((item) => item.message.startsWith('Con correo'));
  assert.equal(withMail.replyTo, 'jugador@example.com');

  const soloName = listed.items.find((item) => item.contact === 'Monito');
  if (soloName) assert.equal(soloName.replyTo, '');
});

test('el botón Responder se apaga cuando no hay correo, y redacta en el idioma del mensaje', async () => {
  const html = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');
  assert.match(html, /data-feedback-reply="\$\{x\.id\}"/);
  assert.match(html, /<button class="tiny" disabled title=/);
  assert.match(html, /function feedbackMailto\(item\)/);
  // Andamio en los tres idiomas, porque quien escribe no tiene por que leer español.
  for (const lang of ['es','en','fr']) assert.ok(html.includes(lang + ":{subject:"), lang);
  // Responder no cambia nada en la base, asi que no puede recargar el panel.
  const action = html.slice(html.indexOf("const fbReply=hit('data-feedback-reply')"), html.indexOf("const fbNote=hit("));
  assert.doesNotMatch(action, /afterChange|api\(/);
});

test('el panel de administración tiene su pestaña de feedback', async () => {
  const html = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');
  assert.match(html, /data-tab="feedback"/);
  assert.match(html, /id="tab-feedback"/);
  assert.match(html, /feedback:loadFeedback/);
  assert.match(html, /adminDeleteFeedback/);
});
