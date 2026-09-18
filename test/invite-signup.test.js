/* E1-T3 — La invitación sobrevive al registro.
   Tres tramos, que son los tres sitios donde hasta ahora se perdía el código:
   la lectura pública que enseña quién invita, el correo de verificación que
   viaja a otro aparato, y el navegador que tiene que acordarse mientras tanto. */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { sendEmailVerification } from '../src/recovery.js';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

let mf, db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: 'src/index.js',
    modulesRules: [{ type:'ESModule', include:['**/*.js'], fallthrough:true }],
    compatibilityDate: '2026-08-02',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB:'00000000-0000-0000-0000-0000000001e3' },
    bindings: { SESSION_TTL_HOURS:'168', ADMIN_PATH:'/admin', DEBUG_ERRORS:'1' },
  });
  db = await mf.getD1Database('DB');
  for (const file of ['0001_initial.sql','0002_chat.sql','0003_private_threads.sql','0004_admin_insight.sql','0005_feedback.sql','0006_time_bank.sql','0007_d1_free_optimization.sql','0008_email_recovery.sql','0009_username_change.sql','0010_previous_username.sql','0011_user_timezone.sql']) {
    const migration = await readFile(new URL('../migrations/'+file, import.meta.url), 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean))
      await db.prepare(statement).run();
  }
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO games(game_id,status,digits,p1,secret1,created_at,updated_at,is_public,mode,num_colors,allow_repeats,max_attempts,turn_seconds,time_mode,bank_seconds,bank_increment,reveal_secrets) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind('INV1','waiting',4,'Anfitriona','0123',now,now,0,'numbers',6,0,0,0,'bank',600,5,0),
    db.prepare("INSERT INTO games(game_id,status,digits,p1,secret1,p2,secret2,created_at,updated_at,is_public) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind('BUSY','active',3,'Jugador Uno','012','Jugador Dos','345',now,now,1),
  ]);
});

after(async () => { await mf?.dispose(); });

async function call(payload) {
  const response = await mf.dispatchFetch('http://localhost/api', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify(payload),
  });
  return { status:response.status, body:await response.json() };
}

test('inviteInfo dice quién invita y con qué reglas, sin sesión y sin secretos', async () => {
  const res = await call({ action:'inviteInfo', gameId:'inv1' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.host, 'Anfitriona');
  assert.deepEqual(
    { digits:res.body.digits, mode:res.body.mode, timeMode:res.body.timeMode, bankSeconds:res.body.bankSeconds, bankIncrement:res.body.bankIncrement },
    { digits:4, mode:'numbers', timeMode:'bank', bankSeconds:600, bankIncrement:5 },
  );
  // El secreto de quien invita no sale de la partida, ni siquiera antes de empezar.
  assert.doesNotMatch(JSON.stringify(res.body), /"0123"|secret1|secret2/);
});

test('inviteInfo calla sobre una partida que ya no espera rival y sobre un código inventado', async () => {
  const empezada = await call({ action:'inviteInfo', gameId:'BUSY' });
  assert.equal(empezada.body.ok, false);
  for (const nombre of ['Jugador Uno','Jugador Dos'])
    assert.doesNotMatch(JSON.stringify(empezada.body), new RegExp(nombre));
  for (const codigo of ['ZZZZ','', 'no-es-un-codigo'])
    assert.equal((await call({ action:'inviteInfo', gameId:codigo })).body.ok, false, codigo);
});

test('inviteInfo no reabre nada de lo que está detrás de la puerta del correo', async () => {
  for (const action of ['leaderboard','listGames','state'])
    assert.equal((await call({ action, gameId:'INV1' })).status, 401, action);
});

test('el enlace del correo de verificación se lleva el código de la partida', async () => {
  const sent = [];
  const env = { EMAIL: { send: async (message) => { sent.push(message); } } };
  const db = { prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({}) }) }), batch: async () => [] };
  const con = await sendEmailVerification(db, env, { id:7 }, 'invitado@ejemplo.test', 'https://picasyfijas.fans', true, 'es', 'inv1');
  assert.equal(con.ok, true);
  assert.match(sent[0].text, /verify_email=[^\s&]+&game=INV1/);
  const sin = [];
  await sendEmailVerification(db, { EMAIL:{ send: async (m) => { sin.push(m); } } }, { id:7 }, 'otro@ejemplo.test', 'https://picasyfijas.fans', true, 'es', 'no vale');
  assert.doesNotMatch(sin[0].text, /&game=/, 'un código con mala pinta no se cuela en el enlace');
});

test('el navegador guarda la invitación, limpia solo su parámetro y la manda al registrarse', () => {
  assert.match(html, /const PENDING_JOIN_KEY = 'pf_pending_join';/);
  assert.match(html, /const PENDING_JOIN_TTL = 48 \* 60 \* 60 \* 1000;/);
  // Si al limpiar la barra se borrase toda la consulta, el enlace del correo
  // perdería `verify_email` justo cuando trae el código: por eso se quita solo `game`.
  assert.match(html, /p\.delete\('game'\); const rest=p\.toString\(\);/);
  assert.match(html, /\} else pendingJoinCode=readPendingJoin\(\);/);
  assert.match(html, /api\('registerUser',\{username:name,email,pin,joinCode:pendingJoinCode\}\)/);
  assert.match(html, /api\('requestEmailVerification',\{email,joinCode:pendingJoinCode\}\)/);
  // Al entrar de verdad en la partida la invitación se consume: no puede
  // secuestrar la siguiente visita.
  assert.match(html, /pendingJoinCode=''; clearPendingJoin\(\);/);
});

test('el aviso de la invitación existe en los tres idiomas', () => {
  for (const lang of ['es','en','fr']) {
    const block = html.slice(html.indexOf(`  ${lang}:{`), html.indexOf(`login_enter`, html.indexOf(`  ${lang}:{`)));
    for (const key of ['login_invite_host','login_invite_rules','login_invite_gone'])
      assert.match(block, new RegExp(`${key}:`), `${key} falta en ${lang}`);
  }
  assert.match(html, /const res=await api\('inviteInfo',\{gameId:pendingJoinCode\}\)/);
});
