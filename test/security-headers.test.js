import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, * as entry from '../src/index.js';
import { HSTS, SECURITY_HEADERS, secure } from '../src/headers.js';

const { canonicalRedirect } = entry;

/* El transporte y las cabeceras de seguridad (5.5.1). El 07-10-2026 el sitio
   contestaba 200 por HTTP plano —el ajuste «Always Use HTTPS» de la zona
   estaba apagado— y ninguna respuesta llevaba HSTS, `nosniff` ni nada que
   impidiera enmarcar el juego o `/admin`. Nada de eso se ve jugando, asi que
   solo una prueba impide que vuelva a faltar. */

const page = () => new Response('<!doctype html><title>x</title>', {
  headers: { 'content-type': 'text/html', etag: '"abc"' },
});
const env = { ASSETS: { fetch: async () => page() } };
const get = (url, init) => worker.fetch(new Request(url, init), env, {});

test('el dominio canonico por HTTP plano redirige a HTTPS conservando el enlace', () => {
  // `http` es lo que escribe el borde de Cloudflare en X-Forwarded-Proto.
  const at = (u, proto = 'http') => canonicalRedirect(new URL(u), proto);
  const res = at('http://picasyfijas.fans/en?game=A7K2QX');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://picasyfijas.fans/en?game=A7K2QX');
  assert.equal(at('http://picasyfijas.fans/api/').headers.get('location'), 'https://picasyfijas.fans/api/');
  // Por HTTPS se sirve tal cual: redirigirlo seria un bucle.
  assert.equal(at('https://picasyfijas.fans/en?game=A7K2QX', 'https'), null);
});

test('wrangler dev no rebota a produccion', async () => {
  // En local el Worker ve `http://picasyfijas.fans/...` —el host sale de
  // `routes`— y ninguna cabecera del borde. Sin esta distincion el servidor de
  // desarrollo y las capturas entran en un bucle de redirecciones.
  assert.equal(canonicalRedirect(new URL('http://picasyfijas.fans/')), null);
  assert.equal(canonicalRedirect(new URL('http://picasyfijas.fans/'), ''), null);
  assert.equal(canonicalRedirect(new URL('http://localhost:8787/'), 'http'), null);
  const res = await get('http://picasyfijas.fans/admin');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('strict-transport-security'), null);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('secure anade las cabeceras sin perder las que ya traia la respuesta', async () => {
  const original = new Response('hola', {
    status: 404,
    headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
  });
  const res = secure(original, new URL('https://picasyfijas.fans/admin'));
  assert.equal(res.status, 404);
  assert.equal(await res.text(), 'hola');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    assert.equal(res.headers.get(name), value, name);
  assert.equal(res.headers.get('strict-transport-security'), HSTS);
});

test('HSTS solo viaja por HTTPS', () => {
  const res = secure(new Response('x'), new URL('http://localhost:8787/'));
  assert.equal(res.headers.get('strict-transport-security'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('las cabeceras dicen lo que tienen que decir', () => {
  assert.equal(SECURITY_HEADERS['x-content-type-options'], 'nosniff');
  assert.equal(SECURITY_HEADERS['x-frame-options'], 'DENY');
  const csp = SECURITY_HEADERS['content-security-policy'];
  for (const directive of ["frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"])
    assert.ok(csp.includes(directive), `falta ${directive}`);
  // Una lista de origenes rota dejaria el juego sin fuentes, sin banderas o
  // sin el widget antispam: no se anade sin recorrer antes todas las pantallas.
  assert.doesNotMatch(csp, /default-src|script-src|connect-src/);
  // Un ano como minimo; `preload` no se deshace y es una decision del propietario.
  assert.ok(Number(/max-age=(\d+)/.exec(HSTS)[1]) >= 31536000);
  assert.doesNotMatch(HSTS, /preload/);
});

test('toda respuesta del Worker sale con las cabeceras: paginas, API, errores y redirecciones', async () => {
  const cases = [
    ['https://picasyfijas.fans/admin', {}, 200],
    ['https://picasyfijas.fans/index.html', {}, 200],
    ['https://picasyfijas.fans/admin/nada', {}, 200],
    // Un cuerpo que no es JSON: el API contesta sin tocar la base.
    ['https://picasyfijas.fans/api/', { method: 'POST', body: 'x'.repeat(200000) }, 413],
    ['https://www.picasyfijas.fans/?game=A7K2QX', {}, 301],
    ['http://picasyfijas.fans/', { headers: { 'x-forwarded-proto': 'http' } }, 301],
  ];
  for (const [url, init, status] of cases) {
    const res = await get(url, init);
    assert.equal(res.status, status, url);
    for (const [name, value] of Object.entries(SECURITY_HEADERS))
      assert.equal(res.headers.get(name), value, `${url} · ${name}`);
  }
  const admin = await get('https://picasyfijas.fans/admin');
  assert.equal(admin.headers.get('strict-transport-security'), HSTS);
  assert.equal(admin.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(admin.headers.get('cache-control'), 'no-store, max-age=0');
  // La redireccion de HTTP a HTTPS tambien lleva las suyas, y conserva el destino.
  const plain = await get('http://picasyfijas.fans/fr?game=A7K2QX', { headers: { 'x-forwarded-proto': 'http' } });
  assert.equal(plain.headers.get('location'), 'https://picasyfijas.fans/fr?game=A7K2QX');
});

test('los archivos estaticos llevan las mismas cabeceras que el Worker', async () => {
  const text = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  const rules = {};
  let path = '';
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) { path = line.trim(); rules[path] = {}; continue; }
    const cut = line.indexOf(':');
    rules[path][line.slice(0, cut).trim().toLowerCase()] = line.slice(cut + 1).trim();
  }
  assert.deepEqual(Object.keys(rules), ['/*']);
  assert.deepEqual(rules['/*'], {
    'x-content-type-options': SECURITY_HEADERS['x-content-type-options'],
    'strict-transport-security': HSTS,
    'referrer-policy': SECURITY_HEADERS['referrer-policy'],
  });
});

test('el modulo de entrada no exporta cadenas ni numeros', () => {
  // El runtime de Workers solo admite funciones y objetos entre las
  // exportaciones del modulo de entrada: con una cadena contesta «Incorrect
  // type for map entry» y el Worker no arranca. Node no lo nota y `wrangler
  // deploy` si; por eso `HSTS` vive en `src/headers.js`.
  for (const [name, value] of Object.entries(entry)) {
    const ok = typeof value === 'function' || (typeof value === 'object' && value !== null);
    assert.ok(ok, `src/index.js exporta ${name}, que es ${typeof value}`);
  }
});

/* `/.well-known/security.txt` (5.5.2): a quien escribir si alguien encuentra un
   fallo. El RFC 9116 exige `Contact` y un `Expires` que no este vencido, y un
   archivo caducado es peor que ninguno: dice que nadie lo mira. */
const securityTxt = async () => {
  const text = await readFile(new URL('../public/.well-known/security.txt', import.meta.url), 'utf8');
  const fields = {};
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const cut = line.indexOf(':');
    (fields[line.slice(0, cut)] ||= []).push(line.slice(cut + 1).trim());
  }
  return { text, fields };
};

test('security.txt dice a quien escribir y donde vive', async () => {
  const { text, fields } = await securityTxt();
  assert.doesNotMatch(text, /\r/, 'debe ir en LF');
  assert.match(text, /^[\x20-\x7e\n]*$/, 'solo ASCII');
  assert.deepEqual(fields.Contact, ['mailto:security@picasyfijas.fans']);
  assert.deepEqual(fields.Canonical, ['https://picasyfijas.fans/.well-known/security.txt']);
  assert.deepEqual(fields['Preferred-Languages'], ['es, en, fr']);
  assert.equal(fields.Expires.length, 1);
});

test('security.txt no esta caducado ni a punto de caducar', async () => {
  const { fields } = await securityTxt();
  const expires = Date.parse(fields.Expires[0]);
  assert.ok(Number.isFinite(expires), 'Expires debe ser una fecha ISO');
  const days = (expires - Date.now()) / 86400000;
  // El RFC recomienda no pasar de un ano.
  assert.ok(days <= 366, 'Expires no debe ir a mas de un ano');
  assert.ok(days > 30, `security.txt caduca en ${Math.floor(days)} dias: pon en Expires la fecha de dentro de un ano, no mas, en public/.well-known/security.txt`);
});
