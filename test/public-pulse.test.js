import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';

const workerSource = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

let mf, db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: 'src/index.js',
    modulesRules: [{ type:'ESModule', include:['**/*.js'], fallthrough:true }],
    compatibilityDate: '2026-08-02',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB:'00000000-0000-0000-0000-0000000001e2' },
    bindings: { SESSION_TTL_HOURS:'168', ADMIN_PATH:'/admin', DEBUG_ERRORS:'1' },
  });
  db = await mf.getD1Database('DB');
  for (const file of ['0001_initial.sql','0002_chat.sql','0003_private_threads.sql','0004_admin_insight.sql','0005_feedback.sql','0006_time_bank.sql','0007_d1_free_optimization.sql','0008_email_recovery.sql','0009_username_change.sql','0010_previous_username.sql','0011_user_timezone.sql','0012_push.sql','0013_daily.sql','0014_notebook_option.sql']) {
    const migration = await readFile(new URL('../migrations/'+file, import.meta.url), 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean))
      await db.prepare(statement).run();
  }
});

after(async () => { await mf?.dispose(); });

async function call(action) {
  const response = await mf.dispatchFetch('http://localhost/api', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ action }),
  });
  return { status:response.status, body:await response.json() };
}

test('publicPulse is anonymous, numeric-only and cached for 30 seconds', async () => {
  assert.match(workerSource, /const PUBLIC_PULSE_TTL_MS = 30 \* 1000;/);
  const current = new Date().toISOString();
  const stale = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare('INSERT INTO presence(username_key,username,location,last_seen_at) VALUES(?,?,?,?)').bind('visible-one','Visible One','lobby',current),
    db.prepare('INSERT INTO presence(username_key,username,location,last_seen_at) VALUES(?,?,?,?)').bind('stale-name','Stale Name','lobby',stale),
    db.prepare("INSERT INTO games(game_id,status,digits,p1,secret1,p2,secret2,created_at,updated_at,is_public) VALUES(?,?,?,?,?,?,?,?,?,?)").bind('PUB1','active',3,'Visible One','012','Hidden Rival','345',current,current,1),
    db.prepare("INSERT INTO games(game_id,status,digits,p1,secret1,p2,secret2,created_at,updated_at,is_public) VALUES(?,?,?,?,?,?,?,?,?,?)").bind('PRIV1','active',3,'Private One','012','Private Two','345',current,current,0),
    db.prepare("INSERT INTO games(game_id,status,digits,p1,secret1,p2,secret2,created_at,updated_at,is_public) VALUES(?,?,?,?,?,?,?,?,?,?)").bind('OLD1','active',3,'Old One','012','Old Two','345',stale,stale,1),
    db.prepare("INSERT INTO games(game_id,status,digits,p1,secret1,created_at,updated_at,is_public) VALUES(?,?,?,?,?,?,?,?)").bind('WAIT1','waiting',3,'Waiting One','012',current,current,1),
  ]);

  const first = await call('publicPulse');
  assert.equal(first.status, 200);
  assert.deepEqual(Object.keys(first.body).sort(), ['activeGameCount','appVersion','ok','onlineCount']);
  assert.deepEqual(
    { ok:first.body.ok, onlineCount:first.body.onlineCount, activeGameCount:first.body.activeGameCount },
    { ok:true, onlineCount:1, activeGameCount:2 },
  );
  for (const privateValue of ['Visible One','Hidden Rival','Private One','Private Two','PUB1','PRIV1'])
    assert.doesNotMatch(JSON.stringify(first.body), new RegExp(privateValue));

  await db.batch([
    db.prepare('INSERT INTO presence(username_key,username,location,last_seen_at) VALUES(?,?,?,?)').bind('after-cache','After Cache','lobby',current),
    db.prepare("INSERT INTO games(game_id,status,digits,p1,secret1,p2,secret2,created_at,updated_at,is_public) VALUES(?,?,?,?,?,?,?,?,?,?)").bind('NEW1','active',3,'After Cache','012','Other','345',current,current,1),
  ]);
  const second = await call('publicPulse');
  assert.equal(second.body.onlineCount, 1, 'the isolate snapshot stays stable during the TTL');
  assert.equal(second.body.activeGameCount, 2, 'the game total also comes from the cached snapshot');
});

test('publicPulse does not reopen the protected ranking or game list', async () => {
  for (const action of ['leaderboard','listGames']) {
    const response = await call(action);
    assert.equal(response.status, 401, action);
  }
});

test('the start page renders the pulse in all three languages', () => {
  const login = html.slice(html.indexOf('<section id="s-login"'), html.indexOf('<!-- BUZON DE SUGERENCIAS -->'));
  assert.match(login, /id="public-pulse"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /const result=await api\('publicPulse'\)/);
  assert.match(html, /if\(name==='login'\)\{ resetLoginSteps\(\); loadPublicPulse\(\); \}/);
  for (const lang of ['es','en','fr']) {
    const block = html.slice(html.indexOf(`Object.assign(I18N.${lang},{public_pulse_player_one`));
    const translations = block.slice(0, block.indexOf('});') + 3);
    for (const key of ['public_pulse_player_one','public_pulse_players_many','public_pulse_game_one','public_pulse_games_many'])
      assert.match(translations, new RegExp(`${key}:`), `${key} missing in ${lang}`);
  }
});
