import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { seedAccount } from './accounts.js';
import { cleanTimeZone, requestOrigin } from '../src/security.js';

const admin = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');
const game = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

let mf, db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: 'src/index.js',
    modulesRules: [{ type:'ESModule', include:['**/*.js'], fallthrough:true }],
    compatibilityDate: '2026-08-02',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB:'00000000-0000-0000-0000-000000000012' },
    bindings: { SESSION_TTL_HOURS:'168', ADMIN_PATH:'/admin', DEBUG_ERRORS:'1' },
  });
  db = await mf.getD1Database('DB');
  const files = (await readdir(new URL('../migrations/', import.meta.url))).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
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

const zoneOf = async (name) => (await db.prepare('SELECT timezone FROM users WHERE username_key=?').bind(name.toLowerCase()).first()).timezone;

test('solo se aceptan nombres IANA que el motor reconoce', () => {
  assert.equal(cleanTimeZone('Pacific/Noumea'), 'Pacific/Noumea');
  assert.equal(cleanTimeZone('Australia/Sydney'), 'Australia/Sydney');
  assert.equal(cleanTimeZone('UTC'), 'UTC');
  for (const bad of ['', 'Mars/Olympus', '+11:00', '<script>', 'a'.repeat(80), null])
    assert.equal(cleanTimeZone(bad), '', String(bad));
  // Cloudflare la deduce de la IP y la deja en `request.cf`: es el respaldo.
  const request = { headers:new Headers(), cf:{ timezone:'Australia/Sydney' } };
  assert.equal(requestOrigin(request).timezone, 'Australia/Sydney');
});

test('entrar guarda la zona del navegador; el polling no la pisa', async () => {
  await seedAccount(db, 'Kanga');
  const login = await api('loginUser', { identifier:'Kanga', pin:'2468', timeZone:'Australia/Sydney' });
  assert.equal(login.ok, true, login.error);
  assert.equal(await zoneOf('Kanga'), 'Australia/Sydney');

  // Otro aparato con otra zona sondeando con la misma cuenta no la cambia.
  await api('accountProfile', { timeZone:'Europe/Paris' }, login.sessionToken);
  assert.equal(await zoneOf('Kanga'), 'Australia/Sydney');

  // Una entrada nueva, si: es quien viaja.
  await api('loginUser', { identifier:'Kanga', pin:'2468', timeZone:'Pacific/Noumea' });
  assert.equal(await zoneOf('Kanga'), 'Pacific/Noumea');

  // Una zona inventada no borra la buena.
  await api('loginUser', { identifier:'Kanga', pin:'2468', timeZone:'Mars/Olympus' });
  assert.equal(await zoneOf('Kanga'), 'Pacific/Noumea');
});

test('una sesion anterior a la columna la rellena en su primera peticion', async () => {
  await seedAccount(db, 'Roo');
  const login = await api('loginUser', { identifier:'Roo', pin:'2468' });
  await db.prepare("UPDATE users SET timezone=NULL WHERE username_key='roo'").run();
  await api('accountProfile', { timeZone:'Australia/Sydney' }, login.sessionToken);
  assert.equal(await zoneOf('Roo'), 'Australia/Sydney');
});

test('la ficha de /admin trae la zona y el panel pinta en hora local', async () => {
  await seedAccount(db, 'Jefa', { role:'admin' });
  const boss = await api('loginUser', { identifier:'Jefa', pin:'2468', timeZone:'Pacific/Noumea' });
  const detail = await api('adminUserDetail', { target:'Kanga' }, boss.sessionToken);
  assert.equal(detail.ok, true, detail.error);
  assert.equal(detail.user.timezone, 'Pacific/Noumea');

  assert.match(admin, /timeZone:ADMIN_TZ/, 'el acceso al panel envia su zona');
  assert.match(admin, /line\('Zona horaria'/, 'la ficha ensena la zona del jugador');
  assert.doesNotMatch(admin, /replace\('T',' '\)\.slice\(0,16\)/, 'ya no se ensena UTC crudo');
  assert.match(game, /requestPayload\.timeZone=CLIENT_TIME_ZONE/, 'el juego envia su zona');
});

test('las fechas del panel se convierten de verdad a la zona pedida', () => {
  const start = admin.indexOf('const pad2=');
  const end = admin.indexOf('const when=');
  const zoned = new Function(`${admin.slice(start, end)}; return { zoned, utcOffset };`)
    .call(null);
  // 11:53 UTC del 17 de septiembre: Numea va 11 horas por delante, Sidney 10
  // (su horario de verano empieza en octubre).
  assert.equal(zoned.zoned('2026-09-17T11:53:12.000Z', 'Pacific/Noumea'), '2026-09-17 22:53');
  assert.equal(zoned.zoned('2026-09-17T11:53:12.000Z', 'Australia/Sydney'), '2026-09-17 21:53');
  assert.equal(zoned.zoned('2026-12-17T11:53:12.000Z', 'Australia/Sydney'), '2026-12-17 22:53');
  assert.equal(zoned.zoned('', 'UTC'), null);
  assert.equal(zoned.utcOffset('Pacific/Noumea'), 'UTC+11');
});
